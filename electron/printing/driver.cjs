const fs = require("node:fs/promises");
const path = require("node:path");
const { BrowserWindow, dialog } = require("electron");
const { CatalogError } = require("../services/validation.cjs");

// Native dependencies can be replaced only by main-process tests, never IPC callers.
function createPrintDriver(overrides = {}) {
  const dependencies = {
    createWindow: (options) => new BrowserWindow(options),
    print: (window, options, callback) =>
      window.webContents.print(options, callback),
    toPdf: (window, options) => window.webContents.printToPDF(options),
    chooseFile: (owner, options) => dialog.showSaveDialog(owner, options),
    writeFile: (filename, bytes) => fs.writeFile(filename, bytes),
    ...overrides,
  };
  async function withWindow(html, owner, operation) {
    let window;
    try {
      window = dependencies.createWindow({
        show: false,
        width: 900,
        height: 1100,
        title: "Business document output",
        parent: owner,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          javascript: false,
          webviewTag: false,
        },
      });
      window.setMenuBarVisibility(false);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      const ownerClosed = () => {
        if (!window.isDestroyed()) window.destroy();
      };
      owner?.once("closed", ownerClosed);
      try {
        await window.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        );
        return await operation(window);
      } finally {
        owner?.removeListener("closed", ownerClosed);
      }
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      console.error("Document output failed:", error);
      throw new CatalogError(
        "PRINT_FAILED",
        "Unable to prepare or output this document. Check the printer or PDF destination and try again.",
      );
    } finally {
      if (window && !window.isDestroyed()) window.destroy();
    }
  }
  return {
    print(html, owner) {
      return withWindow(
        html,
        owner,
        (window) =>
          new Promise((resolve, reject) => {
            let finished = false;
            const closed = () => finish({ status: "cancelled" });
            function finish(result, error) {
              if (finished) return;
              finished = true;
              window.removeListener("closed", closed);
              if (error) reject(error);
              else resolve(result);
            }
            window.once("closed", closed);
            try {
              dependencies.print(
                window,
                {
                  silent: false,
                  printBackground: false,
                  color: false,
                  pageSize: "A4",
                },
                (success, reason) => {
                  if (success) finish({ status: "printed" });
                  else if (/cancelled|canceled/i.test(reason || ""))
                    finish({ status: "cancelled" });
                  else
                    finish(
                      null,
                      new CatalogError(
                        "PRINT_FAILED",
                        "Printing failed. Check that a printer is available and its settings are valid, then try again.",
                      ),
                    );
                },
              );
            } catch (error) {
              finish(null, error);
            }
          }),
      );
    },
    async savePdf(html, filename, owner) {
      let selected;
      try {
        selected = await dependencies.chooseFile(owner, {
          title: "Save business document as PDF",
          defaultPath: filename,
          filters: [{ name: "PDF document", extensions: ["pdf"] }],
          properties: ["showOverwriteConfirmation", "dontAddToRecent"],
        });
      } catch (error) {
        console.error("PDF save dialog failed:", error);
        throw new CatalogError(
          "PDF_FAILED",
          "Unable to open the PDF Save dialog. Please try again.",
        );
      }
      if (selected.canceled || !selected.filePath)
        return { status: "cancelled" };
      // Only the native Save dialog supplies the destination. Never accept a renderer path.
      const destination = selected.filePath;
      if (path.extname(destination).toLowerCase() !== ".pdf")
        throw new CatalogError(
          "PDF_FAILED",
          "Choose a filename ending in .pdf.",
        );
      return withWindow(html, owner, async (window) => {
        const bytes = await dependencies.toPdf(window, {
          pageSize: "A4",
          preferCSSPageSize: true,
          printBackground: false,
          displayHeaderFooter: false,
        });
        await dependencies.writeFile(destination, bytes);
        return { status: "saved", filename: path.basename(destination) };
      });
    },
  };
}
module.exports = { createPrintDriver };
