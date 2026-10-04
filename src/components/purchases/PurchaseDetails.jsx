import { quantityLabel, unitName } from '../../utils/units.js';
import StatusBadge from "../StatusBadge.jsx";
import PrintActions from "../printing/PrintActions.jsx";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { formatPrice } from "../../utils/catalog.js";

export default function PurchaseDetails({ purchase: p, onClose }) {
  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      onClose={onClose}
      aria-labelledby="purchase-details-title"
    >
      <DialogTitle id="purchase-details-title">
        Purchase {p.invoice_number}
      </DialogTitle>
      <DialogContent dividers>
        <p className="mb-4">
          {p.supplier_name} · {p.purchased_at.slice(0, 10)} ·{" "}
          <StatusBadge status={p.payment_status} />
        </p>
        <Alert severity="info">
          Completed purchase — read-only. Stock and historical costs are
          preserved.
        </Alert>
        <TableContainer>
          <Table aria-label="Purchase items">
            <TableHead>
              <TableRow>
                {["Product", "Quantity", "Supplier price / unit", "Supplier line total", "Allocated freight", "Landed line cost"].map(
                  (label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ),
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {p.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.sku} · {item.model} · {item.size}
                  </TableCell>
                  <TableCell>{quantityLabel(item.quantity, item.units_per_transaction_unit)}</TableCell>
                  <TableCell>{formatPrice(item.unit_cost)} / {unitName(item.units_per_transaction_unit).toLowerCase()}</TableCell>
                  <TableCell>{formatPrice(item.line_total)}</TableCell>
                  <TableCell>{formatPrice(item.allocated_shipment_cost)}</TableCell>
                  <TableCell>{formatPrice(item.landed_line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <p className="mt-2 text-xs text-slate-500">Landed line costs above are supplier goods value plus freight, before invoice discount.</p>
        {[
          ["Original supplier invoice", [["Subtotal", p.subtotal], ["Discount", p.discount], ["Supplier Invoice Total", p.total]]],
          ["Separate acquisition cost", [["Shipment / Delivery Cost", p.shipment_cost], ["Total Landed Purchase Cost", p.landed_total]]],
          ["Current supplier position", [["Returned value", p.returned_value], ["Effective supplier total", p.effective_total], ["Supplier credit due", p.credit_due], ["Amount paid", p.paid_amount], ["Supplier Payable", p.balance]]],
        ].map(([heading, rows]) => (
          <section key={heading} className="ml-auto my-4 max-w-lg rounded-lg border border-slate-200 p-4">
            <h3 className="mb-3 font-semibold">{heading}</h3>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2">
              {rows.map(([label, value]) => (
                <div className="contents" key={label}>
                  <dt>{label}</dt><dd className="text-right font-semibold">{formatPrice(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <Alert severity="info" sx={{ mb: 2 }}>
          Freight is a separate transporter acquisition cost, excluded from supplier payable.
          Purchase returns do not refund freight or reallocate it to other goods. Transporter payment history is not tracked here.
        </Alert>
        {p.transporter_name && <p>Transporter: {p.transporter_name}</p>}
        {p.shipment_reference && <p>Shipment Reference / Bilty No.: {p.shipment_reference}</p>}
        <p className="my-2 text-sm text-slate-500">Freight associated with supplier-returned goods (still incurred): {formatPrice(p.items.reduce((sum, item) => sum + item.freight_on_returned_goods, 0))}</p>
        {p.payments.map((payment) => (
          <p key={payment.id} className="text-sm text-slate-500">
            Payment: {payment.payment_method} · {payment.paid_at.slice(0, 10)} ·{" "}
            {formatPrice(payment.amount)}{" "}
            <PrintActions type="supplierPayment" documentId={payment.id} />
          </p>
        ))}
        <h3 className="mt-5 font-semibold">Notes</h3>
        <p className="whitespace-pre-wrap break-words">
          {p.notes || "No notes"}
        </p>
      </DialogContent>
      <DialogActions>
        <PrintActions
          type="purchaseInvoice"
          documentId={p.id}
          label="Print Purchase"
        />
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
