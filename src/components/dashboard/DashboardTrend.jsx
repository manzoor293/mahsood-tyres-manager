import { Paper } from '@mui/material';
import { formatPrice } from '../../utils/catalog.js';

export default function DashboardTrend({ rows,grouping,summary }) {
  const max=Math.max(1,...rows.map((row)=>row.revenue));
  const comparisonMax=Math.max(1,summary.salesRevenue,summary.expenses);
  const width=720,height=180,left=8,plotWidth=704;
  const points=rows.map((row,i)=>`${left+(rows.length===1?plotWidth/2:i*plotWidth/(rows.length-1))},${height-12-row.revenue/max*(height-28)}`).join(' ');
  return <Paper variant="outlined" sx={{p:2.5,minWidth:0}}>
    <h2 className="text-lg font-semibold">Sales Trend</h2>
    <p className="mt-1 text-xs text-slate-500">{grouping==='month'?'Monthly':'Daily'} revenue after discounts · zero-sales periods included</p>
    <div className="mt-5 flex justify-between text-xs text-slate-500"><span>{formatPrice(max===1&&!rows.some((r)=>r.revenue)?0:max)}</span><span>Sales revenue</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${grouping==='month'?'Monthly':'Daily'} sales revenue trend`}>
      <line x1={left} x2={width-left} y1={height-12} y2={height-12} stroke="#cbd5e1"/>
      <polyline points={points} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round"/>
      {rows.map((row,i)=><circle key={row.bucket} cx={left+(rows.length===1?plotWidth/2:i*plotWidth/(rows.length-1))} cy={height-12-row.revenue/max*(height-28)} r={rows.length>40?2:3.5} fill="#0f766e"><title>{row.bucket}: {formatPrice(row.revenue)}, {row.count} invoices</title></circle>)}
    </svg>
    <div className="flex justify-between text-xs text-slate-500"><span>{rows[0]?.bucket}</span><span>{rows.at(-1)?.bucket}</span></div>
    <details className="mt-3 text-sm"><summary className="cursor-pointer text-teal-800">View trend values</summary><div className="mt-2 max-h-60 overflow-auto"><table className="w-full text-left" aria-label="Sales trend values"><thead><tr><th scope="col">Period</th><th scope="col">Revenue</th><th scope="col">Invoices</th></tr></thead><tbody>{rows.map((r)=><tr key={r.bucket}><td>{r.bucket}</td><td>{formatPrice(r.revenue)}</td><td>{r.count}</td></tr>)}</tbody></table></div></details>
    <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="font-semibold">Sales vs Expenses</h3><p className="mt-1 text-xs text-slate-500">Comparison only: the difference is not profit. Cost of goods is not included here.</p>
      {[['Sales revenue',summary.salesRevenue,'#0f766e'],['Expenses',summary.expenses,'#d97706']].map(([label,value,color])=><div key={label} className="mt-4"><div className="mb-1 flex flex-wrap justify-between gap-2 text-sm"><span>{label}</span><span>{formatPrice(value)}</span></div><div className="h-2 rounded bg-slate-100"><div style={{width:`${value/comparisonMax*100}%`,backgroundColor:color}} className="h-2 rounded"/></div></div>)}
    </div>
  </Paper>;
}
