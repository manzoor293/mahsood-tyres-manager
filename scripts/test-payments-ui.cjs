const {app,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {initializeDatabase}=require('../electron/database/index.cjs');
const {createPaymentServices}=require('../electron/services/payments.cjs');
const {registerPaymentIpc,paymentApiMethods}=require('../electron/ipc/payments.cjs');
const {createSenderGuard}=require('../electron/ipc/catalog.cjs');
const {seedPayments}=require('./payments-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw new Error('Temporary profile required.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const supplier=process.argv.includes('--supplier-payments'),resource=supplier?'supplierPayments':'customerPayments';
const contact=supplier?'supplier_id':'customer_id',invoice=supplier?'purchase_id':'sale_id';
const reference=supplier?'PUR-UNPAID':'SALE-UNPAID';
const timeout=setTimeout(()=>{console.error('Payments UI timeout');app.exit(1);},120000);
app.on('browser-window-created',(_,window)=>{
  const db=initializeDatabase(app),services=createPaymentServices(db,()=>new Date('2026-09-26T12:00:00')),service=services[resource];
  const guard=createSenderGuard(new Set([window.webContents]),pathToFileURL(path.join(__dirname,'../dist/index.html')).href);
  const handlers=new Map();registerPaymentIpc({handle:(name,fn)=>handlers.set(name,fn)},services,guard);
  let fail=false,submissions=0;
  for(const [name,handler]of handlers){ipcMain.removeHandler(name);ipcMain.handle(name,async(...args)=>{if(name===`${resource}:create`)submissions++;await new Promise((r)=>setTimeout(r,300));return fail&&name===`${resource}:list`?{ok:false,error:{code:'INTERNAL',message:'Temporary payment list failure'}}:handler(...args);});}
  window.webContents.once('did-finish-load',async()=>{
    const evaluate=(code)=>window.webContents.executeJavaScript(code);
    const wait=async(condition)=>{for(let i=0;i<180;i++){if(await evaluate(condition))return;await new Promise((r)=>setTimeout(r,50));}throw new Error(`Timed out: ${condition}`);};
    const click=async(label)=>{const selector=`Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled)`;await wait(`Boolean(${selector})`);await evaluate(`${selector}.click()`);};
    const input=async(name,value)=>{await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);};
    const ready=()=>wait(`Boolean(document.querySelector('[data-payment-page]'))`);
    async function apply(){await click('Apply filters');await wait(`document.body.textContent.includes('Loading payments...')`);await ready();}
    async function open(){await click(`Pay ${reference}`);await wait(`Boolean(document.querySelector('[data-payment-preview]'))`);}
    async function history(){await click('Payment history');await wait(`document.body.textContent.includes('Loading payments...')`);await ready();}
    try {
      await evaluate('location.hash="/payments"');await wait(`document.body.textContent.includes('Loading payments...')`);await ready();
      if(supplier){await click('Supplier Payments');await wait(`document.body.textContent.includes('Loading payments...')`);await ready();}
      assert.ok(await evaluate(`document.body.textContent.includes('No open invoices found.')`));
      const ids=seedPayments(db),id=supplier?ids.purchase:ids.sale;
      const protectedTables=['sales','purchases','sale_items','purchase_items','inventory','stock_movements'];
      const snapshot=()=>Object.fromEntries(protectedTables.map((table)=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));const before=snapshot();
      await click('Refresh');await wait(`document.querySelector('[data-payment-row]')?.textContent.includes(${JSON.stringify(reference)})`);
      const name=supplier?'Supplier One':'Customer One';await input(`report-${contact}`,name);await evaluate(`document.querySelector('[name="report-${contact}"]').focus()`);
      await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(e=>e.textContent.includes(${JSON.stringify(name)}))`);await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.includes(${JSON.stringify(name)})).click()`);await apply();
      assert.ok(await evaluate(`document.querySelector('[data-account-summary]').textContent.includes(${JSON.stringify(name)})`));
      await open();assert.ok(await evaluate(`document.querySelector('[data-payment-preview]').textContent.includes('OutstandingRs. 100')`));
      await input('payment-amount','0');await click('Record Payment');await wait(`document.body.textContent.includes('Enter a positive payment amount')`);assert.equal(submissions,0);
      await input('payment-amount','100.01');await click('Record Payment');await wait(`document.body.textContent.includes('Payment exceeds the current outstanding balance.')`);assert.equal(service.getOutstanding(id).balance,10000);
      await input('payment-amount','25.01');await input('payment-date','2026-09-26');await input('payment-notes','UI partial payment');
      assert.ok(await evaluate(`document.querySelector('[data-payment-preview]').textContent.includes('Remaining After PaymentRs. 74.99')`));
      const beforeSubmit=submissions;await click('Record Payment');await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Recording...'&&b.disabled)`);
      await evaluate(`document.querySelector('[role="dialog"] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
      await wait(`!document.querySelector('[role="dialog"]')&&document.querySelector('[data-payment-row]')?.textContent.includes('Rs. 74.99')`);assert.equal(submissions,beforeSubmit+1);assert.equal(service.getOutstanding(id).balance,7499);
      await history();assert.ok(await evaluate(`document.querySelector('table[aria-label="Payment history"]').textContent.includes('UI partial payment')`));
      await click('Open invoices');await ready();await open();await input('payment-amount','74.99');await input('payment-date','2026-09-26');
      service.create({[contact]:1,[invoice]:id,amount:100,payment_method:'Cash',paid_at:'2026-09-26',notes:'Other window'});
      await click('Record Payment');await wait(`document.body.textContent.includes('Payment exceeds the current outstanding balance.')`);await wait(`document.querySelector('[data-payment-preview]')?.textContent.includes('OutstandingRs. 73.99')`);
      await input('payment-amount','73.99');await input('payment-method','Bank transfer');await input('payment-notes','UI final settlement');await click('Record Payment');
      await wait(`!document.querySelector('[role="dialog"]')&&!document.querySelector('button[aria-label="Pay ${reference}"]')`);await ready();assert.equal(service.getOutstanding(id).balance,0);
      await history();await input('payment-search',reference);await apply();assert.equal(await evaluate('document.querySelectorAll("[data-payment-row]").length'),3);
      assert.ok(await evaluate(`document.querySelector('[data-payment-summary]').textContent.includes('Rs. 100')`));
      await input('payment-filter-method','Bank transfer');await input('payment-period','custom');await input('payment-from_date','2026-09-26');await input('payment-to_date','2026-09-26');await apply();assert.equal(await evaluate('document.querySelectorAll("[data-payment-row]").length'),1);assert.ok(await evaluate(`document.querySelector('[data-payment-row]').textContent.includes('UI final settlement')`));
      await input('payment-search','missing');await apply();assert.ok(await evaluate(`document.body.textContent.includes('No payments found.')`));
      await click('Reset filters');await wait(`document.body.textContent.includes('Loading payments...')`);await ready();
      if(!supplier){assert.equal(await evaluate('document.querySelectorAll("[data-payment-row]").length'),25);await click('Next');await wait(`document.querySelector('[data-payment-page]')?.textContent.includes('Page 2')`);}
      await click('Open invoices');await wait(`document.body.textContent.includes('Loading payments...')`);await ready();fail=true;await click('Refresh');await wait(`document.body.textContent.includes('Temporary payment list failure')`);fail=false;await click('Retry');await ready();
      assert.deepEqual(snapshot(),before);assert.deepEqual(await evaluate(`Object.keys(window.api.${resource}).sort()`),Object.keys(paymentApiMethods).sort());
      const integration=await evaluate(`(async()=>{const details=await window.api.${supplier?'purchases':'sales'}.getById(${id});const dashboard=await window.api.dashboard.getOverview({period:'custom',from_date:'2026-09-01',to_date:'2026-09-30'});const report=await window.api.reports.${supplier?'getPayables':'getReceivables'}();return {details,dashboard,report};})()`);
      assert.equal(integration.details.data.balance,0);assert.equal(integration.details.data.total,10000);assert.equal(integration.dashboard.data.summary[supplier?'supplierPayables':'customerReceivables'],supplier?105000:4400);assert.equal(integration.report.data.summary.outstanding,supplier?105000:3900);
      assert.equal(await evaluate('typeof window.require'),'undefined');assert.equal(window.webContents.getLastWebPreferences().contextIsolation,true);assert.equal(window.webContents.getLastWebPreferences().nodeIntegration,false);
      await new Promise((r)=>setTimeout(r,250));fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,`../artifacts/${resource}-ui.png`),(await window.webContents.capturePage()).toPNG());
      window.setSize(640,480);await new Promise((r)=>setTimeout(r,250));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      console.log(`PASS: ${resource} real UI/preload/IPC selection, fresh balance, validation/overpayment, partial/final/stale payments, duplicate-submit prevention, history/filtering/paging, account totals, empty/loading/retry, protected data, cross-module balances and narrow layout.`);clearTimeout(timeout);app.quit();
    }catch(error){console.error(error);fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,`../artifacts/${resource}-failure.png`),(await window.webContents.capturePage()).toPNG());app.exit(1);}
  });
});
require('../electron/main.cjs');
