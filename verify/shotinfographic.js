const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 1240 } });
  await page.goto('file:///D:/project/chongqing-citygen/tech-stack.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '../tech-stack.png', fullPage: true });
  await browser.close();
  console.log('infographic saved');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
