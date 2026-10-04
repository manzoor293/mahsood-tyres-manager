const fs = require("node:fs");
const path = require("node:path");
const { renderCompactInvoice } = require('./compact-invoice.cjs');
const css = fs.readFileSync(path.join(__dirname, "document.css"), "utf8");
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
function money(value) {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid printable money");
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  return `Rs. ${amount < 0n ? "-" : ""}${new Intl.NumberFormat("en-PK").format(absolute / 100n)}.${String(absolute % 100n).padStart(2, "0")}`;
}
function date(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("en-PK", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed)
    : value;
}
const paragraphs = (values) =>
  values
    .filter(Boolean)
    .map((value) => `<p>${escapeHtml(value)}</p>`)
    .join("");
const totals = (rows) =>
  `<div class="totals"><dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(money(value))}</dd>`).join("")}</dl></div>`;
function renderDocument(document) {
  const d = document,
    shop = d.shop;
  const itemTable = d.items.length
    ? `<table aria-label="Document items"><colgroup><col style="width:13%"><col style="width:25%"><col style="width:15%"><col style="width:8%"><col style="width:19%"><col style="width:20%"></colgroup><thead><tr>${["SKU", "Product / brand / model", "Tyre size", d.quantityLabel || "Qty", d.unitLabel, d.lineLabel].map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${d.items.map((item) => `<tr><td>${escapeHtml(item.sku)}</td><td>${escapeHtml([item.brand, item.model].filter(Boolean).join(" / "))}</td><td>${escapeHtml(item.size)}</td><td class="quantity">${escapeHtml(item.quantity)}${d.mixedUnits ? ` ${item.units_per_transaction_unit === 2 ? "pairs" : "tyres"}` : ""}</td><td class="money">${escapeHtml(money(item.unit_value))}</td><td class="money">${escapeHtml(money(item.line_total))}</td></tr>`).join("")}</tbody></table>`
    : "";
  if (['saleInvoice', 'purchaseInvoice'].includes(d.type))
    return renderCompactInvoice(d, { escapeHtml, money, date, paragraphs, itemTable });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(d.title)} - ${escapeHtml(d.reference)}</title><style>${css}</style></head><body><main class="document">
    <header><h1>${escapeHtml(shop.name)}</h1>${paragraphs([shop.address, shop.phone && `Phone: ${shop.phone}`, shop.alternatePhone && `Alternate phone: ${shop.alternatePhone}`, shop.email && `Email: ${shop.email}`, shop.ntn && `NTN / registration: ${shop.ntn}`])}</header>
    <h2>${escapeHtml(d.title)}</h2><div class="meta"><div>${paragraphs([`Reference: ${d.reference}`, `Date: ${date(d.date)}`, d.invoiceReference && d.invoiceReference !== d.reference && `Related invoice: ${d.invoiceReference}`])}</div><div><p class="label">${escapeHtml(d.contactLabel)}</p>${paragraphs([d.contact.name, d.contact.phone, d.contact.address])}</div></div>
    <h3>${escapeHtml(d.sectionTitle)}</h3>${itemTable}${totals(d.totals)}${d.method ? `<p>Payment method: ${escapeHtml(d.method)}</p>` : ""}
    ${d.explanation ? `<p class="explanation">${escapeHtml(d.explanation)}</p>` : ""}
    ${d.current.length ? `<section class="current"><h3>Current invoice position at document generation</h3><p class="explanation">Original invoice items and totals above are preserved. This section includes all recorded payments and returns as of ${escapeHtml(date(d.generatedAt))}.</p>${totals(d.current)}<p>Status: ${escapeHtml(d.status)}</p></section>` : ""}
    ${d.relatedReturns.length ? `<section><h3>Related returns</h3>${d.relatedReturns.map((r) => `<p>${escapeHtml(r.reference)} | ${escapeHtml(date(r.returned_at))} | ${escapeHtml(money(r.total))}</p>`).join("")}</section>` : ""}
    ${d.notes ? `<section><h3>Notes / reason</h3><p>${escapeHtml(d.notes)}</p></section>` : ""}
    <footer>${d.footer ? `<p>${escapeHtml(d.footer)}</p>` : ""}<p>${escapeHtml(d.provenance)}</p><p>Generated: ${escapeHtml(date(d.generatedAt))}</p></footer>
    </main></body></html>`;
}
module.exports = { renderDocument, escapeHtml, money };
