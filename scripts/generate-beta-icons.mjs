// Rasterises static/-/beta/icon*.svg to the committed PNGs. CHROMIUM_PATH overrides the browser.
//   node scripts/generate-beta-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const DIR = "static/-/beta";
const OUTPUTS = [
  { svg: "icon.svg", png: "icon-192.png", size: 192 },
  { svg: "icon.svg", png: "icon-512.png", size: 512 },
  { svg: "icon.svg", png: "apple-touch-icon.png", size: 180 },
  { svg: "icon-maskable.svg", png: "icon-maskable-512.png", size: 512 },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const { svg, png, size } of OUTPUTS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const src = `data:image/svg+xml;base64,${readFileSync(`${DIR}/${svg}`).toString("base64")}`;
    await page.setContent(`<body style="margin:0"><img src="${src}" width="${size}" height="${size}" style="display:block"></body>`);
    await page.locator("img").evaluate(img => img.decode());
    await page.screenshot({ path: `${DIR}/${png}`, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`${DIR}/${png}`);
  }
} finally {
  await browser.close();
}
