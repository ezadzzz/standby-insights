const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real ISO calendar day. The round-trip matters: Date parses
 * 2026-02-30 by rolling it into March, so a range-check alone would accept
 * days that do not exist.
 */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validates raw calendar ranges and normalizes them for display.
 * Any malformed range invalidates the whole calendar — this slice never
 * renders a partially-trusted result.
 */
function validateRanges(rawRanges) {
  if (!Array.isArray(rawRanges) || rawRanges.length === 0) {
    return { ok: false };
  }

  const ranges = [];
  for (const raw of rawRanges) {
    if (!raw || typeof raw !== 'object') return { ok: false };
    if (!isIsoDate(raw.start_date)) return { ok: false };

    const hasEnd = raw.end_date !== undefined && raw.end_date !== null;
    if (hasEnd && !isIsoDate(raw.end_date)) return { ok: false };
    if (hasEnd && raw.end_date < raw.start_date) return { ok: false };

    if (typeof raw.move_in_allowed !== 'boolean') return { ok: false };

    ranges.push({
      startDate: raw.start_date,
      endDate: hasEnd ? raw.end_date : null,
      moveInAllowed: raw.move_in_allowed,
      isReservation: raw.unbookable_reason === 'reserved',
      unbookableReason: typeof raw.unbookable_reason === 'string' ? raw.unbookable_reason : null,
    });
  }

  for (let i = 1; i < ranges.length; i += 1) {
    const prev = ranges[i - 1];
    const cur = ranges[i];
    if (prev.endDate === null) return { ok: false }; // open-ended range must be last
    if (cur.startDate < prev.startDate) return { ok: false }; // out of order
    if (cur.startDate <= prev.endDate) return { ok: false }; // overlap
  }

  return { ok: true, ranges };
}

/**
 * Derives the panel's calendar evidence from a raw public home response.
 * Returns { status: 'unavailable' } or { status: 'ready', ranges }.
 */
export function deriveCalendarEvidence(rawHome) {
  const rawRanges = rawHome && rawHome.availability && rawHome.availability.ranges;
  const validated = validateRanges(rawRanges);
  if (!validated.ok) return { status: 'unavailable' };
  return { status: 'ready', ranges: validated.ranges };
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dayAfter = (isoDate) => addDays(isoDate, 1);

function contains(range, isoDate) {
  return range.startDate <= isoDate && (range.endDate === null || isoDate <= range.endDate);
}

/** True only when ranges cover every day of [from, toExclusive) without a gap. */
export function coversInterval(rangeList, from, toExclusive) {
  if (from >= toExclusive) return false; // no interval to observe
  let cursor = from;
  for (const range of rangeList) {
    if (range.endDate !== null && range.endDate < cursor) continue;
    if (range.startDate > cursor) return false;
    if (range.endDate === null) return true;
    cursor = dayAfter(range.endDate);
    if (cursor >= toExclusive) return true;
  }
  return false;
}

function overlapsInterval(range, from, toExclusive) {
  return range.startDate < toExclusive && (range.endDate === null || range.endDate >= from);
}

function isContiguous(rangeList) {
  for (let i = 1; i < rangeList.length; i += 1) {
    if (rangeList[i].startDate !== dayAfter(rangeList[i - 1].endDate)) return false;
  }
  return true;
}

/**
 * Derives reference-date facts from already-validated ranges. Every negative
 * conclusion requires continuous coverage of the interval it describes; a
 * gap, or a reference date outside the returned calendar, withholds it.
 * Reservation end dates are included for overlap display only — they are not
 * a stay boundary.
 */
export function summarizeForReference(ranges, referenceDate) {
  const covering = ranges.find((r) => contains(r, referenceDate)) ?? null;
  const intersectingReservation = covering && covering.isReservation ? covering : null;
  const nextReservation = ranges.find((r) => r.isReservation && r.startDate > referenceDate) ?? null;

  const noStandardMoveInBeforeNext = intersectingReservation === null
    && nextReservation !== null
    && coversInterval(ranges, referenceDate, nextReservation.startDate)
    && !ranges.some((r) => r.moveInAllowed && overlapsInterval(r, referenceDate, nextReservation.startDate));

  const contiguous = isContiguous(ranges);
  return {
    intersectingReservation,
    nextReservation,
    noStandardMoveInBeforeNext,
    // Whether the reference date itself is offered for standard move-in. Null
    // when the returned calendar does not cover that date at all: no range is
    // not the same evidence as a range that disallows it.
    moveInOnReferenceDate: covering === null ? null : covering.moveInAllowed === true,
    noReservationsInCalendar: contiguous && !ranges.some((r) => r.isReservation),
    noStandardMoveInInCalendar: contiguous && !ranges.some((r) => r.moveInAllowed),
    coverageStart: ranges[0].startDate,
    coverageEnd: ranges.at(-1).endDate,
  };
}
