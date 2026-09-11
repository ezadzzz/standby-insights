import { checkIdentity, responseIdentityFromHome } from './identity.js';
import { deriveCalendarEvidence, summarizeForReference } from './calendar.js';
import { deriveFacts } from './facts.js';
import { RequestGate } from './request-gate.js';
import { resolveScope, scopeKey, advertisedMonthlyPrice, collectComparison, compareSubject } from './comparison.js';

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
  scope: null,
  subjectPrice: null,
  comparison: {
    status: 'idle',
    median: null,
    count: null,
    subjectPrice: null,
    checkedAt: null,
    isChecking: false,
    isStale: false,
  },
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
export function createEvidenceController({ fetchHome, searchPeers, now = () => Date.now(), gate, onChange } = {}) {
  const requestGate = gate ?? new RequestGate();
  let state = { ...EMPTY_STATE };
  let generation = 0;
  let inFlightSlug = null;

  // Complete comparison evidence for this page instance, keyed by
  // market/bedrooms and stored unfiltered so any subject can be excluded from
  // it. Page memory only: nothing here is persisted or shared across tabs.
  const comparisonCache = new Map();
  let comparisonRun = null; // { key, isChecking, failed } for the latest attempt
  let comparisonGeneration = 0;
  let panelOpen = false;

  function getState() {
    return state;
  }

  /**
   * The comparison as it stands for the currently selected subject: derived
   * from the cache on every state change rather than stored, so a new
   * selection can never inherit the previous subject's filtered median.
   */
  function comparisonViewFor() {
    const view = {
      status: 'idle',
      median: null,
      count: null,
      subjectPrice: state.subjectPrice ?? null,
      checkedAt: null,
      isChecking: false,
      isStale: false,
    };
    if (!state.scope) {
      // A confirmed unit with no resolvable market or bedroom count has no
      // scope to compare against, and that is a stated outcome rather than a
      // hidden one. An unconfirmed unit has nothing to say either way.
      if (state.identity === 'confirmed') view.status = 'unresolved-scope';
      return view;
    }

    const key = scopeKey(state.scope);
    const run = comparisonRun?.key === key ? comparisonRun : null;
    const cached = comparisonCache.get(key);
    view.isChecking = Boolean(run?.isChecking);

    if (!cached) {
      if (view.isChecking) view.status = 'loading';
      else if (run?.failed) view.status = 'unavailable';
      return view;
    }

    const compared = compareSubject(cached, { subjectSlug: state.slug });
    return {
      ...view,
      status: compared.status,
      median: compared.median,
      count: compared.count,
      checkedAt: cached.checkedAt,
      // A cached comparison shown while a new attempt runs, or after one
      // failed, is an older check and says so.
      isStale: view.isChecking || Boolean(run?.failed),
    };
  }

  function setState(next) {
    state = { ...next };
    state.comparison = comparisonViewFor();
    onChange?.(state);
  }

  function restate() {
    setState(state);
  }

  /**
   * Loads comparison evidence for the current scope unless it is already
   * cached. `force` is an explicit Refresh: it re-collects but keeps the
   * cached evidence visible, labeled as an older check, until the new attempt
   * succeeds. Never retries on its own.
   */
  function ensureComparison({ force = false } = {}) {
    if (!searchPeers || !state.scope) return;
    const key = scopeKey(state.scope);
    // An explicit Refresh supersedes whatever is running; anything else waits
    // for the attempt already in flight rather than duplicating it.
    if (!force && comparisonRun?.key === key && comparisonRun.isChecking) return;
    if (!force && comparisonCache.has(key)) return;

    comparisonGeneration += 1;
    const myGeneration = comparisonGeneration;
    comparisonRun = { key, isChecking: true, failed: false };
    restate();

    const scope = state.scope;
    collectComparison({
      scope,
      search: (args) => requestGate.schedule((signal) => searchPeers(args, signal)),
    }).then((result) => {
      if (myGeneration !== comparisonGeneration) return; // superseded by a newer attempt
      if (result.status === 'complete') {
        comparisonCache.set(key, { ...result, checkedAt: now() });
        comparisonRun = { key, isChecking: false, failed: false };
      } else {
        // A failed attempt never advances the comparison's check time.
        comparisonRun = { key, isChecking: false, failed: true };
      }
      restate();
    });
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
          // Comparison scope and the subject's own advertised price come from
          // the same confirmed response; an unconfirmed one resolves neither.
          scope: identity === 'confirmed' ? resolveScope(raw) : null,
          subjectPrice: identity === 'confirmed' ? advertisedMonthlyPrice(raw) : null,
          checkedAt: now(),
          isChecking: false,
          isStale: false,
          error: null,
        });
        inFlightSlug = null;
        if (panelOpen) ensureComparison();
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
    // The panel is what the comparison serves, so entering the listing never
    // collects one: the first panel use does, and later matching selections
    // reuse it while still rechecking unit evidence.
    openPanel(trigger) {
      if (!trigger.slug) return;
      panelOpen = true;
      requestEvidence(trigger);
      ensureComparison();
    },
    refresh(trigger) {
      // Refresh always starts a fresh check, bypassing in-flight coalescing
      // and both caches.
      panelOpen = true;
      startFetch(trigger);
      ensureComparison({ force: true });
    },
    // A date change re-states the existing evidence for this same unit; it is
    // not new evidence, so it never advances the successful-check time.
    selectCheckIn(checkIn) {
      setState({ ...state, checkIn, ...summaryFor(state.ranges, checkIn) });
    },
    // The panel reports its own lifetime over a port, so a closed panel stops
    // pulling comparisons for units the member merely browses past. Closing it
    // never refetches or discards anything already held.
    setPanelOpen(open) {
      panelOpen = open;
      if (open) ensureComparison();
    },
    teardown() {
      generation += 1; // invalidate any still-pending response
      comparisonGeneration += 1;
      requestGate.teardown();
    },
  };
}
