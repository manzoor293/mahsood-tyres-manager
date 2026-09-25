import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let server;
let child;
let stopping = false;
const smoke = process.argv.includes('--smoke');
let testDirectory;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null) {
    const closed = new Promise((resolve) => child.once('close', resolve));
    child.kill();
    await closed;
  }
  await server?.close();
  if (testDirectory) {
    try { await fs.rm(testDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.error('Unable to clean temporary development verification data:', error); code = 1; }
  }
  process.exitCode = code;
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

try {
  if (smoke) testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mahsood-dev-smoke-'));
  server = await createServer(smoke ? { cacheDir: path.join(testDirectory, 'vite-cache'), server: { port: 0, strictPort: false, hmr: false } } : undefined);
  await server.listen();
  server.printUrls();
  const entry = smoke ? 'scripts/smoke.cjs' : '.';
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (smoke) {
    env.MAHSOOD_UI_TEST_DATA = testDirectory;
    env.MAHSOOD_DEV_PORT = String(server.httpServer.address().port);
  }
  child = spawn(electron, [entry, '--dev'], { stdio: 'inherit', env });
  child.once('error', (error) => {
    console.error(error);
    void stop(1);
  });
  child.once('close', (code, signal) => void stop(code ?? (signal ? 1 : 0)));
} catch (error) {
  console.error(error);
  await stop(1);
}
