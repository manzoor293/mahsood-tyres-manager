import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

export default function CustomerDetails({ customer, onClose }) {
  return <Dialog open fullWidth maxWidth="sm" onClose={onClose} aria-labelledby="customer-details-title">
    <DialogTitle id="customer-details-title">Customer details</DialogTitle>
    <DialogContent dividers>
      <h2 className="mb-3 break-words text-xl font-semibold">{customer.name}</h2>
      <Chip size="small" label={customer.active ? 'Active' : 'Inactive'} color={customer.active ? 'success' : 'default'} />
      <dl className="mt-5 space-y-4">{[['Phone', customer.phone], ['Address', customer.address], ['Notes', customer.notes],
        ['Created', new Date(customer.created_at).toLocaleString('en-PK')], ['Updated', new Date(customer.updated_at).toLocaleString('en-PK')]].map(([label, value]) =>
        <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}</dl>
    </DialogContent><DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
