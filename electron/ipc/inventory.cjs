const { CatalogError } = require('../services/validation.cjs');
function registerInventoryIpc(ipcMain, service, isTrustedSender) {
  const methods = { list: [0,1], getProductStock: [1,1], listMovements: [0,1], adjust: [1,1] };
  for (const [method,[min,max]] of Object.entries(methods)) {
    ipcMain.handle(`inventory:${method}`, (event,...args) => {
      try {
        if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN', 'Untrusted IPC sender.');
        if (args.length < min || args.length > max) throw new CatalogError('VALIDATION', 'Invalid argument count.');
        return { ok: true, data: service[method](...args) };
      } catch (error) {
        if (error instanceof CatalogError) return { ok: false, error: { code: error.code, message: error.message } };
        console.error(`Inventory operation failed (${method}):`, error);
        return { ok: false, error: { code: 'INTERNAL', message: 'The inventory operation could not be completed.' } };
      }
    });
  }
  return () => { for (const method of Object.keys(methods)) ipcMain.removeHandler(`inventory:${method}`); };
}
module.exports = { registerInventoryIpc };
