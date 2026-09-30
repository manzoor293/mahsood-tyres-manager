const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const testCredentials = {
  email: "administrator@example.test",
  password: randomBytes(24).toString("hex"),
};

async function authenticate(window) {
  if (!process.env.MAHSOOD_UI_TEST_DATA)
    throw new Error("Authentication helper requires an isolated test profile.");
  const result = await window.webContents.executeJavaScript(`(async () => {
    const status = await window.api.auth.getStatus();
    if (!status.ok || status.data.authenticated) return status;
    const credentials = ${JSON.stringify(testCredentials)};
    return status.data.hasAdministrator ? window.api.auth.login(credentials)
      : window.api.auth.setup({ ...credentials, confirmPassword: credentials.password });
  })()`);
  assert.equal(result.ok, true, result.error?.message);
  for (let i = 0; i < 200; i++) {
    if (
      await window.webContents.executeJavaScript(
        "Boolean(document.querySelector('#main-content'))",
      )
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Authenticated app did not render.");
}
module.exports = { authenticate };
