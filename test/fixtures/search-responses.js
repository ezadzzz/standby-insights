// Fixtures derived from live public search_apartments_tool responses
// (captured 2026-09-11), trimmed to the fields the comparison reads.

export const AUSTIN = 'austin';

/** One eligible search result: positive finite USD, priced monthly. */
export function peer(slug, amount, overrides = {}) {
  return {
    slug,
    name: slug,
    market_slug: AUSTIN,
    bedrooms: 1,
    display_price_without_discount: amount,
    display_price_with_discount: amount,
    display_price_label: ' per month',
    duration_label: '/mo',
    is_price_monthly: true,
    is_price_nightly: false,
    price_note: 'Price includes all fees except taxes.',
    currency: 'USD',
    flex_options: [{ label: '6-Month+ Stay', months: 6 }],
    ...overrides,
  };
}

export function page({ homes, page: pageNumber = 1, perPage = 40, totalPages = 1, totalCount = homes.length, marketSlug = AUSTIN }) {
  return {
    response: {
      market: { slug: marketSlug, name: 'Austin', state: 'TX' },
      page: pageNumber,
      per_page: perPage,
      total_count: totalCount,
      total_pages: totalPages,
      flex_search_url: 'https://www.hellolanding.com/flex',
      homes,
    },
  };
}

/**
 * A subject home response carrying its own scope and advertised price. These
 * six comparison fields were read off a live GET /api/public/homes/{slug}
 * (2026-09-11) rather than carried over from the search response's shape;
 * test/browser/verify-unpacked.mjs asserts they are still there.
 */
export function subjectHome({ slug = 'apartment-in-austin-tx-subject-1', bedrooms = 1, amount = 2000, overrides = {} } = {}) {
  return {
    slug,
    name: 'Subject Unit 1',
    property: { name: 'Subject Property' },
    market_slug: AUSTIN,
    bedrooms,
    display_price_without_discount: amount,
    display_price_with_discount: amount,
    display_price_label: ' per month',
    duration_label: '/mo',
    is_price_monthly: true,
    is_price_nightly: false,
    price_note: 'Price includes all fees except taxes.',
    currency: 'USD',
    availability: { ranges: [{ start_date: '2026-09-11', end_date: '2027-09-10', move_in_allowed: true }] },
    ...overrides,
  };
}
