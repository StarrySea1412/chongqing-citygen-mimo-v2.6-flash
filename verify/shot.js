const { chromium } = require('playwright-core');

const METRICS = () => {
  const c = document.getElementById('viewport');
  const W = 96, H = 40;
  const t = document.createElement('canvas');
  t.width = W; t.height = H;
  const g = t.getContext('2d');
  g.drawImage(c, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const chars = ' .:-=+*#%@';
  const rows = [];
  let warm = 0, cool = 0, mid = 0, dark = 0, bright = 0;
  for (let y = 0; y < H; y++){
    let row = '';
    for (let x = 0; x < W; x++){
      const i = (y * W + x) * 4;
      const rr = d[i], gg = d[i+1], b = d[i+2];
      const lum = 0.299*rr + 0.587*gg + 0.114*b;
      row += chars[Math.min(9, Math.floor(lum / 25.6))];
      if (lum < 10) dark++;
      else if (lum > 200) bright++;
      else if (rr > b + 30) warm++;
      else if (b > rr + 30) cool++;
      else mid++;
    }
    rows.push(row);
  }
  const C = window.__CQ;
  return {
    ascii: rows.join('\n'),
    warm, cool, mid, dark, bright,
    stats: document.getElementById('stats').textContent,
    canvasWH: [c.width, c.height],
    cam: C ? C.camera.position.toArray().map(v => Math.round(v)) : null,
    bg: C && C.scene.background ? '#' + C.scene.background.getHexString() : null,
  };
};

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });

  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // 场景 A：夜景环绕（默认）
  const A = await page.evaluate(METRICS);
  await page.screenshot({ path: 'A-night-orbit.png' });

  // 场景 B：俯瞰（立交/洪崖洞布局）
  await page.click('#viewpreset button[data-view="overhead"]');
  await page.waitForTimeout(2500);
  const B = await page.evaluate(METRICS);
  await page.screenshot({ path: 'B-overhead.png' });

  // 场景 C：江畔视角（洪崖洞天际线）
  await page.click('#viewpreset button[data-view="riverside"]');
  await page.waitForTimeout(2500);
  const Cc = await page.evaluate(METRICS);
  await page.screenshot({ path: 'C-riverside.png' });

  // 场景 D：穿楼视角
  await page.click('#viewpreset button[data-view="rail"]');
  await page.waitForTimeout(2500);
  const D = await page.evaluate(METRICS);
  await page.screenshot({ path: 'D-rail.png' });

  // 场景 E：切白天（实时响应验证）
  await page.click('#viewpreset button[data-view="orbit"]');
  await page.click('#tod button[data-tod="day"]');
  await page.waitForTimeout(1200);
  const E = await page.evaluate(METRICS);
  await page.screenshot({ path: 'E-day.png' });

  // 场景 F：换种子（全量重建验证）
  await page.click('#tod button[data-tod="night"]');
  await page.fill('#seed', '24680');
  await page.dispatchEvent('#seed', 'change');
  await page.waitForTimeout(4000);
  const F = await page.evaluate(METRICS);

  // 场景 G：密度拉满（楼群重建验证）
  await page.evaluate(() => {
    const el = document.getElementById('density');
    el.value = 1;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(3500);
  const G = await page.evaluate(METRICS);

  console.log(JSON.stringify({
    errs,
    A: { s: A.stats, warm: A.warm, cool: A.cool, dark: A.dark, bright: A.bright, bg: A.bg, wh: A.canvasWH },
    B: { warm: B.warm, cool: B.cool, dark: B.dark },
    C: { warm: Cc.warm, cool: Cc.cool, dark: Cc.dark },
    D: { warm: D.warm, dark: D.dark },
    E: { bg: E.bg, warm: E.warm, bright: E.bright, dark: E.dark },
    F: { s: F.stats, warm: F.warm },
    G: { s: G.stats, warm: G.warm },
  }, null, 2));
  console.log('=== A night orbit ===\n' + A.ascii);
  console.log('=== B overhead ===\n' + B.ascii);
  console.log('=== C riverside ===\n' + Cc.ascii);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
