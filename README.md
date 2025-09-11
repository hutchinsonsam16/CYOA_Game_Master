<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CYOA Game Master

This is an interactive, text-based Choose-Your-Own-Adventure (CYOA) game powered by a personal AI storyteller. It can run using local, in-browser models or a powerful cloud-based AI via the Gemini API.

##  Prerequisites

- **Node.js**: [Download and install Node.js](https://nodejs.org/) (which includes npm).
- **Git**: [Download and install Git](https://git-scm.com/).

## 🚀 Running Locally

### 1. Clone the Repository
Open your terminal or command prompt and run the following command:
```bash
git clone https://github.com/hutchinsonsam16/CYOA_Game_Master/
cd cyoa-game-master
````

### 2\. Create an Environment File

Create a new file named `.env` in the root of the project directory. This file will store your API key.

### 3\. Add Your Gemini API Key (Optional)

If you want to use the more powerful cloud-based Gemini model, you need an API key.

  - Get your key from [Google AI Studio](https://makersuite.google.com/app/apikey).
  - Open the `.env` file and add your key like this:

<!-- end list -->

```
GEMINI_API_KEY=YOUR_API_KEY_HERE
```

> **Note:** If you do not provide an API key, the application will automatically run in **Local Mode**, using models that run directly in your browser. Performance will depend on your computer's hardware.

### 4\. Install Dependencies and Download Models

This command will install all the necessary packages and then automatically run a script to download the required AI models. This might take some time depending on your internet connection.

```bash
npm install
```

### 5\. Run the Application

Once the installation and model downloads are complete, start the application:

```bash
npm run dev
```

This will open the application in a new browser window.

## How It Works

  - **Local Mode**: Uses `Transformers.js` to run quantized open-source models like DistilGPT-2 directly in the browser. No data leaves your machine.
  - **Gemini API Mode**: Uses the Google Gemini API for state-of-the-art text and image generation, providing a much richer and more coherent storytelling experience.

<!-- end list -->
