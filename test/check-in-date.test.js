import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSelectedCheckIn } from '../src/content/page-adapter.js';

// Fixture shapes from the recorded detail-page inspection (docs/provenance):
// `#unit-calendar-unified-start-date` holds the visible check-in date, and an
// already-open picker exposes the full date in a td aria-label beginning
// "Selected as start date.".
function renderedDateControls({ displayedDateText, pickerLabel } = {}) {
  return {
    querySelector(selector) {
      if (selector === '#unit-calendar-unified-start-date') {
        return displayedDateText === undefined ? null : { textContent: displayedDateText };
      }
      if (selector.startsWith('td[aria-label')) {
        return pickerLabel === undefined ? null : { getAttribute: () => pickerLabel };
      }
      return null;
    },
  };
}

test('a valid ISO startDate with an agreeing displayed date is the selected check-in', () => {
  const result = readSelectedCheckIn({
    search: '?startDate=2026-09-15&searchedStartDate=2026-09-01&endDate=indefinite',
    doc: renderedDateControls({ displayedDateText: 'Sep 15' }),
  });
  assert.deepEqual(result, { status: 'selected', date: '2026-09-15' });
});

test('no startDate and nothing readable on the page yields no selected date', () => {
  const result = readSelectedCheckIn({ search: '', doc: renderedDateControls({}) });
  assert.equal(result.status, 'none');
  assert.equal(result.date, null);
});

test('searchedStartDate is never substituted for a missing startDate', () => {
  const result = readSelectedCheckIn({
    search: '?searchedStartDate=2026-09-15&searchedCity=austin-tx',
    doc: renderedDateControls({}),
  });
  assert.equal(result.status, 'none');
});

test('an invalid or non-ISO startDate is not a usable selected date', () => {
  for (const search of ['?startDate=09/15/2026', '?startDate=2026-13-40', '?startDate=indefinite']) {
    assert.equal(readSelectedCheckIn({ search, doc: renderedDateControls({}) }).status, 'none');
  }
});

test('URL and displayed control disagreeing during a date change is a disagreement, not a settled date', () => {
  const result = readSelectedCheckIn({
    search: '?startDate=2026-09-15',
    doc: renderedDateControls({ displayedDateText: 'Sep 22' }),
  });
  assert.equal(result.status, 'disagreement');
  assert.equal(result.date, null);
});

test('an already-rendered full selected-date picker label is a fallback when the URL has no startDate', () => {
  const result = readSelectedCheckIn({
    search: '',
    doc: renderedDateControls({ pickerLabel: 'Selected as start date. Tuesday, September 15, 2026' }),
  });
  assert.deepEqual(result, { status: 'selected', date: '2026-09-15' });
});

test('a yearless displayed date alone never guesses a year', () => {
  const result = readSelectedCheckIn({ search: '', doc: renderedDateControls({ displayedDateText: 'Sep 15' }) });
  assert.equal(result.status, 'none');
});

test('a displayed date the extension cannot parse is treated as unreadable, not as disagreement', () => {
  const result = readSelectedCheckIn({
    search: '?startDate=2026-09-15',
    doc: renderedDateControls({ displayedDateText: 'Add dates' }),
  });
  assert.deepEqual(result, { status: 'selected', date: '2026-09-15' });
});

test('a rendered picker label disagreeing with the URL suspends the selected date', () => {
  const result = readSelectedCheckIn({
    search: '?startDate=2026-09-15',
    doc: renderedDateControls({ pickerLabel: 'Selected as start date. Tuesday, September 22, 2026' }),
  });
  assert.equal(result.status, 'disagreement');
});

test('a startDate naming a day that does not exist is not a usable selected date', () => {
  assert.equal(readSelectedCheckIn({ search: '?startDate=2026-02-30', doc: renderedDateControls({}) }).status, 'none');
});
