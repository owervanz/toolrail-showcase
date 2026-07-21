// Document templates: data (JSON) -> print-ready HTML.
// Kept dependency-free on purpose: template literals + a tiny escaper.

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n) || 0);

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; font-size: 13px; padding: 48px; }
  h1 { font-size: 26px; letter-spacing: -0.5px; }
  h2 { font-size: 15px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #666; padding: 8px 10px; border-bottom: 2px solid #1a1a2e; }
  td { padding: 9px 10px; border-bottom: 1px solid #e4e4ec; }
  .right { text-align: right; }
  .muted { color: #777; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .totals { margin-top: 14px; margin-left: auto; width: 260px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 10px; }
  .totals .grand { font-weight: 700; font-size: 16px; border-top: 2px solid #1a1a2e; margin-top: 4px; padding-top: 8px; }
  .badge { display: inline-block; background: #1a1a2e; color: #fff; padding: 3px 10px; border-radius: 4px; font-size: 11px; letter-spacing: 1px; }
  .section { margin: 14px 0; line-height: 1.55; }
  footer { position: fixed; bottom: 18px; left: 48px; right: 48px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
`;

function wrap(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body>${body}</body></html>`;
}

export function invoiceTemplate(d = {}) {
  const currency = d.currency || "USD";
  const items = Array.isArray(d.items) ? d.items : [];
  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 1) * (Number(it.unit_price) || 0), 0);
  const taxRate = Number(d.tax_rate ?? 0);
  const tax = subtotal * taxRate / 100;
  const rows = items.map(it => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unit_price) || 0;
    return `<tr><td>${esc(it.description)}</td><td class="right">${qty}</td><td class="right">${money(price, currency)}</td><td class="right">${money(qty * price, currency)}</td></tr>`;
  }).join("");
  return wrap(`Invoice ${d.number || ""}`, `
    <div class="head">
      <div><h1>${esc(d.issuer?.name || "Invoice")}</h1><div class="muted">${esc(d.issuer?.details || "")}</div></div>
      <div class="right"><span class="badge">INVOICE</span><div style="margin-top:8px">Nº <b>${esc(d.number || "-")}</b></div><div class="muted">${esc(d.date || new Date().toISOString().slice(0, 10))}</div></div>
    </div>
    <h2>Bill to</h2><div class="section">${esc(d.client?.name || "-")}<br><span class="muted">${esc(d.client?.details || "")}</span></div>
    <table><thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span>${money(subtotal, currency)}</span></div>
      <div><span>Tax (${taxRate}%)</span><span>${money(tax, currency)}</span></div>
      <div class="grand"><span>Total</span><span>${money(subtotal + tax, currency)}</span></div>
    </div>
    ${d.notes ? `<h2>Notes</h2><div class="section muted">${esc(d.notes)}</div>` : ""}
    <footer>${esc(d.footer || "Generated via Toolrail")}</footer>`);
}

export function reportTemplate(d = {}) {
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const body = sections.map(s => {
    let inner = `<h2>${esc(s.title)}</h2>`;
    if (s.text) inner += `<div class="section">${esc(s.text)}</div>`;
    if (Array.isArray(s.bullets)) inner += `<ul class="section">${s.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>`;
    if (Array.isArray(s.table) && s.table.length) {
      const cols = Object.keys(s.table[0]);
      inner += `<table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${
        s.table.map(row => `<tr>${cols.map(c => `<td>${esc(row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    return inner;
  }).join("");
  return wrap(d.title || "Report", `
    <div class="head"><div><h1>${esc(d.title || "Report")}</h1><div class="muted">${esc(d.subtitle || "")}</div></div>
    <div class="right muted">${esc(d.date || new Date().toISOString().slice(0, 10))}<br>${esc(d.author || "")}</div></div>
    ${body}<footer>${esc(d.footer || "Generated via Toolrail")}</footer>`);
}

export function contractTemplate(d = {}) {
  const clauses = Array.isArray(d.clauses) ? d.clauses : [];
  return wrap(d.title || "Agreement", `
    <h1 style="text-align:center">${esc(d.title || "AGREEMENT")}</h1>
    <div class="section" style="margin-top:24px">
      This agreement is entered into on <b>${esc(d.date || new Date().toISOString().slice(0, 10))}</b> between
      <b>${esc(d.party_a?.name || "Party A")}</b> (${esc(d.party_a?.id || "")}), hereinafter "${esc(d.party_a?.alias || "Party A")}",
      and <b>${esc(d.party_b?.name || "Party B")}</b> (${esc(d.party_b?.id || "")}), hereinafter "${esc(d.party_b?.alias || "Party B")}".
    </div>
    ${clauses.map((c, i) => `<h2>${i + 1}. ${esc(c.title)}</h2><div class="section">${esc(c.text)}</div>`).join("")}
    <div style="display:flex; justify-content:space-around; margin-top:90px; text-align:center">
      <div>_______________________<br>${esc(d.party_a?.name || "Party A")}</div>
      <div>_______________________<br>${esc(d.party_b?.name || "Party B")}</div>
    </div>
    <footer>${esc(d.footer || "Draft generated via Toolrail — review before signing")}</footer>`);
}

export const TEMPLATES = {
  invoice: invoiceTemplate,
  report: reportTemplate,
  contract: contractTemplate,
};
