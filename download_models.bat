@echo off
setlocal

echo Starting model download script...

:: Ensure dependencies are installed
call npm install @xenova/transformers

:: Run the Node.js model download script
node download-models.js

echo.
echo All models downloaded successfully!
pause
