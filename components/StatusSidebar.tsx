
import React, { useState } from 'react';
import type { CharacterPortrait } from '../types';

interface StatusSidebarProps {
  portrait?: CharacterPortrait;
  isImageLoading: boolean;
  onRegenerate: () => void;
  characterDescription: string;
  characterClass: string;
  alignment: string;
  backstory: string;
}

const StatusSidebar: React.FC<StatusSidebarProps> = ({ portrait, isImageLoading, onRegenerate, characterDescription, characterClass, alignment, backstory }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(true);
  const [isLogOpen, setIsLogOpen] = useState(true);

  const handleCopy = () => {
    if (portrait && portrait.prompt) {
      navigator.clipboard.writeText(portrait.prompt);
    }
  };

  const hasAnyDetails = characterDescription || characterClass || alignment || backstory;

  return (
    <div className="w-1/3 max-w-sm flex-shrink-0 flex flex-col bg-gray-800 p-4 rounded-lg shadow-2xl border border-gray-700">
      <div className="flex justify-between items-center mb-4 border-b-2 border-gray-700 pb-2">
        <h2 className="text-xl font-bold text-indigo-300 font-serif">Character</h2>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
          aria-expanded={!isCollapsed}
          aria-controls="character-details"
          aria-label={isCollapsed ? 'Show character details' : 'Hide character details'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <div className="group relative aspect-square w-full bg-gray-900 rounded-md flex items-center justify-center border border-gray-600">
        {isImageLoading && (
           <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center transition-opacity duration-300 z-20">
              <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-white text-lg mt-2 font-serif">Generating...</span>
            </div>
        )}
        {!isImageLoading && portrait?.url && (
          <img src={portrait.url} alt="Character portrait" className="w-full h-full object-cover rounded-md transition-transform duration-300 ease-in-out relative group-hover:scale-125 group-hover:z-10" />
        )}
        {!isImageLoading && portrait && !portrait.url && (
          <div className="w-full h-full rounded-lg bg-gray-800 p-4 flex flex-col justify-center text-center">
            <div className="flex items-center justify-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <h3 className="font-semibold text-yellow-400">Generation Failed</h3>
            </div>
            <p className="text-gray-400 text-xs mb-3">The prompt was likely blocked by safety filters.</p>
            <div className="relative">
              <p className="font-mono bg-gray-900 p-3 pr-10 rounded text-left text-xs text-indigo-300 select-all overflow-y-auto max-h-24 custom-scrollbar">{portrait.prompt}</p>
              <button onClick={handleCopy} className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors" title="Copy prompt">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {!isImageLoading && !portrait && (
          <div className="text-center text-gray-500 p-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="mt-2 text-sm">No portrait generated.</p>
          </div>
        )}
      </div>
       <button
          onClick={onRegenerate}
          disabled={isImageLoading || !characterDescription}
          className="w-full mt-4 bg-indigo-600/80 text-white text-sm font-bold py-2 px-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-500/80 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
        >
          {isImageLoading ? '...' : '↻ Regenerate Portrait'}
        </button>

      {/* Collapsible Section */}
      <div
        id="character-details"
        className={`flex-grow overflow-hidden transition-all duration-500 ease-in-out ${isCollapsed ? 'max-h-0' : 'max-h-[50vh]'}`}
      >
        <div className="h-full overflow-y-auto custom-scrollbar mt-4 pt-4 border-t-2 border-gray-700">
            {hasAnyDetails ? (
            <div className="space-y-4">
                {characterDescription && (
                    <div>
                        <button
                          onClick={() => setIsDescriptionOpen(!isDescriptionOpen)}
                          className="w-full flex justify-between items-center text-left text-sm font-semibold text-gray-400 uppercase tracking-wider focus:outline-none hover:text-indigo-300 transition-colors"
                          aria-expanded={isDescriptionOpen}
                        >
                          <span>Appearance</span>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform duration-300 ${isDescriptionOpen ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isDescriptionOpen ? 'max-h-screen mt-2' : 'max-h-0'}`}>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap font-serif leading-relaxed">
                            {characterDescription}
                          </p>
                        </div>
                    </div>
                )}
                {characterClass && (
                <div>
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Class</h3>
                    <p className="text-lg text-white font-serif">{characterClass}</p>
                </div>
                )}
                {alignment && (
                <div>
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Alignment</h3>
                    <p className="text-lg text-white font-serif">{alignment}</p>
                </div>
                )}
                {backstory && (
                <div>
                    <button
                        onClick={() => setIsLogOpen(!isLogOpen)}
                        className="w-full flex justify-between items-center text-left text-sm font-semibold text-gray-400 uppercase tracking-wider focus:outline-none hover:text-indigo-300 transition-colors"
                        aria-expanded={isLogOpen}
                        >
                        <span>Character Log</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform duration-300 ${isLogOpen ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isLogOpen ? 'max-h-[500px] mt-2 overflow-y-auto custom-scrollbar' : 'max-h-0'}`}>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap font-serif leading-relaxed pr-2">{backstory}</p>
                    </div>
                </div>
                )}
            </div>
            ) : (
            <div className="text-center text-gray-500 pt-4">
                <p>No character details provided.</p>
            </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default StatusSidebar;
