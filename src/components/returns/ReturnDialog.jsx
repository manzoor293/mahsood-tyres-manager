import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField} from '@mui/material';
import {catalogRequest,formatPrice} from '../../utils/catalog.js';

export default function ReturnDialog({kind,invoiceId,onClose,onSaved}) {
  const sale=kind==='sale',resource=sale?'saleReturns':'purchaseReturns';
  const [invoice,setInvoice]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [quantities,setQuantities]=useState({}),[notes,setNotes]=useState(''),[confirmed,setConfirmed]=useState(false),[revision,setRevision]=useState(0);
  const [date,setDate]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
  const submitting=useRef(false);
  const read=()=>catalogRequest(()=>window.api[resource][sale?'getReturnableSale':'getReturnablePurchase'](invoiceId));
  useEffect(()=>{let live=true;setLoading(true);read().then((row)=>{if(live){setInvoice(row);setError('');}}).catch((e)=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[resource,invoiceId,revision]);
  const selected=(invoice?.items||[]).filter((item)=>Number(quantities[item.id])>0).map((item)=>({...item,return_quantity:Number(quantities[item.id])}));
  function value(item){const q=item.return_quantity;if(!Number.isSafeInteger(q)||q<1||q>item.returnable_quantity)return 0;const prior=BigInt(item.returned_quantity),net=BigInt(item.net_line_value),count=BigInt(item.quantity);return Number((prior+BigInt(q))*net/count-prior*net/count);}
  const total=selected.reduce((sum,item)=>sum+value(item),0);
  async function submit(event){
    event.preventDefault();if(submitting.current||loading)return;
    if(!selected.length||Object.values(quantities).some((q)=>q!==''&&(!Number.isSafeInteger(Number(q))||Number(q)<0))){setError('Choose a positive whole quantity to return.');return;}
    if(selected.some((item)=>item.return_quantity>item.returnable_quantity)){setError('Quantity exceeds remaining returnable quantity.');return;}
    if(!confirmed){setConfirmed(true);setError('');return;}
    submitting.current=true;setBusy(true);setError('');
    try{const result=await catalogRequest(()=>window.api[resource].create({[`${kind}_id`]:invoiceId,items:selected.map((item)=>({[`${kind}_item_id`]:item.id,quantity:item.return_quantity})),returned_at:date,notes}));onSaved(result);}
    catch(e){setError(e.message);setConfirmed(false);try{setInvoice(await read());}catch{/* Preserve the write error; explicit refresh remains available. */}}
    finally{submitting.current=false;setBusy(false);}
  }
  const change=(action)=>{action();setConfirmed(false);};
  return <Dialog open fullWidth maxWidth="lg" onClose={busy?undefined:onClose}><form onSubmit={submit}>
    <DialogTitle>{sale?'Sale':'Purchase'} Return {invoice?.invoice_number}</DialogTitle><DialogContent dividers>
      {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
      {loading?<p role="status">Loading returnable items...</p>:invoice&&<>
        <p className="mb-3 font-semibold">{invoice.contact_name||'Walk-in'}</p>
        <Alert severity="info">Historical prices apply. The original invoice discount is allocated to returned items. Completed returns are read-only; cash refunds are not processed here.</Alert>
        <TableContainer><Table size="small" aria-label="Returnable items"><TableHead><TableRow>{['Product',sale?'Sold':'Purchased','Previously returned','Returnable',...(!sale?['Current stock']:[]),'Historical unit price / cost','Quantity to return','Return value'].map((label)=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{invoice.items.map((item)=><TableRow key={item.id} data-return-item={item.id}>
          <TableCell>{item.sku} · {item.model} · {item.size}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{item.returned_quantity}</TableCell><TableCell>{item.returnable_quantity}</TableCell>{!sale&&<TableCell>{item.current_stock}</TableCell>}<TableCell>{formatPrice(sale?item.unit_price:item.unit_cost)}</TableCell>
          <TableCell><TextField size="small" type="number" name={`return-quantity-${item.id}`} aria-label={`Return quantity ${item.sku}`} value={quantities[item.id]??''} disabled={busy||!item.returnable_quantity} onChange={(e)=>change(()=>setQuantities((q)=>({...q,[item.id]:e.target.value})))} sx={{minWidth:100}} slotProps={{htmlInput:{min:0,step:1}}}/></TableCell><TableCell>{formatPrice(value({...item,return_quantity:Number(quantities[item.id]||0)}))}</TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
        <div className="my-5 flex flex-wrap gap-4"><TextField required type="date" label="Return date" name="return-date" value={date} disabled={busy} onChange={(e)=>change(()=>setDate(e.target.value))} slotProps={{inputLabel:{shrink:true}}}/><TextField label="Reason / notes" name="return-notes" multiline value={notes} disabled={busy} onChange={(e)=>change(()=>setNotes(e.target.value))} slotProps={{htmlInput:{maxLength:5000}}}/></div>
        <p className="font-semibold" data-return-preview>Return adjustment: {formatPrice(total)} · Effective invoice after return: {formatPrice(invoice.effective_total-total)} · Credit / refund due: {formatPrice(Math.max(invoice.paid_amount-invoice.effective_total+total,0))}</p>
        {confirmed&&<Alert severity="warning" sx={{mt:2}}>Confirm this return of {selected.reduce((n,i)=>n+i.return_quantity,0)} units for {formatPrice(total)}. This document cannot be edited or deleted.</Alert>}
      </>}
    </DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy||loading} onClick={()=>{setConfirmed(false);setRevision((r)=>r+1);}}>Refresh invoice</Button><Button type="submit" variant="contained" disabled={busy||loading||!invoice}>{busy?'Recording...':confirmed?'Confirm Return':'Review Return'}</Button></DialogActions>
  </form></Dialog>;
}
