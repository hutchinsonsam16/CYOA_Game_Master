@echo off

echo Starting model download script...

:: Ensure huggingface-cli is installed
npm install -g huggingface-cli

:: Define the base directory for models
set MODEL_DIR=%~dp0models

echo Creating model directory: %MODEL_DIR%
mkdir "%MODEL_DIR%"

:: Download DistilGPT-2
echo.
echo Downloading DistilGPT-2...
npx huggingface-cli download distilgpt2 --local-dir "%MODEL_DIR%/distilgpt2" --local-dir-use-symlinks false

:: Download Llama-3.2-1B-Instruct
echo.
echo Downloading Llama-3.2-1B-Instruct...
npx huggingface-cli download onnx-community/Llama-3.2-1B-Instruct --local-dir "%MODEL_DIR%/Llama-3.2-1B-Instruct" --local-dir-use-symlinks false

:: Download DeepSeek-R1-Distill-Qwen-1.5B
echo.
echo Downloading DeepSeek-R1-Distill-Qwen-1.5B...
npx huggingface-cli download deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF --local-dir "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B" --local-dir-use-symlinks false

echo.
echo All models downloaded successfully!
pause
