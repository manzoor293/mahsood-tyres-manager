import { useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Paper, Snackbar, Tab, Tabs, TextField } from '@mui/material';
import useInventory, { inventoryDefaults } from '../hooks/useInventory.js';
import InventoryTable, { stockLabels } from '../components/inventory/InventoryTable.jsx';
import AdjustmentDialog from '../components/inventory/AdjustmentDialog.jsx';
import { catalogRequest } from '../utils/catalog.js';

function SelectFilter({ label, name, value, onChange, children }) {
  return <TextField select size="small" label={label} name={name} value={value} onChange={(e) => onChange(e.target.value)} slotProps={{ select: { native: true } }}>{children}</TextField>;
}
export default function InventoryPage() {
  const [tab, setTab] = useState('stock');
  const [filters, setFilters] = useState(inventoryDefaults);
  const [product, setProduct] = useState(null);
  const [page, setPage] = useState(0);
  const list = useInventory(tab, filters, product?.product_id, page);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function filter(key, value) { setFilters((f) => ({ ...f, [key]: value })); setPage(0); }
  function reset() { setFilters(inventoryDefaults); setProduct(null); setPage(0); }
  async function adjust(row) {
    setBusy(true); setError('');
    try { setEditor(await catalogRequest(() => window.api.inventory.getProductStock(row.product_id))); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto min-w-0 max-w-screen-2xl" aria-labelledby="page-title">
    <h1 id="page-title" className="text-3xl font-semibold">Inventory</h1><p className="mt-2 text-sm text-slate-500">Review tyre availability, trace stock movements and record stock corrections.</p>
    {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Paper variant="outlined" sx={{ mt: 3, overflow: 'hidden' }}>
      <Tabs value={tab} onChange={(_, value) => { setTab(value); setPage(0); }} aria-label="Inventory views"><Tab value="stock" label="Current Stock" /><Tab value="movements" label="Stock Movements" /></Tabs>
      <div className="flex flex-wrap gap-3 p-5">
        <TextField size="small" label="Search stock" name="inventory-search" value={filters.search} placeholder="SKU, brand, model or size" onChange={(e) => filter('search', e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <SelectFilter label="Brand" name="inventory-brand" value={filters.brand} onChange={(value) => filter('brand', value)}><option value="all">All brands</option>{list.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectFilter>
        <SelectFilter label="Category" name="inventory-category" value={filters.category} onChange={(value) => filter('category', value)}><option value="all">All categories</option>{list.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectFilter>
        <SelectFilter label="Product status" name="inventory-active" value={filters.active} onChange={(value) => filter('active', value)}><option value="all">All products</option><option value="active">Active</option><option value="inactive">Inactive</option></SelectFilter>
        {tab === 'stock' ? <SelectFilter label="Stock status" name="inventory-status" value={filters.stock} onChange={(value) => filter('stock', value)}><option value="all">All stock levels</option>{Object.entries(stockLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectFilter> : <>
          <SelectFilter label="Movement type" name="inventory-type" value={filters.type} onChange={(value) => filter('type', value)}><option value="all">All movements</option>{['PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING_STOCK'].map((type) => <option key={type}>{type}</option>)}</SelectFilter>
          {['from', 'to'].map((key) => <TextField key={key} size="small" type="date" label={key === 'from' ? 'From date (UTC)' : 'To date (UTC)'} name={`inventory-${key}`} value={filters[key]} onChange={(e) => filter(key, e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />)}
        </>}
        <Button onClick={reset}>Reset filters</Button><Button onClick={list.refresh} disabled={list.loading}>Refresh</Button>
      </div>
      {tab === 'movements' && product && <Chip sx={{ ml: 2, mb: 2 }} label={`History: ${product.sku}`} onDelete={() => { setProduct(null); setPage(0); }} />}
      {list.loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-3"><CircularProgress size={24} />Loading inventory...</div>
        : list.error ? <Alert severity="error" sx={{ m: 2 }} action={<Button onClick={list.refresh}>Retry</Button>}>{list.error}</Alert>
          : !list.rows.length ? <div role="status" className="p-16 text-center">{tab === 'stock' ? 'No stock records found.' : 'No stock movements found.'} Try changing the filters.</div>
            : <InventoryTable rows={list.rows.slice(0, 50)} history={tab === 'movements'} busy={busy} onAdjust={adjust} onHistory={(row) => { setProduct(row); setFilters(inventoryDefaults); setPage(0); setTab('movements'); }} />}
      <div className="flex items-center justify-between border-t border-slate-100 p-3"><span className="text-sm text-slate-500">Page {page + 1}</span><div><Button disabled={page === 0 || list.loading} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button disabled={list.loading || Boolean(list.error) || list.rows.length <= 50} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>
    </Paper>
    {editor && <AdjustmentDialog product={editor} onClose={() => setEditor(null)} onSaved={(stock) => { setEditor(null); setNotice(`Stock updated. ${stock.sku}: ${stock.quantity} units.`); list.refresh(); }} />}
    <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice('')} message={notice} />
  </section>;
}
