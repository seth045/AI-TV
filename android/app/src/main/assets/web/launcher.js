/* AI-TV launcher.
 *
 * One shell, many themes. A theme supplies artwork (themes/<id>/home.webp and tile
 * sprites), tokens in launcher.css (.theme-<id>) and an ambient effect; everything
 * else — the app grid, focus handling, settings, app management — is shared, so
 * every theme behaves identically.
 *
 * Native side: window.AndroidTV (see WebAppInterface.kt). Without it (a desktop
 * browser) the launcher runs in preview mode with sample apps.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ themes
  // To add a theme: create themes/<id>/ (home.webp, thumb.webp, t_blank.webp and
  // optional t_<art>.webp tiles), add a .theme-<id> block to launcher.css, and
  // list it here. `fx` names an effect in FX below; `options` are its switches.
  var THEMES = [
    { id: 'christmas', name: 'Christmas', tagline: 'A cabin by a frozen lake', rows: 2, fx: 'snow',
      options: [{ key: 'snow', label: 'Snowfall', desc: 'Soft flakes drifting across the screen' }] },
    { id: 'space', name: 'Deep Space', tagline: 'An outpost under a ringed station', rows: 2, fx: 'space',
      options: [
        { key: 'stars', label: 'Living starfield', desc: 'Twinkling stars and the odd meteor' },
        { key: 'ships', label: 'Passing ships', desc: 'A craft crosses the sky now and then' },
        { key: 'ring', label: 'Station lights', desc: 'Energy traces around the orbital station' },
        { key: 'nebula', label: 'Nebula glow', desc: 'The nebula slowly breathes' }
      ] }
  ];
  // Apps that have hand-finished tile art in every theme: [art id, packages, label pattern, preview name]
  var ART = [
    ['netflix', ['com.netflix.ninja'], /netflix/i, 'Netflix'],
    ['disney', ['com.disney.disneyplus'], /disney/i, 'Disney+'],
    ['max', ['com.wbd.stream', 'com.hbo.hbonow', 'com.hbo.hbomax'], /^(hbo )?max$/i, 'Max'],
    ['prime', ['com.amazon.amazonvideo.livingroom', 'com.amazon.avod.thirdpartyclient'], /prime video|amazon video/i, 'Prime Video'],
    ['youtube', ['com.google.android.youtube.tv'], /^youtube$/i, 'YouTube'],
    ['hulu', ['com.hulu.plus', 'com.hulu.livingroomplus'], /hulu/i, 'Hulu'],
    ['apple', ['com.apple.atve.androidtv.appletv'], /apple tv/i, 'Apple TV']
  ];
  var VERSION = '1.1';

  // ------------------------------------------------------------------ helpers
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function themeById(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return THEMES[0]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var bridge = window.AndroidTV;
  var native = !!(bridge && bridge.listApps && bridge.launch);
  var stage = $('stage'), grid = $('grid'), tilesEl = $('tiles'), modalsEl = $('modals');

  // ------------------------------------------------------------------ state
  var prefs = load('aitv_prefs', {});
  if (typeof prefs.clock24 !== 'boolean') prefs.clock24 = false;
  if (typeof prefs.calm !== 'boolean') prefs.calm = false;
  if (!prefs.fx) prefs.fx = {};
  var theme = themeById(load('aitv_theme', THEMES[0].id));
  var installed = [], byPkg = {}, pins = [];
  var focusIndex = 0, firstRow = 0, moving = null;
  function fxOn(key) { var o = prefs.fx[theme.id]; return !(o && o[key] === false); }

  // ------------------------------------------------------------------ apps
  function artFor(app) {
    var i;
    for (i = 0; i < ART.length; i++) if (ART[i][1].indexOf(app.package) >= 0) return ART[i][0];
    for (i = 0; i < ART.length; i++) if (ART[i][2].test(app.label || '')) return ART[i][0];
    return null;
  }
  // Returns false (and keeps what we had) if the device gave no list: a transient
  // failure must never be mistaken for "the user has no apps" and wipe their layout.
  function loadInstalled() {
    var list = null;
    if (native) { try { list = JSON.parse(bridge.listApps()); } catch (e) { list = null; } if (!list || !list.length) return false; }
    else list = ART.map(function (a) { return { package: 'demo:' + a[0], label: a[3], icon: '' }; });
    installed = list; byPkg = {};
    installed.forEach(function (a) { a.art = artFor(a); byPkg[a.package] = a; });
    return true;
  }
  // Pins are what is on Home. Apps installed later are added automatically, as on a stock TV home screen.
  function syncPins() {
    var saved = load('aitv_pins', null), known = load('aitv_known', null);
    if (saved && saved.length !== undefined) {
      pins = saved.filter(function (p) { return byPkg[p]; });
      if (known) installed.forEach(function (a) { if (known.indexOf(a.package) < 0 && pins.indexOf(a.package) < 0) pins.push(a.package); });
    } else {
      pins = [];
      ART.forEach(function (a) {
        for (var i = 0; i < installed.length; i++) if (installed[i].art === a[0] && pins.indexOf(installed[i].package) < 0) { pins.push(installed[i].package); break; }
      });
    }
    save('aitv_pins', pins); save('aitv_known', installed.map(function (a) { return a.package; }));
  }
  function launch(pkg) {
    var a = byPkg[pkg]; if (!a) return;
    if (!native) { toast('Preview: this would open ' + a.label); return; }
    var ok = false; try { ok = !!bridge.launch(pkg); } catch (e) {}
    if (!ok) toast('Couldn’t open ' + a.label);
  }

  // ------------------------------------------------------------------ layout
  function fit() {
    var w = stage.getBoundingClientRect().width;
    document.documentElement.style.fontSize = (w / 100) + 'px';
    sizeGrid(); FX.resize();
  }
  function cols() { return parseInt(getComputedStyle(document.body).getPropertyValue('--cols'), 10) || 6; }
  function rowPitch() {
    var t = tilesEl.children[0]; if (!t) return 0;
    var cs = getComputedStyle(tilesEl);
    return t.getBoundingClientRect().height / (t.matches(':focus') ? 1 : 1) + parseFloat(cs.rowGap || 0);
  }
  function sizeGrid() {
    var t = tilesEl.children[0]; if (!t) return;
    var cs = getComputedStyle(tilesEl), pad = parseFloat(cs.paddingTop) || 0, gap = parseFloat(cs.rowGap) || 0;
    var h = t.offsetHeight;
    grid.style.height = (pad * 2 + theme.rows * h + (theme.rows - 1) * gap) + 'px';
    scrollRows(false);
  }
  function scrollRows() {
    var t = tilesEl.children[0]; if (!t) return;
    var gap = parseFloat(getComputedStyle(tilesEl).rowGap) || 0, n = cols();
    var total = Math.ceil(tilesEl.children.length / n);
    firstRow = clamp(firstRow, 0, Math.max(0, total - theme.rows));
    tilesEl.style.transform = 'translateY(' + (-firstRow * (t.offsetHeight + gap)) + 'px)';
    for (var i = 0; i < tilesEl.children.length; i++) {
      var r = Math.floor(i / n);
      tilesEl.children[i].classList.toggle('out', r < firstRow || r >= firstRow + theme.rows);
    }
    $('more').classList.toggle('on', firstRow + theme.rows < total);
  }

  // ------------------------------------------------------------------ tiles
  function tileHtml(a, i) {
    var dir = 'themes/' + theme.id + '/';
    if (a.add) {
      return '<div class="tile" role="listitem" tabindex="-1" data-f data-key="+" style="--i:' + i + '" aria-label="Add or remove apps">' +
        '<div class="art" style="background-image:url(' + dir + 't_blank.webp)"></div><span class="plus">+</span><span class="lbl">Add apps</span></div>';
    }
    return '<div class="tile" role="listitem" tabindex="-1" data-f data-key="' + esc(a.package) + '" style="--i:' + i + '" aria-label="' + esc(a.label) + '">' +
      '<div class="art" style="background-image:url(' + dir + 't_' + (a.art || 'blank') + '.webp)"></div>' +
      (a.art ? '' : (a.icon ? '<img class="ico" alt="" src="' + esc(a.icon) + '">' : '') + '<span class="lbl">' + esc(a.label) + '</span>') + '</div>';
  }
  function items() { return pins.map(function (p) { return byPkg[p]; }).filter(Boolean).concat([{ add: true }]); }
  function render(animate) {
    var list = items();
    tilesEl.innerHTML = list.map(tileHtml).join('');
    if (!animate) for (var i = 0; i < tilesEl.children.length; i++) tilesEl.children[i].style.animation = 'none';
    focusIndex = clamp(focusIndex, 0, list.length - 1);
    sizeGrid();
    if (moving) markMoving();
    if (!stack.length && document.activeElement !== $('gear')) focusTile(focusIndex);   // the focused tile was just rebuilt
  }
  function tileAt(i) { return tilesEl.children[i]; }
  function focusTile(i) {
    var n = tilesEl.children.length; if (!n) return;
    focusIndex = clamp(i, 0, n - 1);
    var c = cols(), r = Math.floor(focusIndex / c);
    if (r < firstRow) firstRow = r; else if (r >= firstRow + theme.rows) firstRow = r - theme.rows + 1;
    scrollRows();
    var el = tileAt(focusIndex); if (el) el.focus({ preventScroll: true });
    parallax();
  }
  // The scenery leans a touch toward the focused column: cheap depth, no extra drawing.
  function parallax() {
    var c = cols(), col = focusIndex % c, f = c > 1 ? col / (c - 1) - 0.5 : 0, r = Math.floor(focusIndex / c) - firstRow;
    $('bg').style.transform = prefs.calm ? 'scale(1.03)' : 'scale(1.03) translate(' + (-f * 0.9).toFixed(3) + '%,' + (-r * 0.25).toFixed(3) + '%)';
  }
  function activateTile(el) {
    var key = el.getAttribute('data-key');
    if (key === '+') openApps(); else launch(key);
  }

  // ------------------------------------------------------------------ move mode
  function markMoving() {
    for (var i = 0; i < tilesEl.children.length; i++) tilesEl.children[i].classList.toggle('moving', tilesEl.children[i].getAttribute('data-key') === moving);
  }
  function startMove(pkg) { moving = pkg; focusTile(pins.indexOf(pkg)); markMoving(); toast('Use ‹ › to move, OK when done'); }
  function endMove() { if (!moving) return; moving = null; markMoving(); save('aitv_pins', pins); }
  function shift(d) {
    var i = pins.indexOf(moving), j = i + d; if (i < 0 || j < 0 || j >= pins.length) return;
    pins.splice(j, 0, pins.splice(i, 1)[0]); render(false); focusTile(j);
  }

  // ------------------------------------------------------------------ modals
  var stack = [];
  function topModal() { return stack[stack.length - 1]; }
  function openModal(build, cls) {
    var layer = document.createElement('div'); layer.className = 'layer';
    var card = document.createElement('div'); card.className = 'card' + (cls ? ' ' + cls : ''); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    layer.appendChild(card); modalsEl.appendChild(layer);
    var m = { layer: layer, card: card, build: build, back: document.activeElement };
    stack.push(m); paintModal(m, null);
    layer.addEventListener('mousedown', function (e) { if (e.target === layer) closeModal(); });
    return m;
  }
  function paintModal(m, keepId) {
    var body = m.card.querySelector('.body'), top = body ? body.scrollTop : 0;
    var idx = [].indexOf.call(m.card.querySelectorAll('[data-f]'), document.activeElement);
    m.card.innerHTML = m.build();
    var nb = m.card.querySelector('.body'); if (nb) nb.scrollTop = top;
    var all = m.card.querySelectorAll('[data-f]');
    var el = keepId ? m.card.querySelector('[data-id="' + keepId.replace(/"/g, '') + '"]') : null;
    if (!el && idx >= 0) el = all[Math.min(idx, all.length - 1)];          // the item went away: stay where the user was
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); } else all[0].focus();
  }
  function repaint(keepId) { var m = topModal(); if (m) paintModal(m, keepId); }
  function closeModal(silent) {
    var m = stack.pop(); if (!m) return;
    m.layer.classList.add('closing');
    setTimeout(function () { if (m.layer.parentNode) m.layer.parentNode.removeChild(m.layer); }, 170);
    if (silent) return;
    var t = topModal();
    if (t) { var f = t.card.querySelector('[data-f]'); (document.body.contains(m.back) && t.card.contains(m.back) ? m.back : f).focus(); }
    else if (m.back === $('gear')) $('gear').focus(); else focusTile(focusIndex);
  }
  function closeAll() { while (stack.length) closeModal(true); focusTile(focusIndex); }

  function sw(on) { return '<span class="sw' + (on ? ' on' : '') + '"></span>'; }
  function row(id, act, title, desc, right, extra) {
    return '<button class="row" data-f data-id="' + id + '" data-act="' + act + '"' + (extra || '') + '><span class="txt"><b>' + esc(title) + '</b>' + (desc ? '<small>' + esc(desc) + '</small>' : '') + '</span>' + (right || '') + '</button>';
  }

  // ---- settings
  function settingsHtml() {
    var h = '<header><span class="eyebrow">Settings</span><h1>Make it yours</h1></header><div class="body">';
    h += '<h2>Theme</h2><div class="tcards">' + THEMES.map(function (t) {
      return '<button class="tcard' + (t.id === theme.id ? ' sel' : '') + '" data-f data-id="theme-' + t.id + '" data-act="theme" data-v="' + t.id + '" aria-label="' + esc(t.name) + ' theme">' +
        '<img alt="" src="themes/' + t.id + '/thumb.webp"><span class="on">ACTIVE</span><span class="meta"><b>' + esc(t.name) + '</b><small>' + esc(t.tagline) + '</small></span></button>';
    }).join('') + '</div>';
    h += '<h2>' + esc(theme.name) + ' effects</h2>' + theme.options.map(function (o) {
      return row('fx-' + o.key, 'fx', o.label, o.desc, sw(fxOn(o.key)), ' data-v="' + o.key + '" role="switch" aria-checked="' + fxOn(o.key) + '"');
    }).join('');
    h += '<h2>Display</h2>' +
      row('clock24', 'clock24', '24-hour clock', 'Show the time as 18:30 rather than 6:30 PM', sw(prefs.clock24), ' role="switch" aria-checked="' + prefs.clock24 + '"') +
      row('calm', 'calm', 'Reduce motion', 'Pause background animation and transitions', sw(prefs.calm), ' role="switch" aria-checked="' + prefs.calm + '"');
    h += '<h2>Apps</h2>' +
      row('apps', 'apps', 'Manage apps', 'Choose what appears on Home, reorder or uninstall', '<span class="chev">›</span>') +
      (native && bridge.openStore ? row('store', 'store', 'Get more apps', 'Open the app store on this device', '<span class="chev">›</span>') : '') +
      (native && bridge.openSettings ? row('device', 'device', 'Device settings', 'Network, display, accounts and more', '<span class="chev">›</span>') : '');
    h += '</div><footer><button class="btn primary" data-f data-id="done" data-act="close">Done</button><span class="hint">Hold OK on an app for more options · v' + VERSION + '</span></footer>';
    return h;
  }
  function openSettings() { openModal(settingsHtml); }

  // ---- manage apps
  function appsHtml() {
    var list = pins.map(function (p) { return byPkg[p]; }).filter(Boolean).concat(
      installed.filter(function (a) { return pins.indexOf(a.package) < 0; }).sort(function (a, b) { return (a.label || '').localeCompare(b.label || ''); }));
    var canDel = native && bridge.uninstall;
    var h = '<header><span class="eyebrow">Your Home screen</span><h1>Manage apps</h1><p>Switch an app on to show it on Home. New apps you install are added automatically.</p></header><div class="body">';
    if (!list.length) h += '<p style="font-size:1.4rem;color:var(--muted)">No apps found on this device.</p>';
    h += list.map(function (a) {
      var on = pins.indexOf(a.package) >= 0;
      var ico = a.icon ? '<img class="appico" alt="" src="' + esc(a.icon) + '">' : '<span class="appph">' + esc((a.label || '?').charAt(0)) + '</span>';
      var r = '<button class="row" data-f data-id="pin-' + esc(a.package) + '" data-act="pin" data-v="' + esc(a.package) + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(a.label) + ' on Home">' + ico +
        '<span class="txt"><b>' + esc(a.label) + '</b><small>' + (on ? 'On Home' : 'Hidden') + '</small></span>' + sw(on) + '</button>';
      return canDel ? '<div class="pair">' + r + '<button class="btn danger" data-f data-id="del-' + esc(a.package) + '" data-act="uninstall" data-v="' + esc(a.package) + '" aria-label="Uninstall ' + esc(a.label) + '">Uninstall</button></div>' : r;
    }).join('');
    h += '</div><footer><button class="btn primary" data-f data-id="done" data-act="close">Done</button>' +
      (native && bridge.openStore ? '<button class="btn" data-f data-id="store" data-act="store">Get more apps</button>' : '') + '</footer>';
    return h;
  }
  function openApps() { openModal(appsHtml); }

  // ---- per-app menu (hold OK)
  function openAppMenu(pkg) {
    var a = byPkg[pkg]; if (!a) return;
    openModal(function () {
      var i = pins.indexOf(pkg);
      return '<header><span class="eyebrow">App options</span><h1>' + esc(a.label) + '</h1></header><div class="body stack">' +
        '<button class="btn primary" data-f data-id="open" data-act="open" data-v="' + esc(pkg) + '">Open</button>' +
        (pins.length > 1 ? '<button class="btn" data-f data-id="move" data-act="move" data-v="' + esc(pkg) + '">Move</button>' : '') +
        (i > 0 ? '<button class="btn" data-f data-id="front" data-act="front" data-v="' + esc(pkg) + '">Move to front</button>' : '') +
        '<button class="btn" data-f data-id="hide" data-act="hide" data-v="' + esc(pkg) + '">Remove from Home</button>' +
        (native && bridge.uninstall ? '<button class="btn danger" data-f data-id="del" data-act="uninstall" data-v="' + esc(pkg) + '">Uninstall</button>' : '') +
        '</div><footer><button class="btn" data-f data-id="cancel" data-act="close">Cancel</button></footer>';
    }, 'small');
  }

  var ACTIONS = {
    close: function () { closeModal(); },
    theme: function (v) { if (v !== theme.id) setTheme(v, true); },
    fx: function (v, el) { var o = prefs.fx[theme.id] || (prefs.fx[theme.id] = {}); o[v] = !fxOn(v); save('aitv_prefs', prefs); applyFx(); repaint(el.getAttribute('data-id')); },
    clock24: function (v, el) { prefs.clock24 = !prefs.clock24; save('aitv_prefs', prefs); tick(true); repaint(el.getAttribute('data-id')); },
    calm: function (v, el) { prefs.calm = !prefs.calm; save('aitv_prefs', prefs); applyFx(); repaint(el.getAttribute('data-id')); },
    apps: function () { openApps(); },
    store: function () { try { bridge.openStore(); } catch (e) {} },
    device: function () { try { bridge.openSettings(); } catch (e) {} },
    pin: function (v, el) {
      var i = pins.indexOf(v); if (i >= 0) pins.splice(i, 1); else pins.push(v);
      save('aitv_pins', pins); render(false);
      // update in place so the list doesn't jump while the user is toggling
      var on = i < 0; el.setAttribute('aria-checked', String(on)); el.querySelector('.sw').classList.toggle('on', on); el.querySelector('small').textContent = on ? 'On Home' : 'Hidden';
    },
    uninstall: function (v) { try { bridge.uninstall(v); } catch (e) {} },
    open: function (v) { closeAll(); launch(v); },
    move: function (v) { closeAll(); startMove(v); },
    front: function (v) { var i = pins.indexOf(v); if (i > 0) { pins.splice(0, 0, pins.splice(i, 1)[0]); save('aitv_pins', pins); render(false); } closeAll(); focusTile(0); },
    hide: function (v) { var i = pins.indexOf(v); if (i >= 0) { pins.splice(i, 1); save('aitv_pins', pins); render(false); } closeAll(); toast((byPkg[v] ? byPkg[v].label : 'App') + ' removed from Home'); }
  };
  modalsEl.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
    var fn = ACTIONS[t.getAttribute('data-act')]; if (fn) fn(t.getAttribute('data-v'), t);
  });

  // ------------------------------------------------------------------ toast
  var toastTimer = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  // ------------------------------------------------------------------ clock
  var lastStamp = '';
  function tick(force) {
    var d = new Date(), stamp = d.getHours() + ':' + d.getMinutes() + prefs.clock24;
    if (!force && stamp === lastStamp) return; lastStamp = stamp;
    $('time').textContent = d.toLocaleTimeString([], prefs.clock24 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: 'numeric', minute: '2-digit' });
    $('date').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ------------------------------------------------------------------ ambient effects
  var FX = (function () {
    var cv = $('fx'), ctx = cv.getContext('2d'), W = 0, H = 0, raf = 0, last = 0, mode = null, parts = [], meteors = [], nextMeteor = 4, sprites = {};
    function sprite(color, hard) {
      var k = color + hard; if (sprites[k]) return sprites[k];
      var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d');
      var gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, color); gr.addColorStop(hard, color); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return (sprites[k] = c);
    }
    function seed() {
      parts = []; meteors = []; var i;
      if (mode === 'snow') {
        for (i = 0; i < 120; i++) { var z = Math.random(); parts.push({ x: Math.random() * W, y: Math.random() * H, z: z, r: (0.9 + z * z * 3.4) * W / 960, vy: (14 + z * 46) * H / 540, ph: Math.random() * 6.28, sw: 6 + z * 16 }); }
      } else if (mode === 'space') {
        // stars only where the artwork shows open sky: not over the planet, the astronaut's ridge or the station
        var tries = 0;
        while (parts.length < 120 && tries++ < 4000) {
          var u = Math.random(), v = Math.random() * 0.52, dx = u - 0.257, dy = (v - 0.457) * 0.5628;
          if (Math.sqrt(dx * dx + dy * dy) < 0.245 || (u < 0.31 && v > 0.16) || (u > 0.72 && v > 0.05 && v < 0.42)) continue;
          parts.push({ x: u * W, y: v * H, r: (0.5 + Math.random() * 1.5) * W / 960, ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 1.9, blue: Math.random() < 0.3 });
        }
      }
    }
    function draw(dt, t) {
      ctx.clearRect(0, 0, W, H); var i, p;
      if (mode === 'snow') {
        if (!fxOn('snow')) return;
        var white = sprite('rgba(255,255,255,1)', 0.35);
        for (i = 0; i < parts.length; i++) {
          p = parts[i]; p.y += p.vy * dt; p.x += Math.sin(t * 0.7 + p.ph) * p.sw * dt + (6 + p.z * 14) * dt * W / 960;
          if (p.y > H + 6) { p.y = -6; p.x = Math.random() * W; } if (p.x > W + 6) p.x -= W + 12;
          ctx.globalAlpha = 0.25 + p.z * 0.65; ctx.drawImage(white, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
      } else if (mode === 'space') {
        if (!fxOn('stars')) return;
        var w = sprite('rgba(255,255,255,1)', 0.25), b = sprite('rgba(150,225,255,1)', 0.25);
        for (i = 0; i < parts.length; i++) {
          p = parts[i]; var a = 0.5 + 0.5 * Math.sin(t * p.sp + p.ph); a = a * a;
          ctx.globalAlpha = 0.08 + 0.72 * a; var r = p.r * (1 + a * 0.9);
          ctx.drawImage(p.blue ? b : w, p.x - r, p.y - r, r * 2, r * 2);
        }
        nextMeteor -= dt;
        if (nextMeteor <= 0) { nextMeteor = 5 + Math.random() * 9; var dir = Math.random() < 0.5 ? 1 : -1; meteors.push({ x: W * (0.15 + Math.random() * 0.7), y: H * (0.03 + Math.random() * 0.22), vx: dir * W * (0.34 + Math.random() * 0.2), vy: H * (0.14 + Math.random() * 0.1), life: 1 }); }
        for (i = meteors.length - 1; i >= 0; i--) {
          var m = meteors[i]; m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 1.25;
          if (m.life <= 0) { meteors.splice(i, 1); continue; }
          var len = 0.16, gx = m.x - m.vx * len, gy = m.y - m.vy * len, gr = ctx.createLinearGradient(m.x, m.y, gx, gy);
          gr.addColorStop(0, 'rgba(255,255,255,' + (0.95 * m.life) + ')'); gr.addColorStop(0.3, 'rgba(155,241,255,' + (0.5 * m.life) + ')'); gr.addColorStop(1, 'rgba(155,241,255,0)');
          ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.lineWidth = Math.max(1, W / 640); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(gx, gy); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (now - last < 30) return;                      // ~30fps is plenty and halves the work on a TV stick
      var dt = Math.min(0.08, (now - last) / 1000); last = now; draw(dt, now / 1000);
    }
    return {
      resize: function () { var r = stage.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 1.5); W = cv.width = Math.round(r.width * d); H = cv.height = Math.round(r.height * d); seed(); },
      set: function (m) { mode = m; seed(); },
      run: function (on) { cancelAnimationFrame(raf); raf = 0; if (on) { last = performance.now(); raf = requestAnimationFrame(loop); } else ctx.clearRect(0, 0, W, H); }
    };
  })();

  var SPACE_DOM =
    '<div class="sp-nebula"></div>' +
    '<div class="sp-ring"><svg viewBox="0 0 500 265" preserveAspectRatio="none"><defs><linearGradient id="spl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ec8ff" stop-opacity="0"/><stop offset=".48" stop-color="#5cefff" stop-opacity=".9"/><stop offset=".8" stop-color="#d36dff" stop-opacity=".75"/><stop offset="1" stop-color="#4ec8ff" stop-opacity="0"/></linearGradient></defs>' +
    '<g transform="rotate(-11 250 132)"><ellipse class="sp-trace" cx="250" cy="132" rx="215" ry="64" fill="none" stroke="url(#spl)" stroke-width="7" stroke-linecap="round" stroke-dasharray="42 36 9 250" opacity=".35"/>' +
    '<ellipse class="sp-trace" cx="250" cy="132" rx="215" ry="64" fill="none" stroke="url(#spl)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="42 36 9 250"/>' +
    '<ellipse class="sp-trace rev" cx="250" cy="132" rx="198" ry="56" fill="none" stroke="#bddcff" stroke-width="1.3" stroke-dasharray="7 42 14 120" opacity=".7"/></g></svg></div>' +
    '<i class="sp-beacon" style="left:84.9%;top:8.3%"></i><i class="sp-beacon" style="left:87.6%;top:36.6%;animation-delay:-1.3s"></i>' +
    '<div class="sp-ship"></div>';

  function applyFx() {
    document.body.classList.toggle('calm', prefs.calm);
    theme.options.forEach(function (o) { document.body.classList.toggle('fx-off-' + o.key, !fxOn(o.key)); });
    FX.run(!prefs.calm && !document.hidden);
    parallax();
  }

  // ------------------------------------------------------------------ theme
  function paintTheme() {
    var cls = document.body.className.split(/\s+/).filter(function (c) { return c && c.indexOf('theme-') !== 0 && c.indexOf('fx-off-') !== 0; });
    cls.push('theme-' + theme.id); document.body.className = cls.join(' ');
    $('bg').src = 'themes/' + theme.id + '/home.webp';
    $('fxdom').innerHTML = theme.fx === 'space' ? SPACE_DOM : '';
    FX.set(theme.fx); firstRow = 0;
    render(true); fit(); applyFx();
  }
  function setTheme(id, animate) {
    theme = themeById(id); save('aitv_theme', theme.id);
    if (!animate || prefs.calm) { paintTheme(); repaint('theme-' + theme.id); return; }
    var veil = $('veil'); veil.classList.add('on');
    setTimeout(function () {
      var img = new Image(), done = false;
      function go() { if (done) return; done = true; paintTheme(); repaint('theme-' + theme.id); requestAnimationFrame(function () { veil.classList.remove('on'); }); }
      img.onload = go; img.onerror = go; img.src = 'themes/' + theme.id + '/home.webp'; setTimeout(go, 900);
    }, 270);
  }

  // ------------------------------------------------------------------ input
  var okTimer = 0, okTarget = null, okLong = false, okModal = null;
  function key(e) {
    var k = e.key, c = e.keyCode;
    if (k === 'ArrowLeft' || c === 37 || c === 21) return 'left';
    if (k === 'ArrowRight' || c === 39 || c === 22) return 'right';
    if (k === 'ArrowUp' || c === 38 || c === 19) return 'up';
    if (k === 'ArrowDown' || c === 40 || c === 20) return 'down';
    if (k === 'Enter' || c === 13 || c === 23 || c === 66) return 'ok';
    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || c === 27 || c === 4 || c === 461) return 'back';
    if (k === 'ContextMenu' || c === 82 || c === 93) return 'menu';
    return null;
  }
  function nearest(from, dir, list) {
    var a = from.getBoundingClientRect(), px = a.left + a.width / 2, py = a.top + a.height / 2, best = null, score = Infinity;
    var vert = dir === 'up' || dir === 'down', sign = dir === 'left' || dir === 'up' ? -1 : 1;
    list.forEach(function (b) {
      if (b === from) return;
      var r = b.getBoundingClientRect(), dx = r.left + r.width / 2 - px, dy = r.top + r.height / 2 - py;
      var main = vert ? dy : dx, cross = Math.abs(vert ? dx : dy);
      if (main * sign <= 2) return;
      var overlap = vert ? Math.min(a.right, r.right) - Math.max(a.left, r.left) : Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
      if (overlap > 4) cross = 0;                                           // directly above/below (or beside): no penalty
      // distance is measured edge to edge so a full-width row right below beats a small button further down
      var gap = vert ? (sign > 0 ? r.top - a.bottom : a.top - r.bottom) : (sign > 0 ? r.left - a.right : a.left - r.right);
      var s = Math.max(0, gap) + cross * 2.2; if (s < score) { score = s; best = b; }
    });
    return best;
  }
  function back() {
    if (moving) { endMove(); return; }
    if (stack.length) closeModal();
  }
  document.addEventListener('keydown', function (e) {
    var k = key(e); if (!k) return;
    var act = document.activeElement, m = topModal();
    if (k === 'back') { e.preventDefault(); back(); return; }

    if (k === 'ok') {                                    // ---- OK: act on release (see keyup), long-press on tiles
      e.preventDefault(); if (e.repeat || okTarget) return;
      if (moving) { okLong = true; okTarget = act; endMove(); toast('Saved'); return; }
      okTarget = act; okModal = m || null; okLong = false;
      if (!m && act && act.classList && act.classList.contains('tile') && act.getAttribute('data-key') !== '+') {
        okTimer = setTimeout(function () { okLong = true; openAppMenu(okTarget.getAttribute('data-key')); }, 520);
      }
      return;
    }
    if (m) {                                             // ---- inside a dialog
      if (k === 'menu') return;
      e.preventDefault();
      var list = [].slice.call(m.card.querySelectorAll('[data-f]'));
      if (list.indexOf(act) < 0) { list[0].focus(); return; }
      var n = nearest(act, k, list);
      if (n) { n.focus({ preventScroll: true }); n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      return;
    }

    var onTile = act && act.classList && act.classList.contains('tile');
    if (moving) {                                        // ---- reordering a tile
      e.preventDefault();
      if (k === 'left') shift(-1); else if (k === 'right') shift(1);
      return;
    }
    if (k === 'menu') { e.preventDefault(); if (onTile && act.getAttribute('data-key') !== '+') openAppMenu(act.getAttribute('data-key')); else openSettings(); return; }

    e.preventDefault();                                  // ---- arrows on Home
    var count = tilesEl.children.length, c = cols();
    if (!onTile && act !== $('gear')) { focusTile(focusIndex); return; }
    if (act === $('gear')) { if (k === 'down' || k === 'left') focusTile(focusIndex); return; }
    var i = focusIndex;
    if (k === 'left') { if (i % c > 0) focusTile(i - 1); }
    else if (k === 'right') { if (i % c < c - 1 && i + 1 < count) focusTile(i + 1); else if (i % c === c - 1 && Math.floor(i / c) === 0) $('gear').focus(); }
    else if (k === 'up') { if (i - c >= 0) focusTile(i - c); else $('gear').focus(); }
    else if (k === 'down') { if (i + c < count) focusTile(i + c); else if (Math.floor(i / c) < Math.floor((count - 1) / c)) focusTile(count - 1); }
  }, true);
  document.addEventListener('keyup', function (e) {
    if (key(e) !== 'ok') return;
    e.preventDefault();
    clearTimeout(okTimer); var t = okTarget; okTarget = null;
    if (okLong) { okLong = false; return; }
    // only if nothing changed underneath the press: same element still focused, same dialog still on top
    if (!t || moving || document.activeElement !== t || (topModal() || null) !== okModal) return;
    if (t.classList.contains('tile')) activateTile(t); else t.click();
  }, true);
  tilesEl.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.tile'); if (!t || e.detail === 0) return;      // keyboard is handled above
    if (moving) { endMove(); return; }
    focusIndex = [].indexOf.call(tilesEl.children, t); activateTile(t);
  });
  tilesEl.addEventListener('contextmenu', function (e) {
    var t = e.target.closest && e.target.closest('.tile'); if (!t) return; e.preventDefault();
    if (t.getAttribute('data-key') !== '+') openAppMenu(t.getAttribute('data-key'));
  });
  tilesEl.addEventListener('focusin', function (e) {
    var t = e.target.closest && e.target.closest('.tile'); if (!t) return;
    var i = [].indexOf.call(tilesEl.children, t); if (i >= 0 && i !== focusIndex) { focusIndex = i; parallax(); }
  });
  $('gear').addEventListener('click', openSettings);
  document.addEventListener('visibilitychange', applyFx);
  window.addEventListener('resize', fit);

  // ------------------------------------------------------------------ native shell hooks
  window.AITV_LAUNCHER = {
    onBack: back,
    refresh: function () {
      var before = pins.length; if (!loadInstalled()) return; syncPins(); render(false);
      var m = topModal(); if (m) paintModal(m, document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-id') : null);
      else if (document.activeElement === document.body || !document.activeElement) focusTile(focusIndex);
      if (pins.length > before) toast('New app added to Home');
    }
  };

  // ------------------------------------------------------------------ boot
  var booted = loadInstalled(); if (booted) syncPins();
  fit(); paintTheme(); tick(true); setInterval(tick, 5000);
  setTimeout(function () { fit(); focusTile(0); }, 80);
  // the app list can be slow right after the device boots: keep asking until it arrives
  if (!booted) (function retry(n) { setTimeout(function () { if (loadInstalled()) { syncPins(); render(true); } else if (n < 20) retry(n + 1); }, 1500); })(0);
  if (!load('aitv_tip', false)) setTimeout(function tip() { if (stack.length || moving) return setTimeout(tip, 3000); save('aitv_tip', true); toast('Tip: hold OK on an app to move or remove it'); }, 2600);
})();
