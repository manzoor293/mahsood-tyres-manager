const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', { isElectron: true });

// Channel selection stays in preload; no invoke/send/SQL API crosses the bridge.
contextBridge.exposeInMainWorld('api', {
  brands: {
    list: (filters) => ipcRenderer.invoke('catalog:brands:list', filters),
    create: (data) => ipcRenderer.invoke('catalog:brands:create', data),
    update: (id, data) => ipcRenderer.invoke('catalog:brands:update', id, data),
    deactivate: (id) => ipcRenderer.invoke('catalog:brands:deactivate', id),
  },
  categories: {
    list: (filters) => ipcRenderer.invoke('catalog:categories:list', filters),
    create: (data) => ipcRenderer.invoke('catalog:categories:create', data),
    update: (id, data) => ipcRenderer.invoke('catalog:categories:update', id, data),
    deactivate: (id) => ipcRenderer.invoke('catalog:categories:deactivate', id),
  },
  products: {
    list: (filters) => ipcRenderer.invoke('catalog:products:list', filters),
    getById: (id) => ipcRenderer.invoke('catalog:products:getById', id),
    create: (data) => ipcRenderer.invoke('catalog:products:create', data),
    update: (id, data) => ipcRenderer.invoke('catalog:products:update', id, data),
    deactivate: (id) => ipcRenderer.invoke('catalog:products:deactivate', id),
  },
});
