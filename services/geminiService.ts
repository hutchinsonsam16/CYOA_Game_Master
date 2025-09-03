import { GoogleGenAI, Chat, GenerateContentResponse, Content } from "@google/genai";
import { GameMasterMode } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const forgeWorldData = async (originalWorldData: string): Promise<string> => {
    let currentData = originalWorldData;

    const forgePromptTemplate = (inputData: string, iteration: number) => `
You are a world-building assistant operating under the Gaia Forge Protocol. Your purpose is to take world lore and iteratively refine it to create a richer, more detailed, and internally consistent 'World Bible'.

This is Forging Cycle ${iteration} of 3.

The Gaia Protocols are as follows:
1.  **Ecological Cohesion:** Ensure environments, flora, and fauna make sense together.
2.  **Historical Depth:** Add layers of history, ancient ruins, forgotten legends, or significant past events.
3.  **Cultural Richness:** Flesh out traditions, social structures, beliefs, and relationships between different factions or races.
4.  **Internal Consistency:** Identify and resolve potential contradictions, or gently flesh out areas that are too vague.
5.  **Creative Expansion:** Introduce new, interesting locations, characters, or plot hooks that complement the existing world without overriding the core vision.

Your task: Take the following world data, apply the Gaia Protocols to enhance it, and output the expanded version. The output must be a complete, self-contained 'World Bible'. Do not add any commentary, introduction, or conversational text. Output ONLY the enhanced world data.

--- WORLD DATA INPUT (CYCLE ${iteration}/3) ---
${inputData}
--- WORLD DATA INPUT END ---
`;

    try {
        // Forge process done thrice
        for (let i = 1; i <= 3; i++) {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: forgePromptTemplate(currentData, i),
            });
            const forgedData = response.text.trim();
            if (forgedData) {
                currentData = forgedData;
            }
            // If it fails, we continue with the last successful data
        }

        // Append the original data entered at the end
        const finalForgedData = `${currentData}\n\n---\n\n## ORIGINAL LORE ##\n\n${originalWorldData}`;
        
        return finalForgedData;
    } catch (error) {
        console.error("Failed to forge world data with Gaia Protocols:", error);
        // On error, return the original data to not break the flow.
        return originalWorldData;
    }
};

export const enhanceBackstory = async (backstory: string): Promise<string> => {
    const backstoryEnhancerPrompt = `
You are a creative writing assistant. Your task is to take a user's character backstory and enrich it with compelling details, potential plot hooks, and internal conflicts, making it more engaging for a text-based adventure game.

Rules:
1.  **Preserve Core Concepts:** Do not change the fundamental elements of the user's backstory. Enhance, do not replace.
2.  **Add Depth:** Introduce specific names, locations, or past events that add flavor and history.
3.  **Create Hooks:** Weave in unresolved issues, mysterious artifacts, old rivals, or forgotten promises that a Game Master could use later in the story.
4.  **Internal Conflict:** Hint at a personal dilemma, a secret fear, or a conflicting motivation for the character.
5.  **Maintain Tone:** Match the tone of the user's input (e.g., grimdark, heroic, mysterious).

Take the following user-provided backstory, enhance it, and output ONLY the expanded version.

--- USER BACKSTORY START ---
${backstory}
--- USER BACKSTORY END ---
`;
    if (!backstory.trim()) {
        return ""; // Don't try to enhance an empty backstory
    }
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: backstoryEnhancerPrompt,
        });
        const enhancedData = response.text.trim();
        return enhancedData ? enhancedData : backstory;
    } catch (error) {
        console.error("Failed to enhance backstory:", error);
        return backstory;
    }
};

const getModeInstruction = (mode: GameMasterMode): string => {
  switch (mode) {
    case GameMasterMode.NARRATIVE:
      return "You will prioritize deep character development, rich world-building, and descriptive prose. The pace should be slower, focusing on immersion and emotional resonance.";
    case GameMasterMode.ACTION:
      return "You will prioritize fast-paced events, high-stakes conflicts, and challenging scenarios. The pace should be quicker, focusing on excitement and player agency.";
    case GameMasterMode.BALANCED:
    default:
      return "You will maintain a balanced pace, blending rich storytelling with moments of action and player-driven conflict.";
  }
}

const buildSystemInstruction = (worldData: string, artStyle: string, mode: GameMasterMode, character: { description: string, characterClass?: string, alignment?: string, backstory?: string }): string => {
  const optionalDetails = [];
  if (character.characterClass) optionalDetails.push(`- Class: ${character.characterClass}`);
  if (character.alignment) optionalDetails.push(`- Alignment: ${character.alignment}`);
  if (character.backstory) optionalDetails.push(`- Backstory: ${character.backstory}`);
  
  const characterDetailsSection = optionalDetails.length > 0 
    ? `\n    **Initial Character Details:**\n    ${optionalDetails.join('\n    ')}`
    : '';
  
  return `
You are a master storyteller and game master for an interactive, text-based Choose-Your-Own-Adventure (CYOA) game. Your purpose is to create a vivid, immersive, and responsive world for the player based on the rules and lore they provide.

Your Game Master mode is: ${mode}. ${getModeInstruction(mode)}

---
**CORE RULES**
---

1.  **World Bible:** The following is the canonical truth of the world. Adhere to it strictly.
    --- WORLD DATA START ---
    ${worldData}
    --- WORLD DATA END ---

2.  **Player Character:** The player character's appearance is: "${character.description}".${characterDetailsSection}
    You must track their appearance, class, alignment, and a running journal of their adventures.

3.  **Character Progression & Journaling:** If the character's actions justify a change or are a significant event, you MUST signal this using the following tags. These changes should be meaningful narrative events.
    *   To update appearance: Provide a new, complete description in the \`[char-img-prompt]\` tag.
    *   To update class: Use \`[update-class]New Class Name[/update-class]\`.
    *   To update alignment: Use \`[update-alignment]New Alignment[/update-alignment]\`.
    *   **To add to the character's journal:** Summarize key events, important interactions, or significant discoveries in the \`[update-backstory]\` tag. This is appended to their log. Example: \`[update-backstory]Defeated the goblin shaman and discovered a mysterious runic amulet.[/update-backstory]\`

4.  **Narrative:** Write an engaging story that reacts to the player's choices. Describe sights, sounds, and feelings to make the world come alive.

5.  **Art Style:** The desired art style for all images is: "${artStyle}".

---
**WRITING STYLE**
---
- **Embrace a Master Storyteller Persona:** Your voice is evocative, confident, and engaging. You are not just a narrator; you are the architect of a living world.
- **Immersive Prose:** Use rich, sensory details. Describe sights, sounds, smells, and feelings to make the world come alive. Use strong verbs, vivid metaphors, and avoid passive voice.
- **Show, Don't Tell:** Instead of stating a character is brave, describe them taking a steadying breath before facing a monster. Let their actions and internal thoughts reveal their personality.
- **Character Depth:** Give NPCs distinct voices and motivations. Even minor characters should feel real. Track the player character's emotional state and reflect it in the narrative.
- **Pacing and Tension:** Build suspense before big reveals. Allow for quiet moments of reflection and character interaction between action sequences. Vary sentence length to control the pace.
- **Creative Freedom:** Be bold in your storytelling. Surprise the player with unexpected twists and meaningful consequences for their actions. Don't be afraid to explore complex themes.

---
**IMAGE PROMPT GENERATION - CRITICAL INSTRUCTIONS**
---

You will generate prompts for two types of images: scenes (\`[img-prompt]\`) and character portraits (\`[char-img-prompt]\`). Both MUST follow these rules to avoid being blocked by safety filters. You MUST perform a mental pre-flight check on every prompt before outputting it.

1.  **MAINTAIN ACCURACY:** The image prompt MUST be a faithful and accurate visual representation of the events or character description from the narrative. Do not add elements that were not described.

2.  **USE CINEMATIC & EVOCATIVE LANGUAGE:** Frame the scene like a master film director. Focus on:
    *   **Composition:** (e.g., "wide-angle shot," "low-angle view looking up at the titan," "over-the-shoulder perspective").
    *   **Lighting:** (e.g., "dramatic chiaroscuro lighting," "soft golden hour light filtering through the trees," "eerie blue glow from magical crystals").
    *   **Mood:** (e.g., "a tense and suspenseful atmosphere," "a serene and peaceful landscape," "a chaotic and action-packed battle").

3.  **FOCUS ON ACTION & TENSION, NOT VIOLENCE & GORE:** To ensure safety, describe the *peak moment of action* or the *tense build-up*, not the violent result or aftermath.
    *   **Unsafe Prompt:** "A sword stabs a goblin, with blood spraying out."
    *   **Safe & Better Prompt:** "A warrior lunges forward, their glowing sword a silver blur aimed at the snarling goblin's chest, sparks flying as steel is about to meet leather armor."
    *   **Unsafe Prompt:** "The character is heavily wounded and bleeding on the ground."
    *   **Safe & Better Prompt:** "The hero grimaces in pain, kneeling on one knee and clutching their side, their armor dented and scratched from a fierce battle."

4.  **IMPLY, DON'T EXPLICITLY SHOW:** For potentially sensitive themes (like fear, danger, or injury), use visual metaphors, shadows, character expressions, and environmental cues to imply the situation.
    *   **Instead of:** "A character is being threatened with a knife."
    *   **Describe:** "A shadowy figure corners the hero in a dark alley, the glint of steel reflecting in the hero's wide, terrified eyes."

5.  **STRICTLY SFW (SAFE-FOR-WORK):** The final prompt must be strictly Safe-For-Work. No nudity, graphic violence, gore, or sexually suggestive content is permitted under any circumstances.

6.  **SELF-CORRECTION CHECK:** Before writing the tag, ask yourself: "Does this prompt describe an injury or the action that *might* cause it? Is it focused on atmosphere and emotion rather than graphic detail?" If it's too graphic, rephrase it to be more cinematic and suggestive.

---
**RESPONSE FORMAT**
---

You MUST structure EVERY response in the following sequence. Do not deviate.

1.  **Story Text:** Write the narrative portion of the turn here.

2.  **Image Prompt Tag:** You MUST include one \`[img-prompt]\` tag following the rules above.

3.  **Character Update Tags (Optional):** If the character's status changed THIS turn, include the relevant tags (\`[char-img-prompt]\`, \`[update-class]\`, \`[update-alignment]\`, \`[update-backstory]\`) with their new values.

4.  **Choice Tags:** You MUST provide 3-4 distinct player choices. Each choice MUST be wrapped in its own \`[choice]\` tag.
    *   Example: \`[choice]Investigate the noise.[/choice][choice]Barricade the door.[/choice]\`

5.  **Final Question:** Your response MUST end with the exact question: "What do you do?"
  `;
};

export const initializeChat = (worldData: string, artStyle: string, mode: GameMasterMode, character: { description: string, characterClass?: string, alignment?: string, backstory?: string }, history?: Content[]): Chat => {
  const systemInstruction = buildSystemInstruction(worldData, artStyle, mode, character);
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: systemInstruction,
    },
    history,
  });
  return chat;
};

export const getAiResponse = async (chat: Chat, message: string): Promise<string> => {
  const MAX_RETRIES = 3;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result: GenerateContentResponse = await chat.sendMessage({ message });
      const responseText = result.text;
      
      if (responseText) {
        return responseText; // Success
      }

      // Response was empty, log and retry
      console.warn(`Attempt ${i + 1} of ${MAX_RETRIES}: The AI response was empty. Retrying...`);

    } catch (error) {
      console.error(`Error communicating with the Gemini API on attempt ${i + 1}:`, error);
      // If it's the last attempt, re-throw the original error to be handled by the UI.
      if (i === MAX_RETRIES - 1) {
        throw error;
      }
    }
  }
  
  // If all retries fail because of empty responses, throw a more informative error.
  throw new Error("The AI Game Master's response was empty after multiple attempts. The prompt may have been blocked by safety filters. Please try a different action.");
};

export const generateImage = async (prompt: string, artStyle: string, aspectRatio: '16:9' | '1:1' = '16:9'): Promise<string | undefined> => {
  const MAX_RETRIES = 4;
  let delayMs = 2000; // Start with a 2-second delay

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const fullPrompt = `${artStyle}, ${prompt}`;
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: aspectRatio,
        },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
          const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
          return `data:image/jpeg;base64,${base64ImageBytes}`;
      }
      
      console.warn("Image generation failed, no images returned. This is likely due to safety filters blocking the prompt:", `"${fullPrompt}"`);
      return undefined;

    } catch (error: any) {
      const isRateLimitError = error.message?.includes('429') || error.toString().includes('RESOURCE_EXHAUSTED');
      
      if (isRateLimitError && i < MAX_RETRIES - 1) {
        console.warn(`Rate limit exceeded for image generation. Retrying in ${delayMs / 1000}s... (Attempt ${i + 1}/${MAX_RETRIES})`);
        await delay(delayMs);
        delayMs *= 2; // Exponential backoff
      } else {
        console.error("Error generating scene image with Gemini:", error);
        return undefined;
      }
    }
  }

  console.error("Image generation failed after multiple retries due to rate limiting.");
  return undefined;
};