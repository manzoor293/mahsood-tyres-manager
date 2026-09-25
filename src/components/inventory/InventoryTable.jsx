import { Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { formatPrice } from '../../utils/catalog.js';

export const stockLabels = { in: 'In Stock', low: 'Low Stock', out: 'Out of Stock' };
export default function InventoryTable({ rows, history, busy, onAdjust, onHistory }) {
  const columns = history ? ['Date / time', 'SKU / Product', 'Movement type', 'Change', 'Stock after movement', 'Reference type', 'Reference', 'Notes']
    : ['SKU', 'Brand', 'Model', 'Size', 'Category', 'Current Stock', 'Minimum Stock', 'Stock Status', 'Selling Price', 'Actions'];
  return <TableContainer tabIndex={0} aria-label="Inventory table, scroll for more columns" sx={{ maxHeight: '60vh' }}>
    <Table stickyHeader size="small" aria-label={history ? 'Stock Movements' : 'Current Stock'} sx={{ minWidth: 1050, '& thead th': { bgcolor: '#f8fafc', fontWeight: 600 }, '& td': { py: 1.5 } }}>
      <TableHead><TableRow>{columns.map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{rows.map((row) => history ? <TableRow key={row.id} data-movement-id={row.id}>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(row.created_at).toLocaleString('en-PK')}</TableCell>
        <TableCell>{row.sku}<div className="text-xs text-slate-500">{row.model} · {row.size}</div>{!row.active && <Chip size="small" label="Inactive Product" />}</TableCell>
        <TableCell>{row.movement_type}</TableCell><TableCell sx={{ color: row.quantity_change > 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>{row.quantity_change > 0 ? '+' : ''}{row.quantity_change}</TableCell>
        <TableCell>{row.resulting_quantity}</TableCell><TableCell>{row.reference_type}</TableCell><TableCell>{row.invoice_number || `Movement #${row.id}`}</TableCell>
        <TableCell sx={{ maxWidth: 280, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.notes || '—'}</TableCell>
      </TableRow> : <TableRow key={row.product_id} data-stock-id={row.product_id}>
        {[row.sku, row.brand_name || '—', row.model, row.size, row.category_name || '—'].map((value, i) => <TableCell key={i}>{value}</TableCell>)}
        <TableCell data-stock-quantity sx={{ fontWeight: 600 }}>{row.quantity}</TableCell><TableCell>{row.minimum_stock}</TableCell>
        <TableCell><Chip size="small" label={stockLabels[row.stock_status]} color={row.stock_status === 'in' ? 'success' : row.stock_status === 'low' ? 'warning' : 'error'} />{!row.active && <Chip sx={{ mt: 0.5 }} size="small" label="Inactive Product" />}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatPrice(row.default_selling_price)}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Button disabled={busy} aria-label={`History ${row.sku}`} onClick={() => onHistory(row)}>History</Button>
          <Button disabled={busy || !row.active} aria-label={`Adjust stock ${row.sku}`} onClick={() => onAdjust(row)}>Adjust Stock</Button>
        </TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </TableContainer>;
}
