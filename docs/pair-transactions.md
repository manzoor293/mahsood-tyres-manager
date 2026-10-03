# Pair transactions implementation

New purchases and sales use whole pairs, with two physical tyres per pair. Inventory, stock movements and stored minimum stock continue to use physical tyres. Monetary values continue to use integer paise.

## Storage and compatibility

Migration 006 adds `products.price_units_per_unit`, `purchase_items.units_per_transaction_unit` and `sale_items.units_per_transaction_unit`. Existing rows default to factor 1; new transaction items use factor 2. Original item quantities, prices, cost snapshots and monetary totals are retained. Return quantities use the original item's transaction unit, while return stock movements multiply by that item's factor. Transaction factors cannot be changed after insertion.

Migrations 001–005 and the package version are unchanged. No installer was built.

Legacy product prices are displayed as equivalent pair prices. Editing unrelated product fields omits the price and minimum-stock fields from the update. Explicit price editing switches the product price basis to pairs. New minimum-stock inputs use pairs and convert to physical tyres. Existing odd thresholds are explicitly displayed and retained until edited.

## Calculations

Purchase and sale quantities remain transaction quantities: line money is quantity multiplied by the matching pair price. Only stock calculations multiply quantity by two. Safe integer validation uses BigInt for multiplication checks and rejects invalid quantities or overflowing money/physical quantities.

New sale cost snapshots retain the exact purchase pair cost, including odd paise. Legacy purchase costs are multiplied by two when supplying a new pair sale. Dashboard product rankings normalize quantities to physical tyres before aggregation. Financial calculations keep their original transaction price basis.

Manual stock corrections remain whole physical tyres with a required reason. Adjustment movement reference costs use an exact per-tyre cost when available; indivisible pair costs use zero as an unknown reference. These movement reference costs do not determine sales profit or inventory valuation.

## User interface and printing

Purchase/POS forms identify quantity and price as pairs. Product and inventory tables show pair prices and pair equivalents alongside physical stock, including odd tyre remainders. Transaction details and return forms show the original item unit. Invoice headers identify the transaction basis and support item-level labels for mixed units. Internal costs remain excluded from customer print documents.

## Files changed

- Database: `electron/database/migrate.cjs`, new `electron/database/migrations/006-pair-transactions.sql`.
- Backend helpers/services: new `electron/services/units.cjs`; catalog, inventory, purchases, sales, returns and print-documents services.
- Repositories: catalog, inventory, purchases, sales, returns, dashboard and printing.
- Printing: `electron/printing/template.cjs`.
- Renderer helper: new `src/utils/units.js`.
- Components: dashboard summary/details; product dialog/table; inventory adjustment/table; purchase dialog/details; sale dialog/details/selector; return dialog/details; report results/configuration.
- Pages: Products and Inventory.
- Existing regression fixtures/tests: catalog, purchases, inventory, sales, returns, dashboard, reports, ledger, printing, authentication, backup, payments, expenses and settings, including affected UI expectations.
- Dedicated acceptance tests: new `scripts/test-pairs.cjs` and `scripts/test-pairs-ui.cjs`; `scripts/test-products-ui.mjs` adds isolated runner flags for both.

## Verification completed

The following existing npm scripts passed with isolated test profiles:

- Backend: `test:db`, `test:products`, `test:purchases`, `test:inventory`, `test:sales`, `test:sale-returns`, `test:purchase-returns`, `test:dashboard`, `test:reports`, `test:ledger`, `test:printing`, `test:backup`, `test:auth`, `test:customer-payments`, `test:supplier-payments`, `test:expenses`, `test:settings`.
- UI: `test:products:ui`, `test:purchases:ui`, `test:inventory:ui`, `test:sales:ui`, `test:sale-returns:ui`, `test:purchase-returns:ui`, `test:dashboard:ui`, `test:reports:ui`, `test:ledger:ui`, `test:printing:ui`, `test:backup:ui`, `test:auth:ui`, `test:lookups:ui`, `test:customer-payments:ui`, `test:supplier-payments:ui`.
- Smoke: `test:electron`, `test:electron:dev`.
- Production: `npm.cmd run build`.

Test logs are under ignored `artifacts/pairs-*.log`. Existing legacy migration tests compare original fields while excluding only newly added metadata. Authentication and backup tests cover credential preservation and migrated backups. Expected negative backup tests deliberately emit disk-full, invalid-database and newer-schema errors.

## Focused acceptance verification

After the user confirmed the previous rejection was accidental, the dedicated tests were added and both passed:

```powershell
node scripts/test-products-ui.mjs --pairs-backend
node scripts/test-products-ui.mjs --pairs-ui
```

The backend suite constructs a populated schema-5 database with original tyre transactions, partial customer/supplier payments, both return types, expense/settings data and an administrator. It compares every original stored field across migration, checks unchanged financial totals and outstanding balances, verifies credential login and reopens a schema-5 backup through migration.

The business scenario verifies Rs.130,000 per pair, a three-pair minimum stored as six tyres, five purchased pairs at Rs.110,000 producing ten tyres, two sold pairs producing six tyres, a single-tyre correction leaving five, rejection of a three-pair sale, and acceptance of two pairs leaving one tyre. It also verifies return eligibility, physical movement conversion and purchase-return stock sufficiency.

Additional checks cover exact odd-paise pair cost snapshots/returns, legacy cost conversion and single-tyre returns, invalid and overflowing inputs, required correction reasons, immutable transaction unit factors, physical-tyre ranking across mixed historical/new transactions, and preservation of unit metadata and credentials when reopening a current backup.

The focused renderer test verifies equivalent legacy pair price display, explicit odd minimum-stock information, preservation of legacy price/minimum during unrelated edits, and explicit edits converting price and minimum to pair semantics. It also checks that Node remains unavailable to the renderer. No application code changes were required while adding these tests.
