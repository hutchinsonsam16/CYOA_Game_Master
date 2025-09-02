import type { SavedGameState } from '../types';

const SAVE_GAME_KEY = 'cyoa_saved_game';

export const saveGameState = (state: SavedGameState): void => {
  try {
    const stateString = JSON.stringify(state);
    localStorage.setItem(SAVE_GAME_KEY, stateString);
  } catch (error) {
    console.error("Failed to save game state:", error);
  }
};

export const loadGameState = (): SavedGameState | null => {
  try {
    const stateString = localStorage.getItem(SAVE_GAME_KEY);
    if (stateString === null) {
      return null;
    }
    return JSON.parse(stateString) as SavedGameState;
  } catch (error) {
    console.error("Failed to load game state:", error);
    return null;
  }
};

export const clearGameState = (): void => {
  try {
    localStorage.removeItem(SAVE_GAME_KEY);
  } catch (error) {
    console.error("Failed to clear game state:", error);
  }
};
