// Generic page screenshot helper. Usage: node scripts/shot-page.mjs <port> <path> <outfile> [scrollY]
import { existsSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const [, , port, urlPath, outfile, scrollY] = process.argv;
const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find(p => existsSync(p));

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1000, height: 1100, deviceScaleFactor: 0.8 });
await p.goto(`http://localhost:${port}${urlPath}`, { waitUntil: "networkidle0" });
if (scrollY) {
  await p.evaluate(y => window.scrollTo(0, Number(y)), scrollY);
  await new Promise(r => setTimeout(r, 300));
}
writeFileSync(outfile, await p.screenshot({ type: "png" }));
await b.close();
console.log("ok:", outfile);
