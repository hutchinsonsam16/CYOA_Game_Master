
import React from 'react';

const LoadingIndicator: React.FC = () => {
  return (
    <div className="flex items-center space-x-2 p-4 animate-pulse">
        <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
        <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
        <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce delay-300"></div>
        <span className="text-gray-400 font-serif">The Game Master is thinking...</span>
    </div>
  );
};

export default LoadingIndicator;
