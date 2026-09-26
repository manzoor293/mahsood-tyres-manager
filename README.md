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
- `src/pages/PlaceholderPage.jsx`: shared placeholder for the remaining eight modules, without sample data or business actions.
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

They also verify database initialization in the main process, all 16 tables, WAL, foreign keys, integrity, persistence, constraints, stock auditing, historical costs, separate payments, migration rollback, and rejection of newer schema versions. Both npm smoke commands use temporary profiles/databases that are removed afterward; shop data is not migrated by automated verification.

## Database foundation

- `electron/database/index.cjs`: opens the database after Electron is ready, enables foreign keys and WAL, migrates before opening the window, and closes on normal exit. Importing a connection from a renderer or ordinary Node process is rejected.
- `electron/database/migrate.cjs`: ordered migrations tracked by `PRAGMA user_version`; pending migrations and version changes run in one immediate transaction. Failed migrations roll back; newer database versions are rejected. Add a new numbered migration to the ordered list for future changes; do not edit an applied migration or recreate existing tables at startup.
- `electron/database/migrations/001-initial.sql`: schema version 1, indexes, and inventory integrity triggers.
- `electron/database/migrations/002-catalog-status.sql`: schema version 2 adds active status and update timestamps to brands/categories, preserving existing rows. Existing update timestamps are backfilled from creation timestamps; catalog services set them on all subsequent writes.
- `electron/database/migrations/003-expense-category-status.sql`: current schema **3** adds active status and update timestamps to expense categories so they can be deactivated without deleting financial references. Existing categories become active, timestamps are backfilled, and expenses remain unchanged. No sample/default categories are inserted.
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

Sales uses the original schema-2 financial tables; current application schema is **3** for expense-category status. Sale returns, deletion, post-completion item edits, subsequent payments, statements, PDF/printing, expenses, dashboard statistics, reports and advanced accounting remain deferred. Run `npm run test:sales` and, after building, `npm run test:sales:ui`; both use temporary databases/profiles. Tests cover historical values, full/partial/walk-in/customer sales, concurrent stock changes via a separate connection, stock/payment rollback, invoice allocation, all three preload/IPC methods and the real POS workflow. Screenshots are saved under ignored `artifacts/`.

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

Inventory uses the original schema-2 stock tables; current application schema is **3** for expense-category status. The schema requires `unit_cost` on every movement, so manual adjustments record the latest inserted purchase item's historical cost, or zero when no purchase cost is known. This is a reference cost, not a new inventory valuation/accounting model; users cannot submit costs through the adjustment API. Sales, returns, opening-stock entry, supplier payments, reports and other accounting workflows remain outside this module.

`npm run test:inventory` covers stock and history filters, boundary statuses, purchase references, both adjustment directions, validation, stale stock, insufficient stock, persistence, IPC guards and rollback during movement/inventory processing. `npm run test:inventory:ui` (after building) drives the actual renderer/preload/IPC workflow for search, filters, history, confirmation/cancel, both adjustments, validation, insufficient/stale stock, retry and narrow layouts. Both tests use the isolated runner's temporary database/profile and clean up after Electron exits. The UI screenshot is written to ignored `artifacts/inventory-ui.png`. Production and development smoke checks include Inventory navigation and read-only inventory APIs.

## Purchases

The Purchases route supports stock receipt entry, searchable product selection, multiple unique products, supplier/date/payment filters, paginated invoices and read-only details. Enter money in rupees; the bridge sends safe integer paise. Unit costs must be positive, quantities positive whole numbers, and discounts/payments nonnegative. Payments cannot exceed the discounted total.

`window.api.purchases` exposes only `list(filters?)`, `getById(id)` and `create(data)`, using the same result/error envelope as catalog APIs. Create accepts `supplier_id`, unique `invoice_number`, `purchased_at` (`YYYY-MM-DD`), optional `notes`, `items: [{product_id, quantity, unit_cost}]`, optional `discount`, `paid_amount` and `payment_method` (defaults to Cash). Calculated fields and unknown fields are rejected; the main process computes line totals, subtotal, total and balance. List filters are `search`, `supplier_id`, `from_date`, `to_date`, `payment_status` (`all`, `unpaid`, `partial`, `paid`), `limit` (1–500) and `offset`. Search matches invoice or current supplier name. Results include payment sums and item counts; details include historical item costs and payments.

The service validates and writes inside one immediate SQLite transaction. Each purchase item creates one linked PURCHASE stock movement; the existing trigger increases inventory. No direct inventory updates occur. A positive initial payment creates a linked supplier_payments record in the same transaction. Any failure rolls back the header, items, movements, stock projection and payment. Supplier/product activity is checked inside the transaction; historical purchases remain readable after deactivation.

Purchases uses the original schema-2 financial tables; current application schema is **3** for expense-category status. Other costs are unavailable because the existing schema requires `total = subtotal - discount`. Completed purchases are read-only until a transactional correction/reversal design exists. Editing, deletion, returns, subsequent payment entry and supplier credits/prepayments are deferred. Supplier/product descriptions reflect current directory values; item quantity and unit cost remain historical.

Run `npm run test:purchases` and, after `npm run build`, `npm run test:purchases:ui`. Both use temporary databases and userData directories removed by the parent runner after Electron exits. Backend tests include failures on the second stock movement and on payment insertion, verifying all five affected tables are unchanged. UI tests drive actual React controls through preload/IPC, including validation, duplicate prevention, repeated-submit protection, filters, details and retry states. Electron smoke checks also exercise the purchases list API.

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
