#!/usr/bin/env bash
# Builds all native XCFrameworks for iPhone and iPadOS (iOS 15.0+):
#   - OryvexCore.xcframework       (Rust staticlib with C FFI for arm64)
#   - FoxCore.xcframework          (Go gomobile binding from fox/core/mobile)
#   - HevSocks5Tunnel.xcframework  (tun -> SOCKS5 C engine for PacketTunnelProvider)
#
# Output directory: apps/ios-src/ios/Frameworks/
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"
FW_DIR="$APP/ios/Frameworks"
export IPHONEOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-15.0}"

CORE_FEATURES="${CORE_FEATURES:-tor tor-exit-country}"
CORE_FALLBACK_FEATURES="${CORE_FALLBACK_FEATURES:-tor}"
HEV_REPO="${HEV_REPO:-https://github.com/heiher/hev-socks5-tunnel}"
HEV_REF="${HEV_REF:-2.19.3}"
HEV_COMMIT="${HEV_COMMIT:-c5584feca8f6df70ee53eb2879e034b849a3d15a}"

mkdir -p "$FW_DIR"

build_core() {
  echo "== 1. Building OryvexCore.xcframework (aarch64-apple-ios)"
  (
    cd "$ROOT/oryvexcore"
    rustup target add aarch64-apple-ios
    local feat=()
    [ -n "$CORE_FEATURES" ] && feat=(--features "$CORE_FEATURES")
    if ! cargo build --release --target aarch64-apple-ios --lib "${feat[@]}"; then
      echo "::warning::core features '$CORE_FEATURES' failed for iOS; falling back to '$CORE_FALLBACK_FEATURES'"
      cargo build --release --target aarch64-apple-ios --lib --features "$CORE_FALLBACK_FEATURES"
    fi
  )

  local lib="$ROOT/oryvexcore/target/aarch64-apple-ios/release/liboryvexcore.a"
  local hdr_dir
  hdr_dir="$(mktemp -d)"
  cp "$APP/ios/Runner/Runner-Bridging-Header.h" "$hdr_dir/oryvexcore.h"

  rm -rf "$FW_DIR/OryvexCore.xcframework"
  xcodebuild -create-xcframework \
    -library "$lib" \
    -headers "$hdr_dir" \
    -output "$FW_DIR/OryvexCore.xcframework"
  rm -rf "$hdr_dir"
  echo "   -> $FW_DIR/OryvexCore.xcframework"
}

build_fox() {
  echo "== 2. Building FoxCore.xcframework (gomobile iOS)"
  (
    cd "$ROOT/fox/core"
    mobile_version="$(go list -m -f '{{.Version}}' golang.org/x/mobile)"
    go install "golang.org/x/mobile/cmd/gomobile@${mobile_version}"
    go install "golang.org/x/mobile/cmd/gobind@${mobile_version}"
    export PATH="$(go env GOPATH)/bin:$PATH"
    gomobile init
    rm -rf "$FW_DIR/FoxCore.xcframework"
    gomobile bind \
      -target=ios \
      -iosversion "$IPHONEOS_DEPLOYMENT_TARGET" \
      -o "$FW_DIR/FoxCore.xcframework" \
      ./mobile
  )
  echo "   -> $FW_DIR/FoxCore.xcframework"
}

build_tun() {
  echo "== 3. Building HevSocks5Tunnel.xcframework (hev-socks5-tunnel $HEV_REF)"
  local work
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN
  git clone --recursive --depth 1 --branch "$HEV_REF" "$HEV_REPO" "$work/hev-socks5-tunnel"
  local actual_commit
  actual_commit="$(git -C "$work/hev-socks5-tunnel" rev-parse HEAD)"
  if [ "$actual_commit" != "$HEV_COMMIT" ]; then
    echo "ERROR: hev-socks5-tunnel commit mismatch ($actual_commit != $HEV_COMMIT)" >&2
    exit 1
  fi
  (
    cd "$work/hev-socks5-tunnel"
    bash build-apple.sh
  )
  rm -rf "$FW_DIR/HevSocks5Tunnel.xcframework"
  cp -R "$work/hev-socks5-tunnel/HevSocks5Tunnel.xcframework" "$FW_DIR/HevSocks5Tunnel.xcframework"
  echo "   -> $FW_DIR/HevSocks5Tunnel.xcframework"
}

cmd="${1:-all}"
case "$cmd" in
  core) build_core ;;
  fox)  build_fox ;;
  tun)  build_tun ;;
  all)
    build_core
    build_fox
    build_tun
    ;;
  *) echo "usage: $0 core|fox|tun|all" >&2; exit 2 ;;
esac
