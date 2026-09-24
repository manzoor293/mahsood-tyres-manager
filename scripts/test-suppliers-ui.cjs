const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createSupplierService } = require('../electron/services/suppliers.cjs');
const { registerSupplierIpc } = require('../electron/ipc/suppliers.cjs');
const { createSenderGuard } = require('../electron/ipc/catalog.cjs');

if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:suppliers:ui for an isolated database.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => { console.error('FAIL: Supplier UI test timed out'); app.exit(1); }, 60000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    const database = initializeDatabase(app);
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (await evaluate(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`UI condition timed out: ${condition}`);
    };
    const click = async (label) => {
      const selector = `Array.from(document.querySelectorAll('button')).find(b => (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)}) && !b.disabled)`;
      await wait(`Boolean(${selector})`); await evaluate(`${selector}.click()`);
    };
    const input = async (name, value) => {
      await evaluate(`(() => {
        const element=document.querySelector('[name="${name}"]');
        const prototype=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(String(value))});
        element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));
      })()`);
    };
    const noDialogs = `!document.querySelector('[role="dialog"]')`;
    const rowText = `document.querySelector('[data-supplier-id]')?.textContent`;
    let unregister;
    const restore = () => {
      for (const method of ['list', 'getById', 'create', 'update', 'deactivate']) ipcMain.removeHandler(`suppliers:${method}`);
      const url = process.argv.includes('--dev') ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
      unregister = registerSupplierIpc(ipcMain, createSupplierService(database), createSenderGuard(new Set([window.webContents]), url));
    };
    try {
      await evaluate('location.hash="/suppliers"');
      await wait(`document.querySelector('h1')?.textContent==='Suppliers'`);
      await wait(`document.body.textContent.includes('No suppliers found')`);
      await click('Add Supplier');
      await click('Create Supplier');
      await wait(`document.body.textContent.includes('Supplier name is required.')`);
      await input('supplier-name', ' UI Supplier ');
      await input('supplier-phone', 'abc');
      await click('Create Supplier');
      await wait(`document.body.textContent.includes('Enter 7 to 15 digits')`);
      await input('supplier-phone', '+92 (300) 123-4567');
      await input('supplier-address', ' Lahore ');
      await input('supplier-notes', ' Test only ');
      // A main-process validation response must remain visible in the form.
      ipcMain.removeHandler('suppliers:create');
      ipcMain.handle('suppliers:create', () => ({ ok: false, error: { code: 'VALIDATION', message: 'Supplier test validation error' } }));
      await click('Create Supplier');
      await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Supplier test validation error')`);
      assert.equal(database.prepare('SELECT COUNT(*) AS n FROM suppliers').get().n, 0);
      restore();
      await click('Create Supplier');
      await wait(`${noDialogs} && ${rowText}?.includes('UI Supplier')`);
      const supplier = database.prepare('SELECT * FROM suppliers').get();
      assert.equal(supplier.name, 'UI Supplier'); assert.equal(supplier.phone, '+923001234567'); assert.equal(supplier.address, 'Lahore');
      await click('Edit supplier UI Supplier');
      await wait(`Boolean(document.querySelector('[name="supplier-name"]'))`);
      await input('supplier-name', 'UI Updated'); await input('supplier-notes', 'Updated notes');
      await click('Save Supplier');
      await wait(`${noDialogs} && ${rowText}?.includes('UI Updated')`);
      assert.equal(database.prepare('SELECT notes FROM suppliers').get().notes, 'Updated notes');
      for (const search of ['UPDATED', '300123', 'lahore']) {
        await input('supplier-search', search);
        await wait(`!document.querySelector('section').textContent.includes('Loading suppliers…') && ${rowText}?.includes('UI Updated')`);
      }
      await input('supplier-search', 'Missing supplier');
      await wait(`document.body.textContent.includes('No suppliers found')`);
      await click('Reset filters');
      await wait(`${rowText}?.includes('UI Updated')`);
      await click('Deactivate supplier UI Updated'); await click('Cancel');
      await wait(noDialogs);
      assert.equal(database.prepare('SELECT active FROM suppliers').get().active, 1);
      await click('Deactivate supplier UI Updated'); await click('Deactivate Supplier');
      await wait(`${noDialogs} && document.body.textContent.includes('No suppliers found')`);
      await input('supplier-status', 'inactive'); await wait(`${rowText}?.includes('Inactive')`);
      assert.equal(database.prepare('SELECT active FROM suppliers').get().active, 0);
      await input('supplier-status', 'all'); await wait(`${rowText}?.includes('UI Updated')`);
      assert.equal(database.prepare('SELECT COUNT(*) AS n FROM suppliers').get().n, 1);
      ipcMain.removeHandler('suppliers:list');
      ipcMain.handle('suppliers:list', async () => { await new Promise((resolve) => setTimeout(resolve, 300)); return { ok: false, error: { code: 'INTERNAL', message: 'Temporary supplier list failure' } }; });
      await input('supplier-search', 'Retry');
      await wait(`document.querySelector('section').textContent.includes('Loading suppliers…')`);
      await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Temporary supplier list failure')`);
      restore(); await click('Retry');
      await wait(`!document.querySelector('[role="alert"]')`);
      await input('supplier-search', '');
      await wait(`${rowText}?.includes('UI Updated')`);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/suppliers-ui.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(640, 480); await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      assert.deepEqual(database.pragma('foreign_key_check'), []);
      console.log('PASS: supplier renderer create/edit/search/status, phone feedback/normalization, backend error feedback, deactivation cancel/confirm, loading/empty/error/retry states and narrow layout.');
      clearTimeout(timeout); unregister?.(); app.quit();
    } catch (error) {
      console.error('FAIL:', error);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/suppliers-ui-failure.png'), (await window.webContents.capturePage()).toPNG());
      app.exit(1);
    }
  });
});
require('../electron/main.cjs');
