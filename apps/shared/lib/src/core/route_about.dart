/// What each connection is and how it works, shown in the app for every route.
class RouteAbout {
  const RouteAbout({
    required this.title,
    required this.summary,
    required this.how,
    required this.good,
    required this.limits,
    required this.platforms,
  });

  final String title;
  final String summary;

  /// Numbered steps, in the order things happen.
  final List<String> how;
  final List<String> good;
  final List<String> limits;
  final String platforms;
}

const routeAbout = <String, RouteAbout>{
  'fox': RouteAbout(
    title: 'Fox',
    summary: 'An unofficial Firefox Account VPN client that connects through Mozilla’s VPN service. It is independent of Mozilla and is not endorsed by Mozilla.',
    how: [
      'Sign in with your Firefox Account in the Route card.',
      'Fox obtains a Mozilla VPN pass and opens an encrypted proxy connection.',
      'Choose an available country in the Route card.',
      'On Android, the app can route the whole device through its VPN service.',
    ],
    good: ['Uses your Firefox Account', 'Account and country controls in the app'],
    limits: [
      'Requires a Firefox Account with Mozilla VPN access and is subject to Mozilla’s service limits.',
      'This is an unofficial client, not a Mozilla product.',
    ],
    platforms: 'Windows 10/11 (x64), macOS 12+ (Apple Silicon & Intel), iOS / iPadOS 15+, and Android 7.0+ (ARM64 and ARMv7).',
  ),
  'auto': RouteAbout(
    title: 'Auto',
    summary: 'Tries the tunnel routes one after another and keeps the first that connects.',
    how: [
      'WireGuard is tried first, then MASQUE, MASQUE², then Gool.',
      'Each gets a time limit; a route that does not come up in time is dropped.',
      'The first one that passes real traffic is kept, and the app shows which one it is.',
    ],
    good: ['No choices to make', 'Adapts when a network blocks one protocol'],
    limits: ['Connecting can take longer on a heavily filtered network'],
    platforms: 'Android 7.0+, iOS / iPadOS 15+, macOS 12+ (Universal), Windows 10/11 (x64).',
  ),
  'wg': RouteAbout(
    title: 'WireGuard',
    summary: 'A fast WireGuard tunnel to a Cloudflare WARP gateway.',
    how: [
      'The app scans for a WARP gateway that answers and checks its handshake.',
      'It builds the WireGuard tunnel over UDP and sends your traffic through it.',
      'Your address becomes a Cloudflare one.',
    ],
    good: ['Fastest tunnel', 'Low battery use'],
    limits: ['Needs UDP to reach the gateway; some networks block it'],
    platforms: 'Android 7.0+, iOS / iPadOS 15+, macOS 12+ (Universal), Windows 10/11 (x64).',
  ),
  'masque': RouteAbout(
    title: 'MASQUE',
    summary: 'A tunnel that looks like ordinary HTTPS (HTTP/2) or HTTP/3 traffic.',
    how: [
      'The app finds a gateway and opens a TLS connection to it.',
      'Your traffic is wrapped inside that connection (the MASQUE standard).',
      'To a filter it looks like a visit to a normal website.',
    ],
    good: ['Works where UDP or VPN protocols are blocked (HTTP/2)', 'Blends in'],
    limits: ['A little slower than WireGuard'],
    platforms: 'Android 7.0+, iOS / iPadOS 15+, macOS 12+ (Universal), Windows 10/11 (x64).',
  ),
  'mim': RouteAbout(
    title: 'MASQUE²',
    summary: 'MASQUE carried inside MASQUE, for a different exit address.',
    how: [
      'An outer MASQUE tunnel is opened to a gateway.',
      'A second MASQUE tunnel is opened through the first.',
      'Traffic leaves from the inner hop.',
    ],
    good: ['A second layer when a single tunnel is blocked'],
    limits: ['Slowest of the tunnels; two handshakes'],
    platforms: 'Android 7.0+, iOS / iPadOS 15+, macOS 12+ (Universal), Windows 10/11 (x64).',
  ),
  'gool': RouteAbout(
    title: 'Gool',
    summary: 'WireGuard carried inside MASQUE.',
    how: [
      'A MASQUE tunnel is opened first, which looks like HTTPS.',
      'WireGuard runs inside it, so UDP is never exposed to the network.',
      'Traffic leaves with a different exit address.',
    ],
    good: ['WireGuard speed with HTTPS disguise'],
    limits: ['Two layers, so a longer start'],
    platforms: 'Android 7.0+, iOS / iPadOS 15+, macOS 12+ (Universal), Windows 10/11 (x64).',
  ),
  'tor': RouteAbout(
    title: 'Tor',
    summary: 'Sends your traffic through the Tor network, using bridges when Tor is blocked.',
    how: [
      'The app bootstraps Tor, with bridges if direct access fails.',
      'It builds a circuit of three relays.',
      'You can pick the exit country; traffic leaves from that exit.',
    ],
    good: ['Strong anonymity', 'Works with bridges where Tor is blocked'],
    limits: ['Slower than a VPN', 'Some sites block Tor exits'],
    platforms: 'Android 7.0+, iOS / iPadOS 15+, macOS 12+ (Universal), Windows 10/11 (x64).',
  ),
  'bypass': RouteAbout(
    title: 'Bypass',
    summary: 'Goes out directly and reshapes the first packets so a filter cannot read the site name.',
    how: [
      'Names are looked up through an encrypted DNS resolver, so poisoned answers cannot mislead you.',
      'The first bytes of each connection (TLS hello or HTTP request) are split, reordered or padded with decoys.',
      'A filter that matches the site name in those bytes no longer sees it; the real server still does.',
    ],
    good: ['No account, no server', 'Your speed and address stay the same'],
    limits: ['Does not beat filters that rebuild the whole stream or block by address'],
    platforms: 'Android 7.0+, iOS / iPadOS 15+, macOS 12+ (Universal), Windows 7 to 11, Linux, OpenWrt.',
  ),
};
