const { app } = require("electron");
const assert = require("node:assert/strict");
const path = require("node:path");
const { openDatabase } = require("../electron/database/index.cjs");
const {
  createSettingsService,
  shopDefaults,
} = require("../electron/services/settings.cjs");
const { registerSettingsIpc } = require("../electron/ipc/settings.cjs");
const {
  createDocumentService,
  documentTypes,
} = require("../electron/services/print-documents.cjs");
const { createPrintingService } = require("../electron/services/printing.cjs");
const { createBackupService } = require("../electron/services/backup.cjs");
const { createMaintenanceGate } = require("../electron/ipc/maintenance.cjs");
const { seedPrinting } = require("./printing-fixtures.cjs");
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw Error("Temporary profile required");
app.setPath("userData", root);
app.setPath("sessionData", root);
app.whenReady().then(async () => {
  let db,
    code = 0;
  try {
    const filename = path.join(root, "database", "settings.sqlite3");
    db = openDatabase(filename);
    let service = createSettingsService(db);
    assert.deepEqual(service.getShopProfile(), shopDefaults);
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM settings").get().count,
      0,
    );
    assert.deepEqual(service.getPreferences(), {
      currency: "PKR",
      currencyLabel: "Pakistani Rupee (PKR)",
    });
    seedPrinting(db);
    const profile = service.updateShopProfile({
      name: "  Configured Shop  ",
      address: " Shop Road\nPeshawar ",
      phone: "+92 (300) 123-4567",
      alternatePhone: "0311-1234567",
      email: " shop@example.test ",
      ntn: " 001-ABC ",
      footer: " Thank you\nVisit again ",
    });
    assert.equal(profile.name, "Configured Shop");
    assert.equal(profile.phone, "+923001234567");
    assert.equal(profile.alternatePhone, "03111234567");
    assert.equal(profile.ntn, "001-ABC");
    assert.equal(profile.footer, "Thank you\nVisit again");
    assert.equal(profile.email, "shop@example.test");
    assert.deepEqual(service.getShopProfile(), profile);
    for (const invalid of [
      null,
      [],
      {},
      { name: "" },
      { name: "  " },
      { name: 123 },
      { name: "x".repeat(201) },
      { email: "bad@" },
      { phone: "abc1234" },
      { phone: "123" },
      { alternatePhone: "+1234567890123456" },
      { footer: "<b>HTML</b>" },
      { footer: "x".repeat(1001) },
      { address: "bad\u0001text" },
      { currency: "USD" },
      { arbitrary: "secret" },
    ]) {
      assert.throws(
        () => service.updateShopProfile(invalid),
        (error) => error.code === "VALIDATION",
      );
      assert.deepEqual(
        service.getShopProfile(),
        profile,
        "Invalid updates must be atomic",
      );
    }
    assert.equal(service.updateShopProfile({ footer: "" }).footer, "");
    service.updateShopProfile(profile);
    db.close();
    db = openDatabase(filename);
    service = createSettingsService(db);
    assert.deepEqual(service.getShopProfile(), profile);
    const documents = createDocumentService(db);
    const outputs = [];
    const printing = createPrintingService(db, {
      print: async (html) => {
        outputs.push(html);
        return { status: "printed" };
      },
      savePdf: async (html) => {
        outputs.push(html);
        return { status: "saved" };
      },
    });
    const original = documents.getDocument("saleInvoice", 1);
    service.updateShopProfile({ name: "Updated Shop" });
    for (const type of Object.keys(documentTypes)) {
      const document = documents.getDocument(type, 1);
      assert.equal(document.shop.name, "Updated Shop");
      assert.equal(document.footer, profile.footer);
      const html = printing.preview(type, 1).html;
      for (const value of [
        "Updated Shop",
        profile.address,
        profile.phone,
        profile.alternatePhone,
        profile.email,
        profile.ntn,
        profile.footer,
      ])
        assert.ok(html.includes(value));
      await printing.print(type, 1);
      await printing.savePdf(type, 1);
      if (["saleInvoice", "customerPayment", "saleReturn"].includes(type))
        assert.doesNotMatch(
          JSON.stringify(document),
          /unit_cost|historicalCost|grossProfit|unit cost|profit/i,
        );
    }
    assert.equal(outputs.length, 12);
    assert.ok(outputs.every((html) => html.includes("Updated Shop")));
    assert.deepEqual(
      documents.getDocument("saleInvoice", 1).items,
      original.items,
    );
    assert.deepEqual(
      documents.getDocument("saleInvoice", 1).totals,
      original.totals,
    );
    const expected = service.getShopProfile();
    const gate = createMaintenanceGate({ handle() {}, removeHandler() {} });
    const backupFile = path.join(root, "settings-backup.sqlite3");
    const backup = createBackupService({
      app,
      gate,
      getDatabase: () => db,
      closeDatabase: () => db.close(),
      reopen: () => {
        db = openDatabase(filename);
      },
      dialogs: {
        showSaveDialog: async () => ({ canceled: false, filePath: backupFile }),
        showOpenDialog: async () => ({
          canceled: false,
          filePaths: [backupFile],
        }),
        showMessageBox: async () => ({ response: 1 }),
      },
    });
    await backup.create();
    service.updateShopProfile({ name: "After backup", footer: "Changed" });
    await backup.restore();
    service = createSettingsService(db);
    assert.deepEqual(service.getShopProfile(), expected);
    const handlers = new Map();
    registerSettingsIpc(
      { handle: (name, handler) => handlers.set(name, handler) },
      service,
      (event) => event.trusted,
    );
    for (const handler of handlers.values()) {
      assert.equal(handler({ trusted: false }).error.code, "FORBIDDEN");
      assert.equal(
        handler({ trusted: true }, {}, "extra").error.code,
        "VALIDATION",
      );
    }
    assert.equal(
      handlers.get("settings:updateShopProfile")(
        { trusted: true },
        { name: "" },
      ).error.code,
      "VALIDATION",
    );
    assert.deepEqual(
      handlers.get("settings:getShopProfile")({ trusted: true }).data,
      expected,
    );
    assert.equal(db.pragma("user_version", { simple: true }), 6);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get().count,
      21,
    );
    console.log(
      "PASS Settings backend: defaults, validation/atomicity, normalization, reopen, IPC guards, six document previews/print/PDF payloads, historical amounts/cost exclusion, backup/restore, schema 5 and 21 tables.",
    );
  } catch (error) {
    code = 1;
    console.error(error);
  } finally {
    if (db?.open) db.close();
    app.exit(code);
  }
});
