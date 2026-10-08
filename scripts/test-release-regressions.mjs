import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Each existing test runner creates its own temporary Electron profile/database.
// Run sequentially so UI windows, screenshots and native print checks do not race.
const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
const suites = [...Object.keys(scripts).filter(name => name.startsWith('test:') && !name.startsWith('test:electron')), 'build', 'test:electron', 'test:electron:dev'];
const requested = process.argv.slice(2);
if (requested.some(name => !suites.includes(name))) throw Error('Unknown release regression suite');
const selected = requested.length ? suites.filter(name => requested.includes(name)) : suites;
fs.mkdirSync('artifacts/release-audit', { recursive: true });
const resultsFile = 'artifacts/release-audit/regressions.json';
const results = requested.length && fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : [];
for (const name of selected) {
  const started = Date.now();
  console.log(`Running npm run ${name}`);
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `npm.cmd run ${name}`], { windowsHide: true })
    : spawn('npm', ['run', name]);
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const code = await new Promise(resolve => {
    child.once('error', error => { output += error.stack; resolve(1); });
    child.once('close', code => resolve(code ?? 1));
  });
  fs.writeFileSync(`artifacts/release-audit/${name.replaceAll(':', '-')}.log`, output);
  const result = { command: `npm run ${name}`, status: code === 0 ? 'PASS' : 'FAIL', exitCode: code, seconds: Number(((Date.now() - started) / 1000).toFixed(2)) };
  const previous = results.findIndex(row => row.command === result.command);
  if (previous >= 0) results[previous] = result; else results.push(result);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`${result.status}: ${result.command} (${result.seconds}s)`);
  if (code) console.log(output.slice(-5000));
}
process.exitCode = results.some(row => selected.some(name => row.command === `npm run ${name}`) && row.exitCode !== 0) ? 1 : 0;
