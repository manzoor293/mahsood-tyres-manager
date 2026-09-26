const {app}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const {openDatabase}=require('../electron/database/index.cjs');
const {createPaymentServices}=require('../electron/services/payments.cjs');
const {registerPaymentIpc}=require('../electron/ipc/payments.cjs');
const {createDashboardService}=require('../electron/services/dashboard.cjs');
const {createReportsService}=require('../electron/services/reports.cjs');
const {createSaleService}=require('../electron/services/sales.cjs');
const {createPurchaseService}=require('../electron/services/purchases.cjs');
const {seedPayments}=require('./payments-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw new Error('Temporary profile required.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const supplier=process.argv.includes('--supplier-payments');
const resource=supplier?'supplierPayments':'customerPayments',table=supplier?'supplier_payments':'customer_payments';
const contact=supplier?'supplier_id':'customer_id',invoice=supplier?'purchase_id':'sale_id';
app.whenReady().then(()=>{
  let db,other,code=0;
  try {
    const filename=path.join(process.env.MAHSOOD_UI_TEST_DATA,'payments.sqlite3');db=openDatabase(filename);
    const clock=()=>new Date('2026-09-26T12:00:00');let services=createPaymentServices(db,clock),service=services[resource];
    assert.equal(service.list().totalRows,0);assert.equal(service.history().totalRows,0);
    const ids=seedPayments(db),unpaidId=supplier?ids.purchase:ids.sale;
    const protectedTables=['sales','purchases','sale_items','purchase_items','inventory','stock_movements','customers','suppliers','expenses',supplier?'customer_payments':'supplier_payments'];
    const protectedSnapshot=()=>Object.fromEntries(protectedTables.map((name)=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]));
    let protectedBefore=protectedSnapshot();
    const paymentSnapshot=()=>db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    const base={[contact]:1,[invoice]:unpaidId,amount:2501,payment_method:'Cash',paid_at:'2026-09-26',notes:'Later payment'};
    assert.equal(service.list({[contact]:1}).totalRows,2);assert.equal(service.getOutstanding(unpaidId).balance,10000);
    assert.equal(service.getOutstanding(unpaidId).payment_status,'unpaid');
    const partial=service.create(base);assert.equal(partial.invoice.balance,7499);assert.equal(partial.invoice.payment_status,'partial');assert.equal(partial.payment.amount,2501);
    const final=service.create({...base,amount:7499});assert.equal(final.invoice.balance,0);assert.equal(final.invoice.payment_status,'paid');
    assert.equal(service.list({search:'UNPAID'}).totalRows,0);assert.equal(service.history({[invoice]:unpaidId}).summary.amount,10000);
    const rejects=(patch,expected)=>{const before=paymentSnapshot();assert.throws(()=>service.create({...base,...patch}),(error)=>!expected||error.code===expected);assert.deepEqual(paymentSnapshot(),before);};
    for(const amount of [0,-1,1.5,'1',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])rejects({amount},'VALIDATION');
    rejects({[invoice]:999},'NOT_FOUND');rejects({[invoice]:'1'},'VALIDATION');rejects({[invoice]:1,[contact]:2},'VALIDATION');rejects({[invoice]:1,[contact]:999},'VALIDATION');
    rejects({[invoice]:1,amount:Number.MAX_SAFE_INTEGER},'OVERPAYMENT');rejects({amount:1},'ALREADY_PAID');
    for(const patch of [{payment_method:'Credit'},{payment_method:null},{paid_at:'2026-02-30'},{paid_at:'2026-09-26T00:00:00.000Z'},{notes:'x'.repeat(5001)},{balance:100000},{total:1},{amount:undefined}])rejects(patch,'VALIDATION');
    if(!supplier){rejects({[invoice]:29},'VALIDATION');assert.throws(()=>service.getOutstanding(29),(e)=>e.code==='VALIDATION');assert.equal(service.list().rows.some((row)=>row.contact_id===null),false);}
    assert.throws(()=>service.getAccountSummary(999),(e)=>e.code==='NOT_FOUND');
    const balanceBefore=service.getOutstanding(1).balance;
    const dashboardBefore=createDashboardService(db,clock).getOverview().summary;
    const reportsBefore=createReportsService(db,clock)[supplier?'getPayables':'getReceivables']().summary.outstanding;
    const accountBefore=service.getAccountSummary(1);
    const extra=service.create({...base,[invoice]:1,amount:101});assert.equal(extra.invoice.balance,balanceBefore-101);
    const details=(supplier?createPurchaseService(db):createSaleService(db)).getById(1);assert.equal(details.balance,balanceBefore-101);
    const dashboardAfter=createDashboardService(db,clock).getOverview().summary;
    assert.equal(dashboardAfter[supplier?'supplierPayables':'customerReceivables'],dashboardBefore[supplier?'supplierPayables':'customerReceivables']-101);
    assert.equal(dashboardAfter[supplier?'supplierAmountPaid':'amountReceived'],dashboardBefore[supplier?'supplierAmountPaid':'amountReceived']+101);
    assert.equal(createReportsService(db,clock)[supplier?'getPayables':'getReceivables']().summary.outstanding,reportsBefore-101);
    assert.equal(service.getAccountSummary(1).outstanding,accountBefore.outstanding-101);assert.equal(service.getAccountSummary(1).paid,accountBefore.paid+101);
    assert.deepEqual(protectedSnapshot(),protectedBefore,'Payments must not mutate invoices, stock, contacts or other financial records');
    // A second connection commits after a UI read. The first service must re-read under BEGIN IMMEDIATE.
    const stale=service.getOutstanding(1).balance;other=openDatabase(filename);
    createPaymentServices(other)[resource].create({...base,[invoice]:1,amount:stale-100});
    rejects({[invoice]:1,amount:101},'OVERPAYMENT');assert.equal(service.getOutstanding(1).balance,100);
    // Even an AFTER INSERT failure must leave no payment behind.
    const beforeRollback=paymentSnapshot();
    db.exec(`CREATE TRIGGER fail_payment AFTER INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'Forced payment failure'); END;`);
    assert.throws(()=>service.create({...base,[invoice]:1,amount:50}));assert.deepEqual(paymentSnapshot(),beforeRollback);assert.equal(service.getOutstanding(1).balance,100);db.exec('DROP TRIGGER fail_payment');
    // Deactivation does not prevent settlement of a valid existing obligation.
    db.exec(`UPDATE ${supplier?'suppliers':'customers'} SET active=0 WHERE id=1`);protectedBefore=protectedSnapshot();
    service.create({...base,[invoice]:1,amount:100});assert.equal(service.list({[contact]:1}).totalRows,0);assert.equal(service.getAccountSummary(1).outstanding,0);assert.equal(createReportsService(db,clock)[supplier?'getPayables':'getReceivables']().totalRows,0);
    assert.deepEqual(protectedSnapshot(),protectedBefore);
    const history=service.history({[contact]:1,search:'UNPAID',period:'custom',from_date:'2026-09-26',to_date:'2026-09-26',payment_method:'Cash',limit:1});
    assert.equal(history.rows.length,1);assert.equal(history.totalRows,2);assert.equal(history.summary.amount,10000);assert.equal(service.history({[invoice]:unpaidId,offset:1,limit:1}).rows.length,1);
    assert.equal(service.history({period:'custom',from_date:'2026-09-27',to_date:'2026-09-27'}).totalRows,0);
    for(const input of [null,[],{sql:'bad'},{limit:101},{offset:-1},{[contact]:'1'}]){assert.throws(()=>service.list(input));assert.throws(()=>service.history(input));}
    assert.throws(()=>service.history({period:'all',from_date:'2026-09-01'}));assert.throws(()=>service.history({period:'custom',from_date:'2026-09-26',to_date:'2026-09-25'}));
    const handlers=new Map();registerPaymentIpc({handle:(name,fn)=>handlers.set(name,fn)},services,(event)=>event.trusted);assert.equal(handlers.size,10);
    for(const handler of handlers.values()){assert.equal(handler({trusted:false}).error.code,'FORBIDDEN');assert.equal(handler({trusted:true},{},{}).error.code,'VALIDATION');}
    assert.equal(handlers.get(`${resource}:create`)({trusted:true},{}).error.code,'VALIDATION');assert.equal(handlers.get(`${resource}:getOutstanding`)({trusted:true}).error.code,'VALIDATION');
    assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('user_version',{simple:true}),4);
    other.close();other=null;db.close();db=openDatabase(filename);service=createPaymentServices(db)[resource];assert.equal(service.getOutstanding(1).balance,0);
    console.log(`PASS: ${resource} unpaid/partial/final payments, safe integer validation, history/filtering/paging, account summaries, account/invoice matching, stale second connection, rollback, inactive settlement, persistence, protected records, IPC guards and Sales/Purchases/Dashboard/Reports integration.`);
  }catch(error){code=1;console.error(error);}finally{if(other?.open)other.close();if(db?.open)db.close();app.exit(code);}
});
