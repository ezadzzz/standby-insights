const DETAIL_ROUTE = /^https:\/\/www\.hellolanding\.com\/homes\/[^/]+\/standby(?:[/?#]|$)/;

async function syncPanelForTab(tabId, url) {
  const enabled = typeof url === 'string' && DETAIL_ROUTE.test(url);
  await chrome.sidePanel.setOptions({ tabId, path: 'src/panel/panel.html', enabled });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') syncPanelForTab(tabId, tab.url);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) syncPanelForTab(details.tabId, details.url);
});

chrome.action.onClicked.addListener((tab) => {
  if (DETAIL_ROUTE.test(tab.url ?? '')) chrome.sidePanel.open({ tabId: tab.id });
});
