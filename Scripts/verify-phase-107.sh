#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
EXT_DIR="$REPO_ROOT/vigil-safari-extension/Vigil Capture"
PBXPROJ="$REPO_ROOT/vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj"
XCODEPROJ="$REPO_ROOT/vigil-safari-extension/Vigil Capture.xcodeproj"

MODE="${1:---static}"
FAIL=0

# ANSI color helpers (optional — skip if wanting pure plain output)
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '[verify-107] %s\n' "$*"; }

check_lsuielement() {
  info "Check 1: LSUIElement=true in container Info.plist"
  if plutil -extract LSUIElement raw "$EXT_DIR/Info.plist" 2>/dev/null | grep -q '^true$'; then
    green "  PASS — LSUIElement is true"
  else
    red "  FAIL — LSUIElement is missing or not true in $EXT_DIR/Info.plist"
    FAIL=1
  fi
}

check_deployment_target() {
  info "Check 2: Container target effective MACOSX_DEPLOYMENT_TARGET >= 13.0"
  # Project-level setting (inherited by container) is authoritative.
  if grep -E 'MACOSX_DEPLOYMENT_TARGET = 1[3-9]' "$PBXPROJ" > /dev/null; then
    green "  PASS — found MACOSX_DEPLOYMENT_TARGET >= 13 in project.pbxproj"
  else
    red "  FAIL — no MACOSX_DEPLOYMENT_TARGET >= 13 found in $PBXPROJ"
    FAIL=1
  fi
}

check_appdelegate_register() {
  info "Check 3: AppDelegate.swift has SMAppService.mainApp.register() with status-guard"
  local appdelegate="$EXT_DIR/AppDelegate.swift"
  if grep -q 'SMAppService.mainApp.register()' "$appdelegate" \
     && grep -q 'SMAppService.mainApp.status' "$appdelegate"; then
    green "  PASS — register() and .status both present"
  else
    red "  FAIL — missing register() or status guard in $appdelegate"
    FAIL=1
  fi
}

check_first_launch_alert() {
  info "Check 4: AppDelegate.swift has first-launch NSAlert guarded by UserDefaults flag"
  local appdelegate="$EXT_DIR/AppDelegate.swift"
  if grep -qE 'firstLaunch[A-Za-z]*Alert' "$appdelegate" \
     && grep -q 'NSAlert' "$appdelegate" \
     && grep -q 'UserDefaults' "$appdelegate"; then
    green "  PASS — first-launch NSAlert pattern present"
  else
    red "  FAIL — first-launch NSAlert pattern missing in $appdelegate"
    FAIL=1
  fi
}

check_window_suppression() {
  info "Check 4b: AppDelegate + ViewController have gated window-suppression (gap_107_1)"
  local appdelegate="$EXT_DIR/AppDelegate.swift"
  local viewcontroller="$EXT_DIR/ViewController.swift"
  local ok=1

  # AppDelegate: suppress call + reveal gate + inbound hook + uptime heuristic.
  grep -q 'NSApp.windows.forEach' "$appdelegate" || { red "    MISSING: NSApp.windows.forEach in AppDelegate"; ok=0; }
  grep -q 'var shouldRevealWindow' "$appdelegate" || { red "    MISSING: shouldRevealWindow flag in AppDelegate"; ok=0; }
  grep -q 'func application(_ application: NSApplication, open urls:' "$appdelegate" || { red "    MISSING: application(_:open:) hook in AppDelegate"; ok=0; }
  grep -q 'ProcessInfo.processInfo.systemUptime' "$appdelegate" || { red "    MISSING: systemUptime heuristic in AppDelegate"; ok=0; }
  grep -qE 'uptime\s*>=?\s*120' "$appdelegate" || { red "    MISSING: 120s uptime threshold in AppDelegate"; ok=0; }

  # ViewController: gated re-show — makeKeyAndOrderFront MUST be reachable only via shouldRevealWindow.
  grep -q 'shouldRevealWindow' "$viewcontroller" || { red "    MISSING: shouldRevealWindow read in ViewController"; ok=0; }
  grep -q 'makeKeyAndOrderFront(nil)' "$viewcontroller" || { red "    MISSING: makeKeyAndOrderFront call in ViewController"; ok=0; }

  # Regression guard: the makeKeyAndOrderFront call MUST be gated. The line immediately
  # BEFORE makeKeyAndOrderFront should contain shouldRevealWindow (the if-let delegate guard).
  if ! grep -B1 'makeKeyAndOrderFront(nil)' "$viewcontroller" | grep -q 'shouldRevealWindow'; then
    red "    REGRESSION: makeKeyAndOrderFront is not gated by shouldRevealWindow"
    red "                (unconditional re-show violates D-01 on Login Item boot launches)"
    ok=0
  fi

  if [[ "$ok" -eq 1 ]]; then
    green "  PASS — gated window-suppression present (orderOut + gated reveal)"
  else
    red "  FAIL — gap_107_1 regression (see MISSING/REGRESSION lines above)"
    FAIL=1
  fi
}

check_xcodebuild() {
  info "Check 5: xcodebuild build succeeds (clean Debug)"
  local build_log
  build_log="$(mktemp)"
  if xcodebuild build -project "$XCODEPROJ" -scheme "Vigil Capture" -configuration Debug -quiet > "$build_log" 2>&1; then
    green "  PASS — xcodebuild build succeeded"
    rm -f "$build_log"
  else
    red "  FAIL — xcodebuild build failed; log tail:"
    tail -30 "$build_log" >&2
    rm -f "$build_log"
    FAIL=1
  fi
}

check_smappservice_runtime() {
  info "Check 6: Post-launch SMAppService.mainApp.status is .enabled (non-reboot proxy)"
  # Locate the built .app
  local app_path
  app_path="$(find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 6 -name 'Vigil Capture.app' -type d 2>/dev/null | head -1)"
  if [[ -z "$app_path" ]]; then
    red "  FAIL — no built 'Vigil Capture.app' found under DerivedData; run --runtime after Check 5"
    FAIL=1
    return
  fi
  info "  found built app at: $app_path"
  # Launch the built app non-interactively; give it 3s to finish register()
  open "$app_path"
  sleep 3
  # Probe sfltool (Background Task Management) registry for our bundle ID.
  # Disposition line appears BEFORE the Identifier line in `sfltool dumpbtm` output,
  # so grep -B5 captures it (grep -A was the original Plan 00 bug — wrong direction).
  # Fallback: launchctl print gui/$UID | grep vigil
  local found=0
  if sfltool dumpbtm 2>/dev/null | grep -B5 'io.vigilhub.extension' | grep -qi 'Disposition:.*enabled'; then
    found=1
  elif launchctl print "gui/$UID" 2>/dev/null | grep -qi 'vigilhub.extension'; then
    found=1
  fi
  # Quit the app (it should have the NSAlert up on first launch; accept that by killing it)
  osascript -e 'tell application "Vigil Capture" to quit' >/dev/null 2>&1 || \
    pkill -f "Vigil Capture.app/Contents/MacOS/Vigil Capture" || true

  if [[ "$found" -eq 1 ]]; then
    green "  PASS — SMAppService registered Vigil Capture as login item"
  else
    red "  FAIL — SMAppService.mainApp.status != .enabled after first launch"
    red "         sfltool/launchctl found no record of io.vigilhub.extension"
    FAIL=1
  fi
}

check_external_health() {
  info "Check N: External prod health probe — https://api.vigilhub.io/v1/health"
  local HTTP_STATUS
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "https://api.vigilhub.io/v1/health" 2>/dev/null || echo "000")
  if [[ "$HTTP_STATUS" == "200" ]]; then
    green "  PASS — api.vigilhub.io/v1/health returned HTTP 200"
  else
    red "  FAIL — api.vigilhub.io/v1/health returned HTTP $HTTP_STATUS"
    red "         Check VIGIL_BIND_HOST in Railway dashboard — must be 0.0.0.0"
    red "         (This probe catches the 502 class that a local NODE_ENV=production probe misses.)"
    FAIL=1
  fi
}

run_static() {
  check_lsuielement
  check_deployment_target
  check_appdelegate_register
  check_first_launch_alert
  check_window_suppression
}

run_runtime() {
  check_xcodebuild
  check_smappservice_runtime
}

run_external() {
  check_external_health
}

case "$MODE" in
  --static)
    run_static
    ;;
  --runtime)
    run_runtime
    ;;
  --external)
    # Phase 107.3 Fix 4: live Railway prod reachability. Separate mode because it
    # requires a deployed build and an outbound network; --static/--runtime do not.
    run_external
    ;;
  --full|"")
    run_static
    run_runtime
    run_external
    ;;
  *)
    echo "usage: $0 [--static|--runtime|--external|--full]" >&2
    exit 2
    ;;
esac

if [[ "$FAIL" -ne 0 ]]; then
  red "verify-phase-107: FAILED"
  exit 1
fi
green "verify-phase-107: all checks passed"
exit 0
