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
  const step = async (js, label) => {
    await page.evaluate(js);
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = await page.evaluate(SAMPLE);
    console.log(label, JSON.stringify(r));
  };
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.fog = null; C.bloom.enabled = false;
    C.hemi.intensity = 1.5; C.sun.intensity = 0.4;
    const basic = new THREE.MeshBasicMaterial({ color: 0xffffff });
    C.W.buildings.group.children.forEach(o => { if (o.isInstancedMesh) o.material = [basic,basic,basic,basic,basic,basic]; });
  })()`, 'arr-6-basic  ');
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    const basic = new THREE.MeshBasicMaterial({ color: 0xffffff });
    C.W.buildings.group.children.forEach(o => { if (o.isInstancedMesh) o.material = basic; });
  })()`, 'single-basic ');
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.W.buildings.winMats.forEach(m => { m.emissiveIntensity = 2.2; });
    C.W.buildings.group.children.forEach(o => { if (o.isInstancedMesh) o.material = C.W.buildings.winMats[0]; });
  })()`, 'single-winMat');
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    const C3 = window.__CQ;
    const side = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0xffffff, emissiveMap: C3.W.buildings.winMats[0].emissiveMap, emissiveIntensity: 2.2 });
    C3.W.buildings.group.children.forEach(o => { if (o.isInstancedMesh) o.material = side; });
  })()`, 'single-newstd');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
