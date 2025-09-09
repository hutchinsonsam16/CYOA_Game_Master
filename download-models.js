import { pipeline, env } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

const models = [
  { id: 'distilgpt2', dir: './models/distilgpt2' },
  { id: 'onnx-community/Llama-3.2-1B-Instruct', dir: './models/Llama-3.2-1B-Instruct' },
  { id: 'deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF', dir: './models/DeepSeek-R1-Distill-Qwen-1.5B' },
  { id: 'Xenova/gpt2', dir: './models/Xenova-gpt2' }
];

async function downloadModel(model_id, local_dir) {
  console.log(`Downloading ${model_id} to ${local_dir}`);
  fs.mkdirSync(local_dir, { recursive: true });

  // Set local cache directory
  env.cacheDir = path.resolve(local_dir);

  // This will trigger the download and cache the model
  await pipeline('text-generation', model_id);
}

(async () => {
  for (const model of models) {
    try {
      await downloadModel(model.id, model.dir);
    } catch (err) {
      console.error(`Failed to download ${model.id}:`, err);
    }
  }
})();
