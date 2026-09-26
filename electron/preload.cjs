const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', { isElectron: true });

// Channel selection stays in preload; no invoke/send/SQL API crosses the bridge.
contextBridge.exposeInMainWorld('api', {
  saleReturns: {
    list: (filters) => ipcRenderer.invoke('saleReturns:list',filters),
    getReturnableSale: (id) => ipcRenderer.invoke('saleReturns:getReturnableSale',id),
    create: (data) => ipcRenderer.invoke('saleReturns:create',data),
    getById: (id) => ipcRenderer.invoke('saleReturns:getById',id),
  },
  purchaseReturns: {
    list: (filters) => ipcRenderer.invoke('purchaseReturns:list',filters),
    getReturnablePurchase: (id) => ipcRenderer.invoke('purchaseReturns:getReturnablePurchase',id),
    create: (data) => ipcRenderer.invoke('purchaseReturns:create',data),
    getById: (id) => ipcRenderer.invoke('purchaseReturns:getById',id),
  },
  customerPayments: {
    list: (filters) => ipcRenderer.invoke('customerPayments:list', filters),
    getOutstanding: (saleId) => ipcRenderer.invoke('customerPayments:getOutstanding', saleId),
    getAccountSummary: (customerId) => ipcRenderer.invoke('customerPayments:getAccountSummary', customerId),
    create: (data) => ipcRenderer.invoke('customerPayments:create', data),
    history: (filters) => ipcRenderer.invoke('customerPayments:history', filters),
  },
  supplierPayments: {
    list: (filters) => ipcRenderer.invoke('supplierPayments:list', filters),
    getOutstanding: (purchaseId) => ipcRenderer.invoke('supplierPayments:getOutstanding', purchaseId),
    getAccountSummary: (supplierId) => ipcRenderer.invoke('supplierPayments:getAccountSummary', supplierId),
    create: (data) => ipcRenderer.invoke('supplierPayments:create', data),
    history: (filters) => ipcRenderer.invoke('supplierPayments:history', filters),
  },
  reports: {
    getSales: (filters) => ipcRenderer.invoke('reports:getSales', filters),
    getPurchases: (filters) => ipcRenderer.invoke('reports:getPurchases', filters),
    getInventory: (filters) => ipcRenderer.invoke('reports:getInventory', filters),
    getStockMovements: (filters) => ipcRenderer.invoke('reports:getStockMovements', filters),
    getExpenses: (filters) => ipcRenderer.invoke('reports:getExpenses', filters),
    getProfit: (filters) => ipcRenderer.invoke('reports:getProfit', filters),
    getReceivables: (filters) => ipcRenderer.invoke('reports:getReceivables', filters),
    getPayables: (filters) => ipcRenderer.invoke('reports:getPayables', filters),
  },
  dashboard: {
    getOverview: (filters) => ipcRenderer.invoke('dashboard:getOverview', filters),
  },
  expenses: {
    list: (filters) => ipcRenderer.invoke('expenses:list', filters),
    getById: (id) => ipcRenderer.invoke('expenses:getById', id),
    create: (data) => ipcRenderer.invoke('expenses:create', data),
    update: (id, data) => ipcRenderer.invoke('expenses:update', id, data),
  },
  expenseCategories: {
    list: (filters) => ipcRenderer.invoke('expenseCategories:list', filters),
    create: (data) => ipcRenderer.invoke('expenseCategories:create', data),
    update: (id, data) => ipcRenderer.invoke('expenseCategories:update', id, data),
    deactivate: (id) => ipcRenderer.invoke('expenseCategories:deactivate', id),
  },
  sales: {
    list: (filters) => ipcRenderer.invoke('sales:list', filters),
    getById: (id) => ipcRenderer.invoke('sales:getById', id),
    create: (data) => ipcRenderer.invoke('sales:create', data),
  },
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
