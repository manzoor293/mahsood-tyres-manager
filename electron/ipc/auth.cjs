const { CatalogError } = require('../services/validation.cjs');

function createAuthorizedIpc(ipc, auth, isTrustedSender) {
  return {
    handle(channel, handler) {
      ipc.handle(channel, (event, ...args) => {
        if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted IPC sender.' } };
        if (!auth.isAuthenticated()) return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } };
        return handler(event, ...args);
      });
    },
  };
}

function registerAuthIpc(ipc, service, isTrustedSender) {
  for (const [method, count] of Object.entries({ getStatus: 0, setup: 1, login: 1, logout: 0 })) {
    ipc.handle(`auth:${method}`, async (event, ...args) => {
      try {
        if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN', 'Untrusted IPC sender.');
        if (args.length !== count) throw new CatalogError('VALIDATION', 'Invalid argument count.');
        return { ok: true, data: await service[method](...args) };
      } catch (error) {
        // Never log an authentication request or propagate internal crypto/database errors.
        if (error instanceof CatalogError) return { ok: false, error: { code: error.code, message: error.message } };
        return { ok: false, error: { code: 'INTERNAL', message: 'Authentication could not be completed. Please try again.' } };
      }
    });
  }
}
module.exports = { createAuthorizedIpc, registerAuthIpc };
