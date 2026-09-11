import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdentity, responseIdentityFromHome } from '../src/lib/identity.js';

const base = {
  requestedSlug: 'apartment-in-austin-tx-lantana-hills-2321',
  responseSlug: 'apartment-in-austin-tx-lantana-hills-2321',
  responseUnitName: 'Lantana Hills 2321',
  responsePropertyName: 'Lantana Hills',
  visibleHeadingText: 'Lantana Hills 2321',
  visiblePropertyLinkText: 'Lantana Hills',
};

test('matching slug, unit name, and property name: confirmed', () => {
  assert.equal(checkIdentity(base), 'confirmed');
});

test('whitespace/case differences in visible text still confirm', () => {
  assert.equal(
    checkIdentity({ ...base, visibleHeadingText: '  lantana hills 2321  ', visiblePropertyLinkText: 'LANTANA HILLS' }),
    'confirmed',
  );
});

test('response slug does not match the full requested slug (including UUID suffix): mismatch', () => {
  assert.equal(
    checkIdentity({ ...base, responseSlug: 'apartment-in-austin-tx-lantana-hills-2321-a1b2c3' }),
    'mismatch',
  );
});

test('unit number split off the slug is not accepted as a substitute match: mismatch', () => {
  // A response that only echoes the property, not the exact unit, must not be trusted.
  assert.equal(
    checkIdentity({ ...base, responseUnitName: 'Lantana Hills', visibleHeadingText: 'Lantana Hills 2321' }),
    'mismatch',
  );
});

test('property name mismatches the visible property link: mismatch', () => {
  assert.equal(checkIdentity({ ...base, responsePropertyName: 'Some Other Property' }), 'mismatch');
});

test('the property link\'s wrapper text ("See all units at {property}") still confirms', () => {
  assert.equal(checkIdentity({ ...base, visiblePropertyLinkText: 'See all units at Lantana Hills' }), 'confirmed');
});

test('visible identity could not be read from the page: ambiguous, no attached claim', () => {
  assert.equal(checkIdentity({ ...base, visibleHeadingText: null, visiblePropertyLinkText: null }), 'ambiguous');
});

test('missing response identity fields: ambiguous', () => {
  assert.equal(checkIdentity({ ...base, responseUnitName: null }), 'ambiguous');
});

test('responseIdentityFromHome pulls slug/name/property out of a raw home response', () => {
  const raw = { slug: 's-1', name: 'Unit 1', property: { name: 'Property 1' } };
  assert.deepEqual(responseIdentityFromHome(raw), { slug: 's-1', unitName: 'Unit 1', propertyName: 'Property 1' });
});

test('responseIdentityFromHome tolerates a missing property object', () => {
  assert.deepEqual(responseIdentityFromHome({ slug: 's-1', name: 'Unit 1' }), { slug: 's-1', unitName: 'Unit 1', propertyName: undefined });
});
