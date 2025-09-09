@echo off

echo Starting model download script...

:: Define the base directory for models
set MODEL_DIR=.\models

echo Creating model directory: %MODEL_DIR%
if not exist "%MODEL_DIR%" (
    mkdir "%MODEL_DIR%"
)

:: Define the executable path for @xenova/transformers
set XENOVA_EXEC=.\node_modules\.bin\transformers

echo.
echo Starting downloads...

:: Download all models using the local executable
echo.
echo Downloading DistilGPT-2...
"%XENOVA_EXEC%" --download --model_id distilgpt2 --local-dir "%MODEL_DIR%/distilgpt2"

echo.
echo Downloading Llama-3.2-1B-Instruct...
"%XENOVA_EXEC%" --download --model_id onnx-community/Llama-3.2-1B-Instruct --local-dir "%MODEL_DIR%/Llama-3.2-1B-Instruct"

echo.
echo Downloading DeepSeek-R1-Distill-Qwen-1.5B...
"%XENOVA_EXEC%" --download --model_id deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF --local-dir "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B"

echo.
echo Downloading Xenova/gpt2...
"%XENOVA_EXEC%" --download --model_id Xenova/gpt2 --local-dir "%MODEL_DIR%/Xenova/gpt2"

echo.
echo All models downloaded successfully!
pause
