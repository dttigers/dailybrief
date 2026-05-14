#!/bin/bash
set -euo pipefail

# release.sh — End-to-end Mac release pipeline.
#   1. install.sh    → swift build -c release + Developer-ID sign + .app bundle
#   2. package-dmg.sh → wrap .app in signed .dmg under dist/
#   3. notarize.sh   → submit .dmg to Apple notary, wait, staple, gatekeeper-verify
#
# Prerequisites:
#   - Developer ID Application cert imported into login keychain
#   - AC_KEYCHAIN_PROFILE (or AC_APPLE_ID + AC_TEAM_ID + AC_PASSWORD) exported
#     (see Scripts/notarize.sh for setup)
#
# Usage:
#   ./Scripts/release.sh

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "=== Vigil Mac Release Pipeline ==="
echo ""

echo ">>> Step 1/3: install.sh"
"$REPO_DIR/Scripts/install.sh"
echo ""

echo ">>> Step 2/3: package-dmg.sh"
"$REPO_DIR/Scripts/package-dmg.sh"
echo ""

# Find the DMG package-dmg.sh just produced (newest in dist/)
DMG=$(ls -t "$REPO_DIR/dist"/Vigil-*.dmg 2>/dev/null | head -1)
if [[ -z "$DMG" ]]; then
    echo "ERROR: package-dmg.sh did not produce a DMG in dist/" >&2
    exit 1
fi

echo ">>> Step 3/3: notarize.sh $DMG"
"$REPO_DIR/Scripts/notarize.sh" "$DMG"
echo ""

echo "=== Release ready: $DMG ==="
