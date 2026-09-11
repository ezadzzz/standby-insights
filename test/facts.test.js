import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFacts } from '../src/lib/facts.js';
import {
  completeFactsHome,
  missingFactsHome,
  malformedFactsHome,
  zeroReviewsHome,
} from './fixtures/home-responses.js';

test('a complete response supplies every fact', () => {
  const facts = deriveFacts(completeFactsHome);
  assert.equal(facts.minimumStay, 30);
  assert.deepEqual(facts.rating, { average: 4.15, count: 13 });
  assert.deepEqual(facts.scores.walk, { value: 41, description: 'Car-Dependent' });
  assert.deepEqual(facts.scores.transit, { value: 29, description: 'Some Transit' });
  assert.deepEqual(facts.scores.bike, { value: 52, description: 'Bikeable' });
});

test('missing fields are individually absent, never a favorable default', () => {
  const facts = deriveFacts(missingFactsHome);
  assert.equal(facts.minimumStay, null);
  assert.equal(facts.rating, null);
  assert.deepEqual(facts.scores, { walk: null, transit: null, bike: null });
});

test('malformed fields are rejected one by one without taking the rest down', () => {
  const facts = deriveFacts(malformedFactsHome);
  assert.equal(facts.minimumStay, null, 'a zero minimum stay is not a real minimum');
  assert.equal(facts.rating, null, 'a non-numeric average and negative count are unusable');
  assert.equal(facts.scores.walk, null, 'a non-numeric score is unusable');
  assert.equal(facts.scores.transit, null, 'a score outside the published band is unusable');
  assert.equal(facts.scores.bike, null);
});

test('a described score survives a sibling score being unusable', () => {
  const facts = deriveFacts({ property: { walk_score: 41, walk_score_description: 'Car-Dependent', transit_score: 'n/a' } });
  assert.deepEqual(facts.scores.walk, { value: 41, description: 'Car-Dependent' });
  assert.equal(facts.scores.transit, null);
});

test('zero reviews is an unrated building, not a rating of zero', () => {
  const facts = deriveFacts(zeroReviewsHome);
  assert.deepEqual(facts.rating, { average: 0, count: 0 });
});

test('a response that is not an object yields all-absent facts rather than throwing', () => {
  for (const raw of [null, undefined, 'nope', 42]) {
    assert.deepEqual(deriveFacts(raw), {
      minimumStay: null,
      rating: null,
      flexOptions: null,
      scores: { walk: null, transit: null, bike: null },
    });
  }
});

test('supplied Flex options are shown as given, including an unsampled object shape', () => {
  const facts = deriveFacts(completeFactsHome);
  assert.deepEqual(facts.flexOptions, ['nights: 7, label: Flex 7', 'Flex 14']);
});

test('a Flex field that is not a list is still shown rather than discarded', () => {
  assert.deepEqual(deriveFacts(malformedFactsHome).flexOptions, ['sometimes']);
});

test('an empty Flex field is an empty list, distinct from the field being absent', () => {
  assert.deepEqual(deriveFacts({ flex_options: [] }).flexOptions, []);
  assert.equal(deriveFacts(missingFactsHome).flexOptions, null);
});
