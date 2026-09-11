const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
 * Pure formatting from evidence-controller state to panel text. Kept
 * separate from panel.js's DOM wiring so it is testable without a browser.
 */
export function describeState(state) {
  const view = {
    identityNote: '',
    checkTimeText: 'Not checked yet',
    calendarStatusText: '',
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
