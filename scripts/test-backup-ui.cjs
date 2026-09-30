const { app, dialog, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { initializeDatabase } = require("../electron/database/index.cjs");
const { seedBackup, allData } = require("./backup-fixtures.cjs");
if (!process.env.MAHSOOD_UI_TEST_DATA)
  throw Error("Temporary profile required");
const root = process.env.MAHSOOD_UI_TEST_DATA;
app.setPath("userData", root);
app.setPath("sessionData", root);
const timeout = setTimeout(() => {
  console.error("Backup UI timed out");
  app.exit(1);
}, 150000);
let selected = path.join(root, "ui-backup.sqlite3"),
  canceled = false,
  nativeCalls = 0,
  infoFailure = false,
  writeFailure = false;
let releaseDialog;
dialog.showSaveDialog = async () => {
  nativeCalls++;
  await new Promise((resolve) => {
    releaseDialog = resolve;
  });
  if (writeFailure)
    throw Object.assign(Error("Injected disk full"), { code: "ENOSPC" });
  return { canceled, filePath: selected };
};
dialog.showOpenDialog = async () => ({ canceled, filePaths: [selected] });
dialog.showMessageBox = async (options) => {
  assert.equal(options.defaultId, 0);
  return { response: 1 };
};
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, handler) =>
  handle(
    name,
    name === "backup:getInfo"
      ? async (...args) => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return infoFailure
            ? {
                ok: false,
                error: {
                  code: "INTERNAL",
                  message: "Temporary status failure",
                },
              }
            : handler(...args);
        }
      : handler,
  );
let attached = false;
app.on("browser-window-created", (_, window) => {
  if (attached) return;
  attached = true;
  seedBackup(initializeDatabase(app));
  let expected;
  window.webContents.once("did-finish-load", async () => {
    await require("./auth-test-helper.cjs").authenticate(window);
    expected = allData(initializeDatabase(app));
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let i = 0; i < 220; i++) {
        if (await evaluate(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw Error(`Timed out: ${condition}`);
    };
    const button = (label) =>
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
    const click = async (label) => {
      await wait(`Boolean(${button(label)})&&!${button(label)}.disabled`);
      await evaluate(`${button(label)}.click()`);
    };
    const text = (value) =>
      wait(`document.body.textContent.includes(${JSON.stringify(value)})`);
    const beginRestore = async () => {
      await click("Restore Backup");
      await text("Restore shop data?");
      assert.equal(
        await evaluate(`${button("Continue to Restore")}.disabled`),
        true,
      );
      await evaluate(
        `document.querySelector('input[type="checkbox"]').click()`,
      );
      await click("Continue to Restore");
    };
    const save = async () => {
      releaseDialog = null;
      await click("Create Backup");
      for (let i = 0; !releaseDialog && i < 100; i++)
        await new Promise((resolve) => setTimeout(resolve, 30));
      assert.ok(releaseDialog);
    };
    try {
      await evaluate('location.hash="/settings"');
      await text("Loading database information...");
      await text("Database Status: Healthy");
      await text("Schema Version: 5");
      await text("No recovery backups yet.");
      await text("No backup created this session.");
      const keys = await evaluate("Object.keys(window.api.backup).sort()");
      assert.deepEqual(keys, ["create", "getInfo", "restore"]);
      assert.equal(await evaluate("typeof window.require"), "undefined");
      await save();
      await text("Creating backup...");
      window.close();
      assert.equal(
        window.isDestroyed(),
        false,
        "Closing during database maintenance must be prevented",
      );
      assert.equal(
        await evaluate(
          `${button("Create Backup")}.disabled && ${button("Restore Backup")}.disabled`,
        ),
        true,
      );
      await evaluate(`${button("Create Backup")}.click()`);
      assert.equal(nativeCalls, 1);
      const concurrent = await evaluate(
        "(async()=>[await window.api.backup.create(),await window.api.backup.restore(),await window.api.products.list()])()",
      );
      assert.deepEqual(
        concurrent.map((result) => result.error.code),
        ["BUSY", "BUSY", "MAINTENANCE"],
      );
      releaseDialog();
      await text("Backup created: ui-backup.sqlite3");
      assert.deepEqual(allData(initializeDatabase(app)), expected);
      canceled = true;
      await save();
      releaseDialog();
      await text("Operation cancelled.");
      canceled = false;
      writeFailure = true;
      await save();
      releaseDialog();
      await text("There is not enough free disk space.");
      writeFailure = false;
      await save();
      releaseDialog();
      await text("Backup created: ui-backup.sqlite3");
      await click("Restore Backup");
      await text("Restore shop data?");
      await click("Cancel");
      assert.deepEqual(allData(initializeDatabase(app)), expected);
      canceled = true;
      await beginRestore();
      await text("Operation cancelled.");
      canceled = false;
      selected = path.join(root, "invalid.sqlite3");
      fs.writeFileSync(selected, "invalid SQLite");
      await beginRestore();
      await text("This file is invalid or damaged.");
      assert.deepEqual(allData(initializeDatabase(app)), expected);
      selected = path.join(root, "newer.sqlite3");
      fs.copyFileSync(path.join(root, "ui-backup.sqlite3"), selected);
      const newer = new Database(selected);
      newer.pragma("user_version=6");
      newer.close();
      await beginRestore();
      await text("This backup uses schema 6.");
      assert.deepEqual(allData(initializeDatabase(app)), expected);
      selected = path.join(root, "ui-backup.sqlite3");
      initializeDatabase(app).exec(
        "UPDATE products SET model='Changed in live database'; UPDATE settings SET value='Changed shop'",
      );
      await beginRestore();
      await text("Sign in to Mahsood Tyre Manager");
      await require("./auth-test-helper.cjs").authenticate(window);
      await text("pre-restore-backup-");
      assert.deepEqual(allData(initializeDatabase(app)), expected);
      // Actual main handlers must have fresh statements after the old connection was closed.
      const integration = await evaluate(
        "(async()=>({product:await window.api.products.getById(1),sale:await window.api.sales.getById(1),purchase:await window.api.purchases.getById(1),dashboard:await window.api.dashboard.getOverview(),report:await window.api.reports.getReceivables(),history:await window.api.customerPayments.history()}))()",
      );
      for (const result of Object.values(integration))
        assert.equal(result.ok, true);
      assert.equal(integration.product.data.model, "Roundtrip");
      assert.equal(integration.sale.data.balance, 42000);
      assert.equal(integration.purchase.data.balance, 106000);
      infoFailure = true;
      await click("Refresh Status");
      await text("Temporary status failure");
      infoFailure = false;
      await click("Retry");
      await text("Database Status: Healthy");
      await wait(
        `!document.body.textContent.includes('Loading database information...')`,
      );
      window.setSize(640, 480);
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        await evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
      );
      await click("Restore Backup");
      await text("Restore shop data?");
      assert.equal(
        await evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
      );
      await click("Cancel");
      fs.mkdirSync(path.join(__dirname, "../artifacts"), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, "../artifacts/backup-settings.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      console.log(
        "PASS Backup UI: real renderer/preload/IPC/native-dialog seam, loading/empty/status/schema, create success/cancel/disk-full/retry, mutual exclusion, deliberate confirmation, restore cancel/invalid/newer/success, fresh business handlers, recovery history and narrow layout.",
      );
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
require("../electron/main.cjs");
