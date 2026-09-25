import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { catalogRequest } from '../../utils/catalog.js';

export default function CustomerDialog({ customer, onClose, onSaved }) {
  const [data, setData] = useState(() => ({ name: customer?.name || '', phone: customer?.phone || '', address: customer?.address || '', notes: customer?.notes || '' }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const next = {};
    if (!data.name.trim()) next.name = 'Customer name is required.';
    const phone = data.phone.trim();
    if (phone && (!/^\+?[\d ()-]+$/.test(phone) || !/^\+?\d{7,15}$/.test(phone.replace(/[ ()-]/g, '')))) next.phone = 'Enter 7 to 15 digits, with an optional leading +.';
    setErrors(next);
    if (Object.keys(next).length) return;
    submitting.current = true; setSaving(true); setError('');
    try {
      await catalogRequest(() => customer ? window.api.customers.update(customer.id, data) : window.api.customers.create(data));
      onSaved(customer ? 'Customer updated.' : 'Customer added.');
    } catch (failure) { setError(failure.message); }
    finally { submitting.current = false; setSaving(false); }
  }
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!saving) onClose(); }} aria-labelledby="customer-form-title">
      <form onSubmit={submit} noValidate>
        <DialogTitle id="customer-form-title">{customer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
        <DialogContent dividers>
          <p className="mb-5 text-sm text-slate-500">Contact details for your customer directory.</p>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <div className="flex flex-col gap-5">
            {[['name', 'Customer name', 200], ['phone', 'Phone', 40], ['address', 'Address', 1000], ['notes', 'Notes', 5000]].map(([field, label, maxLength]) => (
              <TextField key={field} name={`customer-${field}`} label={label} required={field === 'name'} autoFocus={field === 'name'} value={data[field]} disabled={saving}
                multiline={['address', 'notes'].includes(field)} minRows={['address', 'notes'].includes(field) ? 2 : undefined}
                error={Boolean(errors[field])} helperText={errors[field] || (field === 'phone' ? 'For example, 0300 1234567 or +92 300 1234567' : '')}
                slotProps={{ htmlInput: { maxLength, ...(field === 'phone' ? { inputMode: 'tel' } : {}) } }}
                onChange={(event) => { setData((current) => ({ ...current, [field]: event.target.value })); setErrors((current) => ({ ...current, [field]: '' })); setError(''); }} />
            ))}
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}><Button disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : customer ? 'Save Customer' : 'Create Customer'}</Button></DialogActions>
      </form>
    </Dialog>
  );
}
