import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceController } from '../src/lib/evidence-controller.js';
import { describeState } from '../src/panel/render.js';
import { peer, page, subjectHome, AUSTIN } from './fixtures/search-responses.js';

const identityFor = (home) => ({
  visibleHeadingText: home.name,
  visiblePropertyLinkText: home.property.name,
});

async function tick() { await new Promise((r) => setImmediate(r)); }

/** Five eligible peers plus the subject, on one reported page. */
function marketPage({ subjectSlug = 'apartment-in-austin-tx-subject-1', bedrooms = 1, amounts = [1000, 2000, 3000, 4000, 5000] } = {}) {
  const homes = amounts.map((amount, i) => peer(`peer-${i}`, amount, { bedrooms }));
  homes.push(peer(subjectSlug, 9999, { bedrooms }));
  return page({ homes });
}

/**
 * Drives the controller with controllable unit and search responses, the way
 * the content script does, so each assertion is about what the panel shows.
 */
function harness({ searchResult = () => marketPage(), clock } = {}) {
  const homeCalls = [];
  const searchCalls = [];
  let time = 1000;
  const fetchHome = (slug) => new Promise((resolve, reject) => homeCalls.push({ slug, resolve, reject }));
  const searchPeers = async (args) => {
    searchCalls.push(args);
    const result = searchResult(args, searchCalls.length);
    if (result instanceof Error) throw result;
    return result;
  };
  const now = clock ?? (() => { time += 1000; return time; });
  const controller = createEvidenceController({ fetchHome, searchPeers, now });
  return { controller, homeCalls, searchCalls, view: () => describeState(controller.getState()) };
}

async function settleUnit(h, home, index = 0) {
  await tick();
  h.homeCalls[index].resolve(home);
  await tick();
  await tick();
  await tick();
}

test('entering the detail listing never collects a comparison; the first panel use does', async () => {
  const home = subjectHome();
  const h = harness();

  h.controller.enterDetailPage({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);
  assert.equal(h.searchCalls.length, 0);
  assert.equal(h.controller.getState().comparison.status, 'idle');

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home, 1);
  assert.equal(h.searchCalls.length, 1);
  assert.equal(h.controller.getState().comparison.status, 'ready');
});

test('the comparison states the median of the five other homes and excludes the subject', async () => {
  const home = subjectHome();
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  const { comparison } = h.controller.getState();
  assert.equal(comparison.status, 'ready');
  assert.equal(comparison.count, 5);
  assert.equal(comparison.median, 3000);

  const view = h.view();
  assert.match(view.comparison.statusText, /Median advertised monthly price across 5 other homes in the same market and bedroom count: \$3,000\./);
  assert.match(view.comparison.subjectText, /This home: \$2,000 per month\./);
  assert.match(view.comparison.disclosure, /not a matched-date booking quote/);
  assert.match(view.comparison.disclosure, /Underlying commitment and discount terms differ/);
});

test('the search is scoped to the subject market with an exact bedroom count and no extra filters', async () => {
  const home = subjectHome();
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  assert.deepEqual(h.searchCalls, [{ market: AUSTIN, bedrooms: 1, page: 1, perPage: 100 }]);
});

test('a studio subject searches its own zero-bedroom scope', async () => {
  const home = subjectHome({ bedrooms: 0 });
  const h = harness({ searchResult: () => marketPage({ bedrooms: 0 }) });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  assert.equal(h.searchCalls[0].bedrooms, 0);
  assert.equal(h.controller.getState().comparison.status, 'ready');
});

test('an unresolvable market is explained, never broadened and never hidden', async () => {
  const home = subjectHome({ overrides: { market_slug: null } });
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  assert.equal(h.searchCalls.length, 0, 'no search is attempted without a resolved scope');
  assert.equal(h.controller.getState().comparison.status, 'unresolved-scope');

  const view = h.view();
  assert.equal(view.comparison.visible, true);
  assert.match(view.comparison.statusText, /market or bedroom count could not be resolved/);
});

test('an explicit Refresh supersedes an attempt already in flight instead of being dropped', async () => {
  const home = subjectHome();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const h = harness({
    searchResult: async () => {
      calls += 1;
      if (calls === 1) await gate;
      return marketPage();
    },
  });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);
  assert.equal(h.controller.getState().comparison.status, 'loading');

  h.controller.refresh({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home, 1);
  assert.equal(h.searchCalls.length, 2, 'Refresh started its own attempt');
  assert.equal(h.controller.getState().comparison.status, 'ready');

  release();
  await tick();
  await tick();
  assert.equal(h.controller.getState().comparison.status, 'ready', 'the superseded attempt does not land');
});

test('a closed panel stops comparisons for units merely browsed past', async () => {
  const first = subjectHome();
  const second = subjectHome({ slug: 'other-unit', overrides: { market_slug: 'dallas' } });
  const h = harness({ searchResult: (args) => (args.market === 'dallas'
    ? page({ homes: [peer('d', 1000, { market_slug: 'dallas' })], marketSlug: 'dallas' })
    : marketPage()) });

  h.controller.openPanel({ slug: first.slug, visibleIdentity: identityFor(first) });
  await settleUnit(h, first);
  assert.equal(h.searchCalls.length, 1);

  h.controller.setPanelOpen(false);
  h.controller.enterDetailPage({ slug: second.slug, visibleIdentity: identityFor(second) });
  await settleUnit(h, second, 1);
  assert.equal(h.searchCalls.length, 1, 'browsing with the panel closed collects nothing');

  h.controller.setPanelOpen(true);
  await tick();
  await tick();
  assert.equal(h.searchCalls.length, 2, 'reopening the panel collects for the unit now shown');
});

test('the subject price is shown with the terms and note it was supplied under', async () => {
  const home = subjectHome({ overrides: { flex_options: [{ label: '6-Month+ Stay' }, { label: '12-Month+ Stay' }] } });
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  const { termsNote } = h.view().comparison;
  assert.match(termsNote, /Terms supplied with this price: 6-Month\+ Stay, 12-Month\+ Stay\./);
  assert.match(termsNote, /Price includes all fees except taxes\./);
});

test('terms the response never supplied are stated as unsupplied, not as no commitment', async () => {
  const home = subjectHome({ overrides: { flex_options: undefined } });
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  assert.match(h.view().comparison.termsNote, /Terms for this price were not supplied\./);
});

test('cached comparison evidence is reused for a matching selection, and excludes that new subject', async () => {
  const first = subjectHome({ slug: 'peer-0' });
  const second = subjectHome({ slug: 'peer-4', amount: 2500 });
  const h = harness({ searchResult: () => marketPage({ subjectSlug: 'unused' }) });

  h.controller.openPanel({ slug: first.slug, visibleIdentity: identityFor(first) });
  await settleUnit(h, first);
  const firstComparison = h.controller.getState().comparison;
  assert.equal(firstComparison.count, 5); // its own 1000 excluded, the subject-slug home included
  assert.equal(firstComparison.median, 4000);

  h.controller.openPanel({ slug: second.slug, visibleIdentity: identityFor(second) });
  await settleUnit(h, second, 1);

  assert.equal(h.searchCalls.length, 1, 'the cached market evidence is reused');
  const secondComparison = h.controller.getState().comparison;
  assert.equal(secondComparison.count, 5);
  assert.equal(secondComparison.median, 3000, 'the new subject is excluded, not the previous one');
});

test('unit evidence is rechecked on reopening even when the comparison is reused', async () => {
  const home = subjectHome();
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);
  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home, 1);

  assert.equal(h.homeCalls.length, 2);
  assert.equal(h.searchCalls.length, 1);
});

test('unit and comparison evidence keep separate successful-check times', async () => {
  const home = subjectHome();
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  const state = h.controller.getState();
  assert.ok(state.checkedAt !== null);
  assert.ok(state.comparison.checkedAt !== null);
  assert.notEqual(state.checkedAt, state.comparison.checkedAt);
  assert.match(h.view().comparison.checkTimeText, /^Comparison checked /);
});

test('Refresh bypasses both caches and keeps the old comparison labeled an older check while it runs', async () => {
  const home = subjectHome();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const h = harness({
    searchResult: async () => {
      calls += 1;
      if (calls > 1) await gate;
      return marketPage();
    },
  });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);
  const firstCheckedAt = h.controller.getState().comparison.checkedAt;

  h.controller.refresh({ slug: home.slug, visibleIdentity: identityFor(home) });
  await tick();

  const during = h.controller.getState().comparison;
  assert.equal(during.status, 'ready', 'the previous comparison stays usable during refresh');
  assert.equal(during.isStale, true);
  assert.equal(during.checkedAt, firstCheckedAt, 'a running refresh does not advance the check time');
  assert.match(h.view().comparison.checkTimeText, /showing an older check/);

  release();
  await settleUnit(h, home, 1);
  assert.equal(h.searchCalls.length, 2);
  assert.notEqual(h.controller.getState().comparison.checkedAt, firstCheckedAt);
});

test('a failed comparison keeps the previous one, labeled an older check, and never advances its time', async () => {
  const home = subjectHome();
  let calls = 0;
  const h = harness({
    searchResult: () => {
      calls += 1;
      return calls > 1 ? new Error('network') : marketPage();
    },
  });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);
  const firstCheckedAt = h.controller.getState().comparison.checkedAt;

  h.controller.refresh({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home, 1);

  const after = h.controller.getState().comparison;
  assert.equal(after.status, 'ready');
  assert.equal(after.isStale, true);
  assert.equal(after.checkedAt, firstCheckedAt);
  assert.match(h.view().comparison.checkTimeText, /showing an older check/);
});

test('a first comparison that cannot be completed says so, and the calendar stays usable', async () => {
  const home = subjectHome();
  const h = harness({ searchResult: () => new Error('network') });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  const state = h.controller.getState();
  assert.equal(state.comparison.status, 'unavailable');
  assert.equal(state.status, 'ready', 'calendar evidence is unaffected');

  const view = h.view();
  assert.equal(view.grid.cells.length, 42);
  assert.match(view.comparison.statusText, /could not be collected/);
  assert.equal(view.comparison.checkTimeText, '');
});

test('too few eligible peers reads as not enough comparable prices, not as a failure', async () => {
  const home = subjectHome();
  const h = harness({ searchResult: () => marketPage({ amounts: [1000, 2000, 3000, 4000] }) });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  const { comparison } = h.controller.getState();
  assert.equal(comparison.status, 'insufficient');
  assert.equal(comparison.count, 4);
  assert.equal(comparison.median, null);
  assert.match(h.view().comparison.statusText, /Not enough comparable prices: 4 eligible other homes.*at least 5 are needed/);
});

test('a subject with no eligible monthly price still gets a peer median, and its own price is not invented', async () => {
  const home = subjectHome({ overrides: { is_price_monthly: false, is_price_nightly: true } });
  const h = harness();

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);

  const view = h.view();
  assert.match(view.comparison.statusText, /Median advertised monthly price across 5 other homes/);
  assert.match(view.comparison.subjectText, /no eligible advertised monthly price/);
});

test('the comparison shows while the calendar is unusable, and loading while it runs', async () => {
  const home = subjectHome({ overrides: { availability: { ranges: [] } } });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ searchResult: async () => { await gate; return marketPage(); } });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await tick();
  h.homeCalls[0].resolve(home);
  await tick();
  await tick();

  assert.equal(h.controller.getState().comparison.status, 'loading');
  assert.match(h.view().comparison.statusText, /Loading comparable advertised prices/);

  release();
  await tick();
  await tick();
  const view = h.view();
  assert.equal(view.calendarStatusText, 'Calendar unavailable');
  assert.match(view.comparison.statusText, /Median advertised monthly price/);
});

test('a stale comparison generation cannot replace evidence for the unit now selected', async () => {
  const first = subjectHome({ slug: 'first-unit', overrides: { market_slug: 'dallas' } });
  const second = subjectHome({ slug: 'second-unit' });
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const h = harness({
    searchResult: async (args) => {
      if (args.market === 'dallas') {
        await firstGate;
        return page({ homes: [peer('dallas-a', 1)], marketSlug: 'dallas' });
      }
      return marketPage({ subjectSlug: second.slug });
    },
  });

  h.controller.openPanel({ slug: first.slug, visibleIdentity: identityFor(first) });
  await settleUnit(h, first);
  assert.equal(h.controller.getState().comparison.status, 'loading');

  h.controller.openPanel({ slug: second.slug, visibleIdentity: identityFor(second) });
  await settleUnit(h, second, 1);
  assert.equal(h.controller.getState().comparison.median, 3000);

  releaseFirst();
  await tick();
  await tick();
  assert.equal(h.controller.getState().comparison.median, 3000, 'the superseded attempt does not land');
});

test('teardown stops a pending comparison from landing', async () => {
  const home = subjectHome();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ searchResult: async () => { await gate; return marketPage(); } });

  h.controller.openPanel({ slug: home.slug, visibleIdentity: identityFor(home) });
  await settleUnit(h, home);
  assert.equal(h.controller.getState().comparison.status, 'loading');

  h.controller.teardown();
  release();
  await tick();
  await tick();
  assert.equal(h.controller.getState().comparison.status, 'loading', 'nothing new was accepted after teardown');
});

test('an unconfirmed identity resolves no scope and attempts no comparison', async () => {
  const home = subjectHome();
  const h = harness();

  h.controller.openPanel({
    slug: home.slug,
    visibleIdentity: { visibleHeadingText: 'Some Other Unit', visiblePropertyLinkText: 'Some Other Property' },
  });
  await settleUnit(h, home);

  assert.equal(h.searchCalls.length, 0);
  assert.equal(h.controller.getState().comparison.status, 'idle');
});
