import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { catalogRequest, parsePrice, priceInput } from '../../utils/catalog.js';
const today = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
export default function ExpenseDialog({ expense, categories, onClose, onSaved }) {
  const initial = { expense_category_id: String(expense?.expense_category_id || ''), amount: expense ? priceInput(expense.amount) : '',
    spent_at: expense?.spent_at.slice(0,10) || today(), payment_method: expense?.payment_method || 'Cash', description: expense?.description || '' };
  const [data,setData]=useState(initial);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const saving=useRef(false);
  const change=(field,value)=>{ setData((d)=>({...d,[field]:value})); setError(''); };
  async function save(event) {
    event.preventDefault(); if(saving.current) return; setError('');
    if(!data.expense_category_id) { setError('Select an expense category. Create one using Manage Expense Categories if needed.'); return; }
    const amount=parsePrice(data.amount);
    if(amount===null || amount<=0) { setError('Amount must be greater than zero, with at most two decimal places.'); return; }
    if(!data.spent_at || !data.description.trim()) { setError('Expense date and description are required.'); return; }
    const payload={...data,expense_category_id:Number(data.expense_category_id),amount};
    if(expense) for(const field of Object.keys(payload)) if(data[field]===initial[field]) delete payload[field];
    if(expense && !Object.keys(payload).length) { onClose(); return; }
    saving.current=true; setBusy(true);
    try {
      await catalogRequest(()=>expense ? window.api.expenses.update(expense.id,payload) : window.api.expenses.create(payload));
      onSaved(expense ? 'Expense updated.' : 'Expense added.');
    } catch(error) { setError(error.message); }
    finally { saving.current=false; setBusy(false); }
  }
  const available=categories.filter((c)=>c.active || c.id===expense?.expense_category_id);
  const methods=['Cash','Bank transfer','Cheque'];
  if(expense && !methods.includes(expense.payment_method)) methods.push(expense.payment_method);
  return <Dialog open fullWidth maxWidth="sm" onClose={()=>{if(!saving.current) onClose();}} aria-labelledby="expense-form-title"><form onSubmit={save} noValidate>
    <DialogTitle id="expense-form-title">{expense ? 'Edit Expense' : 'Add Expense'}</DialogTitle><DialogContent dividers>
      <p className="mb-5 text-sm text-slate-500">Record shop spending. Amounts are in Pakistani rupees.</p>
      {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
      {!available.length && <Alert severity="info" sx={{mb:2}}>Create an active expense category before adding an expense.</Alert>}
      <div className="flex flex-col gap-4">
        <TextField select label="Category" name="expense-category" value={data.expense_category_id} disabled={busy} onChange={(e)=>change('expense_category_id',e.target.value)} slotProps={{select:{native:true},inputLabel:{shrink:true}}}><option value="">Select category</option>{available.map((c)=><option key={c.id} value={c.id}>{c.name}{!c.active?' (inactive — retained)':''}</option>)}</TextField>
        <TextField label="Amount (Rs.)" name="expense-amount" value={data.amount} disabled={busy} onChange={(e)=>change('amount',e.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
        <TextField type="date" label="Expense date" name="expense-date" value={data.spent_at} disabled={busy} onChange={(e)=>change('spent_at',e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
        <TextField select label="Payment method" name="expense-method" value={data.payment_method} disabled={busy} onChange={(e)=>change('payment_method',e.target.value)} slotProps={{select:{native:true}}}>{methods.map((method)=><option key={method}>{method}</option>)}</TextField>
        <TextField multiline minRows={3} label="Description" name="expense-description" value={data.description} disabled={busy} onChange={(e)=>change('description',e.target.value)} slotProps={{htmlInput:{maxLength:5000}}}/>
      </div>
    </DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy?'Saving...':expense?'Save Expense':'Create Expense'}</Button></DialogActions>
  </form></Dialog>;
}
