import React, { useState, useRef } from 'react';
import { GameMasterMode, CharacterInput } from '../types';
import classNames from 'classnames';
import { enhanceBackstory, forgeWorldData } from '../services/geminiService';

interface SetupScreenProps {
  onStart: (worldData: string, characterInput: CharacterInput, initialPrompt: string, artStyle: string, gameMasterMode: GameMasterMode, imageGeneration: boolean) => void;
  onContinue: () => void;
  onLoadFromFile: (file: File) => void;
  hasSavedGame: boolean;
}

const artStyles: { [key: string]: string } = {
    'Photorealistic': 'Ultra-realistic, 8K resolution, sharp focus, detailed skin texture, professional studio lighting',
    'Cinematic Film': 'Shot on 35mm film, subtle grain, anamorphic lens flare, moody and atmospheric lighting, high dynamic range',
    'Gritty Realism': 'Documentary style, harsh lighting, high contrast, shallow depth of field, captures imperfections and raw emotion',
    'Digital Painting': 'Concept art style, visible brush strokes, dramatic lighting, epic fantasy aesthetic, highly detailed',
    'Anime/Manga': 'Modern anime style, vibrant colors, sharp lines, dynamic action poses, cel-shaded',
    'Cyberpunk Neon': 'Saturated neon colors, futuristic cityscape, rain-slicked streets, dystopian mood, Blade Runner aesthetic',
    'Watercolor': 'Soft, blended colors, translucent washes, visible paper texture, delicate and ethereal feel',
};

const alignments = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
  'Unaligned'
];

const FormSection: React.FC<{ number: number; title: string; children: React.ReactNode; className?: string }> = ({ number, title, children, className }) => (
    <div className={classNames("bg-slate-900/50 p-6 rounded-lg border border-slate-700/50", className)}>
        <div className="flex items-center gap-4 mb-4">
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-500 rounded-full text-white font-bold text-sm">{number}</div>
            <h3 className="text-xl font-semibold text-indigo-300">{title}</h3>
        </div>
        {children}
    </div>
);


const SetupScreen: React.FC<SetupScreenProps> = ({ onStart, onContinue, onLoadFromFile, hasSavedGame }) => {
  const [worldData, setWorldData] = useState('');
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [characterClass, setCharacterClass] = useState('');
  const [alignment, setAlignment] = useState('');
  const [backstory, setBackstory] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [artStyle, setArtStyle] = useState(artStyles['Photorealistic']);
  const [gameMasterMode, setGameMasterMode] = useState<GameMasterMode>(GameMasterMode.BALANCED);
  const [imageGeneration, setImageGeneration] = useState(true);
  const [isEnhancingBackstory, setIsEnhancingBackstory] = useState(false);
  const [isEnhancingWorld, setIsEnhancingWorld] = useState(false);
  const loreFileInputRef = useRef<HTMLInputElement>(null);
  const saveFileInputRef = useRef<HTMLInputElement>(null);

  const isStartDisabled = !worldData.trim() 
    || !characterPrompt.trim()
    || !initialPrompt.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStartDisabled) return;

    const characterInput: CharacterInput = { 
        description: characterPrompt,
        characterClass,
        alignment,
        backstory
    };
    
    onStart(worldData, characterInput, initialPrompt, artStyle, gameMasterMode, imageGeneration);
  };

  const handleLoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          setWorldData(text);
      };
      reader.onerror = (error) => console.error("Error reading file:", error);
      reader.readAsText(file);
      e.target.value = '';
  };
  
  const handleSaveFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadFromFile(file);
    }
    e.target.value = ''; // Reset file input
  };

  const handleEnhanceBackstory = async () => {
    if (!backstory.trim()) return;
    setIsEnhancingBackstory(true);
    try {
        const enhanced = await enhanceBackstory(backstory);
        setBackstory(enhanced);
    } catch (error) {
        console.error("Failed to enhance backstory:", error);
    } finally {
        setIsEnhancingBackstory(false);
    }
  };

  const handleEnhanceWorld = async () => {
    if (!worldData.trim()) return;
    setIsEnhancingWorld(true);
    try {
        const enhanced = await forgeWorldData(worldData);
        setWorldData(enhanced);
    } catch (error) {
        console.error("Failed to enhance world data:", error);
    } finally {
        setIsEnhancingWorld(false);
    }
  };

  return (
    <div className="w-full max-w-3xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700 animate-fade-in">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {hasSavedGame && (
            <button
              type="button"
              onClick={onContinue}
              className="flex-1 bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              Continue Last Session
            </button>
          )}
          <input type="file" ref={saveFileInputRef} onChange={handleSaveFileChange} className="hidden" accept=".json" />
          <button
            type="button"
            onClick={() => saveFileInputRef.current?.click()}
            className={classNames(
              "flex-1 bg-sky-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-sky-700 transition-all duration-300 transform hover:scale-105 shadow-lg",
              { 'w-full': !hasSavedGame }
            )}
          >
            Load Adventure from File
          </button>
        </div>
        {hasSavedGame && (
          <div className="my-4 flex items-center">
            <div className="flex-grow border-t border-slate-600"></div>
            <span className="flex-shrink mx-4 text-slate-400">OR</span>
            <div className="flex-grow border-t border-slate-600"></div>
          </div>
        )}
        <h2 className="text-xl font-semibold text-slate-300 mt-4 text-center">Start a New Story</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <FormSection number={1} title="Establish Your World">
           <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-slate-400">Provide the lore, rules, characters, and setting. The AI will treat this as absolute truth.</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleEnhanceWorld}
                    disabled={isEnhancingWorld || !worldData.trim()}
                    className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                  >
                    {isEnhancingWorld ? 'Forging World...' : 'Enhance with AI ✨'}
                  </button>
                  <input type="file" ref={loreFileInputRef} onChange={handleLoreFileChange} className="hidden" accept=".txt,.md,.json" />
                  <button type="button" onClick={() => loreFileInputRef.current?.click()} className="bg-slate-700 text-sm text-indigo-300 font-semibold py-1 px-3 rounded-md hover:bg-slate-600 transition-colors">Load from File...</button>
              </div>
            </div>
          <textarea id="world-data" value={worldData} onChange={(e) => setWorldData(e.target.value)} placeholder="e.g., The year is 2242 on the desert planet of Arrakis..." className="w-full h-40 bg-slate-900 border border-slate-600 rounded-md p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none disabled:bg-slate-700" required disabled={isEnhancingWorld} />
        </FormSection>

        <FormSection number={2} title="Create Your Character">
            <p className="text-sm text-slate-400 mb-3">Describe your character's appearance. This will be used to generate their portrait.</p>
            <input id="character-prompt" type="text" value={characterPrompt} onChange={(e) => setCharacterPrompt(e.target.value)} placeholder="e.g., A rugged space marine with a prominent scar over his left eye." className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200" required />
            <div className="mt-6 space-y-4">
                <h3 className="text-md font-semibold text-indigo-300 border-t border-slate-700 pt-4">Optional Details</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                         <label htmlFor="character-class" className="block text-sm font-medium text-slate-300 mb-1">Class</label>
                         <input id="character-class" type="text" value={characterClass} onChange={(e) => setCharacterClass(e.target.value)} placeholder="e.g., Rogue, Sorcerer" className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200" />
                     </div>
                     <div>
                         <label htmlFor="character-alignment" className="block text-sm font-medium text-slate-300 mb-1">Alignment</label>
                         <select id="character-alignment" value={alignment} onChange={(e) => setAlignment(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200">
                            <option value="">-- Select --</option>
                            {alignments.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                     </div>
                 </div>
                 <div>
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="character-backstory" className="block text-sm font-medium text-slate-300">Backstory</label>
                        <button
                            type="button"
                            onClick={handleEnhanceBackstory}
                            disabled={isEnhancingBackstory || !backstory.trim()}
                            className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                        >
                            {isEnhancingBackstory ? 'Enhancing...' : 'Enhance with AI ✨'}
                        </button>
                    </div>
                     <textarea id="character-backstory" value={backstory} onChange={(e) => setBackstory(e.target.value)} disabled={isEnhancingBackstory} placeholder="A brief history of your character..." className="w-full h-24 bg-slate-900 border border-slate-600 rounded-md p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none custom-scrollbar disabled:bg-slate-700" />
                 </div>
            </div>
        </FormSection>
        
        <FormSection number={3} title="Set The Scene">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label htmlFor="art-style" className="block text-lg font-semibold text-indigo-300 mb-2">Art Style</label>
                  <select id="art-style" value={artStyle} onChange={(e) => setArtStyle(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200">
                    {Object.entries(artStyles).map(([name, prompt]) => (<option key={name} value={prompt}>{name}</option>))}
                  </select>
                </div>
                <div>
                  <label htmlFor="gm-mode" className="block text-lg font-semibold text-indigo-300 mb-2">GM Mode</label>
                  <select id="gm-mode" value={gameMasterMode} onChange={(e) => setGameMasterMode(e.target.value as GameMasterMode)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200">
                    {Object.values(GameMasterMode).map((mode) => (<option key={mode} value={mode}>{mode}</option>))}
                  </select>
                </div>
            </div>
            
            <div className="mb-6">
                <div className="flex items-center">
                    <input id="image-generation" name="image-generation" type="checkbox" checked={imageGeneration} onChange={(e) => setImageGeneration(e.target.checked)} className="h-5 w-5 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500" />
                    <label htmlFor="image-generation" className="ml-3 block text-md font-semibold text-indigo-300">Enable Automatic Image Generation</label>
                </div>
                <p className="text-sm text-slate-400 mt-2 ml-8">If disabled, you can still generate images manually for each scene.</p>
            </div>
            <div>
              <label htmlFor="initial-prompt" className="block text-lg font-semibold text-indigo-300 mb-2">Opening Scene</label>
               <p className="text-sm text-slate-400 mb-3">Describe your character's starting situation. The AI will continue from here.</p>
              <input id="initial-prompt" type="text" value={initialPrompt} onChange={(e) => setInitialPrompt(e.target.value)} placeholder="e.g., I awaken in a dimly lit tavern..." className="w-full bg-slate-900 border border-slate-600 rounded-md p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200" required />
            </div>
        </FormSection>

        <button
          type="submit"
          disabled={isStartDisabled}
          className="w-full bg-indigo-600 text-white font-bold py-4 px-6 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg text-lg"
        >
          Start New Adventure
        </button>
      </form>
    </div>
  );
};

export default SetupScreen;