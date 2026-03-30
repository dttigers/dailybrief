#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building DailyBrief (release)..."
cd "$PROJECT_DIR"
swift build -c release

BINARY="$PROJECT_DIR/.build/release/DailyBrief"
ENTITLEMENTS="$PROJECT_DIR/Entitlements/DailyBrief.entitlements"

echo "Codesigning with entitlements..."
codesign --force --sign - --entitlements "$ENTITLEMENTS" "$BINARY"

echo "Build complete: $BINARY"
echo "Run with: $BINARY --help"
