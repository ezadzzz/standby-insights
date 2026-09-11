import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCardIdentity } from '../src/lib/identity.js';
import { observedCards } from './fixtures/home-responses.js';

const forCard = (card, overrides = {}) => ({
  requestedSlug: card.response.slug,
  responseSlug: card.response.slug,
  responseUnitName: card.response.name,
  responsePropertyName: card.response.property.name,
  cardText: card.text,
  ...overrides,
});

test('a live card confirms against the response that its own href asked for', () => {
  for (const card of observedCards) {
    assert.equal(checkCardIdentity(forCard(card)), 'confirmed', card.href);
  }
});

test('a UUID-suffixed slug is carried whole, never reconstructed from the unit number', () => {
  const card = observedCards[0];
  assert.ok(card.response.slug.endsWith('48765205-6241-4d0f-b7f3-2ce083663557'));
  assert.equal(checkCardIdentity(forCard(card)), 'confirmed');
  assert.equal(
    checkCardIdentity(forCard(card, { responseSlug: 'apartment-in-austin-tx-cortland-south-park-terraces-1831' })),
    'mismatch',
    'a truncated response slug is a different unit',
  );
});

test('a property whose name is absent from the card is a mismatch', () => {
  const card = observedCards[0];
  assert.equal(checkCardIdentity(forCard(card, { cardText: 'Some Other Building4.2Unit 1831|2|1' })), 'mismatch');
});

test('a property-only match never confirms a unit', () => {
  const card = observedCards[0];
  assert.equal(
    checkCardIdentity(forCard(card, { cardText: 'Cortland Southpark Terraces4.2Unit 2200|2|1Available' })),
    'mismatch',
    'the right building showing a different unit is not this unit',
  );
});

test('a unit designator is matched whole, so 183 never passes for 1831', () => {
  const card = observedCards[0];
  assert.equal(
    checkCardIdentity(forCard(card, {
      responseUnitName: 'Cortland Southpark Terraces 183',
      cardText: 'Cortland Southpark Terraces4.2Unit 1831|2|1Available',
    })),
    'mismatch',
  );
});

test('a response name that does not extend its own property name is ambiguous, not a guess', () => {
  const card = observedCards[0];
  assert.equal(
    checkCardIdentity(forCard(card, { responseUnitName: 'Completely Different Label' })),
    'ambiguous',
  );
});

test('any missing field is ambiguous rather than a partial confirmation', () => {
  const card = observedCards[0];
  for (const field of ['responseUnitName', 'responsePropertyName', 'cardText']) {
    assert.equal(checkCardIdentity(forCard(card, { [field]: null })), 'ambiguous', field);
    assert.equal(checkCardIdentity(forCard(card, { [field]: '   ' })), 'ambiguous', `blank ${field}`);
  }
});
