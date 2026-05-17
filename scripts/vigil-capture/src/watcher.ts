// Phase 129.1 Plan 04 Task 3 — watcher.ts (TDD GREEN phase)
//
// Long-running macOS daemon that watches ~/vigil-captures/ via chokidar,
// base64-encodes new PNG/JPG screenshots, POSTs to vigil-core's
// /v1/captures/screenshot endpoint (built in plan 129.1-03), and atomically
// moves the file to:
//   processed/<ts>-<workOrderId>.<ext>  on 2xx
//   failed/<ts>-<filename>              + a .err sidecar on non-2xx / throw
//
// Load-bearing invariants (RESEARCH §539-695 + PATTERNS LANDMINES):
// 1. chokidar `awaitWriteFinish` is REQUIRED — without it the watcher reads
//    partial-write data from macOS Cmd+Shift+4's temp-then-rename flow.
// 2. `ignoreInitial: true` + a one-shot orphan scan covers the crash-recovery
//    case (RESEARCH §694 — files left in root from a previous-run crash).
// 3. `depth: 0` keeps chokidar from recursing into processed/ or failed/.
// 4. Sequential `await processFile(...)` — single-operator volume (≤50/day)
//    doesn't need a queue; sequential gives natural backpressure.
// 5. Dotfile / .tmp. / .download / .icloud skip is explicit and unit-testable
//    via SKIP_PATTERNS + shouldSkip — see watcher.test.ts.
// 6. API key sourced from macOS Keychain via `security find-generic-password`
//    — NEVER from env or plist. T-129.1-16 mitigation.
// 7. processFile + getApiKey are exported (and accept a DI deps argument)
//    so the test file can mock fetch / keychain / paths cleanly.

import chokidar from "chokidar";
import { readFile, rename, mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";

// ── Constants ─────────────────────────────────────────────────────────────

const API_BASE_DEFAULT = "https://api.vigilhub.io";
const CAPTURE_DIR_DEFAULT =
  process.env.VIGIL_CAPTURE_DIR ?? `${process.env.HOME ?? ""}/vigil-captures`;

const API_BASE = process.env.VIGIL_API_BASE ?? API_BASE_DEFAULT;
const CAPTURE_DIR = process.env.VIGIL_CAPTURE_DIR ?? CAPTURE_DIR_DEFAULT;

// ── Skip filters (explicit + unit-testable per PATTERNS LANDMINE) ─────────

export const SKIP_PATTERNS: Array<(name: string) => boolean> = [
  (n) => n.startsWith("."),
  (n) => n.includes(".tmp."),
  (n) => n.endsWith(".download"),
  (n) => n.endsWith(".icloud"),
];

export function shouldSkip(filename: string): boolean {
  return SKIP_PATTERNS.some((p) => p(filename));
}

// ── Keychain ──────────────────────────────────────────────────────────────

/**
 * Read the Vigil API key from macOS Keychain.
 *
 * Operator setup (one-time):
 *   security add-generic-password -s vigil-api-key -a $USER -w <api-key> -U
 *
 * The daemon reads per-call (no caching) so key rotation takes effect on the
 * very next file event without restarting the LaunchAgent.
 */
export async function getApiKey(): Promise<string> {
  // execSync because the `security` binary is fast and synchronous; this only
  // runs once per file event so blocking the event loop briefly is fine.
  const out = execSync("security find-generic-password -s vigil-api-key -w", {
    encoding: "utf8",
  });
  return out.trim();
}

// ── processFile (the core handler) ────────────────────────────────────────

export interface ProcessFileDeps {
  /** Override the Keychain read (test seam). */
  getApiKeyFn?: () => Promise<string>;
  /** Override fetch (test seam). */
  fetchFn?: typeof fetch;
  /** Override the API base URL (test seam). */
  apiBase?: string;
  /** Override the watched directory (test seam — for tmpdir isolation). */
  captureDir?: string;
}

interface ScreenshotResponse {
  workOrderId?: string;
  duplicate?: boolean;
  // extractedFields + extraExtractedFields exist but we don't read them.
}

/**
 * Process a single file in CAPTURE_DIR:
 *
 *   1. Skip dotfiles + .tmp. + .download + .icloud (see SKIP_PATTERNS).
 *   2. Accept only .png / .jpg / .jpeg (case-insensitive).
 *   3. Base64-encode, generate clientCaptureId (UUID v4), POST to
 *      /v1/captures/screenshot with Bearer auth from Keychain.
 *   4. On 2xx: move to processed/<ts>-<workOrderId>.<ext>, log [OK].
 *   5. On non-2xx: move to failed/<ts>-<filename>, write .err sidecar
 *      with "HTTP <status>\n<body>\n", log [FAIL].
 *   6. On thrown error: move to failed/<ts>-<filename>, write .err sidecar
 *      with the error message, log [ERR].
 */
export async function processFile(
  filePath: string,
  deps: ProcessFileDeps = {},
): Promise<void> {
  const filename = path.basename(filePath);

  // Skip junk (dotfiles, in-flight macOS screenshots, iCloud stubs).
  if (shouldSkip(filename)) return;

  const ext = path.extname(filename).toLowerCase();
  const mediaType: "image/png" | "image/jpeg" | null =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : null;
  if (!mediaType) return; // unsupported extension → leave file alone.

  const captureDir = deps.captureDir ?? CAPTURE_DIR;
  const apiBase = deps.apiBase ?? API_BASE;
  const getApiKeyFn = deps.getApiKeyFn ?? getApiKey;
  const fetchFn = deps.fetchFn ?? fetch;

  const processedDir = path.join(captureDir, "processed");
  const failedDir = path.join(captureDir, "failed");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  try {
    // 1. Read + base64-encode.
    const raw = await readFile(filePath);
    const imageBase64 = raw.toString("base64");

    // 2. Generate dedup id (UUID v4 — matches server-side regex in plan 03).
    const clientCaptureId = randomUUID();

    // 3. Auth from Keychain.
    const apiKey = await getApiKeyFn();

    // 4. POST.
    const url = `${apiBase}/v1/captures/screenshot`;
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64, mediaType, clientCaptureId }),
      });
    } catch (err) {
      // Network throw / DNS / connection refused / abort — move to failed/.
      await mkdir(failedDir, { recursive: true });
      const failedPath = path.join(failedDir, `${ts}-${filename}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      await rename(filePath, failedPath);
      await writeFile(`${failedPath}.err`, `NETWORK ERROR\n${errMsg}\n`, "utf8");
      console.error(`[ERR] ${filename}: ${errMsg}`);
      return;
    }

    if (!res.ok) {
      // HTTP non-2xx → move to failed/ with .err sidecar.
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "<unable to read response body>";
      }
      await mkdir(failedDir, { recursive: true });
      const failedPath = path.join(failedDir, `${ts}-${filename}`);
      await rename(filePath, failedPath);
      await writeFile(
        `${failedPath}.err`,
        `HTTP ${res.status}\n${bodyText}\n`,
        "utf8",
      );
      console.error(`[FAIL] ${filename} → HTTP ${res.status}`);
      return;
    }

    // 5. Happy path — parse response + atomic move to processed/.
    let json: ScreenshotResponse;
    try {
      json = (await res.json()) as ScreenshotResponse;
    } catch {
      // 2xx but unparseable body — still treat as failure (operator must
      // investigate; the response shape is part of the contract).
      await mkdir(failedDir, { recursive: true });
      const failedPath = path.join(failedDir, `${ts}-${filename}`);
      await rename(filePath, failedPath);
      await writeFile(
        `${failedPath}.err`,
        `HTTP ${res.status}\n<unparseable JSON response>\n`,
        "utf8",
      );
      console.error(`[FAIL] ${filename} → 2xx with unparseable body`);
      return;
    }

    const workOrderId = json.workOrderId ?? "UNKNOWN";
    await mkdir(processedDir, { recursive: true });
    const processedPath = path.join(processedDir, `${ts}-${workOrderId}${ext}`);
    await rename(filePath, processedPath);
    const dupTag = json.duplicate ? " (duplicate)" : "";
    console.log(`[OK] ${filename} → ${workOrderId}${dupTag}`);
  } catch (err) {
    // Catch-all (fs read failure, keychain throw, mkdir denial, etc.). Try
    // best-effort to move to failed/; if that fails too, log and let the
    // file sit (operator can inspect).
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      await mkdir(failedDir, { recursive: true });
      const failedPath = path.join(failedDir, `${ts}-${filename}`);
      await rename(filePath, failedPath);
      await writeFile(`${failedPath}.err`, `ERROR\n${errMsg}\n`, "utf8");
    } catch (moveErr) {
      const moveMsg =
        moveErr instanceof Error ? moveErr.message : String(moveErr);
      console.error(
        `[ERR] ${filename}: original=${errMsg}; failed to move: ${moveMsg}`,
      );
      return;
    }
    console.error(`[ERR] ${filename}: ${errMsg}`);
  }
}

// ── Orphan scan (RESEARCH §694) ───────────────────────────────────────────

/**
 * One-shot scan at startup. Picks up any leftover PNG/JPG in CAPTURE_DIR
 * root that a previous-run crash failed to process. Files in processed/
 * and failed/ are NOT touched (depth=0 + we read root only).
 */
export async function scanOrphans(captureDir: string = CAPTURE_DIR): Promise<void> {
  try {
    const entries = await readdir(captureDir);
    for (const name of entries) {
      const full = path.join(captureDir, name);
      try {
        const st = await stat(full);
        if (st.isFile() && /\.(png|jpe?g)$/i.test(name)) {
          await processFile(full);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[orphan-scan] skip ${name}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[orphan-scan] failed: ${msg}`);
  }
}

// ── Main entry-point (only runs when invoked directly) ───────────────────

// Compare import.meta.url against process.argv[1] so this module can be
// imported by tests without spawning the chokidar watcher.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  // tsx wraps the entry point — also detect by suffix match for src/watcher.ts
  process.argv[1]?.endsWith("watcher.ts") === true ||
  process.argv[1]?.endsWith("watcher.js") === true;

if (invokedDirectly) {
  (async () => {
    console.log(`[vigil-capture] starting; CAPTURE_DIR=${CAPTURE_DIR} API_BASE=${API_BASE}`);
    // 1. Orphan scan first (sequential — pick up crash leftovers).
    await scanOrphans(CAPTURE_DIR);

    // 2. Long-running chokidar watcher.
    const watcher = chokidar.watch(CAPTURE_DIR, {
      ignored: /(^|[\/\\])\../, // dotfile regex (matches macOS junk)
      persistent: true,
      ignoreInitial: true, // crash leftovers handled by scanOrphans above
      depth: 0, // don't recurse into processed/ or failed/
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    // Sequential processing — single-operator volume (≤50/day) doesn't need
    // a queue; sequential gives natural backpressure.
    watcher.on("add", async (filePath) => {
      try {
        await processFile(filePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[chokidar-add] uncaught ${filePath}: ${msg}`);
      }
    });

    watcher.on("ready", () => {
      console.log(`[vigil-capture] watching ${CAPTURE_DIR}`);
    });

    watcher.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[chokidar-error] ${msg}`);
    });
  })().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vigil-capture] fatal: ${msg}`);
    process.exit(1);
  });
}
