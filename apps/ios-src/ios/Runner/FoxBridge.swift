import Foundation
#if canImport(FoxCore)
import FoxCore
#endif

/// Bridges Flutter Fox route API calls to the bundled `FoxCore.xcframework` built from `fox/core/mobile`.
///
/// Mirrors `apps/android-src/.../FoxBridge.kt`: writes `config.json` in the shared App Group
/// `fox/` folder, starts `MobileStart(dir, false)` when not yet running, reads `local-api.token`,
/// and authenticates local HTTP requests with `X-Local-Token`.
final class FoxBridge {
    static let shared = FoxBridge()

    private let lock = NSLock()
    private let defaultDashboardPort = 10820
    private var cachedPort: Int = 10820

    private init() {}

    var foxDataDirURL: URL {
        let dir = CoreBridge.shared.sharedContainerURL.appendingPathComponent("fox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    @discardableResult
    func configure(socksPort: Int? = nil, shareLan: Bool = false) -> Int {
        let configURL = foxDataDirURL.appendingPathComponent("config.json")
        var root: [String: Any] = [:]
        if let data = try? Data(contentsOf: configURL),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            root = parsed
        }

        var proxy = (root["proxy"] as? [String: Any]) ?? [:]
        if let socksPort = socksPort {
            proxy["listen"] = "\(shareLan ? "0.0.0.0" : "127.0.0.1"):\(socksPort)"
        } else if proxy["listen"] == nil {
            proxy["listen"] = "127.0.0.1:1819"
        }
        root["proxy"] = proxy

        var dashboard = (root["dashboard"] as? [String: Any]) ?? [:]
        var port = defaultDashboardPort
        if let listen = dashboard["listen"] as? String,
           let last = listen.split(separator: ":").last,
           let parsedPort = Int(last),
           (1...65535).contains(parsedPort) {
            port = parsedPort
        }
        dashboard["enabled"] = true
        dashboard["listen"] = "127.0.0.1:\(port)"
        root["dashboard"] = dashboard

        if let out = try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted]) {
            try? out.write(to: configURL, options: .atomic)
        }
        cachedPort = port
        return port
    }

    func request(method: String, path: String, body: String?) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        #if canImport(FoxCore)
        let port = MobileRunning() ? cachedPort : configure()
        if !MobileRunning() {
            var err: NSError?
            let ok = MobileStart(foxDataDirURL.path, false, &err)
            if !ok, let err = err {
                throw err
            }
        }

        let tokenURL = foxDataDirURL.appendingPathComponent("local-api.token")
        var token = ""
        for _ in 0..<80 {
            if let raw = try? String(contentsOf: tokenURL, encoding: .utf8) {
                let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    token = trimmed
                    break
                }
            }
            Thread.sleep(forTimeInterval: 0.25)
        }
        guard !token.isEmpty else {
            throw NSError(domain: "FoxBridge", code: 2, userInfo: [NSLocalizedDescriptionKey: "Fox service did not write local-api.token"])
        }

        guard let url = URL(string: "http://127.0.0.1:\(port)\(path)") else {
            throw NSError(domain: "FoxBridge", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid Fox API path"])
        }
        var req = URLRequest(url: url, timeoutInterval: 45)
        req.httpMethod = method
        req.setValue(token, forHTTPHeaderField: "X-Local-Token")
        if method != "GET" {
            req.httpBody = (body ?? "{}").data(using: .utf8)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let sem = DispatchSemaphore(value: 0)
        var outData: Data?
        var outStatus = 0
        var outError: Error?

        URLSession.shared.dataTask(with: req) { data, response, error in
            outData = data
            outStatus = (response as? HTTPURLResponse)?.statusCode ?? 0
            outError = error
            sem.signal()
        }.resume()
        sem.wait()

        if let error = outError { throw error }
        let text = String(data: outData ?? Data(), encoding: .utf8) ?? "{}"
        if !(200...299).contains(outStatus) {
            throw NSError(domain: "FoxBridge", code: outStatus, userInfo: [NSLocalizedDescriptionKey: text])
        }
        return text
        #else
        throw NSError(
            domain: "FoxBridge",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "FoxCore.xcframework is not linked in this build. Run tool/build_ios_natives.sh first."]
        )
        #endif
    }
}
