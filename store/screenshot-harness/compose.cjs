// Renders the panorama once and cuts it into seven 1320x2868 App Store images.
const { chromium } = require(
  require('node:path').resolve(__dirname, '../../node_modules/playwright'),
);
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const out = path.resolve(__dirname, '../app-store-screenshots');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 9240, height: 2868 } });
  await page.goto('http://localhost:5199/compose.html');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'panorama.png') });
  for (let i = 0; i < 7; i += 1) {
    await page.screenshot({
      path: path.join(out, `nookscanner-${i + 1}.png`),
      clip: { x: i * 1320, y: 0, width: 1320, height: 2868 },
    });
  }
  await browser.close();
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
