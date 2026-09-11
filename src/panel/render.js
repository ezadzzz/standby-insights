const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

function rangeText(range) {
  const end = range.endDate ? formatDate(range.endDate) : 'unspecified end';
  const kind = range.isReservation ? 'Reservation' : (range.moveInAllowed ? 'Move-in allowed' : 'Move-in not allowed');
  return `${formatDate(range.startDate)} – ${end}: ${kind}`;
}

/**
 * States the reference the summary is made against. A selected check-in is
 * named as the member's own; anything else is labeled so the extension never
 * appears to know their plans.
 */
function referenceNoteText(state) {
  if (!state.referenceDate) return '';
  if (state.checkIn?.status === 'disagreement') {
    return `The date on this page and the date in its address disagree, so no date is treated as selected. Facts below are stated against the check date, ${formatDate(state.referenceDate)}.`;
  }
  if (state.checkIn?.status === 'selected') {
    return `Relative to your selected check-in of ${formatDate(state.referenceDate)}.`;
  }
  return `No selected check-in date was read. Facts below are stated against the check date, ${formatDate(state.referenceDate)}.`;
}

/** Visible reservation and standard move-in statements for the reference date. */
function summaryItemsFor(summary) {
  const items = [];
  const { intersectingReservation: current, nextReservation: next } = summary;

  if (current) {
    const end = current.endDate ? formatDate(current.endDate) : 'an unspecified end';
    items.push(`A reservation is in progress on the reference date, running from ${formatDate(current.startDate)} to ${end} (end date shown for overlap only).`);
  }
  if (next) {
    items.push(`Next reservation starts ${formatDate(next.startDate)}.`);
  }
  if (summary.noStandardMoveInBeforeNext) {
    items.push('No standard move-in offered before that reservation.');
  }
  if (summary.noReservationsInCalendar) {
    const through = summary.coverageEnd
      ? `through ${formatDate(summary.coverageEnd)}`
      : 'through a final range with an unspecified end';
    items.push(`The returned calendar shows no reservation from ${formatDate(summary.coverageStart)} ${through}.`);
  }
  if (summary.noStandardMoveInInCalendar) {
    const through = summary.coverageEnd
      ? `through ${formatDate(summary.coverageEnd)}`
      : 'through a final range with an unspecified end';
    items.push(`The returned calendar shows no standard move-in range from ${formatDate(summary.coverageStart)} ${through}.`);
  }
  return items;
}

/**
 * Pure formatting from evidence-controller state to panel text. Kept
 * separate from panel.js's DOM wiring so it is testable without a browser.
 */
export function describeState(state) {
  const view = {
    headingText: state.unitName ?? 'Standby evidence',
    identityNote: '',
    checkTimeText: 'Not checked yet',
    calendarStatusText: '',
    referenceNote: '',
    summaryItems: [],
    rangeItems: [],
    refreshFailedNote: null,
  };

  if (state.status === 'mismatch' || state.status === 'ambiguous') {
    view.identityNote = 'Evidence unavailable: could not confirm this is the exact displayed unit.';
  }

  if (state.status === 'unavailable') {
    view.calendarStatusText = 'Calendar unavailable';
  }

  if (state.status === 'ready' && Array.isArray(state.ranges)) {
    view.rangeItems = state.ranges.map((r) => ({ text: rangeText(r), isReservation: r.isReservation }));
    view.referenceNote = referenceNoteText(state);
    if (state.summary) view.summaryItems = summaryItemsFor(state.summary);
  }

  if (state.checkedAt !== null) {
    view.checkTimeText = `Checked ${timeFormatter.format(new Date(state.checkedAt))}`;
    if (state.isStale) view.checkTimeText += ' (showing an older check)';
  } else if (state.isChecking) {
    view.checkTimeText = 'Checking…';
  }

  if (state.isStale && state.error) {
    view.refreshFailedNote = 'The last refresh failed; showing the previous check.';
  }

  return view;
}
