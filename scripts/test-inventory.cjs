const { app } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { openDatabase } = require('../electron/database/index.cjs');
const { createInventoryService } = require('../electron/services/inventory.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { registerInventoryIpc } = require('../electron/ipc/inventory.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:inventory for temporary data.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
app.whenReady().then(() => {
  let db, code = 0;
  try {
    const filename = path.join(process.env.MAHSOOD_UI_TEST_DATA, 'inventory.sqlite3');
    db = openDatabase(filename);
    db.exec(`INSERT INTO brands(name) VALUES ('Dunlop'),('Bridgestone'); INSERT INTO categories(name) VALUES ('Car'),('Truck');
      INSERT INTO suppliers(name) VALUES ('Supplier');
      INSERT INTO products(sku,model,size,brand_id,category_id,minimum_stock,active) VALUES
      ('TYRE-A','Touring','195/65 R15',1,1,3,1),('TYRE-B','Cargo','R20',2,2,2,1),('TYRE-C','Old','R16',1,1,5,0),('TYRE-D','Zero','R17',2,1,0,1);`);
    const service = createInventoryService(db);
    assert.equal(service.list().length, 3); assert.equal(service.list({ active: 'all' }).length, 4);
    assert.equal(service.list({ stock_status: 'out' }).length, 3);
    for (const search of ['tyre-a','dunlop','touring','195/65']) assert.equal(service.list({ search })[0].product_id, 1);
    assert.equal(service.list({ brand_id: 2 }).length, 2); assert.equal(service.list({ category_id: 2 }).length, 1);
    assert.equal(service.list({ active: false })[0].product_id, 3);
    assert.equal(service.list({ limit: 1, offset: 1 })[0].product_id, 2);
    const purchase = createPurchaseService(db).create({ supplier_id: 1, invoice_number: 'INV-STOCK', purchased_at: '2026-09-25', items: [{ product_id: 1, quantity: 12, unit_cost: 10000 }] });
    assert.equal(service.getProductStock(1).quantity, 12);
    const base = { product_id: 1, movement_type: 'ADJUSTMENT_OUT', quantity: 2, notes: ' Damaged tyres ', expected_quantity: 12 };
    const out = service.adjust(base);
    assert.equal(out.stock.quantity, 10);
    const incoming = service.adjust({ ...base, movement_type: 'ADJUSTMENT_IN', quantity: 3, expected_quantity: 10 });
    assert.equal(incoming.stock.quantity, 13);
    let history = service.listMovements({ product_id: 1 });
    assert.deepEqual(history.map((r) => r.quantity_change), [3,-2,12]);
    assert.deepEqual(history.map((r) => r.resulting_quantity), [13,10,12]);
    assert.equal(history[0].notes, 'Damaged tyres'); assert.equal(history[0].unit_cost, 10000);
    assert.equal(history[2].invoice_number, purchase.invoice_number); assert.equal(history[2].reference_type, 'Purchase');
    assert.equal(history[0].reference_type, 'Manual adjustment');
    assert.equal(service.listMovements({ movement_type: 'ADJUSTMENT_OUT' })[0].resulting_quantity, 10);
    assert.equal(service.listMovements({ limit: 1, offset: 1 })[0].resulting_quantity, 10);
    const day = history[0].created_at.slice(0,10);
    assert.equal(service.listMovements({ from_date: day, to_date: day }).length, 3);
    assert.equal(service.listMovements({ to_date: '2000-01-01' }).length, 0);
    assert.equal(service.listMovements({ search: 'dunlop', brand_id: 1, category_id: 1 }).length, 3);
    const snapshot = () => ({ inventory: db.prepare('SELECT * FROM inventory ORDER BY id').all(), movements: db.prepare('SELECT * FROM stock_movements ORDER BY id').all() });
    const before = snapshot();
    const reject = (patch) => { assert.throws(() => service.adjust({ ...base, expected_quantity: 13, ...patch })); assert.deepEqual(snapshot(), before); };
    for (const quantity of [0,-1,1.5,'2',NaN,Infinity,Number.MAX_SAFE_INTEGER]) reject({ quantity });
    for (const product_id of [999,3,'1',null]) reject({ product_id });
    for (const movement_type of ['PURCHASE','SALE','OPENING_STOCK','BAD',null]) reject({ movement_type });
    for (const notes of ['', '  ', null, 'x'.repeat(5001)]) reject({ notes });
    reject({ quantity: 14 }); reject({ expected_quantity: 12 }); reject({ quantity_change: 100 }); reject({ unit_cost: 10 });
    reject({ movement_type: 'ADJUSTMENT_IN', quantity: Number.MAX_SAFE_INTEGER });
    // Force failure inside the actual inventory trigger path.
    db.exec(`CREATE TRIGGER test_inventory_failure BEFORE UPDATE ON inventory BEGIN SELECT RAISE(ABORT,'Forced inventory failure'); END;`);
    reject({}); db.exec('DROP TRIGGER test_inventory_failure');
    // Force failure after the ledger insert trigger has updated inventory.
    db.exec(`CREATE TRIGGER test_after_inventory AFTER UPDATE ON inventory BEGIN SELECT RAISE(ABORT,'Forced post-update failure'); END;`);
    reject({}); db.exec('DROP TRIGGER test_after_inventory');
    db.exec(`CREATE TRIGGER test_movement_failure BEFORE INSERT ON stock_movements BEGIN SELECT RAISE(ABORT,'Forced movement failure'); END;`);
    reject({}); db.exec('DROP TRIGGER test_movement_failure');
    service.adjust({ ...base, quantity: 10, expected_quantity: 13 });
    assert.equal(service.getProductStock(1).stock_status, 'low');
    assert.equal(service.list({ stock_status: 'low' })[0].quantity, 3);
    service.adjust({ ...base, quantity: 3, expected_quantity: 3 });
    assert.equal(service.getProductStock(1).stock_status, 'out');
    assert.equal(service.list({ stock_status: 'low' }).length, 0);
    service.adjust({ product_id: 4, movement_type: 'ADJUSTMENT_IN', quantity: 1, notes: 'Found item' });
    assert.equal(service.getProductStock(4).stock_status, 'in');
    assert.equal(service.listMovements({ product_id: 4 })[0].unit_cost, 0);
    // Existing opening stock stays visible, including for subsequently inactive products.
    db.exec(`INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost,notes) VALUES (3,'OPENING_STOCK',1,0,'Legacy opening stock');`);
    assert.equal(service.listMovements({ active: false, movement_type: 'OPENING_STOCK' }).length, 1);
    assert.equal(service.getProductStock(3).quantity, 1);
    for (const data of [{ stock_status: 'bad' },{ active: 1 },{ limit: 501 },{ offset: -1 },{ sql: 'SELECT 1' }]) assert.throws(() => service.list(data));
    for (const data of [{ movement_type: 'bad' },{ from_date: '2026-02-30' },{ from_date: '2026-10-01', to_date: '2026-09-01' }]) assert.throws(() => service.listMovements(data));
    assert.throws(() => service.getProductStock(999), (e) => e.code === 'NOT_FOUND');
    assert.equal(service.list({ search: "' OR 1=1 --" }).length, 0);
    const handlers = new Map();
    registerInventoryIpc({ handle: (channel, handler) => handlers.set(channel, handler) }, service, (e) => e.trusted);
    assert.equal(handlers.get('inventory:list')({}).error.code, 'FORBIDDEN');
    assert.equal(handlers.get('inventory:adjust')({ trusted: true }).error.code, 'VALIDATION');
    assert.equal(handlers.get('inventory:list')({ trusted: true }, {}, {}).error.code, 'VALIDATION');
    const originalError = console.error;
    try {
      console.error = () => {};
      db.exec(`CREATE TRIGGER test_internal BEFORE INSERT ON stock_movements BEGIN SELECT RAISE(ABORT,'Private SQL details'); END;`);
      assert.deepEqual(handlers.get('inventory:adjust')({ trusted: true }, { product_id: 4, movement_type: 'ADJUSTMENT_IN', quantity: 1, notes: 'Test' }), { ok: false, error: { code: 'INTERNAL', message: 'The inventory operation could not be completed.' } });
    } finally { console.error = originalError; db.exec('DROP TRIGGER test_internal'); }
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    db.close(); db = openDatabase(filename);
    assert.equal(createInventoryService(db).getProductStock(4).quantity, 1);
    console.log('PASS: inventory search/filter/status/history, purchase references, movement balances, both adjustments, validation, stale stock, insufficient stock, persistence, IPC guards and movement/inventory rollback.');
  } catch (error) { code = 1; console.error(error); }
  finally { if (db?.open) db.close(); app.exit(code); }
});
