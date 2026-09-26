import {useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,TextField} from '@mui/material';
import {catalogRequest,formatPrice,parsePrice} from '../../utils/catalog.js';
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export default function PaymentDialog({resource,invoiceId,contactField,invoiceField,onClose,onSaved}) {
  const [invoice,setInvoice]=useState(null),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({amount:'',payment_method:'Cash',paid_at:today(),notes:''});
  const submitting=useRef(false);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    catalogRequest(()=>window.api[resource].getOutstanding(invoiceId)).then((row)=>{if(live)setInvoice(row);}).catch((error)=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[resource,invoiceId,revision]);
  const amount=parsePrice(form.amount);
  const change=(key,value)=>setForm((f)=>({...f,[key]:value}));
  async function submit(event) {
    event.preventDefault();if(submitting.current||loading||!invoice)return;
    if(amount===null||amount<=0){setError('Enter a positive payment amount with at most two decimal places.');return;}
    submitting.current=true;setBusy(true);setError('');
    try {
      const result=await catalogRequest(()=>window.api[resource].create({[contactField]:invoice.contact_id,[invoiceField]:invoice.id,amount,payment_method:form.payment_method,paid_at:form.paid_at,notes:form.notes}));
      onSaved(result);
    }catch(error){
      setError(error.message);
      // Refresh facts only. Never automatically retry a financial write.
      try{setInvoice(await catalogRequest(()=>window.api[resource].getOutstanding(invoiceId)));}catch{/* Keep the original error and allow explicit refresh. */}
    }finally{submitting.current=false;setBusy(false);}
  }
  return <Dialog open fullWidth maxWidth="sm" onClose={busy?undefined:onClose} aria-labelledby="payment-dialog-title"><form onSubmit={submit}>
    <DialogTitle id="payment-dialog-title">Record {resource==='customerPayments'?'Customer':'Supplier'} Payment</DialogTitle><DialogContent dividers>
      {loading?<div role="status" className="flex items-center gap-3 p-4"><CircularProgress size={22}/>Loading invoice balance...</div>:<>
        {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
        {invoice&&<><p className="font-semibold">{invoice.invoice_number} · {invoice.contact_name}</p><p className="mt-1 text-xs text-slate-500">Recorded payments are read-only. Review the amount before saving.</p>
          <dl className="my-4 grid grid-cols-2 gap-3" data-payment-preview>{[['Invoice Total',formatPrice(invoice.total)],['Returned Value',formatPrice(invoice.returned_value)],['Effective Total',formatPrice(invoice.effective_total)],['Credit / Refund Due',formatPrice(invoice.credit_due)],['Paid So Far',formatPrice(invoice.paid_amount)],['Outstanding',formatPrice(invoice.balance)],['Payment Now',amount===null?'—':formatPrice(amount)],['Remaining After Payment',amount===null?'—':amount>invoice.balance?'Exceeds outstanding':formatPrice(invoice.balance-amount)]].map(([label,value])=><div className="contents" key={label}><dt>{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}</dl>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><TextField label="Payment amount (Rs.)" name="payment-amount" size="small" value={form.amount} onChange={(e)=>change('amount',e.target.value)} disabled={busy} slotProps={{htmlInput:{inputMode:'decimal',maxLength:20}}}/>
            <TextField type="date" required label="Payment date" name="payment-date" size="small" value={form.paid_at} onChange={(e)=>change('paid_at',e.target.value)} disabled={busy} slotProps={{inputLabel:{shrink:true}}}/>
            <TextField select label="Payment method" name="payment-method" size="small" value={form.payment_method} onChange={(e)=>change('payment_method',e.target.value)} disabled={busy} slotProps={{select:{native:true}}}>{['Cash','Bank transfer','Cheque'].map((method)=><option key={method}>{method}</option>)}</TextField>
          </div><TextField fullWidth multiline minRows={2} label="Notes" name="payment-notes" value={form.notes} onChange={(e)=>change('notes',e.target.value)} disabled={busy} sx={{mt:2}} slotProps={{htmlInput:{maxLength:5000}}}/>
          {invoice.balance<=0&&<Alert severity="info" sx={{mt:2}}>This invoice is fully paid.</Alert>}
        </>}
      </>}
    </DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy||loading} onClick={()=>setRevision((n)=>n+1)}>{invoice?'Refresh balance':'Retry'}</Button><Button type="submit" variant="contained" disabled={busy||loading||!invoice||invoice.balance<=0}>{busy?'Recording...':'Record Payment'}</Button></DialogActions>
  </form></Dialog>;
}
