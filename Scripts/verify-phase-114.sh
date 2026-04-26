#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Safari popup file paths (Phase 114 edit targets)
SAFARI_DIR="$REPO_ROOT/vigil-safari-extension/Vigil Capture Extension/Resources"
SAFARI_HTML="$SAFARI_DIR/popup.html"
SAFARI_JS="$SAFARI_DIR/popup.js"
SAFARI_CSS="$SAFARI_DIR/popup.css"

# Chrome popup file paths (D-02 lockstep mirror)
CHROME_DIR="$REPO_ROOT/vigil-extension"
CHROME_HTML="$CHROME_DIR/popup.html"
CHROME_JS="$CHROME_DIR/popup.js"
CHROME_CSS="$CHROME_DIR/popup.css"

# Xcode build inputs (Plan 04 runtime path)
XCODEPROJ="$REPO_ROOT/vigil-safari-extension/Vigil Capture.xcodeproj"

MODE="${1:---static}"
FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '[verify-114] %s\n' "$*"; }

# ---------- SC#1: empty textarea + focus ----------
check_sc1_empty_init() {
  info "Check SC#1: popup.js empty-init + focus (no auto-prefill)"
  # POSITIVE: contentInput.value = ''; AND contentInput.focus();
  if ! grep -qE "contentInput\.value = '';" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing empty-string init: contentInput.value = '';"
    FAIL=1
    return
  fi
  if ! grep -qF "contentInput.focus()" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing contentInput.focus()"
    FAIL=1
    return
  fi
  # NEGATIVE: must NOT contain auto-prefill template literal `${title}`
  if grep -qE 'contentInput\.value = `\$\{title\}' "$SAFARI_JS"; then
    red "  FAIL — popup.js still has URL/title auto-prefill (must be removed for SC#1)"
    FAIL=1
    return
  fi
  green "  PASS — empty textarea + focus, no auto-prefill"
}

# ---------- SC#2: include-URL checkbox + verbatim Chrome append format ----------
check_sc2_include_url() {
  info "Check SC#2: include-url checkbox + verbatim append format"
  if ! grep -qF 'id="include-url"' "$SAFARI_HTML"; then
    red "  FAIL — popup.html missing checkbox with id=\"include-url\""
    FAIL=1
    return
  fi
  if ! grep -qF "getElementById('include-url')" "$SAFARI_JS" \
     && ! grep -qF 'getElementById("include-url")' "$SAFARI_JS"; then
    red "  FAIL — popup.js missing getElementById('include-url')"
    FAIL=1
    return
  fi
  # Verbatim Chrome format: \n\n${tab.title || 'Page'}: ${tab.url}
  if ! grep -qF "tab.title || 'Page'" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing verbatim Chrome URL-append format: tab.title || 'Page'"
    FAIL=1
    return
  fi
  green "  PASS — checkbox + verbatim append format present"
}

# ---------- SC#3: Cmd+Enter handler (static — empirical probe is Plan 01 HUMAN-UAT) ----------
check_sc3_cmd_enter_handler() {
  info "Check SC#3: Cmd+Enter keydown handler bound (empirical probe attested separately in 114-HUMAN-UAT.md)"
  if ! grep -qE "e\.metaKey \|\| e\.ctrlKey" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing Cmd+Enter check: e.metaKey || e.ctrlKey"
    FAIL=1
    return
  fi
  if ! grep -qF "captureBtn.click()" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing captureBtn.click() invocation"
    FAIL=1
    return
  fi
  # NEGATIVE: probe code must be reverted (no [probe] log line in popup.js after Plan 01 closes)
  if grep -qF '[probe]' "$SAFARI_JS"; then
    red "  FAIL — popup.js still contains [probe] code; revert before phase ships (Plan 01 D-03)"
    FAIL=1
    return
  fi
  green "  PASS — keydown handler bound, probe code reverted"
}

# ---------- SC#4: triage poll (800ms / 5s / category-badge) ----------
check_sc4_triage_poll() {
  info "Check SC#4: triage poll (800ms cadence, 5s timeout, category-badge render)"
  if ! grep -qF "setInterval" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing setInterval (triage poll loop)"
    FAIL=1
    return
  fi
  if ! grep -qE "Date\.now\(\) - startTime > 5000" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing 5000ms timeout: Date.now() - startTime > 5000"
    FAIL=1
    return
  fi
  if ! grep -qF "800" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing 800ms poll cadence"
    FAIL=1
    return
  fi
  if ! grep -qF "category-badge" "$SAFARI_JS"; then
    red "  FAIL — popup.js missing category-badge render"
    FAIL=1
    return
  fi
  # CSS rule must exist
  if ! grep -qF ".category-badge" "$SAFARI_CSS"; then
    red "  FAIL — popup.css missing .category-badge rule"
    FAIL=1
    return
  fi
  if ! grep -qF ".url-toggle" "$SAFARI_CSS"; then
    red "  FAIL — popup.css missing .url-toggle rule"
    FAIL=1
    return
  fi
  if ! grep -qF ".shortcut-hint" "$SAFARI_CSS"; then
    red "  FAIL — popup.css missing .shortcut-hint rule"
    FAIL=1
    return
  fi
  if ! grep -qF ".analyzing" "$SAFARI_CSS"; then
    red "  FAIL — popup.css missing .analyzing rule"
    FAIL=1
    return
  fi
  green "  PASS — 800ms / 5s / category-badge poll loop present"
}

# ---------- D-02 lockstep header comments on all 6 files ----------
check_d02_lockstep_headers() {
  info "Check D-02: lockstep header comment present in all 6 popup files"
  local files=(
    "$CHROME_HTML"
    "$CHROME_JS"
    "$CHROME_CSS"
    "$SAFARI_HTML"
    "$SAFARI_JS"
    "$SAFARI_CSS"
  )
  local missing=0
  for f in "${files[@]}"; do
    if ! grep -qF 'Keep in lockstep with' "$f"; then
      red "  MISSING D-02 header in: $f"
      missing=1
    fi
  done
  if [[ "$missing" -eq 1 ]]; then
    red "  FAIL — D-02 lockstep header comment absent from one or more popup files"
    FAIL=1
  else
    green "  PASS — D-02 lockstep header comments present in all 6 files"
  fi
}

# ---------- SC#5: xcodebuild clean build + codesign --verify --deep --strict ----------
check_sc5_xcodebuild() {
  info "Check SC#5a: xcodebuild clean build (D-16) succeeds"
  local build_log
  build_log="$(mktemp)"
  if xcodebuild clean build \
       -project "$XCODEPROJ" \
       -scheme "Vigil Capture" \
       -configuration Debug \
       -quiet > "$build_log" 2>&1; then
    green "  PASS — xcodebuild clean build succeeded"
    rm -f "$build_log"
  else
    red "  FAIL — xcodebuild clean build failed; log tail:"
    tail -30 "$build_log" >&2
    rm -f "$build_log"
    FAIL=1
  fi
}

check_sc5_codesign() {
  info "Check SC#5b: codesign --verify --deep --strict on .app and .appex (D-15)"
  local app_path
  app_path="$(find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 6 -name 'Vigil Capture.app' -type d 2>/dev/null | head -1)"
  if [[ -z "$app_path" ]]; then
    red "  FAIL — no built 'Vigil Capture.app' found under DerivedData; run --runtime after Check SC#5a"
    FAIL=1
    return
  fi
  info "  found built app at: $app_path"

  # codesign --verify --deep --strict on container .app
  if codesign --verify --deep --strict --verbose=2 "$app_path" 2>&1; then
    green "  PASS — .app passes codesign --verify --deep --strict"
  else
    red "  FAIL — .app rejected by codesign --verify --deep --strict"
    FAIL=1
    return
  fi

  # codesign --verify --deep --strict on embedded .appex
  local appex_path="$app_path/Contents/PlugIns/Vigil Capture Extension.appex"
  if [[ ! -d "$appex_path" ]]; then
    red "  FAIL — embedded .appex not found at: $appex_path"
    FAIL=1
    return
  fi
  if codesign --verify --deep --strict --verbose=2 "$appex_path" 2>&1; then
    green "  PASS — .appex passes codesign --verify --deep --strict"
  else
    red "  FAIL — .appex rejected by codesign --verify --deep --strict"
    FAIL=1
  fi
}

run_static() {
  check_sc1_empty_init
  check_sc2_include_url
  check_sc3_cmd_enter_handler
  check_sc4_triage_poll
  check_d02_lockstep_headers
}

run_runtime() {
  check_sc5_xcodebuild
  check_sc5_codesign
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
  red "verify-phase-114: FAILED"
  exit 1
fi
green "verify-phase-114: all checks passed"
exit 0
