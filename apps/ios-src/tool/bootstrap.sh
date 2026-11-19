#!/usr/bin/env bash
# Bootstraps Flutter's iOS/iPadOS project around committed Swift, NetworkExtension, and entitlements.
set -euo pipefail
cd "$(dirname "$0")/.."

flutter create --org com.oryvex --project-name oryvexcore --platforms ios --ios-language swift .

if [ -f ios/Podfile ]; then
  sed -i.bak "s/^# *platform :ios.*/platform :ios, '15.0'/" ios/Podfile
  sed -i.bak "s/^platform :ios.*/platform :ios, '15.0'/" ios/Podfile
  rm -f ios/Podfile.bak
fi

if command -v ruby >/dev/null 2>&1 && ruby -e "require 'xcodeproj'" 2>/dev/null; then
  ruby tool/configure_ios_xcode.rb
else
  echo "::notice::xcodeproj gem not installed; skipping automatic Xcode target wiring (install via 'gem install xcodeproj')."
fi

git checkout -- test/widget_test.dart 2>/dev/null || true
flutter pub get
echo "iOS / iPadOS bootstrap done"
