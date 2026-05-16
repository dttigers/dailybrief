'use strict'
// Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/content-script.js — Phase 129 (D-13)
//
// SVCNOW-02: MutationObserver on document.title + persisted lastCaseNumber.
// When the CS# in the page title changes, sends a drift message to the popup
// so it can display a drift banner.
//
// PERSISTENCE (Phase 129 Plan 07 / GAP-129-D):
// Polaris case-to-case navigation triggers a full page reload (not pushState),
// so the content-script is re-injected fresh and its closure-scoped
// lastCaseNumber starts at null — meaning the in-memory observer alone never
// sees the prior case number and never fires the drift event across the reload.
// To recover drift detection across full reloads we mirror lastCaseNumber into
// chrome.storage.session (MV3-native, per-browser-session, cleared on browser
// quit). On every CS# change the observer writes the new value to session
// storage; on every initial load the script reads the stored value, fires an
// immediate drift message if it differs from the current title's CS#, then
// updates the stored value to the current. The "storage" permission is
// already declared in manifest.json and covers chrome.storage.session.
//
// Load-order contract (Checker BLOCKER 5):
// This file is manifest content_scripts[0].js[1] (index 1).
// popup-helpers.js is manifest content_scripts[0].js[0] (index 0).
// Chrome MV3 injects content_scripts in array order into the same isolated world,
// so extractCaseNumber is available as a global from popup-helpers.js when this file runs.
// DO NOT redefine extractCaseNumber here — reference the global from popup-helpers.js.

// chrome.storage.session key for the persisted CS# (`vigil_last_case_number`).
const SESSION_KEY = 'vigil_last_case_number'
const DRIFT_MSG_TYPE = 'TITLE_DRIFT'

let lastCaseNumber = null

function sendDrift(from, to) {
  try {
    chrome.runtime.sendMessage({ type: DRIFT_MSG_TYPE, from, to })
  } catch {
    // No listener (popup closed) — silent drop is acceptable for drift UX.
  }
}

const observer = new MutationObserver(() => {
  const current = extractCaseNumber(document.title)
  if (lastCaseNumber !== null && current !== lastCaseNumber) {
    sendDrift(lastCaseNumber, current)
  }
  if (current !== null) {
    lastCaseNumber = current
    // Mirror to session storage so a subsequent full-reload content-script
    // instance can detect drift on its initial read.
    chrome.storage.session.set({ [SESSION_KEY]: current }).catch(() => {})
  }
})

// Observe <title> directly for text changes; fall back to <head> if title element
// is not yet in the DOM (rare, but possible on very early injection).
const titleEl = document.querySelector('title') ?? document.head

// Wrap initialization in an IIFE so we can await the session-storage read
// before initializing lastCaseNumber and attaching the observer.
;(async () => {
  let stored = null
  try {
    const result = await chrome.storage.session.get([SESSION_KEY])
    stored = result?.[SESSION_KEY] ?? null
  } catch {
    // session storage unavailable (older Safari?) — degrade gracefully; the
    // MutationObserver path will still cover in-session pushState navigation.
  }

  const current = extractCaseNumber(document.title)

  // If we have a stored value from a prior page in this browser session AND
  // it differs from the current page's CS#, fire the drift event immediately
  // so any open popup gets the warning.
  if (stored && current && stored !== current) {
    sendDrift(stored, current)
  }

  // Initialize the in-memory state for the observer path.
  lastCaseNumber = current

  // Update the stored value if the current page has a CS# (don't clear it on
  // non-case Polaris pages — operator's mental model: drift context survives
  // roundtrips through neutral pages).
  if (current !== null && current !== stored) {
    chrome.storage.session.set({ [SESSION_KEY]: current }).catch(() => {})
  }

  observer.observe(titleEl, { subtree: true, childList: true, characterData: true })
})()
