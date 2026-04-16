'use strict';

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

  captureBtn.onclick = async () => {
    const content = contentInput.value.trim();
    if (!content) {
      captureError.textContent = 'Content cannot be empty.';
      captureError.hidden = false;
      return;
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
        body: JSON.stringify({ content: content, source: 'text' }),
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

      captureSuccess.hidden = false;
      captureBtn.textContent = 'Capture';
      captureBtn.disabled = false;

      setTimeout(() => window.close(), 1500);
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
