# OryvexVPN Changelog (Created by Muvixo)

## Unreleased: UI Performance Overhaul, Fox Account Modal, Live Telemetry & Country Flags

- **Removed screen-recording preview video**: Removed `site/video/`, `site/video-player.js`, and all `<video>` embeds from the website and `README.md`, replacing them with a redesigned dark-first website and upgraded interactive browser preview (`site/preview/`).
- **Fox "Account Required" Custom Modal**: Clicking Connect when the **Fox** route is selected and no Firefox Account is configured now opens a custom Oryvex modal (`Account Required for Fox`) with direct actions to **Create / Sign in with Mozilla** or sign in with Email & Password.
- **Fixed phone lag & frame drops**:
  - Scoped `OryvexApp` and `Shell` listeners so `MaterialApp` only rebuilds on theme changes and offstage tabs (`Settings`, `Activity`) do not rebuild on every 2-second stats tick.
  - Removed expensive per-frame `ImageFilter.blur` in `BlurSwitcher`, `BackdropFilter` on the mobile navigation bar, `MaskFilter.blur` in `_OrbPainter`, and continuous 60fps idle breathing repaints after connecting.
  - Filtered `[=] up ... down ...` stats lines out of the user activity log buffer and cached `LogsPage` visible entries by `logRevision`.
  - Optimized Android `CoreBus.since()` to short-circuit in $O(1)$, cached Fox dashboard port configuration in `FoxBridge.kt`, and replaced per-request thread spawning in `MainActivity.kt` with a bounded daemon executor.
- **Fixed Download, Upload, Session, and Gateway connection cards**:
  - Added live 2-second Fox telemetry emission (`[+] using fox gateway`, `[+] connected country`, and `[=] up ... down ... rate ...`) on both Android (`OryvexVpnService.kt`) and Windows (`desktop_backend.dart`).
  - Added initial byte accounting in `oryvexcore/src/socks.rs` and immediate baseline reporting in `oryvexcore/src/stats.rs`.
  - Ensured all four metric cards (`Download`, `Upload`, `Session`, `Gateway`) are always visible and populated across every route.
- **Connected Country & Flag Display**:
  - Added connected country detection across Fox, Tor, WireGuard, MASQUE, MASQUE², and Gool (via Fox status, Tor exit logs, and SOCKS5 `/cdn-cgi/trace` probing).
  - Displayed the connected country name and bundled flag (`CountryFlag`) under the Connect headline and inside the **Gateway** card.
- **Fox Go Core Cleanup**: Renamed `cmd/fox-core` and `cmd/fox-tun`, updated the Go module path to `github.com/oryvexofficial/OryvexVPN/fox/core`, and cleaned up legacy upstream naming across code and documentation.

## Unreleased: Android tunnel and updater fixes

- Android Fox VPN now loads and probes the native tunnel before starting it, fixing the missing JNI implementation error.
- Update buttons now use GitHub's direct release-download URL instead of the asset metadata API endpoint, and discard stale cached API URLs.

## Unreleased: Fox system proxy

- Fox's Connect controls now include an optional **Set system proxy** switch on supported desktops. It keeps manual SOCKS5 setup available and restores the previous system proxy setting when Fox is turned off.

## Unreleased: MITM route and About texts

- New **MITM** connection (`oryvexcore --mitm`, `--protocol mitm`): domain fronting for Google/YouTube, Meta (Instagram, WhatsApp, Facebook) and Fastly sites (Reddit, CNN, BuzzFeed...), built into the core.
- The core makes a certificate authority per device (`oryvexcore-mitm/`); the app installs it (Windows: current-user trusted roots; Android: saves to Downloads and opens Settings).
- Every connection has **About this connection** in the app (Connect page and Settings): what it is, how it works, what it is good at, its limits and where it runs.
