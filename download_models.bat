@echo off

echo Starting model download script...

:: Ensure @huggingface/hub is installed
npm install @huggingface/hub

:: Define the base directory for models
set MODEL_DIR=%~dp0models

echo Creating model directory: %MODEL_DIR%
if not exist "%MODEL_DIR%" mkdir "%MODEL_DIR%"

:: Download DistilGPT-2
echo.
echo Downloading DistilGPT-2...
npx @huggingface/hub download distilgpt2 --local-dir "%MODEL_DIR%/distilgpt2" --local-dir-use-symlinks false

:: Download Llama-3.2-1B-Instruct
echo.
echo Downloading Llama-3.2-1B-Instruct...
npx @huggingface/hub download onnx-community/Llama-3.2-1B-Instruct --local-dir "%MODEL_DIR%/Llama-3.2-1B-Instruct" --local-dir-use-symlinks false

:: Download DeepSeek-R1-Distill-Qwen-1.5B
echo.
echo Downloading DeepSeek-R1-Distill-Qwen-1.5B...
npx @huggingface/hub download deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF --local-dir "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B" --local-dir-use-symlinks false

:: Download Xenova/gpt2
echo.
echo Downloading Xenova/gpt2...
npx @huggingface/hub download Xenova/gpt2 --local-dir "%MODEL_DIR%/Xenova/gpt2" --local-dir-use-symlinks false

echo.
echo All models downloaded successfully!
pause
