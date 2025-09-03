import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Chat, Content } from '@google/genai';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { GamePhase, StoryEntry, SavedGameState, GameMasterMode, CharacterInput, GalleryImage, CharacterPortrait } from './types';
import { initializeChat, getAiResponse, generateImage, generateCharacterDescriptionFromImage, enhanceWorldData } from './services/geminiService';
import { saveGameState, loadGameState, clearGameState } from './services/storageService';
import SetupScreen from './components/SetupScreen';
import GameScreen from './components/GameScreen';
import StatusSidebar from './components/StatusSidebar';
import WorldMemoryModal from './components/WorldMemoryModal';
import GalleryModal from './components/GalleryModal';

interface ProcessedResponse {
  content: string;
  imageUrl?: string;
  imgPrompt?: string;
  choices?: string[];
  newCharacterDescription?: string;
  newCharacterClass?: string;
  newAlignment?: string;
  newBackstoryEntry?: string;
}

const createCharacterPortraitPrompt = (description: string): string => {
  return `Cinematic character portrait of ${description}. Focus on detailed facial features, expressive lighting, and high-quality rendering.`;
};

const App: React.FC = () => {
  const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.SETUP);
  const [storyLog, setStoryLog] = useState<StoryEntry[]>([]);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [worldData, setWorldData] = useState<string>('');
  const [artStyle, setArtStyle] = useState<string>('');
  const [gameMasterMode, setGameMasterMode] = useState<GameMasterMode>(GameMasterMode.BALANCED);
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isImageGenerationEnabled, setIsImageGenerationEnabled] = useState<boolean>(true);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [previousGameState, setPreviousGameState] = useState<SavedGameState | null>(null);
  const [actionToRedo, setActionToRedo] = useState<string | null>(null); // For regeneration

  // Store all character portraits with their prompts
  const [characterPortraits, setCharacterPortraits] = useState<CharacterPortrait[]>([]);
  const [characterDescription, setCharacterDescription] = useState<string>('');
  const [characterClass, setCharacterClass] = useState<string>('');
  const [alignment, setAlignment] = useState<string>('');
  const [backstory, setBackstory] = useState<string>('');
  const [isCharacterImageLoading, setIsCharacterImageLoading] = useState<boolean>(false);

  const latestCharacterPortrait = useMemo(() => characterPortraits.length > 0 ? characterPortraits[characterPortraits.length - 1] : undefined, [characterPortraits]);

  useEffect(() => {
    // On initial load, check if a saved game exists
    if (loadGameState()) {
      setHasSavedGame(true);
    }
  }, []);

  useEffect(() => {
    // Effect to handle re-doing an action after an undo/regenerate
    if (actionToRedo && chatSession && gamePhase === GamePhase.PLAYING) {
      handlePlayerAction(actionToRedo);
      setActionToRedo(null); // Reset after firing
    }
  }, [actionToRedo, chatSession, gamePhase]);

  const processAiResponse = useCallback(async (responseText: string, style: string): Promise<ProcessedResponse> => {
      const imgPromptRegex = /\[img-prompt\](.*?)\[\/img-prompt\]/s;
      const charImgPromptRegex = /\[char-img-prompt\](.*?)\[\/char-img-prompt\]/s;
      const choiceRegex = /\[choice\](.*?)\[\/choice\]/g;
      const classRegex = /\[update-class\](.*?)\[\/update-class\]/s;
      const alignmentRegex = /\[update-alignment\](.*?)\[\/update-alignment\]/s;
      const backstoryRegex = /\[update-backstory\](.*?)\[\/update-backstory\]/s;
      
      const imgMatch = responseText.match(imgPromptRegex);
      const charImgMatch = responseText.match(charImgPromptRegex);
      const classMatch = responseText.match(classRegex);
      const alignmentMatch = responseText.match(alignmentRegex);
      const backstoryMatch = responseText.match(backstoryRegex);
      const choices = [...responseText.matchAll(choiceRegex)].map(match => match[1].trim());

      let imageUrl: string | undefined = undefined;
      let imgPrompt: string | undefined = undefined;
      let newCharacterDescription: string | undefined = undefined;
      let newCharacterClass: string | undefined = undefined;
      let newAlignment: string | undefined = undefined;
      let newBackstoryEntry: string | undefined = undefined;
      
      // Remove all special tags from the final content
      const content = responseText
        .replace(imgPromptRegex, '')
        .replace(charImgPromptRegex, '')
        .replace(choiceRegex, '')
        .replace(classRegex, '')
        .replace(alignmentRegex, '')
        .replace(backstoryRegex, '')
        .trim();

      if (imgMatch && imgMatch[1]) {
          imgPrompt = imgMatch[1].trim();
          if (isImageGenerationEnabled) {
            const generatedImageUrl = await generateImage(imgPrompt, style, '16:9');
            if (generatedImageUrl) {
              imageUrl = generatedImageUrl;
            }
          }
      }
      
      if (charImgMatch && charImgMatch[1]) {
        newCharacterDescription = charImgMatch[1].trim();
      }
      
      if (classMatch && classMatch[1]) {
        newCharacterClass = classMatch[1].trim();
      }

      if (alignmentMatch && alignmentMatch[1]) {
        newAlignment = alignmentMatch[1].trim();
      }
      
      if (backstoryMatch && backstoryMatch[1]) {
        newBackstoryEntry = backstoryMatch[1].trim();
      }

      return { content, imageUrl, imgPrompt, choices, newCharacterDescription, newCharacterClass, newAlignment, newBackstoryEntry };
  }, [isImageGenerationEnabled]);
  
  const handleUpdateCharacterImage = useCallback(async (description: string, style: string) => {
    setIsCharacterImageLoading(true);
    setCharacterDescription(description); // Update our source of truth
    const fullPrompt = createCharacterPortraitPrompt(description);
    try {
        const url = await generateImage(fullPrompt, style, '1:1');
        setCharacterPortraits(prevPortraits => [...prevPortraits, { url, prompt: description }]);
    } catch (e) {
        console.error("Failed to update character image:", e);
        setCharacterPortraits(prevPortraits => [...prevPortraits, { prompt: description }]);
    } finally {
        setIsCharacterImageLoading(false);
    }
  }, []);

  const handleStartGame = useCallback(async (worldData: string, characterInput: CharacterInput, initialPrompt: string, style: string, mode: GameMasterMode, imageGenEnabled: boolean) => {
    setGamePhase(GamePhase.LOADING);
    setError(null);
    setStoryLog([]);
    setArtStyle(style);
    setGameMasterMode(mode);
    setIsImageGenerationEnabled(imageGenEnabled);
    setCharacterPortraits([]);
    setCharacterClass(characterInput.characterClass || '');
    setAlignment(characterInput.alignment || '');
    setBackstory(characterInput.backstory || '');
    setPreviousGameState(null);
    
    clearGameState();
    setHasSavedGame(false);

    try {
      // Enhance world data using Gaia Protocols
      const enhancedWorldData = await enhanceWorldData(worldData);
      setWorldData(enhancedWorldData);

      setIsCharacterImageLoading(true);
      let initialCharDescription = '';

      if ('description' in characterInput && characterInput.description) {
        const fullCharPrompt = createCharacterPortraitPrompt(characterInput.description);
        initialCharDescription = characterInput.description;
        setCharacterDescription(initialCharDescription);
        const charImgUrl = await generateImage(fullCharPrompt, style, '1:1');
        setCharacterPortraits([{ url: charImgUrl, prompt: initialCharDescription }]);
      } else if ('imageBase64' in characterInput && characterInput.imageBase64) {
        // Set the uploaded image directly as the first portrait
        const dataUrl = `data:${characterInput.mimeType};base64,${characterInput.imageBase64}`;
        // And generate a description from it for future consistency
        const generatedDesc = await generateCharacterDescriptionFromImage(characterInput.imageBase64, characterInput.mimeType);
        initialCharDescription = generatedDesc;
        setCharacterDescription(generatedDesc);
        setCharacterPortraits([{ url: dataUrl, prompt: `Uploaded image. Generated description: ${generatedDesc}` }]);
      }
      setIsCharacterImageLoading(false);

      const characterDetails = {
        description: initialCharDescription,
        characterClass: characterInput.characterClass,
        alignment: characterInput.alignment,
        backstory: characterInput.backstory,
      };

      const chat = initializeChat(enhancedWorldData, style, mode, characterDetails);
      setChatSession(chat);

      const firstPlayerEntry: StoryEntry = { type: 'player', content: initialPrompt };
      setStoryLog([firstPlayerEntry]);

      const aiResponseText = await getAiResponse(chat, initialPrompt);
      const { content, imageUrl, imgPrompt, choices, newCharacterDescription, newCharacterClass, newAlignment, newBackstoryEntry } = await processAiResponse(aiResponseText, style);

      if (newCharacterDescription) {
        // This is unlikely on the first turn, but handle it just in case
        handleUpdateCharacterImage(newCharacterDescription, style);
      }
      if (newCharacterClass) {
        setCharacterClass(newCharacterClass);
      }
      if (newAlignment) {
        setAlignment(newAlignment);
      }
      if (newBackstoryEntry) {
          setBackstory(prev => `${prev}\n\n---\n\n${newBackstoryEntry}`);
      }
      
      const firstAiEntry: StoryEntry = { type: 'ai', content, imageUrl, imgPrompt, choices, isImageLoading: false };
      setStoryLog(prevLog => [...prevLog, firstAiEntry]);
      setGamePhase(GamePhase.PLAYING);
    } catch (e) {
      console.error(e);
      setError('Failed to start the game. Please check your API key and try again.');
      setGamePhase(GamePhase.ERROR);
      setIsCharacterImageLoading(false);
    }
  }, [processAiResponse, handleUpdateCharacterImage]);

  const handlePlayerAction = useCallback(async (action: string) => {
    if (!chatSession || !action.trim()) return;

    // Capture state BEFORE the action is processed for the undo feature
    try {
        const history = await chatSession.getHistory();
        const currentState: SavedGameState = {
            storyLog,
            worldData,
            artStyle,
            gameMasterMode,
            chatHistory: history,
            characterPortraits,
            characterDescription,
            characterClass,
            alignment,
            backstory,
            isImageGenerationEnabled,
        };
        setPreviousGameState(currentState);
    } catch (error) {
        console.error("Error capturing undo state:", error);
        setPreviousGameState(null); // Invalidate undo if history fails
    }


    setGamePhase(GamePhase.LOADING);
    setError(null);
    const playerEntry: StoryEntry = { type: 'player', content: action };
    setStoryLog(prevLog => [...prevLog, playerEntry]);

    try {
      const aiResponseText = await getAiResponse(chatSession, action);
      const { content, imageUrl, imgPrompt, choices, newCharacterDescription, newCharacterClass, newAlignment, newBackstoryEntry } = await processAiResponse(aiResponseText, artStyle);

      if (newCharacterDescription) {
          handleUpdateCharacterImage(newCharacterDescription, artStyle);
      }
      if (newCharacterClass) {
        setCharacterClass(newCharacterClass);
      }
      if (newAlignment) {
        setAlignment(newAlignment);
      }
      if (newBackstoryEntry) {
        setBackstory(prev => `${prev}\n\n---\n\n${newBackstoryEntry}`);
      }

      const aiEntry: StoryEntry = { type: 'ai', content, imageUrl, imgPrompt, choices, isImageLoading: false };
      setStoryLog(prevLog => [...prevLog, aiEntry]);
      setGamePhase(GamePhase.PLAYING);
    } catch (e) {
      console.error(e);
      setError('Failed to get a response from the Game Master. Please try again.');
      setGamePhase(GamePhase.ERROR);
    }
  }, [chatSession, processAiResponse, artStyle, handleUpdateCharacterImage, storyLog, worldData, gameMasterMode, characterPortraits, characterDescription, characterClass, alignment, backstory, isImageGenerationEnabled]);
  
  const handleRegenerateImage = useCallback(async (storyIndex: number) => {
    const storyEntry = storyLog[storyIndex];
    if (!storyEntry || storyEntry.type !== 'ai' || !storyEntry.imgPrompt) {
      return;
    }

    setStoryLog(prevLog => {
      const newLog = [...prevLog];
      newLog[storyIndex] = { ...newLog[storyIndex], isImageLoading: true };
      return newLog;
    });

    try {
      const newImageUrl = await generateImage(storyEntry.imgPrompt, artStyle, '16:9');
      setStoryLog(prevLog => {
        const newLog = [...prevLog];
        newLog[storyIndex] = { ...newLog[storyIndex], imageUrl: newImageUrl, isImageLoading: false };
        return newLog;
      });

    } catch (e) {
      console.error("Failed to regenerate image", e);
      setStoryLog(prevLog => {
        const newLog = [...prevLog];
        newLog[storyIndex] = { ...newLog[storyIndex], isImageLoading: false };
        return newLog;
      });
    }
  }, [storyLog, artStyle]);

   const handleRegenerateCharacterImage = useCallback(async () => {
    if (!characterDescription) return;
    setIsCharacterImageLoading(true);
    const fullPrompt = createCharacterPortraitPrompt(characterDescription);
    try {
      const newImageUrl = await generateImage(fullPrompt, artStyle, '1:1');
      setCharacterPortraits(prevPortraits => [...prevPortraits, { url: newImageUrl, prompt: characterDescription }]);
    } catch (e) {
      console.error("Failed to regenerate character image", e);
      setCharacterPortraits(prevPortraits => [...prevPortraits, { prompt: characterDescription }]);
    } finally {
      setIsCharacterImageLoading(false);
    }
  }, [characterDescription, artStyle]);

  const handleSaveGame = useCallback(async () => {
    if (!chatSession || storyLog.length === 0) return;

    try {
      const history = await chatSession.getHistory();
      const gameState: SavedGameState = {
        storyLog,
        worldData,
        artStyle,
        gameMasterMode,
        chatHistory: history,
        characterPortraits,
        characterDescription,
        characterClass,
        alignment,
        backstory,
        isImageGenerationEnabled,
      };
      saveGameState(gameState);
      setHasSavedGame(true);
    } catch (error) {
      console.error("Error saving game:", error);
    }
  }, [chatSession, storyLog, worldData, artStyle, gameMasterMode, characterPortraits, characterDescription, characterClass, alignment, backstory, isImageGenerationEnabled]);

  const loadGameFromState = useCallback((savedState: SavedGameState | null) => {
    if (!savedState) return;

    setGamePhase(GamePhase.LOADING);
    setError(null);

    try {
      setStoryLog(savedState.storyLog);
      setWorldData(savedState.worldData);
      setArtStyle(savedState.artStyle);
      setGameMasterMode(savedState.gameMasterMode || GameMasterMode.BALANCED);
      setCharacterPortraits(savedState.characterPortraits || []);
      setCharacterDescription(savedState.characterDescription || '');
      setCharacterClass(savedState.characterClass || '');
      setAlignment(savedState.alignment || '');
      setBackstory(savedState.backstory || '');
      setIsImageGenerationEnabled(savedState.isImageGenerationEnabled ?? true);

      const characterDetails = {
        description: savedState.characterDescription || '',
        characterClass: savedState.characterClass,
        alignment: savedState.alignment,
        backstory: savedState.backstory,
      };
      const chat = initializeChat(savedState.worldData, savedState.artStyle, savedState.gameMasterMode || GameMasterMode.BALANCED, characterDetails, savedState.chatHistory);
      setChatSession(chat);
      setGamePhase(GamePhase.PLAYING);
    } catch (e) {
      console.error(e);
      setError('Failed to load the saved game. Starting a new game is recommended.');
      setGamePhase(GamePhase.ERROR);
      clearGameState();
      setHasSavedGame(false);
    }
  }, []);

  const handleLoadGame = useCallback(() => {
    const savedState = loadGameState();
    loadGameFromState(savedState);
    setPreviousGameState(null);
  }, [loadGameFromState]);

  const handleLoadFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const text = event.target?.result as string;
            const savedState = JSON.parse(text) as SavedGameState;
            loadGameFromState(savedState);
            setPreviousGameState(null);
        } catch (e) {
            console.error("Failed to parse save file:", e);
            setError("The selected save file is corrupted or invalid.");
            setGamePhase(GamePhase.SETUP); // Return to setup on error
        }
    };
    reader.onerror = () => {
        setError("Failed to read the selected file.");
        setGamePhase(GamePhase.SETUP); // Return to setup on error
    };
    reader.readAsText(file);
  };
  
  const handleUndo = useCallback(() => {
    if (!previousGameState) return;

    setGamePhase(GamePhase.LOADING);
    setError(null);

    // Restore state from previousGameState
    loadGameFromState(previousGameState);

    // Clear previous state so you can't undo twice
    setPreviousGameState(null);
  }, [previousGameState, loadGameFromState]);

  const handleRegenerateResponse = useCallback(() => {
    // Fix: Replaced `findLast` with a compatible alternative to support older JS targets.
    const lastPlayerAction = [...storyLog].reverse().find(e => e.type === 'player')?.content;

    if (!previousGameState || !lastPlayerAction) {
        setError("Cannot regenerate response. No previous state to restore.");
        setGamePhase(GamePhase.PLAYING); // Stay in playing phase
        return;
    }

    // Restore the previous state. This reverts the log and chat session.
    loadGameFromState(previousGameState);

    // Set the action to be re-processed by the useEffect hook.
    // This ensures it runs *after* the state has been successfully updated.
    setActionToRedo(lastPlayerAction);
  }, [storyLog, previousGameState, loadGameFromState]);

  const handleRestart = () => {
    clearGameState();
    setHasSavedGame(false);
    setGamePhase(GamePhase.SETUP);
    setStoryLog([]);
    setChatSession(null);
    setError(null);
    setWorldData('');
    setArtStyle('');
    setGameMasterMode(GameMasterMode.BALANCED);
    setIsImageGenerationEnabled(true);
    setCharacterPortraits([]);
    setCharacterDescription('');
    setCharacterClass('');
    setAlignment('');
    setBackstory('');
    setPreviousGameState(null);
  }
  
  const handleUpdateWorldMemory = useCallback(async (newMemory: string) => {
    if (!chatSession) return;

    setWorldData(newMemory);
    try {
        const history: Content[] = await chatSession.getHistory();
        const characterDetails = {
          description: characterDescription,
          characterClass,
          alignment,
          backstory,
        };
        const newChat = initializeChat(newMemory, artStyle, gameMasterMode, characterDetails, history);
        setChatSession(newChat);
        setIsMemoryModalOpen(false); // Close modal on success
    } catch (e) {
        console.error("Failed to update world memory and re-initialize chat:", e);
        setError("There was an error updating the world memory. The story can continue, but the AI may not have the latest information.");
    }
  }, [chatSession, artStyle, gameMasterMode, characterDescription, characterClass, alignment, backstory]);

  const allImages = useMemo<GalleryImage[]>(() => {
    const images: GalleryImage[] = [];
    characterPortraits.forEach((portrait, index) => {
        if (portrait.url) {
            images.push({ src: portrait.url, alt: `Character Portrait #${index + 1}` });
        }
    });
    storyLog.forEach((entry, index) => {
        if (entry.type === 'ai' && entry.imageUrl) {
            images.push({ src: entry.imageUrl, alt: `Scene from turn ${index}` });
        }
    });
    return images;
  }, [characterPortraits, storyLog]);

  const handleExportPdf = async (): Promise<Blob> => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const maxLineWidth = pageWidth - margin * 2;
    let y = margin;

    const addText = (text: string, options: { fontStyle?: string, size?: number, isPlayer?: boolean, color?: string, align?: 'left' | 'center' | 'right' } = {}) => {
        const fontSize = options.size || 12;
        const color = options.color || (options.isPlayer ? '#4F46E5' : '#000000');
        const lineHeight = fontSize * 0.6;

        doc.setFontSize(fontSize);
        doc.setFont('helvetica', options.fontStyle || 'normal');
        doc.setTextColor(color);

        const lines = doc.splitTextToSize(text, maxLineWidth);
        
        lines.forEach((line: string) => {
            if (y + lineHeight > 285) { // Check for page break (page height is ~297, margin 10)
                doc.addPage();
                y = margin;
            }
            let x = margin;
            if (options.align === 'center') {
                x = pageWidth / 2;
            } else if (options.align === 'right') {
                x = pageWidth - margin;
            }
            doc.text(line, x, y, { align: options.align || 'left' });
            y += lineHeight;
        });
        y += 5; // Paragraph spacing
    };
    
    const addImage = async (imageUrl: string, width: number) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const img = new Image();
            img.src = dataUrl;
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = (err) => reject(err);
            });

            const imgWidth = width;
            const imgHeight = (img.height * imgWidth) / img.width;

            if (y + imgHeight > 285) {
                doc.addPage();
                y = margin;
            }
            
            doc.addImage(img, (pageWidth - imgWidth) / 2, y, imgWidth, imgHeight);
            y += imgHeight + 10;
        } catch (e) {
            console.error("Could not add image to PDF", e);
            addText("[Image could not be loaded]", { fontStyle: 'italic', size: 10, color: '#888888', align: 'center' });
        }
    };

    addText("Your Adventure", { size: 22, align: 'center' });
    y += 10;

    // Add Character Portrait section
    if (latestCharacterPortrait?.url) {
        addText("Character Portrait", { size: 16 });
        y -= 2; // small adjustment
        await addImage(latestCharacterPortrait.url, 120);
        if(latestCharacterPortrait.prompt) {
            addText(`Prompt: ${latestCharacterPortrait.prompt}`, { size: 9, fontStyle: 'italic', color: '#555555'});
        }
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
    }

    for (const entry of storyLog) {
        if (y > 270) { // Check before starting a new entry
            doc.addPage();
            y = margin;
        }

        if (entry.type === 'player') {
            addText(`> ${entry.content}`, { fontStyle: 'italic', isPlayer: true });
        } else {
            addText(entry.content.replace(/what do you do\?$/i, '').trim());

            if (entry.imageUrl) {
                await addImage(entry.imageUrl, 120);
            }

            if (entry.imgPrompt) {
                addText(`Prompt: ${entry.imgPrompt}`, { size: 9, fontStyle: 'italic', color: '#555555' });
            }
        }
        y += 5; // extra space between entries
    }

    return doc.output('blob');
  };

  const handleExportJson = async () => {
    if (!chatSession || storyLog.length === 0) return;
    try {
        const history = await chatSession.getHistory();
        const gameState: SavedGameState = {
            storyLog,
            worldData,
            artStyle,
            gameMasterMode,
            chatHistory: history,
            characterPortraits,
            characterDescription,
            characterClass,
            alignment,
            backstory,
            isImageGenerationEnabled,
        };
        const jsonString = JSON.stringify(gameState, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "cyoa-save.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error("Error exporting game to JSON:", error);
    }
  };

  const handleDownloadImages = async () => {
      const zip = new JSZip();
      let sceneCounter = 1;
      let charCounter = 1;
      
      const pdfBlob = await handleExportPdf();
      zip.file("adventure.pdf", pdfBlob);

      for (const image of allImages) {
          const isCharacter = image.alt.startsWith('Character Portrait');
          const filename = isCharacter 
            ? `character_${String(charCounter++).padStart(2, '0')}.jpg` 
            : `scene_${String(sceneCounter++).padStart(2, '0')}.jpg`;
          
          try {
              // Fetch as blob directly to handle CORS issues with toDataURL
              const response = await fetch(image.src);
              const blob = await response.blob();
              zip.file(filename, blob);
          } catch(e) {
              console.error(`Failed to fetch and add image ${image.src} to zip`, e);
          }
      }

      // Create and add a text file with all character prompts
      if (characterPortraits.length > 0) {
        const characterPromptsText = characterPortraits.map((portrait, index) => {
            const status = portrait.url ? 'Success' : 'Failed';
            return `---
Portrait #${index + 1}
Status: ${status}
Prompt: ${portrait.prompt}
---`;
        }).join('\n\n');
        
        zip.file("character_prompts.txt", characterPromptsText);
      }

      zip.generateAsync({ type: "blob" }).then(content => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(content);
          link.download = "cyoa-adventure-export.zip";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      });
  };
  
  const latestChoices = storyLog.length > 0 && storyLog[storyLog.length - 1].type === 'ai'
    ? storyLog[storyLog.length - 1].choices
    : [];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col items-center p-4">
        <div className="text-center w-full max-w-7xl mx-auto">
            <h1 className="text-4xl font-bold text-indigo-400 mb-2 tracking-wider font-serif">CYOA Game Master</h1>
            <p className="text-gray-400 mb-6">Your personal AI storyteller awaits.</p>
        </div>
        
        {gamePhase === GamePhase.SETUP ? (
            <SetupScreen 
              onStart={handleStartGame} 
              onContinue={handleLoadGame}
              onLoadFromFile={handleLoadFromFile}
              hasSavedGame={hasSavedGame}
            />
        ) : (
            <main className="w-full max-w-7xl mx-auto flex flex-row gap-6 h-[85vh]">
                <StatusSidebar 
                    portrait={latestCharacterPortrait}
                    isImageLoading={isCharacterImageLoading}
                    onRegenerate={handleRegenerateCharacterImage}
                    characterDescription={characterDescription}
                    characterClass={characterClass}
                    alignment={alignment}
                    backstory={backstory}
                />
                <GameScreen 
                    storyLog={storyLog} 
                    gamePhase={gamePhase} 
                    error={error} 
                    choices={latestChoices}
                    onPlayerAction={handlePlayerAction}
                    onRestart={handleRestart}
                    onRegenerateImage={handleRegenerateImage}
                    onSaveGame={handleSaveGame}
                    onOpenMemoryModal={() => setIsMemoryModalOpen(true)}
                    isImageGenerationEnabled={isImageGenerationEnabled}
                    onOpenGallery={() => setIsGalleryOpen(true)}
                    onUndo={handleUndo}
                    canUndo={!!previousGameState}
                    onRegenerateResponse={handleRegenerateResponse}
                    canRegenerate={!!previousGameState && storyLog.length > 0 && storyLog[storyLog.length - 1].type === 'ai'}
                    onExportPdf={() => handleExportPdf().then(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'cyoa-adventure.pdf';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    })}
                    onExportJson={handleExportJson}
                    onDownloadImages={handleDownloadImages}
                />
            </main>
        )}
        <WorldMemoryModal
          isOpen={isMemoryModalOpen}
          currentMemory={worldData}
          onClose={() => setIsMemoryModalOpen(false)}
          onSave={handleUpdateWorldMemory}
        />
        <GalleryModal
            isOpen={isGalleryOpen}
            onClose={() => setIsGalleryOpen(false)}
            images={allImages}
        />
    </div>
  );
};

export default App;
