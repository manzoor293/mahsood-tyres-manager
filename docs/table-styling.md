# Application table styling report

## Scope and discovery

Inspected all renderer files for MUI Table/TableHead/TableRow/TableCell, native
HTML tables, background overrides, shared styles, Tailwind conventions and theme
configuration before editing. Found 18 table-owning files:

| File | Tables covered |
| --- | --- |
| `src/components/products/ProductTable.jsx` | Products |
| `src/components/products/LookupManagerDialog.jsx` | Brands, Categories, Expense Categories |
| `src/pages/SuppliersPage.jsx` | Suppliers |
| `src/pages/CustomersPage.jsx` | Customers |
| `src/pages/PurchasesPage.jsx` | Purchase history |
| `src/components/purchases/PurchaseDetails.jsx` | Purchase item details |
| `src/pages/SalesPage.jsx` | Sales history |
| `src/components/sales/SaleDetails.jsx` | Sale item details, also opened from Reports |
| `src/components/inventory/InventoryTable.jsx` | Current stock and stock movements |
| `src/pages/ExpensesPage.jsx` | Expenses |
| `src/components/payments/PaymentTable.jsx` | Customer/supplier open invoices and payment histories |
| `src/pages/ReturnsPage.jsx` | Sale/purchase return invoice selection and histories |
| `src/components/returns/ReturnDialog.jsx` | Sale/purchase returnable items |
| `src/components/returns/ReturnDetails.jsx` | Sale/purchase return details |
| `src/components/reports/ReportResults.jsx` | Sales, Purchases, Inventory, Stock Movements, Expenses, Profit, Receivables, Payables |
| `src/pages/LedgerPage.jsx` | Customer and supplier ledger transactions |
| `src/components/dashboard/DashboardDetails.jsx` | Stock alerts |
| `src/components/dashboard/DashboardTrend.jsx` | Native HTML sales-trend values table |

Settings, payment detail dialogs, customer detail dialogs, the POS cart and purchase
entry form do not contain additional semantic tables. Their cards/forms were left
alone. No other renderer table implementation was found.

## Shared approach

`src/utils/tableStyles.js` supplies MUI theme overrides through `src/App.jsx`.
Every MUI application table, including tables in portaled dialogs and the Ledger,
inherits these styles without changing its business component. The dashboard's
native table renders through MUI Box with `component="table"` and uses the same
style object, retaining its HTML table semantics and column scopes.

Removed repeated local header/padding overrides from seven components/pages.
Product sticky action cells inherit their opaque row background so zebra striping
and hover continue across the complete row while scrolled columns remain hidden
under the action cell. Existing sticky headers are retained.

| Property | Value |
| --- | --- |
| Whole header row and header cells | `#E5E7EB` |
| Header text | `#111827`, weight `600`, vertically centered |
| Header wrapping | `white-space: nowrap` on header cells only |
| Odd body rows | `#FFFFFF` |
| Even body rows | `#F9FAFB` |
| Body row hover | `#F3F4F6` |
| Header and body cell padding | `12px 16px` |
| Table containers | `overflow-x: auto`, `max-width: 100%`, `min-width: 0` |

Existing table minimum widths are preserved. Header intrinsic widths provide
additional room where needed, with horizontal scrolling instead of wrapped
labels. Existing body wrapping rules, numeric alignment, ordering, header/row
scope, status badge colours and meaningful action colours are preserved.
Body cells do not receive blanket nowrap.

## Files changed by this task

Existing files:

- `src/App.jsx`
- `src/components/dashboard/DashboardTrend.jsx`
- `src/components/products/ProductTable.jsx`
- `src/components/inventory/InventoryTable.jsx`
- `src/components/payments/PaymentTable.jsx`
- `src/components/reports/ReportResults.jsx`
- `src/pages/CustomersPage.jsx`
- `src/pages/ExpensesPage.jsx`
- `src/pages/SuppliersPage.jsx`

New files:

- `src/utils/tableStyles.js`
- `scripts/test-table-styles.cjs`
- `scripts/test-table-styles.mjs`
- `docs/table-styling.md`

Pre-existing uncommitted changes were retained. This task does not edit the Ledger
page, Electron code, authentication, IPC, calculations, schema, migrations, version
or package scripts. No installer was built.

## Exclusions

Invoice, receipt, return and ledger print/PDF documents use independent HTML/CSS
in the Electron printing system and preview iframe. Those templates were
intentionally excluded to preserve print-safe output. Their UI detail tables are
included. No normal application table was excluded.

## Validation results

| Command | Final result |
| --- | --- |
| `npm run build` | PASS |
| `npm run test:products:ui` | PASS |
| `npm run test:suppliers:ui` | PASS |
| `npm run test:purchases:ui` | PASS |
| `npm run test:inventory:ui` | PASS |
| `npm run test:customers:ui` | PASS |
| `npm run test:sales:ui` | PASS |
| `npm run test:expenses:ui` | PASS |
| `npm run test:customer-payments:ui` | PASS |
| `npm run test:supplier-payments:ui` | PASS |
| `npm run test:sale-returns:ui` | PASS |
| `npm run test:purchase-returns:ui` | PASS |
| `npm run test:reports:ui` | PASS |
| `npm run test:ledger:ui` | PASS |
| `npm run test:lookups:ui` | PASS |
| `npm run test:dashboard:ui` | PASS |
| `npm run test:electron` | PASS |
| `npm run test:electron:dev` | PASS |
| `node scripts/test-table-styles.mjs` | PASS, all 15 workflow variants |

PowerShell blocks `npm.ps1`, so npm commands were executed with `npm.cmd`.
Initial sandbox Electron runs failed before rendering with GPU startup failures
and `ERR_FAILED`. Reruns outside the sandbox passed. The development smoke rerun
used a separate log after the initial sandbox process held its original log open.
There are no unresolved final test failures.

The style suite runs the existing workflows with isolated temporary databases,
checking computed header colours/nowrap, odd/even row colours, cell background
inheritance and horizontal scroll containers after renderer steps. It also samples
actual mouse hover colours and captures tables at desktop and narrow widths.
All eight report configurations and both ledger modes are exercised. Existing
workflow assertions cover actions, pagination, filters, balances and validation.

Reviewed screenshot contact sheets and individual captures for the major modules,
report configurations and detail dialogs. Artifacts use the `table-style-` prefix;
the final suite log is `artifacts/table-style-suite.log`. Production and development
smoke tests also passed their narrow-window and security checks.

## Remaining visual considerations

No overlapping columns or page-wide horizontal overflow was found by the exercised
checks and capture review. Wide tables require horizontal scrolling at narrow
widths, as intended. Existing body fields such as invoice references can still
wrap, and tall non-sticky tables require vertical scrolling to return to their
header. Not every report/dialog configuration received a separate narrow-width
screenshot; all share the same checked styles, with representative narrow routes
and dialogs exercised by the existing tests. The build retains a warning about
the main JavaScript chunk exceeding 500 kB; it does not fail the build.
