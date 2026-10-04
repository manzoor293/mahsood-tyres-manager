const { BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createSaleService } = require('../electron/services/sales.cjs');
const { createPrintingService } = require('../electron/services/printing.cjs');
const { createPrintDriver } = require('../electron/printing/driver.cjs');

async function checkCompactPrinting(db, owner) {
  const artifacts = path.join(__dirname, '../artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  db.exec("UPDATE suppliers SET name='Long Supplier Name for Mahsood Commercial Tyre Distribution',address='A long supplier address, Industrial Estate, Warehouse 17, Main Road, Peshawar' WHERE id=1; UPDATE customers SET name='Long Customer Name for Fleet and Transport Services',address='Long customer address, Depot 5, Commercial Road, Peshawar' WHERE id=1; INSERT INTO settings(key,value) VALUES('shop.alternatePhone','0333-1234567'),('shop.footer','Thank you for your business.')");
  require('../electron/services/settings.cjs').createSettingsService(db).updateShopProfile({ footer: 'Thank you for your business.' });
  const products = [];
  for (let i = 0; i < 24; i++) products.push(Number(db.prepare("INSERT INTO products(sku,model,size,brand_id,price_units_per_unit) VALUES(?,?,?,1,2)").run(`COMPACT-${i + 1}`, i === 0 ? 'Long product name with wrapped tyre specifications and commercial model description' : `Touring Model ${i + 1}`, '195/65 R15').lastInsertRowid));
  const purchases = createPurchaseService(db), sales = createSaleService(db);
  let destination, expectedPaper = 'A5';
  const driver = createPrintDriver({
    chooseFile: async () => ({ canceled: false, filePath: destination }),
    print: (_window, options, callback) => {
      assert.equal(options.pageSize, expectedPaper);
      assert.equal(options.printBackground, expectedPaper === 'A5');
      assert.equal(options.color, expectedPaper === 'A5');
      if (expectedPaper === 'A5') assert.ok(Math.abs(options.margins.top - 7 * 96 / 25.4) < 0.001);
      callback(true);
    },
  });
  const output = createPrintingService(db, driver);
  const inspectPdf = (filename, paper) => {
    const content = fs.readFileSync(filename).toString('latin1');
    const boxes = [...content.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
    assert.ok(boxes.length);
    const [width, height] = paper === 'A5' ? [419.53, 595.28] : [595.28, 841.89];
    for (const box of boxes) assert.ok(Math.abs(Number(box[1]) - width) < 1 && Math.abs(Number(box[2]) - height) < 1, `${paper} page dimensions: ${box[0]}`);
    return (content.match(/\/Type\s*\/Page\b/g) || []).length;
  };
  for (const count of [1, 5, 10, 24]) {
    const cost = count === 10 ? 110000000001 : 11000001;
    const price = count === 10 ? 130000000001 : 13000001;
    const purchase = purchases.create({ supplier_id: 1, invoice_number: `COMPACT-P-${count}`, purchased_at: '2026-10-03', discount: count === 1 ? 1 : 0, paid_amount: count === 5 ? 10000 : 0, items: products.slice(0, count).map(product_id => ({ product_id, quantity: 2, unit_cost: cost })) });
    const sale = sales.create({ customer_id: count === 1 ? null : 1, invoice_number: `COMPACT-S-${count}`, sold_at: '2026-10-03T10:00:00.000Z', discount: count === 1 ? 1 : 0, paid_amount: count === 5 ? count * price : 0, items: products.slice(0, count).map(product_id => ({ product_id, quantity: 1, unit_price: price })) });
    for (const [type, record] of [['purchaseInvoice', purchase], ['saleInvoice', sale]]) {
      const before = db.serialize();
      const preview = output.preview(type, record.id);
      assert.equal(preview.paper.name, 'A5');
      assert.match(preview.html, /Qty \(Pairs\)/);
      assert.match(preview.html, /Price \/ Pair/);
      for (let i = 0; i < count; i++) assert.ok(preview.html.includes(`COMPACT-${i + 1}</td>`));
      for (const text of ['Subtotal', 'Discount', 'Original invoice total', 'Total return adjustments', 'Effective invoice total', 'Status', 'Generated:', 'Thank you for your business.', '03331234567', 'Signature', 'Printed Name', 'Current Invoice Position']) assert.ok(preview.html.includes(text), text);
      assert.match(preview.html, type === 'saleInvoice' ? /Current receivable balance/ : /Current payable balance/);
      if (type === 'saleInvoice' && count === 1) assert.match(preview.html, /Walk-in Customer/);
      destination = path.join(artifacts, `${type}-${count}-a5.pdf`);
      await output.savePdf(type, record.id, owner);
      const pages = inspectPdf(destination, 'A5');
      console.log(`${type} ${count} items: ${pages} PDF pages`);
      if (count === 24) assert.ok(pages > 1, '24-item invoice should paginate');
      await output.print(type, record.id, owner);
      assert.deepEqual(db.serialize(), before, 'Printing never changes accounting');
      if (count === 1 || count === 24) {
        const view = new BrowserWindow({ show: false, width: 700, height: 900, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
        try {
          await view.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(preview.html)}`);
          const dimensions = await view.webContents.executeJavaScript(`({logo:document.querySelector('.logo').naturalWidth, width:document.querySelector('main').getBoundingClientRect().width, overflow:document.documentElement.scrollWidth>innerWidth})`);
          assert.ok(dimensions.logo > 0);
          assert.ok(Math.abs(dimensions.width - 148 * 96 / 25.4) < 1);
          assert.equal(dimensions.overflow, false);
          assert.ok(await view.webContents.executeJavaScript("document.querySelector('.invoice-totals').getBoundingClientRect().top >= document.querySelector('table[aria-label=\"Document items\"]').getBoundingClientRect().bottom"), 'Totals follow all item rows without overlap');
          fs.writeFileSync(path.join(artifacts, `${type}${count === 1 ? '' : '-many'}-a5.png`), (await view.webContents.capturePage()).toPNG());
          if (count === 1) assert.equal(pages, 1, 'Short invoice should fit one A5 page');
          view.setSize(400, 700);
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.equal(await view.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth'), false, 'Small preview scales without changing print geometry');
        } finally { view.destroy(); }
      }
    }
  }
  for (const type of ['customerPayment', 'supplierPayment', 'saleReturn', 'purchaseReturn']) {
    expectedPaper = 'A4';
    destination = path.join(process.env.MAHSOOD_UI_TEST_DATA, `${type}-a4.pdf`);
    await output.savePdf(type, 1, owner);
    inspectPdf(destination, 'A4');
    await output.print(type, 1, owner);
  }
  console.log('PASS Compact invoices: real Sales/Purchase PDFs with 1/5/10/24 items, A5 media, short one-page and long multi-page output, long contacts/products, exact paise, pair labels, walk-in, partial/paid/unpaid states, official logo, signatures, settings, native options and unchanged A4 receipts/returns');
}
module.exports = { checkCompactPrinting };
