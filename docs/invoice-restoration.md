# Invoice restoration

The shared Purchase/Sales invoice template was recovered directly from Git commit `39d25c5` (`i changed the design of invoice`). Source comparison confirms the restored compact-invoice.cjs is identical to that commit except for replacing `<h1>${e(shop.name)}</h1>` with `<h1>Mahsood Tyres</h1>`. Its CSS, shared renderer, paper profile and print driver also match that commit. No layout interpretation or new styling was introduced.

Both invoices retain the original logo/header placement, red banner, reference/date, party section, six-column table, original totals, Current Invoice Position wording/explanation, related returns, notes, four signature fields (Signature, Printed Name, Date, Payment Method), historical-data note and Generated timestamp. Purchase original totals retain Supplier Invoice Total. Pair and legacy labels remain based on saved unit metadata.

The recovered implementation uses A5 portrait, 148 × 210 mm, and 7 mm margins. This configuration was preserved because it belongs to the old Git implementation, not selected as a new design. Preview, native Print and PDF use the same original renderer and media settings.

The acquisition section and printable acquisition metadata were removed. Purchase invoices contain supplier values only, including when the purchase has nonzero freight and recorded transporter/bilty details. Shipment remains unchanged internally: purchase entry/details, transporter audit data, migration 007, exact allocation, historical landed COGS/Gross Profit, reports, backup/restore and supplier-payable separation. Sales invoices contain no internal cost information.

Files restored/updated:

- electron/printing/compact-invoice.cjs
- electron/printing/compact-invoice.css (recovered original CSS)
- electron/services/print-documents.cjs (remove printable acquisition metadata only)
- scripts/compact-printing-checks.cjs
- scripts/test-printing-ui.cjs
- scripts/test-shipment.cjs (invoice expectations only; internal shipment assertions retained)
- docs/invoice-restoration.md; removed the rejected redesign report docs/invoice-pad-layout.md

Validation:

| Command/check | Final result |
| --- | --- |
| Exact source comparison with 39d25c5, allowing header substitution only | PASS |
| Original CSS/paper/driver/shared-renderer comparison | PASS |
| npm run test:printing | PASS |
| npm run test:printing:ui | PASS |
| npm run test:shipment | PASS |
| npm run test:shipment:ui | PASS |
| npm run test:pairs | PASS |
| npm run test:pairs:ui | PASS |
| npm run test:purchases | PASS |
| npm run test:sales | PASS |
| npm run test:dashboard | PASS |
| npm run build | PASS |
| git diff --check | PASS |

The printing suite checks restored sections, wording, footer, header, supplier values, returns/payments/credit, pair/legacy documents, walk-in/customer sales, cost privacy, absence of freight/transporter/landed/acquisition fields, actual PDF dimensions, native media options, pagination and unchanged accounting snapshots. The shipment suite continues to verify exact freight allocation, supplier accounts/ledger, freight-aware Gross Profit, migration, backups and credentials. All database tests use isolated temporary profiles. Windows commands use npm.cmd; Electron rendering tests ran with approval outside the sandbox.

One initial printing failure came from naming the test invoice `PAD-FREIGHT`, which triggered the forbidden-word check on the reference itself. The fixture was renamed `PAD-SUPPLIER`; the rerun passed. Build retains its existing large-chunk warning. Restored Purchase preview was visually inspected. Samples are artifacts/purchaseInvoice-1-a5.pdf, artifacts/saleInvoice-1-a5.pdf and artifacts/purchaseInvoice-shipment-a5.pdf (the latter uses a purchase with internal freight but displays supplier values only).

The attachment available in this conversation contained only the pasted request; `1.pdf` was not available for direct visual comparison. The exact Git template matching the specified old structure was restored and verified instead. Physical printer output was not tested.

Application version is unchanged. No installer was built. No business logic or database migration was changed.
