import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import electron from 'electron';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mahsood-products-ui-'));
const env = { ...process.env, MAHSOOD_UI_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
const entry = process.argv.includes('--suppliers') ? 'scripts/test-suppliers-ui.cjs' : process.argv.includes('--lookups') ? 'scripts/test-lookups-ui.cjs' : 'scripts/test-products-ui.cjs';
const child = spawn(electron, [entry, ...(process.argv.includes('--dev') ? ['--dev'] : [])], { stdio: 'inherit', env });
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
