// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
// This file is used to securely expose a limited set of Node.js APIs
// to the renderer process, but for this application, a minimal API is needed.
const { contextBridge } = require('electron');
const path = require('path');
const process = require('process');

const modelsPath = path.join(process.resourcesPath, 'models');

contextBridge.exposeInMainWorld('electronAPI', {
    modelsPath: modelsPath,
});
