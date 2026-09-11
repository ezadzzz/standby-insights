import { createEvidenceController } from '../lib/evidence-controller.js';
import { createUnitEvidenceStore } from '../lib/unit-evidence-store.js';
import { RequestGate } from '../lib/request-gate.js';
import { createCardAnnotator } from './card-annotations.js';
import {
  parseSlugFromPath,
  extractVisibleIdentity,
  readSelectedCheckIn,
  parseCardSlugFromHref,
  isStandbySearchPath,
  SEARCH_CHECK_IN_SELECTOR,
} from './page-adapter.js';

/** Landing asking us to slow down, as distinct from any other failure. */
class RateLimitedError extends Error {
  constructor() { super('Rate limited'); this.name = 'RateLimitedError'; }
}

async function fetchHome(slug, signal) {
  const url = `https://www.hellolanding.com/api/public/homes/${encodeURIComponent(slug)}`;
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
  if (response.status === 429) throw new RateLimitedError();
  if (!response.ok) throw new Error(`Home request failed: ${response.status}`);
  return response.json();
}

// The one comparison tool this extension may call, on the one endpoint it may
// call it on. Both are fixed here: nothing from the page or from a runtime
// message can choose a destination or a tool name.
const PUBLIC_MCP_URL = 'https://www.hellolanding.com/mcp/public';
const SEARCH_TOOL = 'search_apartments_tool';

/**
 * One page of the fixed public search, scoped to an explicit market and an
 * exact bedroom count. Dates, commitment, price, rating, amenity and Standby
 * filters are all omitted so the result is the market's current advertised
 * snapshot rather than a filtered subset. Hero images are opted out of.
 */
async function searchPeers({ market, bedrooms, page, perPage }, signal) {
  const response = await fetch(PUBLIC_MCP_URL, {
    method: 'POST',
    signal,
    credentials: 'omit',
    redirect: 'error',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: page,
      method: 'tools/call',
      params: {
        name: SEARCH_TOOL,
        arguments: {
          market,
          min_bedrooms: bedrooms,
          max_bedrooms: bedrooms,
          page,
          per_page: perPage,
          include_hero_images: false,
        },
      },
    }),
  });
  if (response.status === 429) throw new RateLimitedError();
  if (!response.ok) throw new Error(`Search request failed: ${response.status}`);
  const body = await response.json();
  // The tool returns its payload as JSON text inside the MCP envelope; an
  // envelope that does not carry one is malformed, not an empty market.
  const payload = body?.result?.content?.[0]?.text;
  if (typeof payload !== 'string') throw new Error('Search response envelope was not readable');
  return JSON.parse(payload);
}

let currentSlug = null;

function broadcastState(state) {
  chrome.runtime.sendMessage({ type: 'evidence-state', slug: currentSlug, state }).catch(() => {});
}

// One gate and one store for this page instance, so the cards the member
// scrolls past and the unit the panel shows share both their evidence and
// their request budget instead of competing for them.
const gate = new RequestGate();
const store = createUnitEvidenceStore({ fetchHome, gate });
const controller = createEvidenceController({ searchPeers, gate, store, onChange: broadcastState });

const onSearchPage = isStandbySearchPath(window.location.pathname);

function currentCheckIn() {
  return readSelectedCheckIn({
    search: window.location.search,
    doc: document,
    displayedSelector: onSearchPage ? SEARCH_CHECK_IN_SELECTOR : undefined,
  });
}

// ponytail: UTC day, matching the panel's own fallback reference; both move
// together if a timezone-sensitive reference is ever verified against Landing.
function cardReferenceDate() {
  const checkIn = currentCheckIn();
  return checkIn.status === 'selected' && checkIn.date
    ? checkIn.date
    : new Date().toISOString().slice(0, 10);
}

/**
 * A card's View evidence button. The panel is opened by the service worker,
 * which is the only place that may, while the selection is made here so the
 * panel never shows the previous unit's evidence under this one's identity.
 */
function viewEvidenceFor(slug) {
  const anchor = [...document.querySelectorAll('a[data-testid="pdp-home-card-link"]')]
    .find((a) => parseCardSlugFromHref(a.getAttribute('href')) === slug);
  currentSlug = slug;
  controller.openPanel({
    slug,
    visibleIdentity: { cardText: anchor ? anchor.textContent : null },
    checkIn: currentCheckIn(),
  });
  chrome.runtime.sendMessage({ type: 'open-panel' }).catch(() => {});
}

const annotator = onSearchPage
  ? createCardAnnotator({
    store,
    doc: document,
    getReferenceDate: cardReferenceDate,
    onViewEvidence: viewEvidenceFor,
  })
  : null;

const checkInKey = (checkIn) => `${checkIn.status}:${checkIn.date}`;

function checkEntry() {
  const slug = parseSlugFromPath(window.location.pathname);
  if (!slug) return;
  currentSlug = slug;
  controller.enterDetailPage({ slug, visibleIdentity: extractVisibleIdentity(document), checkIn: currentCheckIn() });
}

// Poll instead of trusting a specific Landing DOM-mutation contract: only
// one signed-in navigation flow has been verified (see docs/provenance), so
// this stays conservative and just watches for the slug the URL reports. No
// network request happens here; the controller's own dedup decides whether
// a re-entry needs a fresh fetch.
// ponytail: interval poll, switch to a verified mutation/navigation hook if Landing's SPA contract gets inspected further.
let lastCheckedSlug = null;
let lastCheckInKey = null;
const pollId = setInterval(() => {
  if (onSearchPage) {
    // Landing re-renders cards as results settle and as the member scrolls;
    // this only looks at what is already rendered and never asks for more.
    annotator.scan();
    const searchKey = checkInKey(currentCheckIn());
    if (searchKey !== lastCheckInKey) {
      lastCheckInKey = searchKey;
      annotator.restate();
    }
    return;
  }
  const slug = parseSlugFromPath(window.location.pathname);
  if (!slug) return;
  if (slug !== lastCheckedSlug) {
    lastCheckedSlug = slug;
    lastCheckInKey = null;
    checkEntry();
    return;
  }
  // A date change on the same unit re-states existing evidence; it is not a
  // reason to fetch again.
  const checkIn = currentCheckIn();
  const key = checkInKey(checkIn);
  if (key !== lastCheckInKey) {
    lastCheckInKey = key;
    controller.selectCheckIn(checkIn);
  }
}, 500);

if (onSearchPage) {
  annotator.start();
} else {
  checkEntry();
  lastCheckedSlug = currentSlug;
}
lastCheckInKey = checkInKey(currentCheckIn());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'request-open') {
    controller.openPanel({ slug: currentSlug, visibleIdentity: extractVisibleIdentity(document), checkIn: currentCheckIn() });
  } else if (message?.type === 'request-refresh') {
    controller.refresh({ slug: currentSlug, visibleIdentity: extractVisibleIdentity(document), checkIn: currentCheckIn() });
  } else if (message?.type === 'resume-background') {
    store.resumeBackground();
    annotator?.restate();
  } else if (message?.type === 'request-state') {
    sendResponse({ type: 'evidence-state', slug: currentSlug, state: controller.getState() });
  }
});

// The panel holds this port open for exactly as long as it is showing this
// tab, which is the only honest signal that it is open — no message arrives
// when a side panel is dismissed.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'standby-panel') return;
  controller.setPanelOpen(true);
  port.onDisconnect.addListener(() => controller.setPanelOpen(false));
});

window.addEventListener('pagehide', () => {
  clearInterval(pollId);
  annotator?.teardown();
  controller.teardown();
});
