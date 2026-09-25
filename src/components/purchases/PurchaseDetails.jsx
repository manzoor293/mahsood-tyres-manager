import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { formatPrice } from '../../utils/catalog.js';

export default function PurchaseDetails({ purchase: p, onClose }) {
  return <Dialog open fullWidth maxWidth="md" onClose={onClose} aria-labelledby="purchase-details-title">
    <DialogTitle id="purchase-details-title">Purchase {p.invoice_number}</DialogTitle><DialogContent dividers>
      <p className="mb-4">{p.supplier_name} · {p.purchased_at.slice(0, 10)} · {p.payment_status}</p>
      <Alert severity="info">Completed purchase — read-only. Stock and historical costs are preserved.</Alert>
      <TableContainer><Table aria-label="Purchase items"><TableHead><TableRow>{['Product', 'Quantity', 'Unit cost', 'Line total'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{p.items.map((item) => <TableRow key={item.id}><TableCell>{item.sku} · {item.model} · {item.size}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{formatPrice(item.unit_cost)}</TableCell><TableCell>{formatPrice(item.line_total)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
      <dl className="ml-auto my-5 grid max-w-sm grid-cols-2 gap-3">{[['Subtotal', p.subtotal], ['Discount', p.discount], ['Total', p.total], ['Amount paid', p.paid_amount], ['Remaining balance', p.balance]].map(([label, value]) => <div className="contents" key={label}><dt>{label}</dt><dd className="text-right font-semibold">{formatPrice(value)}</dd></div>)}</dl>
      {p.payments.map((payment) => <p key={payment.id} className="text-sm text-slate-500">Payment: {payment.payment_method} · {payment.paid_at.slice(0, 10)} · {formatPrice(payment.amount)}</p>)}
      <h3 className="mt-5 font-semibold">Notes</h3><p className="whitespace-pre-wrap break-words">{p.notes || 'No notes'}</p>
    </DialogContent><DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
