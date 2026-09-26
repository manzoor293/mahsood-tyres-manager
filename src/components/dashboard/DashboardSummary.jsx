import { Paper } from '@mui/material';
import { formatPrice } from '../../utils/catalog.js';

export default function DashboardSummary({ summary: s }) {
  const cards = [
    ['Sales Revenue',formatPrice(s.salesRevenue),`${s.saleCount} invoices · after discounts`],
    ['Amount Received',formatPrice(s.amountReceived),'Linked customer payments in this period'],
    ['Gross Profit',s.grossProfit===null?'Incomplete':formatPrice(s.grossProfit),s.grossProfit===null?`${s.unknownCostItemCount} sale item(s) with unknown / zero cost`:'After discounts, less historical item cost'],
    ['Expenses',formatPrice(s.expenses),'Recorded shop spending in this period'],
    ['Purchases',formatPrice(s.purchaseTotal),`${s.purchaseCount} purchases · ${formatPrice(s.supplierAmountPaid)} paid in period`],
    ['Customer Receivables',formatPrice(s.customerReceivables),'Current · all dates, including walk-in balances'],
    ['Supplier Payables',formatPrice(s.supplierPayables),'Current · all dates'],
    ['Stock Units',s.stockUnits.toLocaleString(),`Current · ${s.activeProducts} active products`],
    ['Stock Alerts',`${s.lowStockCount} low / ${s.outOfStockCount} out`,'Current · active products; low excludes zero stock'],
  ];
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Dashboard summary">
    {cards.map(([label,value,note])=><Paper key={label} variant="outlined" sx={{p:2.5,minWidth:0}} data-metric={label}>
      <h2 className="text-sm font-medium text-slate-500">{label}</h2>
      <p className="my-2 break-words text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs leading-5 text-slate-500">{note}</p>
    </Paper>)}
  </div>;
}
