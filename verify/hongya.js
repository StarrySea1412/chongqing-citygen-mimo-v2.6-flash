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
  const r = await page.evaluate(() => {
    const C = window.__CQ;
    // 查地形高度，把相机放在离地 28m 的江面位置
    const hCam = C.W.hf.height(150, 30);
    const hTarget = C.W.hf.height(96, -58);
    C.camera.position.set(150, hCam + 28, 30);
    C.controls.target.set(96, hTarget + 18, -58);
    C.controls.update();
    return { hCam: +hCam.toFixed(1), hTarget: +hTarget.toFixed(1) };
  });
  await page.evaluate(() => window.__CQ.frameStep(0.016));
  const out = await page.evaluate(() => {
    const c = document.getElementById('viewport');
    const t = document.createElement('canvas');
    t.width = 96; t.height = 40;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0, 96, 40);
    const d = g.getImageData(0, 0, 96, 40).data;
    const chars = ' .:-=+*#%@';
    const rows = [];
    let sum = 0, gold = 0, bright = 0, dark = 0;
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
        if (lum > 60 && rr > 170 && gg > 100 && gg < 220 && b < 150) gold++;
      }
      rows.push(row);
    }
    return { ascii: rows.join('\n'), avg: +(sum/3840).toFixed(1), gold, bright, dark };
  });
  console.log('heights:', JSON.stringify(r), 'avg=' + out.avg, 'gold=' + out.gold, 'bright=' + out.bright, 'dark=' + out.dark);
  console.log(out.ascii);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
