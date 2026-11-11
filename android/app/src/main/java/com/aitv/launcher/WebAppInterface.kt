package com.aitv.launcher

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Bridge the web home screen uses to see and launch the device's real apps.
 * Exposed to JavaScript as the global `AndroidTV`.
 */
class WebAppInterface(private val ctx: Context) {

    /**
     * Returns every launchable app as a JSON array of
     * { "package", "label", "icon" (a data: URI) }, sorted by label,
     * excluding this launcher itself. TV (leanback) entries are preferred, with
     * the phone-style launcher entries folded in so nothing is missing.
     */
    @JavascriptInterface
    fun listApps(): String {
        val pm = ctx.packageManager
        val seen = HashMap<String, JSONObject>()

        fun collect(category: String) {
            val intent = Intent(Intent.ACTION_MAIN, null).addCategory(category)
            for (ri in pm.queryIntentActivities(intent, 0)) {
                val pkg = ri.activityInfo.packageName
                if (pkg == ctx.packageName || seen.containsKey(pkg)) continue
                val label = ri.loadLabel(pm)?.toString() ?: pkg
                // Prefer the wide TV banner; fall back to the square icon.
                val art: Drawable = try {
                    ri.activityInfo.loadBanner(pm) ?: ri.loadIcon(pm)
                } catch (e: Exception) {
                    ri.loadIcon(pm)
                }
                val hasBanner = try { ri.activityInfo.loadBanner(pm) != null } catch (e: Exception) { false }
                seen[pkg] = JSONObject().apply {
                    put("package", pkg)
                    put("label", label)
                    put("icon", toDataUri(art))
                    put("wide", hasBanner)
                }
            }
        }

        collect(Intent.CATEGORY_LEANBACK_LAUNCHER)
        collect(Intent.CATEGORY_LAUNCHER)

        val list = seen.values.sortedBy { it.optString("label").lowercase() }
        return JSONArray(list).toString()
    }

    /** Launches an installed app by package name. Returns true if it started. */
    @JavascriptInterface
    fun launch(pkg: String): Boolean {
        val pm = ctx.packageManager
        val intent = pm.getLeanbackLaunchIntentForPackage(pkg)
            ?: pm.getLaunchIntentForPackage(pkg)
            ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            ctx.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Opens the device's system Settings (useful from the launcher's menu). */
    @JavascriptInterface
    fun openSettings(): Boolean {
        return try {
            ctx.startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Asks the system to uninstall an app (the user confirms in the system dialog). */
    @JavascriptInterface
    fun uninstall(pkg: String): Boolean {
        return try {
            ctx.startActivity(
                Intent(Intent.ACTION_DELETE, android.net.Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Opens the device's app store so the user can install more apps. */
    @JavascriptInterface
    fun openStore(): Boolean {
        if (launch("com.android.vending")) return true
        return try {
            ctx.startActivity(
                Intent(Intent.ACTION_VIEW, android.net.Uri.parse("market://search?q=tv")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun toDataUri(d: Drawable): String {
        val w = (if (d.intrinsicWidth > 0) d.intrinsicWidth else 128).coerceAtMost(320)
        val h = (if (d.intrinsicHeight > 0) d.intrinsicHeight else 128).coerceAtMost(320)
        val bmp = if (d is BitmapDrawable && d.bitmap != null) {
            d.bitmap
        } else {
            Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also {
                val c = Canvas(it)
                d.setBounds(0, 0, c.width, c.height)
                d.draw(c)
            }
        }
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
}
