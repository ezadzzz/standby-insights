const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

function rangeText(range) {
  const end = range.endDate ? formatDate(range.endDate) : 'unspecified end';
  const kind = range.isReservation ? 'Reservation' : (range.moveInAllowed ? 'Move-in allowed' : 'Move-in not allowed');
  return `${formatDate(range.startDate)} – ${end}: ${kind}`;
}

/**
 * States the reference the summary is made against. A selected check-in is
 * named as the member's own; anything else is labeled so the extension never
 * appears to know their plans.
 */
function referenceNoteText(state) {
  if (!state.referenceDate) return '';
  if (state.checkIn?.status === 'disagreement') {
    return `The date on this page and the date in its address disagree, so no date is treated as selected. Facts below are stated against the check date, ${formatDate(state.referenceDate)}.`;
  }
  if (state.checkIn?.status === 'selected') {
    return `Relative to your selected check-in of ${formatDate(state.referenceDate)}.`;
  }
  return `No selected check-in date was read. Facts below are stated against the check date, ${formatDate(state.referenceDate)}.`;
}

/** Visible reservation and standard move-in statements for the reference date. */
function summaryItemsFor(summary) {
  const items = [];
  const { intersectingReservation: current, nextReservation: next } = summary;

  if (current) {
    const end = current.endDate ? formatDate(current.endDate) : 'an unspecified end';
    items.push(`A reservation is in progress on the reference date, running from ${formatDate(current.startDate)} to ${end} (end date shown for overlap only).`);
  }
  if (next) {
    items.push(`Next reservation starts ${formatDate(next.startDate)}.`);
  }
  if (summary.noStandardMoveInBeforeNext) {
    items.push('No standard move-in offered before that reservation.');
  }
  if (summary.noReservationsInCalendar) {
    const through = summary.coverageEnd
      ? `through ${formatDate(summary.coverageEnd)}`
      : 'through a final range with an unspecified end';
    items.push(`The returned calendar shows no reservation from ${formatDate(summary.coverageStart)} ${through}.`);
  }
  if (summary.noStandardMoveInInCalendar) {
    const through = summary.coverageEnd
      ? `through ${formatDate(summary.coverageEnd)}`
      : 'through a final range with an unspecified end';
    items.push(`The returned calendar shows no standard move-in range from ${formatDate(summary.coverageStart)} ${through}.`);
  }
  return items;
}

const UNAVAILABLE = 'Unavailable';

function scoreText(score) {
  if (!score) return UNAVAILABLE;
  return score.description ? `${score.value} (${score.description})` : String(score.value);
}

function ratingText(rating) {
  if (!rating) return UNAVAILABLE;
  // A building nobody has reviewed is unrated. Stating its average would read
  // as a score the reviews never gave it.
  if (rating.count === 0) return 'Unrated (no reviews)';
  // No sampled field states the scale this average is out of, so the panel
  // states the number supplied and the count behind it, and invents neither.
  return `${rating.average} from ${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}`;
}

/** One Flex term, in the response's own words rather than its field names. */
function flexOptionText(option) {
  const parts = [];
  const name = option.label ?? (option.months === null ? null : `${option.months}-month term`);
  if (name !== null) parts.push(name);
  if (option.months !== null && option.label !== null) parts.push(`${option.months} months`);
  if (option.committedNights !== null) parts.push(`${option.committedNights} committed nights`);
  if (option.specialOffer !== null) parts.push(option.specialOffer ? 'special offer' : 'no special offer');
  if (option.earlyTerminationFeeType !== null) {
    parts.push(`early termination fee: ${option.earlyTerminationFeeType.replace(/-/g, ' ')}`);
  }
  parts.push(...option.extra);
  return parts.join(' · ');
}

/**
 * Leads with whether any supplied Flex term carries a special offer, which is
 * the fact worth seeing first. It is stated only about terms that actually
 * supplied the field: a term that never carried one is unknown, not an absent
 * offer. The panel states the fact and stops — what it implies about this
 * unit's demand is the member's inference, not the extension's claim.
 */
function flexFact(flexOptions) {
  if (flexOptions === null) return { text: UNAVAILABLE, details: [] };
  if (flexOptions.length === 0) return { text: 'No Flex options supplied', details: [] };

  const details = flexOptions.map(flexOptionText);
  const stated = flexOptions.filter((option) => option.specialOffer !== null);
  const offered = stated.filter((option) => option.specialOffer);
  const terms = `${flexOptions.length} Flex ${flexOptions.length === 1 ? 'term' : 'terms'}`;

  if (stated.length === 0) return { text: `${terms}; special offer not supplied`, details };
  if (offered.length === 0) {
    return { text: `No special offer on ${stated.length === 1 ? 'the supplied Flex term' : `any of the ${stated.length} supplied Flex terms`}`, details };
  }
  return { text: `Special offer on ${offered.length} of ${stated.length} supplied Flex terms`, details };
}

/**
 * The facts the response supplies about this unit and its building, in the
 * specification's order. Every field gets its own line whether or not it could
 * be read, so an absent fact is visibly absent rather than silently dropped.
 */
function factItemsFor(facts) {
  return [
    { label: 'Minimum stay', text: facts.minimumStay === null ? UNAVAILABLE : `${facts.minimumStay} ${facts.minimumStay === 1 ? 'night' : 'nights'}` },
    { label: 'Flex', ...flexFact(facts.flexOptions) },
    { label: 'Rating', text: ratingText(facts.rating) },
    { label: 'Walk score', text: scoreText(facts.scores.walk) },
    { label: 'Transit score', text: scoreText(facts.scores.transit) },
    { label: 'Bike score', text: scoreText(facts.scores.bike) },
  ].map((item) => ({ details: [], ...item }));
}

/**
 * Pure formatting from evidence-controller state to panel text. Kept
 * separate from panel.js's DOM wiring so it is testable without a browser.
 */
export function describeState(state) {
  const view = {
    headingText: state.unitName ?? 'Standby evidence',
    identityNote: '',
    checkTimeText: 'Not checked yet',
    calendarStatusText: '',
    referenceNote: '',
    summaryItems: [],
    rangeItems: [],
    factItems: [],
    refreshFailedNote: null,
  };

  if (state.status === 'mismatch' || state.status === 'ambiguous') {
    view.identityNote = 'Evidence unavailable: could not confirm this is the exact displayed unit.';
  }

  if (state.status === 'unavailable') {
    view.calendarStatusText = 'Calendar unavailable';
  }

  if (state.status === 'ready' && Array.isArray(state.ranges)) {
    view.rangeItems = state.ranges.map((r) => ({ text: rangeText(r), isReservation: r.isReservation }));
    view.referenceNote = referenceNoteText(state);
    if (state.summary) view.summaryItems = summaryItemsFor(state.summary);
  }

  // Facts are independent of the calendar: they render whenever the response
  // they came from was confirmed to be this unit's.
  if (state.facts) view.factItems = factItemsFor(state.facts);

  if (state.checkedAt !== null) {
    view.checkTimeText = `Checked ${timeFormatter.format(new Date(state.checkedAt))}`;
    if (state.isStale) view.checkTimeText += ' (showing an older check)';
  } else if (state.isChecking) {
    view.checkTimeText = 'Checking…';
  }

  if (state.isStale && state.error) {
    view.refreshFailedNote = 'The last refresh failed; showing the previous check.';
  }

  return view;
}
