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

  // 5b Appliance detection (MARKETING MOCK-UP until detection ships: overlay injected here only)
  p = await open('?photo=kitchen&speed=30');
  await p.getByText('Harbour View 1204').click();
  await click(p, 'Start capture');
  await click(p, 'Start recording');
  await p.waitForTimeout(2200);
  await click(p, 'Room done');
  await p.waitForTimeout(2200);
  await click(p, 'Room done');
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const boxes = [
      { x: 30, y: 318, w: 177, h: 98, label: 'Microwave', conf: 97 },
      { x: 15, y: 512, w: 190, h: 40, label: 'Hob', conf: 93 },
      { x: 15, y: 558, w: 190, h: 186, label: 'Oven', conf: 95 },
    ];
    const css = document.createElement('style');
    css.textContent = `
      .det { position: fixed; z-index: 5; border-radius: 10px; box-shadow: inset 0 0 0 2px rgba(226,179,111,.95), 0 0 0 1px rgba(0,0,0,.25); background: rgba(200,137,59,.10); }
      .det i { position: absolute; width: 16px; height: 16px; border: 4px solid #E2B36F; }
      .det i:nth-child(1) { left: -3px; top: -3px; border-right: 0; border-bottom: 0; border-top-left-radius: 10px; }
      .det i:nth-child(2) { right: -3px; top: -3px; border-left: 0; border-bottom: 0; border-top-right-radius: 10px; }
      .det i:nth-child(3) { left: -3px; bottom: -3px; border-right: 0; border-top: 0; border-bottom-left-radius: 10px; }
      .det i:nth-child(4) { right: -3px; bottom: -3px; border-left: 0; border-top: 0; border-bottom-right-radius: 10px; }
      .det b { position: absolute; left: 6px; top: -30px; display: flex; gap: 6px; align-items: center; padding: 5px 10px; border-radius: 999px; background: #C8893B; color: #fff; font: 700 13px/1 Inter, system-ui, sans-serif; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
      .det b span { font-weight: 600; opacity: .85; }
      .det.inside b { top: 6px; }
      .found { position: fixed; z-index: 6; left: 14px; right: 14px; top: 112px; display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 14px; background: rgba(18,22,28,.82); backdrop-filter: blur(12px); color: #fff; font: 600 15px/1.3 Inter, system-ui, sans-serif; }
      .found .ic { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #1E7A4F; }
      .found small { display: block; color: #C9D2DA; font-weight: 500; font-size: 13px; }`;
    document.head.append(css);
    for (const b of boxes) {
      const d = document.createElement('div');
      d.className = 'det' + (b.label === 'Oven' ? ' inside' : '');
      d.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;
      d.innerHTML = `<i></i><i></i><i></i><i></i><b>${b.label}<span>${b.conf}%</span></b>`;
      document.body.append(d);
    }
    const f = document.createElement('div');
    f.className = 'found';
    f.innerHTML =
      '<span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span><span>3 appliances found in Kitchen<small>Added to the guest guide for this apartment</small></span>';
    document.body.append(f);
  });
  await shot(p, '5b-detect');

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
