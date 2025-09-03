
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    <div className="mb-6 animate-fade-in">
      {hasVisuals && (
        <div className="relative mb-4">
          {imageUrl ? (
            <div className="rounded-lg overflow-hidden border-2 border-gray-600 shadow-lg">
              <img src={imageUrl} alt="A scene from the story" className="w-full object-cover" />
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-yellow-500/50 bg-gray-800 p-4">
              <div className="flex items-center justify-center mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <h3 className="font-semibold text-yellow-400">
                  {isImageGenerationEnabled ? 'Image Generation Failed' : 'Image Generation Disabled'}
                </h3>
              </div>
              <p className="text-gray-400 text-xs mb-3 text-center">
                 {isImageGenerationEnabled
                    ? 'The following prompt was blocked, likely by safety filters:'
                    : 'Automatic image generation is off. You can generate it manually.'}
              </p>
              <div className="relative">
                <p className="font-mono bg-gray-900 p-3 pr-10 rounded text-left text-xs text-indigo-300 select-all">{imgPrompt}</p>
                <button
                  onClick={handleCopy}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  title="Copy prompt"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {isImageLoading && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center transition-opacity duration-300 rounded-lg">
              <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-white text-lg mt-2 font-serif">Regenerating...</span>
            </div>
          )}

          {!isImageLoading && imgPrompt && (
            <button
              onClick={onRegenerate}
              disabled={isImageLoading}
              className="absolute bottom-3 right-3 bg-indigo-600/80 text-white text-xs font-bold py-1 px-3 rounded-full hover:bg-indigo-700 disabled:bg-gray-500/80 disabled:cursor-not-allowed backdrop-blur-sm transition-all duration-200 shadow-lg"
              aria-label="Regenerate image"
            >
              ↻ Regenerate
            </button>
          )}
        </div>
      )}
      <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 shadow-md">
        <ReactMarkdown
          children={storyText}
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ node, ...props }) => <p className="text-gray-200 leading-relaxed font-serif mb-4 last:mb-0" {...props} />,
            strong: ({ node, ...props }) => <strong className="font-bold text-indigo-300" {...props} />,
            em: ({ node, ...props }) => <em className="italic text-indigo-300" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc list-inside ml-4 mb-4 font-serif text-gray-300" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal list-inside ml-4 mb-4 font-serif text-gray-300" {...props} />,
            li: ({ node, ...props }) => <li className="mb-2 leading-relaxed" {...props} />,
            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-gray-500 pl-4 italic text-gray-400 my-4" {...props} />,
          }}
        />
        {isLastEntry && (
            <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-600/50">
            <button
                onClick={onRegenerateResponse}
                disabled={!canRegenerate}
                className="bg-purple-600 text-white text-xs font-bold py-1.5 px-3 rounded-md hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
                aria-label="Regenerate response"
            >
                ↻ Regenerate Response
            </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default StoryBlock;
