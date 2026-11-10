# AI-TV

Turn your TV into a themed, animated home screen and control it live from your phone —
like a PS4 dynamic theme: the background animates **and** the tiles, fonts, colours and
decorations change with it.

| Theme | What you get |
| --- | --- |
| **Christmas** | Snowfall, pine trees with twinkling lights, gift-wrapped tiles with bows, snow caps and string lights |
| **Halloween** | Harvest moon, bats, fog, embers, cobwebbed tiles; pumpkins or eerie blinking eyes |
| **Neon Cyberpunk** | Scrolling neon grid, striped sun, skyline, data rain, glitches |
| **Space** | Twinkling parallax stars, nebula, ringed planet, shooting stars, glassy tiles |
| **Cozy Nature** | Rolling hills that follow the real time of day, fireflies / leaves / petals, swaying grass |

Every theme has its own controls on the phone: effect intensity, animation speed, accent
colour, tile decorations, font, ambient sound, plus theme-specific knobs (wind, string-light
pattern, ribbon colour, fog, bats, nebula colour, time of day, …). You can also pick which
apps appear, add your name to the greeting, and fix overscan with a screen-edge margin.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer on any computer on your home Wi-Fi. No install step.

```sh
node server.js
```

It prints two addresses, for example:

```
On the TV, open:     http://192.168.1.20:3000/tv
On your phone, open: http://192.168.1.20:3000/
```

1. Get the **TV address** on screen (see the table below).
2. Scan the QR code shown on the TV with your iPhone camera (or open the phone address and type the 4-character code).
3. In Safari tap **Share → Add to Home Screen** so the remote opens like an app.

The TV remembers its code and its look, and the phone reconnects on its own.

## Getting it on each TV

No TV maker lets an app replace the built-in home screen, so AI-TV is a screen you open
*on* the TV rather than a replacement for the system menu.

| Device | How |
| --- | --- |
| **LG (webOS)** | Open the built-in **Web Browser** app and go to the TV address. The LG remote's arrows and OK button work. |
| **VIZIO** | No browser. Open the TV address in Chrome on a laptop and **Cast tab**, or AirPlay a Mac/iPhone screen. |
| **Apple TV** | No browser. Open the TV address on a Mac (full-screen browser) and **AirPlay / Screen Mirror** to the Apple TV. |
| **Roku** | No browser. AirPlay from a Mac/iPhone on Roku models that support it (Roku OS 9.4+). |

When mirroring, a Mac or laptop gives a proper 16:9 picture; mirroring the phone itself is
letterboxed and ties up the phone you want to use as the remote.

### Good to know

- **App tiles are web shortcuts.** Pressing OK on a tile opens that service's website in the TV's
  browser. A web page cannot launch the TV's native Netflix/YouTube apps.
- **Sound** needs one button press on the TV (browsers block audio until then). When mirroring, sound
  plays from the mirroring computer.
- The server keeps everything in memory. If it restarts, the TV restores its own look automatically.

## How it works

```
phone remote ──POST /api/state──▶ server.js ──Server-Sent Events──▶ TV screen
```

- `server.js` — zero-dependency Node server: static files, rooms keyed by pairing code, SSE relay.
- `public/themes.js` — theme catalogue, defaults and state validation (shared by TV and remote).
- `public/scene.js` — canvas renderer for the animated backgrounds (shared; the remote uses it for previews).
- `public/tv.*` — the TV screen. Written in ES5 with no modern CSS so it runs on old smart-TV browsers;
  renders at 720p and upscales, and sheds particles automatically if the TV can't keep up.
- `public/remote.*` — the phone remote.

### Adding a theme

1. Add an entry to `THEMES` in `public/themes.js` (palette, swatches, knobs).
2. Add an `IMPL.<id>` renderer in `public/scene.js` (`build` for static scenery, `spawn`/`part` for particles).
3. Add `.t-<id>` tile styles in `public/tv.css` and, optionally, decorations in `decoHtml()` in `public/tv.js`.

The remote picks up the new theme and its controls automatically.

## Tests

```sh
npm test
```

## Credits

QR codes use [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT), vendored in `public/vendor/`.
