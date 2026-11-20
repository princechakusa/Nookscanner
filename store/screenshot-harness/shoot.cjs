// Drives the real capture-app screens (react-native-web) and saves raw 1320x2868 screens.
const { chromium } = require(
  require('node:path').resolve(__dirname, '../../node_modules/playwright'),
);
const path = require('node:path');
const OUT = path.join(__dirname, 'raw');
const BASE = 'http://localhost:5199/';

(async () => {
  require('node:fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
  });
  const errors = [];
  const open = async (qs) => {
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE + qs);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    return page;
  };
  const shot = async (page, name) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('saved', name);
  };
  const click = (page, label) => page.getByRole('button', { name: label, exact: true }).click();

  // 1 Sign in (email typed in)
  let p = await open('?signedin=0');
  await p.getByLabel('Email').fill('sara@harbourlets.com');
  await p.getByLabel('Password').fill('correct-horse-battery');
  await shot(p, '1-signin');

  // 2 Apartments + 3 Plan
  p = await open('?');
  await p.getByText('Harbour View 1204').waitFor();
  await shot(p, '2-apartments');
  await p.getByText('Harbour View 1204').click();
  await p.getByText('Start capture').waitFor();
  await shot(p, '3-plan');

  // 4 Camera, recording in the living room, with exposure locked
  p = await open('?photo=living&speed=30');
  await p.getByText('Harbour View 1204').click();
  await click(p, 'Start capture');
  await p.getByText('Start recording').waitFor();
  await shot(p, '4a-ready');
  await click(p, 'Start recording');
  await p.waitForTimeout(2200);
  await click(p, 'Room done');
  await p.waitForTimeout(2200);
  await shot(p, '4-recording');

  // 5 Live quality tip (kitchen)
  p = await open('?photo=kitchen&tip=MOVING_TOO_FAST&speed=30');
  await p.getByText('Harbour View 1204').click();
  await click(p, 'Start capture');
  await click(p, 'Start recording');
  await p.waitForTimeout(2200);
  await click(p, 'Room done');
  await p.waitForTimeout(2200);
  await click(p, 'Room done');
  await p.waitForTimeout(1800);
  await shot(p, '5-tip');

  // 6 Review: walk all rooms; the balcony is cut short so the warning shows
  p = await open('?photo=lounge&speed=40');
  await p.getByText('Harbour View 1204').click();
  await click(p, 'Start capture');
  await click(p, 'Start recording');
  for (let i = 0; i < 5; i += 1) {
    await p.waitForTimeout(1900 + i * 150);
    await click(p, i < 5 ? 'Room done' : 'Last room done');
  }
  await p.waitForTimeout(300);
  await click(p, 'Last room done');
  await p.waitForTimeout(800);
  await click(p, 'Finish');
  await p.getByText('Review the walkthrough').waitFor();
  await shot(p, '6-review');

  // 7 Uploads
  await click(p, 'Use this recording');
  await p.getByText('Uploading').waitFor();
  await p.getByText(/left/).waitFor({ timeout: 10000 });
  await shot(p, '7-uploads');

  console.log('errors:', JSON.stringify(errors.slice(0, 10), null, 1));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
