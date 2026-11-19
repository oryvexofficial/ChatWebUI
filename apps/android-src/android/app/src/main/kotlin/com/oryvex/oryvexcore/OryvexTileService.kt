package com.oryvex.oryvexcore

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Android Quick Settings tile that mirrors the live OryvexVpnService / CoreBus state and lets
 * users toggle the VPN directly from the notification shade.
 */
class OryvexTileService : TileService() {

    private val main = Handler(Looper.getMainLooper())
    private val busListener: (Map<String, Any?>) -> Unit = { event ->
        val type = event["type"]
        if (type == "vpn" || type == "exit") {
            main.post { syncTile() }
        }
    }

    override fun onStartListening() {
        super.onStartListening()
        CoreBus.addListener(busListener)
        syncTile()
    }

    override fun onStopListening() {
        CoreBus.removeListener(busListener)
        super.onStopListening()
    }

    override fun onClick() {
        super.onClick()
        if (CoreBus.running) {
            if (!CoreBus.stopping) {
                applyTile(Tile.STATE_INACTIVE, "Disconnecting")
                OryvexVpnService.stop(this)
            }
            return
        }

        val hasVpnPermission = try {
            VpnService.prepare(this) == null
        } catch (_: Throwable) {
            false
        }
        val lastRequest = StartRequest.last(this)
        if (hasVpnPermission && lastRequest != null) {
            applyTile(Tile.STATE_ACTIVE, "Connecting")
            OryvexVpnService.start(this, lastRequest)
        } else {
            openMainActivity()
        }
    }

    private fun syncTile() {
        val running = CoreBus.running
        val stopping = CoreBus.stopping
        when {
            !running -> applyTile(Tile.STATE_INACTIVE, "Off")
            stopping -> applyTile(Tile.STATE_INACTIVE, "Disconnecting")
            OryvexVpnService.isConnected -> applyTile(Tile.STATE_ACTIVE, "Connected")
            else -> applyTile(Tile.STATE_ACTIVE, "Connecting")
        }
    }

    private fun applyTile(state: Int, subtitle: String) {
        val tile = qsTile ?: return
        tile.state = state
        tile.label = getString(R.string.app_name)
        tile.icon = Icon.createWithResource(this, R.drawable.ic_stat_core)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = subtitle
        }
        tile.updateTile()
    }

    private fun openMainActivity() {
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            startActivityAndCollapse(pendingIntent)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
