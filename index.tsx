import React, { useState, useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, Content, GenerateContentResponse, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ===================================================================================
//  TYPES
// ===================================================================================

enum GamePhase {
  SETUP = 'SETUP',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR',
}

enum GameMasterMode {
  BALANCED = 'Balanced',
  NARRATIVE = 'Narrative Focus',
  ACTION = 'Action Focus',
}

interface WorldInfoEntry {
  key: string;
  content: string;
  isUnstructured?: boolean;
}

interface StoryEntry {
  type: 'ai' | 'player';
  content: string;
  imageUrl?: string;
  imgPrompt?: string;
  isImageLoading?: boolean;
  choices?: string[];
  isStreaming?: boolean;
  backgroundPrompt?: string;
}

interface CharacterInput {
  description: string;
  characterClass?: string;
  alignment?: string;
  backstory?: string;
  skills?: string;
}

interface Character {
  portraits: CharacterPortrait[];
  description: string;
  class: string;
  alignment: string;
  backstory: string;
  skills: Record<string, number>;
}

interface CharacterPortrait {
  url?: string;
  prompt: string;
}

interface InventoryItem {
  name: string;
  description: string;
}

interface SavedGameState {
  storyLog: StoryEntry[];
  worldInfo: WorldInfoEntry[];
  worldSummary: string;
  chatHistory: Content[];
  character: Character;
  inventory: InventoryItem[];
  settings: Settings;
}

interface Settings {
    generateSceneImages: boolean;
    generateCharacterPortraits: boolean;
    dynamicBackgrounds: boolean;
    gmMode: GameMasterMode;
    artStyle: string;
}

// ===================================================================================
//  CONSTANTS & CONFIG
// ===================================================================================

const SAVE_GAME_KEY = 'cyoa_saved_game_v4'; // Bumped version for new data structure

const artStyles: { [key: string]: string } = {
    'Photorealistic': 'Ultra-realistic, 8K resolution, sharp focus, detailed skin texture, professional studio lighting',
    'Cinematic Film': 'Shot on 35mm film, subtle grain, anamorphic lens flare, moody and atmospheric lighting, high dynamic range',
    'Digital Painting': 'Concept art style, visible brush strokes, dramatic lighting, epic fantasy aesthetic, highly detailed',
    'Anime/Manga': 'Modern anime style, vibrant colors, sharp lines, dynamic action poses, cel-shaded',
    'Cyberpunk Neon': 'Saturated neon colors, futuristic cityscape, rain-slicked streets, dystopian mood, Blade Runner aesthetic',
};

const alignments = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'
];

// ===================================================================================
//  LOCAL STORAGE SERVICE
// ===================================================================================

const saveGameState = (state: SavedGameState): void => {
  try {
    const stateString = JSON.stringify(state);
    localStorage.setItem(SAVE_GAME_KEY, stateString);
  } catch (error) {
    console.error("Failed to save game state:", error);
  }
};

const loadGameState = (): SavedGameState | null => {
  try {
    const stateString = localStorage.getItem(SAVE_GAME_KEY);
    if (stateString === null) return null;
    const state = JSON.parse(stateString) as any; // Parse as any to handle migration

    // Migration from old format (v3)
    if (state.fullWorldData && !state.worldInfo) {
      state.worldInfo = [{ key: 'Imported Lore', content: state.fullWorldData, enabled: true }];
      delete state.fullWorldData;
    }
    
    // Ensure worldInfo is always a valid array
    if (!state.worldInfo || !Array.isArray(state.worldInfo)) {
        state.worldInfo = [];
    }

    return state as SavedGameState;
  } catch (error) {
    console.error("Failed to load game state:", error);
    localStorage.removeItem(SAVE_GAME_KEY); // Clear corrupted data
    return null;
  }
};

const clearGameState = (): void => {
  try {
    localStorage.removeItem(SAVE_GAME_KEY);
  } catch (error) {
    console.error("Failed to clear game state:", error);
  }
};

// ===================================================================================
//  GEMINI API SERVICE
// ===================================================================================

const API_KEY = process.env.API_KEY;
let ai: GoogleGenAI | null = null;
if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
}

const verifyApiKey = async (): Promise<boolean> => {
    if (!ai) return false;
    try {
        await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
        return true;
    } catch (e) {
        console.error("API Key validation failed:", e);
        return false;
    }
};

const formatWorldInfoToString = (worldInfo: WorldInfoEntry[]): string => {
    return worldInfo
        .map(entry => `## ${entry.key}\n\n${entry.content}`)
        .join('\n\n---\n\n');
}

const summarizeWorldData = async (worldInfo: WorldInfoEntry[]): Promise<string> => {
    if (!ai) return '';
    const worldData = formatWorldInfoToString(worldInfo);
    if (!worldData.trim()) return '';
    const summarizationPrompt = `You are a world-building assistant. Your task is to read the following extensive world lore and distill it into a concise, high-level summary. This summary will serve as the core, long-term memory for a Game Master AI. Focus on the most critical facts: key locations, major factions, overarching history, fundamental rules of magic/technology, and the general tone of the world. The summary should be dense with information but brief enough to be used as a quick reference. Output ONLY the summary.

--- WORLD LORE START ---
${worldData}
--- WORLD LORE END ---`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: summarizationPrompt });
        return response.text.trim();
    } catch (error) {
        console.error("Failed to summarize world data:", error);
        return "Error summarizing world data.";
    }
}

const buildSystemInstruction = (worldSummary: string, character: Omit<Character, 'portraits'>, settings: Omit<Settings, 'generateSceneImages' | 'generateCharacterPortraits' | 'dynamicBackgrounds'>): string => {
  const getModeInstruction = (mode: GameMasterMode): string => {
    switch (mode) {
      case GameMasterMode.NARRATIVE: return "Prioritize deep character development, rich world-building, and descriptive prose.";
      case GameMasterMode.ACTION: return "Prioritize fast-paced events, high-stakes conflicts, and challenging scenarios.";
      default: return "Maintain a balanced pace, blending rich storytelling with moments of action.";
    }
  }
  
  return `
You are a master storyteller and game master for an interactive text-based CYOA game.
Your Game Master mode is: ${settings.gmMode}. ${getModeInstruction(settings.gmMode)}

--- CORE RULES ---
1.  **World Summary:** This is the core truth of the world. You have a perfect memory of the full lore, but use this summary for context. Additional, hyper-relevant details will be injected into prompts as needed.
    --- WORLD SUMMARY START ---
    ${worldSummary}
    --- WORLD SUMMARY END ---

2.  **Player Character:** The player's appearance is "${character.description}". Class: ${character.class}. Alignment: ${character.alignment}. Backstory: ${character.backstory}.
    **Skills:** ${JSON.stringify(character.skills)}. You MUST consider these skills when resolving actions. Success or failure can lead to skill updates.

3.  **Character & World Progression:** You MUST signal changes using these tags:
    *   To update appearance: \`[char-img-prompt]New, complete description.[/char-img-prompt]\`
    *   To add to the character's journal: \`[update-backstory]Summary of key events.[/update-backstory]\`
    *   To manage inventory: \`[add-item]Item Name|Description[/add-item]\` or \`[remove-item]Item Name[/remove-item]\`.
    *   To update a skill: \`[update-skill]Skill Name|New Value[/update-skill]\` (e.g., [update-skill]Stealth|25[/update-skill]). Use this to reflect character growth.
    *   **Background Prompt:** At the START of your narrative text, you MUST include a short, descriptive phrase for a background image. This is CRITICAL for setting the visual mood. Examples: \`[background-prompt]dark mossy forest[/background-prompt]\`, \`[background-prompt]bustling medieval city market[/background-prompt]\`, \`[background-prompt]eerie dungeon corridor[/background-prompt]\`.

4.  **Combat & Skill Checks:** You MUST resolve skill-based challenges and combat using these tags, which should be placed logically within the narrative.
    *   For non-combat challenges: \`[skill-check]Skill: Perception, Target: 15, Result: Success[/skill-check]\`. Base the outcome on the character's skill value.
    *   For combat actions: \`[combat]Event: Player Attack, Weapon: Sword, Target: Goblin, Roll: 18, Result: Hit, Damage: 7[/combat]\`. You will track enemy health internally and narrate the results. Be descriptive.

5.  **Image Prompts:** Generate image prompts for scenes (\`[img-prompt]\`) that are faithful to the narrative and the art style: "${settings.artStyle}". Follow safety rules strictly: focus on cinematic language, tension, and atmosphere, NOT explicit violence or gore.

6.  **Response Format:** Structure EVERY response in this sequence:
    1.  \`[background-prompt]\` (MUST be first)
    2.  Story Text (including any skill-check or combat tags)
    3.  \`[img-prompt]\`
    4.  Any other update tags (\`[char-img-prompt]\`, etc.)
    5.  3-4 distinct player choices, each in its own \`[choice]\` tag.
    6.  End with the exact question: "What do you do?"
`;
};

const initializeChat = (worldSummary: string, character: Omit<Character, 'portraits'>, settings: Omit<Settings, 'generateSceneImages' | 'generateCharacterPortraits' | 'dynamicBackgrounds'>, history?: Content[]): Chat | null => {
  if (!ai) return null;
  const systemInstruction = buildSystemInstruction(worldSummary, character, settings);
  return ai.chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction }, history });
};

const generateImage = async (prompt: string, artStyle: string, aspectRatio: '16:9' | '1:1'): Promise<string | undefined> => {
  if (!ai) return undefined;
  try {
    const fullPrompt = `${artStyle}, ${prompt}`;
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: fullPrompt,
      config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio },
    });
    const base64ImageBytes = response.generatedImages[0]?.image.imageBytes;
    return base64ImageBytes ? `data:image/jpeg;base64,${base64ImageBytes}` : undefined;
  } catch (error) {
    console.error("Error generating image:", error);
    return undefined;
  }
};

const enhanceWorldEntry = async (text: string): Promise<string> => {
    if (!ai || !text.trim()) return text;
    const prompt = `You are a creative writing assistant specializing in world-building. Take the following piece of lore and enrich it with compelling details, ensuring it remains consistent with the original themes. Preserve the user's core concepts but expand upon them. Output ONLY the enhanced text.\n\n--- USER LORE ---\n${text}`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        return response.text.trim() || text;
    } catch (error) {
        console.error(`Failed to enhance world entry:`, error);
        return text;
    }
};

const structureWorldDataWithAI = async (text: string): Promise<WorldInfoEntry[]> => {
    if (!ai || !text.trim()) return [];
    const prompt = `You are a world-building assistant. Read the following unstructured lore document and organize it into a structured JSON format. Identify logical categories like "Locations", "Factions", "Characters", "History", "Magic System", etc., and group the relevant information under those keys.

--- LORE DOCUMENT ---
${text}
--- END LORE DOCUMENT ---

Output a JSON array where each object has a "key" (the category name) and a "content" (the lore for that category).`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            key: { type: Type.STRING },
                            content: { type: Type.STRING },
                        },
                        required: ["key", "content"],
                    },
                },
            },
        });

        let jsonStr = response.text.trim();
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
        }
        return JSON.parse(jsonStr) as WorldInfoEntry[];

    } catch (error) {
        console.error("Failed to structure world data with AI:", error);
        // Fallback: return the whole text as a single entry
        return [{ key: "Imported Lore", content: text }];
    }
};

const generateCharacterDetails = async (characterInput: CharacterInput): Promise<Partial<CharacterInput>> => {
    if (!ai) return {};

    const prompt = `You are a character creation assistant for a fantasy RPG. Based on the provided character details, fill in any missing information and enhance any provided information.
Return a JSON object with the keys "characterClass", "alignment", "backstory", and "skills".

- **Appearance:** ${characterInput.description}
- **Class:** ${characterInput.characterClass || '(Not specified, please generate)'}
- **Alignment:** ${characterInput.alignment || '(Not specified, please generate)'}
- **Backstory:** ${characterInput.backstory || '(Not specified, please generate a short one)'}
- **Skills:** ${characterInput.skills || '(Not specified, please generate)'}

**Instructions:**
1.  **characterClass**: If the class is not specified or seems too generic (e.g., "Fighter"), provide a more creative and specific class name (e.g., "Sellsword Captain"). Otherwise, use the provided one and enhance it if possible.
2.  **alignment**: Based on the character's description and backstory, select the most fitting alignment from this list: ${alignments.join(', ')}. If the user provided one, you can keep it or choose a more appropriate one if it strongly conflicts with the character's persona.
3.  **backstory**: If the backstory is not specified, write a brief, evocative backstory (2-3 sentences). If a backstory is provided, expand upon it, adding compelling details or a plot hook, but keep the user's original ideas.
4.  **skills**: If skills are not specified, generate a list of core attributes (Strength, Agility, Intelligence, Charisma, Perception) and 2-3 other relevant skills. If skills are provided, you can add 1-2 more thematically appropriate skills. The final output must be a single string in the format "Strength: 12, Agility: 15, Perception: 14, Swords: 8" with all values between 5 and 20.
`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        characterClass: { type: Type.STRING },
                        alignment: { type: Type.STRING },
                        backstory: { type: Type.STRING },
                        skills: { type: Type.STRING },
                    },
                    required: ["characterClass", "alignment", "backstory", "skills"],
                },
            },
        });
        
        let jsonStr = response.text.trim();
        // Clean potential markdown formatting
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
        }
        const details = JSON.parse(jsonStr);
        
        return {
            characterClass: details.characterClass,
            alignment: details.alignment,
            backstory: details.backstory,
            skills: details.skills,
        };

    } catch (error) {
        console.error("Failed to generate character details:", error);
        return {}; // Return empty object on failure to avoid crashing
    }
};

const retrieveRelevantSnippets = (query: string, worldInfo: WorldInfoEntry[], count = 3): string => {
    const corpus = formatWorldInfoToString(worldInfo);
    const sentences = corpus.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s/);
    const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    const scoredSentences = sentences.map(sentence => {
        const sentenceWords = new Set(sentence.toLowerCase().split(/\s+/));
        const score = [...sentenceWords].filter(word => queryWords.has(word)).length;
        return { sentence, score };
    }).filter(item => item.score > 0);

    scoredSentences.sort((a, b) => b.score - a.score);
    return scoredSentences.slice(0, count).map(item => item.sentence).join('\n');
};

// ===================================================================================
//  COMPONENTS
// ===================================================================================

const ProgressBar: React.FC<{ text: string }> = ({ text }) => (
    <div className="my-2 text-center p-3 bg-slate-900 rounded-lg border border-slate-700">
      <div className="flex items-center justify-center space-x-2">
        <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <span className="text-indigo-300 font-semibold">{text}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden">
          <div className="bg-indigo-500 h-1.5 rounded-full w-full animate-progress-indeterminate"></div>
      </div>
    </div>
);

const SetupScreen: React.FC<{
  onStart: (worldInfo: WorldInfoEntry[], worldSummary: string | null, characterInput: CharacterInput, initialPrompt: string, settings: Settings) => void;
  onContinue: () => void;
  onLoadFromFile: (file: File) => void;
  hasSavedGame: boolean;
}> = ({ onStart, onContinue, onLoadFromFile, hasSavedGame }) => {
  const [worldInfo, setWorldInfo] = useState<WorldInfoEntry[]>([{ key: 'Main Lore', content: '' }]);
  const [worldSummary, setWorldSummary] = useState<string | null>(null);
  const [openWorldEntry, setOpenWorldEntry] = useState<number | null>(0);
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [characterClass, setCharacterClass] = useState('');
  const [alignment, setAlignment] = useState('True Neutral');
  const [backstory, setBackstory] = useState('');
  const [skills, setSkills] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState<number | null>(null);
  const [isStructuringEntry, setIsStructuringEntry] = useState<number | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isWorldToolsModalOpen, setIsWorldToolsModalOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
      artStyle: artStyles['Cinematic Film'],
      gmMode: GameMasterMode.BALANCED,
      generateSceneImages: true,
      generateCharacterPortraits: true,
      dynamicBackgrounds: true,
  });
  const saveFileInputRef = useRef<HTMLInputElement>(null);
  const worldFileInputRef = useRef<HTMLInputElement>(null);

  const isWorldDataValid = useMemo(() => worldInfo.some(entry => entry.key.trim() && entry.content.trim()), [worldInfo]);
  const isBusy = isSummarizing || isFileLoading || isStructuringEntry !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWorldDataValid || !characterPrompt.trim() || !initialPrompt.trim() || isBusy) return;
    const characterInput: CharacterInput = { description: characterPrompt, characterClass, alignment, backstory, skills };
    onStart(worldInfo, worldSummary, characterInput, initialPrompt, settings);
  };
  
  const handleEnhanceWorldEntry = async (index: number) => {
    setIsEnhancing(index);
    const enhanced = await enhanceWorldEntry(worldInfo[index].content);
    updateWorldInfo(index, 'content', enhanced);
    setIsEnhancing(null);
  }

  const handleStructureEntry = async (index: number) => {
    setIsStructuringEntry(index);
    try {
        const entryToStructure = worldInfo[index];
        const structuredData = await structureWorldDataWithAI(entryToStructure.content);
        if (structuredData.length > 0) {
            setWorldInfo(prev => {
                const newInfo = [...prev];
                newInfo.splice(index, 1, ...structuredData); // Replace one entry with multiple structured ones
                return newInfo;
            });
        } else {
            alert("AI structuring failed to produce categories.");
        }
    } catch (e) {
        alert("An error occurred during AI structuring.");
    } finally {
        setIsStructuringEntry(null);
    }
  }
  
  const processLoadedWorld = (entries: WorldInfoEntry[]) => {
      setWorldInfo(entries);
      setOpenWorldEntry(entries.length > 0 ? 0 : null);
      const fullText = formatWorldInfoToString(entries);
      if (fullText.length > 10000) {
          setIsSummarizing(true);
          summarizeWorldData(entries)
              .then(summary => setWorldSummary(summary))
              .catch(() => setWorldSummary("Failed to generate summary."))
              .finally(() => setIsSummarizing(false));
      } else {
          setWorldSummary(null);
      }
  };

  const addWorldInfoEntry = () => {
    setWorldInfo(prev => [...prev, { key: '', content: '' }]);
    setOpenWorldEntry(worldInfo.length);
  };

  const updateWorldInfo = (index: number, field: 'key' | 'content', value: string) => {
    setWorldInfo(prev => prev.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
  };
  
  const removeWorldInfoEntry = (index: number) => {
    if (worldInfo.length > 1) {
        setWorldInfo(prev => prev.filter((_, i) => i !== index));
    } else {
        setWorldInfo([{ key: 'Main Lore', content: '' }]); // Reset if it's the last one
    }
    if (openWorldEntry === index) setOpenWorldEntry(null);
  };
  
  const handleLoadWorldFromFile = async (file: File) => {
    if (!file) return;
    setIsFileLoading(true);
    const reader = new FileReader();
    reader.onerror = () => {
        alert('Error reading file.');
        setIsFileLoading(false);
    }
    reader.onload = async (e) => {
        try {
            const content = e.target?.result as string;
            const newKey = file.name.replace(/\.(txt|md|json)$/, '');

            if (file.name.endsWith('.json')) {
                try {
                    const jsonData = JSON.parse(content);
                    if (Array.isArray(jsonData) && jsonData.every(item => typeof item.key === 'string' && typeof item.content === 'string')) {
                        processLoadedWorld(jsonData);
                    } else { alert('Invalid JSON structure for world data.'); }
                } catch (err) { alert('Failed to parse JSON file.'); }
            } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
                // Attempt to parse via Markdown headers first
                const headerRegex = /^(#{1,6})\s+(.*)$/gm;
                const matches = [...content.matchAll(headerRegex)];

                if (matches.length > 0) {
                    const structuredEntries: WorldInfoEntry[] = [];
                    for (let i = 0; i < matches.length; i++) {
                        const key = matches[i][2].trim();
                        const startIndex = matches[i].index! + matches[i][0].length;
                        const endIndex = i + 1 < matches.length ? matches[i + 1].index! : content.length;
                        const entryContent = content.substring(startIndex, endIndex).trim();
                        if (key && entryContent) {
                            structuredEntries.push({ key, content: entryContent });
                        }
                    }
                    processLoadedWorld(structuredEntries);
                } else {
                    // Load as a single, unstructured entry, giving the user the option to structure it later.
                    processLoadedWorld([{ key: newKey, content, isUnstructured: true }]);
                }
            } else {
                alert('Please select a .json, .txt, or .md file.');
            }
        } finally {
             setIsFileLoading(false);
        }
    };
    reader.readAsText(file);
  };


  const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings(s => ({ ...s, [key]: value }));
  };

  return (
    <div className="w-full max-w-3xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700 animate-fade-in">
        <WorldDataToolsModal 
            isOpen={isWorldToolsModalOpen} 
            onClose={() => setIsWorldToolsModalOpen(false)} 
            onLoadData={(data) => {
                processLoadedWorld(data);
                setIsWorldToolsModalOpen(false);
            }} 
        />
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {hasSavedGame && <button type="button" onClick={onContinue} className="flex-1 bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-all duration-300">Load Game</button>}
            <input type="file" ref={saveFileInputRef} onChange={(e) => e.target.files && onLoadFromFile(e.target.files[0])} className="hidden" accept=".json" />
            <button type="button" onClick={() => saveFileInputRef.current?.click()} className="flex-1 bg-sky-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-sky-700 transition-all">Load from File</button>
          </div>
          {hasSavedGame && <div className="my-4 flex items-center"><div className="flex-grow border-t border-slate-600"></div><span className="flex-shrink mx-4 text-slate-400">OR</span><div className="flex-grow border-t border-slate-600"></div></div>}
          <h2 className="text-xl font-semibold text-slate-300 mt-4 text-center">Start a New Story</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-semibold text-indigo-300">1. Build Your World Anvil</h3>
                     <div className="flex items-center gap-4">
                        <button type="button" onClick={() => setIsWorldToolsModalOpen(true)} className="text-xs font-semibold text-green-400 hover:text-green-300">Merge Files</button>
                        <input type="file" ref={worldFileInputRef} onChange={(e) => e.target.files && handleLoadWorldFromFile(e.target.files[0])} className="hidden" accept=".txt,.md,.json" />
                        <button type="button" onClick={() => worldFileInputRef.current?.click()} className="text-xs font-semibold text-sky-300 hover:text-sky-200">Load File</button>
                    </div>
                </div>
                {isFileLoading && <ProgressBar text="Reading world file..." />}
                {isSummarizing && <ProgressBar text="AI is creating a world summary..." />}
                <div className={`space-y-2 bg-slate-900/50 border border-slate-700 rounded-lg p-2 ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                    {worldInfo.map((entry, index) => (
                        <div key={index} className="bg-slate-800/70 rounded">
                            <button type="button" onClick={() => setOpenWorldEntry(openWorldEntry === index ? null : index)} className="w-full flex justify-between items-center p-3 text-left">
                                <span className="font-semibold text-slate-200">{entry.key || `Entry ${index + 1}`}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-400 transition-transform ${openWorldEntry === index ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                            {openWorldEntry === index && (
                                <div className="p-3 border-t border-slate-700 space-y-3 animate-fade-in">
                                    <input type="text" value={entry.key} onChange={(e) => updateWorldInfo(index, 'key', e.target.value)} placeholder="Entry Key (e.g., Locations)" className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500" />
                                    <textarea value={entry.content} onChange={(e) => updateWorldInfo(index, 'content', e.target.value)} placeholder="Describe the lore for this entry..." className="w-full h-32 bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 resize-y" />
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <button type="button" onClick={() => handleEnhanceWorldEntry(index)} disabled={isEnhancing !== null || !entry.content.trim() || isStructuringEntry !== null} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500">{isEnhancing === index ? 'Enhancing...' : 'Enhance with AI ✨'}</button>
                                            {entry.isUnstructured && (
                                                <button type="button" onClick={() => handleStructureEntry(index)} disabled={isStructuringEntry !== null || isEnhancing !== null} className="ml-4 text-xs font-semibold text-teal-300 hover:text-teal-200 disabled:text-slate-500">
                                                    {isStructuringEntry === index ? 'Structuring...' : 'Structure with AI 🤖'}
                                                </button>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => removeWorldInfoEntry(index)} className="text-xs font-semibold text-red-400 hover:text-red-300">Delete Entry</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={addWorldInfoEntry} className="w-full bg-slate-700/50 text-slate-300 font-semibold py-2 rounded hover:bg-slate-700 transition">Add Lore Entry</button>
                </div>
                 <p className="text-xs text-slate-500 mt-1">For large worlds, a summary will be automatically generated when you load a file.</p>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-indigo-300 mb-2">2. Create Your Character</h3>
                <input type="text" value={characterPrompt} onChange={(e) => setCharacterPrompt(e.target.value)} placeholder="Describe your character's appearance..." className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 mb-4 focus:ring-2 focus:ring-indigo-500 transition" required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm text-slate-400 mb-1 block">Class (Optional)</label>
                        <input type="text" value={characterClass} onChange={(e) => setCharacterClass(e.target.value)} placeholder="Leave blank for AI generation" className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 mb-1 block">Alignment</label>
                        <select value={alignment} onChange={(e) => setAlignment(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition">
                            {alignments.map(align => <option key={align} value={align}>{align}</option>)}
                        </select>
                    </div>
                </div>
                <div className="mt-4">
                    <label className="text-sm text-slate-400">Backstory (Optional - AI will generate or enhance)</label>
                    <textarea value={backstory} onChange={(e) => setBackstory(e.target.value)} placeholder="Provide a few ideas, or leave blank for a surprise..." className="w-full h-24 bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition resize-none" />
                </div>
                <div className="mt-4">
                     <label className="text-sm text-slate-400">Skills (Optional - AI will generate or enhance)</label>
                     <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g., Persuasion: 10, or leave blank" className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition" />
                </div>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-indigo-300 mb-2">3. Set The Scene</h3>
                <input type="text" value={initialPrompt} onChange={(e) => setInitialPrompt(e.target.value)} placeholder="Describe your character's starting situation..." className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 focus:ring-2 focus:ring-indigo-500 transition" required />
            </div>
            <div>
                <h3 className="text-xl font-semibold text-indigo-300 mb-2">4. Gameplay Settings</h3>
                <div className="space-y-3 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1">Art Style</label>
                            <select value={settings.artStyle} onChange={(e) => handleSettingChange('artStyle', e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500">
                                {Object.entries(artStyles).map(([name, prompt]) => (<option key={name} value={prompt}>{name}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1">GM Mode</label>
                            <select value={settings.gmMode} onChange={(e) => handleSettingChange('gmMode', e.target.value as GameMasterMode)} className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500">
                                {Object.values(GameMasterMode).map((mode) => (<option key={mode} value={mode}>{mode}</option>))}
                            </select>
                        </div>
                    </div>
                     <div className="pt-2 border-t border-slate-600/50 space-y-2">
                        <label className="flex items-center justify-between cursor-pointer"><span className="text-slate-200">Generate Scene Images</span><input type="checkbox" checked={settings.generateSceneImages} onChange={e => handleSettingChange('generateSceneImages', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-600 text-indigo-600 focus:ring-indigo-500" /></label>
                        <label className="flex items-center justify-between cursor-pointer"><span className="text-slate-200">Generate Character Portraits</span><input type="checkbox" checked={settings.generateCharacterPortraits} onChange={e => handleSettingChange('generateCharacterPortraits', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-600 text-indigo-600 focus:ring-indigo-500" /></label>
                    </div>
                </div>
            </div>
            <button type="submit" disabled={!isWorldDataValid || !characterPrompt.trim() || !initialPrompt.trim() || isBusy} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 transition-all text-lg">Start New Adventure</button>
        </form>
    </div>
  );
};

const StoryBlock: React.FC<{
  entry: StoryEntry;
  onRegenerateImage: () => void;
  onRegenerateResponse: () => void;
  isLastEntry: boolean;
  canRegenerate: boolean;
  settings: Settings;
}> = React.memo(({ entry, onRegenerateImage, onRegenerateResponse, isLastEntry, canRegenerate, settings }) => {
  const RedoIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5" /><path strokeLinecap="round" strokeLinejoin="round" d="M20 12A8 8 0 1013 5.26" /></svg>);
  const storyText = entry.content.replace(/what do you do\?$/i, '').trim();
  
  return (
    <div className="mb-8 animate-fade-in group">
      { (entry.imageUrl || (entry.imgPrompt && settings.generateSceneImages === false)) &&
        <div className="relative mb-4">
          <div className="rounded-lg overflow-hidden border-2 border-slate-700/50 shadow-lg aspect-video bg-slate-900 flex items-center justify-center">
            {entry.imageUrl ? <img src={entry.imageUrl} alt="A scene from the story" className="w-full h-full object-cover" /> :
              <div className="p-4 text-center"><h3 className="font-semibold text-yellow-400">{settings.generateSceneImages ? 'Image Generation Failed' : 'Scene Image Generation Disabled'}</h3><p className="text-slate-400 text-xs mt-1">{settings.generateSceneImages ? 'The prompt was likely blocked by safety filters.' : 'Enable scene image generation in settings.'}</p></div>}
          </div>
          {entry.isImageLoading && <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg"><svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>}
          {!entry.isImageLoading && entry.imgPrompt && settings.generateSceneImages && <button onClick={onRegenerateImage} className="absolute bottom-3 right-3 bg-indigo-600/80 text-white text-xs font-bold py-1 px-3 rounded-full hover:bg-indigo-700 backdrop-blur-sm shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">↻ Regenerate</button>}
        </div>
      }
      <div className="bg-slate-700/30 p-4 sm:p-5 rounded-lg border border-slate-700/50 shadow-md">
        <ReactMarkdown children={storyText} remarkPlugins={[remarkGfm]} components={{ p: ({node, ...props}) => <p className="text-slate-200 text-base leading-relaxed font-serif mb-4 last:mb-0" {...props} /> }} />
        {entry.isStreaming && <span className="inline-block w-2 h-4 bg-indigo-300 animate-pulse ml-1"></span>}
        {isLastEntry && !entry.isStreaming &&
          <div className="flex items-center justify-end mt-3 pt-3 border-t border-slate-600/50">
            <button onClick={onRegenerateResponse} disabled={!canRegenerate} className="flex items-center gap-1.5 bg-purple-600 text-white text-xs font-bold py-1.5 px-3 rounded-md hover:bg-purple-700 disabled:bg-slate-500 transition-all shadow-md"><RedoIcon />Regenerate Response</button>
          </div>
        }
      </div>
    </div>
  );
});

const StatusSidebar: React.FC<{
  character: Character;
  inventory: InventoryItem[];
  isImageLoading: boolean;
  onRegenerate: () => void;
  onOpenWorldKnowledge: () => void;
  apiStatus: 'checking' | 'valid' | 'invalid' | 'missing';
  settings: Settings;
}> = React.memo(({ character, inventory, isImageLoading, onRegenerate, onOpenWorldKnowledge, apiStatus, settings }) => {
  const latestPortrait = character.portraits[character.portraits.length - 1];

  const ApiStatusIndicator = () => {
    const statusMap = {
      checking: { text: 'Checking API Key...', color: 'bg-yellow-500 animate-pulse' },
      valid: { text: 'API Key Valid', color: 'bg-green-500' },
      invalid: { text: 'API Key Invalid', color: 'bg-red-500' },
      missing: { text: 'API Key Missing', color: 'bg-red-500' },
    };
    const { text, color } = statusMap[apiStatus];
    return <div className="flex items-center gap-2" title={text}><div className={`w-2.5 h-2.5 rounded-full ${color}`}></div><span className="text-xs text-slate-400">{text}</span></div>
  };

  return (
    <div className="w-full lg:w-1/3 lg:max-w-sm flex-shrink-0 flex flex-col bg-slate-800 p-4 rounded-xl shadow-2xl border border-slate-700">
      <div className="flex justify-between items-center mb-2 border-b-2 border-slate-700 pb-2">
        <h2 className="text-xl font-bold text-indigo-300 font-serif">Character</h2>
        <ApiStatusIndicator />
      </div>

      <div className="group relative aspect-square w-full bg-slate-900 rounded-md flex items-center justify-center border border-slate-600 overflow-hidden">
        {isImageLoading ? <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20"><svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path></svg></div> :
         latestPortrait?.url ? <img src={latestPortrait.url} alt="Character portrait" className="w-full h-full object-cover" /> :
         <div className="p-4 text-center text-slate-500">{settings.generateCharacterPortraits ? 'No portrait generated.' : 'Character Portrait Generation Disabled.'}</div>
        }
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button onClick={onRegenerate} disabled={isImageLoading || !character.description || !settings.generateCharacterPortraits} className="w-full bg-indigo-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 disabled:cursor-not-allowed transition">
          {settings.generateCharacterPortraits ? '↻ Portrait' : 'Portraits Off'}
        </button>
        <button onClick={onOpenWorldKnowledge} className="w-full bg-sky-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-sky-700 transition">Search World Lore</button>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar mt-4 pt-4 border-t-2 border-slate-700 space-y-4">
        <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Appearance</h3><p className="text-sm text-slate-300 font-serif leading-relaxed">{character.description}</p></div>
        {inventory.length > 0 && <div><h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Inventory</h3><div className="flex flex-wrap gap-2">{inventory.map(item => <div key={item.name} title={item.description} className="bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-full cursor-help">{item.name}</div>)}</div></div>}
        <div className="grid grid-cols-2 gap-4">
            {character.class && <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Class</h3><p className="text-lg text-white font-serif">{character.class}</p></div>}
            {character.alignment && <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Alignment</h3><p className="text-lg text-white font-serif">{character.alignment}</p></div>}
        </div>
        {Object.keys(character.skills).length > 0 && <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Skills</h3><div className="grid grid-cols-2 gap-x-4 gap-y-1">{Object.entries(character.skills).map(([name, value]) => <div key={name} className="flex justify-between text-sm"><span className="text-slate-300">{name}</span><span className="font-bold text-white">{value}</span></div>)}</div></div>}
        {character.backstory && <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Character Log</h3><p className="text-sm text-slate-300 whitespace-pre-wrap font-serif leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">{character.backstory}</p></div>}
      </div>
    </div>
  );
});

const SettingsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onSettingsChange: (newSettings: Partial<Settings>) => void;
}> = ({ isOpen, onClose, settings, onSettingsChange }) => {
    if (!isOpen) return null;
    
    const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        onSettingsChange({ [key]: value });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 w-full max-w-md rounded-lg shadow-2xl border border-slate-700 p-6 space-y-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-indigo-300 font-serif">Settings</h2><button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">&times;</button></div>
                <div>
                  <label className="block text-lg font-semibold text-indigo-300 mb-2">Art Style</label>
                  <select value={settings.artStyle} onChange={(e) => handleSettingChange('artStyle', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(artStyles).map(([name, prompt]) => (<option key={name} value={prompt}>{name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-lg font-semibold text-indigo-300 mb-2">GM Mode</label>
                  <select value={settings.gmMode} onChange={(e) => handleSettingChange('gmMode', e.target.value as GameMasterMode)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                    {Object.values(GameMasterMode).map((mode) => (<option key={mode} value={mode}>{mode}</option>))}
                  </select>
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-700">
                    <label className="flex items-center justify-between cursor-pointer"><span className="text-slate-200">Generate Scene Images</span><input type="checkbox" checked={settings.generateSceneImages} onChange={e => handleSettingChange('generateSceneImages', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500" /></label>
                    <label className="flex items-center justify-between cursor-pointer"><span className="text-slate-200">Generate Character Portraits</span><input type="checkbox" checked={settings.generateCharacterPortraits} onChange={e => handleSettingChange('generateCharacterPortraits', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500" /></label>
                    <label className="flex items-center justify-between cursor-pointer"><span className="text-slate-200">Enable Dynamic Backgrounds</span><input type="checkbox" checked={settings.dynamicBackgrounds} onChange={e => handleSettingChange('dynamicBackgrounds', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500" /></label>
                </div>
                <button onClick={onClose} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700">Close</button>
            </div>
        </div>
    );
};

const WorldKnowledgeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    worldInfo: WorldInfoEntry[];
}> = ({ isOpen, onClose, worldInfo }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<WorldInfoEntry[]>([]);
    
    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setResults([]);
            return;
        }
        if (query.trim().length < 3) {
            setResults([]);
            return;
        }
        
        const search = () => {
            const lowerCaseQuery = query.toLowerCase();
            const found = worldInfo.filter(entry => 
                entry.key.toLowerCase().includes(lowerCaseQuery) || 
                entry.content.toLowerCase().includes(lowerCaseQuery)
            );
            setResults(found);
        };
        const timeoutId = setTimeout(search, 300);
        return () => clearTimeout(timeoutId);
    }, [query, isOpen, worldInfo]);
    
    if (!isOpen) return null;

    const highlight = (text: string) => {
        if (!query.trim()) return text;
        try {
            const regex = new RegExp(`(${query})`, 'gi');
            return text.replace(regex, '<mark class="bg-yellow-400 text-black px-1 rounded">$1</mark>');
        } catch (e) {
            // Invalid regex from user input, just return original text
            return text;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 w-full max-w-3xl h-[80vh] rounded-lg shadow-2xl border border-slate-700 p-6 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center flex-shrink-0"><h2 className="text-2xl font-bold text-sky-300 font-serif">Search World Lore</h2><button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">&times;</button></div>
                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for locations, characters, events..." className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 my-4 focus:ring-2 focus:ring-sky-500" autoFocus />
                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 -mr-2">
                    {results.length > 0 ? (
                        results.map((entry, i) => (
                          <div key={i} className="mb-4 p-4 bg-slate-900/50 border border-slate-700 rounded-md">
                            <h3 className="text-lg font-bold text-sky-200 mb-2" dangerouslySetInnerHTML={{ __html: highlight(entry.key) }} />
                            <p className="text-slate-300 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlight(entry.content) }} />
                          </div>
                        ))
                    ) : (
                        <div className="text-slate-400 text-center pt-10">{query.trim().length >= 3 ? 'No results found.' : 'Enter at least 3 characters to search.'}</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const WorldDataToolsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onLoadData: (data: WorldInfoEntry[]) => void;
}> = ({ isOpen, onClose, onLoadData }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [enhanceWithAI, setEnhanceWithAI] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedData, setProcessedData] = useState<WorldInfoEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setFiles([]);
            setEnhanceWithAI(false);
            setIsProcessing(false);
            setProcessedData(null);
            setError(null);
        }
    }, [isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const processAndMergeFiles = async () => {
        setIsProcessing(true);
        setError(null);
        setProcessedData(null);

        try {
            // Special case for single file with potential mixed JSON and text content
            if (files.length === 1) {
                const file = files[0];
                const content = await file.text();
                const trimmedContent = content.trim();

                if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
                    const lastBracket = trimmedContent.lastIndexOf(']');
                    const lastBrace = trimmedContent.lastIndexOf('}');
                    const splitIndex = Math.max(lastBracket, lastBrace);

                    if (splitIndex > -1) {
                        const potentialJson = trimmedContent.substring(0, splitIndex + 1);
                        const trailingText = trimmedContent.substring(splitIndex + 1).trim();

                        try {
                            let jsonData = JSON.parse(potentialJson);

                            // Normalize to array if it's a single valid object
                            if (!Array.isArray(jsonData)) {
                                if (typeof jsonData.key === 'string' && typeof jsonData.content === 'string') {
                                    jsonData = [jsonData];
                                } else {
                                    throw new Error("Parsed JSON is not a valid structure.");
                                }
                            }
                            
                            if (!jsonData.every((item: any) => typeof item.key === 'string' && typeof item.content === 'string')) {
                                throw new Error('Invalid item structure in JSON array.');
                            }
                            
                            let finalEntries: WorldInfoEntry[] = jsonData;

                            if (trailingText) {
                                const structuredTrailing = await structureWorldDataWithAI(trailingText);
                                if (enhanceWithAI) {
                                    const enhancedTrailing = await Promise.all(
                                        structuredTrailing.map(entry => enhanceWorldEntry(entry.content).then(content => ({ ...entry, content })))
                                    );
                                    finalEntries.push(...enhancedTrailing);
                                } else {
                                    finalEntries.push(...structuredTrailing);
                                }
                            }
                            
                            setProcessedData(finalEntries);
                            return; // Successfully handled the special case, we're done.
                        } catch (parseError) {
                            console.warn("Could not parse as mixed content file, proceeding with normal logic.", parseError);
                        }
                    }
                }
            }

            // General logic for multiple files or single non-mixed files
            const allEntries: WorldInfoEntry[] = [];
            for (const file of files) {
                if (file.name.endsWith('.json')) {
                    const content = await file.text();
                    try {
                        const jsonData = JSON.parse(content);
                        if (Array.isArray(jsonData) && jsonData.every(item => typeof item.key === 'string' && typeof item.content === 'string')) {
                            allEntries.push(...jsonData);
                        } else {
                            throw new Error('Invalid JSON structure.');
                        }
                    } catch (e) {
                        throw new Error(`Failed to parse ${file.name}: ${(e as Error).message}`);
                    }
                } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
                    const content = await file.text();
                    const structuredEntries = await structureWorldDataWithAI(content);
                    if (enhanceWithAI) {
                        const enhancedEntries = await Promise.all(
                            structuredEntries.map(async entry => ({ ...entry, content: await enhanceWorldEntry(entry.content) }))
                        );
                        allEntries.push(...enhancedEntries);
                    } else {
                        allEntries.push(...structuredEntries);
                    }
                }
            }
            setProcessedData(allEntries);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = () => {
        if (!processedData) return;
        const dataStr = JSON.stringify(processedData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'merged_world_data.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 w-full max-w-2xl rounded-lg shadow-2xl border border-slate-700 p-6 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center flex-shrink-0 mb-4"><h2 className="text-2xl font-bold text-green-300 font-serif">Merge & Process Lore Files</h2><button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">&times;</button></div>
                <div className="flex-grow space-y-4">
                    <div>
                        <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md,.json" />
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full text-center bg-slate-900 border-2 border-dashed border-slate-600 rounded-lg p-8 hover:border-green-500 hover:bg-slate-900/50 transition">
                            <span className="text-slate-400">Click to select files (.json, .txt, .md)</span>
                        </button>
                    </div>
                    {files.length > 0 && <div className="text-sm bg-slate-900/50 p-3 rounded-md"><ul>{files.map((f, i) => <li key={i} className="text-slate-300 truncate">{f.name}</li>)}</ul></div>}
                    <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={enhanceWithAI} onChange={e => setEnhanceWithAI(e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-green-600 focus:ring-green-500" /><span>Enhance text-based lore with AI ✨ (slower)</span></label>
                    
                    {isProcessing && <ProgressBar text="Processing files... This may take a moment." />}
                    {error && <div className="p-3 bg-red-900/50 text-red-300 rounded-md">{error}</div>}
                    {processedData && <div className="p-3 bg-green-900/50 text-green-300 rounded-md">Successfully processed {files.length} files and generated {processedData.length} lore entries.</div>}

                    <div className="pt-4 border-t border-slate-700 flex flex-col sm:flex-row gap-4">
                         <button onClick={processAndMergeFiles} disabled={isProcessing || files.length === 0} className="flex-1 bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-slate-500">Process Files</button>
                         <button onClick={handleDownload} disabled={isProcessing || !processedData} className="flex-1 bg-sky-600 text-white font-bold py-3 rounded-lg hover:bg-sky-700 disabled:bg-slate-500">Download JSON</button>
                         <button onClick={() => processedData && onLoadData(processedData)} disabled={isProcessing || !processedData} className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500">Load into Anvil</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const GameLogModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    storyLog: StoryEntry[];
}> = ({ isOpen, onClose, storyLog }) => {
    if (!isOpen) return null;
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    }, [storyLog]);
    
    const parseContent = (text: string) => {
        const events: any[] = [];
        let cleanedText = text;

        const skillCheckRegex = /\[skill-check\](.*?)\[\/skill-check\]/gs;
        const combatRegex = /\[combat\](.*?)\[\/combat\]/gs;

        const parseDetails = (match: string) => {
            try {
                return Object.fromEntries(match.trim().split(',').map(s => {
                    const [key, ...value] = s.split(':');
                    return [key.trim(), value.join(':').trim()];
                }));
            } catch {
                return { raw: match };
            }
        };

        cleanedText = cleanedText.replace(skillCheckRegex, (_, match) => {
            events.push({ type: 'skill-check', details: parseDetails(match) });
            return ''; // Remove from text
        });
        
        cleanedText = cleanedText.replace(combatRegex, (_, match) => {
            events.push({ type: 'combat', details: parseDetails(match) });
            return ''; // Remove from text
        });
        
        return { cleanedText: cleanedText.trim(), events };
    };
    
    const EventDisplay: React.FC<{ event: any }> = ({ event }) => {
        const { type, details } = event;

        if (type === 'skill-check') {
            const isSuccess = details.Result?.toLowerCase() === 'success';
            return (
                <div className={`my-2 p-2 rounded-md border text-xs ${isSuccess ? 'bg-green-900/50 border-green-700/50 text-green-300' : 'bg-red-900/50 border-red-700/50 text-red-300'}`}>
                    <strong>SKILL CHECK: {details.Skill || 'N/A'}</strong> - Result: {details.Result || 'N/A'} (Target: {details.Target || '?'})
                </div>
            );
        }

        if (type === 'combat') {
            const isHit = details.Result?.toLowerCase() === 'hit';
            return (
                <div className={`my-2 p-2 rounded-md border text-xs ${isHit ? 'bg-yellow-900/50 border-yellow-700/50 text-yellow-300' : 'bg-slate-700/50 border-slate-600/50 text-slate-300'}`}>
                    <strong>COMBAT: {details.Event || 'Action'}</strong> on {details.Target || 'Target'} - {isHit ? `HIT for ${details.Damage || '?'} dmg` : 'MISS'} (Roll: {details.Roll || '?'})
                </div>
            );
        }

        return null;
    };

    let turnCounter = 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 w-full max-w-3xl h-[80vh] rounded-lg shadow-2xl border border-slate-700 p-6 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center flex-shrink-0 mb-4"><h2 className="text-2xl font-bold text-indigo-300 font-serif">Game Log</h2><button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">&times;</button></div>
                <div ref={scrollRef} className="flex-grow overflow-y-auto custom-scrollbar pr-2 -mr-2 space-y-4">
                    {storyLog.map((entry, index) => {
                        let isNewTurn = false;
                        if (entry.type === 'player') {
                            turnCounter++;
                            isNewTurn = true;
                        }
                        const { cleanedText, events } = entry.type === 'ai' ? parseContent(entry.content) : { cleanedText: entry.content, events: [] };
                        return (
                            <div key={index}>
                                {isNewTurn && <div className="flex items-center my-4"><div className="flex-grow border-t border-slate-600"></div><span className="flex-shrink mx-4 text-slate-400 font-bold">Turn {turnCounter}</span><div className="flex-grow border-t border-slate-600"></div></div>}
                                {entry.type === 'player' ? (
                                    <div className="flex justify-end"><div className="bg-indigo-600/40 p-3 rounded-lg max-w-[80%]"><p className="text-indigo-100 italic">{cleanedText}</p></div></div>
                                ) : (
                                    <div className="bg-slate-700/30 p-3 rounded-lg">
                                        {events.map((evt, i) => <EventDisplay key={i} event={evt} />)}
                                        <ReactMarkdown children={cleanedText} remarkPlugins={[remarkGfm]} components={{ p: ({node, ...props}) => <p className="text-slate-200 text-sm mb-2 last:mb-0" {...props} /> }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};


// ===================================================================================
//  STATE MANAGEMENT (useReducer)
// ===================================================================================

type AppState = {
    gamePhase: GamePhase;
    storyLog: StoryEntry[];
    error: string | null;
    worldInfo: WorldInfoEntry[];
    worldSummary: string;
    settings: Settings;
    character: Character;
    inventory: InventoryItem[];
    isCharacterImageLoading: boolean;
    loadingMessage: string;
    hasSavedGame: boolean;
    apiStatus: 'checking' | 'valid' | 'invalid' | 'missing';
};

type Action =
    | { type: 'START_NEW_GAME'; payload: { worldInfo: WorldInfoEntry[]; worldSummary: string; character: Character; settings: Settings; } }
    | { type: 'LOAD_GAME'; payload: SavedGameState }
    | { type: 'SET_PHASE'; payload: GamePhase }
    | { type: 'SET_LOADING_MESSAGE'; payload: string }
    | { type: 'SET_ERROR'; payload: string }
    | { type: 'PLAYER_ACTION'; payload: string }
    | { type: 'STREAM_CHUNK'; payload: string }
    | { type: 'FINISH_TURN'; payload: { entry: StoryEntry; character?: Partial<Character>; inventory?: InventoryItem[]; skillUpdates?: Record<string, number> } }
    | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
    | { type: 'UPDATE_SCENE_IMAGE'; payload: { index: number, imageUrl?: string, isLoading: boolean } }
    | { type: 'UPDATE_CHARACTER_IMAGE_STATUS'; payload: boolean }
    | { type: 'UPDATE_CHARACTER'; payload: Partial<Character> }
    | { type: 'SET_API_STATUS'; payload: 'valid' | 'invalid' }
    | { type: 'SET_HAS_SAVED_GAME'; payload: boolean }


const initialState: AppState = {
    gamePhase: GamePhase.SETUP,
    storyLog: [],
    error: null,
    worldInfo: [],
    worldSummary: '',
    settings: {
        artStyle: artStyles['Cinematic Film'],
        gmMode: GameMasterMode.BALANCED,
        generateSceneImages: true,
        generateCharacterPortraits: true,
        dynamicBackgrounds: true,
    },
    character: { portraits: [], description: '', class: '', alignment: '', backstory: '', skills: {} },
    inventory: [],
    isCharacterImageLoading: false,
    loadingMessage: 'Loading...',
    hasSavedGame: false,
    apiStatus: API_KEY ? 'checking' : 'missing',
};

function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_PHASE':
            return { ...state, gamePhase: action.payload, error: action.payload === GamePhase.ERROR ? state.error : null };
        case 'SET_LOADING_MESSAGE':
            return { ...state, loadingMessage: action.payload };
        case 'START_NEW_GAME':
            clearGameState();
            return {
                ...initialState,
                ...action.payload,
                apiStatus: state.apiStatus,
                storyLog: [],
                inventory: [],
                hasSavedGame: false,
                gamePhase: GamePhase.PLAYING,
            };
        case 'LOAD_GAME':
            const { storyLog, worldInfo, worldSummary, settings, character, inventory } = action.payload;
            return { ...state, storyLog, worldInfo, worldSummary, settings, character, inventory, gamePhase: GamePhase.PLAYING };
        case 'PLAYER_ACTION':
            const playerEntry: StoryEntry = { type: 'player', content: action.payload };
            const aiEntry: StoryEntry = { type: 'ai', content: '', isStreaming: true, choices: [] };
            return { ...state, storyLog: [...state.storyLog, playerEntry, aiEntry], gamePhase: GamePhase.LOADING, error: null };
        case 'STREAM_CHUNK':
            const lastIndex = state.storyLog.length - 1;
            if (lastIndex >= 0 && state.storyLog[lastIndex].type === 'ai' && state.storyLog[lastIndex].isStreaming) {
                const newStoryLog = [...state.storyLog];
                const currentContent = newStoryLog[lastIndex].content;
                newStoryLog[lastIndex] = { ...newStoryLog[lastIndex], content: currentContent + action.payload };
                return { ...state, storyLog: newStoryLog };
            }
            return state;
        case 'FINISH_TURN': {
            const finalLog = [...state.storyLog];
            finalLog[finalLog.length - 1] = action.payload.entry;
            const needsCharacterUpdate = action.payload.character || action.payload.skillUpdates;
            return {
                ...state,
                storyLog: finalLog,
                character: needsCharacterUpdate ? {
                    ...state.character,
                    ...action.payload.character,
                    skills: { ...state.character.skills, ...action.payload.skillUpdates }
                } : state.character,
                inventory: action.payload.inventory || state.inventory,
                gamePhase: GamePhase.PLAYING,
            };
        }
        case 'UPDATE_SETTINGS':
            return { ...state, settings: { ...state.settings, ...action.payload } };
        case 'UPDATE_CHARACTER':
            return { ...state, character: { ...state.character, ...action.payload } };
        case 'UPDATE_CHARACTER_IMAGE_STATUS':
            return { ...state, isCharacterImageLoading: action.payload };
         case 'UPDATE_SCENE_IMAGE':
            return { ...state, storyLog: state.storyLog.map((e, i) => i === action.payload.index ? {...e, imageUrl: action.payload.imageUrl, isImageLoading: action.payload.isLoading} : e) };
        case 'SET_ERROR':
            return { ...state, error: action.payload, gamePhase: GamePhase.ERROR };
        case 'SET_API_STATUS':
            return { ...state, apiStatus: action.payload };
        case 'SET_HAS_SAVED_GAME':
            return { ...state, hasSavedGame: action.payload };
        default:
            return state;
    }
}

// ===================================================================================
//  REFACTORED UI COMPONENTS
// ===================================================================================

const ChoiceAndInputPanel: React.FC<{
    isAITurn: boolean;
    choices: string[];
    onPlayerAction: (action: string) => void;
    canUndo: boolean;
    onUndo: () => void;
    onOpenSettings: () => void;
    onOpenLog: () => void;
    onNewGame: () => void;
    onSaveGame: () => void;
    isSaving: boolean;
}> = ({ isAITurn, choices, onPlayerAction, canUndo, onUndo, onOpenSettings, onOpenLog, onNewGame, onSaveGame, isSaving }) => {
    const [playerInput, setPlayerInput] = useState('');

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (isAITurn) return;
            const keyNum = parseInt(e.key);
            if (keyNum >= 1 && keyNum <= choices.length) {
                onPlayerAction(choices[keyNum - 1]);
            }
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [choices, isAITurn, onPlayerAction]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (playerInput.trim()) {
            onPlayerAction(playerInput);
            setPlayerInput('');
        }
    };

    return (
        <>
            {choices.length > 0 &&
                <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {choices.map((choice, i) => <button key={i} onClick={() => onPlayerAction(choice)} disabled={isAITurn} className="text-left bg-slate-700/80 p-3 rounded-lg hover:bg-indigo-600 transition-all disabled:bg-slate-700 disabled:cursor-not-allowed"><span className="text-xs font-mono bg-slate-800 rounded px-1.5 py-0.5 mr-2">{i+1}</span>{choice}</button>)}
                </div>
            }
            <div className="flex items-center gap-2">
                <form onSubmit={handleSubmit} className="flex-grow flex items-center gap-2">
                    <input type="text" value={playerInput} onChange={e => setPlayerInput(e.target.value)} placeholder={isAITurn ? "Game Master is thinking..." : "What do you do?"} disabled={isAITurn} className="flex-grow bg-slate-900 border border-slate-600 rounded-lg p-3 disabled:bg-slate-700" autoFocus />
                    <button type="submit" disabled={isAITurn || !playerInput.trim()} className="bg-indigo-600 font-bold py-3 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500">Send</button>
                </form>
                <button onClick={onUndo} disabled={!canUndo || isAITurn} title="Undo" className="p-3 bg-slate-600 rounded-lg hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8a5 5 0 000-10H9" /></svg>
                </button>
                <button onClick={onSaveGame} disabled={isAITurn || isSaving} title="Save Game" className="p-3 bg-slate-600 rounded-lg hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors duration-300">
                    {isSaving ? <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>}
                </button>
                 <button onClick={onOpenSettings} title="Settings" disabled={isAITurn} className="p-3 bg-slate-600 rounded-lg hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>
                <button onClick={onOpenLog} title="View Log" disabled={isAITurn} className="p-3 bg-slate-600 rounded-lg hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                </button>
                <button onClick={onNewGame} title="New Game" disabled={isAITurn} className="p-3 bg-red-800/80 rounded-lg hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
            </div>
        </>
    );
};

const GameUI: React.FC<{
    state: AppState;
    previousGameState: SavedGameState | null;
    onPlayerAction: (action: string) => void;
    onRegenerateResponse: () => void;
    onUpdateCharacterImage: (description: string) => void;
    onUpdateSceneImage: (index: number, prompt: string) => void;
    onUndo: () => void;
    onOpenSettings: () => void;
    onOpenLog: () => void;
    onNewGame: () => void;
    onOpenWorldKnowledge: () => void;
    onSaveGame: () => void;
    isSaving: boolean;
}> = ({ state, previousGameState, onPlayerAction, onRegenerateResponse, onUpdateCharacterImage, onUpdateSceneImage, onUndo, onOpenSettings, onOpenLog, onNewGame, onOpenWorldKnowledge, onSaveGame, isSaving }) => {
    const logEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [state.storyLog]);

    const choices = state.storyLog[state.storyLog.length - 1]?.choices || [];
    const isAITurn = state.gamePhase === GamePhase.LOADING;

    return (
        <main className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 h-[85vh]">
            <StatusSidebar 
                character={state.character}
                inventory={state.inventory}
                isImageLoading={state.isCharacterImageLoading}
                onRegenerate={() => onUpdateCharacterImage(state.character.description)}
                onOpenWorldKnowledge={onOpenWorldKnowledge}
                apiStatus={state.apiStatus}
                settings={state.settings}
            />
            <div className="flex-grow h-full flex flex-col bg-slate-800 p-4 sm:p-6 rounded-xl shadow-2xl border border-slate-700">
                <div className="flex-grow overflow-y-auto mb-4 pr-4 -mr-4 custom-scrollbar">
                    {state.storyLog.map((entry, index) =>
                      entry.type === 'ai' ? (
                        <StoryBlock 
                          key={index} entry={entry} settings={state.settings}
                          onRegenerateResponse={onRegenerateResponse}
                          isLastEntry={index === state.storyLog.map(e => e.type).lastIndexOf('ai')}
                          canRegenerate={!!previousGameState && state.gamePhase !== GamePhase.LOADING}
                          onRegenerateImage={() => entry.imgPrompt && onUpdateSceneImage(index, entry.imgPrompt)}
                        />
                      ) : (
                        <div key={index} className="mb-8 animate-fade-in flex justify-end">
                            <div className="max-w-[80%] bg-indigo-600/40 p-4 rounded-lg"><p className="text-indigo-100 italic">{entry.content}</p></div>
                        </div>
                      )
                    )}
                    {state.error && <div className="text-red-400 p-4 bg-red-900/50 rounded-md">{state.error}</div>}
                    <div ref={logEndRef} />
                </div>
                <div className="flex-shrink-0 mt-auto pt-4 border-t border-slate-700">
                    <ChoiceAndInputPanel
                        isAITurn={isAITurn}
                        choices={choices}
                        onPlayerAction={onPlayerAction}
                        canUndo={!!previousGameState}
                        onUndo={onUndo}
                        onOpenSettings={onOpenSettings}
                        onOpenLog={onOpenLog}
                        onNewGame={onNewGame}
                        onSaveGame={onSaveGame}
                        isSaving={isSaving}
                    />
                </div>
            </div>
        </main>
    );
};

// ===================================================================================
//  MAIN APP COMPONENT
// ===================================================================================

const App: React.FC = () => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [previousGameState, setPreviousGameState] = useState<SavedGameState | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isWorldModalOpen, setIsWorldModalOpen] = useState(false);
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<string | null>(null);
    
    const activeChatSettings = useRef<Settings>(state.settings);
    const savedTurnIndex = useRef<number | null>(null);

    // Initial check for saved game and API key
    useEffect(() => {
        if (loadGameState()) {
            dispatch({ type: 'SET_HAS_SAVED_GAME', payload: true });
        }
        if (state.apiStatus === 'checking') {
            verifyApiKey().then(isValid => dispatch({ type: 'SET_API_STATUS', payload: isValid ? 'valid' : 'invalid' }));
        }
    }, []);

    // Effect to re-initialize chat when critical settings change mid-game.
    useEffect(() => {
        if (state.gamePhase !== GamePhase.PLAYING || !chatSession) return;

        const needsReinitialization =
            state.settings.gmMode !== activeChatSettings.current.gmMode ||
            state.settings.artStyle !== activeChatSettings.current.artStyle;

        if (needsReinitialization) {
            const reinitialize = async () => {
                dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'Updating Game Master settings...' });
                dispatch({ type: 'SET_PHASE', payload: GamePhase.LOADING });
                try {
                    const history = await chatSession.getHistory();
                    const newChat = initializeChat(state.worldSummary, state.character, state.settings, history);
                    if (!newChat) throw new Error("Failed to re-initialize chat session.");
                    setChatSession(newChat);
                    activeChatSettings.current = { ...state.settings };
                } catch (e) {
                    console.error(e);
                    dispatch({ type: 'SET_ERROR', payload: "Failed to update settings. Please try again." });
                    dispatch({ type: 'UPDATE_SETTINGS', payload: activeChatSettings.current });
                } finally {
                    dispatch({ type: 'SET_PHASE', payload: GamePhase.PLAYING });
                }
            };
            reinitialize();
        }
    }, [state.settings, state.gamePhase, chatSession, state.worldSummary, state.character]);

    const processFinalResponse = async (responseText: string) => {
        const tagRegex = /\[(img-prompt|char-img-prompt|update-backstory|background-prompt)\](.*?)\[\/\1\]/gs;
        const choiceRegex = /\[choice\](.*?)\[\/choice\]/g;
        const itemRegex = /\[(add-item|remove-item)\](.*?)\[\/\1\]/g;
        const skillRegex = /\[update-skill\](.*?)\|(.*?)\[\/update-skill\]/g;
        
        let content = responseText;
        const result: any = { addedItems: [], removedItems: [], skillUpdates: {} };

        content = content.replace(tagRegex, (_, tag, value) => {
            if (tag === 'img-prompt') result.imgPrompt = value.trim();
            if (tag === 'char-img-prompt') result.newCharacterDescription = value.trim();
            if (tag === 'update-backstory') result.newBackstoryEntry = value.trim();
            if (tag === 'background-prompt') result.backgroundPrompt = value.trim();
            return '';
        });

        result.choices = [...content.matchAll(choiceRegex)].map(match => match[1].trim());
        content = content.replace(choiceRegex, '').trim();

        [...responseText.matchAll(itemRegex)].forEach(match => {
            const [_, tag, value] = match;
            if (tag === 'add-item') {
                const [name, description] = value.split('|').map(s => s.trim());
                if (name && description) result.addedItems.push({ name, description });
            } else if (tag === 'remove-item') {
                result.removedItems.push(value.trim());
            }
        });
        
        [...responseText.matchAll(skillRegex)].forEach(match => {
            const [_, name, value] = match;
            const numValue = parseInt(value.trim(), 10);
            if(name && !isNaN(numValue)) {
                result.skillUpdates[name.trim()] = numValue;
            }
        });
        
        // We leave skill-check and combat tags in the content for the log to display
        // We only remove other functional tags
        content = content.replace(itemRegex, '').replace(skillRegex, '').trim();
        result.content = content;

        if (result.imgPrompt && state.settings.generateSceneImages) {
            result.imageUrl = await generateImage(result.imgPrompt, state.settings.artStyle, '16:9');
        }
        
        return result;
    };
    
    const handleUpdateCharacterImage = async (description: string) => {
        dispatch({ type: 'UPDATE_CHARACTER_IMAGE_STATUS', payload: true });
        
        let newPortrait: CharacterPortrait = { prompt: description };
        if (state.settings.generateCharacterPortraits) {
            const fullPrompt = `Cinematic character portrait of ${description}. Focus on detailed facial features, expressive lighting, high-quality rendering.`;
            newPortrait.url = await generateImage(fullPrompt, state.settings.artStyle, '1:1');
        }
        
        dispatch({ type: 'UPDATE_CHARACTER', payload: { description, portraits: [...state.character.portraits, newPortrait] } });
        dispatch({ type: 'UPDATE_CHARACTER_IMAGE_STATUS', payload: false });
    };

    const handlePlayerAction = async (action: string, session?: Chat) => {
        const chatToUse = session || chatSession;

        if (!chatToUse || !action.trim() || state.gamePhase === GamePhase.LOADING) return;

        if (state.storyLog.length > 0) {
            try {
                const history = await chatToUse.getHistory();
                setPreviousGameState({ ...state, chatHistory: history });
            } catch (error) { console.error("Error capturing undo state:", error); }
        }
        
        dispatch({ type: 'PLAYER_ACTION', payload: action });
        
        try {
            const relevantLore = retrieveRelevantSnippets(action, state.worldInfo);
            const message = relevantLore ? `${action}\n\n[RELEVANT WORLD LORE]\n${relevantLore}\n[/RELEVANT WORLD LORE]` : action;

            const stream = await chatToUse.sendMessageStream({ message });
            let fullResponseText = '';
            let streamBuffer = '';
            
            for await (const chunk of stream) {
                fullResponseText += chunk.text;
                streamBuffer += chunk.text;
                
                let lastSpace = streamBuffer.lastIndexOf(' ');
                if (lastSpace !== -1) {
                    const dispatchableText = streamBuffer.substring(0, lastSpace + 1);
                    dispatch({ type: 'STREAM_CHUNK', payload: dispatchableText });
                    streamBuffer = streamBuffer.substring(lastSpace + 1);
                }
            }
            if(streamBuffer) {
                dispatch({ type: 'STREAM_CHUNK', payload: streamBuffer });
            }
            
            const processed = await processFinalResponse(fullResponseText);
            
            let characterUpdates: Partial<Character> = {};
            if (processed.newCharacterDescription && processed.newCharacterDescription !== state.character.description) {
                characterUpdates.description = processed.newCharacterDescription;
                await handleUpdateCharacterImage(characterUpdates.description);
            }
            if (processed.newBackstoryEntry) {
                characterUpdates.backstory = `${state.character.backstory}\n\n---\n\n${processed.newBackstoryEntry}`;
            }

            let newInventory = state.inventory;
            if (processed.addedItems.length > 0 || processed.removedItems.length > 0) {
                newInventory = [...state.inventory.filter(item => !processed.removedItems.includes(item.name)), ...processed.addedItems];
            }
            
            const finalAiEntry: StoryEntry = { type: 'ai', content: processed.content || '', imageUrl: processed.imageUrl, imgPrompt: processed.imgPrompt, choices: processed.choices, backgroundPrompt: processed.backgroundPrompt, isImageLoading: false, isStreaming: false };
            dispatch({ type: 'FINISH_TURN', payload: { entry: finalAiEntry, character: characterUpdates, inventory: newInventory, skillUpdates: processed.skillUpdates }});

        } catch (e) {
            console.error(e);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to get a response from the Game Master. Please try again.' });
        }
    };

    const handleStartGame = (worldInfo: WorldInfoEntry[], worldSummary: string | null, characterInput: CharacterInput, newSettings: Settings) => {
        try {
            const summary = worldSummary || formatWorldInfoToString(worldInfo);
            savedTurnIndex.current = null;
    
            const initialParsedSkills: Record<string, number> = {};
            if (characterInput.skills) {
                characterInput.skills.split(',').forEach(pair => {
                    const [key, value] = pair.split(':');
                    if (key && value && !isNaN(parseInt(value.trim(), 10))) {
                        initialParsedSkills[key.trim()] = parseInt(value.trim(), 10);
                    }
                });
            }
    
            const initialCharacter: Character = {
                description: characterInput.description,
                class: characterInput.characterClass || 'Adventurer',
                alignment: characterInput.alignment || 'True Neutral',
                backstory: characterInput.backstory || 'A mysterious past awaits...',
                portraits: [],
                skills: initialParsedSkills,
            };
    
            // This action now sets the game phase to PLAYING, which renders the game UI immediately.
            dispatch({ type: 'START_NEW_GAME', payload: { worldInfo, worldSummary: summary, character: initialCharacter, settings: newSettings } });
            activeChatSettings.current = newSettings;
    
            const chat = initializeChat(summary, initialCharacter, newSettings);
            if (!chat) throw new Error("Failed to initialize chat session.");
            setChatSession(chat);
    
            // This starts the first turn, showing a loading state within the game UI.
            handlePlayerAction("Let's begin.", chat);
    
            // Run character enhancement and portrait generation in the background.
            (async () => {
                // Wait a moment for the main thread to be free to render the UI transition.
                await new Promise(resolve => setTimeout(resolve, 100));
    
                const [generatedDetails] = await Promise.all([
                    generateCharacterDetails(characterInput),
                    // The portrait can be generated in parallel with details.
                    handleUpdateCharacterImage(initialCharacter.description) 
                ]);
    
                const finalCharacterInput = { ...characterInput, ...generatedDetails };
    
                const enhancedParsedSkills: Record<string, number> = {};
                if (finalCharacterInput.skills) {
                    finalCharacterInput.skills.split(',').forEach(pair => {
                        const [key, value] = pair.split(':');
                        if (key && value && !isNaN(parseInt(value.trim(), 10))) {
                            enhancedParsedSkills[key.trim()] = parseInt(value.trim(), 10);
                        }
                    });
                }
    
                const characterUpdates: Partial<Character> = {
                    class: finalCharacterInput.characterClass || initialCharacter.class,
                    alignment: finalCharacterInput.alignment || initialCharacter.alignment,
                    backstory: finalCharacterInput.backstory || initialCharacter.backstory,
                    skills: Object.keys(enhancedParsedSkills).length > 0 ? { ...initialCharacter.skills, ...enhancedParsedSkills } : initialCharacter.skills,
                };
    
                dispatch({ type: 'UPDATE_CHARACTER', payload: characterUpdates });
            })();
    
        } catch (e) {
            console.error(e);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to start the game. Please check your API key and try again.' });
        }
    };
    
    const loadGameFromState = (savedState: SavedGameState | null) => {
        if (!savedState) return;
        savedTurnIndex.current = null;
        const chat = initializeChat(savedState.worldSummary, savedState.character, savedState.settings, savedState.chatHistory);
        if (!chat) {
            dispatch({ type: 'SET_ERROR', payload: "Failed to re-initialize chat from save." });
            return;
        }
        setChatSession(chat);
        dispatch({ type: 'LOAD_GAME', payload: savedState });
        activeChatSettings.current = savedState.settings;
    };

    const handleSaveGame = async () => {
        if (!chatSession || state.storyLog.length === 0 || isSaving) return;
        
        setIsSaving(true);
        try {
            const history = await chatSession.getHistory();
            saveGameState({ ...state, chatHistory: history });
            dispatch({ type: 'SET_HAS_SAVED_GAME', payload: true });
            setNotification("Game progress saved!");
        } catch (error) {
            console.error("Failed to save game state:", error);
        } finally {
            setTimeout(() => {
                setIsSaving(false);
                setNotification(null);
            }, 1500);
        }
    };
    
    // Auto-save logic
    useEffect(() => {
        const lastEntryIndex = state.storyLog.length - 1;
        const lastEntry = state.storyLog[lastEntryIndex];
        // Save only when an AI turn has fully completed and hasn't been saved before.
        if (state.gamePhase === GamePhase.PLAYING && lastEntry?.type === 'ai' && !lastEntry.isStreaming && savedTurnIndex.current !== lastEntryIndex) {
            handleSaveGame();
            savedTurnIndex.current = lastEntryIndex; // Mark this turn index as saved
        }
    }, [state.storyLog, state.gamePhase]);
    
    const handleRegenerateResponse = () => {
        if (!previousGameState || state.gamePhase === GamePhase.LOADING) return;
        const lastPlayerAction = [...previousGameState.storyLog].reverse().find(e => e.type === 'player');
        if (!lastPlayerAction) return;
        
        loadGameFromState(previousGameState);
        setTimeout(() => handlePlayerAction(lastPlayerAction.content), 50);
    };

    const latestBackgroundPrompt = useMemo(() => {
        return [...state.storyLog].reverse().find(e => e.type === 'ai' && e.backgroundPrompt)?.backgroundPrompt;
    }, [state.storyLog]);

    const handleUpdateSceneImage = async (index: number, prompt: string) => {
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { index, isLoading: true }});
        const newImageUrl = await generateImage(prompt, state.settings.artStyle, '16:9');
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { index, imageUrl: newImageUrl, isLoading: false }});
    };
    
    const handleNewGame = () => {
        if (window.confirm('Are you sure you want to start a new game? All current progress will be lost.')) {
            clearGameState();
            window.location.reload();
        }
    };

    const renderContent = () => {
        switch (state.gamePhase) {
            case GamePhase.SETUP:
                return <SetupScreen onStart={(worldInfo, worldSummary, characterInput, _, settings) => handleStartGame(worldInfo, worldSummary, characterInput, settings)} onContinue={() => loadGameFromState(loadGameState())} onLoadFromFile={(file) => { const reader = new FileReader(); reader.onload = (e) => loadGameFromState(JSON.parse(e.target?.result as string)); reader.readAsText(file); }} hasSavedGame={state.hasSavedGame} />;
            case GamePhase.LOADING:
                 if (state.storyLog.length > 0) {
                     return <GameUI 
                        state={state}
                        previousGameState={previousGameState}
                        onPlayerAction={handlePlayerAction}
                        onRegenerateResponse={handleRegenerateResponse}
                        onUpdateCharacterImage={handleUpdateCharacterImage}
                        onUpdateSceneImage={handleUpdateSceneImage}
                        onUndo={() => previousGameState && loadGameFromState(previousGameState)}
                        onOpenSettings={() => setIsSettingsModalOpen(true)}
                        onOpenLog={() => setIsLogModalOpen(true)}
                        onNewGame={handleNewGame}
                        onOpenWorldKnowledge={() => setIsWorldModalOpen(true)}
                        onSaveGame={handleSaveGame}
                        isSaving={isSaving}
                     />;
                 }
                 return <div className="flex items-center justify-center h-[85vh]"><div className="flex items-center space-x-2"><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:'0.15s'}}></div><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:'0.3s'}}></div><span className="text-slate-400 font-serif">{state.loadingMessage}</span></div></div>;
            case GamePhase.PLAYING:
                 return <GameUI 
                    state={state}
                    previousGameState={previousGameState}
                    onPlayerAction={handlePlayerAction}
                    onRegenerateResponse={handleRegenerateResponse}
                    onUpdateCharacterImage={handleUpdateCharacterImage}
                    onUpdateSceneImage={handleUpdateSceneImage}
                    onUndo={() => previousGameState && loadGameFromState(previousGameState)}
                    onOpenSettings={() => setIsSettingsModalOpen(true)}
                    onOpenLog={() => setIsLogModalOpen(true)}
                    onNewGame={handleNewGame}
                    onOpenWorldKnowledge={() => setIsWorldModalOpen(true)}
                    onSaveGame={handleSaveGame}
                    isSaving={isSaving}
                 />;
            case GamePhase.ERROR:
                 return <div className="text-red-400 p-4 bg-red-900/50 rounded-md"><h2>An Error Occurred</h2><p>{state.error}</p><button onClick={() => { clearGameState(); window.location.reload(); }} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Start Over</button></div>;
        }
    }
    
    const backgroundUrl = useMemo(() => {
        if (!state.settings.dynamicBackgrounds || !latestBackgroundPrompt) return '';
        return `https://source.unsplash.com/1600x900/?${encodeURIComponent(latestBackgroundPrompt)}`;
    }, [latestBackgroundPrompt, state.settings.dynamicBackgrounds]);


    return (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8">
            {notification && <div className="fixed top-5 right-5 bg-green-600 text-white py-2 px-4 rounded-lg shadow-lg z-[100] animate-fade-in-down">{notification}</div>}
             <div id="background-container" style={{ backgroundImage: `url(${backgroundUrl})`, transition: 'background-image 1.5s ease-in-out' }} className="fixed inset-0 bg-cover bg-center filter blur-sm scale-110 opacity-20" />
            <header className="text-center w-full max-w-7xl mx-auto mb-6"><h1 className="text-4xl sm:text-5xl font-bold text-indigo-400 font-serif">CYOA Game Master</h1></header>
            
            {renderContent()}
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} settings={state.settings} onSettingsChange={(newSettings) => dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings })} />
            <WorldKnowledgeModal isOpen={isWorldModalOpen} onClose={() => setIsWorldModalOpen(false)} worldInfo={state.worldInfo} />
            <GameLogModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} storyLog={state.storyLog} />
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}