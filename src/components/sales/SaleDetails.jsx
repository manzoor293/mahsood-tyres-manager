import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { formatPrice } from '../../utils/catalog.js';
export default function SaleDetails({ sale, onClose }) {
  return <Dialog open fullWidth maxWidth="md" onClose={onClose} aria-labelledby="sale-details-title"><DialogTitle id="sale-details-title">Sale {sale.invoice_number}</DialogTitle><DialogContent dividers>
    <p className="mb-2 font-semibold">{sale.customer_name || 'Walk-in'} · {new Date(sale.sold_at).toLocaleString('en-PK')}</p>
    {sale.customer_id && <p className="mb-4 whitespace-pre-wrap text-sm">{sale.customer_phone || 'No phone'} · {sale.customer_address || 'No address'}</p>}
    <Alert severity="info">Completed sale — read-only internal staff view. Unit costs are historical references; zero may mean no purchase cost was known. This is not a customer receipt.</Alert>
    <TableContainer><Table size="small" aria-label="Sale items"><TableHead><TableRow>{['SKU / Product','Quantity','Unit price','Unit cost (internal)','Line total'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{sale.items.map((item) => <TableRow key={item.id}><TableCell>{item.sku} · {item.model} · {item.size}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{formatPrice(item.unit_price)}</TableCell><TableCell>{formatPrice(item.unit_cost)}</TableCell><TableCell>{formatPrice(item.line_total)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    <dl className="my-5 ml-auto grid max-w-sm grid-cols-2 gap-3">{[['Subtotal',sale.subtotal],['Discount',sale.discount],['Total',sale.total],['Paid',sale.paid_amount],['Balance',sale.balance]].map(([label,value]) => <div className="contents" key={label}><dt>{label}</dt><dd className="text-right font-semibold">{formatPrice(value)}</dd></div>)}</dl>
    <p>Payment status: {sale.payment_status}</p>{sale.payments.length ? sale.payments.map((payment) => <p key={payment.id}>{payment.payment_method} · {formatPrice(payment.amount)} · {new Date(payment.paid_at).toLocaleString('en-PK')}</p>) : <p>No payment recorded</p>}
    <h3 className="mt-5 font-semibold">Notes</h3><p className="whitespace-pre-wrap break-words">{sale.notes || 'No notes'}</p>
  </DialogContent><DialogActions><Button onClick={onClose}>Close</Button></DialogActions></Dialog>;
}
