const { BrowserWindow } = require("electron");
const { CatalogError } = require("../services/validation.cjs");
const { validateDocument } = require("../services/print-documents.cjs");
function registerPrintingIpc(ipcMain, service, isTrustedSender) {
  const channels = [];
  for (const method of ["preview", "print", "savePdf"]) {
    const channel = `printing:${method}`;
    channels.push(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        if (!isTrustedSender(event))
          throw new CatalogError("FORBIDDEN", "Untrusted IPC sender.");
        if (args.length !== 2)
          throw new CatalogError(
            "VALIDATION",
            "Provide only a document type and ID.",
          );
        validateDocument(args[0], args[1]);
        return {
          ok: true,
          data: await service[method](
            ...args,
            BrowserWindow.fromWebContents(event.sender),
          ),
        };
      } catch (error) {
        if (error instanceof CatalogError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        console.error(`Printing operation failed (${method}):`, error);
        return {
          ok: false,
          error: {
            code: "INTERNAL",
            message:
              "Unable to load this saved document. Refresh and try again.",
          },
        };
      }
    });
  }
  return () => channels.forEach((channel) => ipcMain.removeHandler(channel));
}
module.exports = { registerPrintingIpc };
