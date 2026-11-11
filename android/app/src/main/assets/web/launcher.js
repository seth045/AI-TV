// AI-TV launcher logic. ES5 for broad WebView support.
// - Real installed apps + icons come from the native bridge (window.AndroidTV).
// - The app row is a translate-centered carousel: the focused tile is always
//   centered and fully visible, so nothing ever clips at the screen edge.
// - Customize is a simple D-pad list: Up/Down pick a setting, Left/Right or OK change it.
(function () {
  'use strict';
  var A = window.AITV;
  var $ = function (id) { return document.getElementById(id); };
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  // ---- state ----
  var state = { theme: A.seasonalTheme(), settings: {}, focus: 0, safe: 5 };
  var i;
  for (i = 0; i < A.THEMES.length; i++) state.settings[A.THEMES[i].id] = A.themeDefaults(A.THEMES[i].id);
  try {
    var saved = JSON.parse(store('aitv.launcher'));
    if (saved && saved.theme && A.theme(saved.theme).id === saved.theme) {
      state.theme = saved.theme;
      if (typeof saved.safe === 'number') state.safe = Math.max(0, Math.min(10, saved.safe));
      for (i = 0; i < A.THEMES.length; i++) {
        var id = A.THEMES[i].id, s = saved.settings && saved.settings[id];
        if (s) for (var k in s) if (state.settings[id][k] !== undefined) state.settings[id][k] = s[k];
      }
    }
  } catch (e) {}
  function save() { store('aitv.launcher', JSON.stringify({ theme: state.theme, settings: state.settings, safe: state.safe })); }
  function cur() { return state.settings[state.theme]; }

  // ---- apps from bridge ----
  var apps = [];
  function loadApps() {
    var list = null;
    if (window.AndroidTV && AndroidTV.listApps) { try { list = JSON.parse(AndroidTV.listApps()); } catch (e) {} }
    if (!list || !list.length) list = A.APPS.map(function (a) { return { package: a.id, label: a.name, icon: '', glyph: a.glyph }; });
    apps = list;
    if (state.focus > apps.length) state.focus = apps.length;
  }

  // ---- decorations ----
  var SNOWCAP = '<svg class="snowcap" viewBox="0 0 100 14" preserveAspectRatio="none"><path d="M0 7Q0 0 7 0L93 0Q100 0 100 7Q95 14 88 8Q81 14 73 8Q65 14 57 8Q49 14 41 8Q33 14 25 8Q17 14 9 8Q4 13 0 7Z"/></svg>';
  var GEAR = '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.9 4a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.6H9.7l-.4 2.6a7 7 0 00-1.7 1l-2.4-1-2 3.4L3.2 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.6h4.6l.4-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.6.1-1z"/></svg>';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }

  function renderTiles() {
    var html = '', i;
    for (i = 0; i < apps.length; i++) {
      var a = apps[i];
      var inner = a.icon ? '<img class="appicon" src="' + a.icon + '" alt="">' : '<span class="glyph">' + esc((a.glyph || (a.label || '?').charAt(0))) + '</span>';
      html += '<div class="tile" data-i="' + i + '"><div class="face">' + inner + SNOWCAP + '</div><div class="label">' + esc(a.label) + '</div></div>';
    }
    html += '<div class="tile" data-i="' + apps.length + '"><div class="face"><span class="glyph gear">' + GEAR + '</span>' + SNOWCAP + '</div><div class="label">Customize</div></div>';
    $('row').innerHTML = html;
    $('lights').innerHTML = state.theme === 'christmas' ? lightsHtml(Math.min(apps.length + 1, 12), cur().lights) : '';
    renderFocus();
  }
  function lightsHtml(n, mode) {
    if (!n || mode === 'off') return '';
    var cols = ['#ff4d4d','#ffd23c','#4dc3ff','#6dff8a','#ff8fd6'], d = '', bulbs = '', k = 0, seg = 105;
    for (var i = 0; i < n; i++) {
      var x0 = i * seg, x1 = x0 + seg; d += (i ? 'L' : 'M') + x0 + ' 6Q' + (x0 + seg / 2) + ' 26 ' + x1 + ' 6';
      var ts = [0.2, 0.55, 0.85];
      for (var j = 0; j < 3; j++, k++) {
        var t = ts[j], bx = x0 + seg * t, by = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 26 + t * t * 6 + 4;
        var dl = mode === 'chase' ? (k % 4) * 0.38 : (k * 0.37) % 2.6;
        bulbs += '<circle class="bulb" cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="5" fill="' + cols[k % 5] + '" style="-webkit-animation-delay:-' + dl.toFixed(2) + 's;animation-delay:-' + dl.toFixed(2) + 's"/>';
      }
    }
    return '<svg viewBox="0 0 ' + n * seg + ' 30" preserveAspectRatio="none"><path d="' + d + '"/>' + bulbs + '</svg>';
  }
  function tileCount() { return apps.length + 1; }
  function renderFocus() {
    var tiles = $('row').children, i;
    for (i = 0; i < tiles.length; i++) tiles[i].className = i === state.focus ? 'tile focus' : 'tile';
    centerRow();
  }
  // Translate the row so the focused tile is centered — guarantees no edge clipping.
  function centerRow() {
    var clip = $('rowClip'), row = $('row'), tile = row.children[state.focus];
    if (!tile) return;
    var cw = clip.clientWidth, rowW = row.scrollWidth;
    // Ideal: focused tile centered. Clamp so the row fills from the left at the
    // start and from the right at the end (never a huge empty gap), while the
    // focused tile always stays fully on screen.
    var target = cw / 2 - (tile.offsetLeft + tile.offsetWidth / 2);
    var minT = Math.min(0, cw - rowW);
    target = Math.max(minT, Math.min(0, target));
    row.style.webkitTransform = 'translateX(' + target + 'px)';
    row.style.transform = 'translateX(' + target + 'px)';
  }

  // ---- theme + clock ----
  var scene = new A.Scene($('bg'), { maxW: 1280 }), sceneKey = '';
  function applyTheme() {
    var t = A.theme(state.theme), s = cur(), b = document.body;
    b.className = 't-' + state.theme + (s.decorations ? '' : ' no-deco') + (s.font === 'theme' ? ' f-theme' : '');
    b.style.setProperty('--accent', s.accent);
    b.style.setProperty('--text', t.text);
    b.style.setProperty('--ribbon', A.RIBBONS[s.ribbon] || '#c8102e');
    b.style.fontFamily = A.fontStack(state.theme, s.font);
    // Photo background only for Christmas (bundled cabin); other themes use the drawn scene.
    var usePhoto = state.theme === 'christmas';
    $('photo').style.backgroundImage = usePhoto ? "url('cabin.png')" : 'none';
    $('photo').style.opacity = usePhoto ? '1' : '0';
    scene.setPhoto(usePhoto);
    var key = state.theme + JSON.stringify(s);
    if (key !== sceneKey) { sceneKey = key; scene.set(state.theme, s); }
    $('hello').textContent = greeting();
    applySafe();
  }
  function applySafe() {
    var pad = (2 + state.safe) + '%';
    $('ui').style.padding = pad + ' ' + (pad);
  }
  function greeting() {
    var g = A.theme(state.theme).greeting;
    if (!g) { var h = new Date().getHours(); g = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
    return g;
  }
  var lastMin = -1;
  function clock() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    if (m === lastMin) return; lastMin = m;
    $('clock').innerHTML = ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + '<small>' + (h < 12 ? 'AM' : 'PM') + '</small>';
    $('sub').textContent = DAYS[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate();
    if (state.theme === 'nature' && m === 0) { sceneKey = ''; applyTheme(); }
  }

  // ---- actions ----
  function activate() {
    if (state.focus >= apps.length) { openPanel(); return; }
    var a = apps[state.focus];
    if (window.AndroidTV && AndroidTV.launch) AndroidTV.launch(a.package);
  }
  function move(d) { state.focus = (state.focus + d + tileCount()) % tileCount(); renderFocus(); save(); }

  // ---- Customize: a simple vertical list ----
  var panelOpen = false, rows = [], ri = 0;
  function buildRows() {
    var t = A.theme(state.theme), s = cur();
    rows = [];
    rows.push({ label: 'Theme', kind: 'choice', opts: A.THEMES.map(function (x) { return { v: x.id, label: x.name }; }), get: function () { return state.theme; }, set: switchTheme });
    rows.push({ label: 'Effect strength', kind: 'range', get: function () { return s.intensity; }, set: function (v) { s.intensity = v; } });
    rows.push({ label: 'Speed', kind: 'range', get: function () { return s.speed; }, set: function (v) { s.speed = v; } });
    for (var i = 0; i < t.knobs.length; i++) (function (kb) {
      if (kb.type === 'range') rows.push({ label: kb.label, kind: 'range', max: kb.max, get: function () { return s[kb.key]; }, set: function (v) { s[kb.key] = v; } });
      else rows.push({ label: kb.label, kind: 'choice', opts: kb.options, get: function () { return s[kb.key]; }, set: function (v) { s[kb.key] = v; } });
    })(t.knobs[i]);
    rows.push({ label: 'Accent colour', kind: 'choice', opts: t.swatches.map(function (c) { return { v: c, label: c, color: c }; }), get: function () { return s.accent; }, set: function (v) { s.accent = v; } });
    rows.push({ label: 'Decorations', kind: 'toggle', get: function () { return s.decorations; }, set: function (v) { s.decorations = v; } });
    rows.push({ label: 'Ambient sound', kind: 'toggle', get: function () { return s.sound; }, set: function (v) { s.sound = v; } });
    rows.push({ label: 'Screen edge margin', kind: 'range', max: 10, get: function () { return state.safe; }, set: function (v) { state.safe = v; } });
    if (ri >= rows.length) ri = rows.length - 1;
    drawPanel();
  }
  function valueText(r) {
    if (r.kind === 'range') return r.get() + (r.max === 10 ? '' : '%');
    if (r.kind === 'toggle') return r.get() ? 'On' : 'Off';
    for (var i = 0; i < r.opts.length; i++) if (r.opts[i].v === r.get()) return r.opts[i].label === r.get() && r.opts[i].color ? '' : r.opts[i].label;
    return '';
  }
  function drawPanel() {
    var html = '', i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], foc = i === ri;
      html += '<div class="opt"><div class="lab">' + esc(r.label) + '</div>';
      if (r.kind === 'range') {
        html += '<span class="meter' + (foc ? ' focus' : '') + '"><i style="width:' + Math.round(r.get() / (r.max || 100) * 100) + '%"></i></span> <span style="font-size:1.5rem;opacity:.8;margin-left:1rem">' + valueText(r) + '</span>';
      } else if (r.kind === 'toggle') {
        html += '<span class="sw' + (r.get() ? ' on' : '') + (foc ? ' focus' : '') + '"></span>';
      } else {
        html += '<div class="choices">';
        for (var j = 0; j < r.opts.length; j++) {
          var o = r.opts[j], on = r.get() === o.v;
          var st = o.color ? ' style="background:' + o.color + ';min-width:2.4rem;color:transparent"' : '';
          html += '<span class="choice' + (on ? ' on' : '') + (foc && on ? ' focus' : '') + '"' + st + '>' + (o.color ? '&nbsp;' : esc(o.label)) + '</span>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    $('panelBody').innerHTML = html;
    var f = $('panelBody').children[ri];
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'center' });
  }
  function openPanel() { panelOpen = true; ri = 0; $('panel').className = 'show'; buildRows(); }
  function closePanel() { panelOpen = false; $('panel').className = ''; save(); }
  function switchTheme(v) { if (v === state.theme) return; state.theme = v; applyTheme(); renderTiles(); save(); }
  function change(dir) {
    var r = rows[ri];
    if (r.kind === 'range') { var mx = r.max || 100; r.set(Math.max(0, Math.min(mx, r.get() + dir * (mx === 10 ? 1 : 10)))); }
    else if (r.kind === 'toggle') { r.set(!r.get()); }
    else { var idx = 0; for (var i = 0; i < r.opts.length; i++) if (r.opts[i].v === r.get()) idx = i; idx = (idx + dir + r.opts.length) % r.opts.length; r.set(r.opts[idx].v); }
    applyTheme(); save(); buildRows();
  }
  function panelKey(c) {
    if (c === 38) { ri = (ri - 1 + rows.length) % rows.length; drawPanel(); }
    else if (c === 40) { ri = (ri + 1) % rows.length; drawPanel(); }
    else if (c === 39) change(1);
    else if (c === 37) change(-1);
    else if (c === 13 || c === 23 || c === 66) { rows[ri].kind === 'toggle' ? change(1) : change(1); }
    else if (c === 4 || c === 27) closePanel();
  }

  // ---- keys ----
  document.addEventListener('keydown', function (e) {
    var c = e.keyCode;
    if (panelOpen) { panelKey(c); e.preventDefault(); return; }
    if (c === 37) { move(-1); e.preventDefault(); }
    else if (c === 39) { move(1); e.preventDefault(); }
    else if (c === 38 || c === 82) { openPanel(); e.preventDefault(); }
    else if (c === 13 || c === 23 || c === 66) { activate(); e.preventDefault(); }
  });
  $('row').addEventListener('click', function (e) {
    var el = e.target; while (el && el !== this && el.className.indexOf('tile') !== 0) el = el.parentNode;
    if (el && el !== this) { state.focus = +el.getAttribute('data-i'); renderFocus(); activate(); }
  });

  // ---- bridge API ----
  window.AITV_LAUNCHER = {
    onBack: function () { if (panelOpen) closePanel(); },
    refresh: function () { loadApps(); renderTiles(); }
  };

  // ---- boot ----
  window.addEventListener('resize', function () { scene.resize(); centerRow(); });
  loadApps(); applyTheme(); renderTiles(); scene.start(); clock(); setInterval(clock, 1000);
  setTimeout(centerRow, 60);
  $('hint').textContent = 'OK to open · Up for Customize';
})();
