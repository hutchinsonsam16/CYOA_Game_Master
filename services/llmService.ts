import { GoogleGenerativeAI, ChatSession, Content } from "@google/generative-ai";
import { pipeline, env } from '@xenova/transformers';
import { GameMasterMode, type WorldInfoEntry, type Character, type CharacterInput, type Settings } from '../types';

// Disable remote model downloads in production to use local models
env.allowRemoteModels = false;
env.localDir = './models';


export const alignments = [
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'
];

const withRetry = async <T,>(apiCall: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
    let attempt = 1;
    let delay = initialDelay;
    while (attempt <= maxRetries) {
        try {
            return await apiCall();
        } catch (error: any) {
            const isRateLimitError = error.toString().includes('429') || error.toString().toLowerCase().includes('rate limit') || error.toString().toLowerCase().includes('resource_exhausted');
            if (isRateLimitError && attempt < maxRetries) {
                console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                attempt++;
            } else {
                throw error;
            }
        }
    }
    throw new Error('Exceeded maximum retry attempts');
};

type AiServiceMode = 'LOCAL' | 'GEMINI_API';
class LlmService {
    private static instance: LlmService;
    public mode: AiServiceMode = 'GEMINI_API';
    private genAI: GoogleGenerativeAI | null = null;
    private geminiChat: ChatSession | null = null;
    private history: Content[] = [];

    private localGenerator: any = null;
    private currentLocalModel: string | null = null;

    public static localModels = {
        'DistilGPT-2 (Fastest)': 'Xenova/distilgpt2',
        'LaMini-Flan-T5 (Balanced)': 'Xenova/LaMini-Flan-T5-783M',
        'Pythia-1.4B (Smarter)': 'Xenova/pythia-1.4b-deduped',
        'GPT-2 (Classic)': 'Xenova/gpt2',
    };

    private constructor() {}

    public static getInstance(): LlmService {
        if (!LlmService.instance) LlmService.instance = new LlmService();
        return LlmService.instance;
    }

    public getMode(): AiServiceMode { return this.mode; }
    public isGeminiReady(): boolean { return !!this.genAI; }

    public async initializeGemini(apiKey: string): Promise<boolean> {
        if (!apiKey) { this.genAI = null; return false; }
        try {
            const ai = new GoogleGenerativeAI(apiKey);
            // Quick test to see if the key is valid
            await withRetry(() => ai.getGenerativeModel({ model: "gemini-pro" }).generateContent("test"));
            this.genAI = ai;
            return true;
        } catch (e) {
            console.error("Gemini API Key validation failed:", e);
            this.genAI = null;
            return false;
        }
    }

    private async initializeLocalModel(modelId: string, progressCallback: (progress: any) => void) {
        if (this.localGenerator && this.currentLocalModel === modelId) return;

        progressCallback({ status: `Loading model (${modelId})...` });

        this.localGenerator = await pipeline('text-generation', modelId, {
            progress_callback: progressCallback,
        });

        this.currentLocalModel = modelId;
    }

    public startChat(mode: AiServiceMode, systemInstruction: string, history: Content[]) {
        this.mode = mode;
        this.history = [...history];
        if (mode === 'GEMINI_API' && this.genAI) {
            const model = this.genAI.getGenerativeModel({ model: "gemini-pro", systemInstruction });
            this.geminiChat = model.startChat({ history });
        } else {
            this.geminiChat = null;
        }
    }

    public getHistory(): Content[] {
        return this.history;
    }

    public async generateTextStream(message: string, onChunk: (chunk: string) => void): Promise<string> {
        if (this.mode !== 'GEMINI_API' || !this.geminiChat) {
            throw new Error("Streaming is only supported in Gemini API mode.");
        }
        this.history.push({ role: 'user', parts: [{ text: message }] });
        const result = await withRetry(() => this.geminiChat!.sendMessageStream(message));

        let fullText = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            onChunk(chunkText);
        }
        this.history.push({ role: 'model', parts: [{ text: fullText }] });
        return fullText;
    }

    public async generateText(modelId: string, systemInstruction: string, message: string, progressCallback: (progress: any) => void): Promise<string> {
        if (this.mode !== 'LOCAL') throw new Error("Non-streaming generation is only for Local mode.");

        await this.initializeLocalModel(modelId, progressCallback);
        
        // For local models, we create a simplified prompt including the system instruction and history
        const fullPrompt = `${systemInstruction}\n\n${this.history.map(h => `${h.role}: ${h.parts[0].text}`).join('\n')}\n\nuser: ${message}\nmodel:`;
        this.history.push({ role: 'user', parts: [{ text: message }] });
        
        progressCallback({ status: 'Generating response...', file: 'Running model...' });

        const result = await this.localGenerator(fullPrompt, {
            max_new_tokens: 300,
            do_sample: true,
            temperature: 0.7,
            top_k: 50
        });

        const assistantResponse = result[0].generated_text.replace(fullPrompt, '').trim();
        this.history.push({ role: 'model', parts: [{ text: assistantResponse }] });
        return assistantResponse;
    }

    public async apiCall<T>(apiFn: (ai: GoogleGenerativeAI) => Promise<T>): Promise<T | null> {
        if (!this.isGeminiReady() || !this.genAI) {
            console.warn("API call attempted without a valid Gemini API key.");
            return null;
        }
        try {
            return await withRetry(() => apiFn(this.genAI!));
        } catch (error) {
            console.error("An API call failed:", error);
            return null;
        }
    }
}

export const llmService = LlmService.getInstance();

export const formatWorldInfoToString = (worldInfo: WorldInfoEntry[]): string => worldInfo.map(entry => `## ${entry.key}\n\n${entry.content}`).join('\n\n---\n\n');

export const summarizeWorldData = async (worldInfo: WorldInfoEntry[]): Promise<string> => {
    const worldData = formatWorldInfoToString(worldInfo);
    if (!worldData.trim()) return '';
    const summarizationPrompt = `Summarize the following world lore into a concise reference document for a game master AI. Focus on key locations, characters, factions, and rules. Output ONLY the summary.\n\n--- WORLD LORE ---\n${worldData}`;
    const response = await llmService.apiCall(ai => ai.getGenerativeModel({ model: "gemini-pro" }).generateContent(summarizationPrompt));
    if (!response) return "Error summarizing world data.";
    return response.response.text().trim();
}

export const buildSystemInstruction = (worldSummary: string, character: Omit<Character, 'portraits'>, settings: Omit<Settings, 'generateSceneImages' | 'generateCharacterPortraits' | 'dynamicBackgrounds' | 'aiServiceMode'>): string => {
    const getModeInstruction = (mode: GameMasterMode): string => {
        switch (mode) {
            case GameMasterMode.NARRATIVE: return "Prioritize deep character development, rich world-building, and descriptive prose.";
            case GameMasterMode.ACTION: return "Prioritize fast-paced events, high-stakes conflicts, and challenging scenarios.";
            default: return "Maintain a balanced pace, blending rich storytelling with exciting action.";
        }
    }

    return `You are a master storyteller and game master for an interactive text-based CYOA game.
Your Game Master mode is: ${settings.gmMode}. ${getModeInstruction(settings.gmMode)}
--- CORE RULES ---
1.  **World Summary:** Adhere strictly to this summary.
    --- WORLD SUMMARY START ---
    ${worldSummary}
    --- WORLD SUMMARY END ---
2.  **Player Character:** Description: "${character.description}". Class: ${character.class}. Alignment: ${character.alignment}. Backstory: ${character.backstory}.
    **Skills:** ${JSON.stringify(character.skills)}. Use these skills to resolve actions fairly.
3.  **Progression Tags:** Signal changes using ONLY these tags, not prose.
    - Change appearance: [char-img-prompt]New appearance description.[/char-img-prompt]
    - Add backstory: [update-backstory]New memory or event.[/update-backstory]
    - Add item: [add-item]Item Name|Item description.[/add-item]
    - Remove item: [remove-item]Item Name[/remove-item]
    - Update skill: [update-skill]Skill Name|New Value[/update-skill]
4.  **NPC Management:**
    - Create: [create-npc]{"id": "unique_id", "name": "NPC Name", "description": "...", "hp": 10, "maxHp": 10, "isHostile": false}[/create-npc]
    - Update: [update-npc]{"id": "unique_id", "hp": 8}[/update-npc]
    - Remove: [remove-npc]{"id": "unique_id"}[/remove-npc]
5.  **Image & Choice Format:**
    - Generate a scene description: [img-prompt]A description of the scene for an image model.[/img-prompt]
    - Generate an atmospheric background prompt: [background-prompt]A short, thematic prompt like 'dark gloomy forest'.[/background-prompt]
    - Provide 3-4 meaningful choices in separate [choice][/choice] tags.
    - End EVERY response with the exact phrase "What do you do?"
`;
};

// ... (The rest of the helper functions: enhanceWorldEntry, structureWorldDataWithAI, etc. remain largely the same but should use the updated llmService.apiCall)
export const enhanceWorldEntry = async (text: string): Promise<string> => {
    if (!text.trim()) return text;
    const prompt = `You are a creative writing assistant. Expand upon the following lore, adding evocative details while staying true to the core concept. Output ONLY the enhanced text.\n\n--- LORE ---\n${text}`;
    const response = await llmService.apiCall(ai => ai.getGenerativeModel({ model: "gemini-pro" }).generateContent(prompt));
    return response?.response.text().trim() || text;
}

export const structureWorldDataWithAI = async (text: string): Promise<WorldInfoEntry[]> => {
    if (!text.trim()) return [];
    const prompt = `Analyze the following unstructured lore and organize it into logical categories (e.g., "Factions", "Locations", "History"). Output a JSON array of objects, each with a "key" and a "content" field.\n\n--- LORE ---\n${text}`;
    const response = await llmService.apiCall(ai => ai.getGenerativeModel({ model: "gemini-pro" }).generateContent(prompt));
    if (!response) return [{ key: "Imported Lore", content: text, isUnstructured: true }];
    try {
        let jsonStr = response.response.text().trim();
        // The model might wrap the JSON in ```json ... ```, so we need to strip that
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/```$/, '');
        return JSON.parse(jsonStr) as WorldInfoEntry[];
    } catch (error) {
        console.error("Failed to structure world data with AI:", error);
        return [{ key: "Imported Lore", content: text, isUnstructured: true }];
    }
};

export const generateCharacterDetails = async (characterInput: CharacterInput): Promise<Partial<CharacterInput>> => {
    const prompt = `Generate a class, alignment, backstory, and starting skills for a fantasy character. Return a JSON object with keys "characterClass", "alignment", "backstory", and "skills" (e.g., "Strength: 12, Dexterity: 14").\n\n- **Appearance:** ${characterInput.description}\n- **Ideas:** ${characterInput.characterClass}, ${characterInput.alignment}, ${characterInput.backstory}`;
    const response = await llmService.apiCall(ai => ai.getGenerativeModel({ model: "gemini-pro" }).generateContent(prompt));
    if (!response) return {};
    try {
        let jsonStr = response.response.text().trim().replace(/^```json\s*/, '').replace(/```$/, '');
        const details = JSON.parse(jsonStr);
        return { characterClass: details.characterClass, alignment: details.alignment, backstory: details.backstory, skills: details.skills };
    } catch (error) {
        console.error("Failed to generate character details:", error);
        return {};
    }
};

export const retrieveRelevantSnippets = (query: string, worldInfo: WorldInfoEntry[], count = 3): string => {
    if (!query.trim() || worldInfo.length === 0) return '';
    const corpus = formatWorldInfoToString(worldInfo);
    // Basic sentence splitting
    const sentences = corpus.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s/);
    const queryWords = new Set(query.toLowerCase().match(/\b(\w+)\b/g) || []);
    if (queryWords.size === 0) return '';

    const scoredSentences = sentences.map(sentence => {
        const sentenceWords = new Set(sentence.toLowerCase().match(/\b(\w+)\b/g) || []);
        const score = [...sentenceWords].filter(word => queryWords.has(word)).length;
        return { sentence, score };
    }).filter(item => item.score > 0);

    scoredSentences.sort((a, b) => b.score - a.score);
    return scoredSentences.slice(0, count).map(item => item.sentence).join('\n');
};
