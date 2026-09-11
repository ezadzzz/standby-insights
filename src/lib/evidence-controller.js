import { checkIdentity, responseIdentityFromHome } from './identity.js';
import { deriveCalendarEvidence, summarizeForReference } from './calendar.js';
import { deriveFacts } from './facts.js';
import { RequestGate } from './request-gate.js';

const EMPTY_STATE = {
  slug: null,
  status: 'idle',
  identity: null,
  unitName: null,
  ranges: null,
  facts: null,
  checkIn: { status: 'none', date: null },
  referenceDate: null,
  summary: null,
  checkedAt: null,
  isChecking: false,
  isStale: false,
  error: null,
};

// ponytail: UTC day for the check-date reference; swap for the page's local
// day if a timezone-sensitive reference is ever verified against Landing.
function todayIso(now) {
  return new Date(now()).toISOString().slice(0, 10);
}

/**
 * The date facts are stated against. A usable selected check-in is the
 * member's own; without one — including while the URL and the page's own
 * controls disagree — facts fall back to the check date, which the panel
 * labels rather than presenting as the member's plan.
 */
function referenceDateFor(checkIn, now) {
  return checkIn?.status === 'selected' && checkIn.date ? checkIn.date : todayIso(now);
}

/**
 * Owns evidence for one unit on one Standby detail page instance: request
 * dedup, identity/calendar validation, and older-check/failure labeling.
 * Every trigger re-reads the caller-supplied visible identity because the
 * DOM is the source of truth, not something this controller should cache.
 */
export function createEvidenceController({ fetchHome, now = () => Date.now(), gate, onChange } = {}) {
  const requestGate = gate ?? new RequestGate();
  let state = { ...EMPTY_STATE };
  let generation = 0;
  let inFlightSlug = null;

  function getState() {
    return state;
  }

  function setState(next) {
    state = next;
    onChange?.(state);
  }

  function summaryFor(ranges, checkIn) {
    if (!Array.isArray(ranges) || ranges.length === 0) return { referenceDate: null, summary: null };
    const referenceDate = referenceDateFor(checkIn, now);
    return { referenceDate, summary: summarizeForReference(ranges, referenceDate) };
  }

  function startFetch({ slug, visibleIdentity, checkIn }) {
    generation += 1;
    const myGeneration = generation;
    inFlightSlug = slug;

    const sameUnit = state.slug === slug;
    setState({
      ...(sameUnit ? state : EMPTY_STATE),
      slug,
      checkIn: checkIn ?? EMPTY_STATE.checkIn,
      isChecking: true,
      isStale: sameUnit && state.checkedAt !== null,
    });

    requestGate.schedule((signal) => fetchHome(slug, signal)).then(
      (raw) => {
        if (myGeneration !== generation) return; // stale: a newer trigger has since superseded this one
        const responseIdentity = responseIdentityFromHome(raw);
        const identity = checkIdentity({
          requestedSlug: slug,
          responseSlug: responseIdentity.slug,
          responseUnitName: responseIdentity.unitName,
          responsePropertyName: responseIdentity.propertyName,
          visibleHeadingText: visibleIdentity?.visibleHeadingText,
          visiblePropertyLinkText: visibleIdentity?.visiblePropertyLinkText,
        });
        const calendar = identity === 'confirmed' ? deriveCalendarEvidence(raw) : { status: identity };
        // Read the check-in from current state, not the one this request
        // started with: a date change while it was in flight is newer.
        const currentCheckIn = state.checkIn;
        const { referenceDate, summary } = summaryFor(calendar.ranges, currentCheckIn);
        setState({
          slug,
          status: calendar.status,
          checkIn: currentCheckIn,
          referenceDate,
          summary,
          identity,
          unitName: identity === 'confirmed' ? responseIdentity.unitName : null,
          ranges: calendar.ranges ?? null,
          // Facts stand on their own: an unusable calendar never withholds them,
          // and an unreadable fact never invalidates the calendar.
          facts: identity === 'confirmed' ? deriveFacts(raw) : null,
          checkedAt: now(),
          isChecking: false,
          isStale: false,
          error: null,
        });
        inFlightSlug = null;
      },
      (err) => {
        if (myGeneration !== generation) return;
        setState({
          ...state,
          status: state.checkedAt !== null ? state.status : 'unavailable',
          isChecking: false,
          isStale: state.checkedAt !== null,
          error: err?.name ?? 'error',
        });
        inFlightSlug = null;
      },
    );
  }

  function requestEvidence(trigger) {
    if (inFlightSlug === trigger.slug) return; // coalesce duplicate concurrent triggers
    startFetch(trigger);
  }

  return {
    getState,
    enterDetailPage(trigger) { requestEvidence(trigger); },
    openPanel(trigger) {
      if (!trigger.slug) return;
      requestEvidence(trigger);
    },
    refresh(trigger) {
      // Refresh always starts a fresh check, bypassing in-flight coalescing.
      startFetch(trigger);
    },
    // A date change re-states the existing evidence for this same unit; it is
    // not new evidence, so it never advances the successful-check time.
    selectCheckIn(checkIn) {
      setState({ ...state, checkIn, ...summaryFor(state.ranges, checkIn) });
    },
    teardown() {
      generation += 1; // invalidate any still-pending response
      requestGate.teardown();
    },
  };
}
