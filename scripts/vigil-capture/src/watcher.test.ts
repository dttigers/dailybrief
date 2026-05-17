// Phase 129.1 Plan 04 Task 3 — watcher.test.ts (TDD RED phase first)
//
// Tests the production surface of watcher.ts via dependency injection:
//   - shouldSkip filters dotfiles + .tmp + .download + .icloud, accepts .png/.jpg
//   - processFile rejects unsupported extensions before any side effects
//   - processFile happy path: file → base64 → POST → 200 → move to processed/<ts>-<workOrderId>.<ext>
//   - processFile HTTP failure: 422 → move to failed/ with .err sidecar containing "HTTP 422"
//   - processFile network error: fetch throws → move to failed/ with sidecar containing the message
//   - processFile sets mediaType="image/jpeg" for .jpg files
//   - processFile sends a valid UUID v4 clientCaptureId (matches the server-side regex from plan 03)
//
// Runner: node:test via tsx --test. Mocks are passed via the `deps` arg
// (fetchFn + getApiKeyFn + fetchUrlFn for the API base URL).

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  processFile,
  shouldSkip,
  SKIP_PATTERNS,
} from "./watcher.js";

// UUID v4 regex (verbatim from vigil-core/src/routes/captures-screenshot.ts).
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── tmpdir lifecycle ─────────────────────────────────────────────────────
let TMP_ROOT: string;
let CAPTURE_DIR: string;
let PROCESSED_DIR: string;
let FAILED_DIR: string;

function freshTmpRoot(): void {
  TMP_ROOT = mkdtempSync(path.join(tmpdir(), "vigil-capture-test-"));
  CAPTURE_DIR = TMP_ROOT;
  PROCESSED_DIR = path.join(CAPTURE_DIR, "processed");
  FAILED_DIR = path.join(CAPTURE_DIR, "failed");
  mkdirSync(PROCESSED_DIR, { recursive: true });
  mkdirSync(FAILED_DIR, { recursive: true });
}

function cleanupTmpRoot(): void {
  if (TMP_ROOT && existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
}

// Minimal Response-like shape for fetch mocks. We model only what processFile reads.
function mockResponse(opts: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: opts.json ?? (async () => ({})),
    text: opts.text ?? (async () => ""),
  } as unknown as Response;
}

// ── Test 1: shouldSkip + SKIP_PATTERNS ───────────────────────────────────
test("shouldSkip filters dotfiles + .tmp + .download + .icloud, accepts normal .png/.jpg", () => {
  // Sanity: SKIP_PATTERNS is exported as an array of predicates.
  assert.ok(Array.isArray(SKIP_PATTERNS), "SKIP_PATTERNS should be exported as an array");
  assert.ok(SKIP_PATTERNS.length >= 4, "expected at least 4 skip patterns (dotfile, .tmp., .download, .icloud)");

  // Should skip:
  assert.equal(shouldSkip(".DS_Store"), true, "dotfile must be skipped");
  assert.equal(shouldSkip(".something.png"), true, "any dotfile must be skipped");
  assert.equal(shouldSkip("screenshot.tmp.png"), true, ".tmp. mid-name must be skipped");
  assert.equal(shouldSkip("foo.download"), true, ".download suffix must be skipped");
  assert.equal(shouldSkip("foo.png.icloud"), true, ".icloud suffix must be skipped");

  // Should NOT skip:
  assert.equal(shouldSkip("screenshot.png"), false, "normal .png must not be skipped");
  assert.equal(shouldSkip("photo.jpg"), false, "normal .jpg must not be skipped");
  assert.equal(shouldSkip("img.jpeg"), false, "normal .jpeg must not be skipped");
});

// ── Test 2: processFile rejects unsupported extension ────────────────────
test("processFile returns without calling fetch on unsupported extension (e.g. .txt)", async (t) => {
  freshTmpRoot();
  t.after(cleanupTmpRoot);

  const txtPath = path.join(CAPTURE_DIR, "notes.txt");
  writeFileSync(txtPath, "hello world");

  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls++;
    return mockResponse({ ok: true, status: 200 });
  }) as unknown as typeof fetch;

  await processFile(txtPath, {
    getApiKeyFn: async () => "test-key",
    fetchFn,
    apiBase: "http://test.local",
    captureDir: CAPTURE_DIR,
  });

  assert.equal(fetchCalls, 0, "fetch must not be called for .txt");
  // File should still exist in root (unhandled, left alone — operator can inspect).
  assert.equal(existsSync(txtPath), true, ".txt file should remain in root");
});

// ── Test 3: processFile happy path → move to processed/<ts>-<workOrderId>.png ──
test("processFile happy path: 200 → file moved to processed/<ts>-<workOrderId>.png", async (t) => {
  freshTmpRoot();
  t.after(cleanupTmpRoot);

  const pngPath = path.join(CAPTURE_DIR, "shot.png");
  // Minimal "fake PNG" content — bytes don't matter, only that the file exists.
  writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  let capturedRequestBody: { imageBase64?: string; mediaType?: string; clientCaptureId?: string } | null = null;
  let capturedAuth = "";
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    capturedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    capturedRequestBody = JSON.parse(String(init?.body ?? "{}"));
    return mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ workOrderId: "CS0000001", duplicate: false }),
    });
  }) as unknown as typeof fetch;

  await processFile(pngPath, {
    getApiKeyFn: async () => "test-key",
    fetchFn,
    apiBase: "http://test.local",
    captureDir: CAPTURE_DIR,
  });

  // File should no longer be in root.
  assert.equal(existsSync(pngPath), false, "source file must be moved out of root on success");

  // Should be in processed/ with <ts>-CS0000001.png shape.
  const processedEntries = readdirSync(PROCESSED_DIR);
  assert.equal(processedEntries.length, 1, "exactly one file should land in processed/");
  const moved = processedEntries[0]!;
  assert.match(moved, /-CS0000001\.png$/, "processed filename must end with -CS0000001.png");

  // Auth header carries the mock key.
  assert.equal(capturedAuth, "Bearer test-key", "Authorization header must be Bearer + Keychain value");

  // Request body shape:
  assert.ok(capturedRequestBody, "fetch should have received a body");
  assert.equal(capturedRequestBody!.mediaType, "image/png", "PNG must POST with mediaType=image/png");
  assert.ok(
    typeof capturedRequestBody!.imageBase64 === "string" && capturedRequestBody!.imageBase64.length > 0,
    "imageBase64 must be a non-empty string",
  );
});

// ── Test 4: processFile HTTP 422 → move to failed/ + .err sidecar ──────
test("processFile HTTP 422 failure: file moved to failed/ with .err sidecar containing 'HTTP 422'", async (t) => {
  freshTmpRoot();
  t.after(cleanupTmpRoot);

  const pngPath = path.join(CAPTURE_DIR, "bad.png");
  writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const fetchFn = (async () =>
    mockResponse({
      ok: false,
      status: 422,
      text: async () => "validation error: no case_number",
    })) as unknown as typeof fetch;

  await processFile(pngPath, {
    getApiKeyFn: async () => "test-key",
    fetchFn,
    apiBase: "http://test.local",
    captureDir: CAPTURE_DIR,
  });

  assert.equal(existsSync(pngPath), false, "source must be moved out of root on HTTP failure");

  const failedEntries = readdirSync(FAILED_DIR);
  // Expect 2 entries: the moved file + the .err sidecar.
  const movedFile = failedEntries.find((n) => n.endsWith(".png") && !n.endsWith(".err"));
  const errSidecar = failedEntries.find((n) => n.endsWith(".err"));
  assert.ok(movedFile, "failed/ must contain the moved .png");
  assert.ok(errSidecar, "failed/ must contain a .err sidecar");

  const sidecarBody = readFileSync(path.join(FAILED_DIR, errSidecar!), "utf8");
  assert.match(sidecarBody, /HTTP 422/, ".err sidecar must contain 'HTTP 422'");
  assert.match(sidecarBody, /validation error/, ".err sidecar must include the response body");
});

// ── Test 5: processFile network error → move to failed/ + sidecar ────────
test("processFile network error: ECONNREFUSED throw → move to failed/ with sidecar containing the message", async (t) => {
  freshTmpRoot();
  t.after(cleanupTmpRoot);

  const pngPath = path.join(CAPTURE_DIR, "neterr.png");
  writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const fetchFn = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  await processFile(pngPath, {
    getApiKeyFn: async () => "test-key",
    fetchFn,
    apiBase: "http://test.local",
    captureDir: CAPTURE_DIR,
  });

  assert.equal(existsSync(pngPath), false, "source must be moved out of root on network error");

  const failedEntries = readdirSync(FAILED_DIR);
  const errSidecar = failedEntries.find((n) => n.endsWith(".err"));
  assert.ok(errSidecar, "failed/ must contain a .err sidecar after network error");

  const sidecarBody = readFileSync(path.join(FAILED_DIR, errSidecar!), "utf8");
  assert.match(sidecarBody, /ECONNREFUSED/, "sidecar must include the thrown error message");
});

// ── Test 6: processFile sets mediaType="image/jpeg" for .jpg ───────────
test("processFile sets mediaType='image/jpeg' for .jpg files", async (t) => {
  freshTmpRoot();
  t.after(cleanupTmpRoot);

  const jpgPath = path.join(CAPTURE_DIR, "photo.jpg");
  writeFileSync(jpgPath, Buffer.from([0xff, 0xd8, 0xff]));

  let capturedMediaType = "";
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    capturedMediaType = body.mediaType;
    return mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ workOrderId: "CS0000002", duplicate: false }),
    });
  }) as unknown as typeof fetch;

  await processFile(jpgPath, {
    getApiKeyFn: async () => "test-key",
    fetchFn,
    apiBase: "http://test.local",
    captureDir: CAPTURE_DIR,
  });

  assert.equal(capturedMediaType, "image/jpeg", ".jpg must map to mediaType=image/jpeg");
});

// ── Test 7: processFile sends a valid UUID v4 clientCaptureId ──────────
test("processFile sends a valid UUID v4 clientCaptureId (matches plan 03 regex)", async (t) => {
  freshTmpRoot();
  t.after(cleanupTmpRoot);

  const pngPath = path.join(CAPTURE_DIR, "uuid.png");
  writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  let capturedUuid = "";
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    capturedUuid = body.clientCaptureId;
    return mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ workOrderId: "CS0000003", duplicate: false }),
    });
  }) as unknown as typeof fetch;

  await processFile(pngPath, {
    getApiKeyFn: async () => "test-key",
    fetchFn,
    apiBase: "http://test.local",
    captureDir: CAPTURE_DIR,
  });

  assert.match(
    capturedUuid,
    UUID_V4_REGEX,
    `clientCaptureId must match server's UUID v4 regex; got "${capturedUuid}"`,
  );
});
