import { isIsoDate } from '../lib/calendar.js';

const DETAIL_SLUG_PATTERN = /^\/homes\/([^/]+)\/standby(?:\/|$)/;

/** Extracts the full unit slug from a Standby detail path, or null. */
export function parseSlugFromPath(pathname) {
  const match = DETAIL_SLUG_PATTERN.exec(pathname);
  return match ? match[1] : null;
}

/** Reads the visible unit/property identity from a rendered detail page. */
export function extractVisibleIdentity(doc) {
  const heading = doc.querySelector('h1');
  const propertyLink = doc.querySelector('a[href^="/properties/"]');
  return {
    visibleHeadingText: heading ? heading.textContent : null,
    visiblePropertyLinkText: propertyLink ? propertyLink.textContent : null,
  };
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Matches "September 15, 2026" / "Sep 15 2026" and, without a year, "Sep 15".
const WRITTEN_DATE = /([a-z]{3,9})\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i;

/**
 * Parses a rendered date label. Returns { month, day, year } with year null
 * when the label omits it — a year is never guessed.
 */
function parseWrittenDate(text) {
  if (typeof text !== 'string') return null;
  const match = WRITTEN_DATE.exec(text);
  if (!match) return null;
  const monthIndex = MONTHS.findIndex((m) => m.startsWith(match[1].toLowerCase()));
  if (monthIndex === -1) return null;
  return { month: monthIndex + 1, day: Number(match[2]), year: match[3] ? Number(match[3]) : null };
}

function agreesWith(isoDate, parsed) {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (parsed.year !== null && parsed.year !== year) return false;
  return parsed.month === month && parsed.day === day;
}

function toIso({ year, month, day }) {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/**
 * Reads the selected check-in for a settled detail page from the URL, using
 * an already-rendered picker label only as a fallback. Never opens controls,
 * substitutes searchedStartDate, or guesses a year. A displayed date that
 * contradicts the URL yields 'disagreement' — a transient date change is not
 * a settled selection.
 */
export function readSelectedCheckIn({ search, doc }) {
  const urlDate = new URLSearchParams(search ?? '').get('startDate');
  const selected = isIsoDate(urlDate) ? urlDate : null;

  const displayedEl = doc.querySelector('#unit-calendar-unified-start-date');
  const displayed = displayedEl ? parseWrittenDate(displayedEl.textContent) : null;

  const pickerEl = doc.querySelector('td[aria-label^="Selected as start date."]');
  const pickerLabel = pickerEl ? parseWrittenDate(pickerEl.getAttribute('aria-label')) : null;
  const pickerDate = pickerLabel && pickerLabel.year !== null ? toIso(pickerLabel) : null;

  const date = selected ?? pickerDate;
  if (date === null) return { status: 'none', date: null };
  if (selected && pickerDate && selected !== pickerDate) return { status: 'disagreement', date: null };
  if (displayed && !agreesWith(date, displayed)) return { status: 'disagreement', date: null };

  return { status: 'selected', date };
}
