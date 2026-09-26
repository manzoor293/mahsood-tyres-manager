import {Button,Paper,Table,TableBody,TableCell,TableContainer,TableHead,TableRow} from '@mui/material';
import {formatPrice} from '../../utils/catalog.js';
function display(value,column) {
  if(column.type==='money')return value===null?'Incomplete':formatPrice(value);
  if(column.type==='number')return value.toLocaleString('en-PK');
  if(column.type==='date')return value.length===10?value:new Date(value).toLocaleString('en-PK');
  if(column.type==='active')return value?'Active':'Inactive';
  if(column.key==='stock_status')return {in:'In stock',low:'Low stock',out:'Out of stock'}[value];
  if(column.key==='contact_name')return value||'Walk-in';
  return value||'—';
}
export default function ReportResults({config,data,page,onPage,onSale,busy}) {
  return <>
    <p className="mb-3 text-xs text-slate-500">Totals cover all {data.totalRows.toLocaleString()} matching rows, not only this page.</p>
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{config.summary.map((column)=><Paper key={column.key} variant="outlined" sx={{p:2,minWidth:0}} data-report-metric={column.key}><h3 className="text-xs text-slate-500">{column.label}</h3><p className="mt-2 break-words text-xl font-semibold">{display(data.summary[column.key],column)}</p></Paper>)}</div>
    <Paper variant="outlined" sx={{overflow:'hidden'}}>
      {!data.rows.length?<p role="status" className="p-10 text-center text-slate-500">No matching records. Try another period or adjust the filters.</p>:<TableContainer tabIndex={0} aria-label={`${config.title} report, scroll for more columns`}><Table size="small" aria-label={`${config.title} report`} sx={{minWidth:760,'& thead th':{bgcolor:'#f8fafc',fontWeight:600},'& td':{py:1.5}}}><TableHead><TableRow>{config.columns.map((column)=><TableCell key={column.key} align={['money','number'].includes(column.type)?'right':'left'}>{column.label}</TableCell>)}{onSale&&<TableCell>Details</TableCell>}</TableRow></TableHead><TableBody>{data.rows.map((row)=><TableRow key={row.id??row.product_id} data-report-row={row.id??row.product_id}>{config.columns.map((column)=><TableCell key={column.key} align={['money','number'].includes(column.type)?'right':'left'} sx={['money','number','date'].includes(column.type)?{whiteSpace:'nowrap'}:{minWidth:100,maxWidth:280,overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{display(row[column.key],column)}</TableCell>)}{onSale&&<TableCell><Button size="small" disabled={busy} aria-label={`View sale ${row.invoice_number}`} onClick={()=>onSale(row.id)}>View items</Button></TableCell>}</TableRow>)}</TableBody></Table></TableContainer>}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3"><span className="text-sm text-slate-500" data-report-page>Page {page+1} of {Math.max(1,Math.ceil(data.totalRows/25))} · {data.totalRows} rows</span><div><Button disabled={page===0||busy} onClick={()=>onPage(page-1)}>Previous</Button><Button disabled={(page+1)*25>=data.totalRows||busy} onClick={()=>onPage(page+1)}>Next</Button></div></div>
    </Paper>
  </>;
}
