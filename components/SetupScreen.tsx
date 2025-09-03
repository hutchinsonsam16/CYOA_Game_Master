
import React, { useState, useRef } from 'react';
import { GameMasterMode, CharacterInput } from '../types';
import classNames from 'classnames';
import { enhanceBackstory } from '../services/geminiService';

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

const SetupScreen: React.FC<SetupScreenProps> = ({ onStart, onContinue, onLoadFromFile, hasSavedGame }) => {
  const [worldData, setWorldData] = useState('');
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [uploadedImage, setUploadedImage] = useState<{ base64: string; mimeType: string; previewUrl: string } | null>(null);
  const [characterInputMode, setCharacterInputMode] = useState<'text' | 'image'>('text');
  const [characterClass, setCharacterClass] = useState('');
  const [alignment, setAlignment] = useState('');
  const [backstory, setBackstory] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [artStyle, setArtStyle] = useState(artStyles['Photorealistic']);
  const [gameMasterMode, setGameMasterMode] = useState<GameMasterMode>(GameMasterMode.BALANCED);
  const [imageGeneration, setImageGeneration] = useState(true);
  const [isEnhancingBackstory, setIsEnhancingBackstory] = useState(false);
  const loreFileInputRef = useRef<HTMLInputElement>(null);
  const charImageInputRef = useRef<HTMLInputElement>(null);
  const saveFileInputRef = useRef<HTMLInputElement>(null);

  const isStartDisabled = !worldData.trim() 
    || (characterInputMode === 'text' && !characterPrompt.trim()) 
    || (characterInputMode === 'image' && !uploadedImage)
    || !initialPrompt.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStartDisabled) return;

    let characterInput: CharacterInput;
    if (characterInputMode === 'image' && uploadedImage) {
        characterInput = { 
            imageBase64: uploadedImage.base64, 
            mimeType: uploadedImage.mimeType,
            characterClass,
            alignment,
            backstory
        };
    } else {
        characterInput = { 
            description: characterPrompt,
            characterClass,
            alignment,
            backstory
        };
    }
    
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

  const handleCharImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const base64 = dataUrl.split(',')[1];
        setUploadedImage({ base64, mimeType: file.type, previewUrl: dataUrl });
    };
    reader.onerror = (error) => console.error("Error reading image file:", error);
    reader.readAsDataURL(file);
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

  return (
    <div className="w-full max-w-3xl bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 animate-fade-in">
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
              "flex-1 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-all duration-300 transform hover:scale-105 shadow-lg",
              { 'w-full': !hasSavedGame }
            )}
          >
            Load Adventure from File
          </button>
        </div>
        {hasSavedGame && (
          <div className="my-4 flex items-center">
            <div className="flex-grow border-t border-gray-600"></div>
            <span className="flex-shrink mx-4 text-gray-400">OR</span>
            <div className="flex-grow border-t border-gray-600"></div>
          </div>
        )}
        <h2 className="text-xl font-semibold text-gray-300 mt-4 text-center">Start a New Story</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
           <div className="flex justify-between items-center mb-2">
              <label htmlFor="world-data" className="block text-lg font-semibold text-indigo-300">1. Paste Your World Data</label>
              <input type="file" ref={loreFileInputRef} onChange={handleLoreFileChange} className="hidden" accept=".txt,.md,.json" />
              <button type="button" onClick={() => loreFileInputRef.current?.click()} className="bg-gray-700 text-sm text-indigo-300 font-semibold py-1 px-3 rounded-md hover:bg-gray-600 transition-colors">Load from File...</button>
            </div>
          <p className="text-sm text-gray-400 mb-3">Provide the lore, rules, characters, and setting. The AI will treat this as absolute truth.</p>
          <textarea id="world-data" value={worldData} onChange={(e) => setWorldData(e.target.value)} placeholder="e.g., The year is 2242 on the desert planet of Arrakis..." className="w-full h-40 bg-gray-900 border border-gray-600 rounded-md p-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none" required />
        </div>

        <div>
            <label className="block text-lg font-semibold text-indigo-300 mb-2">2. Create Your Character</label>
            <div className="flex bg-gray-900 border border-gray-600 rounded-lg p-1 mb-3">
                <button type="button" onClick={() => setCharacterInputMode('text')} className={classNames("w-1/2 py-2 rounded-md font-semibold transition-colors", { 'bg-indigo-600 text-white': characterInputMode === 'text', 'text-gray-300 hover:bg-gray-700': characterInputMode !== 'text' })}>Describe</button>
                <button type="button" onClick={() => setCharacterInputMode('image')} className={classNames("w-1/2 py-2 rounded-md font-semibold transition-colors", { 'bg-indigo-600 text-white': characterInputMode === 'image', 'text-gray-300 hover:bg-gray-700': characterInputMode !== 'image' })}>Upload Image</button>
            </div>
            
            {characterInputMode === 'text' ? (
                <div>
                    <p className="text-sm text-gray-400 mb-3">Describe your character's appearance for their portrait.</p>
                    <input id="character-prompt" type="text" value={characterPrompt} onChange={(e) => setCharacterPrompt(e.target.value)} placeholder="e.g., A rugged space marine with a prominent scar over his left eye." className="w-full bg-gray-900 border border-gray-600 rounded-md p-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200" required={characterInputMode === 'text'} />
                </div>
            ) : (
                 <div>
                    <p className="text-sm text-gray-400 mb-3">Upload a portrait. The AI will generate a description from it.</p>
                    <input type="file" ref={charImageInputRef} onChange={handleCharImageChange} className="hidden" accept="image/png, image/jpeg, image/webp" />
                    <button type="button" onClick={() => charImageInputRef.current?.click()} className="w-full bg-gray-700 border border-dashed border-gray-500 rounded-md p-4 text-gray-400 hover:bg-gray-600 hover:border-indigo-500 hover:text-white transition-colors flex items-center justify-center">
                        {uploadedImage ? (
                            <img src={uploadedImage.previewUrl} alt="Character preview" className="h-24 w-24 object-cover rounded-md" />
                        ) : (
                            <div className="text-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span className="mt-2 block font-semibold">Click to Upload Image</span>
                            </div>
                        )}
                    </button>
                 </div>
            )}
            <div className="mt-6 space-y-4">
                <h3 className="text-md font-semibold text-indigo-300 border-t border-gray-700 pt-4">Optional Details</h3>
                 <div>
                     <label htmlFor="character-class" className="block text-sm font-medium text-gray-300 mb-1">Class</label>
                     <input id="character-class" type="text" value={characterClass} onChange={(e) => setCharacterClass(e.target.value)} placeholder="e.g., Rogue, Sorcerer, Fighter" className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200" />
                 </div>
                 <div>
                     <label htmlFor="character-alignment" className="block text-sm font-medium text-gray-300 mb-1">Alignment</label>
                     <select id="character-alignment" value={alignment} onChange={(e) => setAlignment(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200">
                        <option value="">-- Select Alignment --</option>
                        {alignments.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                 </div>
                 <div>
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="character-backstory" className="block text-sm font-medium text-gray-300">Backstory</label>
                        <button
                            type="button"
                            onClick={handleEnhanceBackstory}
                            disabled={isEnhancingBackstory || !backstory.trim()}
                            className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                        >
                            {isEnhancingBackstory ? 'Enhancing...' : 'Enhance with AI ✨'}
                        </button>
                    </div>
                     <textarea id="character-backstory" value={backstory} onChange={(e) => setBackstory(e.target.value)} disabled={isEnhancingBackstory} placeholder="A brief history of your character..." className="w-full h-24 bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none custom-scrollbar disabled:bg-gray-700" />
                 </div>
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="art-style" className="block text-lg font-semibold text-indigo-300 mb-2">3. Choose Art Style</label>
              <select id="art-style" value={artStyle} onChange={(e) => setArtStyle(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md p-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200">
                {Object.entries(artStyles).map(([name, prompt]) => (<option key={name} value={prompt}>{name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="gm-mode" className="block text-lg font-semibold text-indigo-300 mb-2">4. Choose GM Mode</label>
              <select id="gm-mode" value={gameMasterMode} onChange={(e) => setGameMasterMode(e.target.value as GameMasterMode)} className="w-full bg-gray-900 border border-gray-600 rounded-md p-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200">
                {Object.values(GameMasterMode).map((mode) => (<option key={mode} value={mode}>{mode}</option>))}
              </select>
            </div>
        </div>
        
        <div>
            <div className="flex items-center">
                <input id="image-generation" name="image-generation" type="checkbox" checked={imageGeneration} onChange={(e) => setImageGeneration(e.target.checked)} className="h-5 w-5 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="image-generation" className="ml-3 block text-md font-semibold text-indigo-300">Enable Automatic Image Generation</label>
            </div>
            <p className="text-sm text-gray-400 mt-2 ml-8">If disabled, you can still generate images manually for each scene.</p>
        </div>

        <div>
          <label htmlFor="initial-prompt" className="block text-lg font-semibold text-indigo-300 mb-2">5. Write Your Opening Scene</label>
           <p className="text-sm text-gray-400 mb-3">Describe your character's starting situation. The AI will continue from here.</p>
          <input id="initial-prompt" type="text" value={initialPrompt} onChange={(e) => setInitialPrompt(e.target.value)} placeholder="e.g., I awaken in a dimly lit tavern..." className="w-full bg-gray-900 border border-gray-600 rounded-md p-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200" required />
        </div>
        <button
          type="submit"
          disabled={isStartDisabled}
          className="w-full bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg"
        >
          Start New Adventure
        </button>
      </form>
    </div>
  );
};

export default SetupScreen;
