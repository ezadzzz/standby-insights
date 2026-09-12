import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  assert.equal(new URL(route.request().url()).origin, 'http://panel.test', 'the panel must not request external assets');
  const path = new URL(route.request().url()).pathname;
  const types = { css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', ttf: 'font/ttf', html: 'text/html' };
  await route.fulfill({ body: await readFile(new URL(`../..${path}`, import.meta.url)), contentType: types[path.split('.').at(-1)] });
});
await page.addInitScript(() => {
  window.sentMessages = [];
  window.chrome = { runtime: { onMessage: { addListener(fn) { window.deliver = state => fn({type: 'evidence-state', state}, { tab: {id: 1} }); } } }, tabs: { query: async () => [{id: 1}], connect() {}, sendMessage: async (tabId, message) => { window.sentMessages.push({tabId, ...message}); return {}; } } };
});
// Illustrative presentation fixture, not live Landing evidence.
const state = {
  status: 'ready', unitName: 'Lantana Hills 2321', checkedAt: Date.UTC(2026,8,11,16), isChecking: false, isStale: false, error: null,
  referenceDate: '2026-10-01', checkIn: {status:'selected'},
  summary: {nextReservation: {startDate:'2026-10-14'}, noStandardMoveInBeforeNext:true},
  ranges: [
    {startDate:'2026-09-11',endDate:'2026-10-13',moveInAllowed:false,isReservation:false},
    {startDate:'2026-10-14',endDate:'2026-11-30',moveInAllowed:false,isReservation:true},
    {startDate:'2026-12-01',endDate:null,moveInAllowed:true,isReservation:false}
  ],
  comparison: {status:'ready', count:12, median:2400, subjectPrice:{amount:2144,label:'per month',terms:['6 months'],note:null},checkedAt:Date.UTC(2026,8,11,16)},
  facts: {minimumStay:30,flexOptions:[{label:'6-Month+ Stay',months:6,committedNights:180,specialOffer:true,earlyTerminationFeeType:'one-month-rent',extra:[]}],rating:{average:4.15,count:13},scores:{walk:{value:41,description:'Car-Dependent'},transit:null,bike:{value:52,description:'Bikeable'}}}
};
try {
  await mkdir(new URL('../../.impeccable/review/', import.meta.url), { recursive: true });
  await page.goto('http://panel.test/src/panel/panel.html');
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => document.fonts.check('14px Archivo')), 'local Archivo loaded');
  const variants = {
    ready: state,
    long: {...state, unitName:'LongUnitName'.repeat(12), isStale:true, error:'timeout'},
    empty: {status:'idle', checkedAt:null},
    unavailable: {status:'unavailable',checkedAt:null},
    mismatch: {status:'mismatch',checkedAt:null},
    loading: {status:'loading',checkedAt:null,isChecking:true,comparison:{status:'loading'}},
    disagreement: {...state,checkIn:{status:'disagreement'}},
    insufficient: {...state,comparison:{...state.comparison,status:'insufficient',count:4}},
    missingPrice: {...state,comparison:{...state.comparison,subjectPrice:null}},
  };
  for (const width of [320,480,768,200]) {
    await page.setViewportSize({width,height:900});
    for (const [variant, current] of Object.entries(variants)) {
      await page.evaluate(s => window.deliver(s), current);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}/${variant}`);
      assert(await page.locator('#refresh-button').isVisible());
      assert.equal(await page.locator('#range-list li').count(), current.ranges?.length ?? 0);
      assert.equal(await page.locator('#comparison-prices').isVisible(), current.comparison?.status === 'ready');
      if (variant === 'long') assert.match(await page.locator('#check-time').innerText(), /older check.*last refresh failed/);
      if (variant === 'disagreement') assert.match(await page.locator('#reference-note').innerText(), /no date is treated as selected/);
      if (variant === 'missingPrice') assert.match(await page.locator('#comparison-subject').innerText(), /no eligible advertised monthly price/);
      if (variant === 'ready') {
        assert.equal(await page.locator('.facts dt').count(), 6);
        assert.match(await page.locator('#comparison-terms').innerText(), /6 months/);
        assert.match(await page.locator('#comparison-disclosure').innerText(), /not a prediction/);
      }
      if (process.argv.includes('--screenshots') && ((variant === 'ready' && width !== 200) || (width === 320 && ['unavailable','long'].includes(variant)))) {
        await page.screenshot({path:`.impeccable/review/panel-${variant}-${width}.png`,fullPage:true});
      }
    }
  }
  await page.evaluate(s => window.deliver(s), state);
  await page.keyboard.press('Tab');
  assert(await page.locator('#refresh-button').evaluate(el => el === document.activeElement && getComputedStyle(el).outlineWidth !== '0px'));
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.sentMessages.at(-1)), {tabId:1,type:'request-refresh'});
  assert.equal(await page.locator('#announcer').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#announcer').textContent(), 'Refresh complete.');
  assert.equal(await page.locator('svg:not([aria-hidden="true"])').count(), 0);
  assert(await page.locator('.brand-mark').evaluate(el => el.getBBox().width > 0), 'local SVG symbols rendered');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('#refresh-button').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  assert.deepEqual(errors, []);
  console.log('PASS: 36 width/state combinations; local font and icons; full evidence and missing-data labels; keyboard Refresh; polite announcements; reduced motion; no overflow or script errors.');
} finally { await browser.close(); }
