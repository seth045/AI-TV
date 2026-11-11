package com.aitv.launcher

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.util.LruCache
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Bridge the web home screen uses to see and launch the device's real apps.
 * Exposed to JavaScript as the global `AndroidTV`.
 *
 * App icons are NOT sent through the bridge: [listApps] returns only names and a
 * small relative URL per app, and the WebView fetches each picture through
 * [iconBytes] (see MainActivity.shouldInterceptRequest). That keeps the list call
 * fast and small no matter how many apps are installed.
 */
class WebAppInterface(private val ctx: Context) {

    private val memory = object : LruCache<String, ByteArray>(6 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray) = value.size
    }

    /**
     * Every launchable app as a JSON array of { package, label, icon }, excluding this
     * launcher. `icon` is a URL relative to the page ("icon/<package>.png?v=<updated>").
     * TV (leanback) entries come first; phone-style launcher entries fill the gaps.
     * One misbehaving app can never fail the whole list.
     */
    @JavascriptInterface
    fun listApps(): String {
        val pm = ctx.packageManager
        val seen = LinkedHashMap<String, JSONObject>()
        for (category in arrayOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)) {
            val found = try {
                pm.queryIntentActivities(Intent(Intent.ACTION_MAIN, null).addCategory(category), 0)
            } catch (t: Throwable) {
                emptyList()
            }
            for (ri in found) {
                try {
                    val pkg = ri.activityInfo.packageName
                    if (pkg == ctx.packageName || seen.containsKey(pkg)) continue
                    val label = (ri.loadLabel(pm)?.toString() ?: "").trim().ifEmpty { pkg }
                    val updated = try { pm.getPackageInfo(pkg, 0).lastUpdateTime } catch (t: Throwable) { 0L }
                    seen[pkg] = JSONObject()
                        .put("package", pkg)
                        .put("label", label)
                        .put("icon", "icon/" + Uri.encode(pkg) + ".png?v=" + updated)
                } catch (t: Throwable) {
                    // skip just this app
                }
            }
        }
        return JSONArray(seen.values.sortedBy { it.optString("label").lowercase() }).toString()
    }

    /** Launches an installed app by package name. Returns true if it started. */
    @JavascriptInterface
    fun launch(pkg: String): Boolean {
        return try {
            val pm = ctx.packageManager
            val intent = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (t: Throwable) {
            false
        }
    }

    /** Opens the device's system Settings. */
    @JavascriptInterface
    fun openSettings(): Boolean {
        return try {
            ctx.startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (t: Throwable) {
            false
        }
    }

    /** Asks the system to uninstall an app (the user confirms in the system dialog). */
    @JavascriptInterface
    fun uninstall(pkg: String): Boolean {
        return try {
            ctx.startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (t: Throwable) {
            false
        }
    }

    /** Opens the device's app store so the user can install more apps. */
    @JavascriptInterface
    fun openStore(): Boolean {
        if (launch("com.android.vending")) return true
        return try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=tv")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (t: Throwable) {
            false
        }
    }

    /**
     * PNG bytes of an app's TV banner (or icon), scaled to fit 320x180 keeping its
     * shape. Cached in memory and on disk per app version. Called from a WebView
     * background thread; returns null if the app or its artwork can't be read.
     */
    fun iconBytes(pkg: String, version: String): ByteArray? {
        val key = "$pkg@$version"
        memory.get(key)?.let { return it }
        val safe = key.replace(Regex("[^A-Za-z0-9._@-]"), "_")
        val dir = File(ctx.cacheDir, "icons")
        val file = File(dir, "$safe.png")
        try {
            if (file.isFile && file.length() > 0) return file.readBytes().also { memory.put(key, it) }
        } catch (t: Throwable) {
            // fall through and regenerate
        }
        val bytes = try { render(pkg) } catch (t: Throwable) { null } ?: return null
        memory.put(key, bytes)
        try {
            dir.mkdirs()
            // drop pictures of older versions of the same app
            dir.listFiles { f -> f.name.startsWith(pkg.replace(Regex("[^A-Za-z0-9._@-]"), "_") + "@") }?.forEach { it.delete() }
            file.writeBytes(bytes)
        } catch (t: Throwable) {
            // the disk cache is only an optimisation
        }
        return bytes
    }

    private fun render(pkg: String): ByteArray? {
        val pm = ctx.packageManager
        val component: ComponentName? =
            (pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg))?.component
        val art: Drawable = (component?.let { c ->
            try { pm.getActivityBanner(c) } catch (t: PackageManager.NameNotFoundException) { null }
        } ?: try { pm.getApplicationBanner(pkg) } catch (t: PackageManager.NameNotFoundException) { null }
        ?: component?.let { c -> try { pm.getActivityIcon(c) } catch (t: PackageManager.NameNotFoundException) { null } }
        ?: try { pm.getApplicationIcon(pkg) } catch (t: PackageManager.NameNotFoundException) { null })
            ?: return null

        val iw = if (art.intrinsicWidth > 0) art.intrinsicWidth else 180
        val ih = if (art.intrinsicHeight > 0) art.intrinsicHeight else 180
        val scale = minOf(320f / iw, 180f / ih, 1f).coerceAtLeast(0.01f)
        val w = (iw * scale).toInt().coerceAtLeast(1)
        val h = (ih * scale).toInt().coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        return try {
            art.setBounds(0, 0, w, h)
            art.draw(Canvas(bmp))                    // drawing also handles adaptive, vector and hardware-backed icons
            ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        } finally {
            bmp.recycle()
        }
    }
}
