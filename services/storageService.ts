import type { SavedGameState } from '../types';

export const SAVE_GAME_KEY = 'cyoa_saved_game_v4';

export const saveGameState = (state: SavedGameState): void => {
  try {
    const stateString = JSON.stringify(state);
    localStorage.setItem(SAVE_GAME_KEY, stateString);
  } catch (error: any) {
    console.error("Failed to save game state:", error);
  }
};

export const loadGameState = (): SavedGameState | null => {
  try {
    const stateString = localStorage.getItem(SAVE_GAME_KEY);
    if (stateString === null) return null;
    const state = JSON.parse(stateString) as any; 

    // Data migration for older save formats
    if (state.fullWorldData && !state.worldInfo) {
      state.worldInfo = [{ key: 'Imported Lore', content: state.fullWorldData, enabled: true }];
      delete state.fullWorldData;
    }
    
    // Ensure essential keys exist with default values
    if (!state.worldInfo || !Array.isArray(state.worldInfo)) {
        state.worldInfo = [];
    }
    if (!state.settings.aiServiceMode) {
        state.settings.aiServiceMode = !!process.env.API_KEY ? 'GEMINI_API' : 'LOCAL';
    }
    if (!state.npcs) {
        state.npcs = [];
    }

    return state as SavedGameState;
  } catch (error: any) {
    console.error("Failed to load game state:", error);
    localStorage.removeItem(SAVE_GAME_KEY); 
    return null;
  }
};

export const clearGameState = (): void => {
  try {
    localStorage.removeItem(SAVE_GAME_KEY);
  } catch (error: any) {
    console.error("Failed to clear game state:", error);
  }
};
