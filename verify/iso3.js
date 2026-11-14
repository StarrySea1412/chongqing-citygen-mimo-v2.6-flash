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
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ':' + m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const step = async (js, label) => {
    const info = await page.evaluate(js);
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = await page.evaluate(SAMPLE);
    console.log(label, JSON.stringify(r), info ? JSON.stringify(info) : '');
  };
  // 1) 全新 Standard 材质（color+emissive）替换楼的材质
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.fog = null; C.bloom.enabled = false;
    C.W.buildings.group.children.forEach(o => {
      if (o.isInstancedMesh) o.material = new THREE.MeshStandardMaterial({
        color: 0x666666, emissive: 0xffffff, emissiveIntensity: 2.0,
      });
    });
    return 'fresh-std-single';
  })()`, 'fresh-std');
  // 2) 全新 Lambert 材质（受灯光）
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.W.buildings.group.children.forEach(o => {
      if (o.isInstancedMesh) o.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    });
    C.hemi.intensity = 1.0;
    return null;
  })()`, 'lambert ');
  // 3) 现有 side 材质去掉 emissiveMap 只留 emissive
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.W.buildings.winMats.forEach(m => { m.emissiveMap = null; m.emissive = new THREE.Color(0xffaa33); m.emissiveIntensity = 2.0; m.needsUpdate = true; });
    C.W.buildings.group.children.forEach(o => { if (o.isInstancedMesh) o.material = [m0ok()]; });
    function m0ok(){ return null; }
    return null;
  })()`, 'skip    ');
  // 3b) 现有 winMats 直接放回单材质数组首位
  await step(`(() => {
    const C = window.__CQ;
    const wm = C.W.buildings.winMats[0];
    C.W.buildings.group.children.forEach(o => { if (o.isInstancedMesh) o.material = wm; });
    return 'winMat-direct';
  })()`, 'winMat-1');
  console.log('errs', JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
