import { summarizeForReference } from '../lib/calendar.js';
import { parseCardSlugFromHref } from './page-adapter.js';
import { describeCard } from './card-view.js';
import { checkDate } from '../lib/reference-date.js';
import { VIEW_DAYS } from '../lib/six-week-view.js';

const CARD_LINK = 'a[data-testid="pdp-home-card-link"]';
const ANNOTATION_ATTRIBUTE = 'data-standby-evidence';
const NOTICE_ATTRIBUTE = 'data-standby-notice';
const NOTICE_SELECTOR = `[${NOTICE_ATTRIBUTE}]`;

const UNREADABLE_NOTICE = "Some listings couldn't be read.";
const PAUSED_NOTICE = 'Landing asked this extension to slow down, so reading further listings is paused.';

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
export function createCardAnnotator({
  store,
  doc,
  getReferenceDate,
  getCheckIn,
  getToday = checkDate,
  onViewEvidence,
  onResume,
}) {
  const annotations = new Map(); // anchor -> { container, slug, ...parts }
  let observer = null;
  let unsubscribe = null;

  function cardsInDocument() {
    return [...doc.querySelectorAll(CARD_LINK)];
  }

  function slugOf(anchor) {
    return parseCardSlugFromHref(anchor.getAttribute('href'));
  }

  function anchorsFor(slug) {
    return cardsInDocument().filter((anchor) => slugOf(anchor) === slug);
  }

  /** What one card is allowed to say right now, or null if nothing yet. */
  function viewFor(slug) {
    const evidence = store.get(slug);
    if (!evidence) return null;
    const referenceDate = getReferenceDate();
    const summary = Array.isArray(evidence.ranges) && evidence.ranges.length > 0
      ? summarizeForReference(evidence.ranges, referenceDate)
      : null;
    return describeCard({ evidence, summary, referenceDate, today: getToday(), checkIn: getCheckIn?.() });
  }

  function buildAnnotation(slug) {
    const container = doc.createElement('div');
    container.setAttribute(ANNOTATION_ATTRIBUTE, slug);
    container.className = 'standby-evidence';

    const status = doc.createElement('p');
    status.className = 'standby-evidence-status';
    const headline = doc.createElement('p');
    headline.className = 'standby-evidence-headline';
    const detail = doc.createElement('p');
    detail.className = 'standby-evidence-line';
    // The strip repeats the words above as a picture; its label says every
    // stretch in words, so nothing it shows is carried by colour alone.
    const strip = doc.createElement('div');
    strip.className = 'standby-strip';
    strip.setAttribute('role', 'img');
    const scale = doc.createElement('p');
    scale.className = 'standby-strip-scale';
    const reference = doc.createElement('p');
    reference.className = 'standby-evidence-note';
    const note = doc.createElement('p');
    note.className = 'standby-evidence-note';

    // A real button, so it is reachable and operable by keyboard with the
    // browser's own focus ring rather than a clickable div.
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'standby-evidence-button';
    button.textContent = 'View evidence';
    button.addEventListener('click', (event) => {
      // The card sits inside Landing's own link; opening evidence must not
      // also navigate to the listing.
      event.preventDefault();
      event.stopPropagation();
      onViewEvidence?.(slug);
    });

    // Card order the specification fixes: standby-only headline, its detail,
    // the six-week strip, the reference date, then View evidence.
    container.append(status, headline, detail, strip, scale, reference, note, button);
    return { container, status, headline, detail, strip, scale, reference, note, slug };
  }

  function paintStrip(parts, strip) {
    parts.strip.hidden = strip === null;
    parts.scale.hidden = strip === null;
    if (strip === null) return;
    parts.strip.setAttribute('aria-label', strip.label);
    const pieces = strip.segments.map((segment) => {
      const piece = doc.createElement('span');
      piece.className = 'standby-strip-segment';
      piece.setAttribute('data-kind', segment.kind);
      piece.setAttribute('style', `flex-grow: ${segment.days}`);
      return piece;
    });
    if (strip.checkInIndex !== null) {
      const marker = doc.createElement('span');
      marker.className = 'standby-strip-check-in';
      marker.setAttribute('style', `left: ${((strip.checkInIndex + 0.5) / VIEW_DAYS) * 100}%`);
      pieces.push(marker);
    }
    parts.strip.replaceChildren(...pieces);
    const start = doc.createElement('span');
    start.textContent = 'Today';
    const end = doc.createElement('span');
    end.textContent = strip.endLabel;
    parts.scale.replaceChildren(start, end);
    parts.scale.setAttribute('aria-hidden', 'true');
  }

  function paint(slug) {
    const view = viewFor(slug);
    if (view === null) return;

    for (const anchor of anchorsFor(slug)) {
      let parts = annotations.get(anchor);
      // An anchor Landing re-renders in place for a different unit must not
      // keep the previous unit's annotation, even briefly.
      if (parts && parts.slug !== slug) {
        parts.container.remove();
        annotations.delete(anchor);
        parts = undefined;
      }
      if (!parts) {
        parts = buildAnnotation(slug);
        annotations.set(anchor, parts);
        anchor.insertAdjacentElement('afterend', parts.container);
      }
      // An unreadable card carries no unit claim at all; it contributes to the
      // single page notice instead of stating anything of its own.
      parts.container.hidden = !view.readable;
      parts.status.textContent = view.statusText;
      parts.headline.textContent = view.headlineText;
      parts.headline.setAttribute('data-standby-only', String(view.isStandbyOnly));
      parts.detail.textContent = view.detailText;
      paintStrip(parts, view.strip);
      parts.reference.textContent = view.referenceNote;
      parts.note.textContent = view.noteText;
    }
    refreshNotice();
  }

  /** A card that could not be read at all, for whatever reason. */
  function isUnreadable(anchor) {
    const slug = slugOf(anchor);
    if (slug === null) return true; // an href this extension will not treat as a locator
    const view = viewFor(slug);
    // A read that failed leaves a card as unreadable as one that never
    // matched; both belong in the one notice rather than in a blank box.
    return view !== null && (!view.readable || view.statusText === 'Calendar unavailable');
  }

  /**
   * One notice for the whole page, however many cards could not be read, and
   * the only place recovery is offered after a rate limit. Paused card reads
   * never resume on a timer: this is where the member asks for them.
   */
  function refreshNotice() {
    const unreadable = cardsInDocument().filter(isUnreadable).length;
    const paused = store.isBackgroundPaused;

    let notice = doc.querySelector(NOTICE_SELECTOR);
    if (unreadable === 0 && !paused) {
      notice?.remove();
      return;
    }
    if (!notice) {
      notice = doc.createElement('div');
      notice.setAttribute(NOTICE_ATTRIBUTE, '');
      notice.setAttribute('role', 'status');
      notice.className = 'standby-evidence-notice';
      cardsInDocument()[0]?.insertAdjacentElement('beforebegin', notice);
    }

    const text = doc.createElement('p');
    text.textContent = paused ? PAUSED_NOTICE : UNREADABLE_NOTICE;
    notice.replaceChildren(text);

    if (paused) {
      const resume = doc.createElement('button');
      resume.type = 'button';
      resume.className = 'standby-evidence-button';
      resume.textContent = 'Resume reading listings';
      resume.addEventListener('click', () => onResume?.());
      notice.append(resume);
    }
  }

  /** Drops annotations whose card Landing has since replaced or removed. */
  function dropOrphans() {
    for (const [anchor, parts] of annotations) {
      if (!doc.contains(anchor) || slugOf(anchor) !== parts.slug) {
        parts.container.remove();
        annotations.delete(anchor);
      }
    }
  }

  function readCard(anchor) {
    const slug = slugOf(anchor);
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

    /**
     * Picks up cards Landing has rendered or replaced since the last look.
     * ponytail: re-reads the whole card list each call, a full DOM sweep per
     * tick on a list that only grows as the member scrolls. Swap for a
     * MutationObserver on the results container if a long result list ever
     * measures badly; the observed pages are tens of cards, not thousands.
     */
    scan() {
      dropOrphans();
      for (const anchor of cardsInDocument()) observer?.observe(anchor);
      refreshNotice();
    },

    /** Re-states every annotation against a newly selected check-in date. */
    restate() {
      for (const anchor of [...annotations.keys()]) {
        const slug = slugOf(anchor);
        if (slug !== null) paint(slug);
      }
      refreshNotice();
    },

    teardown() {
      observer?.disconnect();
      unsubscribe?.();
      for (const parts of annotations.values()) parts.container.remove();
      annotations.clear();
      doc.querySelector(NOTICE_SELECTOR)?.remove();
    },
  };
}
