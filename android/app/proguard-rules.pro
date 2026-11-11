# Keep the JavaScript bridge methods callable from the WebView.
-keepclassmembers class com.aitv.launcher.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}
