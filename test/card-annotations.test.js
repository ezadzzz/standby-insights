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
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);
  assert.match(h.annotations()[0].textContent, /Sep 15, 2026/);

  h.setReference('2026-09-20');
  h.annotator.restate();

  assert.match(h.annotations()[0].textContent, /Sep 20, 2026/);
  assert.doesNotMatch(h.annotations()[0].textContent, /Sep 15, 2026/);
});

test('an unconfirmed card makes no claim and contributes to one page notice', () => {
  const h = harness();
  addCard(h.doc, CARD);
  addCard(h.doc, observedCards[1]);
  h.annotator.start();

  h.store.set(CARD.response.slug, { ...READY, identity: 'mismatch', status: 'mismatch', ranges: null });
  h.store.set(observedCards[1].response.slug, { ...READY, identity: 'ambiguous', status: 'ambiguous', ranges: null });

  assert.ok(h.annotations().every((el) => el.hidden), 'no unit claim is attached');
  assert.equal(h.notices().length, 1, 'two unreadable cards still produce one notice');
  assert.match(h.notices()[0].textContent, /couldn't be read/);
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
  const resume = notice.children.find((el) => el.tag === 'button');
  assert.ok(resume, 'recovery is offered, not left to a timer');

  resume.click();
  assert.equal(h.resumed.length, 1);
});

test('View evidence reports the card’s own unit, and does not follow the card link', () => {
  const h = harness();
  addCard(h.doc, CARD);
  h.annotator.start();
  h.store.set(CARD.response.slug, READY);

  const button = h.annotations()[0].children.find((el) => el.tag === 'button');
  assert.equal(button.textContent, 'View evidence');
  button.click();

  assert.deepEqual(h.viewed, [CARD.response.slug]);
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
});
