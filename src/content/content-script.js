import { createEvidenceController } from '../lib/evidence-controller.js';

const SLUG_PATTERN = /^\/homes\/([^/]+)\/standby(?:\/|$)/;

function readSlug() {
  const match = SLUG_PATTERN.exec(window.location.pathname);
  return match ? match[1] : null;
}

function readVisibleIdentity() {
  const heading = document.querySelector('h1');
  const propertyLink = document.querySelector('a[href^="/properties/"]');
  return {
    visibleHeadingText: heading ? heading.textContent : null,
    visiblePropertyLinkText: propertyLink ? propertyLink.textContent : null,
  };
}

async function fetchHome(slug, signal) {
  const url = `https://www.hellolanding.com/api/public/homes/${encodeURIComponent(slug)}`;
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(`Home request failed: ${response.status}`);
  return response.json();
}

const controller = createEvidenceController({ fetchHome });
let currentSlug = null;

let lastBroadcast = null;
function broadcastState() {
  const payload = { type: 'evidence-state', slug: currentSlug, state: controller.getState() };
  const serialized = JSON.stringify(payload);
  if (serialized === lastBroadcast) return;
  lastBroadcast = serialized;
  chrome.runtime.sendMessage(payload).catch(() => {});
}

function checkEntry() {
  const slug = readSlug();
  if (!slug) return;
  currentSlug = slug;
  controller.enterDetailPage({ slug, visibleIdentity: readVisibleIdentity() });
  broadcastState();
}

// Poll instead of trusting a specific Landing DOM-mutation contract: only
// one signed-in navigation flow has been verified (see docs/provenance), so
// this stays conservative and just watches for the slug the URL reports.
// ponytail: interval poll, switch to a verified mutation/navigation hook if Landing's SPA contract gets inspected further.
let lastCheckedSlug = null;
const pollId = setInterval(() => {
  const slug = readSlug();
  if (slug && slug !== lastCheckedSlug) {
    lastCheckedSlug = slug;
    checkEntry();
  }
}, 500);

checkEntry();
lastCheckedSlug = currentSlug;

const stateBroadcastInterval = setInterval(broadcastState, 500);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'request-open') {
    controller.openPanel({ slug: currentSlug, visibleIdentity: readVisibleIdentity() });
    broadcastState();
  } else if (message?.type === 'request-refresh') {
    controller.refresh({ slug: currentSlug, visibleIdentity: readVisibleIdentity() });
    broadcastState();
  } else if (message?.type === 'request-state') {
    sendResponse({ type: 'evidence-state', slug: currentSlug, state: controller.getState() });
  }
});

window.addEventListener('pagehide', () => {
  clearInterval(pollId);
  clearInterval(stateBroadcastInterval);
  controller.teardown();
});
