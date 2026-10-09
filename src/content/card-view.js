import { sixWeekView, describeHeadline, drawnKey, drawnKind } from '../lib/six-week-view.js';

// Card dates match the headline's "Sep 24" form: no year, as on the strip.
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const checkTimeFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * The reservation line under a headline that doesn't already carry one. An
 * absence says only "not shown", never "none", and names its date, because the
 * strip may hatch a reservation that ends before it. That the evidence is the
 * returned calendar is said once, in the panel, not on every card.
 */
function reservationLine(summary, referenceDate) {
  const { nextReservation: next } = summary;
  if (next) return `Next reservation ${formatDate(next.startDate)}`;
  if (summary.noReservationsInCalendar) return 'No reservation shown';
  return `No reservation shown from ${formatDate(referenceDate)}`;
}

function cardSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const kind = drawnKind(segment.kind);
    const last = merged.at(-1);
    if (last?.kind === kind) last.days += segment.days;
    else merged.push({ ...segment, kind });
  }
  return merged;
}

/**
 * One card's annotation, as words plus the six-week strip. Pure: the DOM
 * wiring decides where this goes, this decides only what it may say.
 *
 * The headline is what a Standby member scans a results column for: whether
 * a standby-only gap is open from their date. Without one, the card drops to
 * a single quiet line, the reservation fact; the strip still shows the weeks.
 *
 * `readable` false means no unit-specific claim may be attached at all: the
 * card says only that it was not read, and is counted in the page notice.
 */
export function describeCard({ evidence, summary, referenceDate, today, checkIn }) {
  const view = { readable: true, statusText: '', headlineText: '', isStandbyOnly: false, quiet: false, detailText: '', strip: null, noteText: '' };

  if (evidence.identity === 'mismatch' || evidence.identity === 'ambiguous') {
    return { ...view, readable: false, statusText: "Not read: couldn't confirm this listing" };
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
  const statement = describeHeadline(weeks, summary, checkIn);
  view.isStandbyOnly = statement.isStandbyOnly;
  if (statement.noGap) {
    // Down a results column the negative repeats on every card, so it is not
    // said; the reservation fact is what differs, and it stays quiet so the
    // cards with a gap stand out.
    view.headlineText = reservationLine(summary, referenceDate);
    view.quiet = true;
  } else {
    view.headlineText = statement.headline;
    view.detailText = statement.detail || reservationLine(summary, referenceDate);
  }
  // The marker is the member's own date and needs no sentence; without one the
  // strip's statements run from its labeled Today edge (ADR 1).
  const checkInIndex = checkIn?.status === 'selected' ? weeks.checkInIndex : null;
  const label = checkInIndex === null
    ? weeks.label
    : `${weeks.label}. Your check-in, ${formatDate(referenceDate)}, is marked`;
  const extras = checkInIndex === null ? [] : [{ kind: 'check-in', text: 'Your check-in' }];
  const segments = cardSegments(weeks.segments);
  const key = drawnKey(segments.map((s) => s.kind), extras);
  view.strip = { segments, label, checkInIndex, key };
  return view;
}
