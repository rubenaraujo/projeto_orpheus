// End-to-end smoke tests. Needs the server running (BASE, default http://localhost:8765)
// and Chrome (CHROME env var, or the one Playwright downloaded).
// The sync endpoint is stubbed, so the real data.json is never touched.
const { chromium } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');

const BASE = process.env.BASE || 'http://localhost:8765';
const VIDEO = 'https://www.youtube.com/watch?v=3WIgVWI3vAg';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dir = fs.existsSync(root) && fs.readdirSync(root).filter(d => d.startsWith('chromium-')).sort().pop();
  if (!dir) throw new Error('Set CHROME to a Chrome/Chromium binary');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : /^(Google Chrome for Testing|chrome)$/.test(e.name) ? [p] : [];
  });
  return walk(path.join(root, dir))[0];
}

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : ' ' + extra));
};

(async () => {
  const browser = await chromium.launch({ executablePath: findChrome() });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/store', r => r.fulfill({ json: r.request().method() === 'GET' ? {} : { ok: true } }));

  await page.goto(BASE + '/');
  await page.waitForSelector('.onb');
  check('onboarding shown', await page.isVisible('.onb'));

  await page.click('#langCtl >> text=PT');
  const pt = await page.textContent('.onb h3');
  await page.click('#langCtl >> text=EN');
  check('language toggle changes text', pt !== await page.textContent('.onb h3'));

  await page.keyboard.press('?');
  check('? opens the shortcuts dialog', await page.evaluate(() => document.getElementById('keysDlg').open));
  await page.keyboard.press('Escape');

  await page.fill('#url', VIDEO);
  await page.click('#load');
  await page.waitForFunction(() => duration > 0, null, { timeout: 30000 });
  check('video loads', await page.evaluate(() => document.body.classList.contains('has-video')));

  const save = async (a, b) => { await page.fill('#a', String(a)); await page.fill('#b', String(b)); await page.click('#save'); };
  await save(10, 30); await save(40, 60); await save(70, 90);
  check('three sections saved', (await page.$$('#list li')).length === 3);

  // drag the first section to the end
  const grip = await (await page.$('#list li:nth-child(1) .grip')).boundingBox();
  const last = await (await page.$('#list li:nth-child(3)')).boundingBox();
  await page.mouse.move(grip.x + 8, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip.x + 8, last.y + last.height - 2, { steps: 8 });
  await page.mouse.up();
  const order = await page.evaluate(() => sections.map(s => s.a).join());
  check('drag reorders sections', order === '40,70,10', order);

  await page.click('#list li:nth-child(1) .noteBtn');
  await page.click('#list li:nth-child(1) .swatches .sw:nth-of-type(2)');
  check('colour swatch applies', await page.$eval('#list li:nth-child(1)', li => li.classList.contains('col')));

  await page.click('#zIn'); await page.click('#zIn');
  check('zoom buttons change zoom', await page.evaluate(() => zoom.z > 2));
  const box = await (await page.$('#timeline')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  check('ctrl+wheel zooms further', await page.evaluate(() => zoom.z > 2.6));

  await page.keyboard.press('Control+v');
  check('ctrl+v is not captured', await page.evaluate(() => !document.body.classList.contains('practice')));
  await page.keyboard.press('v');
  check('V toggles practice mode', await page.evaluate(() => document.body.classList.contains('practice')));
  await page.keyboard.press('v');

  await page.fill('#libQ', 'zzzz-no-match');
  check('library filter shows empty state', await page.isVisible('#libNone'));
  await page.fill('#libQ', '');

  const label = () => page.$eval('#desc summary .tg', e => e.innerText.trim());
  const closed = await label();
  await page.click('#desc summary');
  const opened = await label();
  check('description toggle label changes', closed !== opened, closed + ' / ' + opened);
  await page.click('#desc summary');

  await page.setViewportSize({ width: 390, height: 800 });
  check('mobile bar visible', await page.isVisible('#mbar'));

  check('no JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
