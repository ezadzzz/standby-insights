import { summarizeForReference } from '../lib/calendar.js';
import { parseCardSlugFromHref } from './page-adapter.js';
import { describeCard } from './card-view.js';
import { displayedUnitName } from '../lib/identity.js';
import { checkDate } from '../lib/reference-date.js';
import { VIEW_DAYS } from '../lib/six-week-view.js';

const CARD_LINK = 'a[data-testid="pdp-home-card-link"]';
const ANNOTATION_ATTRIBUTE = 'data-standby-evidence';
const NOTICE_ATTRIBUTE = 'data-standby-notice';
// Observed on the live Austin Standby search, 2026-09-14: one results grid
// whose children are these wrappers, each holding a card link.
const CARD_WRAPPER = '[data-testid="pdp-home-card-wrapper"]';
// Marks a card strip draws without needing its key (decided 2026-10-07, #75).
const SELF_EVIDENT = new Set(['standby-only', 'unavailable']);

const PAUSED_NOTICE = 'Landing asked this extension to slow down, so reading further listings is paused.';

const listings = (n) => `${n} ${n === 1 ? 'listing' : 'listings'}`;

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
  let notice = null; // { container, text, resume }, built on first need

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

  let tipCount = 0;
  const CARD_TIP = 'Next six weeks of this home’s booking calendar. Each slice is one day, starting today on the left.';

  function buildAnnotation(slug) {
    const container = doc.createElement('div');
    container.setAttribute(ANNOTATION_ATTRIBUTE, slug ?? '');
    container.className = 'standby-evidence';
    container.setAttribute('role', 'group');
    // Attribution is real text, so assistive technology hears the source too.
    const tab = doc.createElement('span');
    tab.className = 'standby-evidence-tab';
    tab.textContent = 'Standby Insights';
    // What the card and its strip mean, for a member seeing one the first time.
    // Hover shows it; click toggles it, so keyboard and touch reach it too.
    const info = doc.createElement('button');
    info.type = 'button';
    info.className = 'standby-evidence-info';
    info.textContent = 'i';
    info.setAttribute('aria-label', 'About this card');
    info.setAttribute('aria-expanded', 'false');
    info.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      info.setAttribute('aria-expanded', String(info.getAttribute('aria-expanded') !== 'true'));
    });
    // Escape closes and keeps the member on the control.
    container.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || info.getAttribute('aria-expanded') !== 'true') return;
      info.setAttribute('aria-expanded', 'false');
      info.focus();
    });
    // The tip stays open while focus is anywhere in this note, so it can be read.
    container.addEventListener('focusout', (event) => {
      if (!container.contains(event.relatedTarget)) info.setAttribute('aria-expanded', 'false');
    });
    const tip = doc.createElement('p');
    tip.className = 'standby-evidence-tip';
    tip.textContent = CARD_TIP;
    tip.id = `standby-card-tip-${++tipCount}`;
    info.setAttribute('aria-controls', tip.id);
    info.setAttribute('aria-describedby', tip.id);

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
    // The strip's label already speaks every mark; the key is for sighted readers.
    const key = doc.createElement('p');
    key.className = 'standby-strip-key';
    key.setAttribute('aria-hidden', 'true');
    const note = doc.createElement('p');
    note.className = 'standby-evidence-note';

    // A real button, so it is reachable and operable by keyboard with the
    // browser's own focus ring rather than a clickable div.
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'standby-evidence-button';
    button.textContent = 'View evidence';
    button.addEventListener('click', (event) => {
      // The container sits beside Landing's card link, not inside it, but the
      // wrapper around both may carry its own click handler; stop the click
      // from reaching it so opening evidence never also navigates the card.
      event.preventDefault();
      event.stopPropagation();
      onViewEvidence?.(slug);
    });

    // Card order the specification fixes: standby-only headline, its detail,
    // the six-week strip, then View evidence. An older-check note sits directly
    // under the headline it qualifies.
    container.append(tab, info, tip, status, headline, note, detail, strip, scale, key, button);
    return { container, status, headline, detail, strip, scale, key, note, button, info, slug };
  }

  function paintStrip(parts, strip) {
    parts.strip.hidden = strip === null;
    parts.scale.hidden = strip === null;
    // Green beside a Standby-only headline and grey for the rest read without a
    // key; any other mark (Available, no calendar data, check-in) brings it.
    parts.key.hidden = strip === null || strip.key.every(({ kind }) => SELF_EVIDENT.has(kind));
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
    // A span, not an end date: the date read as an event on the unit.
    const start = doc.createElement('span');
    start.textContent = 'Today';
    const end = doc.createElement('span');
    end.textContent = '6 weeks';
    parts.scale.replaceChildren(start, end);
    parts.scale.setAttribute('aria-hidden', 'true');
    parts.key.replaceChildren(...strip.key.map(({ kind, text }) => {
      const item = doc.createElement('span');
      const mark = doc.createElement('i');
      mark.setAttribute('data-kind', kind);
      const words = doc.createElement('span');
      words.textContent = text;
      item.append(mark, words);
      return item;
    }));
  }

  function paint(slug) {
    const view = viewFor(slug);
    if (view === null) return;
    for (const anchor of anchorsFor(slug)) annotate(anchor, slug, view);
    refreshNotice();
  }

  function annotate(anchor, slug, view) {
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
    // An unreadable card keeps the source tab and its one "Not read" line, so
    // it differs from a card not read yet, which has no note at all. It makes
    // no unit claim: no strip to explain and no evidence to view.
    const notRead = !view.readable;
    parts.container.setAttribute('data-not-read', String(notRead));
    parts.info.hidden = notRead;
    parts.button.hidden = notRead;
    // Every card has a View evidence button; the unit tells them apart by ear.
    // An unconfirmed card is named only as the page shows it, never by the
    // response that failed to match it.
    const unitName = notRead
      ? displayedUnitName({ cardText: anchor.textContent })
      : store.get(slug)?.unitName;
    parts.container.setAttribute('aria-label', unitName ? `Standby Insights for ${unitName}` : 'Standby Insights');
    parts.info.setAttribute('aria-label', unitName ? `About this card, ${unitName}` : 'About this card');
    parts.button.setAttribute('aria-label', unitName ? `View evidence for ${unitName}` : 'View evidence');
    parts.status.textContent = view.statusText;
    parts.headline.textContent = view.headlineText;
    parts.headline.setAttribute('data-standby-only', String(view.isStandbyOnly));
    parts.headline.setAttribute('data-quiet', String(view.quiet));
    parts.detail.textContent = view.detailText;
    paintStrip(parts, view.strip);
    parts.note.textContent = view.noteText;
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
  function buildNotice() {
    const container = doc.createElement('div');
    container.setAttribute(NOTICE_ATTRIBUTE, '');
    container.setAttribute('role', 'status');
    container.className = 'standby-evidence standby-evidence-notice';
    const tab = doc.createElement('span');
    tab.className = 'standby-evidence-tab';
    tab.textContent = 'Standby Insights';
    const text = doc.createElement('p');
    const resume = doc.createElement('button');
    resume.type = 'button';
    resume.className = 'standby-evidence-button';
    resume.textContent = 'Resume reading listings';
    resume.addEventListener('click', () => onResume?.());
    container.append(tab, text, resume);
    return { container, text, resume };
  }

  /**
   * Before Landing's results grid, not inside its first card: a sibling of the
   * grid shifts no card out of row alignment and reads as nobody's listing.
   * Without the observed card wrapper, it falls back to sitting before the link.
   */
  function placeNotice(container) {
    const first = cardsInDocument()[0];
    const grid = first?.closest(CARD_WRAPPER)?.parentElement;
    (grid ?? first)?.insertAdjacentElement('beforebegin', container);
  }

  function refreshNotice() {
    const cards = cardsInDocument();
    const unreadable = cards.filter(isUnreadable).length;
    const paused = store.isBackgroundPaused;

    if (unreadable === 0 && !paused) {
      notice?.container.remove();
      return;
    }
    notice ??= buildNotice();
    if (!doc.contains(notice.container)) placeNotice(notice.container);

    // Parts are updated in place, never rebuilt, so a focused Resume button
    // keeps focus while later reads repaint the page.
    if (paused) {
      const waiting = cards.filter((anchor) => {
        const evidence = store.get(slugOf(anchor));
        return evidence?.isChecking && evidence.checkedAt === null;
      }).length;
      const notRead = unreadable + waiting;
      notice.text.textContent = notRead > 0
        ? `${PAUSED_NOTICE} ${listings(notRead)} not read.`
        : PAUSED_NOTICE;
    } else {
      notice.text.textContent = `${listings(unreadable)} couldn't be read.`;
    }
    notice.resume.hidden = !paused;
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
    if (slug === null) {
      // An href this extension does not treat as a locator is never read, and
      // is as unconfirmed as a card whose response didn't match it.
      annotate(anchor, null, describeCard({ evidence: { identity: 'ambiguous' } }));
      refreshNotice();
      return;
    }
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
      notice?.container.remove();
    },
  };
}
