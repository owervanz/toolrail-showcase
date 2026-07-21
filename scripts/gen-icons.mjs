// Generates raster brand assets from the SVG sources using the same headless
// Chrome the app uses for PDFs. Run: node scripts/gen-icons.mjs
// Outputs into assets/: favicon-32.png, favicon-192.png, apple-touch-icon.png (180),
// favicon-512.png and og-image.png (1200x630 social card).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find(p => existsSync(p));
if (!CHROME) throw new Error("Chrome/Edge not found");

const faviconSvg = readFileSync(new URL("../assets/favicon.svg", import.meta.url), "utf8");
const logoSvg = readFileSync(new URL("../assets/logo.svg", import.meta.url), "utf8");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();

async function shotSquare(size, file) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px}svg{width:${size}px;height:${size}px;display:block}</style>${faviconSvg}`);
  const buf = await page.screenshot({ type: "png", omitBackground: true });
  writeFileSync(new URL(`../assets/${file}`, import.meta.url), buf);
  console.log(`ok ${file} (${size}px, ${buf.length} bytes)`);
}

await shotSquare(32, "favicon-32.png");
await shotSquare(192, "favicon-192.png");
await shotSquare(180, "apple-touch-icon.png");
await shotSquare(512, "favicon-512.png");

// Social card (og:image)
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(`<style>
  *{margin:0;padding:0} body{width:1200px;height:630px;background:#0a0c11;display:flex;align-items:center;justify-content:center;gap:56px;font-family:ui-sans-serif,system-ui,'Segoe UI',Arial,sans-serif}
  .mark{width:300px;height:300px}
  h1{color:#eceef5;font-size:84px;letter-spacing:-3px;font-weight:800} h1 span{color:#4ade80}
  p{color:#8b93a7;font-size:30px;margin-top:14px;max-width:560px;line-height:1.35}
  .chip{display:inline-block;margin-top:22px;color:#4ade80;border:2px solid #232838;border-radius:999px;padding:8px 22px;font-size:22px;letter-spacing:2px;font-family:ui-monospace,Consolas,monospace}
</style>
<div class="mark">${logoSvg}</div>
<div><h1>tool<span>rail</span></h1><p>Utility rails for autonomous agents. Pay per call, USDC on Base &amp; Solana.</p><div class="chip">NO API KEYS · FROM $0.002</div></div>`);
const og = await page.screenshot({ type: "png" });
writeFileSync(new URL("../assets/og-image.png", import.meta.url), og);
console.log(`ok og-image.png (${og.length} bytes)`);

await browser.close();
