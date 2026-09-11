const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
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
    if (!isValidDate(raw.start_date)) return { ok: false };

    const hasEnd = raw.end_date !== undefined && raw.end_date !== null;
    if (hasEnd && !isValidDate(raw.end_date)) return { ok: false };
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
