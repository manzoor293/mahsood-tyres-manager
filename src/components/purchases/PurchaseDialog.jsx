import { useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { catalogRequest, formatPrice, parsePrice } from '../../utils/catalog.js';

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const blankItem = () => ({ key: crypto.randomUUID(), product: null, quantity: '1', cost: '' });

function ProductSelector({ value, onChange, disabled, index }) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await catalogRequest(() => window.api.products.list({ search, active: true, limit: 100 }));
        if (live) { setOptions(rows); setError(''); }
      } catch (error) { if (live) setError(error.message); }
      finally { if (live) setLoading(false); }
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [search]);
  return <Autocomplete sx={{ minWidth: 260, flex: 3 }} disabled={disabled} value={value} options={options} loading={loading}
    filterOptions={(rows) => rows} isOptionEqualToValue={(a, b) => a.id === b.id}
    getOptionLabel={(p) => `${p.sku} · ${p.model} · ${p.size}`} onInputChange={(_, value) => setSearch(value)} onChange={(_, product) => onChange(product)}
    renderInput={(params) => <TextField {...params} label={`Product ${index + 1}`} error={Boolean(error)} helperText={error || 'Search SKU, model or size'} />} />;
}

export default function PurchaseDialog({ suppliers, onClose, onSaved }) {
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(localDate);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([blankItem()]);
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('0');
  const [method, setMethod] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const subtotal = items.reduce((sum, item) => sum + (parsePrice(item.cost) || 0) * (Number(item.quantity) || 0), 0);
  const total = subtotal - (parsePrice(discount) || 0);
  const balance = total - (parsePrice(paid) || 0);
  function change(key, patch) {
    if (patch.product && items.some((item) => item.key !== key && item.product?.id === patch.product.id)) {
      setError('This product is already in the purchase. Change its quantity instead.'); return;
    }
    setError(''); setItems((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  }
  async function save(event) {
    event.preventDefault();
    if (saving.current) return;
    setError('');
    if (!supplier || !invoice.trim() || !date) { setError('Supplier, invoice number and purchase date are required.'); return; }
    if (items.some((item) => !item.product || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !(parsePrice(item.cost) > 0))) {
      setError('Select a product, positive whole quantity and positive unit cost for every item.'); return;
    }
    if ([discount, paid].some((value) => parsePrice(value) === null)) { setError('Enter non-negative amounts with at most two decimal places.'); return; }
    saving.current = true; setBusy(true);
    try {
      await catalogRequest(() => window.api.purchases.create({ supplier_id: Number(supplier), invoice_number: invoice, purchased_at: date, notes,
        items: items.map((item) => ({ product_id: item.product.id, quantity: Number(item.quantity), unit_cost: parsePrice(item.cost) })),
        discount: parsePrice(discount), paid_amount: parsePrice(paid), payment_method: method }));
      onSaved();
    } catch (error) { setError(error.message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Dialog open maxWidth="lg" fullWidth onClose={() => { if (!saving.current) onClose(); }} aria-labelledby="purchase-entry-title">
    <form onSubmit={save} noValidate><DialogTitle id="purchase-entry-title">New Purchase</DialogTitle><DialogContent dividers>
      <Alert severity="info" sx={{ mb: 3 }}>Saving receives stock immediately. Completed purchases are read-only; check all items before saving. Amounts are in Pakistani rupees.</Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="flex flex-wrap gap-4">
          <TextField select label="Supplier" name="purchase-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} sx={{ minWidth: 240, flex: 1 }} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}><option value="">Select active supplier</option>{suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</TextField>
          <TextField label="Invoice number" name="purchase-invoice" value={invoice} onChange={(e) => setInvoice(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField type="date" label="Purchase date" name="purchase-date" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <h3 className="my-5 font-semibold">Purchase items</h3>
        {items.map((item, index) => <div key={item.key} className="mb-4 flex flex-wrap items-start gap-3" data-purchase-item={index}>
          <ProductSelector index={index} disabled={busy} value={item.product} onChange={(product) => change(item.key, { product })} />
          <TextField sx={{ width: 110 }} label="Quantity" name={`quantity-${index}`} value={item.quantity} onChange={(e) => change(item.key, { quantity: e.target.value })} />
          <TextField sx={{ width: 150 }} label="Unit cost (Rs.)" name={`cost-${index}`} value={item.cost} onChange={(e) => change(item.key, { cost: e.target.value })} />
          <div className="min-w-28 py-3 text-sm">{formatPrice((parsePrice(item.cost) || 0) * (Number(item.quantity) || 0))}</div>
          <Button disabled={busy || items.length === 1} aria-label={`Remove item ${index + 1}`} onClick={() => setItems((rows) => rows.filter((row) => row.key !== item.key))}>Remove</Button>
        </div>)}
        <Button disabled={busy || items.length >= 500} onClick={() => setItems((rows) => [...rows, blankItem()])}>Add item</Button>
        <div className="mt-6 flex flex-wrap gap-4">
          <TextField label="Discount (Rs.)" name="purchase-discount" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <TextField label="Paid amount (Rs.)" name="purchase-paid" value={paid} onChange={(e) => setPaid(e.target.value)} />
          <TextField select label="Payment method" name="purchase-method" value={method} onChange={(e) => setMethod(e.target.value)} slotProps={{ select: { native: true } }}>{['Cash', 'Bank transfer', 'Cheque'].map((value) => <option key={value}>{value}</option>)}</TextField>
        </div>
        <div className="my-5 flex flex-wrap gap-8 rounded-lg bg-slate-50 p-5" aria-live="polite"><span>Subtotal: {formatPrice(subtotal)}</span><strong>Total: {formatPrice(total)}</strong><span>Balance: {formatPrice(balance)}</span></div>
        <TextField fullWidth multiline minRows={2} label="Notes" name="purchase-notes" value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 5000 } }} />
      </fieldset>
    </DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Save Purchase'}</Button></DialogActions></form>
  </Dialog>;
}
