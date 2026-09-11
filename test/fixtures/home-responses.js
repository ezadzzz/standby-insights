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

// flex_options below matches a live unit sampled 2026-09-11; every other
// field name is as recorded in the source project's API research, which is
// historical evidence rather than fresh verification: minimum_nightly_stay,
// flex_options, property.member_rating, and property.{walk,transit,bike}_score
// with a matching *_description band word. flex_options was never sampled
// there, so its shape below is a guess the code must not depend on.
export const completeFactsHome = {
  slug: 'apartment-in-austin-tx-facts-1',
  name: 'Facts Unit 1',
  property: {
    name: 'Facts Property',
    member_rating: { average: 4.15, count: 13 },
    walk_score: 41,
    walk_score_description: 'Car-Dependent',
    transit_score: 29,
    transit_score_description: 'Some Transit',
    bike_score: 52,
    bike_score_description: 'Bikeable',
  },
  minimum_nightly_stay: 30,
  flex_options: [
    { committed_nights: 180, label: '6-Month+ Stay', months: 6, special_offer: false, early_termination_fee_type: 'one-month-rent' },
    { committed_nights: 365, label: '12-Month+ Stay', months: 12, special_offer: true, early_termination_fee_type: 'two-months-rent' },
  ],
  availability: { ranges: [{ start_date: '2026-09-11', move_in_allowed: true }] },
};

export const missingFactsHome = {
  slug: 'apartment-in-austin-tx-facts-2',
  name: 'Facts Unit 2',
  property: { name: 'Facts Property Two' },
  availability: { ranges: [{ start_date: '2026-09-11', move_in_allowed: true }] },
};

export const malformedFactsHome = {
  slug: 'apartment-in-austin-tx-facts-3',
  name: 'Facts Unit 3',
  property: {
    name: 'Facts Property Three',
    member_rating: { average: 'great', count: -2 },
    walk_score: 'high',
    transit_score: 140,
    bike_score: null,
  },
  minimum_nightly_stay: 0,
  flex_options: 'sometimes',
  availability: { ranges: [{ start_date: '2026-09-11', move_in_allowed: true }] },
};

export const zeroReviewsHome = {
  slug: 'apartment-in-austin-tx-facts-4',
  name: 'Facts Unit 4',
  property: { name: 'Facts Property Four', member_rating: { average: 0, count: 0 } },
  availability: { ranges: [{ start_date: '2026-09-11', move_in_allowed: true }] },
};

// Facts are intact but the calendar cannot be validated: one must not
// suppress the other.
export const factsWithBrokenCalendarHome = {
  slug: 'apartment-in-austin-tx-facts-5',
  name: 'Facts Unit 5',
  property: { name: 'Facts Property Five', member_rating: { average: 4.8, count: 6 } },
  minimum_nightly_stay: 30,
  availability: { ranges: [] },
};

// Observed live on https://www.hellolanding.com/s/austin-tx/apartments/standby
// (2026-09-11). A card's visible text runs property, rating, unit designator,
// bed/bath and availability together with no separators, and the public
// response's `name` is the property followed by that unit designator.
export const observedCards = [
  {
    href: '/homes/apartment-in-austin-tx-cortland-south-park-terraces-1831-48765205-6241-4d0f-b7f3-2ce083663557',
    text: 'Cortland Southpark Terraces4.2Unit 1831|2|1Available Saturday Sep 12',
    response: {
      slug: 'apartment-in-austin-tx-cortland-south-park-terraces-1831-48765205-6241-4d0f-b7f3-2ce083663557',
      name: 'Cortland Southpark Terraces 1831',
      property: { name: 'Cortland Southpark Terraces' },
    },
  },
  {
    href: '/homes/apartment-in-manor-tx-eighty-one10-2309',
    text: 'Eighty One104.5Unit 2309|1|1Available Saturday Sep 12',
    response: {
      slug: 'apartment-in-manor-tx-eighty-one10-2309',
      name: 'Eighty One10 2309',
      property: { name: 'Eighty One10' },
    },
  },
];
