import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceController } from '../src/lib/evidence-controller.js';
import {
  validClosedCalendarHome,
  validOpenCalendarHome,
  emptyRangesHome,
  completeFactsHome,
  missingFactsHome,
  factsWithBrokenCalendarHome,
} from './fixtures/home-responses.js';

const identityFor = (home) => ({
  visibleHeadingText: home.name,
  visiblePropertyLinkText: home.property.name,
});

function fakeFetcher() {
  const calls = [];
  const fetchHome = (slug) => new Promise((resolve, reject) => {
    calls.push({ slug, resolve, reject });
  });
  return { fetchHome, calls };
}

async function tick() { await new Promise((r) => setImmediate(r)); }

test('entering the detail listing fetches and shows confirmed ready evidence', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  assert.equal(controller.getState().isChecking, true);

  await tick();
  calls[0].resolve(validClosedCalendarHome);
  await tick();

  const state = controller.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.identity, 'confirmed');
  assert.equal(state.ranges.length, 9);
  assert.equal(state.isChecking, false);
  assert.equal(state.isStale, false);
  assert.ok(state.checkedAt !== null);
});

test('mismatched visible identity never attaches unit-specific claims', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({
    slug: validClosedCalendarHome.slug,
    visibleIdentity: { visibleHeadingText: 'Someone Else Unit 9', visiblePropertyLinkText: 'Someone Else Property' },
  });
  await tick();
  calls[0].resolve(validClosedCalendarHome);
  await tick();

  const state = controller.getState();
  assert.equal(state.status, 'mismatch');
  assert.equal(state.ranges, null);
});

test('invalid calendar evidence shows unavailable, not an empty-calendar claim', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: emptyRangesHome.slug, visibleIdentity: identityFor(emptyRangesHome) });
  await tick();
  calls[0].resolve(emptyRangesHome);
  await tick();

  assert.equal(controller.getState().status, 'unavailable');
});

test('duplicate opening events for the same unit coalesce into one request', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  controller.openPanel({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();

  assert.equal(calls.length, 1, 'concurrent duplicate triggers coalesce into a single in-flight request');
  calls[0].resolve(validClosedCalendarHome);
  await tick();
});

test('opening the panel after evidence is already settled requests a fresh check', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  calls[0].resolve(validClosedCalendarHome);
  await tick();

  controller.openPanel({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  assert.equal(calls.length, 2, 'opening evidence after a settled check starts a fresh request');
  assert.equal(controller.getState().isStale, true, 'retained evidence is visibly an older check while rechecking');
  assert.equal(controller.getState().ranges.length, 9, 'retained evidence stays visible during the recheck');
  calls[1].resolve(validClosedCalendarHome);
  await tick();
});

test('refresh updates checkedAt on success and both unit evidence sources move together', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  calls[0].resolve(validClosedCalendarHome);
  await tick();
  const firstCheckedAt = controller.getState().checkedAt;

  const updatedHome = { ...validClosedCalendarHome, availability: validOpenCalendarHome.availability };
  controller.refresh({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  assert.equal(controller.getState().isStale, true);
  await tick();
  calls[1].resolve(updatedHome);
  await tick();

  const state = controller.getState();
  assert.equal(state.isStale, false);
  assert.equal(state.ranges.length, 1);
  assert.ok(state.checkedAt >= firstCheckedAt);
});

test('a failed refresh keeps retained evidence marked as an older check and does not advance checkedAt', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  calls[0].resolve(validClosedCalendarHome);
  await tick();
  const firstCheckedAt = controller.getState().checkedAt;

  controller.refresh({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  calls[1].reject(new Error('network down'));
  await tick();

  const state = controller.getState();
  assert.equal(state.isStale, true);
  assert.equal(state.checkedAt, firstCheckedAt, 'a failed request never advances the successful-check time');
  assert.equal(state.ranges.length, 9, 'retained evidence stays visible after failure');
  assert.ok(state.error);
});

test('confirmed identity exposes the validated unit name; unconfirmed identity attaches none', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  calls[0].resolve(validClosedCalendarHome);
  await tick();
  assert.equal(controller.getState().unitName, validClosedCalendarHome.name);

  controller.enterDetailPage({
    slug: emptyRangesHome.slug,
    visibleIdentity: { visibleHeadingText: 'Someone Else', visiblePropertyLinkText: 'Someone Else Property' },
  });
  await tick();
  calls[1].resolve(emptyRangesHome);
  await tick();
  assert.equal(controller.getState().unitName, null);
});

test('onChange fires on every state transition: checking, then settled', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const seen = [];
  const controller = createEvidenceController({ fetchHome, onChange: (s) => seen.push({ ...s }) });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  calls[0].resolve(validClosedCalendarHome);
  await tick();

  assert.equal(seen.length, 2);
  assert.equal(seen[0].isChecking, true);
  assert.equal(seen[1].status, 'ready');
});

test('a late response for a unit the member has since navigated away from is discarded', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  controller.enterDetailPage({ slug: validOpenCalendarHome.slug, visibleIdentity: identityFor(validOpenCalendarHome) });
  await tick();

  calls[1].resolve(validOpenCalendarHome);
  await tick();
  calls[0].resolve(validClosedCalendarHome); // late response for the abandoned unit
  await tick();

  const state = controller.getState();
  assert.equal(state.slug, validOpenCalendarHome.slug);
  assert.equal(state.ranges.length, 1, 'the late response for the previous unit never overwrites the current selection');
});

test('facts come from the same response as the calendar, with no additional request', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: completeFactsHome.slug, visibleIdentity: identityFor(completeFactsHome) });
  await tick();
  calls[0].resolve(completeFactsHome);
  await tick();

  assert.equal(calls.length, 1, 'facts must not trigger their own enrichment request');
  assert.equal(controller.getState().facts.minimumStay, 30);
  assert.deepEqual(controller.getState().facts.rating, { average: 4.15, count: 13 });
});

test('an unusable calendar does not suppress facts read from the same response', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: factsWithBrokenCalendarHome.slug, visibleIdentity: identityFor(factsWithBrokenCalendarHome) });
  await tick();
  calls[0].resolve(factsWithBrokenCalendarHome);
  await tick();

  const state = controller.getState();
  assert.equal(state.status, 'unavailable');
  assert.equal(state.facts.minimumStay, 30);
  assert.deepEqual(state.facts.rating, { average: 4.8, count: 6 });
});

test('missing facts do not invalidate a calendar read from the same response', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: missingFactsHome.slug, visibleIdentity: identityFor(missingFactsHome) });
  await tick();
  calls[0].resolve(missingFactsHome);
  await tick();

  const state = controller.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.facts.minimumStay, null);
  assert.equal(state.facts.rating, null);
});

test('an unconfirmed identity attaches no facts', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({
    slug: completeFactsHome.slug,
    visibleIdentity: { visibleHeadingText: 'Some Other Unit 9', visiblePropertyLinkText: 'See all units at Facts Property' },
  });
  await tick();
  calls[0].resolve(completeFactsHome);
  await tick();

  const state = controller.getState();
  assert.equal(state.identity, 'mismatch');
  assert.equal(state.facts, null);
});

test('switching units drops the previous unit facts, and a late reply cannot attach them', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: completeFactsHome.slug, visibleIdentity: identityFor(completeFactsHome) });
  await tick();
  controller.enterDetailPage({ slug: missingFactsHome.slug, visibleIdentity: identityFor(missingFactsHome) });
  await tick();
  assert.equal(controller.getState().facts, null, 'a newly selected unit shows no previous unit evidence');

  calls[0].resolve(completeFactsHome); // the superseded unit answers late
  await tick();
  assert.equal(controller.getState().facts, null);

  calls[1].resolve(missingFactsHome);
  await tick();
  assert.equal(controller.getState().slug, missingFactsHome.slug);
  assert.equal(controller.getState().facts.minimumStay, null);
});

test('a failed refresh keeps the previous facts, labeled as the older check', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: completeFactsHome.slug, visibleIdentity: identityFor(completeFactsHome) });
  await tick();
  calls[0].resolve(completeFactsHome);
  await tick();

  controller.refresh({ slug: completeFactsHome.slug, visibleIdentity: identityFor(completeFactsHome) });
  await tick();
  calls[1].reject(new Error('network'));
  await tick();

  const state = controller.getState();
  assert.equal(state.isStale, true);
  assert.equal(state.facts.minimumStay, 30);
});

test('a failed read still carries the unit name the page showed, never a confirmed one', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome });

  controller.enterDetailPage({ slug: validClosedCalendarHome.slug, visibleIdentity: identityFor(validClosedCalendarHome) });
  await tick();
  calls[0].reject(new Error('offline'));
  await tick();

  const state = controller.getState();
  assert.equal(state.status, 'unavailable');
  assert.equal(state.displayedName, validClosedCalendarHome.name);
  assert.equal(state.unitName, null);
});
