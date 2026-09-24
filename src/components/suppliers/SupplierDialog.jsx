import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { catalogRequest } from '../../utils/catalog.js';

export default function SupplierDialog({ supplier, onClose, onSaved }) {
  const [data, setData] = useState(() => ({ name: supplier?.name || '', phone: supplier?.phone || '', address: supplier?.address || '', notes: supplier?.notes || '' }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const next = {};
    if (!data.name.trim()) next.name = 'Supplier name is required.';
    const phone = data.phone.trim();
    if (phone && (!/^\+?[\d ()-]+$/.test(phone) || !/^\+?\d{7,15}$/.test(phone.replace(/[ ()-]/g, '')))) next.phone = 'Enter 7 to 15 digits, with an optional leading +.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true); setError('');
    try {
      await catalogRequest(() => supplier ? window.api.suppliers.update(supplier.id, data) : window.api.suppliers.create(data));
      onSaved(supplier ? 'Supplier updated.' : 'Supplier added.');
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!saving) onClose(); }} aria-labelledby="supplier-form-title">
      <form onSubmit={submit} noValidate>
        <DialogTitle id="supplier-form-title">{supplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
        <DialogContent dividers>
          <p className="mb-5 text-sm text-slate-500">Contact details for your supplier directory.</p>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <div className="flex flex-col gap-5">
            {[['name', 'Supplier name', 200], ['phone', 'Phone', 40], ['address', 'Address', 1000], ['notes', 'Notes', 5000]].map(([field, label, maxLength]) => (
              <TextField key={field} name={`supplier-${field}`} label={label} required={field === 'name'} autoFocus={field === 'name'} value={data[field]} disabled={saving}
                multiline={['address', 'notes'].includes(field)} minRows={['address', 'notes'].includes(field) ? 2 : undefined}
                error={Boolean(errors[field])} helperText={errors[field] || (field === 'phone' ? 'For example, 0300 1234567 or +92 300 1234567' : '')}
                slotProps={{ htmlInput: { maxLength, ...(field === 'phone' ? { inputMode: 'tel' } : {}) } }}
                onChange={(event) => { setData((current) => ({ ...current, [field]: event.target.value })); setErrors((current) => ({ ...current, [field]: '' })); setError(''); }} />
            ))}
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}><Button disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : supplier ? 'Save Supplier' : 'Create Supplier'}</Button></DialogActions>
      </form>
    </Dialog>
  );
}
