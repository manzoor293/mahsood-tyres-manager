const { app, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { initializeDatabase } = require("../electron/database/index.cjs");
const { statusFixtures } = require("./status-fixtures.cjs");
const {
  registerCatalogIpc,
  createSenderGuard,
} = require("../electron/ipc/catalog.cjs");
const { registerExpenseIpc } = require("../electron/ipc/expenses.cjs");
const { registerSupplierIpc } = require("../electron/ipc/suppliers.cjs");
const { registerCustomerIpc } = require("../electron/ipc/customers.cjs");
if (!process.env.MAHSOOD_UI_TEST_DATA)
  throw new Error("Use npm run test:status:ui for isolated data.");
app.setPath("userData", process.env.MAHSOOD_UI_TEST_DATA);
app.setPath("sessionData", process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => {
  console.error("Status UI timeout");
  app.exit(1);
}, 120000);
app.on("browser-window-created", (_, window) => {
  window.webContents.once("did-finish-load", async () => {
    await require("./auth-test-helper.cjs").authenticate(window);
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let i = 0; i < 160; i++) {
        if (await evaluate(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out: ${condition}`);
    };
    const click = async (label) => {
      const selector = `Array.from(document.querySelectorAll('button')).find(b => !b.disabled && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)}))`;
      await wait(`Boolean(${selector})`);
      await evaluate(`${selector}.click()`);
    };
    const input = async (name, value) => {
      await wait(`Boolean(document.querySelector('[name="${name}"]'))`);
      await evaluate(`(() => { const e = document.querySelector('[name="${name}"]');
        Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
    };
    const noDialog = `!document.querySelector('[role="dialog"]')`;
    try {
      const db = initializeDatabase(app);
      const fixture = statusFixtures(db);
      const { records, services, history } = fixture;
      const before = history();
      const handlers = new Map();
      const mockIpc = { handle: (name, fn) => handlers.set(name, fn) };
      const guard = createSenderGuard(
        new Set([window.webContents]),
        pathToFileURL(path.join(__dirname, "../dist/index.html")).href,
      );
      registerCatalogIpc(mockIpc, services, guard);
      registerExpenseIpc(mockIpc, services, guard);
      registerSupplierIpc(mockIpc, services.suppliers, guard);
      registerCustomerIpc(mockIpc, services.customers, guard);
      const configurations = [
        [
          "expenseCategories",
          "expenses",
          "Expense Category",
          "expense category",
          "lookup-status",
          "lookup",
          "Manage Expense Categories",
        ],
        [
          "brands",
          "products",
          "Brand",
          "brand",
          "lookup-status",
          "lookup",
          "Manage Brands",
        ],
        [
          "categories",
          "products",
          "Category",
          "category",
          "lookup-status",
          "lookup",
          "Manage Categories",
        ],
        [
          "products",
          "products",
          "Product",
          "",
          "filter-status",
          "product",
          null,
        ],
        [
          "suppliers",
          "suppliers",
          "Supplier",
          "supplier",
          "supplier-status",
          "supplier",
          null,
        ],
        [
          "customers",
          "customers",
          "Customer",
          "customer",
          "customer-status",
          "customer",
          null,
        ],
      ];
      for (const [
        resource,
        route,
        singular,
        actionKind,
        filter,
        attribute,
        manager,
      ] of configurations) {
        const record = records[resource];
        const label = [actionKind, record.name || record.sku]
          .filter(Boolean)
          .join(" ");
        const row = `document.querySelector('[data-${attribute}-id="${record.id}"]')`;
        await evaluate(`location.hash = '/${route}'`);
        if (manager) await click(manager);
        await input(filter, "all");
        await wait(`${row}?.textContent.includes('Active')`);
        await click(`Deactivate ${label}`);
        await click(`Deactivate ${singular}`);
        await wait(`${row}?.textContent.includes('Inactive')`);
        assert.equal(
          services[resource].list({ active: false })[0].id,
          record.id,
        );
        await input(filter, "active");
        await wait(`!${row}`);
        await input(filter, "inactive");
        await wait(`${row}?.textContent.includes('Inactive')`);

        // A real SQLite failure must surface in the renderer and retain the inactive row.
        const table =
          resource === "expenseCategories" ? "expense_categories" : resource;
        db.exec(
          `CREATE TRIGGER activation_failure BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Injected activation failure'); END`,
        );
        await click(`Activate ${label}`);
        await wait(
          `Array.from(document.querySelectorAll('[role="alert"]')).some(e => e.textContent.includes('could not be completed'))`,
        );
        assert.equal(
          db.prepare(`SELECT active FROM ${table} WHERE id=?`).get(record.id)
            .active,
          0,
        );
        assert.ok(await evaluate(`${row}?.textContent.includes('Inactive')`));
        db.exec("DROP TRIGGER activation_failure");
        await click(`Activate ${label}`);
        await wait(`!${row}`); // It must leave the inactive filter immediately.
        await input(filter, "active");
        await wait(`${row}?.textContent.includes('Active')`);
        assert.equal(
          db.prepare(`SELECT active FROM ${table} WHERE id=?`).get(record.id)
            .active,
          1,
        );
        await input(filter, "all");
        await wait(`${row}?.textContent.includes('Active')`);

        // Exercise main-process argument counts, status restrictions and sender guards.
        const channel = `${["brands", "categories", "products"].includes(resource) ? "catalog:" : ""}${resource}:activate`;
        const event = {
          sender: window.webContents,
          senderFrame: window.webContents.mainFrame,
        };
        assert.equal(
          handlers.get(channel)(event, record.id, 2).error.code,
          "VALIDATION",
        );
        assert.equal(
          handlers.get(channel)({}, record.id).error.code,
          "FORBIDDEN",
        );
        for (const id of [-1, "1", 999999]) {
          const result = await evaluate(
            `window.api.${resource}.activate(${JSON.stringify(id)})`,
          );
          assert.equal(result.ok, false);
          assert.equal(
            result.error.code,
            id === 999999 ? "NOT_FOUND" : "VALIDATION",
          );
        }
        assert.deepEqual(history(), before);
        if (manager) {
          await click("Done");
          await wait(noDialog);
        }
        if (resource === "expenseCategories") {
          await click("Add Expense");
          await wait(
            `Array.from(document.querySelector('[name="expense-category"]').options).some(o => o.textContent === 'Clerk Salary')`,
          );
          await click("Cancel");
          await wait(noDialog);
          await click(`Edit expense ${fixture.expense.id}`);
          await wait(
            `document.querySelector('[name="expense-category"]')?.selectedOptions[0].textContent === 'Clerk Salary'`,
          );
          await click("Cancel");
          await wait(noDialog);
        }
        if (["brands", "categories"].includes(resource)) {
          await click("Add Product");
          const field = resource === "brands" ? "brand_id" : "category_id";
          await wait(
            `Array.from(document.querySelector('[name="${field}"]').options).some(o => o.textContent === ${JSON.stringify(record.name)})`,
          );
          await click("Cancel");
          await wait(noDialog);
        }
        console.log(
          `PASS: ${resource} UI 1→0→1, immediate badges/filters, failed activation/retry, validated IPC, preserved history and lookup refresh.`,
        );
      }
      await evaluate("location.hash = '/purchases'");
      await click("New Purchase");
      await wait(
        `Array.from(document.querySelector('[name="purchase-supplier"]').options).some(o => o.textContent === 'Status Supplier')`,
      );
      await click("Cancel");
      await wait(noDialog);
      await evaluate("location.hash = '/sales'");
      await click("New Sale");
      for (const [name, text] of [
        ["pos-customer", "Status Customer"],
        ["pos-product", "STATUS-TYRE"],
      ]) {
        await input(name, text);
        await evaluate(`document.querySelector('[name="${name}"]').focus()`);
        await wait(
          `Array.from(document.querySelectorAll('[role="option"]')).some(e => e.textContent.includes('${text}'))`,
        );
        await evaluate(
          `Array.from(document.querySelectorAll('[role="option"]')).find(e => e.textContent.includes('${text}')).click()`,
        );
      }
      await click("Cancel");
      await wait(noDialog);
      assert.deepEqual(history(), before);
      assert.deepEqual(db.pragma("foreign_key_check"), []);
      console.log(
        "PASS: reactivated supplier/customer/product selectable for new purchases and sales; all historical rows unchanged.",
      );
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});
require("../electron/main.cjs");
