@echo off

echo Starting model download script using curl...

set MODEL_DIR=.\models

echo Creating model directory: %MODEL_DIR%
if not exist "%MODEL_DIR%" (
    mkdir "%MODEL_DIR%"
)

echo.
echo Starting downloads...

:: Download all files for 'distilgpt2'
echo Downloading DistilGPT-2...
mkdir "%MODEL_DIR%/distilgpt2"
curl -L -o "%MODEL_DIR%/distilgpt2/config.json" "https://huggingface.co/distilgpt2/resolve/main/config.json"
curl -L -o "%MODEL_DIR%/distilgpt2/tokenizer.json" "https://huggingface.co/distilgpt2/resolve/main/tokenizer.json"
curl -L -o "%MODEL_DIR%/distilgpt2/tokenizer_config.json" "https://huggingface.co/distilgpt2/resolve/main/tokenizer_config.json"
curl -L -o "%MODEL_DIR%/distilgpt2/model.onnx" "https://huggingface.co/distilgpt2/resolve/main/model.onnx"

:: Download all files for 'Llama-3.2-1B-Instruct'
echo.
echo Downloading Llama-3.2-1B-Instruct...
mkdir "%MODEL_DIR%/Llama-3.2-1B-Instruct"
curl -L -o "%MODEL_DIR%/Llama-3.2-1B-Instruct/config.json" "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct/resolve/main/config.json"
curl -L -o "%MODEL_DIR%/Llama-3.2-1B-Instruct/tokenizer.json" "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct/resolve/main/tokenizer.json"
curl -L -o "%MODEL_DIR%/Llama-3.2-1B-Instruct/tokenizer_config.json" "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct/resolve/main/tokenizer_config.json"
curl -L -o "%MODEL_DIR%/Llama-3.2-1B-Instruct/model.onnx" "https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct/resolve/main/model.onnx"

:: Download all files for 'DeepSeek-R1-Distill-Qwen-1.5B'
echo.
echo Downloading DeepSeek-R1-Distill-Qwen-1.5B...
mkdir "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B"
curl -L -o "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B/config.json" "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF/resolve/main/config.json"
curl -L -o "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B/tokenizer.json" "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF/resolve/main/tokenizer.json"
curl -L -o "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B/tokenizer_config.json" "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF/resolve/main/tokenizer_config.json"
curl -L -o "%MODEL_DIR%/DeepSeek-R1-Distill-Qwen-1.5B/model.onnx" "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Base-GGUF/resolve/main/model.onnx"

:: Download all files for 'Xenova/gpt2'
echo.
echo Downloading Xenova/gpt2...
mkdir "%MODEL_DIR%/Xenova/gpt2"
curl -L -o "%MODEL_DIR%/Xenova/gpt2/config.json" "https://huggingface.co/Xenova/gpt2/resolve/main/config.json"
curl -L -o "%MODEL_DIR%/Xenova/gpt2/tokenizer.json" "https://huggingface.co/Xenova/gpt2/resolve/main/tokenizer.json"
curl -L -o "%MODEL_DIR%/Xenova/gpt2/tokenizer_config.json" "https://huggingface.co/Xenova/gpt2/resolve/main/tokenizer_config.json"
curl -L -o "%MODEL_DIR%/Xenova/gpt2/model.onnx" "https://huggingface.co/Xenova/gpt2/resolve/main/model.onnx"

echo.
echo All models downloaded successfully!
pause
