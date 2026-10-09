import { MINIMUM_PEERS } from '../lib/comparison.js';
import { sixWeekView, describeHeadline, drawnKey, drawnKind } from '../lib/six-week-view.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** The whole returned range a grid day belongs to, shown on hover. */
function rangeText(range) {
  const end = range.endDate ? formatDate(range.endDate) : 'unspecified end';
  const start = formatDate(range.startDate);
  const dateText = end === start ? start : `${start} – ${end}`;
  const standbyOnly = range.unbookableReason === 'less_than_minimum_nightly_stay';
  let statusText = range.moveInAllowed ? 'Standard move-in allowed' : 'Move-in blocked';
  if (standbyOnly) statusText = 'Standby-only, too short for a standard stay';
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
  return `No check-in date found on this page. ${against}`;
}

/** Visible reservation and standard move-in statements for the reference date. */
function summaryItemsFor(summary, omitNext) {
  const items = [];
  const { intersectingReservation: current, nextReservation: next } = summary;

  if (current) {
    // The headline names this reservation without its end; here the end comes
    // with the caveat that keeps it from reading as a stay boundary.
    const start = formatDate(current.startDate);
    if (!current.endDate) items.push(`Reserved from ${start}, end date not supplied.`);
    else {
      const dates = current.endDate === current.startDate ? `${start} only` : `${start} – ${formatDate(current.endDate)}`;
      items.push(`Reserved ${dates}. Its end date doesn’t say when a stay could start or end.`);
    }
  }
  if (next && !omitNext) {
    items.push(`Next reservation starts ${formatDate(next.startDate)}.`);
  }
  // The standby-only detail line already says no standard stay fits before it.
  if (summary.noStandardMoveInBeforeNext && !omitNext) {
    items.push('No standard move-in offered before that reservation.');
  }
  // Stated only under coverage, and only as far as the calendar goes.
  if (summary.noReservationsInCalendar || summary.noStandardMoveInInCalendar) {
    const { coverageStart: start, coverageEnd: end } = summary;
    // A calendar often runs a year ahead, and "Sep 11 – Sep 10" needs its year.
    const endText = end && (end.slice(0, 4) === start.slice(0, 4) ? formatDate(end) : `${formatDate(end)}, ${end.slice(0, 4)}`);
    const span = end
      ? `${formatDate(start)} – ${endText}.`
      : `from ${formatDate(start)}; the calendar’s last range has no end date.`;
    if (summary.noReservationsInCalendar) items.push(`No reservation ${span}`);
    if (summary.noStandardMoveInInCalendar) items.push(`No standard move-in ${span}`);
  }
  return items;
}

const MARK_EXPLANATIONS = {
  unavailable: 'Unavailable means reserved or move-in blocked. Move-in blocked means Landing doesn\'t allow a move-in that night for a reason other than a reservation. Hover a day or open All returned ranges to see which.',
  'not-returned': 'No calendar data means Landing\'s calendar doesn\'t say anything about that night — not that it\'s open.',
};

/**
 * The six-week calendar grid: the same days as a card's strip, laid out by
 * weekday so today and the member's check-in can be found at a glance. The
 * grid's label states every stretch in words.
 */
function calendarGrid(weeks, today, checkIn) {
  const checkInIndex = checkIn?.status === 'selected' ? weeks.checkInIndex : null;
  const kinds = weeks.days.map((d) => drawnKind(d.kind));
  const drawn = new Set(kinds);
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return {
    // Same sentence as the card strip's label, so both surfaces say it alike.
    label: checkInIndex === null
      ? weeks.label
      : `${weeks.label}. Your check-in, ${formatDate(weeks.days[checkInIndex].date)}, is marked`,
    leadingBlanks: new Date(`${today}T00:00:00Z`).getUTCDay(),
    // Today is always drawn (index 0); the check-in mark only when selected.
    key: drawnKey(kinds, [
      { kind: 'today', text: 'Today' },
      ...(checkInIndex === null ? [] : [{ kind: 'check-in', text: 'Your check-in' }]),
    ]),
    // Like the legend, explains only the marks the grid draws.
    marksExplainer: Object.entries(MARK_EXPLANATIONS)
      .filter(([kind]) => drawn.has(kind))
      .map(([, text]) => text)
      .join(' '),
    cells: weeks.days.map((day, index) => {
      const date = new Date(`${day.date}T00:00:00Z`);
      return {
        // The month only on the 1st, which six weeks always include: "Sep 12"
        // on today wrapped at 320px, and the Today outline already finds it.
        dayText: date.getUTCDate() === 1 ? monthDay.format(date) : String(date.getUTCDate()),
        kind: drawnKind(day.kind),
        isToday: index === 0,
        isCheckIn: index === checkInIndex,
        title: day.range ? rangeText(day.range) : 'No calendar data for this day',
      };
    }),
  };
}

// A fact the response left out. Not "Unavailable", which the calendar uses for
// reserved or blocked days.
const NOT_SUPPLIED = 'Not supplied';

/**
 * A failure's cause in member words, distinct from a calendar the response
 * simply did not carry. Rate limiting is named on its own because it is a
 * known, temporary condition, not an unexplained network failure.
 */
function failureCauseText(error) {
  if (error === 'RateLimitedError') return 'Landing asked this extension to slow down';
  return 'the network request did not complete';
}

// After a rate limit an immediate retry would be refused again, so the next
// step says to wait first.
function retryText(error) {
  return error === 'RateLimitedError' ? 'Wait a few minutes, then Refresh.' : 'Refresh to try again.';
}

/**
 * Names the unit as the page shows it and what kind of failure this was,
 * without saying the response was that unit: a mismatch is a response that
 * described a different unit, an ambiguous one lacked what confirming needed.
 * The lead is the status sentence; the rest explains it in a quieter weight.
 */
function identityNoteParts(state) {
  const shown = state.displayedName;
  if (!shown) return { lead: 'Evidence unavailable: could not confirm this is the exact displayed unit.', rest: 'Refresh to check again.' };
  const why = state.status === 'mismatch'
    ? "Landing's data for this listing did not match what this page shows."
    : "Landing's data did not include enough to confirm it.";
  return { lead: `Evidence unavailable: could not confirm this is ${shown}.`, rest: `${why} Refresh to check again.` };
}

// Said once, in the panel only, under the headline where the member decides.
// The last sentence is the part a member can't see on the calendar: the gap is
// a consequence of the reservation after it.
// With no reservation after the gap, only the first sentence is true.
const STANDBY_ONLY_EXPLAINER = 'Only Standby can book these nights.';
const STANDBY_ONLY_EXPLAINER_NEXT = `${STANDBY_ONLY_EXPLAINER} If the reservation after them moves or is cancelled, a standard stay may fit.`;

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
  if (!price) return 'This home doesn’t list a monthly price.';
  const label = price.label ?? 'per month (label not supplied)';
  return `This home: ${money(price.amount)}${label.startsWith(' ') ? '' : ' '}${label}.`;
}

const plural = (count, singular) => (count === 1 ? singular : `${singular}s`);

// States what the figures are and nothing about what they mean (No Verdict Rule).
// "Other homes" in every surface (CONTEXT.md); the tip says what makes them comparable.
const COMPARISON_DISCLOSURE = 'This home’s Flex price against the median of other homes in this market with the same number of bedrooms. Not a quote for your dates.';


/**
 * The comparison as the member sees it. Each outcome is distinguishable: too
 * few eligible peers is not the same statement as an attempt that could not be
 * completed, and neither is ever shown as a market median.
 */
function comparisonView(state) {
  const comparison = state.comparison;
  const view = { visible: false, statusText: '', differenceText: '', subjectText: '', disclosure: '', prices: [] };
  if (!comparison || comparison.status === 'idle') return view;

  view.visible = true;
  if (comparison.status === 'loading') {
    view.statusText = 'Comparing with other homes in this market…';
    return view;
  }

  if (comparison.status === 'unresolved-scope') {
    view.statusText = 'Couldn’t tell this home’s market or bedroom count, so there’s nothing to compare it with.';
    return view;
  }

  if (comparison.status === 'unavailable') {
    view.statusText = 'Couldn’t load all the other homes, so no median is shown.';
  } else if (comparison.status === 'insufficient') {
    const listed = comparison.count === 0 ? 'No other homes listed a price.'
      : `Only ${comparison.count} other ${plural(comparison.count, 'home')} listed a price.`;
    view.statusText = `${listed} At least ${MINIMUM_PEERS} are needed for a fair median.`;
  } else if (comparison.status === 'ready') {
    view.prices = [
      { label: 'This home', amount: comparison.subjectPrice ? money(comparison.subjectPrice.amount) : NOT_SUPPLIED,
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
  // The fine print qualifies price figures, so it exists only beside them and
  // sits one click behind them.
  if (view.prices.length > 0) view.disclosure = COMPARISON_DISCLOSURE;
  return view;
}

function scoreText(score) {
  if (!score) return NOT_SUPPLIED;
  return score.description ? `${score.value} (${score.description})` : String(score.value);
}

/** The same facts split for a location tile: a short figure, then what qualifies it. */
function scoreTile(score) {
  return score ? { value: String(score.value), note: score.description ?? '' } : { value: NOT_SUPPLIED, note: '' };
}

function ratingTile(rating) {
  if (!rating) return { value: NOT_SUPPLIED, note: '' };
  if (rating.count === 0) return { value: 'Unrated', note: 'no reviews' };
  return { value: String(rating.average), note: `${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}` };
}

function ratingText(rating) {
  if (!rating) return NOT_SUPPLIED;
  // A building nobody has reviewed is unrated. Stating its average would read
  // as a score the reviews never gave it.
  if (rating.count === 0) return 'Unrated (no reviews)';
  // No sampled field states the scale this average is out of, so the panel
  // states the number supplied and the count behind it, and invents neither.
  return `${rating.average} from ${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}`;
}

/**
 * Whether any supplied Flex term advertises a special offer — the one Flex fact
 * that bears on how many Flex members this home draws. It is stated only about
 * terms that actually supplied the field: a term that never carried one is
 * unknown, not an absent offer.
 *
 * The flag is scoped to one term on one unit and advertises that an offer
 * exists, not that a stay is discounted, so it is said to be advertised and
 * never collapsed into a unit-level deal.
 */
function flexSignal(flexOptions) {
  if (flexOptions === null) return { text: NOT_SUPPLIED, tip: OFFER_UNKNOWN_TIP };
  if (flexOptions.length === 0) return { text: 'No Flex terms supplied', tip: OFFER_UNKNOWN_TIP };

  const stated = flexOptions.filter((option) => option.specialOffer !== null);
  const offered = stated.filter((option) => option.specialOffer);

  if (stated.length === 0) return { text: 'Offer not supplied', tip: OFFER_UNKNOWN_TIP };
  if (offered.length === 0) return { text: 'No offer advertised', tip: 'No Flex term lists an offer.' };
  return { text: stated.length === 1 ? 'Offer advertised' : `Offer advertised on ${offered.length} of ${stated.length} terms`,
    tip: 'At least one Flex term lists an offer, which may draw more Flex bookings.' };
}

const OFFER_UNKNOWN_TIP = 'Landing didn’t say whether any Flex term has an offer.';
const MINIMUM_STAY_TIP = 'A shorter minimum stay lets short-term guests book too, so more bookings compete for these nights.';

/**
 * The price signal in one row: the gap leads, the figures follow. The value
 * states no direction, and neither does the tip.
 */
function priceRow(view, comparison) {
  const row = { id: 'price', label: 'Flex price', value: '', sub: '', muted: false, tip: view.disclosure };
  if (comparison.status === 'loading') return { ...row, value: 'Checking…', muted: true, tip: view.statusText };
  if (comparison.status !== 'ready') {
    const short = comparison.status === 'insufficient'
      ? `Too few other homes (${comparison.count} priced, ${MINIMUM_PEERS} needed)`
      : 'Comparison unavailable';
    return { ...row, value: short, muted: true, tip: view.statusText };
  }
  const [subject, median] = view.prices;
  const homes = `${comparison.count} other ${plural(comparison.count, 'home')}`;
  if (!comparison.subjectPrice) {
    return { ...row, value: 'This home: not supplied', sub: `Median ${median.amount} · ${homes}`, tip: view.subjectText };
  }
  const older = comparison.isStale ? ' · older check' : '';
  return { ...row, value: view.differenceText, sub: `${subject.amount} vs. ${median.amount} median · ${homes}${older}` };
}

/**
 * Every fact the member reads as a sign of how much standard and Flex members
 * want this home, in one place. Each row is a fact plus at most a direction;
 * the reasoning and fine print sit behind its info button.
 */
function demandRowsFor(view, state) {
  const rows = [];
  if (view.comparison.visible) rows.push(priceRow(view.comparison, state.comparison));
  if (view.flex) rows.push({ id: 'flex', label: 'Flex offer', value: view.flex.text, sub: '', muted: false, tip: view.flex.tip });
  const minimum = view.factItems.find((item) => item.label === 'Minimum stay');
  if (minimum) rows.push({ id: 'minimum-stay', label: 'Minimum stay', value: minimum.text, sub: '', muted: false, tip: MINIMUM_STAY_TIP });
  return rows;
}

/**
 * The facts the response supplies about this unit and its building, in the
 * specification's order. Every field gets its own line whether or not it could
 * be read, so an absent fact is visibly absent rather than silently dropped.
 */
function factItemsFor(facts) {
  return [
    { label: 'Minimum stay', text: facts.minimumStay === null ? NOT_SUPPLIED : `${facts.minimumStay} ${facts.minimumStay === 1 ? 'night' : 'nights'}` },
    { label: 'Rating', text: ratingText(facts.rating), ...ratingTile(facts.rating) },
    { label: 'Walk score', text: scoreText(facts.scores.walk), ...scoreTile(facts.scores.walk) },
    { label: 'Transit score', text: scoreText(facts.scores.transit), ...scoreTile(facts.scores.transit) },
    { label: 'Bike score', text: scoreText(facts.scores.bike), ...scoreTile(facts.scores.bike) },
  ];
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
    identityNoteLead: '',
    checkTimeText: 'Not checked yet',
    noSubject: false,
    nextStepText: '',
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
    flex: null,
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
    view.refreshNote = `The last refresh failed: ${cause}. Showing an older check. ${retryText(state.error)}`;
  } else if (cause) {
    view.refreshNote = `Check failed${state.displayedName ? ` for ${state.displayedName}` : ''}: ${cause}. ${retryText(state.error)}`;
  } else if (state.status === 'mismatch' || state.status === 'ambiguous') {
    const { lead, rest } = identityNoteParts(state);
    view.identityNote = `${lead} ${rest}`;
    view.identityNoteLead = lead;
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
      if (!view.standbyOnly.isStandbyOnly) view.standbyOnly.explainer = '';
      else view.standbyOnly.explainer = weeks.gap?.nextReservation ? STANDBY_ONLY_EXPLAINER_NEXT : STANDBY_ONLY_EXPLAINER;
      view.grid = calendarGrid(weeks, state.today, state.checkIn);
    }
    if (state.summary) view.summaryItems = summaryItemsFor(state.summary, omitNext);
  }

  // Facts are independent of the calendar: they render whenever the response
  // they came from was confirmed to be this unit's.
  if (state.facts) {
    view.factItems = factItemsFor(state.facts);
    view.flex = flexSignal(state.facts.flexOptions);
  }
  view.demandRows = demandRowsFor(view, state);

  if (held) view.checkTimeText = `Checked ${timeFormatter.format(new Date(state.checkedAt))}`;
  else if (view.refreshNote || view.calendarStatusText || view.identityNote) view.checkTimeText = '';

  view.calendarVisible = Boolean(view.calendarStatusText || view.referenceNote || view.grid
    || view.summaryItems.length || view.allRanges.length);

  // Opened from the toolbar with no home selected: nothing to check or
  // refresh, so the panel says how to choose one instead.
  if (!state.slug && state.status === 'idle' && !state.isChecking && state.checkedAt === null && !state.error) {
    Object.assign(view, { noSubject: true, headingText: 'No home selected', checkTimeText: '',
      nextStepText: 'Open a home’s Standby page, or press View evidence on a card.' });
  }

  return view;
}
