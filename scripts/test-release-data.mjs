import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import electron from 'electron';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mahsood-release-data-'));
const env = { ...process.env, MAHSOOD_UI_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
const entry = process.argv.includes('--dates') ? 'scripts/test-date-boundaries.cjs' : 'scripts/test-release-data.cjs';
const child = spawn(electron, [entry], { env, stdio: 'inherit', windowsHide: true });
const code = await new Promise(resolve => {
  child.once('error', error => { console.error(error); resolve(1); });
  child.once('close', code => resolve(code ?? 1));
});
try {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch (error) {
  console.error('Unable to clean isolated release audit profile:', error);
  process.exitCode = 1;
}
process.exitCode ||= code;
