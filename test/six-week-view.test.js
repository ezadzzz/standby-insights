import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCalendarEvidence, summarizeForReference } from '../src/lib/calendar.js';
import { sixWeekView, describeStandbyOnly, describeHeadline } from '../src/lib/six-week-view.js';
import { validClosedCalendarHome } from './fixtures/home-responses.js';

const TODAY = '2026-09-12';
const lantana = deriveCalendarEvidence(validClosedCalendarHome).ranges;

function ranges(raw) {
  return deriveCalendarEvidence({ availability: { ranges: raw } }).ranges;
}

test('the view is six weeks of days starting today, each classified from its returned range', () => {
  const view = sixWeekView(lantana, TODAY, TODAY);
  assert.equal(view.days.length, 42);
  assert.equal(view.days[0].date, '2026-09-12');
  assert.equal(view.days[41].date, '2026-10-23');
  assert.equal(view.days[0].kind, 'standby-only');
  assert.equal(view.days[13].kind, 'blocked', 'Sep 25 blocks move-in but is not a reservation');
  assert.equal(view.days[14].kind, 'reserved');
  assert.deepEqual(view.segments.map((s) => [s.kind, s.days]), [['standby-only', 13], ['blocked', 1], ['reserved', 28]]);
});

test('a gap in progress on the reference date is named with its end and the reservation after it', () => {
  const statement = describeStandbyOnly(sixWeekView(lantana, TODAY, TODAY));
  assert.equal(statement.isStandbyOnly, true);
  assert.equal(statement.headline, 'Standby-only through Sep 24');
  assert.equal(statement.detail, "Next reservation blocks standard stays");
});

test('an upcoming gap is named by both ends', () => {
  const view = sixWeekView(ranges([
    { start_date: '2026-09-01', end_date: '2026-10-03', move_in_allowed: true },
    { start_date: '2026-10-04', end_date: '2026-10-16', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
    { start_date: '2026-10-17', end_date: '2026-12-01', move_in_allowed: false, unbookable_reason: 'reserved' },
  ]), TODAY, TODAY);
  assert.equal(describeStandbyOnly(view).headline, 'Standby-only Oct 4 – Oct 16');
});

test('a gap that ended before the member’s check-in is not their gap', () => {
  const view = sixWeekView(lantana, TODAY, '2026-09-30');
  const statement = describeStandbyOnly(view);
  assert.equal(statement.isStandbyOnly, false);
  assert.equal(view.checkInIndex, 18);
});

test('a reserved reference date is said even when a standby-only gap follows it', () => {
  const reservedThenGap = ranges([
    { start_date: '2026-09-01', end_date: '2026-10-07', move_in_allowed: true },
    { start_date: '2026-10-08', end_date: '2026-10-12', move_in_allowed: false, unbookable_reason: 'reserved' },
    { start_date: '2026-10-13', end_date: '2026-10-22', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
    { start_date: '2026-10-23', end_date: '2026-12-01', move_in_allowed: false, unbookable_reason: 'reserved' },
  ]);
  const at = (today, checkIn) => describeHeadline(
    sixWeekView(reservedThenGap, today, '2026-10-10'), summarizeForReference(reservedThenGap, '2026-10-10'), checkIn,
  );

  const selected = at(TODAY, { status: 'selected', date: '2026-10-10' });
  assert.equal(selected.isStandbyOnly, true, 'the gap stays the headline');
  assert.equal(selected.headline, 'Standby-only Oct 13 – Oct 22');
  assert.equal(selected.detail, "Reserved on your check-in, Oct 10. Next reservation blocks standard stays");

  // Not the member's date: labeled as today, never presented as theirs.
  const checkDate = at('2026-10-10', { status: 'none', date: null });
  assert.match(checkDate.detail, /^Reserved today, Oct 10\. /);
});

test('an unspecified gap end is said to be unspecified, never open-ended', () => {
  const view = sixWeekView(ranges([
    { start_date: '2026-09-01', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
  ]), TODAY, TODAY);
  assert.equal(describeStandbyOnly(view).headline, 'Standby-only from Sep 1, end unspecified');
  // Never "too short" beside an end that isn't supplied: the two read as a contradiction.
  assert.equal(describeStandbyOnly(view).detail, "Standard stays can't fit");
});

test('no standby-only nights is stated only when every night through the view is covered', () => {
  const covered = sixWeekView(ranges([{ start_date: '2026-09-01', end_date: '2027-09-01', move_in_allowed: true }]), TODAY, TODAY);
  assert.equal(describeStandbyOnly(covered).headline, 'No standby-only nights in the next six weeks');

  const short = sixWeekView(ranges([{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: true }]), TODAY, TODAY);
  // Withheld, not softened: names what is missing and draws no conclusion from it.
  assert.equal(describeStandbyOnly(short).headline, 'Some nights through Oct 23 have no calendar data');
  assert.equal(describeStandbyOnly(short).noGap, false);
  assert.equal(short.days[41].kind, 'not-returned');
});

test('a check-in past the view says so instead of concluding anything', () => {
  const view = sixWeekView(lantana, TODAY, '2026-12-01');
  assert.equal(view.checkInIndex, null);
  assert.equal(describeStandbyOnly(view).headline, 'Your check-in is past this six-week view');
});

test('the strip’s spoken label lists every stretch in words', () => {
  const view = sixWeekView(lantana, TODAY, TODAY);
  assert.equal(view.label, 'Six weeks from Sep 12: Sep 12 – Sep 24 standby-only; Sep 25 move-in blocked; Sep 26 – Oct 23 reserved');
});
