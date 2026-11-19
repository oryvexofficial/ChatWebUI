# OryvexVPN — Source Audit, Applied Fixes & Verification Checklist

## 1. What Was Audited and Fixed

### A. Website & Documentation (`site/`, `README.md`, `.github/workflows/pages.yml`)
- **Full Screen-Record Video Removed**: Deleted `site/video/` (`oryvexvpn-preview.mp4`, `oryvexvpn-preview-poster.png`, `oryvexvpn-preview-readme.jpg`), `site/video-player.js`, and `tools/tests/test_video_player.js`, and removed all `<video>` markup and script tags from `README.md`, `site/index.html`, `site/guide.html`, and `site/style.css`.
- **Dark-First Oryvex Website Redesign**: Rebuilt `site/style.css`, `site/index.html`, `site/downloads.html`, `site/guide.html`, `site/privacy.html`, `site/404.html`, and `site/main.js` with a high-contrast pitch-dark (`#06080C` / `#0F131A`) and electric-blue (`#007BFF`) design system using bundled local fonts (`Inter`, `InterDisplay`, `JetBrainsMono`), local SVG protocol icons, and local PNG country flags, with an optional light theme toggle.
- **Interactive App Preview (`site/preview/`)**: Upgraded `site/preview/index.html`, `site/preview/preview.css`, and `site/preview/preview.js` with all four live telemetry cards (`Download`, `Upload`, `Session`, `Gateway`), connected country flag badges, and the custom **Account Required for Fox** modal.

### B. Fox "No Account" Custom Modal (`apps/shared/`)
- Added `CoreController.hasFoxAccount()` in `apps/shared/lib/src/core/controller.dart` to query `/api/accounts` before starting a Fox connection.
- Added `handleConnectTap()` and `showFoxAccountRequiredModal()` in `apps/shared/lib/src/ui/widgets/fox_controls.dart` and wired them into `ConnectOrb`, `_Cta` (`home_page.dart`), and `_SideStatus` (`app.dart`).
- Added shared `foxAccountsRevisionNotifier` synchronization so `FoxControls(backend: c.backend)` immediately refreshes accounts and locations after sign-in completes from the modal.

### C. Phone Lag & UI Performance Optimization (`apps/shared/`, `apps/android-src/`)
- **Scoped Widget Rebuilds (`app.dart`)**: Replaced the root `ListenableBuilder(listenable: widget.controller)` around `MaterialApp` and `Shell` so `MaterialApp` only rebuilds on `settings.darkTheme` changes and offstage tabs (`SettingsPage`, `LogsPage`) do not rebuild on every 2-second stats tick.
- **Eliminated Expensive GPU Blur Passes (`motion.dart`, `app.dart`, `orb.dart`, `home_page.dart`)**:
  - Replaced `ImageFilter.blur` in `BlurSwitcher` with hardware-accelerated `FadeTransition`, `SlideTransition`, and `ScaleTransition`.
  - Removed `BackdropFilter(filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24))` from the mobile `_TabBar`.
  - Replaced `MaskFilter.blur` in `_OrbPainter` with a `RadialGradient` shadow, wrapped the orb center icon and `_PulseDot` in `RepaintBoundary`, and stopped `_breath` from running a continuous 60fps animation loop once connected and idle.
- **Log Buffer & `LogsPage` Optimization (`controller.dart`, `log_line.dart`, `logs_page.dart`)**:
  - Stopped appending `[=] up ... down ...` telemetry lines to `CoreController.logs` (previously causing 28+ list mutations per minute and `notifyListeners()` churn).
  - Cached `_visible(c)` in `LogsPage` by `logRevision` and replaced the full-list `SelectionArea` wrapper with per-line long-press copy.
- **Android Native Bridge Efficiency (`CoreBus.kt`, `FoxBridge.kt`, `MainActivity.kt`, `android_backend.dart`)**:
  - Optimized `CoreBus.since(after)` to return `emptyList()` in $O(1)$ when `after >= seq` and iterate from the tail via `descendingIterator()`.
  - Cached the Fox dashboard port in `FoxBridge.kt` and avoided rewriting `config.json` to flash storage on read-only status polls.
  - Replaced raw per-call `Thread { ... }.start()` in `MainActivity.kt` with a reusable daemon `ExecutorService`.

### D. Download / Upload / Session / Gateway Cards & Connected Country Flag
- **Fox Telemetry on Android & Desktop (`OryvexVpnService.kt`, `desktop_backend.dart`)**: Both Fox watchers now poll `/api/status` every 2 seconds while running and emit `[+] using fox gateway <gw>`, `[+] connected country <cc> (<Name>)`, and `[=] up ... down ... uptime ... bytes <uB> <dB> rate <uR> <dR>`.
- **Rust Core Byte Accounting (`oryvexcore/src/stats.rs`, `oryvexcore/src/socks.rs`)**: Emitted an immediate initial `[=] up 0 B down 0 B uptime 00:00:00 bytes 0 0` line on reporter startup and counted initial SOCKS5/HTTP `head`, `leftover`, `preamble`, `early`, and `dns_over_stream` bytes.
- **Exit Location Probe & Country Flag UI (`controller.dart`, `home_page.dart`)**: Added `_resolveConnectedLocation()` probing `/cdn-cgi/trace` through the local SOCKS5 proxy upon connection so WireGuard, MASQUE, MASQUE², Gool, Tor, and Fox all resolve their active exit country code (`loc=XX`) and gateway IP, rendered with `CountryFlag` in `_ConnectedCountryBadge` and the **Gateway** card in `_Bento`.

### E. Second Audit Pass — Complete Rebranding & Legacy Cleanup (`fox/core/`, `docs/DOCS.md`, `.github/workflows/apps.yml`)
- Renamed `fox/core/cmd/arman-vpn-core` to `fox/core/cmd/fox-core` and `fox/core/cmd/arman-vpn-tun` to `fox/core/cmd/fox-tun`, and updated `.github/workflows/apps.yml`.
- Updated `fox/core/go.mod` and all Go package imports across `fox/core/` to `github.com/oryvexofficial/OryvexVPN/fox/core`.
- Cleaned up all legacy `Arman VPN`, `arman-vpn`, and `Oblivion` strings across `fox/core/`, `docs/DOCS.md`, `REVIEW.md`, and `PROJECT_AUDIT.md`.

## 2. Automated Verification Run in Sandbox

- `python3 -m unittest discover -s tools/tests -p 'test_*.py' -v` (verifies `test_fox_native.py`, `test_site_assets.py`, and `test_static_routes.py`).
- `node tools/tests/test_cloudflare_worker.mjs` (verifies Cloudflare Worker status page, secret authentication, allowlist, header stripping, and bundle parity).
- `node tools/tests/test_fox_webchannel.js` (verifies Firefox Accounts WebChannel handoff and origin restriction).
- `make -C oryvexcore/bypass test` (compiles and runs the C packet-bypass unit test suite).
