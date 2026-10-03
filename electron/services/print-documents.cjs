const v = require('./validation.cjs');
const {safeNumbers} = require('../utils/analytics.cjs');
const {createPrintingRepository} = require('../repositories/printing.cjs');
const {createSettingsService, shopDefaults} = require('./settings.cjs');

const documentTypes = Object.freeze({
  saleInvoice: {kind:'sale', category:'invoice', title:'Sales Invoice / Receipt', prefix:'SALE'},
  purchaseInvoice: {kind:'purchase', category:'invoice', title:'Purchase Invoice', prefix:'PUR'},
  customerPayment: {kind:'sale', category:'payment', title:'Customer Payment Receipt', prefix:'CP'},
  supplierPayment: {kind:'purchase', category:'payment', title:'Supplier Payment Receipt', prefix:'SP'},
  saleReturn: {kind:'sale', category:'return', title:'Sale Return / Credit Note', prefix:'SR'},
  purchaseReturn: {kind:'purchase', category:'return', title:'Purchase Return / Debit Note', prefix:'PR'},
});
function validateDocument(type,id) {
  if(typeof type!=='string'||!Object.hasOwn(documentTypes,type))v.invalid('Choose a supported printable document.');
  v.id(id);
  return documentTypes[type];
}
function suggestedFilename(reference) {
  let name=String(reference).normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'-').replace(/[. ]+$/g,'').trim().slice(0,100).replace(/[. ]+$/g,'');
  if(!name||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name))name=`Document-${name||'receipt'}`;
  return `${name}.pdf`;
}
function createDocumentService(db,clock=()=>new Date()) {
  const repository=createPrintingRepository(db);
  const settings=createSettingsService(db);
  function load(type,id) {
    const config=validateDocument(type,id),sale=config.kind==='sale';
    const shop=settings.getShopProfile();
    const document={type,title:config.title,shop,contactLabel:sale?'Customer':'Supplier',items:[],totals:[],current:[],relatedReturns:[],
      unitLabel:sale?'Unit selling price':'Historical unit cost',lineLabel:'Line total',generatedAt:clock().toISOString(),
      footer:shop.footer, provenance:'Product and contact descriptions reflect current directory records. Transaction quantities and prices are historical.'};
    let invoice,record;
    if(config.category==='invoice') {
      invoice=safeNumbers(repository.invoice(config.kind,id));
      if(!invoice)throw new v.CatalogError('NOT_FOUND','Invoice not found.');
      record=invoice;document.reference=invoice.invoice_number;
      document.items=safeNumbers(repository.invoiceItems(config.kind,id));
      document.totals=[['Subtotal',invoice.subtotal],['Discount',invoice.discount],['Original invoice total',invoice.total]];
      document.sectionTitle='Original invoice';
      document.relatedReturns=safeNumbers(repository.references(config.kind,id));
    } else if(config.category==='payment') {
      record=safeNumbers(repository.payment(config.kind,id));
      if(!record)throw new v.CatalogError('NOT_FOUND','Payment not found.');
      document.reference=record.reference||`${config.prefix}-${String(record.id).padStart(6,'0')}`;
      document.method=record.payment_method;
      document.sectionTitle='Recorded payment';
      document.totals=[['Payment amount',record.amount]];
      if(record.invoice_id!==null) {
        invoice=safeNumbers(repository.invoice(config.kind,record.invoice_id));
        if(!invoice)throw new v.CatalogError('NOT_FOUND','Related invoice not found.');
        const after=safeNumbers(BigInt(record.previously_paid)+BigInt(record.amount));
        const difference=safeNumbers(BigInt(invoice.total)-BigInt(after));
        document.totals=[['Original invoice total',invoice.total],['Previously paid (recording order)',record.previously_paid],['Payment amount',record.amount],['Paid through this receipt',after],['Balance against original invoice after payment',Math.max(difference,0)],['Excess against original invoice after payment',Math.max(-difference,0)]];
        document.explanation='Payment-order figures follow saved payment IDs, not backdated payment dates, and exclude return adjustments. Current return-adjusted figures are shown separately below.';
      } else {
        document.explanation='This legacy payment is not linked to an invoice. No invoice balance or allocation is implied.';
      }
    } else {
      record=safeNumbers(repository.returnDocument(config.kind,id));
      if(!record)throw new v.CatalogError('NOT_FOUND','Return not found.');
      invoice=safeNumbers(repository.invoice(config.kind,record.invoice_id));
      if(!invoice)throw new v.CatalogError('NOT_FOUND','Related invoice not found.');
      document.reference=record.reference;document.sectionTitle='Recorded return';
      document.items=safeNumbers(repository.returnItems(config.kind,id));
      document.lineLabel='Return adjustment';
      const gross=safeNumbers(document.items.reduce((sum,item)=>sum+BigInt(item.gross_value),0n));
      document.totals=[['Gross returned value',gross],['Allocated original discount',safeNumbers(BigInt(gross)-BigInt(record.total))],['Return adjustment total',record.total]];
      document.explanation='This document records a return adjustment at historical prices, including the allocated original discount. It does not record a cash refund or credit settlement.';
    }
    if(document.items.length) {
      const factors = new Set(document.items.map(item => item.units_per_transaction_unit));
      const unit = factors.size === 1 ? (factors.has(2) ? 'Pair' : 'Tyre') : null;
      document.quantityLabel = unit ? `Qty (${unit}s)` : 'Qty (unit shown)';
      document.unitLabel = unit ? `Price / ${unit}` : 'Price / indicated unit';
      document.mixedUnits = unit === null;
    }
    const contact=invoice||record;
    document.contact={name:contact.contact_name||(sale?'Walk-in':'Supplier'),phone:contact.contact_phone,address:contact.contact_address};
    document.date=record.date;document.notes=record.notes;
    if(invoice) {
      document.invoiceReference=invoice.invoice_number;
      document.current=[['Original invoice total',invoice.total],['Total return adjustments',invoice.returned_value],['Effective invoice total',invoice.effective_total],
        [sale?'Amount received to date':'Amount paid to date',invoice.paid_amount],[sale?'Current outstanding balance':'Current payable balance',invoice.balance],
        [sale?'Customer credit / refund due':'Supplier credit due',invoice.credit_due]];
      document.status=invoice.payment_status;
      if(config.category==='invoice')document.method=invoice.payment_methods;
    }
    document.filename=suggestedFilename(document.reference);
    return document;
  }
  return {getDocument:(type,id)=>db.transaction(()=>load(type,id)).deferred()};
}
module.exports={createDocumentService,validateDocument,documentTypes,shopDefaults,suggestedFilename};
