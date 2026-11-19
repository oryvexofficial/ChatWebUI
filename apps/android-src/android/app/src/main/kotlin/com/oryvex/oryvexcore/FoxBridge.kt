package com.oryvex.oryvexcore

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.URL

/** Android-side bridge to the bundled Fox mobile core and its local account API. */
object FoxBridge {
    private const val DEFAULT_DASHBOARD_PORT = 10820
    @Volatile private var cachedPort: Int = 0

    fun dataDir(context: Context): File = File(context.filesDir, "fox")

    fun configure(context: Context, socksPort: Int? = null, shareLan: Boolean = false): Int {
        val dir = dataDir(context)
        if (!dir.exists() && !dir.mkdirs()) error("Could not create Fox data folder")
        val file = File(dir, "config.json")
        val existingText = if (file.isFile) try { file.readText() } catch (_: Exception) { "" } else ""
        val root = if (existingText.isNotEmpty()) try { JSONObject(existingText) } catch (_: Exception) { JSONObject() } else JSONObject()
        val proxy = root.optJSONObject("proxy") ?: JSONObject()
        var dirty = existingText.isEmpty()

        if (socksPort != null) {
            val wanted = "${if (shareLan) "0.0.0.0" else "127.0.0.1"}:$socksPort"
            if (proxy.optString("listen") != wanted) {
                proxy.put("listen", wanted)
                dirty = true
            }
        } else if (!proxy.has("listen")) {
            proxy.put("listen", "127.0.0.1:1819")
            dirty = true
        }
        root.put("proxy", proxy)

        val dashboard = root.optJSONObject("dashboard") ?: JSONObject()
        var port = dashboard.optString("listen", "").substringAfterLast(':').toIntOrNull() ?: 0
        if (port !in 1..65535) {
            port = availableDashboardPort()
            dirty = true
        }
        val wantedDash = "127.0.0.1:$port"
        if (!dashboard.optBoolean("enabled", false) || dashboard.optString("listen") != wantedDash) {
            dashboard.put("enabled", true)
            dashboard.put("listen", wantedDash)
            root.put("dashboard", dashboard)
            dirty = true
        }
        if (dirty) {
            file.writeText(root.toString(2))
        }
        cachedPort = port
        return port
    }

    private fun availableDashboardPort(): Int {
        for (port in listOf(DEFAULT_DASHBOARD_PORT) + (18220..18283).toList()) {
            try {
                ServerSocket().use { it.bind(InetSocketAddress("127.0.0.1", port)) }
                return port
            } catch (_: Exception) {
                // Try another loopback-only port.
            }
        }
        error("No free port for the Fox service")
    }

    /** Start the private service if needed, and send an authenticated local API request. */
    @Synchronized
    fun request(context: Context, method: String, path: String, body: String?): String {
        val regularPath = path.matches(Regex("^/api/(status|accounts|locations|location|signin)(/[A-Za-z0-9_-]+){0,2}$"))
        val settingsAccess = path == "/api/settings" && method in setOf("GET", "PUT")
        val relayTestAccess = path == "/api/relay/test" && method == "POST"
        val regularAccess = regularPath && method in setOf("GET", "POST", "DELETE")
        require(settingsAccess || relayTestAccess || regularAccess) { "Unsupported Fox operation" }
        val port = if (cachedPort in 1..65535 && mobile.Mobile.running()) cachedPort else configure(context)
        if (!mobile.Mobile.running()) mobile.Mobile.start(dataDir(context).absolutePath, false)
        val tokenFile = File(dataDir(context), "local-api.token")
        var lastError: Throwable? = null
        var ready = false
        repeat(80) {
            if (!ready) {
                try {
                    val token = tokenFile.readText().trim()
                    require(token.isNotEmpty())
                    val check = URL("http://127.0.0.1:$port/api/status").openConnection() as HttpURLConnection
                    try {
                        check.connectTimeout = 1000
                        check.readTimeout = 2000
                        check.setRequestProperty("X-Local-Token", token)
                        ready = check.responseCode == 200
                    } finally { check.disconnect() }
                } catch (e: Exception) { lastError = e }
                if (!ready) Thread.sleep(250)
            }
        }
        if (!ready) error("Fox service did not start: ${lastError?.message ?: "not ready"}")
        val token = tokenFile.readText().trim()
        val connection = URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 3000
            connection.readTimeout = 45000
            connection.setRequestProperty("X-Local-Token", token)
            if (method != "GET") {
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.outputStream.use { it.write((body ?: "{}").toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            val response = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: "{}"
            if (code !in 200..299) {
                val message = try { JSONObject(response).optString("error", "HTTP $code") } catch (_: Exception) { "HTTP $code" }
                error(message)
            }
            return response
        } finally { connection.disconnect() }
    }

    fun status(context: Context): JSONObject {
        val dir = dataDir(context)
        val port = if (cachedPort in 1..65535) {
            cachedPort
        } else {
            val configFile = File(dir, "config.json")
            try {
                JSONObject(configFile.readText()).optJSONObject("dashboard")
                    ?.optString("listen", "")?.substringAfterLast(':')?.toIntOrNull()
                    ?.takeIf { it in 1..65535 } ?: configure(context)
            } catch (_: Exception) {
                configure(context)
            }
        }
        val tokenFile = File(dir, "local-api.token")
        val token = if (tokenFile.isFile) tokenFile.readText().trim() else ""
        if (token.isEmpty()) error("Fox local API token is missing")
        val connection = URL("http://127.0.0.1:$port/api/status").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 3500
            connection.setRequestProperty("X-Local-Token", token)
            val text = connection.inputStream.bufferedReader().use { it.readText() }
            return JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}
