import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField } from '@mui/material';
import { catalogApi, catalogRequest } from '../../utils/catalog.js';

const pageSize = 25;

export default function LookupManagerDialog({ resource, onClose, onChanged }) {
  const singular = resource === 'brands' ? 'Brand' : 'Category';
  const plural = resource === 'brands' ? 'Brands' : 'Categories';
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [list, setList] = useState({ rows: [], loading: true, error: '', hasNext: false });
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationError, setConfirmationError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setList({ rows: [], loading: true, error: '', hasNext: false });
    (async () => {
      const rows = await catalogRequest(() => catalogApi()[resource].list({
        active: status === 'all' ? 'all' : status === 'active', limit: pageSize + 1, offset: page * pageSize,
      }));
      if (!cancelled) setList({ rows: rows.slice(0, pageSize), loading: false, error: '', hasNext: rows.length > pageSize });
    })().catch((failure) => {
      if (!cancelled) setList({ rows: [], loading: false, error: failure.message, hasNext: false });
    });
    return () => { cancelled = true; };
  }, [resource, status, page, revision]);

  function resetEditor() { setEditing(null); setName(''); setFieldError(''); setError(''); }
  function changed(message) {
    resetEditor();
    setSuccess(message);
    setPage(0);
    setRevision((value) => value + 1);
    onChanged();
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim() || name.trim().length > 200) {
      setFieldError('Enter a name between 1 and 200 characters.');
      return;
    }
    setBusy(true); setError(''); setSuccess(''); setFieldError('');
    try {
      const api = catalogApi()[resource];
      await catalogRequest(() => editing ? api.update(editing.id, { name }) : api.create({ name }));
      changed(`${singular} ${editing ? 'updated' : 'added'}.`);
    } catch (failure) {
      setError(failure.message);
      if (failure.code === 'CONFLICT') setFieldError('This name is already used, including by inactive records.');
    } finally { setBusy(false); }
  }
  async function deactivate() {
    if (busy) return;
    setBusy(true); setConfirmationError(''); setSuccess('');
    try {
      await catalogRequest(() => catalogApi()[resource].deactivate(confirmation.id));
      setConfirmation(null);
      changed(`${singular} deactivated. Existing product links are preserved.`);
    } catch (failure) { setConfirmationError(failure.message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!busy && !confirmation) onClose(); }} aria-labelledby="lookup-manager-title">
        <DialogTitle id="lookup-manager-title">Manage {plural}</DialogTitle>
        <DialogContent dividers>
          <p className="mb-4 text-sm text-slate-500">Keep your product {resource === 'brands' ? 'brands' : 'categories'} organized. Deactivated entries remain linked to existing products.</p>
          {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <form onSubmit={save} noValidate className="mb-5 rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 text-sm font-semibold">{editing ? `Edit ${singular}` : `Add ${singular}`}</h3>
            <TextField fullWidth size="small" name="lookup-name" label={`${singular} name`} required value={name} disabled={busy}
              onChange={(event) => { setName(event.target.value); setFieldError(''); setError(''); }} error={Boolean(fieldError)} helperText={fieldError}
              slotProps={{ htmlInput: { maxLength: 200 } }} />
            <div className="mt-3 flex justify-end gap-2">
              {editing && <Button disabled={busy} onClick={resetEditor}>Cancel edit</Button>}
              <Button type="submit" variant="contained" disabled={busy}>{busy && !confirmation ? 'Saving…' : editing ? `Save ${singular}` : `Add ${singular}`}</Button>
            </div>
          </form>
          <TextField select size="small" label="Status" name="lookup-status" value={status} disabled={busy} sx={{ mb: 2, minWidth: 180 }}
            onChange={(event) => { setStatus(event.target.value); setPage(0); }} slotProps={{ select: { native: true } }}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </TextField>
          {list.loading ? <div className="flex min-h-32 items-center justify-center gap-3" role="status"><CircularProgress size={22} />Loading {resource}…</div>
            : list.error ? <Alert severity="error" action={<Button color="inherit" onClick={() => setRevision((value) => value + 1)}>Retry list</Button>}>{list.error}</Alert>
              : !list.rows.length ? <p role="status" className="py-8 text-center text-sm text-slate-500">No {resource} found. Add one above or change the status filter.</p>
                : <TableContainer sx={{ maxHeight: 280 }}><Table size="small" stickyHeader aria-label={`${plural} list`}>
                  <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                  <TableBody>{list.rows.map((row) => <TableRow key={row.id} data-lookup-id={row.id}>
                    <TableCell sx={{ overflowWrap: 'anywhere', maxWidth: 200 }}>{row.name}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" color={row.active ? 'success' : 'default'} label={row.active ? 'Active' : 'Inactive'} /></TableCell>
                    <TableCell align="right">
                      <Button size="small" disabled={busy} aria-label={`Edit ${singular.toLowerCase()} ${row.name}`} onClick={() => { setEditing(row); setName(row.name); setError(''); setFieldError(''); setSuccess(''); }}>Edit</Button>
                      {Boolean(row.active) && <Button size="small" color="warning" disabled={busy} aria-label={`Deactivate ${singular.toLowerCase()} ${row.name}`} onClick={() => { setConfirmation(row); setConfirmationError(''); }}>Deactivate</Button>}
                    </TableCell>
                  </TableRow>)}</TableBody>
                </Table></TableContainer>}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Page {page + 1}</span><div>
              <Button disabled={busy || list.loading || page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <Button disabled={busy || list.loading || !list.hasNext} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={onClose}>Done</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(confirmation)} fullWidth maxWidth="xs" onClose={() => { if (!busy) setConfirmation(null); }} aria-labelledby="lookup-confirm-title">
        <DialogTitle id="lookup-confirm-title">Deactivate {singular.toLowerCase()}?</DialogTitle>
        <DialogContent><DialogContentText>Deactivate “{confirmation?.name}”? It will no longer be available for new product selections. Existing products and their history will be preserved.</DialogContentText>
          {confirmationError && <Alert severity="error" sx={{ mt: 2 }}>{confirmationError}</Alert>}
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button color="warning" variant="contained" disabled={busy} onClick={deactivate}>{busy ? 'Deactivating…' : `Deactivate ${singular}`}</Button></DialogActions>
      </Dialog>
    </>
  );
}
