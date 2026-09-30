const { CatalogError } = require("../services/validation.cjs");
function registerBackupIpc(ipcMain, service, isTrustedSender) {
  for (const method of ["getInfo", "create", "restore"]) {
    ipcMain.handle(`backup:${method}`, async (event, ...args) => {
      try {
        if (!isTrustedSender(event))
          throw new CatalogError("FORBIDDEN", "Untrusted IPC sender.");
        if (args.length)
          throw new CatalogError(
            "VALIDATION",
            "This operation does not accept arguments.",
          );
        return { ok: true, data: await service[method]() };
      } catch (error) {
        console.error(`Backup operation failed (${method}):`, error);
        if (error instanceof CatalogError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        const message = /SQLITE_(NOTADB|CORRUPT)/.test(error.code || "")
          ? "This file is invalid or damaged. Choose another backup."
          : ["EACCES", "EPERM", "EBUSY", "SQLITE_READONLY"].includes(error.code)
            ? "The file cannot be accessed. Check permissions, close other programs using it and try again."
            : error.code === "ENOSPC" || error.code === "SQLITE_FULL"
              ? "There is not enough free disk space. Free some space and try again."
              : "The operation could not be completed. Your current shop data has been preserved. Check the file and available disk space, then try again.";
        return { ok: false, error: { code: "BACKUP_FAILED", message } };
      }
    });
  }
}
module.exports = { registerBackupIpc };
