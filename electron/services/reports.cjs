const v=require('./validation.cjs');
const {range,safeNumbers,profitAmounts}=require('../utils/analytics.cjs');
const {createReportsRepository}=require('../repositories/reports.cjs');
const dateFields=['period','from_date','to_date'];
const fields={
  getSales:[...dateFields,'search','customer_id','walk_in','payment_status','payment_method'],
  getPurchases:[...dateFields,'search','supplier_id','payment_status'],
  getInventory:['search','brand_id','category_id','stock_status','active'],
  getStockMovements:[...dateFields,'product_id','movement_type'],
  getExpenses:[...dateFields,'search','expense_category_id','payment_method'],
  getProfit:dateFields,getReceivables:['search'],getPayables:['search'],
};
const methods=Object.keys(fields);
function choice(value,options,label) {if(!options.includes(value))v.invalid(`Invalid ${label}.`);return value;}
function normalize(method,input={},now) {
  const allowed=fields[method];v.object(input,[...allowed,'limit','offset']);
  const filters={limit:v.integer(input.limit??25,'limit',1,100),offset:v.integer(input.offset??0,'offset')};
  let period;
  if(allowed.includes('period')) {
    period=range(Object.fromEntries(dateFields.filter((key)=>input[key]!==undefined).map((key)=>[key,input[key]])),now);
    Object.assign(filters,period);
  }
  for(const key of allowed) {
    if(key==='search')filters.search=v.text(input.search??'','Search',200,true)||'';
    else if(key.endsWith('_id'))filters[key]=input[key]===undefined?null:v.id(input[key]);
  }
  if(allowed.includes('payment_status'))filters.payment_status=choice(input.payment_status??'all',['all','paid','partial','unpaid','credit'],'payment status');
  // Exact persisted methods, including legacy/custom purchase methods, are valid read filters.
  if(allowed.includes('payment_method'))filters.payment_method=v.text(input.payment_method??'all','Payment method',80);
  if(allowed.includes('walk_in')) {
    if(input.walk_in!==undefined&&typeof input.walk_in!=='boolean')v.invalid('walk_in must be true or false.');
    filters.walk_in=Number(input.walk_in??false);
    if(filters.walk_in&&filters.customer_id)v.invalid('Choose a customer or walk-in, not both.');
  }
  if(allowed.includes('active'))filters.active=choice(input.active??true,[true,false,'all'],'active status')==='all'?null:Number(input.active??true);
  if(allowed.includes('stock_status'))filters.stock_status=choice(input.stock_status??'all',['all','in','low','out'],'stock status');
  if(allowed.includes('movement_type'))filters.movement_type=choice(input.movement_type??'all',['all','PURCHASE','SALE','ADJUSTMENT_IN','ADJUSTMENT_OUT','SALE_RETURN','PURCHASE_RETURN','OPENING_STOCK'],'movement type');
  return {filters,period};
}
function createReportsService(db,clock=()=>new Date()) {
  const repository=createReportsRepository(db);
  return Object.fromEntries(methods.map((method)=>[method,(input)=>{
    const {filters,period}=normalize(method,input,clock());
    const result=safeNumbers(db.transaction(()=>repository[method](filters)).deferred());
    if(method==='getProfit') {
      const s=result.summary;
      Object.assign(s,profitAmounts(s.salesRevenue,s.historicalCost,s.unknownCostItemCount,s.expenses));
      result.rows=result.rows.map((row)=>({...row,grossProfit:profitAmounts(row.effective_total,row.historicalCost,row.unknownCostItemCount).grossProfit}));
    }
    return {...result,totalRows:result.summary.rowCount,limit:filters.limit,offset:filters.offset,
      range:period?{from:period.from,to:period.to,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}:null};
  }]));
}
module.exports={createReportsService,methods};
