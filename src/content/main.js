import { createEvidenceController } from '../lib/evidence-controller.js';
import { parseSlugFromPath, extractVisibleIdentity, readSelectedCheckIn } from './page-adapter.js';

async function fetchHome(slug, signal) {
  const url = `https://www.hellolanding.com/api/public/homes/${encodeURIComponent(slug)}`;
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
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

const controller = createEvidenceController({ fetchHome, searchPeers, onChange: broadcastState });

function currentCheckIn() {
  return readSelectedCheckIn({ search: window.location.search, doc: document });
}

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

checkEntry();
lastCheckedSlug = currentSlug;
lastCheckInKey = checkInKey(currentCheckIn());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'request-open') {
    controller.openPanel({ slug: currentSlug, visibleIdentity: extractVisibleIdentity(document), checkIn: currentCheckIn() });
  } else if (message?.type === 'request-refresh') {
    controller.refresh({ slug: currentSlug, visibleIdentity: extractVisibleIdentity(document), checkIn: currentCheckIn() });
  } else if (message?.type === 'request-state') {
    sendResponse({ type: 'evidence-state', slug: currentSlug, state: controller.getState() });
  }
});

window.addEventListener('pagehide', () => {
  clearInterval(pollId);
  controller.teardown();
});
