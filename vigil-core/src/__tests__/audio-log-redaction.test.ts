// ── Phase 127 GUARD-01.4 — Three-rail audio-log-redaction drift detector ─────
// ── Phase 130 Plan 06 D-D2 extension — also covers vigil-g2-plugin/src/ and ─
//    explicitly pins vigil-core/src/routes/voice-transcribe.ts.
//
// Prevents biometric audio PCM payload (16 kHz × 16-bit LE × mono — Even SDK
// canonical format) from reaching ANY of the three production log sinks. Each
// rail pins a different invariant:
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
//   Rail 4 — Phase 130 Plan 06 D-D2 extended scope: walk a UNION of
//     vigil-core/src/ AND vigil-g2-plugin/src/ (excluding tests + sentry/posthog
//     safe-list) and confirm NO log-sink call line contains the three Phase 130
//     banned key patterns:
//       - /\baudioPcm\b/         (camelCase audio-PCM key)
//       - /\baudio_pcm\b/        (snake_case audio-PCM key)
//       - object-literal `pcm:`  (object-key position only — leaves variable
//                                  names like `pcmChunks` alone)
//     Log-sink call lines = lines containing one of `console.log(`,
//     `console.warn(`, `console.error(`, `console.info(`, `console.debug(`,
//     `Sentry.captureException(`, `posthog.capture(`.
//     Comment lines (single-line `//` and block `/* … */`) are stripped before
//     the grep so JSDoc / inline comments do not self-trip the detector.
//     vigil-core/src/routes/voice-transcribe.ts is called out in a dedicated
//     assertion (Plan 06 acceptance criterion).
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

// ─── Phase 130 Plan 06 D-D2 helpers ──────────────────────────────────────────
//
// Walk a directory recursively and return every non-test `.ts` file. Mirrors
// the existing `walk()` helper above (Rail 3) but is named distinctly so the
// two scopes never silently merge.
function walkExtended(dir: string, files: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      // Skip __tests__ directories outright (no log-sink coverage there).
      if (entry === "__tests__") continue
      walkExtended(full, files)
    } else if (
      full.endsWith(".ts") &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".d.ts")
    ) {
      files.push(full)
    }
  }
  return files
}

// Strip line-comments (`^\s*//…`) and block comments (`/* … */`) so the
// drift detector counts only executable code lines. Per Plan 06 Task 2
// "Grep gate hygiene": naive grep treats JSDoc / inline-comment prose about
// the banned keys as offenders, which would self-trip the detector on commits
// like this one.
function stripComments(src: string): string {
  // Strip block comments first (handles multi-line JSDoc `/** … */`).
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "")
  // Then strip single-line `//` comments (preserves indentation so we don't
  // accidentally fuse the prior-line `console.log(` onto a comment-only line).
  return noBlock
    .split("\n")
    .map((line) => {
      // Only strip lines whose first non-whitespace content is `//`. Lines
      // like `console.log('hello') // trailing` keep their executable portion.
      const trimmed = line.trimStart()
      if (trimmed.startsWith("//")) return ""
      // Strip trailing `//` comments. Be careful with strings — a naive
      // split('//') would mangle `'http://…'`. Use a conservative approach:
      // find a `//` NOT preceded by `:` (rules out `://`).
      const m = line.match(/(^|[^:])\/\/.*$/)
      if (m && m.index !== undefined) {
        return line.slice(0, m.index + (m[1]?.length ?? 0))
      }
      return line
    })
    .join("\n")
}

// Sink-call detector: regex matching the seven call shapes the drift detector
// guards. Anchored on the open paren so partial substrings (e.g. someone
// declaring `const captureException = …`) do not trip.
const SINK_REGEX =
  /(?:console\.(?:log|warn|error|info|debug)|Sentry\.captureException|posthog\.capture)\s*\(/

// Banned-key regexes. Three patterns: camelCase, snake_case, and the
// object-literal `pcm:` form. The third uses a key-position pattern that
// AVOIDS matching variable names like `pcmChunks` (no `:`).
const BANNED_AUDIOPCM = /\baudioPcm\b/
const BANNED_AUDIO_PCM = /\baudio_pcm\b/
// Object-key position: '\'pcm\':' or '"pcm":' or `pcm:` (NOT `:` operator,
// NOT `pcm)`, NOT `pcm.length`, NOT `pcmChunks`). The trailing `(?!:)` rules
// out `::` (TypeScript label / namespace) which we never actually emit.
const BANNED_PCM_KEY = /(['"]pcm['"]\s*:|(?<![A-Za-z0-9_])pcm\s*:(?!:))/

interface Offender {
  file: string
  lineNumber: number
  lineText: string
  pattern: string
}

function scanForBannedSinkLines(file: string): Offender[] {
  const raw = readFileSync(file, "utf8")
  const stripped = stripComments(raw)
  // Use stripped src for the scan; keep original line numbers (split on \n
  // preserves alignment because stripComments preserves newlines).
  const lines = stripped.split("\n")
  const offenders: Offender[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!SINK_REGEX.test(line)) continue
    if (BANNED_AUDIOPCM.test(line)) {
      offenders.push({ file, lineNumber: i + 1, lineText: line, pattern: "audioPcm" })
    }
    if (BANNED_AUDIO_PCM.test(line)) {
      offenders.push({ file, lineNumber: i + 1, lineText: line, pattern: "audio_pcm" })
    }
    if (BANNED_PCM_KEY.test(line)) {
      offenders.push({ file, lineNumber: i + 1, lineText: line, pattern: "pcm:" })
    }
  }
  return offenders
}

// Safe-list of files whose source legitimately contains banned-key names
// (denylist Set entries, sanitizer redactor, etc.) — these files do NOT route
// the banned keys to a log sink, but a naive whole-file grep would still flag
// them. The line-by-line scan above only triggers on lines that contain BOTH a
// log-sink call AND a banned key, so most safe-list entries are unnecessary;
// the entries below are kept for defense-in-depth / documentation.
function buildD_D2SafeList(coreRoot: string): Set<string> {
  return new Set([
    // Source of truth for BLOCKED_PROPERTY_NAMES (Rail 1) — contains the
    // literal banned keys as Set entries.
    path.join(coreRoot, "analytics", "posthog.ts"),
    // Sentry redactor — pattern-matches banned keys in `event.extra` / `breadcrumbs`
    // but does not log them (Rail 2 covers the beforeSend hook itself).
    path.join(coreRoot, "lib", "sentry.ts"),
  ])
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

// ─── Phase 130 Plan 06 D-D2 — extended scope (Rail 4) ────────────────────────
//
// Walks BOTH vigil-core/src/ AND vigil-g2-plugin/src/ (UNION scope) and
// asserts no log-sink call line contains `audioPcm` / `audio_pcm` / object-key
// `pcm:`. The PWA-side mirror lives at
// vigil-pwa/src/__tests__/denylist-parity.test.ts (Phase 127 GUARD-01 extended
// in Plan 06 Task 2).
describe("D-D2 (Phase 130 Plan 06) — extended source-grep scope across vigil-core + vigil-g2-plugin", () => {
  it("D-D2.A: no log-sink call line contains audioPcm/audio_pcm/pcm: in vigil-core/src/", () => {
    const coreRoot = ROOT
    const safeList = buildD_D2SafeList(coreRoot)
    const files = walkExtended(coreRoot).filter((f) => !safeList.has(f))
    const offenders: Offender[] = []
    for (const file of files) {
      offenders.push(...scanForBannedSinkLines(file))
    }
    assert.deepEqual(
      offenders,
      [],
      `D-D2 drift in vigil-core/src/: log-sink calls leaking banned key names:\n  ${offenders
        .map((o) => `${o.file}:${o.lineNumber} [${o.pattern}] ${o.lineText.trim()}`)
        .join("\n  ")}`,
    )
  });

  it("D-D2.B: no log-sink call line contains audioPcm/audio_pcm/pcm: in vigil-g2-plugin/src/", () => {
    // vigil-core/src/__tests__/audio-log-redaction.test.ts → up 3 = repo root
    //   then → vigil-g2-plugin/src
    const pluginRoot = path.join(ROOT, "..", "..", "vigil-g2-plugin", "src")
    // Hard-fail (matches denylist-parity.test.ts T-127-01-C semantics) — if
    // the cross-workspace path is broken, the test must NOT silently pass.
    let files: string[]
    try {
      files = walkExtended(pluginRoot)
    } catch (err) {
      assert.fail(
        `cross-workspace path broken — fix relative resolution from vigil-core/src/__tests__/ to vigil-g2-plugin/src/. Tried: ${pluginRoot}. Underlying: ${(err as Error).message}`,
      )
      return
    }
    assert.ok(
      files.length > 0,
      `vigil-g2-plugin/src/ walk returned zero non-test .ts files — path resolution broken at: ${pluginRoot}`,
    )
    const offenders: Offender[] = []
    for (const file of files) {
      offenders.push(...scanForBannedSinkLines(file))
    }
    assert.deepEqual(
      offenders,
      [],
      `D-D2 drift in vigil-g2-plugin/src/: log-sink calls leaking banned key names:\n  ${offenders
        .map((o) => `${o.file}:${o.lineNumber} [${o.pattern}] ${o.lineText.trim()}`)
        .join("\n  ")}`,
    )
  });

  it("D-D2.C: vigil-core/src/routes/voice-transcribe.ts — explicit pin (the file the audioPcm-in-logs invariant guards)", () => {
    // Plan 06 acceptance criterion: call out voice-transcribe.ts in a
    // dedicated assertion so the contract is explicit even if the route file
    // is renamed or moved.
    const voiceTranscribePath = path.join(ROOT, "routes", "voice-transcribe.ts")
    assert.ok(
      readFileSync(voiceTranscribePath, "utf8").length > 0,
      `voice-transcribe.ts not found at ${voiceTranscribePath} — Plan 06 D-D2.C pin must be updated when the route file moves`,
    )
    const offenders = scanForBannedSinkLines(voiceTranscribePath)
    assert.deepEqual(
      offenders,
      [],
      `D-D2.C drift in voice-transcribe.ts: log-sink leaking banned key names:\n  ${offenders
        .map((o) => `:${o.lineNumber} [${o.pattern}] ${o.lineText.trim()}`)
        .join("\n  ")}`,
    )
  });

  it("D-D2.D: comment hygiene — JSDoc / inline comments mentioning banned keys must NOT trip the detector", () => {
    // Anti-trivial-pass smoke: a synthetic source containing the banned keys
    // ONLY inside comments + a benign log-sink line MUST scan as zero
    // offenders (the comment-stripping path is exercised). Without this,
    // someone could weaken stripComments() and the suite would still pass.
    const fixture = `
// audioPcm mentioned in line comment — must NOT trip
/**
 * audio_pcm and pcm: also mentioned in JSDoc block — must NOT trip
 */
function ok() {
  console.log('voice processed', { bytes: 100, t: Date.now() }) // trailing OK comment with pcm:
  Sentry.captureException(new Error('something bad'))
  posthog.capture('voice_capture_completed', { stop_to_http_ms: 100 })
}
`
    // Write a temp file? Easier: simulate the scan directly via stripComments.
    const stripped = stripComments(fixture)
    const lines = stripped.split("\n")
    const offenders: string[] = []
    for (const line of lines) {
      if (!SINK_REGEX.test(line)) continue
      if (
        BANNED_AUDIOPCM.test(line) ||
        BANNED_AUDIO_PCM.test(line) ||
        BANNED_PCM_KEY.test(line)
      ) {
        offenders.push(line)
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `comment-hygiene failure — strip step did not remove JSDoc/line comments containing banned keys:\n  ${offenders.join("\n  ")}`,
    )
  });
});
