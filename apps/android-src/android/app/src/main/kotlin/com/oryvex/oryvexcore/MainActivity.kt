package com.oryvex.oryvexcore

import android.app.Activity
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.VpnService
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import androidx.browser.customtabs.CustomTabsIntent
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/**
 * The Flutter <-> service bridge.
 *
 *  oryvexcore/core   (methods)  configDir, requestNotifications, requestAddQuickTile, status,
 *                               since, start, stop, openUrl (release page / download),
 *                               deviceInfo (ABIs, for updates)
 *  oryvexcore/events (stream)   {type: line|vpn|exit, run: <session id>, seq: <line no>, ...}
 */
class MainActivity : FlutterActivity() {

    private class Pending(val request: StartRequest, val result: MethodChannel.Result)

    private var pending: Pending? = null
    private var sink: EventChannel.EventSink? = null
    private val foxExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "oryvex-fox-bridge").apply { isDaemon = true }
    }
    private val listener: (Map<String, Any?>) -> Unit = { event ->
        // Lines arrive on the core's reader thread; the sink may only be used on the main thread.
        runOnUiThread {
            try { sink?.success(event) } catch (_: Throwable) {}
        }
    }


    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, "oryvexcore/core").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "configDir" -> result.success(filesDir.absolutePath)
                    "requestNotifications" -> {
                        requestNotificationPermission()
                        result.success(null)
                    }
                    "requestAddQuickTile" -> requestAddQuickTile(result)
                    "status" -> result.success(CoreBus.snapshot())
                    "since" -> {
                        val after = call.argument<Number>("seq")?.toLong() ?: 0L
                        result.success(CoreBus.since(after))
                    }
                    "start" -> {
                        val req = StartRequest(
                            args = call.argument<List<String>>("args") ?: emptyList(),
                            vpn = call.argument<Boolean>("vpn") ?: true,
                            socksPort = call.argument<Number>("socksPort")?.toInt() ?: 1819,
                            fakeDns = call.argument<Boolean>("fakeDns") ?: true,
                            ipv6 = call.argument<Boolean>("ipv6") ?: true,
                            runId = call.argument<Number>("runId")?.toLong() ?: System.currentTimeMillis(),
                            protocol = call.argument<String>("protocol") ?: "auto",
                        )
                        if (req.vpn) {
                            val consent = try { VpnService.prepare(this) } catch (_: Throwable) { null }
                            if (consent != null) {
                                pending?.result?.error("VPN_DENIED", "superseded by a newer request", null)
                                pending = Pending(req, result)
                                startActivityForResult(consent, REQUEST_VPN)
                                return@setMethodCallHandler
                            }
                        }
                        launch(req, result)
                    }
                    "stop" -> {
                        OryvexVpnService.stop(this)
                        result.success(true)
                    }
                    "openCloudflareTemplate" -> {
                        val uri = android.net.Uri.parse(call.argument<String>("url") ?: "")
                        val permitted = uri.scheme == "https" && uri.host == "dash.cloudflare.com" &&
                            uri.path == "/profile/api-tokens" && (uri.port == -1 || uri.port == 443)
                        val opened = if (!permitted) false else try {
                            CustomTabsIntent.Builder().build().launchUrl(this, uri)
                            true
                        } catch (_: Throwable) { false }
                        result.success(opened)
                    }
                    "openUrl" -> {
                        val url = call.argument<String>("url") ?: ""
                        if (!url.startsWith("https://") && !url.startsWith("http://")) {
                            result.success(false)
                        } else {
                            val opened = try {
                                startActivity(
                                    Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                )
                                true
                            } catch (_: Throwable) {
                                false
                            }
                            result.success(opened)
                        }
                    }
                    "foxRequest" -> {
                        val method = call.argument<String>("method") ?: "GET"
                        val path = call.argument<String>("path") ?: ""
                        val body = call.argument<String>("body")
                        foxExecutor.execute {
                            try {
                                val response = FoxBridge.request(this, method, path, body)
                                runOnUiThread { result.success(response) }
                            } catch (e: Throwable) {
                                runOnUiThread { result.error("FOX_SERVICE", e.message ?: "Fox service unavailable", null) }
                            }
                        }
                    }
                    "deviceInfo" -> result.success(
                        mapOf(
                            "abis" to Build.SUPPORTED_ABIS.toList(),
                            "sdk" to Build.VERSION.SDK_INT,
                        )
                    )
                    else -> result.notImplemented()
                }
            } catch (e: Throwable) {
                result.error("NATIVE_ERROR", e.message ?: e.javaClass.simpleName, null)
            }
        }

        EventChannel(messenger, "oryvexcore/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                sink = events
                CoreBus.removeListener(listener)
                CoreBus.addListener(listener)
            }

            override fun onCancel(arguments: Any?) {
                CoreBus.removeListener(listener)
                sink = null
            }
        })
    }

    private fun requestAddQuickTile(result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            result.success("unsupported")
            return
        }
        val statusBarManager = getSystemService(StatusBarManager::class.java)
        if (statusBarManager == null) {
            result.success("error")
            return
        }
        statusBarManager.requestAddTileService(
            ComponentName(this, OryvexTileService::class.java),
            getString(R.string.app_name),
            Icon.createWithResource(this, R.drawable.ic_stat_core),
            mainExecutor,
        ) { resultCode ->
            val status = when (resultCode) {
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED -> "added"
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED -> "already_added"
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED -> "not_added"
                else -> "error"
            }
            result.success(status)
        }
    }

    private fun launch(req: StartRequest, result: MethodChannel.Result) {
        try {
            OryvexVpnService.start(this, req)
            result.success(true)
        } catch (e: Throwable) {
            result.error("START_FAILED", e.message ?: "could not start the service", null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_VPN) return
        val p = pending ?: return
        pending = null
        if (resultCode == Activity.RESULT_OK) {
            launch(p.request, p.result)
        } else {
            p.result.error("VPN_DENIED", "VPN permission denied", null)
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), REQUEST_NOTIFICATIONS)
        }
    }

    override fun onDestroy() {
        CoreBus.removeListener(listener)
        sink = null
        foxExecutor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val REQUEST_VPN = 0x0571
        private const val REQUEST_NOTIFICATIONS = 0x0572
    }
}
