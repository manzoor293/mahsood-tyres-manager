const profileKeys = Object.freeze({
  name: "shop.name",
  address: "shop.address",
  phone: "shop.phone",
  alternatePhone: "shop.alternatePhone",
  email: "shop.email",
  ntn: "shop.ntn",
  footer: "printing.footer",
});
function createSettingsRepository(db) {
  const keys = Object.values(profileKeys);
  const read = db.prepare(
    `SELECT key,value FROM settings WHERE key IN (${keys.map(() => "?").join(",")})`,
  );
  const write = db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  );
  return {
    readProfile: () =>
      Object.fromEntries(read.all(...keys).map((row) => [row.key, row.value])),
    writeProfile(profile) {
      const now = new Date().toISOString();
      for (const [field, key] of Object.entries(profileKeys))
        write.run(key, profile[field], now);
    },
  };
}
module.exports = { createSettingsRepository, profileKeys };
