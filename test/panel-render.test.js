import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeState } from '../src/panel/render.js';

test('idle state: prompts without asserting anything about a unit', () => {
  const view = describeState({ status: 'idle', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null });
  assert.equal(view.checkTimeText, 'Not checked yet');
  assert.equal(view.grid, null);
  assert.equal(view.headingText, 'Standby evidence');
});

test('mismatched or ambiguous identity attaches no unit-specific claim, including in the heading', () => {
  for (const identity of ['mismatch', 'ambiguous']) {
    const view = describeState({ status: identity, identity, unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
    assert.match(view.identityNote, /could not confirm/i);
    assert.equal(view.grid, null);
    assert.equal(view.headingText, 'Standby evidence');
  }
});

test('unavailable calendar: labeled unavailable, not an empty result, with Refresh as the next step', () => {
  const view = describeState({ status: 'unavailable', identity: 'confirmed', unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
  assert.match(view.calendarStatusText, /^Calendar unavailable\. .*Refresh/);
  assert.equal(view.calendarVisible, true);
});

test('a failed first check says it failed, not that nothing was checked, and names a cause and next step', () => {
  const view = describeState({ status: 'unavailable', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: 'GateTimeoutError' });
  assert.doesNotMatch(view.checkTimeText, /not checked yet/i);
  assert.match(view.checkTimeText, /failed/i);
  assert.match(view.checkTimeText, /network request did not complete/i);
  assert.match(view.checkTimeText, /refresh/i);
});

test('a rate-limited check names that specific cause, not a generic network failure', () => {
  const view = describeState({ status: 'unavailable', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: 'RateLimitedError' });
  assert.match(view.checkTimeText, /asked this extension to slow down/i);
});

test('an unconfirmed unit names its cause and offers Refresh as the next step', () => {
  const view = describeState({ status: 'mismatch', identity: 'mismatch', unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
  assert.match(view.identityNote, /could not confirm/i);
  assert.match(view.identityNote, /refresh/i);
});

test('a mismatched or ambiguous check keeps the last confirmed unit name in the heading', () => {
  for (const identity of ['mismatch', 'ambiguous']) {
    const view = describeState({ status: identity, identity, unitName: 'Lantana Hills 2321', ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
    assert.equal(view.headingText, 'Lantana Hills 2321');
  }
});

test('a mismatched check says the unit could not be confirmed, and renders no calendar section', () => {
  for (const checkedAt of [null, 1000]) {
    const view = describeState({ status: 'mismatch', identity: 'mismatch', unitName: null, ranges: null, checkedAt, isChecking: false, isStale: false, error: null });
    assert.doesNotMatch(view.checkTimeText, /not checked yet/i);
    assert.equal(view.calendarVisible, false);
  }
});

test('loading says the calendar is being checked', () => {
  const view = describeState({ status: 'idle', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: true, isStale: false, error: null });
  assert.match(view.calendarStatusText, /checking the calendar/i);
  assert.equal(view.calendarVisible, true);
  assert.equal(describeState({ status: 'idle', checkedAt: null }).calendarVisible, false, 'no calendar section before any check');
});

test('every returned range is listed chronologically with full dates and status words, including past the six weeks', () => {
  const view = describeState({
    status: 'ready', identity: 'confirmed', checkedAt: 1000, today: '2026-09-12', referenceDate: '2026-09-12', checkIn: { status: 'none', date: null },
    ranges: [
      { startDate: '2027-01-10', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null },
      { startDate: '2026-09-12', endDate: '2026-09-24', moveInAllowed: false, isReservation: false, unbookableReason: 'less_than_minimum_nightly_stay' },
      { startDate: '2026-09-25', endDate: '2027-01-09', moveInAllowed: false, isReservation: true, unbookableReason: 'reserved' },
    ],
  });
  assert.deepEqual(view.allRanges, [
    'Sep 12, 2026 – Sep 24, 2026: Standby-only: too short for a standard stay',
    'Sep 25, 2026 – Jan 9, 2027: Reserved',
    'Jan 10, 2027 – unspecified end: Standard move-in allowed',
  ]);
  assert.deepEqual(describeState({ status: 'unavailable', checkedAt: 1000 }).allRanges, []);
});

test('the price disclosure shows only beside shown prices', () => {
  const comparison = { status: 'ready', median: 2400, count: 12, checkedAt: 1000, subjectPrice: { amount: 2144, label: 'per month', terms: [], note: null } };
  assert.match(describeState({ checkedAt: null, comparison }).comparison.disclosure, /not a prediction/);
  for (const status of ['unavailable', 'insufficient']) {
    assert.equal(describeState({ checkedAt: null, comparison: { ...comparison, status } }).comparison.disclosure, '');
  }
});

test('ready calendar: each grid day names its whole returned range on hover, including an unspecified end', () => {
  const view = describeState({
    status: 'ready', identity: 'confirmed', unitName: 'Lantana Hills 2321', checkedAt: 1000, isChecking: false, isStale: false, error: null,
    today: '2026-09-11', referenceDate: '2026-09-11', checkIn: { status: 'none', date: null },
    ranges: [
      { startDate: '2026-09-11', endDate: '2026-09-11', moveInAllowed: false, isReservation: true, unbookableReason: 'reserved' },
      { startDate: '2026-09-12', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null },
    ],
  });
  assert.equal(view.headingText, 'Lantana Hills 2321');
  assert.equal(view.grid.cells[0].title, 'Sep 11, 2026 – Sep 11, 2026: Reserved');
  assert.equal(view.grid.cells[1].title, 'Sep 12, 2026 – unspecified end: Standard move-in allowed');
});

test('price columns retain source labels and never show a median from incomplete evidence', () => {
  const comparison = { status: 'ready', median: 2400, count: 12, checkedAt: 1000,
    subjectPrice: { amount: 2144, label: null, terms: null, note: null } };
  const view = describeState({ checkedAt: null, comparison }).comparison;
  assert.deepEqual(view.prices, [
    { label: 'This home', amount: '$2,144', unit: 'per month (label not supplied)' },
    { label: 'Median of 12 similar homes', amount: '$2,400', unit: 'per month' },
  ]);
  assert.match(view.scopeText, /12 other homes.*same market and bedroom count/i);
  assert.match(view.termsNote, /not supplied/);
  for (const status of ['loading', 'unavailable', 'insufficient', 'unresolved-scope', 'idle']) {
    assert.deepEqual(describeState({ checkedAt: null, comparison: { ...comparison, status } }).comparison.prices, []);
  }
  const missing = describeState({ checkedAt: null, comparison: { ...comparison, subjectPrice: null } }).comparison;
  assert.equal(missing.prices[0].amount, 'Unavailable');
  assert.match(missing.subjectText, /no eligible advertised monthly price/);
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
  assert.match(view.refreshFailedNote, /last refresh failed/i);
  assert.match(view.refreshFailedNote, /network request did not complete/i);
  assert.match(view.refreshFailedNote, /refresh/i);
});

const factsState = (facts, overrides = {}) => ({
  status: 'ready', identity: 'confirmed', unitName: 'Facts Unit 1', ranges: [],
  checkedAt: 1000, isChecking: false, isStale: false, error: null, facts, ...overrides,
});

const factText = (view, label) => view.factItems.find((item) => item.label === label)?.text;

test('complete facts are stated in the specification order, after the calendar', () => {
  const view = describeState(factsState({
    minimumStay: 30,
    flexOptions: [{ label: '6-Month+ Stay', months: 6, committedNights: 180, specialOffer: false, earlyTerminationFeeType: 'one-month-rent', extra: [] }],
    rating: { average: 4.15, count: 13 },
    scores: {
      walk: { value: 41, description: 'Car-Dependent' },
      transit: { value: 29, description: 'Some Transit' },
      bike: { value: 52, description: 'Bikeable' },
    },
  }));
  assert.deepEqual(view.factItems.map((item) => item.label), ['Minimum stay', 'Flex', 'Rating', 'Walk score', 'Transit score', 'Bike score']);
  assert.match(factText(view, 'Minimum stay'), /30 nights/);
  assert.match(factText(view, 'Flex'), /no special offer/i);
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
  assert.match(view.calendarStatusText, /^Calendar unavailable/);
  assert.match(factText(view, 'Minimum stay'), /30 nights/);
  assert.match(factText(view, 'Rating'), /4\.8/);
});

test('no facts section is offered before a check, or when identity is unconfirmed', () => {
  assert.deepEqual(describeState({ status: 'idle', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null, facts: null }).factItems, []);
  assert.deepEqual(describeState({ status: 'mismatch', identity: 'mismatch', unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null, facts: null }).factItems, []);
});

test('a one-night minimum reads as a night, and a rating states no scale the response did not supply', () => {
  const view = describeState(factsState({
    minimumStay: 1, flexOptions: null, rating: { average: 4.15, count: 1 },
    scores: { walk: null, transit: null, bike: null },
  }));
  assert.match(factText(view, 'Minimum stay'), /\b1 night\b/);
  assert.doesNotMatch(factText(view, 'Minimum stay'), /nights/);
  assert.match(factText(view, 'Rating'), /1 review\b/);
  assert.doesNotMatch(factText(view, 'Rating'), /out of/i);
});

const flexFactsState = (flexOptions) => factsState({
  minimumStay: null, flexOptions, rating: null, scores: { walk: null, transit: null, bike: null },
});
const flexItem = (state) => describeState(state).factItems.find((item) => item.label === 'Flex');

const term = (over = {}) => ({
  label: '6-Month+ Stay', months: 6, committedNights: 180,
  specialOffer: false, earlyTerminationFeeType: 'one-month-rent', extra: [], ...over,
});

test('a special offer on any Flex term is stated up front, with the term that carries it', () => {
  const item = flexItem(flexFactsState([
    term(),
    term({ label: '12-Month+ Stay', months: 12, committedNights: 365, specialOffer: true, earlyTerminationFeeType: 'two-months-rent' }),
  ]));
  assert.match(item.text, /special offer advertised on 1 of 2/i);
  assert.equal(item.details.filter((line) => /Stay/.test(line)).length, 2, 'one detail line per supplied term');
  assert.match(item.details[1], /12-Month\+ Stay/);
  assert.match(item.details[1], /special offer/i);
  assert.match(item.details[0], /no special offer/i);
  assert.match(item.details[0], /180 committed nights/);
  assert.doesNotMatch(item.details[0], /committed_nights|special_offer/, 'raw response keys are never shown to the member');
});

test('every term supplying a false special offer says so, since the response stated it', () => {
  const item = flexItem(flexFactsState([term(), term({ label: '12-Month+ Stay', months: 12 })]));
  assert.match(item.text, /no special offer/i);
  assert.doesNotMatch(item.text, /1 of 2/);
});

test('a Flex term that never supplied the field is unknown, not an absent special offer', () => {
  const item = flexItem(flexFactsState([term({ specialOffer: null })]));
  assert.doesNotMatch(item.text, /no special offer/i);
  assert.match(item.text, /not supplied|unknown/i);
});

test('the panel states no bump risk, ranking, or tenure claim from a special offer', () => {
  const item = flexItem(flexFactsState([term({ specialOffer: true })]));
  assert.doesNotMatch(`${item.text} ${item.details.join(' ')}`, /bump|risk|likel|protected|guarantee|safe/i);
});

test('fields outside the sampled shape reach the member without raw key underscores', () => {
  const item = flexItem(flexFactsState([term({ extra: ['brand new field: kept'] })]));
  assert.match(item.details[0], /brand new field: kept/);
});

test('an advertised term offer is not stated as a price the member will receive', () => {
  const item = flexItem(flexFactsState([term(), term({ label: '12-Month+ Stay', months: 12, specialOffer: true })]));
  assert.match(item.text, /advertised/i);
  const all = `${item.text} ${item.details.join(' ')}`;
  assert.match(all, /not a quoted price/i);
  assert.match(all, /move-in date/i);
});

test('with no advertised offer, no quote caveat is raised', () => {
  const item = flexItem(flexFactsState([term(), term({ label: '12-Month+ Stay', months: 12 })]));
  assert.match(item.text, /no special offer advertised/i);
  assert.doesNotMatch(item.details.join(' '), /quoted price/i);
});

test('ready calendar: leads with the standby-only headline and a six-week grid marking today and the selected check-in', () => {
  const view = describeState({
    status: 'ready', identity: 'confirmed', unitName: 'Lantana Hills 2321', checkedAt: 1000, isChecking: false, isStale: false, error: null,
    today: '2026-09-12', referenceDate: '2026-09-15', checkIn: { status: 'selected', date: '2026-09-15' },
    ranges: [
      { startDate: '2026-09-12', endDate: '2026-09-24', moveInAllowed: false, isReservation: false, unbookableReason: 'less_than_minimum_nightly_stay' },
      { startDate: '2026-09-25', endDate: '2026-10-30', moveInAllowed: false, isReservation: true, unbookableReason: 'reserved' },
    ],
  });
  assert.equal(view.standbyOnly.headline, 'Standby-only thru Sep 24');
  assert.equal(view.grid.leadingBlanks, 6, 'Sep 12, 2026 is a Saturday');
  assert.equal(view.grid.cells.length, 42);
  assert.deepEqual(view.grid.cells[0], { dayText: 'Sep 12', kind: 'standby-only', isToday: true, isCheckIn: false, title: 'Sep 12, 2026 – Sep 24, 2026: Standby-only: too short for a standard stay' });
  assert.equal(view.grid.cells[3].isCheckIn, true);
  assert.equal(view.grid.cells[19].dayText, 'Oct 1');
  assert.match(view.grid.label, /standby-only/);
  assert.match(view.grid.label, /Your check-in, Sep 15, 2026, is marked$/);
  assert.equal(view.referenceNote, 'Your check-in: Sep 15, 2026.');
  assert.deepEqual(view.grid.key.map((k) => k.text), ['Standby-only', 'Reserved', 'Today', 'Your check-in']);
});

test('the grid marks no check-in when the date is only the check date, and the legend drops that key too', () => {
  const view = describeState({
    status: 'ready', identity: 'confirmed', checkedAt: 1000, today: '2026-09-12', referenceDate: '2026-09-12', checkIn: { status: 'none', date: null },
    ranges: [{ startDate: '2026-09-01', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null }],
  });
  assert.equal(view.grid.cells.some((cell) => cell.isCheckIn), false);
  assert.doesNotMatch(view.grid.label, /check-in/i);
  assert.deepEqual(view.grid.key.map((k) => k.kind), ['move-in', 'today']);
});

test('the legend lists only marks the grid draws, so a single-kind calendar keys just that kind plus Today', () => {
  const view = describeState({
    status: 'ready', identity: 'confirmed', checkedAt: 1000, today: '2026-09-12', referenceDate: '2026-09-12', checkIn: { status: 'none', date: null },
    ranges: [{ startDate: '2026-09-01', endDate: '2026-10-30', moveInAllowed: false, isReservation: false, unbookableReason: null }],
  });
  assert.deepEqual(view.grid.key.map((k) => k.kind), ['blocked', 'today']);
  assert.deepEqual(view.grid.key.map((k) => k.text), ['Move-in blocked', 'Today']);
});

test('an older check leaves the six-week headline plain, and not-returned days are their own kind', () => {
  const state = {
    status: 'ready', identity: 'confirmed', unitName: null, checkedAt: 1000, isChecking: false, error: null,
    today: '2026-09-11', referenceDate: '2026-09-11', checkIn: { status: 'none', date: null },
    ranges: [{ startDate: '2026-09-11', endDate: '2026-09-20', moveInAllowed: true, isReservation: false, unbookableReason: null }],
  };
  const fresh = describeState({ ...state, isStale: false });
  const stale = describeState({ ...state, isStale: true });
  assert.equal(stale.standbyOnly.headline, fresh.standbyOnly.headline);
  assert.match(stale.checkTimeText, /older check/i);
  const missing = fresh.grid.cells[10];
  assert.equal(missing.kind, 'not-returned');
  assert.equal(missing.title, 'No calendar data for this day');
});
