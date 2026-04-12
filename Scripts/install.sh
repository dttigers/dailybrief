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
IDENTITY=$(security find-identity -v -p codesigning \
           | grep "Developer ID Application" \
           | head -1 \
           | grep -o '"Developer ID Application: [^"]*"' \
           | tr -d '"')

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
codesign --force \
         --sign "$IDENTITY" \
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
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Vigil transcribes voice notes you drop into the watched folder so they can be captured as thoughts.</string>
</dict>
</plist>
INFOPLIST

# Sign the .app bundle (signs the entire bundle including binary).
# --deep signs embedded frameworks/helpers if any exist in future.
codesign --deep --force \
         --sign "$IDENTITY" \
         --identifier "com.jamesonmorrill.dailybriefmonitor" \
         --entitlements "$REPO_DIR/Entitlements/DailyBriefMonitor.entitlements" \
         "$MONITOR_APP"
codesign --verify --verbose "$MONITOR_APP" 2>&1 \
    || { echo "ERROR: DailyBriefMonitor.app signature verification failed." >&2; exit 1; }
# Also sign the bare binary copy
codesign --force \
         --sign "$IDENTITY" \
         --identifier "com.jamesonmorrill.dailybriefmonitor" \
         --entitlements "$REPO_DIR/Entitlements/DailyBriefMonitor.entitlements" \
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
