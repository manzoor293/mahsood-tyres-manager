const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { openDatabase } = require('../electron/database/index.cjs');
const { createAuthService } = require('../electron/services/auth.cjs');
const { createCatalogServices } = require('../electron/services/catalog.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createSaleService } = require('../electron/services/sales.cjs');
const { createReturnServices } = require('../electron/services/returns.cjs');
const { createInventoryService } = require('../electron/services/inventory.cjs');
const { createDashboardService } = require('../electron/services/dashboard.cjs');
const { createReportsService } = require('../electron/services/reports.cjs');
const { allData } = require('./backup-fixtures.cjs');
const { seedReturns } = require('./returns-fixtures.cjs');
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw Error('Temporary profile required');
app.setPath('userData', root);
app.setPath('sessionData', root);
const period = { period: 'custom', from_date: '2026-09-01', to_date: '2026-09-30' };
app.whenReady().then(async () => {
  let db, restored, legacy, code = 0;
  try {
    const filename = path.join(root, 'pairs.sqlite3');
    legacy = new Database(filename);
    legacy.pragma('foreign_keys=ON');
    const migrations = path.join(__dirname, '../electron/database/migrations');
    for (const file of fs.readdirSync(migrations).sort().slice(0, 5))
      legacy.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
    legacy.pragma('user_version=5');
    seedReturns(legacy);
    legacy.exec("INSERT INTO expense_categories(name) VALUES('Legacy rent'); INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES(1,12345,'Legacy expense','Cash','2026-09-01')");
    legacy.exec("UPDATE products SET minimum_stock=5 WHERE id=1; UPDATE customer_payments SET amount=10000 WHERE sale_id=1; UPDATE supplier_payments SET amount=20000 WHERE purchase_id=1; INSERT INTO settings(key,value) VALUES('shop.name','Legacy Pair Fixture')");
    const credentials = { email: 'pairs@example.test', password: 'PairFixture-2026!' };
    await createAuthService(() => legacy).setup({ ...credentials, confirmPassword: credentials.password });
    // Seed historical returns using schema-5's original physical-tyre semantics.
    legacy.exec(`INSERT INTO sale_returns(id,reference,sale_id,returned_at,total) VALUES(1,'OLD-SR',1,'2026-09-02',9999);
      INSERT INTO stock_movements(id,product_id,movement_type,quantity_change,sale_item_id,unit_cost) VALUES(6,1,'SALE_RETURN',1,1,6000);
      INSERT INTO sale_return_items(return_id,sale_item_id,quantity,unit_price,unit_cost,gross_value,return_value,movement_id) VALUES(1,1,1,10000,6000,10000,9999,6);
      INSERT INTO purchase_returns(id,reference,purchase_id,returned_at,total) VALUES(1,'OLD-PR',1,'2026-09-02',5999);
      INSERT INTO stock_movements(id,product_id,movement_type,quantity_change,purchase_item_id,unit_cost) VALUES(7,1,'PURCHASE_RETURN',-1,1,6000);
      INSERT INTO purchase_return_items(return_id,purchase_item_id,quantity,unit_price,unit_cost,gross_value,return_value,movement_id) VALUES(1,1,1,6000,6000,6000,5999,7);`);
    const before = allData(legacy);
    const finances = () => ({
      revenue: legacy.prepare('SELECT SUM(total)-(SELECT SUM(total) FROM sale_returns) AS value FROM sales').get().value,
      purchases: legacy.prepare('SELECT SUM(total)-(SELECT SUM(total) FROM purchase_returns) AS value FROM purchases').get().value,
      paid: legacy.prepare('SELECT SUM(amount) AS value FROM customer_payments').get().value,
      supplierPaid: legacy.prepare('SELECT SUM(amount) AS value FROM supplier_payments').get().value,
      cost: legacy.prepare('SELECT SUM((quantity-COALESCE((SELECT SUM(quantity) FROM sale_return_items r WHERE r.sale_item_id=i.id),0))*unit_cost) AS value FROM sale_items i').get().value,
    });
    const financialBefore = finances();
    await legacy.backup(path.join(root, 'schema5-backup.sqlite3'));
    legacy.close(); legacy = null;
    db = openDatabase(filename);
    assert.equal(db.pragma('user_version', { simple: true }), 7);
    const after = allData(db);
    for (const row of after.purchases) { delete row.shipment_cost; delete row.transporter_name; delete row.shipment_reference; }
    for (const row of after.purchase_items) delete row.allocated_shipment_cost;
    for (const row of after.sale_items) { delete row.allocated_shipment_cost; delete row.shipment_purchase_item_id; delete row.shipment_offset; }
    for (const row of after.products) delete row.price_units_per_unit;
    for (const table of ['purchase_items', 'sale_items']) for (const row of after[table]) delete row.units_per_transaction_unit;
    assert.deepEqual(after, before, 'Every historical field, stock, return, payment and credential stays unchanged');
    legacy = db;
    assert.deepEqual(finances(), financialBefore, 'Historical finances stay unchanged');
    legacy = null;
    const reports = createReportsService(db);
    assert.equal(reports.getSales(period).summary.total, financialBefore.revenue);
    assert.equal(reports.getPurchases(period).summary.total, financialBefore.purchases);
    assert.equal(reports.getProfit(period).summary.historicalCost, financialBefore.cost);
    assert.equal(reports.getProfit(period).summary.expenses, 12345);
    assert.equal(reports.getReceivables().summary.outstanding, 60000);
    assert.equal(reports.getPayables().summary.outstanding, 94000);
    await createAuthService(() => db).login(credentials);
    restored = openDatabase(path.join(root, 'schema5-backup.sqlite3'));
    assert.deepEqual(allData(restored), allData(db), 'Schema-5 backup upgrades identically');
    restored.close(); restored = null;
    const products = createCatalogServices(db).products;
    products.update(1, { model: 'Unrelated edit' });
    assert.equal(products.getById(1).default_selling_price, 99000);
    assert.equal(products.getById(1).minimum_stock, 5);
    assert.equal(products.getById(1).price_units_per_unit, 1);
    products.update(1, { default_selling_price: 198001, minimum_stock: 3 });
    assert.equal(products.getById(1).minimum_stock, 6);
    assert.equal(products.getById(1).price_units_per_unit, 2);
    assert.equal(db.prepare('SELECT unit_price FROM sale_items WHERE id=1').get().unit_price, 10000);
    db.exec("INSERT INTO brands(name) VALUES('Pair Brand'); INSERT INTO categories(name) VALUES('Pair Category')");
    const product = products.create({ sku: 'PAIR-NEW', model: 'Pair tyre', size: '195/65R15', brand_id: 1, category_id: 1, default_selling_price: 13000000, minimum_stock: 3 });
    assert.equal(product.minimum_stock, 6);
    assert.equal(product.price_units_per_unit, 2);
    const purchases = createPurchaseService(db), sales = createSaleService(db), inventory = createInventoryService(db), returns = createReturnServices(db);
    const stock = () => inventory.getProductStock(product.id).quantity;
    let sequence = 0;
    const buy = (quantity, unit_cost = 11000000) => purchases.create({ supplier_id: 1, invoice_number: `PAIR-P-${++sequence}`, purchased_at: '2026-09-03', items: [{ product_id: product.id, quantity, unit_cost }] });
    const sell = (quantity, unit_price = 13000000) => sales.create({ customer_id: 1, invoice_number: `PAIR-S-${++sequence}`, sold_at: '2026-09-04T10:00:00.000Z', items: [{ product_id: product.id, quantity, unit_price }] });
    const purchase = buy(5);
    assert.equal(purchase.total, 55000000); assert.equal(stock(), 10);
    const sale = sell(2);
    assert.equal(sale.total, 26000000); assert.equal(sale.items[0].unit_cost, 11000000); assert.equal(stock(), 6);
    inventory.adjust({ product_id: product.id, movement_type: 'ADJUSTMENT_OUT', quantity: 1, notes: 'Single damaged tyre' });
    assert.equal(stock(), 5);
    assert.throws(() => sell(3), /stock|tyres/i); assert.equal(stock(), 5);
    sell(2); assert.equal(stock(), 1);
    const returned = returns.saleReturns.create({ sale_id: sale.id, returned_at: '2026-09-05', items: [{ sale_item_id: sale.items[0].id, quantity: 1 }] });
    assert.equal(returned.document.total, 13000000); assert.equal(stock(), 3);
    assert.equal(returned.invoice.items[0].returnable_quantity, 1);
    assert.throws(() => returns.saleReturns.create({ sale_id: sale.id, returned_at: '2026-09-05', items: [{ sale_item_id: sale.items[0].id, quantity: 2 }] }));
    returns.purchaseReturns.create({ purchase_id: purchase.id, returned_at: '2026-09-05', items: [{ purchase_item_id: purchase.items[0].id, quantity: 1 }] });
    assert.equal(stock(), 1);
    assert.throws(() => returns.purchaseReturns.create({ purchase_id: purchase.id, returned_at: '2026-09-05', items: [{ purchase_item_id: purchase.items[0].id, quantity: 1 }] }), /stock/i);
    for (const invalid of [0, -1, 1.5, NaN, Infinity, '2', Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => buy(invalid)); assert.throws(() => sell(invalid));
    }
    assert.throws(() => buy(2, Number.MAX_SAFE_INTEGER));
    assert.throws(() => buy(1, 1.5));
    assert.throws(() => inventory.adjust({ product_id: product.id, movement_type: 'ADJUSTMENT_IN', quantity: 1, notes: '' }));
    buy(1, 11000001);
    const oddSale = sell(1, 13000001);
    assert.equal(oddSale.items[0].unit_cost, 11000001);
    assert.equal(oddSale.total - oddSale.items[0].unit_cost, 2000000);
    const oddReturn = returns.saleReturns.create({ sale_id: oddSale.id, returned_at: '2026-09-06', items: [{ sale_item_id: oddSale.items[0].id, quantity: 1 }] });
    assert.equal(oddReturn.document.total, 13000001);
    assert.equal(oddReturn.document.items[0].unit_cost, 11000001);
    const legacyCostSale = sales.create({ customer_id: 1, invoice_number: 'LEGACY-COST-PAIR', sold_at: '2026-09-04T10:00:00.000Z', items: [{ product_id: 1, quantity: 1, unit_price: 20000 }] });
    assert.equal(legacyCostSale.items[0].unit_cost, 12000, 'Original per-tyre purchase cost doubles exactly for a pair sale');
    const legacyStockBefore = inventory.getProductStock(1).quantity;
    returns.saleReturns.create({ sale_id: 1, returned_at: '2026-09-06', items: [{ sale_item_id: 1, quantity: 1 }] });
    assert.equal(inventory.getProductStock(1).quantity, legacyStockBefore + 1, 'Legacy returns move one tyre');
    const top = createDashboardService(db).getOverview(period).topProducts.find(row => row.product_id === product.id || row.id === product.id);
    assert.equal(top.quantitySold, 6, 'Three net pairs rank as six tyres');
    assert.throws(() => db.prepare('UPDATE sale_items SET units_per_transaction_unit=1 WHERE id=?').run(sale.items[0].id));
    assert.throws(() => db.prepare('UPDATE purchase_items SET units_per_transaction_unit=1 WHERE id=?').run(purchase.items[0].id));
    const expected = allData(db);
    await db.backup(path.join(root, 'pair-backup.sqlite3'));
    restored = openDatabase(path.join(root, 'pair-backup.sqlite3'));
    assert.deepEqual(allData(restored), expected, 'Backup restore preserves mixed units and exact paise');
    await createAuthService(() => restored).login(credentials);
    console.log('PASS focused pairs: populated schema-5 preservation, credentials, finance, legacy edits, physical stock, returns, odd paise, invalid/overflow inputs, mixed rankings and backup reopen');
  } catch (error) { code = 1; console.error(error); }
  finally { if (legacy && legacy !== db && legacy.open) legacy.close(); if (restored?.open) restored.close(); if (db?.open) db.close(); app.exit(code); }
});
