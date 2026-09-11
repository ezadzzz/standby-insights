import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCalendarEvidence, summarizeForReference } from '../src/lib/calendar.js';
import { describeCard } from '../src/content/card-view.js';
import { parseCardSlugFromHref, isStandbySearchPath } from '../src/content/page-adapter.js';
import { observedCards, validClosedCalendarHome } from './fixtures/home-responses.js';

const REFERENCE = '2026-09-15';

function cardFor(rawRanges, { referenceDate = REFERENCE, checkIn = { status: 'none', date: null } } = {}) {
  const calendar = deriveCalendarEvidence({ availability: { ranges: rawRanges } });
  return describeCard({
    evidence: { status: calendar.status, identity: 'confirmed', ranges: calendar.ranges ?? null, isStale: false, checkedAt: 1000 },
    summary: calendar.ranges ? summarizeForReference(calendar.ranges, referenceDate) : null,
    referenceDate,
    checkIn,
  });
}

// --- the route and the locator ---------------------------------------------

test('the observed Standby search route is supported and its cards yield whole slugs', () => {
  assert.equal(isStandbySearchPath('/s/austin-tx/apartments/standby'), true);
  for (const card of observedCards) {
    assert.equal(parseCardSlugFromHref(card.href), card.response.slug);
  }
});

test('a UUID suffix survives the locator unchanged', () => {
  assert.equal(
    parseCardSlugFromHref('/homes/apartment-in-austin-tx-cortland-south-park-terraces-1831-48765205-6241-4d0f-b7f3-2ce083663557'),
    'apartment-in-austin-tx-cortland-south-park-terraces-1831-48765205-6241-4d0f-b7f3-2ce083663557',
  );
});

test('routes and hrefs outside the supported families are not locators', () => {
  assert.equal(isStandbySearchPath('/s/austin-tx/apartments'), false, 'general search is not Standby search');
  assert.equal(isStandbySearchPath('/homes/some-slug/standby'), false, 'the detail route is not the search route');
  assert.equal(parseCardSlugFromHref('/properties/some-building'), null);
  assert.equal(parseCardSlugFromHref('/homes/'), null);
  assert.equal(parseCardSlugFromHref(null), null);
});

// --- what one card says -----------------------------------------------------

test('a reservation covering the reference date is stated with its end for overlap only', () => {
  const view = cardFor([
    { start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: false, unbookable_reason: 'reserved' },
  ]);
  assert.equal(view.readable, true);
  assert.match(view.reservationText, /Reserved on Sep 15, 2026/);
  assert.match(view.reservationText, /through Sep 30, 2026/);
  assert.doesNotMatch(view.reservationText, /available|free|safe|until you/i);
});

test('an upcoming reservation is named by its start date', () => {
  const view = cardFor([
    { start_date: '2026-09-01', end_date: '2026-09-20', move_in_allowed: true },
    { start_date: '2026-09-21', end_date: '2026-10-05', move_in_allowed: false, unbookable_reason: 'reserved' },
  ]);
  assert.match(view.reservationText, /Next reservation Sep 21, 2026/);
});

test('a calendar with no reservation says only what the returned calendar shows', () => {
  const view = cardFor([{ start_date: '2026-09-01', end_date: '2027-09-01', move_in_allowed: true }]);
  assert.match(view.reservationText, /No reservation shown in the returned calendar/);
  assert.doesNotMatch(view.reservationText, /no reservations\b(?! shown)/i);
});

test('standard move-in on the reference date is stated, and its absence is not implied', () => {
  const offered = cardFor([{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: true }]);
  assert.match(offered.moveInText, /Standard move-in offered Sep 15, 2026/);

  const notOffered = cardFor([
    { start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
  ]);
  assert.match(notOffered.moveInText, /No standard move-in offered Sep 15, 2026/);
});

test('a reference date the returned calendar does not cover makes no move-in claim', () => {
  const view = cardFor([{ start_date: '2026-01-01', end_date: '2026-02-01', move_in_allowed: true }]);
  assert.match(view.moveInText, /not covered by the returned calendar/i);
});

test('an unusable calendar shows unavailable, never an absence of reservations', () => {
  const view = describeCard({
    evidence: { status: 'unavailable', identity: 'confirmed', ranges: null, isStale: false, checkedAt: 1000 },
    summary: null,
  });
  assert.equal(view.readable, true);
  assert.equal(view.statusText, 'Calendar unavailable');
  assert.equal(view.reservationText, '', 'no reservation claim is made from an unusable calendar');
  assert.equal(view.moveInText, '');
});

test('an unconfirmed card carries no unit claim and counts as unreadable', () => {
  for (const identity of ['mismatch', 'ambiguous']) {
    const view = describeCard({
      evidence: { status: identity, identity, ranges: null, isStale: false, checkedAt: null },
      summary: null,
    });
    assert.equal(view.readable, false, identity);
    assert.equal(view.reservationText, '');
    assert.equal(view.moveInText, '');
  }
});

test('a card still being read says so without claiming anything about the unit', () => {
  const view = describeCard({
    evidence: { status: 'idle', identity: null, ranges: null, isChecking: true, isStale: false, checkedAt: null },
    summary: null,
  });
  assert.equal(view.readable, true);
  assert.equal(view.statusText, 'Checking…');
  assert.equal(view.reservationText, '', 'a card being read makes no claim yet');
});

test('retained evidence being rechecked is marked an older check, in words not colour', () => {
  const calendar = deriveCalendarEvidence(validClosedCalendarHome);
  const view = describeCard({
    evidence: { status: 'ready', identity: 'confirmed', ranges: calendar.ranges, isChecking: true, isStale: true, checkedAt: 1000 },
    summary: summarizeForReference(calendar.ranges, REFERENCE),
    referenceDate: REFERENCE,
  });
  assert.match(view.noteText, /older check/);
});

// ADR 1: there is always a reference date, and it is labeled when it is not
// the member's own. A card is where that is easiest to get wrong, because it
// has room for a date but not for a sentence explaining it.
test('a card states its date as the check date when the member selected none', () => {
  const view = cardFor([{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: true }], {
    checkIn: { status: 'none', date: null },
  });
  assert.match(view.moveInText, /Sep 15, 2026/);
  assert.match(view.referenceNote, /check date/i);
  assert.doesNotMatch(view.referenceNote, /your selected check-in of/i, 'never stated as the member’s own date');
});

test('a card names the member’s own selected check-in as theirs', () => {
  const view = cardFor([{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: true }], {
    checkIn: { status: 'selected', date: '2026-09-15' },
  });
  assert.match(view.referenceNote, /your selected check-in/i);
});

test('a card whose page and address disagree says no date is treated as selected', () => {
  const view = cardFor([{ start_date: '2026-09-01', end_date: '2026-09-30', move_in_allowed: true }], {
    checkIn: { status: 'disagreement', date: null },
  });
  assert.match(view.referenceNote, /disagree/i);
  assert.doesNotMatch(view.referenceNote, /your selected/i);
});
