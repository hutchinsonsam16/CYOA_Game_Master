// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
// This file is used to securely expose a limited set of Node.js APIs
// to the renderer process, but for this application, no APIs are needed.
const { contextBridge, app } = require('electron');
const path = require('path');

const modelsPath = path.join(app.getAppPath(), 'models');

contextBridge.exposeInMainWorld('electronAPI', {
    modelsPath: modelsPath,
});
