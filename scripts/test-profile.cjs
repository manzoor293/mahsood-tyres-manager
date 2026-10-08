const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { configureProfile } = require('../electron/utils/profile.cjs');

function verifyProfiles(root) {
  for (const scenario of ['fresh', 'legacy', 'branded', 'both', 'override']) {
    const directory = path.join(root, `profile-${scenario}`);
    fs.mkdirSync(directory);
    let name = 'mahsood-tyre-manager';
    const overrides = {};
    const app = {
      setName: value => { name = value; },
      getPath: key => key === 'appData' ? directory : overrides[key] || path.join(directory, name),
      setPath: (key, value) => { overrides[key] = value; },
    };
    const paths = Object.fromEntries(['legacy', 'branded'].map(key => [key, path.join(directory, key === 'legacy' ? 'Mahsood Tyre Manager' : 'Mahsood Tyres')]));
    for (const key of ['legacy', 'branded']) {
      if (scenario === key || scenario === 'both' || scenario === 'override') {
        fs.mkdirSync(path.join(paths[key], 'database'), { recursive: true });
        fs.writeFileSync(path.join(paths[key], 'database', 'mahsood-tyre-manager.sqlite3'), key);
      }
    }
    if (scenario === 'override') app.setPath('userData', path.join(directory, 'explicit-profile'));
    const conflict = configureProfile(app);
    assert.equal(name, 'Mahsood Tyre Manager');
    if (scenario === 'both') assert.deepEqual(conflict, paths);
    else assert.equal(conflict, null);
    assert.equal(app.getPath('userData'), scenario === 'branded' ? paths.branded : scenario === 'override' ? path.join(directory, 'explicit-profile') : paths.legacy);
    if (scenario === 'branded') assert.equal(app.getPath('sessionData'), paths.branded);
    for (const [key, profile] of Object.entries(paths)) {
      const file = path.join(profile, 'database', 'mahsood-tyre-manager.sqlite3');
      if (fs.existsSync(file)) assert.equal(fs.readFileSync(file, 'utf8'), key, 'Profile selection cannot modify a database');
    }
  }
  console.log('PASS profile identity: fresh/legacy/branded/dual/explicit profiles, no file copying or replacement');
}
module.exports = { verifyProfiles };
