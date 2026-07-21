// HTML -> PDF via puppeteer-core against a system Chrome/Chromium/Edge.
// One shared browser, one render at a time (queue) to stay inside small-container RAM.
// Memory flags per the standard headless-in-container playbook.

import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { config } from "./config.js";
import { TEMPLATES } from "./templates.js";
import { badRequest } from "./util.js";

const CHROME_CANDIDATES = [
  config.chromePath,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

let browserPromise = null;
let queue = Promise.resolve();

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error("No Chrome/Chromium/Edge found. Set PUPPETEER_EXECUTABLE_PATH.");
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"],
    }).then(b => {
      b.on("disconnected", () => { browserPromise = null; });
      return b;
    }).catch(err => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

export async function renderPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Hardened rendering: no scripts, no network. User-supplied HTML cannot
    // run JS in our (necessarily --no-sandbox) Chrome nor make our server
    // fetch external/internal resources (SSRF). Also makes renders faster.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", req => {
      if (req.url().startsWith("http")) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
  } finally {
    await page.close().catch(() => {});
  }
}

// Shared queue so any caller (the /pdf endpoint or other modules like the
// guide) renders one Chrome page at a time — keeps memory bounded.
export function renderPdfQueued(html) {
  const job = queue.then(() => renderPdf(html));
  queue = job.catch(() => {});
  return job;
}

export async function pdfEndpoint(req, res) {
  const { template, data, html } = req.body || {};
  let markup;
  if (html) {
    markup = String(html);
    if (markup.length > 500_000) return badRequest(res, "'html' too large (max 500KB).");
  } else if (template) {
    const fn = TEMPLATES[String(template)];
    if (!fn) return badRequest(res, `Unknown template '${template}'. Available: ${Object.keys(TEMPLATES).join(", ")}, or send raw 'html'.`);
    markup = fn(data || {});
  } else {
    return badRequest(res, "Send { template: 'invoice'|'report'|'contract', data: {...} } or { html: '...' }.");
  }

  try {
    const pdf = await renderPdfQueued(markup);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${String(template || "document")}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    res.status(500).json({ error: "PDF rendering failed", detail: String(err.message || err) });
  }
}

export async function pdfTemplatesInfo(req, res) {
  res.json({
    templates: {
      invoice: {
        description: "Professional invoice. Totals and tax computed server-side.",
        example: { template: "invoice", data: { number: "F-001", currency: "USD", tax_rate: 19, issuer: { name: "Acme LLC", details: "acme.com" }, client: { name: "Client Inc" }, items: [{ description: "Consulting", quantity: 2, unit_price: 150 }] } },
      },
      report: {
        description: "Multi-section report with text, bullet lists and tables.",
        example: { template: "report", data: { title: "Q3 Summary", sections: [{ title: "Overview", text: "..." }, { title: "Data", table: [{ metric: "MRR", value: "$1,200" }] }] } },
      },
      contract: {
        description: "Two-party agreement draft with numbered clauses and signature blocks.",
        example: { template: "contract", data: { title: "SERVICE AGREEMENT", party_a: { name: "Acme LLC" }, party_b: { name: "Client Inc" }, clauses: [{ title: "Object", text: "..." }] } },
      },
      html: { description: "Send raw { html } (max 500KB) for full control." },
    },
  });
}
