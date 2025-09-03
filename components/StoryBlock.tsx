import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RedoIcon } from './Icons';

interface StoryBlockProps {
  text: string;
  imageUrl?: string;
  imgPrompt?: string;
  isImageLoading?: boolean;
  onRegenerate: () => void;
  isImageGenerationEnabled: boolean;
  onRegenerateResponse: () => void;
  isLastEntry: boolean;
  canRegenerate: boolean;
}

const StoryBlock: React.FC<StoryBlockProps> = ({ text, imageUrl, imgPrompt, isImageLoading, onRegenerate, isImageGenerationEnabled, onRegenerateResponse, isLastEntry, canRegenerate }) => {
  // Remove the final "What do you do?" before rendering markdown,
  // as it's a prompt for the input box, not part of the story.
  const storyText = text.replace(/what do you do\?$/i, '').trim();
  const hasVisuals = imageUrl || imgPrompt;

  const handleCopy = () => {
    if (imgPrompt) {
      navigator.clipboard.writeText(imgPrompt);
    }
  };

  return (
    <div className="mb-8 animate-fade-in group">
      {hasVisuals && (
        <div className="relative mb-4">
          <div className="rounded-lg overflow-hidden border-2 border-slate-700/50 shadow-lg aspect-video bg-slate-900 flex items-center justify-center">
            {imageUrl ? (
                <img src={imageUrl} alt="A scene from the story" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center">
                     <div className="flex items-center justify-center mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <h3 className="font-semibold text-yellow-400">
                        {isImageGenerationEnabled ? 'Image Generation Failed' : 'Image Generation Disabled'}
                        </h3>
                    </div>
                    <p className="text-slate-400 text-xs mb-3 max-w-md">
                        {isImageGenerationEnabled
                            ? 'The following prompt was blocked, likely by safety filters. You can still try to regenerate it.'
                            : 'Automatic image generation is off. You can generate it manually.'}
                    </p>
                </div>
            )}
          </div>

          {isImageLoading && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center transition-opacity duration-300 rounded-lg">
              <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-white text-lg mt-2 font-serif">Generating...</span>
            </div>
          )}

          {!isImageLoading && imgPrompt && (
            <button
              onClick={onRegenerate}
              disabled={isImageLoading}
              className="absolute bottom-3 right-3 bg-indigo-600/80 text-white text-xs font-bold py-1 px-3 rounded-full hover:bg-indigo-700 disabled:bg-slate-500/80 disabled:cursor-not-allowed backdrop-blur-sm transition-all duration-200 shadow-lg opacity-0 group-hover:opacity-100"
              aria-label="Regenerate image"
            >
              ↻ Regenerate Image
            </button>
          )}
        </div>
      )}
      <div className="bg-slate-700/30 p-4 sm:p-5 rounded-lg border border-slate-700/50 shadow-md">
        <ReactMarkdown
          children={storyText}
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ node, ...props }) => <p className="text-slate-200 text-base leading-relaxed font-serif mb-4 last:mb-0" {...props} />,
            strong: ({ node, ...props }) => <strong className="font-bold text-indigo-300" {...props} />,
            em: ({ node, ...props }) => <em className="italic text-indigo-300" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc list-inside ml-4 mb-4 font-serif text-slate-300" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal list-inside ml-4 mb-4 font-serif text-slate-300" {...props} />,
            li: ({ node, ...props }) => <li className="mb-2 leading-relaxed" {...props} />,
            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-slate-500 pl-4 italic text-slate-400 my-4" {...props} />,
          }}
        />
        {isLastEntry && (
            <div className="flex items-center justify-end mt-3 pt-3 border-t border-slate-600/50">
            <button
                onClick={onRegenerateResponse}
                disabled={!canRegenerate}
                className="flex items-center gap-1.5 bg-purple-600 text-white text-xs font-bold py-1.5 px-3 rounded-md hover:bg-purple-700 disabled:bg-slate-500 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
                aria-label="Regenerate response"
            >
                <RedoIcon />
                Regenerate Response
            </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default StoryBlock;
