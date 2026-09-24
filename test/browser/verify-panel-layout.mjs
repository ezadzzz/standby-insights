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
  today: '2026-09-12', referenceDate: '2026-09-15', checkIn: {status:'selected', date:'2026-09-15'},
  summary: {nextReservation: {startDate:'2026-09-26'}, noStandardMoveInBeforeNext:true},
  ranges: [
    {startDate:'2026-09-12',endDate:'2026-09-24',moveInAllowed:false,isReservation:false,unbookableReason:'less_than_minimum_nightly_stay'},
    {startDate:'2026-09-25',endDate:'2026-09-25',moveInAllowed:false,isReservation:false,unbookableReason:'reserved_move_in_blocked'},
    {startDate:'2026-09-26',endDate:'2026-10-24',moveInAllowed:false,isReservation:true,unbookableReason:'reserved'},
    {startDate:'2026-10-25',endDate:'2026-10-31',moveInAllowed:false,isReservation:false,unbookableReason:'less_than_minimum_nightly_stay'},
    {startDate:'2026-11-01',endDate:null,moveInAllowed:true,isReservation:false,unbookableReason:null}
  ],
  comparison: {status:'ready', count:12, median:2400, subjectPrice:{amount:2144,label:'per month',terms:['6 months'],note:null},checkedAt:Date.UTC(2026,8,11,16)},
  facts: {minimumStay:30,flexOptions:[{label:'6-Month+ Stay',months:6,committedNights:180,specialOffer:true,earlyTerminationFeeType:'one-month-rent',extra:[]}],rating:{average:4.15,count:13},scores:{walk:{value:41,description:'Car-Dependent'},transit:null,bike:{value:52,description:'Bikeable'}}}
};
try {
  await mkdir(new URL('../../.impeccable/review/', import.meta.url), { recursive: true });
  await page.goto('http://panel.test/src/panel/panel.html');
  const variants = {
    ready: state,
    long: {...state, unitName:'LongUnitName'.repeat(12), isStale:true, error:'timeout'},
    empty: {status:'idle', checkedAt:null},
    unavailable: {status:'unavailable',checkedAt:null,error:'GateTimeoutError'},
    mismatch: {status:'mismatch',checkedAt:null},
    loading: {status:'idle',checkedAt:null,isChecking:true,comparison:{status:'loading'}},
    disagreement: {...state,checkIn:{status:'disagreement'}},
    insufficient: {...state,comparison:{...state.comparison,status:'insufficient',count:4}},
    missingPrice: {...state,comparison:{...state.comparison,subjectPrice:null}},
    notReturned: {...state,ranges:state.ranges.slice(0,2)},
    reserved: {...state,ranges:[{...state.ranges[0],isReservation:true,unbookableReason:'reserved'},...state.ranges.slice(1)],referenceDate:'2026-09-27',checkIn:{status:'selected',date:'2026-09-27'},summary:{referenceDate:'2026-09-27',intersectingReservation:{startDate:'2026-09-26',endDate:'2026-10-24'}}},
  };
  for (const width of [320,480,768,200]) {
    await page.setViewportSize({width,height:900});
    for (const [variant, current] of Object.entries(variants)) {
      await page.evaluate(s => window.deliver(s), current);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}/${variant}`);
      assert(await page.locator('#refresh-button').isVisible());
      assert.equal(await page.locator('#refresh-button').getAttribute('aria-disabled'), current.isChecking ? 'true' : null, `refresh aria-disabled while checking ${width}/${variant}`);
      assert.equal(await page.locator('#refresh-button').innerText(), 'Refresh', `refresh label ${width}/${variant}`);
      const statusLines = await page.$$eval('#refresh-status, #identity-note, #calendar-status', els => els.filter(el => el.textContent && el.checkVisibility()).length);
      assert(statusLines <= 1, `at most one status sentence ${width}/${variant}`);
      assert.equal(await page.locator('#six-weeks').isVisible(), Boolean(current.status === 'ready' && current.today && current.ranges), `grid ${width}/${variant}`);
      assert.equal(await page.locator('#comparison-prices').isVisible(), current.comparison?.status === 'ready');
      assert.equal(await page.locator('#comparison-caveat').isVisible(), current.comparison?.status === 'ready', `caveat ${width}/${variant}`);
      assert.equal(await page.locator('#price-disclosure').isVisible(), current.comparison?.status === 'ready', `disclosure ${width}/${variant}`);
      assert.equal(await page.locator('#calendar-section').isVisible(), !['empty','mismatch','unavailable'].includes(variant), `calendar section ${width}/${variant}`);
      assert.doesNotMatch(await page.locator('#check-time').innerText(), variant === 'empty' ? /^$/ : /Not checked yet/, `check time ${width}/${variant}`);
      if (variant === 'unavailable') assert.match(await page.locator('#refresh-status').innerText(), /^Check failed: .*Refresh to try again\.$/);
      if (variant === 'loading') assert.match(await page.locator('#calendar-status').innerText(), /Checking the calendar/);
      if (variant === 'mismatch') assert.match(await page.locator('#identity-note').innerText(), /could not confirm/);
      assert.equal(await page.locator('#announcer').textContent(), '', `no announcement without a member Refresh ${width}/${variant}`);
      if (variant === 'long') {
        assert.match(await page.locator('#refresh-status').innerText(), /older check/);
        assert.doesNotMatch(await page.locator('#check-time').innerText(), /older check/);
        assert.match(await page.locator('#refresh-status').innerText(), /last refresh failed.*network request did not complete.*refresh/i);
        assert.doesNotMatch(await page.locator('#standby-only-headline').innerText(), /older check/i);
      }
      if (variant === 'notReturned') {
        const missing = page.locator('#calendar-grid [data-kind="not-returned"]');
        assert(await missing.count() > 0, 'uncovered days are not-returned');
        assert.notEqual(await missing.first().evaluate(el => getComputedStyle(el).backgroundImage), 'none', 'not-returned days are drawn');
        assert.match(await page.locator('.grid-legend').innerText(), /No calendar data/);
      }
      if (variant === 'disagreement') {
        assert.match(await page.locator('#reference-note').innerText(), /no date is treated as selected/);
        assert(await page.evaluate(() => document.getElementById('reference-note').compareDocumentPosition(document.getElementById('six-weeks')) & Node.DOCUMENT_POSITION_FOLLOWING), 'reference note precedes the grid');
      }
      if (variant === 'missingPrice') assert.match(await page.locator('#comparison-subject').innerText(), /no eligible advertised monthly price/);
      if (variant === 'missingPrice') assert.equal(await page.locator('#comparison-difference').innerText(), '');
      if (variant === 'ready') {
        assert.equal(await page.locator('.facts dt').count(), 6);
        assert.match(await page.locator('#standby-only-headline').innerText(), /Standby-only through Sep 24/);
        assert.equal(await page.locator('#calendar-grid [data-kind]').count(), 42);
        assert.equal(await page.locator('#calendar-grid .check-in').count(), 1);
        assert.match(await page.locator('#calendar-grid [data-kind]').first().getAttribute('title'), /Sep 12 – Sep 24: Standby-only/);
        assert.match(await page.locator('#comparison-terms').innerText(), /6 months/);
        assert.equal(await page.locator('#comparison-difference').innerText(), '$256 below the median');
        assert(await page.evaluate(() => {
          const [prices, difference, terms] = ['comparison-prices', 'comparison-difference', 'comparison-terms'].map((id) => document.getElementById(id).getBoundingClientRect());
          return prices.bottom <= difference.top && difference.bottom <= terms.top;
        }), 'the difference sits between the figures and the fine print');
        assert.equal(await page.locator('#price-disclosure').evaluate(el => el.open), false, 'the full disclosure starts collapsed');
        assert.match(await page.locator('#comparison-disclosure').textContent(), /not a prediction/);
        const summary = page.locator('#all-ranges summary');
        assert.equal(await summary.innerText(), 'All returned ranges (5)');
        assert.equal(await page.locator('#all-ranges').evaluate(el => el.open), false, 'the range list starts collapsed');
        assert.equal(await page.locator('#all-ranges-list li').last().isVisible(), false);
      }
      if (process.argv.includes('--screenshots') && ((variant === 'ready' && width !== 200) || (width === 320 && ['unavailable','long','notReturned','disagreement','reserved','loading','mismatch'].includes(variant)))) {
        await page.screenshot({path:`.impeccable/review/panel-note-build-${variant === 'ready' ? '' : variant + '-'}${width}.png`,fullPage:true});
      }
    }
  }
  await page.evaluate(s => window.deliver(s), state);
  await page.keyboard.press('Tab');
  assert(await page.locator('#refresh-button').evaluate(el => el === document.activeElement && getComputedStyle(el).outlineWidth !== '0px'));
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.sentMessages.at(-1)), {tabId:1,type:'request-refresh'});
  assert.equal(await page.locator('#announcer').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#announcer').textContent(), '', 'nothing announced before the refresh has run');
  await page.evaluate(s => window.deliver({...s, isChecking:true, isStale:true}), state);
  assert.equal(await page.locator('#refresh-button').getAttribute('aria-disabled'), 'true', 'refresh aria-disabled while a check runs');
  assert(await page.locator('#refresh-button').evaluate(el => el === document.activeElement), 'refresh keeps focus while a check runs');
  const sent = await page.evaluate(() => window.sentMessages.length);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.sentMessages.length), sent, 'refresh ignores presses while a check runs');
  await page.evaluate(s => window.deliver({...s, checkedAt: s.checkedAt + 60000}), state);
  assert.equal(await page.locator('#announcer').textContent(), 'Refresh complete.');
  assert.equal(await page.locator('#refresh-button').getAttribute('aria-disabled'), null, 'refresh re-enabled once the check completes');
  assert.equal(await page.locator('#refresh-status').textContent(), '', 'no failure line after a successful refresh');
  await page.keyboard.press('Enter');
  await page.evaluate(s => window.deliver({...s, isChecking:true, isStale:true}), state);
  await page.evaluate(s => window.deliver({...s, isStale:true, error:'GateTimeoutError'}), state);
  assert.equal(await page.locator('#announcer').textContent(), 'Refresh failed.');
  assert.match(await page.locator('#refresh-status').innerText(), /last refresh failed/i);
  assert.doesNotMatch(await page.locator('#check-time').innerText(), /last refresh failed/i, 'the failure is its own line, not folded into the check time');
  // Every returned range, including past the grid's six weeks, by keyboard.
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.parentElement.id), 'marks-disclosure');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'all-ranges-summary');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#all-ranges-list li').count(), 5);
  assert.equal(await page.locator('#all-ranges-list li').last().innerText(), 'Nov 1 – unspecified end: Standard move-in allowed');
  assert.equal(await page.locator('svg:not([aria-hidden="true"])').count(), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('#refresh-button').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  assert.deepEqual(errors, []);
  console.log('PASS: 40 width/state combinations; no icon or font assets; full evidence and missing-data labels; not-returned days drawn and keyed; older-check label in the status line, one status sentence per state; Refresh keeps focus while checking; reference note before the grid; keyboard Refresh; polite announcements; reduced motion; no overflow or script errors.');
} finally { await browser.close(); }
