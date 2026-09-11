const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * The reservation line. A reservation's end date appears for overlap only —
 * never as a date the unit becomes the member's, and never as a stay boundary.
 * An absence is always phrased as what the returned calendar shows, because
 * that is all it is evidence of.
 */
function reservationLine(summary, referenceDate) {
  const { intersectingReservation: current, nextReservation: next } = summary;
  if (current) {
    const end = current.endDate ? `through ${formatDate(current.endDate)}` : 'with an unspecified end';
    return `Reserved on ${formatDate(referenceDate)}, ${end} (shown for overlap only)`;
  }
  if (next) return `Next reservation ${formatDate(next.startDate)}`;
  if (summary.noReservationsInCalendar) return 'No reservation shown in the returned calendar';
  return 'No reservation shown from this date in the returned calendar';
}

/**
 * The standard move-in observation for the reference date. A date the returned
 * calendar does not cover yields no claim in either direction: missing evidence
 * is not an absence of move-in, and it is not an offer either.
 */
function moveInLine(summary, referenceDate) {
  if (summary.moveInOnReferenceDate === null) {
    return `${formatDate(referenceDate)} is not covered by the returned calendar`;
  }
  return summary.moveInOnReferenceDate
    ? `Standard move-in offered ${formatDate(referenceDate)}`
    : `No standard move-in offered ${formatDate(referenceDate)}`;
}

/**
 * One card's annotation, as words. Pure: the DOM wiring decides where this
 * goes, this decides only what it may say.
 *
 * `readable` false means no unit-specific claim may be attached at all — the
 * card contributes to the single "Some listings couldn't be read" notice
 * instead of carrying a notice of its own.
 */
export function describeCard({ evidence, summary, referenceDate }) {
  const view = { readable: true, reservationText: '', moveInText: '', noteText: '' };

  if (evidence.identity === 'mismatch' || evidence.identity === 'ambiguous') {
    return { ...view, readable: false };
  }

  if (evidence.isStale) view.noteText = 'Showing an older check';

  if (evidence.checkedAt === null) {
    view.reservationText = evidence.isChecking ? 'Checking…' : '';
    return view;
  }

  if (evidence.status !== 'ready' || summary === null) {
    view.reservationText = 'Calendar unavailable';
    return view;
  }

  const reference = referenceDate ?? summary.referenceDate ?? null;
  view.reservationText = reservationLine(summary, reference);
  view.moveInText = moveInLine(summary, reference);
  return view;
}
