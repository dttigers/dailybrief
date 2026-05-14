#!/bin/bash
set -euo pipefail

# notarize.sh — Submit DailyBriefMonitor.app (or a .dmg) to Apple notary service
# and staple the ticket. Run AFTER install.sh has produced a Developer-ID-signed
# .app, or after package-dmg.sh has produced a signed .dmg.
#
# Usage:
#   ./Scripts/notarize.sh <path-to-app-or-dmg>
#
# Credentials (one of the following must be set):
#   AC_KEYCHAIN_PROFILE   — name of a `notarytool store-credentials` profile (preferred)
#   AC_APPLE_ID + AC_TEAM_ID + AC_PASSWORD  — app-specific password fallback
#
# One-time keychain setup (recommended):
#   xcrun notarytool store-credentials AC_PASSWORD \
#       --apple-id you@example.com \
#       --team-id  ABCDE12345 \
#       --password app-specific-password
#   export AC_KEYCHAIN_PROFILE=AC_PASSWORD

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
    echo "Usage: $0 <path-to-app-or-dmg>" >&2
    exit 64
fi
if [[ ! -e "$TARGET" ]]; then
    echo "ERROR: $TARGET does not exist." >&2
    exit 66
fi

echo "=== Notarize: $TARGET ==="

# Resolve credentials
NOTARY_AUTH=()
if [[ -n "${AC_KEYCHAIN_PROFILE:-}" ]]; then
    NOTARY_AUTH=(--keychain-profile "$AC_KEYCHAIN_PROFILE")
    echo "  Auth: keychain profile '$AC_KEYCHAIN_PROFILE'"
elif [[ -n "${AC_APPLE_ID:-}" && -n "${AC_TEAM_ID:-}" && -n "${AC_PASSWORD:-}" ]]; then
    NOTARY_AUTH=(--apple-id "$AC_APPLE_ID" --team-id "$AC_TEAM_ID" --password "$AC_PASSWORD")
    echo "  Auth: AC_APPLE_ID + AC_TEAM_ID + AC_PASSWORD"
else
    echo "ERROR: No notary credentials configured." >&2
    echo "" >&2
    echo "Set up a keychain profile (one-time):" >&2
    echo "  xcrun notarytool store-credentials AC_PASSWORD \\" >&2
    echo "      --apple-id you@example.com \\" >&2
    echo "      --team-id  ABCDE12345 \\" >&2
    echo "      --password app-specific-password" >&2
    echo "  export AC_KEYCHAIN_PROFILE=AC_PASSWORD" >&2
    echo "" >&2
    echo "OR export AC_APPLE_ID, AC_TEAM_ID, AC_PASSWORD." >&2
    exit 78
fi

# Detect target type. .app must be zipped first; .dmg/.pkg submit directly.
EXT="${TARGET##*.}"
SUBMIT_PATH="$TARGET"
CLEANUP_ZIP=""

case "$EXT" in
    app)
        ZIP_PATH="${TARGET%.app}.zip"
        echo "  Zipping .app for submission..."
        # ditto preserves metadata + extended attrs (required by notary service)
        /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$TARGET" "$ZIP_PATH"
        SUBMIT_PATH="$ZIP_PATH"
        CLEANUP_ZIP="$ZIP_PATH"
        ;;
    dmg|pkg)
        ;;
    *)
        echo "ERROR: unsupported target extension '.$EXT' (expected .app, .dmg, or .pkg)" >&2
        exit 65
        ;;
esac

echo "  Submitting to Apple notary service (this can take 1–15 minutes)..."
xcrun notarytool submit "$SUBMIT_PATH" "${NOTARY_AUTH[@]}" --wait

# Notary success ≠ stapling success. Staple the ORIGINAL .app/.dmg so Gatekeeper
# accepts it offline (notary-only is online-only verification).
if [[ "$EXT" == "app" || "$EXT" == "dmg" || "$EXT" == "pkg" ]]; then
    echo "  Stapling notary ticket to $TARGET..."
    xcrun stapler staple "$TARGET"
    xcrun stapler validate "$TARGET"
    echo "  Stapled + validated."
fi

# spctl gives the final Gatekeeper-equivalent verdict on this machine
echo "  Gatekeeper assessment:"
case "$EXT" in
    app) spctl --assess --type execute --verbose=2 "$TARGET" || true ;;
    dmg) spctl --assess --type open --context context:primary-signature --verbose=2 "$TARGET" || true ;;
    pkg) spctl --assess --type install --verbose=2 "$TARGET" || true ;;
esac

[[ -n "$CLEANUP_ZIP" ]] && rm -f "$CLEANUP_ZIP"

echo ""
echo "=== Notarization complete: $TARGET ==="
