# Mahsood Tyre Manager

Sales, Inventory & Shop Management System

JavaScript, React, Vite, and Electron frontend foundation with Tailwind CSS v4, Material UI/Emotion, and React Router. Requires Node.js 22.12+ (Node 24 LTS recommended) and npm.

```sh
npm install
npm run dev
```

On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

`npm run dev` starts Vite on `127.0.0.1:5173`, waits for it to listen, and opens Electron. Closing Electron or pressing Ctrl+C stops the development processes. The port is fixed; startup fails if it is already occupied. React/CSS changes update through Vite. Restart the command after editing main or preload files.

To run the built UI without Vite:

```sh
npm run build
npm start
```

This builds renderer assets, not an installer. Electron loads `dist/index.html` locally with relative asset paths.

## Architecture

- `src/`: React renderer; browser APIs only.
- `src/App.jsx`: Material UI theme and `HashRouter`, supporting local production files.
- `src/layouts/AppLayout.jsx`: persistent sidebar/header and scrollable route content.
- `src/components/`: reusable navigation, header, and local SVG icons.
- `src/routes/`: route definitions and shared navigation metadata; unknown routes return to Dashboard.
- `src/pages/ProductsPage.jsx`: Products / Tyres management interface using the existing catalog preload APIs.
- `src/pages/PlaceholderPage.jsx`: placeholder for unfinished modules such as Settings, without sample data or business actions.
- `src/styles.css`: Tailwind v4 import and base styles. Tailwind handles layout; Material UI uses its theme and `sx` for component styling.
- `electron/main.cjs`: window lifecycle, local content loading, and security policy. Future privileged operations belong here.
- `electron/preload.cjs`: isolated context bridge exposing `desktop.isElectron` and explicit `window.api` catalog methods. No generic IPC or Node API is exposed.
- `scripts/dev.mjs`: Vite/Electron startup and shutdown.
- `scripts/start.mjs`: built-app launcher; both launchers clear inherited `ELECTRON_RUN_AS_NODE` so Electron opens as a desktop application.
- `vite.config.js`: React tooling, local development address, and relative build paths.

Context isolation and renderer sandboxing are enabled; Node integration is disabled. Document navigation, new windows, webviews, and permission requests are blocked. Hash navigation stays inside the current document. The content security policy allows local scripts and Vite's local WebSocket; inline styles support Vite's CSS updates and Emotion. Database operations run only in Electron's main process. Catalog IPC validates the application window, main frame, exact document URL (allowing hash navigation), and inputs. Products / Tyres has a management UI; authentication and other module interfaces remain unimplemented.

Routes: Dashboard, Products / Tyres, Suppliers, Purchases, Sales / POS, Customers, Expenses, Reports, and Settings. Fonts and icons are local and require no network access.

Development alone permits inline scripts for React Fast Refresh's preamble. Built HTML retains the stricter script policy.

## Verification

After `npm run build`, run `npm run test:products:ui` for the actual Products form/table workflow through React, preload, IPC, and SQLite. The test launches Electron with a unique temporary userData directory, seeds only test lookup records there, creates its product through the form, and verifies editing, duplicate SKU messages, currency conversion, search, brand/category/status filters, empty/loading/error/retry states, deactivation confirmation/cancellation, and narrow layout. The temporary data is removed after Electron exits. A screenshot is saved to ignored `artifacts/products-ui.png`. `npm run test:products:ui -- --dev` exercises the same workflow against an already-running Vite server on port 5173.

Run `npm run test:db` for a windowless Electron schema check using a freshly migrated temporary database/profile. It then opens that fixture read-only and verifies schema version, tables, foreign keys, WAL, unique constraints, historical cost columns and userData path. The parent runner removes the fixture after Electron exits. To inspect an existing shop database read-only without migration, use `node scripts/start.mjs --db`; initialize/upgrade the application normally first. Neither verification path inserts sample shop records.

```sh
npm run test:electron:dev
npm run build
npm run test:electron
```

These checks launch real Electron windows, visit all ten routes, check active navigation, reload a hash route, verify unknown-route fallback, styling, narrow-window layout, the preload bridge, absence of renderer Node globals, and security preferences. They save screenshots under ignored `artifacts/` and exit. They require a desktop session.

They also verify database initialization in the main process, all 20 tables, WAL, foreign keys, integrity, persistence, constraints, stock auditing, historical costs, separate payments, migration rollback, and rejection of newer schema versions. Both npm smoke commands use temporary profiles/databases that are removed afterward; shop data is not migrated by automated verification.

## Database foundation

- `electron/database/index.cjs`: opens the database after Electron is ready, enables foreign keys and WAL, migrates before opening the window, and closes on normal exit. Importing a connection from a renderer or ordinary Node process is rejected.
- `electron/database/migrate.cjs`: ordered migrations tracked by `PRAGMA user_version`; pending migrations and version changes run in one immediate transaction. Failed migrations roll back; newer database versions are rejected. Add a new numbered migration to the ordered list for future changes; do not edit an applied migration or recreate existing tables at startup.
- `electron/database/migrations/001-initial.sql`: schema version 1, indexes, and inventory integrity triggers.
- `electron/database/migrations/002-catalog-status.sql`: schema version 2 adds active status and update timestamps to brands/categories, preserving existing rows. Existing update timestamps are backfilled from creation timestamps; catalog services set them on all subsequent writes.
- `electron/database/migrations/003-expense-category-status.sql`: schema **3** added active status and update timestamps to expense categories so they can be deactivated without deleting financial references. Existing categories become active, timestamps are backfilled, and expenses remain unchanged. No sample/default categories are inserted.
- `scripts/verify-database.cjs`: database verification invoked by both Electron smoke checks.

The path in both development and built-assets production mode is `path.join(app.getPath('userData'), 'database', 'mahsood-tyre-manager.sqlite3')`. On this Windows account it resolves to `C:\Users\DELL\AppData\Roaming\Mahsood Tyre Manager\database\mahsood-tyre-manager.sqlite3`. Startup prints the actual path. Development and production currently share this database. SQLite may create adjacent `-wal` and `-shm` files while open. This project does not yet produce a packaged installer.

`better-sqlite3` is a runtime dependency. The installed version 13 includes a native Windows binary that is verified in Electron by the smoke checks; no separate rebuild dependency is required. Run both smoke checks after upgrading Electron or the database package. The native module and SQL migration files must be included when installer packaging is added.

Schema conventions:

- All tables use integer primary keys and SQLite `STRICT` types. Monetary values are nonnegative integer minor units (PKR paise: Rs 125.50 = 12550); payment and expense amounts must be positive. Future services must validate JavaScript safe integers before binding amounts.
- Timestamps default to UTC ISO-8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`). Future services must use `new Date().toISOString()` for supplied timestamps and set `updated_at` on edits. Inventory updates its own timestamp through its movement trigger.
- SKU and internal invoice numbers are case-insensitive and unique. Optional brand/category links permit uncategorized products; purchase suppliers are required. An optional supplier invoice number is separate from the unique internal purchase number. Customer-less sales support walk-in customers.
- Purchase lines retain `unit_cost`; sale lines retain `unit_price` and `unit_cost`, independently of the product's current default price. Future costing policy and invoice posting services are not implemented here. Header totals enforce subtotal minus discount; future posting services must validate totals against lines and write the invoice, lines, and movements in one transaction.
- Every product starts with a zero inventory row. Append-only signed stock movements are the only way to change its quantity. Triggers reject negative inventory, mismatched direction, direct quantity changes, and ledger edits/deletes. Returns and adjustments are new movements. Purchase/sale movements require matching product/line foreign keys. Services must later enforce posting idempotency and return limits.
- Payments are independent records, optionally allocated to an invoice; balances are calculated from invoices and payments rather than overwritten paid fields. A supplier/customer must match the allocated invoice. Anonymous customer payments require an anonymous sale. Unallocated payments require a named party. Payment methods are nonempty text so future methods do not require a schema migration.
- Foreign keys restrict deleting referenced records. Deactivate products/parties to preserve historical records. Settings values are text; no default shop settings or sample business data are seeded.

## Expenses

The Expenses page supports create, list, get-by-ID/edit, description/category search, category/payment/date-range filters and 25-row pagination. It includes loading, empty and error/retry states. Manage Expense Categories reuses the catalog lookup dialog with create, rename, deactivate confirmation and active/inactive/all filtering. Category changes refresh selectors immediately; inactive categories remain visible on historical expenses and in filters, but cannot be newly selected.

`window.api.expenses` exposes `list(filters?)`, `getById(id)`, `create(data)` and `update(id, patch)`. Expense fields are `expense_category_id`, `amount` (positive safe integer paise), `description` (required, trimmed, up to 5000 characters), `payment_method` (`Cash`, `Bank transfer`, `Cheque`; defaults to Cash on creation), and `spent_at` (YYYY-MM-DD). Filters accept `search`, `expense_category_id`, `payment_method` or `all`, `from_date`, `to_date`, `limit` (1–500) and `offset`. Renderer rupee input is converted to paise; main-process validation is authoritative. IDs, dates, allowed fields and monetary values are checked before transactional writes.

`window.api.expenseCategories` exposes `list(filters?)`, `create({name})`, `update(id,{name})` and `deactivate(id)`. Names are trimmed, 1–200 characters and unique case-insensitively, including inactive names. Lists accept active status and pagination like Brands/Categories. Category writes update `updated_at`. Migration 003 is required because schema 2 lacked category status; previously applied migrations remain untouched.

Expense editing preserves `created_at`; the existing expense table has no update timestamp, revision history, void or deletion mechanism, and none is invented. Partial updates preserve omitted fields and untouched legacy date/time/payment-method values. An expense can retain its existing inactive category during other corrections, but switching to an inactive category is rejected. Expense/category actions never modify inventory, stock movements, invoices or party payment tables. Category renaming changes the label displayed for linked expenses.

Run `npm run test:expenses` and, after building, `npm run test:expenses:ui`. Both use temporary data, with backend migration preservation/failure tests, validation, integer-money persistence, expense updates/filters, inactive category handling, all eight real preload/IPC APIs and UI category refresh/confirmation/retry tests. Automated database and production smoke commands also now use temporary profiles so they cannot migrate shop data during tests. Restart the app normally to apply migration 003 to the shop database and load the new preload APIs.

No expense deletion, voiding, dashboard, reports, payroll, recurring expenses, later customer/supplier payments, returns, advanced accounting or profit-and-loss functionality is included.

## Sales / POS

Development verification: `npm run test:electron:dev` starts an isolated Vite server on an available loopback port with its own temporary cache, database and Electron profile. It does not compete with a running `npm run dev` session on port 5173. Electron accepts the test port only in development mode via `MAHSOOD_DEV_PORT`, validates it, and retains exact-origin IPC sender checks. Production verification can use `node scripts/test-products-ui.mjs --smoke` for the same temporary-profile isolation.

Sales / POS provides a searchable cart and checkout, followed by read-only sale details and paginated history. Product selection adds one unit; selecting the same product again merges it into the existing cart row. Quantities and rupee selling prices are editable before completion. Active customers can be searched by name/phone/address, or the sale can remain Walk-in (`customer_id = null`), without creating a dummy customer. History supports invoice/customer search, a specific customer (including inactive contacts), walk-in only, UTC date range and payment status. Date/time displays use local time.

`window.api.sales` exposes only `list(filters?)`, `getById(id)`, and `create(data)`, with the existing result/error envelope. List filters: `search`, optional `customer_id` or `walk_in: true`, `from_date`, `to_date` (YYYY-MM-DD), `payment_status` (`all`, `paid`, `partial`, `unpaid`), `limit` (1–500), `offset`. Create accepts optional `invoice_number`, optional/null `customer_id`, `items: [{product_id, quantity, unit_price}]`, optional `discount`, `paid_amount`, `payment_method`, `notes`, and `sold_at` (canonical UTC ISO timestamp; defaults to now). Money crosses IPC as safe integer paise. Item prices may be zero, as allowed by the existing schema. Quantities must be positive whole numbers. Discount cannot exceed subtotal; paid amount cannot exceed total. Unknown fields, renderer totals, supplied costs and duplicate product rows are rejected.

One immediate SQLite transaction validates active customer/products, reads current inventory and the latest purchase cost, computes totals, inserts the sale and historical items, records negative SALE movements and the initial payment. Stock is reread immediately before each reduction and checked before commit under the transaction's write lock. Only the existing movement trigger mutates inventory. Insufficient/stale stock or any item, movement, inventory or payment failure rolls back all sale-related changes. Tests deliberately fail the second movement and the payment insert and compare all five affected tables before/after. No direct stock update API is exposed.

Missing invoice numbers are allocated as `SALE-000001` etc. inside the same write transaction, using the next sale ID as the starting sequence and skipping existing invoice strings. Explicit invoice numbers are trimmed and unique case-insensitively. Completed sales are never deleted or edited by this module.

Historical `unit_cost` uses the latest **inserted** purchase item (`ORDER BY purchase_items.id DESC`), consistently with Inventory's reference-cost policy; it does not use FIFO, weighted averages or a backdated purchase date. When no purchase exists, the existing explicit fallback is zero. Internal sale details explain this fallback and show immutable sale-time cost and price. Product/customer names and contact details remain current directory values. There is no customer-facing receipt output or profit report.

Payment methods are `Cash`, `Bank transfer` and `Cheque`. A positive initial paid amount creates one linked `customer_payments` record in the sale transaction, including for null-customer walk-in sales. Zero paid amount creates no payment record, so no payment method is stored for an unpaid sale. Balance is total minus summed linked payments. A walk-in sale can carry a balance, with an on-screen notice that no customer contact is attached. There is no customer credit/prepayment model.

Sales uses the original schema-2 financial tables; current application schema is **4** for return documents. Sale returns and later payments are implemented in their dedicated modules. Deletion, post-completion item edits, statements, PDF/printing and advanced accounting remain deferred; Expenses, Dashboard and Reports are implemented separately. Run `npm run test:sales` and, after building, `npm run test:sales:ui`; both use temporary databases/profiles. Tests cover historical values, full/partial/walk-in/customer sales, concurrent stock changes via a separate connection, stock/payment rollback, invoice allocation, all three preload/IPC methods and the real POS workflow. Screenshots are saved under ignored `artifacts/`.

## Customers

The Customers directory uses the existing schema-2 `customers` table: `name`, optional `phone`, `address`, `notes`, `active`, and server-controlled creation/update timestamps. No migration is needed. The page supports Add/Edit Customer, read-only details, name/phone/address search, active/inactive/all filtering, 25-row pagination, deactivation confirmation, and loading/empty/error/retry states. Inactive contacts can still be viewed and edited without reactivation. Deactivation preserves the row; there is no permanent deletion or reactivation API.

`window.api.customers` exposes `list(filters?)`, `getById(id)`, `create(data)`, `update(id, patch)`, and `deactivate(id)` through narrowly scoped IPC and the existing result/error envelope. Lists accept `search`, `active: true | false | 'all'`, `limit` (1–500), and `offset`; they default to active records and sort by name then ID. The main-process service uses immediate transactions for writes and parameterized repository queries. Renderer Node access stays disabled and context isolation stays enabled.

Name is required, trimmed, and limited to 200 characters. Optional phone input allows an initial `+`, digits, spaces, parentheses and hyphens, normalizing to 7–15 digits with an optional leading `+` (input limit 40 characters). Address allows 1000 characters and notes 5000. Blank optional fields become null. Unknown fields, caller-controlled status/timestamps, invalid IDs and empty updates are rejected. Partial edits preserve omitted fields. Duplicate names and phone numbers are permitted by the existing schema. Suppliers and Customers share `contact-validation.cjs` to keep these rules consistent.

Run `npm run test:customers` and `npm run test:customers:ui` after building. Tests use temporary databases/profiles removed by the parent runner after Electron exits. Coverage includes all five APIs through real preload/IPC, validation, sender rejection, sanitized failures, search/paging, persistence, failed-write rollback, UI creation/editing/details, inactive edits, deactivation cancel/confirm, error/retry and narrow layout. Sales, payments, balances, invoices and transaction history are intentionally deferred.

## Inventory / Stock Management

The Inventory navigation entry opens Current Stock and Stock Movements tabs. Current quantities are read from `inventory`, joined to product descriptions, brands and categories. Search matches SKU, brand, model or size; brand/category, product activity and stock-level filters combine with AND. Out of Stock means zero; Low Stock means a positive quantity at or below `minimum_stock`; In Stock means above the minimum. Inactive products retain both their stock-level badge and an Inactive Product badge, and cannot be adjusted. The UI shows all product activity states by default; the stock API defaults to active products.

History shows every existing movement type, signed quantity changes, notes, invoice references when available, and the ledger balance after each movement. Balances use insertion ID order before filtering or pagination, not an invoice's business date. Timestamps display in local time; date filters explicitly use UTC dates. Descriptions reflect current product/lookup names. Product-row History opens that product's movements; Reset filters clears the product restriction. Both tabs page through 50 rows and support loading, empty, error/retry and refresh states.

`window.api.inventory` uses the existing `{ok,data}` / `{ok:false,error}` envelope:

| Method | Input |
| --- | --- |
| `list(filters?)` | `search`, `brand_id`, `category_id`, `active` (`true`, `false`, `'all'`), `stock_status` (`all`, `in`, `low`, `out`), `limit` (1–500), `offset` |
| `getProductStock(productId)` | Positive integer product ID; includes inactive products |
| `listMovements(filters?)` | Shared search/brand/category/activity/paging filters, optional `product_id`, `movement_type`, `from_date`, `to_date` (YYYY-MM-DD); activity defaults to all |
| `adjust(data)` | `product_id`, `movement_type` (`ADJUSTMENT_IN` / `ADJUSTMENT_OUT`), positive integer `quantity`, required `notes`, optional `expected_quantity` |

Adjust Stock fetches current stock and requires a separate confirmation showing current, change and expected resulting quantities. The UI sends `expected_quantity` to reject stale confirmations and disables repeated saves. This value is only a concurrency check: the main process independently reads stock, validates product activity, quantity, reason, safe integer bounds and sufficient stock inside an immediate SQLite transaction. It inserts exactly one movement; the existing `movements_apply_inventory` trigger is the sole writer of inventory quantity. Any ledger/trigger failure rolls back both movement and stock change. There is no `setStock`, generic SQL, deletion or movement-edit API.

Inventory uses the original schema-2 stock tables; current application schema is **4** for return documents. The schema requires `unit_cost` on every movement, so manual adjustments record the latest inserted purchase item's historical cost, or zero when no purchase cost is known. This is a reference cost, not a new inventory valuation/accounting model; users cannot submit costs through the adjustment API. Sales, returns, opening-stock entry, supplier payments, reports and other accounting workflows remain outside this module.

`npm run test:inventory` covers stock and history filters, boundary statuses, purchase references, both adjustment directions, validation, stale stock, insufficient stock, persistence, IPC guards and rollback during movement/inventory processing. `npm run test:inventory:ui` (after building) drives the actual renderer/preload/IPC workflow for search, filters, history, confirmation/cancel, both adjustments, validation, insufficient/stale stock, retry and narrow layouts. Both tests use the isolated runner's temporary database/profile and clean up after Electron exits. The UI screenshot is written to ignored `artifacts/inventory-ui.png`. Production and development smoke checks include Inventory navigation and read-only inventory APIs.

## Purchases

The Purchases route supports stock receipt entry, searchable product selection, multiple unique products, supplier/date/payment filters, paginated invoices and read-only details. Enter money in rupees; the bridge sends safe integer paise. Unit costs must be positive, quantities positive whole numbers, and discounts/payments nonnegative. Payments cannot exceed the discounted total.

`window.api.purchases` exposes only `list(filters?)`, `getById(id)` and `create(data)`, using the same result/error envelope as catalog APIs. Create accepts `supplier_id`, unique `invoice_number`, `purchased_at` (`YYYY-MM-DD`), optional `notes`, `items: [{product_id, quantity, unit_cost}]`, optional `discount`, `paid_amount` and `payment_method` (defaults to Cash). Calculated fields and unknown fields are rejected; the main process computes line totals, subtotal, total and balance. List filters are `search`, `supplier_id`, `from_date`, `to_date`, `payment_status` (`all`, `unpaid`, `partial`, `paid`), `limit` (1–500) and `offset`. Search matches invoice or current supplier name. Results include payment sums and item counts; details include historical item costs and payments.

The service validates and writes inside one immediate SQLite transaction. Each purchase item creates one linked PURCHASE stock movement; the existing trigger increases inventory. No direct inventory updates occur. A positive initial payment creates a linked supplier_payments record in the same transaction. Any failure rolls back the header, items, movements, stock projection and payment. Supplier/product activity is checked inside the transaction; historical purchases remain readable after deactivation.

Purchases uses the original schema-2 financial tables; current application schema is **4** for return documents. Other costs are unavailable because the existing schema requires `total = subtotal - discount`. Completed purchases remain read-only. Returns and later payments are implemented in their dedicated modules. Editing, deletion, credit spending and prepayments remain deferred. Supplier/product descriptions reflect current directory values; item quantity and unit cost remain historical.

Run `npm run test:purchases` and, after `npm run build`, `npm run test:purchases:ui`. Both use temporary databases and userData directories removed by the parent runner after Electron exits. Backend tests include failures on the second stock movement and on payment insertion, verifying all five affected tables are unchanged. UI tests drive actual React controls through preload/IPC, including validation, duplicate prevention, repeated-submit protection, filters, details and retry states. Electron smoke checks also exercise the purchases list API.

## Returns / Reversals

The Returns page has **Sale Returns** and **Purchase Returns** tabs. Search an original invoice, inspect sold/purchased, previously returned and remaining quantities, select whole units, and enter a return date and reason. Purchase returns also show current stock. Review the calculated adjustment and credit before confirming. History and details are read-only. Duplicate submissions are blocked while saving; a stale rejection reloads invoice facts and never automatically retries the write.

Migration **004-returns.sql** advances schema 3 to **4 (20 tables)**. Migrations 001-003 are unchanged. The four new tables are sale_returns, sale_return_items, purchase_returns and purchase_return_items. Headers identify the original invoice, reference, date, notes and financial total. Items retain original-item references, historical unit price/cost, quantity, gross value, discounted adjustment and a unique stock-movement reference. Foreign keys and validation triggers check item ownership, cumulative quantity, original prices and movement consistency. Update/delete triggers protect completed returns. Tests verify preservation of schema-3 data and atomic migration rollback.

**Financial definitions:** original invoice total is never changed. Effective total = original total - sum of return adjustments. Outstanding = max(effective total - linked payments, 0). Credit/refund due = max(linked payments - effective total, 0). Credits remain separate from outstanding obligations, including when an account has both; they are never silently netted, paid out or spent. Fully paid invoices can become credit invoices. Walk-in sale returns retain their invoice identity without inventing a customer. Account reports exclude walk-ins; invoice details, Returns and Dashboard still expose their refund due.

**Discount allocation:** historical sale-item unit_price or purchase-item unit_cost determines gross value. Allocate the invoice's original net total over item lines in original item-ID order using differences of cumulative integer ratios. Within each line, allocate by cumulative returned quantity using the same rule. All intermediate arithmetic uses BigInt and persisted money uses integer paise. This gives deterministic rounding regardless of return order/batching, and a complete invoice return reverses exactly its original discounted total. An inconsistent legacy subtotal is rejected for a separate correction workflow. Current product prices never determine a return.

**Stock and transactions:** BEGIN IMMEDIATE precedes all invoice, returnable quantity and stock reads. One transaction creates the header, movements and items. SALE_RETURN adds stock; PURCHASE_RETURN removes stock, with aggregate stock validation for repeated products. The existing movement trigger exclusively updates inventory. Any failure rolls back the complete document and stock changes. Original invoices, original items and payments are not edited or deleted.

**Analytics:** shared return/effective-total/balance helpers feed Sales, Purchases, Payments, Dashboard and Reports. Invoice-date reports and Dashboard show the current effective value of invoices in the selected original invoice-date period, including later returns; these are restated invoice cohorts, not a return-date cash ledger. Return history uses the return date. Payment-date cash totals stay unchanged because a return is not a cash refund. Profit reverses returned units at the original historical cost; unknown-cost flags remain incomplete even after a full return. Top-product quantities and gross item revenue exclude returned units. Receivable/payable reports include open and credit invoices with separate credit columns.

Eight scoped preload methods are exposed: window.api.saleReturns.{list,getReturnableSale,create,getById} and window.api.purchaseReturns.{list,getReturnablePurchase,create,getById}. Lists accept search, optional sale_id/purchase_id, limit and offset. Create accepts sale_id/purchase_id, items containing sale_item_id/purchase_item_id and quantity, returned_at (YYYY-MM-DD), and optional notes. Totals and prices are calculated in main; no generic SQL or update/delete method is exposed.

Run test:sale-returns, test:purchase-returns and their :ui counterparts after building. Tests use deterministic temporary databases/profiles, cover migration, rollback, stale connections, stock shortages, partial/full/repeated returns, discount rounding, protected history, credit and outstanding balances, later payment settlement, cross-module analytics, and actual renderer/preload/IPC behavior. Screenshots are written to ignored artifacts/. The real shop database is never a test target.

Deferred: return editing/deletion or reversal-of-return corrections, payment editing/deletion, cash refund processing, store-credit spending, prepayments, advanced accounting, PDF printing, payroll, forecasting, sync and backup/restore.

## Customer and Supplier Payments

The **Payments** sidebar page provides Customer Payments and Supplier Payments tabs. Each has **Open invoices** and **Payment history** views, account lookup (including inactive accounts), invoice/account search, pagination, loading/empty/error/retry states and refresh. Select an open invoice to reload its current balance, enter a rupee amount, local payment date, Cash/Bank transfer/Cheque method and optional notes, then review **Invoice Total**, **Paid So Far**, **Payment Now** and **Remaining After Payment** before choosing **Record Payment**. The form blocks duplicate submissions while saving. A rejected stale payment refreshes invoice facts but never automatically retries the financial write. Completed payments are read-only.

`window.api.customerPayments` and `window.api.supplierPayments` each expose exactly these methods through the existing result/error envelope:

| Method | Input / result |
| --- | --- |
| `list(filters?)` | Open linked invoices only; `search`, `customer_id` / `supplier_id`, `limit` (1–100, default 25), `offset`; returns rows and full-filter invoice/paid/outstanding totals |
| `getOutstanding(saleId / purchaseId)` | Current original invoice total, sum of linked payments, balance and derived payment status |
| `getAccountSummary(customerId / supplierId)` | Total invoiced/purchased, total linked payments, current outstanding and open-invoice count across **all** invoices/dates for the account |
| `create(data)` | `customer_id` + `sale_id`, or `supplier_id` + `purchase_id`; positive integer-paise `amount`, required `payment_method`, required `paid_at` (YYYY-MM-DD), optional `notes` (up to 5,000 characters); returns inserted payment and updated invoice facts |
| `history(filters?)` | Account ID, optional invoice ID, `search` (invoice/account/notes), exact `payment_method` or `all`, date `period`, custom boundaries, limit/offset; returns initial and later linked payments and full-filter count/amount |

History defaults to all dates and supports Today, Last 7 days, This month, This year and an inclusive custom range. It reuses Dashboard/Reports local-date predicates, so existing UTC initial-payment timestamps and new date-only later payments share consistent local calendar filtering. A date-only payment has no invented time of day. Exact legacy payment methods remain searchable, although new entries accept only Cash, Bank transfer or Cheque. Dates may be historical or future valid calendar dates; no artificial invoice-date ordering rule is introduced. Current balances include all persisted linked payments regardless of payment date, while Dashboard's period cash totals filter payment dates.

**Balance and transaction safety:** outstanding = original invoice total − sum of linked payment amounts. Status remains derived (`unpaid`, `partial`, `paid`; displayed uppercase on the Payments page). Existing Dashboard/Reports `paymentTotal`, local-date and checked integer conversion helpers are reused. New payment inputs cannot supply totals or balances. The service validates identifiers, amount, method, date and notes, then starts an **IMMEDIATE** SQLite transaction **before** loading the invoice or its current linked payments. It checks the account relationship, rejects fully paid invoices and overpayments, inserts one payment, verifies the resulting facts, then commits. A competing writer must complete before the next request can read/validate, so stale UI balances cannot bypass the current balance check. Any insertion/post-insertion failure rolls back the whole payment. Inactive accounts can settle valid existing obligations. No invoice header/items, stock, contact, expense or other payment-table records are changed by the operation.

Walk-in sales (`customer_id IS NULL`) are rejected by the customer-account payment workflow, excluded from its open-invoice list and history, and never converted to fake accounts. Unlinked legacy payments are outside this invoice-linked workflow and are not silently allocated. The existing customer/supplier payment tables already contain account/invoice foreign keys, positive amounts, methods, notes, references and dates; no new columns, indexes, migrations or duplicate status fields are necessary. Payments themselves require no migration. The Returns module below advances the application to schema **4**.

Sales/Purchase details, Dashboard and Reports already read linked payment records dynamically. Returning to those pages or refreshing displays the updated balances without synchronizing or rewriting invoice totals. Payments account summaries cover all invoices for an account; Reports account tables intentionally show only positive open invoices. Their outstanding values use the same formula. Dashboard's customer balance continues to include existing walk-in balances separately from the account-payment scope.

Implementation files are `electron/{repositories,services,ipc}/payments.cjs`, `src/pages/PaymentsPage.jsx`, and `src/components/payments/{PaymentDialog,PaymentTable}.jsx`. The existing account lookup component is reused. Main/preload and route/navigation wiring expose ten narrow IPC operations; there is no generic SQL or payment-table mutation API. Electron context isolation, disabled Node integration and sender validation remain enabled.

Run `npm run test:customer-payments`, `npm run test:supplier-payments`, then build and run `npm run test:customer-payments:ui` / `npm run test:supplier-payments:ui`. Shared deterministic fixtures and test harnesses use separate temporary databases/profiles for each run. Backend coverage includes unpaid/partial/final settlement, malformed inputs/overpayment/fully-paid rejection, account matching, walk-in rejection, a second connection committing after a stale read, AFTER INSERT rollback, inactive settlement, persistence, paging/history and IPC guards. UI coverage includes actual renderer/preload/IPC selection, review, payments, stale balance refresh, duplicate-submit protection, history filters/paging, errors/retry, narrow windows and integration with existing Sales/Purchases/Dashboard/Reports reads. Protected-table snapshots verify that payments do not change invoice totals/items or stock. Screenshots are saved under ignored `artifacts/customerPayments-ui.png` and `artifacts/supplierPayments-ui.png`.

Payment editing/deletion, cash refunds, credit spending/prepayments, invoice/receipt printing, advanced accounting, payroll, forecasting, cloud sync and backup/restore remain deferred.

## Reports

Reports provides eight read-only views of persisted data: Sales, Purchases, Inventory, Stock Movements, Expenses, Profit, Customer Receivables and Supplier Payables. Select one report, edit its filters, then choose **Apply filters**. **Reset filters** restores its defaults; **Refresh** reruns the applied filters. No record creation, editing, deletion, payment collection, export or printing actions are exposed. Sales and Profit rows can open the existing read-only internal sale-item view, including historical unit prices/costs; it is explicitly not a customer receipt.

The eight explicit `window.api.reports` methods are `getSales`, `getPurchases`, `getInventory`, `getStockMovements`, `getExpenses`, `getProfit`, `getReceivables` and `getPayables`. Each accepts an optional plain filter object and returns the existing `{ok,data}` / `{ok:false,error}` envelope. Data contains `rows`, `summary`, `totalRows`, `limit`, `offset` and `range` (null for current-state reports). Main-process validation rejects unknown fields, invalid enums, dates, IDs and pagination values. All methods execute SQL reads within one deferred snapshot transaction; database handles and SQL are never exposed across preload.

| Report | Filters beyond pagination | Data and totals |
| --- | --- | --- |
| Sales | Period, invoice `search`, `customer_id`, `walk_in`, `payment_status`, `payment_method` | Sales/items/customers and linked customer payments; invoice count, discounted revenue, received on invoices, outstanding |
| Purchases | Period, invoice `search`, `supplier_id`, `payment_status` | Purchases/items/suppliers and linked supplier payments; invoice count, discounted purchase value, paid on invoices, outstanding |
| Inventory | `search` (SKU/model/size), `brand_id`, `category_id`, `stock_status`, `active` | Shared Inventory projection and catalog lookups; matching products, active products, physical stock units, low/out counts |
| Stock Movements | Period, `product_id`, `movement_type` | Actual ledger rows, products and linked purchase/sale invoices; entry count, units in and units out |
| Expenses | Period, `expense_category_id`, `payment_method`, `search` (description/category) | Expenses/categories; count and total amount |
| Profit | Period | Sale headers and historical sale-item costs, plus period expenses; discounted revenue, cost, gross profit, expenses, operating result and unknown-cost diagnostics |
| Receivables | `search` (customer name/phone) | Named customers' positive open sale balances; account/open-invoice counts, open invoice totals, paid on those invoices and outstanding |
| Payables | `search` (supplier name/phone) | Suppliers' positive open purchase balances; account/open-invoice counts, open invoice totals, paid on those invoices and outstanding |

Pagination defaults to 25 rows, with backend `limit` from 1 to 100 and nonnegative `offset`. SQL computes totals over the **complete filtered dataset before pagination**, even when the requested page has no rows. Each UI page has 25 rows. Ordering is stable: transactions by local date/time then ID; inventory by SKU then product ID; accounts by outstanding descending then name/ID. Detail tables scroll inside the page at narrow window sizes.

Transaction periods use the **same** normalization and SQL predicates as Dashboard: `period` is `today`, `week` (today plus previous six days), `month`, `year` (month/year to date) or `custom`. Custom requires inclusive `from_date` / `to_date` (YYYY-MM-DD), with the existing ten-year bound. UTC timestamps are compared against local-midnight UTC boundaries; literal date-only records remain local dates. Stock movements filter their recorded timestamps, not a linked invoice's business date. Inventory and account reports are current-state/all-date views and reject date filters. Inventory defaults to active products; its totals follow all selected filters, including inactive/all status. No stock valuation is inferred.

**Payment scopes:** Sales/Purchases select invoices by invoice date, then sum **all linked payments** for those invoices. Their balance is invoice total minus linked payments. A payment-method filter selects sales having a matching payment, but paid totals still include all methods on those selected invoices. Exact recorded method strings are supported, including legacy methods. Dashboard's Amount Received/Supplier Amount Paid instead select linked payments by payment date; these are intentionally different questions and the report UI explains the distinction.

**Profit:** revenue = sum of discounted `sales.total`; historical cost = sum of `sale_items.quantity * unit_cost`; Gross Profit = revenue minus historical cost; Operating Result = Gross Profit minus expenses in the same period. Profit rows are entire invoices, so each invoice discount is deducted exactly once and no allocation or rounding across lines is necessary. No product/customer filtering is offered on Profit that could make full invoice discounts or shop expenses incorrectly attributable to a subset. Current catalog prices/latest costs never recalculate historical results. Product/contact descriptions reflect current directory values, since historical descriptions are not stored. This is not formal net profit or an accounting valuation model.

Every zero historical `unit_cost` is conservatively treated as potentially unknown, matching Dashboard. Summary diagnostics count affected item rows and affected invoices. If any exist, aggregate `grossProfit` and `operatingResult` are null and display **Incomplete**; affected invoice rows also withhold their gross profit. Known invoice rows may still show their own complete result. Recorded historical cost remains visible with an explicit incomplete warning. All authoritative money uses integer paise, SQLite integer aggregates, and checked BigInt subtraction/conversion; unsafe totals fail instead of silently rounding.

**Accounts:** only invoices whose persisted total minus linked payments is positive are grouped into account rows. Fully paid invoices are excluded from open-invoice counts and monetary totals, and inactive contacts remain reportable. Walk-in sales are excluded from customer accounts; their total open balance is shown separately as `excludedWalkInBalance` across all dates, independent of customer search. Dashboard retains its existing all-sale balance including walk-ins. Unlinked payments are not allocated to invoices or silently subtracted. No collection or allocation workflow is introduced.

Shared code extracted from Dashboard is in `electron/utils/analytics.cjs` (date normalization, safe integer conversion, profit arithmetic) and `electron/repositories/analytics.cjs` (date predicates, historical cost/unknown-cost aggregation and linked payment sums). Dashboard keeps its public API and date/profit behavior. Reports uses `electron/{repositories,services,ipc}/reports.cjs`, `src/pages/ReportsPage.jsx` and the four files under `src/components/reports/`. Main/preload, routing, the isolated test runner and smoke checks are wired accordingly. Existing date/item/payment-link indexes are retained; no migration or index was added. The Returns migration now advances the application to schema **4**.

Run `npm run test:reports`, then `npm run build` and `npm run test:reports:ui`. Deterministic fixture databases and Electron profiles are created in temporary directories, never in shop data. Backend tests cover all eight reports, full-filter totals across pages, payment scopes, local boundary dates, historical discounted profit, unknown costs, integer overflow, accounts, validation, read-only persistence and IPC guards. UI tests exercise all eight real renderer/preload/IPC methods, filters/lookups/dates, pagination, internal item inspection, warnings, empty/loading/error/retry and narrow layout. Screenshots are saved to ignored `artifacts/reports-ui.png` and `artifacts/reports-narrow.png`. Regression checks include Dashboard and both Electron modes.

PDF/Excel/CSV exports, print layouts/receipts, forecasting, payroll, cloud synchronization, backup/restore and formal accounting statements remain deferred.

## Dashboard analytics

The Dashboard reads persisted data through `window.api.dashboard.getOverview(filters?)`, using the existing `{ok,data}` / `{ok:false,error}` envelope. This is the only Dashboard bridge method. It validates the sender and a plain filter object, then runs aggregated repository queries in a deferred read transaction so all panels share one database snapshot. No SQL, database handle, or mutation API is exposed to React.

Filters accept `period: 'today' | 'week' | 'month' | 'year' | 'custom'` (default `month`). Week means today plus the previous six days; month/year mean their first day through today. Custom requires `from_date` and `to_date` in YYYY-MM-DD format, both inclusive, with a maximum ten-year span. Calendar dates use the main process's local timezone, displayed above the cards. UTC timestamps are filtered against local-midnight boundaries converted to UTC, with an exclusive next-day endpoint; date-only purchases and expenses retain their literal local business date. Legacy UTC purchase/expense/payment timestamps are supported too. These Dashboard local-date rules do not change existing module filters.

| Metric | Definition and source |
| --- | --- |
| Sales Revenue / invoice count | Sum of `sales.total` after invoice discounts / count of sales in the selected period |
| Amount Received | Sum of `customer_payments.amount` with a linked sale, filtered by payment date rather than invoice date |
| Purchases / purchase count | Sum of `purchases.total` after discounts / count of purchases in the selected period |
| Supplier amount paid | Sum of `supplier_payments.amount` with a linked purchase, filtered by payment date |
| Expenses | Sum of `expenses.amount` in the selected period |
| Customer Receivables | All recorded sales totals minus all linked customer payments, including unpaid walk-in sales |
| Supplier Payables | All recorded purchase totals minus all linked supplier payments |
| Gross Profit | Selected sales revenue minus `SUM(sale_items.quantity * sale_items.unit_cost)`, using the cost captured at sale time |
| Stock Units / active products | Sum of current `inventory.quantity` / count of active products, excluding inactive inventory |
| Low / out of stock | Shared Inventory projection: positive quantity at or below `minimum_stock` / zero quantity; the counts are disjoint |

Balances are current across all stored dates, not balances as of the selected period. Unlinked payments do not offset invoice balances. Zero historical cost cannot be distinguished from the Sales module's unknown-cost fallback, so every zero-cost sale item is conservatively counted in `unknownCostItemCount` (item rows, not units). If any exist, `grossProfit` is `null` and the UI displays **Incomplete**, an explanatory warning and the count instead of an inflated amount. Current product prices and subsequent purchase costs never recalculate historical profit. This is gross profit based on recorded historical costs, not formal net profit; purchase-discount allocation and formal accounting valuation are not introduced.

The response includes `range`, `summary`, `salesTrend`, `topProducts`, `stockAlerts` and `recentActivity`. Trends include every local day (or month for ranges longer than 92 elapsed days), including zero-sales buckets. An SVG chart and expandable values table need no chart dependency. Sales vs Expenses is explicitly a comparison, not profit. Top products are the top five by historical units sold, with historical item revenue **before invoice discounts**; descriptions/brand/SKU/size come from the current catalog because historical descriptions are not stored. Stock alerts show at most ten active products, out-of-stock first, with a link to Inventory. Activity shows the latest ten sales, purchases, expenses and manual/opening stock movements in the selected period, ordered by local business date/time and stable type/ID ties. Date-only records sort at local midnight and display no invented time.

Money remains integer paise; SQLite aggregates are read as exact BigInts and checked before conversion to safe JavaScript integers. Unsafe totals fail explicitly instead of silently rounding. The existing date, item-link and payment-link indexes are reused; the Returns module now advances schema to **4**. Only the shared Inventory SQL projection was exported, without changing its stock rules.

UI files are `src/pages/DashboardPage.jsx` and `src/components/dashboard/{DashboardSummary,DashboardTrend,DashboardDetails}.jsx`. They provide loading, empty, error/retry, refresh, custom range validation, accessible chart values and narrow-window table scrolling. Backend files are `electron/{repositories,services,ipc}/dashboard.cjs`, wired through the existing main/preload modules and router.

Run `npm run test:dashboard`, then `npm run build` and `npm run test:dashboard:ui`. Tests use deterministic fixtures in isolated temporary databases/profiles, never shop data. They cover known arithmetic, discounts, partial payments, current balances/stock, historical and unknown costs, local-midnight/legacy date boundaries, zero-filled daily/monthly trends, ranking/order, read-only operation, safe integer overflow, validation and the real UI/preload/IPC path. Screenshots are saved to ignored `artifacts/dashboard-ui.png` and `artifacts/dashboard-narrow.png`. Both Electron smoke checks also call the Dashboard API.

PDF/export/printing, forecasts, formal accounting statements, payroll, cloud sync and backup/restore remain deferred.

## Catalog backend API

`electron/repositories/catalog.cjs` contains parameterized SQL. `electron/services/catalog.cjs` handles validation and write transactions, using `services/validation.cjs`. `electron/ipc/catalog.cjs` registers only the catalog methods; SQL and database handles never cross the preload bridge.

All methods return promises resolving to `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. Expected error codes are `VALIDATION`, `NOT_FOUND`, `CONFLICT`, and `FORBIDDEN`; unexpected failures return `INTERNAL` without SQL details. Transport failures may reject the promise.

| API | Methods |
| --- | --- |
| `window.api.brands` | `list(filters?)`, `create({name})`, `update(id, {name})`, `deactivate(id)` |
| `window.api.categories` | `list(filters?)`, `create({name})`, `update(id, {name})`, `deactivate(id)` |
| `window.api.products` | `list(filters?)`, `getById(id)`, `create(data)`, `update(id, patch)`, `deactivate(id)` |

Lists return arrays, defaulting to active records, `limit: 100`, `offset: 0`. Filters accept `active: true | false | 'all'`, a limit from 1 to 500, and a nonnegative offset. Product filters additionally accept `search` (SKU, brand name, model, or size), individual `sku`, `brand`, `model`, `size` text filters, and exact `brand_id`/`category_id`. Text searches use literal substrings with SQLite's ASCII case folding; `%` and `_` are literal characters. Combined filters use AND; `search` matches any of its four fields. Lists are ordered by name/SKU then ID for stable pagination.

Product creation requires `sku`, `brand_id`, `category_id`, `model`, and `size`. Optional fields are `pattern`, `tyre_type`, `notes`, `default_selling_price` (integer paise), and `minimum_stock` (whole units); numeric defaults are zero. Updates are partial and preserve omitted fields. Unknown fields, caller-controlled stock/status/timestamps, unsafe integers, negative values, and duplicate SKUs/names (including inactive records) are rejected. Names and required text are trimmed and limited to 200 characters; notes allow 5000. Nullable descriptive fields can be cleared with `null` or blank text.

New links must reference active brands/categories. Existing links survive deactivation and can remain on product edits; legacy null links are preserved on unrelated edits, but new products require both links. Deactivation is idempotent and never deletes records, cascades status changes, or changes inventory. No reactivation API is provided in this phase. Product reads include `brand_name`, `category_name`, and `stock_quantity`; `getById` also reads inactive products. Creating a product and its trigger-created zero inventory row is atomic.

Run `npm run test:products` to test migrations, services/repositories, validation, search, deactivation, rollback, and all 13 APIs through the real sandboxed preload/IPC bridge. Tests use a unique temporary database and remove it afterward. They never insert catalog fixtures in shop data. Both application smoke checks also exercise read-only catalog calls. The catalog migration test upgrades legacy data to the current schema. The npm database check uses temporary data; the direct read-only checker requires an already-upgraded application database.

## Products / Tyres interface

The Products route loads its own UI bundle and uses the existing sidebar/header. `src/hooks/useProductCatalog.js` loads lookup options and debounces backend searches; product results use 25-row pages with previous/next navigation. Filters include brand, category, and active/inactive/all status. Stale requests are ignored when filters change. Lookup lists include inactive entries for filtering; product forms permit active selections and retain a product's existing inactive selection.

`src/components/products/ProductTable.jsx` displays catalog details, selling price, stock, minimum stock, status, and edit/deactivate actions. It scrolls horizontally while keeping actions visible. `ProductDialog.jsx` supplies the shared add/edit form with required-field and numeric feedback, backend validation messages, and disabled controls while saving. Main-process validation remains authoritative. New products require active brands and categories, which can be created using the Products page's management controls. There is no editable stock quantity or permanent delete action.

`src/utils/catalog.js` unwraps API results and converts rupee input to integer paise without accepting more than two decimal places. Displayed prices use `Rs. 24,500` (or `Rs. 24,500.50` when paise are present). Deactivation requires confirmation and preserves stock/history. No schema, IPC, preload, or backend changes are needed by this UI.

### Brand and Category management

Use **Manage Brands** or **Manage Categories** beside Add Product. Both open `src/components/products/LookupManagerDialog.jsx`, a shared dialog for adding/editing names, viewing active/inactive/all records with 25-row pagination, and confirming deactivation. Inactive records can still be renamed, but there is no delete or reactivation control. Required-name feedback, backend duplicate-name errors, loading, empty, success, error/retry, and pending-save states are included.

Successful changes refresh the Products page's lookup options and product list through the existing APIs. Product forms opened afterward show the updated names without restarting. Deactivated entries are unavailable for new selections; existing products retain their links and display their current inactive names when edited. Close the Product form to access the management controls.

After building, run `npm run test:lookups:ui`. It uses the shared isolated Electron UI runner and creates all fixtures in a temporary userData directory, removed after exit. It verifies both dialogs through the actual renderer/preload/IPC path, including empty lists, add/edit, duplicate names, status filters, cancelled/confirmed deactivation, inactive editing, refreshed Product form options, preserved product links, list errors/retry, and narrow layout. The screenshot is saved to ignored `artifacts/lookups-ui.png`. No shop records are inserted by the test.
