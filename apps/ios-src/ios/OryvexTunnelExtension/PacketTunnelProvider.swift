import Foundation
import NetworkExtension
#if canImport(FoxCore)
import FoxCore
#endif

/// Whole-device VPN provider for iPhone and iPadOS.
///
/// Starts `OryvexCore` (via C FFI `oryvexcore_core_start`) or `FoxCore` (`MobileStart`) inside
/// the Network Extension process, configures the virtual TUN interface via
/// `NEPacketTunnelNetworkSettings`, and bridges IP packets from the utun file descriptor into the
/// local SOCKS5 proxy via `hev-socks5-tunnel`.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    private static let appGroupId = "group.com.oryvex.oryvexcore"

    private var coreJobId: UInt64?
    private var usingFox = false
    private var tunnelThread: Thread?
    private var stopped = false

    private var sharedLogURL: URL? {
        guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId) else {
            return nil
        }
        let dir = base.appendingPathComponent("oryvexcore", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("tunnel.log")
    }

    private func log(_ line: String) {
        NSLog("[OryvexTunnel] %@", line)
        guard let url = sharedLogURL,
              let data = (line + "\n").data(using: .utf8) else { return }
        if FileManager.default.fileExists(atPath: url.path),
           let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            handle.write(data)
        } else {
            try? data.write(to: url)
        }
    }

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        stopped = false
        usingFox = false
        let cliArgs = (options?["args"] as? [String]) ?? []
        let socksPort = (options?["socksPort"] as? NSNumber)?.intValue ?? 1819
        let ipv6 = (options?["ipv6"] as? NSNumber)?.boolValue ?? true
        let proto = (options?["protocol"] as? String) ?? "auto"

        log("[*] PacketTunnelProvider starting (\(proto), SOCKS5 127.0.0.1:\(socksPort))")

        // 1. Start the selected core in-process.
        if proto == "fox" {
            #if canImport(FoxCore)
            let foxDir = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId)?
                .appendingPathComponent("fox", isDirectory: true).path ?? NSTemporaryDirectory()
            var err: NSError?
            let ok = MobileStart(foxDir, true, &err)
            if !ok, let err = err {
                log("[-] FoxCore failed to start: \(err.localizedDescription)")
                completionHandler(err)
                return
            }
            usingFox = true
            log("[+] Fox service ready on 127.0.0.1:\(socksPort)")
            #else
            let err = NSError(domain: "OryvexTunnel", code: 10, userInfo: [NSLocalizedDescriptionKey: "FoxCore.xcframework missing"])
            log("[-] \(err.localizedDescription)")
            completionHandler(err)
            return
            #endif
        } else {
            guard let data = try? JSONSerialization.data(withJSONObject: cliArgs),
                  let json = String(data: data, encoding: .utf8),
                  let rawReply = json.withCString({ oryvexcore_core_start($0) }) else {
                let err = NSError(domain: "OryvexTunnel", code: 11, userInfo: [NSLocalizedDescriptionKey: "Failed to start OryvexCore"])
                log("[-] \(err.localizedDescription)")
                completionHandler(err)
                return
            }
            let replyStr = String(cString: rawReply)
            oryvexcore_string_free(rawReply)

            if let replyData = replyStr.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: replyData) as? [String: Any],
               obj["ok"] as? Bool == true,
               let job = obj["job"] as? UInt64 {
                coreJobId = job
                log("[+] socks5 server listening on 127.0.0.1:\(socksPort)")
            } else {
                let err = NSError(domain: "OryvexTunnel", code: 12, userInfo: [NSLocalizedDescriptionKey: replyStr])
                log("[-] Core error: \(replyStr)")
                completionHandler(err)
                return
            }
        }

        // 2. Configure virtual TUN network settings for iPhone / iPadOS.
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "198.18.0.1")
        settings.mtu = 1500

        let ipv4Settings = NEIPv4Settings(addresses: ["198.18.0.2"], subnetMasks: ["255.255.255.0"])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings

        if ipv6 {
            let ipv6Settings = NEIPv6Settings(addresses: ["fd00::2"], networkPrefixLengths: [64])
            ipv6Settings.includedRoutes = [NEIPv6Route.default()]
            settings.ipv6Settings = ipv6Settings
        }

        let dns = NEDNSSettings(servers: ["1.1.1.1", "1.0.0.1"])
        dns.matchDomains = [""]
        settings.dnsSettings = dns

        setTunnelNetworkSettings(settings) { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                self.log("[-] setTunnelNetworkSettings failed: \(error.localizedDescription)")
                self.stopCore()
                completionHandler(error)
                return
            }

            self.startSocksTunnel(socksPort: socksPort)
            self.log("[+] Device VPN tunnel is active")
            completionHandler(nil)
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        log("[*] Stopping tunnel (reason: \(reason.rawValue))")
        stopped = true
        hev_socks5_tunnel_quit()
        stopCore()
        completionHandler()
    }

    private func stopCore() {
        if usingFox {
            usingFox = false
            #if canImport(FoxCore)
            MobileStop()
            #endif
        }
        if let job = coreJobId {
            coreJobId = nil
            if let r = oryvexcore_job_cancel(job) { oryvexcore_string_free(r) }
            if let r = oryvexcore_job_free(job) { oryvexcore_string_free(r) }
        }
    }

    private func startSocksTunnel(socksPort: Int) {
        guard let tunFd = packetFlow.value(forKeyPath: "socket.fileDescriptor") as? Int32, tunFd >= 0 else {
            log("[-] Could not obtain utun file descriptor")
            return
        }

        let config = """
        tunnel:
          mtu: 1500
        socks5:
          port: \(socksPort)
          address: 127.0.0.1
          udp: 'udp'
        misc:
          task-stack-size: 81920
          connect-timeout: 5000
          read-write-timeout: 60000
          log-level: warn
        """

        let thread = Thread {
            let bytes = Array(config.utf8)
            bytes.withUnsafeBufferPointer { ptr in
                guard let base = ptr.baseAddress else { return }
                _ = hev_socks5_tunnel_main_from_str(base, UInt32(bytes.count), tunFd)
            }
        }
        thread.name = "oryvex-hev-socks5-tunnel"
        thread.start()
        tunnelThread = thread
    }
}
