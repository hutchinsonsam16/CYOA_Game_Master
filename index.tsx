
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
4.  **skills**: If skills are not specified, generate a list of 3-5 relevant skills. If skills are provided, you can add 1-2 more thematically appropriate skills. The final output must be a single string in the format "Skill Name: Value, Another Skill: Value" with values between 5 and 20.
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

const SetupScreen: React.FC<{
  onStart: (worldInfo: WorldInfoEntry[], characterInput: CharacterInput, initialPrompt: string, settings: Settings) => void;
  onContinue: () => void;
  onLoadFromFile: (file: File) => void;
  hasSavedGame: boolean;
}> = ({ onStart, onContinue, onLoadFromFile, hasSavedGame }) => {
  const [worldInfo, setWorldInfo] = useState<WorldInfoEntry[]>([{ key: 'Main Lore', content: '' }]);
  const [openWorldEntry, setOpenWorldEntry] = useState<number | null>(0);
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [characterClass, setCharacterClass] = useState('');
  const [alignment, setAlignment] = useState('True Neutral');
  const [backstory, setBackstory] = useState('');
  const [skills, setSkills] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState<number | null>(null);
  const [isStructuring, setIsStructuring] = useState(false);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWorldDataValid || !characterPrompt.trim() || !initialPrompt.trim() || isStructuring) return;
    const characterInput: CharacterInput = { description: characterPrompt, characterClass, alignment, backstory, skills };
    onStart(worldInfo, characterInput, initialPrompt, settings);
  };
  
  const handleEnhanceWorldEntry = async (index: number) => {
    setIsEnhancing(index);
    const enhanced = await enhanceWorldEntry(worldInfo[index].content);
    updateWorldInfo(index, 'content', enhanced);
    setIsEnhancing(null);
  }

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
    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target?.result as string;
        if (file.name.endsWith('.json')) {
            try {
                const jsonData = JSON.parse(content);
                if (Array.isArray(jsonData) && jsonData.every(item => typeof item.key === 'string' && typeof item.content === 'string')) {
                    setWorldInfo(jsonData);
                    setOpenWorldEntry(0);
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
                setWorldInfo(structuredEntries);
                setOpenWorldEntry(0);
            } else {
                 if (!window.confirm("This appears to be an unstructured lore file. Would you like to use AI to automatically organize it into categories? This may take a moment.")) {
                    const newKey = file.name.replace(/\.(txt|md)$/, '');
                    setWorldInfo([{ key: newKey, content }]); // Load as single entry if user declines
                    return;
                }
                
                setIsStructuring(true);
                try {
                    const structuredData = await structureWorldDataWithAI(content);
                    if (structuredData.length > 0) {
                        setWorldInfo(structuredData);
                        setOpenWorldEntry(0);
                    } else {
                        alert("AI structuring failed. Loading content as a single entry.");
                        const newKey = file.name.replace(/\.(txt|md)$/, '');
                        setWorldInfo([{ key: newKey, content }]);
                    }
                } catch (error) {
                    alert("An error occurred during AI structuring. Loading content as a single entry.");
                    const newKey = file.name.replace(/\.(txt|md)$/, '');
                    setWorldInfo([{ key: newKey, content }]);
                } finally {
                    setIsStructuring(false);
                }
            }
        } else {
            alert('Please select a .json, .txt, or .md file.');
        }
    };
    reader.readAsText(file);
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
                    <h3 className="text-xl font-semibold text-indigo-300">1. Build Your World Anvil</h3>
                     <div className="flex items-center gap-4">
                        <input type="file" ref={worldFileInputRef} onChange={(e) => e.target.files && handleLoadWorldFromFile(e.target.files[0])} className="hidden" accept=".txt,.md,.json" />
                        <button type="button" onClick={() => worldFileInputRef.current?.click()} className="text-xs font-semibold text-sky-300 hover:text-sky-200">Load from File</button>
                    </div>
                </div>
                {isStructuring && (
                    <div className="my-2 text-center p-3 bg-slate-900 rounded-lg border border-slate-700">
                        <div className="flex items-center justify-center space-x-2">
                            <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <span className="text-indigo-300 font-semibold">AI is organizing your world lore...</span>
                        </div>
                    </div>
                )}
                <div className={`space-y-2 bg-slate-900/50 border border-slate-700 rounded-lg p-2 ${isStructuring ? 'opacity-50 pointer-events-none' : ''}`}>
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
                                        <button type="button" onClick={() => handleEnhanceWorldEntry(index)} disabled={isEnhancing !== null || !entry.content.trim()} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500">{isEnhancing === index ? 'Enhancing...' : 'Enhance with AI ✨'}</button>
                                        <button type="button" onClick={() => removeWorldInfoEntry(index)} className="text-xs font-semibold text-red-400 hover:text-red-300">Delete Entry</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={addWorldInfoEntry} className="w-full bg-slate-700/50 text-slate-300 font-semibold py-2 rounded hover:bg-slate-700 transition">Add Lore Entry</button>
                </div>
                 <p className="text-xs text-slate-500 mt-1">Create distinct entries for locations, factions, history, etc. For large worlds, an initial summary will be generated on game start.</p>
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
            <button type="submit" disabled={!isWorldDataValid || !characterPrompt.trim() || !initialPrompt.trim() || isStructuring} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 transition-all text-lg">Start New Adventure</button>
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 w-full max-w-3xl h-[80vh] rounded-lg shadow-2xl border border-slate-700 p-6 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center flex-shrink-0 mb-4"><h2 className="text-2xl font-bold text-indigo-300 font-serif">Game Log</h2><button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">&times;</button></div>
                <div ref={scrollRef} className="flex-grow overflow-y-auto custom-scrollbar pr-2 -mr-2 space-y-4">
                    {storyLog.map((entry, index) => (
                        <div key={index}>
                            {entry.type === 'player' ? (
                                <div className="flex justify-end"><div className="bg-indigo-600/40 p-3 rounded-lg max-w-[80%]"><p className="text-indigo-100 italic">{entry.content}</p></div></div>
                            ) : (
                                <div className="bg-slate-700/30 p-3 rounded-lg"><ReactMarkdown children={entry.content} remarkPlugins={[remarkGfm]} components={{ p: ({node, ...props}) => <p className="text-slate-200 text-sm mb-2 last:mb-0" {...props} /> }} /></div>
                            )}
                        </div>
                    ))}
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
                gamePhase: GamePhase.LOADING,
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
}> = ({ isAITurn, choices, onPlayerAction, canUndo, onUndo, onOpenSettings, onOpenLog, onNewGame }) => {
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
                 <button onClick={onOpenSettings} title="Settings" disabled={isAITurn} className="p-3 bg-slate-600 rounded-lg hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
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
}> = ({ state, previousGameState, onPlayerAction, onRegenerateResponse, onUpdateCharacterImage, onUpdateSceneImage, onUndo, onOpenSettings, onOpenLog, onNewGame, onOpenWorldKnowledge }) => {
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
    
    const activeChatSettings = useRef<Settings>(state.settings);

    // Create a ref to hold the latest state, setters, and other values needed by callbacks.
    // This avoids stale closures in async functions without needing massive dependency arrays.
    const callbackDependencies = useRef({
      state,
      chatSession,
      setPreviousGameState,
      dispatch,
      activeChatSettings
    });

    // Keep the ref updated on every render with the latest values.
    useEffect(() => {
        callbackDependencies.current = {
            state,
            chatSession,
            setPreviousGameState,
            dispatch,
            activeChatSettings
        };
    });

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

    const processFinalResponse = useCallback(async (responseText: string) => {
        const { state } = callbackDependencies.current;
        const tagRegex = /\[(img-prompt|char-img-prompt|update-backstory|scene-tag)\](.*?)\[\/\1\]/gs;
        const choiceRegex = /\[choice\](.*?)\[\/choice\]/g;
        const itemRegex = /\[(add-item|remove-item)\](.*?)\[\/\1\]/g;
        const skillRegex = /\[update-skill\](.*?)\|(.*?)\[\/update-skill\]/g;

        let content = responseText;
        const result: any = { addedItems: [], removedItems: [], skillUpdates: {} };

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
        
        [...responseText.matchAll(skillRegex)].forEach(match => {
            const [_, name, value] = match;
            const numValue = parseInt(value.trim(), 10);
            if(name && !isNaN(numValue)) {
                result.skillUpdates[name.trim()] = numValue;
            }
        });
        
        content = content.replace(itemRegex, '').replace(skillRegex, '').trim();
        result.content = content;

        if (result.imgPrompt && state.settings.generateSceneImages) {
            result.imageUrl = await generateImage(result.imgPrompt, state.settings.artStyle, '16:9');
        }
        
        return result;
    }, []);
    
    const handleUpdateCharacterImage = useCallback(async (description: string) => {
        const { state, dispatch } = callbackDependencies.current;
        dispatch({ type: 'UPDATE_CHARACTER_IMAGE_STATUS', payload: true });
        
        let newPortrait: CharacterPortrait = { prompt: description };
        if (state.settings.generateCharacterPortraits) {
            const fullPrompt = `Cinematic character portrait of ${description}. Focus on detailed facial features, expressive lighting, high-quality rendering.`;
            newPortrait.url = await generateImage(fullPrompt, state.settings.artStyle, '1:1');
        }
        
        dispatch({ type: 'UPDATE_CHARACTER', payload: { description, portraits: [...state.character.portraits, newPortrait] } });
        dispatch({ type: 'UPDATE_CHARACTER_IMAGE_STATUS', payload: false });
    }, []);

    const handlePlayerAction = useCallback(async (action: string, session?: Chat) => {
        const { state, chatSession, setPreviousGameState, dispatch } = callbackDependencies.current;
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
            
            const finalAiEntry: StoryEntry = { type: 'ai', content: processed.content || '', imageUrl: processed.imageUrl, imgPrompt: processed.imgPrompt, choices: processed.choices, sceneTag: processed.sceneTag, isImageLoading: false, isStreaming: false };
            dispatch({ type: 'FINISH_TURN', payload: { entry: finalAiEntry, character: characterUpdates, inventory: newInventory, skillUpdates: processed.skillUpdates }});

        } catch (e) {
            console.error(e);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to get a response from the Game Master. Please try again.' });
        }
    }, [processFinalResponse, handleUpdateCharacterImage]);

    const handleStartGame = useCallback(async (worldInfo: WorldInfoEntry[], characterInput: CharacterInput, initialPrompt: string, newSettings: Settings) => {
        dispatch({ type: 'SET_PHASE', payload: GamePhase.LOADING });
        try {
            dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'Condensing world knowledge...' });
            const worldDataString = formatWorldInfoToString(worldInfo);
            const summary = worldDataString.length > 10000 ? await summarizeWorldData(worldInfo) : worldDataString;
            
            dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'Fleshing out your character...' });
            const generatedDetails = await generateCharacterDetails(characterInput);
            
            const finalCharacterInput = {
                ...characterInput,
                characterClass: generatedDetails.characterClass || characterInput.characterClass,
                alignment: generatedDetails.alignment || characterInput.alignment,
                backstory: generatedDetails.backstory || characterInput.backstory,
                skills: generatedDetails.skills || characterInput.skills,
            };

            const parsedSkills: Record<string, number> = {};
            if (finalCharacterInput.skills) {
                finalCharacterInput.skills.split(',').forEach(pair => {
                    const [key, value] = pair.split(':');
                    if(key && value && !isNaN(parseInt(value.trim(), 10))) {
                        parsedSkills[key.trim()] = parseInt(value.trim(), 10);
                    }
                });
            }

            const newCharacter: Character = {
                description: finalCharacterInput.description,
                class: finalCharacterInput.characterClass || 'Adventurer',
                alignment: finalCharacterInput.alignment || 'True Neutral',
                backstory: finalCharacterInput.backstory || 'A mysterious past awaits.',
                portraits: [],
                skills: parsedSkills,
            };

            dispatch({ type: 'START_NEW_GAME', payload: { worldInfo, worldSummary: summary, character: newCharacter, settings: newSettings } });
            activeChatSettings.current = newSettings;
            
            dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'Generating character portrait...' });
            await handleUpdateCharacterImage(finalCharacterInput.description);
            
            dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'The Game Master is preparing your story...' });
            const chat = initializeChat(summary, newCharacter, newSettings);
            if(!chat) throw new Error("Failed to initialize chat session.");
            setChatSession(chat);
            
            await handlePlayerAction(initialPrompt, chat);
        } catch (e) {
            console.error(e);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to start the game. Please check your API key and try again.' });
        }
    }, [handlePlayerAction, handleUpdateCharacterImage]);
    
    const loadGameFromState = useCallback((savedState: SavedGameState | null) => {
        if (!savedState) return;
        const chat = initializeChat(savedState.worldSummary, savedState.character, savedState.settings, savedState.chatHistory);
        if (!chat) {
            dispatch({ type: 'SET_ERROR', payload: "Failed to re-initialize chat from save." });
            return;
        }
        setChatSession(chat);
        dispatch({ type: 'LOAD_GAME', payload: savedState });
        activeChatSettings.current = savedState.settings;
    }, []);

    const handleSaveGame = useCallback(async () => {
        const { state, chatSession } = callbackDependencies.current;
        if (!chatSession || state.storyLog.length === 0) return;
        try {
            const history = await chatSession.getHistory();
            saveGameState({ ...state, chatHistory: history });
            dispatch({ type: 'SET_HAS_SAVED_GAME', payload: true });
        } catch (error) {
            console.error("Failed to save game state:", error);
        }
    }, []);
    
    useEffect(() => {
        const lastEntry = state.storyLog[state.storyLog.length - 1];
        if (state.gamePhase === GamePhase.PLAYING && lastEntry?.type === 'ai' && !lastEntry.isStreaming) {
            handleSaveGame();
        }
    }, [state.storyLog, state.gamePhase, handleSaveGame]);
    
    const handleRegenerateResponse = useCallback(() => {
        if (!previousGameState || state.gamePhase === GamePhase.LOADING) return;
        const lastPlayerAction = [...previousGameState.storyLog].reverse().find(e => e.type === 'player');
        if (!lastPlayerAction) return;
        
        loadGameFromState(previousGameState);
        setTimeout(() => handlePlayerAction(lastPlayerAction.content), 50);
    }, [previousGameState, state.gamePhase, loadGameFromState, handlePlayerAction]);

    const latestSceneTag = useMemo(() => {
        return [...state.storyLog].reverse().find(e => e.type === 'ai' && e.sceneTag)?.sceneTag;
    }, [state.storyLog]);

    const handleUpdateSceneImage = useCallback(async (index: number, prompt: string) => {
        const { state } = callbackDependencies.current;
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { index, isLoading: true }});
        const newImageUrl = await generateImage(prompt, state.settings.artStyle, '16:9');
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { index, imageUrl: newImageUrl, isLoading: false }});
    }, []);
    
    const handleNewGame = useCallback(() => {
        if (window.confirm('Are you sure you want to start a new game? All current progress will be lost.')) {
            clearGameState();
            window.location.reload();
        }
    }, []);

    const renderContent = () => {
        switch (state.gamePhase) {
            case GamePhase.SETUP:
                return <SetupScreen onStart={handleStartGame} onContinue={() => loadGameFromState(loadGameState())} onLoadFromFile={(file) => { const reader = new FileReader(); reader.onload = (e) => loadGameFromState(JSON.parse(e.target?.result as string)); reader.readAsText(file); }} hasSavedGame={state.hasSavedGame} />;
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
                 />;
            case GamePhase.ERROR:
                 return <div className="text-red-400 p-4 bg-red-900/50 rounded-md"><h2>An Error Occurred</h2><p>{state.error}</p><button onClick={() => { clearGameState(); window.location.reload(); }} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Start Over</button></div>;
        }
    }
    
    const backgroundUrl = useMemo(() => {
        if (!state.settings.dynamicBackgrounds || !latestSceneTag) return '';
        return `https://source.unsplash.com/1600x900/?${latestSceneTag}`;
    }, [latestSceneTag, state.settings.dynamicBackgrounds]);


    return (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8">
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
