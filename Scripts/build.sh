#!/bin/bash
set -euo pipefail

# build.sh — Compile DailyBrief in release mode (compile-only).
#
# This is a dev convenience script for quick iteration. It does NOT sign
# the binary. The produced artifact at .build/release/DailyBrief is
# unsigned and is suitable for local dev-loop use only.
#
# For a signed, installed binary (signed with your Developer ID Application
# cert so macOS TCC permissions persist), run:
#     ./scripts/install.sh
#
# Phase 58 (D-05): install.sh is the canonical signing point. build.sh
# used to call `codesign --force --sign -` (ad-hoc) but that was removed
# because ad-hoc signing produces an unstable designated requirement and
# resets TCC permissions on every rebuild.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building DailyBrief (release, unsigned)..."
cd "$PROJECT_DIR"
swift build -c release

BINARY="$PROJECT_DIR/.build/release/DailyBrief"

echo "Build complete: $BINARY"
echo ""
echo "Note: this binary is UNSIGNED. For a signed binary (needed for TCC"
echo "      permissions to persist), run: ./scripts/install.sh"
echo ""
echo "Run with: $BINARY --help"
