const { chromium } = require('playwright-core');
const SAMPLE = `(() => {
  const c = document.getElementById('viewport');
  const t = document.createElement('canvas');
  t.width = 96; t.height = 40;
  const g = t.getContext('2d');
  g.drawImage(c, 0, 0, 96, 40);
  const d = g.getImageData(0, 0, 96, 40).data;
  let sum = 0, warm = 0, cool = 0, dark = 0, bright = 0;
  for (let i = 0; i < d.length; i += 4){
    const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    sum += lum;
    if (lum < 10) dark++;
    else if (lum > 200) bright++;
    else if (d[i] > d[i+2] + 30) warm++;
    else if (d[i+2] > d[i] + 30) cool++;
  }
  return { avg: +(sum/(d.length/4)).toFixed(1), warm, cool, dark, bright };
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
  const base = await page.evaluate(SAMPLE);
  const states = await page.evaluate(() => {
    const C = window.__CQ;
    const info = {
      winI: C.W.buildings.winMats[0].emissiveIntensity,
      hasEmissiveMap: !!C.W.buildings.winMats[0].emissiveMap,
      matArray: C.W.buildings.group.children.find(o => o.isInstancedMesh).material.length,
      fog: C.scene.fog ? C.scene.fog.density : null,
      hemi: C.hemi.intensity, sun: C.sun.intensity,
      bloomOn: C.bloom.enabled, bloomStr: C.bloom.strength,
      exposure: C.renderer.toneMappingExposure,
    };
    return info;
  });
  // 逐层隔离
  const step = async (js, label) => {
    await page.evaluate(js);
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = await page.evaluate(SAMPLE);
    console.log(label, JSON.stringify(r));
  };
  console.log('base      ', JSON.stringify(base), JSON.stringify(states));
  await step(`(() => { window.__CQ.scene.fog = null; })()`, 'no-fog   ');
  await step(`(() => { window.__CQ.bloom.enabled = false; })()`, 'no-bloom ');
  await step(`(() => { window.__CQ.hemi.intensity = 1.2; window.__CQ.sun.intensity = 1.5; })()`, 'hi-lights');
  await step(`(() => { window.__CQ.W.buildings.winMats.forEach(m => m.emissiveIntensity = 3.0); })()`, 'win3.0   ');
  await step(`(() => { window.__CQ.camera.position.set(400, 260, 400); window.__CQ.controls.target.set(0, 30, 0); })()`, 'closerCam');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
