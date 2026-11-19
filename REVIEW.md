# OryvexVPN — Deep Code & Architecture Review

## Overview

This document records the comprehensive two-pass engineering review and overhaul of **OryvexVPN** across the shared Flutter package (`apps/shared/`), Android native bridge (`apps/android-src/`), Rust core engine (`oryvexcore/`), Fox Go engine (`fox/core/`), and static website + interactive preview (`site/`).

See [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) for the detailed release checklist and component verification matrix.

## Summary of Resolved Issues

1. **Screen-Record Video Removal (`site/` & `README.md`)**:
   - Removed `site/video/` (`oryvexvpn-preview.mp4`, `oryvexvpn-preview-poster.png`, `oryvexvpn-preview-readme.jpg`), `site/video-player.js`, and `tools/tests/test_video_player.js`.
   - Removed all `<video>` embeds, video player scripts, and `.mp4` download links from `README.md`, `site/index.html`, `site/guide.html`, `site/style.css`, and `.github/workflows/pages.yml`.

2. **Fox "No Account" Custom Modal on Connect (`fox_controls.dart`, `controller.dart`, `home_page.dart`, `app.dart`, `site/preview/`)**:
   - Added `CoreController.hasFoxAccount()` querying `/api/accounts` and wired `handleConnectTap(context, controller)` into the main `ConnectOrb`, the primary `_Cta` button, and the desktop sidebar `_SideStatus` Connect button.
   - Added `showFoxAccountRequiredModal()` presenting a custom Oryvex modal (`Account Required for Fox`) with direct actions to **Create / Sign in with Mozilla** (`FoxWebSignIn`) or **Other sign-in (Email & Password)** (`_FoxSignIn`), automatically refreshing `FoxControls` via `foxAccountsRevisionNotifier`.

3. **Phone Lag & Frame-Drop Root Causes Fixed**:
   - **Root `OryvexApp` & `Shell` Rebuild Isolation (`app.dart`)**: Scoped `OryvexApp` theme listening to `settings.darkTheme` only and removed the top-level `ListenableBuilder(listenable: widget.controller)` wrapping all 3 tabs in `Shell`, preventing offstage `SettingsPage` and `LogsPage` rebuilds on every 2-second stats tick.
   - **Zero-Blur Transitions & Mobile Navigation Bar (`motion.dart`, `app.dart`, `orb.dart`)**: Replaced per-frame `ImageFilter.blur` in `BlurSwitcher` with hardware-accelerated fade/slide/scale transitions, removed the 24px `BackdropFilter` from the mobile floating `_TabBar`, replaced `_OrbPainter`'s `MaskFilter.blur` disc shadow with a zero-blur `RadialGradient`, and stopped `_breath` from running an infinite 60fps repaint loop while idle-connected.
   - **Log Stream & `LogsPage` Optimization (`controller.dart`, `log_line.dart`, `logs_page.dart`)**: Filtered `[=] up ... down ...` telemetry lines out of the user log list before appending, cached filtered log lists by `logRevision`, and replaced the full-list `SelectionArea` with per-line long-press copy.
   - **Android Bridge & Polling Optimization (`CoreBus.kt`, `FoxBridge.kt`, `MainActivity.kt`, `android_backend.dart`)**: Short-circuited `CoreBus.since(after)` in $O(1)$ when no new events exist, cached the Fox dashboard port in `FoxBridge.kt` to avoid rewriting `config.json` on every poll, replaced per-call `Thread` creation in `MainActivity.kt` with a bounded daemon `ExecutorService`, and reduced fallback `MethodChannel` status polling when `EventChannel` is active.

4. **Live Download / Upload / Session / Gateway Cards & Connected Country Flag (`home_page.dart`, `controller.dart`, `OryvexVpnService.kt`, `desktop_backend.dart`, `stats.rs`, `socks.rs`)**:
   - Emitted live `[=] up ... down ... uptime ... bytes <uB> <dB> rate <uR> <dR>`, `[+] using fox gateway <gw>`, and `[+] connected country <cc> (<Name>)` lines from both Android (`OryvexVpnService.kt`) and Desktop (`desktop_backend.dart`) Fox watchers.
   - Counted initial SOCKS/HTTP handshake and DNS-over-stream bytes in `oryvexcore/src/socks.rs` and emitted an immediate `0 B` baseline in `oryvexcore/src/stats.rs`.
   - Added asynchronousSOCKS5 `/cdn-cgi/trace` exit-location resolution in `CoreController._resolveConnectedLocation` so all tunnel routes resolve their active exit country and gateway IP.
   - Displayed the connected country name and `CountryFlag` in both a pill under the Connect headline (`_ConnectedCountryBadge`) and inside the **Gateway** metric card (`_Bento`).

5. **Second Audit Pass — Complete Upstream Brand & Documentation Cleanup (`fox/core/`, `docs/DOCS.md`, `.github/workflows/apps.yml`)**:
   - Renamed `fox/core/cmd/arman-vpn-core` to `fox/core/cmd/fox-core` and `fox/core/cmd/arman-vpn-tun` to `fox/core/cmd/fox-tun`.
   - Updated the Go module path in `fox/core/go.mod` and all internal imports to `github.com/oryvexofficial/OryvexVPN/fox/core`.
   - Replaced all leftover upstream brand strings (`Arman VPN`, `arman-vpn`, `Oblivion`) across `fox/core/`, `docs/DOCS.md`, `REVIEW.md`, and `PROJECT_AUDIT.md`.
