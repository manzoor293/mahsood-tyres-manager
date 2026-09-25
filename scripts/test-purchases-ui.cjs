const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { registerPurchaseIpc } = require('../electron/ipc/purchases.cjs');
const { createSenderGuard } = require('../electron/ipc/catalog.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:purchases:ui for temporary data.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => { console.error('Purchase UI timeout'); app.exit(1); }, 90000);
app.on('browser-window-created', (_, window) => {
  window.webContents.once('did-finish-load', async () => {
    const db = initializeDatabase(app);
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
    const selectProduct = async (index, sku) => {
      await evaluate(`(() => { const e=document.querySelector('[data-purchase-item="${index}"] input[role="combobox"]'); e.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(sku)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(e=>e.textContent.startsWith(${JSON.stringify(sku)}))`);
      await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.startsWith(${JSON.stringify(sku)})).click()`);
    };
    const restore = () => {
      for (const method of ['list','getById','create']) ipcMain.removeHandler(`purchases:${method}`);
      const url = process.argv.includes('--dev') ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
      registerPurchaseIpc(ipcMain, createPurchaseService(db), createSenderGuard(new Set([window.webContents]), url));
    };
    try {
      db.exec(`INSERT INTO suppliers(name) VALUES ('UI Supplier'); INSERT INTO suppliers(name,active) VALUES ('Inactive supplier',0);
        INSERT INTO products(sku,model,size) VALUES ('UI-A','Tyre A','16'),('UI-B','Tyre B','17');
        INSERT INTO products(sku,model,size,active) VALUES ('INACTIVE','Hidden','18',0);`);
      await evaluate('location.hash="/purchases"');
      await wait(`document.body.textContent.includes('No purchases found')`);
      await click('New Purchase'); await click('Save Purchase');
      await wait(`document.body.textContent.includes('Supplier, invoice number and purchase date are required.')`);
      assert.equal(await evaluate(`document.querySelector('[name="purchase-supplier"]').textContent.includes('Inactive supplier')`), false);
      await input('purchase-supplier', 1); await input('purchase-invoice', 'UI-PUR-1'); await input('purchase-date', '2026-09-25');
      await selectProduct(0, 'UI-A'); await input('quantity-0', 2); await input('cost-0', '125');
      await click('Add item'); await selectProduct(1, 'UI-A');
      await wait(`document.body.textContent.includes('This product is already in the purchase')`);
      await selectProduct(1, 'UI-B'); await input('quantity-1', 3); await input('cost-1', '200');
      await click('Add item'); await click('Remove item 3');
      await input('purchase-discount', '50'); await input('purchase-paid', '300'); await input('purchase-notes', 'UI historical receipt');
      // Real backend validation, through the actual preload bridge.
      await input('purchase-paid', '9999'); await click('Save Purchase');
      await wait(`document.body.textContent.includes('Paid amount cannot exceed the purchase total.')`);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM purchases').get().n, 0);
      await input('purchase-paid', '300');
      const service = createPurchaseService(db);
      let submissions = 0;
      ipcMain.removeHandler('purchases:create');
      ipcMain.handle('purchases:create', async (_, data) => { submissions++; await new Promise((resolve) => setTimeout(resolve, 350)); return { ok: true, data: service.create(data) }; });
      await click('Save Purchase');
      await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Saving…' && b.disabled)`);
      await evaluate(`document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
      await wait(`!document.querySelector('[role="dialog"]') && document.querySelector('[data-purchase-id]')?.textContent.includes('UI-PUR-1')`);
      assert.equal(submissions, 1); restore();
      const purchase = service.getById(1);
      assert.equal(purchase.total, 80000); assert.equal(purchase.balance, 50000); assert.equal(purchase.item_count, 2);
      assert.deepEqual(db.prepare('SELECT quantity FROM inventory ORDER BY product_id').all().map((r) => r.quantity), [2,3,0]);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n, 2);
      await click('View purchase UI-PUR-1');
      await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('UI historical receipt')`);
      assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Rs. 125')`));
      await click('Close');
      await input('purchase-search', 'missing'); await wait(`document.body.textContent.includes('No purchases found')`);
      await click('Reset filters'); await wait(`Boolean(document.querySelector('[data-purchase-id]'))`);
      await input('purchase-status', 'paid'); await wait(`document.body.textContent.includes('No purchases found')`);
      await input('purchase-status', 'partial'); await wait(`Boolean(document.querySelector('[data-purchase-id]'))`);
      await input('purchase-filter-supplier', 2); await wait(`document.body.textContent.includes('No purchases found')`);
      await input('purchase-filter-supplier', 1); await wait(`Boolean(document.querySelector('[data-purchase-id]'))`);
      await input('purchase-from', '2026-09-26'); await wait(`document.body.textContent.includes('No purchases found')`);
      await click('Reset filters'); await wait(`Boolean(document.querySelector('[data-purchase-id]'))`);
      ipcMain.removeHandler('purchases:list'); ipcMain.handle('purchases:list', async () => { await new Promise((resolve) => setTimeout(resolve, 300)); return { ok: false, error: { code: 'INTERNAL', message: 'Temporary purchase list failure' } }; });
      await input('purchase-search', 'UI');
      await wait(`document.body.textContent.includes('Loading purchases…')`);
      await wait(`document.body.textContent.includes('Temporary purchase list failure')`);
      restore(); await click('Retry'); await wait(`Boolean(document.querySelector('[data-purchase-id]'))`);
      assert.deepEqual(await evaluate('Object.keys(window.api.purchases).sort()'), ['create','getById','list']);
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      assert.equal(await evaluate('typeof window.api.invoke'), 'undefined');
      const prefs = window.webContents.getLastWebPreferences(); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false);
      window.setSize(640, 480); await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/purchases-ui.png'), (await window.webContents.capturePage()).toPNG());
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      console.log('PASS: real purchase UI/preload/IPC creation, multi-item selection, duplicate prevention, validation, saving guard, stock, details, filters, loading/empty/error/retry and narrow layout.');
      clearTimeout(timeout); app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require('../electron/main.cjs');
