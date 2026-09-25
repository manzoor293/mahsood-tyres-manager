import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { catalogRequest } from '../../utils/catalog.js';

export default function AdjustmentDialog({ product, onClose, onSaved }) {
  const [type, setType] = useState('ADJUSTMENT_IN');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const amount = Number(quantity);
  const validAmount = Number.isSafeInteger(amount) && amount > 0;
  const expected = product.quantity + (type === 'ADJUSTMENT_IN' ? amount : -amount);
  function validate(event) {
    event.preventDefault(); setError('');
    if (!validAmount) { setError('Quantity must be a positive whole number.'); return; }
    if (!notes.trim()) { setError('A reason is required for a stock adjustment.'); return; }
    if (!Number.isSafeInteger(expected)) { setError('Resulting quantity is too large.'); return; }
    setReview(true);
  }
  async function save() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const result = await catalogRequest(() => window.api.inventory.adjust({ product_id: product.product_id,
        movement_type: type, quantity: amount, notes, expected_quantity: product.quantity }));
      onSaved(result.stock);
    } catch (error) { setError(error.message); setReview(false); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!saving.current) onClose(); }} aria-labelledby="adjust-stock-title">
    <form onSubmit={validate} noValidate><DialogTitle id="adjust-stock-title">{review ? 'Confirm stock adjustment' : 'Adjust Stock'}</DialogTitle>
      <DialogContent dividers>
        <p className="mb-4 font-semibold">{product.sku} · {product.model} · {product.size}</p>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4" aria-live="polite">
          <span>Current quantity</span><strong data-current-quantity>{product.quantity}</strong>
          <span>Adjustment quantity</span><strong>{validAmount ? `${type === 'ADJUSTMENT_IN' ? '+' : '-'}${amount}` : '—'}</strong>
          <span>Expected resulting quantity</span><strong data-expected-quantity>{validAmount ? expected : '—'}</strong>
        </div>
        {review ? <><Alert severity="warning">Confirm this change to stock. A permanent stock movement will record your reason.</Alert><p className="mt-4 whitespace-pre-wrap break-words">{notes}</p></> :
          <div className="flex flex-col gap-4">
            <TextField select label="Adjustment type" name="adjustment-type" value={type} disabled={busy} onChange={(e) => setType(e.target.value)} slotProps={{ select: { native: true } }}>
              <option value="ADJUSTMENT_IN">Stock increase</option><option value="ADJUSTMENT_OUT">Stock decrease</option>
            </TextField>
            <TextField label="Quantity" name="adjustment-quantity" value={quantity} disabled={busy} onChange={(e) => setQuantity(e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            <TextField multiline minRows={3} label="Reason / notes" name="adjustment-notes" value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 5000 } }} />
          </div>}
      </DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button>
        {review ? <><Button disabled={busy} onClick={() => setReview(false)}>Back</Button><Button variant="contained" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Confirm Adjustment'}</Button></> : <Button type="submit" variant="contained" disabled={busy}>Review Adjustment</Button>}
      </DialogActions>
    </form>
  </Dialog>;
}
