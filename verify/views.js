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
      let sum = 0, warm = 0, cool = 0, dark = 0, bright = 0;
      for (let y = 0; y < 40; y++){
        let row = '';
        for (let x = 0; x < 96; x++){
          const i = (y * 96 + x) * 4;
          const rr = d[i], gg = d[i+1], b = d[i+2];
          const lum = 0.299*rr + 0.587*gg + 0.114*b;
          row += chars[Math.min(9, Math.floor(lum / 25.6))];
          sum += lum;
          if (lum < 10) dark++;
          else if (lum > 200) bright++;
          else if (rr > b + 30) warm++;
          else if (b > rr + 30) cool++;
        }
        rows.push(row);
      }
      const C = window.__CQ;
      return { ascii: rows.join('\n'), avg: +(sum/3840).toFixed(1), warm, cool, dark, bright,
        cam: C.camera.position.toArray().map(v => Math.round(v)) };
    });
    console.log(`=== ${label} cam=${JSON.stringify(r.cam)} avg=${r.avg} warm=${r.warm} cool=${r.cool} dark=${r.dark} bright=${r.bright} ===`);
    console.log(r.ascii);
  };
  await page.click('#viewpreset button[data-view="riverside"]');
  await page.waitForTimeout(2000);
  await shot('riverside');
  await page.click('#viewpreset button[data-view="rail"]');
  await page.waitForTimeout(2000);
  await shot('rail');
  await page.click('#viewpreset button[data-view="overhead"]');
  await page.waitForTimeout(2000);
  await shot('overhead');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
