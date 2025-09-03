import React from 'react';

const LoadingIndicator: React.FC = () => {
  return (
    <div className="flex items-center space-x-2 p-4 animate-pulse">
        <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
        <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
        <span className="text-slate-400 font-serif">The Game Master is thinking...</span>
    </div>
  );
};

export default LoadingIndicator;
