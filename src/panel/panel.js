import { describeState } from './render.js';

const heading = document.getElementById('unit-heading');
const identityNote = document.getElementById('identity-note');
const checkTime = document.getElementById('check-time');
const refreshStatus = document.getElementById('refresh-status');
const calendarStatus = document.getElementById('calendar-status');
const referenceNote = document.getElementById('reference-note');
const summaryList = document.getElementById('summary-list');
const demandSection = document.getElementById('demand-section');
const demandList = document.getElementById('demand-list');
const locationSection = document.getElementById('location-section');
const locationList = document.getElementById('location-list');
const calendarSummary = document.getElementById('calendar-summary');
const refreshButton = document.getElementById('refresh-button');
const announcer = document.getElementById('announcer');
const sixWeeks = document.getElementById('six-weeks');
const standbyOnlyHeadline = document.getElementById('standby-only-headline');
const standbyOnlyDetail = document.getElementById('standby-only-detail');
const standbyOnlyExplainer = document.getElementById('standby-only-explainer');
const marksExplainer = document.getElementById('marks-explainer');
const calendarGrid = document.getElementById('calendar-grid');
const gridLegend = document.getElementById('grid-legend');
const calendarSection = document.getElementById('calendar-section');
const allRanges = document.getElementById('all-ranges');
const allRangesSummary = document.getElementById('all-ranges-summary');
const allRangesList = document.getElementById('all-ranges-list');

let tabId = null;
// 'requested' after the member presses Refresh, 'checking' once that check
// starts; only its completion is announced, never the panel's first state.
let refresh = null;

const SVG = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
// Drawn inline: the panel fetches nothing from a third origin, icons included.
const PLACE_ICONS = {
  Rating: `<svg ${SVG}><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>`,
  'Walk score': `<svg ${SVG}><circle cx="9" cy="2.6" r="1.3"/><path d="M8.5 5.2 7.2 9.4l2.4 1.9.9 3.3M8.5 5.2l2.9 2.5M8.3 5.5 5.6 7.2 5 9.8M7.2 9.4 5.8 14.6"/></svg>`,
  'Transit score': `<svg ${SVG}><rect x="3" y="1.8" width="10" height="10.4" rx="1.6"/><path d="M3 7.6h10M5.3 14.3v-2.1M10.7 14.3v-2.1"/><path d="M5.6 10h.1M10.3 10h.1" stroke-width="2"/></svg>`,
  'Bike score': `<svg ${SVG}><circle cx="3.9" cy="10.9" r="2.7"/><circle cx="12.1" cy="10.9" r="2.7"/><path d="M3.9 10.9h4.2L6.6 5.6zM8.1 10.9l2.8-5.3 1.2 5.3M6.6 5.6h4.3M5.6 4h2M10.2 3.6h1.6"/></svg>`,
};
const SIGNAL_ICONS = {
  price: `<svg ${SVG}><path d="M8.6 1.8H14v5.4l-6.6 6.6a1 1 0 0 1-1.4 0L2.2 10a1 1 0 0 1 0-1.4z"/><path d="M11.3 4.6h.1" stroke-width="2"/></svg>`,
  flex: `<svg ${SVG}><circle cx="8" cy="8" r="6.2"/><path d="M5.6 10.4l4.8-4.8"/><path d="M5.9 5.9h.1M10.1 10.1h.1" stroke-width="2"/></svg>`,
  'minimum-stay': `<svg ${SVG}><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 6.6h12M5.2 1.8v2.4M10.8 1.8v2.4M5 9.6h6"/></svg>`,
};

function iconSquare(svg) {
  const icon = document.createElement('span');
  icon.className = 'place-icon';
  icon.innerHTML = svg ?? '';
  return icon;
}

/** A location fact as a tile: an icon, the value, then its label. */
function placeTile(item) {
  const row = document.createElement('div');
  const icon = iconSquare(PLACE_ICONS[item.label]);
  const dt = document.createElement('dt');
  dt.textContent = item.label;
  if (item.note) {
    const note = document.createElement('span');
    note.textContent = ` · ${item.note}`;
    dt.append(note);
  }
  const dd = document.createElement('dd');
  dd.textContent = item.value;
  // The tile's full sentence, for anyone who reads the value without its label.
  dd.title = item.text;
  if (item.value === 'Not supplied') dd.className = 'muted';
  row.append(icon, dt, dd);
  return row;
}

let openedByHover = null;

/**
 * An info button that opens its tip on hover, focus-free click, or keyboard.
 * A click pins the tip open; hovering away closes only a tip hover opened.
 */
function wireTip(button, tip) {
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', tip.id);
  const show = () => {
    if (tip.matches(':popover-open')) return;
    tip.showPopover();
    tipScrollY = scrollY;
    button.setAttribute('aria-expanded', 'true');
    const box = button.getBoundingClientRect();
    const width = tip.offsetWidth;
    tip.style.left = `${Math.max(12, Math.min(box.left + box.width / 2 - width / 2, innerWidth - width - 12))}px`;
    const below = box.bottom + 6;
    tip.style.top = `${below + tip.offsetHeight > innerHeight - 8 ? Math.max(8, box.top - 6 - tip.offsetHeight) : below}px`;
  };
  tip.addEventListener('toggle', (event) => {
    button.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState === 'closed' && openedByHover === tip) openedByHover = null;
  });
  button.addEventListener('mouseenter', () => { if (!tip.matches(':popover-open')) { show(); openedByHover = tip; } });
  button.addEventListener('mouseleave', () => { if (openedByHover === tip) tip.hidePopover(); });
  // Named as the invoker so pressing it never light-dismisses its own tip;
  // the click itself is handled here so hover, pin and toggle agree.
  button.popoverTargetElement = tip;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (openedByHover === tip) { openedByHover = null; return; }
    if (tip.matches(':popover-open')) tip.hidePopover();
    else show();
  });
}

function infoButton(label, tipId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'info';
  button.textContent = 'i';
  button.setAttribute('aria-label', `About ${label.toLowerCase()}`);
  button.dataset.tip = tipId;
  return button;
}

/** One signal: label and info button, then the fact and its detail. No verdict; the member draws it. */
function signalRow(row) {
  const wrapper = document.createElement('div');
  wrapper.id = `signal-${row.id}`;
  const dt = document.createElement('dt');
  const tipId = `tip-${row.id}`;
  const tip = document.createElement('div');
  tip.id = tipId;
  tip.className = 'tip';
  tip.popover = 'auto';
  tip.textContent = row.tip;
  const button = infoButton(row.label, tipId);
  dt.append(row.label, ' ', button);
  const value = document.createElement('dd');
  value.className = `signal-value${row.muted ? ' muted' : ''}`;
  value.textContent = row.value;
  wrapper.append(iconSquare(SIGNAL_ICONS[row.id]), dt, value);
  if (row.sub) {
    const sub = document.createElement('dd');
    sub.className = 'signal-sub';
    sub.textContent = row.sub;
    wrapper.append(sub);
  }
  wrapper.append(tip);
  wireTip(button, tip);
  return wrapper;
}

// Tips are placed against their button, so a scroll would leave one adrift.
// Only real movement counts: a resize also fires scroll without moving.
let tipScrollY = 0;
addEventListener('scroll', () => {
  if (scrollY === tipScrollY) return;
  for (const tip of document.querySelectorAll('.tip:popover-open')) tip.hidePopover();
}, { passive: true });

function render(state) {
  const view = describeState(state);
  heading.textContent = view.headingText;
  heading.title = view.headingText;
  identityNote.textContent = view.identityNote;
  checkTime.textContent = view.checkTimeText;
  refreshStatus.textContent = view.refreshNote;
  calendarStatus.textContent = view.calendarStatusText;
  // aria-disabled, not disabled, so a running check never drops keyboard focus.
  refreshButton.ariaDisabled = state.isChecking ? 'true' : null;
  calendarSection.hidden = !view.calendarVisible;

  allRanges.hidden = view.allRanges.length === 0;
  allRangesSummary.textContent = `All returned ranges (${view.allRanges.length})`;
  allRangesList.replaceChildren(...view.allRanges.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));

  sixWeeks.hidden = view.grid === null;
  if (view.grid) {
    standbyOnlyHeadline.textContent = view.standbyOnly.headline;
    standbyOnlyHeadline.dataset.standbyOnly = String(view.standbyOnly.isStandbyOnly);
    standbyOnlyDetail.textContent = view.standbyOnly.detail;
    standbyOnlyExplainer.textContent = view.standbyOnly.explainer;
    standbyOnlyExplainer.hidden = !view.standbyOnly.explainer;
    marksExplainer.textContent = view.grid.marksExplainer;
    marksExplainer.hidden = !view.grid.marksExplainer;
    // Nothing to explain means no disclosure, not an empty one.
    marksExplainer.parentElement.hidden = marksExplainer.hidden;
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
    gridLegend.replaceChildren(...view.grid.key.map(({ kind, text }) => {
      const item = document.createElement('li');
      const mark = document.createElement('i');
      mark.dataset.kind = kind;
      item.append(mark, document.createTextNode(text));
      return item;
    }));
  }

  referenceNote.textContent = view.referenceNote;
  calendarSummary.hidden = view.summaryItems.length === 0;
  summaryList.replaceChildren(...view.summaryItems.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));

  demandSection.hidden = view.demandRows.length === 0;
  // Rebuilt only when a row changes, so a focused info button or open tip
  // survives the routine state messages a check sends.
  const rows = JSON.stringify(view.demandRows);
  if (rows !== demandList.dataset.rows) {
    demandList.dataset.rows = rows;
    demandList.replaceChildren(...view.demandRows.map(signalRow));
  }

  // Rating and location are lifestyle facts, kept apart from the demand signals.
  const places = view.factItems.filter((item) => item.label !== 'Minimum stay');
  locationSection.hidden = places.length === 0;
  locationList.replaceChildren(...places.map(placeTile));

  if (state.isChecking && refresh === 'requested') refresh = 'checking';
  if (!state.isChecking && refresh === 'checking') {
    refresh = null;
    announcer.textContent = state.error ? 'Refresh failed.' : 'Refresh complete.';
  }
}

function applyMessage(message) {
  if (message?.type !== 'evidence-state') return;
  render(message.state);
}

const sectionInfo = document.querySelector('#demand-heading .info');
wireTip(sectionInfo, document.getElementById(sectionInfo.dataset.tip));

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab && sender.tab.id === tabId) applyMessage(message);
});

refreshButton.addEventListener('click', () => {
  if (tabId === null || refreshButton.ariaDisabled === 'true') return;
  refresh = 'requested';
  announcer.textContent = '';
  chrome.tabs.sendMessage(tabId, { type: 'request-refresh' });
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (!tab) return;
  tabId = tab.id;
  // Held open for this panel's lifetime so the page knows when it closes.
  try { chrome.tabs.connect(tabId, { name: 'standby-panel' }); } catch { /* the page may not be ready to accept it */ }
  chrome.tabs.sendMessage(tabId, { type: 'request-open' }).catch(() => {});
  chrome.tabs.sendMessage(tabId, { type: 'request-state' }).then(applyMessage).catch(() => {});
});
