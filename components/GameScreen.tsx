import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { GamePhase, StoryEntry } from '../types';
import StoryBlock from './StoryBlock';
import PlayerActionBlock from './PlayerActionBlock';
import LoadingIndicator from './LoadingIndicator';
import { UndoIcon, RedoIcon, MemoryIcon, SaveIcon, GalleryIcon, ExportIcon, RestartIcon } from './Icons';


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
    <div className="flex-grow h-full flex flex-col bg-slate-800 p-4 sm:p-6 rounded-xl shadow-2xl border border-slate-700">
      <div className="flex-grow overflow-y-auto mb-4 pr-4 -mr-4 custom-scrollbar">
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

      <div className="flex-shrink-0 mt-auto pt-4 border-t border-slate-700">
        {gamePhase === GamePhase.PLAYING && choices && choices.length > 0 && (
          <div className="mb-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {choices.map((choice, index) => (
                <button
                  key={index}
                  onClick={() => handleChoiceClick(choice)}
                  className="w-full text-left bg-slate-700/80 text-slate-200 font-semibold py-3 px-4 rounded-lg hover:bg-indigo-600 hover:text-white transition-all duration-200 transform hover:-translate-y-0.5"
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-2">
            <form onSubmit={handleSubmit} className="w-full flex-grow flex items-center gap-2">
              <input
                type="text"
                value={playerInput}
                onChange={(e) => setPlayerInput(e.target.value)}
                placeholder={gamePhase === GamePhase.PLAYING ? "What do you do?" : "Waiting for Game Master..."}
                disabled={gamePhase !== GamePhase.PLAYING}
                className="flex-grow bg-slate-900 border border-slate-600 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 disabled:bg-slate-700"
                autoFocus
              />
              <button
                type="submit"
                disabled={gamePhase !== GamePhase.PLAYING || !playerInput.trim()}
                className="bg-indigo-600 text-white font-bold py-3 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-slate-500 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Send
              </button>
            </form>
            <div className="flex items-center gap-1.5 self-end sm:self-center">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo || gamePhase !== GamePhase.PLAYING}
                  className="p-3 rounded-lg transition-all duration-300 bg-slate-600 hover:bg-slate-500 text-white disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
                  title="Undo Last Action"
                >
                  <UndoIcon />
                </button>
                <div ref={exportMenuRef} className="relative">
                    <button
                        onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                        className="p-3 rounded-lg transition-all duration-300 bg-slate-600 hover:bg-slate-500 text-white flex items-center gap-2"
                        title="Export Options"
                    >
                        <ExportIcon />
                    </button>
                    {isExportMenuOpen && (
                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-10 animate-fade-in-up">
                            <button onClick={() => { onOpenGallery(); setIsExportMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-indigo-500 hover:text-white rounded-t-lg"><GalleryIcon /> View Gallery</button>
                            <button onClick={() => { onExportPdf(); setIsExportMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-indigo-500 hover:text-white">Save as PDF</button>
                            <button onClick={() => { onExportJson(); setIsExportMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-indigo-500 hover:text-white">Save as JSON</button>
                            <button onClick={() => { onDownloadImages(); setIsExportMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-indigo-500 hover:text-white rounded-b-lg">Download All (.zip)</button>
                        </div>
                    )}
                </div>
               <button
                  type="button"
                  onClick={onOpenMemoryModal}
                  className="p-3 rounded-lg transition-all duration-300 bg-slate-600 hover:bg-slate-500 text-white"
                  title="Edit World Memory"
                >
                  <MemoryIcon />
                </button>
              <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={saveStatus === 'saved'}
                  className={classNames(
                    'p-3 rounded-lg transition-all duration-300 text-white',
                    {
                      'bg-slate-600 hover:bg-slate-500': saveStatus === 'idle',
                      'bg-green-600 cursor-default': saveStatus === 'saved',
                    }
                  )}
                  title={saveStatus === 'saved' ? 'Saved!' : 'Save Game'}
                >
                  <SaveIcon animate={saveStatus === 'saved'} />
                </button>
                <button
                  type="button"
                  onClick={onRestart}
                  className="p-3 rounded-lg transition-colors duration-200 bg-red-800/80 text-white hover:bg-red-700"
                  title="Restart Game"
                >
                  <RestartIcon />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
