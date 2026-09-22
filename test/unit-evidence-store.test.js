import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnitEvidenceStore } from '../src/lib/unit-evidence-store.js';
import { validClosedCalendarHome, validOpenCalendarHome } from './fixtures/home-responses.js';

const identityFor = (home) => ({
  visibleHeadingText: home.name,
  visiblePropertyLinkText: home.property.name,
});

async function tick() { await new Promise((r) => setImmediate(r)); }

function harness() {
  const calls = [];
  const fetchHome = (slug) => new Promise((resolve, reject) => calls.push({ slug, resolve, reject }));
  let time = 1000;
  const store = createUnitEvidenceStore({ fetchHome, now: () => { time += 1000; return time; } });
  return { store, calls };
}

test('a card and the panel wanting the same unit at once share one request', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();

  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'background' });
  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'selected', force: true });
  await tick();

  assert.equal(calls.length, 1, 'the second consumer joins the request already in flight');

  calls[0].resolve(home);
  await tick();
  assert.equal(store.get(home.slug).status, 'ready');
});

test('a card scrolled past again reuses what was already read', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();

  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'background' });
  await tick();
  calls[0].resolve(home);
  await tick();

  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'background' });
  await tick();
  assert.equal(calls.length, 1, 'scrolling over a card already read requests nothing');
});

test('opening evidence asks for a fresh read of a unit a card had already read', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();

  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'background' });
  await tick();
  calls[0].resolve(home);
  await tick();
  const firstCheck = store.get(home.slug).checkedAt;

  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'selected', force: true });
  await tick();
  assert.equal(calls.length, 2, 'a forced read does not reuse the cache');
  assert.equal(store.get(home.slug).isStale, true, 'the held evidence is an older check while it runs');

  calls[1].resolve(home);
  await tick();
  assert.notEqual(store.get(home.slug).checkedAt, firstCheck);
});

test('units are held independently, so one unit never shows another unit’s evidence', async () => {
  const { store, calls } = harness();

  store.read(validClosedCalendarHome.slug, { visibleIdentity: identityFor(validClosedCalendarHome) });
  store.read(validOpenCalendarHome.slug, { visibleIdentity: identityFor(validOpenCalendarHome) });
  await tick();
  calls[1].resolve(validOpenCalendarHome);
  calls[0].resolve(validClosedCalendarHome);
  await tick();

  assert.equal(store.get(validClosedCalendarHome.slug).ranges.length, 9);
  assert.equal(store.get(validOpenCalendarHome.slug).ranges.length, 1);
});

test('subscribers hear about the unit that changed', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();
  const seen = [];
  store.subscribe((slug) => seen.push(slug));

  store.read(home.slug, { visibleIdentity: identityFor(home) });
  await tick();
  calls[0].resolve(home);
  await tick();

  assert.ok(seen.includes(home.slug));
});

test('a failed read keeps the previous evidence, labeled an older check', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();

  store.read(home.slug, { visibleIdentity: identityFor(home) });
  await tick();
  calls[0].resolve(home);
  await tick();
  const firstCheck = store.get(home.slug).checkedAt;

  store.read(home.slug, { visibleIdentity: identityFor(home), force: true });
  await tick();
  calls[1].reject(new Error('network'));
  await tick();

  const evidence = store.get(home.slug);
  assert.equal(evidence.status, 'ready');
  assert.equal(evidence.isStale, true);
  assert.equal(evidence.checkedAt, firstCheck, 'a failed read never advances the check time');
});

test('a unit name confirmed once survives a later unconfirmed re-check', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();

  store.read(home.slug, { visibleIdentity: identityFor(home) });
  await tick();
  calls[0].resolve(home);
  await tick();
  assert.equal(store.get(home.slug).unitName, home.name);

  store.read(home.slug, { visibleIdentity: { ...identityFor(home), visibleHeadingText: 'Some other unit' }, force: true });
  await tick();
  calls[1].resolve(home);
  await tick();

  const evidence = store.get(home.slug);
  assert.equal(evidence.identity, 'mismatch');
  assert.equal(evidence.unitName, home.name, 'the name a prior confirmed check established is not erased');
});

test('teardown stops a pending read from landing', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();

  store.read(home.slug, { visibleIdentity: identityFor(home) });
  await tick();
  store.teardown();
  calls[0].resolve(home);
  await tick();

  assert.equal(store.get(home.slug)?.status, undefined);
});

test('opening evidence escalates a card read already running, so a pause cannot strand it', async () => {
  const home = validClosedCalendarHome;
  const { store, calls } = harness();

  // A rate limit has already paused offscreen work, and a card read is queued.
  store.pauseBackground();
  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'background' });
  await tick();
  assert.equal(calls.length, 0, 'the card read is held behind the pause');

  // The member opens evidence for that very unit.
  store.read(home.slug, { visibleIdentity: identityFor(home), priority: 'selected', force: true });
  await tick();

  assert.equal(calls.length, 1, 'their own request runs rather than waiting behind the pause');
  calls[0].resolve(home);
  await tick();
  assert.equal(store.get(home.slug).status, 'ready');
  assert.equal(store.get(home.slug).isChecking, false, 'the card is not left checking forever');
});

test('a rate limit pauses offscreen card reads only', async () => {
  const { store, calls } = harness();
  store.pauseBackground();

  store.read(validClosedCalendarHome.slug, { visibleIdentity: identityFor(validClosedCalendarHome), priority: 'background' });
  store.read(validOpenCalendarHome.slug, { visibleIdentity: identityFor(validOpenCalendarHome), priority: 'selected', force: true });
  await tick();

  assert.deepEqual(calls.map((c) => c.slug), [validOpenCalendarHome.slug]);
  assert.equal(store.isBackgroundPaused, true);

  store.resumeBackground();
  await tick();
  assert.equal(calls.length, 2, 'explicit recovery releases the held card read');
});
