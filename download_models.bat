@echo off

echo Starting model download script...

:: Define the base directory for models
set MODEL_DIR=.\models

echo Creating model directory: %MODEL_DIR%
if not exist "%MODEL_DIR%" (
    mkdir "%MODEL_DIR%"
)

:: Ensure the Hugging Face Hub library is installed locally for npx commands
echo.
echo Ensuring @huggingface/hub is installed...
npm install @huggingface/hub

:: List of models to download
setlocal enabledelayedexpansion
set "models[0]=distilgpt2"
set "models[1]=onnx-community/Llama-3.2-1B-Instruct"
set "models[2]=deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF"
set "models[3]=Xenova/gpt2"

echo.
echo Starting downloads...

for /L %%i in (0,1,3) do (
    set "model_id=!models[%%i]!"
    echo.
    echo Downloading !model_id!...
    npx @huggingface/hub download !model_id! --local-dir "%MODEL_DIR%/!model_id!" --local-dir-use-symlinks false
    if errorlevel 1 (
        echo Error downloading !model_id!. Please check your internet connection and model ID.
    ) else (
        echo !model_id! downloaded successfully.
    )
)

endlocal

echo.
echo All download attempts complete.
pause
