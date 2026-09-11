import { describeState } from './render.js';

const heading = document.getElementById('unit-heading');
const identityNote = document.getElementById('identity-note');
const checkTime = document.getElementById('check-time');
const calendarStatus = document.getElementById('calendar-status');
const referenceNote = document.getElementById('reference-note');
const summaryList = document.getElementById('summary-list');
const rangeList = document.getElementById('range-list');
const factsSection = document.getElementById('facts-section');
const factsList = document.getElementById('facts-list');
const refreshButton = document.getElementById('refresh-button');
const announcer = document.getElementById('announcer');

let tabId = null;
let lastCheckedAt = null;

function render(state) {
  const view = describeState(state);
  heading.textContent = view.headingText;
  identityNote.textContent = view.identityNote;
  checkTime.textContent = view.refreshFailedNote ? `${view.checkTimeText}. ${view.refreshFailedNote}` : view.checkTimeText;
  calendarStatus.textContent = view.calendarStatusText;

  referenceNote.textContent = view.referenceNote;
  summaryList.replaceChildren(...view.summaryItems.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));

  rangeList.replaceChildren(...view.rangeItems.map((item) => {
    const li = document.createElement('li');
    li.textContent = item.text;
    if (item.isReservation) li.className = 'reservation-label';
    return li;
  }));

  // A description list pairs each fact with its own visible label, so an
  // unavailable field still reads as a labelled fact rather than stray text.
  factsSection.hidden = view.factItems.length === 0;
  factsList.replaceChildren(...view.factItems.flatMap((item) => {
    const dt = document.createElement('dt');
    dt.textContent = item.label;
    const dd = document.createElement('dd');
    dd.textContent = item.text;
    return [dt, dd];
  }));

  if (state.checkedAt !== null && state.checkedAt !== lastCheckedAt && !state.isChecking) {
    lastCheckedAt = state.checkedAt;
    announcer.textContent = 'Refresh complete.';
  }
}

function applyMessage(message) {
  if (message?.type !== 'evidence-state') return;
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
