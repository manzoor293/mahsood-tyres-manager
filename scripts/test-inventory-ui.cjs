const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createInventoryService } = require('../electron/services/inventory.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { registerInventoryIpc } = require('../electron/ipc/inventory.cjs');
const { createSenderGuard } = require('../electron/ipc/catalog.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:inventory:ui for temporary data.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => { console.error('Inventory UI timeout'); app.exit(1); }, 90000);
app.on('browser-window-created', (_, window) => {
  window.webContents.once('did-finish-load', async () => {
    const db = initializeDatabase(app);
    const service = createInventoryService(db);
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let i = 0; i < 150; i++) { if (await evaluate(condition)) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
      throw new Error(`Timed out: ${condition}`);
    };
    const click = async (label) => {
      const selector = `Array.from(document.querySelectorAll('button')).find(b => (b.textContent.trim()===${JSON.stringify(label)} || b.getAttribute('aria-label')===${JSON.stringify(label)}) && !b.disabled)`;
      await wait(`Boolean(${selector})`); await evaluate(`${selector}.click()`);
    };
    const input = async (name, value) => {
      await evaluate(`(() => { const e=document.querySelector('[name="${name}"]'); const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
    };
    const ready = `!document.querySelector('section').textContent.includes('Loading inventory...')`;
    const qty = `document.querySelector('[data-stock-id="1"] [data-stock-quantity]')?.textContent`;
    const noDialog = `!document.querySelector('[role="dialog"]')`;
    const restore = () => {
      for (const method of ['list','getProductStock','listMovements','adjust']) ipcMain.removeHandler(`inventory:${method}`);
      const url = process.argv.includes('--dev') ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
      registerInventoryIpc(ipcMain, service, createSenderGuard(new Set([window.webContents]), url));
    };
    try {
      await evaluate('location.hash="/inventory"');
      await wait(`document.querySelector('h1')?.textContent==='Inventory'`);
      await wait(`document.body.textContent.includes('No stock records found.')`);
      db.exec(`INSERT INTO brands(name) VALUES ('Dunlop'),('Other'); INSERT INTO categories(name) VALUES ('Car'),('Truck');
        INSERT INTO suppliers(name) VALUES ('Test supplier');
        INSERT INTO products(sku,model,size,brand_id,category_id,minimum_stock,active) VALUES
        ('UI-A','Touring','R15',1,1,3,1),('UI-B','Cargo','R20',2,2,2,1),('UI-C','Old','R16',1,1,1,0);`);
      createPurchaseService(db).create({ supplier_id: 1, invoice_number: 'UI-STOCK-INVOICE', purchased_at: '2026-09-25', items: [{ product_id: 1, quantity: 12, unit_cost: 10000 }] });
      await click('Refresh'); await wait(`${qty}==='12'`);
      assert.ok(await evaluate(`document.querySelector('[data-stock-id="3"]').textContent.includes('Inactive Product')`));
      assert.equal(await evaluate(`document.querySelector('[aria-label="Adjust stock UI-C"]').disabled`), true);
      for (const search of ['UI-A','dunlop','touring','R15']) {
        await input('inventory-search', search); await wait(`${ready} && ${qty}==='12'`);
      }
      await input('inventory-search', 'missing'); await wait(`document.body.textContent.includes('No stock records found.')`);
      await click('Reset filters'); await wait(`${qty}==='12'`);
      for (const [name,value] of [['inventory-brand',2],['inventory-category',2],['inventory-status','out'],['inventory-active','inactive']]) {
        await input(name, value); await wait(`${ready} && !document.querySelector('[data-stock-id="1"]')`);
        await click('Reset filters'); await wait(`${qty}==='12'`);
      }
      await click('Adjust stock UI-A');
      await click('Review Adjustment'); await wait(`document.body.textContent.includes('Quantity must be a positive whole number.')`);
      await input('adjustment-quantity', 3); await click('Review Adjustment');
      await wait(`document.body.textContent.includes('A reason is required')`);
      await input('adjustment-notes', 'Found tyres in storage'); await click('Review Adjustment');
      await wait(`document.querySelector('#adjust-stock-title')?.textContent==='Confirm stock adjustment'`);
      assert.equal(await evaluate(`document.querySelector('[data-current-quantity]').textContent`), '12');
      assert.equal(await evaluate(`document.querySelector('[data-expected-quantity]').textContent`), '15');
      assert.equal(service.getProductStock(1).quantity, 12);
      await click('Cancel'); await wait(noDialog); assert.equal(service.getProductStock(1).quantity, 12);
      await click('Adjust stock UI-A'); await input('adjustment-quantity', 3); await input('adjustment-notes', 'Found tyres in storage');
      await click('Review Adjustment'); await click('Confirm Adjustment'); await wait(`${noDialog} && ${qty}==='15'`);
      assert.equal(service.getProductStock(1).quantity, 15); assert.equal(service.listMovements({ movement_type: 'ADJUSTMENT_IN' }).length, 1);
      await click('Adjust stock UI-A'); await input('adjustment-type', 'ADJUSTMENT_OUT'); await input('adjustment-quantity', 2); await input('adjustment-notes', 'Damaged tyres');
      await click('Review Adjustment'); await click('Confirm Adjustment'); await wait(`${noDialog} && ${qty}==='13'`);
      assert.equal(service.getProductStock(1).quantity, 13); assert.equal(service.listMovements({ movement_type: 'ADJUSTMENT_OUT' }).length, 1);
      await click('Adjust stock UI-A'); await input('adjustment-type', 'ADJUSTMENT_OUT'); await input('adjustment-quantity', 99); await input('adjustment-notes', 'Too many');
      await click('Review Adjustment'); await click('Confirm Adjustment');
      await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Insufficient stock. Only 13 units are available.')`);
      assert.equal(service.getProductStock(1).quantity, 13); assert.equal(service.listMovements().length, 3);
      await click('Cancel'); await wait(noDialog);
      // Simulate a concurrent receipt after opening the review. The backend must reject the stale confirmation.
      await click('Adjust stock UI-A'); await input('adjustment-quantity', 1); await input('adjustment-notes', 'Stale review'); await click('Review Adjustment');
      service.adjust({ product_id: 1, movement_type: 'ADJUSTMENT_IN', quantity: 1, notes: 'Concurrent stock change' });
      await click('Confirm Adjustment'); await wait(`document.body.textContent.includes('Stock changed since your review.')`);
      assert.equal(service.getProductStock(1).quantity, 14); await click('Cancel'); await wait(noDialog);
      await click('Refresh'); await wait(`${qty}==='14'`);
      await click('History UI-A'); await wait(`document.querySelector('table[aria-label="Stock Movements"]')?.textContent.includes('UI-STOCK-INVOICE')`);
      assert.ok(await evaluate(`document.querySelector('table').textContent.includes('Found tyres in storage')`));
      await input('inventory-type', 'ADJUSTMENT_OUT'); await wait(`${ready} && document.querySelectorAll('[data-movement-id]').length===1`);
      assert.ok(await evaluate(`document.querySelector('[data-movement-id]').textContent.includes('Damaged tyres')`));
      await input('inventory-from', '2099-01-01'); await wait(`document.body.textContent.includes('No stock movements found.')`);
      await click('Reset filters'); await wait(`document.querySelectorAll('[data-movement-id]').length===4`);
      await click('Current Stock'); await wait(`${qty}==='14'`);
      ipcMain.removeHandler('inventory:list');
      ipcMain.handle('inventory:list', async () => { await new Promise((resolve) => setTimeout(resolve, 300)); return { ok: false, error: { code: 'INTERNAL', message: 'Temporary inventory failure' } }; });
      await click('Refresh'); await wait(`document.body.textContent.includes('Loading inventory...')`); await wait(`document.body.textContent.includes('Temporary inventory failure')`);
      restore(); await click('Retry'); await wait(`${qty}==='14'`);
      const api = await evaluate(`({keys:Object.keys(window.api.inventory).sort(),node:typeof window.require,sql:typeof window.api.invoke})`);
      assert.deepEqual(api, { keys: ['adjust','getProductStock','list','listMovements'], node: 'undefined', sql: 'undefined' });
      const prefs = window.webContents.getLastWebPreferences(); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/inventory-ui.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(640, 480); await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      await click('Adjust stock UI-A');
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      await click('Cancel');
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      console.log('PASS: Inventory renderer/preload/IPC loading, empty/search/filters/history, adjustment confirmation/cancel, increase/decrease, validation, insufficient/stale stock, retry, isolation and narrow layout.');
      clearTimeout(timeout); app.quit();
    } catch (error) {
      console.error(error);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/inventory-ui-failure.png'), (await window.webContents.capturePage()).toPNG());
      app.exit(1);
    }
  });
});
require('../electron/main.cjs');
