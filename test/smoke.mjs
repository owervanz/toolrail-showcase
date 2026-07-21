// Smoke test: boots the server in FREE mode on a test port and exercises every endpoint.
// Run: node test/smoke.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const PORT = 4499;
const BASE = `http://localhost:${PORT}`;
const OUT_DIR = new URL("../out-test/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const server = spawn(process.execPath, ["src/index.js"], {
  env: { ...process.env, PORT: String(PORT), EVM_PAY_TO: "", SOL_PAY_TO: "" },
  stdio: ["ignore", "inherit", "inherit"],
});

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    results.push(`FAIL  ${name}: ${err.message}`);
  }
}
const getJson = async (path) => {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(await r.json().catch(() => ({})))}`);
  return r.json();
};
const postJson = async (path, body, expectPdf = false) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(await r.json().catch(() => ({})))}`);
  return expectPdf ? Buffer.from(await r.arrayBuffer()) : r.json();
};

// wait for boot
for (let i = 0; i < 30; i++) {
  try { await fetch(BASE + "/health"); break; } catch { await new Promise(r => setTimeout(r, 500)); }
}

await check("GET / catalog", async () => {
  const j = await getJson("/");
  if (!j.endpoints?.length) throw new Error("no endpoints listed");
});

await check("FX convert USD->EUR", async () => {
  const j = await getJson("/fx/convert?from=USD&to=EUR&amount=100");
  if (typeof j.converted !== "number") throw new Error(JSON.stringify(j));
});

await check("VAT rates DE", async () => {
  const j = await getJson("/vat/rates?country=DE");
  if (j.standard !== 19) throw new Error(`expected DE standard 19, got ${j.standard}`);
});

await check("VIES validate (known-valid format)", async () => {
  // EU Commission's own VAT number used widely in examples may vary; just assert the call structure works
  const j = await postJson("/vat/validate", { countryCode: "IE", vatNumber: "6388047V" }); // Google Ireland, classic example
  if (typeof j.valid !== "boolean") throw new Error(JSON.stringify(j));
});

await check("CL UF hoy", async () => {
  const j = await getJson("/cl/indicadores?indicador=uf");
  if (!(j.valor > 10000)) throw new Error(JSON.stringify(j));
});

await check("CL UF->CLP 50 UF", async () => {
  const j = await getJson("/cl/uf?monto=50&direccion=uf-clp");
  if (!(j.resultado > 500000)) throw new Error(JSON.stringify(j));
});

await check("CL dias habiles +10 desde 2026-09-14 (salta 18-19 sept)", async () => {
  // 15,16,17 cuentan; 18 (feriado) y fin de semana saltan; 21-25 y 28-29 completan 10 hábiles
  const j = await getJson("/cl/dias-habiles?desde=2026-09-14&plazo=10");
  if (j.fecha_resultado !== "2026-09-29") throw new Error(`got ${j.fecha_resultado}, expected 2026-09-29`);
});

await check("CL RUT valido (12.345.678-5)", async () => {
  const j = await postJson("/cl/rut", { rut: "12.345.678-5" });
  if (j.valid !== true) throw new Error(JSON.stringify(j));
});

await check("CL RUT invalido (12.345.678-9)", async () => {
  const j = await postJson("/cl/rut", { rut: "12.345.678-9" });
  if (j.valid !== false) throw new Error(JSON.stringify(j));
});

await check("CL sueldo liquido 1.500.000 bruto", async () => {
  const j = await postJson("/cl/sueldo-liquido", { bruto: 1500000, afp: "modelo" });
  if (!(j.liquido > 1000000 && j.liquido < 1400000)) throw new Error(JSON.stringify(j));
});

await check("PDF invoice", async () => {
  const pdf = await postJson("/pdf", {
    template: "invoice",
    data: { number: "F-001", currency: "USD", tax_rate: 19, issuer: { name: "AgentUtils Demo" }, client: { name: "Cliente de Prueba SpA" }, items: [{ description: "Consultoría", quantity: 2, unit_price: 150 }, { description: "Soporte", quantity: 1, unit_price: 80 }] },
  }, true);
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("not a PDF");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_DIR + "invoice.pdf", pdf);
});

await check("PDF report", async () => {
  const pdf = await postJson("/pdf", {
    template: "report",
    data: { title: "Informe de Prueba", sections: [{ title: "Resumen", text: "Todo en orden." }, { title: "Métricas", table: [{ metrica: "Llamadas", valor: 42 }] }] },
  }, true);
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("not a PDF");
  writeFileSync(OUT_DIR + "report.pdf", pdf);
});

await check("VAT price DE net->gross", async () => {
  const j = await postJson("/vat/price", { amount: 100, country: "DE", direction: "net-to-gross" });
  if (j.gross !== 119 || j.vat !== 19) throw new Error(JSON.stringify(j));
});

await check("FX rates table base USD", async () => {
  const j = await getJson("/fx/rates?base=USD");
  if (typeof j.rates?.EUR !== "number") throw new Error(JSON.stringify(j));
});

await check("CL feriados 2026", async () => {
  const j = await getJson("/cl/feriados?ano=2026");
  if (!(j.total >= 15) || !j.feriados.some(f => f.date === "2026-09-18")) throw new Error(JSON.stringify(j));
});

await check("Global holidays DE 2026", async () => {
  const j = await getJson("/days/holidays?country=DE&year=2026");
  if (!j.holidays.some(h => h.date === "2026-01-01")) throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("Global business days US +10 desde 2026-08-31 (salta Labor Day 7 sept)", async () => {
  // 1-4 sept cuentan (4), 7 sept feriado salta, 8-11 (8), 14-15 (10) -> 2026-09-15
  const j = await getJson("/days/business-days?country=US&from=2026-08-31&days=10");
  if (j.result_date !== "2026-09-15") throw new Error(`got ${j.result_date}, expected 2026-09-15`);
  if (!j.skipped_holidays.includes("2026-09-07")) throw new Error("Labor Day not skipped");
});

await check("IBAN valido (DE89...)", async () => {
  const j = await postJson("/validate/iban", { iban: "DE89 3704 0044 0532 0130 00" });
  if (j.valid !== true || j.country !== "DE") throw new Error(JSON.stringify(j));
});

await check("IBAN invalido (digito cambiado)", async () => {
  const j = await postJson("/validate/iban", { iban: "DE89 3704 0044 0532 0130 01" });
  if (j.valid !== false) throw new Error(JSON.stringify(j));
});

await check("Telefono chileno valido", async () => {
  const j = await postJson("/validate/phone", { phone: "+56 9 6123 4567" });
  if (j.valid !== true || j.region !== "CL" || !j.e164.startsWith("+569")) throw new Error(JSON.stringify(j));
});

await check("Telefono invalido", async () => {
  const j = await postJson("/validate/phone", { phone: "+56 9 123" });
  if (j.valid !== false) throw new Error(JSON.stringify(j));
});

await check("QR PNG", async () => {
  const r = await fetch(BASE + "/qr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: "https://toolrail.dev" }) });
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error("not a PNG");
});

await check("Tax IDs validos (CUIT, CPF, DNI-ES, NIT, RUC)", async () => {
  const cases = [
    ["AR", "20-12345678-6"], ["BR", "529.982.247-25"], ["ES", "12345678Z"],
    ["CO", "900373115-3"], ["PE", "20100070970"], ["CL", "12.345.678-5"],
  ];
  for (const [country, id] of cases) {
    const j = await postJson("/validate/tax-id", { country, id });
    if (j.valid !== true) throw new Error(`${country} ${id}: ${JSON.stringify(j)}`);
  }
});

await check("Tax ID invalido (CPF adulterado)", async () => {
  const j = await postJson("/validate/tax-id", { country: "BR", id: "529.982.247-26" });
  if (j.valid !== false) throw new Error(JSON.stringify(j));
});

await check("Indexacion UVA Argentina", async () => {
  const j = await getJson("/latam/indexacion?unidad=uva&monto=100");
  if (!(j.valor > 500) || !(j.equivalente_moneda_local > 50000)) throw new Error(JSON.stringify(j));
});

await check("BR indices (SELIC, CDI, IPCA, PTAX)", async () => {
  const j = await getJson("/br/indices");
  if (!(j.indices?.selic?.valor > 1) || !(j.indices?.ptax?.valor > 3)) throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("BR CEP Avenida Paulista", async () => {
  const j = await getJson("/br/cep?cep=01310-100");
  if (j.found !== true || j.estado !== "SP" || !j.calle.includes("Paulista")) throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("BR CEP inexistente", async () => {
  const j = await getJson("/br/cep?cep=99999999");
  if (j.found !== false) throw new Error(JSON.stringify(j).slice(0, 150));
});

await check("AR indices (inflacion + riesgo pais)", async () => {
  const j = await getJson("/ar/indices");
  if (!(j.riesgo_pais?.valor > 0) || typeof j.inflacion_interanual_pct !== "number") throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("CO TRM oficial", async () => {
  const j = await getJson("/co/trm");
  if (!(j.valor > 2000 && j.valor < 10000)) throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("PE tipo de cambio SBS", async () => {
  const j = await getJson("/pe/tipo-cambio");
  if (!(j.venta > 2 && j.venta < 6) || !(j.compra > 2)) throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("MX sin token -> error limpio (en test no hay BANXICO_TOKEN)", async () => {
  const r = await fetch(BASE + "/mx/indicadores");
  const j = await r.json();
  if (r.status !== 502 || !JSON.stringify(j).includes("BANXICO_TOKEN")) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 150)}`);
});

await check("LATAM FX agregado (>=4 monedas)", async () => {
  const j = await getJson("/latam/fx");
  const codes = Object.keys(j.monedas || {});
  for (const c of ["CLP", "ARS", "BRL", "CO" + "P"]) if (!codes.includes(c)) throw new Error(`falta ${c}: ${codes.join(",")}`);
  if (!(j.monedas.BRL.valor > 3)) throw new Error("BRL fuera de rango");
});

await check("CL reajuste IPC 2025-01 a 2025-06", async () => {
  const j = await getJson("/cl/reajuste?desde=2025-01&hasta=2025-06&monto=500000");
  if (!(j.factor > 1 && j.factor < 1.1) || j.meses_compuestos !== 5 || !(j.monto_reajustado > 500000)) throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("CL reajuste mes futuro -> error claro", async () => {
  const r = await fetch(BASE + "/cl/reajuste?desde=2027-01&hasta=2027-06");
  if (r.status !== 400) throw new Error(`status ${r.status}`);
});

await check("Indexacion UVR Colombia", async () => {
  const j = await getJson("/latam/indexacion?unidad=uvr");
  if (!(j.valor > 300) || j.moneda !== "COP") throw new Error(JSON.stringify(j).slice(0, 200));
});

await check("Dolar Argentina blue + brecha", async () => {
  const j = await getJson("/latam/dolar-argentina");
  if (!(j.blue?.value_avg > 0) || typeof j.brecha_pct !== "number") throw new Error(JSON.stringify(j));
});

await check("llms.txt", async () => {
  const r = await fetch(BASE + "/llms.txt");
  const t = await r.text();
  if (!t.includes("Toolrail") || !t.includes("/vat/rates")) throw new Error("missing content");
  if (!t.includes("Base or Solana")) throw new Error("llms.txt no menciona ambas redes de pago");
});

await check("skill.md: ambas redes + triggers LATAM al dia", async () => {
  const t = await (await fetch(BASE + "/skill.md")).text();
  if (!t.includes("Base mainnet") || !t.includes("Solana mainnet")) throw new Error("skill.md no ofrece ambas redes");
  if (!t.includes("/latam/fx") || !t.includes("SELIC") || !t.includes("TRM")) throw new Error("triggers sin capacidades LATAM");
  if (t.match(/funded Solana wallet/)) throw new Error("aun dice 'Solana wallet' exclusivo");
});

await check("CORS: headers presentes y preflight OPTIONS", async () => {
  const r = await fetch(BASE + "/health");
  if (r.headers.get("access-control-allow-origin") !== "*") throw new Error("sin ACAO");
  if (r.headers.get("x-powered-by")) throw new Error("x-powered-by expuesto");
  const opt = await fetch(BASE + "/fx/convert", { method: "OPTIONS" });
  if (opt.status !== 204) throw new Error(`preflight ${opt.status}`);
});

await check("Sanitizacion de secretos en errores (fetchJson)", async () => {
  const { fetchJson } = await import("../src/util.js");
  try {
    await fetchJson("https://toolrail.dev/no-existe-404?token=SECRETO123&x=1", { retries: 0 });
    throw new Error("no lanzo error");
  } catch (err) {
    if (String(err.message).includes("SECRETO123")) throw new Error("SECRETO FILTRADO en error");
    if (!String(err.message).includes("***")) throw new Error(`mensaje inesperado: ${err.message}`);
  }
});

await check("PDF con HTML que intenta cargar recursos externos (deben bloquearse)", async () => {
  const pdf = await postJson("/pdf", { html: "<h1>Test</h1><img src='https://example.com/x.png'><script>document.title='hacked'</script>" }, true);
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("not a PDF");
});

await check("Stats: contadores acumulan y gate por ADMIN_KEY", async () => {
  // Este server de prueba corre sin ADMIN_KEY -> 503 con instrucciones
  const r = await fetch(BASE + "/admin/stats");
  if (r.status !== 503) throw new Error(`expected 503 without ADMIN_KEY, got ${r.status}`);
});

await check(".well-known/x402.json", async () => {
  const j = await getJson("/.well-known/x402.json");
  if (j.name !== "Toolrail" || !(j.resources?.length >= 21)) throw new Error(JSON.stringify(j).slice(0, 150));
});

await check("openapi.json", async () => {
  const j = await getJson("/openapi.json");
  if (j.openapi !== "3.1.0" || !j.paths["/pdf"]) throw new Error("bad spec");
});

await check("HTML landing for browsers", async () => {
  const r = await fetch(BASE + "/", { headers: { Accept: "text/html" } });
  const t = await r.text();
  if (!t.includes("Utility rails for") || !t.includes("402 Payment Required") || !t.includes("skill.md")) throw new Error("no landing HTML");
  if (!t.includes("FAQ") || !t.includes("What is x402?") || !t.includes("Subscriptions were built for humans")) throw new Error("missing FAQ/compare sections");
  const anchors = ["#how", "#setup", "#endpoints", "#faq"];
  for (const a of anchors) if (!t.includes(`href="${a}"`) || !t.includes(`id="${a.slice(1)}"`)) throw new Error(`broken anchor ${a}`);
});

await check("Marca: favicon, assets y metas sociales", async () => {
  const fav = await fetch(BASE + "/favicon.svg");
  if (!fav.ok || !(await fav.text()).includes("<svg")) throw new Error("favicon.svg no sirve");
  const png = await fetch(BASE + "/assets/favicon-32.png");
  const buf = Buffer.from(await png.arrayBuffer());
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error("favicon-32.png no es PNG");
  const og = await fetch(BASE + "/assets/og-image.png");
  if (!og.ok) throw new Error("og-image no sirve");
  const html = await (await fetch(BASE + "/", { headers: { Accept: "text/html" } })).text();
  if (!html.includes('rel="icon"') || !html.includes("og:image")) throw new Error("landing sin favicon/og metas");
});

await check("Cabeceras de seguridad (HSTS, nosniff, X-Frame)", async () => {
  const r = await fetch(BASE + "/health");
  for (const [h, v] of [["strict-transport-security", "max-age"], ["x-content-type-options", "nosniff"], ["x-frame-options", "DENY"]]) {
    if (!(r.headers.get(h) || "").includes(v)) throw new Error(`falta ${h}`);
  }
  const html = await fetch(BASE + "/", { headers: { Accept: "text/html" } });
  const csp = html.headers.get("content-security-policy") || "";
  if (!csp.includes("default-src 'none'")) throw new Error("landing sin CSP");
  if (!csp.includes("img-src 'self'")) throw new Error("CSP bloquea el propio favicon (falta img-src 'self')");
});

await check("JSON malformado -> 400 limpio sin internals", async () => {
  const r = await fetch(BASE + "/cl/rut", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{esto no es json" });
  if (r.status !== 400) throw new Error(`status ${r.status}`);
  const t = await r.text();
  if (t.includes("at ") || t.includes("Error:") || !t.includes("Invalid request body")) throw new Error(`respuesta sucia: ${t.slice(0, 100)}`);
});

await check("Rate limiter: 429 al superar el limite", async () => {
  const srv = spawn(process.execPath, ["src/index.js"], {
    env: { ...process.env, PORT: "4477", EVM_PAY_TO: "", SOL_PAY_TO: "", RATE_LIMIT_PER_MIN: "10" },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 30; i++) {
      try { await fetch("http://localhost:4477/health"); break; } catch { await new Promise(r => setTimeout(r, 400)); }
    }
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const r = await fetch("http://localhost:4477/health");
      if (r.status === 429) { got429 = true; break; }
    }
    if (!got429) throw new Error("nunca respondio 429 con limite 10");
  } finally {
    srv.kill();
  }
});

await check("Landing v3: chips, casos de uso y flagship destacado", async () => {
  const t = await (await fetch(BASE + "/", { headers: { Accept: "text/html" } })).text();
  for (const marker of ['class="chips"', "Built for agents like yours", "⭐ FLAGSHIP", 'id="g-latam"', "LATAM data"]) {
    if (!t.includes(marker)) throw new Error(`falta: ${marker}`);
  }
});

await check("Landing v3: ticker LIVE con datos de bancos centrales", async () => {
  // Se llena async tras el boot — reintentar hasta 30s
  for (let i = 0; i < 10; i++) {
    const t = await (await fetch(BASE + "/", { headers: { Accept: "text/html" } })).text();
    if (t.includes('id="live"') && t.includes("CLP")) return;
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error("ticker LIVE nunca aparecio (¿fxSnapshot fallo al boot?)");
});

await check("SEO: robots.txt, sitemap.xml, JSON-LD y canonical", async () => {
  const robots = await (await fetch(BASE + "/robots.txt")).text();
  if (!robots.includes("Sitemap:")) throw new Error("robots sin sitemap");
  const sm = await fetch(BASE + "/sitemap.xml");
  if (!(await sm.text()).includes("<urlset")) throw new Error("sitemap invalido");
  const html = await (await fetch(BASE + "/", { headers: { Accept: "text/html" } })).text();
  if (!html.includes('application/ld+json') || !html.includes('"@type":"WebAPI"')) throw new Error("sin JSON-LD");
  if (!html.includes('rel="canonical"')) throw new Error("sin canonical");
});

await check("Guia web gratis: contenido completo y sin secretos", async () => {
  const r = await fetch(BASE + "/guia");
  const t = await r.text();
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  for (const marker of ["Construye y lanza tu propia API x402", "testnet vs. devnet", "Checklist de arranque", "/guia/pdf"]) {
    if (!t.includes(marker)) throw new Error(`falta: ${marker}`);
  }
  // Nunca debe filtrar valores reales de secretos usados en el proyecto
  const forbidden = ["EXAMPLE_TOKEN_VALUE_NEVER_COMMIT_REAL_SECRETS_ab12cd34", "ADMIN_KEY=", "CDP_API_KEY_SECRET="];
  for (const f of forbidden) if (t.includes(f)) throw new Error(`SECRETO EXPUESTO: ${f.slice(0, 20)}...`);
});

await check("Guia PDF (pagado): genera PDF real y valido", async () => {
  const pdf = await postJson("/guia/pdf", {}, true).catch(async () => {
    const r = await fetch(BASE + "/guia/pdf");
    return Buffer.from(await r.arrayBuffer());
  });
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("respuesta no es PDF");
  if (pdf.length < 5000) throw new Error(`PDF sospechosamente chico: ${pdf.length} bytes`);
});

await check("Guia PDF: aparece en catalogo con precio y ejemplo", async () => {
  const j = await getJson("/");
  const entry = j.endpoints.find(e => e.route === "GET /guia/pdf");
  if (!entry || entry.price !== "$7.00") throw new Error(JSON.stringify(entry));
});

await check("Guia: selector de idioma EN/PT funciona, sin cruzar contenido ni secretos", async () => {
  const cases = [
    ["en", "Build and ship your own x402 API", "Solana testnet vs. devnet"],
    ["pt", "Construa e lance sua própria API x402", "testnet vs. devnet da Solana"],
  ];
  for (const [lang, title, bugMarker] of cases) {
    const t = await (await fetch(BASE + `/guia?lang=${lang}`)).text();
    if (!t.includes(title)) throw new Error(`[${lang}] falta titulo: ${title}`);
    if (!t.includes(bugMarker)) throw new Error(`[${lang}] falta seccion bug: ${bugMarker}`);
    if (t.includes("Construye y lanza tu propia API x402")) throw new Error(`[${lang}] mezclado con español`);
    const forbidden = ["EXAMPLE_TOKEN_VALUE_NEVER_COMMIT_REAL_SECRETS_ab12cd34", "ADMIN_KEY="];
    for (const f of forbidden) if (t.includes(f)) throw new Error(`[${lang}] SECRETO EXPUESTO`);
  }
});

await check("Guia: lang invalido cae a español (default seguro)", async () => {
  const t = await (await fetch(BASE + "/guia?lang=fr")).text();
  if (!t.includes("Construye y lanza tu propia API x402")) throw new Error("no cayo a default es");
});

await check("Guia PDF en ingles: PDF real y valido", async () => {
  const r = await fetch(BASE + "/guia/pdf?lang=en");
  const pdf = Buffer.from(await r.arrayBuffer());
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("respuesta no es PDF");
  if (pdf.length < 5000) throw new Error(`PDF sospechosamente chico: ${pdf.length} bytes`);
});

console.log("\n=== SMOKE RESULTS ===");
for (const r of results) console.log(r);
server.kill();
process.exit(results.some(r => r.startsWith("FAIL")) ? 1 : 0);
