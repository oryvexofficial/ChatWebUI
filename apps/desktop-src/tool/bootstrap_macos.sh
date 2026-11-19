#!/usr/bin/env bash
# Bootstraps Flutter's macOS runner around committed entitlements and configuration.
set -euo pipefail
cd "$(dirname "$0")/.."

flutter create --org com.oryvex --project-name oryvexcore --platforms macos .

# Set user-facing app name to OryvexVPN and minimum macOS version to 12.0.
if [ -f macos/Runner/Configs/AppInfo.xcconfig ]; then
  sed -i.bak 's/PRODUCT_NAME = .*/PRODUCT_NAME = OryvexVPN/' macos/Runner/Configs/AppInfo.xcconfig
  sed -i.bak 's/PRODUCT_BUNDLE_IDENTIFIER = .*/PRODUCT_BUNDLE_IDENTIFIER = com.oryvex.oryvexcore/' macos/Runner/Configs/AppInfo.xcconfig
  rm -f macos/Runner/Configs/AppInfo.xcconfig.bak
fi

if [ -f macos/Runner.xcodeproj/project.pbxproj ]; then
  sed -i.bak 's/MACOSX_DEPLOYMENT_TARGET = [0-9.]*;/MACOSX_DEPLOYMENT_TARGET = 12.0;/g' macos/Runner.xcodeproj/project.pbxproj
  rm -f macos/Runner.xcodeproj/project.pbxproj.bak
fi

if [ -f macos/Podfile ]; then
  sed -i.bak "s/^# *platform :osx.*/platform :osx, '12.0'/" macos/Podfile
  sed -i.bak "s/^platform :osx.*/platform :osx, '12.0'/" macos/Podfile
  rm -f macos/Podfile.bak
  # Force every CocoaPods target (such as flutter_inappwebview_macos) to build for macOS 12.0+
  # so Xcode 26 SDK availability checks (ASWebAuthenticationPresentationContextProviding) succeed.
  python3 - <<'PYPOD'
from pathlib import Path

podfile = Path("macos/Podfile")
content = podfile.read_text(encoding="utf-8")
if "MACOSX_DEPLOYMENT_TARGET" not in content:
    needle = "flutter_additional_macos_build_settings(target)"
    replacement = "\n".join([
        "flutter_additional_macos_build_settings(target)",
        "    target.build_configurations.each do |config|",
        "      config.build_settings['MACOSX_DEPLOYMENT_TARGET'] = '12.0'",
        "    end",
    ])
    if needle in content:
        podfile.write_text(content.replace(needle, replacement, 1), encoding="utf-8")
PYPOD
fi

git checkout -- test/widget_test.dart 2>/dev/null || true
flutter pub get
echo "macOS desktop bootstrap done"
