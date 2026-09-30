const { app, dialog, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const Database = require("better-sqlite3");
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw Error("Temporary profile required");
app.setPath("userData", root);
app.setPath("sessionData", root);
const timeout = setTimeout(() => {
  console.error("Authentication UI timed out");
  app.exit(1);
}, 120000);
let selected = path.join(root, "account-backup.sqlite3");
dialog.showSaveDialog = async () => ({ canceled: false, filePath: selected });
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [selected],
});
dialog.showMessageBox = async () => ({ response: 1 });
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) =>
  handle(
    channel,
    ["auth:setup", "auth:login"].includes(channel)
      ? async (...args) => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return handler(...args);
        }
      : handler,
  );
let attached = false;
app.on("browser-window-created", (_, window) => {
  if (attached) return;
  attached = true;
  window.webContents.once("did-finish-load", async () => {
    const evaluate = async (code) => {
      const result = await window.webContents.executeJavaScript(
        `(async()=>{try{return {value:await (${code.replace(/;\s*$/, "")})};}catch(error){return {failure:error.message};}})()`,
      );
      if (result.failure) throw Error(result.failure);
      return result.value;
    };
    const wait = async (condition) => {
      for (let i = 0; i < 200; i++) {
        if (await evaluate(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw Error(`Timed out: ${condition}`);
    };
    const text = (value) =>
      wait(`document.body.textContent.includes(${JSON.stringify(value)})`);
    const click = (label) =>
      evaluate(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`,
      );
    const field = (name, value) =>
      evaluate(
        `(()=>{const input=document.querySelector('[name="auth-${name}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    const denied = async () => {
      const results = await evaluate(
        `(async()=>{const results=[];for(const [group,api] of Object.entries(window.api)){if(group==='auth')continue;for(const [name,method] of Object.entries(api)){if(typeof method==='function')results.push([group+'.'+name,await method()]);}}return results;})()`,
      );
      assert.ok(results.length > 50);
      for (const [name, result] of results)
        assert.equal(result.error?.code, "UNAUTHENTICATED", name);
    };
    try {
      const password = randomBytes(20).toString("hex");
      await text("Create Administrator Account");
      fs.mkdirSync(path.join(__dirname, "../artifacts"), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, "../artifacts/auth-setup.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      await evaluate('location.hash="/sales"');
      assert.equal(
        await evaluate('Boolean(document.querySelector("#main-content"))'),
        false,
      );
      await denied();
      assert.deepEqual(await evaluate("window.api.auth.getStatus()"), {
        ok: true,
        data: { hasAdministrator: false, authenticated: false },
      });
      assert.equal(await evaluate("typeof window.require"), "undefined");
      await field("email", "bad");
      await field("password", "short");
      await field("confirm-password", "different");
      await click("Create Administrator Account");
      await text("Enter a valid email address.");
      await text("Passwords do not match.");
      await field("email", "  OWNER@EXAMPLE.TEST  ");
      await field("password", password);
      await field("confirm-password", password);
      await evaluate(
        `document.querySelector('[aria-label="Show password"]').click()`,
      );
      assert.equal(
        await evaluate('document.querySelector("[name=auth-password]").type'),
        "text",
      );
      await evaluate(
        `document.querySelector('[aria-label="Hide password"]').click()`,
      );
      await click("Create Administrator Account");
      await text("Please wait...");
      assert.equal(
        await evaluate(
          'document.querySelector("button[type=submit]").disabled',
        ),
        true,
      );
      await wait('Boolean(document.querySelector("#main-content"))');
      assert.equal((await evaluate("window.api.products.list()")).ok, true);
      assert.equal(
        (await evaluate(`window.api.auth.setup({})`)).error.code,
        "CONFLICT",
      );
      assert.equal((await evaluate("window.api.backup.create()")).ok, true);
      await click("Logout");
      await text("Sign in to Mahsood Tyre Manager");
      await denied();
      await evaluate('location.hash="/settings"');
      assert.equal(
        await evaluate('Boolean(document.querySelector("#main-content"))'),
        false,
      );
      await field("email", "wrong@example.test");
      await field("password", password);
      await click("Sign in");
      await text("Invalid email or password.");
      await field("email", "owner@example.test");
      await field("password", "Wrong password");
      await click("Sign in");
      await text("Invalid email or password.");
      await wait('!document.querySelector("button[type=submit]").disabled');
      window.setSize(640, 480);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(
        await evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
      );
      fs.mkdirSync(path.join(__dirname, "../artifacts"), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, "../artifacts/auth-login.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      await field("password", password);
      await click("Sign in");
      await wait('Boolean(document.querySelector("#main-content"))');
      assert.equal((await evaluate("window.api.backup.restore()")).ok, true);
      await text("Sign in to Mahsood Tyre Manager");
      await denied();
      await field("email", "owner@example.test");
      await field("password", password);
      await click("Sign in");
      await wait('Boolean(document.querySelector("#main-content"))');
      selected = path.join(root, "legacy.sqlite3");
      const legacy = new Database(selected);
      for (const file of fs
        .readdirSync(path.join(__dirname, "../electron/database/migrations"))
        .sort()
        .slice(0, 4))
        legacy.exec(
          fs.readFileSync(
            path.join(__dirname, "../electron/database/migrations", file),
            "utf8",
          ),
        );
      legacy.pragma("user_version=4");
      legacy.close();
      assert.equal((await evaluate("window.api.backup.restore()")).ok, true);
      await text("Create Administrator Account");
      await denied();
      assert.deepEqual((await evaluate("window.api.auth.getStatus()")).data, {
        hasAdministrator: false,
        authenticated: false,
      });
      const replacementPassword = randomBytes(20).toString("hex");
      await field("email", "replacement@example.test");
      await field("password", replacementPassword);
      await field("confirm-password", replacementPassword);
      await click("Create Administrator Account");
      await wait('Boolean(document.querySelector("#main-content"))');
      selected = path.join(root, "account-backup.sqlite3");
      assert.equal((await evaluate("window.api.backup.restore()")).ok, true);
      await text("Sign in to Mahsood Tyre Manager");
      await field("email", "replacement@example.test");
      await field("password", replacementPassword);
      await click("Sign in");
      await text("Invalid email or password.");
      await field("email", "owner@example.test");
      await field("password", password);
      await click("Sign in");
      await wait('Boolean(document.querySelector("#main-content"))');
      console.log(
        "PASS Auth UI: setup validation, confirmation, password toggle, loading, login success/generic failures, logout, direct routes, every business API guarded, narrow layout, credential backup restore and legacy restore setup.",
      );
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
require("../electron/main.cjs");
