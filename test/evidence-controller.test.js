import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceController } from '../src/lib/evidence-controller.js';
import { validClosedCalendarHome, validOpenCalendarHome, emptyRangesHome } from './fixtures/home-responses.js';

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
