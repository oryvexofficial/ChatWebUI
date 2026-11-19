#!/usr/bin/env bash
# Packages a built OryvexVPN.app with its bundled universal cores into a drag-to-Applications DMG.
#
# Usage:
#   bash installer/macos/build-dmg.sh <path/to/OryvexVPN.app> <path/to/core-bundle> <out_dir> [version]
set -euo pipefail

APP_PATH="${1:?path to OryvexVPN.app}"
CORE_DIR="${2:?path to core-bundle}"
OUT_DIR="${3:?output directory}"
VERSION="${4:-}"

if [ -z "$VERSION" ]; then
  VERSION="$(grep -E '^version:' "$(dirname "$0")/../../apps/desktop-src/pubspec.yaml" | head -1 | sed -E 's/^version:[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
fi

mkdir -p "$OUT_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

STAGE_APP="$WORK/OryvexVPN.app"
cp -R "$APP_PATH" "$STAGE_APP"

# Embed the universal core binaries inside OryvexVPN.app/Contents/MacOS/core/
mkdir -p "$STAGE_APP/Contents/MacOS/core"
cp -R "$CORE_DIR"/* "$STAGE_APP/Contents/MacOS/core/"
chmod 755 "$STAGE_APP/Contents/MacOS/core/oryvexcore" \
          "$STAGE_APP/Contents/MacOS/core/oryvex-bypass" \
          "$STAGE_APP/Contents/MacOS/core/fox-core"

# Ad-hoc or Developer ID codesign so Gatekeeper/macOS allows execution of embedded binaries.
SIGN_ID="${MACOS_SIGN_IDENTITY:--}"
codesign --force --deep --options runtime --sign "$SIGN_ID" "$STAGE_APP" 2>/dev/null || \
  codesign --force --deep --sign - "$STAGE_APP"

DMG_ROOT="$WORK/dmg"
mkdir -p "$DMG_ROOT"
cp -R "$STAGE_APP" "$DMG_ROOT/"
ln -s /Applications "$DMG_ROOT/Applications"

DMG_OUT="$OUT_DIR/OryvexVPN-${VERSION}-macos-universal.dmg"
rm -f "$DMG_OUT"
hdiutil create \
  -volname "OryvexVPN ${VERSION}" \
  -srcfolder "$DMG_ROOT" \
  -ov \
  -format UDZO \
  "$DMG_OUT"

echo "-> $DMG_OUT ($(du -h "$DMG_OUT" | cut -f1))"
