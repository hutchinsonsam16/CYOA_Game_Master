import { pipeline, env } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

const textModels = [
  { id: 'distilgpt2', dir: './models/text/distilgpt2' },
  { id: 'onnx-community/Llama-3.2-1B-Instruct', dir: './models/text/Llama-3.2-1B-Instruct' },
  { id: 'deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF', dir: './models/text/DeepSeek-R1-Distill-Qwen-1.5B' },
  { id: 'Xenova/gpt2', dir: './models/text/Xenova-gpt2' }
];

const imageModel = { id: 'Xenova/Janus-Pro-1B', dir: './models/image/Janus-Pro-1B' };

async function downloadModel(model_id, local_dir) {
  console.log(`Downloading ${model_id} to ${local_dir}`);
  fs.mkdirSync(local_dir, { recursive: true });
  env.cacheDir = path.resolve(local_dir);
  await pipeline('text-generation', model_id);
}

(async () => {
  for (const model of textModels) {
    try {
      await downloadModel(model.id, model.dir);
    } catch (err) {
      console.error(`Failed to download ${model.id}:`, err);
    }
  }

  try {
    const imageDir = path.resolve(imageModel.dir);
    fs.mkdirSync(imageDir, { recursive: true });
    env.cacheDir = imageDir;
    await pipeline('text-to-image', imageModel.id);
  } catch (err) {
    console.error(`Failed to download ${imageModel.id}:`, err);
  }
})();
