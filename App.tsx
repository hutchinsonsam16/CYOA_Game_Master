import React, { useState, useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  GamePhase, GameMasterMode,
  type AiServiceMode, type WorldInfoEntry, type StoryEntry, type CharacterInput, type Character,
  type CharacterPortrait, type InventoryItem, type NPC, type SavedGameState, type Settings, type AppState, type Action
} from './types';

import { 
  aiService, artStyles, alignments, buildSystemInstruction, enhanceWorldEntry, structureWorldDataWithAI, 
  generateCharacterDetails, generateCharacterFlavor, generateImage, retrieveRelevantSnippets, formatWorldInfoToString, summarizeWorldData
} from './services/geminiService';
import { saveGameState, loadGameState, clearGameState } from './services/storageService';

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
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isWorldToolsModalOpen, setIsWorldToolsModalOpen] = useState(false);
  const isApiKeyAvailable = !!process.env.API_KEY;

  const [settings, setSettings] = useState<Settings>({
      artStyle: artStyles['Cinematic Film'],
      gmMode: GameMasterMode.BALANCED,
      generateSceneImages: true,
      generateCharacterPortraits: true,
      dynamicBackgrounds: true,
      aiServiceMode: isApiKeyAvailable ? 'GEMINI_API' : 'LOCAL',
  });
  const saveFileInputRef = useRef<HTMLInputElement>(null);
  const worldFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isApiKeyAvailable && settings.aiServiceMode === 'GEMINI_API') {
        setSettings(s => ({ ...s, aiServiceMode: 'LOCAL' }));
    }
  }, [isApiKeyAvailable, settings.aiServiceMode]);

  const isWorldDataValid = useMemo(() => worldInfo.some(entry => entry.key.trim() && entry.content.trim()), [worldInfo]);
  const isApiMode = useMemo(() => settings.aiServiceMode === 'GEMINI_API' && isApiKeyAvailable, [settings.aiServiceMode, isApiKeyAvailable]);
  const isBusy = isFileLoading || isStructuringEntry !== null || isEnhancing !== null;

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
        if (structuredData && structuredData.length > 0) {
            setWorldInfo(prev => {
                const newInfo = [...prev];
                newInfo.splice(index, 1, ...structuredData);
                return newInfo;
            });
        } else {
            alert("AI structuring failed to produce categories.");
        }
    } catch (e: any) {
        alert("An error occurred during AI structuring.");
    } finally {
        setIsStructuringEntry(null);
    }
  }
  
  const processLoadedWorld = useCallback(async (entries: WorldInfoEntry[]) => {
      setWorldInfo(entries);
      setOpenWorldEntry(entries.length > 0 ? 0 : null);
      if(isApiMode) {
        const fullText = formatWorldInfoToString(entries);
        if (fullText.length > 10000) { // Auto-summarize large texts
            try {
                const summary = await summarizeWorldData(entries);
                setWorldSummary(summary);
            } catch { setWorldSummary("Failed to generate summary.") }
        } else {
            setWorldSummary(null);
        }
      }
  }, [isApiMode]);

  const addWorldInfoEntry = () => { setWorldInfo(prev => [...prev, { key: '', content: '' }]); setOpenWorldEntry(worldInfo.length); };
  const updateWorldInfo = (index: number, field: 'key' | 'content', value: string) => { setWorldInfo(prev => prev.map((entry, i) => i === index ? { ...entry, [field]: value } : entry)); };
  const removeWorldInfoEntry = (index: number) => {
    if (worldInfo.length > 1) setWorldInfo(prev => prev.filter((_, i) => i !== index));
    else setWorldInfo([{ key: 'Main Lore', content: '' }]);
    if (openWorldEntry === index) setOpenWorldEntry(null);
  };
  
  const handleLoadWorldFromFile = useCallback(async (file: File) => {
    if (!file) return;
    setIsFileLoading(true);
    try {
        const content = await file.text();
        const newKey = file.name.replace(/\.(txt|md|json)$/i, '');

        if (file.name.endsWith('.json')) {
            try {
                const jsonData = JSON.parse(content);
                if (Array.isArray(jsonData) && jsonData.every(item => typeof item.key === 'string' && typeof item.content === 'string')) {
                    await processLoadedWorld(jsonData);
                } else {
                    alert('Invalid JSON structure for world data. Expected an array of {key: string, content: string}.');
                }
            } catch (err) { alert('Failed to parse JSON file.'); }
        } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
            const headerRegex = /^(#{1,6})\s+(.*)$/gm;
            const matches = [...content.matchAll(headerRegex)];
            if (matches.length > 1) { // Process as structured if multiple headers found
                const structuredEntries: WorldInfoEntry[] = [];
                for (let i = 0; i < matches.length; i++) {
                    const key = matches[i][2].trim();
                    const startIndex = matches[i].index! + matches[i][0].length;
                    const endIndex = i + 1 < matches.length ? matches[i + 1].index! : content.length;
                    const entryContent = content.substring(startIndex, endIndex).trim();
                    if (key && entryContent) structuredEntries.push({ key, content: entryContent });
                }
                await processLoadedWorld(structuredEntries);
            } else { // Process as a single unstructured block
                await processLoadedWorld([{ key: newKey, content, isUnstructured: true }]);
            }
        } else {
            alert('Please select a .json, .txt, or .md file.');
        }
    } catch (e: any) {
        alert((e as Error).message);
    } finally {
        setIsFileLoading(false);
    }
  }, [processLoadedWorld]);

  const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
  };

  return (
    <div className="w-full max-w-3xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700 animate-fade-in">
        <WorldDataToolsModal isOpen={isWorldToolsModalOpen} onClose={() => setIsWorldToolsModalOpen(false)} onLoadData={(data) => { processLoadedWorld(data); setIsWorldToolsModalOpen(false); }} isApiMode={isApiMode} />
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
                {isFileLoading && <ProgressBar text="Processing world file..." />}
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
                                            <button type="button" onClick={() => handleEnhanceWorldEntry(index)} disabled={isEnhancing !== null || !entry.content.trim() || isStructuringEntry !== null || !isApiMode} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500 disabled:cursor-not-allowed">{isEnhancing === index ? 'Enhancing...' : 'Enhance with AI ✨'}</button>
                                            {entry.isUnstructured && (
                                                <button type="button" onClick={() => handleStructureEntry(index)} disabled={isStructuringEntry !== null || isEnhancing !== null || !isApiMode} className="ml-4 text-xs font-semibold text-teal-300 hover:text-teal-200 disabled:text-slate-500 disabled:cursor-not-allowed">
                                                    {isStructuringEntry === index ? 'Structuring...' : 'Structure with AI 🤖'}
                                                </button>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => removeWorldInfoEntry(index)} className="text-xs font-semibold text-red-400 hover:text-red-300">Delete Entry</button>
                                    </div>
                                     {!isApiMode && <p className="text-xs text-slate-500 mt-1">AI world tools require Gemini API Mode.</p>}
                                </div>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={addWorldInfoEntry} className="w-full bg-slate-700/50 text-slate-300 font-semibold py-2 rounded hover:bg-slate-700 transition">Add Lore Entry</button>
                </div>
                 <p className="text-xs text-slate-500 mt-1">For large worlds (API Mode), a summary will be automatically generated when you load a file.</p>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-indigo-300 mb-2">2. Create Your Character</h3>
                <input type="text" value={characterPrompt} onChange={(e) => setCharacterPrompt(e.target.value)} placeholder="Describe your character's appearance..." className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 mb-4 focus:ring-2 focus:ring-indigo-500 transition" required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm text-slate-400 mb-1 block">Class (Optional)</label>
                        <input type="text" value={characterClass} onChange={(e) => setCharacterClass(e.target.value)} placeholder={isApiMode ? "Leave blank for AI generation" : "e.g., Rogue, Mage"} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 mb-1 block">Alignment</label>
                        <select value={alignment} onChange={(e) => setAlignment(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition">
                            {alignments.map(align => <option key={align} value={align}>{align}</option>)}
                        </select>
                    </div>
                </div>
                <div className="mt-4">
                    <label className="text-sm text-slate-400">Backstory (Optional{isApiMode && " - AI will generate or enhance"})</label>
                    <textarea value={backstory} onChange={(e) => setBackstory(e.target.value)} placeholder="Provide a few ideas, or leave blank for a surprise..." className="w-full h-24 bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 transition resize-none" />
                </div>
                <div className="mt-4">
                     <label className="text-sm text-slate-400">Skills (Optional{isApiMode && " - AI will generate or enhance"})</label>
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
                           <label className="block text-sm font-semibold text-slate-300 mb-1">AI Model</label>
                            <select value={settings.aiServiceMode} onChange={(e) => handleSettingChange('aiServiceMode', e.target.value as AiServiceMode)} className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-800 disabled:cursor-not-allowed">
                                <option value="LOCAL">Local Model (In-Browser)</option>
                                <option value="GEMINI_API" disabled={!isApiKeyAvailable}>Gemini API (Cloud)</option>
                            </select>
                            {!isApiKeyAvailable && <p className="text-xs text-slate-500 mt-1">Gemini API requires an API_KEY environment variable.</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1">GM Mode</label>
                            <select value={settings.gmMode} onChange={(e) => handleSettingChange('gmMode', e.target.value as GameMasterMode)} className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500">
                                {Object.values(GameMasterMode).map((mode) => (<option key={mode} value={mode}>{mode}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1">Art Style</label>
                            <select value={settings.artStyle} onChange={(e) => handleSettingChange('artStyle', e.target.value)} disabled={!isApiMode} className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-800 disabled:cursor-not-allowed">
                                {Object.entries(artStyles).map(([name, prompt]) => (<option key={name} value={prompt}>{name}</option>))}
                            </select>
                        </div>
                    </div>
                     <div className="pt-2 border-t border-slate-600/50 space-y-2">
                        <label className={`flex items-center justify-between ${!isApiMode ? 'cursor-not-allowed' : 'cursor-pointer'}`}><span className={`${!isApiMode ? 'text-slate-500' : 'text-slate-200'}`}>Generate Scene Images</span><input type="checkbox" checked={settings.generateSceneImages} onChange={e => handleSettingChange('generateSceneImages', e.target.checked)} disabled={!isApiMode} className="h-5 w-5 rounded border-slate-500 bg-slate-600 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed" /></label>
                        <label className={`flex items-center justify-between ${!isApiMode ? 'cursor-not-allowed' : 'cursor-pointer'}`}><span className={`${!isApiMode ? 'text-slate-500' : 'text-slate-200'}`}>Generate Character Portraits</span><input type="checkbox" checked={settings.generateCharacterPortraits} onChange={e => handleSettingChange('generateCharacterPortraits', e.target.checked)} disabled={!isApiMode} className="h-5 w-5 rounded border-slate-500 bg-slate-600 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed" /></label>
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
  const isApiMode = settings.aiServiceMode === 'GEMINI_API';
  
  return (
    <div className="mb-8 animate-fade-in group">
      { (entry.imageUrl || (entry.imgPrompt && entry.isImageLoading === false && settings.generateSceneImages === true)) &&
        <div className="relative mb-4">
          <div className="rounded-lg overflow-hidden border-2 border-slate-700/50 shadow-lg aspect-video bg-slate-900 flex items-center justify-center">
            {entry.imageUrl ? <img src={entry.imageUrl} alt="A scene from the story" className="w-full h-full object-cover" /> :
              <div className="p-4 text-center"><h3 className="font-semibold text-yellow-400">{isApiMode ? 'Image Generation Failed' : 'Scene Image Generation Disabled'}</h3><p className="text-slate-400 text-xs mt-1">{isApiMode ? 'The prompt may have been blocked by safety filters.' : 'Enable scene image generation in settings (requires API Mode).'}</p></div>}
          </div>
          {entry.isImageLoading && <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg"><svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>}
          {!entry.isImageLoading && entry.imgPrompt && settings.generateSceneImages && isApiMode && <button onClick={onRegenerateImage} className="absolute bottom-3 right-3 bg-indigo-600/80 text-white text-xs font-bold py-1 px-3 rounded-full hover:bg-indigo-700 backdrop-blur-sm shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">↻ Regenerate</button>}
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

const NpcDisplay: React.FC<{ npc: NPC }> = ({ npc }) => {
    const hpPercentage = (npc.hp / npc.maxHp) * 100;
    const healthBarColor = hpPercentage > 50 ? 'bg-green-500' : hpPercentage > 20 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div className="bg-slate-700/50 p-3 rounded-lg text-sm group relative">
            <div className="flex justify-between items-center">
                <p className={`font-bold flex items-center gap-1.5 ${npc.isHostile ? 'text-red-300' : 'text-sky-300'}`}>
                    {npc.isHostile && <span title="Hostile">⚔️</span>}
                    <span>{npc.name}</span>
                </p>
                {npc.isHostile && <p className="text-xs font-mono text-slate-300">{npc.hp} / {npc.maxHp}</p>}
            </div>
            {npc.isHostile && (
                <div className="w-full bg-slate-600 rounded-full h-1.5 mt-1.5">
                    <div className={healthBarColor} style={{ width: `${hpPercentage}%`, height: '100%', borderRadius: 'inherit' }}></div>
                </div>
            )}
            <div className="absolute z-10 bottom-full mb-2 w-64 left-0 bg-slate-900 p-3 rounded-lg border border-slate-600 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <p className="text-slate-300 text-xs">{npc.description}</p>
            </div>
        </div>
    );
};

const StatusSidebar: React.FC<{
  character: Character;
  inventory: InventoryItem[];
  npcs: NPC[];
  isImageLoading: boolean;
  onRegenerate: () => void;
  onOpenWorldKnowledge: () => void;
  settings: Settings;
  onItemAction: (action: string) => void;
}> = React.memo(({ character, inventory, npcs, isImageLoading, onRegenerate, onOpenWorldKnowledge, settings, onItemAction }) => {
  const latestPortrait = character.portraits[character.portraits.length - 1];
  const [activeItem, setActiveItem] = useState<InventoryItem | null>(null);
  const inventoryRef = useRef<HTMLDivElement>(null);
  const isApiMode = settings.aiServiceMode === 'GEMINI_API' && !!process.env.API_KEY;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inventoryRef.current && !inventoryRef.current.contains(event.target as Node)) {
        setActiveItem(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-full lg:w-1/3 lg:max-w-sm flex-shrink-0 flex flex-col bg-slate-800 p-4 rounded-xl shadow-2xl border border-slate-700">
      <div className="flex justify-between items-center mb-2 border-b-2 border-slate-700 pb-2">
        <h2 className="text-xl font-bold text-indigo-300 font-serif">Character</h2>
      </div>

      <div className="group relative aspect-square w-full bg-slate-900 rounded-md flex items-center justify-center border border-slate-600 overflow-hidden">
        {isImageLoading ? <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20"><svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path></svg></div> :
         latestPortrait?.url ? <img src={latestPortrait.url} alt="Character portrait" className="w-full h-full object-cover" /> :
         <div className="p-4 text-center text-slate-500">{settings.generateCharacterPortraits && isApiMode ? 'No portrait generated.' : 'Character Portrait Generation Disabled.'}</div>
        }
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button onClick={onRegenerate} disabled={isImageLoading || !character.description || !settings.generateCharacterPortraits || !isApiMode} className="w-full bg-indigo-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 disabled:cursor-not-allowed transition">
          {settings.generateCharacterPortraits && isApiMode ? '↻ Portrait' : 'Portraits Off'}
        </button>
        <button onClick={onOpenWorldKnowledge} className="w-full bg-sky-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-sky-700 transition">Search World Lore</button>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar mt-4 pt-4 border-t-2 border-slate-700 space-y-4">
        {npcs.length > 0 && (
            <div>
                <h3 className="text-lg font-semibold text-slate-300 mb-2 font-serif">Scene Characters</h3>
                <div className="space-y-2">
                    {npcs.map(npc => <NpcDisplay key={npc.id} npc={npc} />)}
                </div>
            </div>
        )}
        <div><h3 className="text-sm font-semibold text-slate-400 uppercase">Appearance</h3><p className="text-sm text-slate-300 font-serif leading-relaxed">{character.description}</p></div>
        {inventory.length > 0 && 
            <div ref={inventoryRef}>
              <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Inventory</h3>
              <div className="flex flex-wrap gap-2">
                {inventory.map(item => (
                  <div key={item.name} className="relative">
                    <button 
                      onClick={() => setActiveItem(prev => prev?.name === item.name ? null : item)}
                      className="bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-full hover:bg-slate-600 transition-colors"
                    >
                      {item.name}
                    </button>
                    {activeItem?.name === item.name && (
                      <div className="absolute z-20 w-56 bg-slate-900 border border-slate-600 rounded-lg shadow-xl p-3 left-0 mt-2 animate-fade-in-up">
                        <p className="text-sm font-semibold text-white mb-1">{item.name}</p>
                        <p className="text-xs text-slate-300 mb-3 leading-relaxed">{item.description}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => { onItemAction(`I use the ${item.name}.`); setActiveItem(null); }} 
                            className="flex-1 bg-indigo-600 text-white text-xs font-bold py-1.5 px-2 rounded-md hover:bg-indigo-700 transition"
                          >
                            Use
                          </button>
                          <button 
                            onClick={() => { onItemAction(`I inspect the ${item.name}.`); setActiveItem(null); }} 
                            className="flex-1 bg-sky-600 text-white text-xs font-bold py-1.5 px-2 rounded-md hover:bg-sky-700 transition"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          }
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
    const isApiMode = settings.aiServiceMode === 'GEMINI_API' && !!process.env.API_KEY;
    
    const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        onSettingsChange({ [key]: value });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 w-full max-w-md rounded-lg shadow-2xl border border-slate-700 p-6 space-y-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-indigo-300 font-serif">Settings</h2><button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">&times;</button></div>
                <div>
                  <label className="block text-lg font-semibold text-indigo-300 mb-2">Art Style</label>
                  <select value={settings.artStyle} onChange={(e) => handleSettingChange('artStyle', e.target.value)} disabled={!isApiMode} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700">
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
                    <label className={`flex items-center justify-between ${!isApiMode ? 'cursor-not-allowed' : 'cursor-pointer'}`}><span className={!isApiMode ? 'text-slate-500' : 'text-slate-200'}>Generate Scene Images</span><input type="checkbox" checked={settings.generateSceneImages} disabled={!isApiMode} onChange={e => handleSettingChange('generateSceneImages', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed" /></label>
                    <label className={`flex items-center justify-between ${!isApiMode ? 'cursor-not-allowed' : 'cursor-pointer'}`}><span className={!isApiMode ? 'text-slate-500' : 'text-slate-200'}>Generate Character Portraits</span><input type="checkbox" checked={settings.generateCharacterPortraits} disabled={!isApiMode} onChange={e => handleSettingChange('generateCharacterPortraits', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed" /></label>
                    <label className="flex items-center justify-between cursor-pointer"><span className="text-slate-200">Enable Dynamic Backgrounds</span><input type="checkbox" checked={settings.dynamicBackgrounds} onChange={e => handleSettingChange('dynamicBackgrounds', e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500" /></label>
                </div>
                <p className="text-xs text-slate-400 text-center">AI Model can only be changed when starting a new game.</p>
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
        if (!isOpen) { setQuery(''); setResults([]); return; }
        if (query.trim().length < 3) { setResults([]); return; }
        const search = () => {
            const lowerCaseQuery = query.toLowerCase();
            const found = worldInfo.filter(entry => entry.key.toLowerCase().includes(lowerCaseQuery) || entry.content.toLowerCase().includes(lowerCaseQuery));
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
        } catch (e: any) { return text; }
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
    isApiMode: boolean;
}> = ({ isOpen, onClose, onLoadData, isApiMode }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [enhanceWithAI, setEnhanceWithAI] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedData, setProcessedData] = useState<WorldInfoEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) { setFiles([]); setEnhanceWithAI(false); setIsProcessing(false); setProcessedData(null); setError(null); }
    }, [isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setFiles(Array.from(e.target.files)); };

    const processAndMergeFiles = async () => {
        setIsProcessing(true);
        setError(null);
        setProcessedData(null);
        try {
            const allEntries: WorldInfoEntry[] = [];
            for (const file of files) {
                const content = await file.text();
                if (file.name.endsWith('.json')) {
                    try {
                        const jsonData = JSON.parse(content);
                        if (Array.isArray(jsonData) && jsonData.every(item => typeof item.key === 'string' && typeof item.content === 'string')) allEntries.push(...jsonData);
                        else throw new Error('Invalid JSON structure.');
                    } catch (e: any) { throw new Error(`Failed to parse ${file.name}: ${(e as Error).message}`); }
                } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
                    if (!isApiMode) {
                        allEntries.push({ key: file.name.replace(/\.(txt|md)$/, ''), content, isUnstructured: true });
                        continue;
                    }
                    const structuredEntries = await structureWorldDataWithAI(content);
                    if (!structuredEntries || structuredEntries.length === 0) throw new Error(`Structuring failed for ${file.name}.`);
                    
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
        } catch (e: any) { setError((e as Error).message); } finally { setIsProcessing(false); }
    };

    const handleDownload = () => {
        if (!processedData) return;
        const dataStr = JSON.stringify(processedData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'merged_world_data.json';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
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
                    <label className={`flex items-center gap-3 ${isApiMode ? 'cursor-pointer' : 'cursor-not-allowed'}`}><input type="checkbox" checked={enhanceWithAI} onChange={e => setEnhanceWithAI(e.target.checked)} disabled={!isApiMode} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-green-600 focus:ring-green-500 disabled:cursor-not-allowed" /><span className={!isApiMode ? 'text-slate-500' : ''}>Enhance text-based lore with AI ✨ (slower)</span></label>
                    {!isApiMode && <p className="text-xs text-slate-500">AI Structuring & Enhancing requires Gemini API Mode.</p>}
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
    useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [storyLog]);
    
    const parseContent = (text: string) => {
        const events: any[] = [];
        let cleanedText = text;
        const skillCheckRegex = /\[skill-check\](.*?)\[\/skill-check\]/gs;
        const combatRegex = /\[combat\](.*?)\[\/combat\]/gs;
        const parseDetails = (match: string) => { try { return Object.fromEntries(match.trim().split(',').map(s => { const [key, ...value] = s.split(':'); return [key.trim(), value.join(':').trim()]; })); } catch { return { raw: match }; } };
        cleanedText = cleanedText.replace(skillCheckRegex, (_, match) => { events.push({ type: 'skill-check', details: parseDetails(match) }); return ''; });
        cleanedText = cleanedText.replace(combatRegex, (_, match) => { events.push({ type: 'combat', details: parseDetails(match) }); return ''; });
        return { cleanedText: cleanedText.trim(), events };
    };
    
    const EventDisplay: React.FC<{ event: any }> = ({ event }) => {
        const { type, details } = event;
        if (type === 'skill-check') {
            const isSuccess = details.Result?.toLowerCase() === 'success';
            return <div className={`my-2 p-2 rounded-md border text-xs ${isSuccess ? 'bg-green-900/50 border-green-700/50 text-green-300' : 'bg-red-900/50 border-red-700/50 text-red-300'}`}><strong>SKILL CHECK: {details.Skill || 'N/A'}</strong> - Result: {details.Result || 'N/A'} (Target: {details.Target || '?'})</div>;
        }
        if (type === 'combat') {
            const isHit = details.Result?.toLowerCase() === 'hit';
            return <div className={`my-2 p-2 rounded-md border text-xs ${isHit ? 'bg-yellow-900/50 border-yellow-700/50 text-yellow-300' : 'bg-slate-700/50 border-slate-600/50 text-slate-300'}`}><strong>COMBAT: {details.Event || 'Action'}</strong> on {details.Target || 'Target'} - {isHit ? `HIT for ${details.Damage || '?'} dmg` : 'MISS'} (Roll: {details.Roll || '?'})</div>;
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
                        if (entry.type === 'player') { turnCounter++; isNewTurn = true; }
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

const ChoiceAndInputPanel: React.FC<{
    isAITurn: boolean;
    choices: string[];
    onActionSubmit: (action: string) => void;
    playerInput: string;
    setPlayerInput: (value: string) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    canUndo: boolean;
    onUndo: () => void;
    onOpenSettings: () => void;
    onOpenLog: () => void;
    onNewGame: () => void;
    onSaveGame: () => void;
    isSaving: boolean;
}> = ({ isAITurn, choices, onActionSubmit, playerInput, setPlayerInput, inputRef, canUndo, onUndo, onOpenSettings, onOpenLog, onNewGame, onSaveGame, isSaving }) => {

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (isAITurn) return;
            const keyNum = parseInt(e.key);
            if (keyNum >= 1 && keyNum <= choices.length) {
                onActionSubmit(choices[keyNum - 1]);
            }
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [choices, isAITurn, onActionSubmit]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (playerInput.trim()) {
            onActionSubmit(playerInput);
        }
    };

    return (
        <>
            {choices.length > 0 &&
                <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {choices.map((choice, i) => <button key={i} onClick={() => onActionSubmit(choice)} disabled={isAITurn} className="text-left bg-slate-700/80 p-3 rounded-lg hover:bg-indigo-600 transition-all disabled:bg-slate-700 disabled:cursor-not-allowed"><span className="text-xs font-mono bg-slate-800 rounded px-1.5 py-0.5 mr-2">{i+1}</span>{choice}</button>)}
                </div>
            }
            <div className="flex items-center gap-2">
                <form onSubmit={handleSubmit} className="flex-grow flex items-center gap-2">
                    <input ref={inputRef} type="text" value={playerInput} onChange={e => setPlayerInput(e.target.value)} placeholder={isAITurn ? "Game Master is thinking..." : "What do you do?"} disabled={isAITurn} className="flex-grow bg-slate-900 border border-slate-600 rounded-lg p-3 disabled:bg-slate-700" autoFocus />
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
    const [playerInput, setPlayerInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [state.storyLog]);

    const choices = state.storyLog[state.storyLog.length - 1]?.choices || [];
    const isAITurn = state.gamePhase === GamePhase.LOADING;

    const handleActionSubmit = (action: string) => {
        if (action.trim()) {
            onPlayerAction(action);
            setPlayerInput('');
        }
    };
    
    const handleItemAction = (action: string) => {
        setPlayerInput(action);
        inputRef.current?.focus();
    };

    return (
        <main className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 h-[85vh]">
            <StatusSidebar 
                character={state.character}
                inventory={state.inventory}
                npcs={state.npcs}
                isImageLoading={state.isCharacterImageLoading}
                onRegenerate={() => onUpdateCharacterImage(state.character.description)}
                onOpenWorldKnowledge={onOpenWorldKnowledge}
                settings={state.settings}
                onItemAction={handleItemAction}
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
                        onActionSubmit={handleActionSubmit}
                        playerInput={playerInput}
                        setPlayerInput={setPlayerInput}
                        inputRef={inputRef}
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
//  STATE MANAGEMENT (useReducer)
// ===================================================================================

const hasApiKey = !!process.env.API_KEY;
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
        aiServiceMode: hasApiKey ? 'GEMINI_API' : 'LOCAL',
    },
    character: { portraits: [], description: '', class: '', alignment: '', backstory: '', skills: {} },
    inventory: [],
    npcs: [],
    isCharacterImageLoading: false,
    loadingMessage: 'Loading...',
    hasSavedGame: false,
};

function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_PHASE': return { ...state, gamePhase: action.payload, error: action.payload === GamePhase.ERROR ? state.error : null };
        case 'SET_LOADING_MESSAGE': return { ...state, loadingMessage: action.payload };
        case 'START_NEW_GAME':
            clearGameState();
            return { ...initialState, ...action.payload, hasSavedGame: false, gamePhase: GamePhase.PLAYING, };
        case 'LOAD_GAME':
            const { storyLog, worldInfo, worldSummary, settings, character, inventory, npcs } = action.payload;
            return { ...state, storyLog, worldInfo, worldSummary, settings, character, inventory, npcs: npcs || [], gamePhase: GamePhase.PLAYING };
        case 'PLAYER_ACTION':
            const playerEntry: StoryEntry = { type: 'player', content: action.payload };
            const aiEntry: StoryEntry = { type: 'ai', content: '', isStreaming: state.settings.aiServiceMode === 'GEMINI_API', choices: [] };
            return { ...state, storyLog: [...state.storyLog, playerEntry, aiEntry], gamePhase: GamePhase.LOADING, error: null };
        case 'STREAM_CHUNK':
            const lastIndex = state.storyLog.length - 1;
            if (lastIndex >= 0 && state.storyLog[lastIndex].type === 'ai' && state.storyLog[lastIndex].isStreaming) {
                const newStoryLog = [...state.storyLog];
                newStoryLog[lastIndex] = { ...newStoryLog[lastIndex], content: newStoryLog[lastIndex].content + action.payload };
                return { ...state, storyLog: newStoryLog };
            }
            return state;
        case 'FINISH_TURN': {
            const finalLog = [...state.storyLog];
            finalLog[finalLog.length - 1] = { ...action.payload.entry, isStreaming: false };
            
            let currentNpcs = [...state.npcs];
            if (action.payload.npcUpdates) {
                const { created, updated, removed } = action.payload.npcUpdates;
                if (removed?.length) currentNpcs = currentNpcs.filter(npc => !removed.includes(npc.id));
                if (updated?.length) {
                    currentNpcs = currentNpcs.map(npc => {
                        const updateData = updated.find(u => u.id === npc.id);
                        return updateData ? { ...npc, ...updateData } : npc;
                    });
                }
                if (created?.length) {
                    const existingIds = new Set(currentNpcs.map(n => n.id));
                    const newNpcs = created.filter(n => !existingIds.has(n.id));
                    currentNpcs.push(...newNpcs);
                }
            }

            return {
                ...state,
                storyLog: finalLog,
                character: (action.payload.character || action.payload.skillUpdates) ? { ...state.character, ...action.payload.character, skills: { ...state.character.skills, ...action.payload.skillUpdates } } : state.character,
                inventory: action.payload.inventory || state.inventory,
                npcs: currentNpcs,
                gamePhase: GamePhase.PLAYING,
            };
        }
        case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
        case 'UPDATE_CHARACTER': return { ...state, character: { ...state.character, ...action.payload } };
        case 'UPDATE_CHARACTER_IMAGE_STATUS': return { ...state, isCharacterImageLoading: action.payload };
        case 'UPDATE_SCENE_IMAGE': return { ...state, storyLog: state.storyLog.map((e, i) => i === action.payload.index ? {...e, imageUrl: action.payload.imageUrl, isImageLoading: action.payload.isLoading} : e) };
        case 'SET_ERROR': return { ...state, error: action.payload, gamePhase: GamePhase.ERROR };
        case 'SET_HAS_SAVED_GAME': return { ...state, hasSavedGame: action.payload };
        default: return state;
    }
}

// ===================================================================================
//  MAIN APP COMPONENT
// ===================================================================================

const App: React.FC = () => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const [previousGameState, setPreviousGameState] = useState<SavedGameState | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isWorldModalOpen, setIsWorldModalOpen] = useState(false);
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<string | null>(null);
    
    const savedTurnIndex = useRef<number | null>(null);
    const isApiMode = useMemo(() => state.settings.aiServiceMode === 'GEMINI_API' && !!process.env.API_KEY, [state.settings.aiServiceMode]);

    useEffect(() => {
        if (loadGameState()) {
            dispatch({ type: 'SET_HAS_SAVED_GAME', payload: true });
        }
        const apiKey = process.env.API_KEY;
        if (apiKey) {
            aiService.initializeGemini(apiKey).then(isValid => {
                if (!isValid) {
                    const currentState = loadGameState() || initialState;
                    if (currentState.settings.aiServiceMode === 'GEMINI_API') {
                        dispatch({ type: 'UPDATE_SETTINGS', payload: { aiServiceMode: 'LOCAL' } });
                        setNotification("Gemini API key is invalid. Switched to Local model.");
                        setTimeout(() => setNotification(null), 4000);
                    }
                }
            });
        }
    }, []);
    
    const handleUpdateCharacterImage = useCallback(async (description: string) => {
        if (!isApiMode || !state.settings.generateCharacterPortraits) return;
        dispatch({ type: 'UPDATE_CHARACTER_IMAGE_STATUS', payload: true });
        const fullPrompt = `Cinematic character portrait of ${description}. Focus on detailed facial features, expressive lighting, high-quality rendering.`;
        const url = await generateImage(fullPrompt, state.settings.artStyle, '1:1');
        const newPortrait: CharacterPortrait = { prompt: description, url };
        dispatch({ type: 'UPDATE_CHARACTER', payload: { description, portraits: [...state.character.portraits, newPortrait] } });
        dispatch({ type: 'UPDATE_CHARACTER_IMAGE_STATUS', payload: false });
    }, [isApiMode, state.settings.artStyle, state.character.portraits, state.settings.generateCharacterPortraits]);

    const processFinalResponse = useCallback(async (responseText: string) => {
        const tagRegex = /\[(img-prompt|char-img-prompt|update-backstory|background-prompt)\](.*?)\[\/\1\]/gs;
        const choiceRegex = /\[choice\](.*?)\[\/choice\]/g;
        const itemRegex = /\[(add-item|remove-item)\](.*?)\[\/\1\]/g;
        const skillRegex = /\[update-skill\](.*?)\|(.*?)\[\/update-skill\]/g;
        const npcRegex = /\[(create-npc|update-npc|remove-npc)\](.*?)\[\/\1\]/gs;
        
        let content = responseText;
        const result: any = { 
            addedItems: [], removedItems: [], skillUpdates: {},
            createdNpcs: [], updatedNpcs: [], removedNpcIds: []
        };

        content = content.replace(tagRegex, (_, tag, value) => {
            if (tag === 'img-prompt') result.imgPrompt = value.trim();
            else if (tag === 'char-img-prompt') result.newCharacterDescription = value.trim();
            else if (tag === 'update-backstory') result.newBackstoryEntry = value.trim();
            else if (tag === 'background-prompt') result.backgroundPrompt = value.trim();
            return '';
        });

        result.choices = [...content.matchAll(choiceRegex)].map(match => match[1].trim());
        content = content.replace(choiceRegex, '').trim();

        [...responseText.matchAll(itemRegex)].forEach(match => {
            const [_, tag, value] = match;
            if (tag === 'add-item') {
                const [name, description] = value.split('|').map(s => s.trim());
                if (name && description) result.addedItems.push({ name, description });
            } else if (tag === 'remove-item') { result.removedItems.push(value.trim()); }
        });
        
        [...responseText.matchAll(skillRegex)].forEach(match => {
            const [_, name, value] = match;
            const numValue = parseInt(value.trim(), 10);
            if(name && !isNaN(numValue)) result.skillUpdates[name.trim()] = numValue;
        });

        [...responseText.matchAll(npcRegex)].forEach(match => {
            const [_, tag, value] = match;
            try {
                const jsonData = JSON.parse(value);
                if (tag === 'create-npc') result.createdNpcs.push(jsonData);
                else if (tag === 'update-npc') result.updatedNpcs.push(jsonData);
                else if (tag === 'remove-npc') result.removedNpcIds.push(jsonData.id);
            } catch(e) { console.error(`Failed to parse NPC tag ${tag}:`, value, e); }
        });
        
        content = content.replace(itemRegex, '').replace(skillRegex, '').replace(npcRegex, '').trim();
        result.content = content;

        if (result.imgPrompt && isApiMode && state.settings.generateSceneImages) {
            result.imageUrl = await generateImage(result.imgPrompt, state.settings.artStyle, '16:9');
        }
        
        return result;
    }, [isApiMode, state.settings.generateSceneImages, state.settings.artStyle]);
    
    const handlePlayerAction = useCallback(async (action: string) => {
        if (!action.trim() || state.gamePhase === GamePhase.LOADING) return;

        if (state.storyLog.length > 0) {
            setPreviousGameState({ ...state, chatHistory: aiService.getHistory() });
        }
        
        const currentInventory = state.inventory.map(i => i.name).join(', ') || 'Empty';
        const currentSkills = Object.entries(state.character.skills).map(([name, value]) => `${name}: ${value}`).join(', ');
        const npcStateForPrompt = state.npcs.length > 0 ? `\n[CURRENT SCENE NPCS]\n${JSON.stringify(state.npcs)}` : '';
        const context = `\n---\n[CURRENT CHARACTER STATE]\nInventory: ${currentInventory}\nSkills: ${currentSkills}${npcStateForPrompt}\n---`;
        const relevantLore = retrieveRelevantSnippets(action, state.worldInfo);
        const loreSegment = relevantLore ? `\n\n[RELEVANT WORLD LORE FOR CONTEXT]\n${relevantLore}\n[/RELEVANT WORLD LORE FOR CONTEXT]` : '';
        const message = `${context}\n\nPlayer action: "${action}"${loreSegment}`;

        dispatch({ type: 'PLAYER_ACTION', payload: action });

        try {
            let fullResponseText = '';
            if (state.settings.aiServiceMode === 'GEMINI_API') {
                fullResponseText = await aiService.generateTextStream(message, (chunk) => {
                    dispatch({ type: 'STREAM_CHUNK', payload: chunk });
                });
            } else { // LOCAL MODE
                const systemInstruction = buildSystemInstruction(state.worldSummary, state.character, state.settings);
                const progressCallback = (progress: any) => {
                    let msg = progress.status;
                    if(progress.file) msg += `: ${progress.file}`;
                    if(progress.progress) msg += ` (${Math.round(progress.progress)}%)`;
                    dispatch({ type: 'SET_LOADING_MESSAGE', payload: msg });
                }
                fullResponseText = await aiService.generateText(systemInstruction, message, progressCallback);
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
                const removedSet = new Set(processed.removedItems);
                newInventory = [...state.inventory.filter(item => !removedSet.has(item.name)), ...processed.addedItems];
            }
            
            const finalAiEntry: StoryEntry = { type: 'ai', content: processed.content || fullResponseText, imageUrl: processed.imageUrl, imgPrompt: processed.imgPrompt, choices: processed.choices, backgroundPrompt: processed.backgroundPrompt, isImageLoading: !!(processed.imgPrompt && isApiMode && state.settings.generateSceneImages && !processed.imageUrl) };
            dispatch({ type: 'FINISH_TURN', payload: { 
                entry: finalAiEntry, 
                character: characterUpdates, 
                inventory: newInventory, 
                skillUpdates: processed.skillUpdates,
                npcUpdates: { created: processed.createdNpcs, updated: processed.updatedNpcs, removed: processed.removedNpcIds, }
            }});

        } catch (e: any) {
            console.error(e);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to get a response from the Game Master. Please try again.' });
        }
    }, [state, processFinalResponse, handleUpdateCharacterImage, isApiMode]);

    const handleStartGame = useCallback(async (worldInfo: WorldInfoEntry[], worldSummary: string | null, characterInput: CharacterInput, initialPrompt: string, settings: Settings) => {
        dispatch({ type: 'SET_PHASE', payload: GamePhase.LOADING });
        try {
            savedTurnIndex.current = null;
            dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'Building your world...' });
            const summary = worldSummary || formatWorldInfoToString(worldInfo);
            const initialParsedSkills: Record<string, number> = {};
            if (characterInput.skills) {
                characterInput.skills.split(',').forEach(pair => {
                    const [key, valueStr] = pair.split(':');
                    if (key && valueStr) { const valueNum = parseInt(valueStr.trim(), 10); if (!isNaN(valueNum)) initialParsedSkills[key.trim()] = valueNum; }
                });
            }
    
            const initialCharacter: Character = {
                description: characterInput.description, class: characterInput.characterClass || 'Adventurer', alignment: characterInput.alignment || 'True Neutral', backstory: characterInput.backstory || 'A mysterious past awaits...', portraits: [], skills: initialParsedSkills,
            };
    
            dispatch({ type: 'START_NEW_GAME', payload: { worldInfo, worldSummary: summary, character: initialCharacter, settings } });
    
            const systemInstruction = buildSystemInstruction(summary, initialCharacter, settings);
            aiService.startChat(settings.aiServiceMode, systemInstruction, []);
            
            dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'The story begins...' });
            handlePlayerAction(initialPrompt);
    
            if(settings.aiServiceMode === 'GEMINI_API' && !!process.env.API_KEY) {
                // Fire-and-forget character enhancement in the background
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, 100));
        
                    const [generatedDetails] = await Promise.all([
                        generateCharacterDetails(characterInput),
                        handleUpdateCharacterImage(initialCharacter.description) 
                    ]);
        
                    const finalCharacterInput = { ...characterInput, ...generatedDetails };
                    const enhancedParsedSkills: Record<string, number> = {};
                    if (finalCharacterInput.skills) {
                        finalCharacterInput.skills.split(',').forEach(pair => {
                            const [key, valueStr] = pair.split(':');
                            if (key && valueStr) { const valueNum = parseInt(valueStr.trim(), 10); if (!isNaN(valueNum)) enhancedParsedSkills[key.trim()] = valueNum; }
                        });
                    }
        
                    const characterUpdates: Partial<Character> = {
                        class: finalCharacterInput.characterClass || initialCharacter.class,
                        alignment: finalCharacterInput.alignment || initialCharacter.alignment,
                        backstory: finalCharacterInput.backstory || initialCharacter.backstory,
                        skills: Object.keys(enhancedParsedSkills).length > 0 ? { ...initialCharacter.skills, ...enhancedParsedSkills } : initialCharacter.skills,
                    };
                    dispatch({ type: 'UPDATE_CHARACTER', payload: characterUpdates });

                    const characterForFlavor = { ...initialCharacter, ...characterUpdates };
                    const flavor = await generateCharacterFlavor(characterForFlavor);
                    const flavorUpdates: Partial<Character> = { class: flavor.class || characterForFlavor.class };
                    if (flavor.quirk) flavorUpdates.backstory = `${characterForFlavor.backstory}\n\n**Quirk:** ${flavor.quirk}`;
                    if (flavor.class !== characterForFlavor.class || flavor.quirk) dispatch({ type: 'UPDATE_CHARACTER', payload: flavorUpdates });
                })();
            }
    
        } catch (e: any) {
            console.error(e);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to start the game. Please check your settings and try again.' });
        }
    }, [handlePlayerAction, handleUpdateCharacterImage]);
    
    const loadGameFromState = useCallback((savedState: SavedGameState | null) => {
        if (!savedState) return;
        savedTurnIndex.current = null;
        if (savedState.settings.aiServiceMode === 'GEMINI_API' && !process.env.API_KEY) {
            alert("This save requires a Gemini API key which is missing. Switching to local mode, which may affect story quality.");
            savedState.settings.aiServiceMode = 'LOCAL';
        }
        const systemInstruction = buildSystemInstruction(savedState.worldSummary, savedState.character, savedState.settings);
        aiService.startChat(savedState.settings.aiServiceMode, systemInstruction, savedState.chatHistory);
        dispatch({ type: 'LOAD_GAME', payload: savedState });
    }, []);

    const handleSaveGame = useCallback(async () => {
        if (state.storyLog.length === 0 || isSaving) return;
        setIsSaving(true);
        try {
            saveGameState({ ...state, chatHistory: aiService.getHistory() });
            dispatch({ type: 'SET_HAS_SAVED_GAME', payload: true });
            setNotification("Game progress saved!");
        } catch (error: any) {
            console.error("Failed to save game state:", error);
            setNotification("Error: Could not save game.");
        } finally {
            setTimeout(() => { setIsSaving(false); setNotification(null); }, 1500);
        }
    }, [isSaving, state]);
    
    useEffect(() => {
        const lastEntryIndex = state.storyLog.length - 1;
        const lastEntry = state.storyLog[lastEntryIndex];
        if (state.gamePhase === GamePhase.PLAYING && lastEntry?.type === 'ai' && !lastEntry.isStreaming && savedTurnIndex.current !== lastEntryIndex) {
            handleSaveGame();
            savedTurnIndex.current = lastEntryIndex;
        }
    }, [state.storyLog, state.gamePhase, handleSaveGame]);
    
    const handleRegenerateResponse = useCallback(() => {
        if (!previousGameState || state.gamePhase === GamePhase.LOADING) return;
        const lastPlayerAction = [...previousGameState.storyLog].reverse().find(e => e.type === 'player');
        if (!lastPlayerAction) return;
        
        loadGameFromState(previousGameState);
        setTimeout(() => handlePlayerAction(lastPlayerAction.content), 50);
    }, [previousGameState, state.gamePhase, loadGameFromState, handlePlayerAction]);

    const latestBackgroundPrompt = useMemo(() => {
        return [...state.storyLog].reverse().find(e => e.type === 'ai' && e.backgroundPrompt)?.backgroundPrompt;
    }, [state.storyLog]);

    const handleUpdateSceneImage = useCallback(async (index: number, prompt: string) => {
        if (!isApiMode) return;
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { index, isLoading: true }});
        const newImageUrl = await generateImage(prompt, state.settings.artStyle, '16:9');
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { index, imageUrl: newImageUrl, isLoading: false }});
    }, [isApiMode, state.settings.artStyle]);
    
    const handleNewGame = useCallback(() => {
        if (window.confirm('Are you sure you want to start a new game? All current progress will be lost.')) {
            clearGameState();
            window.location.reload();
        }
    }, []);
    
    const handleLoadFromFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedData = JSON.parse(e.target?.result as string);
                // Simple validation
                if(loadedData.storyLog && loadedData.character && loadedData.settings) {
                    loadGameFromState(loadedData);
                } else {
                    alert("Invalid save file structure.");
                }
            } catch {
                alert("Failed to parse save file.");
            }
        };
        reader.readAsText(file);
    }, [loadGameFromState]);

    const renderContent = () => {
        switch (state.gamePhase) {
            case GamePhase.SETUP:
                return <SetupScreen onStart={handleStartGame} onContinue={() => loadGameFromState(loadGameState())} onLoadFromFile={handleLoadFromFile} hasSavedGame={state.hasSavedGame} />;
            case GamePhase.LOADING:
                 if (state.storyLog.length > 0) { // Show game UI even while loading next turn
                     return <GameUI 
                        state={state} previousGameState={previousGameState} onPlayerAction={handlePlayerAction} onRegenerateResponse={handleRegenerateResponse} onUpdateCharacterImage={handleUpdateCharacterImage} onUpdateSceneImage={handleUpdateSceneImage} onUndo={() => previousGameState && loadGameFromState(previousGameState)} onOpenSettings={() => setIsSettingsModalOpen(true)} onOpenLog={() => setIsLogModalOpen(true)} onNewGame={handleNewGame} onOpenWorldKnowledge={() => setIsWorldModalOpen(true)} onSaveGame={handleSaveGame} isSaving={isSaving} />;
                 }
                 return <div className="flex items-center justify-center h-[85vh]"><div className="flex flex-col items-center space-y-2"><div className="flex items-center space-x-2"><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:'0.15s'}}></div><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:'0.3s'}}></div></div><span className="text-slate-400 font-serif text-center">{state.loadingMessage}</span></div></div>;
            case GamePhase.PLAYING:
                 return <GameUI 
                    state={state} previousGameState={previousGameState} onPlayerAction={handlePlayerAction} onRegenerateResponse={handleRegenerateResponse} onUpdateCharacterImage={handleUpdateCharacterImage} onUpdateSceneImage={handleUpdateSceneImage} onUndo={() => previousGameState && loadGameFromState(previousGameState)} onOpenSettings={() => setIsSettingsModalOpen(true)} onOpenLog={() => setIsLogModalOpen(true)} onNewGame={handleNewGame} onOpenWorldKnowledge={() => setIsWorldModalOpen(true)} onSaveGame={handleSaveGame} isSaving={isSaving} />;
            case GamePhase.ERROR:
                 return <div className="text-red-400 p-4 bg-red-900/50 rounded-md"><h2>An Error Occurred</h2><p>{state.error}</p><button onClick={() => { if(previousGameState) { loadGameFromState(previousGameState) } else { handleNewGame() } }} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Go Back</button></div>;
        }
    }
    
    const backgroundUrl = useMemo(() => {
        if (!state.settings.dynamicBackgrounds || !latestBackgroundPrompt) return '';
        return `https://source.unsplash.com/1600x900/?${encodeURIComponent(latestBackgroundPrompt)}`;
    }, [latestBackgroundPrompt, state.settings.dynamicBackgrounds]);

    return (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8">
            {notification && <div className="fixed top-5 right-5 bg-green-600 text-white py-2 px-4 rounded-lg shadow-lg z-[100] animate-fade-in-down">{notification}</div>}
             <div id="background-container" style={{ backgroundImage: `url(${backgroundUrl})` }} className="fixed inset-0 bg-cover bg-center filter blur-sm scale-110 opacity-20 transition-all duration-[1500ms]" />
            <header className="text-center w-full max-w-7xl mx-auto mb-6"><h1 className="text-4xl sm:text-5xl font-bold text-indigo-400 font-serif">CYOA Game Master</h1></header>
            
            {renderContent()}
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} settings={state.settings} onSettingsChange={(newSettings) => dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings })} />
            <WorldKnowledgeModal isOpen={isWorldModalOpen} onClose={() => setIsWorldModalOpen(false)} worldInfo={state.worldInfo} />
            <GameLogModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} storyLog={state.storyLog} />
        </div>
    );
};

export default App;
