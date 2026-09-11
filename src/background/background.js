const DETAIL_ROUTE = /^https:\/\/www\.hellolanding\.com\/homes\/[^/]+\/standby(?:[/?#]|$)/;
const SEARCH_ROUTE = /^https:\/\/www\.hellolanding\.com\/s\/[^/]+\/apartments\/standby(?:[/?#]|$)/;
const SUPPORTED = (url) => DETAIL_ROUTE.test(url ?? '') || SEARCH_ROUTE.test(url ?? '');

async function syncPanelForTab(tabId, url) {
  const enabled = typeof url === 'string' && SUPPORTED(url);
  await chrome.sidePanel.setOptions({ tabId, path: 'src/panel/panel.html', enabled });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') syncPanelForTab(tabId, tab.url);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) syncPanelForTab(details.tabId, details.url);
});

chrome.action.onClicked.addListener((tab) => {
  if (SUPPORTED(tab.url)) chrome.sidePanel.open({ tabId: tab.id });
});

// A card's View evidence button. The click happens in the page, so the panel
// is opened here, where the side-panel API is available.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'open-panel') return;
  if (sender.tab && SUPPORTED(sender.tab.url)) chrome.sidePanel.open({ tabId: sender.tab.id });
});
