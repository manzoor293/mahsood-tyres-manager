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

Run `npm run test:db` for a non-destructive, windowless Electron check of the existing database. It opens the database read-only, skips migrations, and reports a PASS/FAIL checklist for schema version, tables, foreign keys, WAL, unique constraints, historical cost columns, and the resolved userData path. It inserts no test data and exits nonzero on failure. Run the application once first if the database has not been initialized. Foreign-key enforcement is checked on the connection; WAL is inspected without changing it.

```sh
npm run test:electron:dev
npm run build
npm run test:electron
```

These checks launch real Electron windows, visit all nine routes, check active navigation, reload a hash route, verify unknown-route fallback, styling, narrow-window layout, the preload bridge, absence of renderer Node globals, and security preferences. They save screenshots under ignored `artifacts/` and exit. They require a desktop session.

They also verify database initialization in the main process, all 16 tables, WAL, foreign keys, integrity, persistence, constraints, stock auditing, historical costs, separate payments, migration rollback, and rejection of newer schema versions. Data-writing checks use a temporary database that is removed afterward; the application database receives only normal initialization/migration.

## Database foundation

- `electron/database/index.cjs`: opens the database after Electron is ready, enables foreign keys and WAL, migrates before opening the window, and closes on normal exit. Importing a connection from a renderer or ordinary Node process is rejected.
- `electron/database/migrate.cjs`: ordered migrations tracked by `PRAGMA user_version`; pending migrations and version changes run in one immediate transaction. Failed migrations roll back; newer database versions are rejected. Add a new numbered migration to the ordered list for future changes; do not edit an applied migration or recreate existing tables at startup.
- `electron/database/migrations/001-initial.sql`: schema version 1, indexes, and inventory integrity triggers.
- `electron/database/migrations/002-catalog-status.sql`: schema version 2 adds active status and update timestamps to brands/categories, preserving existing rows. Existing update timestamps are backfilled from creation timestamps; catalog services set them on all subsequent writes.
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

Schema stays at **version 2**. The schema requires `unit_cost` on every movement, so manual adjustments record the latest inserted purchase item's historical cost, or zero when no purchase cost is known. This is a reference cost, not a new inventory valuation/accounting model; users cannot submit costs through the adjustment API. Sales, returns, opening-stock entry, supplier payments, reports and other accounting workflows remain outside this module.

`npm run test:inventory` covers stock and history filters, boundary statuses, purchase references, both adjustment directions, validation, stale stock, insufficient stock, persistence, IPC guards and rollback during movement/inventory processing. `npm run test:inventory:ui` (after building) drives the actual renderer/preload/IPC workflow for search, filters, history, confirmation/cancel, both adjustments, validation, insufficient/stale stock, retry and narrow layouts. Both tests use the isolated runner's temporary database/profile and clean up after Electron exits. The UI screenshot is written to ignored `artifacts/inventory-ui.png`. Production and development smoke checks include Inventory navigation and read-only inventory APIs.

## Purchases

The Purchases route supports stock receipt entry, searchable product selection, multiple unique products, supplier/date/payment filters, paginated invoices and read-only details. Enter money in rupees; the bridge sends safe integer paise. Unit costs must be positive, quantities positive whole numbers, and discounts/payments nonnegative. Payments cannot exceed the discounted total.

`window.api.purchases` exposes only `list(filters?)`, `getById(id)` and `create(data)`, using the same result/error envelope as catalog APIs. Create accepts `supplier_id`, unique `invoice_number`, `purchased_at` (`YYYY-MM-DD`), optional `notes`, `items: [{product_id, quantity, unit_cost}]`, optional `discount`, `paid_amount` and `payment_method` (defaults to Cash). Calculated fields and unknown fields are rejected; the main process computes line totals, subtotal, total and balance. List filters are `search`, `supplier_id`, `from_date`, `to_date`, `payment_status` (`all`, `unpaid`, `partial`, `paid`), `limit` (1–500) and `offset`. Search matches invoice or current supplier name. Results include payment sums and item counts; details include historical item costs and payments.

The service validates and writes inside one immediate SQLite transaction. Each purchase item creates one linked PURCHASE stock movement; the existing trigger increases inventory. No direct inventory updates occur. A positive initial payment creates a linked supplier_payments record in the same transaction. Any failure rolls back the header, items, movements, stock projection and payment. Supplier/product activity is checked inside the transaction; historical purchases remain readable after deactivation.

Schema remains **2**. Other costs are unavailable because the existing schema requires `total = subtotal - discount`. Completed purchases are read-only until a transactional correction/reversal design exists. Editing, deletion, returns, subsequent payment entry and supplier credits/prepayments are deferred. Supplier/product descriptions reflect current directory values; item quantity and unit cost remain historical.

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

Run `npm run test:products` to test migrations, services/repositories, validation, search, deactivation, rollback, and all 13 APIs through the real sandboxed preload/IPC bridge. Tests use a unique temporary database and remove it afterward. They never insert catalog fixtures in shop data. Both application smoke checks also exercise read-only catalog calls. Run the application to apply migration 002 before running the read-only `test:db` check against an older database.

## Products / Tyres interface

The Products route loads its own UI bundle and uses the existing sidebar/header. `src/hooks/useProductCatalog.js` loads lookup options and debounces backend searches; product results use 25-row pages with previous/next navigation. Filters include brand, category, and active/inactive/all status. Stale requests are ignored when filters change. Lookup lists include inactive entries for filtering; product forms permit active selections and retain a product's existing inactive selection.

`src/components/products/ProductTable.jsx` displays catalog details, selling price, stock, minimum stock, status, and edit/deactivate actions. It scrolls horizontally while keeping actions visible. `ProductDialog.jsx` supplies the shared add/edit form with required-field and numeric feedback, backend validation messages, and disabled controls while saving. Main-process validation remains authoritative. New products require active brands and categories, which can be created using the Products page's management controls. There is no editable stock quantity or permanent delete action.

`src/utils/catalog.js` unwraps API results and converts rupee input to integer paise without accepting more than two decimal places. Displayed prices use `Rs. 24,500` (or `Rs. 24,500.50` when paise are present). Deactivation requires confirmation and preserves stock/history. No schema, IPC, preload, or backend changes are needed by this UI.

### Brand and Category management

Use **Manage Brands** or **Manage Categories** beside Add Product. Both open `src/components/products/LookupManagerDialog.jsx`, a shared dialog for adding/editing names, viewing active/inactive/all records with 25-row pagination, and confirming deactivation. Inactive records can still be renamed, but there is no delete or reactivation control. Required-name feedback, backend duplicate-name errors, loading, empty, success, error/retry, and pending-save states are included.

Successful changes refresh the Products page's lookup options and product list through the existing APIs. Product forms opened afterward show the updated names without restarting. Deactivated entries are unavailable for new selections; existing products retain their links and display their current inactive names when edited. Close the Product form to access the management controls.

After building, run `npm run test:lookups:ui`. It uses the shared isolated Electron UI runner and creates all fixtures in a temporary userData directory, removed after exit. It verifies both dialogs through the actual renderer/preload/IPC path, including empty lists, add/edit, duplicate names, status filters, cancelled/confirmed deactivation, inactive editing, refreshed Product form options, preserved product links, list errors/retry, and narrow layout. The screenshot is saved to ignored `artifacts/lookups-ui.png`. No shop records are inserted by the test.
