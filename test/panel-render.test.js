import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeState } from '../src/panel/render.js';

test('no subject: one sentence says how to choose a home, and nothing claims a unit or offers Refresh', () => {
  const view = describeState({ status: 'idle', slug: null, identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null });
  assert.equal(view.noSubject, true);
  assert.equal(view.headingText, 'No home selected');
  assert.equal(view.nextStepText, 'Open a home’s Standby page, or press View evidence on a card.');
  assert.equal(view.checkTimeText, '');
  assert.equal(view.grid, null);
  assert.equal(view.calendarVisible, false);
  assert.deepEqual(view.demandRows, []);
});

test('once there is a subject, the no-subject state never shows', () => {
  const base = { slug: 'lantana-hills-2321', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null };
  const idle = describeState({ ...base, status: 'idle' });
  assert.equal(idle.noSubject, false);
  assert.equal(idle.nextStepText, '');
  assert.equal(idle.checkTimeText, 'Not checked yet');
  assert.equal(idle.headingText, 'This listing');
  // A check started or failed without a slug yet is still not "no home selected".
  assert.equal(describeState({ ...base, slug: null, status: 'idle', isChecking: true }).noSubject, false);
  assert.equal(describeState({ ...base, slug: null, status: 'unavailable', error: 'GateTimeoutError' }).noSubject, false);
});

test('mismatched or ambiguous identity attaches no unit-specific claim, including in the heading', () => {
  for (const identity of ['mismatch', 'ambiguous']) {
    const view = describeState({ status: identity, identity, unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
    assert.match(view.identityNote, /could not confirm/i);
    assert.equal(view.grid, null);
    assert.equal(view.headingText, 'This listing');
  }
});

test('unavailable calendar: labeled unavailable, not an empty result, with Refresh as the next step', () => {
  const view = describeState({ status: 'unavailable', identity: 'confirmed', unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
  assert.match(view.calendarStatusText, /^Calendar unavailable\. .*Refresh/);
  assert.equal(view.calendarVisible, true);
});

test('a failed first check says it failed, not that nothing was checked, and names a cause and next step', () => {
  const view = describeState({ status: 'unavailable', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: 'GateTimeoutError' });
  assert.equal(view.checkTimeText, '');
  assert.match(view.refreshNote, /failed/i);
  assert.match(view.refreshNote, /network request did not complete/i);
  assert.match(view.refreshNote, /refresh/i);
});

test('a rate-limited check names that specific cause, not a generic network failure', () => {
  const view = describeState({ status: 'unavailable', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: 'RateLimitedError' });
  assert.match(view.refreshNote, /asked this extension to slow down/i);
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
    'Sep 12 – Sep 24: Standby-only, too short for a standard stay',
    'Sep 25 – Jan 9: Reserved',
    'Jan 10 – unspecified end: Standard move-in allowed',
  ]);
  assert.deepEqual(describeState({ status: 'unavailable', checkedAt: 1000 }).allRanges, []);
});

test('the price disclosure shows only beside shown prices, and names its scope', () => {
  const comparison = { status: 'ready', median: 2400, count: 12, checkedAt: 1000, subjectPrice: { amount: 2144, label: 'per month', terms: ['6 months'], note: null } };
  const ready = describeState({ checkedAt: null, comparison }).comparison;
  assert.match(ready.disclosure, /Not a quote for your dates/);
  assert.match(ready.disclosure, /other homes in this market with the same number of bedrooms/);
  for (const status of ['unavailable', 'insufficient']) {
    assert.equal(describeState({ checkedAt: null, comparison: { ...comparison, status } }).comparison.disclosure, '');
  }
});

test('the price row and its tip state facts only, under one name for the price', () => {
  const comparison = { status: 'ready', median: 2400, count: 12, checkedAt: 1000, subjectPrice: { amount: 2144, label: 'per month', terms: [], note: null } };
  for (const amount of [2144, 2520]) {
    const [row] = describeState({ checkedAt: null, comparison: { ...comparison, subjectPrice: { ...comparison.subjectPrice, amount } } }).demandRows;
    assert.doesNotMatch(row.value, /demand|bookings/i);
    assert.equal(row.label, 'Flex price');
    assert.equal(row.tip, 'This home’s Flex price against the median of other homes in this market with the same number of bedrooms. Not a quote for your dates.');
    assert.doesNotMatch(row.tip, /may draw|bookings|lower|demand|Listed Flex rate/i);
  }
});

test('the price difference is plain arithmetic on the shown, rounded figures', () => {
  const comparison = { status: 'ready', median: 2400, count: 12, checkedAt: 1000, subjectPrice: { amount: 2144, label: 'per month', terms: [], note: null } };
  const difference = (overrides) => describeState({ checkedAt: null, comparison: { ...comparison, ...overrides } }).comparison.differenceText;
  assert.equal(difference({}), '$256 below the median');
  assert.equal(difference({ subjectPrice: { ...comparison.subjectPrice, amount: 2520 } }), '$120 above the median');
  // $2,400.40 shows as $2,400, so it must not read as $0 above.
  assert.equal(difference({ subjectPrice: { ...comparison.subjectPrice, amount: 2400.4 } }), 'Same as the median');
  assert.equal(difference({ subjectPrice: null }), '');
  assert.equal(difference({ status: 'insufficient' }), '');
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
  assert.equal(view.grid.cells[0].title, 'Sep 11: Reserved');
  assert.equal(view.grid.cells[1].title, 'Sep 12 – unspecified end: Standard move-in allowed');
});

test('price columns retain source labels and never show a median from incomplete evidence', () => {
  const comparison = { status: 'ready', median: 2400, count: 12, checkedAt: 1000,
    subjectPrice: { amount: 2144, label: null, terms: null, note: null } };
  const view = describeState({ checkedAt: null, comparison }).comparison;
  assert.deepEqual(view.prices, [
    { label: 'This home', amount: '$2,144', unit: 'per month (label not supplied)' },
    { label: 'Median of 12 other homes', amount: '$2,400', unit: 'per month' },
  ]);
  for (const status of ['loading', 'unavailable', 'insufficient', 'unresolved-scope', 'idle']) {
    assert.deepEqual(describeState({ checkedAt: null, comparison: { ...comparison, status } }).comparison.prices, []);
  }
  const missing = describeState({ checkedAt: null, comparison: { ...comparison, subjectPrice: null } }).comparison;
  // "Unavailable" is the calendar's word for reserved or blocked days.
  assert.equal(missing.prices[0].amount, 'Not supplied');
  assert.match(missing.subjectText, /doesn’t list a monthly price/);
});

test('stale evidence during a recheck is labeled an older check', () => {
  const view = describeState({ status: 'ready', identity: 'confirmed', ranges: [], checkedAt: 1000, isChecking: true, isStale: true, error: null });
  assert.match(view.refreshNote, /checking again.*older check/i);
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
  assert.match(view.refreshNote, /last refresh failed.*older check/i);
  assert.match(view.refreshNote, /network request did not complete/i);
  assert.match(view.refreshNote, /refresh to try again/i);
});

test('each loading or failure state says exactly one status sentence, and the check-time line never restates it', () => {
  const base = { identity: null, unitName: null, displayedName: 'Lantana Hills 2321', ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null };
  const states = {
    loading: { status: 'idle', isChecking: true },
    recheckAfterFailure: { status: 'unavailable', isChecking: true },
    firstCheckFailed: { status: 'unavailable', error: 'GateTimeoutError' },
    calendarUnavailable: { status: 'unavailable', identity: 'confirmed', checkedAt: 1000 },
    mismatch: { status: 'mismatch', identity: 'mismatch', checkedAt: 1000 },
    ambiguousUnchecked: { status: 'ambiguous', identity: 'ambiguous' },
    recheckingHeld: { status: 'mismatch', identity: 'mismatch', checkedAt: 1000, isChecking: true, isStale: true },
    refreshFailedHeld: { status: 'unavailable', identity: 'confirmed', checkedAt: 1000, isStale: true, error: 'RateLimitedError' },
  };
  for (const [name, overrides] of Object.entries(states)) {
    const view = describeState({ ...base, ...overrides });
    const sentences = [view.refreshNote, view.identityNote, view.calendarStatusText].filter(Boolean);
    assert.equal(sentences.length, 1, name);
    assert.match(view.checkTimeText, /^(Checked [^.]*)?$/, name);
    assert.ok((sentences[0].match(/Refresh/g) ?? []).length <= 1, `${name} names Refresh once`);
  }
});

test('the reference note says "today" only when the reference date is today', () => {
  const note = (checkIn, today) => describeState({ status: 'ready', identity: 'confirmed', ranges: [], checkedAt: 1000, today, referenceDate: '2026-09-15', checkIn }).referenceNote;
  assert.match(note({ status: 'disagreement' }, '2026-09-15'), /against today, Sep 15/);
  assert.match(note({ status: 'disagreement' }, '2026-09-12'), /against Sep 15\./);
  assert.doesNotMatch(note({ status: 'none' }, '2026-09-12'), /today/);
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
  assert.deepEqual(view.factItems.map((item) => item.label), ['Minimum stay', 'Rating', 'Walk score', 'Transit score', 'Bike score']);
  assert.match(factText(view, 'Minimum stay'), /30 nights/);
  assert.match(view.flex.text, /no offer advertised/i);
  assert.match(factText(view, 'Rating'), /4\.15/);
  assert.match(factText(view, 'Rating'), /13 reviews/);
  assert.match(factText(view, 'Walk score'), /41/);
  assert.match(factText(view, 'Walk score'), /Car-Dependent/);
  assert.match(factText(view, 'Bike score'), /52/);
});

test('each absent fact is independently not supplied, and none reads as favorable', () => {
  const view = describeState(factsState({
    minimumStay: null, flexOptions: null, rating: null,
    scores: { walk: null, transit: null, bike: null },
  }));
  assert.equal(view.factItems.length, 5);
  for (const item of [...view.factItems, { label: 'Flex', text: view.flex.text }]) {
    assert.equal(item.text, 'Not supplied', `${item.label} must say not supplied`);
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
  assert.equal(view.flex.text, 'Not supplied');
  assert.equal(factText(view, 'Rating'), 'Not supplied');
  // A tile never says "Unavailable", which the calendar uses for reserved or blocked days.
  for (const label of ['Rating', 'Transit score', 'Bike score']) {
    assert.equal(view.factItems.find((item) => item.label === label).value, 'Not supplied');
  }
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
  assert.match(view.flex.text, /no Flex terms/i);
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
const flexItem = (state) => describeState(state).flex;

const term = (over = {}) => ({
  label: '6-Month+ Stay', months: 6, committedNights: 180,
  specialOffer: false, earlyTerminationFeeType: 'one-month-rent', extra: [], ...over,
});

test('a special offer on any Flex term is stated up front, with no verdict attached', () => {
  const item = flexItem(flexFactsState([
    term(),
    term({ label: '12-Month+ Stay', months: 12, committedNights: 365, specialOffer: true, earlyTerminationFeeType: 'two-months-rent' }),
  ]));
  assert.equal(item.text, 'Offer advertised on 1 of 2 terms');
  assert.equal(flexItem(flexFactsState([term({ specialOffer: true })])).text, 'Offer advertised');
  assert.deepEqual(Object.keys(item), ['text', 'tip']);
});

test('every term supplying a false special offer says so, since the response stated it', () => {
  const item = flexItem(flexFactsState([term(), term({ label: '12-Month+ Stay', months: 12 })]));
  assert.equal(item.text, 'No offer advertised');
});

test('a Flex term that never supplied the field is unknown, not an absent special offer', () => {
  const item = flexItem(flexFactsState([term({ specialOffer: null })]));
  assert.doesNotMatch(item.text, /no offer/i);
  assert.match(item.text, /not supplied/i);
});

test('demand signals use none of the forbidden vocabulary and call an offer advertised', () => {
  const state = { ...flexFactsState([term({ specialOffer: true })]), facts: { ...flexFactsState([term({ specialOffer: true })]).facts, minimumStay: 30 },
    comparison: { status: 'ready', median: 2400, count: 12, checkedAt: 1000, subjectPrice: { amount: 2144, label: 'per month', terms: [], note: null } } };
  const rows = describeState(state).demandRows;
  assert.deepEqual(rows.map((row) => row.label), ['Flex price', 'Flex offer', 'Minimum stay']);
  assert.match(rows[1].value, /advertised/i);
  assert.match(rows[0].sub, /\$2,144 vs\. \$2,400 median · 12 other homes/);
  assert.match(rows[2].tip, /shorter minimum stay/i);
  for (const row of rows) assert.doesNotMatch(`${row.value} ${row.sub} ${row.tip}`, /bump|risk|protected|guarantee|safe/i);
});

test('a comparison that is not ready is a short muted value with its full reason in the tip', () => {
  const state = { checkedAt: null, comparison: { status: 'insufficient', count: 4, checkedAt: null } };
  const [row] = describeState(state).demandRows;
  assert.equal(row.value, 'Too few other homes (4 priced, 5 needed)');
  assert.equal(row.muted, true);
  assert.match(row.tip, /Only 4 other homes listed a price/);
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
  assert.equal(view.standbyOnly.headline, 'Standby-only through Sep 24');
  // The condition sits under the headline where the member decides, not behind "About these marks".
  assert.equal(view.standbyOnly.detail, "Too few nights for a standard stay");
  assert.equal(view.standbyOnly.explainer, 'Only Standby can book these nights. If the reservation after them moves or is cancelled, a standard stay may fit.');
  assert.doesNotMatch(`${view.standbyOnly.detail} ${view.standbyOnly.explainer}`, /LOS|protect|safe until|guarantee|bump/i);
  assert.equal(view.grid.leadingBlanks, 6, 'Sep 12 is a Saturday');
  assert.equal(view.grid.cells.length, 42);
  // No month on today: "Sep 12" wrapped at 320px; the month shows on the 1st.
  assert.deepEqual(view.grid.cells[0], { dayText: '12', kind: 'standby-only', isToday: true, isCheckIn: false, title: 'Sep 12 – Sep 24: Standby-only, too short for a standard stay' });
  assert.equal(view.grid.cells[3].isCheckIn, true);
  assert.equal(view.grid.cells[19].dayText, 'Oct 1');
  assert.match(view.grid.label, /standby-only/);
  assert.match(view.grid.label, /Your check-in, Sep 15, is marked$/);
  assert.equal(view.referenceNote, 'Your check-in: Sep 15.');
  assert.deepEqual(view.grid.key.map((k) => k.text), ['Standby-only', 'Unavailable', 'Today', 'Your check-in']);
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
  assert.deepEqual(view.grid.key.map((k) => k.kind), ['unavailable', 'today']);
  assert.deepEqual(view.grid.key.map((k) => k.text), ['Unavailable', 'Today']);
});

test('the marks explainer explains only marks the grid draws', () => {
  const at = (ranges) => describeState({
    status: 'ready', identity: 'confirmed', checkedAt: 1000, today: '2026-09-12', referenceDate: '2026-09-12', checkIn: { status: 'none', date: null }, ranges,
  }).grid.marksExplainer;
  assert.equal(at([{ startDate: '2026-09-01', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null }]), '');
  const blocked = at([{ startDate: '2026-09-01', endDate: null, moveInAllowed: false, isReservation: false, unbookableReason: null }]);
  assert.match(blocked, /^Unavailable means/);
  assert.doesNotMatch(blocked, /No calendar data/);
  const missing = at([{ startDate: '2026-09-01', endDate: '2026-09-20', moveInAllowed: true, isReservation: false, unbookableReason: null }]);
  assert.match(missing, /^No calendar data means/);
  assert.doesNotMatch(missing, /Unavailable/);
});

test('an older check leaves the six-week headline plain, and not-returned days are their own kind', () => {
  const state = {
    status: 'ready', identity: 'confirmed', unitName: null, checkedAt: 1000, isChecking: false, error: null,
    today: '2026-09-11', referenceDate: '2026-09-11', checkIn: { status: 'none', date: null },
    ranges: [{ startDate: '2026-09-11', endDate: '2026-09-20', moveInAllowed: true, isReservation: false, unbookableReason: null }],
  };
  const fresh = describeState({ ...state, isStale: false });
  const stale = describeState({ ...state, isStale: true, error: 'GateTimeoutError' });
  assert.equal(stale.standbyOnly.headline, fresh.standbyOnly.headline);
  assert.match(stale.refreshNote, /older check/i);
  const missing = fresh.grid.cells[10];
  assert.equal(missing.kind, 'not-returned');
  assert.equal(missing.title, 'No calendar data for this day');
});

const shown = { unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null, displayedName: 'Unit 1831' };

test('a mismatch names the unit the page shows and says the response did not match it', () => {
  const view = describeState({ ...shown, status: 'mismatch', identity: 'mismatch' });
  assert.equal(view.headingText, 'Unit 1831');
  assert.match(view.identityNote, /could not confirm this is Unit 1831/);
  assert.match(view.identityNote, /did not match what this page shows/);
  assert.equal(view.identityNote.split('Unit 1831').length - 1, 1, 'the unit name appears once');
  // The status sentence leads; the explanation after it is set at regular weight.
  assert.equal(view.identityNoteLead, 'Evidence unavailable: could not confirm this is Unit 1831.');
  assert(view.identityNote.startsWith(view.identityNoteLead));
});

test('an ambiguous check names the unit and says what was missing, not that it mismatched', () => {
  const view = describeState({ ...shown, status: 'ambiguous', identity: 'ambiguous' });
  assert.match(view.identityNote, /did not include enough to confirm it/);
  assert.equal(view.identityNote.split('Unit 1831').length - 1, 1, 'the unit name appears once');
  assert.doesNotMatch(view.identityNote, /did not match/);
});

test('a failed check names the unit the page shows', () => {
  const view = describeState({ ...shown, status: 'unavailable', identity: null, checkedAt: null, error: 'GateTimeoutError' });
  assert.equal(view.headingText, 'Unit 1831');
  assert.match(view.refreshNote, /^Check failed for Unit 1831: /);
});

test('a confirmed unit name still wins over the displayed one', () => {
  const view = describeState({ ...shown, status: 'mismatch', identity: 'mismatch', unitName: 'Lantana Hills 2321' });
  assert.equal(view.headingText, 'Lantana Hills 2321');
});

test('the summary drops the move-in line when the standby-only explainer already names that reservation', () => {
  const view = describeState({
    status: 'ready', identity: 'confirmed', unitName: 'Lantana Hills 2321', checkedAt: 1000, isChecking: false, isStale: false, error: null,
    today: '2026-09-12', referenceDate: '2026-09-12', checkIn: { status: 'none', date: null },
    ranges: [
      { startDate: '2026-09-12', endDate: '2026-09-24', moveInAllowed: false, isReservation: false, unbookableReason: 'less_than_minimum_nightly_stay' },
      { startDate: '2026-09-25', endDate: '2026-10-30', moveInAllowed: false, isReservation: true, unbookableReason: 'reserved' },
    ],
    summary: { intersectingReservation: null, nextReservation: { startDate: '2026-09-25', endDate: '2026-10-30' }, noStandardMoveInBeforeNext: true },
  });
  assert.match(view.standbyOnly.detail, /Too few nights for a standard stay/);
  assert.deepEqual(view.summaryItems, []);
});

test('with no reservation after the gap, the explainer drops the sentence about one', () => {
  const view = describeState({
    status: 'ready', identity: 'confirmed', unitName: 'Lantana Hills 2321', checkedAt: 1000, isChecking: false, isStale: false, error: null,
    today: '2026-09-12', referenceDate: '2026-09-12', checkIn: { status: 'none', date: null },
    ranges: [
      { startDate: '2026-09-12', endDate: null, moveInAllowed: false, isReservation: false, unbookableReason: 'less_than_minimum_nightly_stay' },
    ],
  });
  assert.equal(view.standbyOnly.detail, "Standard stays can't fit");
  assert.equal(view.standbyOnly.explainer, 'Only Standby can book these nights.');
});

test('a one-day checking state names the wait once, without the word Loading', () => {
  const view = describeState({ status: 'idle', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: true, isStale: false, error: null, comparison: { status: 'loading' } });
  assert.equal(view.calendarStatusText, 'Checking the calendar…');
  assert.equal(view.demandRows[0].value, 'Checking…');
  assert.doesNotMatch(JSON.stringify(view), /Loading/);
});

test('panel fine print uses the member’s words (#88)', () => {
  const ready = { status: 'ready', identity: 'confirmed', checkedAt: 1000, isChecking: false, isStale: false, error: null, today: '2026-09-12', referenceDate: '2026-09-12' };
  const range = (startDate, endDate, extra = {}) => ({ startDate, endDate, moveInAllowed: false, isReservation: false, unbookableReason: null, ...extra });

  assert.equal(describeState({ ...ready, ranges: [], checkIn: { status: 'none', date: null } }).referenceNote,
    'No check-in date found on this page. Facts below are stated against today, Sep 12.');

  const reserved = (endDate) => describeState({ ...ready, ranges: [], checkIn: { status: 'selected', date: '2026-09-12' },
    summary: { referenceDate: '2026-09-12', intersectingReservation: { startDate: '2026-09-01', endDate } } }).summaryItems[0];
  assert.equal(reserved('2026-10-10'), 'Reserved Sep 1 – Oct 10. Its end date doesn’t say when a stay could start or end.');
  assert.equal(reserved(null), 'Reserved from Sep 1, end date not supplied.');

  const covered = (coverageEnd) => describeState({ ...ready, ranges: [], checkIn: { status: 'none', date: null },
    summary: { noReservationsInCalendar: true, noStandardMoveInInCalendar: true, coverageStart: '2026-09-01', coverageEnd } }).summaryItems;
  assert.deepEqual(covered('2026-12-31'), ['No reservation Sep 1 – Dec 31.', 'No standard move-in Sep 1 – Dec 31.']);
  assert.deepEqual(covered(null), [
    'No reservation from Sep 1; the calendar’s last range has no end date.',
    'No standard move-in from Sep 1; the calendar’s last range has no end date.',
  ]);

  const comparison = { status: 'ready', median: 2400, count: 12, checkedAt: 1000, subjectPrice: null };
  const [row] = describeState({ checkedAt: null, comparison }).demandRows;
  assert.equal(row.value, 'This home: not supplied');
  for (const status of ['loading', 'unavailable', 'insufficient']) {
    const text = JSON.stringify(describeState({ checkedAt: null, comparison: { ...comparison, status, count: 4 } }).comparison);
    assert.doesNotMatch(text, /similar/, `one name for the other homes (${status})`);
  }

  // "Move-in blocked" is defined once, beside the legend, in words.
  const explainer = describeState({ ...ready, checkIn: { status: 'none', date: null }, ranges: [range('2026-09-01', null)] }).grid.marksExplainer;
  assert.match(explainer, /^Unavailable means reserved or move-in blocked\. Move-in blocked means Landing doesn't allow a move-in that night for a reason other than a reservation\./);

  // After a rate limit, the next step is to wait, not to retry at once.
  const limited = describeState({ status: 'unavailable', checkedAt: null, error: 'RateLimitedError' });
  assert.equal(limited.refreshNote, 'Check failed: Landing asked this extension to slow down. Wait a few minutes, then Refresh.');
  const limitedHeld = describeState({ status: 'unavailable', checkedAt: 1000, isStale: true, error: 'RateLimitedError' });
  assert.match(limitedHeld.refreshNote, /Showing an older check\. Wait a few minutes, then Refresh\.$/);
  assert.match(describeState({ status: 'unavailable', checkedAt: null, error: 'GateTimeoutError' }).refreshNote, /Refresh to try again\.$/);
});
