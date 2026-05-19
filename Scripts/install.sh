#!/bin/bash
set -euo pipefail

# install.sh — Build and install DailyBrief + DailyBriefMonitor
# Idempotent: safe to run multiple times.

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/Library/Logs/DailyBrief"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
MONITOR_LABEL="com.jamesonmorrill.dailybriefmonitor"
MONITOR_PLIST="$LAUNCH_AGENTS_DIR/$MONITOR_LABEL.plist"
OLD_CLI_LABEL="com.jamesonmorrill.dailybrief"
OLD_CLI_PLIST="$LAUNCH_AGENTS_DIR/$OLD_CLI_LABEL.plist"

# Safari extension (Xcode project — separate build system from swift build)
SAFARI_PROJ_DIR="$REPO_DIR/vigil-safari-extension"
SAFARI_PROJ="$SAFARI_PROJ_DIR/Vigil Capture.xcodeproj"
SAFARI_SCHEME="Vigil Capture"
SAFARI_APPEX_NAME="Vigil Capture Extension.appex"
SAFARI_BUILD_DIR="$SAFARI_PROJ_DIR/build"

echo "=== DailyBrief Installer ==="
echo ""

# ========================================================================
# Developer ID signing guard (Phase 58 — SIGN-01/SIGN-05, D-03/D-04)
# ------------------------------------------------------------------------
# Resolve the login-keychain Developer ID Application identity BEFORE we
# spend time on swift build. -v filters expired certs. If none found, hard
# fail with a remediation message — NEVER fall back to ad-hoc signing
# (which would silently reset TCC permissions on every rebuild, the exact
# failure Phase 58 is fixing).
# ========================================================================
# Phase 107.3 Fix 2: pipefail-immune Developer ID resolution. awk returns exit 0
# even when no match is found (grep returns 1 on no-match, which pipefail would
# propagate and abort the script before the [[ -z "$IDENTITY" ]] remediation
# block below could fire). awk prints the identity WITHOUT surrounding quotes.
IDENTITY=$(security find-identity -v -p codesigning \
           | awk 'match($0, /"Developer ID Application: [^"]*"/) {
               s=substr($0, RSTART+1, RLENGTH-2); print s; exit
             }')

if [[ -z "$IDENTITY" ]]; then
    echo "ERROR: No Developer ID Application certificate found in login keychain." >&2
    echo "" >&2
    echo "Import your signing cert with:" >&2
    echo "  security import /path/to/cert.p12 -k ~/Library/Keychains/login.keychain-db" >&2
    echo "" >&2
    echo "Then re-run: ./scripts/install.sh" >&2
    echo "" >&2
    echo "(This is a hard fail — install.sh refuses to produce unsigned or" >&2
    echo " ad-hoc-signed output because that resets macOS TCC permissions" >&2
    echo " silently on every rebuild. See .planning/phases/58-* for why.)" >&2
    exit 1
fi
echo "  Signing identity: $IDENTITY"
echo ""

# ========================================================================
# Phase 999.1 — Provisioning profile guard (D-03)
# ------------------------------------------------------------------------
# The DailyBriefMonitor.app requires a Developer ID Provisioning Profile to
# authorize the com.apple.developer.ubiquity-container-identifiers entitlement.
# Without this profile, amfid will kill the process on launch with -67050.
# Mirror the cert-guard shape above: hard fail, remediation message, exit 1.
# ========================================================================
if [[ ! -f "$REPO_DIR/Entitlements/embedded.provisionprofile" ]]; then
    echo "ERROR: $REPO_DIR/Entitlements/embedded.provisionprofile missing." >&2
    echo "" >&2
    echo "Download from developer.apple.com:" >&2
    echo "  Certificates, IDs & Profiles → Profiles → +" >&2
    echo "  Distribution → Developer ID → App ID com.jamesonmorrill.dailybriefmonitor" >&2
    echo "  Save as: Entitlements/embedded.provisionprofile" >&2
    echo "" >&2
    echo "Then re-run: ./Scripts/install.sh" >&2
    echo "" >&2
    echo "(This is a hard fail — the ubiquity entitlement requires an embedded" >&2
    echo " provisioning profile or amfid kills the process on launch. See" >&2
    echo " Entitlements/embedded.provisionprofile.example.txt for the full flow.)" >&2
    exit 1
fi

# 0. Clean up old CLI LaunchAgent (scheduling now built into monitor)
if [ -f "$OLD_CLI_PLIST" ]; then
    echo "Removing old CLI LaunchAgent..."
    launchctl bootout "gui/$(id -u)/$OLD_CLI_LABEL" 2>/dev/null || true
    rm -f "$OLD_CLI_PLIST"
    echo "  Removed old CLI LaunchAgent (scheduling now built into monitor)"
fi

# Remove stale /usr/local/bin symlink if present (old dev shortcut)
if [ -L "/usr/local/bin/dailybrief" ]; then
    echo "Removing stale /usr/local/bin/dailybrief symlink..."
    rm -f "/usr/local/bin/dailybrief"
    echo "  Removed (correct binary is at $INSTALL_DIR/DailyBrief)"
fi

# 1. Build both targets in release mode
echo "Building release binaries..."
cd "$REPO_DIR"
swift build -c release
echo "  Build complete."

# 2. Create install directory
mkdir -p "$INSTALL_DIR"

# 3. Copy CLI binary
echo "Installing DailyBrief CLI to $INSTALL_DIR/DailyBrief..."
cp -f "$REPO_DIR/.build/release/DailyBrief" "$INSTALL_DIR/DailyBrief"
# Sign CLI in the install destination (NOT .build/release — cp would strip
# the signature). Phase 58 D-05: install.sh is the canonical signing point.
# --options runtime enables hardened runtime (required for notarization).
codesign --force \
         --sign "$IDENTITY" \
         --options runtime \
         --identifier "com.jamesonmorrill.dailybrief" \
         --entitlements "$REPO_DIR/Entitlements/DailyBrief.entitlements" \
         "$INSTALL_DIR/DailyBrief"
codesign --verify --verbose "$INSTALL_DIR/DailyBrief" 2>&1 \
    || { echo "ERROR: DailyBrief signature verification failed." >&2; exit 1; }
echo "  DailyBrief signed + verified."

# 4. Build Monitor .app bundle
MONITOR_APP="$INSTALL_DIR/DailyBriefMonitor.app"
MONITOR_MACOS="$MONITOR_APP/Contents/MacOS"
MONITOR_RESOURCES="$MONITOR_APP/Contents/Resources"
echo "Installing DailyBriefMonitor.app to $MONITOR_APP..."
mkdir -p "$MONITOR_MACOS" "$MONITOR_RESOURCES"
cp -f "$REPO_DIR/.build/release/DailyBriefMonitor" "$MONITOR_MACOS/DailyBriefMonitor"

# Also keep the bare binary for backward compat (UpdateService, bootstrap.sh)
cp -f "$REPO_DIR/.build/release/DailyBriefMonitor" "$INSTALL_DIR/DailyBriefMonitor"

# Write Info.plist
cat > "$MONITOR_APP/Contents/Info.plist" <<INFOPLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.jamesonmorrill.dailybriefmonitor</string>
    <key>CFBundleName</key>
    <string>Vigil</string>
    <key>CFBundleDisplayName</key>
    <string>Vigil</string>
    <key>CFBundleExecutable</key>
    <string>DailyBriefMonitor</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>2.4</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Vigil transcribes voice notes you drop into the watched folder so they can be captured as thoughts.</string>
    <key>NSUbiquitousContainers</key>
    <dict>
        <key>iCloud.com.jamesonmorrill.dailybriefmonitor</key>
        <dict>
            <key>NSUbiquitousContainerIsDocumentScopePublic</key>
            <true/>
            <key>NSUbiquitousContainerName</key>
            <string>DailyBriefMonitor</string>
            <key>NSUbiquitousContainerSupportedFolderLevels</key>
            <string>Any</string>
        </dict>
    </dict>
</dict>
</plist>
INFOPLIST

# Copy pre-built AppIcon.icns into bundle Resources (Phase 87 D-06/D-07).
# Must happen BEFORE codesign --deep so signature covers the icon resource.
if [[ ! -f "$REPO_DIR/brand/mac/AppIcon.icns" ]]; then
    echo "ERROR: brand/mac/AppIcon.icns missing. Run Plan 87-01 first." >&2
    exit 1
fi
cp -f "$REPO_DIR/brand/mac/AppIcon.icns" "$MONITOR_RESOURCES/AppIcon.icns"
echo "  AppIcon.icns installed to bundle Resources."

# 4.5 Build Safari Web Extension and embed it into DailyBriefMonitor.app
#
# The Safari extension lives in a separate Xcode project (vigil-safari-extension/).
# We build the host scheme to produce the .appex as a byproduct, then embed only
# the .appex into the monitor bundle's PlugIns/. The Xcode-produced host
# ("Vigil Capture.app") is discarded — DailyBriefMonitor is now the host.
# Must complete BEFORE the outer codesign --deep so its signature covers the .appex.
echo "Building Safari extension..."
if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "ERROR: xcodebuild not found. Install Xcode command-line tools." >&2
    exit 1
fi

rm -rf "$SAFARI_BUILD_DIR"
xcodebuild \
    -project "$SAFARI_PROJ" \
    -scheme "$SAFARI_SCHEME" \
    -configuration Release \
    -derivedDataPath "$SAFARI_BUILD_DIR" \
    CODE_SIGN_IDENTITY="$IDENTITY" \
    CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM="" \
    build >/dev/null

APPEX_SRC=$(find "$SAFARI_BUILD_DIR/Build/Products/Release" \
            -name "$SAFARI_APPEX_NAME" -type d | head -1)
if [[ -z "$APPEX_SRC" || ! -d "$APPEX_SRC" ]]; then
    echo "ERROR: $SAFARI_APPEX_NAME not produced by xcodebuild." >&2
    exit 1
fi

echo "Embedding $SAFARI_APPEX_NAME into DailyBriefMonitor.app/Contents/PlugIns/..."
MONITOR_PLUGINS="$MONITOR_APP/Contents/PlugIns"
mkdir -p "$MONITOR_PLUGINS"
rm -rf "$MONITOR_PLUGINS/$SAFARI_APPEX_NAME"
cp -R "$APPEX_SRC" "$MONITOR_PLUGINS/"

# Re-sign the embedded .appex with our Developer ID. xcodebuild signed it
# already, but the outer --deep below requires every nested bundle to be
# signed by the same identity for the outer signature to validate.
codesign --force \
         --sign "$IDENTITY" \
         --options runtime \
         "$MONITOR_PLUGINS/$SAFARI_APPEX_NAME"

# Phase 999.1: Embed Developer ID Provisioning Profile (authorizes ubiquity entitlement).
# MUST happen BEFORE outer `codesign --deep` below so the seal covers it.
# See .planning/phases/999.1-restore-ubiquity-entitlement-for-icloud-download/999.1-RESEARCH.md
# Pitfall 3 for why order matters.
PROFILE_SRC="$REPO_DIR/Entitlements/embedded.provisionprofile"
if [[ ! -f "$PROFILE_SRC" ]]; then
    echo "ERROR: $PROFILE_SRC missing." >&2
    echo "" >&2
    echo "Download from developer.apple.com:" >&2
    echo "  Certificates, IDs & Profiles → Profiles → +" >&2
    echo "  Distribution → Developer ID → App ID com.jamesonmorrill.dailybriefmonitor" >&2
    echo "  Save as: Entitlements/embedded.provisionprofile" >&2
    echo "" >&2
    echo "See .planning/phases/999.1-restore-ubiquity-entitlement-for-icloud-download/README" >&2
    exit 1
fi

# Sanity-check the profile: CMS-decodable + lists ubiquity entitlement.
PROFILE_TMP=$(mktemp -t embedded.XXXXXX.plist)
trap 'rm -f "$PROFILE_TMP"' EXIT
if ! security cms -D -i "$PROFILE_SRC" > "$PROFILE_TMP" 2>/dev/null; then
    echo "ERROR: $PROFILE_SRC is not a valid CMS-signed profile." >&2
    exit 1
fi
if ! /usr/libexec/PlistBuddy \
        -c "Print :Entitlements:com.apple.developer.ubiquity-container-identifiers" \
        "$PROFILE_TMP" >/dev/null 2>&1; then
    echo "ERROR: profile does not authorize ubiquity-container-identifiers." >&2
    exit 1
fi

cp -f "$PROFILE_SRC" "$MONITOR_APP/Contents/embedded.provisionprofile"
echo "  Embedded provisioning profile."

# Sign the .app bundle (signs the entire bundle including binary).
# --deep signs embedded frameworks/helpers if any exist in future.
# --options runtime enables the hardened runtime — REQUIRED for notarization.
# Note: --deep re-signs nested bundles (including the .appex above) using
# THESE options, so runtime must be on the outer call too.
codesign --deep --force \
         --sign "$IDENTITY" \
         --options runtime \
         --identifier "com.jamesonmorrill.dailybriefmonitor" \
         --entitlements "$REPO_DIR/Entitlements/DailyBriefMonitor.entitlements" \
         "$MONITOR_APP"
codesign --verify --verbose "$MONITOR_APP" 2>&1 \
    || { echo "ERROR: DailyBriefMonitor.app signature verification failed." >&2; exit 1; }
# Phase 999.1: Verify the ubiquity entitlement survived the codesign --deep seal.
# codesign --deep re-seals nested bundles; if the profile or entitlements file was
# wrong, the key silently drops. Fail hard here so the operator knows immediately.
EMBEDDED_ENTITLEMENTS=$(codesign -d --entitlements - "$MONITOR_APP" 2>/dev/null)
if ! grep -q "com.apple.developer.ubiquity-container-identifiers" <<< "$EMBEDDED_ENTITLEMENTS"; then
    echo "ERROR: ubiquity entitlement did not survive signing." >&2
    exit 1
fi
echo "  Ubiquity entitlement embedded + verified."
# Also sign the bare binary copy
# Phase 999.1 Pitfall 6 Option 1: bare binary at $INSTALL_DIR has no
# .app/Contents/embedded.provisionprofile neighbor (OS only looks there).
# Signing with ubiquity entitlement here would cause amfid -67050 kills.
# UpdateService.installBuiltBinaries() at UpdateService.swift:148 COPIES
# this binary without re-signing — so this signing sticks on every Update.
codesign --force \
         --sign "$IDENTITY" \
         --options runtime \
         --identifier "com.jamesonmorrill.dailybriefmonitor" \
         --entitlements "$REPO_DIR/Entitlements/DailyBriefMonitor-bare.entitlements" \
         "$INSTALL_DIR/DailyBriefMonitor"
echo "  DailyBriefMonitor.app signed + verified."

# 5. Create log directory
mkdir -p "$LOG_DIR"

# 6. Generate LaunchAgent plist for monitor
echo "Installing LaunchAgent plist..."
cat > "$MONITOR_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$MONITOR_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/DailyBriefMonitor.app/Contents/MacOS/DailyBriefMonitor</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/monitor-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/monitor-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
PLIST

# ============================================================================
# WARNING: do not invoke this script from inside the managed DailyBriefMonitor
# process. The `launchctl bootout` call below targets
# com.jamesonmorrill.dailybriefmonitor — which IS the menu bar process when
# running under launchd. bootout sends SIGTERM to the caller, killing
# UpdateService mid-lifecycle before writeHandoff() / trampoline / exit(0)
# can run. See .planning/phases/51-menu-bar-update-action/51-VERIFICATION.md
# (Gap 1) and 51-04-PLAN.md for the full root cause.
#
# In-process updates use UpdateService.installBuiltBinaries() (inline Swift cp)
# and the /tmp/vigil-reload.sh trampoline, which calls
# `launchctl kickstart -k` AFTER the menu bar has called exit(0).
#
# This script remains the correct path for first-install / terminal bootstrap.
# ============================================================================

# 7. Load/reload the monitor LaunchAgent
echo "Loading LaunchAgent..."
GUI_DOMAIN="gui/$(id -u)"
# Bootout existing if present (ignore errors if not loaded)
launchctl bootout "$GUI_DOMAIN/$MONITOR_LABEL" 2>/dev/null || true
# Phase 999.1: pause for amfid validation of new profile-bearing bundle (RESEARCH Open Question 3 — Phase 134 debug doc one-time I/O 5 error precedent).
sleep 1
launchctl bootstrap "$GUI_DOMAIN" "$MONITOR_PLIST"

# 8. Verify LaunchAgent loaded
echo "Verifying LaunchAgent..."
launchctl print "$GUI_DOMAIN/$MONITOR_LABEL" 2>/dev/null && echo "  LaunchAgent verified." || echo "  Warning: Could not verify LaunchAgent status."

# 9. Print summary
echo ""
echo "=== Installation Complete ==="
echo ""
echo "  CLI:      $INSTALL_DIR/DailyBrief"
echo "  Monitor:  $INSTALL_DIR/DailyBriefMonitor.app"
echo "  Plist:    $MONITOR_PLIST"
echo "  Logs:     $LOG_DIR/"
echo ""
echo "The DailyBriefMonitor LaunchAgent is now loaded and will start at login."
echo "  Inspect signature: codesign -dvv $INSTALL_DIR/DailyBrief"
echo "To check status: launchctl list | grep dailybriefmonitor"
echo "  Safari ext: enable in Safari → Settings → Extensions → Vigil Capture"
