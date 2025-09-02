
import type { Content } from '@google/genai';

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

export interface StoryEntry {
  type: 'ai' | 'player';
  content: string;
  imageUrl?: string;
  imgPrompt?: string;
  isImageLoading?: boolean;
  choices?: string[];
}

export type CharacterInput = (
  { description: string; imageBase64?: never; mimeType?: never; } |
  { description?: never; imageBase64: string; mimeType: string; }
) & {
  characterClass?: string;
  alignment?: string;
  backstory?: string;
};

export interface CharacterPortrait {
  url?: string;
  prompt: string;
}

export interface SavedGameState {
  storyLog: StoryEntry[];
  worldData: string;
  artStyle: string;
  gameMasterMode: GameMasterMode;
  chatHistory: Content[];
  characterPortraits?: CharacterPortrait[];
  characterDescription?: string;
  characterClass?: string;
  alignment?: string;
  backstory?: string;
  isImageGenerationEnabled: boolean;
}

export interface GalleryImage {
    src: string;
    alt: string;
}
