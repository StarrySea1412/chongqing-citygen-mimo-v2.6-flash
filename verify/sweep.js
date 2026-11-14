const { chromium } = require('playwright-core');
const SAMPLE = `(() => {
  const c = document.getElementById('viewport');
  const t = document.createElement('canvas');
  t.width = 96; t.height = 40;
  const g = t.getContext('2d');
  g.drawImage(c, 0, 0, 96, 40);
  const d = g.getImageData(0, 0, 96, 40).data;
  let sum = 0, dark = 0, bright = 0, warm = 0;
  for (let i = 0; i < d.length; i += 4){
    const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    sum += lum;
    if (lum < 10) dark++;
    if (lum > 200) bright++;
    if (lum > 40 && d[i] > d[i+2] + 30) warm++;
  }
  return { avg: +(sum/(d.length/4)).toFixed(1), dark, bright, warm };
})()`;
(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { const C = window.__CQ; C.scene.fog = null; C.bloom.enabled = true; });
  const rows = [];
  for (const hemi of [0.53, 1, 2, 4, 8]){
    for (const win of [2.2, 5, 10]){
      await page.evaluate(({ hemi, win }) => {
        const C = window.__CQ;
        C.hemi.intensity = hemi;
        C.W.buildings.winMats.forEach(m => m.emissiveIntensity = win);
      }, { hemi, win });
      await page.evaluate(() => window.__CQ.frameStep(0.016));
      const r = await page.evaluate(SAMPLE);
      rows.push({ hemi, win, ...r });
      console.log(`hemi=${hemi} win=${win} ->`, JSON.stringify(r));
    }
  }
  console.log('ROWS ' + JSON.stringify(rows));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
