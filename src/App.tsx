import React, { useState, useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
    GamePhase, GameMasterMode,
    type WorldInfoEntry, type StoryEntry, type CharacterInput, type Character,
    type CharacterPortrait, type InventoryItem, type NPC, type SavedGameState, type Settings
} from './types';

import {
    llmService, alignments, buildSystemInstruction, formatWorldInfoToString
} from './services/llmService';
import {
    imageService, artStyles
} from './services/imageService';
import { saveGameState, loadGameState, clearGameState } from './services/storageService';

// Simplified App State and Reducer for local-only operation will be defined within the component for clarity.

const parseSkills = (skillsString: string): Record<string, number> => {
    const skills: Record<string, number> = {};
    skillsString.split(',').forEach(part => {
        const [name, value] = part.split(':');
        if (name && value && !isNaN(parseInt(value.trim(), 10))) {
            skills[name.trim()] = parseInt(value.trim(), 10);
        }
    });
    return skills;
};

const App: React.FC = () => {
    const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.SETUP);
    const [storyLog, setStoryLog] = useState<StoryEntry[]>([]);
    const [worldInfo, setWorldInfo] = useState<WorldInfoEntry[]>([]);
    const [worldSummary, setWorldSummary] = useState<string>('');
    const [character, setCharacter] = useState<Character | null>(null);
    const [npcs, setNpcs] = useState<NPC[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [hasSavedGame, setHasSavedGame] = useState(false);
    const storyEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setHasSavedGame(!!loadGameState());
    }, []);

    useEffect(() => {
        storyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [storyLog]);

    const handleNewGame = () => {
        clearGameState();
        setGamePhase(GamePhase.SETUP);
        // Reset all state variables to their initial empty/null state
        setStoryLog([]);
        setWorldInfo([]);
        setWorldSummary('');
        setCharacter(null);
        setNpcs([]);
        setInventory([]);
        setSettings(null);
        setHasSavedGame(false);
    };
    
    const handleContinueGame = () => {
        const saved = loadGameState();
        if (saved) {
            setStoryLog(saved.storyLog);
            setWorldInfo(saved.worldInfo);
            setWorldSummary(saved.worldSummary);
            setCharacter(saved.character);
            setNpcs(saved.npcs);
            setInventory(saved.inventory);
            setSettings(saved.settings);
            llmService.startChat(saved.chatHistory);
            setGamePhase(GamePhase.PLAYING);
        }
    };
    
    const handleStartGame = useCallback(async (
        worldInfoInput: WorldInfoEntry[],
        characterInput: CharacterInput,
        initialPrompt: string,
        gameSettings: Settings
    ) => {
        setGamePhase(GamePhase.LOADING);
        setLoadingMessage('Building your world...');

        const summary = formatWorldInfoToString(worldInfoInput);
        const newCharacter: Character = {
            description: characterInput.description,
            class: characterInput.characterClass,
            alignment: characterInput.alignment,
            backstory: characterInput.backstory,
            skills: parseSkills(characterInput.skills),
            portraits: [{ prompt: characterInput.description }]
        };

        setWorldInfo(worldInfoInput);
        setWorldSummary(summary);
        setCharacter(newCharacter);
        setSettings(gameSettings);

        const systemInstruction = buildSystemInstruction(summary, newCharacter, gameSettings);
        llmService.startChat([{ role: 'user', parts: [{ text: systemInstruction }] }]);

        await handlePlayerAction(initialPrompt, newCharacter, gameSettings, summary);

    }, []);

    const handlePlayerAction = useCallback(async (
        message: string,
        currentChar: Character | null = character,
        currentSettings: Settings | null = settings,
        currentSummary: string = worldSummary
    ) => {
        if (!currentChar || !currentSettings) return;

        const playerEntry: StoryEntry = { type: 'player', content: message };
        setStoryLog(prev => [...prev, playerEntry]);
        
        const progressCallback = (progress: any) => setLoadingMessage(`${progress.status} - ${progress.file || ''} (${Math.round(progress.progress || 0)}%)`);

        const systemInstruction = buildSystemInstruction(currentSummary, currentChar, currentSettings);
        const fullResponseText = await llmService.generateText(currentSettings.localLlmModel, systemInstruction, message, progressCallback);

        // Process response for tags, choices, etc.
        let narrative = fullResponseText;
        const choicesMatch = narrative.match(/\[choice\](.*?)\[\/choice\]/gs);
        const choices = choicesMatch ? choicesMatch.map(c => c.replace(/\[\/?choice\]/g, '')) : [];
        narrative = narrative.replace(/\[choice\](.*?)\[\/choice\]/gs, '').replace('What do you do?', '').trim();
        
        const imgPromptMatch = narrative.match(/\[img-prompt\](.*?)\[\/img-prompt\]/s);
        const imgPrompt = imgPromptMatch ? imgPromptMatch[1] : undefined;
        narrative = narrative.replace(/\[img-prompt\](.*?)\[\/img-prompt\]/s, '').trim();

        // (Simplified parsing for other tags would go here)

        const aiEntry: StoryEntry = {
            type: 'ai',
            content: narrative,
            choices: choices,
            imgPrompt: imgPrompt,
            isImageLoading: currentSettings.generateSceneImages && !!imgPrompt
        };

        setStoryLog(prev => [...prev, aiEntry]);
        setGamePhase(GamePhase.PLAYING);
        
        const gameState: SavedGameState = {
            storyLog: [...storyLog, playerEntry, aiEntry],
            worldInfo,
            worldSummary: currentSummary,
            chatHistory: llmService.getHistory(),
            character: currentChar,
            inventory,
            npcs,
            settings: currentSettings,
        };
        saveGameState(gameState);

    }, [character, settings, worldSummary, storyLog, worldInfo, inventory, npcs]);

    // Simplified render logic
    if (gamePhase === GamePhase.SETUP) {
        return <SetupScreen onStart={handleStartGame} onContinue={handleContinueGame} hasSavedGame={hasSavedGame} onNewGame={handleNewGame} />;
    }
    if (gamePhase === GamePhase.LOADING) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl">{loadingMessage}</div></div>;
    }
    return <GameScreen storyLog={storyLog} onPlayerAction={(action) => handlePlayerAction(action)} />;
};

// Simplified SetupScreen Component
const SetupScreen = ({ onStart, onContinue, hasSavedGame, onNewGame }: { onStart: Function, onContinue: Function, hasSavedGame: boolean, onNewGame: Function }) => {
    const [worldLore, setWorldLore] = useState('');
    const [characterInput, setCharacterInput] = useState<CharacterInput>({ description: '', characterClass: '', alignment: alignments[4], backstory: '', skills: 'Strength: 10, Dexterity: 10, Intelligence: 10' });
    const [initialPrompt, setInitialPrompt] = useState('My adventure begins now. Describe my surroundings.');
    const [settings, setSettings] = useState<Omit<Settings, 'localLlmModel'>>({
        generateSceneImages: true,
        generateCharacterPortraits: true,
        dynamicBackgrounds: true,
        gmMode: GameMasterMode.BALANCED,
        artStyle: Object.keys(artStyles)[0],
    });
    const [localLlmModel, setLocalLlmModel] = useState(Object.values(llmService.localModels)[0]);

    const handleStartClick = () => {
        const worldInfo: WorldInfoEntry[] = [{ key: "World Lore", content: worldLore }];
        onStart(worldInfo, characterInput, initialPrompt, { ...settings, localLlmModel });
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <h1 className="text-4xl font-bold text-center">CYOA Game Master (Local Mode)</h1>
            {hasSavedGame && (
                <div className="flex gap-4">
                    <button onClick={() => onContinue()} className="flex-1 bg-primary hover:bg-primary-hover p-4 rounded-lg">Continue Last Game</button>
                    <button onClick={() => onNewGame()} className="flex-1 bg-surface-2 hover:bg-surface-3 p-4 rounded-lg">Start New Game</button>
                </div>
            )}
            <div className="space-y-4 bg-surface-1 p-6 rounded-lg">
                <h2 className="text-2xl font-bold">1. World Setup</h2>
                <textarea value={worldLore} onChange={e => setWorldLore(e.target.value)} placeholder="Paste your world lore here..." className="w-full h-40 bg-surface-2 rounded-md p-2" />
            </div>
            <div className="space-y-4 bg-surface-1 p-6 rounded-lg">
                <h2 className="text-2xl font-bold">2. Character Creation</h2>
                <input value={characterInput.description} onChange={e => setCharacterInput(p => ({ ...p, description: e.target.value }))} placeholder="Appearance Description" className="w-full bg-surface-2 rounded-md p-2" />
                <input value={characterInput.characterClass} onChange={e => setCharacterInput(p => ({ ...p, characterClass: e.target.value }))} placeholder="Character Class" className="w-full bg-surface-2 rounded-md p-2" />
                <select value={characterInput.alignment} onChange={e => setCharacterInput(p => ({ ...p, alignment: e.target.value }))} className="w-full bg-surface-2 rounded-md p-2">
                    {alignments.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <textarea value={characterInput.backstory} onChange={e => setCharacterInput(p => ({ ...p, backstory: e.target.value }))} placeholder="Backstory" className="w-full h-24 bg-surface-2 rounded-md p-2" />
                <input value={characterInput.skills} onChange={e => setCharacterInput(p => ({ ...p, skills: e.target.value }))} placeholder="Skills (e.g., Strength: 12, Dexterity: 14)" className="w-full bg-surface-2 rounded-md p-2" />
            </div>
            <div className="space-y-4 bg-surface-1 p-6 rounded-lg">
                <h2 className="text-2xl font-bold">3. Game Settings</h2>
                <select value={localLlmModel} onChange={e => setLocalLlmModel(e.target.value)} className="w-full bg-surface-2 rounded-md p-2">
                    {Object.entries(llmService.localModels).map(([name, id]) => <option key={id} value={id}>{name}</option>)}
                </select>
                {/* Other settings toggles would go here */}
            </div>
            <button onClick={handleStartClick} className="w-full bg-accent p-4 rounded-lg text-xl font-bold">Start Adventure</button>
        </div>
    );
};

// Simplified GameScreen Component
const GameScreen = ({ storyLog, onPlayerAction }: { storyLog: StoryEntry[], onPlayerAction: (action: string) => void }) => {
    const [input, setInput] = useState('');

    const handleSend = () => {
        if(input.trim()) {
            onPlayerAction(input.trim());
            setInput('');
        }
    };
    
    return (
        <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
            <div className="flex-1 overflow-y-auto space-y-4">
                {storyLog.map((entry, i) => (
                    <div key={i} className={`p-4 rounded-lg ${entry.type === 'player' ? 'bg-primary/20 text-right' : 'bg-surface-1'}`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
                    </div>
                ))}
            </div>
            <div className="mt-4 flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} className="flex-1 bg-surface-2 rounded-md p-2" />
                <button onClick={handleSend} className="bg-primary hover:bg-primary-hover px-4 rounded-md">Send</button>
            </div>
        </div>
    );
};

export default App;
