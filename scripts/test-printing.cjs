const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openDatabase } = require("../electron/database/index.cjs");
const {
  createDocumentService,
  documentTypes,
  suggestedFilename,
} = require("../electron/services/print-documents.cjs");
const { createPrintingService } = require("../electron/services/printing.cjs");
const { createPrintDriver } = require("../electron/printing/driver.cjs");
const { registerPrintingIpc } = require("../electron/ipc/printing.cjs");
const { renderDocument, money } = require("../electron/printing/template.cjs");
const { seedPrinting } = require("./printing-fixtures.cjs");
if (!process.env.MAHSOOD_UI_TEST_DATA)
  throw Error("Temporary profile required");
app.setPath("userData", process.env.MAHSOOD_UI_TEST_DATA);
app.setPath("sessionData", process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => {
  console.error("Printing backend timeout");
  app.exit(1);
}, 120000);
app.whenReady().then(async () => {
  let db,
    owner,
    code = 0;
  try {
    db = openDatabase(
      path.join(process.env.MAHSOOD_UI_TEST_DATA, "printing.sqlite3"),
    );
    seedPrinting(db);
    const service = createDocumentService(
      db,
      () => new Date("2026-09-26T12:00:00Z"),
    );
    const before = db.serialize();
    const types = Object.keys(documentTypes);
    for (const type of types) {
      const document = service.getDocument(type, 1);
      assert.ok(document.items.length || type.endsWith("Payment"));
      assert.equal(document.shop.name, "Mahsood Test Shop");
      assert.equal(document.shop.ntn, "TEST-NTN");
      const html = renderDocument(document);
      assert.ok(html.startsWith("<!doctype html>"));
      assert.match(html, /@page\s*\{\s*size:\s*A4/);
      assert.ok(!html.includes("<script"));
    }
    const sale = service.getDocument("saleInvoice", 1);
    assert.equal(sale.items[0].quantity, 4);
    assert.equal(sale.items[0].unit_value, 10000);
    assert.equal(sale.items[0].line_total, 40000);
    assert.equal(sale.totals.at(-1)[1], 79999);
    assert.equal(
      sale.current.find(([key]) => key === "Customer credit / refund due")[1],
      9999,
    );
    assert.equal(sale.relatedReturns[0].reference, "SR-000001");
    for (const type of ["saleInvoice", "customerPayment", "saleReturn"])
      assert.doesNotMatch(
        JSON.stringify(service.getDocument(type, 1)),
        /unit_cost|historicalCost|grossProfit|unit cost|profit/i,
      );
    assert.equal(service.getDocument("saleInvoice", 2).contact.name, "Walk-in");
    assert.equal(
      service.getDocument("customerPayment", 2).contact.name,
      "Walk-in",
    );
    const purchase = service.getDocument("purchaseInvoice", 1);
    assert.equal(purchase.items[0].unit_value, 6000);
    assert.equal(purchase.contact.phone, "0300-1234567");
    assert.match(renderDocument(purchase), /Price \/ Tyre/);
    const payment = service.getDocument("customerPayment", 4);
    assert.equal(payment.reference, "CP-000004");
    assert.equal(
      payment.totals.find(
        ([key]) => key === "Previously paid (recording order)",
      )[1],
      5000,
    );
    assert.equal(
      payment.totals.find(
        ([key]) => key === "Balance against original invoice after payment",
      )[1],
      27499,
    );
    assert.equal(payment.method, "Bank transfer");
    assert.match(
      service.getDocument("customerPayment", 5).explanation,
      /not linked/,
    );
    assert.equal(service.getDocument("customerPayment", 5).current.length, 0);
    assert.equal(
      service.getDocument("saleReturn", 1).items[0].line_total,
      9999,
    );
    assert.equal(
      service.getDocument("purchaseReturn", 1).items[0].unit_value,
      6000,
    );
    for (const type of types) {
      for (const id of [0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1])
        assert.throws(
          () => service.getDocument(type, id),
          (e) => e.code === "VALIDATION",
        );
      assert.throws(
        () => service.getDocument(type, 999),
        (e) => e.code === "NOT_FOUND",
      );
    }
    for (const type of [
      "__proto__",
      "constructor",
      "https://example.test",
      "<h1>",
      "unknown",
      null,
    ])
      assert.throws(
        () => service.getDocument(type, 1),
        (e) => e.code === "VALIDATION",
      );
    assert.equal(money(12501), "Rs. 125.01");
    assert.equal(money(0), "Rs. 0.00");
    assert.equal(money(Number.MAX_SAFE_INTEGER), "Rs. 90,071,992,547,409.91");
    assert.equal(suggestedFilename("CON"), "Document-CON.pdf");
    assert.doesNotMatch(suggestedFilename("../../SALE:<1>?"), /[<>:"/\\|?*]/);
    assert.equal(suggestedFilename("SALE-000123"), "SALE-000123.pdf");
    assert.deepEqual(
      db.serialize(),
      before,
      "Document generation must not mutate any persisted state",
    );
    // Malicious persisted descriptions must be text, not executable markup.
    db.prepare("UPDATE products SET model=? WHERE id=1").run(
      '<script>window.evil=1</script><img src="https://example.test/x">',
    );
    const escaped = renderDocument(service.getDocument("saleInvoice", 1));
    assert.ok(escaped.includes("&lt;script&gt;"));
    assert.ok(!escaped.includes("<img"));
    db.exec("DELETE FROM settings WHERE key='shop.name'");
    assert.equal(
      service.getDocument("saleInvoice", 1).shop.name,
      "Mahsood Tyre Manager",
    );
    const protectedSnapshot = db.serialize();
    let printedHtml,
      calls = 0,
      pendingResolve;
    const output = createPrintingService(db, {
      print: async (html) => {
        calls++;
        printedHtml = html;
        return { status: "printed" };
      },
      savePdf: async () => ({ status: "cancelled" }),
    });
    const preview = output.preview("saleInvoice", 3);
    assert.match(preview.html, /Rs\. 274\.99/);
    db.exec(
      "INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,paid_at) VALUES(1,3,100,'Cash','2026-09-26')",
    );
    await output.print("saleInvoice", 3);
    assert.match(printedHtml, /Rs\. 273\.99/);
    assert.equal(calls, 1);
    const busy = createPrintingService(db, {
      print: () =>
        new Promise((resolve) => {
          pendingResolve = resolve;
        }),
    });
    const pending = busy.print("saleInvoice", 1);
    await assert.rejects(
      () => busy.print("saleInvoice", 1),
      (e) => e.code === "BUSY",
    );
    pendingResolve({ status: "cancelled" });
    await pending;
    // Real print renderer, mocked native printer and Save dialog; PDF uses Chromium itself.
    owner = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    let mode = "cancel",
      saveMode = "cancel",
      nativeCalls = 0;
    const created = [];
    const destination = path.join(
      process.env.MAHSOOD_UI_TEST_DATA,
      "verified.pdf",
    );
    const driver = createPrintDriver({
      createWindow: (options) => {
        assert.equal(options.show, false);
        assert.equal(options.webPreferences.javascript, false);
        assert.equal(options.webPreferences.nodeIntegration, false);
        assert.equal(options.webPreferences.contextIsolation, true);
        assert.equal(options.webPreferences.sandbox, true);
        assert.equal(options.webPreferences.preload, undefined);
        const window = new BrowserWindow(options);
        created.push(window);
        return window;
      },
      print: (_window, options, callback) => {
        nativeCalls++;
        assert.equal(options.silent, false);
        assert.equal(options.pageSize, "A4");
        callback(
          mode === "success",
          mode === "cancel" ? "Print job canceled" : "Print job failed",
        );
      },
      chooseFile: async (_owner, options) => {
        assert.match(options.defaultPath, /\.pdf$/);
        assert.deepEqual(options.filters, [
          { name: "PDF document", extensions: ["pdf"] },
        ]);
        return saveMode === "cancel"
          ? { canceled: true }
          : { canceled: false, filePath: destination };
      },
    });
    const html = output.preview("saleInvoice", 1).html;
    assert.equal((await driver.print(html, owner)).status, "cancelled");
    mode = "fail";
    await assert.rejects(
      () => driver.print(html, owner),
      (e) => e.code === "PRINT_FAILED",
    );
    mode = "success";
    assert.equal((await driver.print(html, owner)).status, "printed");
    assert.equal(nativeCalls, 3);
    assert.equal(
      (await driver.savePdf(html, "sale.pdf", owner)).status,
      "cancelled",
    );
    assert.equal(fs.existsSync(destination), false);
    saveMode = "save";
    assert.equal(
      (await driver.savePdf(html, "sale.pdf", owner)).status,
      "saved",
    );
    assert.equal(
      fs.readFileSync(destination).subarray(0, 5).toString(),
      "%PDF-",
    );
    assert.ok(created.every((window) => window.isDestroyed()));
    await assert.rejects(
      () =>
        createPrintDriver({
          createWindow: () => {
            throw Error("test window failure");
          },
        }).print(html, owner),
      (e) => e.code === "PRINT_FAILED",
    );
    await assert.rejects(
      () =>
        createPrintDriver({
          chooseFile: async () => {
            throw Error("test save dialog failure");
          },
        }).savePdf(html, "sale.pdf", owner),
      (e) => e.code === "PDF_FAILED",
    );
    await assert.rejects(
      () =>
        createPrintDriver({
          chooseFile: async () => ({
            canceled: false,
            filePath: path.join(process.env.MAHSOOD_UI_TEST_DATA, "bad.txt"),
          }),
        }).savePdf(html, "sale.pdf", owner),
      (e) => e.code === "PDF_FAILED",
    );
    await assert.rejects(
      () =>
        createPrintDriver({
          chooseFile: async () => ({ canceled: false, filePath: destination }),
          toPdf: async () => {
            throw Error("test PDF generation failure");
          },
        }).savePdf(html, "sale.pdf", owner),
      (e) => e.code === "PRINT_FAILED",
    );
    // Long descriptions and many persisted rows exercise real A4 pagination, not a template mock.
    db.exec(
      "INSERT INTO sales(id,invoice_number,subtotal,total,sold_at) VALUES(4,'SALE-MANY',8000,8000,'2026-09-26')",
    );
    const addItem = db.prepare(
      "INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,unit_cost) VALUES(4,1,1,100,60)",
    );
    for (let index = 0; index < 80; index++) addItem.run();
    const many = output.preview("saleInvoice", 4);
    await driver.savePdf(many.html, many.filename, owner);
    const pdf = fs.readFileSync(destination).toString("latin1");
    assert.ok(
      (pdf.match(/\/Type\s*\/Page\b/g) || []).length > 1,
      "Long document must paginate",
    );
    const mediaBox = pdf.match(
      /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/,
    );
    assert.ok(
      mediaBox &&
        Math.abs(Number(mediaBox[1]) - 595.28) < 1 &&
        Math.abs(Number(mediaBox[2]) - 841.89) < 1,
      `PDF must use A4 dimensions: ${mediaBox?.[0]}`,
    );
    const handlers = new Map();
    registerPrintingIpc(
      {
        handle: (name, fn) => handlers.set(name, fn),
        removeHandler: (name) => handlers.delete(name),
      },
      output,
      (event) => event.trusted,
    );
    assert.equal(handlers.size, 3);
    for (const handler of handlers.values()) {
      assert.equal(
        (await handler({ trusted: false }, "saleInvoice", 1)).error.code,
        "FORBIDDEN",
      );
      for (const args of [
        ["saleInvoice", 1, {}],
        ["bad", 1],
        ["saleInvoice", "1"],
      ])
        assert.equal(
          (await handler({ trusted: true }, ...args)).error.code,
          "VALIDATION",
        );
    }
    assert.equal(
      (
        await handlers.get("printing:preview")(
          { trusted: true, sender: owner.webContents },
          "saleInvoice",
          1,
        )
      ).ok,
      true,
    );
    assert.equal(db.pragma("user_version", { simple: true }), 6);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    // Only intentional fixture changes occurred; printing APIs introduce no writes.
    const afterFixture = db.serialize();
    await output.savePdf("saleInvoice", 1);
    assert.deepEqual(db.serialize(), afterFixture);
    assert.notDeepEqual(protectedSnapshot, afterFixture);
    console.log(
      "PASS Printing: six persisted documents, historical/current separation, payment-order balances, walk-in/legacy handling, cost exclusion, escaping, safe paise/filenames, fresh reads, IPC validation, output guard, native printer interception, cancellation/failures, real PDF generation, cleanup and schema-6 read-only behavior.",
    );
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    if (owner && !owner.isDestroyed()) owner.destroy();
    if (db?.open) db.close();
    clearTimeout(timeout);
    app.exit(code);
  }
});
