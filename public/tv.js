// TV screen controller. ES5 + XHR + EventSource only: must run on old TV browsers.
(function () {
  'use strict';
  var A = window.AITV;
  var $ = function (id) { return document.getElementById(id); };
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* storage blocked: run without persistence */ }
    return null;
  }

  var code = store('aitv.code');
  if (!code || !/^[A-HJ-NP-Z2-9]{4}$/.test(code)) {
    code = '';
    for (var i = 0; i < 4; i++) code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    store('aitv.code', code);
  }

  var saved = null;
  try { saved = JSON.parse(store('aitv.state')); } catch (e) { saved = null; }
  var state = A.normalize(saved);
  var scene = new A.Scene($('bg'), { maxW: 1280 });
  var tilesKey = '';
  var lastMinute = -1;

  // ------------------------------------------------------------ decorations
  var SVG = {
    bow: '<svg class="d-bow" viewBox="0 0 68 40"><path d="M34 20C20 0 2 2 4 18c1 14 18 12 30 2z"/><path d="M34 20C48 0 66 2 64 18c-1 14-18 12-30 2z"/><path d="M30 22l-8 18 8-4 4-10 4 10 8 4-8-18z"/><circle cx="34" cy="20" r="6"/></svg>',
    snow: '<svg class="d-snow" viewBox="0 0 100 14" preserveAspectRatio="none"><path d="M0 6Q0 0 6 0L94 0Q100 0 100 6Q96 13 90 7Q84 14 76 7Q70 12 62 7Q54 14 46 7Q38 12 30 7Q22 14 14 7Q6 13 0 6Z"/></svg>',
    web: '<svg class="d-web" viewBox="0 0 40 40"><path d="M0 0L40 2M0 0L36 16M0 0L27 27M0 0L16 36M0 0L2 40M13 1Q13 5 11 6Q10 9 7 9Q5 11 5 12Q4 13 1 13M25 1Q25 9 22 11Q21 18 16 19Q13 22 10 22Q8 25 1 25M36 2Q36 13 32 14Q30 26 23 26Q21 31 14 32Q12 36 2 36"/></svg>',
    drip: '<svg class="d-drip" viewBox="0 0 100 16" preserveAspectRatio="none"><path d="M0 0L100 0L100 4Q96 4 95 9Q94 14 92 9Q91 4 80 4Q70 4 69 10Q68 16 66 10Q65 4 50 4Q40 4 39 8Q38 12 36 8Q35 4 20 4Q14 4 13 11Q12 16 10 11Q9 4 0 4Z"/></svg>',
    glint: function (c) { return '<svg class="d-glint ' + c + '" viewBox="0 0 20 20"><path d="M10 0Q11 9 20 10Q11 11 10 20Q9 11 0 10Q9 9 10 0Z"/></svg>'; },
    leaf: '<svg class="d-leaf" viewBox="0 0 40 40"><path d="M6 36Q16 26 30 10" fill="none" stroke="#3f6b35" stroke-width="2"/><path d="M30 10Q20 6 16 16Q24 20 30 10Z" fill="#8fce6f"/><path d="M22 19Q10 16 8 26Q18 30 22 19Z" fill="#6fb257"/><path d="M26 15Q36 16 36 26Q27 26 26 15Z" fill="#a9dc84"/></svg>'
  };
  function decoHtml(theme, idx) {
    if (theme === 'christmas') return '<div class="d-ribbon"></div>' + SVG.snow + SVG.bow;
    if (theme === 'halloween') return SVG.web + SVG.drip;
    if (theme === 'neon') return '<div class="d-br a"></div><div class="d-br b"></div><div class="d-id">APP_0' + (idx + 1) + '</div>';
    if (theme === 'space') return SVG.glint('a') + SVG.glint('b') + '<div class="d-orbit"><i></i></div>';
    return SVG.leaf;
  }
  function lightsHtml(n, mode) {
    if (!n || mode === 'off') return '';
    var cols = ['#ff4d4d', '#ffd23c', '#4dc3ff', '#6dff8a', '#ff8fd6'], d = '', bulbs = '', k = 0;
    for (var i = 0; i < n; i++) {
      var x0 = i * 112, x1 = x0 + 112;
      d += (i ? 'L' : 'M') + x0 + ' 6Q' + (x0 + 56) + ' 30 ' + x1 + ' 6';
      var ts = [0.18, 0.5, 0.82];
      for (var j = 0; j < 3; j++, k++) {
        var t = ts[j], bx = x0 + 112 * t, by = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 30 + t * t * 6;
        var delay = mode === 'chase' ? (k % 4) * 0.4 : (k * 0.37) % 2.6;
        bulbs += '<circle class="bulb" cx="' + bx.toFixed(1) + '" cy="' + (by + 4).toFixed(1) + '" r="5" fill="' + cols[k % cols.length] + '" style="-webkit-animation-delay:-' + delay.toFixed(2) + 's;animation-delay:-' + delay.toFixed(2) + 's"/>';
      }
    }
    return '<svg class="l-' + mode + '" viewBox="0 0 ' + n * 112 + ' 30" preserveAspectRatio="none"><path d="' + d + '"/>' + bulbs + '</svg>';
  }
  function appById(id) {
    for (var i = 0; i < A.APPS.length; i++) if (A.APPS[i].id === id) return A.APPS[i];
    return null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ------------------------------------------------------------------ render
  function renderTiles() {
    var s = state.settings[state.theme];
    var key = state.theme + '|' + state.apps.join(',') + '|' + (s.lights || '');
    if (key === tilesKey) return;
    tilesKey = key;
    var html = '';
    for (var i = 0; i < state.apps.length; i++) {
      var app = appById(state.apps[i]);
      html += '<div class="tile" data-i="' + i + '" style="--app:' + app.color + '"><div class="face"><span class="glyph">' + app.glyph +
        '</span></div><div class="deco">' + decoHtml(state.theme, i) + '</div><div class="label">' + esc(app.name) + '</div></div>';
    }
    $('row').innerHTML = html;
    $('lights').innerHTML = state.theme === 'christmas' ? lightsHtml(state.apps.length, s.lights) : '';
  }
  function renderFocus() {
    var tiles = $('row').children;
    for (var i = 0; i < tiles.length; i++) tiles[i].className = i === state.focus ? 'tile focus' : 'tile';
  }
  function greeting() {
    var t = A.theme(state.theme), g = t.greeting;
    if (!g) {
      var h = new Date().getHours();
      g = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    }
    return state.name ? g + ', ' + state.name : g;
  }
  function renderClock() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    if (m === lastMinute) return;
    var first = lastMinute === -1;
    lastMinute = m;
    $('clock').innerHTML = ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + '<small>' + (h < 12 ? 'AM' : 'PM') + '</small>';
    $('sub').textContent = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    $('hello').textContent = greeting();
    if (!first && state.theme === 'neon') {
      $('clock').className = 'glitch';
      setTimeout(function () { $('clock').className = ''; }, 300);
    }
    // "Auto" time of day in Cozy Nature follows the real clock.
    if (!first && state.theme === 'nature' && m === 0) scene.set(state.theme, state.settings[state.theme]);
  }
  function layout() {
    var safe = state.safe, W = window.innerWidth, ui = $('ui');
    document.documentElement.style.fontSize = (W * (1 - 2 * safe / 100) / 100) + 'px';
    ui.style.left = ui.style.right = safe + 'vw';
    ui.style.top = ui.style.bottom = safe + 'vh';
    scene.resize();
  }
  function apply() {
    var t = A.theme(state.theme), s = state.settings[state.theme], b = document.body;
    b.className = 't-' + state.theme + (s.decorations ? '' : ' no-deco');
    b.style.setProperty('--accent', s.accent);
    b.style.setProperty('--accent2', state.theme === 'neon' ? A.NEON_SECOND[s.second] : s.accent);
    b.style.setProperty('--text', t.text);
    b.style.setProperty('--ribbon', A.RIBBONS[s.ribbon] || '#c8102e');
    b.style.fontFamily = A.fontStack(state.theme, s.font);
    layout();
    scene.set(state.theme, s);
    renderTiles();
    renderFocus();
    $('hello').textContent = greeting();
    sound.update();
  }

  // ------------------------------------------------------------------- sound
  // Small synthesized ambience (filtered noise + soft chimes); no audio files.
  var SOUNDS = {
    christmas: { cut: 480, vol: 0.05, notes: [1047, 1319, 1568, 2093, 1760], gap: 3.5, wave: 'sine', len: 1.6 },
    halloween: { cut: 200, vol: 0.09, notes: [110, 104, 147, 98], gap: 6, wave: 'triangle', len: 3.5 },
    neon: { cut: 900, vol: 0.03, notes: [220, 330, 440, 494, 660], gap: 2.2, wave: 'square', len: 0.35 },
    space: { cut: 150, vol: 0.1, notes: [196, 247, 294, 392], gap: 5, wave: 'sine', len: 4.5 },
    nature: { cut: 700, vol: 0.05, notes: [2637, 3136, 2794, 3520], gap: 2.8, wave: 'sine', len: 0.12 }
  };
  var sound = {
    ctx: null, master: null, filter: null, noiseGain: null, timer: 0, unlocked: false,
    init: function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || this.ctx) return;
      var ctx = (this.ctx = new AC()), len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // brown noise
      var src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.noiseGain = ctx.createGain();
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      src.connect(this.filter); this.filter.connect(this.noiseGain); this.noiseGain.connect(this.master); this.master.connect(ctx.destination);
      src.start(0);
    },
    unlock: function () { // browsers only allow audio after a key press / click
      this.unlocked = true;
      this.init();
      if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
      this.update();
    },
    chime: function () {
      var self = this, cfg = SOUNDS[state.theme], s = state.settings[state.theme];
      clearTimeout(this.timer);
      if (!this.ctx || !s.sound) return;
      var ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), now = ctx.currentTime;
      o.type = cfg.wave;
      o.frequency.value = cfg.notes[Math.floor(Math.random() * cfg.notes.length)];
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(cfg.wave === 'square' ? 0.02 : 0.07, now + Math.min(0.05, cfg.len / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, now + cfg.len);
      o.connect(g); g.connect(this.master);
      o.start(now); o.stop(now + cfg.len + 0.05);
      this.timer = setTimeout(function () { self.chime(); }, cfg.gap * (0.6 + Math.random()) * 1000);
    },
    update: function () {
      var s = state.settings[state.theme];
      $('hint').textContent = s.sound && !this.unlocked ? 'Press OK on the TV remote to start sound' : '';
      if (!this.ctx) return;
      var cfg = SOUNDS[state.theme], now = this.ctx.currentTime;
      this.filter.frequency.setTargetAtTime(cfg.cut, now, 0.5);
      this.noiseGain.gain.setTargetAtTime(cfg.vol * 6, now, 0.5);
      this.master.gain.setTargetAtTime(s.sound ? 1 : 0, now, 0.4);
      clearTimeout(this.timer);
      if (s.sound) { var self = this; this.timer = setTimeout(function () { self.chime(); }, 1200); }
    }
  };

  // ----------------------------------------------------------------- network
  var es = null, lastEvent = 0, everPaired = store('aitv.paired') === '1';
  function xhr(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || !cb) return;
      var data = null;
      try { data = JSON.parse(x.responseText); } catch (e) { data = null; }
      cb(x.status, data);
    };
    x.send(body || null);
  }
  function setOnline(on) { $('chip').className = on ? 'on' : ''; }
  function receive(raw) {
    state = A.normalize(raw);
    store('aitv.state', JSON.stringify(state));
    if (!everPaired) { everPaired = true; store('aitv.paired', '1'); }
    $('pair').className = '';
    apply();
  }
  function connect() {
    if (es) es.close();
    if (!window.EventSource) return;
    es = new EventSource('/api/events?role=tv&room=' + code);
    lastEvent = Date.now();
    es.addEventListener('hello', function (e) {
      lastEvent = Date.now();
      setOnline(true);
      var msg = JSON.parse(e.data);
      if (msg.state) receive(msg.state);
      // The server lost its memory (restart): re-seed it so remotes see our look.
      else if (everPaired) xhr('POST', '/api/state?restore=1&room=' + code, JSON.stringify(state));
    });
    es.addEventListener('state', function (e) { lastEvent = Date.now(); receive(JSON.parse(e.data).state); });
    es.addEventListener('ping', function () { lastEvent = Date.now(); setOnline(true); });
    es.onerror = function () { setOnline(false); };
  }
  // Watchdog: TV browsers sometimes leave a dead stream "open" forever.
  setInterval(function () {
    if (Date.now() - lastEvent > 40000) { setOnline(false); connect(); }
  }, 10000);

  function showPairing(base) {
    var url = base + '/?code=' + code;
    $('pairUrl').textContent = base.replace(/^https?:\/\//, '');
    $('pairCode').textContent = code;
    $('chip').innerHTML = '<i></i>Remote: ' + esc(base.replace(/^https?:\/\//, '')) + ' &nbsp;·&nbsp; code <b>' + code + '</b>';
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      $('qr').innerHTML = qr.createImgTag(6, 0);
    } catch (e) { $('qr').style.display = 'none'; }
    if (!everPaired) $('pair').className = 'show';
  }

  // ------------------------------------------------------------------- input
  function moveFocus(delta) {
    var n = state.apps.length;
    if (!n) return;
    state.focus = (state.focus + delta + n) % n;
    renderFocus();
  }
  function openFocused() {
    var app = appById(state.apps[state.focus]);
    if (app) window.location.href = app.url;
  }
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode; // keyCode, not e.key: old TV engines
    sound.unlock();
    if ($('pair').className === 'show') {
      if (k === 13 || k === 461 || k === 27) { $('pair').className = ''; e.preventDefault(); }
      return;
    }
    if (k === 37) { moveFocus(-1); e.preventDefault(); }
    else if (k === 39) { moveFocus(1); e.preventDefault(); }
    else if (k === 13) { openFocused(); e.preventDefault(); }
  });
  $('row').addEventListener('click', function (e) {
    sound.unlock();
    var el = e.target;
    while (el && el !== this && !(el.className && String(el.className).indexOf('tile') === 0)) el = el.parentNode;
    if (!el || el === this) return;
    var idx = Number(el.getAttribute('data-i'));
    if (idx === state.focus) openFocused();
    else { state.focus = idx; renderFocus(); }
  });
  $('pair').addEventListener('click', function () { sound.unlock(); $('pair').className = ''; });

  // -------------------------------------------------------------------- boot
  window.addEventListener('resize', layout);
  apply();
  scene.start();
  renderClock();
  setInterval(renderClock, 1000);
  // Nudge the UI a few pixels every minute to protect OLED panels from burn-in.
  setInterval(function () {
    var t = 'translate(' + (Math.random() * 0.8 - 0.4).toFixed(2) + 'rem,' + (Math.random() * 0.8 - 0.4).toFixed(2) + 'rem)';
    $('ui').style.webkitTransform = t;
    $('ui').style.transform = t;
  }, 60000);

  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    // Opened on the same machine as the server: phones need the LAN address instead.
    xhr('GET', '/api/info', null, function (status, data) {
      showPairing(data && data.urls && data.urls[0] ? data.urls[0] : window.location.origin);
    });
  } else showPairing(window.location.origin);
  connect();

  window.AITV_TV = { code: code, getState: function () { return state; } }; // for tests
})();
