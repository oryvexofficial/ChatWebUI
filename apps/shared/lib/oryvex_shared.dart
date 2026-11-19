/// Everything the OryvexCore desktop (Windows, macOS) and mobile (Android, iOS, iPadOS) apps share.
library;

export 'src/app.dart' show runOryvex, OryvexApp;
export 'src/core/android_backend.dart' show AndroidBackend;
export 'src/core/backend.dart';
export 'src/core/controller.dart';
export 'src/core/desktop_backend.dart' show DesktopBackend;
export 'src/core/ios_backend.dart' show IosBackend;
export 'src/core/mac_proxy.dart' show MacProxy;
export 'src/core/mac_startup.dart' show MacStartup;
export 'src/core/settings.dart';
