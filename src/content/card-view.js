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
 * Says which date the card's statements are made against. A card has room for
 * a date but not for a sentence, which is exactly where a check date is most
 * likely to be read as the member's own plan — so it is named either way
 * (ADR 1).
 */
function referenceNote(checkIn, referenceDate) {
  const on = formatDate(referenceDate);
  if (checkIn?.status === 'selected') return `Relative to your selected check-in of ${on}.`;
  if (checkIn?.status === 'disagreement') {
    return `This page and its address disagree on the date, so none is treated as selected. Stated against the check date, ${on}.`;
  }
  return `No selected check-in was read. Stated against the check date, ${on}.`;
}

/**
 * One card's annotation, as words. Pure: the DOM wiring decides where this
 * goes, this decides only what it may say.
 *
 * `readable` false means no unit-specific claim may be attached at all — the
 * card contributes to the single "Some listings couldn't be read" notice
 * instead of carrying a notice of its own.
 */
export function describeCard({ evidence, summary, referenceDate, checkIn }) {
  const view = { readable: true, statusText: '', reservationText: '', moveInText: '', referenceNote: '', noteText: '' };

  if (evidence.identity === 'mismatch' || evidence.identity === 'ambiguous') {
    return { ...view, readable: false };
  }

  if (evidence.isStale) view.noteText = 'Showing an older check';

  // Neither of these is a claim about the unit, so they are kept out of the
  // line that carries one.
  if (evidence.checkedAt === null) {
    view.statusText = evidence.isChecking ? 'Checking…' : '';
    return view;
  }

  if (evidence.status !== 'ready' || summary === null) {
    view.statusText = 'Calendar unavailable';
    return view;
  }

  view.reservationText = reservationLine(summary, referenceDate);
  view.moveInText = moveInLine(summary, referenceDate);
  view.referenceNote = referenceNote(checkIn, referenceDate);
  return view;
}
