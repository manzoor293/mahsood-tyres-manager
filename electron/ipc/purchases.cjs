const { CatalogError } = require('../services/validation.cjs');

function registerPurchaseIpc(ipcMain, service, isTrustedSender) {
  const methods = { list: [0, 1], getById: [1, 1], create: [1, 1] };
  for (const [method, [min, max]] of Object.entries(methods)) {
    ipcMain.handle(`purchases:${method}`, (event, ...args) => {
      try {
        if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN', 'Untrusted IPC sender.');
        if (args.length < min || args.length > max) throw new CatalogError('VALIDATION', 'Invalid argument count.');
        return { ok: true, data: service[method](...args) };
      } catch (error) {
        if (error instanceof CatalogError) return { ok: false, error: { code: error.code, message: error.message } };
        console.error(`Purchase operation failed (${method}):`, error);
        return { ok: false, error: { code: 'INTERNAL', message: 'The purchase operation could not be completed.' } };
      }
    });
  }
  return () => { for (const method of Object.keys(methods)) ipcMain.removeHandler(`purchases:${method}`); };
}
module.exports = { registerPurchaseIpc };

