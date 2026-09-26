const v=require('./validation.cjs');
const {safeNumbers,parseDate}=require('../utils/analytics.cjs');
const {createReturnRepository,returnKinds}=require('../repositories/returns.cjs');

// Allocate invoice discount by cumulative line value, then cumulative returned quantity.
// BigInt division gives deterministic paise rounding independent of return order/batching.
function returnable(invoice,c) {
  let grossBefore=0n;
  invoice.items=invoice.items.map((item)=>{
    const gross=BigInt(item.quantity)*BigInt(item[c.price]);
    const subtotal=BigInt(invoice.subtotal),total=BigInt(invoice.total);
    const net=subtotal===0n?0n:((grossBefore+gross)*total/subtotal)-(grossBefore*total/subtotal);
    grossBefore+=gross;
    return {...item,returnable_quantity:item.quantity-item.returned_quantity,net_line_value:safeNumbers(net)};
  });
  if(grossBefore!==BigInt(invoice.subtotal))v.invalid('Original invoice items do not match its subtotal. This invoice requires a separate correction workflow.');
  return invoice;
}
function createReturnServices(db) {
  return Object.fromEntries(Object.entries(returnKinds).map(([resource,c])=>{
    const repository=createReturnRepository(db,c),link=`${c.kind}_id`,itemLink=`${c.kind}_item_id`;
    function getInvoice(id){const row=safeNumbers(repository.invoice(v.id(id)));if(!row)throw new v.CatalogError('NOT_FOUND','Invoice not found.');return returnable(row,c);}
    function getById(id){const row=safeNumbers(repository.get(v.id(id)));if(!row)throw new v.CatalogError('NOT_FOUND','Return not found.');return row;}
    return [resource,{
      [c.read]:(id)=>db.transaction(()=>getInvoice(id)).deferred(),getById:(id)=>db.transaction(()=>getById(id)).deferred(),
      list(input={}){v.object(input,['search',link,'limit','offset']);const filters={search:v.text(input.search??'','Search',200,true)||'',invoice_id:input[link]===undefined?null:v.id(input[link]),limit:v.integer(input.limit??25,'Limit',1,100),offset:v.integer(input.offset??0,'Offset')};return {...safeNumbers(db.transaction(()=>repository.list(filters)).deferred()),limit:filters.limit,offset:filters.offset};},
      create(input){
        v.object(input,[link,'items','returned_at','notes']);parseDate(input.returned_at);
        const data={invoice_id:v.id(input[link]),returned_at:input.returned_at,notes:v.text(input.notes,'Reason / notes',5000,true)};
        if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)v.invalid('Select between 1 and 100 return items.');
        const selected=input.items.map((item)=>{v.object(item,[itemLink,'quantity']);return {id:v.id(item[itemLink]),quantity:v.integer(item.quantity,'Return quantity',1)};});
        if(new Set(selected.map((item)=>item.id)).size!==selected.length)v.invalid('Select each invoice item only once.');
        return db.transaction(()=>{
          const invoice=getInvoice(data.invoice_id),stockRequired=new Map();
          const items=selected.map((entry)=>{
            const original=invoice.items.find((item)=>item.id===entry.id);
            if(!original)v.invalid('Return item must belong to the selected invoice.');
            if(entry.quantity>original.returnable_quantity)throw new v.CatalogError('OVER_RETURN','Quantity exceeds remaining returnable quantity. Refresh the invoice.');
            const prior=BigInt(original.returned_quantity),quantity=BigInt(entry.quantity),net=BigInt(original.net_line_value),sold=BigInt(original.quantity);
            const item={...original,quantity:entry.quantity,gross_value:safeNumbers(quantity*BigInt(original[c.price])),return_value:safeNumbers((prior+quantity)*net/sold-prior*net/sold)};
            const needed=safeNumbers(BigInt(stockRequired.get(item.product_id)||0)+quantity);stockRequired.set(item.product_id,needed);
            if(c.sign<0&&needed>item.current_stock)throw new v.CatalogError('INSUFFICIENT_STOCK','Insufficient current stock for this purchase return.');
            if(c.sign>0)safeNumbers(BigInt(item.current_stock)+BigInt(needed));
            return item;
          });
          data.total=safeNumbers(items.reduce((sum,item)=>sum+BigInt(item.return_value),0n));
          const id=repository.insert(data);
          for(const item of items)repository.insertItem(id,item,data);
          const updated=getInvoice(data.invoice_id);
          if(updated.effective_total<0)throw new Error('Return financial consistency failure');
          return {document:getById(safeNumbers(id)),invoice:updated};
        }).immediate();
      },
    }];
  }));
}
module.exports={createReturnServices};
