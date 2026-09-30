const assert = require('node:assert/strict');
const { createCatalogServices } = require('../electron/services/catalog.cjs');
const { createExpenseServices } = require('../electron/services/expenses.cjs');
const { createSupplierService } = require('../electron/services/suppliers.cjs');
const { createCustomerService } = require('../electron/services/customers.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createSaleService } = require('../electron/services/sales.cjs');

function statusFixtures(db) {
  const services = { ...createCatalogServices(db), ...createExpenseServices(db),
    suppliers: createSupplierService(db), customers: createCustomerService(db) };
  const records = {};
  for (const [resource, name] of [['brands','Status Brand'], ['categories','Status Category'],
    ['suppliers','Status Supplier'], ['customers','Status Customer'], ['expenseCategories','Clerk Salary']]) {
    records[resource] = services[resource].create({ name });
  }
  records.products = services.products.create({ sku: 'STATUS-TYRE', model: 'Status Model', size: 'R15',
    brand_id: records.brands.id, category_id: records.categories.id });
  const expenseData = { expense_category_id: records.expenseCategories.id, amount: 10000,
    description: 'Historical clerk salary', spent_at: '2026-09-01', payment_method: 'Cash' };
  const expense = services.expenses.create(expenseData);
  const purchases = createPurchaseService(db);
  const sales = createSaleService(db);
  const purchaseData = { supplier_id: records.suppliers.id, invoice_number: 'STATUS-PURCHASE', purchased_at: '2026-09-01',
    items: [{ product_id: records.products.id, quantity: 10, unit_cost: 100 }] };
  const saleData = { customer_id: records.customers.id,
    items: [{ product_id: records.products.id, quantity: 1, unit_price: 200 }], paid_amount: 100, payment_method: 'Cash' };
  purchases.create(purchaseData);
  sales.create(saleData);
  records.products = services.products.getById(records.products.id);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    .map(row => row.name).filter(name => !['brands','categories','products','suppliers','customers','expense_categories'].includes(name));
  const history = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}"`).all()]));
  return { services, records, expense, expenseData, purchases, sales, purchaseData, saleData, history };
}

function verifyStatusBackend(db, fixture) {
  const { services, records, history } = fixture;
  const before = history();
  for (const [resource, record] of Object.entries(records)) {
    const api = services[resource];
    assert.equal(record.active, 1);
    assert.equal(api.deactivate(record.id).active, 0);
    assert.ok(api.list({ active: false }).some(row => row.id === record.id));
    assert.ok(!api.list({ active: true }).some(row => row.id === record.id));
    for (const method of ['activate','deactivate']) {
      for (const id of [-1, 0, '1', null, 1.5, {}, NaN]) assert.throws(() => api[method](id), e => e.code === 'VALIDATION');
      assert.throws(() => api[method](999999), e => e.code === 'NOT_FOUND');
    }
    assert.throws(() => api.update(record.id, { active: 2 }), e => e.code === 'VALIDATION');
    const table = resource === 'expenseCategories' ? 'expense_categories' : resource;
    db.exec(`CREATE TRIGGER status_failure BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Forced activation failure'); END`);
    try { assert.throws(() => api.activate(record.id)); }
    finally { db.exec('DROP TRIGGER status_failure'); }
    assert.equal(db.prepare(`SELECT active FROM ${table} WHERE id=?`).get(record.id).active, 0);
    const activated = api.activate(record.id);
    assert.equal(activated.active, 1);
    assert.deepEqual({ ...activated, updated_at: record.updated_at }, record);
    assert.ok(api.list({ active: true }).some(row => row.id === record.id));
    assert.ok(!api.list({ active: false }).some(row => row.id === record.id));
    assert.equal(db.prepare(`SELECT active FROM ${table} WHERE id=?`).get(record.id).active, 1);
    assert.deepEqual(history(), before);
  }
  // Reactivated references pass the real validation for new operations.
  services.expenses.create(fixture.expenseData);
  fixture.purchases.create({ ...fixture.purchaseData, invoice_number: 'STATUS-REACTIVATED' });
  fixture.sales.create(fixture.saleData);
  const product = records.products;
  services.products.update(product.id, { brand_id: records.brands.id, category_id: records.categories.id });
  assert.equal(services.expenses.getById(fixture.expense.id).expense_category_id, records.expenseCategories.id);
  assert.equal(db.pragma('user_version', { simple: true }), 5);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  console.log('PASS: all six status services, persisted 1→0→1, filters, invalid/missing IDs, restricted fields, rollback, unchanged history and new expense/purchase/sale validation.');
}
module.exports = { statusFixtures, verifyStatusBackend };
