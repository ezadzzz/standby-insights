import { sixWeekView, describeStandbyOnly } from '../lib/six-week-view.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const checkTimeFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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
 * One card's annotation, as words plus the six-week strip. Pure: the DOM
 * wiring decides where this goes, this decides only what it may say.
 *
 * The headline is what a Standby member scans a results column for: whether
 * a standby-only gap is open from their date. Without one, the reservation
 * line carries the card's reservation fact instead.
 *
 * `readable` false means no unit-specific claim may be attached at all — the
 * card contributes to the single "Some listings couldn't be read" notice
 * instead of carrying a notice of its own.
 */
export function describeCard({ evidence, summary, referenceDate, today, checkIn }) {
  const view = { readable: true, statusText: '', headlineText: '', isStandbyOnly: false, detailText: '', strip: null, noteText: '' };

  if (evidence.identity === 'mismatch' || evidence.identity === 'ambiguous') {
    return { ...view, readable: false };
  }

  // Sits directly under the headline, so the words and the time of the check
  // are read before the strip, not after it.
  if (evidence.isStale) {
    view.noteText = evidence.checkedAt === null
      ? 'Older check'
      : `Older check · checked ${checkTimeFormatter.format(new Date(evidence.checkedAt))}`;
  }

  // Neither of these is a claim about the unit, so they are kept out of the
  // lines that carry one.
  if (evidence.checkedAt === null) {
    view.statusText = evidence.isChecking ? 'Checking…' : '';
    return view;
  }

  if (evidence.status !== 'ready' || summary === null) {
    view.statusText = 'Calendar unavailable';
    return view;
  }

  const weeks = sixWeekView(evidence.ranges, today, referenceDate);
  const statement = describeStandbyOnly(weeks);
  view.headlineText = statement.headline;
  view.isStandbyOnly = statement.isStandbyOnly;
  view.detailText = statement.isStandbyOnly ? statement.detail : reservationLine(summary, referenceDate);
  // The marker is the member's own date and needs no sentence; without one the
  // strip's statements run from its labeled Today edge (ADR 1).
  const checkInIndex = checkIn?.status === 'selected' ? weeks.checkInIndex : null;
  view.strip = { segments: weeks.segments, label: weeks.label, checkInIndex, endLabel: formatDate(weeks.lastDate) };
  return view;
}
