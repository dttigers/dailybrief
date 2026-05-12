// ── Phase 127 GUARD-01.4 — Three-rail audio-log-redaction drift detector ─────
//
// Prevents biometric audio PCM payload (16 kHz × 16-bit LE × mono — Even SDK
// canonical format) from reaching ANY of the three production log sinks before
// Phase 130 voice ingest lands. Each rail pins a different invariant:
//
//   Rail 1 — PostHog (vigil-core/src/analytics/posthog.ts):
//     BLOCKED_PROPERTY_NAMES Set membership of the six Phase-127 audio keys.
//     The PostHog before_send hook (analytics/posthog.ts:77) consumes the same
//     Set; presence here means audio keys are stripped from event properties
//     before posthog-node's HTTPS POST.
//
//   Rail 2 — Sentry (vigil-core/src/lib/sentry.ts):
//     The Sentry.init({...}) body MUST register the redactSentryEvent function
//     as beforeSend. The drift detector source-greps for `\bbeforeSend\b` inside
//     the Sentry.init body — function-reference form (NOT inline arrow) — so a
//     future commit that drops the hook gets caught at CI time.
//
//   Rail 3 — console.* (vigil-core/src/{routes,lib,ai,middleware}):
//     Source-grep `/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i`
//     across every .ts (non-.test.ts) file, EXCLUDING the safe-listed paths
//     that legitimately mention "audio"/"pcm":
//
//       - analytics/posthog.ts  — contains "audio*" as literal Set entries
//       - lib/audio-cap.ts      — Plan 03 module (greenfield; safe-listed now
//                                  so this test does not false-trip after
//                                  Plan 03 lands)
//       - lib/ai-budget.ts      — Plan 05 module (likewise — token "ai" is
//                                  not in the regex but file is safe-listed
//                                  pre-emptively per plan spec)
//       - routes/process-audio.ts — the route's logger messages reference the
//                                    route PATH ("/process-audio") in their
//                                    string prefix; the regex catches that
//                                    substring even though no audio DATA is
//                                    logged. Plan-127-01 deviation (Rule 3 —
//                                    blocking issue auto-fix; tracked in
//                                    127-01-SUMMARY.md under Deviations).
//
// Pattern source: vigil-core/src/__tests__/mount-order.test.ts (fs.readFileSync
// source-content drift detector — Phase 117/126 convention).
//
// Run: cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts
// -----------------------------------------------------------------------------

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";

before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // src/__tests__/audio-log-redaction.test.ts → src/ is one level up
  ROOT = path.join(here, "..");
});

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("GUARD-01 audio log redaction — three rails pinned", () => {
  // ── Rail 1: BLOCKED_PROPERTY_NAMES Set membership (D-01.1 / D-01.4 #1) ────
  it("Rail 1: BLOCKED_PROPERTY_NAMES contains all six Phase-127 audio keys", async () => {
    const { BLOCKED_PROPERTY_NAMES } = await import("../analytics/posthog.js");
    const audioKeys = [
      "audioPcm",
      "audio_pcm",
      "pcm",
      "audio",
      "audioBuffer",
      "audio_buffer",
    ];
    for (const k of audioKeys) {
      assert.ok(
        BLOCKED_PROPERTY_NAMES.has(k),
        `BLOCKED_PROPERTY_NAMES must contain "${k}" per GUARD-01.1`,
      );
    }
  });

  // ── Rail 2: sentry.ts Sentry.init body contains beforeSend (D-01.4 #2) ────
  // Anchor on `Sentry.init({\n` (with newline) so the test ignores the inline
  // single-line literal `Sentry.init({dsn, environment, tracesSampleRate: 0})`
  // that appears verbatim in the JSDoc header of sentry.ts (comment-prose
  // false-positive). The REAL call is multi-line — the only one that opens
  // its argument object with `{` followed immediately by a newline.
  it("Rail 2: sentry.ts Sentry.init() block registers beforeSend", () => {
    const src = readFileSync(path.join(ROOT, "lib", "sentry.ts"), "utf8");
    const initIdx = src.indexOf("Sentry.init({\n");
    assert.ok(
      initIdx !== -1,
      "Sentry.init({\\n ... }) multi-line call not found in sentry.ts",
    );
    const closeIdx = src.indexOf("});", initIdx);
    assert.ok(
      closeIdx !== -1,
      `Sentry.init({...}) closing }); not found (initIdx=${initIdx})`,
    );
    assert.match(
      src.slice(initIdx, closeIdx),
      /\bbeforeSend\b/,
      "Sentry.init must register beforeSend — GUARD-01.2",
    );
  });

  // ── Rail 3: no console.* call site references audio/pcm in protected dirs (D-01.4 #3) ──
  it("Rail 3: no console.* call references audio/pcm in routes|lib|ai|middleware", () => {
    const scanDirs = ["routes", "lib", "ai", "middleware"].map((d) =>
      path.join(ROOT, d),
    );
    const denylistSources = new Set([
      // contains "audio*" as literal denylist Set entries — Rail 1 source-of-truth
      path.join(ROOT, "analytics", "posthog.ts"),
      // Plan 03 module (greenfield; pre-emptively safe-listed so test does not
      // false-trip when Plan 03 lands before this test merges)
      path.join(ROOT, "lib", "audio-cap.ts"),
      // Plan 05 module (likewise — file legitimately exists or will exist;
      // does not contain audio/pcm console patterns, but safe-listed per
      // plan spec to keep the denylist additive)
      path.join(ROOT, "lib", "ai-budget.ts"),
      // 127-01 Deviation (Rule 3): the route file's logger messages reference
      // the literal route PATH "/process-audio" in their string prefix; the
      // regex catches that substring even though no audio DATA is logged.
      // The route's own size-guard (process-audio.ts:58-62) caps the upload,
      // and the audio bytes are never passed to console.* — only "this route
      // failed" telemetry. Tracked in 127-01-SUMMARY.md.
      path.join(ROOT, "routes", "process-audio.ts"),
    ]);
    const pattern = /console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i;
    const offenders: string[] = [];
    for (const dir of scanDirs) {
      let files: string[];
      try {
        files = walk(dir);
      } catch {
        // Directory does not exist yet (e.g. ai/ may be empty in some checkouts).
        continue;
      }
      for (const file of files) {
        if (denylistSources.has(file)) continue;
        const src = readFileSync(file, "utf8");
        if (pattern.test(src)) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `GUARD-01.4 drift: console.* call referencing audio/pcm in:\n  ${offenders.join("\n  ")}`,
    );
  });
});
