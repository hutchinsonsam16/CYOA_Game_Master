
import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { GamePhase, StoryEntry } from '../types';
import StoryBlock from './StoryBlock';
import PlayerActionBlock from './PlayerActionBlock';
import LoadingIndicator from './LoadingIndicator';

interface GameScreenProps {
  storyLog: StoryEntry[];
  gamePhase: GamePhase;
  error: string | null;
  choices?: string[];
  onPlayerAction: (action: string) => void;
  onRestart: () => void;
  onRegenerateImage: (index: number) => void;
  onSaveGame: () => void;
  onOpenMemoryModal: () => void;
  isImageGenerationEnabled: boolean;
  onOpenGallery: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onDownloadImages: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRegenerateResponse: () => void;
  canRegenerate: boolean;
}

const GameScreen: React.FC<GameScreenProps> = ({ 
    storyLog, gamePhase, error, choices, onPlayerAction, onRestart, 
    onRegenerateImage, onSaveGame, onOpenMemoryModal, isImageGenerationEnabled,
    onOpenGallery, onExportPdf, onExportJson, onDownloadImages, onUndo, canUndo,
    onRegenerateResponse, canRegenerate
}) => {
  const [playerInput, setPlayerInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storyLog]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerInput.trim() && gamePhase === GamePhase.PLAYING) {
      onPlayerAction(playerInput);
      setPlayerInput('');
    }
  };

  const handleChoiceClick = (choice: string) => {
    if (gamePhase === GamePhase.PLAYING) {
      onPlayerAction(choice);
      setPlayerInput('');
    }
  };

  const handleSaveClick = () => {
    onSaveGame();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000); // Reset after 2 seconds
  }

  const lastAiEntryIndex = storyLog.map(e => e.type).lastIndexOf('ai');

  return (
    <div className="flex-grow h-full flex flex-col bg-gray-800 p-6 rounded-lg shadow-2xl border border-gray-700">
      <div className="flex-grow overflow-y-auto mb-4 pr-4 custom-scrollbar">
        {storyLog.map((entry, index) =>
          entry.type === 'ai' ? (
            <StoryBlock 
              key={index} 
              text={entry.content} 
              imageUrl={entry.imageUrl}
              imgPrompt={entry.imgPrompt}
              isImageLoading={entry.isImageLoading}
              onRegenerate={() => onRegenerateImage(index)}
              isImageGenerationEnabled={isImageGenerationEnabled}
              onRegenerateResponse={onRegenerateResponse}
              isLastEntry={index === lastAiEntryIndex}
              canRegenerate={canRegenerate}
            />
          ) : (
            <PlayerActionBlock key={index} text={entry.content} />
          )
        )}
         {gamePhase === GamePhase.LOADING && <LoadingIndicator />}
         {error && <div className="text-red-400 p-4 bg-red-900/50 rounded-md">{error}</div>}
        <div ref={logEndRef} />
      </div>

      <div className="flex-shrink-0">
        {gamePhase === GamePhase.PLAYING && choices && choices.length > 0 && (
          <div className="mb-4 animate-fade-in">
            <p className="text-center text-indigo-300 font-serif mb-3">Choose your action:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {choices.map((choice, index) => (
                <button
                  key={index}
                  onClick={() => handleChoiceClick(choice)}
                  className="w-full text-left bg-gray-700/80 text-gray-200 font-semibold py-3 px-4 rounded-lg hover:bg-indigo-600 hover:text-white transition-all duration-200 transform hover:scale-105"
                >
                  {choice}
                </button>
              ))}
            </div>
             <div className="my-4 flex items-center">
                <div className="flex-grow border-t border-gray-600"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-sm">OR</span>
                <div className="flex-grow border-t border-gray-600"></div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
            <form onSubmit={handleSubmit} className="flex-grow flex items-center gap-4">
              <input
                type="text"
                value={playerInput}
                onChange={(e) => setPlayerInput(e.target.value)}
                placeholder={gamePhase === GamePhase.PLAYING ? "What do you do?" : "Waiting for Game Master..."}
                disabled={gamePhase !== GamePhase.PLAYING}
                className="flex-grow bg-gray-900 border border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 disabled:bg-gray-700"
                autoFocus
              />
              <button
                type="submit"
                disabled={gamePhase !== GamePhase.PLAYING || !playerInput.trim()}
                className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Send
              </button>
            </form>
            <div className="flex items-center gap-2 ml-4">
                <div ref={exportMenuRef} className="relative">
                    <button
                        onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                        className="font-bold py-3 px-4 rounded-lg transition-all duration-300 bg-gray-600 hover:bg-gray-700 text-white flex items-center gap-2"
                    >
                        Export
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isExportMenuOpen && (
                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-10 animate-fade-in-up">
                            <button onClick={() => { onOpenGallery(); setIsExportMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white rounded-t-lg">View Gallery</button>
                            <button onClick={() => { onExportPdf(); setIsExportMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white">Save as PDF</button>
                            <button onClick={() => { onExportJson(); setIsExportMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white">Save as JSON</button>
                            <button onClick={() => { onDownloadImages(); setIsExportMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white rounded-b-lg">Download All (.zip)</button>
                        </div>
                    )}
                </div>
               <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo || gamePhase !== GamePhase.PLAYING}
                  className="font-bold py-3 px-4 rounded-lg transition-all duration-300 bg-yellow-600 hover:bg-yellow-700 text-white disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  Undo
                </button>
               <button
                  type="button"
                  onClick={onOpenMemoryModal}
                  className="font-bold py-3 px-4 rounded-lg transition-all duration-300 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Memory
                </button>
              <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={saveStatus === 'saved'}
                  className={classNames(
                    'font-bold py-3 px-4 rounded-lg transition-all duration-300',
                    {
                      'bg-green-600 hover:bg-green-700 text-white': saveStatus === 'idle',
                      'bg-green-500 text-white cursor-default': saveStatus === 'saved',
                    }
                  )}
                >
                  {saveStatus === 'saved' ? 'Saved!' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={onRestart}
                  className="bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors duration-200"
                >
                  Restart
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
