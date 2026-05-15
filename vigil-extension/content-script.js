'use strict'
// Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/content-script.js — Phase 129 (D-13)
//
// SVCNOW-02: MutationObserver on document.title.
// When the CS# in the page title changes (e.g. Polaris pushState navigation to a different
// case mid-session), sends TITLE_DRIFT to the popup so it can display a drift banner.
//
// Load-order contract (Checker BLOCKER 5):
// This file is manifest content_scripts[0].js[1] (index 1).
// popup-helpers.js is manifest content_scripts[0].js[0] (index 0).
// Chrome MV3 injects content_scripts in array order into the same isolated world,
// so extractCaseNumber is available as a global from popup-helpers.js when this file runs.
// DO NOT redefine extractCaseNumber here — reference the global from popup-helpers.js.

let lastCaseNumber = null

const observer = new MutationObserver(() => {
  const current = extractCaseNumber(document.title)
  if (lastCaseNumber !== null && current !== lastCaseNumber) {
    chrome.runtime.sendMessage({ type: 'TITLE_DRIFT', from: lastCaseNumber, to: current })
  }
  if (current !== null) {
    lastCaseNumber = current
  }
})

// Observe <title> directly for text changes; fall back to <head> if title element
// is not yet in the DOM (rare, but possible on very early injection).
const titleEl = document.querySelector('title') ?? document.head
observer.observe(titleEl, { subtree: true, childList: true, characterData: true })

// Initialize lastCaseNumber from the current title at injection time.
lastCaseNumber = extractCaseNumber(document.title)
