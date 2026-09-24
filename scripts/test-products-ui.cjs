const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { createCatalogServices } = require('../electron/services/catalog.cjs');
const { registerCatalogIpc, createSenderGuard } = require('../electron/ipc/catalog.cjs');
const { pathToFileURL } = require('node:url');

if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:products:ui for an isolated database.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
let database;
let brand;
let category;
let otherBrand;
let otherCategory;
app.whenReady().then(() => {
  database = initializeDatabase(app);
  const services = createCatalogServices(database);
  brand = services.brands.create({ name: 'UI Test Brand' });
  category = services.categories.create({ name: 'UI Test Category' });
  otherBrand = services.brands.create({ name: 'Other UI Brand' });
  otherCategory = services.categories.create({ name: 'Other UI Category' });
}).catch((error) => { console.error(error); app.exit(1); });

const timeout = setTimeout(() => { console.error('FAIL: Products UI test timed out'); app.exit(1); }, 60000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('preload-error', (_event, _path, error) => { console.error(error); app.exit(1); });
  window.webContents.once('did-finish-load', async () => {
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
        const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(String(value))});
        element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
      })()`);
    };
    const settled = () => wait(`!document.querySelector('section')?.textContent.includes('Loading products…') && Boolean(document.querySelector('[name="search"]'))`);
    try {
      await evaluate('location.hash = "/products"');
      await wait(`document.querySelector('h1')?.textContent === 'Products / Tyres'`);
      await settled();
      await wait(`document.body.textContent.includes('No products found')`);
      await click('Add Product');
      await wait(`Boolean(document.querySelector('[name="sku"]'))`);
      await click('Create Product');
      await wait(`document.body.textContent.includes('SKU is required.')`);
      for (const [name, value] of Object.entries({ sku: 'UI-001', brand_id: brand.id, category_id: category.id, model: 'Road Comfort', size: '195/65 R15', pattern: 'Touring', tyre_type: 'Tubeless', price: '24500.50', minimum_stock: '3', notes: 'Renderer test only' })) await input(name, value);
      await click('Create Product');
      await wait(`!document.querySelector('[role="dialog"]') && document.querySelector('tbody')?.textContent.includes('UI-001')`);
      let product = database.prepare('SELECT * FROM products WHERE sku=?').get('UI-001');
      assert.equal(product.default_selling_price, 2450050);
      assert.equal(database.prepare('SELECT quantity FROM inventory WHERE product_id=?').get(product.id).quantity, 0);
      assert.ok(await evaluate(`document.querySelector('tbody').textContent.includes('Rs. 24,500.50')`));

      await click('Add Product');
      for (const [name, value] of Object.entries({ sku: 'ui-001', brand_id: brand.id, category_id: category.id, model: 'Duplicate', size: 'R15', price: '100' })) await input(name, value);
      await click('Create Product');
      await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('already exists')`);
      assert.equal(database.prepare('SELECT COUNT(*) AS n FROM products').get().n, 1);
      await click('Cancel');
      await wait(`!document.querySelector('[role="dialog"]')`);
      await click('Edit');
      await wait(`Boolean(document.querySelector('[name="sku"]'))`);
      await input('model', 'Road Comfort Plus');
      await input('price', '25000');
      await click('Save Changes');
      await wait(`!document.querySelector('[role="dialog"]') && document.querySelector('tbody')?.textContent.includes('Road Comfort Plus')`);
      assert.equal(database.prepare('SELECT default_selling_price FROM products WHERE id=?').get(product.id).default_selling_price, 2500000);
      for (const term of ['ui-001', 'UI Test Brand', 'Comfort Plus', '195/65']) {
        await input('search', term);
        await settled();
        assert.ok(await evaluate(`document.querySelector('tbody')?.textContent.includes('UI-001')`));
      }
      await input('search', 'No such tyre');
      await wait(`document.body.textContent.includes('No products found')`);
      await input('search', '');
      await input('filter-brand', otherBrand.id);
      await settled();
      await wait(`document.body.textContent.includes('No products found')`);
      await input('filter-brand', brand.id);
      await wait(`document.querySelector('tbody')?.textContent.includes('UI-001')`);
      await input('filter-category', otherCategory.id);
      await wait(`document.body.textContent.includes('No products found')`);
      await input('filter-category', category.id);
      await wait(`document.querySelector('tbody')?.textContent.includes('UI-001')`);
      await click('Deactivate');
      await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('Deactivate product?')`);
      await click('Cancel');
      await wait(`!document.querySelector('[role="dialog"]')`);
      assert.equal(database.prepare('SELECT active FROM products WHERE id=?').get(product.id).active, 1);
      await click('Deactivate');
      await click('Deactivate Product');
      await wait(`!document.querySelector('[role="dialog"]') && document.body.textContent.includes('No products found')`);
      await input('filter-status', 'inactive');
      await wait(`document.querySelector('tbody')?.textContent.includes('Inactive')`);
      assert.equal(database.prepare('SELECT active FROM products WHERE id=?').get(product.id).active, 0);
      assert.equal(database.prepare('SELECT quantity FROM inventory WHERE product_id=?').get(product.id).quantity, 0);
      await input('filter-status', 'all');
      await settled();
      assert.ok(await evaluate(`document.querySelector('tbody')?.textContent.includes('UI-001')`));

      // Controlled main-process failure exercises the rendered retry/error state.
      ipcMain.removeHandler('catalog:products:list');
      ipcMain.handle('catalog:products:list', async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { ok: false, error: { code: 'INTERNAL', message: 'Temporary test failure' } };
      });
      await input('search', 'Retry test');
      await wait(`document.querySelector('section')?.textContent.includes('Loading products…')`);
      await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Temporary test failure')`);
      // Restore production handlers, with the actual sender guard, before retrying.
      for (const [resource, methods] of Object.entries({ brands: ['list','create','update','deactivate'], categories: ['list','create','update','deactivate'], products: ['list','getById','create','update','deactivate'] })) {
        for (const method of methods) ipcMain.removeHandler(`catalog:${resource}:${method}`);
      }
      const url = process.argv.includes('--dev') ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
      registerCatalogIpc(ipcMain, createCatalogServices(database), createSenderGuard(new Set([window.webContents]), url));
      await click('Retry');
      await wait(`!document.querySelector('[role="alert"]')`);
      await click('Reset filters');
      await input('filter-status', 'all');
      await wait(`document.querySelector('tbody')?.textContent.includes('UI-001')`);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/products-ui.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(640, 480);
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      console.log('PASS: renderer create, edit, duplicate SKU, currency, zero stock, search, brand/category/status filters, empty/loading/error/retry states, deactivation cancel/confirm, narrow layout and isolated database.');
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error('FAIL:', error);
      fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../artifacts/products-ui-failure.png'), (await window.webContents.capturePage()).toPNG());
      app.exit(1);
    }
  });
});
require('../electron/main.cjs');
