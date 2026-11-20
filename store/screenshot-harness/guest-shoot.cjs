// Guest tour scenes: the real guest app (/demo) with a room photo where the 3D scene renders and
// appliance pins placed on that photo. The app code is not changed; everything here is injected
// at screenshot time. Replace with real 3D captures once scans exist (see README).
// Usage: npm run dev -w apps/guest (port 5173), then: node guest-shoot.cjs [debug]
const { chromium } = require(
  require('node:path').resolve(__dirname, '../../node_modules/playwright'),
);
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(__dirname, 'raw');
const photo = (f) =>
  'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'public', f)).toString('base64');

const SCENES = [
  {
    name: '0-tour',
    room: 'Living room',
    photo: 'lounge.jpg',
    position: '100% 50%',
    hint: true,
    pins: [
      { x: 86, y: 36, label: 'TV', icon: 'tv', active: true },
      { x: 62, y: 63, label: 'Wi-Fi router', icon: 'wifi' },
    ],
  },
  {
    name: '0-guide',
    room: 'Living room',
    photo: 'lounge.jpg',
    position: '100% 50%',
    pins: [{ x: 86, y: 36, label: 'TV', icon: 'tv', active: true }],
    open: 'TV',
  },
  {
    name: '0-search',
    room: 'Kitchen',
    photo: 'kitchen.jpg',
    position: '42% 50%',
    pins: [{ x: 47, y: 67, label: 'Oven', icon: 'oven', active: true }],
    search: 'stove',
  },
  {
    name: '0-stove',
    room: 'Kitchen',
    photo: 'kitchen.jpg',
    position: '42% 50%',
    pins: [{ x: 47, y: 67, label: 'Oven', icon: 'oven', active: true }],
    open: 'Oven',
    poster: true,
  },
];

// The demo oven has two steps and no video; for the store images the dev server's demo module
// gets a fuller stove guide appended (served to this browser only, the repo file is unchanged).
const OVEN_PATCH = `
;(() => {
  const o = DEMO_EXPERIENCE.appliances.find((a) => a.id === 'oven');
  if (!o) return;
  o.video = { url: 'https://example.com/videos/stove', durationSec: 45 };
  o.steps = [
    { text: { en: 'Hob: push and turn a knob to the ring you want (1 low, 9 high)', ar: 'الموقد: اضغط وأدر المقبض إلى الحلقة المطلوبة' } },
    { text: { en: 'Oven: turn the left dial to the heating mode', ar: 'الفرن: أدر القرص الأيسر إلى وضع التسخين' } },
    { text: { en: 'Turn the right dial to the temperature. The light goes off when it is hot', ar: 'أدر القرص الأيمن إلى درجة الحرارة' } },
    { text: { en: 'When you finish, turn every dial back to 0', ar: 'عند الانتهاء أعد كل الأقراص إلى 0' } },
  ];
})();
`;

const ICONS = {
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  ac: '<rect x="2" y="5" width="20" height="8" rx="2"/><path d="M6 17v2M12 17v3M18 17v2M6 10h12"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>',
  oven: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M7 5.5h.01M11 5.5h.01"/><rect x="7" y="11" width="10" height="7" rx="1"/>',
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const debug = process.argv[2] === 'debug';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
  });
  for (const scene of SCENES) {
    const page = await ctx.newPage();
    await page.route(/\/src\/demo\.ts/, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: (await res.text()) + OVEN_PATCH });
    });
    await page.goto('http://localhost:5173/demo');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    if (scene.room !== 'Living room')
      await page.getByRole('button', { name: scene.room }).first().click();
    await page.evaluate(
      ({ scene, src, icons, debug }) => {
        // The apartment from the capture screens; no demo badge in store images.
        document.querySelectorAll('.g-badge').forEach((b) => b.remove());
        for (const el of document.querySelectorAll('h1, .g-exp header *'))
          if (el.childNodes.length === 1 && el.textContent === 'Demo apartment')
            el.textContent = 'Harbour View 1204';
        document.querySelectorAll('.g-stage__note').forEach((n) => n.remove());
        const exp = document.querySelector('.g-exp');
        const dock = document.querySelector('.g-dock');
        const bottom = dock.getBoundingClientRect().bottom + window.scrollY;
        exp.style.position = 'relative';
        const scn = document.createElement('div');
        scn.className = 'shot-scene';
        scn.style.cssText = `position:absolute;left:0;right:0;top:0;height:${bottom}px;z-index:0;background:url(${src}) ${scene.position}/cover;`;
        scn.innerHTML =
          '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,17,22,.55) 0,rgba(14,17,22,0) 22%,rgba(14,17,22,0) 62%,rgba(14,17,22,.78) 100%)"></div>' +
          (scene.hint
            ? '<div class="shot-360"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 4 0 0 1-9 4M3 12a9 4 0 0 1 9-4"/><path d="M14 14l-2 2 2 2M10 6l2 2-2 2"/></svg>Drag to look around · Pinch to zoom</div>'
            : '') +
          scene.pins
            .map(
              (p) =>
                `<div class="shot-pin${p.active ? ' on' : ''}" style="left:${p.x}%;top:${p.y}%"><span class="ring"></span><span class="dot"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[p.icon]}</svg></span><span class="tag">${p.label}</span></div>`,
            )
            .join('') +
          (debug
            ? Array.from(
                { length: 9 },
                (_, i) =>
                  `<div style="position:absolute;left:${(i + 1) * 10}%;top:0;bottom:0;border-left:1px solid #f0f;color:#f0f;font:10px sans-serif">${(i + 1) * 10}</div><div style="position:absolute;top:${(i + 1) * 10}%;left:0;right:0;border-top:1px solid #0ff;color:#0ff;font:10px sans-serif">${(i + 1) * 10}</div>`,
              ).join('')
            : '');
        exp.prepend(scn);
        for (const el of exp.children)
          if (el !== scn && getComputedStyle(el).position === 'static') {
            el.style.position = 'relative';
            el.style.zIndex = '1';
          }
        document.querySelector('.g-stage').style.background = 'transparent';
        const css = document.createElement('style');
        css.textContent = `
          .g-exp, .g-stage { background: transparent !important; }
          html, body { background: #F7F5F1 !important; }
          .shot-360 { position:absolute; left:50%; top:15%; transform:translateX(-50%); display:flex; gap:8px; align-items:center; padding:10px 16px; border-radius:999px; background:rgba(14,17,22,.55); backdrop-filter:blur(10px); color:#fff; font:600 13px/1 Inter,system-ui,sans-serif; white-space:nowrap; }
          .shot-pin { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:6px; }
          .shot-pin .dot { position:relative; width:44px; height:44px; border-radius:50%; display:grid; place-items:center; background:#161A20; color:#E2B36F; border:2.5px solid #C8893B; box-shadow:0 6px 18px rgba(0,0,0,.35); }
          .shot-pin.on .dot { background:#C8893B; color:#fff; border-color:#fff; }
          .shot-pin .ring { position:absolute; top:-8px; width:60px; height:60px; border-radius:50%; border:2px solid rgba(255,255,255,.55); }
          .shot-pin:not(.on) .ring { display:none; }
          .shot-pin .tag { padding:5px 10px; border-radius:999px; background:rgba(255,255,255,.94); color:#161A20; font:700 12px/1 Inter,system-ui,sans-serif; box-shadow:0 4px 12px rgba(0,0,0,.2); white-space:nowrap; }`;
        document.head.append(css);
      },
      { scene, src: photo(scene.photo), icons: ICONS, debug },
    );
    if (scene.search) {
      await page.locator('input[type="search"]').fill(scene.search);
      await page.waitForTimeout(500);
    }
    if (scene.open) {
      await page.locator('.g-row', { hasText: scene.open }).first().click();
      await page.waitForTimeout(600);
    }
    if (scene.poster) {
      // The video link shown as a large thumbnail card (store image only).
      await page.evaluate((src) => {
        const v = document.querySelector('.g-video');
        if (!v) return;
        const label = v.textContent.trim();
        v.innerHTML = `<span class="shot-poster"><span class="shot-play"><svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span><span class="shot-vlabel"><b>How to use the stove</b><small>${label}</small></span><span class="shot-time">0:45</span></span>`;
        const css = document.createElement('style');
        css.textContent = `.g-video { display:block !important; padding:0 !important; overflow:hidden; }
          .shot-poster { position:relative; display:block; aspect-ratio:16/9; background:url(${src}) center/cover; }
          .shot-poster::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.72)); }
          .shot-play { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); width:68px; height:68px; border-radius:50%; display:grid; place-items:center; background:rgba(31,86,98,.92); border:3px solid #fff; z-index:1; box-shadow:0 8px 24px rgba(0,0,0,.35); }
          .shot-vlabel { position:absolute; left:14px; bottom:12px; z-index:1; color:#fff; display:flex; flex-direction:column; gap:2px; font:600 13px/1.25 Inter,system-ui,sans-serif; }
          .shot-vlabel b { font-size:16px; font-weight:700; }
          .shot-time { position:absolute; right:12px; bottom:12px; z-index:1; padding:4px 8px; border-radius:6px; background:rgba(0,0,0,.6); color:#fff; font:700 12px/1 Inter,system-ui,sans-serif; }`;
        document.head.append(css);
      }, photo('stove-poster.jpg'));
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, scene.name + (debug ? '-debug' : '') + '.png') });
    console.log('saved', scene.name);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
