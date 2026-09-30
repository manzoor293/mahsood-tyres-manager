const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomBytes, scryptSync } = require("node:crypto");
const Database = require("better-sqlite3");
const { openDatabase } = require("../electron/database/index.cjs");
const { migrate } = require("../electron/database/migrate.cjs");
const { createAuthService } = require("../electron/services/auth.cjs");
const {
  registerAuthIpc,
  createAuthorizedIpc,
} = require("../electron/ipc/auth.cjs");
const { createMaintenanceGate } = require("../electron/ipc/maintenance.cjs");
const { createBackupService } = require("../electron/services/backup.cjs");
const { seedBackup, allData } = require("./backup-fixtures.cjs");
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw new Error("Temporary profile required.");
app.setPath("userData", root);
app.setPath("sessionData", root);
const timeout = setTimeout(() => {
  console.error("Auth backend timeout");
  app.exit(1);
}, 120000);

app.whenReady().then(async () => {
  let db,
    code = 0;
  try {
    const filename = path.join(root, "database", "auth.sqlite3");
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const migrationFiles = fs
      .readdirSync(path.join(__dirname, "../electron/database/migrations"))
      .sort();
    const legacy = new Database(filename);
    for (const file of migrationFiles.slice(0, 4))
      legacy.exec(
        fs.readFileSync(
          path.join(__dirname, "../electron/database/migrations", file),
          "utf8",
        ),
      );
    legacy.pragma("user_version=4");
    seedBackup(legacy);
    const before = allData(legacy);
    legacy.close();
    db = openDatabase(filename);
    assert.equal(db.pragma("user_version", { simple: true }), 5);
    const after = allData(db);
    delete after.administrator;
    assert.deepEqual(after, before);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get().n,
      21,
    );
    const broken = new Database(":memory:");
    try {
      for (const file of migrationFiles.slice(0, 4))
        broken.exec(
          fs.readFileSync(
            path.join(__dirname, "../electron/database/migrations", file),
            "utf8",
          ),
        );
      broken.exec(
        "PRAGMA user_version=4; INSERT INTO brands(name) VALUES ('Keep'); CREATE TABLE administrator(collision TEXT)",
      );
      const brokenBefore = allData(broken);
      assert.throws(() => migrate(broken));
      assert.equal(broken.pragma("user_version", { simple: true }), 4);
      assert.deepEqual(allData(broken), brokenBefore);
    } finally {
      broken.close();
    }

    const auth = createAuthService(() => db);
    assert.deepEqual(auth.getStatus(), {
      hasAdministrator: false,
      authenticated: false,
    });
    const password = randomBytes(20).toString("hex");
    const input = {
      email: "  OWNER@EXAMPLE.TEST  ",
      password,
      confirmPassword: password,
    };
    for (const patch of [
      { email: "bad" },
      { email: "x@ y.test" },
      { password: "short", confirmPassword: "short" },
      { confirmPassword: "mismatch" },
    ]) {
      await assert.rejects(
        auth.setup({ ...input, ...patch }),
        (error) => error.code === "VALIDATION",
      );
      assert.equal(auth.getStatus().hasAdministrator, false);
    }
    const setup = auth.setup(input);
    await assert.rejects(auth.setup(input), (error) => error.code === "BUSY");
    assert.deepEqual(await setup, {
      hasAdministrator: true,
      authenticated: true,
    });
    const stored = db.prepare("SELECT * FROM administrator").get();
    assert.equal(stored.email, "owner@example.test");
    assert.equal(stored.password_salt.length, 64);
    assert.equal(stored.password_hash.length, 128);
    assert.ok(!JSON.stringify(stored).includes(password));
    const derived = scryptSync(
      password,
      Buffer.from(stored.password_salt, "hex"),
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    );
    assert.ok(derived.equals(Buffer.from(stored.password_hash, "hex")));
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO administrator SELECT 2,email,password_salt,password_hash,created_at FROM administrator",
        )
        .run(),
    );
    await assert.rejects(
      auth.setup(input),
      (error) => error.code === "CONFLICT",
    );
    assert.equal(auth.logout().authenticated, false);
    for (const credentials of [
      { email: input.email, password: "Wrong password" },
      { email: "wrong@example.test", password },
    ]) {
      await assert.rejects(
        auth.login(credentials),
        (error) =>
          error.code === "INVALID_CREDENTIALS" &&
          error.message === "Invalid email or password.",
      );
      assert.equal(auth.isAuthenticated(), false);
    }

    const handlers = new Map();
    const ipc = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    };
    const trusted = (event) => event.trusted === true;
    const gate = createMaintenanceGate(ipc);
    const authorized = createAuthorizedIpc(gate.ipc, auth, trusted);
    let invoked = 0;
    authorized.handle("business:test", () => {
      invoked++;
      return { ok: true };
    });
    registerAuthIpc(gate.ipc, auth, trusted);
    assert.equal(
      (await handlers.get("business:test")({ trusted: true })).error.code,
      "UNAUTHENTICATED",
    );
    assert.equal(
      (await handlers.get("business:test")({})).error.code,
      "FORBIDDEN",
    );
    assert.equal(
      (await handlers.get("auth:login")({ trusted: true }, {}, "extra")).error
        .code,
      "VALIDATION",
    );
    assert.equal(
      (await handlers.get("auth:setup")({}, input)).error.code,
      "FORBIDDEN",
    );
    assert.equal(invoked, 0);
    assert.equal(
      (await auth.login({ email: input.email, password })).authenticated,
      true,
    );
    assert.equal(
      (await handlers.get("business:test")({ trusted: true })).ok,
      true,
    );
    assert.equal(invoked, 1);
    auth.logout();
    assert.equal(
      (await handlers.get("business:test")({ trusted: true })).error.code,
      "UNAUTHENTICATED",
    );
    const login = handlers.get("auth:login")(
      { trusted: true },
      { email: input.email, password },
    );
    assert.equal(
      gate.lock(),
      false,
      "Restore cannot start while password derivation is pending",
    );
    await login;
    auth.logout();
    const staleLogin = auth.login({ email: input.email, password });
    auth.invalidate();
    await assert.rejects(
      staleLogin,
      (error) => error.code === "UNAUTHENTICATED",
    );
    assert.equal(auth.isAuthenticated(), false);
    await auth.login({ email: input.email, password });
    const reopenedSession = createAuthService(() => db);
    assert.equal(reopenedSession.isAuthenticated(), false);

    // Real backup/restore: credentials preserved, prior session revoked on reopen.
    let selected = path.join(root, "admin-backup.sqlite3");
    const backup = createBackupService({
      app,
      gate,
      getDatabase: () => db,
      closeDatabase: () => db.close(),
      reopen: () => {
        db = openDatabase(filename);
        auth.invalidate();
        return db;
      },
      dialogs: {
        showSaveDialog: async () => ({ canceled: false, filePath: selected }),
        showOpenDialog: async () => ({
          canceled: false,
          filePaths: [selected],
        }),
        showMessageBox: async () => ({ response: 1 }),
      },
    });
    await backup.create();
    await backup.restore();
    assert.equal(auth.isAuthenticated(), false);
    assert.equal(
      (await auth.login({ email: input.email, password })).authenticated,
      true,
    );
    assert.deepEqual(db.prepare("SELECT * FROM administrator").get(), stored);
    for (const version of [1, 2, 3, 4]) {
      selected = path.join(root, `old-auth-${version}.sqlite3`);
      const old = new Database(selected);
      for (const file of migrationFiles.slice(0, version))
        old.exec(
          fs.readFileSync(
            path.join(__dirname, "../electron/database/migrations", file),
            "utf8",
          ),
        );
      old.pragma(`user_version=${version}`);
      old.close();
      await backup.restore();
      assert.deepEqual(auth.getStatus(), {
        hasAdministrator: false,
        authenticated: false,
      });
      assert.equal(db.pragma("user_version", { simple: true }), 5);
    }
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    console.log(
      "PASS: v4→v5 business-data preservation/rollback, one administrator, validation, normalization, scrypt storage, generic credential failures, sessions, IPC guards/concurrency, backup credentials and v1–v4 restores.",
    );

    const restartRoot = path.join(root, "restart-profile");
    fs.mkdirSync(restartRoot);
    const restartPassword = randomBytes(20).toString("hex");
    for (const stage of ["setup", "restart"]) {
      const child = spawn(
        process.execPath,
        [path.join(__dirname, "test-auth-restart.cjs"), stage],
        {
          env: {
            ...process.env,
            MAHSOOD_UI_TEST_DATA: restartRoot,
            MAHSOOD_AUTH_TEST_PASSWORD: restartPassword,
          },
          stdio: "inherit",
          windowsHide: true,
        },
      );
      const exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      assert.equal(
        exitCode,
        0,
        "Full application restart authentication check",
      );
    }
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    if (db?.open) db.close();
    clearTimeout(timeout);
    app.exit(code);
  }
});
