import {useEffect,useState} from 'react';
import {Alert,Button,CircularProgress,Paper,TextField} from '@mui/material';
import {catalogRequest,formatPrice} from '../utils/catalog.js';
import {reports,defaults,queryFilters} from '../components/reports/reportConfig.js';
import ReportFilters from '../components/reports/ReportFilters.jsx';
import ReportResults from '../components/reports/ReportResults.jsx';
import SaleDetails from '../components/sales/SaleDetails.jsx';

function ReportView({type}) {
  const config=reports[type];
  const [draft,setDraft]=useState(()=>defaults(type));
  const [query,setQuery]=useState(()=>queryFilters(defaults(type)));
  const [page,setPage]=useState(0),[revision,setRevision]=useState(0);
  const [state,setState]=useState({loading:true,error:'',data:null});
  const [detail,setDetail]=useState({busy:false,error:'',sale:null});
  useEffect(()=>{
    let live=true;setState({loading:true,error:'',data:null});
    (async()=>{
      try {
        if(!window.api?.reports)throw new Error('Open the desktop application to view reports.');
        const data=await catalogRequest(()=>window.api.reports[config.method]({...query,limit:25,offset:page*25}));
        if(live)setState({loading:false,error:'',data});
      }catch(error){if(live)setState({loading:false,error:error.message,data:null});}
    })();
    return()=>{live=false;};
  },[config.method,query,page,revision]);
  async function viewSale(id) {
    setDetail({busy:true,error:'',sale:null});
    try {setDetail({busy:false,error:'',sale:await catalogRequest(()=>window.api.sales.getById(id))});}
    catch(error){setDetail({busy:false,error:error.message,sale:null});}
  }
  function reset(){const next=defaults(type);setDraft(next);setQuery(queryFilters(next));setPage(0);}
  return <div className="min-w-0" data-report-type={type}>
    <Paper variant="outlined" sx={{p:2.5,mb:2}}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{config.title} Report</h2><Button disabled={state.loading} onClick={()=>setRevision((n)=>n+1)}>Refresh</Button></div>
      <ReportFilters config={config} draft={draft} setDraft={setDraft} onApply={()=>{setQuery(queryFilters(draft));setPage(0);}} onReset={reset} busy={state.loading}/>
      <p className="mt-4 text-xs leading-5 text-slate-500">{config.note}</p>
    </Paper>
    {detail.error&&<Alert severity="error" sx={{mb:2}} onClose={()=>setDetail((d)=>({...d,error:''}))}>{detail.error}</Alert>}
    {state.loading?<Paper variant="outlined" sx={{p:6}}><div role="status" className="flex items-center justify-center gap-3"><CircularProgress size={24}/>Loading report...</div></Paper>:state.error?<Alert severity="error" action={<Button onClick={()=>setRevision((n)=>n+1)}>Retry</Button>}>{state.error}</Alert>:state.data&&<>
      <p className="mb-3 text-xs text-slate-500" data-report-range>{state.data.range?`${state.data.range.from} – ${state.data.range.to} · Both dates inclusive · ${state.data.range.timeZone}`:'Current state · all recorded dates'}</p>
      {type==='profit'&&state.data.summary.unknownCostItemCount>0&&<Alert severity="warning" sx={{mb:2}}>Profit is Incomplete: {state.data.summary.unknownCostItemCount} zero/unknown-cost items across {state.data.summary.affectedSaleCount} sales. Gross Profit and Operating Result amounts are withheld. Recorded cost is incomplete.</Alert>}
      {type==='receivables'&&<Alert severity="info" sx={{mb:2}}>Excluded walk-in balance across all dates: {formatPrice(state.data.summary.excludedWalkInBalance)}. These sales are not customer accounts.</Alert>}
      <ReportResults config={config} data={state.data} page={page} onPage={setPage} onSale={['sales','profit'].includes(type)?viewSale:undefined} busy={detail.busy}/>
    </>}
    {detail.sale&&<SaleDetails sale={detail.sale} onClose={()=>setDetail({busy:false,error:'',sale:null})}/>}
  </div>;
}
export default function ReportsPage() {
  const [type,setType]=useState('sales');
  return <section className="mx-auto min-w-0 max-w-screen-2xl" aria-labelledby="page-title"><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h1 id="page-title" className="text-3xl font-semibold">Reports</h1><p className="mt-2 text-sm text-slate-500">Detailed, read-only business records and totals.</p></div><TextField select size="small" label="Report" name="report-type" value={type} onChange={(e)=>setType(e.target.value)} slotProps={{select:{native:true}}}>{Object.entries(reports).map(([key,config])=><option key={key} value={key}>{config.title}</option>)}</TextField></div><ReportView key={type} type={type}/></section>;
}
