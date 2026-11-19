import Foundation
import NetworkExtension

/// Coordinates the OryvexCore / Fox VPN lifecycle on iOS and iPadOS.
///
/// Whole-device VPN mode runs inside `OryvexTunnelExtension` (`NEPacketTunnelProvider`), while
/// proxy-only mode runs `oryvexcore_core_start` directly in-process via C FFI. Both paths write
/// sequenced lines into the shared App Group container so the Flutter UI receives real-time
/// telemetry and logs identical to Android's `CoreBus`.
final class CoreBridge {
    static let shared = CoreBridge()

    static let appGroupId = "group.com.oryvex.oryvexcore"
    static let tunnelBundleId = "com.oryvex.oryvexcore.OryvexTunnelExtension"

    private let lock = NSLock()
    private var seq: Int64 = 0
    private var lines: [(Int64, String)] = []
    private let maxLines = 1500
    private var currentRun: Int64 = 0
    private var running = false
    private var vpnUp = false
    private var inProcessJobId: UInt64?
    private var statusObserver: NSObjectProtocol?
    private var logPollTimer: DispatchSourceTimer?
    private var lastReadLogOffset: UInt64 = 0

    var onEvent: (([String: Any]) -> Void)?

    private init() {
        observeVpnStatus()
    }

    var sharedContainerURL: URL {
        if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId) {
            return url
        }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    }

    var configDirPath: String {
        let dir = sharedContainerURL.appendingPathComponent("oryvexcore", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.path
    }

    private var sharedLogFileURL: URL {
        URL(fileURLWithPath: configDirPath).appendingPathComponent("tunnel.log")
    }

    func emitLine(_ text: String, run: Int64? = nil) {
        lock.lock()
        seq += 1
        let s = seq
        let r = run ?? currentRun
        lines.append((s, text))
        if lines.count > maxLines {
            lines.removeFirst(lines.count - maxLines)
        }
        lock.unlock()

        onEvent?([
            "type": "line",
            "run": r,
            "seq": s,
            "line": text,
        ])
    }

    private func emitVpn(up: Bool, error: String? = nil, run: Int64? = nil) {
        lock.lock()
        vpnUp = up
        let r = run ?? currentRun
        lock.unlock()

        var payload: [String: Any] = [
            "type": "vpn",
            "run": r,
            "up": up,
        ]
        if let error = error {
            payload["error"] = error
        }
        onEvent?(payload)
    }

    private func emitExit(code: Int, run: Int64) {
        lock.lock()
        if currentRun == run {
            running = false
            vpnUp = false
        }
        lock.unlock()

        onEvent?([
            "type": "exit",
            "run": run,
            "code": code,
        ])
    }

    func snapshot() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }
        return [
            "running": running,
            "run": currentRun,
            "vpnUp": vpnUp,
            "seq": seq,
            "lines": lines.map { $0.1 },
        ]
    }

    func since(after: Int64) -> [String: Any] {
        drainSharedLogFile()
        lock.lock()
        defer { lock.unlock() }
        let newer = lines.filter { $0.0 > after }.map { ["seq": $0.0, "line": $0.1] as [String: Any] }
        return [
            "running": running,
            "run": currentRun,
            "vpnUp": vpnUp,
            "seq": seq,
            "lines": newer,
        ]
    }

    func start(
        args: [String],
        vpn: Bool,
        socksPort: Int,
        fakeDns: Bool,
        ipv6: Bool,
        runId: Int64,
        protocolName: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        stop { [weak self] in
            guard let self = self else { return }
            self.lock.lock()
            self.currentRun = runId
            self.running = true
            self.vpnUp = false
            self.lastReadLogOffset = 0
            self.lock.unlock()

            try? "".write(to: self.sharedLogFileURL, atomically: true, encoding: .utf8)

            if vpn {
                self.startPacketTunnel(
                    args: args,
                    socksPort: socksPort,
                    fakeDns: fakeDns,
                    ipv6: ipv6,
                    runId: runId,
                    protocolName: protocolName,
                    completion: completion
                )
            } else {
                self.startInProcessProxy(args: args, runId: runId, completion: completion)
            }
        }
    }

    func stop(completion: (() -> Void)? = nil) {
        stopLogPolling()

        lock.lock()
        let activeJob = inProcessJobId
        inProcessJobId = nil
        let prevRun = currentRun
        let wasRunning = running
        running = false
        vpnUp = false
        lock.unlock()

        if let jobId = activeJob {
            if let raw = oryvexcore_job_cancel(jobId) { oryvexcore_string_free(raw) }
            if let raw = oryvexcore_job_free(jobId) { oryvexcore_string_free(raw) }
        }

        NETunnelProviderManager.loadAllFromPreferences { managers, _ in
            managers?.forEach { manager in
                if manager.connection.status == .connected ||
                    manager.connection.status == .connecting ||
                    manager.connection.status == .reasserting {
                    manager.connection.stopVPNTunnel()
                }
            }
            if wasRunning {
                self.emitExit(code: 0, run: prevRun)
            }
            completion?()
        }
    }

    // MARK: - Whole-device VPN (NEPacketTunnelProvider)

    private func startPacketTunnel(
        args: [String],
        socksPort: Int,
        fakeDns: Bool,
        ipv6: Bool,
        runId: Int64,
        protocolName: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        loadOrCreateManager { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                self.emitLine("[-] VPN profile setup failed: \(error.localizedDescription)", run: runId)
                self.emitExit(code: 1, run: runId)
                completion(.failure(error))
            case .success(let manager):
                let options: [String: NSObject] = [
                    "args": args as NSArray,
                    "socksPort": NSNumber(value: socksPort),
                    "fakeDns": NSNumber(value: fakeDns),
                    "ipv6": NSNumber(value: ipv6),
                    "runId": NSNumber(value: runId),
                    "protocol": protocolName as NSString,
                    "configDir": self.configDirPath as NSString,
                ]
                do {
                    try (manager.connection as? NETunnelProviderSession)?.startVPNTunnel(options: options)
                    self.startLogPolling()
                    self.emitLine("[*] Starting OryvexVPN tunnel (\(protocolName))…", run: runId)
                    completion(.success(()))
                } catch {
                    self.emitLine("[-] Could not start VPN tunnel: \(error.localizedDescription)", run: runId)
                    self.emitExit(code: 1, run: runId)
                    completion(.failure(error))
                }
            }
        }
    }

    private func loadOrCreateManager(completion: @escaping (Result<NETunnelProviderManager, Error>) -> Void) {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            let manager = managers?.first(where: {
                ($0.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == Self.tunnelBundleId
            }) ?? NETunnelProviderManager()

            let proto = (manager.protocolConfiguration as? NETunnelProviderProtocol) ?? NETunnelProviderProtocol()
            proto.providerBundleIdentifier = Self.tunnelBundleId
            proto.serverAddress = "OryvexVPN"
            manager.protocolConfiguration = proto
            manager.localizedDescription = "OryvexVPN"
            manager.isEnabled = true

            manager.saveToPreferences { saveError in
                if let saveError = saveError {
                    completion(.failure(saveError))
                    return
                }
                manager.loadFromPreferences { loadError in
                    if let loadError = loadError {
                        completion(.failure(loadError))
                        return
                    }
                    completion(.success(manager))
                }
            }
        }
    }

    // MARK: - In-process proxy-only mode (via OryvexCore C FFI)

    private func startInProcessProxy(
        args: [String],
        runId: Int64,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        guard let data = try? JSONSerialization.data(withJSONObject: args),
              let json = String(data: data, encoding: .utf8) else {
            let err = NSError(domain: "OryvexCore", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not encode arguments"])
            emitExit(code: 1, run: runId)
            completion(.failure(err))
            return
        }

        let rawReply = json.withCString { oryvexcore_core_start($0) }
        guard let rawReply = rawReply else {
            let err = NSError(domain: "OryvexCore", code: 2, userInfo: [NSLocalizedDescriptionKey: "Core returned null reply"])
            emitExit(code: 1, run: runId)
            completion(.failure(err))
            return
        }
        let replyStr = String(cString: rawReply)
        oryvexcore_string_free(rawReply)

        if let replyData = replyStr.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: replyData) as? [String: Any],
           parsed["ok"] as? Bool == true,
           let job = parsed["job"] as? UInt64 {
            lock.lock()
            inProcessJobId = job
            lock.unlock()
            emitLine("[*] OryvexCore proxy started in-process (job \(job))", run: runId)
            pollInProcessJob(jobId: job, runId: runId)
            completion(.success(()))
        } else {
            let msg = replyStr
            emitLine("[-] Core failed to start: \(msg)", run: runId)
            emitExit(code: 1, run: runId)
            completion(.failure(NSError(domain: "OryvexCore", code: 3, userInfo: [NSLocalizedDescriptionKey: msg])))
        }
    }

    private func pollInProcessJob(jobId: UInt64, runId: Int64) {
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self = self else { return }
            self.lock.lock()
            let stillActive = (self.inProcessJobId == jobId && self.currentRun == runId)
            self.lock.unlock()
            guard stillActive else { return }

            guard let raw = oryvexcore_job_poll(jobId) else { return }
            let text = String(cString: raw)
            oryvexcore_string_free(raw)

            if let data = text.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               obj["state"] as? String == "done" {
                if let result = obj["result"] as? [String: Any], let err = result["error"] as? String {
                    self.emitLine("[-] Core stopped: \(err)", run: runId)
                }
                if let freeRaw = oryvexcore_job_free(jobId) { oryvexcore_string_free(freeRaw) }
                self.emitExit(code: 0, run: runId)
            } else {
                self.pollInProcessJob(jobId: jobId, runId: runId)
            }
        }
    }

    // MARK: - Status & Shared Log Polling

    private func observeVpnStatus() {
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let connection = notification.object as? NEVPNConnection else { return }
            switch connection.status {
            case .connected:
                self.emitVpn(up: true)
            case .disconnected:
                self.lock.lock()
                let wasRunning = self.running
                let runId = self.currentRun
                self.lock.unlock()
                if wasRunning {
                    self.emitVpn(up: false)
                    self.emitExit(code: 0, run: runId)
                }
            default:
                break
            }
        }
    }

    private func startLogPolling() {
        stopLogPolling()
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now() + 0.5, repeating: 1.0)
        timer.setEventHandler { [weak self] in
            self?.drainSharedLogFile()
        }
        timer.resume()
        logPollTimer = timer
    }

    private func stopLogPolling() {
        logPollTimer?.cancel()
        logPollTimer = nil
    }

    private func drainSharedLogFile() {
        guard let handle = try? FileHandle(forReadingFrom: sharedLogFileURL) else { return }
        defer { try? handle.close() }
        do {
            try handle.seek(toOffset: lastReadLogOffset)
            let data = handle.readDataToEndOfFile()
            guard !data.isEmpty else { return }
            lastReadLogOffset += UInt64(data.count)
            if let chunk = String(data: data, encoding: .utf8) {
                for line in chunk.components(separatedBy: .newlines) where !line.isEmpty {
                    emitLine(line)
                }
            }
        } catch {}
    }
}
