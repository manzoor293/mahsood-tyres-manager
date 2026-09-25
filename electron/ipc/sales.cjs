const { CatalogError } = require('../services/validation.cjs');
function registerSaleIpc(ipcMain, service, isTrustedSender) {
  const methods = { list: [0,1], getById: [1,1], create: [1,1] };
  for (const [method,[min,max]] of Object.entries(methods)) {
    ipcMain.handle(`sales:${method}`, (event,...args) => {
      try {
        if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN','Untrusted IPC sender.');
        if (args.length < min || args.length > max) throw new CatalogError('VALIDATION','Invalid argument count.');
        return { ok: true, data: service[method](...args) };
      } catch (error) {
        if (error instanceof CatalogError) return { ok: false, error: { code: error.code, message: error.message } };
        console.error(`Sale operation failed (${method}):`, error);
        return { ok: false, error: { code: 'INTERNAL', message: 'The sale could not be completed. No changes were saved.' } };
      }
    });
  }
  return () => { for (const method of Object.keys(methods)) ipcMain.removeHandler(`sales:${method}`); };
}
module.exports = { registerSaleIpc };
