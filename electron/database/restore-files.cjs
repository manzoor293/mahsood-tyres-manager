const fs = require("node:fs");
const path = require("node:path");
const { inspectFile } = require("./backup-validation.cjs");

function restorePaths(filename, id) {
  if (!/^[0-9a-f-]{36}$/.test(id))
    throw new Error("Invalid restore recovery identifier");
  const directory = path.dirname(filename);
  return {
    marker: path.join(directory, "restore-pending.json"),
    stage: path.join(directory, `.restore-${id}.sqlite3`),
    previous: path.join(directory, `.previous-${id}.sqlite3`),
    failed: path.join(directory, `.failed-${id}.sqlite3`),
    safety: path.join(
      directory,
      "..",
      "recovery",
      `pre-restore-backup-${id}.sqlite3`,
    ),
  };
}
function removeSidecars(filename) {
  for (const suffix of ["-wal", "-shm"])
    fs.rmSync(filename + suffix, { force: true });
}
function writeMarker(filename, id) {
  const marker = restorePaths(filename, id).marker;
  const temporary = path.join(path.dirname(filename), `.restore-${id}.json`);
  if (fs.existsSync(marker))
    throw new Error("An earlier restore needs recovery");
  try {
    const fd = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(fd, JSON.stringify({ id }));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, marker);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
// Called only with no live connection, both on startup and after a failed replacement.
// Never initialize an empty database while an interrupted replacement is unresolved.
function recoverInterruptedRestore(filename) {
  const marker = path.join(path.dirname(filename), "restore-pending.json");
  if (!fs.existsSync(marker)) return false;
  const { id } = JSON.parse(fs.readFileSync(marker, "utf8"));
  const files = restorePaths(filename, id);
  let originalUsable = false;
  if (fs.existsSync(files.previous)) {
    try {
      inspectFile(files.previous);
      originalUsable = true;
    } catch (error) {
      console.error(
        "Checkpointed original failed validation; using safety backup:",
        error,
      );
    }
  }
  if (
    originalUsable ||
    fs.existsSync(files.previous) ||
    !fs.existsSync(filename)
  ) {
    let source = files.previous;
    if (!originalUsable) {
      inspectFile(files.safety);
      // Only a verified, closed SQLite snapshot is copied. Keep the safety copy intact.
      fs.copyFileSync(files.safety, files.stage);
      inspectFile(files.stage);
      source = files.stage;
    }
    removeSidecars(source);
    removeSidecars(filename);
    if (fs.existsSync(filename)) fs.renameSync(filename, files.failed);
    fs.renameSync(source, filename);
  }
  inspectFile(filename);
  // Read-only inspection of a WAL-mode header can create empty coordination files.
  removeSidecars(filename);
  fs.rmSync(marker);
  return true;
}
module.exports = {
  restorePaths,
  removeSidecars,
  writeMarker,
  recoverInterruptedRestore,
};
