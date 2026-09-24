const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createCatalogServices } = require('../electron/services/catalog.cjs');
const { registerCatalogIpc, createSenderGuard } = require('../electron/ipc/catalog.cjs');

if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:lookups:ui for an isolated database.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => { console.error('FAIL: Lookup UI test timed out'); app.exit(1); }, 60000);
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
      await wait(`Boolean(${selector})`);
      await evaluate(`${selector}.click()`);
    };
    const input = async (name, value) => {
      await evaluate(`(() => {
        const element = document.querySelector('[name="${name}"]');
        const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(String(value))});
        element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
      })()`);
    };
    const managerText = `document.querySelector('[aria-labelledby="lookup-manager-title"]')?.textContent`;
    const noDialogs = `!document.querySelector('[role="dialog"]')`;
    async function checkOption(field, name, present = true) {
      await click('Add Product');
      await wait(`Boolean(document.querySelector('[name="${field}"]'))`);
      assert.equal(await evaluate(`Array.from(document.querySelector('[name="${field}"]').options).some(o => o.textContent === ${JSON.stringify(name)})`), present);
      await click('Cancel');
      await wait(noDialogs);
    }
    try {
      await evaluate('location.hash = "/products"');
      await wait(`document.querySelector('h1')?.textContent === 'Products / Tyres'`);
      const records = {};
      for (const [resource, singular, plural, field] of [['brands', 'Brand', 'Brands', 'brand_id'], ['categories', 'Category', 'Categories', 'category_id']]) {
        await click(`Manage ${plural}`);
        await wait(`${managerText}?.includes('No ${resource} found')`);
        await click(`Add ${singular}`);
        await wait(`${managerText}?.includes('Enter a name between')`);
        await input('lookup-name', `UI ${singular}`);
        await click(`Add ${singular}`);
        await wait(`${managerText}?.includes('${singular} added.') && Boolean(document.querySelector('[data-lookup-id]'))`);
        const row = database.prepare(`SELECT * FROM ${resource} WHERE name=?`).get(`UI ${singular}`);
        assert.equal(row.active, 1);
        records[resource] = row;
        await click('Done');
        await wait(noDialogs);
        await checkOption(field, `UI ${singular}`);

        await click(`Manage ${plural}`);
        await wait(`Boolean(document.querySelector('[data-lookup-id]'))`);
        await input('lookup-name', `ui ${singular.toLowerCase()}`);
        await click(`Add ${singular}`);
        await wait(`${managerText}?.includes('already exists')`);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM ${resource}`).get().n, 1);
        await click(`Edit ${singular.toLowerCase()} UI ${singular}`);
        await input('lookup-name', `Renamed ${singular}`);
        await click(`Save ${singular}`);
        await wait(`${managerText}?.includes('${singular} updated.') && document.querySelector('[data-lookup-id]')?.textContent.includes('Renamed ${singular}')`);
        assert.equal(database.prepare(`SELECT name FROM ${resource} WHERE id=?`).get(row.id).name, `Renamed ${singular}`);
        await click('Done');
        await wait(noDialogs);
        await checkOption(field, `Renamed ${singular}`);
        assert.ok(await evaluate(`document.querySelector('[name="filter-${resource === 'brands' ? 'brand' : 'category'}"]').textContent.includes('Renamed ${singular}')`));
      }
      // The fixture product exists only in the runner's temporary userData database.
      const created = await evaluate(`window.api.products.create({sku:'LINK-TEST',brand_id:${records.brands.id},category_id:${records.categories.id},model:'Temporary',size:'R15'})`);
      assert.equal(created.ok, true);
      for (const [resource, singular, plural, field] of [['brands', 'Brand', 'Brands', 'brand_id'], ['categories', 'Category', 'Categories', 'category_id']]) {
        await click(`Manage ${plural}`);
        await wait(`Boolean(document.querySelector('[data-lookup-id]'))`);
        await click(`Deactivate ${singular.toLowerCase()} Renamed ${singular}`);
        await wait(`Boolean(document.querySelector('[aria-labelledby="lookup-confirm-title"]'))`);
        await click('Cancel');
        await wait(`!document.querySelector('[aria-labelledby="lookup-confirm-title"]')`);
        assert.equal(database.prepare(`SELECT active FROM ${resource} WHERE id=?`).get(records[resource].id).active, 1);
        await click(`Deactivate ${singular.toLowerCase()} Renamed ${singular}`);
        await click(`Deactivate ${singular}`);
        await wait(`${managerText}?.includes('${singular} deactivated.') && document.querySelector('[data-lookup-id]')?.textContent.includes('Inactive')`);
        assert.equal(database.prepare(`SELECT active FROM ${resource} WHERE id=?`).get(records[resource].id).active, 0);
        await input('lookup-status', 'active');
        await wait(`${managerText}?.includes('No ${resource} found')`);
        await input('lookup-status', 'inactive');
        await wait(`document.querySelector('[data-lookup-id]')?.textContent.includes('Inactive')`);
        // Inactive rows remain editable; editing must not reactivate them.
        await click(`Edit ${singular.toLowerCase()} Renamed ${singular}`);
        await input('lookup-name', `Archived ${singular}`);
        await click(`Save ${singular}`);
        await wait(`document.querySelector('[data-lookup-id]')?.textContent.includes('Archived ${singular}')`);
        assert.equal(database.prepare(`SELECT active FROM ${resource} WHERE id=?`).get(records[resource].id).active, 0);
        await click('Done');
        await wait(noDialogs);
        await checkOption(field, `Archived ${singular}`, false);
        assert.equal(database.prepare(`SELECT ${field} AS link FROM products WHERE id=?`).get(created.data.id).link, records[resource].id);
      }
      await wait(`Boolean(document.querySelector('[data-product-id]'))`);
      await click('Edit LINK-TEST');
      await wait(`Boolean(document.querySelector('[name="brand_id"]'))`);
      assert.ok(await evaluate(`document.querySelector('[name="brand_id"]').selectedOptions[0].textContent === 'Archived Brand (inactive)'`));
      assert.ok(await evaluate(`document.querySelector('[name="category_id"]').selectedOptions[0].textContent === 'Archived Category (inactive)'`));
      await click('Cancel');
      await wait(noDialogs);

      ipcMain.removeHandler('catalog:brands:list');
      ipcMain.handle('catalog:brands:list', async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { ok: false, error: { code: 'INTERNAL', message: 'Temporary lookup test failure' } };
      });
      await click('Manage Brands');
      await wait(`${managerText}?.includes('Loading brands')`);
      await wait(`${managerText}?.includes('Temporary lookup test failure')`);
      for (const [resource, methods] of Object.entries({ brands: ['list','create','update','deactivate'], categories: ['list','create','update','deactivate'], products: ['list','getById','create','update','deactivate'] })) {
        for (const method of methods) ipcMain.removeHandler(`catalog:${resource}:${method}`);
      }
      const url = process.argv.includes('--dev') ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
      registerCatalogIpc(ipcMain, createCatalogServices(database), createSenderGuard(new Set([window.webContents]), url));
      await click('Retry list');
      await wait(`document.querySelector('[data-lookup-id]')?.textContent.includes('Archived Brand')`);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/lookups-ui.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(640, 480);
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      assert.deepEqual(database.pragma('foreign_key_check'), []);
      console.log('PASS: Brand and Category UI add/edit/duplicate validation, cancel/confirm deactivation, status filters, inactive editing, live product options, retained product links, loading/empty/success/error/retry states, narrow layout.');
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error('FAIL:', error);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/lookups-ui-failure.png'), (await window.webContents.capturePage()).toPNG());
      app.exit(1);
    }
  });
});
require('../electron/main.cjs');
