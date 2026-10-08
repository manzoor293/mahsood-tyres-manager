# Mahsood Tyre Manager v0.2.0 release audit

Audit date: 9 October 2026, Asia/Karachi. Branch: `develop-v0.2.0`. Baseline commit: `cf158a0`. Package and lockfile version remain `0.1.0`.

## A. Release status: NOT READY

The code regression, accounting fixtures, migration checks, production build, and both Electron smoke modes pass. Do not begin the release process yet: this machine has databases in **both** default profile folders, `%APPDATA%/Mahsood Tyre Manager` and `%APPDATA%/Mahsood Tyres`. Only their existence was inspected; neither real database was opened, migrated, seeded, moved, merged, or deleted during this audit.

The pre-release internal app-name change could cause an upgrade to open a different, empty profile. That defect is fixed. When both databases exist, normal startup now displays a conflict message and exits **before** database recovery, migration, or initialization. Back up and review both profiles before explicitly selecting authoritative shop data. Automated tests use explicit isolated profiles and therefore still run normally. A branded-only pre-release profile is preserved when there is no legacy database; a legacy-only profile uses the original v0.1.0 location.

The release candidate also remains uncommitted. Review and commit the intended changes before identifying a reproducible release revision. No merge, tag, push, version bump, installer build, or publication was performed.

## B. Issues found and disposition

| Severity | Module | Reproduction/root cause | Smallest fix | Regression evidence |
| --- | --- | --- | --- | --- |
| Critical | Electron profile identity | A child Electron process with the old internal name resolves `Mahsood Tyre Manager`; the pre-release name resolves `Mahsood Tyres`. An upgrade can miss existing shop data. | Restore the stable internal name; respect explicit profile overrides; preserve branded-only data; fail closed when both databases exist. Visible window/print branding stays Mahsood Tyres. | `test:release-data`: actual Electron path probes, five profile-selection scenarios, copied tagged v0.1.0 profile through real main/preload/login/IPC. |
| High | Sales, purchase, expense and stock-movement history | Filtering UTC timestamp text by its first ten characters disagrees with local-date reports. For 1 January, the fixture returned rows 3/4 instead of 2/3; midnight on the preceding UTC day was excluded. | Reuse the existing `localDate` SQL helper in the four history filters. Date-only records remain literal business dates. No timestamps, period boundaries, or accounting amounts are rewritten. | `test:dates`: before-fix failure in all four histories; after-fix inclusive midnight/year/month tests and report/history agreement in Asia/Karachi. |
| Medium | Money display | `formatPrice(Number.MAX_SAFE_INTEGER)` displayed `Rs. 90,071,992,547,409.90` instead of `.91` after floating-point division. | Format valid integer paise using BigInt quotient/remainder. Preserve the previous behavior for in-progress invalid form previews, which services reject. | `test:money`: signed values, one paise, large values, maximum supported amounts, 201 input roundtrips near the limit, malformed/overflow rejection. |
| Medium | Regression expectations | Ledger UI and settings print assertions still required configured shop headings after the approved fixed print branding; the status fixture expected schema 5. Inventory's test day was derived from UTC text. | Update printed-heading expectations while retaining settings persistence assertions; expect schema 7; derive the inventory test day locally. | Ledger UI, status, settings backend/UI and inventory backend all pass. Initial failures were reported and investigated. |
| High, build tooling | `source-map-js` | Installed build-only version 1.2.1 falls in the advisory's affected range. | Compatible transitive patch to 1.2.2; no direct package version changes or native rebuild. | Full regression, production build, both smoke modes; final npm audit no longer reports this package. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). |
| Low | Packaging icon | Packaged main-process code looks for `resources/icon.ico`, but the builder configuration did not copy it there. | Add the existing ICO as an `extraResources` mapping. | Static asset/config checks pass. Actual installer verification remains pending by instruction. |
| Low | Documentation/hygiene | README described schema 5; branding documentation said packaging was not configured; SQLite/OS-junk ignore coverage was absent. | Document current schema/profile safety and audit commands; update branding notes; extend `.gitignore`. | Source/config review; no files deleted. |

The profile code defect is resolved, but the **existing dual-profile data decision remains an operational release gate**. The guard deliberately does not guess which database is authoritative.

## C. Optimization and static quality

No query, index, schema, accounting, renderer-state, or architectural optimization was needed. There was no measured performance problem at the audited volume. Removed one confirmed unused `inspectFile` import from the backup service; no dependency or module was removed.

Source review covered main/preload/IPC, validation, units/freight, sales/purchase/payment/return services, accounting/report/dashboard/ledger queries, backup recovery, print templates, and renderer form paths. The renderer import scan found no unused ES imports. All Electron/script JavaScript files passed syntax checks. No application TODO/FIXME, hard-coded local filesystem path, or debug fixture injection was found in the scanned application sources. The startup database-location log is retained as intentional diagnostic output. This is a focused source review plus automated regression, not a formal proof of every possible execution path.

Three timed reads per operation used an isolated database with 1,000 products, 1,000 purchases, 2,000 sales, 4,000 stock movements and 3,000 payments. Fixture creation used authoritative services, including pair quantities, freight and initial payments. Latest measured ranges:

| Read | Milliseconds |
| --- | --- |
| Dashboard | 24.29–27.81 |
| Sales report | 31.30–49.89 |
| Purchase report | 10.76–12.63 |
| Profit report | 22.35–25.64 |
| Inventory | 0.25–0.66 |
| Sales history | 1.06–1.28 |
| Purchase history | 0.89–1.06 |
| Stock movements | 14.46–17.34 |
| Customer ledger | 21.15–29.63 |
| Supplier ledger | 9.81–13.07 |

These are local synchronous service timings, not packaged application end-to-end latency guarantees. Larger datasets and other machines can differ. No speculative optimization or migration was introduced.

## D. Database and integrity

Current schema is **7**, with 21 application tables. Migrations 001–007 are unchanged, including pair transactions and purchase shipment cost. No database/schema/accounting migration was added.

- Fresh creation, populated schemas 1–7 upgrading/reopening, and current-schema reopening pass.
- Foreign keys are enabled; WAL and `synchronous = FULL` remain configured.
- Integrity checks return `ok`; foreign-key checks return no violations.
- Existing table fields, credentials and historical data are compared before/after migration. Historical transaction factors remain 1; historical shipment fields remain zero.
- Reapplying migrations leaves data unchanged. Failed migration DDL rolls back; newer schemas are rejected.
- Existing suites verify constraints, stock-ledger triggers, duplicate restrictions, negative stock rejection, payment/return validation, and transaction rollback.
- Backup tests verify standalone snapshots, safety backups, current/legacy restore, corrupted/unrecognized/newer backup rejection, path protection, busy gates, simulated replacement/migration failures, interrupted restore recovery and credentials.

All automated writes were confined to generated temporary profiles/databases. The npm database check uses an isolated profile. The separately documented direct database checker is read-only and was not run against shop data during this audit.

## E. Accounting invariants

Passing pair, shipment, sales, purchase, payment, return, dashboard, report and ledger fixtures confirm:

- New pair transactions use physical factor 2; historical tyre transactions retain factor 1. Odd tyre remainders and odd legacy minimum thresholds survive.
- Shipment allocations preserve exact integer paise, including proportional/remainder cases; historical landed COGS includes allocated freight exactly once.
- Supplier invoice totals, payments, payable, ledger debt and purchase-return credit exclude shipment. Shipment is not automatically duplicated as an operating expense.
- Gross profit uses effective revenue less saved historical landed COGS; later product/purchase activity does not rewrite saved sale cost.
- Customer payments change received amounts and receivables without changing revenue or profit; supplier payments settle supplier invoices.
- Returns respect original quantity limits, reverse stock/value and historical costs, and produce the intended customer/supplier credit balances.
- Period metrics and current all-date balances/stock retain their intended distinction; all 11 dashboard metrics still render the backend values.
- Report summaries cover all matching rows, not only visible pages. Ledger opening/running/closing balances and pagination retain their meanings.

Hand-computed volume checks include revenue 30,000,000 paise, received 10,000,000, historical landed COGS 20,022,000, gross profit 9,978,000, supplier payable 99,509,000, customer receivables 20,000,000 and physical stock 17,000 tyres. These assertions are isolated fixtures, not real shop balances.

## F. Automated test results

Final package regression: **49 test scripts PASS**, plus **production build PASS**. The extra table/renderer-console runner passes **15 UI workflows**. Every package test command is listed below; no nonexistent combined payment/return or lookup-backend command was assumed.

| Command | Result | Seconds |
| --- | --- | --- |
| `npm run test:money` | PASS | 0.7 |
| `npm run test:dates` | PASS | 1.15 |
| `npm run test:release-data` | PASS | 12.82 |
| `npm run test:shipment` | PASS | 4.36 |
| `npm run test:shipment:ui` | PASS | 6.32 |
| `npm run test:pairs` | PASS | 2.16 |
| `npm run test:pairs:ui` | PASS | 3.18 |
| `npm run test:ledger` | PASS | 4.43 |
| `npm run test:ledger:ui` | PASS | 6.26 |
| `npm run test:auth` | PASS | 7.05 |
| `npm run test:auth:ui` | PASS | 8.23 |
| `npm run test:status` | PASS | 1.26 |
| `npm run test:status:ui` | PASS | 10.98 |
| `npm run test:settings` | PASS | 1.32 |
| `npm run test:settings:ui` | PASS | 4.49 |
| `npm run test:backup` | PASS | 5.62 |
| `npm run test:backup:ui` | PASS | 5.92 |
| `npm run test:db` | PASS | 0.97 |
| `npm run test:products` | PASS | 1.96 |
| `npm run test:products:ui` | PASS | 9.58 |
| `npm run test:lookups:ui` | PASS | 8.94 |
| `npm run test:suppliers` | PASS | 1.33 |
| `npm run test:suppliers:ui` | PASS | 7.74 |
| `npm run test:purchases` | PASS | 1 |
| `npm run test:purchases:ui` | PASS | 7.51 |
| `npm run test:inventory` | PASS | 0.98 |
| `npm run test:inventory:ui` | PASS | 10.45 |
| `npm run test:customers` | PASS | 1.53 |
| `npm run test:customers:ui` | PASS | 7.51 |
| `npm run test:sales` | PASS | 1.02 |
| `npm run test:sales:ui` | PASS | 9.24 |
| `npm run test:expenses` | PASS | 2.13 |
| `npm run test:expenses:ui` | PASS | 8.83 |
| `npm run test:dashboard` | PASS | 1.24 |
| `npm run test:dashboard:ui` | PASS | 8.39 |
| `npm run test:reports` | PASS | 1.46 |
| `npm run test:reports:ui` | PASS | 14.84 |
| `npm run test:customer-payments` | PASS | 1.54 |
| `npm run test:supplier-payments` | PASS | 1.5 |
| `npm run test:customer-payments:ui` | PASS | 11.88 |
| `npm run test:supplier-payments:ui` | PASS | 12.29 |
| `npm run test:sale-returns` | PASS | 2.38 |
| `npm run test:sale-returns:ui` | PASS | 6.48 |
| `npm run test:purchase-returns` | PASS | 2.18 |
| `npm run test:purchase-returns:ui` | PASS | 7.36 |
| `npm run test:printing` | PASS | 13.7 |
| `npm run test:printing:ui` | PASS | 10.56 |
| `npm run build` | PASS | 4.52 |
| `npm run test:electron` | PASS | 6.34 |
| `npm run test:electron:dev` | PASS | 13.42 |

Additional checks:

| Command/check | Result |
| --- | --- |
| `node scripts/test-release-regressions.mjs` | PASS: full discovered package regression; logs/JSON retained |
| `node scripts/test-release-regressions.mjs test:release-data` | PASS: extended real-application tagged-profile upgrade after full build |
| `node scripts/test-table-styles.mjs` | PASS: products, suppliers, purchases, inventory, customers, sales, expenses, both payment types, both return types, reports, ledger, lookups, dashboard |
| Renderer console in those workflows | PASS: no runtime errors or React key/controlled-input warnings observed |
| JavaScript syntax/import scan | PASS: zero syntax failures; zero unused renderer ES imports |
| Packaging/lockfile consistency checks | PASS |
| `git diff --check` | PASS; Git's LF/CRLF conversion notices are informational |
| `npm ls --depth=0` | PASS: expected installed direct dependencies |
| `npm audit --omit=dev --json` | PASS: 0 production advisories |
| `npm audit --json` | WARN / exit 1: 9 affected development packages remain (1 high, 8 moderate) |

Initial sandbox failures launching Electron and accessing the advisory registry were rerun with the necessary approved access. Expected failure-injection messages in printing/backup tests are exercised error paths, not passing tests hiding unexpected errors. A supplementary upgrade launch overlapped Vite's rebuild and encountered a transient missing `dist/index.html`; it was rerun sequentially after the build and passed.

## G. Build, packaging and Electron security

Production Vite build, production Electron smoke, and development Electron smoke pass. Required renderer assets/imports load. Context isolation, disabled Node integration, renderer sandboxing, sender/frame/URL validation, protected pre-login IPC, explicit preload functions, denied new windows/navigation/webviews/permissions, escaped print HTML and guarded file dialogs remain intact.

The installed better-sqlite3 native module loads in Electron throughout the data/UI tests. It remains a production dependency; native files remain unpacked from ASAR, with rebuilding configured. SQL migrations, print CSS and logo are covered by `electron/**/*`; the icon now has an explicit resources mapping. `appId`, installer/product identity and `deleteAppDataOnUninstall: false` are unchanged. Package/lockfile versions and dependency declarations agree.

No installer or unpacked release candidate was built. Final packaged native loading, signing, installation/uninstallation and upgrade installation are still unverified and belong to the separately approved release process. Existing v0.1.0 release artifacts were retained.

## H. v0.1.0 upgrade result

**PASS for the isolated copied tagged-profile fixture.** Its schema was created using the actual migrations from tag `v0.1.0` (schema 5), populated with credentials, products/brands/categories, suppliers/customers, purchases/sales, stock, payments, expenses, returns and settings, and backed up into independent copies.

One copy is opened through the full current application: automatic migration reaches 7, the existing administrator must sign in, unauthorized IPC is blocked, restored credentials work, legacy quantities remain tyres, freight remains zero, and exact stock/return/credit values and invoice preview are checked. Existing fields in every table are then compared against the pre-upgrade snapshot. Another copy verifies direct migration/reopen/idempotence. The original fixture stays unchanged.

This is not a test of the sole real shop database or an installed upgrade. Real default-profile ambiguity is not resolved by a synthetic fixture and remains the gate in section A.

## I. Fresh profile result

**PASS for source/build profiles.** Fresh admin setup/login, catalog creation, supplier/customer purchase/sale, initial/later payments, expenses, both returns, shipment, dashboard/report data, print previews and backup/restore are exercised by the new data audit and existing isolated UI workflows. Current-schema backup restores all data and credentials, and a fresh in-memory auth service logs in with the restored account. Existing authentication tests also cover full-process restart, logout and legacy backups requiring setup.

Physical printer output and a fresh installed v0.2.0 profile are not claimed as tested. Real PDFs are generated and native printer calls are intercepted in the automated printing/ledger suites.

## J. Remaining gates, warnings and workspace hygiene

**Release gates:** resolve the two real profile databases through backup review and an explicit authoritative-data decision; review/commit the candidate changes. No code-level accounting, migration, backup or authentication failure remains in the final automated regression.

**Non-blocking warnings and limitations:**

- The main renderer bundle is about 504 kB minified / 160 kB gzip. The existing Vite warning remains; no risky splitting was introduced solely to suppress it.
- Final dependency audit reports 9 development packages through two remaining underlying advisories: [http-cache-semantics shared-cache disclosure](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) and [sprintf-js unbounded precision](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Installed chains are build/download/proxy logging tooling, not production dependencies. No relevant shared-cache service or user-controlled sprintf format is exposed by the offline application in the reviewed paths; this is an exposure assessment, not a blanket security guarantee. The advisory remediation suggested for the sprintf chain would change/downgrade electron-builder outside the current range, so it was not forced during hardening. Review/track the toolchain findings before packaging on a trusted build machine.
- The fixed source-map-js advisory is removed after the compatible 1.2.2 patch. No Electron, SQLite, React, Vite or builder major version changed.
- Automated Electron window resizing and screenshots cover the dashboard at 1920/1366/1024/768px plus narrower layouts and large amounts. Hand-drag resizing and a physical printer were not tested.
- Workspace scan excluding dependency/Git trees and unpacked vendor resources found no stray non-ASCII paths, empty junk directories, project SQLite files, `.DS_Store` or `Thumbs.db`. It found `package.json.backup`, numerous ignored logs/screenshots and old generated/release output. The scan counted 247 logs and 433 artifact files at that point; the audit creates additional ignored evidence afterward. These counts are not a cleanup request.
- `dist/`, `artifacts/`, `release/`, logs and package backup are ignored. SQLite files/sidecars and OS-junk ignore rules were added. No suspicious file, database, backup, source, documentation or installer was deleted.

## K. Release recommendation

| Action | Recommendation |
| --- | --- |
| Version bump to 0.2.0 | HOLD until the profile-data decision and candidate review are complete; requires release approval |
| Final installer build | HOLD; no installer built in this audit |
| Upgrade installer test | Required after an approved candidate build, using copied/isolated profiles |
| Merge/tag/GitHub release | HOLD until candidate installer/fresh/upgrade checks pass and release approval is given |

Once those gates are cleared, the automated evidence supports proceeding to the separately approved version bump and candidate packaging/testing stage. It does not authorize publishing an untested installer.

## Files and evidence

Audit changes: `.gitignore`, `README.md`, `build/README.md`, `package.json`, `package-lock.json`, `electron/main.cjs`, new `electron/utils/profile.cjs`, the four history repositories (`sales`, `purchases`, `expenses`, `inventory`), the unused import in `electron/services/backup.cjs`, renderer `src/utils/catalog.js`, corrected status/ledger/settings/inventory tests, and console checks in `scripts/test-table-styles.cjs`.

New audit support: `scripts/test-release-regressions.mjs`, `test-release-data.mjs`, `test-release-data.cjs`, `test-upgrade-profile.cjs`, `probe-profile-name.cjs`, `test-profile.cjs`, `test-date-boundaries.cjs` and `test-money.mjs`, plus this report. Three new package commands are `test:money`, `test:dates` and `test:release-data`.

There were 13 uncommitted files before the audit: the earlier print templates/note and tests, dashboard components/page/CSS/card and test, and `src/components/Header.jsx`. Those changes were retained. This audit did not redesign the dashboard/header, modify dashboard SQL, change shipment/pair semantics, or discard working-tree changes.

Evidence in ignored `artifacts/release-audit/`: `regressions.json`, one log per command, `data-integrity.json`, `packaging.json`, `table-styles.log`, `dependencies.json` (initial audit), `dependencies-final.json`, and `dependencies-runtime.json`. UI screenshots remain in ignored `artifacts/`. These artifacts are local audit evidence; the Markdown report can be committed with the reviewed candidate.

Electron's profile behavior is documented in the [official app API](https://www.electronjs.org/docs/latest/api/app). The runtime path regression verifies that behavior with the project's actual Electron installation.
