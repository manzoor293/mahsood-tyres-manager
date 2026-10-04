# Ledger implementation report

Development feature for v0.2.0; existing package/release version remains unchanged.

1. **Architecture discovered:** Electron main owns better-sqlite3 repositories and services. React uses allowlisted preload functions and validated IPC. The main process wraps all business IPC in administrator authentication and sender checks. Reports use local calendar dates, exact SQLite integers, safe-number conversion, pagination, and searchable directory lookups. Shop settings supply name, address, phones, email, registration and footer. Printing uses escaped HTML, sandboxed preview, temporary hidden windows and Chromium A4 output. There is no explicit account opening-balance mechanism.
2. **Reports decision:** Retained all eight useful reports: Sales, Purchases, Inventory, Stock Movements, Expenses, Profit, Receivables and Payables. Ledger answers a separate chronological account-history question.
3. **Navigation:** `/ledger`, between Reports and Settings, with Customer Ledger and Supplier Ledger tabs. The existing authentication boundary protects the route.
4. **Files added:** `electron/repositories/ledger.cjs`, `electron/services/ledger.cjs`, `electron/services/ledger-printing.cjs`, `electron/ipc/ledger.cjs`, `electron/printing/ledger.cjs`, `src/pages/LedgerPage.jsx`, `scripts/test-ledger.cjs`, `scripts/test-ledger-ui.cjs`, and this report.
5. **Files modified:** `electron/main.cjs`, `electron/preload.cjs`, `src/routes/navigation.js`, `src/routes/AppRoutes.jsx`, `src/components/printing/PrintPreview.jsx`, `package.json`, `scripts/test-products-ui.mjs`, `scripts/test-printing.cjs`. The printing test now accepts whitespace in its A4 CSS assertion.
6. **Schema/index changes:** None. Existing party/date, payment/invoice, and return/invoice indexes suffice for the derived queries. Released migrations 001–005 are untouched.
7. **Customer formula:** Opening + original sale totals − all customer payments − sale-return totals = closing. Anonymous walk-in sales are excluded from named accounts.
8. **Supplier formula:** Opening + original purchase totals − all supplier payments − purchase-return totals = closing.
9. **Exact columns:** S.NO, Date / Time, Type, Reference, Document No., Description, Increase, Decrease, Running Balance. Serial numbers count matching statement entries and continue across pages. Persisted payment references are preserved; otherwise the existing CP/SP receipt convention is used. Supplier document numbers use supplier_invoice_number where present, falling back to invoice_number. Date-only records display no fabricated time.
10. **Opening:** Sum all authoritative increases minus decreases before the selected local From Date. Without a From Date, opening is zero because no explicit opening mechanism exists. Either date boundary is optional. Boundaries are inclusive calendar dates.
11. **Running:** Start at opening, add each increase and subtract each decrease using BigInt paise, then safely convert for IPC. Reject totals outside the safe integer range. Deterministic order: local transaction date/time, local created_at, type priority (invoice/payment/return), immutable ID. Date-only records sort at local midnight.
12. **Credits:** Preserve signed balances. Positive means customer owes shop / shop owes supplier. Negative means customer credit or refund due / supplier credit due to shop. Existing reports maintain separate outstanding and credit_due figures per invoice; the complete ledger reconciles to outstanding − credit_due − legacy unallocated payments. This net balance does not settle or transfer credit between invoices.
13. **Returns:** Original invoice totals plus separate return adjustments; never subtract effective invoice totals and returns together. Discount allocation uses the existing stored return total. Returns do not create cash-refund entries.
14. **Pagination:** 25/50/100 rows. Backend computes complete matching totals and balances before slicing; opening never resets per page. UI tests verify page two starts at S.NO 26 and preserves totals. PDF ignores UI pagination and exports every matching entry.
15. **PDF:** Reuses existing preview component and print driver, with a dedicated ledger HTML template. Preview exposes Print and Save as PDF. Every output reloads saved authoritative transactions and shop settings. Native Save dialog supplies the destination. Windows-invalid filename characters are sanitized using existing filename logic. References open the existing read-only document preview.
16. **Multi-page:** A4 portrait, repeating table headers, wrapping text, aligned monetary columns and row-break avoidance. All rows are rendered. Real Chromium PDFs generated for 10, 50 and 125 invoice fixtures; 125-row statements produce multiple pages. Summary is protected from splitting. Output windows are destroyed after operations.
17. **Security:** Ledger channels use the existing administrator authorization wrapper, trusted sender guard and maintenance gate. Four explicit preload APIs: getStatement, preview, print, savePdf. Validate plain objects, party type/ID, real dates, order, pagination, unknown fields and argument counts. Export requests reject UI pagination fields. Renderer cannot supply SQL or file paths.
18. **Tests added:** Both parties: empty history, invoices, partial/full/multiple payments, returns, customer multiple partial returns, overpayment/return-created credits, inactive parties, correct opening/period/running/closing, stable order, reconciliation, pagination and invalid requests. Walk-in exclusion, unallocated legacy payment explanation, authentication rejection, safe filenames, actual PDFs, intercepted native printer, read-only schema and window cleanup. Real UI: route/tabs/search, inactive accounts, dates/reset/invalid range, S.NO/summary, loading/empty/error/retry, previews, pagination/full export and 640px layout.
19. **Commands:** Executed every suite listed below with `npm.cmd run <name>` because PowerShell blocks npm.ps1. Electron suites ran outside the sandbox after sandboxed Chromium startup failed; all use isolated temporary profiles. No real shop database was used.
20. **Results:** All final runs PASS:

| Suites | Result |
| --- | --- |
| test:ledger, test:ledger:ui | PASS |
| test:db | PASS |
| test:customers, test:customers:ui | PASS |
| test:suppliers, test:suppliers:ui | PASS |
| test:sales, test:sales:ui | PASS |
| test:purchases, test:purchases:ui | PASS |
| test:customer-payments, test:customer-payments:ui | PASS |
| test:supplier-payments, test:supplier-payments:ui | PASS |
| test:sale-returns, test:sale-returns:ui | PASS |
| test:purchase-returns, test:purchase-returns:ui | PASS |
| test:reports, test:reports:ui | PASS |
| test:printing, test:printing:ui | PASS |
| test:auth, test:auth:ui | PASS |
| test:electron, test:electron:dev | PASS |
| build | PASS; bundle-size warning |

Initial failures resolved: npm.ps1 execution policy (used npm.cmd), sandboxed Electron rendering (approved unrestricted test execution), ledger UI harness skipped main-window setup (removed premature preload check), printing test whitespace assertion (changed to regex). Final ledger backend/UI runs include the date-only display and pagination refinements.

21. **Limits:** Backend loads the selected party's history to calculate exact BigInt balances before UI pagination; exceptionally large histories may need a future SQL streaming/window-query optimization. Existing print templates have textual branding and no logo/page-number support, so ledger follows those conventions. Native printing was intercepted in tests; no physical printer output was verified. Automated PDF checks verify generated PDFs, row completeness in source HTML and page count; they do not inspect each PDF page visually. Legacy unallocated payments are intentionally included and disclosed even though invoice-based reports omit them. No cash refund/credit settlement or opening-balance editing workflow was added.
22. **Compatibility:** No schema changes, released migration edits, tag changes, business-data resets or installer builds. New services are read-only. Schema-5 fixtures, foreign-key checks, existing regression suites and read-only snapshots passed. Existing v0.1.0 databases remain compatible.
