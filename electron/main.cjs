const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createCatalogServices } = require('./services/catalog.cjs');
const { createSupplierService } = require('./services/suppliers.cjs');
const { registerSupplierIpc } = require('./ipc/suppliers.cjs');
const { registerCatalogIpc, createSenderGuard } = require('./ipc/catalog.cjs');
const { initializeDatabase, closeDatabase } = require('./database/index.cjs');

app.setName('Mahsood Tyre Manager');
const development = !app.isPackaged && process.argv.includes('--dev');
const allowedContents = new Set();
const rendererUrl = development ? 'http://127.0.0.1:5173/'
  : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;

async function createWindow() {
  const window = new BrowserWindow({
    title: 'Mahsood Tyre Manager',
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#f3f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  const contents = window.webContents;
  allowedContents.add(contents);
  contents.once('destroyed', () => allowedContents.delete(contents));

  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());

  if (development) {
    await window.loadURL('http://127.0.0.1:5173');
  } else {
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function fail(error) {
  console.error('Unable to start Mahsood Tyre Manager:', error);
  app.exit(1);
}

app.whenReady().then(async () => {
  const database = initializeDatabase(app);
  registerCatalogIpc(ipcMain, createCatalogServices(database), createSenderGuard(allowedContents, rendererUrl));
  registerSupplierIpc(ipcMain, createSupplierService(database), createSenderGuard(allowedContents, rendererUrl));
  console.log(`Database initialized (schema ${database.pragma('user_version', { simple: true })}): ${database.name}`);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(fail);
  });
}).catch(fail);

app.on('will-quit', closeDatabase);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
