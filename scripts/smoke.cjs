const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const timeout = setTimeout(() => {
  console.error('FAIL: Electron verification did not finish within 60 seconds.');
  app.exit(1);
}, 60000);

app.on('browser-window-created', (_event, window) => {
  window.webContents.on('preload-error', (_event, _path, error) => {
    console.error(error);
    app.exit(1);
  });
  window.webContents.once('did-finish-load', async () => {
    try {
      require('./verify-database.cjs').verifyDatabase(app);
      let state;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        state = await window.webContents.executeJavaScript(`({
          title: document.querySelector('h1')?.textContent,
          header: document.querySelector('header')?.textContent,
          desktop: window.desktop?.isElectron,
          requireType: typeof window.require,
          processType: typeof window.process
        })`);
        if (state.title && window.isVisible()) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(state.title, 'Dashboard');
      assert.ok(state.header.includes('Mahsood Tyre Manager'));
      assert.ok(state.header.includes('Sales, Inventory & Shop Management System'));
      assert.equal(state.desktop, true);
      assert.equal(state.requireType, 'undefined');
      assert.equal(state.processType, 'undefined');
      assert.equal(window.isVisible(), true);
      const preferences = window.webContents.getLastWebPreferences();
      assert.equal(preferences.contextIsolation, true);
      assert.equal(preferences.nodeIntegration, false);
      assert.equal(preferences.sandbox, true);
      const waitForPage = async (title) => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const ready = await window.webContents.executeJavaScript(`
            document.querySelector('h1')?.textContent === ${JSON.stringify(title)} &&
            document.querySelector('nav a[aria-current="page"]')?.textContent === ${JSON.stringify(title)}
          `);
          if (ready) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(`Route did not render: ${title}`);
      };
      const pages = [
        ['dashboard', 'Dashboard'], ['products', 'Products / Tyres'],
        ['suppliers', 'Suppliers'], ['purchases', 'Purchases'], ['sales', 'Sales / POS'],
        ['customers', 'Customers'], ['expenses', 'Expenses'], ['reports', 'Reports'], ['settings', 'Settings'],
      ];
      for (const [route, title] of pages) {
        await window.webContents.executeJavaScript(`document.querySelector('nav a[href="#/${route}"]').click()`);
        await waitForPage(title);
        assert.ok(window.webContents.getURL().endsWith(`#/${route}`));
      }
      const reloaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
      window.webContents.reload();
      await reloaded;
      await waitForPage('Settings');
      await window.webContents.executeJavaScript('location.hash = "/unknown-route"');
      await waitForPage('Dashboard');
      const styles = await window.webContents.executeJavaScript(`({
        sidebar: getComputedStyle(document.querySelector('aside')).display,
        surface: getComputedStyle(document.querySelector('.MuiPaper-root')).backgroundColor,
        overflow: document.documentElement.scrollWidth > innerWidth
      })`);
      assert.equal(styles.sidebar, 'flex');
      assert.equal(styles.surface, 'rgb(255, 255, 255)');
      assert.equal(styles.overflow, false);
      // Let navigation styling finish painting before capturing the window.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const screenshot = await window.webContents.capturePage();
      assert.equal(screenshot.isEmpty(), false);
      await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
      const mode = process.argv.includes('--dev') ? 'development' : 'production';
      await fs.writeFile(path.join(__dirname, `../artifacts/${mode}.png`), screenshot.toPNG());
      window.setSize(640, 480);
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth'), false);
      console.log(`PASS (${mode}): all nine routes, active navigation, hash reload, fallback, Tailwind/MUI styles, narrow window, preload bridge, isolation and sandbox.`);
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error('FAIL:', error);
      app.exit(1);
    }
  });
});

require('../electron/main.cjs');
