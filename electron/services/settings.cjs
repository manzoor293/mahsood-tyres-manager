const v = require('./validation.cjs');
const { normalizePhone } = require('./contact-validation.cjs');
const { createSettingsRepository, profileKeys } = require('../repositories/settings.cjs');
const shopDefaults = Object.freeze({ name: 'Mahsood Tyre Manager', address: '', phone: '', alternatePhone: '', email: '', ntn: '', footer: '' });
const preferences = Object.freeze({ currency: 'PKR', currencyLabel: 'Pakistani Rupee (PKR)' });
function createSettingsService(db) {
  const repository = createSettingsRepository(db);
  function getShopProfile() {
    const stored = repository.readProfile();
    return Object.fromEntries(Object.entries(profileKeys).map(([field, key]) => {
      const value = stored[key]?.trim();
      return [field, value || shopDefaults[field]];
    }));
  }
  function updateShopProfile(data) {
    v.object(data, Object.keys(profileKeys));
    if (!Object.keys(data).length) v.invalid('Provide at least one shop profile field.');
    return db.transaction(() => {
      const merged = { ...getShopProfile(), ...data };
      const result = {};
      const limits = { name: 200, address: 1000, phone: 40, alternatePhone: 40, email: 254, ntn: 100, footer: 1000 };
      for (const field of Object.keys(profileKeys)) {
        result[field] = v.text(merged[field], field === 'name' ? 'Shop name' : field, limits[field], field !== 'name') || '';
        if (/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(result[field])) v.invalid(`${field} must be plain text without HTML or control characters.`);
      }
      for (const field of ['phone', 'alternatePhone']) result[field] = normalizePhone(result[field] || null, field === 'phone' ? 'Phone' : 'Alternate phone') || '';
      if (result.email && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(result.email)) v.invalid('Enter a valid email address.');
      repository.writeProfile(result);
      return getShopProfile();
    }).immediate();
  }
  return { getShopProfile, updateShopProfile, getPreferences: () => ({ ...preferences }) };
}
module.exports = { createSettingsService, shopDefaults };
