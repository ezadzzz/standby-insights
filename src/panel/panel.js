import { describeState } from './render.js';

const heading = document.getElementById('unit-heading');
const identityNote = document.getElementById('identity-note');
const checkTime = document.getElementById('check-time');
const calendarStatus = document.getElementById('calendar-status');
const rangeList = document.getElementById('range-list');
const refreshButton = document.getElementById('refresh-button');
const announcer = document.getElementById('announcer');

let tabId = null;
let lastCheckedAt = null;

function render(state) {
  const view = describeState(state);
  identityNote.textContent = view.identityNote;
  checkTime.textContent = view.refreshFailedNote ? `${view.checkTimeText}. ${view.refreshFailedNote}` : view.checkTimeText;
  calendarStatus.textContent = view.calendarStatusText;

  rangeList.replaceChildren(...view.rangeItems.map((item) => {
    const li = document.createElement('li');
    li.textContent = item.text;
    if (item.isReservation) li.className = 'reservation-label';
    return li;
  }));

  if (state.checkedAt !== null && state.checkedAt !== lastCheckedAt && !state.isChecking) {
    lastCheckedAt = state.checkedAt;
    announcer.textContent = 'Refresh complete.';
  }
}

function applyMessage(message) {
  if (message?.type !== 'evidence-state') return;
  heading.textContent = message.slug ?? 'Standby evidence';
  render(message.state);
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab && sender.tab.id === tabId) applyMessage(message);
});

refreshButton.addEventListener('click', () => {
  if (tabId !== null) chrome.tabs.sendMessage(tabId, { type: 'request-refresh' });
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (!tab) return;
  tabId = tab.id;
  chrome.tabs.sendMessage(tabId, { type: 'request-open' }).catch(() => {});
  chrome.tabs.sendMessage(tabId, { type: 'request-state' }).then(applyMessage).catch(() => {});
});
