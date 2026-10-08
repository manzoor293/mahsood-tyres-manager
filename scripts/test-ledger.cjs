const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { openDatabase } = require('../electron/database/index.cjs');
const { createLedgerService } = require('../electron/services/ledger.cjs');
const { createLedgerPrintingService } = require('../electron/services/ledger-printing.cjs');
const { createPrintDriver } = require('../electron/printing/driver.cjs');
const { registerLedgerIpc } = require('../electron/ipc/ledger.cjs');
const { createAuthorizedIpc } = require('../electron/ipc/auth.cjs');
const { createReturnServices } = require('../electron/services/returns.cjs');
const { createPaymentServices } = require('../electron/services/payments.cjs');
const { seedPrinting } = require('./printing-fixtures.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw Error('Temporary profile required');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(()=>app.exit(1),120000);
app.whenReady().then(async()=>{
  let db,owner,code=0;
  try {
    db=openDatabase(path.join(process.env.MAHSOOD_UI_TEST_DATA,'ledger.sqlite3'));seedPrinting(db);
    db.exec("INSERT INTO customers(id,name) VALUES(2,'Empty customer'); INSERT INTO suppliers(id,name) VALUES(2,'Empty supplier'); UPDATE customers SET active=0 WHERE id=1; UPDATE suppliers SET active=0 WHERE id=1;");
    const ledger=createLedgerService(db);
    for (const party_type of ['customer','supplier']) {
      const q={party_type,party_id:1}, read=extra=>ledger.getStatement({...q,...extra});
      const empty=ledger.getStatement({party_type,party_id:2});assert.equal(empty.totalRows,0);assert.equal(empty.closingBalance,0);
      const all=ledger.getFullStatement(q);assert.equal(all.party.active,0);
      assert.equal(all.closingBalance,all.reconciliation.currentNetBalance);
      assert.equal(all.closingBalance,all.reconciliation.outstanding-all.reconciliation.creditDue-all.reconciliation.unallocatedPayments);
      let running=all.openingBalance;for(const row of all.entries){running+=row.increase-row.decrease;assert.equal(row.balance,running);}
      assert.equal(running,all.closingBalance);assert.deepEqual(read(),read());
      assert.equal(all.totals.increase,all.totals.invoices);assert.equal(all.totals.decrease,all.totals.payments+all.totals.returns);
      const period=read({from_date:'2026-09-26',to_date:'2026-09-26'});
      const historical=all.entries.filter(r=>r.local_time.slice(0,10)<'2026-09-26').reduce((sum,r)=>sum+r.increase-r.decrease,0);
      assert.equal(period.openingBalance,historical);assert.equal(period.closingBalance,period.openingBalance+period.totals.increase-period.totals.decrease);
      const page=read({limit:1,offset:1});assert.equal(page.entries[0].serial,2);assert.equal(page.entries[0].balance,all.entries[1].balance);assert.deepEqual(page.totals,all.totals);
      assert.equal(read({to_date:'2025-01-01'}).totalRows,0);
      const gap=read({from_date:'2027-01-01'});assert.equal(gap.totalRows,0);assert.equal(gap.openingBalance,all.closingBalance);
      const initial=read({to_date:'2026-09-01'});assert.equal(initial.totals.returns,0);
      assert.ok(all.entries.some(r=>r.type.endsWith('Return')));
    }
    assert.ok(!ledger.getFullStatement({party_type:'customer',party_id:1}).entries.some(r=>r.reference==='SALE-WALKIN'));
    assert.equal(ledger.getStatement({party_type:'supplier',party_id:1}).closingBalance,-6000);
    const returns=createReturnServices(db);
    returns.saleReturns.create({sale_id:1,returned_at:'2026-09-27',items:[{sale_item_id:1,quantity:1}]});
    assert.equal(ledger.getStatement({party_type:'customer',party_id:1}).totals.returns,19999);
    for(const party_type of ['customer','supplier']) {
      const kind=party_type==='customer'?'sale':'purchase',invoices=kind==='sale'?'sales':'purchases',contact=`${party_type}_id`,date=kind==='sale'?'sold_at':'purchased_at';
      db.prepare(`INSERT INTO ${invoices}(id,invoice_number,${contact},subtotal,total,${date}) VALUES(100,'CREDIT-100',2,10000,10000,'2026-10-01')`).run();
      const q={party_type,party_id:2},payments=createPaymentServices(db)[party_type==='customer'?'customerPayments':'supplierPayments'];
      assert.equal(ledger.getStatement(q).closingBalance,10000);
      payments.create({[contact]:2,[`${kind}_id`]:100,amount:3000,payment_method:'Cash',paid_at:'2026-10-02'});
      assert.equal(ledger.getStatement(q).closingBalance,7000);
      payments.create({[contact]:2,[`${kind}_id`]:100,amount:7000,payment_method:'Cash',paid_at:'2026-10-03'});
      assert.equal(ledger.getStatement(q).closingBalance,0);
      db.prepare(`INSERT INTO ${party_type}_payments(${contact},${kind}_id,amount,payment_method,paid_at) VALUES(2,100,1,'Cash','2026-10-03')`).run();
      assert.equal(ledger.getStatement(q).closingBalance,-1);
      assert.equal(ledger.getStatement(q).reconciliation.creditDue,1);
    }
    for(const input of [{party_type:'bad',party_id:1},{party_type:'customer',party_id:'1'},{party_type:'customer',party_id:1,from_date:'2026-02-30'},{party_type:'customer',party_id:1,from_date:'2026-10-02',to_date:'2026-10-01'},{party_type:'customer',party_id:1,limit:101},{party_type:'customer',party_id:1,offset:-1}]) assert.throws(()=>ledger.getStatement(input),e=>e.code==='VALIDATION');
    assert.throws(()=>ledger.getStatement({party_type:'customer',party_id:999}),e=>e.code==='NOT_FOUND');
    const windowsBefore=BrowserWindow.getAllWindows().length;owner=new BrowserWindow({show:false});
    let bytes,printed=0;
    const driver=createPrintDriver({chooseFile:async()=>({filePath:path.join(process.env.MAHSOOD_UI_TEST_DATA,'ledger.pdf')}),writeFile:async(_,data)=>{bytes=data;},print:(_,options,callback)=>{assert.equal(options.pageSize,'A4');printed++;callback(true);}});
    const printing=createLedgerPrintingService(db,driver);
    db.exec("UPDATE customers SET name='Khyber <>:/ Transport' WHERE id=1;");
    for(const party_type of ['customer','supplier']) {
      const q={party_type,party_id:1},preview=printing.preview(q);
      assert.ok(preview.html.includes('<h1>Mahsood Tyres</h1>'));assert.ok(preview.html.includes('TEST-NTN'));assert.ok(preview.html.includes('S.NO'));assert.ok(preview.html.includes('Complete Account History'));
      assert.ok(!/[<>:"/\\|?*]/.test(preview.filename));
      assert.ok(printing.preview({...q,from_date:'2026-09-26',to_date:'2026-09-26'}).html.includes('2026-09-26 to 2026-09-26'));
      assert.equal((await printing.savePdf(q,owner)).status,'saved');assert.ok(bytes.toString('latin1').startsWith('%PDF'));
    }
    for(const count of [10,50,125]) {
      const current=Number(db.prepare('SELECT COUNT(*) AS n FROM sales WHERE customer_id=2').get().n);
      for(let i=current;i<count;i++) db.prepare("INSERT INTO sales(invoice_number,customer_id,subtotal,total,sold_at) VALUES(?,2,101,101,'2026-10-01')").run(`LONG-${i}`);
      const q={party_type:'customer',party_id:2},preview=printing.preview(q),expected=ledger.getFullStatement(q);
      assert.equal((preview.html.match(/data-ledger-row=/g)||[]).length,expected.totalRows);
      await printing.savePdf(q,owner);
      if(count===125) assert.ok((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length>1,'125-row PDF must have multiple pages');
    }
    await printing.print({party_type:'customer',party_id:1},owner);assert.equal(printed,1);
    assert.equal(BrowserWindow.getAllWindows().length,windowsBefore+1);
    const snapshot=db.serialize(),handlers=new Map();let authenticated=false;
    registerLedgerIpc(createAuthorizedIpc({handle:(name,fn)=>handlers.set(name,fn)},{isAuthenticated:()=>authenticated},event=>event.trusted),ledger,printing,event=>event.trusted);
    for(const handler of handlers.values()) {
      assert.equal((await handler({trusted:false})).error.code,'FORBIDDEN');
      assert.equal((await handler({trusted:true})).error.code,'UNAUTHENTICATED');
    }
    authenticated=true;
    for(const handler of handlers.values()) assert.equal((await handler({trusted:true,sender:owner.webContents},{})).error.code,'VALIDATION');
    await printing.savePdf({party_type:'customer',party_id:1},owner);assert.deepEqual(db.serialize(),snapshot);
    assert.equal(db.pragma('user_version',{simple:true}),7);assert.deepEqual(db.pragma('foreign_key_check'),[]);
    console.log('PASS Ledger: both account types, empty/inactive/walk-in, partial/full/multiple payments, multiple returns, credits, historical openings, date totals, stable balances, pagination/reconciliation, validation/auth, escaped print previews, safe filenames, real 10/50/125-row PDFs, intercepted native print, window cleanup and schema-6 read-only compatibility.');
  } catch(error){console.error(error);code=1;} finally {owner?.destroy();db?.close();clearTimeout(timeout);app.exit(code);}
});
