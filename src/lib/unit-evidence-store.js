import { checkIdentity, responseIdentityFromHome } from './identity.js';
import { deriveCalendarEvidence } from './calendar.js';
import { deriveFacts } from './facts.js';
import { resolveScope, advertisedMonthlyPrice } from './comparison.js';
import { RequestGate } from './request-gate.js';

/**
 * Evidence for one unit, as read from one public response. Everything here is
 * about the unit itself; nothing about who is looking at it, which date they
 * picked, or what it is being compared against.
 */
const EMPTY_UNIT = {
  slug: null,
  status: 'idle',
  identity: null,
  unitName: null,
  ranges: null,
  facts: null,
  scope: null,
  subjectPrice: null,
  checkedAt: null,
  isChecking: false,
  isStale: false,
  error: null,
};

/**
 * Page-instance evidence for every unit this page has read: the cards the
 * member has scrolled past and the unit the panel is showing, in one place.
 *
 * It exists so those two never compete. A card read and a panel read for the
 * same unit share a single request, a card already read is not read again just
 * because it scrolled back into view, and the member's own selection is served
 * ahead of offscreen work. Each unit carries its own generation counter, so a
 * late reply can never land on top of a newer read of that same unit.
 *
 * Memory only: nothing here is persisted, and teardown ends all of it.
 */
export function createUnitEvidenceStore({ fetchHome, now = () => Date.now(), gate } = {}) {
  const requestGate = gate ?? new RequestGate();
  const units = new Map(); // slug -> evidence
  const generations = new Map(); // slug -> the only reply currently accepted
  const inFlight = new Set(); // slugs with a request already running
  const subscribers = new Set();

  function get(slug) {
    return units.get(slug) ?? null;
  }

  function announce(slug) {
    for (const subscriber of subscribers) subscriber(slug, units.get(slug) ?? null);
  }

  function set(slug, evidence) {
    units.set(slug, evidence);
    announce(slug);
  }

  function startRead(slug, { visibleIdentity, priority = 'background' }) {
    const held = units.get(slug);
    const nextGeneration = (generations.get(slug) ?? 0) + 1;
    generations.set(slug, nextGeneration);
    inFlight.add(slug);

    set(slug, {
      ...(held ?? EMPTY_UNIT),
      slug,
      isChecking: true,
      isStale: Boolean(held && held.checkedAt !== null),
    });

    requestGate.schedule((signal) => fetchHome(slug, signal), { priority }).then(
      (raw) => {
        if (generations.get(slug) !== nextGeneration) return; // a newer read has since superseded this one
        inFlight.delete(slug);

        const responseIdentity = responseIdentityFromHome(raw);
        const identity = checkIdentity({
          requestedSlug: slug,
          responseSlug: responseIdentity.slug,
          responseUnitName: responseIdentity.unitName,
          responsePropertyName: responseIdentity.propertyName,
          visibleHeadingText: visibleIdentity?.visibleHeadingText,
          visiblePropertyLinkText: visibleIdentity?.visiblePropertyLinkText,
        });
        const confirmed = identity === 'confirmed';
        const calendar = confirmed ? deriveCalendarEvidence(raw) : { status: identity };

        set(slug, {
          slug,
          status: calendar.status,
          identity,
          unitName: confirmed ? responseIdentity.unitName : null,
          ranges: calendar.ranges ?? null,
          // Facts stand on their own: an unusable calendar never withholds them,
          // and an unreadable fact never invalidates the calendar.
          facts: confirmed ? deriveFacts(raw) : null,
          scope: confirmed ? resolveScope(raw) : null,
          subjectPrice: confirmed ? advertisedMonthlyPrice(raw) : null,
          checkedAt: now(),
          isChecking: false,
          isStale: false,
          error: null,
        });
      },
      (err) => {
        if (generations.get(slug) !== nextGeneration) return;
        inFlight.delete(slug);
        const current = units.get(slug) ?? EMPTY_UNIT;
        set(slug, {
          ...current,
          slug,
          // A failed read never advances the successful-check time, and never
          // turns held evidence into an absence claim.
          status: current.checkedAt !== null ? current.status : 'unavailable',
          isChecking: false,
          isStale: current.checkedAt !== null,
          error: err?.name ?? 'error',
        });
      },
    );
  }

  return {
    get,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    /**
     * Reads one unit. `force` is a member action — opening evidence or entering
     * a listing — which always wants a fresh check; without it a unit already
     * read is reused, so scrolling back over a card costs no request. Either
     * way a request already in flight for this unit is joined, not duplicated.
     */
    read(slug, { visibleIdentity, priority = 'background', force = false } = {}) {
      if (!slug) return;
      if (inFlight.has(slug)) return;
      const held = units.get(slug);
      if (!force && held && held.checkedAt !== null) return;
      startRead(slug, { visibleIdentity, priority });
    },

    /** An explicit Refresh: a fresh read even past an in-flight one. */
    refresh(slug, { visibleIdentity, priority = 'selected' } = {}) {
      if (!slug) return;
      startRead(slug, { visibleIdentity, priority });
    },

    /** Rate-limit handling, which only ever holds back offscreen card work. */
    pauseBackground() { requestGate.pauseBackground(); },
    resumeBackground() { requestGate.resumeBackground(); },
    get isBackgroundPaused() { return requestGate.isBackgroundPaused; },

    teardown() {
      for (const slug of generations.keys()) generations.set(slug, generations.get(slug) + 1);
      units.clear();
      inFlight.clear();
      requestGate.teardown();
    },
  };
}
