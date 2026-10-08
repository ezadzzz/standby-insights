import { addDays, coversInterval } from './calendar.js';

export const VIEW_DAYS = 42;

// What a member reads off the strip and the grid: where a standard stay can
// start, where a standby-only gap is, and where neither is. Why a day is
// unavailable (a reservation or another block) is told in words: the panel's
// day titles and its list of every returned range. Days with no calendar data
// stay apart: missing is never drawn as a claim.
const DRAWN_KIND = { reserved: 'unavailable', blocked: 'unavailable' };

/** The mark a day's kind is drawn as, on the card strip and the panel grid alike. */
export const drawnKind = (kind) => DRAWN_KIND[kind] ?? kind;

// One legend for both surfaces, so a mark means the same thing on each.
export const KEY_WORDS = [
  ['standby-only', 'Standby-only'],
  ['move-in', 'Available'],
  ['unavailable', 'Unavailable'],
  ['not-returned', 'No calendar data'],
];

/** Only the marks actually drawn among `kinds`, plus any always-shown `extras`. */
export function drawnKey(kinds, extras = []) {
  const drawn = new Set(kinds);
  return [...KEY_WORDS.filter(([kind]) => drawn.has(kind)).map(([kind, text]) => ({ kind, text })), ...extras];
}

const STANDBY_ONLY_REASON = 'less_than_minimum_nightly_stay';
const DAY_MS = 86_400_000;

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const short = (isoDate) => shortDate.format(new Date(`${isoDate}T00:00:00Z`));
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const KIND_WORDS = {
  'standby-only': 'standby-only',
  reserved: 'reserved',
  blocked: 'move-in blocked',
  'move-in': 'standard move-in allowed',
  'not-returned': 'no calendar data',
};

/**
 * What one returned range means to a Standby member. Standby-only is Landing's
 * own reason — the nights are too few for a standard stay — never an inference
 * from neighbouring ranges.
 */
function kindOf(range) {
  if (!range) return 'not-returned';
  if (range.unbookableReason === STANDBY_ONLY_REASON) return 'standby-only';
  if (range.isReservation) return 'reserved';
  return range.moveInAllowed ? 'move-in' : 'blocked';
}

/** Contiguous standby-only ranges read as one gap. */
function standbyOnlyGaps(ranges) {
  const gaps = [];
  for (const range of ranges) {
    const last = gaps.at(-1);
    if (range.unbookableReason !== STANDBY_ONLY_REASON) continue;
    if (last && last.endDate !== null && addDays(last.endDate, 1) === range.startDate) {
      last.endDate = range.endDate;
    } else {
      gaps.push({ startDate: range.startDate, endDate: range.endDate });
    }
  }
  return gaps;
}

/**
 * Six weeks of returned calendar starting today, for the card strip and the
 * panel grid. Statements are made from the reference date forward: a gap that
 * closed before the member's check-in is not theirs. Only returned ranges are
 * drawn; a day no range covers is not-returned, never open.
 */
export function sixWeekView(ranges, today, referenceDate) {
  const end = addDays(today, VIEW_DAYS); // exclusive
  const from = referenceDate > today ? referenceDate : today;

  const days = [];
  for (let i = 0; i < VIEW_DAYS; i += 1) {
    const date = addDays(today, i);
    const range = ranges.find((r) => r.startDate <= date && (r.endDate === null || date <= r.endDate));
    days.push({ date, kind: kindOf(range), range: range ?? null });
  }

  const segments = [];
  for (const day of days) {
    const last = segments.at(-1);
    if (last?.kind === day.kind) {
      last.days += 1;
      last.endDate = day.date;
    } else {
      segments.push({ kind: day.kind, startDate: day.date, endDate: day.date, days: 1 });
    }
  }

  const inView = from < end;
  const gap = inView
    ? standbyOnlyGaps(ranges).find((g) => g.startDate < end && (g.endDate === null || g.endDate >= from)) ?? null
    : null;
  const nextReservation = gap && gap.endDate !== null
    ? ranges.find((r) => r.isReservation && r.startDate > gap.endDate) ?? null
    : null;

  const offset = daysBetween(today, referenceDate);
  return {
    days,
    segments,
    lastDate: addDays(end, -1),
    from,
    inView,
    gap: gap && { ...gap, inProgress: gap.startDate <= from, nextReservation },
    covered: inView && coversInterval(ranges, from, end),
    checkInIndex: offset >= 0 && offset < VIEW_DAYS ? offset : null,
    label: `Six weeks from ${short(today)}: ${segments.map((s) => (
      `${s.days === 1 ? short(s.startDate) : `${short(s.startDate)} – ${short(s.endDate)}`} ${KIND_WORDS[s.kind]}`
    )).join('; ')}`,
  };
}

/**
 * The words a member scans for. A standby-only gap is stated from Landing's
 * reason with the reservation that shortens it, and lasts only while that
 * reservation holds; nothing here says the member cannot be bumped, only that a
 * standard stay can't fit.
 */
export function describeStandbyOnly(view) {
  const { gap } = view;
  if (gap) {
    let headline;
    if (gap.endDate === null) headline = `Standby-only from ${short(gap.startDate)}, end unspecified`;
    else if (gap.inProgress) headline = `Standby-only through ${short(gap.endDate)}`;
    else headline = `Standby-only ${short(gap.startDate)} – ${short(gap.endDate)}`;
    const detail = gap.nextReservation
      ? `Standard stays can't fit before the ${short(gap.nextReservation.startDate)} reservation, while it holds`
      : 'Too short for a standard stay';
    return { isStandbyOnly: true, headline, detail };
  }
  if (!view.inView) return { isStandbyOnly: false, headline: 'Your check-in is past this six-week view', detail: '' };
  // A negative conclusion needs every night it describes; a gap withholds it.
  return {
    isStandbyOnly: false,
    noGap: view.covered,
    headline: view.covered
      ? 'No standby-only nights in the next six weeks'
      : `The returned calendar doesn't cover every night through ${short(view.lastDate)}`,
    detail: '',
  };
}

/**
 * The line a card and the panel both lead with. A standby-only gap leads; with
 * none, a reservation on the reference date is the fact that matters, so it
 * takes the headline and the standby-only negative drops to the detail. The
 * reference date is named as the member's check-in only when it is theirs
 * (ADR 1). No end date here: without its caveat it would read as a stay boundary.
 */
export function describeHeadline(view, summary, checkIn) {
  const statement = describeStandbyOnly(view);
  const reserved = summary?.intersectingReservation;
  if (statement.isStandbyOnly || !reserved) return statement;
  const reference = summary.referenceDate;
  let on = `on ${short(reference)}`;
  if (checkIn?.status === 'selected') on = `on your check-in, ${short(reference)}`;
  else if (reference === view.days[0]?.date) on = `today, ${short(reference)}`;
  return { isStandbyOnly: false, headline: `Reserved ${on}`, detail: statement.headline };
}
