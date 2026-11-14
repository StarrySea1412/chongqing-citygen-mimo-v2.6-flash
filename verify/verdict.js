const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const step = async (js, label, sample) => {
    const info = await page.evaluate(js);
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = sample ? await page.evaluate(sample) : info;
    console.log(label, JSON.stringify(r));
    return r;
  };
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
  // 1) 射线检测：画面中心/下方是什么物体
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    const ray = new THREE.Raycaster();
    const out = [];
    for (const [nx, ny] of [[0, -0.2], [0, -0.5], [0.3, -0.3], [-0.3, -0.3]]){
      ray.setFromCamera(new THREE.Vector2(nx, ny), C.camera);
      const hits = ray.intersectObjects(C.scene.children, true);
      out.push({ nx, ny, hit: hits.length ? (hits[0].object.name || hits[0].object.type) + '@' + Math.round(hits[0].distance) : 'none' });
    }
    return out;
  })()`, 'raycast ', false);
  // 2) 白模+隐藏地形：楼群独立可见性
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.fog = null; C.bloom.enabled = false;
    const terrain = C.scene.children.find(o => o.name === 'terrain') || C.W.group.children.find(o => o.name === 'terrain');
    if (terrain) terrain.visible = false;
    C.scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    C.hemi.intensity = 0.53;
    return 'terrain hidden, white override';
  })()`, 'bld-white', SAMPLE);
  // 3) 已知发光立方体放画面中心
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.overrideMaterial = null;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 5 }));
    cube.position.set(0, 40, 150);
    cube.name = 'debugCube';
    C.scene.add(cube);
    C.camera.position.set(0, 40, 300); C.camera.lookAt(0, 40, 150);
    C.controls.target.set(0, 40, 150);
    return 'cube placed';
  })()`, 'emissive-cube', SAMPLE);
  // 4) 同一立方体换 Basic 亮色对照
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    const cube = C.scene.getObjectByName('debugCube');
    cube.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    return 'cube basic';
  })()`, 'basic-cube   ', SAMPLE);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
