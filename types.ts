import type { Content } from "@google/genai";

export enum GamePhase {
  SETUP = 'SETUP',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR',
}

export enum GameMasterMode {
  BALANCED = 'Balanced',
  NARRATIVE = 'Narrative Focus',
  ACTION = 'Action Focus',
}

export type AiServiceMode = 'LOCAL' | 'GEMINI_API';

export interface WorldInfoEntry {
  key: string;
  content: string;
  isUnstructured?: boolean;
}

export interface StoryEntry {
  type: 'ai' | 'player';
  content: string;
  imageUrl?: string;
  imgPrompt?: string;
  isImageLoading?: boolean;
  choices?: string[];
  isStreaming?: boolean;
  backgroundPrompt?: string;
}

export interface CharacterInput {
  description: string;
  characterClass?: string;
  alignment?: string;
  backstory?: string;
  skills?: string;
}

export interface Character {
  portraits: CharacterPortrait[];
  description: string;
  class: string;
  alignment: string;
  backstory: string;
  skills: Record<string, number>;
}

export interface CharacterPortrait {
  url?: string;
  prompt: string;
}

export interface InventoryItem {
  name: string;
  description: string;
}

export interface NPC {
  id: string;
  name: string;
  description: string;
  hp: number;
  maxHp: number;
  isHostile: boolean;
}

export interface SavedGameState {
  storyLog: StoryEntry[];
  worldInfo: WorldInfoEntry[];
  worldSummary: string;
  chatHistory: Content[];
  character: Character;
  inventory: InventoryItem[];
  npcs: NPC[];
  settings: Settings;
}

export interface Settings {
    generateSceneImages: boolean;
    generateCharacterPortraits: boolean;
    dynamicBackgrounds: boolean;
    gmMode: GameMasterMode;
    artStyle: string;
    aiServiceMode: AiServiceMode;
}


// Reducer Types

export interface AppState {
    gamePhase: GamePhase;
    storyLog: StoryEntry[];
    error: string | null;
    worldInfo: WorldInfoEntry[];
    worldSummary: string;
    settings: Settings;
    character: Character;
    inventory: InventoryItem[];
    npcs: NPC[];
    isCharacterImageLoading: boolean;
    loadingMessage: string;
    hasSavedGame: boolean;
};

export type Action =
    | { type: 'START_NEW_GAME'; payload: { worldInfo: WorldInfoEntry[]; worldSummary: string; character: Character; settings: Settings; } }
    | { type: 'LOAD_GAME'; payload: SavedGameState }
    | { type: 'SET_PHASE'; payload: GamePhase }
    | { type: 'SET_LOADING_MESSAGE'; payload: string }
    | { type: 'SET_ERROR'; payload: string }
    | { type: 'PLAYER_ACTION'; payload: string }
    | { type: 'STREAM_CHUNK'; payload: string }
    | { type: 'FINISH_TURN'; payload: { entry: StoryEntry; character?: Partial<Character>; inventory?: InventoryItem[]; skillUpdates?: Record<string, number>; npcUpdates?: { created: NPC[], updated: Partial<NPC>[], removed: string[] } } }
    | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
    | { type: 'UPDATE_SCENE_IMAGE'; payload: { index: number, imageUrl?: string, isLoading: boolean } }
    | { type: 'UPDATE_CHARACTER_IMAGE_STATUS'; payload: boolean }
    | { type: 'UPDATE_CHARACTER'; payload: Partial<Character> }
    | { type: 'SET_HAS_SAVED_GAME'; payload: boolean }
