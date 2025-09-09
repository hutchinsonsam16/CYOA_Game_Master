import { GoogleGenAI } from "@google/genai";
import { pipeline } from '@xenova/transformers';
import { type Character, type Settings, AiServiceMode } from '../types';

// ===================================================================================
//  CONSTANTS & CONFIG
// ===================================================================================
export const artStyles: { [key: string]: string } = {
    'Photorealistic': 'Ultra-realistic, 8K resolution, sharp focus, detailed skin texture, professional studio lighting',
    'Cinematic Film': 'Shot on 35mm film, subtle grain, anamorphic lens flare, moody and atmospheric lighting, high dynamic range',
    'Digital Painting': 'Concept art style, visible brush strokes, dramatic lighting, epic fantasy aesthetic, highly detailed',
    'Anime/Manga': 'Modern anime style, vibrant colors, sharp lines, dynamic action poses, cel-shaded',
    'Cyberpunk Neon': 'Saturated neon colors, futuristic cityscape, rain-slicked streets, dystopian mood, Blade Runner aesthetic',
};

// ===================================================================================
//  IMAGE SERVICE
// ===================================================================================
class ImageService {
    private static instance: ImageService;
    private geminiAi: GoogleGenAI | null = null;
    private localGenerator: any = null;

    private constructor() {}

    public static getInstance(): ImageService {
        if (!ImageService.instance) ImageService.instance = new ImageService();
        return ImageService.instance;
    }

    public isGeminiReady(): boolean { return !!this.geminiAi; }

    public async initializeGemini(apiKey: string): Promise<void> {
        if (!apiKey) {
            this.geminiAi = null;
            return;
        }
        try {
            const ai = new GoogleGenAI({ apiKey });
            this.geminiAi = ai;
        } catch (e) {
            console.error("Gemini API Key validation failed:", e);
            this.geminiAi = null;
        }
    }

    private async initializeLocalModel(progressCallback: (progress: any) => void) {
        if (this.localGenerator) return;
        
        progressCallback({ status: `Downloading local image model (JanusPro-1B)...` });
        this.localGenerator = await pipeline('text-to-image', 'JanusPro-1B', {
            progress_callback: progressCallback,
        });
    }

    public async generateImage(prompt: string, artStyle: string, aspectRatio: '16:9' | '1:1', mode: AiServiceMode, progressCallback?: (progress: any) => void): Promise<string | undefined> {
        if (mode === 'GEMINI_API') {
            if (!this.isGeminiReady()) {
                console.warn("API call attempted without a valid Gemini API key.");
                return undefined;
            }
            const response = await this.geminiAi!.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: `${artStyle}, ${prompt}`,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio },
            });
            const base64ImageBytes = response?.generatedImages[0]?.image.imageBytes;
            return base64ImageBytes ? `data:image/jpeg;base64,${base64ImageBytes}` : undefined;
        } else {
            if (!this.localGenerator && progressCallback) {
                 await this.initializeLocalModel(progressCallback);
            }
            if (!this.localGenerator) {
                console.warn("Local image model not initialized.");
                return undefined;
            }

            const result = await this.localGenerator(prompt, { aspectRatio });
            return result.toDataURL();
        }
    };
}

export const imageService = ImageService.getInstance();
