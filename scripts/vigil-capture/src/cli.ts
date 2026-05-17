#!/usr/bin/env node
// Phase 129.1 Plan 04 Task 4 — vigil-capture CLI
//
// Subcommands: install | uninstall | status | tail
//   install   — idempotent bootout-then-bootstrap; copies plist, mkdirs
//               ~/vigil-captures/{processed,failed} with mode 0700.
//   uninstall — bootout + remove plist; preserves ~/vigil-captures/.
//   status    — `launchctl print gui/<UID>/com.jamesonmorrill.vigilcapture`.
//   tail      — exec `tail -f ~/Library/Logs/vigil-capture.log`.
//
// Operator surface: this script wraps launchctl so the operator doesn't have
// to remember the exact bootstrap syntax. Mirrors the install.sh mental
// model but as a TS binary (`vigil-capture install`).

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Paths ─────────────────────────────────────────────────────────────────

const HOME = homedir();
const LABEL = "com.jamesonmorrill.vigilcapture";
const INSTALLED_PLIST_PATH = path.join(
  HOME,
  "Library",
  "LaunchAgents",
  `${LABEL}.plist`,
);
const CAPTURE_DIR = path.join(HOME, "vigil-captures");
const PROCESSED_DIR = path.join(CAPTURE_DIR, "processed");
const FAILED_DIR = path.join(CAPTURE_DIR, "failed");
const LOG_PATH = path.join(HOME, "Library", "Logs", "vigil-capture.log");

// Resolve repo-relative paths. The compiled CLI lives at
// scripts/vigil-capture/dist/cli.js — go up 3 levels to repo root, then
// into LaunchAgent/.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SOURCE_PLIST_PATH = path.join(
  REPO_ROOT,
  "LaunchAgent",
  `${LABEL}.plist`,
);

// ── Subcommand: install ───────────────────────────────────────────────────

function install(): void {
  console.log(`[install] Installing ${LABEL}…`);

  // Pre-flight: source plist must exist.
  if (!existsSync(SOURCE_PLIST_PATH)) {
    console.error(`[install] FATAL: source plist not found at ${SOURCE_PLIST_PATH}`);
    console.error(`[install] Did you run \`npm run build\` and is the repo layout intact?`);
    process.exit(1);
  }

  // Pre-flight: node must be at /usr/local/bin/node OR /opt/homebrew/bin/node.
  // The plist hard-codes the path; surface a clear error if it's elsewhere.
  const expectedNode = "/usr/local/bin/node";
  if (!existsSync(expectedNode)) {
    console.error(`[install] WARNING: ${expectedNode} not found.`);
    console.error(`[install] The bundled plist invokes node at that absolute path.`);
    console.error(`[install] Run \`which node\` to confirm your install location.`);
    console.error(`[install] If node is at /opt/homebrew/bin/node, you may need to edit`);
    console.error(`[install] LaunchAgent/${LABEL}.plist before re-running this command.`);
    // Non-fatal — continue so the operator can still install if they accept the risk.
  }

  // 1. Create capture directories with mode 0700 (operator-only access).
  console.log(`[install] mkdir -p ${PROCESSED_DIR} (mode 0700)`);
  mkdirSync(PROCESSED_DIR, { recursive: true, mode: 0o700 });
  console.log(`[install] mkdir -p ${FAILED_DIR} (mode 0700)`);
  mkdirSync(FAILED_DIR, { recursive: true, mode: 0o700 });
  // CAPTURE_DIR itself gets mode 0700 too (mkdirSync recursive preserves
  // existing perms, so chmod explicitly).
  try {
    execSync(`chmod 700 "${CAPTURE_DIR}"`, { stdio: "inherit" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[install] WARNING: chmod 700 on ${CAPTURE_DIR} failed: ${msg}`);
  }

  // 2. Read source plist and substitute ${HOME} placeholder if present.
  // The plist ships with hard-coded /Users/jamesonmorrill paths matching the
  // operator's mental model; if a different operator runs this we should
  // substitute. For now we just copy verbatim and warn on mismatch.
  console.log(`[install] cp ${SOURCE_PLIST_PATH} → ${INSTALLED_PLIST_PATH}`);
  const plistContent = readFileSync(SOURCE_PLIST_PATH, "utf8");
  mkdirSync(path.dirname(INSTALLED_PLIST_PATH), { recursive: true });
  writeFileSync(INSTALLED_PLIST_PATH, plistContent, { mode: 0o644 });

  if (!plistContent.includes(HOME) && HOME !== "/Users/jamesonmorrill") {
    console.warn(
      `[install] WARNING: plist contains hard-coded paths that may not match your homedir (${HOME}).`,
    );
    console.warn(
      `[install] If the daemon fails to start, manually edit ${INSTALLED_PLIST_PATH} to use ${HOME}.`,
    );
  }

  // 3. Idempotent bootout — ignore "service not loaded" errors.
  const uid = process.getuid?.() ?? 501;
  console.log(`[install] launchctl bootout gui/${uid} (ignore not-loaded errors)`);
  try {
    execSync(`launchctl bootout gui/${uid} "${INSTALLED_PLIST_PATH}"`, {
      stdio: "pipe",
    });
  } catch {
    // Not-loaded is expected on first install — swallow silently.
  }

  // 4. Bootstrap (load).
  console.log(`[install] launchctl bootstrap gui/${uid} ${INSTALLED_PLIST_PATH}`);
  try {
    execSync(`launchctl bootstrap gui/${uid} "${INSTALLED_PLIST_PATH}"`, {
      stdio: "inherit",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[install] FATAL: bootstrap failed: ${msg}`);
    process.exit(1);
  }

  // 5. Verify loaded.
  console.log(`[install] verify with launchctl print gui/${uid}/${LABEL}`);
  try {
    execSync(`launchctl print gui/${uid}/${LABEL} | head -20`, {
      stdio: "inherit",
    });
  } catch {
    console.warn(
      `[install] WARNING: launchctl print failed — daemon may not have loaded cleanly.`,
    );
  }

  console.log(`[install] Done.`);
  console.log(`[install]   Tail logs:    vigil-capture tail`);
  console.log(`[install]   Check state:  vigil-capture status`);
  console.log(`[install]   Uninstall:    vigil-capture uninstall`);
}

// ── Subcommand: uninstall ─────────────────────────────────────────────────

function uninstall(): void {
  console.log(`[uninstall] Removing ${LABEL}…`);
  const uid = process.getuid?.() ?? 501;

  if (existsSync(INSTALLED_PLIST_PATH)) {
    console.log(`[uninstall] launchctl bootout gui/${uid} ${INSTALLED_PLIST_PATH}`);
    try {
      execSync(`launchctl bootout gui/${uid} "${INSTALLED_PLIST_PATH}"`, {
        stdio: "inherit",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[uninstall] bootout warning (likely not-loaded): ${msg}`);
    }
    console.log(`[uninstall] rm ${INSTALLED_PLIST_PATH}`);
    unlinkSync(INSTALLED_PLIST_PATH);
  } else {
    console.log(`[uninstall] plist not found at ${INSTALLED_PLIST_PATH} — nothing to do.`);
  }

  console.log(`[uninstall] Preserving ${CAPTURE_DIR} (operator may still have data there).`);
  console.log(`[uninstall] Done.`);
}

// ── Subcommand: status ────────────────────────────────────────────────────

function status(): void {
  const uid = process.getuid?.() ?? 501;
  console.log(`[status] launchctl print gui/${uid}/${LABEL}`);
  try {
    execSync(`launchctl print gui/${uid}/${LABEL} | head -20`, {
      stdio: "inherit",
    });
  } catch {
    console.log(`[status] Daemon NOT loaded (or print failed).`);
    console.log(`[status] Run: vigil-capture install`);
    process.exit(1);
  }
}

// ── Subcommand: tail ──────────────────────────────────────────────────────

function tail(): void {
  console.log(`[tail] Streaming ${LOG_PATH} (Ctrl+C to exit)…`);
  // Exec replaces this process — tail -f will receive SIGINT directly.
  const result = spawnSync("tail", ["-f", LOG_PATH], { stdio: "inherit" });
  if (result.error) {
    console.error(`[tail] FATAL: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

// ── Dispatcher ────────────────────────────────────────────────────────────

function usage(): void {
  console.error(`Usage: vigil-capture <subcommand>`);
  console.error(`  install     — load LaunchAgent (idempotent)`);
  console.error(`  uninstall   — bootout + remove plist (preserves ~/vigil-captures/)`);
  console.error(`  status      — launchctl print state`);
  console.error(`  tail        — tail -f ~/Library/Logs/vigil-capture.log`);
}

const subcommand = process.argv[2];

switch (subcommand) {
  case "install":
    install();
    break;
  case "uninstall":
    uninstall();
    break;
  case "status":
    status();
    break;
  case "tail":
    tail();
    break;
  default:
    usage();
    process.exit(subcommand ? 1 : 0);
}
