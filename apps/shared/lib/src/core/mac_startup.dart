import 'dart:io';

/// "Launch at macOS sign-in": manages a per-user LaunchAgent plist in
/// `~/Library/LaunchAgents/com.oryvex.oryvexcore.plist`.
class MacStartup {
  MacStartup._();

  static const label = 'com.oryvex.oryvexcore';
  static const backgroundFlag = '--background';

  static String get _plistPath {
    final home = Platform.environment['HOME'] ?? '.';
    return '$home/Library/LaunchAgents/$label.plist';
  }

  static bool isEnabled() {
    if (!Platform.isMacOS) return false;
    return File(_plistPath).existsSync();
  }

  static bool apply({required bool enabled, required bool inTray}) {
    if (!Platform.isMacOS) return false;
    try {
      final file = File(_plistPath);
      if (!enabled) {
        if (file.existsSync()) file.deleteSync();
        return true;
      }
      final exe = Platform.resolvedExecutable;
      final args = inTray
          ? '    <string>$exe</string>\n    <string>$backgroundFlag</string>'
          : '    <string>$exe</string>';
      final plist = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
$args
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
''';
      file.parent.createSync(recursive: true);
      file.writeAsStringSync(plist);
      return true;
    } catch (_) {
      return false;
    }
  }
}
