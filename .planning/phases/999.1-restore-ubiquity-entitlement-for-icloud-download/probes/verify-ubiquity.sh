#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../../../../.." && pwd )"

# Probe targets
MONITOR_APP="$HOME/.local/bin/DailyBriefMonitor.app"
MONITOR_LABEL="com.jamesonmorrill.dailybriefmonitor"
MONITOR_LOG="$HOME/Library/Logs/DailyBrief/monitor-stderr.log"
CONTAINER_ID_LITERAL="5H57ADQS8G.iCloud.com.jamesonmorrill.dailybriefmonitor"

MODE="${1:---full}"
FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '[verify-ubiquity] %s\n' "$*"; }

# ---------- UBIQ-01: ubiquity entitlement embedded in .app ----------
check_ubiq_01_entitlement_embedded() {
  info "Check UBIQ-01: ubiquity-container-identifiers entitlement embedded in .app"
  local entitlements
  entitlements="$(codesign -d --entitlements - "$MONITOR_APP" 2>&1 || true)"
  if ! grep -q 'com.apple.developer.ubiquity-container-identifiers' <<< "$entitlements"; then
    red "  FAIL — ubiquity entitlement missing — did install.sh pass the right --entitlements file?"
    FAIL=1
    return
  fi
  if ! grep -q "$CONTAINER_ID_LITERAL" <<< "$entitlements"; then
    red "  FAIL — entitlement present but literal container ID '$CONTAINER_ID_LITERAL' not found — check that the entitlements file uses a literal string, not a \$(TeamIdentifierPrefix) macro"
    FAIL=1
    return
  fi
  green "  PASS — ubiquity entitlement + literal container ID present"
}

# ---------- UBIQ-04: codesign verify ----------
# Capture into a variable (instead of piping to grep -q) so we avoid SIGPIPE:
# `grep -q` exits after first match, breaks the pipe, codesign returns
# non-zero, pipefail flips the whole pipeline to non-zero, and `if !`
# spuriously triggers FAIL even when the signature is valid on disk.
check_ubiq_04_codesign_verify() {
  info "Check UBIQ-04: codesign --verify --verbose"
  local verify_output
  verify_output="$(codesign --verify --verbose "$MONITOR_APP" 2>&1 || true)"
  if ! grep -q 'valid on disk' <<< "$verify_output"; then
    red "  FAIL — signature broken — most likely embedded.provisionprofile missing or added after 'codesign --deep'"
    red "  Raw codesign output: $verify_output"
    FAIL=1
    return
  fi
  green "  PASS — codesign reports valid on disk"
}

# ---------- UBIQ-04b: Gatekeeper accept (advisory) ----------
# Notarization is orthogonal to Phase 999.1 (ubiquity entitlement chain).
# Vigil ships as a LaunchAgent-launched daemon; `spctl -a` only gates Finder/
# Launchpad first-launch, not launchd. Pre-Phase-999.1 builds on `main` ALSO
# fail this probe with the same `rejected: source=Unnotarized Developer ID`
# message. Treat as advisory; do NOT set FAIL=1. If/when Vigil adds a
# notarization step (separate phase), promote this back to blocking.
check_ubiq_04b_spctl_accept() {
  info "Check UBIQ-04b: Gatekeeper spctl -a -vv (advisory)"
  if ! spctl -a -vv "$MONITOR_APP" 2>&1 | grep -q 'accepted'; then
    printf '\033[33m  WARN — Gatekeeper rejected (notarization deferred — see comment above)\033[0m\n'
    return
  fi
  green "  PASS — Gatekeeper accepted"
}

# ---------- UBIQ-05: LaunchAgent running ----------
check_ubiq_05_launchd_state() {
  info "Check UBIQ-05: LaunchAgent state = running"
  if ! launchctl print "gui/$(id -u)/$MONITOR_LABEL" 2>/dev/null | grep -q 'state = running'; then
    red "  FAIL — LaunchAgent not running — run: launchctl print gui/$(id -u)/$MONITOR_LABEL | grep -E '(state|last exit)' and Console.app filter on amfid for -67050 kills"
    FAIL=1
    return
  fi
  green "  PASS — LaunchAgent state = running"
}

# ---------- UBIQ-05b: no amfid kills ----------
check_ubiq_05b_no_amfid_kills() {
  info "Check UBIQ-05b: no amfid kills of $MONITOR_LABEL in last 5m"
  local kills
  kills="$(log show --predicate 'process == "amfid"' --last 5m 2>/dev/null \
           | grep "$MONITOR_LABEL" \
           | grep -E '(Killed|-67050|Invalid Code Signature)' || true)"
  if [[ -n "$kills" ]]; then
    red "amfid killed $MONITOR_LABEL in last 5m:"
    echo "$kills"
    FAIL=1
  else
    green "  PASS — no amfid kills of $MONITOR_LABEL in last 5m"
  fi
}

# ---------- UBIQ-02: startup ubiquity-URL log ----------
check_ubiq_02_startup_log() {
  info "Check UBIQ-02: startup ubiquity-URL logged"
  if ! grep -q "Vigil: ubiquity container = /Users" "$MONITOR_LOG" 2>/dev/null; then
    red "  FAIL — no startup ubiquity-URL log — either the binary hasn't run since the NSLog was added (Plan 03 adds it) or the URL came back nil (UBIQ-02 fail — entitlement not authorized)"
    FAIL=1
    return
  fi
  green "  PASS — ubiquity container URL logged at startup"
}

# ---------- Mode dispatch ----------

run_static() {
  check_ubiq_01_entitlement_embedded
  check_ubiq_04_codesign_verify
  check_ubiq_04b_spctl_accept
}

run_runtime() {
  check_ubiq_05_launchd_state
  check_ubiq_05b_no_amfid_kills
  check_ubiq_02_startup_log
}

case "$MODE" in
  --static)
    run_static
    ;;
  --runtime)
    run_runtime
    ;;
  --full|"")
    run_static
    run_runtime
    ;;
  *)
    echo "usage: $0 [--static|--runtime|--full]" >&2
    exit 2
    ;;
esac

if [[ "$FAIL" -ne 0 ]]; then
  red "verify-ubiquity: FAILED"
  exit 1
fi
green "verify-ubiquity: all checks passed"
exit 0
