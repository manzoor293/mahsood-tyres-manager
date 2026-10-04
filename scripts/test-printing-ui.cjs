const { app, ipcMain, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { initializeDatabase } = require("../electron/database/index.cjs");
const { createPrintingService } = require("../electron/services/printing.cjs");
const { createPrintDriver } = require("../electron/printing/driver.cjs");
const { registerPrintingIpc } = require("../electron/ipc/printing.cjs");
const { createSenderGuard } = require("../electron/ipc/catalog.cjs");
const { seedPrinting } = require("./printing-fixtures.cjs");
if (!process.env.MAHSOOD_UI_TEST_DATA)
  throw Error("Temporary profile required");
app.setPath("userData", process.env.MAHSOOD_UI_TEST_DATA);
app.setPath("sessionData", process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => {
  console.error("Printing UI timeout");
  app.exit(1);
}, 150000);
let attached = false;
app.on("browser-window-created", (_, window) => {
  if (attached) return;
  attached = true;
  const db = initializeDatabase(app);
  seedPrinting(db);
  let printMode = "cancel",
    pdfMode = "cancel",
    loadFailure = false,
    nativeCalls = 0;
  const driver = createPrintDriver({
    print: (_printWindow, options, callback) => {
      nativeCalls++;
      assert.equal(options.silent, false);
      setTimeout(
        () =>
          callback(
            printMode === "success",
            printMode === "cancel" ? "Print job canceled" : "Print job failed",
          ),
        250,
      );
    },
    chooseFile: async (_owner, options) => {
      assert.match(options.defaultPath, /\.pdf$/);
      return pdfMode === "cancel"
        ? { canceled: true }
        : {
            canceled: false,
            filePath: path.join(
              process.env.MAHSOOD_UI_TEST_DATA,
              "ui-receipt.pdf",
            ),
          };
    },
  });
  const service = createPrintingService(db, driver),
    handlers = new Map();
  registerPrintingIpc(
    { handle: (name, fn) => handlers.set(name, fn) },
    service,
    createSenderGuard(
      new Set([window.webContents]),
      pathToFileURL(path.join(__dirname, "../dist/index.html")).href,
    ),
  );
  for (const [name, handler] of handlers) {
    ipcMain.removeHandler(name);
    ipcMain.handle(name, async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return loadFailure
        ? {
            ok: false,
            error: {
              code: "INTERNAL",
              message: "Temporary document loading failure",
            },
          }
        : handler(...args);
    });
  }
  window.webContents.once("did-finish-load", async () => {
    await require("./auth-test-helper.cjs").authenticate(window);
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let i = 0; i < 220; i++) {
        if (await evaluate(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw Error(`Timed out: ${condition}`);
    };
    const click = async (label) => {
      const selector = `Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled)`;
      await wait(`Boolean(${selector})`);
      await evaluate(`${selector}.click()`);
    };
    const input = async (name, value) =>
      evaluate(
        `(()=>{const e=document.querySelector('[name="${name}"]');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
      );
    const preview = () =>
      wait(
        `Boolean(document.querySelector('iframe[title="Business document preview"]'))`,
      );
    const previewHtml = () =>
      evaluate(
        `document.querySelector('iframe[title="Business document preview"]').getAttribute('srcdoc')`,
      );
    const closePreview = () => click("Close Preview");
    try {
      const before = db.serialize();
      await evaluate('location.hash="/sales"');
      await click("View sale SALE-PARTIAL");
      // The existing dialog has stale amounts after a later payment; preview must reload main.
      db.exec(
        "INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,paid_at) VALUES(1,3,100,'Cash','2026-09-26')",
      );
      await click("Print Invoice");
      await wait(
        `document.body.textContent.includes('Loading print preview...')`,
      );
      await preview();
      let html = await previewHtml();
      assert.match(html, /Rs\. 273\.99/);
      assert.doesNotMatch(
        html,
        /unit_cost|Historical unit cost|Gross profit|Rs\. 61\.23/i,
      );
      assert.match(html, /Mahsood Test Shop/);
      assert.match(html, /SALES INVOICE/);
      assert.match(html, /148mm 210mm/);
      assert.ok(await evaluate("document.body.textContent.includes('A5 document.')"));
      assert.match(html, /Historical Brand/);
      assert.equal(
        await evaluate(
          `document.querySelector('iframe').getAttribute('sandbox')`,
        ),
        "",
      );
      const snapshot = db.serialize();
      await click("Print");
      await wait(`document.body.textContent.includes('Operation cancelled.')`);
      assert.equal(nativeCalls, 1);
      assert.equal(
        await evaluate(
          `Array.from(document.querySelectorAll('[role="dialog"]')).find(d=>d.querySelector('#print-preview-title')).querySelectorAll('[role="alert"]').length`,
        ),
        1,
      );
      printMode = "fail";
      await click("Print");
      await wait(`document.body.textContent.includes('Printing failed.')`);
      printMode = "success";
      await click("Print");
      await wait(`document.body.textContent.includes('Print job submitted.')`);
      await click("Save as PDF");
      await wait(`document.body.textContent.includes('Operation cancelled.')`);
      assert.equal(
        fs.existsSync(
          path.join(process.env.MAHSOOD_UI_TEST_DATA, "ui-receipt.pdf"),
        ),
        false,
      );
      pdfMode = "save";
      await click("Save as PDF");
      await wait(
        `document.body.textContent.includes('PDF saved: ui-receipt.pdf')`,
      );
      assert.equal(
        fs
          .readFileSync(
            path.join(process.env.MAHSOOD_UI_TEST_DATA, "ui-receipt.pdf"),
          )
          .subarray(0, 5)
          .toString(),
        "%PDF-",
      );
      loadFailure = true;
      await click("Refresh Preview");
      await wait(
        `document.body.textContent.includes('Temporary document loading failure')`,
      );
      loadFailure = false;
      await click("Retry Preview");
      await preview();
      window.setSize(640, 480);
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        await evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
      );
      const frame = window.webContents.mainFrame.frames.find(
        (f) => f.url === "about:srcdoc",
      );
      if (!frame) throw Error("Preview frame not found");
      await assert.rejects(
        () =>
          frame.executeJavaScript(
            "document.documentElement.scrollWidth>innerWidth",
          ),
        /Script not run/,
        "Preview scripts must remain disabled",
      );
      assert.equal(
        await evaluate(
          `document.querySelector('iframe').getBoundingClientRect().width<=innerWidth`,
        ),
        true,
      );
      fs.mkdirSync(path.join(__dirname, "../artifacts"), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, "../artifacts/printing-preview.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      window.setSize(1100, 760);
      await closePreview();
      await click("Close");
      await click("View sale SALE-WALKIN");
      await click("Print Invoice");
      await preview();
      assert.match(await previewHtml(), /Walk-in/);
      await closePreview();
      await click("Close");
      await evaluate('location.hash="/purchases"');
      await wait(
        `Boolean(document.querySelector('table[aria-label="Purchases"]'))`,
      );
      await click("View purchase PUR-RETURN");
      await click("Print Purchase");
      await preview();
      assert.match(await previewHtml(), /Price \/ Tyre/);
      assert.match(await previewHtml(), /Rs\. 60\.00/);
      await closePreview();
      await click("Close");
      await evaluate('location.hash="/payments"');
      await click("Payment history");
      await wait(
        `Boolean(document.querySelector('table[aria-label="Payment history"]'))`,
      );
      await click("Print Receipt 4");
      await preview();
      html = await previewHtml();
      assert.match(html, /Customer Payment Receipt/);
      assert.match(html, /CP-000004/);
      assert.match(html, /Rs\. 75\.01/);
      await closePreview();
      await click("Supplier Payments");
      await click("Payment history");
      await wait(
        `Boolean(document.querySelector('table[aria-label="Payment history"]'))`,
      );
      await click("Print Receipt 1");
      await preview();
      assert.match(await previewHtml(), /Supplier Payment Receipt/);
      await closePreview();
      await evaluate('location.hash="/returns"');
      await click("Return history");
      await wait(
        `Boolean(document.querySelector('table[aria-label="Return history"]'))`,
      );
      await click("Details");
      await click("Print Return");
      await preview();
      html = await previewHtml();
      assert.match(html, /Sale Return \/ Credit Note/);
      assert.match(html, /Rs\. 99\.99/);
      assert.doesNotMatch(html, /unit_cost|Historical unit cost/i);
      await closePreview();
      await click("Close");
      await click("Purchase Returns");
      await click("Return history");
      await wait(
        `Boolean(document.querySelector('table[aria-label="Return history"]'))`,
      );
      await click("Details");
      await click("Print Return");
      await preview();
      assert.match(await previewHtml(), /Purchase Return \/ Debit Note/);
      await closePreview();
      await click("Close");
      const ipc = await evaluate(
        `(async()=>({keys:Object.keys(window.api.printing).sort(),bad:await window.api.printing.preview('bad',1),id:await window.api.printing.preview('saleInvoice','1'),missing:await window.api.printing.preview('saleInvoice',999),node:typeof window.require,invoke:typeof window.api.invoke}))()`,
      );
      assert.deepEqual(ipc.keys, ["preview", "print", "savePdf"]);
      assert.equal(ipc.bad.error.code, "VALIDATION");
      assert.equal(ipc.id.error.code, "VALIDATION");
      assert.equal(ipc.missing.error.code, "NOT_FOUND");
      assert.equal(ipc.node, "undefined");
      assert.equal(ipc.invoke, "undefined");
      assert.deepEqual(db.serialize(), snapshot);
      assert.notDeepEqual(snapshot, before);
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      console.log(
        "PASS Printing UI: all six document actions, fresh persisted preview, customer cost exclusion, purchase cost, payment/return receipts, print cancellation/failure/success with native calls intercepted, PDF cancellation/save, load retry, narrow sandboxed preview, IPC guards and unchanged database.",
      );
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error(error);
      fs.mkdirSync(path.join(__dirname, "../artifacts"), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, "../artifacts/printing-failure.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      app.exit(1);
    }
  });
});
require("../electron/main.cjs");
