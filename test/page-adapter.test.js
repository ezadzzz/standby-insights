import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSlugFromPath, extractVisibleIdentity } from '../src/content/page-adapter.js';

// Fixture shapes captured from a live signed-out inspection of
// https://www.hellolanding.com/homes/apartment-in-austin-tx-lantana-hills-2321/standby
// (2026-09-11): h1 text and the property link's accessible text, which wraps
// the property name rather than stating it alone.
function renderedDetailPage({ heading, propertyLinkText, propertyLinkHref = '/properties/lantana-hills' } = {}) {
  return {
    querySelector(selector) {
      if (selector === 'h1') return heading === undefined ? null : { textContent: heading };
      if (selector === 'a[href^="/properties/"]') {
        return propertyLinkText === undefined ? null : { textContent: propertyLinkText, getAttribute: () => propertyLinkHref };
      }
      return null;
    },
  };
}

test('parses the full slug, including UUID-like suffixes, from a Standby detail path', () => {
  assert.equal(
    parseSlugFromPath('/homes/apartment-in-austin-tx-lantana-hills-2321/standby'),
    'apartment-in-austin-tx-lantana-hills-2321',
  );
  // location.pathname never carries the query string; that lives in location.search.
  assert.equal(
    parseSlugFromPath('/homes/apartment-in-birmingham-midtown-200-5-9f1c2b6a/standby'),
    'apartment-in-birmingham-midtown-200-5-9f1c2b6a',
  );
});

test('a non-detail path yields no slug', () => {
  assert.equal(parseSlugFromPath('/s/austin-tx/apartments/standby'), null);
  assert.equal(parseSlugFromPath('/homes/some-slug'), null); // general listing, not the Standby detail route
});

test('extracts the visible heading and property-link text from a rendered detail page', () => {
  const identity = extractVisibleIdentity(renderedDetailPage({
    heading: 'Lantana Hills 2321',
    propertyLinkText: 'See all units at Lantana Hills',
  }));
  assert.equal(identity.visibleHeadingText, 'Lantana Hills 2321');
  assert.equal(identity.visiblePropertyLinkText, 'See all units at Lantana Hills');
});

test('a page missing the heading or property link yields nulls rather than throwing', () => {
  const identity = extractVisibleIdentity(renderedDetailPage({}));
  assert.equal(identity.visibleHeadingText, null);
  assert.equal(identity.visiblePropertyLinkText, null);
});
