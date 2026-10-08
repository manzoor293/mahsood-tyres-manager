import { stockLabel } from "../../utils/units.js";
import DashboardMetricCard from "./DashboardMetricCard.jsx";
import { formatPrice } from "../../utils/catalog.js";

export default function DashboardSummary({ summary: s }) {
  const cards = [
    [
      "Sales Revenue",
      formatPrice(s.salesRevenue),
      `${s.saleCount} invoices · after discounts and all returns, including later returns`,
    ],
    [
      "Amount Received",
      formatPrice(s.amountReceived),
      "Linked customer payments in this period",
    ],
    [
      "Gross Profit",
      s.grossProfit === null ? "Incomplete" : formatPrice(s.grossProfit),
      s.grossProfit === null
        ? `${s.unknownCostItemCount} sale item(s) with unknown / zero cost`
        : "After discounts, less historical item cost including allocated freight",
    ],
    [
      "Expenses",
      formatPrice(s.expenses),
      "Recorded shop spending in this period",
    ],
    [
      "Purchases",
      formatPrice(s.purchaseTotal),
      `${s.purchaseCount} purchases · ${formatPrice(s.supplierAmountPaid)} paid in period`,
    ],
    [
      "Customer Receivables",
      formatPrice(s.customerReceivables),
      "Current · all dates, including walk-in balances",
    ],
    [
      "Supplier Payables",
      formatPrice(s.supplierPayables),
      "Current · all dates",
    ],
    [
      "Customer Credit / Refund Due",
      formatPrice(s.customerCreditDue),
      "Current credits, including walk-in refunds; no payout recorded",
    ],
    [
      "Supplier Credit Due",
      formatPrice(s.supplierCreditDue),
      "Current supplier credits; no refund received",
    ],
    [
      "Stock",
      stockLabel(s.stockUnits),
      `Current · ${s.activeProducts} active products`,
    ],
    [
      "Stock Alerts",
      `${s.lowStockCount} low / ${s.outOfStockCount} out`,
      "Current · active products; low excludes zero stock",
    ],
  ];
  const visuals = [
    ["receipt", "teal"], ["wallet", "blue"], ["chart", "emerald"],
    ["wallet", "red"], ["truck", "indigo"], ["people", "amber"],
    ["truck", "orange"], ["wallet", "cyan"], ["wallet", "violet"],
    ["tyre", "slate"],
    ["inventory", s.outOfStockCount > 0 ? "red" : s.lowStockCount > 0 ? "amber" : "emerald"],
  ];
  const groups = [
    { title: "Sales & profit", layout: "sales", indices: [0, 1, 2, 3] },
    { title: "Purchases & balances", layout: "balances", indices: [4, 5, 6] },
    { title: "Credits & inventory", layout: "current", indices: [7, 8, 9, 10] },
  ];
  return (
    <div aria-label="Dashboard summary">
      {groups.map((group) => (
        <section key={group.title} className="dashboard-section" aria-label={group.title}>
          <div className="dashboard-section-heading"><h2>{group.title}</h2></div>
          <div className={`dashboard-grid dashboard-grid-${group.layout}`}>
            {group.indices.map((index) => {
              const [title, value, description] = cards[index];
              const [icon, tone] = visuals[index];
              return <DashboardMetricCard key={title} title={title} value={value} description={description} icon={icon} tone={tone} badge={index < 5 ? "Period" : "Current"} emphasis={[0, 1, 2, 4].includes(index)} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
