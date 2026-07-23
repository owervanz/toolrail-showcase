// Human-facing landing page + llms.txt + skill.md + minimal OpenAPI, all generated
// from the same CATALOG so docs never drift from reality.
// Visual language modeled on the leading x402 services (twit.sh, StableEnrich):
// sticky nav, hero with stats, literal 402 flow, tooling comparison, grouped
// endpoint reference, pasteable agent setup, FAQ.

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Compact brand mark for inline use (navbar/footer) — no filters, crisp at 20px.
const MARK_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#4ade80" stroke-width="8" stroke-linecap="round" fill="none"><path d="M47.5 16 L24 84"/><path d="M52.5 16 L76 84"/><path d="M39 42 L61 42"/><path d="M33 60 L67 60"/><path d="M26 78 L74 78"/></g></svg>`;

const GROUPS = [
  { prefixes: ["/latam", "/br", "/ar", "/co", "/pe", "/mx"], id: "latam", icon: "🌎", name: "LATAM data", blurb: "Official FX, rates and indices for the 6 big economies — a 650M-person region the global datasets ignore" },
  { prefixes: ["/pdf"], id: "documents", icon: "📄", name: "Documents", blurb: "Print-ready PDFs from JSON or HTML" },
  { prefixes: ["/days"], id: "calendar", icon: "📅", name: "Global calendar", blurb: "Public holidays & business-day math for 187 countries" },
  { prefixes: ["/vat"], id: "vat", icon: "🇪🇺", name: "EU VAT", blurb: "Rates, validation and price math for 44 countries" },
  { prefixes: ["/fx"], id: "currencies", icon: "💱", name: "Currencies", blurb: "Official ECB reference rates since 1999" },
  { prefixes: ["/validate"], id: "validation", icon: "✅", name: "Validation", blurb: "IBANs, phone numbers, and tax IDs for LATAM + Spain" },
  { prefixes: ["/qr"], id: "qr", icon: "🔳", name: "QR codes", blurb: "PNG or SVG, one call" },
  { prefixes: ["/cl"], id: "chile", icon: "🇨🇱", name: "Chile deep-dive", blurb: "UF, IPC adjustment, business days, RUT, payroll — depth no one else serves" },
  { prefixes: ["/guia"], id: "guide", icon: "📘", name: "Learn (Spanish)", blurb: "Build your own x402 API — a real-world walkthrough with the bugs we actually hit" },
];

const USE_CASES = [
  { icon: "🛒", title: "Commerce & payment agents", text: "Validate a counterparty's tax ID (7 countries), fetch the legal FX rate, compute VAT, and issue the invoice as a PDF — all mid-flow, paying cents per step." },
  { icon: "🗂️", title: "Back-office agents", text: "Deadline math over real business days in 187 countries, IBAN checks before payouts, phone normalization for CRMs — the boring rails every workflow needs." },
  { icon: "📈", title: "LATAM fintech agents", text: "The blue-dollar gap, central-bank indexed units (UF · UVA · UVR · UDI), SELIC and TRM — official data nobody else serves the agent economy." },
];

const FAQ = [
  ["What is x402?",
   "An open payment standard built on the HTTP 402 status code, created by Coinbase and now governed by the x402 Foundation (Google, Visa, AWS and 40+ members). APIs price each call; agents pay in stablecoins automatically, with no accounts and no human in the loop."],
  ["Do I need an account or API key?",
   "No. Payment is the authentication. Call an endpoint, pay the quoted amount, receive the resource. Nothing to sign up for, nothing to rotate, nothing to leak."],
  ["How do agents pay?",
   "In USDC, on Base or Solana mainnet — every 402 response offers both and the payer picks. x402 client libraries handle the whole loop (call, pay, retry) automatically, and gas is sponsored by the facilitator: the paying wallet only needs USDC."],
  ["Can I try it without paying?",
   "Yes. Calling any paid endpoint without payment returns its price quote (the 402 challenge) for free, and the catalog (GET /), PDF template schemas (/pdf/templates), OpenAPI spec and llms.txt are all free."],
  ["What does a call cost?",
   "Between $0.002 and $0.015 per call depending on the endpoint. No minimums, no subscriptions, no expiring credits — $0.00 when you don't use it."],
  ["Do I pay if a call fails?",
   "No. Settlement happens only after the API successfully returns your resource. Server errors are not charged."],
  ["Where does the data come from?",
   "Primary official sources only: European Commission TEDB and VIES, European Central Bank, Nager.Date public-holiday dataset, Banco Central de Chile / CMF, MINSAL, plus statutory tables we maintain (Chilean tax brackets are defined in UTM, so they self-track the monthly UTM value). Every data response names its source."],
  ["Can humans use it too?",
   "Sure — any x402-enabled client or wallet works, and browsers hitting a paid endpoint get a paywall page. But the API is designed agent-first: machine-readable everything."],
];

export function landingHtml(catalog, baseUrl, live = null, mcpToolCount = 27) {
  const groupsHtml = GROUPS.map(g => {
    const items = catalog.filter(e => g.prefixes.some(p => e.route.split(" ")[1].startsWith(p)));
    if (!items.length) return "";
    const rows = items.map(e => {
      const [method, path] = e.route.split(" ");
      const featured = path === "/latam/fx";
      return `
      <div class="ep${featured ? " featured" : ""}">
        <div class="ep-line">
          ${featured ? `<span class="star">⭐ FLAGSHIP</span>` : ""}
          <span class="method ${method === "GET" ? "get" : "post"}">${method}</span>
          <code class="path">${esc(path)}</code>
          <span class="usdc">${esc(e.price.replace("$", ""))} USDC</span>
        </div>
        <p>${esc(e.description)}</p>
        <details><summary>example</summary><pre>${esc(e.example)}</pre></details>
      </div>`;
    }).join("");
    return `<section class="group" id="g-${g.id}"><h3>${g.icon} ${esc(g.name)}</h3><p class="blurb">${esc(g.blurb)}</p>${rows}</section>`;
  }).join("");

  const chipsHtml = GROUPS.map(g => `<a class="chip" href="#g-${g.id}">${g.icon} ${esc(g.name)}</a>`).join("");

  const casesHtml = USE_CASES.map(c => `
    <div class="case"><div class="case-icon">${c.icon}</div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`).join("");

  // Live FX ticker: exchange-style scrolling marquee of real central-bank data.
  // Server-rendered, CSS-only animation (no JS, scriptless CSP intact).
  let tickerHtml = "";
  const fx = live?.fx;
  if (fx && Object.keys(fx).length >= 3) {
    const items = [];
    const tk = (flag, pair, val, src, extraHtml = "") =>
      `<span class="tk">${flag} <b>${pair}</b> <span class="tk-val">${esc(val)}</span>${extraHtml} <span class="tk-src">${src}</span></span>`;
    if (fx.CLP?.valor) items.push(tk("🇨🇱", "USD/CLP", fx.CLP.valor.toLocaleString("en-US"), "BCCh"));
    if (fx.ARS?.oficial) items.push(tk("🇦🇷", "USD/ARS", fx.ARS.oficial.toLocaleString("en-US"), "oficial"));
    if (fx.ARS?.blue) items.push(tk("🇦🇷", "USD/ARS", fx.ARS.blue.toLocaleString("en-US"), "blue",
      fx.ARS.brecha_pct != null ? ` <span class="tk-gap">+${Number(fx.ARS.brecha_pct)}%</span>` : ""));
    if (fx.BRL?.valor) items.push(tk("🇧🇷", "USD/BRL", fx.BRL.valor.toFixed(4), "PTAX"));
    if (fx.MXN?.valor) items.push(tk("🇲🇽", "USD/MXN", fx.MXN.valor.toFixed(4), "FIX"));
    if (fx.COP?.valor) items.push(tk("🇨🇴", "USD/COP", fx.COP.valor.toLocaleString("en-US"), "TRM"));
    if (fx.PEN?.valor) items.push(tk("🇵🇪", "USD/PEN", fx.PEN.valor.toFixed(3), "SBS"));
    const strip = items.join('<span class="tk-sep">·</span>');
    tickerHtml = `
  <div class="live" id="live">
    <div class="live-badge"><span class="live-dot"></span>LIVE</div>
    <div class="live-track"><div class="live-scroll"><span class="live-half">${strip}<span class="tk-sep">·</span></span><span class="live-half" aria-hidden="true">${strip}<span class="tk-sep">·</span></span></div></div>
  </div>
  <p class="live-caption">Official central-bank rates, served by <code>/latam/fx</code> — the endpoint is literally running on this page. Refreshes every 15 min.</p>`;
  }

  const faqHtml = FAQ.map(([q, a]) => `
    <details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Toolrail — utility rails for AI agents (x402)</title>
<meta name="description" content="21 pay-per-call endpoints for AI agents: PDFs, business days in 187 countries, EU VAT, ECB FX, IBAN/phone/tax-ID validation, QR codes, LATAM data. USDC on Base & Solana via x402. No API keys.">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#0a0c11">
<meta property="og:type" content="website">
<meta property="og:title" content="Toolrail — utility rails for AI agents">
<meta property="og:description" content="Pay-per-call API for agents: PDFs, global business days, EU VAT, FX, validation and LATAM data no one else serves. USDC on Base & Solana. No API keys.">
<meta property="og:url" content="${esc(baseUrl)}/">
<meta property="og:image" content="${esc(baseUrl)}/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(baseUrl)}/assets/og-image.png">
<link rel="canonical" href="${esc(baseUrl)}/">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebAPI",
  name: "Toolrail",
  url: baseUrl,
  description: "Pay-per-call utility API for AI agents: PDF generation, business days in 187 countries, EU VAT, official central-bank FX for all LATAM, tax-ID validation for 7 countries, QR codes and Chilean operational data. USDC on Base & Solana via the x402 protocol — no API keys.",
  documentation: `${baseUrl}/openapi.json`,
  provider: { "@type": "Organization", name: "Toolrail", url: baseUrl, logo: `${baseUrl}/assets/favicon-512.png` },
  offers: { "@type": "Offer", price: "0.002", priceCurrency: "USD", description: "Pay per call in USDC (x402 protocol, Base & Solana). No subscriptions." },
})}</script>
<style>
  :root { --bg:#0a0c11; --panel:#11141c; --panel2:#151926; --line:#232838; --fg:#eceef5; --muted:#8b93a7; --acc:#4ade80; --acc2:#60a5fa; --get:#4ade80; --post:#fbbf24; }
  * { box-sizing:border-box; margin:0; }
  html { scroll-behavior:smooth; }
  body { font-family:ui-sans-serif,system-ui,'Segoe UI',Arial,sans-serif; background:var(--bg); color:var(--fg); line-height:1.6; }
  .mono, code, pre, .method, .usdc, .badge, .stat b { font-family:ui-monospace,'Cascadia Code',Consolas,monospace; }
  a { color:var(--acc2); }
  /* nav */
  nav { position:sticky; top:0; z-index:10; backdrop-filter:blur(10px); background:rgba(10,12,17,0.82); border-bottom:1px solid var(--line); }
  .nav-in { max-width:980px; margin:0 auto; padding:12px 20px; display:flex; align-items:center; gap:22px; }
  .logo { font-weight:800; letter-spacing:-0.5px; color:var(--fg); text-decoration:none; font-size:1.05rem; display:flex; align-items:center; gap:8px; }
  .logo span { color:var(--acc); }
  .logo svg { width:21px; height:21px; }
  .nav-in a:not(.logo) { color:var(--muted); text-decoration:none; font-size:0.85rem; }
  .nav-in a:not(.logo):hover { color:var(--fg); }
  .nav-cta { margin-left:auto; border:1px solid var(--acc); border-radius:8px; padding:5px 14px; color:var(--acc) !important; font-weight:600; }
  main { max-width:980px; margin:0 auto; padding:64px 20px 90px; }
  /* hero */
  .badges { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px; }
  .badge { font-size:0.66rem; letter-spacing:1.4px; color:var(--acc); border:1px solid var(--line); border-radius:99px; padding:4px 12px; background:var(--panel); }
  h1 { font-size:clamp(2.2rem, 6vw, 3.3rem); letter-spacing:-1.5px; line-height:1.08; }
  h1 .grad { background:linear-gradient(90deg, var(--acc), var(--acc2)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .lead { color:var(--muted); font-size:1.1rem; margin:18px 0 8px; max-width:680px; }
  .lead b { color:var(--fg); font-weight:600; }
  .cta { display:inline-block; margin:18px 12px 0 0; background:var(--acc); color:#08210f; font-weight:700; padding:11px 24px; border-radius:9px; text-decoration:none; }
  .cta:hover { filter:brightness(1.1); }
  .cta.ghost { background:transparent; color:var(--acc); border:1px solid var(--acc); }
  .stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px,1fr)); gap:12px; margin-top:40px; }
  .stat { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .stat b { display:block; font-size:1.5rem; color:var(--acc); }
  .stat span { color:var(--muted); font-size:0.78rem; letter-spacing:0.5px; }
  h2 { font-size:0.95rem; margin:72px 0 16px; text-transform:uppercase; letter-spacing:2.4px; color:var(--acc2); }
  h2 + .sub { color:var(--muted); margin:-8px 0 16px; font-size:0.95rem; }
  /* 402 flow */
  .flow { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:22px; display:grid; gap:9px; font-size:0.83rem; }
  .flow .row { display:flex; gap:12px; align-items:baseline; }
  .flow .who { color:var(--muted); min-width:58px; text-align:right; font-size:0.68rem; letter-spacing:1px; }
  .flow .arrow { color:var(--acc); }
  .flow pre { background:#0c0f16; border:1px solid var(--line); border-radius:9px; padding:11px 13px; overflow-x:auto; flex:1; color:#c8cede; margin:0; font-size:0.8rem; }
  .flow .hl { color:var(--acc); }
  .flow .warn { color:var(--post); }
  .under { color:var(--muted); font-size:0.85rem; margin-top:10px; }
  /* compare */
  .compare { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:640px) { .compare { grid-template-columns:1fr; } }
  .col { border:1px solid var(--line); border-radius:14px; padding:20px; background:var(--panel); }
  .col.win { border-color:rgba(74,222,128,0.4); background:linear-gradient(160deg, rgba(74,222,128,0.06), var(--panel) 55%); }
  .col h3 { font-size:0.9rem; margin-bottom:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1.5px; }
  .col.win h3 { color:var(--acc); }
  .col ol { margin-left:18px; font-size:0.88rem; color:var(--muted); display:grid; gap:8px; }
  .col.win ol { color:var(--fg); }
  /* paste */
  .paste { background:linear-gradient(120deg, rgba(74,222,128,0.09), rgba(96,165,250,0.09)); border:1px solid var(--line); border-radius:14px; padding:20px 22px; }
  .paste label { font-size:0.66rem; letter-spacing:1.6px; color:var(--muted); }
  .paste pre { margin-top:10px; background:#0c0f16; border:1px solid var(--line); border-radius:9px; padding:13px 15px; color:var(--acc); overflow-x:auto; font-size:0.9rem; }
  .checks { display:flex; gap:18px; flex-wrap:wrap; margin-top:14px; font-size:0.82rem; color:var(--muted); }
  .checks span::before { content:"✓ "; color:var(--acc); }
  /* endpoints */
  .group { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px 24px; margin-top:16px; transition:border-color 0.2s; }
  .group:hover { border-color:#31384d; }
  .group h3 { font-size:1.05rem; }
  .blurb { color:var(--muted); font-size:0.85rem; margin-bottom:6px; }
  .ep { border-top:1px solid var(--line); padding:13px 0 7px; }
  .ep-line { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .method { font-size:0.66rem; font-weight:700; padding:2px 9px; border-radius:5px; letter-spacing:1px; }
  .method.get { color:var(--get); border:1px solid var(--get); }
  .method.post { color:var(--post); border:1px solid var(--post); }
  .path { font-size:0.9rem; color:var(--fg); background:transparent; }
  .usdc { margin-left:auto; color:var(--acc); font-size:0.8rem; }
  .ep p { color:var(--muted); font-size:0.85rem; margin:5px 0; }
  details summary { cursor:pointer; color:var(--acc2); font-size:0.75rem; user-select:none; }
  details pre { background:#0c0f16; border:1px solid var(--line); border-radius:9px; padding:11px 13px; overflow-x:auto; font-size:0.75rem; color:#c8cede; margin-top:6px; }
  /* faq */
  .faq { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px 20px; margin-top:10px; }
  .faq summary { font-size:0.95rem; color:var(--fg); font-weight:600; }
  .faq[open] { border-color:#31384d; }
  .faq p { color:var(--muted); font-size:0.9rem; margin-top:10px; }
  .sources { color:var(--muted); font-size:0.88rem; }
  footer { margin-top:70px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:0.82rem; }
  /* category chips */
  .chips { display:flex; gap:9px; flex-wrap:wrap; margin-top:22px; }
  .chip { font-size:0.78rem; color:var(--muted); border:1px solid var(--line); border-radius:99px; padding:6px 14px; text-decoration:none; background:var(--panel); transition:all 0.15s; }
  .chip:hover { color:var(--acc); border-color:var(--acc); }
  /* live ticker — exchange-style scrolling marquee, CSS only */
  .live { margin-top:34px; display:flex; align-items:stretch; overflow:hidden; border:1px solid rgba(74,222,128,0.35); border-radius:12px; background:linear-gradient(90deg, rgba(74,222,128,0.07), transparent 30%), var(--panel); }
  .live-badge { flex:none; display:flex; align-items:center; gap:8px; padding:13px 18px; color:var(--acc); font-family:ui-monospace,Consolas,monospace; font-size:0.7rem; font-weight:700; letter-spacing:2px; border-right:1px solid var(--line); }
  .live-dot { width:9px; height:9px; border-radius:50%; background:var(--acc); animation:pulse 1.6s infinite; flex:none; }
  @keyframes pulse { 0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(74,222,128,0.5);} 50% { opacity:0.6; box-shadow:0 0 0 6px rgba(74,222,128,0);} }
  .live-track { flex:1; overflow:hidden; display:flex; align-items:center; -webkit-mask-image:linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); mask-image:linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); }
  .live-scroll { display:flex; white-space:nowrap; animation:ticker 38s linear infinite; }
  .live:hover .live-scroll { animation-play-state:paused; }
  .live-half { display:inline-flex; align-items:center; }
  @keyframes ticker { to { transform:translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) { .live-scroll { animation:none; } .live-track { overflow-x:auto; } }
  .tk { font-family:ui-monospace,Consolas,monospace; font-size:0.84rem; color:var(--fg); padding:13px 0; }
  .tk b { color:var(--muted); font-weight:600; margin:0 5px 0 3px; }
  .tk-val { color:var(--acc); font-weight:700; }
  .tk-src { color:var(--muted); font-size:0.66rem; text-transform:uppercase; letter-spacing:1px; margin-left:4px; }
  .tk-gap { color:var(--post); font-size:0.72rem; }
  .tk-sep { color:var(--line); margin:0 18px; font-size:0.84rem; align-self:center; }
  .live-caption { color:var(--muted); font-size:0.72rem; margin-top:8px; }
  .live-caption code { background:var(--code, #0d1017); border-radius:4px; padding:1px 6px; font-size:0.72rem; color:var(--acc2); }
  /* use cases */
  .cases { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
  .case { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px; transition:border-color 0.2s; }
  .case:hover { border-color:#31384d; }
  .case-icon { font-size:1.6rem; }
  .case h3 { font-size:1rem; margin:8px 0 6px; }
  .case p { color:var(--muted); font-size:0.87rem; }
  /* flagship endpoint */
  .ep.featured { background:linear-gradient(140deg, rgba(74,222,128,0.07), transparent 60%); border:1px solid rgba(74,222,128,0.4); border-radius:12px; padding:14px 16px 8px; margin-top:10px; }
  .star { font-size:0.66rem; font-weight:700; color:#0a0c11; background:var(--acc); border-radius:5px; padding:2px 8px; letter-spacing:1px; }
</style></head>
<body>
<nav><div class="nav-in">
  <a class="logo" href="#top">${MARK_SVG}<span style="color:var(--fg)">tool<span style="color:var(--acc)">rail</span></span></a>
  <a href="#how">How it works</a>
  <a href="#setup">Setup</a>
  <a href="#endpoints">Endpoints</a>
  <a href="#faq">FAQ</a>
  <a href="/guia">📘 Guía (ES)</a>
  <a href="#mcp">MCP</a>
  <a class="nav-cta" href="${esc(baseUrl)}/skill.md">skill.md</a>
</div></nav>
<main id="top">
  <div class="badges"><span class="badge">NO SIGN-UP</span><span class="badge">NO API KEYS</span><span class="badge">PAY PER CALL · USDC</span><span class="badge">BASE + SOLANA</span></div>
  <h1>Utility rails for<br><span class="grad">autonomous agents</span>.</h1>
  <p class="lead">One HTTP call. From <b>$0.002 in USDC</b>. No accounts, no API keys — <b>ever</b>.<br>${catalog.length} utility endpoints for AI agents, including <b>the LATAM data layer no one else serves</b>.</p>
  <a class="cta" href="#endpoints">View endpoints</a><a class="cta ghost" href="${esc(baseUrl)}/skill.md">Agent skill</a>
  <div class="chips">${chipsHtml}</div>
  ${tickerHtml}
  <div class="stats">
    <div class="stat"><b>${catalog.length}</b><span>PAID ENDPOINTS</span></div>
    <div class="stat"><b>187</b><span>COUNTRIES COVERED</span></div>
    <div class="stat"><b>$0.002</b><span>STARTING PRICE / CALL</span></div>
    <div class="stat"><b>2</b><span>NETWORKS · BASE &amp; SOLANA</span></div>
  </div>

  <h2 id="how">One round-trip. No setup.</h2>
  <div class="flow">
    <div class="row"><span class="who">AGENT</span><span class="arrow">→</span><pre>GET /fx/convert?from=USD&amp;to=EUR&amp;amount=100</pre></div>
    <div class="row"><span class="who"></span><span class="arrow">←</span><pre><span class="warn">402 Payment Required</span>
{ "amount": <span class="hl">"0.007 USDC"</span>, "networks": ["base", "solana"], "payTo": "…" }</pre></div>
    <div class="row"><span class="who">AGENT</span><span class="arrow">→</span><pre>GET /fx/convert?…  <span class="hl">X-PAYMENT: &lt;signed payment&gt;</span></pre></div>
    <div class="row"><span class="who"></span><span class="arrow">←</span><pre><span class="hl">200 OK</span>  { "converted": 87.45, "source": "European Central Bank" }</pre></div>
  </div>
  <p class="under">USDC on Base or Solana mainnet — the payer picks · gas sponsored by the facilitator · settlement via Coinbase CDP · discoverable on the x402 Bazaar.</p>

  <h2>Subscriptions were built for humans</h2>
  <p class="sub">Agents need micropayments.</p>
  <div class="compare">
    <div class="col">
      <h3>Traditional API</h3>
      <ol><li>Create an account, verify email</li><li>Add a credit card, buy credits upfront</li><li>Store and rotate API keys</li><li>Monitor bills across providers</li><li>Unused credits expire</li></ol>
    </div>
    <div class="col win">
      <h3>Toolrail</h3>
      <ol><li>Call the endpoint</li><li>Pay $0.002–$0.015 for that call</li><li>Done — payment is the authentication</li><li>One on-chain ledger, real time</li><li>$0.00 when you don't use it</li></ol>
    </div>
  </div>

  <h2>Built for agents like yours</h2>
  <div class="cases">${casesHtml}</div>

  <h2 id="setup">Set up in one prompt</h2>
  <div class="paste">
    <label>PASTE THIS INTO YOUR AGENT — CLAUDE CODE, CURSOR, OR ANY X402-ENABLED AGENT</label>
    <pre>Set up ${esc(baseUrl)}/skill.md with x402</pre>
    <div class="checks"><span>Works with any AI agent</span><span>Payments handled automatically</span><span>No credentials to manage</span></div>
  </div>

  <h2 id="mcp">No wallet? Use MCP — free</h2>
  <div class="paste">
    <label>ADD TO CLAUDE CODE, CLAUDE DESKTOP, CURSOR, OR ANY MCP CLIENT</label>
    <pre>claude mcp add --transport http toolrail ${esc(baseUrl)}/mcp</pre>
    <div class="checks"><span>${mcpToolCount} tools, zero cost</span><span>No wallet needed</span><span>Rate-limited, same data</span></div>
  </div>
  <p class="under">The x402 API above is the unlimited, agent-native channel (USDC, per call). MCP is the free, rate-limited on-ramp for everyone else — same underlying tools, minus PDF/QR generation.</p>

  <h2 id="endpoints">Endpoints &amp; pricing</h2>
  ${groupsHtml}

  <h2>Sources</h2>
  <p class="sources"><a href="https://ec.europa.eu/taxation_customs/tedb/">European Commission TEDB</a> (VAT, refreshed daily) · <a href="https://ec.europa.eu/taxation_customs/vies/">EC VIES registry</a> · <a href="https://frankfurter.dev">European Central Bank reference rates</a> · <a href="https://date.nager.at">Nager.Date</a> public-holiday dataset · <a href="https://api.cmfchile.cl">CMF Chile</a> &amp; Banco Central de Chile · <a href="https://www.minsal.cl">MINSAL</a> · <a href="https://argentinadatos.com">ArgentinaDatos</a> (UVA) · <a href="https://www.bluelytics.com.ar">Bluelytics</a> (dólar Argentina) · <a href="https://www.banrep.gov.co">Banco de la República</a> (UVR Colombia) · <a href="https://www.banxico.org.mx">Banxico</a> (UDI México) · Chilean statutory tables maintained by us — tax brackets defined in UTM auto-track the monthly UTM value. Machine-readable: <a href="${esc(baseUrl)}/llms.txt">/llms.txt</a> · <a href="${esc(baseUrl)}/openapi.json">/openapi.json</a></p>

  <h2 id="faq">FAQ</h2>
  ${faqHtml}

  <footer style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="width:18px;height:18px;display:inline-flex">${MARK_SVG}</span> Toolrail · <a href="https://toolrail.dev">toolrail.dev</a> · Pay-per-call via the open <a href="https://x402.org">x402 standard</a> · Calculations are informative and do not constitute legal, tax or payroll advice.</footer>
</main></body></html>`;
}

export function llmsTxt(catalog, baseUrl, mcpToolCount = 27) {
  return `# Toolrail

> Pay-per-call utility API for AI agents via the x402 payment protocol (USDC on Base or Solana — every 402 offers both). No API keys, no subscriptions: call an endpoint, receive HTTP 402 with payment instructions, pay, retry, get the resource. Gas is sponsored by the facilitator.

Base URL: ${baseUrl}
Agent setup: fetch ${baseUrl}/skill.md and follow it.

## What it offers
- PDF generation from JSON templates (invoice, report, contract) or raw HTML
- Global calendar: public holidays and business-day math for 187 countries
- EU VAT: current rates for 44 European countries (EC TEDB, daily) + official VIES number validation + net/gross price calculator
- FX: ECB reference rates for 30+ currencies, current and historical since 1999
- Validation: IBAN (88 countries, ISO 13616), phone numbers (~240 regions), and tax IDs for LATAM + Spain (RUT, CUIT, CPF/CNPJ, RFC, RUC, NIT, NIF)
- LATAM: all-region official FX aggregator (CLP/ARS/BRL/MXN/COP/PEN in one call), inflation-indexed units (UF, UVA, UVR, UDI), Brazil rates (SELIC/CDI/IPCA/PTAX) and CEP lookup, Argentina inflation + country risk, Colombia TRM, Peru SBS rate, Mexico FIX + TIIE, Chilean IPC adjustment calculator
- QR code generation (PNG/SVG)
- Chile operational data: UF/UTM/dolar indicators, UF-CLP conversion, business-day math with official holidays, RUT validation, net salary calculation, on-duty pharmacies

## Endpoints (price per call in USD, paid in USDC)
${catalog.map(e => `- ${e.route} — ${e.price} — ${e.description}`).join("\n")}

## Free endpoints
- GET / — JSON catalog (or human landing page for browsers)
- GET /health — liveness
- GET /pdf/templates — PDF template schemas with examples
- GET /openapi.json — OpenAPI 3.1 description
- GET /skill.md — agent-readable setup instructions

## Example (no payment yet — returns 402 with payment requirements)
curl ${baseUrl}/fx/convert?from=USD&to=EUR&amount=100

No wallet? ${baseUrl}/mcp exposes ${mcpToolCount} of these tools for free via MCP (Streamable HTTP, rate-limited) — add with \`claude mcp add --transport http toolrail ${baseUrl}/mcp\`.
`;
}

export function skillMd(catalog, baseUrl, mcpToolCount = 27) {
  return `# Toolrail — agent skill

Toolrail is a pay-per-call utility API for AI agents. Payment uses the x402 protocol:
an unpaid request returns HTTP 402 with machine-readable payment requirements in the
\`PAYMENT-REQUIRED\` header (base64 JSON) — every 402 offers TWO payment options
(USDC on Base mainnet and USDC on Solana mainnet); pay either one with any x402
client, retry with the payment proof, and receive the resource. Gas is sponsored
by the facilitator — the paying wallet only needs USDC.

Base URL: ${baseUrl}

## No wallet? Use MCP instead (free, rate-limited)

${mcpToolCount} of the JSON-data tools below (everything except PDF/QR generation) are
also available for free over MCP (Streamable HTTP transport, no payment, subject to
the same per-IP rate limit as the rest of the site) — the lower-friction option for
Claude Code, Claude Desktop, Cursor, or any MCP-compatible client:

\`\`\`
claude mcp add --transport http toolrail ${baseUrl}/mcp
\`\`\`

For unlimited access and the binary endpoints (PDF, QR), use the x402 HTTP API below.

## Triggers

Use this skill when the user (or your task) needs to:

- Generate a PDF document: invoice, report, contract, or any HTML rendered to PDF
- Know public holidays or add business days to a date in any of 187 countries
- Get EU VAT rates, validate an EU VAT number, or compute net/gross prices with VAT
- Convert currencies or fetch official ECB exchange rates (current or historical)
- Validate or format an IBAN or a phone number from any country
- Generate a QR code image
- Get official LATAM exchange rates: all six major currencies vs USD in one call (/latam/fx), Argentina's blue-dollar gap, Colombia's legal TRM, Peru's SBS rate, Mexico's FIX
- Query LATAM macro data: Brazil's SELIC/CDI/IPCA, Argentina's inflation and country risk, inflation-indexed units (UF, UVA, UVR, UDI)
- Validate a tax ID from Chile, Argentina, Brazil, Mexico, Peru, Colombia or Spain; look up a Brazilian postal code (CEP)
- Adjust a Chilean amount by official IPC inflation between two months (reajuste)
- Work with Chilean data: UF/UTM values, UF-CLP conversion, business days with Chilean holidays, RUT validation, net salary ("sueldo liquido") calculation, on-duty pharmacies

## How to call (with an x402 client)

1. Install an x402-capable HTTP client (e.g. the official x402 SDKs: https://docs.x402.org).
2. Configure it with a wallet holding USDC on Base OR on Solana — both networks are accepted on every endpoint; the client picks whichever it supports.
3. Call any endpoint below; the client handles the 402 -> pay -> retry loop automatically.

Without a client, you can still inspect: \`curl ${baseUrl}/fx/convert?from=USD&to=EUR&amount=100 -i\`
returns the 402 challenge so you can see exactly what payment is required.

## Endpoints

${catalog.map(e => `### ${e.route} — ${e.price}
${e.description}
\`\`\`bash
${e.example}
\`\`\``).join("\n\n")}

## Free endpoints

- \`GET /\` — JSON catalog of all endpoints with prices
- \`GET /health\` — liveness probe
- \`GET /pdf/templates\` — full JSON schemas + examples for the PDF templates
- \`GET /openapi.json\` — OpenAPI 3.1 spec
- \`GET /llms.txt\` — plain-text service summary
- \`POST /mcp\` — free MCP server (see above)

## Notes for agents

- Responses are JSON except \`POST /pdf\` (application/pdf bytes) and \`POST /qr\` (image/png or image/svg+xml).
- Chilean money endpoints (\`/cl/*\`) use live official UF/UTM values; results include the source and value date.
- Calculations (VAT, net salary) are informative and not legal/tax advice.
`;
}

export function openapiSpec(catalog, baseUrl) {
  const paths = {};
  for (const e of catalog) {
    const [method, path] = e.route.split(" ");
    paths[path] = paths[path] || {};
    paths[path][method.toLowerCase()] = {
      summary: e.description.split(".")[0],
      description: `${e.description} Price: ${e.price} per call, paid in USDC via x402 (HTTP 402 flow).`,
      "x-price-usd": e.price,
      "x-payment-protocol": "x402",
      "x-example": e.example,
      responses: {
        200: { description: "Resource returned after settled payment" },
        402: { description: "Payment required — header PAYMENT-REQUIRED carries base64 x402 payment requirements" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Toolrail",
      version: "1.0.0",
      description: "Pay-per-call utility API for AI agents: PDF generation, global holidays/business days, EU VAT, ECB FX rates, IBAN/phone validation, QR codes, Chilean operational data. x402/USDC on Base & Solana.",
    },
    servers: [{ url: baseUrl }],
    paths,
  };
}
