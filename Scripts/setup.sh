#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== DailyBrief Setup ==="

# Create directories
mkdir -p ~/Library/Logs/DailyBrief
mkdir -p ~/Documents/DailyBrief
mkdir -p ~/.config/dailybrief
mkdir -p ~/.cache/dailybrief

# Build
echo ""
echo "Step 1: Building..."
bash "$SCRIPT_DIR/build.sh"

# Create config if needed
CONFIG_FILE=~/.config/dailybrief/config.json
if [ ! -f "$CONFIG_FILE" ]; then
    echo ""
    echo "Step 2: Creating config template..."
    "$PROJECT_DIR/.build/release/DailyBrief" --setup
    echo ""
    echo "*** IMPORTANT: Edit $CONFIG_FILE with your API keys before continuing ***"
    echo "  - Gmail App Password: Google Account > Security > App Passwords"
    echo "  - Claude API Key: console.anthropic.com > API Keys"
    echo ""
    read -p "Press Enter once you've configured the file..."
fi

# Grant Reminders permission (requires manual click)
echo ""
echo "Step 3: Requesting Reminders permission..."
echo "(Click 'Allow' on the system dialog that appears)"
"$PROJECT_DIR/.build/release/DailyBrief" --dry-run --no-print 2>&1 || true

# Install LaunchAgent
echo ""
echo "Step 4: Installing LaunchAgent..."
PLIST_SRC="$PROJECT_DIR/LaunchAgent/com.jamesonmorrill.dailybrief.plist"
PLIST_DST=~/Library/LaunchAgents/com.jamesonmorrill.dailybrief.plist

cp "$PLIST_SRC" "$PLIST_DST"
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo ""
echo "=== Setup Complete ==="
echo "  Schedule: Daily at 6:30 AM"
echo "  Config:   $CONFIG_FILE"
echo "  Logs:     ~/Library/Logs/DailyBrief/"
echo "  PDFs:     ~/Documents/DailyBrief/"
echo ""
echo "Test it now with:"
echo "  launchctl start com.jamesonmorrill.dailybrief"
echo ""
echo "Or run directly:"
echo "  $PROJECT_DIR/.build/release/DailyBrief"
