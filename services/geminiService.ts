import { GoogleGenAI, Chat, Content, GenerateContentResponse, Type } from "@google/genai";
import { pipeline, AutoTokenizer } from '@xenova/transformers';
// FIX: Changed import to correctly handle the GameMasterMode enum as a value.
import { GameMasterMode, type WorldInfoEntry, type Character, type CharacterInput, type Settings } from '../types';

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

export const alignments = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'
];

// ===================================================================================
//  UNIFIED AI SERVICE
// ===================================================================================

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
class AiService {
    private static instance: AiService;
    public mode: AiServiceMode = 'GEMINI_API';
    private geminiAi: GoogleGenAI | null = null;
    private geminiChat: Chat | null = null;
    private history: Content[] = [];

    private localGenerator: any = null;
    private localTokenizer: any = null;

    private constructor() {}

    public static getInstance(): AiService {
        if (!AiService.instance) AiService.instance = new AiService();
        return AiService.instance;
    }

    public getMode(): AiServiceMode { return this.mode; }
    public isGeminiReady(): boolean { return !!this.geminiAi; }

    public async initializeGemini(apiKey: string): Promise<boolean> {
        if (!apiKey) { this.geminiAi = null; return false; }
        try {
            const ai = new GoogleGenAI({ apiKey });
            await withRetry(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'test' }));
            this.geminiAi = ai;
            return true;
        } catch (e) {
            console.error("Gemini API Key validation failed:", e);
            this.geminiAi = null;
            return false;
        }
    }
    
    private async initializeLocalModel(progressCallback: (progress: any) => void) {
        if (this.localGenerator && this.localTokenizer) return;
        
        const modelId = 'Xenova/phi-3-mini-4k-instruct_gguf';
        progressCallback({ status: `Downloading Tokenizer (${modelId})...` });
        this.localTokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback: progressCallback });

        progressCallback({ status: `Downloading Model (${modelId})...` });
        this.localGenerator = await pipeline('text-generation', modelId, {
            progress_callback: progressCallback,
            quantization: 'q4',
        } as any);
    }

    public startChat(mode: AiServiceMode, systemInstruction: string, history: Content[]) {
        this.mode = mode;
        this.history = [...history];
        if (mode === 'GEMINI_API' && this.geminiAi) {
            this.geminiChat = this.geminiAi.chats.create({
                model: 'gemini-2.5-flash', config: { systemInstruction }, history,
            });
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
        const stream = await withRetry(() => this.geminiChat!.sendMessageStream({ message }));
        let fullText = "";
        for await (const chunk of stream) {
            const text = chunk.text;
            fullText += text;
            onChunk(text);
        }
        this.history.push({ role: 'model', parts: [{ text: fullText }] });
        return fullText;
    }

    public async generateText(systemInstruction: string, message: string, progressCallback: (progress: any) => void): Promise<string> {
        if (this.mode !== 'LOCAL') throw new Error("Non-streaming generation is only for Local mode.");
        
        await this.initializeLocalModel(progressCallback);
        this.history.push({ role: 'user', parts: [{ text: message }] });

        const chatHistory = [
            { role: 'system', content: systemInstruction },
            ...this.history.map(c => ({
                role: c.role === 'user' ? 'user' : 'assistant',
                content: (c.parts[0] as any).text
            })),
            { role: 'user', content: message }
        ];

        const formattedPrompt = this.localTokenizer.apply_chat_template(chatHistory, { tokenize: false, add_generation_prompt: true });
        
        progressCallback({ status: 'Generating response...', file: 'Running model...' });
        const result = await this.localGenerator(formattedPrompt, { max_new_tokens: 512, do_sample: true, temperature: 0.7, top_k: 50 });
        const assistantResponse = result[0].generated_text.split('<|assistant|>').pop()?.trim() ?? '';
        
        this.history.push({ role: 'model', parts: [{ text: assistantResponse }] });
        return assistantResponse;
    }
    
    public async apiCall<T>(apiFn: (gemini: GoogleGenAI) => Promise<T>): Promise<T | null> {
        if (!this.isGeminiReady()) {
            console.warn("API call attempted without a valid Gemini API key.");
            return null;
        }
        try {
            return await withRetry(() => apiFn(this.geminiAi!));
        } catch (error) {
            console.error("An API call failed:", error);
            return null;
        }
    }
}

export const aiService = AiService.getInstance();

// ===================================================================================
//  AI HELPER FUNCTIONS
// ===================================================================================

export const formatWorldInfoToString = (worldInfo: WorldInfoEntry[]): string => worldInfo.map(entry => `## ${entry.key}\n\n${entry.content}`).join('\n\n---\n\n');

export const summarizeWorldData = async (worldInfo: WorldInfoEntry[]): Promise<string> => {
    const worldData = formatWorldInfoToString(worldInfo);
    if (!worldData.trim()) return '';
    const summarizationPrompt = `You are a world-building assistant. Summarize the following extensive world lore into a concise, dense, and informative summary that a game master AI can use as a core reference document. Focus on key locations, characters, factions, historical events, and unique rules of the world. The summary should be well-structured and easy to parse. Output ONLY the summary.\n\n--- WORLD LORE START ---\n${worldData}\n--- WORLD LORE END ---`;
    const response = await aiService.apiCall(ai => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: summarizationPrompt }));
    return response?.text.trim() ?? "Error summarizing world data.";
}

export const buildSystemInstruction = (worldSummary: string, character: Omit<Character, 'portraits'>, settings: Omit<Settings, 'generateSceneImages' | 'generateCharacterPortraits' | 'dynamicBackgrounds' | 'aiServiceMode'>): string => {
  const getModeInstruction = (mode: GameMasterMode): string => {
    switch (mode) {
      case GameMasterMode.NARRATIVE: return "Prioritize deep character development, rich world-building, and descriptive prose. Focus on dialogue, relationships, and the emotional journey.";
      case GameMasterMode.ACTION: return "Prioritize fast-paced events, high-stakes conflicts, and challenging scenarios. Keep the story moving with frequent combat, puzzles, and dangerous encounters.";
      default: return "Maintain a balanced pace, blending rich storytelling and character interaction with exciting moments of action and challenge.";
    }
  }
  
  return `
You are a master storyteller and game master for an interactive text-based CYOA game.
Your Game Master mode is: ${settings.gmMode}. ${getModeInstruction(settings.gmMode)}
--- CORE RULES ---
1.  **World Summary:** This is the core truth of the world. All generated content MUST be consistent with this summary.
    --- WORLD SUMMARY START ---
    ${worldSummary}
    --- WORLD SUMMARY END ---
2.  **Player Character:** The player's appearance is "${character.description}". Class: ${character.class}. Alignment: ${character.alignment}. Backstory: ${character.backstory}.
    **Skills:** ${JSON.stringify(character.skills)}. You MUST consider these skills when resolving actions. A character with a high skill should succeed more often or have better outcomes.
3.  **Turn-by-Turn Context:** Each prompt you receive will begin with a [CURRENT CHARACTER STATE] block and may contain a [CURRENT SCENE NPCS] block with a JSON array of characters present. You MUST use this information to inform the narrative.
4.  **Character & World Progression:** You MUST signal changes using these specific tags. Do NOT describe these changes in prose; use ONLY the tags.
    - Change character appearance: \`[char-img-prompt]A description of the new appearance.[/char-img-prompt]\`
    - Add to character's backstory/log: \`[update-backstory]A new memory or event to add.[/update-backstory]\`
    - Add an item to inventory: \`[add-item]Item Name|A description of the item.[/add-item]\`
    - Remove an item: \`[remove-item]Item Name[/remove-item]\`
    - Update a skill value: \`[update-skill]Skill Name|New Value[/update-skill]\`
5.  **NPC Management:** You are responsible for all Non-Player Characters (NPCs).
    - Introduce a new NPC: \`[create-npc]{"id": "unique_id_string", "name": "NPC Name", "description": "A brief description.", "hp": 20, "maxHp": 20, "isHostile": true}[/create-npc]\`. The 'id' MUST be a unique string (e.g., "goblin_sentry_1").
    - Update an existing NPC: \`[update-npc]{"id": "unique_id_string", "hp": 15, "isHostile": false}[/update-npc]\`. Only include fields that change.
    - Remove an NPC from the scene: \`[remove-npc]{"id": "unique_id_string"}[/remove-npc]\`.
    - You MUST describe NPC actions, attacks, and dialogue clearly within the main story text. During combat, you MUST actively manage enemy NPCs each turn.
6.  **Combat & Skill Checks:** Narrate the outcomes, but also use these tags for game mechanics.
    - For skill checks: \`[skill-check]Skill: Persuasion, Target: 15, Roll: 18, Result: Success[/skill-check]\`
    - For combat actions: \`[combat]Event: Player Attack, Target: Goblin, Roll: 16, Result: Hit, Damage: 8[/combat]\`
7.  **Image Prompts:** Generate image prompts for scenes (\`[img-prompt]A description of the scene.[/img-prompt]\`) and atmospheric backgrounds (\`[background-prompt]A short, thematic prompt like 'dark gloomy forest'.[/background-prompt]\`) that are faithful to the narrative and the art style: "${settings.artStyle}". Follow safety rules strictly.
8.  **Response Format:** Structure EVERY response in this sequence: 1. \`[background-prompt][/background-prompt]\` (MUST be first). 2. Main story text. 3. \`[img-prompt][/img-prompt]\`. 4. Any other update tags (NPCs, items, etc.). 5. 3-4 distinct and meaningful player choices in separate \`[choice][/choice]\` tags. 6. End with the exact phrase "What do you do?"
`;
};

export const generateImage = async (prompt: string, artStyle: string, aspectRatio: '16:9' | '1:1'): Promise<string | undefined> => {
    const response = await aiService.apiCall(ai => ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: `${artStyle}, ${prompt}`,
      config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio },
    }));
    const base64ImageBytes = response?.generatedImages[0]?.image.imageBytes;
    return base64ImageBytes ? `data:image/jpeg;base64,${base64ImageBytes}` : undefined;
};

export const enhanceWorldEntry = async (text: string): Promise<string> => {
    if (!text.trim()) return text;
    const prompt = `You are a creative writing assistant and world-builder. Take the following piece of lore and expand upon it. Add evocative details, sensory information, and intriguing hooks, but remain faithful to the original core concept. Make it more vivid and engaging for a fantasy story. Output ONLY the enhanced text.\n\n--- USER LORE ---\n${text}`;
    const response = await aiService.apiCall(ai => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt }));
    return response?.text.trim() || text;
};

export const structureWorldDataWithAI = async (text: string): Promise<WorldInfoEntry[]> => {
    if (!text.trim()) return [];
    const prompt = `You are a master loremaster. Analyze the following unstructured lore document and organize it into logical categories (e.g., "Major Factions", "Key Locations", "Historical Timeline", "Important Characters", "Magic System"). For each category, create a key and a content block with the relevant information. Your final output MUST be a JSON array of objects, where each object has a "key" and a "content" field.\n\n--- LORE DOCUMENT ---\n${text}\n--- END LORE DOCUMENT ---`;
    const response = await aiService.apiCall(ai => ai.models.generateContent({
        model: "gemini-2.5-flash", contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, content: { type: Type.STRING } }, required: ["key", "content"] } } },
    }));
    if (!response) return [{ key: "Imported Lore", content: text, isUnstructured: true }];
    try {
        let jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as WorldInfoEntry[];
    } catch (error) {
        console.error("Failed to structure world data with AI:", error);
        return [{ key: "Imported Lore", content: text, isUnstructured: true }];
    }
};

export const generateCharacterDetails = async (characterInput: CharacterInput): Promise<Partial<CharacterInput>> => {
    const prompt = `You are a character creation assistant for a fantasy RPG. Based on the user's input, generate a fitting class, alignment, a compelling backstory, and a set of starting skills. Return a JSON object with keys "characterClass", "alignment", "backstory", and "skills". The 'skills' should be a string like "Strength: 12, Dexterity: 14, Intelligence: 10".\n\n- **Appearance:** ${characterInput.description}\n- **Class Idea (if any):** ${characterInput.characterClass || 'None'}\n- **Alignment Idea (if any):** ${characterInput.alignment || 'None'}\n- **Backstory Idea (if any):** ${characterInput.backstory || 'None'}`;
    const response = await aiService.apiCall(ai => ai.models.generateContent({
        model: "gemini-2.5-flash", contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { characterClass: { type: Type.STRING }, alignment: { type: Type.STRING }, backstory: { type: Type.STRING }, skills: { type: Type.STRING } }, required: ["characterClass", "alignment", "backstory", "skills"] } },
    }));
    if (!response) return {};
    try {
        let jsonStr = response.text.trim();
        const details = JSON.parse(jsonStr);
        return { characterClass: details.characterClass, alignment: details.alignment, backstory: details.backstory, skills: details.skills };
    } catch (error) {
        console.error("Failed to generate character details:", error);
        return {};
    }
};

export const generateCharacterFlavor = async (character: Omit<Character, 'portraits'>): Promise<{ class: string, quirk: string }> => {
    const prompt = `You are a creative assistant. Based on the character details, suggest a more flavorful class name and a unique personality quirk. For example, instead of "Fighter", suggest "Ironclad Sellsword". The quirk should be a short, interesting character trait. Return a JSON object with two keys: "className" and "quirk".\n\n**Character Details:**\n- **Appearance:** ${character.description}\n- **Class:** ${character.class}\n- **Backstory:** ${character.backstory}`;
    const response = await aiService.apiCall(ai => ai.models.generateContent({
        model: "gemini-2.5-flash", contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { className: { type: Type.STRING }, quirk: { type: Type.STRING } }, required: ["className", "quirk"] } },
    }));
    if (!response) return { class: character.class, quirk: '' };
    try {
        let jsonStr = response.text.trim();
        const details = JSON.parse(jsonStr);
        return { class: details.className, quirk: details.quirk };
    } catch (error) {
        console.error("Failed to generate character flavor:", error);
        return { class: character.class, quirk: '' };
    }
};

export const retrieveRelevantSnippets = (query: string, worldInfo: WorldInfoEntry[], count = 3): string => {
    if (!query.trim() || worldInfo.length === 0) return '';
    const corpus = formatWorldInfoToString(worldInfo);
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