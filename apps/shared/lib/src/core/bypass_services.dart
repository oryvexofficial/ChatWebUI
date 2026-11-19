import 'dart:typed_data';

import 'https_client.dart';
import 'settings.dart';
import 'version.dart';

/// One service entry parsed from `/bypasslist/<ConnectionName>/bypass.txt` in the repository.
class BypassServiceEntry {
  const BypassServiceEntry({
    required this.name,
    required this.description,
    this.svgIcon,
    this.pngIcon,
  });

  /// Exact service/platform name from `bypass.txt` (matches `<name>.svg` or `<name>.png`).
  final String name;

  /// Description line(s) from `bypass.txt`.
  final String description;

  /// Raw SVG markup fetched from `/bypasslist/<ConnectionName>/<name>.svg`, if present.
  final String? svgIcon;

  /// Raw PNG bytes fetched from `/bypasslist/<ConnectionName>/<name>.png`, if present.
  final Uint8List? pngIcon;

  BypassServiceEntry copyWith({String? svgIcon, Uint8List? pngIcon}) => BypassServiceEntry(
        name: name,
        description: description,
        svgIcon: svgIcon ?? this.svgIcon,
        pngIcon: pngIcon ?? this.pngIcon,
      );
}

enum BypassListStatus { loaded, notRegistered, error }

/// Result of fetching `/bypasslist/<ConnectionName>/` from the repository.
class BypassListResult {
  const BypassListResult({
    required this.connectionName,
    required this.folderName,
    required this.status,
    this.entries = const [],
    this.errorMessage,
  });

  final String connectionName;
  final String folderName;
  final BypassListStatus status;
  final List<BypassServiceEntry> entries;
  final String? errorMessage;
}

/// Maps an internal protocol key to its folder name inside `/bypasslist/` in the repository.
String bypassFolderNameForProtocol(String protocol) => switch (protocol) {
      'auto' => 'Auto',
      'wg' => 'WireGuard',
      'masque' => 'MASQUE',
      'mim' => 'MASQUE2',
      'gool' => 'Gool',
      'tor' => 'Tor',
      'bypass' => 'Bypass',
      'fox' => 'Fox',
      _ => Choices.protocols[protocol] ?? protocol,
    };

/// Parses the repository `bypass.txt` format:
///
/// ```text
/// YouTube:
/// Site and App, Video server included
/// ```
///
/// Also accepts single-line `Name: Description` entries when present.
List<BypassServiceEntry> parseBypassTxt(String content) {
  final entries = <BypassServiceEntry>[];
  String? currentName;
  final descLines = <String>[];

  void flush() {
    if (currentName != null && currentName!.isNotEmpty) {
      entries.add(BypassServiceEntry(
        name: currentName!,
        description: descLines.join(' ').trim(),
      ));
    }
    currentName = null;
    descLines.clear();
  }

  for (final rawLine in content.replaceAll('\r\n', '\n').split('\n')) {
    final line = rawLine.trim();
    if (line.isEmpty) {
      flush();
      continue;
    }
    if (line.startsWith('#')) continue;

    if (line.endsWith(':')) {
      flush();
      currentName = line.substring(0, line.length - 1).trim();
    } else if (currentName == null) {
      final colon = line.indexOf(':');
      if (colon > 0) {
        final name = line.substring(0, colon).trim();
        final desc = line.substring(colon + 1).trim();
        if (name.isNotEmpty) {
          entries.add(BypassServiceEntry(name: name, description: desc));
        }
      }
    } else {
      descLines.add(line);
    }
  }
  flush();
  return entries;
}

const _rawHost = 'raw.githubusercontent.com';
const _headers = <String, String>{'User-Agent': 'OryvexVPN-bypass-list'};

final Map<String, BypassListResult> _bypassListCache = <String, BypassListResult>{};

/// Clears the in-memory bypass list cache (used by Refresh and tests).
void clearBypassListCache([String? protocol]) {
  if (protocol == null) {
    _bypassListCache.clear();
  } else {
    _bypassListCache.remove(protocol);
  }
}

/// Fetches `/bypasslist/<ConnectionName>/bypass.txt` and matching `<ServiceName>.svg`/`.png`
/// icons from the GitHub repository (`kReleasesRepo`, `main` branch).
Future<BypassListResult> fetchBypassList(
  String protocol, {
  int? socksPort,
  bool forceRefresh = false,
}) async {
  if (!forceRefresh && _bypassListCache.containsKey(protocol)) {
    return _bypassListCache[protocol]!;
  }

  final connectionName = Choices.protocols[protocol] ?? protocol;
  final folderName = bypassFolderNameForProtocol(protocol);
  final encodedFolder = Uri.encodeComponent(folderName);
  final txtPath = '/$kReleasesRepo/main/bypasslist/$encodedFolder/bypass.txt';

  HttpsBytesReply? reply;
  Object? lastError;

  // Try via SOCKS5 first when connected, then fall back to direct HTTPS (or vice versa).
  final portsToTry = <int?>[if (socksPort != null) socksPort, null];
  for (final port in portsToTry) {
    try {
      reply = await HttpsGet.fetchBytes(
        _rawHost,
        txtPath,
        socksPort: port,
        headers: _headers,
        timeout: const Duration(seconds: 12),
      );
      lastError = null;
      break;
    } on Object catch (e) {
      lastError = e;
    }
  }

  if (reply == null) {
    return BypassListResult(
      connectionName: connectionName,
      folderName: folderName,
      status: BypassListStatus.error,
      errorMessage: 'Could not reach the repository. Check your connection and try again.',
    );
  }

  if (reply.statusCode == 404) {
    final result = BypassListResult(
      connectionName: connectionName,
      folderName: folderName,
      status: BypassListStatus.notRegistered,
    );
    _bypassListCache[protocol] = result;
    return result;
  }

  if (!reply.ok) {
    return BypassListResult(
      connectionName: connectionName,
      folderName: folderName,
      status: BypassListStatus.error,
      errorMessage: 'Repository returned HTTP ${reply.statusCode} ($lastError).',
    );
  }

  final parsed = parseBypassTxt(reply.body);
  if (parsed.isEmpty) {
    final result = BypassListResult(
      connectionName: connectionName,
      folderName: folderName,
      status: BypassListStatus.notRegistered,
    );
    _bypassListCache[protocol] = result;
    return result;
  }

  // Remember whichever port worked for bypass.txt so icon fetches reuse it directly.
  final activePort = socksPort;
  final enriched = await Future.wait(
    parsed.map((entry) => _fetchEntryIcon(encodedFolder, entry, socksPort: activePort)),
  );

  final result = BypassListResult(
    connectionName: connectionName,
    folderName: folderName,
    status: BypassListStatus.loaded,
    entries: enriched,
  );
  _bypassListCache[protocol] = result;
  return result;
}

Future<BypassServiceEntry> _fetchEntryIcon(
  String encodedFolder,
  BypassServiceEntry entry, {
  int? socksPort,
}) async {
  final encodedName = Uri.encodeComponent(entry.name);
  final base = '/$kReleasesRepo/main/bypasslist/$encodedFolder/$encodedName';

  // Exact match: <ServiceName>.svg first, then <ServiceName>.png.
  final svg = await _tryFetch('$base.svg', socksPort: socksPort);
  if (svg != null && svg.ok && svg.bodyBytes.isNotEmpty) {
    final text = svg.body.trim();
    if (text.contains('<svg')) {
      return entry.copyWith(svgIcon: text);
    }
  }

  final png = await _tryFetch('$base.png', socksPort: socksPort);
  if (png != null && png.ok && png.bodyBytes.isNotEmpty) {
    return entry.copyWith(pngIcon: png.bodyBytes);
  }

  return entry;
}

Future<HttpsBytesReply?> _tryFetch(String path, {int? socksPort}) async {
  final ports = <int?>[if (socksPort != null) socksPort, null];
  for (final port in ports) {
    try {
      return await HttpsGet.fetchBytes(
        _rawHost,
        path,
        socksPort: port,
        headers: _headers,
        timeout: const Duration(seconds: 10),
      );
    } on Object {
      // Try next route or return null.
    }
  }
  return null;
}
