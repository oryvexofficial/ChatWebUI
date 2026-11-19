import 'dart:convert';
import 'dart:io';

/// Sets and restores the macOS system HTTP/HTTPS proxy via `/usr/sbin/networksetup`.
///
/// The previous proxy state for each active network service is saved to
/// `~/Library/Application Support/OryvexCore/proxy-backup.json` so a crash while connected is
/// undone cleanly on the next launch.
class MacProxy {
  MacProxy._();

  static const _networksetup = '/usr/sbin/networksetup';

  static String get _backupPath {
    final home = Platform.environment['HOME'] ?? '.';
    return '$home/Library/Application Support/OryvexCore/proxy-backup.json';
  }

  static bool get hasBackup => File(_backupPath).existsSync();

  static List<String> _listServices() {
    final res = Process.runSync(_networksetup, ['-listallnetworkservices']);
    if (res.exitCode != 0) return const [];
    final out = <String>[];
    for (final raw in (res.stdout as String).split('\n')) {
      final line = raw.trim();
      if (line.isEmpty || line.startsWith('An asterisk') || line.startsWith('*')) continue;
      out.add(line);
    }
    return out;
  }

  static Map<String, dynamic> _readProxy(String service, String flag) {
    final res = Process.runSync(_networksetup, [flag, service]);
    if (res.exitCode != 0) return const {'enabled': false, 'server': '', 'port': ''};
    var enabled = false;
    var server = '';
    var port = '';
    for (final line in (res.stdout as String).split('\n')) {
      final idx = line.indexOf(':');
      if (idx <= 0) continue;
      final k = line.substring(0, idx).trim().toLowerCase();
      final v = line.substring(idx + 1).trim();
      if (k == 'enabled') enabled = v.toLowerCase() == 'yes';
      if (k == 'server') server = v;
      if (k == 'port') port = v;
    }
    return {'enabled': enabled, 'server': server, 'port': port};
  }

  /// Points macOS Web Proxy (HTTP) and Secure Web Proxy (HTTPS) at [hostPort].
  static bool enable(String hostPort) {
    if (!Platform.isMacOS) return false;
    try {
      final backupFile = File(_backupPath);
      if (backupFile.existsSync() && !restore()) return false;

      final colon = hostPort.lastIndexOf(':');
      if (colon <= 0) return false;
      final host = hostPort.substring(0, colon);
      final port = hostPort.substring(colon + 1);

      final services = _listServices();
      if (services.isEmpty) return false;

      final saved = <String, Map<String, dynamic>>{};
      for (final svc in services) {
        saved[svc] = {
          'http': _readProxy(svc, '-getwebproxy'),
          'https': _readProxy(svc, '-getsecurewebproxy'),
        };
      }

      backupFile.parent.createSync(recursive: true);
      backupFile.writeAsStringSync(jsonEncode(saved));

      var anyApplied = false;
      for (final svc in services) {
        final r1 = Process.runSync(_networksetup, ['-setwebproxy', svc, host, port]);
        final r2 = Process.runSync(_networksetup, ['-setsecurewebproxy', svc, host, port]);
        final r3 = Process.runSync(_networksetup, ['-setwebproxystate', svc, 'on']);
        final r4 = Process.runSync(_networksetup, ['-setsecurewebproxystate', svc, 'on']);
        if (r1.exitCode == 0 && r2.exitCode == 0 && r3.exitCode == 0 && r4.exitCode == 0) {
          anyApplied = true;
        }
      }
      if (!anyApplied) {
        restore();
        return false;
      }
      return true;
    } catch (_) {
      restore();
      return false;
    }
  }

  /// Restores the exact macOS proxy settings saved before [enable].
  static bool restore() {
    if (!Platform.isMacOS) return true;
    final backupFile = File(_backupPath);
    if (!backupFile.existsSync()) return true;
    try {
      final saved = jsonDecode(backupFile.readAsStringSync()) as Map<String, dynamic>;
      for (final entry in saved.entries) {
        final svc = entry.key;
        final cfg = entry.value as Map<String, dynamic>;
        final http = cfg['http'] as Map<String, dynamic>?;
        final https = cfg['https'] as Map<String, dynamic>?;
        if (http != null) {
          if (http['enabled'] == true && (http['server'] as String? ?? '').isNotEmpty) {
            Process.runSync(_networksetup, [
              '-setwebproxy',
              svc,
              http['server'] as String,
              http['port'] as String? ?? '',
            ]);
            Process.runSync(_networksetup, ['-setwebproxystate', svc, 'on']);
          } else {
            Process.runSync(_networksetup, ['-setwebproxystate', svc, 'off']);
          }
        }
        if (https != null) {
          if (https['enabled'] == true && (https['server'] as String? ?? '').isNotEmpty) {
            Process.runSync(_networksetup, [
              '-setsecurewebproxy',
              svc,
              https['server'] as String,
              https['port'] as String? ?? '',
            ]);
            Process.runSync(_networksetup, ['-setsecurewebproxystate', svc, 'on']);
          } else {
            Process.runSync(_networksetup, ['-setsecurewebproxystate', svc, 'off']);
          }
        }
      }
      backupFile.deleteSync();
      return true;
    } catch (_) {
      return false;
    }
  }
}
