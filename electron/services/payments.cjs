const v=require('./validation.cjs');
const {safeNumbers,range,parseDate}=require('../utils/analytics.cjs');
const {createPaymentRepository,paymentKinds}=require('../repositories/payments.cjs');
const paymentMethods=['Cash','Bank transfer','Cheque'];
function createPaymentServices(db,clock=()=>new Date()) {
  return Object.fromEntries(Object.keys(paymentKinds).map((kind)=>{
    const config=paymentKinds[kind],repository=createPaymentRepository(db,kind);
    function outstanding(value) {
      const invoice=safeNumbers(repository.get(v.id(value)));
      if(!invoice)throw new v.CatalogError('NOT_FOUND','Invoice not found.');
      if(invoice.contact_id===null)throw new v.CatalogError('VALIDATION','Walk-in sales are not eligible for customer-account payments.');
      return invoice;
    }
    function filters(input={},history=false) {
      v.object(input,['search',config.contact,'limit','offset',...(history?[config.invoice,'period','from_date','to_date','payment_method']:[])]);
      const result={search:v.text(input.search??'','Search',200,true)||'',contact_id:input[config.contact]===undefined?null:v.id(input[config.contact]),
        limit:v.integer(input.limit??25,'limit',1,100),offset:v.integer(input.offset??0,'offset')};
      if(history) {
        result.invoice_id=input[config.invoice]===undefined?null:v.id(input[config.invoice]);
        result.payment_method=v.text(input.payment_method??'all','Payment method',80);
        result.all_dates=Number((input.period??'all')==='all');
        if(result.all_dates&&(input.from_date!==undefined||input.to_date!==undefined))v.invalid('Choose a custom period for date boundaries.');
        Object.assign(result,range(result.all_dates?{period:'today'}:Object.fromEntries(['period','from_date','to_date'].filter((key)=>input[key]!==undefined).map((key)=>[key,input[key]])),clock()));
      }
      return result;
    }
    function read(input,history=false) {
      const query=filters(input,history);
      const result=safeNumbers(db.transaction(()=>repository[history?'history':'list'](query)).deferred());
      return {...result,totalRows:result.summary.totalRows,limit:query.limit,offset:query.offset,
        range:history&&!query.all_dates?{from:query.from,to:query.to,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}:null};
    }
    return [kind,{
      list:(input)=>read(input),history:(input)=>read(input,true),
      getOutstanding:(id)=>outstanding(id),
      getAccountSummary(value) {
        const account=safeNumbers(repository.account(v.id(value)));
        if(!account)throw new v.CatalogError('NOT_FOUND','Account not found.');
        return account;
      },
      create(input) {
        v.object(input,[config.contact,config.invoice,'amount','payment_method','paid_at','notes']);
        const data={contact_id:v.id(input[config.contact]),invoice_id:v.id(input[config.invoice]),amount:v.integer(input.amount,'Payment amount',1),
          payment_method:input.payment_method,paid_at:input.paid_at,notes:v.text(input.notes,'Notes',5000,true)};
        if(!paymentMethods.includes(data.payment_method))v.invalid('Payment method must be Cash, Bank transfer or Cheque.');
        parseDate(data.paid_at); // New payments record the user's literal local calendar date.
        // Lock before reading: concurrent connections cannot insert between validation and commit.
        return db.transaction(()=>{
          const invoice=outstanding(data.invoice_id);
          if(invoice.contact_id!==data.contact_id)v.invalid('The account must match the invoice.');
          if(invoice.balance<=0)throw new v.CatalogError('ALREADY_PAID','This invoice is already fully paid. Refresh its balance.');
          if(data.amount>invoice.balance)throw new v.CatalogError('OVERPAYMENT','Payment exceeds the current outstanding balance. Refresh the invoice and review the amount.');
          const payment=safeNumbers(repository.insert(data));
          const updated=outstanding(data.invoice_id);
          if(updated.balance<0||updated.paid_amount!==safeNumbers(BigInt(invoice.paid_amount)+BigInt(data.amount)))throw new Error('Payment consistency check failed');
          return {payment,invoice:updated};
        }).immediate();
      },
    }];
  }));
}
module.exports={createPaymentServices};
