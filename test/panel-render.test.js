import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeState } from '../src/panel/render.js';

test('idle state: prompts without asserting anything about a unit', () => {
  const view = describeState({ status: 'idle', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null });
  assert.equal(view.checkTimeText, 'Not checked yet');
  assert.equal(view.rangeItems.length, 0);
  assert.equal(view.headingText, 'Standby evidence');
});

test('mismatched or ambiguous identity attaches no unit-specific claim, including in the heading', () => {
  for (const identity of ['mismatch', 'ambiguous']) {
    const view = describeState({ status: identity, identity, unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
    assert.match(view.identityNote, /could not confirm/i);
    assert.equal(view.rangeItems.length, 0);
    assert.equal(view.headingText, 'Standby evidence');
  }
});

test('unavailable calendar: labeled unavailable, not an empty result', () => {
  const view = describeState({ status: 'unavailable', identity: 'confirmed', unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
  assert.equal(view.calendarStatusText, 'Calendar unavailable');
});

test('ready calendar: shows the validated unit name and chronological range descriptions with reservation and unspecified-end labels', () => {
  const view = describeState({
    status: 'ready',
    identity: 'confirmed',
    unitName: 'Lantana Hills 2321',
    ranges: [
      { startDate: '2026-09-11', endDate: '2026-09-11', moveInAllowed: false, isReservation: true, unbookableReason: 'reserved' },
      { startDate: '2026-12-18', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null },
    ],
    checkedAt: 1000,
    isChecking: false,
    isStale: false,
    error: null,
  });
  assert.equal(view.headingText, 'Lantana Hills 2321');
  assert.equal(view.rangeItems.length, 2);
  assert.match(view.rangeItems[0].text, /reservation/i);
  assert.match(view.rangeItems[1].text, /unspecified/i);
  assert.match(view.rangeItems[1].text, /move-in allowed/i);
});

test('stale evidence during a recheck is labeled an older check', () => {
  const view = describeState({ status: 'ready', identity: 'confirmed', ranges: [], checkedAt: 1000, isChecking: true, isStale: true, error: null });
  assert.match(view.checkTimeText, /older check/i);
});

test('a failed refresh is labeled an older check with the failure noted, without erasing retained evidence', () => {
  const view = describeState({
    status: 'ready',
    identity: 'confirmed',
    ranges: [{ startDate: '2026-09-11', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null }],
    checkedAt: 1000,
    isChecking: false,
    isStale: true,
    error: 'GateTimeoutError',
  });
  assert.match(view.checkTimeText, /older check/i);
  assert.equal(view.rangeItems.length, 1);
  assert.ok(view.refreshFailedNote);
});

const factsState = (facts, overrides = {}) => ({
  status: 'ready', identity: 'confirmed', unitName: 'Facts Unit 1', ranges: [],
  checkedAt: 1000, isChecking: false, isStale: false, error: null, facts, ...overrides,
});

const factText = (view, label) => view.factItems.find((item) => item.label === label)?.text;

test('complete facts are stated in the specification order, after the calendar', () => {
  const view = describeState(factsState({
    minimumStay: 30,
    flexOptions: ['nights: 7, label: Flex 7'],
    rating: { average: 4.15, count: 13 },
    scores: {
      walk: { value: 41, description: 'Car-Dependent' },
      transit: { value: 29, description: 'Some Transit' },
      bike: { value: 52, description: 'Bikeable' },
    },
  }));
  assert.deepEqual(view.factItems.map((item) => item.label), ['Minimum stay', 'Flex', 'Rating', 'Walk score', 'Transit score', 'Bike score']);
  assert.match(factText(view, 'Minimum stay'), /30 nights/);
  assert.match(factText(view, 'Flex'), /Flex 7/);
  assert.match(factText(view, 'Rating'), /4\.15/);
  assert.match(factText(view, 'Rating'), /13 reviews/);
  assert.match(factText(view, 'Walk score'), /41/);
  assert.match(factText(view, 'Walk score'), /Car-Dependent/);
  assert.match(factText(view, 'Bike score'), /52/);
});

test('each absent fact is independently unavailable, and none reads as favorable', () => {
  const view = describeState(factsState({
    minimumStay: null, flexOptions: null, rating: null,
    scores: { walk: null, transit: null, bike: null },
  }));
  assert.equal(view.factItems.length, 6);
  for (const item of view.factItems) {
    assert.match(item.text, /unavailable/i, `${item.label} must say unavailable`);
    assert.doesNotMatch(item.text, /\b(eligible|none|no minimum)\b/i);
  }
});

test('one unreadable fact does not withhold its readable siblings', () => {
  const view = describeState(factsState({
    minimumStay: 30, flexOptions: null, rating: null,
    scores: { walk: { value: 41, description: null }, transit: null, bike: null },
  }));
  assert.match(factText(view, 'Minimum stay'), /30 nights/);
  assert.match(factText(view, 'Walk score'), /41/);
  assert.match(factText(view, 'Flex'), /unavailable/i);
  assert.match(factText(view, 'Rating'), /unavailable/i);
});

test('zero reviews reads as unrated rather than a rating of zero', () => {
  const view = describeState(factsState({
    minimumStay: null, flexOptions: null, rating: { average: 0, count: 0 },
    scores: { walk: null, transit: null, bike: null },
  }));
  assert.match(factText(view, 'Rating'), /unrated/i);
  assert.doesNotMatch(factText(view, 'Rating'), /\b0(\.0+)? out of\b/i);
});

test('a supplied but empty Flex field is stated as supplying nothing, not as eligibility', () => {
  const view = describeState(factsState({
    minimumStay: null, flexOptions: [], rating: null,
    scores: { walk: null, transit: null, bike: null },
  }));
  assert.match(factText(view, 'Flex'), /no Flex options/i);
});

test('an unusable calendar still shows the facts from the same response', () => {
  const view = describeState(factsState({
    minimumStay: 30, flexOptions: null, rating: { average: 4.8, count: 6 },
    scores: { walk: null, transit: null, bike: null },
  }, { status: 'unavailable', ranges: null }));
  assert.equal(view.calendarStatusText, 'Calendar unavailable');
  assert.match(factText(view, 'Minimum stay'), /30 nights/);
  assert.match(factText(view, 'Rating'), /4\.8/);
});

test('no facts section is offered before a check, or when identity is unconfirmed', () => {
  assert.deepEqual(describeState({ status: 'idle', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null, facts: null }).factItems, []);
  assert.deepEqual(describeState({ status: 'mismatch', identity: 'mismatch', unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null, facts: null }).factItems, []);
});
