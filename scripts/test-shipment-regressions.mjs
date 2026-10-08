import { spawn } from 'node:child_process';
import fs from 'node:fs';
const suites = [
  'test:shipment','test:shipment:ui','test:db','test:pairs','test:pairs:ui',
  'test:products','test:expenses','test:settings',
  'test:purchases','test:purchases:ui','test:inventory','test:inventory:ui',
  'test:sales','test:sales:ui','test:purchase-returns','test:purchase-returns:ui',
  'test:supplier-payments','test:supplier-payments:ui','test:dashboard','test:dashboard:ui',
  'test:reports','test:reports:ui','test:ledger','test:ledger:ui','test:printing','test:printing:ui',
  'test:backup','test:backup:ui','test:auth','test:auth:ui','build','test:electron','test:electron:dev'
];
const requested = process.argv.slice(2);
if (requested.some(name => !suites.includes(name))) throw Error('Unknown regression suite');
const selected = requested.length ? suites.filter(name => requested.includes(name)) : suites;
fs.mkdirSync('artifacts', { recursive:true });
const resultsFile = 'artifacts/shipment-regressions.json';
const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile,'utf8')) : [];
for (const name of selected) {
  console.log(`Running npm run ${name}`);
  const started = Date.now();
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d','/s','/c',`npm.cmd run ${name}`], { windowsHide:true })
    : spawn('npm', ['run',name]);
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const code = await new Promise(resolve => { child.on('error', error => { output += error.stack; resolve(1); }); child.on('close', code => resolve(code ?? 1)); });
  fs.writeFileSync(`artifacts/shipment-${name.replaceAll(':','-')}.log`, output);
  const result = { command:`npm run ${name}`,status:code === 0 ? 'PASS':'FAIL',exitCode:code,seconds:Math.round((Date.now()-started)/1000) };
  const previous = results.findIndex(row => row.command === result.command);
  if (previous >= 0) results[previous] = result; else results.push(result);
  fs.writeFileSync(resultsFile, JSON.stringify(results,null,2));
  console.log(`${code === 0 ? 'PASS':'FAIL'}: npm run ${name}`);
  if (code) console.log(output.slice(-5000));
}
process.exitCode = results.some(result => selected.some(name => result.command === `npm run ${name}`) && result.exitCode) ? 1 : 0;
