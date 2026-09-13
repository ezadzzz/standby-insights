import { describeState } from './render.js';

const heading = document.getElementById('unit-heading');
const identityNote = document.getElementById('identity-note');
const checkTime = document.getElementById('check-time');
const calendarStatus = document.getElementById('calendar-status');
const referenceNote = document.getElementById('reference-note');
const summaryList = document.getElementById('summary-list');
const comparisonSection = document.getElementById('comparison-section');
const comparisonStatus = document.getElementById('comparison-status');
const comparisonSubject = document.getElementById('comparison-subject');
const comparisonTerms = document.getElementById('comparison-terms');
const comparisonDisclosure = document.getElementById('comparison-disclosure');
const comparisonCheckTime = document.getElementById('comparison-check-time');
const factsSection = document.getElementById('facts-section');
const factsList = document.getElementById('facts-list');
const locationSection = document.getElementById('location-section');
const locationList = document.getElementById('location-list');
const comparisonPrices = document.getElementById('comparison-prices');
const calendarSummary = document.getElementById('calendar-summary');
const refreshButton = document.getElementById('refresh-button');
const announcer = document.getElementById('announcer');
const sixWeeks = document.getElementById('six-weeks');
const standbyOnlyHeadline = document.getElementById('standby-only-headline');
const standbyOnlyDetail = document.getElementById('standby-only-detail');
const standbyOnlyExplainer = document.getElementById('standby-only-explainer');
const calendarGrid = document.getElementById('calendar-grid');

let tabId = null;
let lastCheckedAt = null;

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `icons.svg#${name}`);
  svg.append(use);
  return svg;
}

const factIcons = { 'Minimum stay': 'calendar', Flex: 'tag', Rating: 'star', 'Walk score': 'walk', 'Transit score': 'transit', 'Bike score': 'bike' };

function factRow(item) {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.append(icon(factIcons[item.label]), item.label);
  row.append(dt);
  for (const line of [item.text, ...item.details]) {
    const dd = document.createElement('dd');
    dd.textContent = line;
    row.append(dd);
  }
  return row;
}

function render(state) {
  const view = describeState(state);
  heading.textContent = view.headingText;
  identityNote.textContent = view.identityNote;
  checkTime.textContent = view.refreshFailedNote ? `${view.checkTimeText}. ${view.refreshFailedNote}` : view.checkTimeText;
  calendarStatus.textContent = view.calendarStatusText;

  sixWeeks.hidden = view.grid === null;
  if (view.grid) {
    standbyOnlyHeadline.textContent = view.standbyOnly.headline;
    standbyOnlyHeadline.dataset.standbyOnly = String(view.standbyOnly.isStandbyOnly);
    standbyOnlyDetail.textContent = view.standbyOnly.detail;
    standbyOnlyExplainer.textContent = view.standbyOnly.explainer;
    standbyOnlyExplainer.hidden = !view.standbyOnly.explainer;
    calendarGrid.setAttribute('aria-label', view.grid.label);
    const blanks = Array.from({ length: view.grid.leadingBlanks }, () => document.createElement('span'));
    calendarGrid.replaceChildren(...blanks, ...view.grid.cells.map((cell) => {
      const day = document.createElement('span');
      day.dataset.kind = cell.kind;
      day.textContent = cell.dayText;
      day.title = cell.title;
      if (cell.isToday) day.classList.add('today');
      if (cell.isCheckIn) day.classList.add('check-in');
      return day;
    }));
  }

  referenceNote.textContent = view.referenceNote;
  calendarSummary.hidden = view.summaryItems.length === 0;
  summaryList.replaceChildren(...view.summaryItems.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));

  comparisonSection.hidden = !view.comparison.visible;
  comparisonPrices.hidden = view.comparison.prices.length === 0;
  comparisonPrices.replaceChildren(...view.comparison.prices.map((price) => {
    const group = document.createElement('div');
    const label = document.createElement('dt');
    label.textContent = price.label;
    const amount = document.createElement('dd');
    amount.className = `price-amount${price.amount === 'Unavailable' ? ' unavailable' : ''}`;
    amount.textContent = price.amount;
    const unit = document.createElement('dd');
    unit.textContent = price.unit;
    group.append(label, amount, unit);
    return group;
  }));
  comparisonStatus.textContent = view.comparison.scopeText || view.comparison.statusText;
  comparisonSubject.textContent = view.comparison.subjectText;
  comparisonSubject.hidden = view.comparison.prices.length > 0 && view.comparison.prices[0].amount !== 'Unavailable';
  comparisonTerms.textContent = view.comparison.termsNote;
  comparisonDisclosure.textContent = view.comparison.disclosure;
  comparisonCheckTime.textContent = view.comparison.checkTimeText;

  // A description list pairs each fact with its own visible label, so an
  // unavailable field still reads as a labelled fact rather than stray text.
  factsSection.hidden = view.factItems.length === 0;
  locationSection.hidden = view.factItems.length === 0;
  factsList.replaceChildren(...view.factItems.slice(0, 2).map(factRow));
  locationList.replaceChildren(...view.factItems.slice(2).map(factRow));

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
  // Held open for this panel's lifetime so the page knows when it closes.
  try { chrome.tabs.connect(tabId, { name: 'standby-panel' }); } catch { /* the page may not be ready to accept it */ }
  chrome.tabs.sendMessage(tabId, { type: 'request-open' }).catch(() => {});
  chrome.tabs.sendMessage(tabId, { type: 'request-state' }).then(applyMessage).catch(() => {});
});
