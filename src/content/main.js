import { createEvidenceController } from '../lib/evidence-controller.js';
import { parseSlugFromPath, extractVisibleIdentity, readSelectedCheckIn } from './page-adapter.js';

async function fetchHome(slug, signal) {
  const url = `https://www.hellolanding.com/api/public/homes/${encodeURIComponent(slug)}`;
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(`Home request failed: ${response.status}`);
  return response.json();
}

let currentSlug = null;

function broadcastState(state) {
  chrome.runtime.sendMessage({ type: 'evidence-state', slug: currentSlug, state }).catch(() => {});
}

const controller = createEvidenceController({ fetchHome, onChange: broadcastState });

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
