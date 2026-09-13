import { MINIMUM_PEERS } from '../lib/comparison.js';
import { sixWeekView, describeStandbyOnly } from '../lib/six-week-view.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

function rangeView(range) {
  const end = range.endDate ? formatDate(range.endDate) : 'unspecified end';
  const dateText = `${formatDate(range.startDate)} – ${end}`;
  const standbyOnly = range.unbookableReason === 'less_than_minimum_nightly_stay';
  let statusText = range.moveInAllowed ? 'Move-in allowed' : 'Move-in not allowed';
  if (standbyOnly) statusText = 'Standby-only: too short for a standard stay';
  if (range.isReservation) statusText = 'Reservation';
  return { dateText, statusText, text: `${dateText}: ${statusText}`, isReservation: range.isReservation,
    icon: range.isReservation ? 'calendar' : (range.moveInAllowed ? 'check' : (standbyOnly ? 'info' : 'blocked')) };
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

/**
 * The six-week calendar grid: the same days as a card's strip, laid out by
 * weekday so today and the member's check-in can be found at a glance. The
 * grid's label states every stretch in words.
 */
function calendarGrid(weeks, today, checkIn) {
  const checkInIndex = checkIn?.status === 'selected' ? weeks.checkInIndex : null;
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return {
    label: weeks.label,
    leadingBlanks: new Date(`${today}T00:00:00Z`).getUTCDay(),
    cells: weeks.days.map((day, index) => {
      const date = new Date(`${day.date}T00:00:00Z`);
      return {
        dayText: index === 0 || date.getUTCDate() === 1 ? monthDay.format(date) : String(date.getUTCDate()),
        kind: day.kind,
        isToday: index === 0,
        isCheckIn: index === checkInIndex,
      };
    }),
  };
}

const UNAVAILABLE = 'Unavailable';

const moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function money(amount) {
  return moneyFormatter.format(amount);
}

/**
 * The subject's own advertised price, in the response's own label. A price the
 * comparison rule rejects — nightly, non-USD, unusable — is stated as
 * unavailable rather than converted or guessed into a monthly figure.
 */
function subjectPriceText(price) {
  if (!price) return 'This home has no eligible advertised monthly price, so it is not stated here.';
  const label = price.label ?? 'per month (label not supplied)';
  return `This home: ${money(price.amount)}${label.startsWith(' ') ? '' : ' '}${label}.`;
}

/**
 * The terms the subject's advertised price was supplied alongside. They are
 * named because the price is only comparable under them, and a home that
 * supplied none says so rather than reading as a home with no commitment.
 */
function termsText(price) {
  if (!price) return '';
  if (price.terms === null) return 'Terms for this price were not supplied.';
  if (price.terms.length === 0) return 'This price was supplied with no commitment terms.';
  return `Terms supplied with this price: ${price.terms.join(', ')}.`;
}

const plural = (count, singular) => (count === 1 ? singular : `${singular}s`);

const COMPARISON_DISCLOSURE = 'These are currently advertised monthly prices, which already reflect any discount a home is carrying. Underlying commitment and discount terms differ between homes. This is not a matched-date booking quote and not a prediction that this home’s price will change.';

/**
 * The comparison as the member sees it. Each outcome is distinguishable: too
 * few eligible peers is not the same statement as an attempt that could not be
 * completed, and neither is ever shown as a market median.
 */
function comparisonView(state) {
  const comparison = state.comparison;
  const view = { visible: false, statusText: '', subjectText: '', termsNote: '', disclosure: '', checkTimeText: '', prices: [], scopeText: '' };
  if (!comparison || comparison.status === 'idle') return view;

  view.visible = true;
  if (comparison.status === 'loading') {
    view.statusText = 'Loading comparable advertised prices…';
    return view;
  }

  if (comparison.status === 'unresolved-scope') {
    view.statusText = 'Comparison unavailable: this home’s market or bedroom count could not be resolved, so there is no scope to compare it against.';
    return view;
  }

  if (comparison.status === 'unavailable') {
    view.statusText = 'Comparison unavailable: the full set of comparable homes could not be collected.';
  } else if (comparison.status === 'insufficient') {
    view.statusText = `Not enough comparable prices: ${comparison.count} eligible other ${plural(comparison.count, 'home')} in this market and bedroom count, and at least ${MINIMUM_PEERS} are needed.`;
  } else if (comparison.status === 'ready') {
    view.statusText = `Median advertised monthly price across ${comparison.count} other ${plural(comparison.count, 'home')} in the same market and bedroom count: ${money(comparison.median)}.`;
    view.scopeText = `${comparison.count} other ${plural(comparison.count, 'home')} · Same market and bedroom count.`;
    view.prices = [
      { label: 'This home', amount: comparison.subjectPrice ? money(comparison.subjectPrice.amount) : UNAVAILABLE,
        unit: comparison.subjectPrice ? (comparison.subjectPrice.label ?? 'per month (label not supplied)') : '' },
      { label: 'Peer median', amount: money(comparison.median), unit: 'per month' },
    ];
  }

  view.subjectText = subjectPriceText(comparison.subjectPrice);
  view.termsNote = [termsText(comparison.subjectPrice), comparison.subjectPrice?.note]
    .filter((line) => line)
    .join(' ');
  view.disclosure = COMPARISON_DISCLOSURE;

  if (comparison.checkedAt !== null) {
    view.checkTimeText = `Comparison checked ${timeFormatter.format(new Date(comparison.checkedAt))}`;
    if (comparison.isStale) view.checkTimeText += ' (showing an older check)';
  }
  return view;
}

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
  if (option.specialOffer !== null) parts.push(option.specialOffer ? 'special offer advertised' : 'no special offer advertised');
  if (option.earlyTerminationFeeType !== null) {
    parts.push(`early termination fee: ${option.earlyTerminationFeeType.replace(/-/g, ' ')}`);
  }
  parts.push(...option.extra);
  return parts.join(' · ');
}

/**
 * Leads with whether any supplied Flex term advertises a special offer, which
 * is the fact worth seeing first. It is stated only about terms that actually
 * supplied the field: a term that never carried one is unknown, not an absent
 * offer.
 *
 * The flag is scoped to one term on one unit, and sampling showed it advertises
 * that an offer exists rather than that a stay is discounted — the same flagged
 * term yields a discount for one move-in date and none for another, and only a
 * quote settles it. This panel requests no quotes, so an advertised offer is
 * said to be advertised and nothing more. What it implies about competing
 * demand for the unit is the member's inference, not the extension's claim.
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
    return { text: `No special offer advertised on ${stated.length === 1 ? 'the supplied Flex term' : `any of the ${stated.length} supplied Flex terms`}`, details };
  }
  return {
    text: `Special offer advertised on ${offered.length} of ${stated.length} supplied Flex terms`,
    details: [...details, 'An advertised term offer is not a quoted price; whether it applies can depend on the move-in date.'],
  };
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
    standbyOnly: null,
    grid: null,
    summaryItems: [],
    rangeItems: [],
    factItems: [],
    refreshFailedNote: null,
    comparison: comparisonView(state),
  };

  if (state.status === 'mismatch' || state.status === 'ambiguous') {
    view.identityNote = 'Evidence unavailable: could not confirm this is the exact displayed unit.';
  }

  if (state.status === 'unavailable') {
    view.calendarStatusText = 'Calendar unavailable';
  }

  if (state.status === 'ready' && Array.isArray(state.ranges)) {
    view.rangeItems = state.ranges.map(rangeView);
    view.referenceNote = referenceNoteText(state);
    if (state.summary) view.summaryItems = summaryItemsFor(state.summary);
    if (state.today && state.referenceDate) {
      const weeks = sixWeekView(state.ranges, state.today, state.referenceDate);
      view.standbyOnly = describeStandbyOnly(weeks);
      view.grid = calendarGrid(weeks, state.today, state.checkIn);
    }
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
