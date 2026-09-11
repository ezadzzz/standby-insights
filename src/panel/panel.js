import { describeState } from './render.js';

const heading = document.getElementById('unit-heading');
const identityNote = document.getElementById('identity-note');
const checkTime = document.getElementById('check-time');
const calendarStatus = document.getElementById('calendar-status');
const referenceNote = document.getElementById('reference-note');
const summaryList = document.getElementById('summary-list');
const rangeList = document.getElementById('range-list');
const comparisonSection = document.getElementById('comparison-section');
const comparisonStatus = document.getElementById('comparison-status');
const comparisonSubject = document.getElementById('comparison-subject');
const comparisonTerms = document.getElementById('comparison-terms');
const comparisonDisclosure = document.getElementById('comparison-disclosure');
const comparisonCheckTime = document.getElementById('comparison-check-time');
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

  comparisonSection.hidden = !view.comparison.visible;
  comparisonStatus.textContent = view.comparison.statusText;
  comparisonSubject.textContent = view.comparison.subjectText;
  comparisonTerms.textContent = view.comparison.termsNote;
  comparisonDisclosure.textContent = view.comparison.disclosure;
  comparisonCheckTime.textContent = view.comparison.checkTimeText;

  // A description list pairs each fact with its own visible label, so an
  // unavailable field still reads as a labelled fact rather than stray text.
  factsSection.hidden = view.factItems.length === 0;
  factsList.replaceChildren(...view.factItems.flatMap((item) => {
    const dt = document.createElement('dt');
    dt.textContent = item.label;
    // A fact with per-item detail (each supplied Flex term) gets one dd per
    // line under its single label, rather than one run-on value.
    const values = [item.text, ...item.details].map((line) => {
      const dd = document.createElement('dd');
      dd.textContent = line;
      return dd;
    });
    return [dt, ...values];
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
