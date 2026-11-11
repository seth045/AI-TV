package com.aitv.launcher

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.io.ByteArrayInputStream

/**
 * The launcher is one full-screen WebView running the themed home screen in
 * assets/web/. The native side exposes installed apps through [WebAppInterface],
 * serves their icons, forwards remote keys the page can't see (Back, Menu, Home)
 * and keeps the home screen alive when the WebView itself fails.
 */
class MainActivity : AppCompatActivity() {

    private var web: WebView? = null
    private lateinit var bridge: WebAppInterface
    private val main = Handler(Looper.getMainLooper())

    private val packagesChanged = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // installs and removals that finish while Home is showing
            main.removeCallbacks(refresh)
            main.postDelayed(refresh, 400)
        }
    }
    private val refresh = Runnable { js("refresh") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bridge = WebAppInterface(applicationContext)
        startWeb()

        // Back never leaves Home; the page decides what it closes.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = js("onBack")
        })

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        }
        ContextCompat.registerReceiver(this, packagesChanged, filter, ContextCompat.RECEIVER_NOT_EXPORTED)   // system broadcasts still arrive
    }

    /** Creates (or recreates) the WebView. Falls back to a plain message and retries if the system WebView is unavailable. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun startWeb() {
        val view = try {
            WebView(this)
        } catch (t: Throwable) {
            // System WebView is updating or disabled: a home screen must not crash-loop.
            setContentView(TextView(this).apply {
                text = getString(R.string.starting)
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.BLACK)
                textSize = 22f
                gravity = Gravity.CENTER
            })
            main.postDelayed({ if (!isFinishing && !isDestroyed) startWeb() }, 3000)
            return
        }
        view.setBackgroundColor(0xFF05060A.toInt())
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false                 // assets load regardless; nothing else on disk is reachable
            allowContentAccess = false
            textZoom = 100                          // the layout is sized to the screen, not to the system font scale
        }
        view.webViewClient = object : WebViewClient() {
            // App icons: icon/<package>.png next to the page is answered from the package manager.
            override fun shouldInterceptRequest(v: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                val path = url.path ?: return null
                if (url.scheme == "file" && path.startsWith(ICON_PATH) && path.endsWith(".png")) {
                    val pkg = Uri.decode(path.substring(ICON_PATH.length, path.length - 4))
                    val bytes = bridge.iconBytes(pkg, url.getQueryParameter("v") ?: "0")
                        ?: return WebResourceResponse("image/png", null, 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
                    return WebResourceResponse("image/png", null, ByteArrayInputStream(bytes))
                }
                return null
            }

            // The page never navigates anywhere; nothing else may gain access to the bridge.
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean =
                !request.url.toString().startsWith(ASSET_ROOT)

            // The renderer can be killed for memory while a streaming app is in front. Rebuild instead of dying.
            override fun onRenderProcessGone(v: WebView, detail: RenderProcessGoneDetail): Boolean {
                if (web === v) {
                    web = null
                    try { v.destroy() } catch (t: Throwable) { }
                    main.post { if (!isFinishing && !isDestroyed) startWeb() }
                }
                return true
            }
        }
        view.addJavascriptInterface(bridge, "AndroidTV")
        view.loadUrl(ASSET_ROOT + "launcher.html")
        web = view
        setContentView(view)
        view.requestFocus()
        goImmersive()
    }

    private fun js(method: String) {
        web?.evaluateJavascript("window.AITV_LAUNCHER && window.AITV_LAUNCHER.$method && window.AITV_LAUNCHER.$method();", null)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goImmersive()
    }

    private fun goImmersive() {
        @Suppress("DEPRECATION")
        web?.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    /** Home pressed while already on Home: return to the top of the home screen. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.hasCategory(Intent.CATEGORY_HOME)) js("home")
    }

    /** The remote's Menu key never reaches page script, so hand it over here. */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            if (event?.repeatCount == 0) js("menu")
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onPause() {
        super.onPause()
        web?.onPause()                              // stop animation while another app is in front
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
        js("refresh")                               // cheap: names only, icons are cached
    }

    override fun onDestroy() {
        try { unregisterReceiver(packagesChanged) } catch (t: Throwable) { }
        main.removeCallbacksAndMessages(null)
        web?.let { (it.parent as? android.view.ViewGroup)?.removeView(it); it.destroy() }
        web = null
        super.onDestroy()
    }

    private companion object {
        const val ASSET_ROOT = "file:///android_asset/web/"
        const val ICON_PATH = "/android_asset/web/icon/"
    }
}
