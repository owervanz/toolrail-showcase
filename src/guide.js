// The guide: a free web page (marketing/authority asset for Toolrail) plus a
// paid PDF edition sold through our own x402 rails — no third-party account
// needed to monetize it. Available in 3 languages (?lang=es|en|pt). Reuses
// the same renderPdf() pipeline as /pdf.

import { GUIDE_LANGS, DEFAULT_LANG, LANG_LIST } from "./guide-content.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MARK_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#4ade80" stroke-width="8" stroke-linecap="round" fill="none"><path d="M47.5 16 L24 84"/><path d="M52.5 16 L76 84"/><path d="M39 42 L61 42"/><path d="M33 60 L67 60"/><path d="M26 78 L74 78"/></g></svg>`;

export function resolveLang(query) {
  const q = String(query || "").toLowerCase();
  return GUIDE_LANGS[q] ? q : DEFAULT_LANG;
}

function sectionHtml(s) {
  const paras = (s.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join("");
  const code = s.code ? `<pre class="code">${esc(s.code)}</pre>` : "";
  const bullets = s.bullets ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
  const paras2 = (s.paragraphs2 || []).map(p => `<p>${esc(p)}</p>`).join("");
  return `<section class="gsec" id="${esc(s.id)}"><h2>${esc(s.title)}</h2>${paras}${code}${bullets}${paras2}</section>`;
}

function langSwitcherHtml(lang, path) {
  const links = LANG_LIST.map(l =>
    `<a href="${path}?lang=${l.code}" class="lang${l.code === lang ? " active" : ""}">${l.flag} ${esc(l.label)}</a>`
  ).join("");
  return `<div class="lang-switch">${links}</div>`;
}

export function guideWebHtml(baseUrl, lang = DEFAULT_LANG) {
  const L = GUIDE_LANGS[lang] || GUIDE_LANGS[DEFAULT_LANG];
  const body = L.sections.map(s => sectionHtml(s)).join("");
  const toc = L.sections.map(s => `<a href="#${esc(s.id)}">${esc(s.title)}</a>`).join("");
  const checklistPreview = L.checklist.slice(0, 3).map(c => `<li>${esc(c)}</li>`).join("")
    + `<li style="color:var(--muted)">${esc(L.checklistPreviewNote)}</li>`;
  const ctaBullets = L.ctaBullets.map(b => `<li>${esc(b)}</li>`).join("");
  const priceUsd = "$7";

  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L.title)} — Toolrail</title>
<meta name="description" content="${esc(L.subtitle)}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<meta name="theme-color" content="#0a0c11">
<meta property="og:title" content="${esc(L.title)}">
<meta property="og:description" content="${esc(L.subtitle)}">
<meta property="og:image" content="${esc(baseUrl)}/assets/og-image.png">
<style>
  :root { --bg:#0a0c11; --panel:#11141c; --line:#232838; --fg:#e8eaf2; --muted:#8b93a7; --acc:#4ade80; --acc2:#60a5fa; }
  * { box-sizing:border-box; margin:0; }
  body { font-family:ui-sans-serif,system-ui,'Segoe UI',Arial,sans-serif; background:var(--bg); color:var(--fg); line-height:1.65; }
  a { color:var(--acc2); }
  nav { position:sticky; top:0; z-index:10; backdrop-filter:blur(10px); background:rgba(10,12,17,0.85); border-bottom:1px solid var(--line); padding:12px 20px; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
  nav .logo { font-weight:800; color:var(--fg); text-decoration:none; display:flex; align-items:center; gap:8px; }
  nav .logo svg { width:20px; height:20px; }
  nav .logo span { color:var(--acc); }
  nav .buy { margin-left:auto; background:var(--acc); color:#08210f; font-weight:700; padding:8px 16px; border-radius:8px; text-decoration:none; font-size:0.85rem; }
  .lang-switch { display:flex; gap:6px; }
  .lang { font-size:0.78rem; color:var(--muted); text-decoration:none; border:1px solid var(--line); border-radius:99px; padding:5px 12px; }
  .lang.active { color:var(--acc); border-color:var(--acc); background:rgba(74,222,128,0.08); }
  main { max-width:760px; margin:0 auto; padding:50px 20px 90px; }
  .kicker { color:var(--acc); font-size:0.75rem; letter-spacing:2px; font-weight:700; }
  h1 { font-size:2.3rem; letter-spacing:-1px; margin:12px 0 8px; }
  .subtitle { color:var(--muted); font-size:1.05rem; max-width:560px; }
  .toc { display:flex; flex-wrap:wrap; gap:8px; margin:26px 0 40px; padding:16px; background:var(--panel); border:1px solid var(--line); border-radius:12px; }
  .toc a { font-size:0.8rem; color:var(--muted); text-decoration:none; border:1px solid var(--line); border-radius:99px; padding:5px 12px; }
  .toc a:hover { color:var(--acc); border-color:var(--acc); }
  .gsec { margin:40px 0; }
  .gsec h2 { font-size:1.3rem; color:var(--fg); margin-bottom:12px; }
  .gsec p { color:#c7cbda; margin:12px 0; font-size:0.96rem; }
  .gsec ul { margin:12px 0 12px 20px; color:#c7cbda; font-size:0.94rem; }
  .gsec li { margin:8px 0; }
  .code { background:#0c0f16; border:1px solid var(--line); border-radius:10px; padding:16px 18px; overflow-x:auto; font-family:ui-monospace,Consolas,monospace; font-size:0.82rem; color:#a8f0c0; margin:14px 0; }
  .cta-box { margin-top:56px; background:linear-gradient(140deg, rgba(74,222,128,0.09), rgba(96,165,250,0.06)); border:1px solid rgba(74,222,128,0.35); border-radius:16px; padding:28px; }
  .cta-box h2 { font-size:1.25rem; }
  .cta-box ul { margin:16px 0 20px 20px; color:#c7cbda; font-size:0.9rem; }
  .cta-box li { margin:6px 0; }
  .price-row { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .price { font-size:1.8rem; font-weight:800; color:var(--acc); }
  .cta { display:inline-block; background:var(--acc); color:#08210f; font-weight:700; padding:12px 24px; border-radius:9px; text-decoration:none; }
  .cta-note { color:var(--muted); font-size:0.78rem; margin-top:10px; }
  footer { margin-top:60px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:0.82rem; }
</style></head>
<body>
<nav>
  <a class="logo" href="/">${MARK_SVG}tool<span>rail</span></a>
  ${langSwitcherHtml(lang, "/guia")}
  <a class="buy" href="#comprar">${esc(priceUsd)}</a>
</nav>
<main>
  <div class="kicker">${esc(L.kicker)}</div>
  <h1>${esc(L.title)}</h1>
  <p class="subtitle">${esc(L.subtitle)}</p>
  <div class="toc">${toc}</div>
  ${body}

  <section class="gsec" id="checklist-preview">
    <h2>${esc(L.checklistHeading)}</h2>
    <ul>${checklistPreview}</ul>
  </section>

  <div class="cta-box" id="comprar">
    <h2>${esc(L.ctaHeading)}</h2>
    <p style="color:#c7cbda">${esc(L.ctaBody)}</p>
    <ul>${ctaBullets}</ul>
    <div class="price-row"><span class="price">${esc(priceUsd)} USDC</span><a class="cta" href="/guia/pdf?lang=${esc(lang)}">${esc(L.ctaButton)}</a></div>
    <p class="cta-note">${esc(L.ctaNote)}</p>
  </div>

  <footer>Toolrail · <a href="/">toolrail.dev</a> · ${esc(L.footer)}</footer>
</main></body></html>`;
}

export function guidePdfHtml(lang = DEFAULT_LANG) {
  const L = GUIDE_LANGS[lang] || GUIDE_LANGS[DEFAULT_LANG];
  const body = L.sections.map(s => sectionHtml(s)).join("");
  const checklist = L.checklist.map(c => `<div class="cki"><span class="ckbox">☐</span> ${esc(c)}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(L.title)}</title><style>
    * { box-sizing:border-box; margin:0; }
    body { font-family:'Segoe UI', Arial, sans-serif; color:#16181f; font-size:12.5px; padding:0; }
    .cover { padding:120px 60px; page-break-after:always; }
    .cover .kicker { color:#16a34a; font-weight:700; letter-spacing:2px; font-size:11px; }
    .cover h1 { font-size:34px; letter-spacing:-1px; margin:14px 0 10px; }
    .cover p { color:#555; font-size:14px; max-width:420px; }
    .cover .brand { position:absolute; bottom:60px; color:#888; font-size:11px; }
    main { padding:50px 56px; }
    h2 { font-size:16px; margin:28px 0 10px; color:#0f172a; border-bottom:2px solid #16a34a; padding-bottom:6px; }
    p { margin:8px 0; line-height:1.55; color:#222; }
    ul { margin:8px 0 8px 20px; } li { margin:5px 0; }
    pre { background:#0c0f16; color:#a8f0c0; padding:14px 16px; border-radius:8px; font-size:10.5px; overflow-x:auto; font-family:Consolas,monospace; white-space:pre-wrap; }
    .checklist { padding:50px 56px; page-break-before:always; }
    .checklist h2 { border:none; font-size:20px; }
    .cki { padding:10px 0; border-bottom:1px solid #eee; font-size:12.5px; }
    .ckbox { margin-right:8px; }
    footer { padding:20px 56px; color:#999; font-size:9.5px; border-top:1px solid #eee; }
  </style></head><body>
    <div class="cover">
      <div class="kicker">TOOLRAIL${lang !== "es" ? " PRESENTS" : " PRESENTA"}</div>
      <h1>${esc(L.title)}</h1>
      <p>${esc(L.subtitle)}</p>
      <div class="brand">toolrail.dev</div>
    </div>
    <main>${body}</main>
    <div class="checklist"><h2>${esc(L.checklistHeading)}</h2>${checklist}</div>
    <footer>${esc(L.footer)} · toolrail.dev</footer>
  </body></html>`;
}
