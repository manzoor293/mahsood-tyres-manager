const { createCatalogServices } = require("../electron/services/catalog.cjs");
const { createSupplierService } = require("../electron/services/suppliers.cjs");
const { createCustomerService } = require("../electron/services/customers.cjs");
const { createPurchaseService } = require("../electron/services/purchases.cjs");
const { createSaleService } = require("../electron/services/sales.cjs");
const { createPaymentServices } = require("../electron/services/payments.cjs");
const { createExpenseServices } = require("../electron/services/expenses.cjs");
const { createReturnServices } = require("../electron/services/returns.cjs");
function seedBackup(db) {
  const catalog = createCatalogServices(db);
  const brand = catalog.brands.create({ name: "Backup Brand" });
  const category = catalog.categories.create({ name: "Backup Category" });
  const product = catalog.products.create({
    sku: "BACKUP-TYRE",
    model: "Roundtrip",
    size: "R16",
    brand_id: brand.id,
    category_id: category.id,
    default_selling_price: 15000,
    minimum_stock: 2,
  });
  const supplier = createSupplierService(db).create({
    name: "Backup Supplier",
  });
  const customer = createCustomerService(db).create({
    name: "Backup Customer",
  });
  const purchase = createPurchaseService(db).create({
    supplier_id: supplier.id,
    invoice_number: "BACKUP-PURCHASE",
    purchased_at: "2026-09-25",
    items: [{ product_id: product.id, quantity: 12, unit_cost: 10000 }],
    paid_amount: 1000,
    payment_method: "Cash",
  });
  const sale = createSaleService(db).create({
    customer_id: customer.id,
    invoice_number: "BACKUP-SALE",
    sold_at: "2026-09-25T10:00:00.000Z",
    items: [{ product_id: product.id, quantity: 4, unit_price: 15000 }],
    paid_amount: 1000,
    payment_method: "Cash",
  });
  const payments = createPaymentServices(db);
  payments.customerPayments.create({
    customer_id: customer.id,
    sale_id: sale.id,
    amount: 2000,
    paid_at: "2026-09-25",
    payment_method: "Cash",
  });
  payments.supplierPayments.create({
    supplier_id: supplier.id,
    purchase_id: purchase.id,
    amount: 3000,
    paid_at: "2026-09-25",
    payment_method: "Cash",
  });
  const expenses = createExpenseServices(db);
  const expenseCategory = expenses.expenseCategories.create({
    name: "Backup Rent",
  });
  expenses.expenses.create({
    expense_category_id: expenseCategory.id,
    amount: 5000,
    description: "Rent",
    spent_at: "2026-09-25",
    payment_method: "Cash",
  });
  const returns = createReturnServices(db);
  returns.saleReturns.create({
    sale_id: sale.id,
    returned_at: "2026-09-26",
    items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
  });
  returns.purchaseReturns.create({
    purchase_id: purchase.id,
    returned_at: "2026-09-26",
    items: [{ purchase_item_id: purchase.items[0].id, quantity: 1 }],
  });
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(
    "shop.name",
    "Roundtrip Shop",
  );
  return { product, purchase, sale, customer, supplier };
}
function allData(db) {
  return Object.fromEntries(
    db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        db
          .prepare(
            `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
          )
          .all(),
      ]),
  );
}
module.exports = { seedBackup, allData };
