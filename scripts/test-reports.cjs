const {app}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const {openDatabase}=require('../electron/database/index.cjs');
const {createReportsService,methods}=require('../electron/services/reports.cjs');
const {registerReportsIpc}=require('../electron/ipc/reports.cjs');
const {createDashboardService}=require('../electron/services/dashboard.cjs');
const {seedReports}=require('./reports-fixtures.cjs');
const {localTime}=require('./dashboard-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw new Error('Temporary profile required.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
app.whenReady().then(()=>{
  let db,code=0;
  try {
    const filename=path.join(process.env.MAHSOOD_UI_TEST_DATA,'reports.sqlite3');db=openDatabase(filename);
    const clock=()=>new Date('2026-09-26T12:00:00');let service=createReportsService(db,clock);
    for(const method of methods){const empty=service[method]();assert.deepEqual(empty.rows,[]);assert.equal(empty.totalRows,0);assert.ok(Object.values(empty.summary).every((value)=>value===0));}
    seedReports(db);const before=db.serialize();
    const sales=service.getSales();assert.equal(sales.rows.length,25);assert.deepEqual(sales.summary,{rowCount:28,total:32927,paid:29027,outstanding:3900});
    const second=service.getSales({offset:25});assert.equal(second.rows.length,3);assert.deepEqual(second.summary,sales.summary);assert.equal(new Set([...sales.rows,...second.rows].map((row)=>row.id)).size,28);
    assert.deepEqual(service.getSales({offset:100}).summary,sales.summary);
    assert.equal(service.getSales({search:'sale-open'}).rows[0].balance,3900);
    assert.equal(service.getSales({customer_id:1}).totalRows,1);assert.equal(service.getSales({customer_id:2}).totalRows,27);
    assert.equal(service.getSales({payment_status:'partial'}).totalRows,1);assert.equal(service.getSales({payment_status:'paid'}).totalRows,27);
    assert.equal(service.getSales({payment_method:'Cash'}).totalRows,1);assert.equal(service.getSales({payment_method:'Bank transfer'}).totalRows,27);
    assert.equal(service.getSales({walk_in:true}).totalRows,0);assert.equal(service.getSales({search:"' OR 1=1 --"}).totalRows,0);
    const oct={period:'custom',from_date:'2026-10-01',to_date:'2026-10-31'};
    assert.equal(service.getSales({...oct,walk_in:true}).totalRows,1);
    const purchases=service.getPurchases();assert.deepEqual(purchases.summary,{rowCount:1,total:110000,paid:5000,outstanding:105000});
    assert.equal(service.getPurchases({supplier_id:2}).totalRows,0);assert.equal(service.getPurchases({...oct,payment_status:'paid',supplier_id:2}).summary.paid,9000);
    assert.equal(service.getPurchases({search:'PUR-OPEN',payment_status:'partial'}).totalRows,1);
    const inventory=service.getInventory();assert.deepEqual(inventory.summary,{rowCount:4,activeProducts:4,stockUnits:76,lowStockCount:2,outOfStockCount:1});
    assert.equal(service.getInventory({active:'all'}).summary.stockUnits,85);assert.equal(service.getInventory({active:false}).summary.activeProducts,0);
    assert.equal(service.getInventory({stock_status:'out'}).rows[0].sku,'D');assert.equal(service.getInventory({stock_status:'low'}).totalRows,2);
    assert.equal(service.getInventory({search:'tour',brand_id:1,category_id:1}).totalRows,1);assert.equal(service.getInventory({brand_id:999}).totalRows,0);
    assert.equal(service.getStockMovements({movement_type:'ADJUSTMENT_OUT'}).summary.unitsOut,1);
    assert.equal(service.getStockMovements({product_id:3}).totalRows,1);assert.equal(service.getStockMovements({...oct,product_id:3}).rows[0].movement_type,'SALE');
    const movement=service.getStockMovements({product_id:1,movement_type:'PURCHASE'}).rows[0];assert.equal(movement.invoice_number,'PUR-OPEN');assert.equal(movement.reference_type,'Purchase');
    assert.equal(service.getStockMovements({movement_type:'SALE_RETURN'}).totalRows,0);
    assert.deepEqual(service.getExpenses().summary,{rowCount:1,expenses:303});assert.equal(service.getExpenses({expense_category_id:2}).totalRows,0);
    assert.equal(service.getExpenses({...oct,expense_category_id:2,payment_method:'Bank transfer',search:'POWER'}).summary.expenses,407);
    const profit=service.getProfit();assert.equal(profit.summary.salesRevenue,32927);assert.equal(profit.summary.historicalCost,31029);assert.equal(profit.summary.discount,102);assert.equal(profit.summary.grossProfit,1898);assert.equal(profit.summary.operatingResult,1595);assert.equal(profit.summary.unknownCostItemCount,0);
    assert.deepEqual(service.getProfit({offset:25}).summary,profit.summary);
    const unknown=service.getProfit(oct);assert.equal(unknown.summary.unknownCostItemCount,1);assert.equal(unknown.summary.affectedSaleCount,1);assert.equal(unknown.summary.grossProfit,null);assert.equal(unknown.summary.operatingResult,null);assert.equal(unknown.rows[0].grossProfit,null);
    const dashboard=createDashboardService(db,clock).getOverview();assert.equal(dashboard.summary.grossProfit,profit.summary.grossProfit);assert.equal(dashboard.summary.customerReceivables,4400);
    const receivables=service.getReceivables();assert.deepEqual(receivables.summary,{rowCount:1,invoiceCount:1,total:5900,paid:2000,outstanding:3900,excludedWalkInBalance:500});
    assert.equal(receivables.rows[0].contact_name,'Customer One');assert.equal(service.getReceivables({search:'paid customer'}).totalRows,0);assert.equal(service.getReceivables({search:'333'}).totalRows,1);
    assert.deepEqual(service.getPayables().summary,{rowCount:1,invoiceCount:1,total:110000,paid:5000,outstanding:105000});assert.equal(service.getPayables({search:'Supplier Two'}).totalRows,0);
    assert.deepEqual(db.serialize(),before,'All eight report APIs must be read-only');
    // Invoice reports include subsequent linked payments; Dashboard cash totals follow paid_at instead.
    db.exec("INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,paid_at) VALUES (1,1,100,'Cheque','2026-10-04'),(1,NULL,500,'Cash','2026-10-04');");
    assert.equal(service.getSales({customer_id:1}).summary.paid,2100);assert.equal(service.getSales({payment_method:'Cheque'}).totalRows,1);assert.equal(service.getReceivables().summary.outstanding,3800);
    assert.equal(createDashboardService(db,clock).getOverview().summary.amountReceived,29027);
    // Boundary and legacy timestamp behavior uses the very same helper as Dashboard.
    const expense=db.prepare("INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES (1,?,'Boundary','Cash',?)");
    const midnight=Date.parse(localTime('2026-09-10',0));
    expense.run(11,new Date(midnight-1).toISOString());expense.run(13,new Date(midnight).toISOString());expense.run(17,new Date(Date.parse(localTime('2026-09-11',0))-1).toISOString());expense.run(19,localTime('2026-09-11',0));
    assert.equal(service.getExpenses({period:'custom',from_date:'2026-09-10',to_date:'2026-09-10'}).summary.expenses,30);
    for(const method of methods)for(const input of [null,[],{sql:'SELECT 1'},{limit:101},{offset:-1},{limit:1.1}])assert.throws(()=>service[method](input),(e)=>e.code==='VALIDATION');
    for(const input of [{period:'bad'},{period:'custom',from_date:'2026-02-30',to_date:'2026-03-01'},{period:'custom',from_date:'2026-10-01',to_date:'2026-09-01'},{customer_id:'1'},{walk_in:true,customer_id:1},{payment_status:'bad'}])assert.throws(()=>service.getSales(input));
    assert.throws(()=>service.getInventory({period:'today'}));assert.throws(()=>service.getReceivables({period:'year'}));assert.throws(()=>service.getInventory({active:0}));assert.throws(()=>service.getStockMovements({movement_type:'FAKE'}));
    const handlers=new Map();const ipc={handle:(name,fn)=>handlers.set(name,fn),removeHandler:(name)=>handlers.delete(name)};
    const unregister=registerReportsIpc(ipc,service,(event)=>event.trusted);assert.equal(handlers.size,8);
    for(const handler of handlers.values()){assert.equal(handler({trusted:false}).error.code,'FORBIDDEN');assert.equal(handler({trusted:true},{},{}).error.code,'VALIDATION');assert.equal(handler({trusted:true},{sql:'bad'}).error.code,'VALIDATION');assert.equal(handler({trusted:true}).ok,true);}
    unregister();assert.equal(handlers.size,0);assert.equal(db.pragma('user_version',{simple:true}),3);assert.deepEqual(db.pragma('foreign_key_check'),[]);
    db.close();db=openDatabase(filename,{readonly:true});assert.equal(createReportsService(db,clock).getSales().totalRows,28);
    db.close();db=openDatabase(filename);const expenseBig=db.prepare("INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES (1,?,'Large','Cash','2026-09-01')");expenseBig.run(Number.MAX_SAFE_INTEGER);
    assert.throws(()=>createReportsService(db,clock).getExpenses(),(e)=>e.code==='RANGE');
    console.log('PASS: All eight Reports: full-filter totals/pagination, partial and later payments, inventory/status, movement references, expenses/local boundaries, historical discounted profit/unknown cost/integer overflow, positive accounts/walk-in exclusion, read-only snapshots/persistence and IPC validation.');
  }catch(error){code=1;console.error(error);}finally{if(db?.open)db.close();app.exit(code);}
});
