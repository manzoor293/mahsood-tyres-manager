import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import electron from "electron";

const suites = ["products", "suppliers", "purchases", "inventory", "customers", "sales", "expenses", "payments", "returns", "reports", "ledger", "lookups", "dashboard"];
let failed = false;
for (const suite of suites) {
  const variants = ["payments", "returns"].includes(suite) ? [false, true] : [false];
  for (const supplier of variants) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mahsood-table-styles-"));
    const env = { ...process.env, MAHSOOD_UI_TEST_DATA: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = ["scripts/test-table-styles.cjs", `test-${suite}-ui.cjs`];
    if (supplier) args.push(suite === "payments" ? "--supplier-payments" : "--purchase-returns");
    const code = await new Promise((resolve, reject) => {
      const child = spawn(electron, args, { env, stdio: "inherit" });
      child.on("error", reject);
      child.on("close", resolve);
    });
    console.log(`TABLE STYLE SUITE ${suite}${supplier ? " supplier/purchase" : ""}: ${code === 0 ? "PASS" : "FAIL"}`);
    failed ||= code !== 0;
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
process.exitCode = failed ? 1 : 0;
