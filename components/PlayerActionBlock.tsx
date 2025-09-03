import React from 'react';

interface PlayerActionBlockProps {
  text: string;
}

const PlayerActionBlock: React.FC<PlayerActionBlockProps> = ({ text }) => {
  return (
    <div className="mb-8 animate-fade-in flex justify-end">
      <div className="max-w-[80%] bg-indigo-600/40 p-4 rounded-lg border border-indigo-500/50 shadow-md">
        <p className="text-indigo-100 whitespace-pre-wrap italic leading-relaxed">{text}</p>
      </div>
    </div>
  );
};

export default PlayerActionBlock;
