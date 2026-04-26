'use strict';
// Keep in lockstep with ../../../vigil-extension/popup.js — Phase 114 (D-02)

const STORAGE_KEY = 'vigil_api_key';
const API_BASE = 'https://api.vigilhub.io';

// --- DOM references ---
const setupView = document.getElementById('setup-view');
const captureView = document.getElementById('capture-view');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const setupError = document.getElementById('setup-error');
const setupLoading = document.getElementById('setup-loading');
const contentInput = document.getElementById('content-input');
const captureBtn = document.getElementById('capture-btn');
const captureError = document.getElementById('capture-error');
const captureSuccess = document.getElementById('capture-success');
const successText = document.getElementById('success-text');
const includeUrlCheckbox = document.getElementById('include-url');
const settingsBtn = document.getElementById('settings-btn');

// --- View management ---

function showView(view) {
  setupView.hidden = true;
  captureView.hidden = true;
  view.hidden = false;
}

// --- API key validation ---
// Uses /v1/summary (NOT /v1/health -- health returns 200 without auth)

async function validateApiKey(key) {
  try {
    const res = await fetch(`${API_BASE}/v1/summary`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Setup flow ---

saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setupError.textContent = 'Please enter an API key.';
    setupError.hidden = false;
    return;
  }

  setupError.hidden = true;
  setupLoading.hidden = false;
  saveKeyBtn.disabled = true;

  const valid = await validateApiKey(key);

  setupLoading.hidden = true;
  saveKeyBtn.disabled = false;

  if (!valid) {
    setupError.textContent = 'Invalid API key. Check your key and try again.';
    setupError.hidden = false;
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: key });
  await initCaptureView(key);
});

// Allow Enter key to submit on the API key input
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    saveKeyBtn.click();
  }
});

// --- Capture flow ---

async function initCaptureView(apiKey) {
  showView(captureView);
  captureError.hidden = true;
  captureSuccess.hidden = true;

  // Start with empty input — matches Mac quick capture behavior
  contentInput.value = '';
  contentInput.focus();

  // Cmd+Enter (Mac) / Ctrl+Enter (Windows) submits the capture form
  contentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      captureBtn.click();
    }
  });

  captureBtn.onclick = async () => {
    const content = contentInput.value.trim();
    if (!content) {
      captureError.textContent = 'Content cannot be empty.';
      captureError.hidden = false;
      return;
    }

    // Build final content with optional URL
    let finalContent = content;
    if (includeUrlCheckbox.checked) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          finalContent += `\n\n${tab.title || 'Page'}: ${tab.url}`;
        }
      } catch { /* activeTab not available — send content without URL */ }
    }

    captureError.hidden = true;
    captureSuccess.hidden = true;
    captureBtn.disabled = true;
    captureBtn.textContent = 'Capturing...';

    try {
      const res = await fetch(`${API_BASE}/v1/thoughts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: finalContent, source: 'text' }),
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 401) {
          captureError.textContent = 'API key rejected (401). Check your key in settings.';
        } else {
          captureError.textContent = `Capture failed (HTTP ${status}). Try again.`;
        }
        captureError.hidden = false;
        captureBtn.disabled = false;
        captureBtn.textContent = 'Capture';
        return;
      }

      // Reset button state after successful POST
      captureBtn.textContent = 'Capture';
      captureBtn.disabled = false;

      // Show success area with triage polling
      const thought = await res.json();
      captureSuccess.hidden = false;
      successText.innerHTML = '<span class="analyzing">Analyzing...</span>';

      const startTime = Date.now();
      const pollInterval = setInterval(async () => {
        if (Date.now() - startTime > 5000) {
          clearInterval(pollInterval);
          successText.innerHTML = '<span class="checkmark">&#10003;</span> Captured!';
          setTimeout(() => window.close(), 1500);
          return;
        }
        try {
          const pollRes = await fetch(`${API_BASE}/v1/thoughts/${thought.id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          if (pollRes.ok) {
            const updated = await pollRes.json();
            if (updated.category) {
              clearInterval(pollInterval);
              const cat = updated.category.charAt(0).toUpperCase() + updated.category.slice(1);
              successText.innerHTML = `<span class="checkmark">&#10003;</span> Captured! <span class="category-badge">${cat}</span>`;
              setTimeout(() => window.close(), 1500);
            }
          }
        } catch { /* ignore poll errors — timeout will handle */ }
      }, 800);
    } catch (err) {
      captureError.textContent = `Network error: ${err.message}`;
      captureError.hidden = false;
      captureBtn.disabled = false;
      captureBtn.textContent = 'Capture';
    }
  };
}

// --- Settings button (switch back to setup view) ---

settingsBtn.addEventListener('click', async () => {
  const { [STORAGE_KEY]: currentKey } = await chrome.storage.local.get([STORAGE_KEY]);
  apiKeyInput.value = currentKey ?? '';
  showView(setupView);
});

// --- Init on popup open ---

document.addEventListener('DOMContentLoaded', async () => {
  const { [STORAGE_KEY]: apiKey } = await chrome.storage.local.get([STORAGE_KEY]);

  if (!apiKey) {
    showView(setupView);
  } else {
    await initCaptureView(apiKey);
  }
});
