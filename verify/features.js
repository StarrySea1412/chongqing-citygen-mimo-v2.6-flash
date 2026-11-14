const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const shot = async (label) => {
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = await page.evaluate(() => {
      const c = document.getElementById('viewport');
      const t = document.createElement('canvas');
      t.width = 96; t.height = 40;
      const g = t.getContext('2d');
      g.drawImage(c, 0, 0, 96, 40);
      const d = g.getImageData(0, 0, 96, 40).data;
      const chars = ' .:-=+*#%@';
      const rows = [];
      let sum = 0, warm = 0, bright = 0, dark = 0;
      for (let y = 0; y < 40; y++){
        let row = '';
        for (let x = 0; x < 96; x++){
          const i = (y * 96 + x) * 4;
          const rr = d[i], gg = d[i+1], b = d[i+2];
          const lum = 0.299*rr + 0.587*gg + 0.114*b;
          row += chars[Math.min(9, Math.floor(lum / 25.6))];
          sum += lum;
          if (lum < 10) dark++;
          if (lum > 200) bright++;
          if (lum > 60 && rr > 170 && gg > 110 && b < 140) warm++;  // 金黄灯带
        }
        rows.push(row);
      }
      return { ascii: rows.join('\n'), avg: +(sum/3840).toFixed(1), warm, bright, dark };
    });
    console.log(`=== ${label} avg=${r.avg} gold=${r.warm} bright=${r.bright} dark=${r.dark} ===`);
    console.log(r.ascii);
  };
  // 洪崖洞特写：从江面对岸看金色楼群
  await page.evaluate(() => {
    const C = window.__CQ;
    C.camera.position.set(190, 42, -10);
    C.controls.target.set(96, 22, -58);
    C.controls.update();
  });
  await shot('hongya-close');
  // 轻轨穿楼：从轨道侧前方看
  await page.evaluate(() => {
    const C = window.__CQ;
    C.camera.position.set(60, 55, -330);
    C.controls.target.set(-30, 40, -262);
    C.controls.update();
  });
  await shot('monorail-through');
  // 立交桥俯视
  await page.evaluate(() => {
    const C = window.__CQ;
    C.camera.position.set(-135, 190, 95);
    C.controls.target.set(-135, 30, 95);
    C.controls.update();
  });
  await shot('interchange-top');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
