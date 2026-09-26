const {app,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {initializeDatabase}=require('../electron/database/index.cjs');
const {createReportsService,methods}=require('../electron/services/reports.cjs');
const {registerReportsIpc}=require('../electron/ipc/reports.cjs');
const {createSenderGuard}=require('../electron/ipc/catalog.cjs');
const {seedReports}=require('./reports-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw new Error('Temporary profile required.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const timeout=setTimeout(()=>{console.error('Reports UI timeout');app.exit(1);},120000);
app.on('browser-window-created',(_,window)=>{
  const db=initializeDatabase(app),service=createReportsService(db,()=>new Date('2026-09-26T12:00:00'));
  const guard=createSenderGuard(new Set([window.webContents]),pathToFileURL(path.join(__dirname,'../dist/index.html')).href);
  const handlers=new Map();registerReportsIpc({handle:(name,fn)=>handlers.set(name,fn)},service,guard);
  let fail=false;const called=new Set();
  for(const [name,handler]of handlers){ipcMain.removeHandler(name);ipcMain.handle(name,async(...args)=>{called.add(name);await new Promise((r)=>setTimeout(r,250));return fail?{ok:false,error:{code:'INTERNAL',message:'Temporary report failure'}}:handler(...args);});}
  window.webContents.once('did-finish-load',async()=>{
    const evaluate=(code)=>window.webContents.executeJavaScript(code);
    const wait=async(condition)=>{for(let i=0;i<160;i++){if(await evaluate(condition))return;await new Promise((r)=>setTimeout(r,50));}throw new Error(`Timed out: ${condition}`);};
    const click=async(label)=>{const selector=`Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled)`;await wait(`Boolean(${selector})`);await evaluate(`${selector}.click()`);};
    const input=async(name,value)=>{await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);};
    const ready=()=>wait(`Boolean(document.querySelector('[data-report-page]'))`);
    const metric=(key,value)=>`document.querySelector('[data-report-metric="${key}"]')?.textContent.includes(${JSON.stringify(value)})`;
    async function apply(){await click('Apply filters');await wait(`document.body.textContent.includes('Loading report...')`);await ready();}
    async function reset(){await click('Reset filters');await wait(`document.body.textContent.includes('Loading report...')`);await ready();}
    async function report(type){await input('report-type',type);await wait(`document.body.textContent.includes('Loading report...')`);await ready();}
    async function lookup(field,label){await input(`report-${field}`,label);await evaluate(`document.querySelector('[name="report-${field}"]').focus()`);await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(e=>e.textContent.includes(${JSON.stringify(label)}))`);await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.includes(${JSON.stringify(label)})).click()`);}
    try {
      await evaluate('location.hash="/reports"');await wait(`document.body.textContent.includes('Loading report...')`);await ready();assert.ok(await evaluate(`document.body.textContent.includes('No matching records.')`));
      seedReports(db);const before=db.serialize();await click('Refresh');await wait(metric('total','Rs. 329.27'));
      assert.equal(await evaluate('document.querySelectorAll("[data-report-row]").length'),25);
      assert.ok(await evaluate(metric('paid','Rs. 290.27')));assert.ok(await evaluate(metric('outstanding','Rs. 39')));
      await click('Next');await wait(`document.querySelector('[data-report-page]')?.textContent.includes('Page 2 of 2')`);assert.equal(await evaluate('document.querySelectorAll("[data-report-row]").length'),3);assert.ok(await evaluate(metric('total','Rs. 329.27')));
      await input('report-search','sale-open');await apply();assert.equal(await evaluate('document.querySelectorAll("[data-report-row]").length'),1);
      await click('View sale SALE-OPEN');await wait(`Boolean(document.querySelector('[role="dialog"]'))`);assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Unit cost (internal)')`));assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Rs. 10.01')`));await click('Close');
      await reset();await lookup('customer_id','Customer One');await apply();assert.ok(await evaluate(metric('rowCount','1')));
      await reset();await input('report-payment_method','Bank transfer');await input('report-payment_status','paid');await apply();assert.ok(await evaluate(metric('rowCount','27')));
      await reset();await input('report-period','today');await apply();assert.ok(await evaluate(`document.body.textContent.includes('No matching records.')`));
      await input('report-period','week');await apply();assert.ok(await evaluate(`document.querySelector('[data-report-range]').textContent.includes('2026-09-20')`));
      await input('report-period','year');await apply();assert.ok(await evaluate(metric('rowCount','28')));
      await input('report-period','custom');await input('report-from_date','2026-09-02');await input('report-to_date','2026-09-02');await apply();assert.ok(await evaluate(metric('total','Rs. 59')));
      await input('report-from_date','2026-10-01');await click('Apply filters');await wait(`document.body.textContent.includes('From date must not follow To date.')`);await reset();
      fail=true;await click('Refresh');await wait(`document.body.textContent.includes('Temporary report failure')`);fail=false;await click('Retry');await wait(metric('total','Rs. 329.27'));
      await report('purchases');assert.ok(await evaluate(metric('total','Rs. 1,100')));assert.ok(await evaluate(metric('outstanding','Rs. 1,050')));
      await lookup('supplier_id','Supplier Two');await apply();assert.ok(await evaluate(`document.body.textContent.includes('No matching records.')`));
      await report('inventory');assert.ok(await evaluate(metric('stockUnits','76')));assert.equal(await evaluate(`document.querySelector('[name="report-period"]')===null`),true);
      await lookup('brand_id','Brand One');await lookup('category_id','Car');await input('report-stock_status','out');await apply();assert.equal(await evaluate('document.querySelectorAll("[data-report-row]").length'),1);assert.ok(await evaluate(`document.querySelector('[data-report-row]').textContent.includes('Empty')`));
      await reset();await input('report-active','false');await apply();assert.ok(await evaluate(metric('stockUnits','9')));
      await report('movements');await lookup('product_id','Unknown');await input('report-movement_type','ADJUSTMENT_IN');await apply();assert.ok(await evaluate(metric('unitsIn','2')));assert.equal(await evaluate('document.querySelectorAll("[data-report-row]").length'),1);
      await report('expenses');assert.ok(await evaluate(metric('expenses','Rs. 3.03')));await lookup('expense_category_id','Utilities');await apply();assert.ok(await evaluate(`document.body.textContent.includes('No matching records.')`));
      await report('profit');assert.ok(await evaluate(metric('grossProfit','Rs. 18.98')));assert.ok(await evaluate(metric('operatingResult','Rs. 15.95')));
      await input('report-period','custom');await input('report-from_date','2026-10-01');await input('report-to_date','2026-10-31');await apply();assert.ok(await evaluate(metric('grossProfit','Incomplete')));assert.ok(await evaluate(metric('operatingResult','Incomplete')));assert.ok(await evaluate(`document.body.textContent.includes('1 zero/unknown-cost items across 1 sales')`));
      await report('receivables');assert.ok(await evaluate(metric('outstanding','Rs. 39')));assert.ok(await evaluate(`document.body.textContent.includes('Excluded walk-in balance across all dates: Rs. 5')`));assert.ok(await evaluate(`document.querySelector('[data-report-row]').textContent.includes('Customer One')`));
      await input('report-search','Paid Customer');await apply();assert.ok(await evaluate(`document.body.textContent.includes('No matching records.')`));
      await report('payables');assert.ok(await evaluate(metric('outstanding','Rs. 1,050')));assert.ok(await evaluate(`document.querySelector('[data-report-row]').textContent.includes('Supplier One')`));
      assert.equal(called.size,8);assert.deepEqual(await evaluate('Object.keys(window.api.reports).sort()'),methods.slice().sort());assert.deepEqual(db.serialize(),before,'Report UI must not mutate records');
      assert.equal(await evaluate('typeof window.require'),'undefined');assert.equal(window.webContents.getLastWebPreferences().contextIsolation,true);assert.equal(window.webContents.getLastWebPreferences().nodeIntegration,false);
      await report('sales');await new Promise((r)=>setTimeout(r,250));fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/reports-ui.png'),(await window.webContents.capturePage()).toPNG());
      window.setSize(640,480);await new Promise((r)=>setTimeout(r,250));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);fs.writeFileSync(path.join(__dirname,'../artifacts/reports-narrow.png'),(await window.webContents.capturePage()).toPNG());
      console.log('PASS: Reports real UI/preload/IPC all eight reports, lookups/filters/dates, complete totals across pages, internal sale items, profit unknown-cost warning, open accounts, loading/empty/error/retry, read-only data and narrow layout.');clearTimeout(timeout);app.quit();
    }catch(error){console.error(error);fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/reports-failure.png'),(await window.webContents.capturePage()).toPNG());app.exit(1);}
  });
});
require('../electron/main.cjs');
