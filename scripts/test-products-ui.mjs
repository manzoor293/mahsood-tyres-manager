import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import electron from 'electron';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mahsood-products-ui-'));
const env = { ...process.env, MAHSOOD_UI_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
const entry = process.argv.includes('--smoke') ? 'scripts/smoke.cjs'
  : process.argv.includes('--customer-payments-backend') || process.argv.includes('--supplier-payments-backend') ? 'scripts/test-payments.cjs'
  : process.argv.includes('--customer-payments') || process.argv.includes('--supplier-payments') ? 'scripts/test-payments-ui.cjs'
  : process.argv.includes('--reports-backend') ? 'scripts/test-reports.cjs'
  : process.argv.includes('--reports') ? 'scripts/test-reports-ui.cjs'
  : process.argv.includes('--dashboard-backend') ? 'scripts/test-dashboard.cjs'
  : process.argv.includes('--dashboard') ? 'scripts/test-dashboard-ui.cjs'
  : process.argv.includes('--catalog-backend') ? 'scripts/test-catalog.cjs'
  : process.argv.includes('--suppliers-backend') ? 'scripts/test-suppliers.cjs'
  : process.argv.includes('--db') ? 'scripts/test-db.cjs'
  : process.argv.includes('--expenses-backend') ? 'scripts/test-expenses.cjs'
  : process.argv.includes('--expenses') ? 'scripts/test-expenses-ui.cjs'
  : process.argv.includes('--sales-backend') ? 'scripts/test-sales.cjs'
  : process.argv.includes('--sales') ? 'scripts/test-sales-ui.cjs'
  : process.argv.includes('--customers-backend') ? 'scripts/test-customers.cjs'
  : process.argv.includes('--customers') ? 'scripts/test-customers-ui.cjs'
  : process.argv.includes('--inventory-backend') ? 'scripts/test-inventory.cjs'
  : process.argv.includes('--inventory') ? 'scripts/test-inventory-ui.cjs'
  : process.argv.includes('--purchases-backend') ? 'scripts/test-purchases.cjs' : process.argv.includes('--purchases') ? 'scripts/test-purchases-ui.cjs' : process.argv.includes('--suppliers') ? 'scripts/test-suppliers-ui.cjs' : process.argv.includes('--lookups') ? 'scripts/test-lookups-ui.cjs' : 'scripts/test-products-ui.cjs';
const child = spawn(electron, [entry, ...(process.argv.includes('--dev') ? ['--dev'] : []), ...(process.argv.some((arg)=>arg.startsWith('--supplier-payments')) ? ['--supplier-payments'] : [])], { stdio: 'inherit', env });
let finished = false;
function finish(code) {
  if (finished) return;
  finished = true;
  process.exitCode = code;
  // The child is closed before deleting the unique temporary directory created above.
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (error) { console.error('Unable to remove temporary UI test directory:', directory, error); process.exitCode = 1; }
}
child.on('error', (error) => { console.error(error); });
child.on('close', (code) => finish(code ?? 1));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
