import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceController } from '../src/lib/evidence-controller.js';
import { describeState } from '../src/panel/render.js';
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

const identityFor = (home) => ({ visibleHeadingText: home.name, visiblePropertyLinkText: home.property.name });
const CHECK_DATE = Date.UTC(2026, 8, 11); // 2026-09-11

function fakeFetcher() {
  const calls = [];
  const fetchHome = (slug) => new Promise((resolve, reject) => calls.push({ slug, resolve, reject }));
  return { fetchHome, calls };
}

async function tick() { await new Promise((r) => setImmediate(r)); }

async function loadedPanel(home, checkIn) {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome, now: () => CHECK_DATE });
  controller.enterDetailPage({ slug: home.slug, visibleIdentity: identityFor(home), checkIn });
  await tick();
  calls[0].resolve(home);
  await tick();
  return { controller, calls, view: () => describeState(controller.getState()) };
}

const summaryText = (view) => view.summaryItems.join(' | ');

test('a selected check-in spanned by a reservation: the in-progress reservation is stated with its end shown for overlap only', async () => {
  const { view } = await loadedPanel(validClosedCalendarHome, { status: 'selected', date: '2026-10-01' });
  assert.equal(view().referenceNote, 'Your check-in: Oct 1.', 'stated in words, not only marked');
  assert.match(view().grid.label, /\. Your check-in, Oct 1, is marked$/);
  assert.equal(view().grid.cells.find((cell) => cell.isCheckIn).dayText, 'Oct 1');
  assert.equal(view().standbyOnly.headline, 'Reserved on your check-in, Oct 1');
  assert.match(summaryText(view()), /Reserved Sep 26 – Oct 24\. Its end date doesn’t say when a stay could start or end\./);
  assert.match(summaryText(view()), /Next reservation starts Nov 2/);
  assert.match(view().grid.cells[0].title, /Sep 11: Reserved/); // each day names its whole range on hover
});

test('a selected check-in past the six weeks shown is stated in words and not claimed as marked', async () => {
  const { view } = await loadedPanel(validClosedCalendarHome, { status: 'selected', date: '2026-11-02' });
  assert.equal(view().referenceNote, 'Your check-in: Nov 2.');
  assert.equal(view().grid.cells.some((cell) => cell.isCheckIn), false);
  assert.doesNotMatch(view().grid.label, /check-in/i);
});

test('no reservation before the next one, with continuous coverage: the standard move-in observation is shown', async () => {
  const { view } = await loadedPanel(validClosedCalendarHome, { status: 'selected', date: '2026-10-25' });
  assert.match(summaryText(view()), /No standard move-in offered before that reservation/);
});

test('the move-in observation is withheld when coverage before the reservation is incomplete', async () => {
  const { view } = await loadedPanel(validClosedCalendarHome, { status: 'selected', date: '2026-09-01' });
  assert.doesNotMatch(summaryText(view()), /No standard move-in offered/);
  assert.match(summaryText(view()), /Next reservation starts Sep 11/);
});

test('no readable selected date: facts are labeled against the check date, not an assumed move-in', async () => {
  const { view } = await loadedPanel(validClosedCalendarHome, { status: 'none', date: null });
  assert.match(view().referenceNote, /^No check-in date found on this page\./);
  assert.match(view().referenceNote, /today/i);
  assert.match(view().referenceNote, /Sep 11/);
  // A standby-only gap later in the view still leads over today's reservation.
  assert.equal(view().standbyOnly.headline, 'Standby-only Sep 12 – Sep 24');
  assert.match(view().standbyOnly.explainer, /If the reservation after them moves or is cancelled, a standard stay may fit/);
  assert.match(summaryText(view()), /Reserved Sep 11 only\./);
  // The detail line already names the reservation after the gap, so the summary does not repeat it.
  assert.match(view().standbyOnly.detail, /before the Sep 26 reservation/);
  // Today's reservation is still said, labeled as today, not as the member's date.
  assert.match(view().standbyOnly.detail, /^Reserved today, Sep 11\. /);
  assert.doesNotMatch(summaryText(view()), /Next reservation starts/);
});

test('a URL/control date disagreement suspends personalized emphasis but keeps check-date facts', async () => {
  const { view } = await loadedPanel(validClosedCalendarHome, { status: 'disagreement', date: null });
  assert.match(view().referenceNote, /disagree/i);
  assert.doesNotMatch(view().referenceNote, /your selected check-in/i);
  assert.match(view().referenceNote, /today, Sep 11/);
  // The reference is the check date, so dated facts survive the disagreement.
  assert.match(summaryText(view()), /^Reserved Sep 11 only\./);
  assert.equal(view().grid.cells.some((cell) => cell.isCheckIn), false);
});

test('a no-reservation calendar describes the returned calendar and its finite coverage', async () => {
  const { view } = await loadedPanel(validOpenCalendarHome, { status: 'selected', date: '2026-09-15' });
  const text = summaryText(view());
  // The calendar runs a year ahead, so its end carries the year.
  assert.equal(text, 'No reservation Sep 11 – Sep 10, 2027.');
  assert.doesNotMatch(text, /indefinite|always|guarantee/i);
});

test('an unavailable calendar states no summary conclusions at all', async () => {
  const { view } = await loadedPanel(emptyRangesHome, { status: 'selected', date: '2026-09-15' });
  assert.match(view().calendarStatusText, /^Calendar unavailable\./);
  assert.equal(view().summaryItems.length, 0);
});

test('no summary wording claims protection, safety, checkout, or a guaranteed duration', async () => {
  for (const checkIn of [{ status: 'selected', date: '2026-10-01' }, { status: 'none', date: null }]) {
    const { view } = await loadedPanel(validClosedCalendarHome, checkIn);
    const text = `${view().referenceNote} ${summaryText(view())}`;
    assert.doesNotMatch(text, /protected|safe|checkout|check-out|guarantee|available until|standby-only/i);
  }
});

test('a date change updates the visible summary for the same unit without refetching or misattaching', async () => {
  const { controller, calls, view } = await loadedPanel(validClosedCalendarHome, { status: 'selected', date: '2026-10-01' });
  controller.selectCheckIn({ status: 'selected', date: '2026-10-25' });
  assert.equal(calls.length, 1);
  assert.match(summaryText(view()), /No standard move-in offered before that reservation/);
});

test('a refresh carries the current selected date through to the new evidence', async () => {
  const { controller, calls, view } = await loadedPanel(validClosedCalendarHome, { status: 'selected', date: '2026-10-01' });
  controller.refresh({
    slug: validClosedCalendarHome.slug,
    visibleIdentity: identityFor(validClosedCalendarHome),
    checkIn: { status: 'selected', date: '2026-10-25' },
  });
  await tick();
  calls[1].resolve(validClosedCalendarHome);
  await tick();
  assert.match(summaryText(view()), /No standard move-in offered before that reservation/);
});

test('switching units shows no summary from the previous unit', async () => {
  const { controller, calls, view } = await loadedPanel(validClosedCalendarHome, { status: 'selected', date: '2026-10-01' });
  controller.enterDetailPage({
    slug: validOpenCalendarHome.slug,
    visibleIdentity: identityFor(validOpenCalendarHome),
    checkIn: { status: 'selected', date: '2026-10-01' },
  });
  assert.equal(view().summaryItems.length, 0);
  assert.equal(view().grid, null);
});

test('a date change landing while a check is in flight is not reverted by that older response', async () => {
  const { fetchHome, calls } = fakeFetcher();
  const controller = createEvidenceController({ fetchHome, now: () => CHECK_DATE });
  controller.enterDetailPage({
    slug: validClosedCalendarHome.slug,
    visibleIdentity: identityFor(validClosedCalendarHome),
    checkIn: { status: 'selected', date: '2026-10-01' },
  });
  await tick();
  controller.selectCheckIn({ status: 'selected', date: '2026-10-25' });
  calls[0].resolve(validClosedCalendarHome);
  await tick();

  const view = describeState(controller.getState());
  assert.match(view.summaryItems.join(' | '), /No standard move-in offered before that reservation/);
});

test('a calendar with no standard move-in range says so about the returned calendar only', async () => {
  const noMoveInHome = {
    ...validOpenCalendarHome,
    availability: {
      ranges: [
        { start_date: '2026-09-11', end_date: '2026-09-30', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
        { start_date: '2026-10-01', end_date: '2026-12-31', move_in_allowed: false, unbookable_reason: 'future_booking_prevention' },
      ],
    },
  };
  const { view } = await loadedPanel(noMoveInHome, { status: 'selected', date: '2026-09-15' });
  const text = summaryText(view());
  assert.match(text, /No standard move-in Sep 11 – Dec 31\./);
  assert.doesNotMatch(text, /never|indefinite|closed permanently/i);
});

test('invalid, missing, and contradictory calendars state no conclusions a member could act on', async () => {
  const invalidHomes = [
    missingAvailabilityHome,
    malformedDateHome,
    nonBooleanMoveInHome,
    contradictoryOverlapHome,
    rangeAfterOpenEndedHome,
  ];
  for (const home of invalidHomes) {
    const { view } = await loadedPanel(home, { status: 'selected', date: '2026-09-15' });
    assert.match(view().calendarStatusText, /^Calendar unavailable\./, home.slug);
    assert.equal(view().summaryItems.length, 0, home.slug);
    assert.equal(view().referenceNote, '', home.slug);
    assert.equal(view().grid, null, home.slug);
  }
});
