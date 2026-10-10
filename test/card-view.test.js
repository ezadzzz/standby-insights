import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCalendarEvidence, summarizeForReference } from '../src/lib/calendar.js';
import { describeCard, numericDate } from '../src/content/card-view.js';
import { parseCardSlugFromHref, isStandbySearchPath } from '../src/content/page-adapter.js';
import { observedCards, validClosedCalendarHome } from './fixtures/home-responses.js';

const REFERENCE = '2026-09-15';

function cardFor(rawRanges, { referenceDate = REFERENCE, checkIn = { status: 'none', date: null } } = {}) {
  const calendar = deriveCalendarEvidence({ availability: { ranges: rawRanges } });
  return describeCard({
    evidence: { status: calendar.status, identity: 'confirmed', ranges: calendar.ranges ?? null, isStale: false, checkedAt: 1000 },
    summary: calendar.ranges ? summarizeForReference(calendar.ranges, referenceDate) : null,
    referenceDate,
    today: REFERENCE,
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

test('a reservation on the reference date leads the card, and the standby-only negative drops to the detail', () => {
  const raw = [
    { start_date: '2026-09-01', end_date: '2026-10-30', move_in_allowed: false, unbookable_reason: 'reserved' },
  ];
  const today = cardFor(raw);
  assert.equal(today.readable, true);
  assert.equal(today.headlineText, 'Reserved today, Sep 15', 'the check date is labeled, not presented as the member’s');
  assert.equal(today.detailText, 'No standby-only nights in the next six weeks');

  const selected = cardFor(raw, { referenceDate: '2026-09-20', checkIn: { status: 'selected', date: '2026-09-20' } });
  assert.equal(selected.headlineText, 'Reserved on your check-in, Sep 20');
  // No end date and no glossary caveat on a card: the strip shows the overlap.
  assert.doesNotMatch(`${selected.headlineText} ${selected.detailText}`, /Oct 30|overlap|available|free|safe|until you/i);
});

test('an upcoming reservation is named by its start date', () => {
  const view = cardFor([
    { start_date: '2026-09-01', end_date: '2026-09-20', move_in_allowed: true },
    { start_date: '2026-09-21', end_date: '2026-10-05', move_in_allowed: false, unbookable_reason: 'reserved' },
    { start_date: '2026-10-06', end_date: '2027-09-01', move_in_allowed: true },
  ]);
  assert.equal(view.headlineText, 'Next reservation Sep 21');
  assert.equal(view.quiet, true, 'a card without a gap drops to one quiet line');
  assert.equal(view.detailText, '', 'the repeated standby-only negative is not said on the card');
});

test('a calendar with no reservation says only that none is shown', () => {
  const view = cardFor([{ start_date: '2026-09-01', end_date: '2027-09-01', move_in_allowed: true }]);
  assert.equal(view.headlineText, 'No reservation shown');
  assert.equal(view.quiet, true);
  assert.doesNotMatch(view.headlineText, /no reservations\b(?! shown)/i);
});

test('a standby-only gap leads the card in words, with the reservation that shortens it', () => {
  const view = cardFor([
    { start_date: '2026-09-01', end_date: '2026-09-24', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
    { start_date: '2026-09-25', end_date: '2026-10-30', move_in_allowed: false, unbookable_reason: 'reserved' },
  ]);
  assert.equal(view.isStandbyOnly, true);
  assert.equal(view.quiet, false, 'a gap stays as loud as ever');
  assert.equal(view.headlineText, 'Standby-only through Sep 24');
  assert.match(view.detailText, /Next reservation blocks/);
  assert.doesNotMatch(`${view.headlineText} ${view.detailText}`, /protect|guarantee|safe|bump/i);
});

test('a card says the check-in is reserved even when a standby-only gap follows it', () => {
  const view = cardFor([
    { start_date: '2026-09-01', end_date: '2026-09-14', move_in_allowed: true },
    { start_date: '2026-09-15', end_date: '2026-09-17', move_in_allowed: false, unbookable_reason: 'reserved' },
    { start_date: '2026-09-18', end_date: '2026-09-24', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
    { start_date: '2026-09-25', end_date: '2026-10-30', move_in_allowed: false, unbookable_reason: 'reserved' },
  ], { checkIn: { status: 'selected', date: REFERENCE } });
  assert.equal(view.headlineText, 'Standby-only Sep 18 – Sep 24');
  assert.equal(view.detailText, "Reserved on your check-in, Sep 15. Next reservation blocks standard stays*");
  assert.equal(view.footnoteText, "* Reservation dates can change.");
});

test('a card without a standby-only gap keeps its reservation fact and never implies one', () => {
  const view = cardFor([{ start_date: '2026-01-01', end_date: '2026-02-01', move_in_allowed: true }]);
  assert.equal(view.isStandbyOnly, false);
  assert.equal(view.headlineText, 'Some nights through Oct 26 have no calendar data');
  // Withheld, not found: as quiet as the no-gap line, so cards with a gap stand out.
  assert.equal(view.quiet, true);
});

test('the check-in marker appears only for the member’s own selected date', () => {
  const raw = [{ start_date: '2026-09-01', end_date: '2027-09-01', move_in_allowed: true }];
  assert.equal(cardFor(raw).strip.checkInIndex, null);
  const selected = cardFor(raw, { referenceDate: '2026-09-20', checkIn: { status: 'selected', date: '2026-09-20' } });
  assert.equal(selected.strip.checkInIndex, 5);
  assert.match(selected.strip.label, /^Six weeks from Sep 15/);
  assert.match(selected.strip.label, /Your check-in, Sep 20, is marked$/, 'the spoken label names the marked date');
  assert.doesNotMatch(cardFor(raw).strip.label, /check-in/);
});

test('the strip key names only the marks this strip draws', () => {
  const raw = [
    { start_date: '2026-09-01', end_date: '2026-09-24', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
    { start_date: '2026-09-25', end_date: '2026-10-05', move_in_allowed: false, unbookable_reason: 'reserved' },
  ];
  const keyText = (view) => view.strip.key.map((k) => k.text);
  assert.deepEqual(keyText(cardFor(raw)), ['Standby-only', 'Unavailable', 'No calendar data']);
  const selected = cardFor(raw, { referenceDate: '2026-09-20', checkIn: { status: 'selected', date: '2026-09-20' } });
  assert.equal(keyText(selected).at(-1), 'Your check-in');
});

test('a card draws reservations and other blocks as one unavailable mark; the panel gives the reason', () => {
  const raw = [
    { start_date: '2026-09-01', end_date: '2026-10-30', move_in_allowed: false },
  ];
  const view = cardFor(raw);
  assert.match(view.headlineText, /^No reservation shown/);
  assert.deepEqual(view.strip.key.map((k) => k.kind), ['unavailable']);
  const both = cardFor([
    { start_date: '2026-09-01', end_date: '2026-09-20', move_in_allowed: false, unbookable_reason: 'reserved' },
    { start_date: '2026-09-21', end_date: '2026-10-30', move_in_allowed: false },
  ]);
  assert.deepEqual(both.strip.segments.map((s) => [s.kind, s.days]), [['unavailable', 42]], 'adjacent blocks merge into one stretch');
});

test('a card with a reservation before the check-in names the date its absence runs from', () => {
  const raw = [
    { start_date: '2026-09-01', end_date: '2026-09-17', move_in_allowed: true },
    { start_date: '2026-09-18', end_date: '2026-09-20', move_in_allowed: false, unbookable_reason: 'reserved' },
    { start_date: '2026-09-21', end_date: '2026-12-30', move_in_allowed: true },
  ];
  const view = cardFor(raw, { referenceDate: '2026-10-01', checkIn: { status: 'selected', date: '2026-10-01' } });
  assert.ok(view.strip.key.some((k) => k.kind === 'unavailable'), 'the Sep 18 reservation is still drawn');
  assert.equal(view.headlineText, 'No reservation shown from Oct 1');
});

test('an unusable calendar shows unavailable, never an absence of reservations', () => {
  const view = describeCard({
    evidence: { status: 'unavailable', identity: 'confirmed', ranges: null, isStale: false, checkedAt: 1000 },
    summary: null,
  });
  assert.equal(view.readable, true);
  assert.equal(view.statusText, 'Calendar unavailable');
  assert.equal(view.detailText, '', 'no reservation claim is made from an unusable calendar');
  assert.equal(view.strip, null);
});

test('an unconfirmed card carries no unit claim and counts as unreadable', () => {
  for (const identity of ['mismatch', 'ambiguous']) {
    const view = describeCard({
      evidence: { status: identity, identity, ranges: null, isStale: false, checkedAt: null },
      summary: null,
    });
    assert.equal(view.readable, false, identity);
    assert.equal(view.detailText, '');
    assert.equal(view.strip, null);
  }
});

test('a card still being read says so without claiming anything about the unit', () => {
  const view = describeCard({
    evidence: { status: 'idle', identity: null, ranges: null, isChecking: true, isStale: false, checkedAt: null },
    summary: null,
  });
  assert.equal(view.readable, true);
  assert.equal(view.statusText, 'Checking…');
  assert.equal(view.detailText, '', 'a card being read makes no claim yet');
});

test('retained evidence being rechecked is marked an older check, in words not colour', () => {
  const calendar = deriveCalendarEvidence(validClosedCalendarHome);
  const view = describeCard({
    evidence: { status: 'ready', identity: 'confirmed', ranges: calendar.ranges, isChecking: true, isStale: true, checkedAt: 1000 },
    summary: summarizeForReference(calendar.ranges, REFERENCE),
    referenceDate: REFERENCE,
    today: REFERENCE,
  });
  assert.match(view.noteText, /older check/i);
});

// ADR 1: there is always a reference date. A card names it without a
// sentence: the strip's Today edge, and a marker only for the member's own date.
test('a card whose page and address disagree marks no check-in', () => {
  const view = cardFor([{ start_date: '2026-09-01', end_date: '2026-10-30', move_in_allowed: true }], {
    checkIn: { status: 'disagreement', date: null },
  });
  assert.equal(view.strip.checkInIndex, null);
  assert.equal(view.headlineText, 'No reservation shown');
});

test('an older check leaves the headline plain and names its check time in the note', () => {
  const calendar = deriveCalendarEvidence(validClosedCalendarHome);
  const base = {
    summary: summarizeForReference(calendar.ranges, REFERENCE),
    referenceDate: REFERENCE,
    today: REFERENCE,
  };
  const evidence = { status: 'ready', identity: 'confirmed', ranges: calendar.ranges, isChecking: false, checkedAt: 1000 };
  const fresh = describeCard({ ...base, evidence: { ...evidence, isStale: false } });
  const stale = describeCard({ ...base, evidence: { ...evidence, isStale: true } });
  assert.equal(stale.headlineText, fresh.headlineText);
  assert.equal(fresh.noteText, '');
  assert.match(stale.noteText, /^Older check · checked [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}\s[AP]M$/);
});

test('the strip hover names a day by month and day only, counted from the strip start', () => {
  assert.equal(cardFor([{ start_date: REFERENCE, end_date: null, move_in_allowed: true }]).strip.startDate, REFERENCE);
  assert.equal(numericDate('2026-09-05'), '9/5');
  assert.equal(numericDate('2026-10-14'), '10/14');
});
