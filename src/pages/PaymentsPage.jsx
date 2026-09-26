import {useEffect,useState} from 'react';
import {Alert,Button,CircularProgress,Paper,Snackbar,Tab,Tabs,TextField} from '@mui/material';
import {catalogRequest,formatPrice} from '../utils/catalog.js';
import ReportLookup from '../components/reports/ReportLookup.jsx';
import PaymentDialog from '../components/payments/PaymentDialog.jsx';
import PaymentTable from '../components/payments/PaymentTable.jsx';
const defaults={contact:null,search:'',period:'all',payment_method:'all',from_date:'',to_date:''};
function PaymentWorkspace({kind}) {
  const customer=kind==='customer',resource=customer?'customerPayments':'supplierPayments';
  const contactField=customer?'customer_id':'supplier_id',invoiceField=customer?'sale_id':'purchase_id';
  const [view,setView]=useState('open'),[draft,setDraft]=useState(defaults),[filters,setFilters]=useState(defaults);
  const [page,setPage]=useState(0),[revision,setRevision]=useState(0),[invoiceId,setInvoiceId]=useState(null),[notice,setNotice]=useState('');
  const [state,setState]=useState({loading:true,error:'',data:null,account:null});
  useEffect(()=>{
    let live=true;setState({loading:true,error:'',data:null,account:null});
    (async()=>{
      try {
        if(!window.api?.[resource])throw new Error('Open the desktop application to manage payments.');
        const query={search:filters.search,limit:25,offset:page*25,...(filters.contact?{[contactField]:filters.contact.id}:{})};
        if(view==='history')Object.assign(query,{period:filters.period,payment_method:filters.payment_method},filters.period==='custom'?{from_date:filters.from_date,to_date:filters.to_date}:{});
        const [data,account]=await Promise.all([catalogRequest(()=>window.api[resource][view==='history'?'history':'list'](query)),filters.contact?catalogRequest(()=>window.api[resource].getAccountSummary(filters.contact.id)):Promise.resolve(null)]);
        if(live)setState({loading:false,error:'',data,account,view});
      }catch(error){if(live)setState({loading:false,error:error.message,data:null,account:null,view});}
    })();return()=>{live=false;};
  },[resource,contactField,filters,view,page,revision]);
  const apply=()=>{setFilters({...draft});setPage(0);};
  const refresh=()=>setRevision((n)=>n+1);
  const change=(key,value)=>setDraft((d)=>({...d,[key]:value}));
  return <div data-payment-kind={kind}>
    <Paper variant="outlined" sx={{p:2.5,mt:2}}><form className="flex flex-wrap items-start gap-3" onSubmit={(e)=>{e.preventDefault();apply();}}>
      <ReportLookup field={contactField} value={draft.contact} onChange={(row)=>change('contact',row)}/><TextField size="small" label="Invoice / account search" name="payment-search" value={draft.search} onChange={(e)=>change('search',e.target.value)} slotProps={{htmlInput:{maxLength:200}}}/>
      {view==='history'&&<><TextField select size="small" label="Period" name="payment-period" value={draft.period} onChange={(e)=>change('period',e.target.value)} slotProps={{select:{native:true}}}>{[['all','All dates'],['today','Today'],['week','Last 7 days'],['month','This month'],['year','This year'],['custom','Custom range']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</TextField><TextField size="small" label="Payment method" name="payment-filter-method" value={draft.payment_method} onChange={(e)=>change('payment_method',e.target.value)} helperText="all or an exact recorded method" slotProps={{htmlInput:{maxLength:80}}}/>
        {draft.period==='custom'&&['from_date','to_date'].map((key)=><TextField key={key} size="small" required type="date" label={key==='from_date'?'From date':'To date'} name={`payment-${key}`} value={draft[key]} onChange={(e)=>change(key,e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>)}
      </>}
      <Button type="submit" variant="contained" disabled={state.loading}>Apply filters</Button><Button disabled={state.loading} onClick={()=>{setDraft(defaults);setFilters(defaults);setPage(0);refresh();}}>Reset filters</Button><Button disabled={state.loading} onClick={refresh}>Refresh</Button>
    </form><p className="mt-3 text-xs leading-5 text-slate-500">{customer?'Customer-linked invoices only; walk-in sales are excluded.':'Payments against existing purchase invoices.'} Inactive accounts may settle existing balances. History includes initial and later linked payments.</p></Paper>
    <Tabs value={view} onChange={(_,value)=>{setView(value);setPage(0);}} aria-label="Payment view" sx={{my:2}}><Tab value="open" label="Open invoices"/><Tab value="history" label="Payment history"/></Tabs>
    {state.loading||state.view!==view?<Paper variant="outlined" sx={{p:6}}><div role="status" className="flex items-center justify-center gap-3"><CircularProgress size={24}/>Loading payments...</div></Paper>:state.error?<Alert severity="error" action={<Button onClick={refresh}>Retry</Button>}>{state.error}</Alert>:state.data&&<>
      {state.account&&<Paper variant="outlined" sx={{p:2,mb:2}} data-account-summary><p className="mb-2 font-semibold">{state.account.name} · Account totals across all invoices and dates</p><div className="flex flex-wrap gap-5">{[[customer?'Total invoiced':'Total purchased',state.account.total],[customer?'Total received':'Total paid',state.account.paid],[customer?'Current receivable':'Current payable',state.account.outstanding]].map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{formatPrice(value)}</p></div>)}</div></Paper>}
      <p className="mb-3 text-sm text-slate-500" data-payment-summary>{view==='history'?`Matching payments: ${formatPrice(state.data.summary.amount)}`:`Matching open invoices: ${formatPrice(state.data.summary.total)} total · ${formatPrice(state.data.summary.paid)} paid · ${formatPrice(state.data.summary.outstanding)} outstanding`} · Totals include all matching pages.</p>
      {view==='history'&&<p className="mb-3 text-xs text-slate-500">{state.data.range?`${state.data.range.from} – ${state.data.range.to} · Inclusive local dates · ${state.data.range.timeZone}`:'All recorded payment dates.'} Payment records are read-only.</p>}
      <Paper variant="outlined" sx={{overflow:'hidden'}}><PaymentTable data={state.data} history={view==='history'} page={page} onPage={setPage} onPay={setInvoiceId}/></Paper>
    </>}
    {invoiceId!==null&&<PaymentDialog resource={resource} invoiceId={invoiceId} contactField={contactField} invoiceField={invoiceField} onClose={()=>setInvoiceId(null)} onSaved={(result)=>{setInvoiceId(null);setPage(0);refresh();setNotice(`Payment recorded. Remaining balance: ${formatPrice(result.invoice.balance)}`);}}/>}
    <Snackbar open={Boolean(notice)} message={notice} autoHideDuration={5000} onClose={()=>setNotice('')}/>
  </div>;
}
export default function PaymentsPage() {
  const [kind,setKind]=useState('customer');
  return <section className="mx-auto min-w-0 max-w-screen-2xl" aria-labelledby="page-title"><h1 id="page-title" className="text-3xl font-semibold">Payments</h1><p className="mt-2 text-sm text-slate-500">Receive customer payments and settle supplier invoices.</p><Tabs value={kind} onChange={(_,value)=>setKind(value)} aria-label="Payment account type" sx={{mt:2}}><Tab value="customer" label="Customer Payments"/><Tab value="supplier" label="Supplier Payments"/></Tabs><PaymentWorkspace key={kind} kind={kind}/></section>;
}
