#!/usr/bin/env node
// Phase 134 Plan 04 — vigil-agent-bridge installer (ESM, Node 18+).
//
// What this does:
//   1. Read ~/.claude/settings.json (init to {hooks:{}} on ENOENT).
//   2. Refuse to clobber on parse failure — exit 1 BEFORE writing.
//   3. For each of SessionStart, UserPromptSubmit, Stop: splice a matcher
//      group with our hook command. Idempotent — re-running is a no-op.
//      Each spliced entry has `async: true, timeout: 5` per RESEARCH
//      Pitfall 1 (Claude Code v2.1.87+ stdio-inheritance stall mitigation).
//   4. Copy vigil-agent-bridge.sh, redact.sh, redaction-patterns.json
//      from this directory into ~/.claude/hooks/. chmod 755 on *.sh files.
//   5. Atomic write via fs.writeFileSync(tmp) + fs.renameSync(tmp, real).
//      POSIX rename is atomic on same FS (RESEARCH Pitfall 2 mitigation).
//   6. Print one-line confirmation. Stderr only used on parse-failure path.
//
// --uninstall flag:
//   Filter each hooks.<Event> array to drop groups whose hooks[] contains
//   a command matching /vigil-agent-bridge\.sh.*--event=/. Do NOT delete
//   the hooks.<Event> key even if empty (CONTEXT D-N2). Remove the three
//   copied files (try/catch — file-may-be-missing is fine).
//
// Threat mitigations:
//   T-134-I1: atomic write + refuse-to-write on parse failure.
//   T-134-I2: COMMAND_REGEX anchored on `vigil-agent-bridge.sh.*--event=`
//             — only OUR entries match the filter. GSD entries are
//             untouched by both install (splice does not modify existing
//             entries) and uninstall (filter only drops our matches).
//   T-134-A2: async:true + timeout:5 in every spliced entry.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import url from "node:url";

const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
const hookDir = path.join(os.homedir(), ".claude", "hooks");
const hookPath = path.join(hookDir, "vigil-agent-bridge.sh");
const here = path.dirname(url.fileURLToPath(import.meta.url));

const SRC_FILES = [
  "vigil-agent-bridge.sh",
  "redact.sh",
  "redaction-patterns.json",
];
const EVENTS = ["SessionStart", "UserPromptSubmit", "Stop"];
// CR-02 fix: anchor to the EXACT command shape install.js writes (line 127:
// `bash <path>/vigil-agent-bridge.sh --event=<EVENT>`). The previous regex
// was unanchored and would have deleted any third-party hook whose command
// merely contained the substring `vigil-agent-bridge.sh ... --event=` on
// uninstall — a real T-134-I2 risk for operators with custom wrappers.
const COMMAND_REGEX =
  /^bash\s+\S+\/vigil-agent-bridge\.sh\s+--event=(SessionStart|UserPromptSubmit|Stop)\s*$/;

const isUninstall = process.argv.includes("--uninstall");

// ── (1) Read + parse settings.json ───────────────────────────────────────
let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (err) {
  if (err.code === "ENOENT") {
    settings = { hooks: {} };
  } else {
    // T-134-I1 + RESEARCH Pitfall 2: refuse to clobber on parse failure.
    // Exit 1 BEFORE writing anything; operator must hand-fix the file.
    process.stderr.write(`settings.json parse failed: ${err.message}\n`);
    process.exit(1);
  }
}

// (2) Defensive: ensure hooks key exists
settings.hooks ??= {};

// ── Atomic-write helper (RESEARCH Pattern 5 + Pitfall 2) ─────────────────
// CR-03 fix: preserve the original file's mode bits across the write. The
// previous helper let Node's default umask (typically 0644) widen any
// operator-hardened 0600 settings.json on every install/uninstall round-
// trip — silent permission widening on a file that may carry MCP keys or
// other sensitive operator data. We stat the original, chmod the tmp to
// match before rename, and fall back to a RESTRICTIVE 0600 on first-time
// creation (rather than the umask-derived default).
function atomicWriteSettings() {
  const tmp = settingsPath + ".tmp";
  let mode = 0o600;
  try {
    mode = fs.statSync(settingsPath).mode & 0o777;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    // First-time install: settings.json didn't exist; keep the 0o600 default.
  }
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, settingsPath);
}

if (isUninstall) {
  // ── Uninstall path ────────────────────────────────────────────────────
  // Filter each event array to drop our matcher groups. Empty arrays
  // remain (CONTEXT D-N2: do NOT delete the hooks.<Event> key).
  for (const event of EVENTS) {
    if (Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = settings.hooks[event].filter((group) => {
        const groupHooks = Array.isArray(group?.hooks) ? group.hooks : [];
        // Drop the group if ANY of its hooks matches our command regex.
        const hasOurs = groupHooks.some(
          (h) => typeof h?.command === "string" && COMMAND_REGEX.test(h.command)
        );
        return !hasOurs;
      });
    }
  }

  // Remove copied files (file-may-be-missing is fine).
  for (const name of SRC_FILES) {
    try {
      fs.unlinkSync(path.join(hookDir, name));
    } catch {
      /* missing-file is fine on partial-install rollback */
    }
  }

  atomicWriteSettings();
  process.stdout.write("vigil-agent-bridge uninstalled.\n");
  process.exit(0);
}

// ── Install path ─────────────────────────────────────────────────────────
fs.mkdirSync(hookDir, { recursive: true });

for (const event of EVENTS) {
  settings.hooks[event] ??= [];
  // Idempotency check — skip if any group already has our hook for this event.
  const alreadyInstalled = settings.hooks[event].some((group) => {
    const groupHooks = Array.isArray(group?.hooks) ? group.hooks : [];
    return groupHooks.some(
      (h) =>
        typeof h?.command === "string" &&
        COMMAND_REGEX.test(h.command) &&
        h.command.includes(`--event=${event}`)
    );
  });
  if (!alreadyInstalled) {
    settings.hooks[event].push({
      hooks: [
        {
          type: "command",
          command: `bash ${hookPath} --event=${event}`,
          // T-134-A2 / RESEARCH Pitfall 1 — Claude Code v2.1.87+ stdio
          // inheritance stall mitigation. NON-NEGOTIABLE on both fields.
          async: true,
          timeout: 5,
        },
      ],
    });
  }
}

// Copy runtime files; chmod 755 on .sh files.
for (const name of SRC_FILES) {
  const src = path.join(here, name);
  const dest = path.join(hookDir, name);
  fs.copyFileSync(src, dest);
  if (name.endsWith(".sh")) {
    fs.chmodSync(dest, 0o755);
  }
}

atomicWriteSettings();
process.stdout.write(
  "vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.\n"
);
