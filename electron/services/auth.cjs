const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { createAuthRepository } = require('../repositories/auth.cjs');
const { CatalogError, object } = require('./validation.cjs');
const derive = promisify(scrypt);
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function credentials(input, setup) {
  object(input, setup ? ['email', 'password', 'confirmPassword'] : ['email', 'password']);
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CatalogError(setup ? 'VALIDATION' : 'INVALID_CREDENTIALS', setup ? 'Enter a valid email address.' : 'Invalid email or password.');
  }
  if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 1024) {
    throw new CatalogError(setup ? 'VALIDATION' : 'INVALID_CREDENTIALS', setup ? 'Use a password between 8 and 1024 characters.' : 'Invalid email or password.');
  }
  if (setup && input.confirmPassword !== input.password) throw new CatalogError('VALIDATION', 'Passwords do not match.');
  return { email, password: input.password };
}

function createAuthService(getDatabase, onChanged = () => {}) {
  let authenticated = false;
  let pending = false;
  let generation = 0;
  // A missing account still follows the password-derivation path on login.
  const dummySalt = randomBytes(32);
  const dummyHash = randomBytes(64);
  const repository = () => createAuthRepository(getDatabase());
  const getStatus = () => ({ hasAdministrator: Boolean(repository().get()), authenticated });
  function invalidate() { authenticated = false; generation++; onChanged(); }
  async function attempt(operation) {
    if (pending) throw new CatalogError('BUSY', 'Authentication is already in progress. Please wait.');
    pending = true;
    const current = generation;
    try {
      await operation(() => {
        if (current !== generation) throw new CatalogError('UNAUTHENTICATED', 'Please sign in again.');
      });
      if (current !== generation) throw new CatalogError('UNAUTHENTICATED', 'Please sign in again.');
      authenticated = true;
      onChanged();
      return getStatus();
    } finally { pending = false; }
  }
  return {
    getStatus,
    isAuthenticated: () => authenticated,
    invalidate,
    setup(input) {
      return attempt(async ensureCurrent => {
        if (repository().get()) throw new CatalogError('CONFLICT', 'An Administrator account already exists. Please sign in.');
        const { email, password } = credentials(input, true);
        const salt = randomBytes(32);
        const hash = await derive(password, salt, 64, parameters);
        ensureCurrent();
        getDatabase().transaction(() => {
          if (repository().get()) throw new CatalogError('CONFLICT', 'An Administrator account already exists. Please sign in.');
          repository().create({ email, password_salt: salt.toString('hex'), password_hash: hash.toString('hex') });
        }).immediate();
      });
    },
    login(input) {
      return attempt(async () => {
        const { email, password } = credentials(input, false);
        const row = repository().get();
        const salt = row ? Buffer.from(row.password_salt, 'hex') : dummySalt;
        const expected = row ? Buffer.from(row.password_hash, 'hex') : dummyHash;
        const actual = await derive(password, salt, 64, parameters);
        const matches = expected.length === actual.length && timingSafeEqual(actual, expected);
        if (!matches || !row || row.email !== email) throw new CatalogError('INVALID_CREDENTIALS', 'Invalid email or password.');
      });
    },
    logout() { invalidate(); return getStatus(); },
  };
}
module.exports = { createAuthService };
