#!/usr/bin/env bash
# Builds all native binaries bundled inside OryvexVPN.app/Contents/MacOS/core/ on macOS:
#   - oryvexcore     (Universal arm64 + x86_64 Rust binary)
#   - oryvex-bypass  (Universal arm64 + x86_64 C binary)
#   - fox-core       (Universal arm64 + x86_64 Go binary)
#   - LICENSES/
#
# Usage:
#   bash apps/desktop-src/tool/build_macos_natives.sh [out_dir]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"
OUT="${1:-$APP/core-bundle}"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-12.0}"

mkdir -p "$OUT/LICENSES"

echo "== 1. Building oryvexcore (macOS Universal: arm64 + x86_64)"
(
  cd "$ROOT/oryvexcore"
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  bash scripts/build-core.sh cargo build --release --target aarch64-apple-darwin
  bash scripts/build-core.sh cargo build --release --target x86_64-apple-darwin
  lipo -create \
    target/aarch64-apple-darwin/release/oryvexcore \
    target/x86_64-apple-darwin/release/oryvexcore \
    -output "$OUT/oryvexcore"
  chmod 755 "$OUT/oryvexcore"
)

echo "== 2. Building oryvex-bypass (macOS Universal: arm64 + x86_64)"
bash "$ROOT/oryvexcore/bypass/build.sh" macos universal "$OUT"

echo "== 3. Building fox-core (macOS Universal: arm64 + x86_64)"
(
  cd "$ROOT/fox/core"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o "$tmp/fox-core-arm64" ./cmd/fox-core
  CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$tmp/fox-core-amd64" ./cmd/fox-core
  lipo -create "$tmp/fox-core-arm64" "$tmp/fox-core-amd64" -output "$OUT/fox-core"
  chmod 755 "$OUT/fox-core"
  cp LICENSE "$OUT/LICENSES/fox-core-GPL-3.0.txt"
)

cp "$ROOT/LICENSE" "$OUT/LICENSES/oryvexcore-LICENSE.txt"
echo "== macOS universal core bundle ready in $OUT"
ls -lh "$OUT"
file "$OUT/oryvexcore" "$OUT/oryvex-bypass" "$OUT/fox-core"
