package com.aitv.launcher

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

/**
 * The whole launcher is one full-screen WebView running the themed home screen
 * (the same HTML/CSS/JS used on the web). The native side only exposes the
 * installed-app list and app launching through [WebAppInterface]; everything
 * visual lives in assets/web/.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Behave like a TV home screen: stay on, draw edge to edge.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        web.setBackgroundColor(0xFF05060A.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
            // The app list can be large; allow the bridge to return it quickly.
            allowFileAccess = true
        }
        web.addJavascriptInterface(WebAppInterface(this), "AndroidTV")
        web.loadUrl("file:///android_asset/web/launcher.html")

        setContentView(web)
        goImmersive()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goImmersive()
    }

    private fun goImmersive() {
        @Suppress("DEPRECATION")
        web.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    /**
     * As the HOME app, BACK must not exit to a "previous" app. Hand it to the web
     * layer (to close an open panel); if the page doesn't consume it, stay put.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            web.evaluateJavascript("window.AITV_LAUNCHER && window.AITV_LAUNCHER.onBack && window.AITV_LAUNCHER.onBack();", null)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onPause() {
        super.onPause()
        if (::web.isInitialized) web.onPause()   // stop animation while another app is in front
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.onResume()
        // Refresh the app row in case apps were installed/removed while away.
        if (::web.isInitialized) {
            web.evaluateJavascript("window.AITV_LAUNCHER && window.AITV_LAUNCHER.refresh && window.AITV_LAUNCHER.refresh();", null)
        }
    }
}
