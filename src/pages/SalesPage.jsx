import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField } from '@mui/material';
import SaleDialog from '../components/sales/SaleDialog.jsx';
import SaleDetails from '../components/sales/SaleDetails.jsx';
import SaleSelector from '../components/sales/SaleSelector.jsx';
import { catalogRequest, formatPrice } from '../utils/catalog.js';
const defaults = { search: '', from: '', to: '', status: 'all', customer: null, walkIn: false };
export default function SalesPage() {
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ rows: [], loading: true, error: '' });
  const [editor, setEditor] = useState(false);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => setRevision((r) => r + 1);
  useEffect(() => {
    let live = true; setState((s) => ({ ...s, loading: true, error: '' }));
    const timer = setTimeout(async () => {
      try {
        if (!window.api?.sales) throw new Error('Open the desktop application to manage sales.');
        const query = { search: filters.search, payment_status: filters.status, walk_in: filters.walkIn, limit: 51, offset: page * 50 };
        if (filters.customer) query.customer_id = filters.customer.id;
        if (filters.from) query.from_date = filters.from;
        if (filters.to) query.to_date = filters.to;
        const rows = await catalogRequest(() => window.api.sales.list(query));
        if (live) setState({ rows, loading: false, error: '' });
      } catch (error) { if (live) setState({ rows: [], loading: false, error: error.message }); }
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [filters,page,revision]);
  function filter(key,value) { setFilters((f) => ({ ...f, [key]: value })); setPage(0); }
  async function view(id) {
    setBusy(true); setError('');
    try { setDetails(await catalogRequest(() => window.api.sales.getById(id))); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto min-w-0 max-w-screen-2xl" aria-labelledby="page-title">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 id="page-title" className="text-3xl font-semibold">Sales / POS</h1><p className="mt-2 text-sm text-slate-500">Sell tyres, record payments and review completed sales.</p></div><Button variant="contained" disabled={!window.api?.sales || busy} onClick={() => setEditor(true)}>New Sale</Button></div>
    {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Paper variant="outlined" sx={{ mt: 3, overflow: 'hidden' }}><div className="flex flex-wrap items-start gap-3 p-5">
      <TextField size="small" label="Search sales" name="sale-search" placeholder="Invoice or customer" value={filters.search} onChange={(e) => filter('search',e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <div className="w-64"><SaleSelector kind="customers" active="all" value={filters.customer} label="Filter customer" name="sale-filter-customer" onChange={(customer) => { setFilters((f) => ({ ...f, customer, walkIn: false })); setPage(0); }} /></div>
      <Button variant={filters.walkIn ? 'contained' : 'outlined'} onClick={() => { setFilters((f) => ({ ...f, customer: null, walkIn: !f.walkIn })); setPage(0); }}>Walk-in only</Button>
      {['from','to'].map((key) => <TextField key={key} size="small" type="date" label={key === 'from' ? 'From date (UTC)' : 'To date (UTC)'} name={`sale-${key}`} value={filters[key]} onChange={(e) => filter(key,e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />)}
      <TextField select size="small" label="Payment status" name="sale-status" value={filters.status} onChange={(e) => filter('status',e.target.value)} slotProps={{ select: { native: true } }}>{['all','paid','partial','unpaid'].map((status) => <option key={status} value={status}>{status === 'all' ? 'All payments' : status}</option>)}</TextField>
      <Button onClick={() => { setFilters(defaults); setPage(0); }}>Reset filters</Button>
    </div>
      {state.loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-3"><CircularProgress size={24} />Loading sales...</div> : state.error ? <Alert severity="error" sx={{ m: 2 }} action={<Button onClick={refresh}>Retry</Button>}>{state.error}</Alert>
        : !state.rows.length ? <div role="status" className="p-16 text-center">No sales found. Start a new sale or adjust the filters.</div>
          : <TableContainer tabIndex={0} aria-label="Sales table, scroll for more columns"><Table size="small" aria-label="Sales" sx={{ minWidth: 1050 }}><TableHead><TableRow>{['Invoice','Date / time','Customer','Items','Total','Paid','Balance','Payment','Status','Actions'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{state.rows.slice(0,50).map((row) => <TableRow key={row.id} data-sale-id={row.id}><TableCell>{row.invoice_number}</TableCell><TableCell>{new Date(row.sold_at).toLocaleString('en-PK')}</TableCell><TableCell>{row.customer_name || 'Walk-in'}</TableCell><TableCell>{row.item_count}</TableCell>{[row.total,row.paid_amount,row.balance].map((value,i) => <TableCell key={i}>{formatPrice(value)}</TableCell>)}<TableCell>{row.payment_method || 'Not paid'}</TableCell><TableCell><Chip size="small" label={row.payment_status} color={row.payment_status === 'paid' ? 'success' : 'default'} /></TableCell><TableCell><Button disabled={busy} aria-label={`View sale ${row.invoice_number}`} onClick={() => view(row.id)}>Details</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>}
      <div className="flex items-center justify-between p-3"><span className="text-sm text-slate-500">Page {page + 1}</span><div><Button disabled={page === 0 || state.loading} onClick={() => setPage(page-1)}>Previous</Button><Button disabled={state.loading || state.rows.length <= 50 || Boolean(state.error)} onClick={() => setPage(page+1)}>Next</Button></div></div>
    </Paper>
    {editor && <SaleDialog onClose={() => setEditor(false)} onSaved={(sale) => { setEditor(false); setDetails(sale); setFilters(defaults); setPage(0); refresh(); }} />}
    {details && <SaleDetails sale={details} onClose={() => setDetails(null)} />}
  </section>;
}
