const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', { isElectron: true });

// Channel selection stays in preload; no invoke/send/SQL API crosses the bridge.
contextBridge.exposeInMainWorld('api', {
  customers: {
    list: (filters) => ipcRenderer.invoke('customers:list', filters),
    getById: (id) => ipcRenderer.invoke('customers:getById', id),
    create: (data) => ipcRenderer.invoke('customers:create', data),
    update: (id, data) => ipcRenderer.invoke('customers:update', id, data),
    deactivate: (id) => ipcRenderer.invoke('customers:deactivate', id),
  },
  inventory: {
    list: (filters) => ipcRenderer.invoke('inventory:list', filters),
    getProductStock: (productId) => ipcRenderer.invoke('inventory:getProductStock', productId),
    listMovements: (filters) => ipcRenderer.invoke('inventory:listMovements', filters),
    adjust: (data) => ipcRenderer.invoke('inventory:adjust', data),
  },
  purchases: {
    list: (filters) => ipcRenderer.invoke('purchases:list', filters),
    getById: (id) => ipcRenderer.invoke('purchases:getById', id),
    create: (data) => ipcRenderer.invoke('purchases:create', data),
  },
  suppliers: {
    list: (filters) => ipcRenderer.invoke('suppliers:list', filters),
    getById: (id) => ipcRenderer.invoke('suppliers:getById', id),
    create: (data) => ipcRenderer.invoke('suppliers:create', data),
    update: (id, data) => ipcRenderer.invoke('suppliers:update', id, data),
    deactivate: (id) => ipcRenderer.invoke('suppliers:deactivate', id),
  },
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
