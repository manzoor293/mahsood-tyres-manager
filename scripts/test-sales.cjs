const { app } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { openDatabase } = require('../electron/database/index.cjs');
const { createSaleService } = require('../electron/services/sales.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createInventoryService } = require('../electron/services/inventory.cjs');
const { registerSaleIpc } = require('../electron/ipc/sales.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:sales for isolated data.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
app.whenReady().then(() => {
  let db, otherDb, code = 0;
  try {
    const filename = path.join(process.env.MAHSOOD_UI_TEST_DATA,'sales.sqlite3');
    db = openDatabase(filename);
    db.exec(`INSERT INTO suppliers(name) VALUES ('Supplier'); INSERT INTO customers(name) VALUES ('Customer'); INSERT INTO customers(name,active) VALUES ('Inactive',0);
      INSERT INTO products(sku,model,size) VALUES ('A','Touring','R15'),('B','Cargo','R20'),('NO-COST','Found','R16');
      INSERT INTO products(sku,model,size,active) VALUES ('INACTIVE','Old','R15',0);`);
    const purchases = createPurchaseService(db);
    purchases.create({ supplier_id: 1, invoice_number: 'P-1', purchased_at: '2026-09-25', items: [{ product_id: 1, quantity: 20, unit_cost: 10000 },{ product_id: 2, quantity: 20, unit_cost: 20000 }] });
    // Latest inserted purchase wins, even when its business date is earlier.
    purchases.create({ supplier_id: 1, invoice_number: 'P-2', purchased_at: '2026-09-01', items: [{ product_id: 1, quantity: 5, unit_cost: 12000 }] });
    const inventory = createInventoryService(db);
    inventory.adjust({ product_id: 3, movement_type: 'ADJUSTMENT_IN', quantity: 2, notes: 'Found stock without purchase history' });
    const service = createSaleService(db);
    const base = { invoice_number: 'TEST-SALE', customer_id: 1, sold_at: '2026-09-25T10:00:00.000Z',
      items: [{ product_id: 1, quantity: 2, unit_price: 15000 },{ product_id: 2, quantity: 3, unit_price: 25000 }], discount: 5000, paid_amount: 100000, payment_method: 'Cash', notes: 'Receipt test' };
    const sale = service.create(base);
    assert.equal(sale.subtotal,105000); assert.equal(sale.total,100000); assert.equal(sale.balance,0); assert.equal(sale.payment_status,'paid');
    assert.equal(sale.item_count,2); assert.equal(sale.customer_name,'Customer');
    assert.deepEqual(sale.items.map((i) => [i.quantity,i.unit_price,i.unit_cost,i.line_total]),[[2,15000,12000,30000],[3,25000,20000,75000]]);
    assert.deepEqual([inventory.getProductStock(1).quantity,inventory.getProductStock(2).quantity],[23,17]);
    const movements = db.prepare("SELECT * FROM stock_movements WHERE movement_type='SALE' ORDER BY id").all();
    assert.equal(movements.length,2);
    sale.items.forEach((item,i) => { assert.equal(movements[i].sale_item_id,item.id); assert.equal(movements[i].product_id,item.product_id); assert.equal(movements[i].quantity_change,-item.quantity); assert.equal(movements[i].unit_cost,item.unit_cost); });
    assert.equal(sale.payments[0].sale_id,sale.id); assert.equal(sale.payments[0].customer_id,1); assert.equal(sale.payments[0].amount,100000);
    const snapshot = () => Object.fromEntries(['sales','sale_items','inventory','stock_movements','customer_payments'].map((table) => [table,db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
    const before = snapshot();
    const reject = (patch) => { assert.throws(() => service.create({ ...base, invoice_number: 'REJECTED', ...patch })); assert.deepEqual(snapshot(),before); };
    for (const customer_id of [999,2,'1',0]) reject({ customer_id });
    for (const product_id of [999,4]) reject({ items: [{ product_id,quantity: 1,unit_price: 100 }] });
    for (const quantity of [0,-1,1.5,'1',Infinity,Number.MAX_SAFE_INTEGER,24]) reject({ items: [{ product_id: 1,quantity,unit_price: 100 }] });
    for (const unit_price of [-1,1.5,'100',NaN,Infinity,Number.MAX_SAFE_INTEGER]) reject({ items: [{ product_id: 1,quantity: 2,unit_price }] });
    for (const field of ['discount','paid_amount']) for (const value of [-1,0.5,'100',NaN,Infinity]) reject({ [field]: value });
    for (const patch of [{ invoice_number: 'test-sale' },{ invoice_number: ' ' },{ items: [] },{ items: [base.items[0],base.items[0]] },{ discount: 105001 },{ paid_amount: 100001 },{ payment_method: 'Credit' },{ sold_at: 'bad' },{ total: 1 },{ subtotal: 1 },{ balance: 0 },{ items: [{ ...base.items[0], unit_cost: 1 }] },{ items: [{ ...base.items[0], line_total: 1 }] }]) reject(patch);
    // Failure in second movement occurs after the first item has already reduced inventory.
    db.exec(`CREATE TRIGGER fail_sale_movement BEFORE INSERT ON stock_movements WHEN NEW.movement_type='SALE' AND NEW.product_id=2 BEGIN SELECT RAISE(ABORT,'Forced second item failure'); END;`);
    reject({}); db.exec('DROP TRIGGER fail_sale_movement');
    db.exec(`CREATE TRIGGER fail_sale_payment BEFORE INSERT ON customer_payments BEGIN SELECT RAISE(ABORT,'Forced payment failure'); END;`);
    reject({}); db.exec('DROP TRIGGER fail_sale_payment');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales WHERE invoice_number='REJECTED'").get().n,0);
    // A separate connection changes stock after the renderer's hypothetical read.
    otherDb = openDatabase(filename);
    const displayed = inventory.getProductStock(2).quantity;
    createInventoryService(otherDb).adjust({ product_id: 2,movement_type: 'ADJUSTMENT_OUT',quantity: displayed-2,notes: 'Concurrent adjustment' });
    const staleBefore = snapshot();
    assert.throws(() => service.create({ ...base,invoice_number: 'STALE' }), (e) => e.code === 'INSUFFICIENT_STOCK');
    assert.deepEqual(snapshot(),staleBefore);
    const partial = service.create({ ...base,invoice_number: 'PARTIAL',items: [{ product_id: 1,quantity: 1,unit_price: 15000 }],discount: 0,paid_amount: 5000,payment_method: 'Bank transfer' });
    assert.equal(partial.balance,10000); assert.equal(partial.payment_status,'partial');
    const walk = service.create({ customer_id: null,items: [{ product_id: 1,quantity: 1,unit_price: 15000 }],paid_amount: 15000,payment_method: 'Cheque' });
    assert.match(walk.invoice_number,/^SALE-\d{6}$/); assert.equal(walk.customer_id,null); assert.equal(walk.payments[0].customer_id,null); assert.equal(walk.payments[0].sale_id,walk.id);
    const unknownCost = service.create({ items: [{ product_id: 3,quantity: 1,unit_price: 0 }] });
    assert.equal(unknownCost.items[0].unit_cost,0); assert.equal(unknownCost.items[0].unit_price,0); assert.equal(unknownCost.payments.length,0);
    const unpaid = service.create({ items: [{ product_id: 1,quantity: 1,unit_price: 100 }] });
    assert.equal(unpaid.payment_status,'unpaid'); assert.equal(unpaid.payments.length,0); assert.equal(unpaid.balance,100);
    assert.equal(service.list({ search: 'PART', customer_id: 1, payment_status: 'partial',from_date: '2026-09-25',to_date: '2026-09-25' })[0].id,partial.id);
    assert.ok(service.list({ walk_in: true }).every((r) => r.customer_id === null));
    assert.equal(service.list({ search: "' OR 1=1 --" }).length,0); assert.equal(service.list({ limit: 1,offset: 1 }).length,1);
    for (const data of [{ limit: 501 },{ offset: -1 },{ payment_status: 'bad' },{ customer_id: 1,walk_in: true },{ from_date: '2026-02-30' },{ from_date: '2026-10-01',to_date: '2026-09-01' }]) assert.throws(() => service.list(data));
    assert.throws(() => service.getById(999), (e) => e.code === 'NOT_FOUND');
    const originalCost = service.getById(sale.id).items[0].unit_cost;
    purchases.create({ supplier_id: 1,invoice_number: 'NEW-COST',purchased_at: '2026-09-25',items: [{ product_id: 1,quantity: 1,unit_cost: 99000 }] });
    db.exec('UPDATE products SET default_selling_price=990000,active=0 WHERE id=1; UPDATE customers SET active=0 WHERE id=1');
    assert.equal(service.getById(sale.id).items[0].unit_cost,originalCost); assert.equal(service.getById(sale.id).items[0].unit_price,15000); assert.equal(service.getById(sale.id).customer_name,'Customer');
    // Explicit invoice collision with the next generated number must be skipped safely.
    const next = db.prepare('SELECT MAX(id)+1 AS n FROM sales').get().n;
    service.create({ invoice_number: `SALE-${String(next+1).padStart(6,'0')}`,items: [{ product_id: 2,quantity: 1,unit_price: 100 }] });
    const generated = createSaleService(otherDb).create({ items: [{ product_id: 2,quantity: 1,unit_price: 100 }] });
    assert.equal(generated.invoice_number,`SALE-${String(next+2).padStart(6,'0')}`);
    const handlers = new Map(); registerSaleIpc({ handle: (name,fn) => handlers.set(name,fn) },service,(e) => e.trusted);
    assert.equal(handlers.get('sales:list')({}).error.code,'FORBIDDEN'); assert.equal(handlers.get('sales:create')({ trusted: true }).error.code,'VALIDATION');
    assert.equal(handlers.get('sales:list')({ trusted: true },{ sql: 'SELECT 1' }).error.code,'VALIDATION');
    assert.deepEqual(db.pragma('foreign_key_check'),[]); assert.equal(db.pragma('integrity_check',{ simple: true }),'ok');
    otherDb.close(); otherDb = null; db.close(); db = openDatabase(filename);
    assert.equal(createSaleService(db).getById(sale.id).total,100000);
    console.log('PASS: full/partial/walk-in/customer sales, totals, historical prices/costs, ledger/stock/payments, validation, stale stock across connections, invoice allocation, persistence and multi-item/payment rollback.');
  } catch (error) { code = 1; console.error(error); }
  finally { if (otherDb?.open) otherDb.close(); if (db?.open) db.close(); app.exit(code); }
});
