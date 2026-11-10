// Phone remote: pick a theme, tune it, and the TV follows live.
(function () {
  'use strict';
  var A = window.AITV;
  var $ = function (id) { return document.getElementById(id); };
  var CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, val);
    } catch (e) { /* private mode: run without persistence */ }
    return null;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  var saved = null;
  try { saved = JSON.parse(store('aitv.remote.state')); } catch (e) { saved = null; }
  var state = A.normalize(saved);
  var code = null;
  var dirty = false;      // local edits the server hasn't accepted yet
  var es = null;
  var retryTimer = 0;
  var retryDelay = 500;
  var sendTimer = 0;
  var lostTimer = 0;
  var scenes = {};        // themeId -> Scene for the carousel previews
  var cards = {};
  var controlsFor = '';   // theme the controls DOM was built for

  // ---------------------------------------------------------------- network
  function setStatus(kind, text) {
    $('status').className = 'pill ' + kind;
    $('statusText').textContent = text;
  }
  function push() {
    clearTimeout(sendTimer);
    sendTimer = 0;
    if (!code) return;
    var body = JSON.stringify(state);
    fetch('/api/state?room=' + code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { if (r.ok && body === JSON.stringify(state)) dirty = false; })
      .catch(function () { /* stays dirty; flushed on reconnect */ });
  }
  function changed() {
    dirty = true;
    store('aitv.remote.state', JSON.stringify(state));
    if (!sendTimer) sendTimer = setTimeout(push, 40); // throttle slider drags
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(5000, retryDelay * 2);
  }
  function markLost() {
    // Brief drops (app switch, wifi blip) shouldn't flash a warning.
    if (!lostTimer) lostTimer = setTimeout(function () { setStatus('lost', 'Reconnecting…'); }, 2000);
  }
  function connect() {
    clearTimeout(retryTimer);
    if (es) { es.close(); es = null; }
    if (!code) return;
    fetch('/api/room?room=' + code).then(function (r) { return r.json(); }).then(function (info) {
      if (!code) return;
      if (!info.exists) { // server restarted and the TV hasn't come back yet
        setStatus('', 'Looking for TV ' + code + '…');
        return scheduleRetry();
      }
      es = new EventSource('/api/events?role=remote&room=' + code);
      es.addEventListener('hello', function (e) {
        var msg = JSON.parse(e.data);
        retryDelay = 500;
        clearTimeout(lostTimer); lostTimer = 0;
        presence(msg.tvs);
        if (msg.state && !dirty) { state = A.normalize(msg.state); renderAll(); }
        else push();
      });
      es.addEventListener('presence', function (e) { presence(JSON.parse(e.data).tvs); });
      es.addEventListener('state', function (e) {
        if (dirty) return; // our own newer edit is on its way
        var next = A.normalize(JSON.parse(e.data).state);
        if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; renderAll(); }
      });
      es.onerror = function () { markLost(); if (es) es.close(); es = null; scheduleRetry(); };
    }).catch(function () { markLost(); scheduleRetry(); });
  }
  function presence(tvs) {
    if (tvs > 0) setStatus('online', 'TV ' + code + ' connected');
    else setStatus('', 'TV asleep · changes will wait');
  }
  // iOS suspends the page in the background; resync as soon as we're visible again.
  document.addEventListener('visibilitychange', function () { if (!document.hidden && code) { retryDelay = 500; connect(); } });
  window.addEventListener('pageshow', function (e) { if (e.persisted && code) connect(); });

  // ---------------------------------------------------------------- pairing
  function showPair(msg) {
    $('mainView').hidden = true;
    $('pairView').hidden = false;
    $('pairError').textContent = msg || '';
    $('tvUrl').textContent = location.host + '/tv';
    stopPreviews();
  }
  function tryPair(raw) {
    var c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!CODE_RE.test(c)) { $('pairError').textContent = 'Codes are 4 letters or numbers, shown on the TV.'; return; }
    $('pairBtn').disabled = true;
    fetch('/api/room?room=' + c).then(function (r) { return r.json(); }).then(function (info) {
      $('pairBtn').disabled = false;
      if (!info.exists) { $('pairError').textContent = 'No TV found with code ' + c + '. Is the TV screen open?'; return; }
      code = c;
      store('aitv.remote.code', c);
      showMain();
    }).catch(function () {
      $('pairBtn').disabled = false;
      $('pairError').textContent = 'Can’t reach the server. Check your Wi-Fi.';
    });
  }
  $('codeInput').addEventListener('input', function () {
    $('pairError').textContent = '';
    if (this.value.length === 4) tryPair(this.value);
  });
  $('pairBtn').addEventListener('click', function () { tryPair($('codeInput').value); });
  $('status').addEventListener('click', function () { retryDelay = 500; connect(); });

  // --------------------------------------------------------------- carousel
  function buildCarousel() {
    var car = $('carousel'), dots = $('dots');
    A.THEMES.forEach(function (t) {
      var card = el('button', 'card');
      card.setAttribute('data-theme', t.id);
      card.setAttribute('aria-label', t.name + ' theme');
      var cv = el('canvas');
      card.appendChild(cv);
      card.appendChild(el('div', 'live', 'ON TV'));
      var cap = el('div', 'cap');
      cap.appendChild(el('b', '', t.name));
      cap.appendChild(el('span', '', t.tagline));
      card.appendChild(cap);
      card.addEventListener('click', function () { selectTheme(t.id, true); });
      car.appendChild(card);
      cards[t.id] = card;
      scenes[t.id] = new A.Scene(cv, { maxW: 520 });
      dots.appendChild(el('i'));
    });
    var settle = 0;
    car.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () { // swiping to a card applies it; no Apply button
        var mid = car.scrollLeft + car.clientWidth / 2, best = null, bestD = 1e9;
        A.THEMES.forEach(function (t) {
          var c = cards[t.id], d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
          if (d < bestD) { bestD = d; best = t.id; }
        });
        if (best && best !== state.theme) selectTheme(best, false);
      }, 140);
    });
  }
  function centerCard(id, smooth) {
    var car = $('carousel'), c = cards[id];
    var left = c.offsetLeft + c.offsetWidth / 2 - car.clientWidth / 2;
    if (car.scrollTo) car.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'auto' });
    else car.scrollLeft = left;
  }
  function selectTheme(id, scroll) {
    if (id !== state.theme) { state.theme = id; changed(); }
    renderAll();
    if (scroll) centerCard(id, true);
  }
  function stopPreviews() { A.THEMES.forEach(function (t) { if (scenes[t.id]) scenes[t.id].stop(); }); }
  function renderPreviews() {
    A.THEMES.forEach(function (t, i) {
      var sc = scenes[t.id], on = t.id === state.theme;
      cards[t.id].className = on ? 'card sel' : 'card';
      $('dots').children[i].className = on ? 'sel' : '';
      sc.resize();
      sc.set(t.id, state.settings[t.id]);
      if (on) sc.start();
      else { sc.stop(); sc.frame(0.05); } // only the selected preview animates
    });
  }

  // --------------------------------------------------------------- controls
  function cur() { return state.settings[state.theme]; }
  function section(title) {
    var s = el('section');
    s.appendChild(el('h2', '', title));
    $('controls').appendChild(s);
    return s;
  }
  function row(parent, label) {
    var r = el('div', 'row'), top = el('div', 'top');
    top.appendChild(el('span', '', label));
    r.appendChild(top);
    parent.appendChild(r);
    return { row: r, top: top };
  }
  function slider(parent, label, get, set, max, fmt) {
    var r = row(parent, label), val = el('span', 'val'), inp = el('input');
    fmt = fmt || function (v) { return v + '%'; };
    inp.type = 'range'; inp.min = 0; inp.max = max || 100; inp.step = 1; inp.value = get();
    inp.setAttribute('aria-label', label);
    val.textContent = fmt(Number(inp.value));
    inp.addEventListener('input', function () { set(Number(inp.value)); val.textContent = fmt(Number(inp.value)); afterEdit(); });
    r.top.appendChild(val);
    r.row.appendChild(inp);
  }
  function chips(parent, label, options, get, set, multi) {
    var r = row(parent, label), box = el('div', 'chips');
    options.forEach(function (o) {
      var b = el('button', 'chip' + (get(o.v) ? ' on' : ''), o.label);
      b.setAttribute('aria-pressed', get(o.v) ? 'true' : 'false');
      b.addEventListener('click', function () {
        set(o.v);
        Array.prototype.forEach.call(box.children, function (c, i) {
          var on = get(options[i].v);
          c.className = 'chip' + (on ? ' on' : '');
          c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        afterEdit();
      });
      box.appendChild(b);
    });
    r.row.appendChild(box);
  }
  function toggle(parent, label, get, set, note) {
    var r = row(parent, label), sw = el('button', 'switch' + (get() ? ' on' : ''));
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', label);
    sw.setAttribute('aria-checked', get() ? 'true' : 'false');
    sw.addEventListener('click', function () {
      set(!get());
      sw.className = 'switch' + (get() ? ' on' : '');
      sw.setAttribute('aria-checked', get() ? 'true' : 'false');
      afterEdit();
    });
    r.top.appendChild(sw);
    if (note) r.row.appendChild(el('div', 'note', note));
  }
  function afterEdit() {
    changed();
    applySkin();
    var sc = scenes[state.theme];
    if (sc) sc.set(state.theme, cur());
  }
  function appName(id) {
    for (var i = 0; i < A.APPS.length; i++) if (A.APPS[i].id === id) return A.APPS[i].name;
    return '';
  }

  function buildControls() {
    var t = A.theme(state.theme), box = $('controls'), sec;
    controlsFor = state.theme;
    box.textContent = '';

    sec = section('Effects');
    slider(sec, 'Intensity', function () { return cur().intensity; }, function (v) { cur().intensity = v; });
    slider(sec, 'Animation speed', function () { return cur().speed; }, function (v) { cur().speed = v; });

    sec = section('Accent colour');
    var sw = el('div', 'swatches');
    t.swatches.forEach(function (c) {
      var b = el('button', 'swatch' + (cur().accent.toLowerCase() === c ? ' on' : ''));
      b.style.background = c;
      b.setAttribute('aria-label', 'Accent ' + c);
      b.addEventListener('click', function () {
        cur().accent = c;
        Array.prototype.forEach.call(sw.children, function (x) { x.className = 'swatch'; });
        b.className = 'swatch on';
        afterEdit();
      });
      sw.appendChild(b);
    });
    sec.appendChild(sw);

    sec = section(t.name);
    t.knobs.forEach(function (k) {
      if (k.type === 'range') slider(sec, k.label, function () { return cur()[k.key]; }, function (v) { cur()[k.key] = v; }, k.max);
      else chips(sec, k.label, k.options, function (v) { return cur()[k.key] === v; }, function (v) { cur()[k.key] = v; });
    });

    sec = section('Style');
    toggle(sec, 'Tile decorations', function () { return cur().decorations; }, function (v) { cur().decorations = v; });
    toggle(sec, 'Ambient sound', function () { return cur().sound; }, function (v) { cur().sound = v; },
      'Plays on the TV. Press OK on the TV remote once to allow sound.');
    chips(sec, 'Font', A.FONT_CHOICES, function (v) { return cur().font === v; }, function (v) { cur().font = v; });

    sec = section('TV screen');
    var r = row(sec, 'Highlighted app'), st = el('div', 'stepper'), prev = el('button', '', '◀'), next = el('button', '', '▶'), name = el('span');
    prev.setAttribute('aria-label', 'Previous app');
    next.setAttribute('aria-label', 'Next app');
    function showFocus() { name.textContent = state.apps.length ? appName(state.apps[state.focus]) : 'None'; }
    function step(d) {
      var n = state.apps.length;
      if (!n) return;
      state.focus = (state.focus + d + n) % n;
      showFocus();
      changed();
    }
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    st.appendChild(prev); st.appendChild(name); st.appendChild(next);
    r.top.appendChild(st);
    showFocus();

    chips(sec, 'Apps on screen', A.APPS.map(function (a) { return { v: a.id, label: a.name }; }),
      function (v) { return state.apps.indexOf(v) !== -1; },
      function (v) {
        var want = state.apps.slice(), i = want.indexOf(v);
        if (i === -1) want.push(v); else want.splice(i, 1);
        state.apps = A.APPS.map(function (a) { return a.id; }).filter(function (id) { return want.indexOf(id) !== -1; });
        state.focus = Math.min(state.focus, Math.max(0, state.apps.length - 1));
        showFocus();
      });

    r = row(sec, 'Your name');
    var inp = el('input', 'text');
    inp.type = 'text'; inp.maxLength = 20; inp.placeholder = 'Optional'; inp.value = state.name;
    inp.setAttribute('aria-label', 'Your name');
    inp.setAttribute('autocomplete', 'off');
    inp.addEventListener('input', function () { state.name = inp.value.slice(0, 20); changed(); });
    r.top.appendChild(inp);

    slider(sec, 'Screen edge margin', function () { return state.safe; }, function (v) { state.safe = v; }, 10);
    sec.appendChild(el('div', 'note', 'Increase if the edges of the picture are cut off on your TV.'));

    var act = el('div', 'actions'), surprise = el('button', 'primary', 'Surprise me'), reset = el('button', '', 'Reset theme');
    surprise.addEventListener('click', function () {
      var s = cur(), rnd = function (a, b) { return Math.round(a + Math.random() * (b - a)); };
      s.intensity = rnd(35, 95); s.speed = rnd(25, 75);
      s.accent = t.swatches[rnd(0, t.swatches.length - 1)];
      t.knobs.forEach(function (k) {
        s[k.key] = k.type === 'range' ? rnd(10, (k.max || 100) - 10) : k.options[rnd(0, k.options.length - 1)].v;
      });
      afterEdit(); buildControls();
    });
    reset.addEventListener('click', function () {
      var keep = cur().sound;
      state.settings[state.theme] = A.themeDefaults(state.theme);
      cur().sound = keep;
      afterEdit(); buildControls();
    });
    act.appendChild(surprise); act.appendChild(reset);
    box.appendChild(act);

    var un = el('button', 'link', 'Disconnect from this TV');
    un.addEventListener('click', function () {
      code = null;
      store('aitv.remote.code', null);
      if (es) { es.close(); es = null; }
      clearTimeout(retryTimer);
      $('codeInput').value = '';
      showPair();
    });
    box.appendChild(un);
  }

  function applySkin() {
    var t = A.theme(state.theme), st = document.documentElement.style;
    st.setProperty('--accent', cur().accent);
    st.setProperty('--bg1', t.bg[1]);
    st.setProperty('--bg2', t.bg[0]);
  }
  function renderAll() {
    applySkin();
    renderPreviews();
    // Rebuilding mid-drag would steal the slider, so only rebuild when idle.
    var active = document.activeElement;
    if (controlsFor !== state.theme || !active || !$('controls').contains(active)) buildControls();
  }
  function showMain() {
    $('pairView').hidden = true;
    $('mainView').hidden = false;
    setStatus('', 'Connecting…');
    renderAll();
    centerCard(state.theme, false);
    connect();
  }

  // ------------------------------------------------------------------- boot
  buildCarousel();
  window.addEventListener('resize', function () { if (!$('mainView').hidden) renderPreviews(); });
  var m = /[?&]code=([A-Za-z0-9]{4})/.exec(location.search);
  var stored = store('aitv.remote.code');
  if (m) {
    showPair();
    $('codeInput').value = m[1].toUpperCase();
    tryPair(m[1]);
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  } else if (stored && CODE_RE.test(stored)) {
    code = stored;
    showMain();
  } else showPair();
})();
