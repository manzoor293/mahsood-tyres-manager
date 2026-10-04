const fs = require("node:fs");
const path = require("node:path");
const { invoicePaper } = require("./paper.cjs");
const css = fs.readFileSync(
  path.join(__dirname, "compact-invoice.css"),
  "utf8",
);
const logo = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, "mahsood-tyres-logo.png")).toString("base64")}`;
function renderCompactInvoice(
  d,
  { escapeHtml: e, money, date, paragraphs, itemTable },
) {
  const shop = d.shop;
  const rows = (values) =>
    values
      .map(
        ([label, value]) =>
          `<tr><th scope="row">${e(label === "Current outstanding balance" ? "Current receivable balance" : label)}</th><td class="money">${e(money(value))}</td></tr>`,
      )
      .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${e(d.title)} - ${e(d.reference)}</title><style>
    @page { size: ${invoicePaper.widthMm}mm ${invoicePaper.heightMm}mm; margin: ${invoicePaper.marginMm}mm; }
    :root { --paper-width: ${invoicePaper.widthMm}mm; --paper-margin: ${invoicePaper.marginMm}mm; }
    ${css}</style></head><body><main class="compact-invoice">
    <header class="brand"><img class="logo" src="${logo}" alt="Mahsood Tyres"><div><h1 class="title">Mahsood Tyres</h1>${paragraphs([shop.address, [shop.phone, shop.alternatePhone].filter(Boolean).join(" / "), shop.email, shop.ntn && `NTN / registration: ${shop.ntn}`])}</div></header>
    <div class="title-bar"><h2>${d.type === "saleInvoice" ? "SALES INVOICE" : "PURCHASE INVOICE"}</h2><div><p>Reference: <strong>${e(d.reference)}</strong></p><p>Date: ${e(date(d.date))}</p></div></div>
    <section class="party"><div><h3>${e(d.contactLabel)}</h3>${paragraphs([d.contact.name === "Walk-in" ? "Walk-in Customer" : d.contact.name, d.contact.phone, d.contact.address])}</div>${d.method ? `<div><h3>Payment method</h3><p>${e(d.method)}</p></div>` : ""}</section>
    <section class="original"><h3>${e(d.sectionTitle)}</h3>${itemTable}<table class="invoice-totals" aria-label="Original invoice totals"><tbody>${rows(d.totals)}</tbody></table></section>
    ${d.current.length ? `<section class="current"><h3>Current Invoice Position</h3><table aria-label="Current invoice position"><tbody>${rows(d.current)}<tr><th scope="row">Status</th><td class="status">${e(d.status)}</td></tr></tbody></table></section>` : ""}
    ${d.relatedReturns.length ? `<section><h3>Related returns</h3>${d.relatedReturns.map((r) => `<p>${e(r.reference)} | ${e(date(r.returned_at))} | ${e(money(r.total))}</p>`).join("")}</section>` : ""}
    ${d.explanation ? `<p class="explanation">${e(d.explanation)}</p>` : ""}
    ${d.notes ? `<section><h3>Notes / reason</h3><p>${e(d.notes)}</p></section>` : ""}
    <div class="signatures"><span>Signature</span><span>Printed Name</span><span>Date</span><span>Payment Method</span></div>
    <footer>${d.footer ? `<p>${e(d.footer)}</p>` : ""}<p>${e(d.provenance)}</p><p>Generated: ${e(date(d.generatedAt))}</p></footer>
    </main></body></html>`;
}
module.exports = { renderCompactInvoice };
