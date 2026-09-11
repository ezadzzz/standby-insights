// Fixtures derived from a live public get_apartment_tool response for
// apartment-in-austin-tx-lantana-hills-2321 (captured 2026-09-11), trimmed to
// the fields this extension reads.

export const validClosedCalendarHome = {
  slug: 'apartment-in-austin-tx-lantana-hills-2321',
  name: 'Lantana Hills 2321',
  property: { name: 'Lantana Hills' },
  availability: {
    ranges: [
      { start_date: '2026-09-11', end_date: '2026-09-11', move_in_allowed: false, unbookable_reason: 'reserved' },
      { start_date: '2026-09-12', end_date: '2026-09-24', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
      { start_date: '2026-09-25', end_date: '2026-09-25', move_in_allowed: false, unbookable_reason: 'reserved_move_in_blocked' },
      { start_date: '2026-09-26', end_date: '2026-10-24', move_in_allowed: false, unbookable_reason: 'reserved' },
      { start_date: '2026-10-25', end_date: '2026-10-31', move_in_allowed: false, unbookable_reason: 'less_than_minimum_nightly_stay' },
      { start_date: '2026-11-01', end_date: '2026-11-01', move_in_allowed: false, unbookable_reason: 'reserved_move_in_blocked' },
      { start_date: '2026-11-02', end_date: '2026-12-17', move_in_allowed: false, unbookable_reason: 'reserved' },
      { start_date: '2026-12-18', end_date: '2027-09-10', move_in_allowed: true },
      { start_date: '2027-09-11', move_in_allowed: false, unbookable_reason: 'future_booking_prevention' },
    ],
  },
};

export const validOpenCalendarHome = {
  slug: 'apartment-in-austin-tx-open-unit-1',
  name: 'Open Unit 1',
  property: { name: 'Open Property' },
  availability: {
    ranges: [
      { start_date: '2026-09-11', end_date: '2027-09-10', move_in_allowed: true },
    ],
  },
};

export const emptyRangesHome = {
  slug: 'apartment-in-austin-tx-empty-1',
  name: 'Empty Unit 1',
  property: { name: 'Empty Property' },
  availability: { ranges: [] },
};

export const missingAvailabilityHome = {
  slug: 'apartment-in-austin-tx-missing-1',
  name: 'Missing Unit 1',
  property: { name: 'Missing Property' },
};

export const malformedDateHome = {
  slug: 'apartment-in-austin-tx-bad-date-1',
  name: 'Bad Date Unit 1',
  property: { name: 'Bad Date Property' },
  availability: {
    ranges: [
      { start_date: 'not-a-date', end_date: '2026-09-24', move_in_allowed: false },
    ],
  },
};

export const nonBooleanMoveInHome = {
  slug: 'apartment-in-austin-tx-bad-flag-1',
  name: 'Bad Flag Unit 1',
  property: { name: 'Bad Flag Property' },
  availability: {
    ranges: [
      { start_date: '2026-09-11', end_date: '2026-09-24', move_in_allowed: 'yes' },
    ],
  },
};

export const contradictoryOverlapHome = {
  slug: 'apartment-in-austin-tx-overlap-1',
  name: 'Overlap Unit 1',
  property: { name: 'Overlap Property' },
  availability: {
    ranges: [
      { start_date: '2026-09-11', end_date: '2026-09-30', move_in_allowed: false, unbookable_reason: 'reserved' },
      { start_date: '2026-09-20', end_date: '2026-10-05', move_in_allowed: true },
    ],
  },
};

export const rangeAfterOpenEndedHome = {
  slug: 'apartment-in-austin-tx-bad-tail-1',
  name: 'Bad Tail Unit 1',
  property: { name: 'Bad Tail Property' },
  availability: {
    ranges: [
      { start_date: '2026-09-11', move_in_allowed: true },
      { start_date: '2026-10-01', end_date: '2026-10-05', move_in_allowed: false, unbookable_reason: 'reserved' },
    ],
  },
};
