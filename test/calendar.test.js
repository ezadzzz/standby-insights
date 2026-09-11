import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCalendarEvidence } from '../src/lib/calendar.js';
import {
  validClosedCalendarHome,
  validOpenCalendarHome,
  emptyRangesHome,
  missingAvailabilityHome,
  malformedDateHome,
  nonBooleanMoveInHome,
  contradictoryOverlapHome,
  rangeAfterOpenEndedHome,
} from './fixtures/home-responses.js';

test('valid closed calendar: normalizes every range chronologically with reservation flags', () => {
  const evidence = deriveCalendarEvidence(validClosedCalendarHome);
  assert.equal(evidence.status, 'ready');
  assert.equal(evidence.ranges.length, 9);
  assert.deepEqual(
    evidence.ranges.map((r) => r.isReservation),
    [true, false, false, true, false, false, true, false, false],
  );
  // unspecified end (last range has no end_date key)
  assert.equal(evidence.ranges.at(-1).endDate, null);
  assert.equal(evidence.ranges[7].moveInAllowed, true);
});

test('valid open calendar with a single bookable range: ready, not a reservation', () => {
  const evidence = deriveCalendarEvidence(validOpenCalendarHome);
  assert.equal(evidence.status, 'ready');
  assert.equal(evidence.ranges.length, 1);
  assert.equal(evidence.ranges[0].isReservation, false);
  assert.equal(evidence.ranges[0].moveInAllowed, true);
});

test('empty ranges array: unavailable, not treated as an empty valid result', () => {
  assert.equal(deriveCalendarEvidence(emptyRangesHome).status, 'unavailable');
});

test('missing availability entirely: unavailable', () => {
  assert.equal(deriveCalendarEvidence(missingAvailabilityHome).status, 'unavailable');
});

test('malformed start date: unavailable, not partially rendered', () => {
  assert.equal(deriveCalendarEvidence(malformedDateHome).status, 'unavailable');
});

test('non-boolean move-in flag: unavailable', () => {
  assert.equal(deriveCalendarEvidence(nonBooleanMoveInHome).status, 'unavailable');
});

test('contradictory overlapping ranges: unavailable', () => {
  assert.equal(deriveCalendarEvidence(contradictoryOverlapHome).status, 'unavailable');
});

test('a range appearing after an open-ended (unspecified end) range: unavailable', () => {
  assert.equal(deriveCalendarEvidence(rangeAfterOpenEndedHome).status, 'unavailable');
});

test('only unbookable_reason "reserved" counts as a reservation', () => {
  const evidence = deriveCalendarEvidence(validClosedCalendarHome);
  const blockedButNotReserved = evidence.ranges.find((r) => r.unbookableReason === 'less_than_minimum_nightly_stay');
  assert.equal(blockedButNotReserved.isReservation, false);
});
