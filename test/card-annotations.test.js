import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardAnnotator } from '../src/content/card-annotations.js';
import { observedCards } from './fixtures/home-responses.js';

// A fake DOM covering only what the annotator touches. The repo hand-rolls
// these rather than taking a browser dependency; the real placement is proven
// by test/browser/verify-unpacked.mjs against live cards.
class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.parent = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.ownText = '';
    this.hidden = false;
    this.className = '';
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

  get parentElement() { return this.parent; }

  closest(selector) {
    for (let el = this; el; el = el.parent) if (matches(el, selector)) return el;
    return null;
  }

  get textContent() {
    return this.ownText !== '' ? this.ownText : this.children.map((c) => c.textContent).join('');
  }

  set textContent(value) { this.ownText = value; this.children = []; }

  append(...kids) {
    for (const kid of kids) { kid.parent = this; this.children.push(kid); }
  }

  replaceChildren(...kids) {
    for (const kid of this.children) kid.parent = null;
    this.children = [];
    this.ownText = '';
    this.append(...kids);
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  insertAdjacentElement(position, element) {
    const parent = this.parent;
    if (!parent) return;
    const at = parent.children.indexOf(this);
    element.parent = parent;
    parent.children.splice(position === 'beforebegin' ? at : at + 1, 0, element);
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  focus() { this.focused = true; }

  fire(type, event) { for (const fn of this.listeners.get(type) ?? []) fn(event); }

  click() {
    for (const fn of this.listeners.get('click') ?? []) fn({ preventDefault() {}, stopPropagation() {} });
  }
}

function descendants(node, out = []) {
  for (const kid of node.children) { out.push(kid); descendants(kid, out); }
  return out;
}

function matches(el, selector) {
  if (selector === 'a[data-testid="pdp-home-card-link"]') {
    return el.tag === 'a' && el.getAttribute('data-testid') === 'pdp-home-card-link';
  }
  if (selector === '[data-standby-notice]') return el.getAttribute('data-standby-notice') !== null;
  if (selector === '[data-testid="pdp-home-card-wrapper"]') return el.getAttribute('data-testid') === 'pdp-home-card-wrapper';
  throw new Error(`unsupported selector in fake DOM: ${selector}`);
}

function fakeDoc() {
  const root = new FakeElement('body');
  return {
    root,
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll(selector) { return descendants(root).filter((el) => matches(el, selector)); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    contains(el) { return descendants(root).includes(el); },
  };
}

function addCard(doc, { href, text }) {
  const anchor = new FakeElement('a');
  anchor.setAttribute('data-testid', 'pdp-home-card-link');
  anchor.setAttribute('href', href);
  anchor.textContent = text;
  doc.root.append(anchor);
  return anchor;
}

/** A store stub: evidence is whatever the test says it is. */
function fakeStore() {
  const evidence = new Map();
  const reads = [];
  let paused = false;
  let notify = () => {};
  return {
    reads,
    set(slug, value) { evidence.set(slug, value); notify(slug); },
    pause(value) { paused = value; },
    get: (slug) => evidence.get(slug) ?? null,
    read: (slug, options) => reads.push({ slug, ...options }),
    subscribe(fn) { notify = fn; return () => { notify = () => {}; }; },
    get isBackgroundPaused() { return paused; },
  };
}

const READY = {
  status: 'ready',
  identity: 'confirmed',
  isChecking: false,
  isStale: false,
  checkedAt: 1000,
  ranges: [{ startDate: '2026-09-01', endDate: '2026-09-30', moveInAllowed: true, isReservation: false }],
};

function harness({ checkIn = { status: 'none', date: null }, referenceDate = '2026-09-15' } = {}) {
  const doc = fakeDoc();
  const store = fakeStore();
  const viewed = [];
  const resumed = [];
  let currentReference = referenceDate;
  const observed = [];
  let fireIntersection = () => { throw new Error('the annotator registered no observer'); };

  globalThis.IntersectionObserver = class {
    constructor(fn) {
      // Hand the annotator's own callback back to the test, so entering the
      // viewport is driven rather than simulated by calling the store.
      fireIntersection = (targets) => fn(targets.map((target) => ({ isIntersecting: true, target })));
    }

    observe(target) { if (!observed.includes(target)) observed.push(target); }

    disconnect() {}
  };

  const annotator = createCardAnnotator({
    store,
    doc,
    getReferenceDate: () => currentReference,
    getCheckIn: () => checkIn,
    getToday: () => '2026-09-10',
    onViewEvidence: (slug) => viewed.push(slug),
    onResume: () => resumed.push(true),
  });

  return {
    doc,
    store,
    annotator,
    viewed,
    resumed,
    observed,
    scrollIntoView(...anchors) { fireIntersection(anchors); },
    setReference(date) { currentReference = date; },
    annotations: () => descendants(doc.root).filter((el) => el.getAttribute('data-standby-evidence') !== null),
    notices: () => doc.querySelectorAll('[data-standby-notice]'),
  };
}

const CARD = observedCards[0];

test('a card observed repeatedly still carries exactly one annotation', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();

  h.store.set(CARD.response.slug, READY);
  h.store.set(CARD.response.slug, READY);
  h.store.set(CARD.response.slug, READY);

  assert.equal(h.annotations().length, 1);
});

test('an annotation is removed when Landing removes the card it belongs to', () => {
  const h = harness();
  const anchor = addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);
  assert.equal(h.annotations().length, 1);

  anchor.remove();
  h.annotator.scan();

  assert.equal(h.annotations().length, 0, 'no annotation outlives its card');
});

test('a card re-rendered in place for another unit never keeps the previous unit’s claim', () => {
  const other = observedCards[1];
  const h = harness();
  const anchor = addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);
  assert.equal(h.annotations()[0].getAttribute('data-standby-evidence'), CARD.response.slug);

  // Landing reuses the same anchor for a different home.
  anchor.setAttribute('href', other.href);
  anchor.textContent = other.text;
  h.annotator.scan();

  assert.equal(h.annotations().length, 0, 'the previous unit’s annotation is gone immediately');

  h.store.set(other.response.slug, READY);
  assert.equal(h.annotations()[0].getAttribute('data-standby-evidence'), other.response.slug);
});

test('a reply for a unit no longer on the page annotates nothing', () => {
  const h = harness();
  const anchor = addCard(h.doc, CARD);
  h.annotator.start();
  anchor.remove();
  h.annotator.scan();

  h.store.set(CARD.response.slug, READY);
  assert.equal(h.annotations().length, 0);
});

test('changing the selected check-in re-states every annotation against the new date', () => {
  const h = harness({ checkIn: { status: 'selected', date: '2026-09-15' } });
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);
  const marker = () => descendants(h.annotations()[0]).find((el) => el.className === 'standby-strip-check-in').getAttribute('style');
  const before = marker();

  h.setReference('2026-09-20');
  h.annotator.restate();

  assert.notEqual(marker(), before, 'the check-in marker moves with the new date');
});

const NOT_READ = "Not read: couldn't confirm this listing";

test('an unconfirmed card says "not read" in one quiet line and makes no claim', () => {
  const h = harness();
  const mismatched = addCard(h.doc, CARD);
  addCard(h.doc, observedCards[1]);
  h.annotator.start();

  // The response's own name is never trusted for a card it doesn't match.
  h.store.set(CARD.response.slug, { ...READY, identity: 'mismatch', status: 'mismatch', ranges: null, unitName: 'Somewhere Else 9999' });
  h.store.set(observedCards[1].response.slug, { ...READY, identity: 'ambiguous', status: 'ambiguous', ranges: null });

  assert.equal(h.annotations().length, 2);
  for (const note of h.annotations()) {
    const part = (className) => note.children.find((el) => el.className === className);
    assert.equal(note.hidden, false, 'the card says it was not read rather than staying blank');
    assert.equal(note.getAttribute('data-not-read'), 'true');
    assert.equal(note.children[0].textContent, 'Standby Insights', 'the source tab still names the source');
    assert.equal(part('standby-evidence-status').textContent, NOT_READ);
    assert.equal(part('standby-evidence-headline').textContent, '', 'no headline');
    assert.equal(part('standby-evidence-line').textContent, '');
    assert.equal(part('standby-evidence-note').textContent, '');
    assert.equal(part('standby-strip').hidden, true, 'no strip');
    assert.equal(part('standby-strip-key').hidden, true, 'no key');
    assert.equal(part('standby-evidence-info').hidden, true, 'nothing about a strip to explain');
    assert.equal(part('standby-evidence-button').hidden, true, 'no evidence to view for an unconfirmed unit');
  }
  // Named for the unit the page shows, not for whatever the response described.
  assert.deepEqual(h.annotations().map((el) => el.getAttribute('aria-label')),
    ['Standby Insights for Unit 1831', 'Standby Insights for Unit 2309']);
  // Still a guest: the note sits directly after Landing's own link.
  assert.equal(h.doc.root.children[h.doc.root.children.indexOf(mismatched) + 1], h.annotations()[0]);

  assert.equal(h.notices().length, 1, 'two unreadable cards still produce one notice');
  assert.equal(h.notices()[0].textContent, "Standby Insights2 listings couldn't be read.Resume reading listings",
    'a count, not a hunt for cards with no note');
});

test('a card not yet read still shows nothing, so it differs from one that could not be read', () => {
  const h = harness();
  addCard(h.doc, CARD);
  addCard(h.doc, observedCards[1]);
  h.annotator.start();
  assert.equal(h.annotations().length, 0);
  assert.equal(h.notices().length, 0, 'an unread card is not counted as unreadable');

  h.store.set(CARD.response.slug, { ...READY, identity: 'mismatch', status: 'mismatch', ranges: null });

  assert.deepEqual(h.annotations().map((el) => el.getAttribute('data-standby-evidence')), [CARD.response.slug],
    'only the unreadable card is marked');
  assert.match(h.notices()[0].textContent, /1 listing couldn't be read\./);
});

test('a ready card keeps its full note and is not marked as not read', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, { ...READY, unitName: 'Cortland Southpark Terraces 1831' });

  const note = h.annotations()[0];
  const part = (className) => note.children.find((el) => el.className === className);
  assert.equal(note.getAttribute('data-not-read'), 'false');
  assert.notEqual(part('standby-evidence-status').textContent, NOT_READ);
  assert.notEqual(part('standby-evidence-headline').textContent, '');
  assert.equal(part('standby-strip').hidden, false);
  assert.equal(part('standby-evidence-info').hidden, false);
  assert.equal(part('standby-evidence-button').hidden, false);
  assert.equal(note.getAttribute('aria-label'), 'Standby Insights for Cortland Southpark Terraces 1831');
  assert.equal(h.notices().length, 0);
});

test('a card read again after a mismatch drops its "not read" line once confirmed', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, { ...READY, identity: 'mismatch', status: 'mismatch', ranges: null });
  h.store.set(CARD.response.slug, READY);

  const note = h.annotations()[0];
  assert.equal(note.getAttribute('data-not-read'), 'false');
  assert.equal(note.children.find((el) => el.className === 'standby-evidence-button').hidden, false);
  assert.equal(h.notices().length, 0);
});

test('the page notice sits before Landing’s results grid, never inside a card', () => {
  const h = harness();
  // The live search markup: banner, then one grid of card wrappers.
  const column = new FakeElement('div');
  const banner = new FakeElement('div');
  const grid = new FakeElement('div');
  column.append(banner, grid);
  h.doc.root.append(column);
  for (const card of observedCards.slice(0, 2)) {
    const wrapper = new FakeElement('div');
    wrapper.setAttribute('data-testid', 'pdp-home-card-wrapper');
    const inner = new FakeElement('div');
    const anchor = new FakeElement('a');
    anchor.setAttribute('data-testid', 'pdp-home-card-link');
    anchor.setAttribute('href', card.href);
    anchor.textContent = card.text;
    inner.append(anchor);
    wrapper.append(inner);
    grid.append(wrapper);
  }
  h.annotator.start();
  h.store.set(CARD.response.slug, { ...READY, identity: 'mismatch', status: 'mismatch', ranges: null });

  const notice = h.notices()[0];
  assert.deepEqual(column.children, [banner, notice, grid], 'between Landing’s banner and its grid');
  assert.equal(notice.closest('[data-testid="pdp-home-card-wrapper"]'), null);
  assert.equal(notice.children[0].textContent, 'Standby Insights', 'attributed in words like every card note');
  assert.match(notice.textContent, /1 listing couldn't be read\./);
});

test('a card whose read failed counts as unreadable, not merely blank', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();

  h.store.set(CARD.response.slug, {
    status: 'unavailable', identity: 'confirmed', isChecking: false, isStale: false, checkedAt: 2000, ranges: null,
  });

  assert.equal(h.notices().length, 1);
  assert.match(h.annotations()[0].textContent, /Calendar unavailable/);
});

test('a rate limit is stated on the page with an explicit way to resume', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);
  assert.equal(h.notices().length, 0);

  h.store.pause(true);
  h.annotator.scan();

  const notice = h.notices()[0];
  assert.match(notice.textContent, /paused/i);
  const resume = notice.children.find((el) => el.className === 'standby-evidence-button');
  assert.ok(resume, 'recovery is offered, not left to a timer');
  assert.equal(resume.hidden, false);

  // A card read queued behind the pause is counted, and the repaint it causes
  // keeps the same button, so a focused Resume is never yanked away.
  const other = observedCards[1];
  addCard(h.doc, other);
  h.store.set(other.response.slug, { isChecking: true, checkedAt: null, isStale: false, ranges: null });
  assert.match(notice.textContent, /paused\. 1 listing not read\./);
  assert.equal(notice.children.find((el) => el.tag === 'button'), resume, 'the Resume button survives a repaint');

  resume.click();
  assert.equal(h.resumed.length, 1);
});

test('View evidence reports the card’s own unit, and does not follow the card link', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);

  const button = h.annotations()[0].children.find((el) => el.className === 'standby-evidence-button');
  assert.equal(button.textContent, 'View evidence');
  button.click();

  assert.deepEqual(h.viewed, [CARD.response.slug]);
});

test('the info mark toggles a note on what the card and its six-week strip mean, without following the card link', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);

  const note = h.annotations()[0];
  const info = note.children.find((el) => el.className === 'standby-evidence-info');
  const tip = note.children.find((el) => el.className === 'standby-evidence-tip');
  assert.equal(info.getAttribute('aria-label'), 'About this card');
  assert.match(tip.textContent, /Next six weeks/);
  info.click();
  assert.equal(info.getAttribute('aria-expanded'), 'true');
  info.click();
  assert.equal(info.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(h.viewed, []);
});

test('the info control names its unit, points at its tip, and Escape closes it and refocuses', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, { ...READY, unitName: 'Lantana Hills 2321' });

  const note = h.annotations()[0];
  const info = note.children.find((el) => el.className === 'standby-evidence-info');
  const tip = note.children.find((el) => el.className === 'standby-evidence-tip');
  assert.equal(info.getAttribute('aria-label'), 'About this card, Lantana Hills 2321');
  assert.ok(tip.id);
  assert.equal(info.getAttribute('aria-controls'), tip.id);
  assert.equal(info.getAttribute('aria-describedby'), tip.id);

  info.click();
  assert.equal(info.getAttribute('aria-expanded'), 'true');
  note.fire('keydown', { key: 'Escape' });
  assert.equal(info.getAttribute('aria-expanded'), 'false');
  assert.equal(info.focused, true);
});

test('each note is a labeled group whose attribution and View evidence name the unit', () => {
  const h = harness({ checkIn: { status: 'selected', date: '2026-09-15' } });
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, { ...READY, unitName: 'Lantana Hills 2321' });

  const note = h.annotations()[0];
  assert.equal(note.getAttribute('role'), 'group');
  assert.equal(note.getAttribute('aria-label'), 'Standby Insights for Lantana Hills 2321');
  assert.equal(note.children[0].textContent, 'Standby Insights', 'the source tab is real text, not CSS content');
  const button = note.children.find((el) => el.className === 'standby-evidence-button');
  assert.equal(button.getAttribute('aria-label'), 'View evidence for Lantana Hills 2321');

  const strip = note.children.find((el) => el.className === 'standby-strip');
  assert.match(strip.getAttribute('aria-label'), /Your check-in, Sep 15, is marked$/);
  const key = note.children.find((el) => el.className === 'standby-strip-key');
  assert.match(key.textContent, /No calendar data.*Your check-in/);
  assert.equal(key.hidden, false, 'a strip with no calendar data keys its marks');
});

test('a card without a gap is one quiet line over a keyed strip', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, {
    ...READY,
    ranges: [{ startDate: '2026-09-01', endDate: '2027-09-01', moveInAllowed: true, isReservation: false }],
  });

  const note = h.annotations()[0];
  const part = (className) => note.children.find((el) => el.className === className);
  assert.equal(part('standby-evidence-headline').textContent, 'No reservation shown');
  assert.equal(part('standby-evidence-headline').getAttribute('data-quiet'), 'true');
  assert.equal(part('standby-evidence-line').textContent, '');
  assert.equal(part('standby-strip').hidden, false, 'the strip stays');
  assert.match(part('standby-strip').getAttribute('aria-label'), /^Six weeks from/, 'the strip still speaks every mark');
  assert.equal(part('standby-strip-key').hidden, false, 'an Available mark needs the key');
  assert.equal(part('standby-strip-key').textContent, 'Available');
  assert.deepEqual(part('standby-strip-scale').children.map((el) => el.textContent), ['Today', '6 weeks'], 'a span, not an end date');
});

test('a strip drawing only Standby-only and Unavailable carries no key', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, {
    ...READY,
    ranges: [
      { startDate: '2026-09-01', endDate: '2026-09-20', moveInAllowed: false, isReservation: false, unbookableReason: 'less_than_minimum_nightly_stay' },
      { startDate: '2026-09-21', endDate: '2027-01-01', moveInAllowed: false, isReservation: true },
    ],
  });

  const part = (className) => h.annotations()[0].children.find((el) => el.className === className);
  assert.equal(part('standby-strip').hidden, false, 'the strip stays');
  assert.equal(part('standby-strip-key').hidden, true, 'green and grey read without a key');
});

const NO_GAP_RANGES = [
  { startDate: '2026-09-01', endDate: '2026-09-20', moveInAllowed: false, isReservation: false, unbookableReason: 'less_than_minimum_nightly_stay' },
  { startDate: '2026-09-21', endDate: '2027-01-01', moveInAllowed: false, isReservation: true },
];

function keyFor(checkIn, ranges) {
  const h = harness({ checkIn });
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, { ...READY, ranges });
  const note = h.annotations()[0];
  return { note, key: note.children.find((el) => el.className === 'standby-strip-key') };
}

test('a check-in alone does not bring the key, though the triangle still draws', () => {
  const { note, key } = keyFor({ status: 'selected', date: '2026-09-15' }, NO_GAP_RANGES);
  assert.equal(key.hidden, true);
  assert.ok(descendants(note).some((el) => el.className === 'standby-strip-check-in'), 'the triangle is drawn');
});

test('a check-in beside an Available mark keys every mark', () => {
  const { key } = keyFor({ status: 'selected', date: '2026-09-15' }, [
    { startDate: '2026-09-01', endDate: '2027-09-01', moveInAllowed: true, isReservation: false },
  ]);
  assert.equal(key.hidden, false);
  assert.equal(key.textContent, 'AvailableYour check-in');
});

test('with no check-in, a no-gap strip carries no key', () => {
  const { key } = keyFor({ status: 'none', date: null }, NO_GAP_RANGES);
  assert.equal(key.hidden, true);
});

test('the card tip explains the triangle only when the strip draws one', () => {
  const tipFor = (checkIn) => {
    const h = harness({ checkIn });
    addCard(h.doc, CARD);
    h.annotator.start();
    h.store.set(CARD.response.slug, { ...READY, ranges: NO_GAP_RANGES });
    return h.annotations()[0].children.find((el) => el.className === 'standby-evidence-tip').textContent;
  };
  assert.match(tipFor({ status: 'selected', date: '2026-09-15' }), /starting today on the left\. A triangle marks your check-in\./);
  assert.doesNotMatch(tipFor({ status: 'none', date: null }), /triangle/);
});

test('a card is read only once it enters the viewport, and only ever in the background lane', () => {
  const h = harness();
  const onScreen = addCard(h.doc, CARD);
  addCard(h.doc, observedCards[1]);
  h.annotator.start();

  assert.deepEqual(h.store.reads, [], 'merely rendering cards reads nothing');
  assert.equal(h.observed.length, 2, 'both cards are watched');

  h.scrollIntoView(onScreen);

  assert.equal(h.store.reads.length, 1, 'only the card actually on screen is read');
  assert.equal(h.store.reads[0].slug, CARD.response.slug);
  assert.equal(h.store.reads[0].priority, 'background');
  assert.equal(h.store.reads[0].visibleIdentity.cardText, CARD.text,
    'the card is judged against the text it actually shows');
});

test('an href this extension will not treat as a locator is read as unreadable, never guessed', () => {
  const h = harness();
  const stray = addCard(h.doc, { href: '/properties/some-building', text: 'A Building' });
  h.annotator.start();
  h.scrollIntoView(stray);

  assert.deepEqual(h.store.reads, [], 'a general listing href triggers no request');
  assert.equal(h.notices().length, 1, 'it contributes to the one notice instead');
  const note = h.annotations()[0];
  assert.ok(note, 'and says on the card itself that it was not read');
  assert.equal(note.children.find((el) => el.className === 'standby-evidence-status').textContent, NOT_READ);
  assert.equal(note.getAttribute('aria-label'), 'Standby Insights', 'no unit is shown, so none is named');
});

test('an older check keeps its note directly under the headline it qualifies', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, { ...READY, isStale: true });

  const classes = h.annotations()[0].children.map((el) => el.className);
  assert.equal(classes[classes.indexOf('standby-evidence-headline') + 1], 'standby-evidence-note');
  const note = h.annotations()[0].children.find((el) => el.className === 'standby-evidence-note');
  assert.match(note.textContent, /older check/i);
});
