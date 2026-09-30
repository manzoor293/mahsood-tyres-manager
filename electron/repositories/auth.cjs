function createAuthRepository(db) {
  const get = db.prepare('SELECT * FROM administrator WHERE id = 1');
  const insert = db.prepare('INSERT INTO administrator (id,email,password_salt,password_hash,created_at) VALUES (1,@email,@password_salt,@password_hash,@created_at)');
  return {
    get: () => get.get(),
    create: (data) => insert.run({ ...data, created_at: new Date().toISOString() }),
  };
}
module.exports = { createAuthRepository };
