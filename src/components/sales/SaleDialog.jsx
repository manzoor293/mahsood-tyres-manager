import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import SaleSelector from './SaleSelector.jsx';
import { catalogRequest, formatPrice, parsePrice, priceInput } from '../../utils/catalog.js';

const localTime = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16);
export default function SaleDialog({ onClose, onSaved }) {
  const [customer, setCustomer] = useState(null);
  const [items, setItems] = useState([]);
  const [picker, setPicker] = useState(0);
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(localTime);
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('0');
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const subtotal = items.reduce((sum, row) => sum + (parsePrice(row.price) ?? 0) * (Number(row.quantity) || 0), 0);
  const total = subtotal - (parsePrice(discount) ?? 0);
  const balance = total - (parsePrice(paid) ?? 0);
  function add(product) {
    if (!product) return;
    setItems((rows) => {
      const existing = rows.find((row) => row.product.id === product.id);
      return existing ? rows.map((row) => row.product.id === product.id ? { ...row, product, quantity: String(Number(row.quantity) + 1) } : row)
        : [...rows, { product, quantity: '1', price: priceInput(product.default_selling_price) }];
    });
    setPicker((n) => n + 1); setError('');
  }
  function change(id, patch) { setItems((rows) => rows.map((row) => row.product.id === id ? { ...row, ...patch } : row)); }
  async function complete() {
    if (submitting.current) return;
    setError('');
    if (!items.length) { setError('Add at least one product.'); return; }
    if (items.some((row) => !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) <= 0 || parsePrice(row.price) === null)) {
      setError('Each item needs a positive whole quantity and a non-negative price with at most two decimal places.'); return;
    }
    if (parsePrice(discount) === null || parsePrice(paid) === null || !Number.isSafeInteger(subtotal) || !date || !Number.isFinite(Date.parse(date))) {
      setError('Enter a valid sale date and non-negative monetary amounts within the supported range.'); return;
    }
    submitting.current = true; setBusy(true);
    try {
      const data = { customer_id: customer?.id ?? null, sold_at: new Date(date).toISOString(), discount: parsePrice(discount), paid_amount: parsePrice(paid), payment_method: method, notes,
        items: items.map((row) => ({ product_id: row.product.id, quantity: Number(row.quantity), unit_price: parsePrice(row.price) })) };
      if (invoice.trim()) data.invoice_number = invoice.trim();
      const result = await catalogRequest(() => window.api.sales.create(data)); onSaved(result);
    } catch (error) { setError(error.message); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <Dialog open fullWidth maxWidth="lg" onClose={() => { if (!submitting.current) onClose(); }} aria-labelledby="sale-entry-title">
    <DialogTitle id="sale-entry-title">New Sale / POS</DialogTitle><DialogContent dividers>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <SaleSelector key={picker} kind="products" value={null} onChange={add} label="Find a tyre / product" name="pos-product" disabled={busy || items.length >= 500} autoFocus />
          <div className="my-4 flex items-center justify-between"><h3 className="font-semibold">Cart · {items.length} products</h3><span className="text-xs text-slate-500">Prices in Pakistani rupees</span></div>
          {!items.length && <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500">Search above to start a sale.</div>}
          {items.map((row, index) => <div key={row.product.id} data-sale-item={row.product.id} className="mb-3 rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex flex-wrap justify-between gap-2"><div><strong>{row.product.sku} · {row.product.model}</strong><p className="text-sm text-slate-500">{row.product.size} · Available: {row.product.stock_quantity}</p></div><Button disabled={busy} aria-label={`Remove ${row.product.sku}`} onClick={() => setItems((rows) => rows.filter((r) => r.product.id !== row.product.id))}>Remove</Button></div>
            <div className="flex flex-wrap items-center gap-3"><TextField size="small" sx={{ width: 110 }} label="Quantity" name={`sale-quantity-${index}`} value={row.quantity} disabled={busy} onChange={(e) => change(row.product.id, { quantity: e.target.value })} />
              <TextField size="small" sx={{ width: 155 }} label="Unit price (Rs.)" name={`sale-price-${index}`} value={row.price} disabled={busy} onChange={(e) => change(row.product.id, { price: e.target.value })} />
              <strong className="ml-auto">{formatPrice((parsePrice(row.price) ?? 0) * (Number(row.quantity) || 0))}</strong></div>
          </div>)}
          <p className="my-3 text-xs text-slate-500">Availability is checked again when completing the sale. Completed sales are read-only.</p>
          <TextField fullWidth multiline minRows={2} label="Notes" name="sale-notes" value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 5000 } }} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 rounded-xl bg-slate-50 p-4">
          <h3 className="font-semibold">Checkout</h3>
          <SaleSelector kind="customers" value={customer} onChange={setCustomer} label="Customer (optional)" name="pos-customer" disabled={busy} />
          <div className="flex items-center justify-between text-sm"><span>{customer ? customer.name : 'Walk-in sale'}</span>{customer && <Button disabled={busy} onClick={() => setCustomer(null)}>Use Walk-in</Button>}</div>
          <TextField size="small" label="Invoice number (optional)" name="sale-invoice" placeholder="Auto-generated on completion" value={invoice} disabled={busy} onChange={(e) => setInvoice(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField size="small" type="datetime-local" label="Sale date / time" name="sale-date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <div className="flex justify-between"><span>Subtotal</span><strong data-sale-subtotal>{formatPrice(subtotal)}</strong></div>
          <TextField size="small" label="Discount (Rs.)" name="sale-discount" value={discount} disabled={busy} onChange={(e) => setDiscount(e.target.value)} />
          <div className="flex justify-between border-y border-slate-200 py-3 text-lg"><span>Total</span><strong data-sale-total>{formatPrice(total)}</strong></div>
          <TextField size="small" label="Amount paid (Rs.)" name="sale-paid" value={paid} disabled={busy} onChange={(e) => setPaid(e.target.value)} />
          <Button disabled={busy || total < 0 || !Number.isSafeInteger(total)} onClick={() => setPaid(priceInput(total))}>Pay in full</Button>
          <TextField select size="small" label="Payment method" name="sale-method" value={method} disabled={busy} onChange={(e) => setMethod(e.target.value)} slotProps={{ select: { native: true } }}>{['Cash','Bank transfer','Cheque'].map((value) => <option key={value}>{value}</option>)}</TextField>
          <div className="flex justify-between" aria-live="polite"><span>Balance</span><strong data-sale-balance>{formatPrice(balance)}</strong></div>
          {!customer && balance > 0 && <p className="text-xs text-amber-800">This walk-in balance has no customer contact attached.</p>}
        </div>
      </div>
    </DialogContent><DialogActions sx={{ px: 3, py: 2 }}><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="contained" disabled={busy} onClick={complete}>{busy ? 'Processing sale...' : 'Complete Sale'}</Button></DialogActions>
  </Dialog>;
}
