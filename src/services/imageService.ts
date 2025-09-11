import { pipeline } from '@xenova/transformers';

export const artStyles: { [key: string]: string } = {
    'Photorealistic': 'Ultra-realistic, 8K resolution, sharp focus, detailed skin texture, professional studio lighting',
    'Cinematic Film': 'Shot on 35mm film, subtle grain, anamorphic lens flare, moody and atmospheric lighting, high dynamic range',
    'Digital Painting': 'Concept art style, visible brush strokes, dramatic lighting, epic fantasy aesthetic, highly detailed',
    'Anime/Manga': 'Modern anime style, vibrant colors, sharp lines, dynamic action poses, cel-shaded',
    'Cyberpunk Neon': 'Saturated neon colors, futuristic cityscape, rain-slicked streets, dystopian mood, Blade Runner aesthetic',
};

class ImageService {
    private static instance: ImageService;
    private localGenerator: any = null;

    private constructor() {}

    public static getInstance(): ImageService {
        if (!ImageService.instance) ImageService.instance = new ImageService();
        return ImageService.instance;
    }

    private async initializeLocalModel(progressCallback: (progress: any) => void) {
        if (this.localGenerator) return;
        
        progressCallback({ status: `Loading local image model (Stable Diffusion)...` });
        this.localGenerator = await pipeline('text-to-image', 'Xenova/stable-diffusion-2-1-base', {
            progress_callback: progressCallback,
        });
    }

    public async generateImage(prompt: string, artStyle: string, progressCallback: (progress: any) => void): Promise<string | undefined> {
        if (!this.localGenerator) {
            await this.initializeLocalModel(progressCallback);
        }
        
        progressCallback({ status: 'Generating local image...' });
        // Local models don't typically support aspect ratio, so we remove it.
        // We combine the art style and prompt for the local model.
        const fullPrompt = `${artStyle}, ${prompt}`;
        const result = await this.localGenerator(fullPrompt);
        
        // transformers.js pipeline returns an object with a `toDataURL` method
        const canvas = document.createElement('canvas');
        canvas.width = result.width;
        canvas.height = result.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(result, 0, 0);
          return canvas.toDataURL();
        }
        return undefined;
    };
}

export const imageService = ImageService.getInstance();
