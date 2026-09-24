import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveScope,
  advertisedMonthlyPrice,
  median,
  collectComparison,
  compareSubject,
} from '../src/lib/comparison.js';
import { peer, page, subjectHome, AUSTIN } from './fixtures/search-responses.js';

const scope = { marketSlug: AUSTIN, bedrooms: 1 };
const studioScope = { marketSlug: AUSTIN, bedrooms: 0 };

function searcher(pages) {
  const calls = [];
  const search = async (args) => {
    calls.push(args);
    const next = pages[args.page - 1];
    if (next === undefined) throw new Error('no such page');
    if (next instanceof Error) throw next;
    return next;
  };
  return { search, calls };
}

// --- scope resolution -------------------------------------------------------

test('a studio resolves as a zero-bedroom scope rather than an unresolved one', () => {
  assert.deepEqual(resolveScope(subjectHome({ bedrooms: 0 })), { marketSlug: AUSTIN, bedrooms: 0 });
});

test('an unresolved market or bedroom count makes comparison unavailable, never broader', () => {
  assert.equal(resolveScope(subjectHome({ overrides: { market_slug: null } })), null);
  assert.equal(resolveScope(subjectHome({ overrides: { market_slug: '   ' } })), null);
  assert.equal(resolveScope(subjectHome({ overrides: { bedrooms: undefined } })), null);
  assert.equal(resolveScope(subjectHome({ overrides: { bedrooms: 1.5 } })), null);
  assert.equal(resolveScope(subjectHome({ overrides: { bedrooms: -1 } })), null);
});

// --- eligibility ------------------------------------------------------------

test('an eligible monthly USD price keeps its supplied label, note and terms', () => {
  const price = advertisedMonthlyPrice(peer('a', 2100));
  assert.equal(price.amount, 2100);
  assert.equal(price.label, 'per month');
  assert.equal(price.note, 'Price includes all fees except taxes.');
  assert.deepEqual(price.terms, ['6-Month+ Stay']);
});

test('a nightly amount is rejected outright, never converted to a monthly one', () => {
  const nightly = peer('a', 175, { is_price_monthly: false, is_price_nightly: true, display_price_label: ' for 2 nights' });
  assert.equal(advertisedMonthlyPrice(nightly), null);
});

test('a non-USD amount is not eligible', () => {
  assert.equal(advertisedMonthlyPrice(peer('a', 2100, { currency: 'CAD' })), null);
});

test('nonfinite and nonpositive amounts are not eligible', () => {
  for (const amount of [0, -50, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '2100']) {
    assert.equal(advertisedMonthlyPrice(peer('a', amount)), null, `amount ${String(amount)}`);
  }
});

test('missing labels, notes and terms stay absent rather than being invented', () => {
  const price = advertisedMonthlyPrice(peer('a', 2100, {
    display_price_label: undefined,
    price_note: '   ',
    duration_label: undefined,
    flex_options: undefined,
  }));
  assert.equal(price.amount, 2100);
  assert.equal(price.label, null);
  assert.equal(price.note, null);
  assert.equal(price.durationLabel, null);
  assert.equal(price.terms, null);
});

test('the subject is judged by the same eligibility rule as its peers', () => {
  assert.equal(advertisedMonthlyPrice(subjectHome({ amount: 2000 })).amount, 2000);
  assert.equal(advertisedMonthlyPrice(subjectHome({ overrides: { is_price_monthly: false } })), null);
});

test('the median of an even sample averages the two middle values', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([5, 1, 3]), 3);
});

// --- collection and validation ---------------------------------------------

test('a single reported page completes in one request', async () => {
  const homes = [peer('a', 1000), peer('b', 2000)];
  const { search, calls } = searcher([page({ homes })]);
  const result = await collectComparison({ search, scope });

  assert.equal(result.status, 'complete');
  assert.equal(result.homes.length, 2);
  assert.deepEqual(calls, [{ market: AUSTIN, bedrooms: 1, page: 1, perPage: 40 }]);
});

test('every reported page is collected, at 40 homes per page', async () => {
  const { search, calls } = searcher([
    page({ homes: [peer('a', 1000)], page: 1, totalPages: 3, totalCount: 3 }),
    page({ homes: [peer('b', 2000)], page: 2, totalPages: 3, totalCount: 3 }),
    page({ homes: [peer('c', 3000)], page: 3, totalPages: 3, totalCount: 3 }),
  ]);
  const result = await collectComparison({ search, scope });

  assert.equal(result.status, 'complete');
  assert.equal(result.homes.length, 3);
  assert.deepEqual(calls.map((c) => c.page), [1, 2, 3]);
  assert.ok(calls.every((c) => c.perPage === 40));
});

test('duplicate homes across pages are counted once', async () => {
  const { search } = searcher([
    page({ homes: [peer('a', 1000), peer('b', 2000)], page: 1, totalPages: 2, totalCount: 3 }),
    page({ homes: [peer('b', 2000), peer('c', 3000)], page: 2, totalPages: 2, totalCount: 3 }),
  ]);
  const result = await collectComparison({ search, scope });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.homes.map((h) => h.slug), ['a', 'b', 'c']);
});

test('a repeated page - the echoed page not advancing - leaves the comparison incomplete', async () => {
  const { search } = searcher([
    page({ homes: [peer('a', 1000)], page: 1, totalPages: 2, totalCount: 2 }),
    page({ homes: [peer('a', 1000)], page: 1, totalPages: 2, totalCount: 2 }),
  ]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
});

test('a failed page leaves the comparison incomplete and is not retried', async () => {
  const { search, calls } = searcher([
    page({ homes: [peer('a', 1000)], page: 1, totalPages: 2, totalCount: 2 }),
    new Error('network'),
  ]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
  assert.equal(calls.length, 2);
});

test('a market beyond the request budget stops incomplete rather than sampling part of it', async () => {
  const pages = Array.from({ length: 27 }, (_, i) => page({
    homes: [peer(`h${i}`, 1000 + i)], page: i + 1, totalPages: 27, totalCount: 27,
  }));
  const { search, calls } = searcher(pages);

  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
  assert.equal(calls.length, 25);
});

test('totals that change between pages leave the comparison incomplete', async () => {
  const { search } = searcher([
    page({ homes: [peer('a', 1000)], page: 1, totalPages: 2, totalCount: 2 }),
    page({ homes: [peer('b', 2000)], page: 2, totalPages: 2, totalCount: 9 }),
  ]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
});

test('a page size that silently shrinks between pages leaves the comparison incomplete', async () => {
  const { search } = searcher([
    page({ homes: [peer('a', 1000)], page: 1, totalPages: 2, totalCount: 2 }),
    page({ homes: [peer('b', 2000)], page: 2, perPage: 25, totalPages: 2, totalCount: 2 }),
  ]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
});

test('a first page quietly served at a smaller size leaves the comparison incomplete', async () => {
  const { search } = searcher([page({ homes: [peer('a', 1000)], perPage: 25, totalPages: 1, totalCount: 1 })]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
});

test('a response for another market leaves the comparison incomplete', async () => {
  const { search } = searcher([page({ homes: [peer('a', 1000)], marketSlug: 'dallas' })]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
});

test('a home outside the requested market or bedroom count leaves the comparison incomplete', async () => {
  const wrongMarket = searcher([page({ homes: [peer('a', 1000, { market_slug: 'dallas' })] })]);
  assert.equal((await collectComparison({ search: wrongMarket.search, scope })).status, 'incomplete');

  const wrongBedrooms = searcher([page({ homes: [peer('a', 1000, { bedrooms: 2 })] })]);
  assert.equal((await collectComparison({ search: wrongBedrooms.search, scope })).status, 'incomplete');
});

test('a studio scope accepts zero-bedroom homes and rejects one-bedroom ones', async () => {
  const studios = searcher([page({ homes: [peer('a', 1000, { bedrooms: 0 })] })]);
  assert.equal((await collectComparison({ search: studios.search, scope: studioScope })).status, 'complete');

  const mixed = searcher([page({ homes: [peer('a', 1000, { bedrooms: 0 }), peer('b', 1100, { bedrooms: 1 })] })]);
  assert.equal((await collectComparison({ search: mixed.search, scope: studioScope })).status, 'incomplete');
});

test('an incomplete slug leaves the comparison incomplete', async () => {
  const { search } = searcher([page({ homes: [peer('a', 1000), peer('', 1100)] })]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
});

test('a malformed envelope leaves the comparison incomplete', async () => {
  for (const bad of [null, {}, { response: null }, { response: { market: { slug: AUSTIN }, page: 1 } }]) {
    const { search } = searcher([bad]);
    assert.equal((await collectComparison({ search, scope })).status, 'incomplete', JSON.stringify(bad));
  }
});

test('more homes than the page claims to hold leaves the comparison incomplete', async () => {
  const { search } = searcher([page({ homes: [peer('a', 1000), peer('b', 1100)], perPage: 1, totalCount: 2 })]);
  assert.equal((await collectComparison({ search, scope })).status, 'incomplete');
});

// --- stating it against a subject ------------------------------------------

const fiveHomes = {
  status: 'complete',
  homes: [1000, 2000, 3000, 4000, 5000].map((amount, i) => ({ slug: `h${i}`, price: { amount } })),
};

test('five eligible other homes qualify; four do not', () => {
  const ready = compareSubject(fiveHomes, { subjectSlug: 'subject' });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.count, 5);
  assert.equal(ready.median, 3000);

  const four = compareSubject({ status: 'complete', homes: fiveHomes.homes.slice(0, 4) }, { subjectSlug: 'subject' });
  assert.equal(four.status, 'insufficient');
  assert.equal(four.count, 4);
  assert.equal(four.median, null);
});

test('the selected subject is excluded from its own comparison', () => {
  const withSubject = { status: 'complete', homes: [...fiveHomes.homes, { slug: 'subject', price: { amount: 99999 } }] };
  const result = compareSubject(withSubject, { subjectSlug: 'subject' });
  assert.equal(result.count, 5);
  assert.equal(result.median, 3000);
});

test('the same cached evidence yields a different median for a different subject', () => {
  const evidence = {
    status: 'complete',
    homes: [1000, 2000, 3000, 4000, 5000, 6000].map((amount, i) => ({ slug: `h${i}`, price: { amount } })),
  };
  assert.equal(compareSubject(evidence, { subjectSlug: 'h0' }).median, 4000);
  assert.equal(compareSubject(evidence, { subjectSlug: 'h5' }).median, 3000);
  assert.equal(compareSubject(evidence, { subjectSlug: 'absent' }).median, 3500);
});

test('ineligible homes never count toward the peer total', () => {
  const evidence = { status: 'complete', homes: [...fiveHomes.homes, { slug: 'nightly', price: null }] };
  assert.equal(compareSubject(evidence, { subjectSlug: 'subject' }).count, 5);
});

test('incomplete evidence is never stated as a market median', () => {
  assert.equal(compareSubject({ status: 'incomplete' }, { subjectSlug: 's' }).status, 'unavailable');
  assert.equal(compareSubject(undefined, { subjectSlug: 's' }).status, 'unavailable');
});
