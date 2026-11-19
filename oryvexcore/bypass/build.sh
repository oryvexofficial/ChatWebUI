#!/usr/bin/env bash
# Builds the bypass engine (oryvex-bypass), the C program oryvexcore runs for --bypass.
#
# usage (from oryvexcore/bypass/):
#   bash build.sh native  <outdir>                      this machine (cc, or CC=...)
#   bash build.sh windows <x86_64|x86> <outdir>         oryvex-bypass.exe, cross-built with zig cc
#   bash build.sh macos   <arm64|x86_64|universal> <outdir>  macOS binary (universal via lipo)
#   bash build.sh ios     <arm64|sim-arm64> <outdir>    liboryvex_bypass.a staticlib for iOS/iPadOS
#   bash build.sh android <abi> <outdir>                liboryvex_bypass.so (executable)
#
# Android needs ANDROID_NDK_HOME (r27+). API level: ANDROID_API (default 21).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC=("$HERE"/src/*.c)
CFLAGS=(-std=c11 -O2 -Wall)

kind="${1:-native}"
shift || true

case "$kind" in
  native)
    out="${1:?outdir}"; mkdir -p "$out"
    "${CC:-cc}" "${CFLAGS[@]}" -pthread -o "$out/oryvex-bypass" "${SRC[@]}"
    echo "-> $out/oryvex-bypass"
    ;;
  windows)
    arch="${1:?x86_64 or x86}"; out="${2:?outdir}"; mkdir -p "$out"
    case "$arch" in x86_64|x86) ;; *) echo "unknown arch $arch" >&2; exit 2 ;; esac
    zig cc -target "$arch-windows-gnu" "${CFLAGS[@]}" -s -o "$out/oryvex-bypass.exe" "${SRC[@]}" -lws2_32 -liphlpapi
    echo "-> $out/oryvex-bypass.exe"
    ;;
  macos)
    arch="${1:?arm64, x86_64 or universal}"; out="${2:?outdir}"; mkdir -p "$out"
    min_ver="${MACOSX_DEPLOYMENT_TARGET:-12.0}"
    case "$arch" in
      arm64|x86_64)
        xcrun --sdk macosx clang -arch "$arch" -mmacosx-version-min="$min_ver" "${CFLAGS[@]}" -pthread -o "$out/oryvex-bypass" "${SRC[@]}"
        ;;
      universal)
        tmp="$(mktemp -d)"
        trap 'rm -rf "$tmp"' EXIT
        xcrun --sdk macosx clang -arch arm64 -mmacosx-version-min="$min_ver" "${CFLAGS[@]}" -pthread -o "$tmp/oryvex-bypass-arm64" "${SRC[@]}"
        xcrun --sdk macosx clang -arch x86_64 -mmacosx-version-min="$min_ver" "${CFLAGS[@]}" -pthread -o "$tmp/oryvex-bypass-x86_64" "${SRC[@]}"
        lipo -create "$tmp/oryvex-bypass-arm64" "$tmp/oryvex-bypass-x86_64" -output "$out/oryvex-bypass"
        ;;
      *) echo "unknown macos arch $arch" >&2; exit 2 ;;
    esac
    chmod 755 "$out/oryvex-bypass"
    echo "-> $out/oryvex-bypass ($arch)"
    ;;
  ios)
    arch="${1:?arm64 or sim-arm64}"; out="${2:?outdir}"; mkdir -p "$out"
    min_ver="${IPHONEOS_DEPLOYMENT_TARGET:-15.0}"
    case "$arch" in
      arm64)
        sdk="iphoneos"
        c_arch="arm64"
        min_flag="-miphoneos-version-min=$min_ver"
        ;;
      sim-arm64)
        sdk="iphonesimulator"
        c_arch="arm64"
        min_flag="-mios-simulator-version-min=$min_ver"
        ;;
      *) echo "unknown ios arch $arch" >&2; exit 2 ;;
    esac
    sdk_path="$(xcrun --sdk "$sdk" --show-sdk-path)"
    cc="$(xcrun --sdk "$sdk" --find clang)"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    objs=()
    for src in "${SRC[@]}"; do
      base="$(basename "$src" .c)"
      # Skip standalone CLI main() when building an embeddable iOS static library.
      if [ "$base" = "main" ]; then continue; fi
      obj="$tmp/${base}.o"
      "$cc" -arch "$c_arch" -isysroot "$sdk_path" "$min_flag" "${CFLAGS[@]}" -c "$src" -o "$obj"
      objs+=("$obj")
    done
    ar rcs "$out/liboryvex_bypass.a" "${objs[@]}"
    echo "-> $out/liboryvex_bypass.a ($arch)"
    ;;
  android)
    abi="${1:?abi}"; out="${2:?outdir}"; mkdir -p "$out"
    : "${ANDROID_NDK_HOME:?ANDROID_NDK_HOME is not set}"
    api="${ANDROID_API:-21}"
    case "$abi" in
      arm64-v8a) triple=aarch64-linux-android ;;
      armeabi-v7a) triple=armv7a-linux-androideabi ;;
      x86_64) triple=x86_64-linux-android ;;
      x86) triple=i686-linux-android ;;
      *) echo "unknown abi $abi" >&2; exit 2 ;;
    esac
    host="$(ls "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt" | head -n1)"
    cc="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$host/bin/${triple}${api}-clang"
    "$cc" "${CFLAGS[@]}" -fPIE -pie -Wl,-z,max-page-size=16384 -s -o "$out/liboryvex_bypass.so" "${SRC[@]}"
    echo "-> $out/liboryvex_bypass.so"
    ;;
  *) echo "usage: $0 native|windows|macos|ios|android ..." >&2; exit 2 ;;
esac
