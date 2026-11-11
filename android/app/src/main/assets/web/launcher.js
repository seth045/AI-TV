/* AI-TV launcher.
 *
 * One shell, many themes. A theme supplies artwork (themes/<id>/home.webp, thumb.webp
 * and tile sprites), tokens in launcher.css (.theme-<id>) and an ambient effect built
 * by a function in FX; everything else — the app grid, focus handling, settings, app
 * management — is shared, so every theme behaves identically.
 *
 * Native side: window.AndroidTV (see WebAppInterface.kt). Without it (a desktop
 * browser) the launcher runs in preview mode with sample apps.
 *
 * Nothing that arrives from the device or from storage is trusted: both are
 * validated on the way in, so bad data can never stop the home screen starting.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ themes
  // To add a theme: create themes/<id>/ (home.webp, thumb.webp, t_blank.webp and
  // optional t_<art>.webp tiles), add a .theme-<id> block to launcher.css, add an
  // effect builder to FX if it has ambient motion, and list it here.
  // `options` are the effect switches shown in Settings; each key toggles the
  // body class fx-off-<key>, which the effect's CSS uses to hide that layer.
  var THEMES = [
    { id: 'christmas', name: 'Christmas', tagline: 'A cabin by a frozen lake', rows: 2, fx: 'snow',
      options: [{ key: 'snow', label: 'Snowfall', desc: 'Soft flakes drifting across the screen' }] },
    { id: 'space', name: 'Deep Space', tagline: 'Under a ringed station', rows: 2, fx: 'space',
      options: [
        { key: 'stars', label: 'Living starfield', desc: 'Twinkling stars and the odd meteor' },
        { key: 'ships', label: 'Passing ships', desc: 'A craft crosses the sky now and then' },
        { key: 'ring', label: 'Station lights', desc: 'Energy traces around the orbital station' },
        { key: 'nebula', label: 'Nebula glow', desc: 'The nebula slowly breathes' }
      ] },
    { id: 'neon', name: 'Neon City', tagline: 'Rain over the megacity', rows: 2, fx: 'neon',
      options: [
        { key: 'rain', label: 'Rain', desc: 'Steady rain falling across the skyline' },
        { key: 'cars', label: 'Hovercars', desc: 'Traffic gliding between the towers' },
        { key: 'holo', label: 'Hologram pulse', desc: 'The billboard and tower ring glow and fade' },
        { key: 'petals', label: 'Petals', desc: 'Cherry blossom drifting from the tree' }
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
  var VERSION = '1.3';

  // ------------------------------------------------------------------ helpers
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function themeById(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return THEMES[0]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function strings(v) {                                  // a clean, de-duplicated list of non-empty strings, or null
    if (!Array.isArray(v)) return null;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < 2000; i++) if (typeof v[i] === 'string' && v[i] && !seen[v[i]]) { seen[v[i]] = 1; out.push(v[i]); }
    return out;
  }

  var bridge = window.AndroidTV;
  var native = !!(bridge && typeof bridge.listApps === 'function' && typeof bridge.launch === 'function');
  function can(fn) { return native && typeof bridge[fn] === 'function'; }
  var stage = $('stage'), grid = $('grid'), tilesEl = $('tiles'), modalsEl = $('modals');

  // ------------------------------------------------------------------ state
  var prefs = load('aitv_prefs', null);
  if (!isObj(prefs)) prefs = {};
  prefs = { clock24: prefs.clock24 === true, calm: prefs.calm === true, fx: isObj(prefs.fx) ? prefs.fx : {} };
  var theme = themeById(load('aitv_theme', THEMES[0].id));
  var installed = [], byPkg = Object.create(null), pins = [], shown = [];
  var focusIndex = 0, firstRow = 0, moving = null, moveFrom = null, lastSig = '';
  function fxOn(key) { var o = prefs.fx[theme.id]; return !(isObj(o) && o[key] === false); }
  function setFx(key, on) { if (!isObj(prefs.fx[theme.id])) prefs.fx[theme.id] = {}; prefs.fx[theme.id][key] = on; save('aitv_prefs', prefs); }
  function pinned(p) { return pins.indexOf(p) >= 0; }

  // ------------------------------------------------------------------ apps
  function artFor(app) {
    var i;
    for (i = 0; i < ART.length; i++) if (ART[i][1].indexOf(app.package) >= 0) return ART[i][0];
    for (i = 0; i < ART.length; i++) if (ART[i][2].test(app.label)) return ART[i][0];
    return null;
  }
  // Returns false (and keeps what we had) if the device gave no usable list: a transient
  // failure must never be mistaken for "the user has no apps" and wipe their layout.
  function loadInstalled() {
    var raw = null, list = [], seen = Object.create(null), i;
    if (native) { try { raw = JSON.parse(bridge.listApps()); } catch (e) { raw = null; } }
    else raw = ART.map(function (a) { return { package: 'demo:' + a[0], label: a[3], icon: '' }; });
    if (!Array.isArray(raw)) return false;
    for (i = 0; i < raw.length && list.length < 1000; i++) {
      var a = raw[i];
      if (!isObj(a) || typeof a.package !== 'string' || !a.package || seen[a.package]) continue;
      seen[a.package] = 1;
      var label = typeof a.label === 'string' ? a.label.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      list.push({ package: a.package, label: label || a.package, icon: typeof a.icon === 'string' ? a.icon : '' });
    }
    if (native && !list.length) return false;
    installed = list; byPkg = Object.create(null);
    installed.forEach(function (x) { x.art = artFor(x); byPkg[x.package] = x; });
    return true;
  }
  // Pins are what is on Home. Apps installed later are added automatically, as on a stock TV home screen.
  // Returns how many were added.
  function syncPins() {
    var saved = strings(load('aitv_pins', null)), known = strings(load('aitv_known', null)), added = 0;
    if (saved) {
      pins = saved.filter(function (p) { return byPkg[p]; });
      if (known) installed.forEach(function (a) { if (known.indexOf(a.package) < 0 && !pinned(a.package)) { pins.push(a.package); added++; } });
    } else {
      pins = [];
      ART.forEach(function (a) {
        for (var i = 0; i < installed.length; i++) if (installed[i].art === a[0] && !pinned(installed[i].package)) { pins.push(installed[i].package); break; }
      });
    }
    save('aitv_pins', pins); save('aitv_known', installed.map(function (a) { return a.package; }));
    return added;
  }
  var lastLaunch = 0;
  function launch(pkg) {
    var a = byPkg[pkg], now = Date.now(); if (!a || now - lastLaunch < 900) return;   // ignore a double press
    lastLaunch = now;
    if (!native) { toast('Preview: this would open ' + a.label); return; }
    var ok = false; try { ok = bridge.launch(pkg) === true; } catch (e) {}
    if (!ok) toast('Couldn’t open ' + a.label);
  }

  // ------------------------------------------------------------------ layout
  function cols() { return parseInt(getComputedStyle(document.body).getPropertyValue('--cols'), 10) || 6; }
  function fit() {
    var w = stage.getBoundingClientRect().width; if (!w) return;
    document.documentElement.style.fontSize = (w / 100) + 'px';
    sizeGrid();
  }
  function sizeGrid() {
    var t = tilesEl.querySelector('.tile'); if (!t) return;
    var cs = getComputedStyle(tilesEl), pad = parseFloat(cs.paddingTop) || 0, gap = parseFloat(cs.rowGap) || 0;
    grid.style.height = (pad * 2 + theme.rows * t.offsetHeight + (theme.rows - 1) * gap) + 'px';
    scrollRows();
  }
  function scrollRows() {
    var t = tilesEl.querySelector('.tile'); if (!t) return;
    var gap = parseFloat(getComputedStyle(tilesEl).rowGap) || 0, n = cols(), kids = tilesEl.querySelectorAll('.tile');
    var total = Math.ceil(kids.length / n);
    firstRow = clamp(firstRow, 0, Math.max(0, total - theme.rows));
    tilesEl.style.transform = 'translateY(' + (-firstRow * (t.offsetHeight + gap)) + 'px)';
    for (var i = 0; i < kids.length; i++) { var r = Math.floor(i / n); kids[i].classList.toggle('out', r < firstRow || r >= firstRow + theme.rows); }
    // position marker beside the grid: only when there is more than fits
    var track = $('track'), thumb = track.firstChild, more = total > theme.rows;
    track.classList.toggle('on', more);
    if (more) {
      var g = grid.getBoundingClientRect(), s = stage.getBoundingClientRect();
      track.style.top = (g.top - s.top + g.height * 0.12) + 'px'; track.style.height = (g.height * 0.76) + 'px';
      thumb.style.height = (theme.rows / total * 100) + '%'; thumb.style.top = (firstRow / total * 100) + '%';
    }
  }

  // ------------------------------------------------------------------ tiles
  function keyOf(a) { return a.add ? '\u0000add' : a.package; }
  function tileHtml(a, i) {
    var dir = 'themes/' + theme.id + '/';
    if (a.add) {
      return '<div class="tile add" role="listitem" tabindex="-1" data-f style="--i:' + i + '" aria-label="Add or remove apps">' +
        '<div class="art" style="background-image:url(' + dir + 't_blank.webp)"></div><span class="plus">+</span><span class="lbl"><span>Add apps</span></span></div>';
    }
    return '<div class="tile" role="listitem" tabindex="-1" data-f style="--i:' + i + '" aria-label="' + esc(a.label) + '">' +
      '<div class="art" style="background-image:url(' + dir + 't_' + (a.art || 'blank') + '.webp)"></div>' +
      (a.art ? '' : (a.icon ? '<img class="ico" alt="" src="' + esc(a.icon) + '">' : '<span class="ph">' + esc(a.label.charAt(0).toUpperCase()) + '</span>') +
        '<span class="lbl"><span>' + esc(a.label) + '</span></span>') + '</div>';
  }
  function items() { return pins.map(function (p) { return byPkg[p]; }).filter(Boolean).concat([{ add: true }]); }
  function tiles() { return tilesEl.querySelectorAll('.tile'); }
  // Rebuilds only when the set of tiles changed; a pure reorder just moves the existing nodes.
  function render(intro) {
    var list = items(), keys = list.map(keyOf), old = shown.map(keyOf), i;
    var same = keys.length === old.length && keys.slice().sort().join('\u0001') === old.slice().sort().join('\u0001') && tiles().length === keys.length && !intro;
    if (same) {
      var map = Object.create(null), kids = tiles();
      for (i = 0; i < kids.length; i++) map[old[i]] = kids[i];
      for (i = 0; i < keys.length; i++) { var el = map[keys[i]]; el.style.setProperty('--i', i); tilesEl.insertBefore(el, tilesEl.children[i] || null); }
    } else {
      tilesEl.classList.toggle('intro', !!intro);
      tilesEl.innerHTML = list.map(tileHtml).join('') +
        (list.length === 1 ? '<div class="empty"><b>Your Home is empty</b><span>Press OK to choose the apps you want here.</span></div>' : '');
    }
    shown = list;
    focusIndex = clamp(focusIndex, 0, list.length - 1);
    sizeGrid(); markMoving();
    if (!stack.length && document.activeElement !== $('gear')) focusTile(focusIndex);   // the focused tile may have been rebuilt
  }
  function focusTile(i) {
    var kids = tiles(), n = kids.length; if (!n) return;
    focusIndex = clamp(i, 0, n - 1);
    var c = cols(), r = Math.floor(focusIndex / c);
    if (r < firstRow) firstRow = r; else if (r >= firstRow + theme.rows) firstRow = r - theme.rows + 1;
    scrollRows();
    kids[focusIndex].focus({ preventScroll: true });
    parallax();
  }
  // The scenery leans a touch toward the focused column: cheap depth, no extra drawing.
  function parallax() {
    var c = cols(), col = focusIndex % c, f = c > 1 ? col / (c - 1) - 0.5 : 0, r = Math.floor(focusIndex / c) - firstRow;
    $('bg').style.transform = prefs.calm ? 'scale(1.03)' : 'scale(1.03) translate(' + (-f * 0.9).toFixed(3) + '%,' + (-r * 0.25).toFixed(3) + '%)';
  }
  function activate(i) { var a = shown[i]; if (!a) return; if (a.add) openApps(true); else launch(a.package); }
  // Long names scroll sideways while their tile is focused instead of being cut off.
  tilesEl.addEventListener('focusin', function (e) {
    var t = e.target.closest && e.target.closest('.tile'); if (!t) return;
    var i = [].indexOf.call(tiles(), t); if (i >= 0 && i !== focusIndex) { focusIndex = i; parallax(); }
    var l = t.querySelector('.lbl'), s = l && l.firstChild;
    if (s && s.scrollWidth > l.clientWidth + 2) { l.style.setProperty('--shift', (l.clientWidth - s.scrollWidth) + 'px'); l.classList.add('mq'); }
  });
  tilesEl.addEventListener('focusout', function (e) { var l = e.target.querySelector && e.target.querySelector('.lbl.mq'); if (l) l.classList.remove('mq'); });

  // ------------------------------------------------------------------ move mode
  function markMoving() {
    var kids = tiles();
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('moving', !!moving && !!shown[i] && shown[i].package === moving);
    document.body.classList.toggle('is-moving', !!moving);
  }
  function startMove(pkg) {
    if (!pinned(pkg)) return;
    moving = pkg; moveFrom = pins.slice(); focusTile(pins.indexOf(pkg)); markMoving();
    hint('◀ ▶ ▲ ▼  move  ·  OK  save  ·  Back  cancel');
  }
  function endMove(cancel) {
    if (!moving) return;
    var pkg = moving; moving = null; hint('');
    if (cancel && moveFrom) pins = moveFrom.filter(function (p) { return byPkg[p]; });
    moveFrom = null; save('aitv_pins', pins); render(false);
    var i = pins.indexOf(pkg); if (!stack.length) focusTile(i >= 0 ? i : focusIndex);
  }
  function shift(d) {
    var i = pins.indexOf(moving); if (i < 0) { endMove(true); return; }
    var j = clamp(i + d, 0, pins.length - 1); if (j === i) return;
    pins.splice(j, 0, pins.splice(i, 1)[0]); render(false); focusTile(j);
  }

  // ------------------------------------------------------------------ modals
  var stack = [];
  function topModal() { return stack[stack.length - 1]; }
  function focusables(m) { return [].slice.call(m.card.querySelectorAll('[data-f]')); }
  function openModal(build, cls, first) {
    if (moving) endMove(false);
    var layer = document.createElement('div'); layer.className = 'layer';
    var card = document.createElement('div'); card.className = 'card' + (cls ? ' ' + cls : ''); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    layer.appendChild(card); modalsEl.appendChild(layer);
    var m = { layer: layer, card: card, build: build, back: document.activeElement };
    stack.push(m); document.body.classList.add('has-modal');
    try { paintModal(m, first || null, true); } catch (e) { stack.pop(); modalsEl.removeChild(layer); document.body.classList.toggle('has-modal', !!stack.length); restoreFocus(); return null; }
    layer.addEventListener('click', function (e) { if (e.target === layer && topModal() === m) closeModal(); });
    return m;
  }
  function fades(m) {
    var b = m.card.querySelector('.body'); if (!b) return;
    var up = b.scrollTop > 6, down = b.scrollTop + b.clientHeight < b.scrollHeight - 20;
    b.classList.toggle('up', up); b.classList.toggle('down', down); m.card.classList.toggle('more', down);
  }
  function paintModal(m, keepId, fresh) {
    var body = m.card.querySelector('.body'), top = body ? body.scrollTop : 0;
    var idx = focusables(m).indexOf(document.activeElement);
    m.card.innerHTML = m.build();
    var nb = m.card.querySelector('.body');
    if (nb) { nb.scrollTop = fresh ? 0 : top; nb.addEventListener('scroll', function () { fades(m); }); }
    var all = focusables(m), el = null;
    if (keepId) for (var i = 0; i < all.length; i++) if (all[i].getAttribute('data-id') === keepId) { el = all[i]; break; }
    if (!el && idx >= 0) el = all[Math.min(idx, all.length - 1)];          // the item went away: stay where the user was
    if (!el) el = all[0];
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
    fades(m);
  }
  function repaint(keepId) { var m = topModal(); if (m) paintModal(m, keepId); }
  function closeModal(silent) {
    var m = stack.pop(); if (!m) return;
    m.layer.classList.add('closing');
    setTimeout(function () { if (m.layer.parentNode) m.layer.parentNode.removeChild(m.layer); }, 170);
    document.body.classList.toggle('has-modal', !!stack.length);
    if (silent) return;
    var t = topModal();
    if (t) { if (t.card.contains(m.back)) m.back.focus(); else restoreFocus(); }
    else if (m.back === $('gear')) $('gear').focus(); else focusTile(focusIndex);
  }
  function closeAll() { while (stack.length) closeModal(true); focusTile(focusIndex); }
  // Something is always focused: a TV has no pointer to click focus back.
  function restoreFocus() {
    var m = topModal();
    if (m) { var all = focusables(m); if (all.length) all[0].focus(); return; }
    focusTile(focusIndex);
  }
  document.addEventListener('focusout', function () {
    setTimeout(function () { var a = document.activeElement; if (!a || a === document.body || a === document.documentElement) restoreFocus(); }, 0);
  });

  function sw(on) { return '<span class="sw' + (on ? ' on' : '') + '"></span>'; }
  function row(id, act, title, desc, right, extra) {
    return '<button class="row" data-f data-id="' + id + '" data-act="' + act + '"' + (extra || '') + '><span class="txt"><b>' + esc(title) + '</b>' + (desc ? '<small>' + esc(desc) + '</small>' : '') + '</span>' + (right || '') + '</button>';
  }
  var MORE = '<span class="morehint">▾ More below</span>';

  // ---- settings
  function settingsHtml() {
    var h = '<header><span class="eyebrow">Settings</span><h1>Make it yours</h1></header><div class="body">';
    h += '<h2>Theme</h2><div class="tcards">' + THEMES.map(function (t) {
      return '<button class="tcard' + (t.id === theme.id ? ' sel' : '') + '" data-f data-id="theme-' + t.id + '" data-act="theme" data-v="' + t.id + '" aria-label="' + esc(t.name) + ' theme">' +
        '<img alt="" src="themes/' + t.id + '/thumb.webp"><span class="on">Active</span><span class="meta"><b>' + esc(t.name) + '</b><small>' + esc(t.tagline) + '</small></span></button>';
    }).join('') + '</div>';
    h += '<h2>Apps</h2>' +
      row('apps', 'apps', 'Manage apps', 'Choose what appears on Home, or uninstall', '<span class="chev">›</span>') +
      (can('openStore') ? row('store', 'store', 'Get more apps', 'Open the app store on this device', '<span class="chev">›</span>') : '') +
      (can('openSettings') ? row('device', 'device', 'Device settings', 'Network, display, accounts and more', '<span class="chev">›</span>') : '');
    h += '<h2>' + esc(theme.name) + ' effects</h2>' + theme.options.map(function (o) {
      return row('fx-' + o.key, 'fx', o.label, o.desc, sw(fxOn(o.key)), ' data-v="' + o.key + '" role="switch" aria-checked="' + fxOn(o.key) + '"');
    }).join('');
    h += '<h2>Display</h2>' +
      row('clock24', 'clock24', '24-hour clock', 'Show the time as 18:30 rather than 6:30 PM', sw(prefs.clock24), ' role="switch" aria-checked="' + prefs.clock24 + '"') +
      row('calm', 'calm', 'Reduce motion', 'Turn off background animation and transitions', sw(prefs.calm), ' role="switch" aria-checked="' + prefs.calm + '"');
    h += '</div><footer><button class="btn primary" data-f data-id="done" data-act="close">Done</button>' + MORE + '<span class="hint">Hold OK on an app for options · v' + VERSION + '</span></footer>';
    return h;
  }
  function openSettings() { if (!stack.length) openModal(settingsHtml, '', 'theme-' + theme.id); }

  // ---- manage apps
  function appsHtml() {
    var list = pins.map(function (p) { return byPkg[p]; }).filter(Boolean).concat(
      installed.filter(function (a) { return !pinned(a.package); }).sort(function (a, b) { return a.label.localeCompare(b.label); }));
    var canDel = can('uninstall');
    var h = '<header><span class="eyebrow">Your Home screen</span><h1>Manage apps</h1><p>Switch an app on to show it on Home. Apps you install later are added automatically.</p></header><div class="body">';
    if (!list.length) h += '<p class="none">No apps were found on this device.</p>';
    h += list.map(function (a) {
      var on = pinned(a.package), id = esc(a.package);
      var ico = a.icon ? '<img class="appico" alt="" src="' + esc(a.icon) + '">' : '<span class="appph">' + esc(a.label.charAt(0).toUpperCase()) + '</span>';
      var r = '<button class="row" data-f data-id="pin-' + id + '" data-act="pin" data-v="' + id + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(a.label) + ' on Home">' + ico +
        '<span class="txt"><b>' + esc(a.label) + '</b><small>' + (on ? 'On Home' : 'Hidden') + '</small></span>' + sw(on) + '</button>';
      return canDel ? '<div class="pair">' + r + '<button class="btn danger" data-f data-id="del-' + id + '" data-act="uninstall" data-v="' + id + '" aria-label="Uninstall ' + esc(a.label) + '">Uninstall</button></div>' : r;
    }).join('');
    h += '</div><footer><button class="btn primary" data-f data-id="done" data-act="close">Done</button>' +
      (can('openStore') ? '<button class="btn" data-f data-id="store" data-act="store">Get more apps</button>' : '') + MORE + '</footer>';
    return h;
  }
  function openApps(adding) {
    // from the Add tile, start on the first app that isn't on Home yet
    var first = adding ? installed.filter(function (a) { return !pinned(a.package); }).sort(function (a, b) { return a.label.localeCompare(b.label); })[0] : null;
    openModal(appsHtml, '', first ? 'pin-' + first.package : undefined);
  }

  // ---- per-app menu (hold OK)
  function openAppMenu(pkg) {
    var a = byPkg[pkg]; if (!a || stack.length) return;
    tipDone();
    openModal(function () {
      var i = pins.indexOf(pkg), id = esc(pkg);
      return '<header><span class="eyebrow">App options</span><h1>' + esc(a.label) + '</h1></header><div class="body stack">' +
        '<button class="btn primary" data-f data-id="open" data-act="open" data-v="' + id + '">Open</button>' +
        (pins.length > 1 ? '<button class="btn" data-f data-id="move" data-act="move" data-v="' + id + '">Move</button>' : '') +
        (i > 0 ? '<button class="btn" data-f data-id="front" data-act="front" data-v="' + id + '">Move to front</button>' : '') +
        '<button class="btn" data-f data-id="hide" data-act="hide" data-v="' + id + '">Remove from Home</button>' +
        (can('uninstall') ? '<button class="btn danger" data-f data-id="del" data-act="uninstall" data-v="' + id + '">Uninstall</button>' : '') +
        '</div><footer><button class="btn" data-f data-id="cancel" data-act="close">Cancel</button></footer>';
    }, 'small');
  }

  var ACTIONS = {
    close: function () { closeModal(); },
    theme: function (v) { if (v !== theme.id) setTheme(v, true); },
    fx: function (v, el) { setFx(v, !fxOn(v)); applyFx(); repaint(el.getAttribute('data-id')); },
    clock24: function (v, el) { prefs.clock24 = !prefs.clock24; save('aitv_prefs', prefs); tick(true); repaint(el.getAttribute('data-id')); },
    calm: function (v, el) { prefs.calm = !prefs.calm; save('aitv_prefs', prefs); applyFx(); repaint(el.getAttribute('data-id')); },
    apps: function () { openApps(); },
    store: function () { try { bridge.openStore(); } catch (e) {} },
    device: function () { try { bridge.openSettings(); } catch (e) {} },
    pin: function (v, el) {
      if (!byPkg[v]) return;
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
    var t = e.target.closest && e.target.closest('[data-act]'), m = topModal(); if (!t || !m || !m.card.contains(t)) return;
    var fn = ACTIONS[t.getAttribute('data-act')]; if (typeof fn === 'function') fn(t.getAttribute('data-v'), t);
  });

  // ------------------------------------------------------------------ toast, hint, tip
  var toastTimer = 0, sticky = '';
  function showToast(msg) { var t = $('toast'); if (msg) t.textContent = msg; t.classList.toggle('on', !!msg); }
  function toast(msg, ms) { showToast(msg); clearTimeout(toastTimer); toastTimer = setTimeout(function () { showToast(sticky); }, ms || 2800); }
  function hint(msg) { sticky = msg; clearTimeout(toastTimer); showToast(msg); }       // stays until cleared
  // The tip repeats on the first few visits until the user has actually held OK once.
  var tips = load('aitv_tip', 0); if (tips === true) tips = 9; if (typeof tips !== 'number') tips = 0;
  function tipDone() { tips = 9; save('aitv_tip', 9); }
  function maybeTip() {
    if (tips >= 3) return;
    setTimeout(function wait() {
      if (stack.length || moving) return setTimeout(wait, 3000);
      if (tips >= 3) return; tips++; save('aitv_tip', tips);
      toast('Hold OK on an app for options  ·  ▲ for Settings', 7000);
    }, 2500);
  }

  // ------------------------------------------------------------------ clock
  var lastStamp = '';
  function tick(force) {
    var d = new Date(), stamp = d.getHours() + ':' + d.getMinutes() + prefs.clock24;
    if (!force && stamp === lastStamp) return; lastStamp = stamp;
    try {
      $('time').textContent = d.toLocaleTimeString([], prefs.clock24 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: 'numeric', minute: '2-digit' });
      $('date').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    } catch (e) { $('time').textContent = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
  }

  // ------------------------------------------------------------------ ambient effects
  // Effects are a handful of layers whose pictures are generated once and then only
  // moved or faded by CSS animations. That runs on the TV's compositor with no script
  // per frame, which is what keeps a small streaming stick smooth.
  function texture(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }
  function dot(g, x, y, r, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(0.4, 'rgba(255,255,255,' + (a * 0.6) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  var FX = {
    // Three depths of snow; each layer is one picture sliding down in a seamless loop.
    snow: function (box) {
      [[70, 1.4, 0.55, 34], [38, 2.3, 0.75, 22], [16, 3.6, 0.9, 14]].forEach(function (L, n) {
        var url = texture(640, 360, function (g, w, h) { for (var i = 0; i < L[0]; i++) dot(g, Math.random() * w, Math.random() * h, L[1] * (0.7 + Math.random() * 0.6), L[2] * (0.5 + Math.random() * 0.5)); });
        box.insertAdjacentHTML('beforeend', '<div class="fx-snow fx-k-snow" style="animation-duration:' + (9 + n * 4) + 's"><i style="background-image:url(' + url + ');animation-duration:' + L[3] + 's"></i></div>');
      });
    },
    space: function (box) {
      // stars only where the artwork shows open sky (u,v are fractions of the screen)
      function sky(u, v) { var dx = u - 0.257, dy = (v - 0.457) * 0.5628; return !(Math.sqrt(dx * dx + dy * dy) < 0.245 || (u < 0.31 && v > 0.16) || (u > 0.72 && v > 0.05 && v < 0.42)); }
      var h = '<div class="sp-nebula fx-k-nebula"></div>';
      [3.3, 4.9, 6.7].forEach(function (dur, n) {
        var url = texture(960, 540, function (g, w, hh) {
          for (var i = 0, tries = 0; i < 38 && tries < 2000; tries++) { var u = Math.random(), v = Math.random() * 0.52; if (!sky(u, v)) continue; i++; dot(g, u * w, v * hh, 1.2 + Math.random() * 2.2, 0.6 + Math.random() * 0.4); }
        });
        h += '<div class="sp-stars fx-k-stars" style="background-image:url(' + url + ');animation-duration:' + dur + 's;animation-delay:-' + (n * 1.3) + 's"></div>';
      });
      h += '<i class="sp-meteor fx-k-stars" style="left:22%;top:7%"></i><i class="sp-meteor fx-k-stars b" style="left:62%;top:4%"></i>' +
        '<div class="sp-ring fx-k-ring"><div class="sp-orbit"><i></i><i class="b"></i></div></div>' +
        '<i class="sp-beacon fx-k-ring" style="left:84.9%;top:8.3%"></i><i class="sp-beacon fx-k-ring" style="left:87.6%;top:36.6%;animation-delay:-1.3s"></i>' +
        '<div class="sp-ship fx-k-ships"></div>';
      box.insertAdjacentHTML('beforeend', h);
    },
    neon: function (box) {
      var h = '<div class="nn-holo fx-k-holo"></div><div class="nn-halo fx-k-holo"></div>' +
        '<div class="nn-car fx-k-cars"></div><div class="nn-car b fx-k-cars"></div>';
      // two depths of rain; each is one picture of slanted streaks sliding down in a loop
      [[90, 26, 0.22, 1.1], [45, 40, 0.34, 0.75]].forEach(function (L) {
        var url = texture(640, 360, function (g, w, hh) {
          g.lineCap = 'round';
          for (var i = 0; i < L[0]; i++) {
            var x = Math.random() * w, y = Math.random() * hh, len = L[1] * (0.6 + Math.random() * 0.8);
            g.strokeStyle = 'rgba(190,225,255,' + (L[2] * (0.5 + Math.random() * 0.5)) + ')'; g.lineWidth = 1;
            for (var k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x, y + k * hh); g.lineTo(x - len * 0.16, y + k * hh + len); g.stroke(); }
          }
        });
        h += '<div class="nn-rain fx-k-rain"><i style="background-image:url(' + url + ');animation-duration:' + L[3] + 's"></i></div>';
      });
      for (var i = 0; i < 12; i++) {
        h += '<i class="nn-petal fx-k-petals" style="left:' + (80 + Math.random() * 19).toFixed(1) + '%;top:' + (46 + Math.random() * 22).toFixed(1) + '%;animation-duration:' +
          (9 + Math.random() * 8).toFixed(1) + 's;animation-delay:-' + (Math.random() * 14).toFixed(1) + 's"></i>';
      }
      box.insertAdjacentHTML('beforeend', h);
    }
  };
  function buildFx() { var box = $('fxdom'); box.innerHTML = ''; var f = FX[theme.fx]; if (typeof f === 'function') { try { f(box); } catch (e) { box.innerHTML = ''; } } }
  function applyFx() {
    document.body.classList.toggle('calm', prefs.calm);
    theme.options.forEach(function (o) { document.body.classList.toggle('fx-off-' + o.key, !fxOn(o.key)); });
    parallax();
  }

  // ------------------------------------------------------------------ theme
  function paintTheme() {
    var cls = document.body.className.split(/\s+/).filter(function (c) { return c && c.indexOf('theme-') !== 0 && c.indexOf('fx-off-') !== 0; });
    cls.push('theme-' + theme.id); document.body.className = cls.join(' ');
    buildFx(); firstRow = 0; shown = [];
    fit(); render(true); applyFx();
  }
  // The new scenery fades in over the old one; no black flash.
  var swapTimer = 0;
  function setTheme(id, animate) {
    var next = themeById(id), url = 'themes/' + next.id + '/home.webp', bg = $('bg'), over = $('bg2');
    theme = next; save('aitv_theme', theme.id); clearTimeout(swapTimer);
    function settle() { bg.src = url; over.classList.remove('on'); }
    if (!animate || prefs.calm) { settle(); paintTheme(); repaint('theme-' + theme.id); return; }
    over.onload = over.onerror = function () { over.classList.add('on'); swapTimer = setTimeout(settle, 560); };
    over.src = url;
    paintTheme(); repaint('theme-' + theme.id);
  }

  // ------------------------------------------------------------------ input
  var okTimer = 0, okTarget = null, okLong = false, okModal = null;
  function key(e) {
    var k = e.key, c = e.keyCode;
    if (k === 'ArrowLeft' || c === 37 || c === 21) return 'left';
    if (k === 'ArrowRight' || c === 39 || c === 22) return 'right';
    if (k === 'ArrowUp' || c === 38 || c === 19) return 'up';
    if (k === 'ArrowDown' || c === 40 || c === 20) return 'down';
    if (k === 'Tab' || c === 9) return e.shiftKey ? 'up' : 'down';          // a keyboard's Tab must not escape the current screen
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
    if (stack.length) { closeModal(); return true; }
    if (moving) { endMove(true); toast('Move cancelled'); return true; }
    return false;                                   // nothing to close: the native side may leave if this isn't the TV's Home
  }
  function menu() {
    if (stack.length || moving) return;
    var a = shown[focusIndex], act = document.activeElement;
    if (isTile(act) && a && !a.add) openAppMenu(a.package); else openSettings();
  }
  function isTile(el) { return !!(el && el.classList && el.classList.contains('tile')); }
  document.addEventListener('keydown', function (e) {
    var k = key(e); if (!k) return;
    var act = document.activeElement, m = topModal();
    if (k === 'back') { e.preventDefault(); back(); return; }
    if (k === 'ok') {                                    // ---- OK: act on release (see keyup); hold on a tile = options
      e.preventDefault(); if (e.repeat || okTarget) return;
      okTarget = act; okModal = m || null; okLong = false;
      if (!m && moving) { okLong = true; endMove(false); toast('Saved'); return; }
      if (!m && isTile(act) && shown[focusIndex] && !shown[focusIndex].add) {
        var pkg = shown[focusIndex].package;
        okTimer = setTimeout(function () { okLong = true; openAppMenu(pkg); }, 520);
      }
      return;
    }
    if (m) {                                             // ---- inside a dialog
      e.preventDefault(); if (k === 'menu') return;
      var list = focusables(m);
      if (list.indexOf(act) < 0) { if (list[0]) list[0].focus(); return; }
      var n = nearest(act, k, list);
      if (n) { n.focus({ preventScroll: true }); n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); fades(m); }
      return;
    }
    e.preventDefault();
    if (moving) {                                        // ---- reordering a tile
      var c0 = cols();
      shift(k === 'left' ? -1 : k === 'right' ? 1 : k === 'up' ? -c0 : k === 'down' ? c0 : 0);
      return;
    }
    if (k === 'menu') { menu(); return; }
    var count = shown.length, c = cols(), gear = $('gear');   // ---- arrows on Home
    if (!isTile(act) && act !== gear) { focusTile(focusIndex); return; }
    if (act === gear) { if (k === 'down' || k === 'left') focusTile(focusIndex); return; }
    var i = focusIndex;
    if (k === 'left') { if (i % c > 0) focusTile(i - 1); }
    else if (k === 'right') { if (i % c < c - 1 && i + 1 < count) focusTile(i + 1); else if (i % c === c - 1 && Math.floor(i / c) === 0) gear.focus(); }
    else if (k === 'up') { if (i - c >= 0) focusTile(i - c); else gear.focus(); }
    else if (k === 'down') { if (i + c < count) focusTile(i + c); else if (Math.floor(i / c) < Math.floor((count - 1) / c)) focusTile(count - 1); }
  }, true);
  document.addEventListener('keyup', function (e) {
    if (key(e) !== 'ok') return;
    e.preventDefault();
    clearTimeout(okTimer); var t = okTarget, m = topModal() || null; okTarget = null;
    if (okLong) { okLong = false; return; }
    // only if nothing changed underneath the press: same element still focused, same dialog still on top
    if (!t || moving || document.activeElement !== t || m !== okModal) return;
    if (m) { if (m.card.contains(t)) t.click(); }
    else if (isTile(t)) activate(focusIndex);
    else if (t === $('gear')) openSettings();
  }, true);
  tilesEl.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.tile'); if (!t || e.detail === 0 || stack.length) return;      // keyboard is handled above
    if (moving) { endMove(false); return; }
    focusIndex = [].indexOf.call(tiles(), t); t.focus({ preventScroll: true }); activate(focusIndex);
  });
  tilesEl.addEventListener('contextmenu', function (e) {
    e.preventDefault(); if (moving || stack.length) return;
    var t = e.target.closest && e.target.closest('.tile'); if (!t) return;
    var a = shown[[].indexOf.call(tiles(), t)]; if (a && !a.add) openAppMenu(a.package);
  });
  $('gear').addEventListener('click', function (e) { if (e.detail !== 0) openSettings(); });
  window.addEventListener('resize', fit);

  // ------------------------------------------------------------------ native shell hooks
  function signature() { return installed.map(function (a) { return a.package + '\u0001' + a.label + '\u0001' + a.icon; }).join('\u0002'); }
  window.AITV_LAUNCHER = {
    onBack: back,
    menu: menu,
    // Home pressed while already on Home: back to the top, nothing left open.
    home: function () { if (moving) endMove(true); while (stack.length) closeModal(true); firstRow = 0; focusTile(0); },
    // Called when the launcher returns to the front and when apps are installed or removed.
    refresh: function () {
      var was = byPkg, at = document.activeElement && document.activeElement.getAttribute ? document.activeElement : null;
      var gone = at && at.getAttribute('data-act') === 'uninstall' ? at.getAttribute('data-v') : null;
      if (!loadInstalled()) return;
      var sig = signature(); if (sig === lastSig) { if (!document.activeElement || document.activeElement === document.body) restoreFocus(); return; }
      lastSig = sig;
      if (moving && !byPkg[moving]) { moving = null; moveFrom = null; hint(''); }
      var added = syncPins(); render(false);
      var m = topModal(); if (m) { try { paintModal(m, document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-id') : null); } catch (e) { closeAll(); } }
      if (gone && !byPkg[gone]) {
        // the app under the cursor was just removed: say so, and never leave the cursor on another app's Uninstall
        toast(((was[gone] && was[gone].label) || 'App') + ' uninstalled');
        var now = document.activeElement;
        if (now && now.getAttribute && now.getAttribute('data-act') === 'uninstall' && now.previousElementSibling) now.previousElementSibling.focus();
        return;
      }
      if (added) toast(added === 1 ? 'New app added to Home' : added + ' new apps added to Home');
    }
  };

  // ------------------------------------------------------------------ boot
  var booted = loadInstalled(); if (booted) { syncPins(); lastSig = signature(); }
  $('bg').src = 'themes/' + theme.id + '/home.webp';
  fit(); paintTheme(); tick(true); setInterval(tick, 5000);
  setTimeout(function () { fit(); focusTile(0); }, 80);
  // the app list can be slow right after the device boots: keep asking until it arrives
  if (!booted) (function retry(n) { setTimeout(function () { if (loadInstalled()) { lastSig = signature(); syncPins(); render(true); } else if (n < 20) retry(n + 1); }, 1500); })(0);
  maybeTip();
})();
