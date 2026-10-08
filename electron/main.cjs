const { createAuthService } = require("./services/auth.cjs");
const { createLedgerService } = require("./services/ledger.cjs");
const {
  createLedgerPrintingService,
} = require("./services/ledger-printing.cjs");
const { registerLedgerIpc } = require("./ipc/ledger.cjs");
const { createAuthorizedIpc, registerAuthIpc } = require("./ipc/auth.cjs");
const { app, BrowserWindow, session, ipcMain, dialog } = require("electron");
const { createMaintenanceGate } = require("./ipc/maintenance.cjs");
const { createSettingsService } = require("./services/settings.cjs");
const { registerSettingsIpc } = require("./ipc/settings.cjs");
const { registerBackupIpc } = require("./ipc/backup.cjs");
const { createBackupService } = require("./services/backup.cjs");
const { recoverInterruptedRestore } = require("./database/restore-files.cjs");
const { createPrintingService } = require("./services/printing.cjs");
const { createPrintDriver } = require("./printing/driver.cjs");
const { registerPrintingIpc } = require("./ipc/printing.cjs");
const { createReturnServices } = require("./services/returns.cjs");
const { registerReturnIpc } = require("./ipc/returns.cjs");
const path = require("node:path");
const { existsSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { createCatalogServices } = require("./services/catalog.cjs");
const { createDashboardService } = require("./services/dashboard.cjs");
const { createReportsService } = require("./services/reports.cjs");
const { createPaymentServices } = require("./services/payments.cjs");
const { registerPaymentIpc } = require("./ipc/payments.cjs");
const { registerReportsIpc } = require("./ipc/reports.cjs");
const { registerDashboardIpc } = require("./ipc/dashboard.cjs");
const { createSupplierService } = require("./services/suppliers.cjs");
const { createExpenseServices } = require("./services/expenses.cjs");
const { registerExpenseIpc } = require("./ipc/expenses.cjs");
const { createSaleService } = require("./services/sales.cjs");
const { registerSaleIpc } = require("./ipc/sales.cjs");
const { createCustomerService } = require("./services/customers.cjs");
const { registerCustomerIpc } = require("./ipc/customers.cjs");
const { createInventoryService } = require("./services/inventory.cjs");
const { registerInventoryIpc } = require("./ipc/inventory.cjs");
const { createPurchaseService } = require("./services/purchases.cjs");
const { registerPurchaseIpc } = require("./ipc/purchases.cjs");
const { registerSupplierIpc } = require("./ipc/suppliers.cjs");
const { registerCatalogIpc, createSenderGuard } = require("./ipc/catalog.cjs");
const {
  initializeDatabase,
  closeDatabase,
  getDatabasePath,
} = require("./database/index.cjs");

const { configureProfile } = require("./utils/profile.cjs");
const profileConflict = configureProfile(app);
const development = !app.isPackaged && process.argv.includes("--dev");
const developmentPort = Number(process.env.MAHSOOD_DEV_PORT || 5173);
if (
  development &&
  (!Number.isInteger(developmentPort) ||
    developmentPort < 1 ||
    developmentPort > 65535)
) {
  throw new Error("Invalid local development port.");
}
const allowedContents = new Set();
const rendererUrl = development
  ? `http://127.0.0.1:${developmentPort}/`
  : pathToFileURL(path.join(__dirname, "../dist/index.html")).href;

async function createWindow() {
  // Packagers can copy build/icon.ico into resources; source runs use build/.
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(app.getAppPath(), "build/icon.ico");
  const window = new BrowserWindow({
    title: "Mahsood Tyres",
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: "#f3f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  const contents = window.webContents;
  allowedContents.add(contents);
  contents.once("destroyed", () => {
    allowedContents.delete(contents);
    authService?.invalidate();
  });

  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (backupService?.isBusy()) event.preventDefault();
  });

  if (development) {
    await window.loadURL(rendererUrl);
  } else {
    await window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function fail(error) {
  console.error("Unable to start Mahsood Tyre Manager:", error);
  app.exit(1);
}

function bindBusinessIpc(database, ipcMain) {
  registerLedgerIpc(
    ipcMain,
    createLedgerService(database),
    createLedgerPrintingService(database, createPrintDriver()),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerSettingsIpc(
    ipcMain,
    createSettingsService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerPrintingIpc(
    ipcMain,
    createPrintingService(database, createPrintDriver()),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerReturnIpc(
    ipcMain,
    createReturnServices(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerPaymentIpc(
    ipcMain,
    createPaymentServices(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerReportsIpc(
    ipcMain,
    createReportsService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerDashboardIpc(
    ipcMain,
    createDashboardService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerExpenseIpc(
    ipcMain,
    createExpenseServices(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerSaleIpc(
    ipcMain,
    createSaleService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerCustomerIpc(
    ipcMain,
    createCustomerService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerInventoryIpc(
    ipcMain,
    createInventoryService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerCatalogIpc(
    ipcMain,
    createCatalogServices(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerSupplierIpc(
    ipcMain,
    createSupplierService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
  registerPurchaseIpc(
    ipcMain,
    createPurchaseService(database),
    createSenderGuard(allowedContents, rendererUrl),
  );
}

let backupService;
let authService;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
if (primaryInstance)
  app
    .whenReady()
    .then(async () => {
      if (profileConflict) {
        dialog.showErrorBox(
          "Shop data profile conflict",
          `Two shop databases were found. Startup has stopped to protect both. Review and back up both profiles before choosing which database to use:\n\n${profileConflict.legacy}\n\n${profileConflict.branded}\n\nNo shop data has been moved or replaced.`,
        );
        throw new Error("Conflicting legacy and pre-release shop data profiles.");
      }
      recoverInterruptedRestore(getDatabasePath(app));
      const database = initializeDatabase(app);
      const gate = createMaintenanceGate(ipcMain);
      const trusted = createSenderGuard(allowedContents, rendererUrl);
      authService = createAuthService(
        () => initializeDatabase(app),
        () => {
          for (const contents of allowedContents)
            if (!contents.isDestroyed()) contents.send("auth:changed");
        },
      );
      const authorized = createAuthorizedIpc(gate.ipc, authService, trusted);
      registerAuthIpc(gate.ipc, authService, trusted);
      const reopen = () => {
        const db = initializeDatabase(app);
        authService.invalidate();
        bindBusinessIpc(db, authorized);
        return db;
      };
      bindBusinessIpc(database, authorized);
      backupService = createBackupService({
        app,
        dialogs: dialog,
        getDatabase: () => initializeDatabase(app),
        closeDatabase,
        reopen,
        gate,
      });
      registerBackupIpc(
        createAuthorizedIpc(ipcMain, authService, trusted),
        backupService,
        createSenderGuard(allowedContents, rendererUrl),
      );
      console.log(
        `Database initialized (schema ${database.pragma("user_version", { simple: true })}): ${database.name}`,
      );
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      await createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
          createWindow().catch(fail);
      });
    })
    .catch(fail);

app.on("before-quit", (event) => {
  if (backupService?.isBusy()) event.preventDefault();
});
app.on("will-quit", closeDatabase);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
