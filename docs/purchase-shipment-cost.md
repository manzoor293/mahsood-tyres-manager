# Purchase shipment cost — implementation report

Shipment is capitalized acquisition cost owed separately to a transporter. It never becomes supplier debt, a supplier payment, an extra stock movement, or an automatically created operating expense. Application version is unchanged; no installer was built.

## Architecture found

Schema 6 stores supplier invoice subtotal, discount and total on purchases. Purchase items store the historical supplier price, commercial quantity and physical-unit factor. New commercial transactions use pairs (factor 2); legacy records retain tyre units (factor 1). Only stock-movement triggers change inventory. Purchase creation uses one immediate SQLite transaction, including initial supplier payment.

Supplier payments, supplier accounts, payables, ledger, Dashboard purchase values and printable current invoice positions use supplier invoice totals less supplier returns and payments. Returns already distribute original discounts with BigInt cumulative division. None of these accounting paths should include freight.

Sales use the latest purchase item by insertion ID, rather than FIFO or weighted average. They snapshot the converted supplier price in sale_items.unit_cost. Dashboard and Profit reports share historical-cost SQL. Inventory adjustment costs are non-accounting per-tyre reference prices, and remain supplier-price references.

The secure renderer → preload → validated IPC → main-process service/repository architecture is preserved. No new IPC channel or Node access in React was added. Existing payments are specific to suppliers and customers; there is no generic third-party payables system suitable for transporter payments.

## Migration 007 and stored fields

See [007-purchase-shipment-cost.sql](../electron/database/migrations/007-purchase-shipment-cost.sql). Migrations 001–006 are unchanged.

| Table | Added field | Meaning/default |
| --- | --- | --- |
| purchases | shipment_cost | Integer paise, nonnegative, default 0 |
| purchases | transporter_name | Optional audit text |
| purchases | shipment_reference | Optional bilty/reference text |
| purchase_items | allocated_shipment_cost | Exact freight line total, default 0 |
| sale_items | allocated_shipment_cost | Exact saved historical freight line total, default 0 |
| sale_items | shipment_purchase_item_id | Optional source purchase-item foreign key |
| sale_items | shipment_offset | Physical-unit allocation position, default 0 |

The migration adds a source index and immutability triggers for shipment history and the quantities/prices on which nonzero freight history depends. Money/offset fields have safe-integer constraints. Existing rows receive zero freight; their original supplier prices, invoices, payments, returns, inventory and credentials are not rewritten.

## Exact allocation and precision

For each purchase line, weight = original quantity × supplier unit_cost. Freight is proportional to goods value, before invoice discount. A proportional invoice discount does not change those relative weights. The original supplier unit_cost is never overwritten.

Largest remainder uses BigInt throughout:

1. Compute floor(weight × shipment / total goods value) and each division remainder.
2. Rank remainders descending, breaking ties by stable input line order (the eventual insertion/ID order).
3. Give one remaining paise to each highest-ranked line until the remainder is exhausted.
4. Validate each landed line and invoice landed total against the supported integer range, and assert allocation sum === shipment cost.

Intermediates use arbitrary-precision BigInt; they need not fit JavaScript Number. Persisted and returned monetary values must be safe integer paise. A positive shipment with zero total goods value is rejected by the allocation helper. Purchase entry retains its existing rule requiring positive supplier prices, which also prevents zero-value purchases.

The Rs. 1.01 test with weights 1:2:3 yields 17, 34 and 50 paise, exactly 101. Equal-weight ties resolve deterministically. The core Rs. 200,000 freight scenario yields Rs. 50,000, Rs. 50,000 and Rs. 100,000.

Landed purchase total = supplier invoice total after discount + freight. Landed item lines = original gross supplier goods value + allocated freight; UI explicitly identifies those line values as before invoice discount. The existing historical supplier-price treatment of purchase discounts is unchanged.

### Historical sale cost

Freight is never rounded into an integer unit price. For source freight F, original source physical quantity Q, prior-sale physical offset O, and new physical sale quantity N:

`sale freight = floor((O + N) × F / Q) − floor(O × F / Q)`

All calculations use BigInt. Offset is derived inside the sale's immediate transaction and stored modulo Q. Across Q consecutive physical units, exactly F paise are assigned. For 100 paise on 3 pairs, three one-pair sales receive 33, 33 and 34 paise. Factors convert quantities only; freight itself is never multiplied by the pair factor.

Each sale saves that exact freight line total, source ID and offset alongside the existing supplier-price snapshot. Later purchases do not change saved sales. Landed COGS is remaining supplier-price cost plus remaining saved freight. For R returned commercial units out of original sale quantity S, remaining freight is `F − floor(R × F / S)`. Full sale returns reverse all saved freight exactly; partial returns use a deterministic cumulative proportion.

The shared SQLite historical-cost helper uses a deterministic BigInt-backed function for the return calculation, avoiding SQL floating-point multiplication/division. Dashboard and Reports register this function on their connection, including connections rebound after restore.

This retains latest-purchase valuation: if other stock exists and cumulative sales exceed the source purchase quantity, the latest source ratio repeats. It is not purchase-lot consumption or FIFO. Source offsets follow original sale insertion order; sale returns do not rewrite prior allocations. This is a valuation limitation, not a transporter-payment allocation.

## UI, accounting, returns and documents

New Purchase adds a PKR shipment input defaulting to 0; blank means 0. Existing money parsing rejects negative, invalid, excessive-precision, NaN/Infinity and unsafe values. Optional transporter and bilty/reference fields are capped at 200 characters. Backend independently validates all inputs, amounts, goods totals, allocations and landed costs.

Totals clearly identify items subtotal, discount, supplier invoice total, supplier payable, shipment and total landed purchase cost. Purchase Details shows supplier prices, freight allocation and landed line costs, then separate original supplier invoice, acquisition-cost and current supplier-position sections.

Supplier payable, payments, account summary, ledger, Payables report and Dashboard Supplier Payables continue to use supplier invoice values only. A Rs. 4,000,000 invoice with Rs. 200,000 freight and Rs. 1,500,000 paid leaves Rs. 2,500,000 supplier payable. The Dashboard Purchases card retains supplier-purchase meaning; Gross Profit includes saved freight once.

Purchase reporting adds original supplier invoice totals, shipment cost and original total landed cost. Existing effective supplier values and outstanding balances remain return-adjusted supplier figures. Freight is described as capitalized acquisition cost and does not enter operating expenses.

Purchase returns continue to refund original supplier prices minus the existing allocated invoice discount. A one-pair return at Rs. 100,000 with Rs. 2,000 inbound freight produces Rs. 100,000 supplier credit, not Rs. 102,000. Original purchase freight and allocations remain immutable. Purchase Details reports the cumulative freight associated with returned goods as still incurred. It is neither reassigned nor automatically expensed/refunded; a future settlement/write-off workflow would be needed.

Purchase printing preserves supplier items/totals and current supplier balances, with a separate acquisition-cost section for shipment/transporter/reference/landed total. Empty freight/audit sections are omitted on legacy invoices to preserve compact pagination. Customer Sales invoices never receive internal freight or supplier-cost metadata. Real PDF output was tested.

No transporter paid/unpaid status is implied. Freight records the acquisition cost, not a transporter payment. Partial payments, outstanding transporter balances and payment history are future work.

## Backup and restore

The existing SQLite snapshot automatically preserves every new field and sale-cost snapshot. Tests exercised schema-7 backup and actual restore, with all table data equal before/after and administrator login preserved. Actual restore tests for populated schema 1–6 backups run the existing forward migrations, preserve every original field, assign zero historical freight and retain supplier balances. Schema 8 is rejected as newer than supported.

## Files changed

Production files:

- electron/database/migrations/007-purchase-shipment-cost.sql; electron/database/migrate.cjs
- electron/services/shipment.cjs; electron/services/purchases.cjs; electron/services/sales.cjs; electron/services/print-documents.cjs
- electron/repositories/purchases.cjs; electron/repositories/sales.cjs; electron/repositories/analytics.cjs; electron/repositories/dashboard.cjs; electron/repositories/reports.cjs; electron/repositories/printing.cjs
- electron/printing/compact-invoice.cjs
- src/components/purchases/PurchaseDialog.jsx; src/components/purchases/PurchaseDetails.jsx
- src/components/reports/reportConfig.js; src/components/dashboard/DashboardSummary.jsx
- package.json (test scripts only)

Test/harness/report files:

- scripts/test-shipment.cjs; scripts/test-shipment-ui.cjs; scripts/test-shipment-regressions.mjs; scripts/test-products-ui.mjs
- scripts/test-auth.cjs; scripts/test-backup.cjs; scripts/test-backup-ui.cjs; scripts/test-pairs.cjs; scripts/test-returns.cjs; scripts/test-reports.cjs
- scripts/test-catalog.cjs; scripts/test-dashboard.cjs; scripts/test-expenses.cjs; scripts/test-ledger.cjs; scripts/test-payments.cjs; scripts/test-printing.cjs; scripts/test-settings.cjs (schema-version expectations)
- scripts/smoke.cjs (align existing branding assertions with the existing Mahsood Tyres header; no header/UI branding change)
- docs/purchase-shipment-cost.md

## Validation results

New test:shipment and test:shipment:ui use the existing isolated temporary-profile harness. Tests cover zero/single/multiple shipment lines, proportional/remainder allocation, odd paise, zero-value rejection, safe large integers, overflow and invalid inputs, discount, legacy/pair factors, initial payments, transaction rollback, immutable history, supplier accounts/ledger/returns, exact landed COGS, Reports, Dashboard, Details, customer invoice exclusion, real PDF, backups and authentication.

The requested manual-business scenario was exercised through the real authenticated UI in an isolated test profile: Product A 5 pairs at Rs. 100,000 and Product B 10 pairs at Rs. 50,000, with Rs. 100,000 freight and Rs. 400,000 supplier payment. Results: Rs. 1,000,000 invoice, Rs. 600,000 supplier payable, Rs. 1,100,000 landed total, stock 10/20 tyres and ledger purchase/payment/balance Rs. 1,000,000/Rs. 400,000/Rs. 600,000. Selling one A pair at Rs. 130,000 saves Rs. 110,000 cost and shows Rs. 20,000 Gross Profit. UI screenshots were visually inspected. This is UI-driven verification, not a claim of a separate human manual session.

Commands were run as npm.cmd on Windows because PowerShell blocks npm.ps1. The regression runner invokes the actual npm scripts and stores per-command logs under artifacts/. Electron rendering required approved execution outside the sandbox; all database tests still used temporary profiles.

| npm run command(s) | Final result |
| --- | --- |
| test:shipment; test:shipment:ui | PASS |
| test:db | PASS |
| test:pairs; test:pairs:ui | PASS |
| test:purchases; test:purchases:ui | PASS |
| test:inventory; test:inventory:ui | PASS |
| test:sales; test:sales:ui | PASS |
| test:purchase-returns; test:purchase-returns:ui | PASS |
| test:supplier-payments; test:supplier-payments:ui | PASS |
| test:dashboard; test:dashboard:ui | PASS |
| test:reports; test:reports:ui | PASS |
| test:ledger; test:ledger:ui | PASS |
| test:printing; test:printing:ui | PASS |
| test:backup; test:backup:ui | PASS |
| test:auth; test:auth:ui | PASS |
| build | PASS |
| test:electron; test:electron:dev | PASS |
| test:products; test:expenses; test:settings | PASS |
| git diff --check | PASS |

Initial failures were reported and corrected: an empty print acquisition section caused a legacy short invoice to span two pages; the new UI test needed dialog timing and selector quoting fixes; backup UI expected schema 6 and treated schema 7 as newer; smoke tests expected the old software header rather than the existing shop branding. The printing failure-path tests deliberately log injected output errors while verifying recovery. Build reports the existing large-chunk warning. No outstanding failing suite remains.

Required invariants verified: purchase allocation sum equals shipment cost exactly; shipment increases historical landed COGS once and creates no operating expense; supplier payable and supplier ledger never include transporter shipment cost; physical quantities retain pair/legacy semantics.
