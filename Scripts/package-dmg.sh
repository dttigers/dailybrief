#!/bin/bash
set -euo pipefail

# package-dmg.sh — Wrap DailyBriefMonitor.app into a signed, drag-to-Applications
# .dmg. Run AFTER install.sh has produced a Developer-ID-signed .app.
#
# Usage:
#   ./Scripts/package-dmg.sh [path-to-app] [output.dmg]
#
# Defaults:
#   APP    = ~/.local/bin/DailyBriefMonitor.app
#   OUT    = dist/Vigil-<version>.dmg   (version read from app Info.plist)
#
# The .dmg itself is signed with the same Developer ID Application identity as
# the app. Notarization of the .dmg happens separately via Scripts/notarize.sh.

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$HOME/.local/bin/DailyBriefMonitor.app}"

if [[ ! -d "$APP" ]]; then
    echo "ERROR: app bundle not found at $APP" >&2
    echo "Run ./Scripts/install.sh first." >&2
    exit 66
fi

# Read version from the app's Info.plist so the .dmg name tracks releases
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")
DIST_DIR="$REPO_DIR/dist"
OUT="${2:-$DIST_DIR/Vigil-$VERSION.dmg}"
mkdir -p "$DIST_DIR"

# Resolve same Developer ID Application identity install.sh uses (pipefail-immune
# awk pattern — see install.sh:32-37 for the rationale).
IDENTITY=$(security find-identity -v -p codesigning \
           | awk 'match($0, /"Developer ID Application: [^"]*"/) {
               s=substr($0, RSTART+1, RLENGTH-2); print s; exit
             }')

if [[ -z "$IDENTITY" ]]; then
    echo "ERROR: No Developer ID Application certificate in login keychain." >&2
    echo "See install.sh:32-49 for setup instructions." >&2
    exit 1
fi

echo "=== Package DMG: Vigil $VERSION ==="
echo "  App:       $APP"
echo "  Output:    $OUT"
echo "  Identity:  $IDENTITY"

# Verify the app is signed before packaging (catches forgotten install.sh runs)
codesign --verify --strict --verbose=2 "$APP" 2>&1 \
    || { echo "ERROR: $APP is not validly signed. Run ./Scripts/install.sh first." >&2; exit 1; }

# Build a staging dir with the .app + an /Applications symlink (the standard
# drag-to-install affordance). Using a fresh staging dir guarantees the dmg has
# only what we want — no leftover .DS_Store / Spotlight metadata from $HOME.
STAGE=$(mktemp -d -t vigil-dmg.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT

cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

# Remove any prior dmg at OUT (hdiutil errors otherwise)
rm -f "$OUT"

echo "  Building DMG (UDZO compressed)..."
hdiutil create \
    -volname "Vigil $VERSION" \
    -srcfolder "$STAGE" \
    -ov \
    -format UDZO \
    -fs HFS+ \
    "$OUT" >/dev/null

echo "  Signing DMG..."
codesign --force --sign "$IDENTITY" --timestamp "$OUT"
codesign --verify --verbose=2 "$OUT" 2>&1 \
    || { echo "ERROR: DMG signature verification failed." >&2; exit 1; }

echo ""
echo "=== DMG ready: $OUT ==="
echo "Next: ./Scripts/notarize.sh \"$OUT\""
