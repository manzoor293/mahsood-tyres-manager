const { CatalogError } = require('../services/validation.cjs');
function registerSettingsIpc(ipcMain, service, isTrustedSender) {
  for (const [method, count] of Object.entries({ getShopProfile: 0, updateShopProfile: 1, getPreferences: 0 })) {
    ipcMain.handle(`settings:${method}`, (event, ...args) => {
      try {
        if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN', 'Untrusted IPC sender.');
        if (args.length !== count) throw new CatalogError('VALIDATION', 'Invalid argument count.');
        return { ok: true, data: service[method](...args) };
      } catch (error) {
        if (error instanceof CatalogError) return { ok: false, error: { code: error.code, message: error.message } };
        console.error(`Settings operation failed (${method}):`, error);
        return { ok: false, error: { code: 'INTERNAL', message: 'Shop settings could not be saved or loaded. Please try again.' } };
      }
    });
  }
}
module.exports = { registerSettingsIpc };
