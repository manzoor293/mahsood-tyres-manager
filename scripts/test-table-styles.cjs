// Runs an existing UI workflow with presentation checks after each renderer step.
const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const entry = process.argv[2];
if (!/^test-[a-z-]+-ui\.cjs$/.test(entry || "")) throw Error("UI test entry required");
const seen = new Set();
app.on("browser-window-created", (_, window) => {
  window.webContents.on("console-message", details => {
    const message = details.message || '';
    if (details.level === 'error' || /Each child in a list|Encountered two children|uncontrolled.*controlled|controlled.*uncontrolled/i.test(message)) {
      console.error(`FAIL renderer console (${entry}): ${message}`);
      app.exit(1);
    }
  });
  const execute = window.webContents.executeJavaScript.bind(window.webContents);
  window.webContents.executeJavaScript = async (...args) => {
    const result = await execute(...args);
    const tables = await execute(`(() => {
      return Array.from(document.querySelectorAll('table')).filter(table => table.tHead).map(table => {
        const errors = [];
        for (const cell of table.tHead.querySelectorAll('th, td')) {
          const style = getComputedStyle(cell);
          if (style.backgroundColor !== 'rgb(229, 231, 235)') errors.push('header background: ' + style.backgroundColor);
          if (style.color !== 'rgb(17, 24, 39)') errors.push('header text: ' + style.color);
          if (style.whiteSpace !== 'nowrap') errors.push('wrapping header: ' + cell.textContent);
        }
        const rows = Array.from(table.tBodies[0]?.rows || []);
        rows.forEach((row, index) => {
          const background = getComputedStyle(row).backgroundColor;
          const expected = index % 2 ? 'rgb(249, 250, 251)' : 'rgb(255, 255, 255)';
          if (background !== expected && background !== 'rgb(243, 244, 246)') errors.push('row background: ' + background);
          for (const cell of row.cells) {
            const style = getComputedStyle(cell);
            if (style.backgroundColor !== background) errors.push('cell background: ' + style.backgroundColor);
          }
        });
        const container = table.closest('.MuiTableContainer-root') || table.parentElement;
        if (!['auto', 'scroll'].includes(getComputedStyle(container).overflowX)) errors.push('missing horizontal scroll');
        return { label: table.getAttribute('aria-label'), rows: rows.length, width: innerWidth, visible: table.getBoundingClientRect().height > 0, errors };
      });
    })()`);
    for (const table of tables) {
      assert.deepEqual(table.errors, [], `${entry}: ${table.label}`);
      const key = `${table.label}-${table.width}`;
      if (table.rows && table.visible && !seen.has(key)) {
        seen.add(key);
        const filename = `${entry}-${process.argv.slice(3).join('-')}-${key}`.replace(/[^a-zA-Z0-9-]/g, "_");
        // Let React and dialog transitions paint, then bring the table into view.
        await new Promise(resolve => setTimeout(resolve, 250));
        const point = await execute(`(() => {
          window.__tableStyleScroll = Array.from(document.querySelectorAll('*')).filter(e => e.scrollTop || e.scrollLeft).map(e => [e, e.scrollTop, e.scrollLeft]);
          const table = Array.from(document.querySelectorAll('table')).find(e => e.getAttribute('aria-label') === ${JSON.stringify(table.label)});
          table?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          const rect = table?.tBodies[0]?.rows[0]?.getBoundingClientRect();
          return rect ? { x: Math.round(rect.left + 20), y: Math.round(rect.top + rect.height / 2) } : null;
        })()`);
        await execute("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        fs.writeFileSync(path.join(__dirname, "../artifacts", `table-style-${filename}.png`), (await window.webContents.capturePage()).toPNG());
        if (point && point.x > 0 && point.y > 0) {
          window.webContents.sendInputEvent({ type: "mouseMove", ...point });
          await new Promise(resolve => setTimeout(resolve, 50));
          const hoverColors = await execute("Array.from(document.querySelectorAll('table tbody tr:hover')).map(row => getComputedStyle(row).backgroundColor)");
          for (const color of hoverColors) assert.equal(color, "rgb(243, 244, 246)", "neutral hover");
          window.webContents.sendInputEvent({ type: "mouseMove", x: 0, y: 0 });
        }
        await execute("window.__tableStyleScroll.forEach(([e, top, left]) => { e.scrollTop = top; e.scrollLeft = left; }); delete window.__tableStyleScroll;");
      }
    }
    return result;
  };
});
app.on("will-quit", () => console.log(`PASS table styles: ${entry}; ${[...seen].join(', ')}`));
require(`./${entry}`);
