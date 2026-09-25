const { app } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { openDatabase } = require('../electron/database/index.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { registerPurchaseIpc } = require('../electron/ipc/purchases.cjs');

if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:purchases for temporary data.');
const directory = process.env.MAHSOOD_UI_TEST_DATA;
app.setPath('userData', directory);
app.setPath('sessionData', directory);
app.whenReady().then(() => {
  let db, code = 0;
  try {
    db = openDatabase(path.join(directory, 'test.sqlite3'));
    db.exec(`INSERT INTO suppliers(name) VALUES ('Supplier');
      INSERT INTO suppliers(name,active) VALUES ('Inactive',0);
      INSERT INTO products(sku,model,size) VALUES ('A','Model A','16'),('B','Model B','17');
      INSERT INTO products(sku,model,size,active) VALUES ('C','Inactive','18',0);
      INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost) VALUES (1,'OPENING_STOCK',4,10);`);
    const service = createPurchaseService(db);
    const base = { supplier_id: 1, invoice_number: 'PUR-1', purchased_at: '2026-09-25', notes: 'Historical receipt',
      items: [{ product_id: 1, quantity: 2, unit_cost: 12500 }, { product_id: 2, quantity: 3, unit_cost: 20000 }], discount: 5000, paid_amount: 30000, payment_method: 'Cash' };
    const row = service.create(base);
    assert.equal(row.subtotal, 85000); assert.equal(row.total, 80000); assert.equal(row.balance, 50000);
    assert.equal(row.paid_amount, 30000); assert.equal(row.payment_status, 'partial'); assert.equal(row.item_count, 2);
    assert.deepEqual(row.items.map((i) => [i.quantity,i.unit_cost,i.line_total]), [[2,12500,25000],[3,20000,60000]]);
    assert.deepEqual(db.prepare('SELECT quantity FROM inventory ORDER BY product_id').all().map((r) => r.quantity), [6,3,0]);
    const movements = db.prepare("SELECT * FROM stock_movements WHERE movement_type='PURCHASE' ORDER BY id").all();
    assert.equal(movements.length, 2);
    row.items.forEach((item, i) => { assert.equal(movements[i].purchase_item_id, item.id); assert.equal(movements[i].product_id, item.product_id); assert.equal(movements[i].quantity_change, item.quantity); assert.equal(movements[i].unit_cost, item.unit_cost); });
    assert.equal(row.payments[0].supplier_id, 1); assert.equal(row.payments[0].purchase_id, row.id);
    const snapshot = () => Object.fromEntries(['purchases','purchase_items','inventory','stock_movements','supplier_payments'].map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
    const before = snapshot();
    const rejects = (patch) => { assert.throws(() => service.create({ ...base, invoice_number: 'INVALID', ...patch })); assert.deepEqual(snapshot(), before); };
    for (const supplier_id of [999,2,'1',null]) rejects({ supplier_id });
    for (const product_id of [999,3]) rejects({ items: [{ product_id, quantity: 1, unit_cost: 100 }] });
    for (const quantity of [0,-1,1.5,'2',NaN,Number.MAX_SAFE_INTEGER]) rejects({ items: [{ product_id: 1, quantity, unit_cost: 100 }] });
    for (const unit_cost of [0,-1,1.5,'100',Infinity,Number.MAX_SAFE_INTEGER]) rejects({ items: [{ product_id: 1, quantity: 2, unit_cost }] });
    for (const field of ['discount','paid_amount']) for (const value of [-1,0.5,'10',NaN,Infinity]) rejects({ [field]: value });
    for (const patch of [{ invoice_number: 'pur-1' }, { invoice_number: ' ' }, { items: [] }, { items: [base.items[0],base.items[0]] }, { discount: 85001 }, { paid_amount: 80001 }, { purchased_at: '2026-02-30' }, { other_cost: -1 }, { subtotal: 1 }, { total: 1 }, { balance: 0 }, { items: [{ ...base.items[0], line_total: 1 }] }]) rejects(patch);
    // Abort on the second movement, after the header, two items and first stock update were written.
    db.exec(`CREATE TRIGGER test_fail_movement BEFORE INSERT ON stock_movements WHEN NEW.product_id=2 BEGIN SELECT RAISE(ABORT,'Deliberate second movement failure'); END;`);
    rejects({}); db.exec('DROP TRIGGER test_fail_movement');
    // A payment failure must also undo every stock update and item.
    db.exec(`CREATE TRIGGER test_fail_payment BEFORE INSERT ON supplier_payments BEGIN SELECT RAISE(ABORT,'Deliberate payment failure'); END;`);
    rejects({}); db.exec('DROP TRIGGER test_fail_payment');
    assert.equal(service.list({ search: 'PUR', supplier_id: 1, from_date: '2026-09-25', to_date: '2026-09-25', payment_status: 'partial' }).length, 1);
    assert.equal(service.list({ payment_status: 'paid' }).length, 0);
    assert.equal(service.list({ search: "' OR 1=1 --" }).length, 0);
    assert.throws(() => service.list({ from_date: '2026-10-01', to_date: '2026-09-01' }));
    assert.throws(() => service.getById(999), (e) => e.code === 'NOT_FOUND');
    const unpaid = service.create({ ...base, invoice_number: 'UNPAID', paid_amount: 0 });
    assert.equal(unpaid.payment_status, 'unpaid'); assert.equal(unpaid.payments.length, 0);
    const paid = service.create({ ...base, invoice_number: 'PAID', paid_amount: 80000 });
    assert.equal(paid.balance, 0); assert.equal(paid.payment_status, 'paid');
    const free = service.create({ ...base, invoice_number: 'DISCOUNTED', discount: 85000, paid_amount: 0 });
    assert.equal(free.total, 0); assert.equal(free.payment_status, 'paid');
    db.exec('UPDATE suppliers SET active=0 WHERE id=1; UPDATE products SET active=0 WHERE id=1');
    assert.equal(service.getById(row.id).items[0].unit_cost, 12500);
    assert.equal(service.list({ supplier_id: 1 }).length, 4);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    const handlers = new Map();
    registerPurchaseIpc({ handle: (name, fn) => handlers.set(name, fn) }, service, (event) => event.trusted);
    assert.equal(handlers.get('purchases:list')({}).error.code, 'FORBIDDEN');
    assert.equal(handlers.get('purchases:getById')({ trusted: true }).error.code, 'VALIDATION');
    assert.equal(handlers.get('purchases:list')({ trusted: true }, { sql: 'SELECT 1' }).error.code, 'VALIDATION');
    db.close(); db = openDatabase(path.join(directory, 'test.sqlite3'));
    assert.equal(createPurchaseService(db).getById(row.id).balance, 50000);
    console.log('PASS: purchase creation, multi-item stock/ledger/payment consistency, historical costs, authoritative totals, validation, filters, persistence and rollback after movement/payment failures.');
  } catch (error) { code = 1; console.error(error); }
  finally { if (db?.open) db.close(); app.exit(code); }
});
