import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

let server;
let child;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null) child.kill();
  await server?.close();
  process.exitCode = code;
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

try {
  server = await createServer();
  await server.listen();
  server.printUrls();
  const entry = process.argv.includes('--smoke') ? 'scripts/smoke.cjs' : '.';
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [entry, '--dev'], { stdio: 'inherit', env });
  child.once('error', (error) => {
    console.error(error);
    void stop(1);
  });
  child.once('exit', (code, signal) => void stop(code ?? (signal ? 1 : 0)));
} catch (error) {
  console.error(error);
  await stop(1);
}
