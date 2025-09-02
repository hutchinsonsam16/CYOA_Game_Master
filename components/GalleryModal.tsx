
import React, { useState, useEffect } from 'react';
import { GalleryImage } from '../types';

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: GalleryImage[];
}

const GalleryModal: React.FC<GalleryModalProps> = ({ isOpen, onClose, images }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedImage) {
          setSelectedImage(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center animate-fade-in" 
      aria-modal="true" 
      role="dialog"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 w-full max-w-6xl h-[90vh] rounded-lg shadow-2xl border border-gray-700 flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold text-indigo-300 font-serif">Image Gallery</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-grow overflow-y-auto custom-scrollbar pr-4 -mr-4">
          {images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.map((image, index) => (
                <div
                  key={index}
                  className="aspect-square bg-gray-900 rounded-md overflow-hidden cursor-pointer transition-transform transform hover:scale-105"
                  onClick={() => setSelectedImage(image.src)}
                >
                  <img src={image.src} alt={image.alt} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          ) : (
             <div className="flex items-center justify-center h-full text-gray-500">
                <p>No images have been generated yet.</p>
             </div>
          )}
        </div>
      </div>
      
      {selectedImage && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-90 z-60 flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setSelectedImage(null)}
        >
            <img src={selectedImage} alt="Selected" className="max-h-full max-w-full rounded-lg object-contain" />
            <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 text-white text-2xl"
                aria-label="Close lightbox"
            >
                &times;
            </button>
        </div>
      )}
    </div>
  );
};

export default GalleryModal;