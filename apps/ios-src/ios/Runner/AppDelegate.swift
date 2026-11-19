import Flutter
import SafariServices
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
    private var eventSink: FlutterEventSink?
    private let foxQueue = DispatchQueue(label: "com.oryvex.oryvexcore.fox", qos: .userInitiated)

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GeneratedPluginRegistrant.register(with: self)

        if let controller = window?.rootViewController as? FlutterViewController {
            let messenger = controller.binaryMessenger

            let methodChannel = FlutterMethodChannel(name: "oryvexcore/core", binaryMessenger: messenger)
            methodChannel.setMethodCallHandler { [weak self] call, result in
                self?.handleMethodCall(call, result: result, presenter: controller)
            }

            let eventChannel = FlutterEventChannel(name: "oryvexcore/events", binaryMessenger: messenger)
            eventChannel.setStreamHandler(self)
        }

        CoreBridge.shared.onEvent = { [weak self] event in
            DispatchQueue.main.async {
                self?.eventSink?(event)
            }
        }

        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    private func handleMethodCall(
        _ call: FlutterMethodCall,
        result: @escaping FlutterResult,
        presenter: UIViewController
    ) {
        let args = call.arguments as? [String: Any] ?? [:]

        switch call.method {
        case "configDir":
            result(CoreBridge.shared.configDirPath)

        case "requestNotifications":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
                DispatchQueue.main.async { result(nil) }
            }

        case "status":
            result(CoreBridge.shared.snapshot())

        case "since":
            let seq = (args["seq"] as? NSNumber)?.int64Value ?? 0
            result(CoreBridge.shared.since(after: seq))

        case "start":
            let cliArgs = args["args"] as? [String] ?? []
            let vpn = args["vpn"] as? Bool ?? true
            let socksPort = (args["socksPort"] as? NSNumber)?.intValue ?? 1819
            let fakeDns = args["fakeDns"] as? Bool ?? true
            let ipv6 = args["ipv6"] as? Bool ?? true
            let runId = (args["runId"] as? NSNumber)?.int64Value ?? Int64(Date().timeIntervalSince1970 * 1000)
            let proto = args["protocol"] as? String ?? "auto"

            CoreBridge.shared.start(
                args: cliArgs,
                vpn: vpn,
                socksPort: socksPort,
                fakeDns: fakeDns,
                ipv6: ipv6,
                runId: runId,
                protocolName: proto
            ) { outcome in
                DispatchQueue.main.async {
                    switch outcome {
                    case .success:
                        result(true)
                    case .failure(let error):
                        result(FlutterError(code: "VPN_START_FAILED", message: error.localizedDescription, details: nil))
                    }
                }
            }

        case "stop":
            CoreBridge.shared.stop {
                DispatchQueue.main.async { result(true) }
            }

        case "openCloudflareTemplate":
            guard let urlStr = args["url"] as? String,
                  let url = URL(string: urlStr),
                  url.scheme == "https",
                  url.host == "dash.cloudflare.com",
                  url.path == "/profile/api-tokens" else {
                result(false)
                return
            }
            DispatchQueue.main.async {
                let safari = SFSafariViewController(url: url)
                presenter.present(safari, animated: true)
                result(true)
            }

        case "openUrl":
            guard let urlStr = args["url"] as? String,
                  let url = URL(string: urlStr),
                  url.scheme == "https" || url.scheme == "http" else {
                result(false)
                return
            }
            DispatchQueue.main.async {
                UIApplication.shared.open(url, options: [:]) { ok in
                    result(ok)
                }
            }

        case "foxRequest":
            let method = args["method"] as? String ?? "GET"
            let path = args["path"] as? String ?? ""
            let body = args["body"] as? String
            foxQueue.async {
                do {
                    let response = try FoxBridge.shared.request(method: method, path: path, body: body)
                    DispatchQueue.main.async { result(response) }
                } catch {
                    DispatchQueue.main.async {
                        result(FlutterError(code: "FOX_SERVICE", message: error.localizedDescription, details: nil))
                    }
                }
            }

        case "deviceInfo":
            let idiom = UIDevice.current.userInterfaceIdiom == .pad ? "iPadOS" : "iOS"
            result([
                "abis": ["arm64"],
                "platform": idiom,
                "osVersion": UIDevice.current.systemVersion,
            ])

        default:
            result(FlutterMethodNotImplemented)
        }
    }
}

extension AppDelegate: FlutterStreamHandler {
    func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        self.eventSink = events
        return nil
    }

    func onCancel(withArguments arguments: Any?) -> FlutterError? {
        self.eventSink = nil
        return nil
    }
}
