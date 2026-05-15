'use strict'
// Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/background.js — Phase 129 (D-13)
//
// MV3 service worker: D-01 implementation.
// Enables the extension action button on *.service-now.com/* tabs,
// disables it on all other tabs. The popup only makes sense on SN pages.
//
// No module-level state (MV3 service workers are ephemeral — reads tab URL on every event).

const SN_PATTERN = /^https?:\/\/[^/]+\.service-now\.com\//

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    const url = tab.url ?? changeInfo.url ?? ''
    if (SN_PATTERN.test(url)) {
      chrome.action.enable(tabId)
    } else {
      chrome.action.disable(tabId)
    }
  }
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  if (SN_PATTERN.test(tab.url ?? '')) {
    chrome.action.enable(tabId)
  } else {
    chrome.action.disable(tabId)
  }
})
