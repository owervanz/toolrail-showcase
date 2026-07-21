// Renders landing screenshots for visual review. Run: node scripts/shot-landing.mjs [port]
import { existsSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const port = process.argv[2] || "4479";
const outDir = process.argv[3] || "C:/Users/ower/AppData/Local/Temp/claude/C--preguntas-random/28c4a289-a8ce-429b-bb99-2b50a707b076/scratchpad";
const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find(p => existsSync(p));

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 1050, deviceScaleFactor: 0.75 });
await p.goto(`http://localhost:${port}/`, { waitUntil: "networkidle0" });
writeFileSync(`${outDir}/landing-hero.png`, await p.screenshot({ type: "png" }));
await p.evaluate(() => window.scrollTo(0, 1350));
await new Promise(r => setTimeout(r, 400));
writeFileSync(`${outDir}/landing-mid.png`, await p.screenshot({ type: "png" }));
await b.close();
console.log("screenshots ok");
