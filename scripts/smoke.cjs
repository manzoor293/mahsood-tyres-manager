const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const timeout = setTimeout(() => {
  console.error('FAIL: Electron did not render within 30 seconds.');
  app.exit(1);
}, 30000);

app.on('browser-window-created', (_event, window) => {
  window.webContents.on('preload-error', (_event, _path, error) => {
    console.error(error);
    app.exit(1);
  });
  window.webContents.once('did-finish-load', async () => {
    try {
      let state;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        state = await window.webContents.executeJavaScript(`({
          title: document.querySelector('h1')?.textContent,
          status: document.querySelector('.status')?.textContent,
          desktop: window.desktop?.isElectron,
          requireType: typeof window.require,
          processType: typeof window.process
        })`);
        if (state.title && window.isVisible()) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(state.title, 'Mahsood Tyre Manager');
      assert.equal(state.status, 'Desktop application is ready.');
      assert.equal(state.desktop, true);
      assert.equal(state.requireType, 'undefined');
      assert.equal(state.processType, 'undefined');
      assert.equal(window.isVisible(), true);
      const preferences = window.webContents.getLastWebPreferences();
      assert.equal(preferences.contextIsolation, true);
      assert.equal(preferences.nodeIntegration, false);
      assert.equal(preferences.sandbox, true);
      const screenshot = await window.webContents.capturePage();
      assert.equal(screenshot.isEmpty(), false);
      await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
      const mode = process.argv.includes('--dev') ? 'development' : 'production';
      await fs.writeFile(path.join(__dirname, `../artifacts/${mode}.png`), screenshot.toPNG());
      console.log(`PASS (${mode}): visible Electron window, React rendered, preload bridge works, Node access blocked, isolation and sandbox enabled.`);
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error('FAIL:', error);
      app.exit(1);
    }
  });
});

require('../electron/main.cjs');
