import { useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress, Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField } from '@mui/material';
import CustomerDialog from '../components/customers/CustomerDialog.jsx';
import CustomerDetails from '../components/customers/CustomerDetails.jsx';
import AppIcon from '../components/AppIcon.jsx';
import useCustomers, { customerPageSize } from '../hooks/useCustomers.js';
import { catalogRequest } from '../utils/catalog.js';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(0);
  const list = useCustomers(search, status, page);
  const [editor, setEditor] = useState(null);
  const [details, setDetails] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [notice, setNotice] = useState('');
  function saved(message) { setEditor(null); setPage(0); setNotice(message); list.refresh(); }
  async function edit(row, viewOnly = false) {
    setBusy(true); setActionError('');
    try {
      const customer = await catalogRequest(() => window.api.customers.getById(row.id));
      if (viewOnly) setDetails(customer); else setEditor({ customer });
    }
    catch (error) { setActionError(error.message); }
    finally { setBusy(false); }
  }
  async function deactivate() {
    if (busy) return;
    setBusy(true); setConfirmationError('');
    try {
      await catalogRequest(() => window.api.customers.deactivate(confirmation.id));
      setConfirmation(null); saved('Customer deactivated. Existing records are preserved.');
    } catch (error) { setConfirmationError(error.message); }
    finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-screen-2xl min-w-0">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">Directory</p>
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 id="page-title" className="text-3xl font-semibold tracking-tight text-slate-900">Customers</h1><p className="mt-2 text-sm text-slate-500">Manage customer contacts and keep your directory up to date.</p></div>
        <Button variant="contained" onClick={() => setEditor({ customer: null })} disabled={!window.api?.customers || busy}>Add Customer</Button></div>
      {actionError && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>}
      <Paper variant="outlined" sx={{ mt: 3, overflow: 'hidden', borderColor: '#e2e8f0' }}>
        <div className="flex flex-wrap gap-3 p-5"><TextField size="small" label="Search customers" name="customer-search" placeholder="Name, phone or address" value={search} sx={{ flex: '1 1 240px' }} slotProps={{ htmlInput: { maxLength: 200 } }} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
          <TextField select size="small" label="Status" name="customer-status" value={status} sx={{ minWidth: 160 }} onChange={(event) => { setStatus(event.target.value); setPage(0); }} slotProps={{ select: { native: true } }}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option></TextField>
          <Button onClick={() => { setSearch(''); setStatus('active'); setPage(0); }}>Reset filters</Button></div>
        {busy && <LinearProgress aria-label="Loading customer" />}
        {list.loading ? <div className="flex min-h-64 items-center justify-center gap-3" role="status"><CircularProgress size={24} />Loading customers…</div>
          : list.error ? <Alert severity="error" sx={{ m: 2 }} action={<Button color="inherit" onClick={list.refresh}>Retry</Button>}>{list.error}</Alert>
            : !list.rows.length ? <div role="status" className="flex min-h-64 flex-col items-center justify-center p-6 text-center"><div className="mb-4 rounded-2xl bg-teal-50 p-4 text-teal-700"><AppIcon name="people" size={30} /></div><h2 className="text-lg font-semibold">No customers found</h2><p className="mt-2 text-sm text-slate-500">Add a customer or try different search and status filters.</p></div>
              : <TableContainer tabIndex={0} aria-label="Customer table, scroll for more columns" sx={{ maxHeight: '60vh' }}><Table size="small" stickyHeader aria-label="Customers" sx={{ minWidth: 750, '& thead th': { bgcolor: '#f8fafc', fontWeight: 600 }, '& td': { py: 1.5 } }}>
                <TableHead><TableRow>{['Name', 'Phone', 'Address', 'Notes', 'Status', 'Actions'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
                <TableBody>{list.rows.map((row) => <TableRow key={row.id} hover data-customer-id={row.id}>
                  {[row.name, row.phone, row.address, row.notes].map((value, index) => <TableCell key={index} sx={{ maxWidth: 240, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value || '—'}</TableCell>)}
                  <TableCell><Chip size="small" variant="outlined" color={row.active ? 'success' : 'default'} label={row.active ? 'Active' : 'Inactive'} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}><Button size="small" disabled={busy} aria-label={`View customer ${row.name}`} onClick={() => edit(row, true)}>Details</Button><Button size="small" disabled={busy} aria-label={`Edit customer ${row.name}`} onClick={() => edit(row)}>Edit</Button>{Boolean(row.active) && <Button size="small" color="warning" disabled={busy} aria-label={`Deactivate customer ${row.name}`} onClick={() => { setConfirmation(row); setConfirmationError(''); }}>Deactivate</Button>}</TableCell>
                </TableRow>)}</TableBody>
              </Table></TableContainer>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3"><span className="text-xs text-slate-500" aria-live="polite">{list.loading ? 'Loading…' : list.rows.length ? `Showing ${page * customerPageSize + 1}–${page * customerPageSize + list.rows.length} · Page ${page + 1}` : '0 customers on this page'}</span><div><Button disabled={page === 0 || list.loading} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button disabled={!list.hasNext || list.loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
      </Paper>
      {editor && <CustomerDialog customer={editor.customer} onClose={() => setEditor(null)} onSaved={saved} />}
      {details && <CustomerDetails customer={details} onClose={() => setDetails(null)} />}
      <Dialog open={Boolean(confirmation)} maxWidth="xs" fullWidth onClose={() => { if (!busy) setConfirmation(null); }} aria-labelledby="customer-confirm-title"><DialogTitle id="customer-confirm-title">Deactivate customer?</DialogTitle><DialogContent><DialogContentText>Deactivate “{confirmation?.name}”? It will be hidden from the active directory. Existing records will be preserved.</DialogContentText>{confirmationError && <Alert severity="error" sx={{ mt: 2 }}>{confirmationError}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button color="warning" variant="contained" disabled={busy} onClick={deactivate}>{busy ? 'Deactivating…' : 'Deactivate Customer'}</Button></DialogActions></Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice('')} message={notice} />
    </section>
  );
}
