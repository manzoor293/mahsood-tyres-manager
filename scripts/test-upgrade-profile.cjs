const { app } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root || !path.basename(root).startsWith('mahsood-release-data-')) throw Error('Isolated release audit parent required');
app.setPath('userData', path.join(root, 'tagged-profile'));
app.setPath('sessionData', path.join(root, 'tagged-profile'));
const timeout = setTimeout(() => { console.error('Tagged profile upgrade UI timeout'); app.exit(1); }, 30000);
app.on('browser-window-created', (_, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const evaluate = code => window.webContents.executeJavaScript(code);
      const status = await evaluate('window.api.auth.getStatus()');
      assert.deepEqual(status.data, { hasAdministrator: true, authenticated: false });
      assert.equal((await evaluate('window.api.sales.list()')).error.code, 'UNAUTHENTICATED');
      const login = await evaluate("window.api.auth.login({email:'release@example.test',password:'Isolated-Audit-2026!'})");
      assert.equal(login.ok, true);
      const purchase = (await evaluate('window.api.purchases.getById(1)')).data;
      assert.equal(purchase.items[0].units_per_transaction_unit, 1);
      assert.equal(purchase.shipment_cost, 0);
      assert.equal(purchase.items[0].allocated_shipment_cost, 0);
      assert.equal(purchase.effective_total, 114000);
      const sale = (await evaluate('window.api.sales.getById(1)')).data;
      assert.equal(sale.items[0].units_per_transaction_unit, 1);
      assert.equal(sale.effective_total, 70000);
      assert.equal(sale.credit_due, 9999);
      assert.equal((await evaluate('window.api.inventory.getProductStock(1)')).data.quantity, 5);
      assert.equal((await evaluate("window.api.printing.preview('purchaseInvoice',1)")).ok, true);
      assert.equal(window.webContents.getLastWebPreferences().contextIsolation, true);
      assert.equal(window.webContents.getLastWebPreferences().nodeIntegration, false);
      console.log('PASS tagged v0.1.0 profile: real application automatic migration, restored login, protected IPC, legacy units, exact returns/credits/stock and invoice preview');
      clearTimeout(timeout);
      app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require('../electron/main.cjs');
