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

# 0. Clean up old CLI LaunchAgent (scheduling now built into monitor)
if [ -f "$OLD_CLI_PLIST" ]; then
    echo "Removing old CLI LaunchAgent..."
    launchctl bootout "gui/$(id -u)/$OLD_CLI_LABEL" 2>/dev/null || true
    rm -f "$OLD_CLI_PLIST"
    echo "  Removed old CLI LaunchAgent (scheduling now built into monitor)"
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

# 4. Copy Monitor binary
echo "Installing DailyBriefMonitor to $INSTALL_DIR/DailyBriefMonitor..."
cp -f "$REPO_DIR/.build/release/DailyBriefMonitor" "$INSTALL_DIR/DailyBriefMonitor"

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
        <string>$INSTALL_DIR/DailyBriefMonitor</string>
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
echo "  Monitor:  $INSTALL_DIR/DailyBriefMonitor"
echo "  Plist:    $MONITOR_PLIST"
echo "  Logs:     $LOG_DIR/"
echo ""
echo "The DailyBriefMonitor LaunchAgent is now loaded and will start at login."
echo "To check status: launchctl list | grep dailybriefmonitor"
