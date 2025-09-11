import { pipeline, env } from '@xenova/transformers';
import { GameMasterMode, type WorldInfoEntry, type Character, type Settings } from '../types';

// Ensure transformers.js uses the models you've downloaded
env.allowRemoteModels = false;
env.localDir = './models';

export const alignments = [
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'
];

class LlmService {
    private static instance: LlmService;
    private history: { role: string, parts: { text: string }[] }[] = [];
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

    private async initializeLocalModel(modelId: string, progressCallback: (progress: any) => void) {
        if (this.localGenerator && this.currentLocalModel === modelId) return;

        progressCallback({ status: `Loading model (${modelId})...` });
        this.localGenerator = await pipeline('text-generation', modelId, {
            progress_callback: progressCallback,
        });
        this.currentLocalModel = modelId;
    }

    public startChat(history: { role: string, parts: { text: string }[] }[]) {
        this.history = [...history];
    }

    public getHistory() {
        return this.history;
    }

    public async generateText(modelId: string, systemInstruction: string, message: string, progressCallback: (progress: any) => void): Promise<string> {
        await this.initializeLocalModel(modelId, progressCallback);
        
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
}

export const llmService = LlmService.getInstance();

export const formatWorldInfoToString = (worldInfo: WorldInfoEntry[]): string => worldInfo.map(entry => `## ${entry.key}\n\n${entry.content}`).join('\n\n---\n\n');

export const buildSystemInstruction = (worldSummary: string, character: Omit<Character, 'portraits'>, settings: Omit<Settings, 'generateSceneImages' | 'generateCharacterPortraits' | 'dynamicBackgrounds'>): string => {
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
