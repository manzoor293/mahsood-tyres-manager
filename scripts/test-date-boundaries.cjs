const { app } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { openDatabase } = require('../electron/database/index.cjs');
const { createSaleService } = require('../electron/services/sales.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createInventoryService } = require('../electron/services/inventory.cjs');
const { createExpenseServices } = require('../electron/services/expenses.cjs');
const { createReportsService } = require('../electron/services/reports.cjs');
const { range } = require('../electron/utils/analytics.cjs');
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root || !path.basename(root).startsWith('mahsood-release-data-')) throw Error('Isolated release profile required');
app.setPath('userData', root);
app.setPath('sessionData', root);
app.whenReady().then(() => {
  let db;
  try {
    db = openDatabase(path.join(root, 'date-boundaries.sqlite3'));
    db.exec("INSERT INTO products(sku,model,size) VALUES('BOUNDARY','Boundary tyre','R16'); INSERT INTO suppliers(name) VALUES('Boundary supplier'); INSERT INTO expense_categories(name) VALUES('Boundary expense')");
    const sales = createSaleService(db), purchases = createPurchaseService(db), inventory = createInventoryService(db), expenses = createExpenseServices(db).expenses, reports = createReportsService(db);
    const dates = ['2026-12-31T23:59:59', '2027-01-01T00:00:00', '2027-01-01T23:59:59', '2027-01-02T00:00:00'];
    const expectedSales = [], expectedPurchases = [], expectedExpenses = [], expectedMovements = [];
    for (let index = 0; index < dates.length; index++) {
      const timestamp = new Date(dates[index]).toISOString();
      const purchase = purchases.create({ supplier_id: 1, invoice_number: `BOUNDARY-${index}`, purchased_at: dates[index].slice(0, 10), items: [{ product_id: 1, quantity: 2, unit_cost: 100 }] });
      // Legacy purchases/expenses can have UTC timestamps; current writes are date-only.
      db.prepare('UPDATE purchases SET purchased_at=? WHERE id=?').run(timestamp, purchase.id);
      const sale = sales.create({ items: [{ product_id: 1, quantity: 1, unit_price: 200 }], sold_at: timestamp });
      const expense = db.prepare("INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES(1,100,'Boundary legacy expense','Cash',?)").run(timestamp).lastInsertRowid;
      const movement = db.prepare("INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost,created_at,notes) VALUES(1,'ADJUSTMENT_IN',1,0,?,'Boundary fixture')").run(timestamp).lastInsertRowid;
      if (index === 1 || index === 2) { expectedSales.push(sale.id); expectedPurchases.push(purchase.id); expectedExpenses.push(expense); expectedMovements.push(movement); }
    }
    const period = { period: 'custom', from_date: '2027-01-01', to_date: '2027-01-01' };
    const history = { from_date: period.from_date, to_date: period.to_date };
    const ids = rows => rows.map(row => row.id).sort((a, b) => a - b);
    const checks = [
      ['sales history', ids(sales.list(history)), expectedSales, ids(reports.getSales(period).rows)],
      ['purchase history', ids(purchases.list(history)), expectedPurchases, ids(reports.getPurchases(period).rows)],
      ['expense history', ids(expenses.list(history)), expectedExpenses, ids(reports.getExpenses(period).rows)],
      ['movement history', ids(inventory.listMovements({ ...history, movement_type: 'ADJUSTMENT_IN' })), expectedMovements, ids(reports.getStockMovements({ ...period, movement_type: 'ADJUSTMENT_IN' }).rows)],
    ];
    let failures = 0;
    for (const [name, actual, expected, report] of checks) {
      try { assert.deepEqual(report, expected); assert.deepEqual(actual, expected); }
      catch (error) { failures++; console.error(`${name}: history=${JSON.stringify(actual)}, expected/report=${JSON.stringify(expected)}`); }
    }
    assert.equal(failures, 0, 'History filters must agree with local-date report boundaries');
    const today = range({ period: 'today' }, new Date('2027-01-01T00:15:00'));
    assert.equal(today.from, '2027-01-01'); assert.equal(today.to, '2027-01-01'); assert.equal(today.until, '2027-01-02');
    assert.equal(range({ period: 'week' }, new Date('2027-01-01T12:00:00')).from, '2026-12-26');
    assert.equal(range({ period: 'month' }, new Date('2027-01-01T12:00:00')).from, '2027-01-01');
    assert.equal(range({ period: 'year' }, new Date('2027-01-01T12:00:00')).from, '2027-01-01');
    console.log(`PASS local dates: inclusive midnight/month/year boundaries and history/report agreement (${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
    db.close(); app.quit();
  } catch (error) { console.error(error); if (db?.open) db.close(); app.exit(1); }
});
