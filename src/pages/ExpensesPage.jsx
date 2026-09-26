import { useEffect,useState } from 'react';
import { Alert,Button,Chip,CircularProgress,Paper,Snackbar,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField } from '@mui/material';
import ExpenseDialog from '../components/expenses/ExpenseDialog.jsx';
import LookupManagerDialog from '../components/products/LookupManagerDialog.jsx';
import { catalogRequest,formatPrice } from '../utils/catalog.js';
const defaults={search:'',category:'all',method:'all',from:'',to:''};
export default function ExpensesPage() {
  const [filters,setFilters]=useState(defaults);
  const [page,setPage]=useState(0);
  const [revision,setRevision]=useState(0);
  const [list,setList]=useState({rows:[],categories:[],loading:true,error:''});
  const [editor,setEditor]=useState(null);
  const [manager,setManager]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const refresh=()=>setRevision((r)=>r+1);
  useEffect(()=>{
    let live=true; setList((s)=>({...s,loading:true,error:''}));
    const timer=setTimeout(async()=>{
      try {
        if(!window.api?.expenses) throw new Error('Open the desktop application to manage expenses.');
        const query={search:filters.search,payment_method:filters.method,limit:26,offset:page*25};
        if(filters.category!=='all') query.expense_category_id=Number(filters.category);
        if(filters.from) query.from_date=filters.from;
        if(filters.to) query.to_date=filters.to;
        const categories=[];
        for(let offset=0;;offset+=500) {
          const batch=await catalogRequest(()=>window.api.expenseCategories.list({active:'all',limit:500,offset}));
          categories.push(...batch); if(batch.length<500) break;
        }
        const rows=await catalogRequest(()=>window.api.expenses.list(query));
        if(live) setList({rows,categories,loading:false,error:''});
      } catch(error) {if(live) setList((s)=>({...s,rows:[],loading:false,error:error.message}));}
    },200);
    return()=>{live=false;clearTimeout(timer);};
  },[filters,page,revision]);
  function filter(key,value){setFilters((f)=>({...f,[key]:value}));setPage(0);}
  async function edit(id){
    setBusy(true);setError('');
    try{setEditor({expense:await catalogRequest(()=>window.api.expenses.getById(id))});}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <section className="mx-auto min-w-0 max-w-screen-2xl" aria-labelledby="page-title">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 id="page-title" className="text-3xl font-semibold">Expenses</h1><p className="mt-2 text-sm text-slate-500">Record shop spending and organize expense categories.</p></div><div className="flex flex-wrap gap-2"><Button disabled={!window.api?.expenseCategories||busy} onClick={()=>setManager(true)}>Manage Expense Categories</Button><Button variant="contained" disabled={list.loading||Boolean(list.error)||busy} onClick={()=>setEditor({expense:null})}>Add Expense</Button></div></div>
    {error&&<Alert severity="error" sx={{mt:2}} onClose={()=>setError('')}>{error}</Alert>}
    <Paper variant="outlined" sx={{mt:3,overflow:'hidden'}}><div className="flex flex-wrap gap-3 p-5">
      <TextField size="small" label="Search expenses" name="expense-search" value={filters.search} placeholder="Description or category" onChange={(e)=>filter('search',e.target.value)} slotProps={{htmlInput:{maxLength:200}}}/>
      <TextField select size="small" label="Category" name="expense-filter-category" value={filters.category} onChange={(e)=>filter('category',e.target.value)} slotProps={{select:{native:true}}}><option value="all">All categories</option>{list.categories.map((c)=><option key={c.id} value={c.id}>{c.name}{!c.active?' (inactive)':''}</option>)}</TextField>
      <TextField select size="small" label="Payment method" name="expense-filter-method" value={filters.method} onChange={(e)=>filter('method',e.target.value)} slotProps={{select:{native:true}}}><option value="all">All methods</option>{['Cash','Bank transfer','Cheque'].map((m)=><option key={m}>{m}</option>)}</TextField>
      {['from','to'].map((key)=><TextField key={key} size="small" type="date" label={key==='from'?'From date':'To date'} name={`expense-${key}`} value={filters[key]} onChange={(e)=>filter(key,e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>)}
      <Button onClick={()=>{setFilters(defaults);setPage(0);}}>Reset filters</Button>
    </div>
    {list.loading?<div role="status" className="flex min-h-64 items-center justify-center gap-3"><CircularProgress size={24}/>Loading expenses...</div>:list.error?<Alert severity="error" sx={{m:2}} action={<Button onClick={refresh}>Retry</Button>}>{list.error}</Alert>:!list.rows.length?<div role="status" className="p-16 text-center">No expenses found. Add an expense or adjust the filters.</div>:
      <TableContainer tabIndex={0} aria-label="Expense table, scroll for more columns"><Table size="small" aria-label="Expenses" sx={{minWidth:800,'& thead th':{bgcolor:'#f8fafc',fontWeight:600},'& td':{py:1.5}}}><TableHead><TableRow>{['Date','Category','Description','Payment Method','Amount','Actions'].map((label)=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{list.rows.slice(0,25).map((row)=><TableRow key={row.id} data-expense-id={row.id}><TableCell sx={{whiteSpace:'nowrap'}}>{row.spent_at.slice(0,10)}</TableCell><TableCell>{row.category_name}{!row.category_active&&<Chip size="small" label="Inactive category"/>}</TableCell><TableCell sx={{maxWidth:340,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.description}</TableCell><TableCell>{row.payment_method}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{formatPrice(row.amount)}</TableCell><TableCell><Button disabled={busy} aria-label={`Edit expense ${row.id}`} onClick={()=>edit(row.id)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>}
    <div className="flex items-center justify-between p-3"><span className="text-sm text-slate-500">Page {page+1}</span><div><Button disabled={page===0||list.loading} onClick={()=>setPage(page-1)}>Previous</Button><Button disabled={list.loading||Boolean(list.error)||list.rows.length<=25} onClick={()=>setPage(page+1)}>Next</Button></div></div>
    </Paper>
    {editor&&<ExpenseDialog expense={editor.expense} categories={list.categories} onClose={()=>setEditor(null)} onSaved={(message)=>{setEditor(null);setNotice(message);setPage(0);refresh();}}/>}
    {manager&&<LookupManagerDialog resource="expenseCategories" onClose={()=>setManager(false)} onChanged={refresh}/>}
    <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={()=>setNotice('')} message={notice}/>
  </section>;
}
