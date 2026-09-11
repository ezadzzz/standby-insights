import { checkIdentity } from './identity.js';
import { deriveCalendarEvidence } from './calendar.js';
import { RequestGate } from './request-gate.js';

const EMPTY_STATE = {
  slug: null,
  status: 'idle',
  identity: null,
  ranges: null,
  checkedAt: null,
  isChecking: false,
  isStale: false,
  error: null,
};

/**
 * Owns evidence for one unit on one Standby detail page instance: request
 * dedup, identity/calendar validation, and older-check/failure labeling.
 * Every trigger re-reads the caller-supplied visible identity because the
 * DOM is the source of truth, not something this controller should cache.
 */
export function createEvidenceController({ fetchHome, now = () => Date.now(), gate } = {}) {
  const requestGate = gate ?? new RequestGate();
  let state = { ...EMPTY_STATE };
  let generation = 0;
  let inFlightSlug = null;

  function getState() {
    return state;
  }

  function startFetch(slug, visibleIdentity) {
    generation += 1;
    const myGeneration = generation;
    inFlightSlug = slug;

    const sameUnit = state.slug === slug;
    state = {
      ...(sameUnit ? state : EMPTY_STATE),
      slug,
      isChecking: true,
      isStale: sameUnit && state.checkedAt !== null,
    };

    requestGate.schedule((signal) => fetchHome(slug, signal)).then(
      (raw) => {
        if (myGeneration !== generation) return; // stale: a newer trigger has since superseded this one
        const identity = checkIdentity({
          requestedSlug: slug,
          responseSlug: raw?.slug,
          responseUnitName: raw?.name,
          responsePropertyName: raw?.property?.name,
          visibleHeadingText: visibleIdentity?.visibleHeadingText,
          visiblePropertyLinkText: visibleIdentity?.visiblePropertyLinkText,
        });
        const calendar = identity === 'confirmed' ? deriveCalendarEvidence(raw) : { status: identity };
        state = {
          slug,
          status: calendar.status,
          identity,
          ranges: calendar.ranges ?? null,
          checkedAt: now(),
          isChecking: false,
          isStale: false,
          error: null,
        };
        inFlightSlug = null;
      },
      (err) => {
        if (myGeneration !== generation) return;
        state = {
          ...state,
          status: state.checkedAt !== null ? state.status : 'unavailable',
          isChecking: false,
          isStale: state.checkedAt !== null,
          error: err?.name ?? 'error',
        };
        inFlightSlug = null;
      },
    );
  }

  function requestEvidence(slug, visibleIdentity) {
    if (inFlightSlug === slug) return; // coalesce duplicate concurrent triggers
    startFetch(slug, visibleIdentity);
  }

  return {
    getState,
    enterDetailPage({ slug, visibleIdentity }) { requestEvidence(slug, visibleIdentity); },
    openPanel({ slug, visibleIdentity }) {
      if (!slug) return;
      requestEvidence(slug, visibleIdentity);
    },
    refresh({ slug, visibleIdentity }) {
      // Refresh always starts a fresh check, bypassing in-flight coalescing.
      startFetch(slug, visibleIdentity);
    },
    teardown() {
      generation += 1; // invalidate any still-pending response
      requestGate.teardown();
    },
  };
}
