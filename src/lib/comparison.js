// Advertised monthly-price comparison against other homes in the same parent
// market with the same bedroom count. Every amount here is a currently
// advertised all-in monthly price, never a quote for a matched stay.

import { text } from './text.js';

// Landing's MCP search rejects per_page above 40 (observed 2026-09-24).
const PER_PAGE = 40;
// ponytail: a 1,000-home ceiling (25 pages of 40), which every market sampled
// so far sits well under; the largest, Austin one-bedroom, was 323 homes. Raise it only against a measured market that legitimately exceeds it,
// never to rescue a market that paginated unexpectedly.
const MAX_PAGES = 25;
export const MINIMUM_PEERS = 5;

/**
 * The subject's comparison scope, or null when it cannot be resolved. An
 * unresolved market or bedroom count makes comparison unavailable — it never
 * widens to the display city or guesses a bedroom count. Zero is a real
 * bedroom count (studio), so the check is on integer-ness, not truthiness.
 */
export function resolveScope(raw) {
  const marketSlug = text(raw?.market_slug);
  const bedrooms = raw?.bedrooms;
  if (marketSlug === null) return null;
  if (!Number.isInteger(bedrooms) || bedrooms < 0) return null;
  return { marketSlug, bedrooms };
}

export const scopeKey = (scope) => `${scope.marketSlug}:${scope.bedrooms}`;

/**
 * The advertised monthly price of one home, or null when it is not eligible.
 * The same rule applies to the subject and to every peer: a positive finite
 * USD amount the response itself calls monthly. A nightly amount is never
 * converted, and no base-rent average is substituted. Supplied labels, notes
 * and terms travel with the amount; an absent one stays null rather than
 * being invented.
 */
export function advertisedMonthlyPrice(home) {
  if (home?.is_price_monthly !== true) return null;
  if (home?.currency !== 'USD') return null;
  const amount = home?.display_price_with_discount;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    label: text(home.display_price_label),
    note: text(home.price_note),
    durationLabel: text(home.duration_label),
    terms: Array.isArray(home.flex_options)
      ? home.flex_options.map((option) => text(option?.label)).filter((label) => label !== null)
      : null,
  };
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Validates one search page against the scope it was requested for. Anything
 * that would leave the sample partial or off-scope returns null, which the
 * collector turns into an incomplete comparison — a partial market sample is
 * never shown as a median.
 *
 * The echoed page and per_page are checked against the ones asked for, not
 * merely for self-consistency: Landing's REST mirror silently pins per_page to
 * 25 and ignores page entirely (docs/research/2026-09-11-flex-options-and-
 * special-offer.md). A page size quietly smaller than the requested one is the
 * budget being spent against a different market shape than the one planned, so
 * it is rejected rather than absorbed.
 */
function readPage(envelope, { scope, expectedPage, expectedTotals }) {
  const response = envelope?.response;
  if (!response || typeof response !== 'object') return null;
  if (response.market?.slug !== scope.marketSlug) return null;
  if (response.page !== expectedPage) return null;

  const { per_page: perPage, total_pages: totalPages, total_count: totalCount, homes } = response;
  if (perPage !== PER_PAGE) return null;
  if (!Number.isInteger(totalPages) || totalPages < 1) return null;
  if (!Number.isInteger(totalCount) || totalCount < 0) return null;
  if (expectedTotals && (expectedTotals.perPage !== perPage
    || expectedTotals.totalPages !== totalPages
    || expectedTotals.totalCount !== totalCount)) return null;

  if (!Array.isArray(homes) || homes.length > perPage) return null;
  for (const home of homes) {
    if (text(home?.slug) === null) return null;
    if (home.bedrooms !== scope.bedrooms) return null;
    if (home.market_slug !== scope.marketSlug) return null;
  }
  return { perPage, totalPages, totalCount, homes };
}

/**
 * Collects every reported page for one market/bedroom scope, sequentially and
 * within a fixed request budget. Never retries: a failed, repeated, malformed
 * or capped attempt is incomplete, and an explicit Refresh is what starts a
 * new one. Returns the eligible-price view of every home found, keeping each
 * home's own slug so whichever subject is selected can be excluded later.
 */
export async function collectComparison({ search, scope }) {
  const homes = new Map();
  let totals = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let envelope;
    try {
      envelope = await search({ market: scope.marketSlug, bedrooms: scope.bedrooms, page, perPage: PER_PAGE });
    } catch {
      return { status: 'incomplete' };
    }

    const read = readPage(envelope, { scope, expectedPage: page, expectedTotals: totals });
    if (read === null) return { status: 'incomplete' };
    totals = { perPage: read.perPage, totalPages: read.totalPages, totalCount: read.totalCount };

    for (const home of read.homes) {
      if (!homes.has(home.slug)) homes.set(home.slug, { slug: home.slug, price: advertisedMonthlyPrice(home) });
    }
    if (page >= read.totalPages) return { status: 'complete', homes: [...homes.values()] };
  }
  return { status: 'incomplete' }; // budget stop before every reported page was read
}

/**
 * States complete comparison evidence against one selected subject. The
 * evidence is cached unfiltered, so each subject is excluded from its own
 * comparison here rather than reusing another subject's already-filtered
 * median.
 */
export function compareSubject(evidence, { subjectSlug }) {
  if (evidence?.status !== 'complete') return { status: 'unavailable', median: null, count: null };
  const peers = evidence.homes.filter((home) => home.slug !== subjectSlug && home.price !== null);
  if (peers.length < MINIMUM_PEERS) return { status: 'insufficient', median: null, count: peers.length };
  return { status: 'ready', median: median(peers.map((peer) => peer.price.amount)), count: peers.length };
}
