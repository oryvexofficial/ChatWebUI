import 'package:flutter_test/flutter_test.dart';
import 'package:oryvex_shared/oryvex_shared.dart';

void main() {
  test('IosBackend exposes mobile VPN capabilities', () {
    final backend = IosBackend();
    expect(backend.isAndroid, isFalse);
    expect(backend.supportsVpn, isTrue);
    expect(backend.supportsPsiphon, isFalse);
    expect(backend.supportsSystemProxy, isFalse);
    expect(backend.platformLabel, 'iOS');
  });
}
