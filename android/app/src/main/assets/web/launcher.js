// AI-TV launcher: themed animated home screen that shows the device's real apps
// (with their own icons, from the native bridge) and launches them. ES5 for the
// widest WebView range. The bridge is window.AndroidTV; without it (e.g. opened in
// a desktop browser) a small sample set is used so the screen still renders.
(function () {
  'use strict';
  var A = window.AITV;
  var $ = function (id) { return document.getElementById(id); };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
    return null;
  }

  // ---- state ----
  var state = { theme: A.seasonalTheme(), settings: {}, focus: 0 };
  var i;
  for (i = 0; i < A.THEMES.length; i++) state.settings[A.THEMES[i].id] = A.themeDefaults(A.THEMES[i].id);
  try {
    var saved = JSON.parse(store('aitv.launcher'));
    if (saved && saved.theme && A.theme(saved.theme).id === saved.theme) {
      state.theme = saved.theme;
      for (i = 0; i < A.THEMES.length; i++) {
        var id = A.THEMES[i].id, s = saved.settings && saved.settings[id];
        if (s) for (var k in s) if (state.settings[id][k] !== undefined) state.settings[id][k] = s[k];
      }
    }
  } catch (e) {}
  function save() { store('aitv.launcher', JSON.stringify({ theme: state.theme, settings: state.settings })); }
  function cur() { return state.settings[state.theme]; }

  // ---- apps (from the native bridge) ----
  var apps = [];
  function loadApps() {
    var list = null;
    if (window.AndroidTV && AndroidTV.listApps) {
      try { list = JSON.parse(AndroidTV.listApps()); } catch (e) { list = null; }
    }
    if (!list || !list.length) {
      // Desktop-preview fallback: show the generic set so the screen isn't empty.
      list = A.APPS.map(function (a) { return { package: a.id, label: a.name, icon: '', glyph: a.glyph, color: a.color }; });
    }
    apps = list;
    if (state.focus > apps.length) state.focus = apps.length; // settings tile is at apps.length
  }

  // ---- decorations ----
  var SVG = {
    snow: '<svg class="d-snow" viewBox="0 0 100 14" preserveAspectRatio="none"><path d="M0 6Q0 0 6 0L94 0Q100 0 100 6Q96 13 90 7Q84 14 76 7Q70 12 62 7Q54 14 46 7Q38 12 30 7Q22 14 14 7Q6 13 0 6Z"/></svg>',
    bow: '<svg class="d-bow" viewBox="0 0 68 40"><path d="M34 20C20 0 2 2 4 18c1 14 18 12 30 2z"/><path d="M34 20C48 0 66 2 64 18c-1 14-18 12-30 2z"/><path d="M30 22l-8 18 8-4 4-10 4 10 8 4-8-18z"/><circle cx="34" cy="20" r="6"/></svg>',
    web: '<svg class="d-web" viewBox="0 0 40 40"><path d="M0 0L40 2M0 0L36 16M0 0L27 27M0 0L16 36M0 0L2 40M13 1Q13 5 11 6Q10 9 7 9Q5 11 5 12M25 1Q25 9 22 11Q21 18 16 19Q13 22 10 22M36 2Q36 13 32 14Q30 26 23 26Q21 31 14 32"/></svg>',
    glint: '<svg class="d-glint a" viewBox="0 0 20 20"><path d="M10 0Q11 9 20 10Q11 11 10 20Q9 11 0 10Q9 9 10 0Z"/></svg>',
    leaf: '<svg class="d-leaf" viewBox="0 0 40 40"><path d="M6 36Q16 26 30 10" fill="none" stroke="#3f6b35" stroke-width="2"/><path d="M30 10Q20 6 16 16Q24 20 30 10Z" fill="#8fce6f"/><path d="M22 19Q10 16 8 26Q18 30 22 19Z" fill="#6fb257"/></svg>'
  };
  function decoHtml(theme) {
    if (theme === 'christmas') return SVG.snow + SVG.bow;
    if (theme === 'halloween') return SVG.web;
    if (theme === 'space') return SVG.glint;
    if (theme === 'nature') return SVG.leaf;
    return '';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var GEAR = '<svg viewBox="0 0 24 24" width="40" height="40" fill="#fff"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.9 4a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.6H9.7l-.4 2.6a7 7 0 00-1.7 1l-2.4-1-2 3.4L3.2 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.6h4.6l.4-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.6.1-1z"/></svg>';

  function renderTiles() {
    var html = '', i;
    for (i = 0; i < apps.length; i++) {
      var a = apps[i];
      var inner = a.icon ? '<img class="appicon" src="' + a.icon + '" alt="">'
        : '<span class="glyph">' + esc(a.glyph || (a.label || '?').charAt(0)) + '</span>';
      html += '<div class="tile" data-i="' + i + '"><div class="face">' + inner + '</div>' +
        '<div class="deco">' + decoHtml(state.theme) + '</div><div class="label">' + esc(a.label) + '</div></div>';
    }
    // trailing settings tile
    html += '<div class="tile" data-i="' + apps.length + '"><div class="face"><span class="glyph" style="line-height:7rem">' + GEAR + '</span></div>' +
      '<div class="deco">' + decoHtml(state.theme) + '</div><div class="label">Customize</div></div>';
    $('row').innerHTML = html;
    $('lights').innerHTML = state.theme === 'christmas' ? lightsHtml(apps.length + 1, cur().lights) : '';
    renderFocus();
  }
  function lightsHtml(n, mode) {
    if (!n || mode === 'off') return '';
    var cols = ['#ff4d4d', '#ffd23c', '#4dc3ff', '#6dff8a', '#ff8fd6'], d = '', bulbs = '', k = 0;
    for (var i = 0; i < n; i++) {
      var x0 = i * 131, x1 = x0 + 131;
      d += (i ? 'L' : 'M') + x0 + ' 6Q' + (x0 + 65) + ' 30 ' + x1 + ' 6';
      var ts = [0.2, 0.55, 0.85];
      for (var j = 0; j < 3; j++, k++) {
        var t = ts[j], bx = x0 + 131 * t, by = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 30 + t * t * 6 + 4;
        var delay = mode === 'chase' ? (k % 4) * 0.38 : (k * 0.37) % 2.6;
        bulbs += '<circle class="bulb" cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="5" fill="' + cols[k % 5] + '" style="-webkit-animation-delay:-' + delay.toFixed(2) + 's;animation-delay:-' + delay.toFixed(2) + 's"/>';
      }
    }
    return '<svg class="l-' + mode + '" viewBox="0 0 ' + n * 131 + ' 30" preserveAspectRatio="none"><path d="' + d + '"/>' + bulbs + '</svg>';
  }
  function tileCount() { return apps.length + 1; }
  function renderFocus() {
    var tiles = $('row').children, i;
    for (i = 0; i < tiles.length; i++) tiles[i].className = i === state.focus ? 'tile focus' : 'tile';
    var el = tiles[state.focus];
    if (el && el.scrollIntoView) el.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  // ---- theme apply + scene ----
  var scene = new A.Scene($('bg'), { maxW: 1280 });
  var sceneKey = '';
  function applyTheme() {
    var t = A.theme(state.theme), s = cur(), b = document.body;
    b.className = 't-' + state.theme + (s.decorations ? '' : ' no-deco') + (s.font === 'theme' ? ' f-theme' : '');
    b.style.setProperty('--accent', s.accent);
    b.style.setProperty('--accent2', state.theme === 'neon' ? A.NEON_SECOND[s.second] : s.accent);
    b.style.setProperty('--text', t.text);
    b.style.setProperty('--ribbon', A.RIBBONS[s.ribbon] || '#c8102e');
    b.style.fontFamily = A.fontStack(state.theme, s.font);
    var key = state.theme + JSON.stringify(s);
    if (key !== sceneKey) { sceneKey = key; scene.set(state.theme, s); }
    $('hello').textContent = greeting();
  }
  function greeting() {
    var t = A.theme(state.theme), g = t.greeting;
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
  function move(d) {
    var n = tileCount();
    state.focus = (state.focus + d + n) % n;
    renderFocus();
    save();
  }

  // ---- settings panel (D-pad driven) ----
  var panelOpen = false, rows = [], rowIdx = 0;
  function buildPanel() {
    var t = A.theme(state.theme), s = cur();
    rows = [];
    rows.push({ type: 'chips', label: 'Theme', opts: A.THEMES.map(function (x) { return { v: x.id, label: x.name }; }),
      get: function () { return state.theme; }, set: function (v) { switchTheme(v); } });
    rows.push({ type: 'meter', label: 'Intensity', get: function () { return s.intensity; }, set: function (v) { s.intensity = v; } });
    rows.push({ type: 'meter', label: 'Animation speed', get: function () { return s.speed; }, set: function (v) { s.speed = v; } });
    for (var i = 0; i < t.knobs.length; i++) (function (kb) {
      if (kb.type === 'range') rows.push({ type: 'meter', label: kb.label, get: function () { return s[kb.key]; }, set: function (v) { s[kb.key] = v; }, max: kb.max });
      else rows.push({ type: 'chips', label: kb.label, opts: kb.options, get: function () { return s[kb.key]; }, set: function (v) { s[kb.key] = v; } });
    })(t.knobs[i]);
    rows.push({ type: 'chips', label: 'Accent', opts: t.swatches.map(function (c) { return { v: c, label: ' ', color: c }; }),
      get: function () { return s.accent; }, set: function (v) { s.accent = v; } });
    rows.push({ type: 'switch', label: 'Decorations', get: function () { return s.decorations; }, set: function (v) { s.decorations = v; } });
    rows.push({ type: 'switch', label: 'Ambient sound', get: function () { return s.sound; }, set: function (v) { s.sound = v; } });
    rowIdx = Math.min(rowIdx, rows.length - 1);
    renderPanel();
  }
  function renderPanel() {
    var html = '', i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], foc = i === rowIdx;
      html += '<div class="opt"><div class="lab">' + esc(r.label) + '</div>';
      if (r.type === 'meter') {
        html += '<div class="meter' + (foc ? ' focus' : '') + '"><i style="width:' + Math.round(r.get() / (r.max || 100) * 100) + '%"></i></div>';
      } else if (r.type === 'switch') {
        html += '<div class="sw' + (r.get() ? ' on' : '') + (foc ? ' focus' : '') + '"></div>';
      } else {
        html += '<div class="choices">';
        for (var j = 0; j < r.opts.length; j++) {
          var o = r.opts[j], on = r.get() === o.v, cf = foc && j === (r.ci || 0);
          var style = o.color ? ' style="background:' + o.color + ';min-width:2rem"' : '';
          html += '<span class="choice' + (on ? ' on' : '') + (cf ? ' focus' : '') + '"' + style + '>' + esc(o.label) + '</span>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    $('panelBody').innerHTML = html;
    var foc = $('panelBody').querySelector('.focus');
    if (foc && foc.scrollIntoView) foc.scrollIntoView({ block: 'center' });
  }
  function openPanel() { panelOpen = true; rowIdx = 0; $('panel').className = 'show'; buildPanel(); }
  function closePanel() { panelOpen = false; $('panel').className = ''; save(); }
  function switchTheme(v) {
    if (v === state.theme) return;
    state.theme = v;
    applyTheme(); renderTiles(); buildPanel(); save();
  }
  function panelKey(code) {
    var r = rows[rowIdx];
    if (code === 38) { rowIdx = (rowIdx - 1 + rows.length) % rows.length; renderPanel(); }
    else if (code === 40) { rowIdx = (rowIdx + 1) % rows.length; renderPanel(); }
    else if (code === 37 || code === 39) {
      var dir = code === 39 ? 1 : -1;
      if (r.type === 'meter') { var mx = r.max || 100; r.set(Math.max(0, Math.min(mx, r.get() + dir * 10))); afterEdit(); renderPanel(); }
      else if (r.type === 'switch') { r.set(!r.get()); afterEdit(); renderPanel(); }
      else { // chips: move cursor, apply immediately
        r.ci = ((r.ci || 0) + dir + r.opts.length) % r.opts.length;
        r.set(r.opts[r.ci].v); afterEdit(); renderPanel();
      }
    } else if (code === 13 || code === 23) {
      if (r.type === 'switch') { r.set(!r.get()); afterEdit(); renderPanel(); }
      else if (r.type === 'chips') { r.set(r.opts[r.ci || 0].v); afterEdit(); renderPanel(); }
    } else if (code === 4 || code === 27) { closePanel(); }
  }
  function afterEdit() { applyTheme(); save(); }

  // ---- key handling ----
  document.addEventListener('keydown', function (e) {
    var c = e.keyCode;
    if (panelOpen) { panelKey(c); e.preventDefault(); return; }
    if (c === 37) { move(-1); e.preventDefault(); }
    else if (c === 39) { move(1); e.preventDefault(); }
    else if (c === 38) { openPanel(); e.preventDefault(); }           // Up opens customize
    else if (c === 13 || c === 23 || c === 66) { activate(); e.preventDefault(); } // OK / DPAD_CENTER / Enter
    else if (c === 82) { openPanel(); e.preventDefault(); }           // Menu
  });
  // Pointer support for desktop preview.
  $('row').addEventListener('click', function (e) {
    var el = e.target; while (el && el !== this && el.className.indexOf('tile') !== 0) el = el.parentNode;
    if (el && el !== this) { state.focus = +el.getAttribute('data-i'); renderFocus(); activate(); }
  });

  // ---- bridge-facing API (called from MainActivity) ----
  window.AITV_LAUNCHER = {
    onBack: function () { if (panelOpen) closePanel(); },
    refresh: function () { loadApps(); renderTiles(); }
  };

  // ---- boot ----
  function layout() { scene.resize(); }
  window.addEventListener('resize', layout);
  loadApps();
  applyTheme();
  renderTiles();
  scene.start();
  clock();
  setInterval(clock, 1000);
  $('hint').textContent = 'OK to open · Up for themes';
  // Gentle burn-in guard: nudge the UI every minute.
  setInterval(function () {
    var tr = 'translate(' + (Math.random() * 0.8 - 0.4).toFixed(2) + '%,' + (Math.random() * 0.8 - 0.4).toFixed(2) + '%)';
    $('ui').style.webkitTransform = tr; $('ui').style.transform = tr;
  }, 60000);
})();
