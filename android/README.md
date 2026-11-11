# AI-TV Launcher (Android TV / Google TV)

A themed, animated home-screen **launcher** for Android TV / Google TV devices
(Chromecast with Google TV, onn 4K, Nvidia Shield, etc.). It becomes the home
screen, shows your **real installed apps with their real icons**, and launches
them — with the animated themes (Christmas, Halloween, Neon, Space, Cozy Nature)
running behind them.

The whole UI is the web app in `app/src/main/assets/web/` (shared with the web
version). The native part is tiny: a full-screen WebView plus a bridge
(`WebAppInterface.kt`) that lists and launches installed apps.

## What you need

- **A computer** with **Android Studio** (free): https://developer.android.com/studio
  (Android Studio installs the Android SDK for you on first run.)
- **The Onn 4K** (or any Android TV / Google TV device) and its remote.
- Both the computer and the Onn on the **same Wi-Fi**.

## Build the app (on your computer)

### Option A — Android Studio (easiest)
1. Open Android Studio → **Open** → select this `android/` folder.
2. Let it sync (it downloads the Gradle plugin + SDK pieces the first time).
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. The file lands at `app/build/outputs/apk/debug/app-debug.apk`.

### Option B — command line
```sh
cd android
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```
(The first run downloads the Android Gradle Plugin and SDK bits; needs internet.)

## Put it on the Onn (sideload over Wi-Fi)

**On the Onn, one time:**
1. **Settings → System → About →** click **Android TV OS build** (or **Build**)
   7 times to unlock **Developer options**.
2. **Settings → System → Developer options →** turn on **USB debugging** and
   **Network debugging** (sometimes "Wireless debugging"). Note the Onn's
   **IP address** (Settings → Network, or Developer options shows it).
3. **Settings → Apps → Security & restrictions → Unknown sources** → allow.

**From your computer** (ADB comes with Android Studio, in `platform-tools`):
```sh
adb connect <ONN_IP>:5555        # approve the prompt on the TV the first time
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

No computer handy later? Install the **Downloader** app on the Onn from the Play
Store, host the APK somewhere, and open the link in Downloader.

## Make it the home screen

1. Press the Onn's **Home** button.
2. Google TV asks which app to use as Home → choose **AI-TV** → **Always**.
   - Google TV sometimes hides this; if so: **Settings → Apps → See all apps →
     AI-TV → Open**, or install a tiny helper like "Launcher Manager" to set the
     default. (This is Google TV friction, not a bug.)

Now the Onn boots into AI-TV. **Left/Right** moves between apps, **OK** launches
the real app, **Up** (or Menu) opens **Customize** (theme, intensity, lights,
accent, decorations, sound), **Back** closes it.

## Notes / roadmap

- **Real icons:** tiles use each app's own official icon from the system — nothing
  is hand-drawn or trademark-copied.
- **Phone control & "from anywhere":** not in this build yet. The plan is the
  cloud relay (see the repo root) so your phone can retune the TV from anywhere;
  it drops into this launcher next.
- **Video / photo wallpapers:** the drawn scenes animate now; per-theme photo and
  looping-video backgrounds are a planned add.
- **Default-launcher on Google TV:** Google TV is stricter than plain Android TV
  about honoring third-party launchers; on an Nvidia Shield it's seamless.
