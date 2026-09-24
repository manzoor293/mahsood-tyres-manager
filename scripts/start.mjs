import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const entry = process.argv.includes('--db') ? 'scripts/test-db.cjs'
  : process.argv.includes('--catalog') ? 'scripts/test-catalog.cjs'
  : process.argv.includes('--smoke') ? 'scripts/smoke.cjs' : '.';
const child = spawn(electron, [entry], { stdio: 'inherit', env });
child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
