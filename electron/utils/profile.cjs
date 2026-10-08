const fs = require('node:fs');
const path = require('node:path');

// The internal name is also the default profile-folder identity. Window and
// printed branding must not change where existing shop data is opened.
function configureProfile(app) {
  app.setName('Mahsood Tyre Manager');
  const legacy = path.join(app.getPath('appData'), 'Mahsood Tyre Manager');
  const branded = path.join(app.getPath('appData'), 'Mahsood Tyres');
  // Respect explicit profile overrides (including every isolated test profile).
  if (path.resolve(app.getPath('userData')).toLowerCase() !== path.resolve(legacy).toLowerCase()) return null;
  const hasDatabase = profile => fs.existsSync(path.join(profile, 'database', 'mahsood-tyre-manager.sqlite3'));
  if (hasDatabase(legacy) && hasDatabase(branded)) return { legacy, branded };
  // Preserve a profile created by the pre-release branding change when there
  // is no older database to upgrade. No files are copied or replaced.
  if (!hasDatabase(legacy) && hasDatabase(branded)) {
    app.setPath('userData', branded);
    app.setPath('sessionData', branded);
  }
  return null;
}

module.exports = { configureProfile };
