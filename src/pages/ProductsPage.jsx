import { useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress, Paper, Snackbar, TextField } from '@mui/material';
import AppIcon from '../components/AppIcon.jsx';
import ProductDialog from '../components/products/ProductDialog.jsx';
import ProductTable from '../components/products/ProductTable.jsx';
import useProductCatalog, { pageSize } from '../hooks/useProductCatalog.js';
import { catalogApi, catalogRequest } from '../utils/catalog.js';

const initialFilters = { search: '', brand: '', category: '', active: 'active' };

export default function ProductsPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const catalog = useProductCatalog(filters, page);
  const [editor, setEditor] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deactivate, setDeactivate] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [notice, setNotice] = useState('');
  const setFilter = (field) => (event) => { setFilters((current) => ({ ...current, [field]: event.target.value })); setPage(0); };
  const reset = () => { setFilters(initialFilters); setPage(0); };
  const saved = (message) => { setEditor(null); setNotice(message); setPage(0); catalog.refresh(); };
  async function edit(product) {
    setEditLoading(true);
    setActionError('');
    try { setEditor({ product: await catalogRequest(() => catalogApi().products.getById(product.id)) }); }
    catch (error) { setActionError(error.message); }
    finally { setEditLoading(false); }
  }
  async function confirmDeactivate() {
    if (deactivating) return;
    setDeactivating(true);
    setConfirmationError('');
    try {
      await catalogRequest(() => catalogApi().products.deactivate(deactivate.id));
      setDeactivate(null);
      saved('Product deactivated. Its history and stock have been retained.');
    } catch (error) { setConfirmationError(error.message); }
    finally { setDeactivating(false); }
  }
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-screen-2xl min-w-0">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">Catalogue</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 id="page-title" className="text-3xl font-semibold tracking-tight text-slate-900">Products / Tyres</h1>
          <p className="mt-2 text-sm text-slate-500">Manage your tyre catalogue, pricing and product details.</p></div>
        <Button aria-label="Add Product" variant="contained" onClick={() => setEditor({ product: null })} disabled={catalog.options.loading || Boolean(catalog.options.error)} startIcon={<span aria-hidden="true">+</span>}>Add Product</Button>
      </div>
      {catalog.options.error && <Alert severity="error" sx={{ mt: 3 }} action={<Button color="inherit" onClick={catalog.refresh}>Retry</Button>}>{catalog.options.error}</Alert>}
      {actionError && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>}
      <Paper variant="outlined" sx={{ mt: 3, overflow: 'hidden', borderColor: '#e2e8f0' }}>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <TextField size="small" label="Search products" name="search" placeholder="SKU, brand, model or size" value={filters.search} onChange={setFilter('search')} slotProps={{ htmlInput: { maxLength: 200 } }} />
          {[[catalog.options.brands, 'brand', 'Brand'], [catalog.options.categories, 'category', 'Category']].map(([rows, field, label]) => (
            <TextField key={field} select size="small" label={label} name={`filter-${field}`} value={filters[field]} onChange={setFilter(field)} disabled={catalog.options.loading || Boolean(catalog.options.error)} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              <option value="">All {label.toLowerCase() === 'category' ? 'categories' : 'brands'}</option>
              {rows.map((row) => <option key={row.id} value={row.id}>{row.name}{row.active ? '' : ' (inactive)'}</option>)}
            </TextField>
          ))}
          <TextField size="small" select label="Status" name="filter-status" value={filters.active} onChange={setFilter('active')} slotProps={{ select: { native: true } }}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option>
          </TextField>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
          <span>Prices in PKR · Stock shown in units</span><Button size="small" onClick={reset}>Reset filters</Button>
        </div>
        {editLoading && <LinearProgress aria-label="Loading product details" />}
        {catalog.loading ? <div className="flex min-h-64 items-center justify-center gap-3" role="status"><CircularProgress size={24} /><span>Loading products…</span></div>
          : catalog.error ? <div className="p-5"><Alert severity="error" action={<Button color="inherit" onClick={catalog.refresh}>Retry</Button>}>{catalog.error}</Alert></div>
          : !catalog.rows.length ? <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center" role="status">
            <div className="mb-4 rounded-2xl bg-teal-50 p-4 text-teal-700"><AppIcon name="tyre" size={30} /></div>
            <h2 className="text-lg font-semibold">No products found</h2><p className="mt-2 text-sm text-slate-500">Try different filters, or add a product to your catalogue.</p>
          </div> : <ProductTable rows={catalog.rows} onEdit={edit} onDeactivate={(product) => { setConfirmationError(''); setDeactivate(product); }} busy={editLoading || catalog.options.loading || Boolean(catalog.options.error)} />}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <span className="text-xs text-slate-500" aria-live="polite">{catalog.loading ? 'Loading…' : catalog.rows.length ? `Showing ${page * pageSize + 1}–${page * pageSize + catalog.rows.length} · Page ${page + 1}` : '0 products on this page'}</span>
          <div className="flex gap-2"><Button size="small" disabled={page === 0 || catalog.loading} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="small" disabled={!catalog.hasNext || catalog.loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
        </div>
      </Paper>
      {editor && <ProductDialog product={editor.product} brands={catalog.options.brands} categories={catalog.options.categories} onClose={() => setEditor(null)} onSaved={saved} />}
      <Dialog open={Boolean(deactivate)} onClose={() => { if (!deactivating) setDeactivate(null); }} aria-labelledby="deactivate-title" maxWidth="xs" fullWidth>
        <DialogTitle id="deactivate-title">Deactivate product?</DialogTitle>
        <DialogContent><DialogContentText>{deactivate?.sku} will be hidden from the active product list. Its history and current stock will be retained.</DialogContentText>{confirmationError && <Alert severity="error" sx={{ mt: 2 }}>{confirmationError}</Alert>}</DialogContent>
        <DialogActions><Button disabled={deactivating} onClick={() => setDeactivate(null)}>Cancel</Button><Button color="warning" variant="contained" disabled={deactivating} onClick={confirmDeactivate}>{deactivating ? 'Deactivating…' : 'Deactivate Product'}</Button></DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice('')} message={notice} />
    </section>
  );
}
