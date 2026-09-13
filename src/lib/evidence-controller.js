import { summarizeForReference } from './calendar.js';
import { checkDate } from './reference-date.js';
import { scopeKey, collectComparison, compareSubject } from './comparison.js';
import { createUnitEvidenceStore, EMPTY_UNIT } from './unit-evidence-store.js';
import { RateLimitedError } from './errors.js';
import { RequestGate } from './request-gate.js';

const NO_CHECK_IN = { status: 'none', date: null };

/**
 * The date facts are stated against. A usable selected check-in is the
 * member's own; without one — including while the URL and the page's own
 * controls disagree — facts fall back to the check date, which the panel
 * labels rather than presenting as the member's plan.
 */
function referenceDateFor(checkIn, now) {
  return checkIn?.status === 'selected' && checkIn.date ? checkIn.date : checkDate(now());
}

/**
 * The panel's view of one selected unit: which unit is showing, the date its
 * facts are stated against, and the market comparison it is set in.
 *
 * Unit evidence itself belongs to the shared store, because the cards and this
 * panel read the same units and must not compete for them. What stays here is
 * everything that is about the *viewing* rather than the unit: the selection,
 * the check-in, and the comparison, which only the panel shows.
 */
export function createEvidenceController({
  fetchHome,
  searchPeers,
  now = () => Date.now(),
  gate,
  store,
  onChange,
} = {}) {
  const requestGate = gate ?? new RequestGate();
  const units = store ?? createUnitEvidenceStore({ fetchHome, now, gate: requestGate });

  let selectedSlug = null;
  let checkIn = NO_CHECK_IN;
  let state = null;

  // Complete comparison evidence for this page instance, keyed by
  // market/bedrooms and stored unfiltered so any subject can be excluded from
  // it. Page memory only: nothing here is persisted or shared across tabs.
  const comparisonCache = new Map();
  let comparisonRun = null; // { key, isChecking, failed } for the latest attempt
  let comparisonGeneration = 0;
  let panelOpen = false;

  function selectedUnit() {
    return (selectedSlug === null ? null : units.get(selectedSlug)) ?? EMPTY_UNIT;
  }

  function summaryFor(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) return { referenceDate: null, today: null, summary: null };
    const referenceDate = referenceDateFor(checkIn, now);
    return { referenceDate, today: checkDate(now()), summary: summarizeForReference(ranges, referenceDate) };
  }

  /**
   * The comparison as it stands for the currently selected subject: derived
   * from the cache on every rebuild rather than stored, so a new selection can
   * never inherit the previous subject's filtered median.
   */
  function comparisonViewFor(unit) {
    const view = {
      status: 'idle',
      median: null,
      count: null,
      subjectPrice: unit.subjectPrice ?? null,
      checkedAt: null,
      isChecking: false,
      isStale: false,
    };
    if (!unit.scope) {
      // A confirmed unit with no resolvable market or bedroom count has no
      // scope to compare against, and that is a stated outcome rather than a
      // hidden one. An unconfirmed unit has nothing to say either way.
      if (unit.identity === 'confirmed') view.status = 'unresolved-scope';
      return view;
    }

    const key = scopeKey(unit.scope);
    const run = comparisonRun?.key === key ? comparisonRun : null;
    const cached = comparisonCache.get(key);
    view.isChecking = Boolean(run?.isChecking);

    if (!cached) {
      if (view.isChecking) view.status = 'loading';
      else if (run?.failed) view.status = 'unavailable';
      return view;
    }

    const compared = compareSubject(cached, { subjectSlug: unit.slug });
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

  // Set whenever a rebuild has already told the panel about the transition in
  // progress, so one member action never renders the panel twice.
  let announced = false;

  /** Rebuilds the panel's whole state from the store and this panel's own view. */
  function rebuild({ notify = true } = {}) {
    const unit = selectedUnit();
    state = {
      ...unit,
      slug: selectedSlug,
      checkIn,
      ...summaryFor(unit.ranges),
      comparison: comparisonViewFor(unit),
    };
    if (!notify) return;
    announced = true;
    onChange?.(state);
  }

  /**
   * Runs one member action. The store announces synchronously when it starts a
   * read, which rebuilds this panel already; the trailing rebuild is only for
   * the actions where it did not — a reused cache, or a coalesced request.
   */
  function applyTrigger(act) {
    announced = false;
    act();
    if (!announced) rebuild();
  }

  /**
   * Loads comparison evidence for the selected unit's scope unless it is
   * already cached. `force` is an explicit Refresh: it re-collects but keeps
   * the cached evidence visible, labeled as an older check, until the new
   * attempt succeeds. Never retries on its own.
   */
  function ensureComparison({ force = false } = {}) {
    const scope = selectedUnit().scope;
    if (!searchPeers || !scope) return;
    const key = scopeKey(scope);
    // An explicit Refresh supersedes whatever is running; anything else waits
    // for the attempt already in flight rather than duplicating it.
    if (!force && comparisonRun?.key === key && comparisonRun.isChecking) return;
    if (!force && comparisonCache.has(key)) return;

    comparisonGeneration += 1;
    const myGeneration = comparisonGeneration;
    comparisonRun = { key, isChecking: true, failed: false };
    rebuild();

    collectComparison({
      scope,
      // The comparison is the panel's own foreground work: the member is
      // looking at it, so it is never held back behind offscreen card reads.
      search: (args) => requestGate.schedule((signal) => searchPeers(args, signal), { priority: 'selected' })
        .catch((err) => {
          // The comparison is the likeliest thing to hit a limit, being ten
          // requests. When it does, offscreen card reads stop too.
          if (err instanceof RateLimitedError) units.pauseBackground?.();
          throw err;
        }),
    }).then((result) => {
      if (myGeneration !== comparisonGeneration) return; // superseded by a newer attempt
      if (result.status === 'complete') {
        comparisonCache.set(key, { ...result, checkedAt: now() });
        comparisonRun = { key, isChecking: false, failed: false };
      } else {
        // A failed attempt never advances the comparison's check time.
        comparisonRun = { key, isChecking: false, failed: true };
      }
      rebuild();
    });
  }

  // The store announces every unit it reads, including cards this panel is not
  // showing. Only the selected one changes what the panel says.
  units.subscribe((slug) => {
    if (slug !== selectedSlug) return;
    rebuild();
    if (panelOpen) ensureComparison();
  });

  function select(trigger) {
    selectedSlug = trigger.slug;
    checkIn = trigger.checkIn ?? NO_CHECK_IN;
  }

  rebuild({ notify: false });

  return {
    getState() { return state; },

    enterDetailPage(trigger) {
      applyTrigger(() => {
        select(trigger);
        units.read(trigger.slug, { visibleIdentity: trigger.visibleIdentity, priority: 'selected', force: true });
      });
    },

    // The panel is what the comparison serves, so entering the listing never
    // collects one: the first panel use does, and later matching selections
    // reuse it while still rechecking unit evidence.
    openPanel(trigger) {
      if (!trigger.slug) return;
      panelOpen = true;
      applyTrigger(() => {
        select(trigger);
        units.read(trigger.slug, { visibleIdentity: trigger.visibleIdentity, priority: 'selected', force: true });
      });
      ensureComparison();
    },

    refresh(trigger) {
      // Refresh always starts a fresh check, bypassing in-flight coalescing
      // and both caches.
      panelOpen = true;
      applyTrigger(() => {
        select(trigger);
        units.refresh(trigger.slug, { visibleIdentity: trigger.visibleIdentity });
      });
      ensureComparison({ force: true });
    },

    // A date change re-states the existing evidence for this same unit; it is
    // not new evidence, so it never advances the successful-check time.
    selectCheckIn(next) {
      checkIn = next;
      rebuild();
    },

    // The panel reports its own lifetime over a port, so a closed panel stops
    // pulling comparisons for units the member merely browses past. Closing it
    // never refetches or discards anything already held.
    setPanelOpen(open) {
      panelOpen = open;
      if (open) ensureComparison();
    },

    teardown() {
      comparisonGeneration += 1;
      units.teardown();
      requestGate.teardown();
    },
  };
}
