// Set on every worker start, not just onInstalled, so it holds after a browser restart.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('setPanelBehavior failed', err));
