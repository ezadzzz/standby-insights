import { MINIMUM_PEERS } from '../lib/comparison.js';
import { sixWeekView, describeHeadline, drawnKey } from '../lib/six-week-view.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** The whole returned range a grid day belongs to, shown on hover. */
function rangeText(range) {
  const end = range.endDate ? formatDate(range.endDate) : 'unspecified end';
  const dateText = `${formatDate(range.startDate)} – ${end}`;
  const standbyOnly = range.unbookableReason === 'less_than_minimum_nightly_stay';
  let statusText = range.moveInAllowed ? 'Standard move-in allowed' : 'Move-in blocked';
  if (standbyOnly) statusText = 'Standby-only: too short for a standard stay';
  if (range.isReservation) statusText = 'Reserved';
  return `${dateText}: ${statusText}`;
}

/**
 * States the reference the summary is made against. A selected check-in is
 * named as the member's own; anything else is labeled so the extension never
 * appears to know their plans.
 */
function referenceNoteText(state) {
  if (!state.referenceDate) return '';
  // "Today" only when the reference date is today; otherwise the date alone.
  const against = `Facts below are stated against ${state.referenceDate === state.today ? 'today, ' : ''}${formatDate(state.referenceDate)}.`;
  if (state.checkIn?.status === 'disagreement') {
    return `The date on this page and the date in its address disagree, so no date is treated as selected. ${against}`;
  }
  // Stated in words as well as marked, so the mark is never the only carrier.
  if (state.checkIn?.status === 'selected') return `Your check-in: ${formatDate(state.referenceDate)}.`;
  return `No selected check-in date was read. ${against}`;
}

/** Visible reservation and standard move-in statements for the reference date. */
function summaryItemsFor(summary, omitNext) {
  const items = [];
  const { intersectingReservation: current, nextReservation: next } = summary;

  if (current) {
    let runs = current.endDate
      ? `runs ${formatDate(current.startDate)} to ${formatDate(current.endDate)}`
      : `runs from ${formatDate(current.startDate)}, with no end date supplied`;
    if (current.endDate === current.startDate) runs = `is for ${formatDate(current.startDate)} only`;
    items.push(`The reservation on this date ${runs}. An end date shows only where it overlaps the calendar, not when a stay could start or end.`);
  }
  if (next && !omitNext) {
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
    // Same sentence as the card strip's label, so both surfaces say it alike.
    label: checkInIndex === null
      ? weeks.label
      : `${weeks.label}. Your check-in, ${formatDate(weeks.days[checkInIndex].date)}, is marked`,
    leadingBlanks: new Date(`${today}T00:00:00Z`).getUTCDay(),
    // Today is always drawn (index 0); the check-in mark only when selected.
    key: drawnKey(weeks.days.map((d) => d.kind), [
      { kind: 'today', text: 'Today' },
      ...(checkInIndex === null ? [] : [{ kind: 'check-in', text: 'Your check-in' }]),
    ]),
    cells: weeks.days.map((day, index) => {
      const date = new Date(`${day.date}T00:00:00Z`);
      return {
        dayText: index === 0 || date.getUTCDate() === 1 ? monthDay.format(date) : String(date.getUTCDate()),
        kind: day.kind,
        isToday: index === 0,
        isCheckIn: index === checkInIndex,
        title: day.range ? rangeText(day.range) : 'No calendar data for this day',
      };
    }),
  };
}

const UNAVAILABLE = 'Unavailable';

/**
 * A failure's cause in member words, distinct from a calendar the response
 * simply did not carry. Rate limiting is named on its own because it is a
 * known, temporary condition, not an unexplained network failure.
 */
function failureCauseText(error) {
  if (error === 'RateLimitedError') return 'Landing asked this extension to slow down';
  return 'the network request did not complete';
}

/**
 * Names the unit as the page shows it and what kind of failure this was,
 * without saying the response was that unit: a mismatch is a response that
 * described a different unit, an ambiguous one lacked what confirming needed.
 */
function identityNoteText(state) {
  const shown = state.displayedName;
  if (!shown) return 'Evidence unavailable: could not confirm this is the exact displayed unit. Refresh to check again.';
  const why = state.status === 'mismatch'
    ? "Landing's data for this listing did not match"
    : "Landing's data did not include enough to confirm";
  return `Evidence unavailable: could not confirm this is ${shown}. ${why} ${shown} as shown on this page. Refresh to check again.`;
}

// Said once, in the panel only. The last clause is the part a member can't
// see on the calendar: the gap is a consequence of the reservation after it.
const STANDBY_ONLY_EXPLAINER = 'Standby-only nights are too few for a standard stay, so only Standby can book them. That lasts only while the reservation after them holds: if it moves or is cancelled, standard stays may be able to book those nights.';

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

const COMPARISON_CAVEAT = 'Advertised prices, not a quote for your dates.';
const COMPARISON_DISCLOSURE = 'These are currently advertised monthly prices, which already reflect any discount a home is carrying. Underlying commitment and discount terms differ between homes. This is not a matched-date booking quote and not a prediction that this home’s price will change.';

/**
 * The comparison as the member sees it. Each outcome is distinguishable: too
 * few eligible peers is not the same statement as an attempt that could not be
 * completed, and neither is ever shown as a market median.
 */
function comparisonView(state) {
  const comparison = state.comparison;
  const view = { visible: false, statusText: '', differenceText: '', subjectText: '', termsNote: '', caveat: '', disclosure: '', checkTimeText: '', prices: [], scopeText: '' };
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
    // The median's label already carries the count.
    view.scopeText = 'Same market and bedroom count as this home.';
    view.prices = [
      { label: 'This home', amount: comparison.subjectPrice ? money(comparison.subjectPrice.amount) : UNAVAILABLE,
        unit: comparison.subjectPrice ? (comparison.subjectPrice.label ?? 'per month (label not supplied)') : '' },
      { label: `Median of ${comparison.count} other ${plural(comparison.count, 'home')}`, amount: money(comparison.median), unit: 'per month' },
    ];
    if (comparison.subjectPrice) {
      // Rounded as the figures are shown, so the line never disagrees with them.
      const diff = Math.round(comparison.subjectPrice.amount) - Math.round(comparison.median);
      view.differenceText = diff === 0 ? 'Same as the median'
        : `${money(Math.abs(diff))} ${diff < 0 ? 'below' : 'above'} the median`;
    }
  }

  view.subjectText = subjectPriceText(comparison.subjectPrice);
  view.termsNote = [termsText(comparison.subjectPrice), comparison.subjectPrice?.note]
    .filter((line) => line)
    .join(' ');
  // Both qualify price figures, so they appear only beside them. The caveat
  // stays in view; the full disclosure sits one click behind it.
  view.caveat = view.prices.length > 0 ? COMPARISON_CAVEAT : '';
  view.disclosure = view.prices.length > 0 ? COMPARISON_DISCLOSURE : '';

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
    return { text: `No special offer advertised on ${stated.length === 1 ? 'the Flex term' : `any of the ${stated.length} Flex terms`}`, details };
  }
  return {
    text: stated.length === 1 ? 'Special offer advertised on the Flex term' : `Special offer advertised on ${offered.length} of ${stated.length} Flex terms`,
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
    // A unit the page shows but the response never confirmed is named as the
    // page shows it; the notes below say it was not confirmed.
    headingText: state.unitName ?? state.displayedName ?? 'This listing',
    identityNote: '',
    checkTimeText: 'Not checked yet',
    calendarStatusText: '',
    calendarVisible: false,
    referenceNote: '',
    standbyOnly: null,
    grid: null,
    allRanges: [],
    summaryItems: [],
    factItems: [],
    refreshNote: '',
    comparison: comparisonView(state),
  };

  // Each state carries exactly one status sentence, in one element; the
  // check-time line only ever names a time.
  const held = state.checkedAt !== null;
  const cause = state.error ? failureCauseText(state.error) : null;
  if (state.isChecking && held) {
    view.refreshNote = 'Checking again; showing an older check until it finishes.';
  } else if (state.isChecking) {
    view.calendarStatusText = state.status === 'unavailable' ? 'Calendar unavailable. Checking again…' : 'Checking the calendar…';
  } else if (cause && held) {
    view.refreshNote = `The last refresh failed: ${cause}. Showing an older check; Refresh to try again.`;
  } else if (cause) {
    view.refreshNote = `Check failed${state.displayedName ? ` for ${state.displayedName}` : ''}: ${cause}. Refresh to try again.`;
  } else if (state.status === 'mismatch' || state.status === 'ambiguous') {
    view.identityNote = identityNoteText(state);
  } else if (state.status === 'unavailable') {
    view.calendarStatusText = 'Calendar unavailable. Use Refresh to check again.';
  }

  if (state.status === 'ready' && Array.isArray(state.ranges)) {
    // The grid stops at six weeks; this list is where every returned range,
    // and each day's detail, stays reachable by keyboard and screen reader.
    view.allRanges = [...state.ranges]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map(rangeText);
    view.referenceNote = referenceNoteText(state);
    let omitNext = false;
    if (state.today && state.referenceDate) {
      const weeks = sixWeekView(state.ranges, state.today, state.referenceDate);
      view.standbyOnly = describeHeadline(weeks, state.summary, state.checkIn);
      // The standby-only detail line already names this reservation.
      omitNext = view.standbyOnly.isStandbyOnly
        && weeks.gap?.nextReservation?.startDate === state.summary?.nextReservation?.startDate;
      view.standbyOnly.explainer = view.standbyOnly.isStandbyOnly ? STANDBY_ONLY_EXPLAINER : '';
      view.grid = calendarGrid(weeks, state.today, state.checkIn);
    }
    if (state.summary) view.summaryItems = summaryItemsFor(state.summary, omitNext);
  }

  // Facts are independent of the calendar: they render whenever the response
  // they came from was confirmed to be this unit's.
  if (state.facts) view.factItems = factItemsFor(state.facts);

  if (held) view.checkTimeText = `Checked ${timeFormatter.format(new Date(state.checkedAt))}`;
  else if (view.refreshNote || view.calendarStatusText || view.identityNote) view.checkTimeText = '';

  view.calendarVisible = Boolean(view.calendarStatusText || view.referenceNote || view.grid
    || view.summaryItems.length || view.allRanges.length);

  return view;
}
