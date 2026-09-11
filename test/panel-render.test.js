import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeState } from '../src/panel/render.js';

test('idle state: prompts without asserting anything about a unit', () => {
  const view = describeState({ status: 'idle', identity: null, unitName: null, ranges: null, checkedAt: null, isChecking: false, isStale: false, error: null });
  assert.equal(view.checkTimeText, 'Not checked yet');
  assert.equal(view.rangeItems.length, 0);
  assert.equal(view.headingText, 'Standby evidence');
});

test('mismatched or ambiguous identity attaches no unit-specific claim, including in the heading', () => {
  for (const identity of ['mismatch', 'ambiguous']) {
    const view = describeState({ status: identity, identity, unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
    assert.match(view.identityNote, /could not confirm/i);
    assert.equal(view.rangeItems.length, 0);
    assert.equal(view.headingText, 'Standby evidence');
  }
});

test('unavailable calendar: labeled unavailable, not an empty result', () => {
  const view = describeState({ status: 'unavailable', identity: 'confirmed', unitName: null, ranges: null, checkedAt: 1000, isChecking: false, isStale: false, error: null });
  assert.equal(view.calendarStatusText, 'Calendar unavailable');
});

test('ready calendar: shows the validated unit name and chronological range descriptions with reservation and unspecified-end labels', () => {
  const view = describeState({
    status: 'ready',
    identity: 'confirmed',
    unitName: 'Lantana Hills 2321',
    ranges: [
      { startDate: '2026-09-11', endDate: '2026-09-11', moveInAllowed: false, isReservation: true, unbookableReason: 'reserved' },
      { startDate: '2026-12-18', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null },
    ],
    checkedAt: 1000,
    isChecking: false,
    isStale: false,
    error: null,
  });
  assert.equal(view.headingText, 'Lantana Hills 2321');
  assert.equal(view.rangeItems.length, 2);
  assert.match(view.rangeItems[0].text, /reservation/i);
  assert.match(view.rangeItems[1].text, /unspecified/i);
  assert.match(view.rangeItems[1].text, /move-in allowed/i);
});

test('stale evidence during a recheck is labeled an older check', () => {
  const view = describeState({ status: 'ready', identity: 'confirmed', ranges: [], checkedAt: 1000, isChecking: true, isStale: true, error: null });
  assert.match(view.checkTimeText, /older check/i);
});

test('a failed refresh is labeled an older check with the failure noted, without erasing retained evidence', () => {
  const view = describeState({
    status: 'ready',
    identity: 'confirmed',
    ranges: [{ startDate: '2026-09-11', endDate: null, moveInAllowed: true, isReservation: false, unbookableReason: null }],
    checkedAt: 1000,
    isChecking: false,
    isStale: true,
    error: 'GateTimeoutError',
  });
  assert.match(view.checkTimeText, /older check/i);
  assert.equal(view.rangeItems.length, 1);
  assert.ok(view.refreshFailedNote);
});
