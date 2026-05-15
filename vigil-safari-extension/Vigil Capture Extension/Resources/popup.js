'use strict'
// Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/popup.js — Phase 129 (D-13)
//
// ServiceNow assisted-capture popup. Replaces Phase 84 capture-the-page popup (D-02).
// Requires popup-helpers.js loaded BEFORE this file (see popup.html script tag order).
//
// Behavior:
//   D-03: HTTP 200 → window.close() immediately (no toast, no delay)
//   D-04: non-200 or network error → inline error under Send, popup stays open
//   D-12: clientCaptureId generated client-side via Web Crypto API
//   SVCNOW-02: chrome.runtime.onMessage listens for drift messages → shows drift-banner

const STORAGE_KEY = 'vigil_api_key'
const API_BASE = 'https://api.vigilhub.io'

document.addEventListener('DOMContentLoaded', async () => {
  const caseNumberHeader = document.getElementById('case-number-header')
  const driftBanner = document.getElementById('drift-banner')
  const descriptionInput = document.getElementById('description-input')
  const prioritySelect = document.getElementById('priority-select')
  const sendBtn = document.getElementById('send-btn')
  const sendError = document.getElementById('send-error')

  // --- API key ---
  const { [STORAGE_KEY]: apiKey } = await chrome.storage.local.get([STORAGE_KEY])
  if (!apiKey) {
    sendError.textContent = 'No API key configured. Set your Vigil API key in extension storage.'
    sendError.hidden = false
    sendBtn.disabled = true
    return
  }

  // --- Extract case number from current tab title ---
  let caseNumber = null
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    caseNumber = extractCaseNumber(tab?.title ?? '')
  } catch {
    // chrome.tabs.query unavailable (rare) — caseNumber stays null
  }

  if (caseNumber !== null) {
    caseNumberHeader.textContent = caseNumber
    // Focus description textarea when CS# is found
    descriptionInput.focus()
  } else {
    // No CS# detected — show error but keep form open so operator can see the state
    sendError.textContent = 'No case# detected on this page. Visit a ServiceNow case page first.'
    sendError.hidden = false
  }

  // --- SVCNOW-02: Listen for title drift from content-script.js ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TITLE_DRIFT') {
      // Show drift banner if the title changed away from the original case number
      // (includes when the new CS# differs, or when it becomes null on navigation away)
      if (msg.to !== caseNumber || msg.to === null) {
        driftBanner.hidden = false
      }
    }
  })

  // --- Cmd+Enter shortcut: trigger Send button ---
  descriptionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      sendBtn.click()
    }
  })

  // --- Send button click handler ---
  sendBtn.addEventListener('click', async () => {
    // Validate: must have a case number before submitting
    if (caseNumber === null) {
      sendError.textContent = 'No case# detected. Cannot submit without a case number.'
      sendError.hidden = false
      return
    }

    const description = descriptionInput.value.trim()
    const priority = prioritySelect.value

    // Disable button + show loading state
    sendBtn.disabled = true
    sendBtn.textContent = 'Sending…'
    sendError.hidden = true

    // D-12: generate clientCaptureId client-side
    const clientCaptureId = crypto.randomUUID()

    const body = {
      workOrders: [
        {
          caseNumber,
          shortDescription: description, // NOT `description` — route reads wo.shortDescription (RESEARCH Probe 4 / Pitfall 5)
          priority,
          clientCaptureId,
        },
      ],
    }

    try {
      const res = await fetch(`${API_BASE}/v1/work-orders/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        // D-03: close immediately on HTTP 200 — no toast, no delay
        window.close()
        return
      }

      // D-04: non-200 → inline error, popup stays open
      sendError.textContent = `Error (HTTP ${res.status}). Try again.`
      sendError.hidden = false
      sendBtn.disabled = false
      sendBtn.textContent = 'Send'
    } catch {
      // D-04: network error → inline error, popup stays open
      sendError.textContent = 'Network error. Try again.'
      sendError.hidden = false
      sendBtn.disabled = false
      sendBtn.textContent = 'Send'
    }
  })
})
