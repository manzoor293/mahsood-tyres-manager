const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createLedgerService } = require('../electron/services/ledger.cjs');
const { createPrintingService } = require('../electron/services/printing.cjs');
const { createPrintDriver } = require('../electron/printing/driver.cjs');
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw Error('Temporary profile required');
app.setPath('userData', root); app.setPath('sessionData', root);
const timeout = setTimeout(() => { console.error('Shipment UI timeout'); app.exit(1); }, 90000);
let handled = false;
app.on('browser-window-created', (_, window) => {
  if (handled) return; handled = true;
  window.webContents.once('did-finish-load', async () => {
    try {
      await require('./auth-test-helper.cjs').authenticate(window);
      const db = initializeDatabase(app);
      db.exec("INSERT INTO suppliers(name) VALUES('Shipment supplier'); INSERT INTO products(sku,model,size,default_selling_price,price_units_per_unit) VALUES('SHIP-A','Shipment A','R16',13000000,2),('SHIP-B','Shipment B','R17',6500000,2)");
      const evaluate = async code => {
        try { return await window.webContents.executeJavaScript(code); }
        catch (error) { console.error('Renderer expression:', code); throw error; }
      };
      const wait = async expression => {
        for (let i = 0; i < 180; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); }
        throw Error(`Timed out: ${expression}`);
      };
      const click = async label => {
        const expression = `Array.from(document.querySelectorAll('button')).find(b => (b.textContent.trim()===${JSON.stringify(label)} || b.getAttribute('aria-label')===${JSON.stringify(label)}) && !b.disabled)`;
        await wait(`Boolean(${expression})`); await evaluate(`${expression}.click()`);
      };
      const input = async (name, value) => evaluate(`(() => {const e=document.querySelector('[name="${name}"]');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
      const product = async (index, sku) => {
        await evaluate(`(() => {const e=document.querySelector('[data-purchase-item="${index}"] input[role="combobox"]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(sku)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(e=>e.textContent.startsWith(${JSON.stringify(sku)}))`);
        await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.startsWith(${JSON.stringify(sku)})).click()`);
      };
      await evaluate('location.hash="/purchases"'); await click('New Purchase');
      assert.equal(await evaluate('document.querySelector("[name=purchase-shipment]").value'), '0');
      await input('purchase-supplier', 1); await input('purchase-invoice', 'SHIP-UI');
      await product(0, 'SHIP-A'); await input('quantity-0', 5); await input('cost-0', '100000');
      await click('Add item'); await product(1, 'SHIP-B'); await input('quantity-1', 10); await input('cost-1', '50000');
      await input('purchase-paid', '400000');
      for (const invalid of ['-1', 'NaN', 'Infinity', 'abc', '1.001', '90071992547410']) {
        await input('purchase-shipment', invalid); await click('Save Purchase');
        await wait('document.body.textContent.includes("Enter non-negative amounts")');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM purchases').get().n, 0);
      }
      await input('purchase-shipment', '');
      assert.equal(await evaluate('document.querySelector("[name=purchase-shipment]").getAttribute("aria-invalid")'), 'false');
      await input('purchase-shipment', '100000'); await input('purchase-transporter', 'Audit transporter'); await input('purchase-shipment-reference', 'BILTY-UI');
      for (const label of ['Supplier Invoice Total: Rs. 1,000,000', 'Supplier Payable: Rs. 600,000', 'Total Landed Purchase Cost: Rs. 1,100,000'])
        assert.ok(await evaluate(`document.body.textContent.includes(${JSON.stringify(label)})`), label);
      await click('Save Purchase'); await wait('!document.querySelector("[role=dialog]") && document.querySelector("[data-purchase-id]")');
      const p = createPurchaseService(db).getById(1);
      assert.equal(p.total, 100000000); assert.equal(p.balance, 60000000); assert.equal(p.landed_total, 110000000);
      assert.deepEqual(p.items.map(i=>i.allocated_shipment_cost), [5000000, 5000000]);
      assert.deepEqual(db.prepare('SELECT quantity FROM inventory ORDER BY product_id').all().map(i=>i.quantity), [10,20]);
      const ledger = createLedgerService(db).getFullStatement({party_type:'supplier',party_id:1});
      assert.equal(ledger.totals.invoices, 100000000); assert.equal(ledger.totals.payments, 40000000); assert.equal(ledger.closingBalance, 60000000);
      await click('View purchase SHIP-UI'); await wait('document.body.textContent.includes("Audit transporter")');
      for (const text of ['Allocated freight', 'Supplier Invoice Total', 'Total Landed Purchase Cost', 'Supplier Payable', 'BILTY-UI'])
        assert.ok(await evaluate(`document.querySelector('[role=dialog]').textContent.includes(${JSON.stringify(text)})`), text);
      fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
      await new Promise(resolve => setTimeout(resolve, 300));
      fs.writeFileSync(path.join(__dirname,'../artifacts/shipment-details.png'),(await window.webContents.capturePage()).toPNG());
      const pdfPath = path.join(root,'shipment.pdf');
      const printer = createPrintingService(db,createPrintDriver({chooseFile:async()=>({filePath:pdfPath})}));
      await printer.savePdf('purchaseInvoice', p.id, window);
      assert.equal(fs.readFileSync(pdfPath).subarray(0,4).toString(),'%PDF');
      await click('Close');
      await evaluate('location.hash="/sales"'); await click('New Sale');
      await wait('Boolean(document.querySelector("[name=pos-product]"))');
      await evaluate('document.querySelector("[name=pos-product]").focus()');
      await input('pos-product','SHIP-A');
      await wait('Array.from(document.querySelectorAll("[role=option]")).some(e=>e.textContent.startsWith("SHIP-A"))');
      await evaluate('Array.from(document.querySelectorAll("[role=option]")).find(e=>e.textContent.startsWith("SHIP-A")).click()');
      await click('Complete Sale'); await wait('document.querySelector("[data-sale-id]")');
      const sold = db.prepare('SELECT * FROM sale_items').get();
      assert.equal(sold.unit_cost,10000000); assert.equal(sold.allocated_shipment_cost,1000000);
      // Return to Dashboard: default date range includes the purchase and sale made above.
      await evaluate('location.hash="/dashboard"'); await wait(`document.querySelector('[data-metric="Gross Profit"]')`);
      assert.ok(await evaluate(`document.querySelector('[data-metric="Gross Profit"]').textContent.includes('Rs. 20,000')`));
      assert.ok(await evaluate(`document.querySelector('[data-metric="Supplier Payables"]').textContent.includes('Rs. 600,000')`));
      await evaluate('location.hash="/reports"'); await wait('Boolean(document.querySelector("[name=report-type]"))');
      await input('report-type','purchases'); await wait('document.querySelector("[data-report-type=purchases] tbody")');
      for (const label of ['Supplier Invoice Total','Shipment Cost','Original Total Landed Cost'])
        assert.ok(await evaluate(`document.querySelector('thead').textContent.includes(${JSON.stringify(label)})`), label);
      assert.equal(await evaluate('typeof window.require'),'undefined');
      assert.equal(window.webContents.getLastWebPreferences().nodeIntegration,false);
      console.log('PASS shipment UI: authenticated entry/validation, requested business scenario, pair stock, supplier ledger/details, real PDF, sale historical landed cost and Dashboard profit/payable');
      clearTimeout(timeout); app.quit();
    } catch(error) { console.error(error); app.exit(1); }
  });
});
require('../electron/main.cjs');
