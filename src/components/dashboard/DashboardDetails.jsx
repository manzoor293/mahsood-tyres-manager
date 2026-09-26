import { Button,Chip,Paper,Table,TableBody,TableCell,TableContainer,TableHead,TableRow } from '@mui/material';
import { Link } from 'react-router-dom';
import { formatPrice } from '../../utils/catalog.js';

function Panel({title,note,children,action}) {
  return <Paper variant="outlined" sx={{p:2.5,minWidth:0}}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2>{action}</div><p className="mb-4 mt-1 text-xs leading-5 text-slate-500">{note}</p>{children}</Paper>;
}
export function TopProducts({rows}) {
  return <Panel title="Top Selling Products" note="Top 5 by units sold · item revenue before invoice discounts. Product descriptions reflect the current catalog.">
    {!rows.length?<p className="py-6 text-sm text-slate-500">No products sold in this period.</p>:<ol className="divide-y divide-slate-100">{rows.map((row,index)=><li key={row.product_id} className="flex flex-wrap justify-between gap-3 py-3" data-top-product={row.product_id}><div className="min-w-0"><p className="break-words font-medium"><span className="mr-2 text-slate-400">{index+1}.</span>{row.model}</p><p className="mt-1 break-words text-xs text-slate-500">{row.sku} · {row.brand_name||'No brand'} · {row.size}</p></div><div><p className="text-sm font-semibold">{row.quantitySold} units</p><p className="mt-1 text-xs text-slate-500">{formatPrice(row.itemRevenue)}</p></div></li>)}</ol>}
  </Panel>;
}
export function StockAlerts({rows,total}) {
  return <Panel title="Stock Alerts" note={`Current active inventory · showing ${rows.length} of ${total} alerts. Out of stock first.`} action={<Button component={Link} to="/inventory" size="small">View Inventory</Button>}>
    {!rows.length?<p className="py-6 text-sm text-slate-500">No active products need replenishment.</p>:<TableContainer tabIndex={0} aria-label="Stock alerts, scroll for more columns"><Table size="small" aria-label="Stock alerts" sx={{minWidth:480}}><TableHead><TableRow>{['Product / SKU','Size','Stock / Min','Status'].map((label)=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((row)=><TableRow key={row.product_id} data-stock-alert={row.product_id}><TableCell sx={{overflowWrap:'anywhere',maxWidth:220}}>{row.model}<div className="text-xs text-slate-500">{row.sku}</div></TableCell><TableCell>{row.size}</TableCell><TableCell>{row.quantity} / {row.minimum_stock}</TableCell><TableCell><Chip size="small" color={row.stock_status==='out'?'error':'warning'} label={row.stock_status==='out'?'Out of stock':'Low stock'}/></TableCell></TableRow>)}</TableBody></Table></TableContainer>}
  </Panel>;
}
export function RecentActivity({rows}) {
  return <Panel title="Recent Activity" note="Latest 10 records in the selected period, by business date. Date-only records have no recorded time.">
    {!rows.length?<p className="py-6 text-sm text-slate-500">No activity in this period.</p>:<ul className="divide-y divide-slate-100">{rows.map((row)=><li key={`${row.type}-${row.id}`} className="flex flex-wrap justify-between gap-2 py-3" data-activity={`${row.type}-${row.id}`}><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{row.type}</p><p className="my-1 break-words text-sm font-medium">{row.reference}</p><p className="text-xs text-slate-500">{row.occurredAt.length===10?row.occurredAt:new Date(row.occurredAt).toLocaleString()}</p></div><span className="text-sm font-medium">{row.amount===null?`${row.quantity>0?'+':''}${row.quantity} units`:formatPrice(row.amount)}</span></li>)}</ul>}
  </Panel>;
}
