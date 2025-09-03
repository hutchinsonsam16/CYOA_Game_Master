import React, { useState, useEffect } from 'react';

interface WorldMemoryModalProps {
  isOpen: boolean;
  currentMemory: string;
  onClose: () => void;
  onSave: (newMemory: string) => void;
}

const WorldMemoryModal: React.FC<WorldMemoryModalProps> = ({ isOpen, currentMemory, onClose, onSave }) => {
  const [memory, setMemory] = useState(currentMemory);

  useEffect(() => {
    // When the modal is opened, sync its internal state with the current world data
    if (isOpen) {
      setMemory(currentMemory);
    }
  }, [isOpen, currentMemory]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    onSave(memory);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center animate-fade-in p-4" aria-modal="true" role="dialog">
      <div className="bg-slate-800 w-full max-w-3xl h-[80vh] rounded-lg shadow-2xl border border-slate-700 flex flex-col p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-indigo-300 font-serif">Edit World Memory</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          You can add or change the world's lore here. The Game Master will use this updated information from now on.
        </p>
        <textarea
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          className="w-full flex-grow bg-slate-900 border border-slate-600 rounded-md p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none custom-scrollbar"
          placeholder="Enter world data..."
        />
        <div className="mt-6 flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="bg-slate-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorldMemoryModal;
