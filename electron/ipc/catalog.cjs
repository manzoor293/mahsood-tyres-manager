const { CatalogError } = require('../services/validation.cjs');

function createSenderGuard(allowedContents, allowedUrl) {
  const expected = new URL(allowedUrl);
  expected.hash = '';
  return (event) => {
    if (!allowedContents.has(event.sender) || event.sender.isDestroyed()
      || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
    try {
      const actual = new URL(event.senderFrame.url);
      actual.hash = '';
      return actual.href === expected.href;
    } catch { return false; }
  };
}

function registerCatalogIpc(ipcMain, services, isTrustedSender) {
  const channels = [];
  const methods = {
    brands: { list: [0, 1], create: [1, 1], update: [2, 2], deactivate: [1, 1] },
    categories: { list: [0, 1], create: [1, 1], update: [2, 2], deactivate: [1, 1] },
    products: { list: [0, 1], getById: [1, 1], create: [1, 1], update: [2, 2], deactivate: [1, 1] },
  };
  for (const [resource, operations] of Object.entries(methods)) {
    for (const [operation, [minimum, maximum]] of Object.entries(operations)) {
      const channel = `catalog:${resource}:${operation}`;
      ipcMain.handle(channel, (event, ...args) => {
        try {
          if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN', 'Untrusted IPC sender.');
          if (args.length < minimum || args.length > maximum) throw new CatalogError('VALIDATION', 'Invalid argument count.');
          return { ok: true, data: services[resource][operation](...args) };
        } catch (error) {
          if (error instanceof CatalogError) return { ok: false, error: { code: error.code, message: error.message } };
          console.error(`Catalog operation failed (${channel}):`, error);
          return { ok: false, error: { code: 'INTERNAL', message: 'The operation could not be completed.' } };
        }
      });
      channels.push(channel);
    }
  }
  return () => { for (const channel of channels) ipcMain.removeHandler(channel); };
}

module.exports = { registerCatalogIpc, createSenderGuard };
