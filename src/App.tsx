import React, { useState, useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
    GamePhase, GameMasterMode,
    type AiServiceMode, type WorldInfoEntry, type StoryEntry, type CharacterInput, type Character,
    type CharacterPortrait, type InventoryItem, type NPC, type SavedGameState, type Settings, type AppState, type Action
} from './types';

import {
    llmService, alignments, buildSystemInstruction, enhanceWorldEntry, structureWorldDataWithAI,
    generateCharacterDetails, retrieveRelevantSnippets, formatWorldInfoToString, summarizeWorldData
} from './services/llmService';
import {
    imageService, artStyles
} from './services/imageService';
import { saveGameState, loadGameState, clearGameState } from './services/storageService';


// NOTE: The rest of the App.tsx file contains many components.
// The primary changes are in the main `App` component's logic and how it interacts with the services.
// I will provide the essential changes to the main component logic. The UI components (StoryBlock, SetupScreen, etc.)
// can remain largely the same, but I'll correct the key interaction points.

// In the App.tsx file, find the main `App` functional component and update its useEffect and handler functions
// as shown below.

const App: React.FC = () => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    // ... other state hooks ...

    // Correctly Memoize API key availability
    const isApiKeyAvailable = useMemo(() => !!process.env.GEMINI_API_KEY, []);

    useEffect(() => {
        const loadedState = loadGameState();
        if (loadedState) {
            dispatch({ type: 'SET_HAS_SAVED_GAME', payload: true });
            if (loadedState.settings.aiServiceMode === 'GEMINI_API' && !isApiKeyAvailable) {
                loadedState.settings.aiServiceMode = 'LOCAL';
                // ... handle notification ...
            }
        }

        if (isApiKeyAvailable) {
            llmService.initializeGemini(process.env.GEMINI_API_KEY!).then(isValid => {
                if (!isValid) {
                     // ... handle invalid key notification ...
                }
            });
            imageService.initializeGemini(process.env.GEMINI_API_KEY!);
        }
    }, [isApiKeyAvailable]);


    const handleStartGame = useCallback(async (worldInfo: WorldInfoEntry[], worldSummary: string | null, characterInput: CharacterInput, initialPrompt: string, settings: Settings) => {
        dispatch({ type: 'SET_PHASE', payload: GamePhase.LOADING });
        try {
            // ... (rest of the logic is mostly fine, but ensure it uses the corrected llmService)
            let summary = worldSummary;
            if (!summary && settings.aiServiceMode === 'GEMINI_API') {
                dispatch({ type: 'SET_LOADING_MESSAGE', payload: 'Summarizing world lore...' });
                summary = await summarizeWorldData(worldInfo);
            } else if (!summary) {
                summary = formatWorldInfoToString(worldInfo);
            }
            
            // The rest of handleStartGame is okay, ensure it uses the new `localLlmModel` from settings
            // when calling llmService.startChat in local mode.
        } catch (e: any) {
            // ... error handling ...
        }
    }, [handlePlayerAction, handleUpdateCharacterImage]);
    
    // ... The rest of the component ...
    // Make sure to pass the `localLlmModel` from settings to the `generateText` call in `handlePlayerAction` for LOCAL mode.
    
    // In handlePlayerAction, update the LOCAL mode branch:
    // ...
    // } else { // LOCAL MODE
    //     const systemInstruction = buildSystemInstruction(state.worldSummary, state.character, state.settings);
    //     const progressCallback = (progress: any) => {
    //         //...
    //     }
    //     fullResponseText = await llmService.generateText(state.settings.localLlmModel, systemInstruction, message, progressCallback);
    // }
    // ...
};

// Also, in the SetupScreen component within App.tsx, update the local model dropdown to use the new list.
const SetupScreen: React.FC<{
    //...
}> = ({ onStart, onContinue, onLoadFromFile, hasSavedGame }) => {
    //...
    const localModelOptions = useMemo(() => Object.entries(llmService.localModels ?? {}), []);
    // Ensure the initial state for settings uses the first model from the new list
    const [settings, setSettings] = useState<Settings>({
        //...
        aiServiceMode: isApiKeyAvailable ? 'GEMINI_API' : 'LOCAL',
        localLlmModel: localModelOptions[0]?.[1] ?? '', // Correct initialization
    });
    //...
}

export default App;
