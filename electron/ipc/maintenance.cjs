// All business handlers are rebound after restore because repositories retain statements.
function createMaintenanceGate(ipcMain) {
  let locked = false;
  let active = 0;
  return {
    ipc: {
      handle(channel, handler) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async (...args) => {
          if (locked)
            return {
              ok: false,
              error: {
                code: "MAINTENANCE",
                message:
                  "Database maintenance is in progress. Please try again when it finishes.",
              },
            };
          active++;
          try {
            return await handler(...args);
          } finally {
            active--;
          }
        });
      },
    },
    lock() {
      if (locked || active) return false;
      locked = true;
      return true;
    },
    unlock() {
      locked = false;
    },
  };
}
module.exports = { createMaintenanceGate };
