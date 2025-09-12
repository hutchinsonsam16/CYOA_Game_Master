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

export interface WorldInfoEntry {
  key: string;
  content: string;
}

export interface StoryEntry {
  type: 'ai' | 'player';
  content: string;
  imageUrl?: string;
  imgPrompt?: string;
  isImageLoading?: boolean;
  choices?: string[];
  backgroundPrompt?: string;
}

export interface CharacterInput {
  description: string;
  characterClass: string;
  alignment: string;
  backstory: string;
  skills: string;
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
  chatHistory: { role: string, parts: { text: string }[] }[];
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
    localLlmModel: string;
}
