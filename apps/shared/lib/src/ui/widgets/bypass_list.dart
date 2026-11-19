import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/bypass_services.dart';
import '../../core/settings.dart';
import '../theme.dart';

/// Opens the Bypass List modal for [protocol], fetching `/bypasslist/<ConnectionName>/bypass.txt`
/// and exact matching `<ServiceName>.svg`/`.png` icons directly from the repository.
Future<void> showBypassList(
  BuildContext context, {
  required String protocol,
  int? socksPort,
}) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Bypass List',
    barrierColor: Colors.black.withValues(alpha: 0.58),
    transitionDuration: const Duration(milliseconds: 240),
    pageBuilder: (context, animation, secondaryAnimation) => _BypassListDialog(
      protocol: protocol,
      socksPort: socksPort,
    ),
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: curved,
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.94, end: 1).animate(curved),
          child: child,
        ),
      );
    },
  );
}

class _BypassListDialog extends StatefulWidget {
  const _BypassListDialog({required this.protocol, this.socksPort});

  final String protocol;
  final int? socksPort;

  @override
  State<_BypassListDialog> createState() => _BypassListDialogState();
}

class _BypassListDialogState extends State<_BypassListDialog> {
  late Future<BypassListResult> _future;

  @override
  void initState() {
    super.initState();
    _future = fetchBypassList(widget.protocol, socksPort: widget.socksPort);
  }

  void _reload() {
    setState(() {
      _future = fetchBypassList(
        widget.protocol,
        socksPort: widget.socksPort,
        forceRefresh: true,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final connectionName = Choices.protocols[widget.protocol] ?? widget.protocol;

    return Center(
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 468,
          constraints: BoxConstraints(maxHeight: size.height - 48),
          margin: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Ox.card,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: Ox.hairlineSoft),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 48,
                offset: const Offset(0, 20),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 12, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          Flexible(
                            child: Text(
                              'Bypass List',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Ox.headline(22),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: Ox.blueWash,
                              borderRadius: BorderRadius.circular(99),
                              border: Border.all(color: Ox.blue.withValues(alpha: 0.28)),
                            ),
                            child: Text(
                              connectionName,
                              style: Ox.body(12.5, weight: FontWeight.w600, color: Ox.link),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Refresh list',
                      onPressed: _reload,
                      icon: Icon(Icons.refresh_rounded, color: Ox.secondary),
                    ),
                    IconButton(
                      tooltip: 'Close',
                      onPressed: () => Navigator.of(context).pop(),
                      icon: Icon(Icons.close_rounded, color: Ox.secondary),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: FutureBuilder<BypassListResult>(
                  future: _future,
                  builder: (context, snap) {
                    if (snap.connectionState != ConnectionState.done) {
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(24, 32, 24, 36),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const SizedBox(
                                width: 28,
                                height: 28,
                                child: CircularProgressIndicator(strokeWidth: 2.5),
                              ),
                              const SizedBox(height: 14),
                              Text(
                                'Fetching Bypass List for $connectionName…',
                                textAlign: TextAlign.center,
                                style: Ox.body(14, color: Ox.secondary),
                              ),
                            ],
                          ),
                        ),
                      );
                    }

                    final result = snap.data;
                    if (result == null || result.status == BypassListStatus.error) {
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.cloud_off_rounded, size: 36, color: Ox.warn),
                              const SizedBox(height: 12),
                              Text(
                                result?.errorMessage ?? 'Could not load the Bypass List.',
                                textAlign: TextAlign.center,
                                style: Ox.body(14, color: Ox.secondary),
                              ),
                              const SizedBox(height: 16),
                              FilledButton.icon(
                                onPressed: _reload,
                                icon: const Icon(Icons.refresh_rounded, size: 18),
                                label: const Text('Try again'),
                              ),
                            ],
                          ),
                        ),
                      );
                    }

                    if (result.status == BypassListStatus.notRegistered || result.entries.isEmpty) {
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 52,
                                height: 52,
                                decoration: BoxDecoration(
                                  color: Ox.field,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: Ox.hairlineSoft),
                                ),
                                child: Icon(Icons.list_alt_rounded, size: 26, color: Ox.tertiary),
                              ),
                              const SizedBox(height: 14),
                              Text(
                                'No list is registered',
                                textAlign: TextAlign.center,
                                style: Ox.body(16, weight: FontWeight.w600),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'No bypass list is registered for $connectionName in the repository.',
                                textAlign: TextAlign.center,
                                style: Ox.body(14, color: Ox.secondary),
                              ),
                            ],
                          ),
                        ),
                      );
                    }

                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(24, 6, 24, 14),
                          child: Text(
                            'Supported services and platforms for $connectionName, loaded live from the repository.',
                            style: Ox.body(14, color: Ox.secondary),
                          ),
                        ),
                        Flexible(
                          child: ListView.separated(
                            shrinkWrap: true,
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
                            itemCount: result.entries.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, i) => _ServiceRow(entry: result.entries[i]),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServiceRow extends StatelessWidget {
  const _ServiceRow({required this.entry});

  final BypassServiceEntry entry;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${entry.name}. ${entry.description}',
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 14, 10),
        decoration: BoxDecoration(
          color: Ox.nav,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Ox.hairlineSoft),
        ),
        child: Row(
          children: [
            _ServiceIcon(entry: entry),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(entry.name, style: Ox.body(15, weight: FontWeight.w600)),
                  if (entry.description.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(entry.description, style: Ox.body(13.5, color: Ox.secondary)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServiceIcon extends StatelessWidget {
  const _ServiceIcon({required this.entry});

  final BypassServiceEntry entry;

  @override
  Widget build(BuildContext context) {
    if (entry.svgIcon != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: SvgPicture.string(
          entry.svgIcon!,
          width: 36,
          height: 36,
          fit: BoxFit.contain,
        ),
      );
    }
    if (entry.pngIcon != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.memory(
          entry.pngIcon!,
          width: 36,
          height: 36,
          fit: BoxFit.cover,
        ),
      );
    }
    final letter = entry.name.isNotEmpty ? entry.name.substring(0, 1).toUpperCase() : '?';
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: Ox.blueWash,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Ox.blue.withValues(alpha: 0.25)),
      ),
      alignment: Alignment.center,
      child: Text(
        letter,
        style: Ox.body(15, weight: FontWeight.w700, color: Ox.link),
      ),
    );
  }
}
