import { pipeline, env } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

// Set the root for model downloads
env.localDir = './models';
env.allowRemoteModels = true;

const textModels = [
  { id: 'Xenova/distilgpt2', dir: './models/text/distilgpt2' },
  { id: 'Xenova/LaMini-Flan-T5-783M', dir: './models/text/LaMini-Flan-T5-783M' },
  { id: 'Xenova/pythia-1.4b-deduped', dir: './models/text/pythia-1.4b-deduped' },
  { id: 'Xenova/gpt2', dir: './models/text/gpt2' }
];

const imageModel = { id: 'Xenova/stable-diffusion-2-1-base', dir: './models/image/stable-diffusion-2-1-base' };

async function downloadModel(model_id, local_dir) {
  console.log(`Downloading ${model_id} to ${local_dir}`);
  // Ensure the local directory exists
  fs.mkdirSync(local_dir, { recursive: true });
  // Set the cache directory for this download
  env.cacheDir = path.resolve(local_dir);
  await pipeline('text-generation', model_id, {
    progress_callback: (progress) => {
      console.log(`Downloading ${model_id}: ${progress.file} (${Math.round(progress.progress)}%)`);
    }
  });
}

async function downloadImageModel(model_id, local_dir) {
    console.log(`Downloading ${model_id} to ${local_dir}`);
    fs.mkdirSync(local_dir, { recursive: true });
    env.cacheDir = path.resolve(local_dir);
    await pipeline('text-to-image', model_id, {
        progress_callback: (progress) => {
            console.log(`Downloading ${model_id}: ${progress.file} (${Math.round(progress.progress)}%)`);
        }
    });
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
      await downloadImageModel(imageModel.id, imageModel.dir);
  } catch (err) {
    console.error(`Failed to download ${imageModel.id}:`, err);
  }

  console.log('All models downloaded successfully!');
})();
