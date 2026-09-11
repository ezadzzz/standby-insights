import { summarizeForReference } from '../lib/calendar.js';
import { parseCardSlugFromHref } from './page-adapter.js';
import { describeCard } from './card-view.js';

const CARD_LINK = 'a[data-testid="pdp-home-card-link"]';
const ANNOTATION_ATTRIBUTE = 'data-standby-evidence';
const NOTICE_ATTRIBUTE = 'data-standby-notice';

/**
 * Annotates rendered Standby search cards as the member scrolls past them.
 *
 * It reads only cards that actually enter the viewport: it never paginates,
 * auto-scrolls, or reaches for inventory the member has not seen. Each card
 * gets exactly one annotation, inserted after Landing's own anchor so its
 * ordering, links, controls and focus are untouched.
 *
 * The DOM wiring lives here and the wording lives in card-view.js, so what a
 * card may claim is decided by a pure function the fixtures cover, and only
 * placement depends on a real browser.
 */
export function createCardAnnotator({ store, doc, getReferenceDate, onViewEvidence }) {
  const annotations = new Map(); // anchor -> its annotation element
  let observer = null;
  let unsubscribe = null;

  function cardsInDocument() {
    return [...doc.querySelectorAll(CARD_LINK)];
  }

  function anchorFor(slug) {
    return cardsInDocument().filter((anchor) => parseCardSlugFromHref(anchor.getAttribute('href')) === slug);
  }

  function buildAnnotation(slug) {
    const container = doc.createElement('div');
    container.setAttribute(ANNOTATION_ATTRIBUTE, slug);
    container.className = 'standby-evidence';

    const reservation = doc.createElement('p');
    reservation.className = 'standby-evidence-line';
    const moveIn = doc.createElement('p');
    moveIn.className = 'standby-evidence-line';
    const note = doc.createElement('p');
    note.className = 'standby-evidence-note';

    // A real button, so it is reachable and operable by keyboard with the
    // browser's own focus ring rather than a clickable div.
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'standby-evidence-button';
    button.textContent = 'View evidence';
    button.addEventListener('click', (event) => {
      // The card is wrapped in Landing's own link; opening evidence must not
      // also navigate to the listing.
      event.preventDefault();
      event.stopPropagation();
      onViewEvidence?.(slug);
    });

    container.append(reservation, moveIn, note, button);
    return { container, reservation, moveIn, note };
  }

  function paint(slug) {
    const evidence = store.get(slug);
    if (!evidence) return;
    const referenceDate = getReferenceDate();
    const summary = Array.isArray(evidence.ranges) && evidence.ranges.length > 0
      ? summarizeForReference(evidence.ranges, referenceDate)
      : null;
    const view = describeCard({ evidence, summary, referenceDate });

    for (const anchor of anchorFor(slug)) {
      let parts = annotations.get(anchor);
      if (!parts) {
        parts = buildAnnotation(slug);
        annotations.set(anchor, parts);
        anchor.insertAdjacentElement('afterend', parts.container);
      }
      // An unreadable card carries no unit claim at all; it contributes to the
      // single page notice instead of stating anything of its own.
      parts.container.hidden = !view.readable;
      parts.reservation.textContent = view.reservationText;
      parts.moveIn.textContent = view.moveInText;
      parts.note.textContent = view.noteText;
    }
    refreshNotice();
  }

  /** One notice for the whole page, however many cards could not be read. */
  function refreshNotice() {
    const unreadable = cardsInDocument().filter((anchor) => {
      const slug = parseCardSlugFromHref(anchor.getAttribute('href'));
      const evidence = slug === null ? null : store.get(slug);
      return slug === null
        || (evidence && (evidence.identity === 'mismatch' || evidence.identity === 'ambiguous'));
    }).length;

    let notice = doc.querySelector(`[${NOTICE_ATTRIBUTE}]`);
    if (unreadable === 0) {
      notice?.remove();
      return;
    }
    if (!notice) {
      notice = doc.createElement('p');
      notice.setAttribute(NOTICE_ATTRIBUTE, '');
      notice.setAttribute('role', 'status');
      notice.className = 'standby-evidence-notice';
      const first = cardsInDocument()[0];
      first?.insertAdjacentElement('beforebegin', notice);
    }
    notice.textContent = "Some listings couldn't be read.";
  }

  /** Drops annotations whose card Landing has since replaced or removed. */
  function dropOrphans() {
    for (const [anchor, parts] of annotations) {
      if (!doc.contains(anchor)) {
        parts.container.remove();
        annotations.delete(anchor);
      }
    }
  }

  function readCard(anchor) {
    const slug = parseCardSlugFromHref(anchor.getAttribute('href'));
    if (slug === null) return; // an href this extension does not treat as a locator
    store.read(slug, {
      priority: 'background',
      visibleIdentity: { cardText: anchor.textContent },
    });
    paint(slug);
  }

  return {
    start() {
      unsubscribe = store.subscribe((slug) => paint(slug));
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) readCard(entry.target);
        }
      }, { rootMargin: '100px' });
      this.scan();
    },

    /** Picks up cards Landing has rendered or replaced since the last look. */
    scan() {
      dropOrphans();
      for (const anchor of cardsInDocument()) observer?.observe(anchor);
      refreshNotice();
    },

    /** Re-states every annotation against a newly selected check-in date. */
    restate() {
      for (const anchor of annotations.keys()) {
        const slug = parseCardSlugFromHref(anchor.getAttribute('href'));
        if (slug !== null) paint(slug);
      }
    },

    teardown() {
      observer?.disconnect();
      unsubscribe?.();
      for (const parts of annotations.values()) parts.container.remove();
      annotations.clear();
      doc.querySelector(`[${NOTICE_ATTRIBUTE}]`)?.remove();
    },
  };
}
