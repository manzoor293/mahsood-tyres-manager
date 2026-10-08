const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { openDatabase } = require("../electron/database/index.cjs");
const {
  allocateShipment,
  freightForQuantity,
} = require("../electron/services/shipment.cjs");
const { createPurchaseService } = require("../electron/services/purchases.cjs");
const { createSaleService } = require("../electron/services/sales.cjs");
const { createReturnServices } = require("../electron/services/returns.cjs");
const {
  createDashboardService,
} = require("../electron/services/dashboard.cjs");
const { createReportsService } = require("../electron/services/reports.cjs");
const { createLedgerService } = require("../electron/services/ledger.cjs");
const { createPaymentServices } = require("../electron/services/payments.cjs");
const { createPrintingService } = require("../electron/services/printing.cjs");
const { createBackupService } = require("../electron/services/backup.cjs");
const { createMaintenanceGate } = require("../electron/ipc/maintenance.cjs");
const { createAuthService } = require("../electron/services/auth.cjs");
const { allData } = require("./backup-fixtures.cjs");
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw Error("Temporary profile required");
app.setPath("userData", root);
app.setPath("sessionData", root);
const period = {
  period: "custom",
  from_date: "2026-09-01",
  to_date: "2026-09-30",
};
app.whenReady().then(async () => {
  let db,
    code = 0;
  try {
    const filename = path.join(root, "database", "shipment.sqlite3");
    db = openDatabase(filename);
    db.exec(
      "INSERT INTO suppliers(name) VALUES('Tyre supplier'); INSERT INTO products(sku,model,size) VALUES('A','A model','R16'),('B','B model','R16'),('C','C model','R16')",
    );
    let sequence = 0;
    const purchases = createPurchaseService(db),
      sales = createSaleService(db);
    const buy = (items, shipment_cost = 0, extra = {}) =>
      purchases.create({
        supplier_id: 1,
        invoice_number: `SHIP-${++sequence}`,
        purchased_at: "2026-09-02",
        items,
        shipment_cost,
        ...extra,
      });
    const item = (product_id, quantity, unit_cost) => ({
      product_id,
      quantity,
      unit_cost,
    });
    const sale = (quantity, product_id = 1, unit_price = 13000000) =>
      sales.create({
        items: [{ product_id, quantity, unit_price }],
        sold_at: "2026-09-03T10:00:00.000Z",
      });
    const original = buy(
      [item(1, 10, 10000000), item(2, 20, 5000000), item(3, 10, 20000000)],
      20000000,
      {
        paid_amount: 150000000,
        transporter_name: "Separate transporter",
        shipment_reference: "BILTY-1",
      },
    );
    assert.deepEqual(
      original.items.map((i) => i.allocated_shipment_cost),
      [5000000, 5000000, 10000000],
    );
    assert.equal(original.total, 400000000);
    assert.equal(original.landed_total, 420000000);
    assert.equal(original.balance, 250000000);
    assert.equal(
      db.prepare("SELECT SUM(quantity_change) AS q FROM stock_movements").get()
        .q,
      80,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM stock_movements").get().n,
      3,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM supplier_payments").get().n,
      1,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM expenses").get().n, 0);
    const payments = createPaymentServices(db).supplierPayments;
    assert.equal(payments.getAccountSummary(1).outstanding, 250000000);
    const ledger = createLedgerService(db).getFullStatement({
      party_type: "supplier",
      party_id: 1,
    });
    assert.equal(ledger.totals.invoices, 400000000);
    assert.equal(ledger.closingBalance, 250000000);
    const dashboard = createDashboardService(db),
      reports = createReportsService(db);
    assert.equal(
      dashboard.getOverview(period).summary.supplierPayables,
      250000000,
    );
    assert.equal(
      dashboard.getOverview(period).summary.purchaseTotal,
      400000000,
    );
    assert.equal(reports.getPayables().summary.outstanding, 250000000);
    const purchaseReport = reports.getPurchases(period);
    assert.equal(purchaseReport.summary.shipment_cost, 20000000);
    assert.equal(purchaseReport.summary.landed_total, 420000000);
    assert.equal(purchaseReport.rows[0].total, 400000000);
    const printing = createPrintingService(db, {});
    const html = printing.preview("purchaseInvoice", original.id).html;
    for (const text of [
      "Supplier Invoice Total",
      "Current Invoice Position",
      "Current payable balance",
    ])
      assert.ok(html.includes(text), text);
    assert.doesNotMatch(
      html,
      /Shipment|Freight|Transporter|Bilty|Landed Cost|Acquisition Cost|BILTY-1|Separate transporter/i,
    );
    assert.match(html, /Rs\. 4,000,000\.00/);
    assert.match(html, /Rs\. 2,500,000\.00/);

    assert.deepEqual(
      allocateShipment([item(1, 1, 1), item(2, 1, 2), item(3, 1, 3)], 101),
      [17, 34, 50],
    );
    assert.deepEqual(
      allocateShipment([item(1, 1, 1), item(2, 1, 1), item(3, 1, 1)], 2),
      [1, 1, 0],
    );
    assert.deepEqual(allocateShipment([item(1, 1, 0)], 0), [0]);
    assert.throws(() => allocateShipment([item(1, 1, 0)], 1), /positive total/);
    assert.deepEqual(
      allocateShipment([item(1, 1, 100)], Number.MAX_SAFE_INTEGER - 100),
      [Number.MAX_SAFE_INTEGER - 100],
    );
    assert.throws(
      () => allocateShipment([item(1, 1, 100)], Number.MAX_SAFE_INTEGER),
      /Landed line/,
    );
    for (let amount = 0; amount < 150; amount++) {
      const allocated = allocateShipment(
        [item(1, 2, 3), item(2, 3, 5), item(3, 5, 7)],
        amount,
      );
      assert.equal(
        allocated.reduce((a, b) => a + b, 0),
        amount,
      );
    }
    const snapshot = allData(db);
    for (const invalid of [-1, NaN, Infinity, "1", Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => buy([item(1, 1, 100)], invalid));
    assert.throws(() => buy([item(1, 1, Number.MAX_SAFE_INTEGER)], 1));
    assert.throws(() => buy([item(1, 1, 0)], 1));
    assert.deepEqual(
      allData(db),
      snapshot,
      "Invalid purchases leave no partial data",
    );
    db.exec(
      "CREATE TRIGGER shipment_test_fail BEFORE INSERT ON supplier_payments BEGIN SELECT RAISE(ABORT,'shipment payment failure'); END",
    );
    assert.throws(
      () => buy([item(1, 2, 100), item(2, 3, 200)], 101, { paid_amount: 100 }),
      /shipment payment failure/,
    );
    db.exec("DROP TRIGGER shipment_test_fail");
    assert.deepEqual(
      allData(db),
      snapshot,
      "Payment failure rolls back items, allocations and stock",
    );
    const discount = buy([item(1, 1, 1000)], 101, {
      discount: 100,
      paid_amount: 900,
    });
    assert.equal(discount.total, 900);
    assert.equal(discount.landed_total, 1001);
    assert.equal(discount.balance, 0);
    const discountedReturn = createReturnServices(db).purchaseReturns.create({
      purchase_id: discount.id,
      returned_at: "2026-09-04",
      items: [{ purchase_item_id: discount.items[0].id, quantity: 1 }],
    });
    assert.equal(
      discountedReturn.document.total,
      900,
      "Supplier return includes discount but excludes freight",
    );
    assert.equal(purchases.getById(discount.id).shipment_cost, 101);
    assert.equal(buy([item(2, 1, 100)], 0).items[0].allocated_shipment_cost, 0);
    const profitPurchase = buy([item(1, 10, 10000000)], 2000000);
    const sold = sale(10);
    assert.equal(sold.items[0].unit_cost, 10000000);
    assert.equal(sold.items[0].allocated_shipment_cost, 2000000);
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE purchase_items SET allocated_shipment_cost=0 WHERE id=?",
          )
          .run(profitPurchase.items[0].id),
      /immutable/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE purchase_items SET quantity=11 WHERE id=?")
          .run(profitPurchase.items[0].id),
      /immutable/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE sale_items SET allocated_shipment_cost=0 WHERE id=?")
          .run(sold.items[0].id),
      /immutable/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE purchases SET shipment_cost=0 WHERE id=?")
          .run(profitPurchase.id),
      /immutable/,
    );
    const profit = reports
      .getProfit(period)
      .rows.find((row) => row.id === sold.id);
    assert.equal(profit.historicalCost, 102000000);
    assert.equal(profit.grossProfit, 28000000);
    assert.equal(reports.getProfit(period).summary.expenses, 0);
    assert.equal(dashboard.getOverview(period).summary.grossProfit, 28000000);
    const customerHtml = printing.preview("saleInvoice", sold.id).html;
    assert.ok(!customerHtml.includes("Separate Acquisition Costs"));
    assert.ok(!customerHtml.includes("Separate transporter"));
    assert.ok(!customerHtml.includes("Shipment / Delivery"));
    const returned = createReturnServices(db).purchaseReturns.create({
      purchase_id: profitPurchase.id,
      returned_at: "2026-09-04",
      items: [{ purchase_item_id: profitPurchase.items[0].id, quantity: 1 }],
    });
    assert.equal(returned.document.total, 10000000);
    const afterReturn = purchases.getById(profitPurchase.id);
    assert.equal(afterReturn.shipment_cost, 2000000);
    assert.equal(afterReturn.items[0].allocated_shipment_cost, 2000000);
    assert.equal(afterReturn.items[0].freight_on_returned_goods, 200000);
    assert.equal(
      createLedgerService(db).getFullStatement({
        party_type: "supplier",
        party_id: 1,
      }).totals.returns,
      10000900,
    );

    const odd = buy([item(1, 3, 100)], 100);
    const split = [sale(1, 1, 200), sale(1, 1, 200), sale(1, 1, 200)];
    assert.deepEqual(
      split.map((row) => row.items[0].allocated_shipment_cost),
      [33, 33, 34],
    );
    assert.equal(
      split.reduce((sum, row) => sum + row.items[0].allocated_shipment_cost, 0),
      100,
    );
    const oddFull = sale(3, 1, 200); // Latest purchase valuation repeats the source ratio for other stock.
    assert.equal(oddFull.items[0].allocated_shipment_cost, 100);
    const saleReturns = createReturnServices(db).saleReturns;
    for (let i = 0; i < 3; i++)
      saleReturns.create({
        sale_id: oddFull.id,
        returned_at: "2026-09-05",
        items: [{ sale_item_id: oddFull.items[0].id, quantity: 1 }],
      });
    assert.equal(
      reports.getProfit(period).rows.find((row) => row.id === oddFull.id)
        .historicalCost,
      0,
    );
    assert.equal(freightForQuantity(101, 6, 0, 6), 101);
    // Legacy factor 1 source, converted to pair sales without multiplying freight twice.
    const legacySource = db
      .prepare(
        "INSERT INTO purchases(invoice_number,supplier_id,purchased_at,subtotal,discount,total,shipment_cost) VALUES('LEGACY-SOURCE',1,'2026-09-02',300,0,300,101)",
      )
      .run().lastInsertRowid;
    const legacyItem = db
      .prepare(
        "INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost,units_per_transaction_unit,allocated_shipment_cost) VALUES(?,?,?,?,1,?)",
      )
      .run(legacySource, 3, 6, 50, 101).lastInsertRowid;
    db.prepare(
      "INSERT INTO stock_movements(product_id,movement_type,quantity_change,purchase_item_id,unit_cost) VALUES(3,'PURCHASE',6,?,50)",
    ).run(legacyItem);
    const legacySale = sale(3, 3, 200);
    assert.equal(legacySale.items[0].unit_cost, 100);
    assert.equal(legacySale.items[0].allocated_shipment_cost, 101);
    assert.deepEqual(
      db
        .prepare(
          "SELECT p.id FROM purchases p WHERE p.shipment_cost!=(SELECT COALESCE(SUM(allocated_shipment_cost),0) FROM purchase_items WHERE purchase_id=p.id)",
        )
        .all(),
      [],
    );

    const credentials = {
      email: "shipment@example.test",
      password: "Shipment-2026-Test!",
    };
    await createAuthService(() => db).setup({
      ...credentials,
      confirmPassword: credentials.password,
    });
    let selected = path.join(root, "shipment-backup.sqlite3");
    const backup = createBackupService({
      app,
      gate: createMaintenanceGate({ handle() {}, removeHandler() {} }),
      getDatabase: () => db,
      closeDatabase: () => db.close(),
      reopen: () => {
        db = openDatabase(filename);
      },
      dialogs: {
        showSaveDialog: async () => ({ filePath: selected }),
        showMessageBox: async () => ({ response: 1 }),
        showOpenDialog: async () => ({ filePaths: [selected] }),
      },
    });
    const expected = allData(db);
    await backup.create();
    await backup.restore();
    assert.deepEqual(allData(db), expected);
    await createAuthService(() => db).login(credentials);
    const files = fs
      .readdirSync(path.join(__dirname, "../electron/database/migrations"))
      .sort();
    for (let version = 1; version <= 6; version++) {
      selected = path.join(root, `legacy-${version}.sqlite3`);
      const old = new Database(selected);
      for (const file of files.slice(0, version))
        old.exec(
          fs.readFileSync(
            path.join(__dirname, "../electron/database/migrations", file),
            "utf8",
          ),
        );
      old.pragma(`user_version=${version}`);
      old.exec(
        "INSERT INTO suppliers(name) VALUES('Legacy supplier'); INSERT INTO products(sku,model,size) VALUES('OLD','Old','R16'); INSERT INTO purchases(invoice_number,supplier_id,subtotal,discount,total) VALUES('OLD',1,1000,100,900); INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost) VALUES(1,1,10,100); INSERT INTO stock_movements(product_id,movement_type,quantity_change,purchase_item_id,unit_cost) VALUES(1,'PURCHASE',10,1,100); INSERT INTO supplier_payments(supplier_id,purchase_id,amount,payment_method) VALUES(1,1,400,'Cash')",
      );
      if (version >= 5)
        await createAuthService(() => old).setup({
          ...credentials,
          confirmPassword: credentials.password,
        });
      const before = allData(old);
      old.close();
      await backup.restore();
      assert.equal(db.pragma("user_version", { simple: true }), 7);
      for (const [table, rows] of Object.entries(before)) {
        const migrated = allData(db)[table];
        assert.deepEqual(
          migrated.map((row) =>
            Object.fromEntries(
              Object.keys(rows[0] ?? {}).map((key) => [key, row[key]]),
            ),
          ),
          rows,
        );
      }
      assert.equal(
        db.prepare("SELECT shipment_cost FROM purchases").get().shipment_cost,
        0,
      );
      assert.equal(
        db.prepare("SELECT allocated_shipment_cost FROM purchase_items").get()
          .allocated_shipment_cost,
        0,
      );
      assert.equal(createPurchaseService(db).getById(1).balance, 500);
      if (version >= 5) await createAuthService(() => db).login(credentials);
    }
    console.log(
      "PASS shipment: allocations/remainders/limits, atomicity, pairs/legacy units, supplier separation, returns, exact historical freight/profit, reports/dashboard/print, schema 1-6 restore and schema 7 snapshot/authentication",
    );
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    if (db?.open) db.close();
    app.exit(code);
  }
});
