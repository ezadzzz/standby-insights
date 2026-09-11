import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCalendarEvidence, summarizeForReference } from '../src/lib/calendar.js';
import { validClosedCalendarHome, validOpenCalendarHome } from './fixtures/home-responses.js';

const rangesOf = (home) => deriveCalendarEvidence(home).ranges;

function ranges(...specs) {
  return specs.map(([startDate, endDate, moveInAllowed, reason = null]) => ({
    startDate,
    endDate,
    moveInAllowed,
    isReservation: reason === 'reserved',
    unbookableReason: reason,
  }));
}

test('a reservation spanning the reference date is prioritized, with its end date shown for overlap only', () => {
  const summary = summarizeForReference(rangesOf(validClosedCalendarHome), '2026-10-01');
  assert.deepEqual(
    { start: summary.intersectingReservation.startDate, end: summary.intersectingReservation.endDate },
    { start: '2026-09-26', end: '2026-10-24' },
  );
  assert.equal(summary.nextReservation.startDate, '2026-11-02');
  // An already-started reservation leaves no interval before it to observe.
  assert.equal(summary.noStandardMoveInBeforeNext, false);
});

test('a reservation beginning on the reference date counts as intersecting it', () => {
  const summary = summarizeForReference(rangesOf(validClosedCalendarHome), '2026-09-26');
  assert.equal(summary.intersectingReservation.startDate, '2026-09-26');
});

test('reservations ending before the reference date are not summarized but stay in the full calendar', () => {
  const all = rangesOf(validClosedCalendarHome);
  const summary = summarizeForReference(all, '2026-10-25');
  assert.equal(summary.intersectingReservation, null);
  assert.equal(summary.nextReservation.startDate, '2026-11-02');
  assert.equal(all.length, 9); // untouched source evidence
});

test('with continuous non-move-in coverage up to the next reservation, the move-in observation is supported', () => {
  const summary = summarizeForReference(rangesOf(validClosedCalendarHome), '2026-10-25');
  assert.equal(summary.noStandardMoveInBeforeNext, true);
});

test('a move-in-allowed range intersecting the interval withholds the move-in observation', () => {
  const summary = summarizeForReference(
    ranges(
      ['2026-09-11', '2026-09-20', false, 'less_than_minimum_nightly_stay'],
      ['2026-09-21', '2026-09-30', true],
      ['2026-10-01', '2026-10-10', false, 'reserved'],
    ),
    '2026-09-11',
  );
  assert.equal(summary.nextReservation.startDate, '2026-10-01');
  assert.equal(summary.noStandardMoveInBeforeNext, false);
});

test('a move-in opportunity wholly before the reference date cannot decide the later interval', () => {
  const summary = summarizeForReference(
    ranges(
      ['2026-09-01', '2026-09-10', true],
      ['2026-09-11', '2026-09-30', false, 'less_than_minimum_nightly_stay'],
      ['2026-10-01', '2026-10-10', false, 'reserved'],
    ),
    '2026-09-11',
  );
  assert.equal(summary.noStandardMoveInBeforeNext, true);
});

test('a gap in coverage before the reservation withholds the move-in observation', () => {
  const summary = summarizeForReference(
    ranges(
      ['2026-09-11', '2026-09-15', false, 'less_than_minimum_nightly_stay'],
      ['2026-09-20', '2026-09-30', false, 'less_than_minimum_nightly_stay'],
      ['2026-10-01', '2026-10-10', false, 'reserved'],
    ),
    '2026-09-11',
  );
  assert.equal(summary.noStandardMoveInBeforeNext, false);
});

test('a reference date outside the returned calendar withholds the move-in observation', () => {
  const summary = summarizeForReference(rangesOf(validClosedCalendarHome), '2026-09-01');
  assert.equal(summary.nextReservation.startDate, '2026-09-11');
  assert.equal(summary.noStandardMoveInBeforeNext, false);
});

test('non-reservation blocked ranges are never reported as reservations', () => {
  const summary = summarizeForReference(
    ranges(['2026-09-11', '2026-09-30', false, 'reserved_move_in_blocked']),
    '2026-09-11',
  );
  assert.equal(summary.intersectingReservation, null);
  assert.equal(summary.nextReservation, null);
  assert.equal(summary.noReservationsInCalendar, true);
});

test('an open/no-reservation calendar reports absence bounded by the returned coverage', () => {
  const summary = summarizeForReference(rangesOf(validOpenCalendarHome), '2026-09-11');
  assert.equal(summary.noReservationsInCalendar, true);
  assert.equal(summary.coverageStart, '2026-09-11');
  assert.equal(summary.coverageEnd, '2027-09-10');
});

test('an unspecified final end is reported as unspecified coverage, never indefinite availability', () => {
  const summary = summarizeForReference(
    ranges(['2026-09-11', '2026-12-31', true], ['2027-01-01', null, false, 'future_booking_prevention']),
    '2026-09-11',
  );
  assert.equal(summary.noReservationsInCalendar, true);
  assert.equal(summary.coverageEnd, null);
});

test('a gapped calendar cannot establish a calendar-wide absence of reservations', () => {
  const summary = summarizeForReference(
    ranges(['2026-09-11', '2026-09-20', true], ['2026-10-01', '2026-10-10', true]),
    '2026-09-11',
  );
  assert.equal(summary.noReservationsInCalendar, false);
});

test('the summary says whether the reference date itself offers standard move-in', () => {
  const open = deriveCalendarEvidence({
    availability: { ranges: [{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: true }] },
  }).ranges;
  assert.equal(summarizeForReference(open, '2026-09-15').moveInOnReferenceDate, true);

  const reserved = deriveCalendarEvidence({
    availability: { ranges: [{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: false, unbookable_reason: 'reserved' }] },
  }).ranges;
  assert.equal(summarizeForReference(reserved, '2026-09-15').moveInOnReferenceDate, false);
});

test('a reference date outside the returned calendar yields no move-in claim either way', () => {
  const ranges = deriveCalendarEvidence({
    availability: { ranges: [{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: true }] },
  }).ranges;
  assert.equal(summarizeForReference(ranges, '2026-12-01').moveInOnReferenceDate, null);
});
