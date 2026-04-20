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
  # Fallback: launchctl print gui/$UID | grep vigil
  local found=0
  if sfltool dumpbtm 2>/dev/null | grep -A3 'io.vigilhub.extension' | grep -qi 'enabled'; then
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

run_static() {
  check_lsuielement
  check_deployment_target
  check_appdelegate_register
  check_first_launch_alert
}

run_runtime() {
  check_xcodebuild
  check_smappservice_runtime
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
  red "verify-phase-107: FAILED"
  exit 1
fi
green "verify-phase-107: all checks passed"
exit 0
