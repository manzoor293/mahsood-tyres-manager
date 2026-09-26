import { useEffect,useState } from 'react';
import { Alert,Button,CircularProgress,Paper,TextField } from '@mui/material';
import { catalogRequest } from '../utils/catalog.js';
import DashboardSummary from '../components/dashboard/DashboardSummary.jsx';
import DashboardTrend from '../components/dashboard/DashboardTrend.jsx';
import { TopProducts,StockAlerts,RecentActivity } from '../components/dashboard/DashboardDetails.jsx';

export default function DashboardPage() {
  const [filters,setFilters]=useState({period:'month'});
  const [custom,setCustom]=useState({from_date:'',to_date:''});
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState({loading:true,error:'',data:null});
  const refresh=()=>setRevision((value)=>value+1);
  useEffect(()=>{
    let live=true;
    setState({loading:true,error:'',data:null});
    (async()=>{
      try {
        if (!window.api?.dashboard) throw new Error('Open the desktop application to view the dashboard.');
        const data=await catalogRequest(()=>window.api.dashboard.getOverview(filters));
        if (live) setState({loading:false,error:'',data});
      } catch(error) { if(live) setState({loading:false,error:error.message,data:null}); }
    })();
    return()=>{live=false;};
  },[filters,revision]);
  const data=state.data;
  return <section className="mx-auto min-w-0 max-w-screen-2xl" aria-labelledby="page-title">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h1 id="page-title" className="text-3xl font-semibold">Dashboard</h1><p className="mt-2 text-sm text-slate-500">Sales, spending and stock at a glance.</p></div><div className="flex flex-wrap gap-2">
      <TextField select size="small" label="Period" name="dashboard-period" value={filters.period} onChange={(e)=>{const period=e.target.value;setFilters(period==='custom'?{period,from_date:data?.range.from||custom.from_date,to_date:data?.range.to||custom.to_date}:{period});if(period==='custom')setCustom({from_date:data?.range.from||custom.from_date,to_date:data?.range.to||custom.to_date});}} slotProps={{select:{native:true}}}>
        <option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="year">This year</option><option value="custom">Custom range</option>
      </TextField><Button variant="outlined" disabled={state.loading} onClick={refresh}>Refresh</Button>
    </div></div>
    {filters.period==='custom'&&<form className="mb-4 flex flex-wrap gap-3" onSubmit={(e)=>{e.preventDefault();setFilters({period:'custom',...custom});}}>{['from_date','to_date'].map((key)=><TextField key={key} required size="small" type="date" name={`dashboard-${key}`} label={key==='from_date'?'From date':'To date'} value={custom[key]} onChange={(e)=>setCustom((c)=>({...c,[key]:e.target.value}))} slotProps={{inputLabel:{shrink:true}}}/>)}<Button type="submit">Apply dates</Button></form>}
    {state.loading?<Paper variant="outlined" sx={{p:6}}><div role="status" className="flex items-center justify-center gap-3"><CircularProgress size={24}/>Loading dashboard...</div></Paper>:state.error?<Alert severity="error" action={<Button onClick={refresh}>Retry</Button>}>{state.error}</Alert>:data&&<>
      <p className="mb-4 text-xs leading-5 text-slate-500" data-dashboard-range>{data.range.from} – {data.range.to} · Both dates inclusive · {data.range.timeZone}. Balances and stock are current across all dates.</p>
      {!data.summary.saleCount&&!data.summary.purchaseCount&&!data.summary.expenses&&!data.recentActivity.length&&<Alert severity="info" sx={{mb:2}}>No business activity in this period. Record sales, purchases or expenses, or choose another period.</Alert>}
      {data.summary.unknownCostItemCount>0&&<Alert severity="warning" sx={{mb:2}}>Gross profit is incomplete: {data.summary.unknownCostItemCount} historical sale item(s) have zero cost, which may mean the purchase cost was unknown. No profit amount is shown.</Alert>}
      <DashboardSummary summary={data.summary}/>
      <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-2"><DashboardTrend rows={data.salesTrend} grouping={data.range.grouping} summary={data.summary}/><TopProducts rows={data.topProducts}/><StockAlerts rows={data.stockAlerts} total={data.summary.lowStockCount+data.summary.outOfStockCount}/><RecentActivity rows={data.recentActivity}/></div>
    </>}
  </section>;
}
