import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

import 'args.dart';
import 'backend.dart';
import 'settings.dart';

/// Talks to the iOS / iPadOS native bridge (`AppDelegate.swift`, `CoreBridge.swift`,
/// `FoxBridge.swift`, and `OryvexTunnelExtension`'s `PacketTunnelProvider.swift`).
///
/// Mirrors [AndroidBackend]'s channel protocol (`oryvexcore/core` & `oryvexcore/events`) so the
/// shared Flutter UI, telemetry dashboard, Fox controls, and Bypass List work identically on
/// iPhone and iPadOS.
class IosBackend implements CoreBackend {
  IosBackend();

  static const _method = MethodChannel('oryvexcore/core');
  static const _eventChannel = EventChannel('oryvexcore/events');
  static const _pollEvery = Duration(milliseconds: 2500);

  final _events = StreamController<BackendEvent>.broadcast();
  StreamSubscription<dynamic>? _native;
  bool _attached = false;

  int _seq = 0;
  int _run = 0;
  bool _vpnUp = false;
  final Set<int> _exited = <int>{};

  Timer? _poll;
  bool _polling = false;
  bool _askedNotifications = false;

  Completer<void>? _stopped;
  int _stoppingRun = 0;

  @override
  Stream<BackendEvent> get events {
    _attach();
    return _events.stream;
  }

  @override
  bool get isAndroid => false;

  @override
  bool get supportsVpn => true;

  @override
  bool get supportsPsiphon => false;

  @override
  bool get supportsSystemProxy => false;

  @override
  String get platformLabel => 'iOS';

  static int _int(Object? v) => v is int ? v : (v is num ? v.toInt() : 0);

  void _attach() {
    if (_attached) return;
    _attached = true;
    try {
      _native = _eventChannel.receiveBroadcastStream().listen(
        _onNative,
        onError: (Object _) {},
        cancelOnError: false,
      );
    } catch (_) {
      _native = null;
    }
  }

  void _onNative(dynamic event) {
    if (event is! Map) return;
    final run = _int(event['run']);
    switch (event['type']) {
      case 'line':
        final line = event['line'];
        if (line is String) _line(run, _int(event['seq']), line);
      case 'exit':
        final code = event['code'];
        _exit(run, code is int ? code : null);
      case 'vpn':
        final error = event['error'];
        _vpn(run, event['up'] == true, error is String ? error : null);
    }
  }

  void _line(int run, int seq, String line) {
    if (seq > 0) {
      if (seq <= _seq) return;
      _seq = seq;
    }
    _events.add(LineEvent(run, line));
  }

  void _vpn(int run, bool up, String? error) {
    _vpnUp = up;
    _events.add(VpnEvent(run, up, error));
  }

  void _exit(int run, int? code) {
    if (run != 0 && !_exited.add(run)) return;
    _events.add(ExitEvent(run, code));
    final waiting = _stopped;
    if (waiting != null && !waiting.isCompleted && (run == _stoppingRun || _stoppingRun == 0)) {
      waiting.complete();
    }
    if (run == _run) _stopPolling();
  }

  void _startPolling(int run) {
    _run = run;
    _poll ??= Timer.periodic(_pollEvery, (_) => _pull());
  }

  void _stopPolling() {
    _poll?.cancel();
    _poll = null;
  }

  Future<void> _pull() async {
    if (_polling) return;
    _polling = true;
    try {
      final r = await _method.invokeMapMethod<String, dynamic>('since', {'seq': _seq});
      if (r == null) return;
      final run = _int(r['run']);
      final running = r['running'] == true;
      final up = r['vpnUp'] == true;
      final raw = r['lines'];
      if (raw is List) {
        for (final entry in raw) {
          if (entry is Map) {
            final line = entry['line'];
            if (line is String) _line(run, _int(entry['seq']), line);
          }
        }
      }
      if (up != _vpnUp) _vpn(run, up, null);
      if (!running && _run != 0 && (run == _run || run == 0)) {
        _exit(_run, null);
      }
    } catch (_) {
    } finally {
      _polling = false;
    }
  }

  @override
  Future<BackendStatus> status() async {
    _attach();
    try {
      final r = await _method.invokeMapMethod<String, dynamic>('status');
      if (r == null) return const BackendStatus(running: false);
      final lines = <String>[];
      final raw = r['lines'];
      if (raw is List) {
        for (final x in raw) {
          if (x is String) lines.add(x);
        }
      }
      final seq = _int(r['seq']);
      if (seq > _seq) _seq = seq;
      final running = r['running'] == true;
      final run = _int(r['run']);
      _vpnUp = r['vpnUp'] == true;
      if (running && run != 0) _startPolling(run);
      return BackendStatus(
        running: running,
        run: run,
        lines: lines,
        vpnUp: _vpnUp,
      );
    } catch (_) {
      return const BackendStatus(running: false);
    }
  }

  @override
  Future<Map<String, dynamic>> foxRequest(String method, String path, [Map<String, dynamic>? body]) async {
    try {
      final raw = await _method.invokeMethod<String>('foxRequest', {
        'method': method,
        'path': path,
        if (body != null) 'body': jsonEncode(body),
      });
      final value = jsonDecode(raw ?? '{}');
      if (value is Map<String, dynamic>) return value;
      throw BackendException('Unexpected response from Fox.');
    } on PlatformException catch (e) {
      throw BackendException(e.message ?? 'Fox service is unavailable on this device.');
    } on MissingPluginException {
      throw BackendException('Fox is not wired into this iOS build.');
    }
  }

  @override
  Future<void> start(CoreSettings settings, int run) async {
    _attach();
    if (!_askedNotifications) {
      _askedNotifications = true;
      try {
        await _method.invokeMethod<void>('requestNotifications');
      } catch (_) {}
    }

    final dir = await _method.invokeMethod<String>('configDir') ?? '';
    final args = buildCoreArgs(
      settings,
      configPath: '$dir/oryvexcore.toml',
      android: true, // Mobile args (no desktop Psiphon or system proxy).
    );

    _exited.remove(run);
    _vpnUp = false;
    try {
      await _method.invokeMethod<bool>('start', {
        'args': args,
        'vpn': settings.vpnMode,
        'socksPort': settings.socksPort,
        'fakeDns': settings.fakeDns,
        'ipv6': settings.vpnIpv6,
        'runId': run,
        'protocol': settings.protocol,
      });
    } on PlatformException catch (e) {
      throw BackendException(e.message ?? e.code);
    } on MissingPluginException {
      throw BackendException('The iOS VPN bridge is missing from this build.');
    }
    _startPolling(run);
  }

  @override
  Future<void> stop() async {
    _stoppingRun = _run;
    final wait = Completer<void>();
    _stopped = wait;
    try {
      await _method.invokeMethod<bool>('stop');
    } catch (_) {}
    await wait.future.timeout(const Duration(seconds: 5), onTimeout: () {});
    _stopped = null;
    _stopPolling();
  }

  @override
  Future<void> shutdown() async {
    _stopPolling();
    await _native?.cancel();
    await _events.close();
  }
}
