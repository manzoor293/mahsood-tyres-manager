const {app,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {initializeDatabase}=require('../electron/database/index.cjs');
const {createReturnServices}=require('../electron/services/returns.cjs');
const {registerReturnIpc}=require('../electron/ipc/returns.cjs');
const {createSenderGuard}=require('../electron/ipc/catalog.cjs');
const {seedReturns}=require('./returns-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw Error('Temporary profile required');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const purchase=process.argv.includes('--purchase-returns'),kind=purchase?'purchase':'sale',resource=purchase?'purchaseReturns':'saleReturns';
const reference=purchase?'PUR-RETURN':'SALE-RETURN';
const timeout=setTimeout(()=>{console.error('Return UI timeout');app.exit(1);},120000);
app.on('browser-window-created',(_,window)=>{
  const db=initializeDatabase(app),services=createReturnServices(db),service=services[resource],handlers=new Map();let fail=false,submissions=0;
  registerReturnIpc({handle:(name,fn)=>handlers.set(name,fn)},services,createSenderGuard(new Set([window.webContents]),pathToFileURL(path.join(__dirname,'../dist/index.html')).href));
  for(const [name,fn] of handlers){ipcMain.removeHandler(name);ipcMain.handle(name,async(...args)=>{if(name===`${resource}:create`)submissions++;await new Promise(r=>setTimeout(r,250));return fail&&name===`${resource}:list`?{ok:false,error:{code:'INTERNAL',message:'Temporary return history failure'}}:fn(...args);});}
  window.webContents.once('did-finish-load',async()=>{
    const evaluate=(code)=>window.webContents.executeJavaScript(code);
    const wait=async(condition)=>{for(let i=0;i<180;i++){if(await evaluate(condition))return;await new Promise(r=>setTimeout(r,50));}throw Error(`Timed out: ${condition}`);};
    const click=async(label)=>{const selector=`Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled)`;await wait(`Boolean(${selector})`);await evaluate(`${selector}.click()`);};
    const input=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const ready=()=>wait(`Boolean(document.querySelector('[data-returns-ready]'))`);
    const open=async()=>{await click(`Return ${reference}`);await wait(`Boolean(document.querySelector('[data-return-preview]'))`);};
    try{
      await evaluate('location.hash="/returns"');await ready();if(purchase){await click('Purchase Returns');await ready();}
      assert.ok(await evaluate(`document.body.textContent.includes('No invoices found.')`));
      await click('Return history');await wait(`document.body.textContent.includes('Loading returns...')`);await ready();assert.ok(await evaluate(`document.body.textContent.includes('No returns found.')`));
      seedReturns(db);await click('Select invoice');await ready();await open();
      assert.equal(await evaluate(`document.querySelectorAll('[data-return-item]').length`),2);
      await click('Review Return');await wait(`document.body.textContent.includes('Choose a positive whole quantity')`);assert.equal(submissions,0);
      await input('return-quantity-1','99');await click('Review Return');await wait(`document.body.textContent.includes('Quantity exceeds remaining returnable quantity.')`);assert.equal(submissions,0);
      if(purchase){await input('return-quantity-1','6');await click('Review Return');await click('Confirm Return');await wait(`document.body.textContent.includes('Insufficient current stock')`);}
      await input('return-quantity-1','1');await input('return-date','2026-09-26');await input('return-notes','UI returned tyre');await click('Review Return');
      const count=submissions;await click('Confirm Return');await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Recording...'&&b.disabled)`);await evaluate(`document.querySelector('[role="dialog"] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
      await wait(`!document.querySelector('[role="dialog"]')`);await ready();assert.equal(submissions,count+1);
      assert.ok(await evaluate(`document.querySelector('table[aria-label="Return history"]').textContent.includes('UI returned tyre')`));
      await click('Details');await wait(`Boolean(document.querySelector('table[aria-label="Return details"]'))`);assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Read-only return document')`));await click('Close');
      await click('Select invoice');await ready();await open();const facts=service[purchase?'getReturnablePurchase':'getReturnableSale'](1);assert.equal(facts.items[0].returned_quantity,1);
      // Competing write after UI read: reject over-return and refresh the displayed facts.
      if(purchase)db.exec("INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost) VALUES(1,'ADJUSTMENT_IN',5,6000)");
      await input('return-quantity-1',String(facts.items[0].returnable_quantity));
      service.create({[`${kind}_id`]:1,returned_at:'2026-09-26',items:[{[`${kind}_item_id`]:1,quantity:1}]});
      await click('Review Return');await click('Confirm Return');await wait(`document.body.textContent.includes('Quantity exceeds remaining returnable quantity. Refresh the invoice.')`);await click('Cancel');
      await click('Return history');await ready();fail=true;await click('Refresh');await wait(`document.body.textContent.includes('Temporary return history failure')`);fail=false;await click('Retry');await ready();
      const integration=await evaluate(`(async()=>({details:await window.api.${purchase?'purchases':'sales'}.getById(1),payments:await window.api.${purchase?'supplierPayments':'customerPayments'}.getOutstanding(1),report:await window.api.reports.${purchase?'getPayables':'getReceivables'}(),dashboard:await window.api.dashboard.getOverview({period:'custom',from_date:'2026-09-01',to_date:'2026-09-30'})}))()`);
      const expected=service[purchase?'getReturnablePurchase':'getReturnableSale'](1).credit_due;
      assert.equal(integration.details.data.credit_due,expected);assert.equal(integration.payments.data.credit_due,expected);assert.equal(integration.report.data.summary.credit_due,expected);assert.equal(integration.dashboard.data.summary[purchase?'supplierCreditDue':'customerCreditDue'],expected);
      assert.deepEqual(await evaluate(`Object.keys(window.api.${resource}).sort()`),['create','getById',purchase?'getReturnablePurchase':'getReturnableSale','list'].sort());
      assert.equal(await evaluate('typeof window.require'),'undefined');assert.equal(window.webContents.getLastWebPreferences().contextIsolation,true);
      window.setSize(640,480);await new Promise(r=>setTimeout(r,250));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      await click('Select invoice');await ready();await open();assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,`../artifacts/${resource}-ui.png`),(await window.webContents.capturePage()).toPNG());
      console.log(`PASS ${resource} UI: renderer/preload/IPC invoice selection, returnable quantities, partial return, validation, stock shortage, duplicate-submit guard, stale quantity refresh, history/details, empty/loading/error/retry, cross-module credits and narrow page/dialog.`);clearTimeout(timeout);app.quit();
    }catch(error){console.error(error);app.exit(1);}
  });
});
require('../electron/main.cjs');
