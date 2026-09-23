const { contextBridge } = require('electron');

// Add explicit, validated IPC methods here only when a feature needs them.
contextBridge.exposeInMainWorld('desktop', { isElectron: true });
