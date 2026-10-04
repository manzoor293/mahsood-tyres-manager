# Compact Sales and Purchase invoices

## Architecture and scope

Printing reads saved records through `createDocumentService` and the printing repository. `createPrintingService` renders HTML for Preview, then reloads saved data for each Print/PDF operation. The renderer displays that HTML in a sandboxed iframe. Native output uses a separate hidden sandboxed Electron window with JavaScript disabled, no preload and no Node access. PDF destinations continue to come exclusively from the native Save dialog.

Previously, all six business documents shared the A4 template and the driver explicitly requested A4. Sales and Purchase invoices now select a shared compact template and A5 paper profile. Payment receipts, return notes and ledger statements retain their existing A4 templates/output defaults.

This change adds no schema/migration or accounting changes. Prices, quantities, costs, payments, returns, balances, profit and ledger calculations remain authoritative upstream values. The app version is unchanged and no installer was built.

## Files changed

- `electron/printing/compact-invoice.cjs`: shared invoice HTML, branding, party section, totals, current position, related returns, notes, signature strip and footer.
- `electron/printing/compact-invoice.css`: compact print typography, red/black/white styling, wrapping, repeated table headers, page-break rules and screen-only scaling.
- `electron/printing/mahsood-tyres-logo.png`: byte-identical copy of the existing official logo for packaged main-process printing; SHA-256 matches `src/assets/mahsood-tyres-logo.png`. The existing build includes `electron/**/*`.
- `electron/printing/paper.cjs`: shared main-process A5/A4 profiles and Electron media conversion for future custom pad dimensions.
- `electron/printing/template.cjs`: selects compact invoices and reuses the existing escaped item-table markup and formatting helpers.
- `electron/printing/driver.cjs`: per-document paper/color/background/margin options; A4 remains the default for existing callers.
- `electron/services/printing.cjs`: includes paper metadata in Preview and passes it to Print/PDF.
- `src/components/printing/PrintPreview.jsx`: displays the selected document size.
- `scripts/test-printing.cjs`, `scripts/test-printing-ui.cjs`: updated layout/media/security and Preview expectations.
- `scripts/compact-printing-checks.cjs`: additional real PDF, layout and media acceptance checks.
- This report.

## Shared invoice structure and branding

Both invoice types use the same header, red document title/reference/date bar, party/payment information, original item table, right-aligned totals, current invoice position, related returns, notes, signature strip and generated-information footer. Only the title and supplier/customer labels differ.

The official logo is embedded as a local PNG data URI. All descriptions, labels and values remain escaped HTML text. No remote image or invoice-body screenshot is used. The invoice CSP permits data images and inline styles while continuing to block scripts, remote resources, navigation and form actions. Other document CSPs remain unchanged.

The shop profile supplies name, address, phone, alternate phone, email, NTN/registration and footer. Their persisted keys are `shop.name`, `shop.address`, `shop.phone`, `shop.alternatePhone`, `shop.email`, `shop.ntn` and `printing.footer`. Empty contact fields are omitted. The authoritative Settings service provides its existing fallback shop name. The watermark was omitted to preserve maximum contrast and readability.

## Paper and output behavior

The actual invoice PDF media is **148 × 210 mm, A5 portrait**, with **7 mm margins**. Tests inspect PDF `/MediaBox` dimensions, approximately **419.53 × 595.28 points**, including multi-page files. These are A5 PDF pages, rather than small layouts drawn on A4 pages.

The common paper profile controls CSS dimensions, screen width, margins and driver settings. Changing to a custom pad size requires updating that profile; custom Electron dimensions are converted from millimetres to micrometres. A4 stays the default profile for other documents and for ledger driver calls.

Preview presents the same HTML used by Print and Save as PDF. Screen-only scaling fits narrow preview windows without changing print geometry. The preview is continuous HTML rather than a paginated PDF viewer. Each output operation reloads saved records and returns a fresh preview so current payments and returns stay current.

Save as PDF uses `preferCSSPageSize: true`, the A5 profile, `printBackground: true` and `displayHeaderFooter: false`. Native invoice Print requests A5, color and background printing, custom 7 mm margins converted to Electron's pixel units, and the normal interactive printer dialog. Other business documents retain their prior A4/grayscale/background defaults.

## Information and pagination

The six item columns preserve SKU, brand/model, tyre size, quantity, matching price and line total. Saved factor-2 transactions show `Qty (Pairs)` and `Price / Pair`; legacy factor-1 transactions show `Qty (Tyres)` and `Price / Tyre`. Existing mixed-unit row labels are retained. Quantities are centered; money is right-aligned. Long descriptions and large monetary strings wrap instead of being truncated.

The original subtotal, discount and invoice total remain visible; the final original total has a red highlight. Current invoice position includes original total, total returns, effective total, amount received/paid, current receivable/payable balance, customer credit/refund or supplier credit, and status. It preserves the explanation that current values include recorded payments and returns at generation time. Related return references, dates and values, notes, profile footer, historical-directory note and generated timestamp also remain visible.

Table headers repeat on subsequent printed pages. Rows avoid splitting where possible. Totals and current-position blocks avoid splitting and follow all item rows. Extremely tall individual descriptions can still span pages when they exceed a full page. No content is clipped with fixed-height containers.

Generated test fixtures with one item fit on one page for both invoice types. The deliberately long-description 5-, 10- and 24-item fixtures span two pages. An 80-row legacy invoice also exercises additional pagination. Tests assert all expected items remain in HTML and totals do not overlap item rows.

## Verification

PASS: `npm.cmd run test:printing`, including real Chromium PDFs for both invoice types with 1/5/10/24 items; legacy tyre and new pair labels; long contacts/products/addresses; large PKR amounts; exact paise; discount/zero discount; partial/paid/unpaid invoices; saved returns/credits; settings/logo loading; one-page short invoices; multi-page output; native A5/color/margin options; unchanged A4 payment/return PDFs; output cancellation/failures; escaped malicious descriptions; customer cost exclusion; fresh reads; IPC validation; unchanged database snapshots and output-window cleanup.

PASS: `npm.cmd run test:printing:ui`, including all six document actions, sandboxed Preview, A5 indication, Print cancellation/failure/success through intercepted native calls, PDF cancellation/save, retry, refresh and narrow UI behavior.

PASS regression commands:

```text
npm.cmd run test:purchases
npm.cmd run test:purchases:ui
npm.cmd run test:sales
npm.cmd run test:sales:ui
npm.cmd run test:pairs
npm.cmd run test:pairs:ui
npm.cmd run test:sale-returns
npm.cmd run test:sale-returns:ui
npm.cmd run test:purchase-returns
npm.cmd run test:purchase-returns:ui
npm.cmd run test:customer-payments
npm.cmd run test:customer-payments:ui
npm.cmd run test:supplier-payments
npm.cmd run test:supplier-payments:ui
npm.cmd run test:ledger
npm.cmd run test:ledger:ui
npm.cmd run build
npm.cmd run test:electron
npm.cmd run test:electron:dev
```

The production build succeeds with the existing >500 kB bundle warning. Negative printing tests intentionally log simulated output failures. Final passing logs are under ignored `artifacts/compact-*.log`.

Review samples are generated under ignored `artifacts/`: `saleInvoice-a5.png`, `purchaseInvoice-a5.png`, and `{saleInvoice,purchaseInvoice}-{1,5,10,24}-a5.pdf`.

## Limits

The attachment contained the written design brief, without the mentioned official pad image or reference PDF. Styling follows the supplied specification and existing official logo; pixel-level matching to that missing image cannot be verified.

Native printer calls were intercepted during automated tests; no physical printer was used. Actual A5 tray selection, printable-area restrictions, color/grayscale output and any driver/user paper overrides need a physical check on the selected printer. The application requests A5 explicitly, but printer support and dialog overrides remain outside its control. PDF media dimensions were verified independently of printer hardware.
