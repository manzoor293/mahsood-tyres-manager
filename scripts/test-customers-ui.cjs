const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createCustomerService } = require('../electron/services/customers.cjs');
const { registerCustomerIpc } = require('../electron/ipc/customers.cjs');
const { createSenderGuard } = require('../electron/ipc/catalog.cjs');

if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:customers:ui for an isolated database.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => { console.error('FAIL: Customer UI test timed out'); app.exit(1); }, 60000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    const database = initializeDatabase(app);
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (await evaluate(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`UI condition timed out: ${condition}`);
    };
    const click = async (label) => {
      const selector = `Array.from(document.querySelectorAll('button')).find(b => (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)}) && !b.disabled)`;
      await wait(`Boolean(${selector})`); await evaluate(`${selector}.click()`);
    };
    const input = async (name, value) => {
      await evaluate(`(() => {
        const element=document.querySelector('[name="${name}"]');
        const prototype=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(String(value))});
        element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));
      })()`);
    };
    const noDialogs = `!document.querySelector('[role="dialog"]')`;
    const rowText = `document.querySelector('[data-customer-id]')?.textContent`;
    let unregister;
    const restore = () => {
      for (const method of ['list', 'getById', 'create', 'update', 'deactivate']) ipcMain.removeHandler(`customers:${method}`);
      const url = process.argv.includes('--dev') ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
      unregister = registerCustomerIpc(ipcMain, createCustomerService(database), createSenderGuard(new Set([window.webContents]), url));
    };
    try {
      await evaluate('location.hash="/customers"');
      await wait(`document.querySelector('h1')?.textContent==='Customers'`);
      await wait(`document.body.textContent.includes('No customers found')`);
      await click('Add Customer');
      await click('Create Customer');
      await wait(`document.body.textContent.includes('Customer name is required.')`);
      await input('customer-name', ' UI Customer ');
      await input('customer-phone', 'abc');
      await click('Create Customer');
      await wait(`document.body.textContent.includes('Enter 7 to 15 digits')`);
      await input('customer-phone', '+92 (300) 123-4567');
      await input('customer-address', ' Lahore ');
      await input('customer-notes', ' Test only ');
      // A main-process validation response must remain visible in the form.
      ipcMain.removeHandler('customers:create');
      ipcMain.handle('customers:create', () => ({ ok: false, error: { code: 'VALIDATION', message: 'Customer test validation error' } }));
      await click('Create Customer');
      await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Customer test validation error')`);
      assert.equal(database.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 0);
      restore();
      await click('Create Customer');
      await wait(`${noDialogs} && ${rowText}?.includes('UI Customer')`);
      const customer = database.prepare('SELECT * FROM customers').get();
      assert.equal(customer.name, 'UI Customer'); assert.equal(customer.phone, '+923001234567'); assert.equal(customer.address, 'Lahore');
      await click('Edit customer UI Customer');
      await wait(`Boolean(document.querySelector('[name="customer-name"]'))`);
      await input('customer-name', 'UI Updated'); await input('customer-notes', 'Updated notes');
      await click('Save Customer');
      await wait(`${noDialogs} && ${rowText}?.includes('UI Updated')`);
      assert.equal(database.prepare('SELECT notes FROM customers').get().notes, 'Updated notes');
      await click('View customer UI Updated');
      await wait(`document.querySelector('#customer-details-title')?.textContent==='Customer details'`);
      assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Updated notes')`));
      assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Created')`));
      await click('Close'); await wait(noDialogs);
      for (const search of ['UPDATED', '300123', 'lahore']) {
        await input('customer-search', search);
        await wait(`!document.querySelector('section').textContent.includes('Loading customers…') && ${rowText}?.includes('UI Updated')`);
      }
      await input('customer-search', 'Missing customer');
      await wait(`document.body.textContent.includes('No customers found')`);
      await click('Reset filters');
      await wait(`${rowText}?.includes('UI Updated')`);
      await click('Deactivate customer UI Updated'); await click('Cancel');
      await wait(noDialogs);
      assert.equal(database.prepare('SELECT active FROM customers').get().active, 1);
      await click('Deactivate customer UI Updated'); await click('Deactivate Customer');
      await wait(`${noDialogs} && document.body.textContent.includes('No customers found')`);
      await input('customer-status', 'inactive'); await wait(`${rowText}?.includes('Inactive')`);
      assert.equal(database.prepare('SELECT active FROM customers').get().active, 0);
      await click('View customer UI Updated');
      await wait(`document.querySelector('#customer-details-title')?.textContent==='Customer details'`);
      assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Inactive')`));
      await click('Close'); await wait(noDialogs);
      await click('Edit customer UI Updated');
      await wait(`Boolean(document.querySelector('[name="customer-name"]'))`);
      await input('customer-notes', 'Inactive contact retained'); await click('Save Customer'); await wait(noDialogs);
      assert.equal(database.prepare('SELECT active FROM customers').get().active, 0);
      assert.equal(database.prepare('SELECT notes FROM customers').get().notes, 'Inactive contact retained');
      await input('customer-status', 'all'); await wait(`${rowText}?.includes('UI Updated')`);
      assert.equal(database.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 1);
      ipcMain.removeHandler('customers:list');
      ipcMain.handle('customers:list', async () => { await new Promise((resolve) => setTimeout(resolve, 300)); return { ok: false, error: { code: 'INTERNAL', message: 'Temporary customer list failure' } }; });
      await input('customer-search', 'Retry');
      await wait(`document.querySelector('section').textContent.includes('Loading customers…')`);
      await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Temporary customer list failure')`);
      restore(); await click('Retry');
      await wait(`!document.querySelector('[role="alert"]')`);
      await input('customer-search', '');
      await wait(`${rowText}?.includes('UI Updated')`);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/customers-ui.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(640, 480); await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      assert.deepEqual(database.pragma('foreign_key_check'), []);
      console.log('PASS: customer renderer create/edit/search/status, phone feedback/normalization, backend error feedback, deactivation cancel/confirm, loading/empty/error/retry states and narrow layout.');
      clearTimeout(timeout); unregister?.(); app.quit();
    } catch (error) {
      console.error('FAIL:', error);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/customers-ui-failure.png'), (await window.webContents.capturePage()).toPNG());
      app.exit(1);
    }
  });
});
require('../electron/main.cjs');
