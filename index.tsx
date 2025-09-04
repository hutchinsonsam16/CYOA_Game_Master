
import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, Content, GenerateContentResponse } from "@google/genai";
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

interface StoryEntry {
  type: 'ai' | 'player';
  content: string;
  imageUrl?: string;
  imgPrompt?: string;
  isImageLoading?: boolean;
  choices?: string[];
  isStreaming?: boolean;
  sceneTag?: string;
}

interface CharacterInput {
  description: string;
  characterClass?: string;
  alignment?: string;
  backstory?: string;
}

interface Character {
  portraits: CharacterPortrait[];
  description: string;
  class: string;
  alignment: string;
  backstory: string;
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
  fullWorldData: string;
  worldSummary: string;
  chatHistory: Content[];
  character: Character;
  inventory: InventoryItem[];
  settings: Settings;
}

interface GalleryImage {
  src: string;
  alt: string;
}

interface Settings {
    generateSceneImages: boolean;
    generateCharacterPortraits: boolean;
    dynamicBackgrounds: boolean;
    gmMode: GameMasterMode;
    artStyle: string;
}

// ===================================================================================
//  LOCAL STORAGE SERVICE
// ===================================================================================

const SAVE_GAME_KEY = 'cyoa_saved_game_v3';

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
    return JSON.parse(stateString) as SavedGameState;
  } catch (error) {
    console.error("Failed to load game state:", error);
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

const summarizeWorldData = async (worldData: string): Promise<string> => {
    if (!ai) return '';
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

3.  **Character & World Progression:** You MUST signal changes using these tags:
    *   To update appearance: \`[char-img-prompt]New, complete description.[/char-img-prompt]\`
    *   To add to the character's journal: \`[update-backstory]Summary of key events.[/update-backstory]\`
    *   To manage inventory: \`[add-item]Item Name|Description[/add-item]\` or \`[remove-item]Item Name[/remove-item]\`.
    *   **Scene Tag:** At the START of your narrative text, you MUST include a single, one-word tag describing the primary environment. This is CRITICAL for setting the visual mood. Examples: \`[scene-tag]forest[/scene-tag]\`, \`[scene-tag]cave[/scene-tag]\`, \`[scene-tag]city[/scene-tag]\`, \`[scene-tag]dungeon[/scene-tag]\`, \`[scene-tag]tavern[/scene-tag]\`.

4.  **Image Prompts:** Generate image prompts for scenes (\`[img-prompt]\`) that are faithful to the narrative and the art style: "${settings.artStyle}". Follow safety rules strictly: focus on cinematic language, tension, and atmosphere, NOT explicit violence or gore.

5.  **Response Format:** Structure EVERY response in this sequence:
    1.  \`[scene-tag]\` (MUST be first)
    2.  Story Text
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

const suggestCharacterClass = async (backstory: string): Promise<string> => {
    if (!ai || !backstory.trim()) return '';
    const prompt = `Based on the following character backstory, suggest a single, concise fantasy RPG class (e.g., Rogue, Sorcerer, Paladin, Ranger). Output ONLY the class name.\n\n--- BACKSTORY ---\n${backstory}`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        return response.text.trim();
    } catch (error) {
        console.error("Failed to suggest class:", error);
        return '';
    }
};

const enhanceWithAI = async (text: string, type: 'backstory' | 'world'): Promise<string> => {
    if (!ai || !text.trim()) return text;
    const prompt = type === 'backstory'
        ? `You are a creative writing assistant. Take the following character backstory and enrich it with compelling details, plot hooks, and internal conflicts. Preserve the user's core concepts. Output ONLY the enhanced backstory.\n\n--- USER BACKSTORY ---\n${text}`
        : `You are a master world-builder, a 'World Bible Forger'. Your task is to take the user's provided lore and expand it into a comprehensive, structured document.
Follow these steps using the Gaia Forge Protocol:
1.  **Analyze & Identify:** Read the entire lore and identify all key entities: locations, characters/people, factions, historical events, significant items, and unique concepts.
2.  **Expand & Detail:** For each identified entity, create a detailed entry.
    *   **Locations:** Describe their geography, inhabitants, culture, points of interest, and history.
    *   **People:** Detail their appearance, personality, motivations, backstory, and relationships.
    *   **Factions:** Explain their goals, hierarchy, members, and influence on the world.
3.  **Iterative Refinement (3 Cycles):** Refine the entire World Bible three times. In each cycle, add more depth, ensure consistency, and create new connections between the entities.
4.  **Final Output:** Format the final, comprehensive World Bible using clear Markdown headings for each section and entity. After the complete bible, append the user's original, unaltered lore under a "--- ORIGINAL LORE ---" heading.
Output ONLY the final world data as described.

--- USER PROVIDED WORLD LORE ---
${text}`;

    try {
        if (type === 'world') {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            return response.text.trim() || text;
        } else {
             const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
             return response.text.trim() || text;
        }
    } catch (error) {
        console.error(`Failed to enhance ${type}:`, error);
        return text;
    }
};

// ===================================================================================
//  HELPER UTILS
// ===================================================================================
const retrieveRelevantSnippets = (query: string, corpus: string, count = 3): string => {
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
//  COMPONENTS
// ===================================================================================

const SetupScreen: React.FC<{
  onStart: (worldData: string, characterInput: CharacterInput, initialPrompt: string, settings: Settings) => void;
  onContinue: () => void;
  onLoadFromFile: (file: File) => void;
  hasSavedGame: boolean;
}> = ({ onStart, onContinue, onLoadFromFile, hasSavedGame }) => {
  const [worldData, setWorldData] = useState('');
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [characterClass, setCharacterClass] = useState('');
  const [alignment, setAlignment] = useState('True Neutral');
  const [backstory, setBackstory] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState<'backstory' | 'world' | null>(null);
  const [isSuggestingClass, setIsSuggestingClass] = useState(false);
  const [settings, setSettings] = useState<Settings>({
      artStyle: artStyles['Cinematic Film'],
      gmMode: GameMasterMode.BALANCED,
      generateSceneImages: true,
      generateCharacterPortraits: true,
      dynamicBackgrounds: true,
  });
  const saveFileInputRef = useRef<HTMLInputElement>(null);
  const worldFileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!worldData.trim() || !characterPrompt.trim() || !initialPrompt.trim()) return;
    const characterInput: CharacterInput = { description: characterPrompt, characterClass, alignment, backstory };
    onStart(worldData, characterInput, initialPrompt, settings);
  };
  
  const handleEnhance = async (type: 'backstory' | 'world') => {
    setIsEnhancing(type);
    const text = type === 'world' ? worldData : backstory;
    const enhanced = await enhanceWithAI(text, type);
    if (type === 'world') setWorldData(enhanced);
    else setBackstory(enhanced);
    setIsEnhancing(null);
  }

  const handleSuggestClass = async () => {
    if (!backstory.trim()) return;
    setIsSuggestingClass(true);
    const suggestedClass = await suggestCharacterClass(backstory);
    if(suggestedClass) setCharacterClass(suggestedClass);
    setIsSuggestingClass(false);
  }
  
  const handleLoadWorldFromFile = (file: File) => {
    if (file && (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md'))) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            setWorldData(content);
        };
        reader.readAsText(file);
    } else {
        alert('Please select a .txt or .md file for the world data.');
    }
  };

  const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings(s => ({ ...s, [key]: value }));
  };

  return (
    <div className="w-full max-w-3xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700 animate-fade-in">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {hasSavedGame && <button type="button" onClick={onContinue} className="flex-1 bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-all duration-300">Continue Last Session</button>}
            <input type="file" ref={saveFileInputRef} onChange={(e) => e.target.files && onLoadFromFile(e.target.files[0])} className="hidden" accept=".json" />
            <button type="button" onClick={() => saveFileInputRef.current?.click()} className="flex-1 bg-sky-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-sky-700 transition-all">Load from File</button>
          </div>
          {hasSavedGame && <div className="my-4 flex items-center"><div className="flex-grow border-t border-slate-600"></div><span className="flex-shrink mx-4 text-slate-400">OR</span><div className="flex-grow border-t border-slate-600"></div></div>}
          <h2 className="text-xl font-semibold text-slate-300 mt-4 text-center">Start a New Story</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-semibold text-indigo-300">1. Establish Your World</h3>
                     <div className="flex items-center gap-4">
                        <input type="file" ref={worldFileInputRef} onChange={(e) => e.target.files && handleLoadWorldFromFile(e.target.files[0])} className="hidden" accept=".txt,.md" />
                        <button type="button" onClick={() => worldFileInputRef.current?.click()} className="text-xs font-semibold text-sky-300 hover:text-sky-200">Load from File</button>
                        <button type="button" onClick={() => handleEnhance('world')} disabled={isEnhancing === 'world' || !worldData.trim()} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500">{isEnhancing === 'world' ? 'Forging...' : 'Enhance with AI ✨'}</button>
                    </div>
                </div>
                <textarea value={worldData} onChange={(e) => setWorldData(e.target.value)} placeholder="Provide the lore, rules, and setting for your world... or load a file." className="w-full h-40 bg-slate-900 border border-slate-600 rounded-md p-4 focus:ring-2 focus:ring-indigo-500 transition resize-none" required disabled={isEnhancing === 'world'} />
                 <p className="text-xs text-slate-500 mt-1">For very large worlds, an initial summarization will occur on game start to ensure performance.</p>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-indigo-300 mb-2">2. Create Your Character</h3>
                <input type="text" value={characterPrompt} onChange={(e) => setCharacterPrompt(e.target.value)} placeholder="Describe your character's appearance..." className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 mb-4 focus:ring-2 focus:ring-indigo-500 transition" required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                        <input type="text" value={characterClass} onChange={(e) => setCharacterClass(e.target.value)} placeholder="Class (e.g., Rogue)" className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition" />
                        <button type="button" onClick={handleSuggestClass} disabled={!backstory.trim() || isSuggestingClass} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500">{isSuggestingClass ? '...' : 'Suggest ✨'}</button>
                    </div>
                    <select value={alignment} onChange={(e) => setAlignment(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition">
                        {alignments.map(align => <option key={align} value={align}>{align}</option>)}
                    </select>
                </div>
                 <div className="mt-4">
                    <div className="flex justify-between items-center mb-1"><label className="text-sm text-slate-400">Backstory (Optional)</label><button type="button" onClick={() => handleEnhance('backstory')} disabled={isEnhancing === 'backstory' || !backstory.trim()} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500">{isEnhancing === 'backstory' ? 'Enhancing...' : 'Enhance with AI ✨'}</button></div>
                    <textarea value={backstory} onChange={(e) => setBackstory(e.target.value)} disabled={isEnhancing === 'backstory'} className="w-full h-24 bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition resize-none" />
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
            <button type="submit" disabled={!worldData.trim() || !characterPrompt.trim() || !initialPrompt.trim()} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 transition-all text-lg">Start New Adventure</button>
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
      { (entry.imageUrl || (entry.imgPrompt && !settings.generateSceneImages)) &&
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
  apiStatus: 'checking' | 'valid' | 'invalid' | 'missing';
  settings: Settings;
}> = React.memo(({ character, inventory, isImageLoading, onRegenerate, apiStatus, settings }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
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
      <button onClick={onRegenerate} disabled={isImageLoading || !character.description || !settings.generateCharacterPortraits} className="w-full mt-4 bg-indigo-600 text-white text-sm font-bold py-2.5 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 disabled:cursor-not-allowed transition">
        {settings.generateCharacterPortraits ? '↻ Regenerate Portrait' : 'Portrait Gen Disabled'}
      </button>

      <div className="flex-grow overflow-y-auto custom-scrollbar mt-4 pt-4 border-t-2 border-slate-700 space-y-4">
        <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Appearance</h3><p className="text-sm text-slate-300 font-serif leading-relaxed">{character.description}</p></div>
        {inventory.length > 0 && <div><h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Inventory</h3><div className="flex flex-wrap gap-2">{inventory.map(item => <div key={item.name} title={item.description} className="bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-full cursor-help">{item.name}</div>)}</div></div>}
        <div className="grid grid-cols-2 gap-4">
            {character.class && <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Class</h3><p className="text-lg text-white font-serif">{character.class}</p></div>}
            {character.alignment && <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Alignment</h3><p className="text-lg text-white font-serif">{character.alignment}</p></div>}
        </div>
        {character.backstory && <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Character Log</h3><p className="text-sm text-slate-300 whitespace-pre-wrap font-serif leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">{character.backstory}</p></div>}
      </div>
    </div>
  );
});

const SettingsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onSettingsChange: (newSettings: Settings) => void;
}> = ({ isOpen, onClose, settings, onSettingsChange }) => {
    if (!isOpen) return null;
    
    const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        onSettingsChange({ ...settings, [key]: value });
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

// ===================================================================================
//  MAIN APP
// ===================================================================================

const App: React.FC = () => {
    const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.SETUP);
    const [storyLog, setStoryLog] = useState<StoryEntry[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fullWorldData, setFullWorldData] = useState('');
    const [worldSummary, setWorldSummary] = useState('');
    const [settings, setSettings] = useState<Settings>({ 
        artStyle: artStyles['Cinematic Film'], 
        gmMode: GameMasterMode.BALANCED, 
        generateSceneImages: true, 
        generateCharacterPortraits: true, 
        dynamicBackgrounds: true 
    });
    const [character, setCharacter] = useState<Character>({ portraits: [], description: '', class: '', alignment: '', backstory: '' });
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [previousGameState, setPreviousGameState] = useState<SavedGameState | null>(null);
    const [hasSavedGame, setHasSavedGame] = useState(false);
    const [isCharacterImageLoading, setIsCharacterImageLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Loading...');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [apiStatus, setApiStatus] = useState<'checking' | 'valid' | 'invalid' | 'missing'>(API_KEY ? 'checking' : 'missing');
    
    // This ref stores the settings that the current chat session was initialized with.
    // It's used to detect when a change requires re-initializing the chat.
    const activeChatSettings = useRef<Settings>(settings);


    useEffect(() => {
        if (loadGameState()) setHasSavedGame(true);
        if (apiStatus === 'checking') {
            verifyApiKey().then(isValid => setApiStatus(isValid ? 'valid' : 'invalid'));
        }
    }, []);

    // Effect to re-initialize chat when critical settings (art style, GM mode) change mid-game.
    // This is the key fix for the app freezing or becoming unstable.
    useEffect(() => {
        if (gamePhase !== GamePhase.PLAYING || !chatSession) return;

        const needsReinitialization =
            settings.gmMode !== activeChatSettings.current.gmMode ||
            settings.artStyle !== activeChatSettings.current.artStyle;

        if (needsReinitialization) {
            const reinitialize = async () => {
                setLoadingMessage('Updating Game Master settings...');
                setGamePhase(GamePhase.LOADING);
                try {
                    const history = await chatSession.getHistory();
                    const newChat = initializeChat(worldSummary, character, settings, history);
                    if (!newChat) throw new Error("Failed to re-initialize chat session.");
                    setChatSession(newChat);
                    activeChatSettings.current = { ...settings }; // Update the active settings ref
                } catch (e) {
                    console.error(e);
                    setError("Failed to update settings with the Game Master. Reverting.");
                    setSettings(activeChatSettings.current); // Revert to last known good settings
                } finally {
                    setGamePhase(GamePhase.PLAYING);
                }
            };
            reinitialize();
        }
    }, [settings, gamePhase, chatSession, worldSummary, character]);

    const processFinalResponse = useCallback(async (responseText: string): Promise<Partial<StoryEntry> & { newCharacterDescription?: string; newBackstoryEntry?: string; addedItems: InventoryItem[]; removedItems: string[] }> => {
        const tagRegex = /\[(img-prompt|char-img-prompt|update-backstory|scene-tag)\](.*?)\[\/\1\]/gs;
        const choiceRegex = /\[choice\](.*?)\[\/choice\]/g;
        const itemRegex = /\[(add-item|remove-item)\](.*?)\[\/\1\]/g;

        let content = responseText;
        const result: any = { addedItems: [], removedItems: [] };

        content = content.replace(tagRegex, (_, tag, value) => {
            if (tag === 'img-prompt') result.imgPrompt = value.trim();
            if (tag === 'char-img-prompt') result.newCharacterDescription = value.trim();
            if (tag === 'update-backstory') result.newBackstoryEntry = value.trim();
            if (tag === 'scene-tag') result.sceneTag = value.trim();
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
        
        content = content.replace(itemRegex, '').trim();
        result.content = content;

        if (result.imgPrompt && settings.generateSceneImages) {
            result.imageUrl = await generateImage(result.imgPrompt, settings.artStyle, '16:9');
        }
        
        return result;
    }, [settings.generateSceneImages, settings.artStyle]);
    
    const handleUpdateCharacterImage = useCallback(async (description: string) => {
        setIsCharacterImageLoading(true);
        if (!settings.generateCharacterPortraits) {
            setCharacter(c => ({ ...c, description, portraits: [...c.portraits, { url: undefined, prompt: description }] }));
            setIsCharacterImageLoading(false);
            return;
        }
        
        const fullPrompt = `Cinematic character portrait of ${description}. Focus on detailed facial features, expressive lighting, high-quality rendering.`;
        try {
            const url = await generateImage(fullPrompt, settings.artStyle, '1:1');
            setCharacter(c => ({ ...c, description, portraits: [...c.portraits, { url, prompt: description }] }));
        } finally {
            setIsCharacterImageLoading(false);
        }
    }, [settings.generateCharacterPortraits, settings.artStyle]);

    const handlePlayerAction = useCallback(async (action: string, session?: Chat, isFirstTurn = false) => {
        const chatToUse = session || chatSession;
        if (!chatToUse || !action.trim()) return;

        if (!isFirstTurn) {
            try {
                const history = await chatToUse.getHistory();
                setPreviousGameState({ storyLog, fullWorldData, worldSummary, settings, character, inventory, chatHistory: history });
            } catch (error) { console.error("Error capturing undo state:", error); }
        }
        
        const playerEntry: StoryEntry = { type: 'player', content: action };
        const aiEntry: StoryEntry = { type: 'ai', content: '', isStreaming: true, choices: [] };
        setStoryLog(log => isFirstTurn ? [aiEntry] : [...log, playerEntry, aiEntry]);
        if(isFirstTurn) setStoryLog([playerEntry, aiEntry]);
        setGamePhase(GamePhase.LOADING);
        
        try {
            const relevantLore = retrieveRelevantSnippets(action, fullWorldData);
            const message = relevantLore ? `${action}\n\n[RELEVANT WORLD LORE]\n${relevantLore}\n[/RELEVANT WORLD LORE]` : action;

            const stream = await chatToUse.sendMessageStream({ message });
            let fullResponseText = '';
            for await (const chunk of stream) {
                fullResponseText += chunk.text;
                setStoryLog(log => log.map((entry, i) => i === log.length - 1 ? { ...entry, content: fullResponseText.replace(/\[.*?\]/g, '') } : entry));
            }
            
            const processed = await processFinalResponse(fullResponseText);
            
            let characterUpdates: Partial<Character> = {};
            if (processed.newCharacterDescription && processed.newCharacterDescription !== character.description) {
                characterUpdates.description = processed.newCharacterDescription;
            }
            if (processed.newBackstoryEntry) {
                characterUpdates.backstory = `${character.backstory}\n\n---\n\n${processed.newBackstoryEntry}`;
            }

            if (Object.keys(characterUpdates).length > 0) {
                setCharacter(c => ({ ...c, ...characterUpdates }));
                if (characterUpdates.description) {
                    // Await this so the image is based on the *new* description
                    await handleUpdateCharacterImage(characterUpdates.description);
                }
            }
            
            if (processed.addedItems.length > 0 || processed.removedItems.length > 0) {
                setInventory(inv => [...inv.filter(item => !processed.removedItems.includes(item.name)), ...processed.addedItems]);
            }
            
            const finalAiEntry: StoryEntry = { type: 'ai', content: processed.content || '', imageUrl: processed.imageUrl, imgPrompt: processed.imgPrompt, choices: processed.choices, sceneTag: processed.sceneTag, isImageLoading: false, isStreaming: false };
            setStoryLog(log => log.map((entry, i) => i === log.length - 1 ? finalAiEntry : entry));
        } catch (e) {
            console.error(e);
            setError('Failed to get a response from the Game Master. Please try again.');
            setGamePhase(GamePhase.ERROR);
        } finally {
            setGamePhase(GamePhase.PLAYING);
        }
    }, [chatSession, processFinalResponse, handleUpdateCharacterImage, fullWorldData, storyLog, settings, character, inventory]);

    const handleStartGame = useCallback(async (worldData: string, characterInput: CharacterInput, initialPrompt: string, newSettings: Settings) => {
        setGamePhase(GamePhase.LOADING);
        clearGameState();
        setHasSavedGame(false);

        try {
            setLoadingMessage('Condensing world knowledge...');
            const summary = worldData.length > 20000 ? await summarizeWorldData(worldData) : worldData;
            setFullWorldData(worldData);
            setWorldSummary(summary);
            setSettings(newSettings);
            activeChatSettings.current = newSettings; // Set initial active settings

            const newCharacter: Character = {
                description: characterInput.description,
                class: characterInput.characterClass || 'Adventurer',
                alignment: characterInput.alignment || 'True Neutral',
                backstory: characterInput.backstory || 'A mysterious past awaits.',
                portraits: [],
            };
            setCharacter(newCharacter);
            
            setLoadingMessage('Generating character portrait...');
            await handleUpdateCharacterImage(characterInput.description);
            
            setLoadingMessage('The Game Master is preparing your story...');
            const chat = initializeChat(summary, newCharacter, newSettings);
            if(!chat) throw new Error("Failed to initialize chat session.");
            setChatSession(chat);
            
            await handlePlayerAction(initialPrompt, chat, true);
        } catch (e) {
            console.error(e);
            setError('Failed to start the game. Please check your API key and try again.');
            setGamePhase(GamePhase.ERROR);
        }
    }, [handlePlayerAction, handleUpdateCharacterImage]);
    
    const loadGameFromState = useCallback((savedState: SavedGameState | null) => {
        if (!savedState) return;
        
        const loadedSettings = savedState.settings;
        // Backward compatibility for old saves with a single `imageGeneration` key
        if (typeof (loadedSettings as any).imageGeneration === 'boolean') {
            const oldSetting = (loadedSettings as any).imageGeneration;
            loadedSettings.generateSceneImages = oldSetting;
            loadedSettings.generateCharacterPortraits = oldSetting;
            delete (loadedSettings as any).imageGeneration;
        }

        const finalSettings = {
            generateSceneImages: true,
            generateCharacterPortraits: true,
            dynamicBackgrounds: true,
            ...loadedSettings
        };

        const chat = initializeChat(savedState.worldSummary, savedState.character, finalSettings, savedState.chatHistory);
        if (!chat) {
            setError("Failed to re-initialize chat from save. The save might be incompatible.");
            setGamePhase(GamePhase.ERROR);
            return;
        }
        setChatSession(chat);
        setStoryLog(savedState.storyLog);
        setFullWorldData(savedState.fullWorldData);
        setWorldSummary(savedState.worldSummary);
        setSettings(finalSettings);
        activeChatSettings.current = finalSettings; // Set active settings from save
        setCharacter(savedState.character);
        setInventory(savedState.inventory);
        setGamePhase(GamePhase.PLAYING);
    }, []);

    const handleSaveGame = useCallback(async () => {
        if (!chatSession || storyLog.length === 0) return;
        try {
            const history = await chatSession.getHistory();
            saveGameState({ storyLog, fullWorldData, worldSummary, settings, character, inventory, chatHistory: history });
            setHasSavedGame(true);
        } catch (error) {
            console.error("Failed to save game state:", error);
        }
    }, [chatSession, storyLog, fullWorldData, worldSummary, settings, character, inventory]);
    
    useEffect(() => {
        // Autosave
        const lastEntry = storyLog[storyLog.length - 1];
        if (gamePhase === GamePhase.PLAYING && lastEntry?.type === 'ai' && !lastEntry.isStreaming) {
            handleSaveGame();
        }
    }, [storyLog, gamePhase, handleSaveGame]);
    
    const handleRegenerateResponse = useCallback(() => {
        if (!previousGameState) return;
        const lastPlayerAction = [...storyLog].reverse().find(e => e.type === 'player')?.content;
        if (!lastPlayerAction) return;
        
        loadGameFromState(previousGameState);
        // Using a timeout to ensure state is updated before re-running the action
        setTimeout(() => handlePlayerAction(lastPlayerAction), 50);
    }, [storyLog, previousGameState, loadGameFromState, handlePlayerAction]);

    const latestSceneTag = useMemo(() => {
        return [...storyLog].reverse().find(e => e.type === 'ai' && e.sceneTag)?.sceneTag;
    }, [storyLog]);

    const GameUI = () => (
        <main className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 h-[85vh]">
            <StatusSidebar 
                character={character}
                inventory={inventory}
                isImageLoading={isCharacterImageLoading}
                onRegenerate={() => handleUpdateCharacterImage(character.description)}
                apiStatus={apiStatus}
                settings={settings}
            />
            <div className="flex-grow h-full flex flex-col bg-slate-800 p-4 sm:p-6 rounded-xl shadow-2xl border border-slate-700">
                <div className="flex-grow overflow-y-auto mb-4 pr-4 -mr-4 custom-scrollbar" ref={logEndRef}>
                    {storyLog.map((entry, index) =>
                      entry.type === 'ai' ? (
                        <StoryBlock 
                          key={index} entry={entry} settings={settings}
                          onRegenerateResponse={handleRegenerateResponse}
                          isLastEntry={index === storyLog.map(e => e.type).lastIndexOf('ai')}
                          canRegenerate={!!previousGameState}
                          onRegenerateImage={async () => {
                              if (!entry.imgPrompt) return;
                              setStoryLog(log => log.map((e, i) => i === index ? {...e, isImageLoading: true} : e));
                              const newImageUrl = await generateImage(entry.imgPrompt, settings.artStyle, '16:9');
                              setStoryLog(log => log.map((e, i) => i === index ? {...e, imageUrl: newImageUrl, isImageLoading: false} : e));
                          }}
                        />
                      ) : (
                        <div key={index} className="mb-8 animate-fade-in flex justify-end">
                            <div className="max-w-[80%] bg-indigo-600/40 p-4 rounded-lg"><p className="text-indigo-100 italic">{entry.content}</p></div>
                        </div>
                      )
                    )}
                    {error && <div className="text-red-400 p-4 bg-red-900/50 rounded-md">{error}</div>}
                    <div ref={logEndRef} />
                </div>
                <div className="flex-shrink-0 mt-auto pt-4 border-t border-slate-700">
                    <ChoiceAndInputPanel />
                </div>
            </div>
        </main>
    );
    
    const logEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [storyLog]);

    const ChoiceAndInputPanel = () => {
        const [playerInput, setPlayerInput] = useState('');
        const choices = storyLog[storyLog.length - 1]?.choices || [];

        useEffect(() => {
            const handleKeyPress = (e: KeyboardEvent) => {
                const keyNum = parseInt(e.key);
                if (keyNum >= 1 && keyNum <= choices.length) {
                    handlePlayerAction(choices[keyNum - 1]);
                }
            };
            window.addEventListener('keydown', handleKeyPress);
            return () => window.removeEventListener('keydown', handleKeyPress);
        }, [choices, handlePlayerAction]);

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (playerInput.trim()) {
                handlePlayerAction(playerInput);
                setPlayerInput('');
            }
        };

        return (
            <>
                {choices.length > 0 &&
                    <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {choices.map((choice, i) => <button key={i} onClick={() => handlePlayerAction(choice)} className="text-left bg-slate-700/80 p-3 rounded-lg hover:bg-indigo-600 transition-all"><span className="text-xs font-mono bg-slate-800 rounded px-1.5 py-0.5 mr-2">{i+1}</span>{choice}</button>)}
                    </div>
                }
                <div className="flex items-center gap-2">
                    <form onSubmit={handleSubmit} className="flex-grow flex items-center gap-2">
                        <input type="text" value={playerInput} onChange={e => setPlayerInput(e.target.value)} placeholder="What do you do?" disabled={gamePhase !== GamePhase.PLAYING} className="flex-grow bg-slate-900 border border-slate-600 rounded-lg p-3 disabled:bg-slate-700" autoFocus />
                        <button type="submit" disabled={gamePhase !== GamePhase.PLAYING || !playerInput.trim()} className="bg-indigo-600 font-bold py-3 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500">Send</button>
                    </form>
                    <button onClick={() => previousGameState && loadGameFromState(previousGameState)} disabled={!previousGameState} title="Undo" className="p-3 bg-slate-600 rounded-lg hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8a5 5 0 000-10H9" /></svg>
                    </button>
                     <button onClick={() => setIsSettingsModalOpen(true)} title="Settings" className="p-3 bg-slate-600 rounded-lg hover:bg-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <button onClick={() => { clearGameState(); window.location.reload(); }} title="Restart Game" className="p-3 bg-red-800/80 rounded-lg hover:bg-red-700">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                </div>
            </>
        );
    };
    
    const backgroundUrl = useMemo(() => {
        if (!settings.dynamicBackgrounds || !latestSceneTag) return '';
        // Using an external service for generic background images
        return `https://source.unsplash.com/1600x900/?${latestSceneTag}`;
    }, [latestSceneTag, settings.dynamicBackgrounds]);

    const renderContent = () => {
        switch (gamePhase) {
            case GamePhase.SETUP:
                return <SetupScreen onStart={handleStartGame} onContinue={() => loadGameFromState(loadGameState())} onLoadFromFile={(file) => { const reader = new FileReader(); reader.onload = (e) => loadGameFromState(JSON.parse(e.target?.result as string)); reader.readAsText(file); }} hasSavedGame={hasSavedGame} />;
            case GamePhase.LOADING:
                 return <div className="flex items-center justify-center h-[85vh]"><div className="flex items-center space-x-2"><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:'0.15s'}}></div><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:'0.3s'}}></div><span className="text-slate-400 font-serif">{loadingMessage}</span></div></div>;
            case GamePhase.PLAYING:
                 return <GameUI />;
            case GamePhase.ERROR:
                 return <div className="text-red-400 p-4 bg-red-900/50 rounded-md"><h2>An Error Occurred</h2><p>{error}</p><button onClick={() => { clearGameState(); window.location.reload(); }} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Start Over</button></div>;
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8">
             <div id="background-container" style={{ backgroundImage: `url(${backgroundUrl})`, transition: 'background-image 1.5s ease-in-out' }} className="fixed inset-0 bg-cover bg-center filter blur-sm scale-110 opacity-20" />
            <header className="text-center w-full max-w-7xl mx-auto mb-6"><h1 className="text-4xl sm:text-5xl font-bold text-indigo-400 font-serif">CYOA Game Master</h1></header>
            
            {renderContent()}
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} settings={settings} onSettingsChange={setSettings} />
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
