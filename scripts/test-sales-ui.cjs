const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createSaleService } = require('../electron/services/sales.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createInventoryService } = require('../electron/services/inventory.cjs');
const { registerSaleIpc } = require('../electron/ipc/sales.cjs');
const { createSenderGuard } = require('../electron/ipc/catalog.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:sales:ui for temporary data.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA); app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => { console.error('Sales UI timeout'); app.exit(1); },120000);
app.on('browser-window-created', (_,window) => {
  window.webContents.once('did-finish-load', async () => {
    const db = initializeDatabase(app);
    const service = createSaleService(db);
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let i=0;i<160;i++) { if (await evaluate(condition)) return; await new Promise((r) => setTimeout(r,50)); }
      throw new Error(`Timed out: ${condition}`);
    };
    const click = async (label) => {
      const selector = `Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)} || b.getAttribute('aria-label')===${JSON.stringify(label)}) && !b.disabled)`;
      await wait(`Boolean(${selector})`); await evaluate(`${selector}.click()`);
    };
    const input = async (name,value) => {
      await evaluate(`(() => { const e=document.querySelector('[name="${name}"]'); const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
    };
    const select = async (name,search) => {
      await evaluate(`document.querySelector('[name="${name}"]').focus()`); await input(name,search);
      await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(e=>e.textContent.startsWith(${JSON.stringify(search)}))`);
      await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.startsWith(${JSON.stringify(search)})).click()`);
    };
    const url = process.argv.includes('--dev') ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
    const allowed = new Set([window.webContents]);
    const guard = createSenderGuard(allowed,url);
    const restore = () => { for (const method of ['list','getById','create']) ipcMain.removeHandler(`sales:${method}`); registerSaleIpc(ipcMain,service,guard); };
    const noDialog = `!document.querySelector('[role="dialog"]')`;
    try {
      db.exec(`INSERT INTO suppliers(name) VALUES ('Supplier'); INSERT INTO customers(name,phone) VALUES ('UI Customer','03001234567'); INSERT INTO customers(name,active) VALUES ('Inactive customer',0);
        INSERT INTO products(sku,model,size,default_selling_price) VALUES ('UI-A','Touring','R15',15000),('UI-B','Cargo','R20',25000);
        INSERT INTO products(sku,model,size,active) VALUES ('HIDDEN','Inactive','R15',0);`);
      createPurchaseService(db).create({ supplier_id: 1,invoice_number: 'UI-STOCK',purchased_at: '2026-09-25',items: [{ product_id: 1,quantity: 10,unit_cost: 10000 },{ product_id: 2,quantity: 10,unit_cost: 20000 }] });
      await evaluate('location.hash="/sales"'); await wait(`document.body.textContent.includes('No sales found.')`);
      await click('New Sale'); await click('Complete Sale'); await wait(`document.body.textContent.includes('Add at least one product.')`);
      await select('pos-product','UI-A'); await select('pos-product','UI-A');
      assert.equal(await evaluate(`document.querySelectorAll('[data-sale-item]').length`),1);
      assert.equal(await evaluate(`document.querySelector('[name="sale-quantity-0"]').value`),'2');
      await select('pos-product','UI-B'); await input('sale-quantity-1',3);
      await click('Remove UI-B'); assert.equal(await evaluate(`document.querySelectorAll('[data-sale-item]').length`),1);
      await select('pos-product','UI-B'); await input('sale-quantity-1',3);
      await select('pos-customer','UI Customer'); await input('sale-discount','50'); await input('sale-paid','300'); await input('sale-invoice','UI-SALE-1'); await input('sale-notes','Counter sale');
      assert.equal(await evaluate(`document.querySelector('[data-sale-total]').textContent`),'Rs. 1,000');
      assert.equal(await evaluate(`document.querySelector('[data-sale-balance]').textContent`),'Rs. 700');
      await input('sale-quantity-0',0); await click('Complete Sale'); await wait(`document.body.textContent.includes('Each item needs a positive whole quantity')`); await input('sale-quantity-0',2);
      await input('sale-paid','9999'); await click('Complete Sale'); await wait(`document.body.textContent.includes('Paid amount cannot exceed the sale total.')`); await input('sale-paid','300');
      // A real stock change after product selection must be caught by the actual main-process service.
      createInventoryService(db).adjust({ product_id: 2,movement_type: 'ADJUSTMENT_OUT',quantity: 8,notes: 'Concurrent stock change' });
      await click('Complete Sale'); await wait(`document.body.textContent.includes('Insufficient stock for UI-B. Only 2 available')`);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0);
      createInventoryService(db).adjust({ product_id: 2,movement_type: 'ADJUSTMENT_IN',quantity: 8,notes: 'Restore temporary test stock' });
      // Delay the real guarded handler to verify the renderer cannot submit twice while waiting.
      const handlers = new Map(); registerSaleIpc({ handle: (name,fn) => handlers.set(name,fn) },service,guard);
      let submits=0;
      ipcMain.removeHandler('sales:create'); ipcMain.handle('sales:create', async (...args) => { submits++; await new Promise((r) => setTimeout(r,400)); return handlers.get('sales:create')(...args); });
      fs.mkdirSync(path.join(__dirname,'../artifacts'),{ recursive: true });
      fs.writeFileSync(path.join(__dirname,'../artifacts/sales-pos.png'),(await window.webContents.capturePage()).toPNG());
      await click('Complete Sale'); await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Processing sale...' && b.disabled)`);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Processing sale...').click()`);
      await wait(`document.querySelector('#sale-details-title')?.textContent==='Sale UI-SALE-1'`);
      assert.equal(submits,1); restore();
      const first = service.getById(1); assert.equal(first.total,100000); assert.equal(first.balance,70000); assert.equal(first.customer_id,1);
      assert.deepEqual(db.prepare('SELECT quantity FROM inventory ORDER BY product_id').all().map((r)=>r.quantity),[8,7,0]);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE movement_type='SALE'").get().n,2);
      assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Unit cost (internal)')`));
      await click('Close'); await wait(`${noDialog} && Boolean(document.querySelector('[data-sale-id="1"]'))`);
      await click('View sale UI-SALE-1'); await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('Counter sale')`); await click('Close'); await wait(noDialog);
      await click('New Sale'); await select('pos-product','UI-A'); await click('Pay in full'); await input('sale-invoice','UI-SALE-1'); await click('Complete Sale');
      await wait(`document.body.textContent.includes('Invoice number already exists.')`); await input('sale-invoice',''); await click('Complete Sale');
      await wait(`document.querySelector('#sale-details-title')?.textContent.startsWith('Sale SALE-')`);
      const second = db.prepare('SELECT * FROM sales WHERE id=2').get(); const walk = service.getById(second.id);
      assert.equal(walk.customer_id,null); assert.equal(walk.balance,0); assert.equal(walk.payments[0].customer_id,null); assert.equal(walk.payment_method,'Cash');
      await click('Close'); await wait(`${noDialog} && document.querySelectorAll('[data-sale-id]').length===2`);
      await input('sale-search','UI-SALE-1'); await wait(`document.querySelectorAll('[data-sale-id]').length===1 && Boolean(document.querySelector('[data-sale-id="1"]'))`);
      await input('sale-search','missing'); await wait(`document.body.textContent.includes('No sales found.')`);
      await click('Reset filters'); await wait(`document.querySelectorAll('[data-sale-id]').length===2`);
      await input('sale-status','partial'); await wait(`document.querySelectorAll('[data-sale-id]').length===1 && Boolean(document.querySelector('[data-sale-id="1"]'))`);
      await input('sale-status','paid'); await wait(`document.querySelectorAll('[data-sale-id]').length===1 && Boolean(document.querySelector('[data-sale-id="2"]'))`);
      await click('Reset filters'); await wait(`document.querySelectorAll('[data-sale-id]').length===2`);
      await select('sale-filter-customer','UI Customer'); await wait(`document.querySelectorAll('[data-sale-id]').length===1 && Boolean(document.querySelector('[data-sale-id="1"]'))`);
      await click('Walk-in only'); await wait(`document.querySelectorAll('[data-sale-id]').length===1 && Boolean(document.querySelector('[data-sale-id="2"]'))`);
      await input('sale-from','2099-01-01'); await wait(`document.body.textContent.includes('No sales found.')`); await click('Reset filters'); await wait(`document.querySelectorAll('[data-sale-id]').length===2`);
      ipcMain.removeHandler('sales:list'); ipcMain.handle('sales:list',async () => { await new Promise((r)=>setTimeout(r,300)); return { ok: false,error: { code: 'INTERNAL',message: 'Temporary sales list failure' } }; });
      await input('sale-search','Retry'); await wait(`document.body.textContent.includes('Loading sales...')`); await wait(`document.body.textContent.includes('Temporary sales list failure')`);
      restore(); await click('Retry'); await wait(`!document.querySelector('[role="alert"]')`); await click('Reset filters'); await wait(`document.querySelectorAll('[data-sale-id]').length===2`);
      assert.deepEqual(await evaluate('Object.keys(window.api.sales).sort()'),['create','getById','list']); assert.equal(await evaluate('typeof window.require'),'undefined');
      allowed.clear(); assert.equal((await evaluate('window.api.sales.list()')).error.code,'FORBIDDEN'); allowed.add(window.webContents);
      const prefs=window.webContents.getLastWebPreferences(); assert.equal(prefs.contextIsolation,true); assert.equal(prefs.nodeIntegration,false);
      window.setSize(640,480); await new Promise((r)=>setTimeout(r,250)); assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false);
      await click('New Sale'); assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false); await click('Cancel');
      assert.deepEqual(db.pragma('foreign_key_check'),[]);
      console.log('PASS: POS selection/merge/removal, quantities, customer/walk-in, totals, partial/full payment, backend amount/stock/invoice errors, submission guard, history/details/filtering/retry, IPC security and narrow layout.');
      clearTimeout(timeout); app.quit();
    } catch (error) {
      console.error(error); fs.mkdirSync(path.join(__dirname,'../artifacts'),{ recursive: true });
      fs.writeFileSync(path.join(__dirname,'../artifacts/sales-ui-failure.png'),(await window.webContents.capturePage()).toPNG()); app.exit(1);
    }
  });
});
require('../electron/main.cjs');
