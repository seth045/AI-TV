// Animated theme backgrounds drawn with plain 2D canvas primitives (no images).
// Used full-screen on the TV and as small live previews on the phone.
// Perf rules for weak TV chips: static scenery is painted once into an offscreen
// canvas, glows are pre-rendered sprites, and there is no shadowBlur or per-frame gradient.
(function (root) {
  'use strict';
  var A = (root.AITV = root.AITV || {});
  var TAU = Math.PI * 2;

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) {
    if (typeof c === 'string') c = rgb(c);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    }
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }

  var glowCache = {}, glowCount = 0;
  function glow(c) {
    if (typeof c === 'string') c = rgb(c);
    var key = c.join(',');
    if (glowCache[key]) return glowCache[key];
    if (++glowCount > 150) { glowCache = {}; glowCount = 1; } // bounded: colours come from user input
    var cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    var g = cv.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(c, 1));
    gr.addColorStop(0.25, rgba(c, 0.55));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return (glowCache[key] = cv);
  }
  function blob(g, c, x, y, r, a) {
    g.globalAlpha = a;
    g.drawImage(glow(c), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }
  function vgrad(g, w, h, stops) {
    var gr = g.createLinearGradient(0, 0, 0, h);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(i / (stops.length - 1), stops[i]);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  function hill(g, w, h, y0, amp, r, fill) {
    var n = 4, x = 0, step = w / n;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, y0);
    for (var i = 0; i < n; i++) {
      g.quadraticCurveTo(x + step / 2, y0 + (r() - 0.5) * amp * 2, x + step, y0 + (r() - 0.5) * amp * 0.5);
      x += step;
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }
  function tri(g, x, y, half, hgt) {
    g.beginPath();
    g.moveTo(x, y - hgt);
    g.lineTo(x + half, y);
    g.lineTo(x - half, y);
    g.closePath();
    g.fill();
  }
  function pine(g, x, base, hgt, col, snow) {
    g.fillStyle = '#2a1a10';
    g.fillRect(x - hgt * 0.03, base - hgt * 0.12, hgt * 0.06, hgt * 0.14);
    for (var i = 0; i < 3; i++) {
      var y = base - hgt * 0.1 - i * hgt * 0.26, half = hgt * (0.3 - i * 0.07), th = hgt * 0.42;
      g.fillStyle = col;
      tri(g, x, y, half, th);
      if (snow) {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        tri(g, x, y - th * 0.62, half * 0.38, th * 0.38);
      }
    }
  }
  function ellipse(g, x, y, rx, ry) {
    g.save();
    g.translate(x, y);
    g.scale(rx, ry);
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    g.restore();
  }
  function areaScale(w) { return 0.3 + 0.7 * Math.min(1, w / 1280); }

  var IMPL = {};

  // ---------------------------------------------------------------- Christmas
  IMPL.christmas = {
    build: function (sc, g, w, h, s) {
      var u = h / 720, r = rng(11), i;
      vgrad(g, w, h, ['#0b2a1e', '#123d2b', '#1a0f0f']);
      var cols = [s.accent, '#c8102e', '#ffffff'];
      for (i = 0; i < 16; i++) blob(g, cols[i % 3], r() * w, r() * h * 0.7, (40 + r() * 110) * u, 0.05 + r() * 0.09);
      hill(g, w, h, h * 0.8, 26 * u, r, '#aebfca');
      for (i = 0; i < 9; i++) pine(g, w * (0.04 + i * 0.118 + r() * 0.03), h * (0.8 + r() * 0.02), (60 + r() * 50) * u, '#0c2a1c', true);
      hill(g, w, h, h * 0.88, 22 * u, r, '#e9f1f6');
      var lights = [], hx = w * 0.9, hb = h * 0.93, hh = 250 * u;
      pine(g, w * 0.07, h * 0.95, 190 * u, '#0f3a26', true);
      pine(g, hx, hb, hh, '#11402a', true);
      var lc = ['#ff4d4d', '#ffd23c', '#4dc3ff', '#6dff8a', '#ff8fd6'];
      for (i = 0; i < 16; i++) {
        var f = r(), ly = hb - hh * (0.12 + f * 0.72);
        lights.push({ x: hx + (r() - 0.5) * hh * 0.5 * (1 - f * 0.9), y: ly, c: lc[i % lc.length], p: r() * TAU });
      }
      sc.extra.lights = lights;
      sc.extra.star = { x: hx, y: hb - hh * 0.98 };
    },
    count: function (s, w) { return (30 + s.intensity * 1.7) * areaScale(w); },
    spawn: function (sc, w, h, s, init) {
      var u = h / 720, d = Math.random();
      var r = (1 + d * d * 3.6) * u;
      return { x: Math.random() * w, y: init ? Math.random() * h : -8 * u, r: r, vy: (26 + r / u * 20) * u, p: Math.random() * TAU };
    },
    part: function (sc, g, p, dt, t, w, h, s) {
      var u = h / 720;
      p.y += p.vy * dt;
      p.x += ((s.wind / 100) * 150 * u * (0.4 + p.r / (4 * u)) + Math.sin(t * 1.1 + p.p) * 14 * u) * dt;
      if (p.x > w + 10) p.x -= w + 20;
      if (p.y > h + 8) { p.y = -8 * u; p.x = Math.random() * w; }
      if (p.r > 2 * u) {
        g.globalAlpha = 0.85;
        g.drawImage(glow('#ffffff'), p.x - p.r * 1.8, p.y - p.r * 1.8, p.r * 3.6, p.r * 3.6);
      } else {
        g.globalAlpha = 0.7;
        g.fillStyle = '#fff';
        g.fillRect(p.x, p.y, p.r * 1.4, p.r * 1.4);
      }
    },
    under: function (sc, g, t, dt, w, h, s) {
      var u = h / 720, L = sc.extra.lights || [], i;
      for (i = 0; i < L.length; i++) blob(g, L[i].c, L[i].x, L[i].y, 9 * u, 0.45 + 0.5 * Math.sin(t * 1.6 + L[i].p));
      var st = sc.extra.star;
      if (st) blob(g, s.accent, st.x, st.y, (22 + 4 * Math.sin(t * 2)) * u, 0.95);
    }
  };

  // ---------------------------------------------------------------- Halloween
  function pumpkin(g, x, y, r) {
    g.fillStyle = '#d2601a';
    ellipse(g, x, y, r * 1.15, r); g.fill();
    g.strokeStyle = 'rgba(90,30,0,0.55)';
    g.lineWidth = Math.max(1, r * 0.06);
    ellipse(g, x, y, r * 0.6, r); g.stroke();
    ellipse(g, x, y, r * 0.2, r); g.stroke();
    g.fillStyle = '#2f4a1a';
    g.fillRect(x - r * 0.08, y - r * 1.25, r * 0.16, r * 0.32);
    g.fillStyle = '#ffd86b';
    tri(g, x - r * 0.42, y - r * 0.1, r * 0.2, r * 0.3);
    tri(g, x + r * 0.42, y - r * 0.1, r * 0.2, r * 0.3);
    g.beginPath();
    g.moveTo(x - r * 0.6, y + r * 0.25);
    g.quadraticCurveTo(x, y + r * 0.85, x + r * 0.6, y + r * 0.25);
    g.quadraticCurveTo(x, y + r * 0.5, x - r * 0.6, y + r * 0.25);
    g.fill();
  }
  function branch(g, x, y, len, ang, depth, r) {
    var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.lineWidth = Math.max(1, depth * depth * len * 0.012);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth <= 1) return;
    branch(g, x2, y2, len * 0.68, ang - 0.35 - r() * 0.4, depth - 1, r);
    branch(g, x2, y2, len * 0.62, ang + 0.3 + r() * 0.45, depth - 1, r);
  }
  IMPL.halloween = {
    kind: function (s) { return 'halloween'; },
    build: function (sc, g, w, h, s) {
      var u = h / 720, r = rng(31), i;
      vgrad(g, w, h, ['#0d0714', '#2a0f3a', '#3d1a08']);
      var mx = w * 0.74, my = h * 0.27, mr = h * 0.14;
      blob(g, '#f6e7b0', mx, my, mr * 2.6, 0.3);
      g.fillStyle = '#f3e3a6';
      g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(150,120,60,0.22)';
      for (i = 0; i < 6; i++) { g.beginPath(); g.arc(mx + (r() - 0.5) * mr * 1.3, my + (r() - 0.5) * mr * 1.3, mr * (0.08 + r() * 0.14), 0, TAU); g.fill(); }
      hill(g, w, h, h * 0.84, 30 * u, r, '#07040b');
      g.strokeStyle = '#07040b';
      g.lineCap = 'round';
      branch(g, w * 0.1, h * 0.9, 120 * u, -Math.PI / 2 + 0.08, 6, r);
      g.lineWidth = 5 * u;
      for (i = 0; i < 22; i++) {
        var fx = w * (0.26 + i * 0.022), fy = h * 0.855 + Math.sin(i * 0.7) * 6 * u, lean = (r() - 0.5) * 10 * u;
        g.beginPath(); g.moveTo(fx, fy + 20 * u); g.lineTo(fx + lean, fy - (26 + r() * 14) * u); g.stroke();
      }
      g.lineWidth = 3 * u;
      g.beginPath(); g.moveTo(w * 0.25, h * 0.84); g.lineTo(w * 0.73, h * 0.85); g.stroke();
      if (s.mood === 'cute') {
        pumpkin(g, w * 0.86, h * 0.9, 34 * u);
        pumpkin(g, w * 0.92, h * 0.93, 22 * u);
        pumpkin(g, w * 0.2, h * 0.93, 26 * u);
      }
      sc.extra.eyes = [];
      for (i = 0; i < 5; i++) sc.extra.eyes.push({ x: w * (0.06 + r() * 0.88), y: h * (0.88 + r() * 0.09), p: r() * 20, z: 0.7 + r() * 0.6 });
    },
    count: function (s, w) { return (8 + s.intensity * 0.6) * areaScale(w); },
    spawn: function (sc, w, h, s, init) {
      var u = h / 720;
      return { x: Math.random() * w, y: init ? h * (0.4 + Math.random() * 0.6) : h + 5, r: (1.5 + Math.random() * 2.5) * u, vy: (18 + Math.random() * 40) * u, p: Math.random() * TAU, life: init ? Math.random() : 1 };
    },
    part: function (sc, g, p, dt, t, w, h, s) {
      p.y -= p.vy * dt;
      p.x += Math.sin(t * 1.3 + p.p) * 18 * (h / 720) * dt;
      p.life -= dt * 0.09;
      if (p.life <= 0 || p.y < h * 0.3) { p.y = h + 5; p.x = Math.random() * w; p.life = 1; }
      g.globalAlpha = Math.max(0, p.life) * 0.9;
      g.drawImage(glow(s.accent), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
    },
    under: function (sc, g, t, dt, w, h, s) {
      var u = h / 720, e = sc.extra, i, b;
      // bats
      var want = Math.round(s.bats / 100 * 7);
      e.bats = e.bats || [];
      while (e.bats.length < want) e.bats.push({ x: -Math.random() * w, y: h * (0.08 + Math.random() * 0.45), v: (60 + Math.random() * 90) * u, z: (10 + Math.random() * 14) * u, p: Math.random() * TAU });
      e.bats.length = want;
      g.fillStyle = '#050208';
      for (i = 0; i < e.bats.length; i++) {
        b = e.bats[i];
        b.x += b.v * dt;
        if (b.x > w + 60 * u) { b.x = -60 * u; b.y = h * (0.08 + Math.random() * 0.45); }
        var by = b.y + Math.sin(t * 1.7 + b.p) * 18 * u, f = Math.sin(t * 11 + b.p) * b.z * 0.7, z = b.z;
        g.beginPath();
        g.moveTo(b.x, by - z * 0.25);
        g.quadraticCurveTo(b.x + z * 0.9, by - z * 0.9 - f, b.x + z * 2, by - f);
        g.quadraticCurveTo(b.x + z * 1.4, by + z * 0.1 - f * 0.4, b.x + z * 1.0, by + z * 0.45);
        g.quadraticCurveTo(b.x + z * 0.5, by + z * 0.05, b.x, by + z * 0.5);
        g.quadraticCurveTo(b.x - z * 0.5, by + z * 0.05, b.x - z * 1.0, by + z * 0.45);
        g.quadraticCurveTo(b.x - z * 1.4, by + z * 0.1 - f * 0.4, b.x - z * 2, by - f);
        g.quadraticCurveTo(b.x - z * 0.9, by - z * 0.9 - f, b.x, by - z * 0.25);
        g.fill();
      }
      // eyes
      if (s.mood === 'eerie') {
        for (i = 0; i < e.eyes.length; i++) {
          var ey = e.eyes[i], show = Math.sin(t * 0.35 + ey.p), blink = Math.sin(t * 0.9 + ey.p * 3) > 0.96 ? 0.15 : 1;
          if (show < 0.1) continue;
          var a = Math.min(1, (show - 0.1) * 3), ez = 5 * u * ey.z;
          blob(g, s.accent, ey.x, ey.y, ez * 3.2, a * 0.5);
          blob(g, s.accent, ey.x + ez * 3.4, ey.y, ez * 3.2, a * 0.5);
          g.globalAlpha = a;
          g.fillStyle = '#fff3c4';
          ellipse(g, ey.x, ey.y, ez, ez * 0.55 * blink); g.fill();
          ellipse(g, ey.x + ez * 3.4, ey.y, ez, ez * 0.55 * blink); g.fill();
          g.globalAlpha = 1;
        }
      }
    },
    over: function (sc, g, t, dt, w, h, s) {
      var e = sc.extra, want = Math.round(2 + s.fog / 100 * 10), i, f;
      if (s.fog < 3) want = 0;
      e.fog = e.fog || [];
      while (e.fog.length < want) e.fog.push({ x: Math.random() * w, y: h * (0.55 + Math.random() * 0.45), r: h * (0.25 + Math.random() * 0.3), v: (6 + Math.random() * 16) * (h / 720) * (Math.random() < 0.5 ? -1 : 1) });
      e.fog.length = want;
      for (i = 0; i < e.fog.length; i++) {
        f = e.fog[i];
        f.x += f.v * dt;
        if (f.x > w + f.r) f.x = -f.r;
        if (f.x < -f.r) f.x = w + f.r;
        blob(g, '#b9a6d9', f.x, f.y, f.r, 0.05 + s.fog / 100 * 0.1);
      }
    }
  };

  // --------------------------------------------------------------------- Neon
  IMPL.neon = {
    build: function (sc, g, w, h, s) {
      var u = h / 720, r = rng(53), i, j, hz = h * 0.6, c2 = A.NEON_SECOND[s.second] || '#ff2bd6';
      vgrad(g, w, h, ['#05010f', '#12032b', '#1c0a3a']);
      for (i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.5) + ')'; g.fillRect(r() * w, r() * hz * 0.8, u * 1.5, u * 1.5); }
      // striped sun
      var sx = w * 0.5, sr = h * 0.25;
      blob(g, c2, sx, hz, sr * 2.1, 0.35);
      g.save();
      g.beginPath(); g.rect(0, 0, w, hz); g.clip();
      var gr = g.createLinearGradient(0, hz - sr, 0, hz);
      gr.addColorStop(0, '#ffd86b'); gr.addColorStop(1, c2);
      g.fillStyle = gr;
      g.beginPath(); g.arc(sx, hz, sr, 0, TAU); g.fill();
      g.fillStyle = '#160630';
      for (i = 0; i < 6; i++) g.fillRect(sx - sr, hz - sr * (0.08 + i * 0.13), sr * 2, sr * (0.065 - i * 0.008));
      g.restore();
      // skyline
      var wins = [], x = 0;
      while (x < w) {
        var bw = (30 + r() * 60) * u, mid = 1 - Math.min(1, Math.abs(x + bw / 2 - sx) / (w * 0.5));
        var bh = (40 + r() * 170) * u * (1 - mid * 0.75);
        g.fillStyle = '#070314';
        g.fillRect(x, hz - bh, bw + 1, bh);
        for (i = 6 * u; i < bw - 8 * u; i += 11 * u) for (j = 8 * u; j < bh - 8 * u; j += 14 * u) {
          var wn = { x: x + i, y: hz - bh + j, on: r() < 0.3, c: r() < 0.5 ? s.accent : c2 };
          wins.push(wn);
          if (wn.on) { g.fillStyle = rgba(wn.c, 0.75); g.fillRect(wn.x, wn.y, 5 * u, 7 * u); }
        }
        x += bw;
      }
      sc.extra.wins = wins;
      g.fillStyle = '#030109';
      g.fillRect(0, hz, w, h - hz);
    },
    count: function (s, w) { return s.rain / 100 * (8 + s.intensity * 0.8) * areaScale(w); },
    spawn: function (sc, w, h, s, init) {
      var u = h / 720;
      return { x: Math.random() * w, y: init ? Math.random() * h * 0.6 : -60 * u, len: (20 + Math.random() * 70) * u, v: (160 + Math.random() * 260) * u };
    },
    part: function (sc, g, p, dt, t, w, h, s) {
      p.y += p.v * dt;
      if (p.y > h * 0.6) { p.y = -p.len; p.x = Math.random() * w; }
      g.globalAlpha = 0.45;
      g.fillStyle = A.NEON_SECOND[s.second] || '#ff2bd6';
      g.fillRect(p.x, p.y, Math.max(1, h / 720 * 1.5), Math.min(p.len, h * 0.6 - p.y));
    },
    under: function (sc, g, t, dt, w, h, s) {
      var u = h / 720, hz = h * 0.6, cx = w / 2, i, e = sc.extra;
      // flicker one window now and then, painted straight onto the static layer
      if (e.wins && e.wins.length && Math.random() < dt * 4) {
        var wn = e.wins[(Math.random() * e.wins.length) | 0], bg = sc.bg.getContext('2d');
        wn.on = !wn.on;
        bg.fillStyle = '#070314';
        bg.fillRect(wn.x - 1, wn.y - 1, 5 * u + 2, 7 * u + 2);
        if (wn.on) { bg.fillStyle = rgba(wn.c, 0.75); bg.fillRect(wn.x, wn.y, 5 * u, 7 * u); }
      }
      g.strokeStyle = rgba(s.accent, 0.25 + s.intensity / 100 * 0.5);
      g.lineWidth = Math.max(1, 1.6 * u);
      g.beginPath();
      for (i = -16; i <= 16; i++) { g.moveTo(cx + i * w * 0.022, hz); g.lineTo(cx + i * w * 0.2, h); }
      var n = 11, off = (t * 0.3) % 1;
      for (i = 0; i < n; i++) { var f = (i + off) / n, y = hz + (h - hz) * f * f; g.moveTo(0, y); g.lineTo(w, y); }
      g.stroke();
      g.fillStyle = A.NEON_SECOND[s.second] || '#ff2bd6';
      g.fillRect(0, hz - u, w, Math.max(1, 2.5 * u));
    },
    over: function (sc, g, t, dt, w, h, s) {
      var e = sc.extra, i;
      e.gl = (e.gl || 0) - dt;
      if (e.gl <= 0 && Math.random() < dt * s.glitch / 100 * 1.4) e.gl = 0.14;
      if (e.gl > 0) {
        for (i = 0; i < 3; i++) {
          var y = (Math.random() * h) | 0, hh = Math.max(2, (Math.random() * h * 0.06) | 0), dx = ((Math.random() - 0.5) * w * 0.05) | 0;
          try { g.drawImage(sc.canvas, 0, y, w, hh, dx, y, w, hh); } catch (err) { /* self-copy unsupported */ }
        }
      }
    }
  };

  // -------------------------------------------------------------------- Space
  function makePlanet(size, s) {
    var cv = document.createElement('canvas');
    cv.width = size * 3; cv.height = size * 2;
    var g = cv.getContext('2d'), cx = size * 1.5, cy = size, r = size * 0.7, c = rgb(s.accent), i;
    function ring(front) {
      g.save();
      g.translate(cx, cy); g.rotate(-0.35); g.scale(1, 0.26);
      g.lineWidth = r * 0.16;
      g.strokeStyle = rgba(c, 0.55);
      g.beginPath(); g.arc(0, 0, r * 1.75, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
      g.lineWidth = r * 0.05;
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.arc(0, 0, r * 1.5, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
      g.restore();
    }
    if (s.planet === 'ringed') ring(false);
    var gr = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
    if (s.planet === 'moon') { gr.addColorStop(0, '#f2f2f5'); gr.addColorStop(1, '#55586a'); }
    else { gr.addColorStop(0, rgba([Math.min(255, c[0] + 90), Math.min(255, c[1] + 90), Math.min(255, c[2] + 90)], 1)); gr.addColorStop(0.6, rgba(c, 1)); gr.addColorStop(1, rgba([c[0] >> 2, c[1] >> 2, c[2] >> 2], 1)); }
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    if (s.planet === 'moon') {
      var r2 = rng(7);
      g.fillStyle = 'rgba(40,40,60,0.25)';
      for (i = 0; i < 9; i++) { g.beginPath(); g.arc(cx + (r2() - 0.5) * r * 1.6, cy + (r2() - 0.5) * r * 1.6, r * (0.06 + r2() * 0.16), 0, TAU); g.fill(); }
    } else {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (i = 0; i < 4; i++) g.fillRect(cx - r, cy - r * 0.7 + i * r * 0.42, r * 2, r * 0.12);
    }
    g.restore();
    if (s.planet === 'ringed') ring(true);
    return cv;
  }
  IMPL.space = {
    build: function (sc, g, w, h, s) {
      var u = h / 720, r = rng(97), i;
      vgrad(g, w, h, ['#02030a', '#0b1030', '#2a1048']);
      var base = s.hue * 3.6, k = 0.5 + s.intensity / 200;
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < 9; i++) blob(g, hsl(base + (r() - 0.5) * 70, 0.8, 0.5), w * (0.1 + r() * 0.8), h * (0.15 + r() * 0.7), h * (0.3 + r() * 0.45), (0.1 + r() * 0.14) * k);
      g.globalCompositeOperation = 'source-over';
      for (i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.55) + ')'; var z = (0.6 + r() * 1.2) * u; g.fillRect(r() * w, r() * h, z, z); }
      sc.extra.planet = s.planet === 'none' ? null : makePlanet(Math.round((s.planet === 'moon' ? 110 : 150) * u), s);
    },
    count: function (s, w) { return (20 + s.intensity * 1.2) * areaScale(w); },
    spawn: function (sc, w, h, s, init) {
      var u = h / 720, l = 0.3 + Math.random();
      return { x: init ? Math.random() * w : w + 5, y: Math.random() * h, r: (0.8 + l * 1.8) * u, l: l, p: Math.random() * TAU, f: 0.6 + Math.random() * 2.2, tint: Math.random() < 0.3 };
    },
    part: function (sc, g, p, dt, t, w, h, s) {
      p.x -= p.l * 9 * (h / 720) * dt;
      if (p.x < -5) { p.x = w + 5; p.y = Math.random() * h; }
      g.globalAlpha = Math.max(0.05, 0.95 - (s.twinkle / 100) * 0.85 * (0.5 + 0.5 * Math.sin(t * p.f + p.p)));
      g.drawImage(glow(p.tint ? s.accent : '#ffffff'), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
    },
    under: function (sc, g, t, dt, w, h, s) {
      var u = h / 720, e = sc.extra, pl = e.planet, i;
      if (pl) g.drawImage(pl, w * (0.2 + 0.02 * Math.sin(t * 0.05)) - pl.width / 2, h * (0.5 + 0.02 * Math.cos(t * 0.04)) - pl.height / 2);
      e.next = e.next === undefined ? 3 : e.next - dt;
      if (e.next <= 0 && !e.shoot) {
        e.shoot = { x: w * (0.3 + Math.random() * 0.7), y: h * Math.random() * 0.4, life: 1 };
        e.next = 5 + Math.random() * 12 * (1.3 - s.intensity / 100);
      }
      if (e.shoot) {
        var sh = e.shoot;
        sh.x -= 900 * u * dt; sh.y += 380 * u * dt; sh.life -= dt * 1.1;
        g.lineCap = 'round';
        for (i = 0; i < 8; i++) {
          g.strokeStyle = 'rgba(255,255,255,' + (Math.max(0, sh.life) * (1 - i / 8) * 0.9) + ')';
          g.lineWidth = Math.max(1, (3 - i * 0.3) * u);
          g.beginPath();
          g.moveTo(sh.x + i * 22 * u, sh.y - i * 9.3 * u);
          g.lineTo(sh.x + (i + 1) * 22 * u, sh.y - (i + 1) * 9.3 * u);
          g.stroke();
        }
        if (sh.life <= 0) e.shoot = null;
      }
    }
  };

  // ------------------------------------------------------------------- Nature
  var SKY = {
    dawn: { sky: ['#f29b8a', '#f9d9a8', '#b9d8b0'], hills: ['#7fa88a', '#55836a', '#2f5a48'], sun: [0.2, 0.62, '#fff1c9'], blade: '#24483a' },
    day: { sky: ['#4faee8', '#a9dcf5', '#e4f4d0'], hills: ['#86c274', '#5aa25c', '#2f7a4a'], sun: [0.3, 0.2, '#fffbe0'], blade: '#256b3e' },
    dusk: { sky: ['#32265a', '#d86a58', '#f2c98a'], hills: ['#5d6f58', '#3b5444', '#1f3b2f'], sun: [0.7, 0.66, '#ffd9a0'], blade: '#15291f' },
    night: { sky: ['#050a1a', '#0f1f3d', '#1d3a4a'], hills: ['#1b3340', '#12262e', '#0a181c'], sun: [0.22, 0.2, '#e8eefc'], blade: '#060f12' }
  };
  function timeOfDay(s) {
    if (s.time !== 'auto') return s.time;
    var hr = new Date().getHours();
    return hr >= 5 && hr < 8 ? 'dawn' : hr >= 8 && hr < 17 ? 'day' : hr >= 17 && hr < 20 ? 'dusk' : 'night';
  }
  A.timeOfDay = timeOfDay;
  IMPL.nature = {
    kind: function (s) { return 'nature-' + s.drift; },
    build: function (sc, g, w, h, s) {
      var u = h / 720, r = rng(71), i, tod = timeOfDay(s), P = SKY[tod];
      sc.extra.tod = tod;
      vgrad(g, w, h, P.sky);
      if (tod === 'night') for (i = 0; i < 160; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.6) + ')'; g.fillRect(r() * w, r() * h * 0.6, 1.4 * u, 1.4 * u); }
      var sx = w * P.sun[0], sy = h * P.sun[1], sr = (tod === 'night' ? 34 : 48) * u;
      blob(g, P.sun[2], sx, sy, sr * 5, tod === 'night' ? 0.25 : 0.55);
      g.fillStyle = P.sun[2];
      g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
      if (tod === 'night') { g.fillStyle = P.sky[0]; g.beginPath(); g.arc(sx + sr * 0.45, sy - sr * 0.2, sr * 0.85, 0, TAU); g.fill(); }
      if (tod === 'day' || tod === 'dawn') {
        for (i = 0; i < 5; i++) {
          var cx = w * (0.1 + r() * 0.8), cy = h * (0.1 + r() * 0.25), cw = (90 + r() * 90) * u;
          g.save(); g.translate(cx, cy); g.scale(1, 0.35);
          blob(g, '#ffffff', 0, 0, cw, 0.75); blob(g, '#ffffff', cw * 0.7, 20 * u, cw * 0.7, 0.6); blob(g, '#ffffff', -cw * 0.6, 30 * u, cw * 0.6, 0.6);
          g.restore();
        }
      }
      hill(g, w, h, h * 0.68, 46 * u, r, P.hills[0]);
      hill(g, w, h, h * 0.78, 40 * u, r, P.hills[1]);
      for (i = 0; i < 7; i++) {
        var tx = w * (0.05 + i * 0.15 + r() * 0.05), ty = h * (0.8 + r() * 0.03), tr = (26 + r() * 22) * u;
        g.fillStyle = P.hills[2];
        g.fillRect(tx - tr * 0.1, ty - tr * 0.6, tr * 0.2, tr * 1.2);
        g.beginPath(); g.arc(tx, ty - tr * 1.2, tr, 0, TAU); g.fill();
        g.beginPath(); g.arc(tx - tr * 0.6, ty - tr * 0.8, tr * 0.7, 0, TAU); g.fill();
        g.beginPath(); g.arc(tx + tr * 0.6, ty - tr * 0.8, tr * 0.7, 0, TAU); g.fill();
      }
      hill(g, w, h, h * 0.9, 26 * u, r, P.hills[2]);
      var blades = [];
      for (i = 0; i < 80; i++) blades.push({ x: r() * w, hgt: (30 + r() * 55) * u, p: r() * TAU });
      sc.extra.blades = blades;
    },
    count: function (s, w) { return (6 + s.intensity * 0.5) * areaScale(w); },
    spawn: function (sc, w, h, s, init) {
      var u = h / 720;
      if (s.drift === 'fireflies') return { x: Math.random() * w, y: h * (0.35 + Math.random() * 0.6), a: Math.random() * TAU, v: (10 + Math.random() * 22) * u, p: Math.random() * TAU, r: (3 + Math.random() * 3) * u };
      return { x: Math.random() * w * 1.2 - w * 0.2, y: init ? Math.random() * h : -12 * u, vy: (30 + Math.random() * 40) * u, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 3, r: (s.drift === 'petals' ? 4 + Math.random() * 3 : 6 + Math.random() * 6) * u, p: Math.random() * TAU, c: (Math.random() * 3) | 0 };
    },
    part: function (sc, g, p, dt, t, w, h, s) {
      var u = h / 720;
      if (s.drift === 'fireflies') {
        p.a += (Math.random() - 0.5) * 2.4 * dt * 3;
        p.x += (Math.cos(p.a) * p.v + s.wind * 0.3 * u) * dt;
        p.y += Math.sin(p.a) * p.v * 0.6 * dt;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < h * 0.25) p.a = Math.abs(p.a % TAU) > Math.PI ? p.a + Math.PI : p.a;
        if (p.y < h * 0.2) p.y = h * 0.2; if (p.y > h) p.y = h;
        var a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.4 + p.p));
        g.globalAlpha = a;
        g.drawImage(glow(s.accent), p.x - p.r * 3, p.y - p.r * 3, p.r * 6, p.r * 6);
        g.globalAlpha = a * 0.9;
        g.fillStyle = '#fffbe0';
        g.fillRect(p.x - u, p.y - u, 2 * u, 2 * u);
        return;
      }
      p.y += p.vy * dt;
      p.x += ((20 + s.wind * 1.6) * u + Math.sin(t * 1.5 + p.p) * 30 * u) * dt;
      p.rot += p.vr * dt;
      if (p.y > h + 12 * u || p.x > w + 20 * u) { p.y = -12 * u; p.x = Math.random() * w * 1.2 - w * 0.2; }
      var cols = s.drift === 'petals' ? ['#ffc7dc', '#ffe3ee', '#ff9ec2'] : [s.accent, '#c8552b', '#e0b040'];
      g.globalAlpha = 0.9;
      g.fillStyle = cols[p.c];
      g.save();
      g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, 0.45 + 0.4 * Math.abs(Math.sin(t * 2 + p.p)));
      g.beginPath(); g.arc(0, 0, p.r, 0, TAU); g.fill();
      g.restore();
    },
    over: function (sc, g, t, dt, w, h, s) {
      var u = h / 720, B = sc.extra.blades || [], i, P = SKY[sc.extra.tod || 'dusk'];
      g.strokeStyle = P.blade;
      g.lineWidth = Math.max(1, 3 * u);
      g.lineCap = 'round';
      g.beginPath();
      for (i = 0; i < B.length; i++) {
        var b = B[i], sway = (Math.sin(t * 1.4 + b.p) * 0.5 + 0.5) * (6 + s.wind * 0.5) * u;
        g.moveTo(b.x, h + 2);
        g.quadraticCurveTo(b.x + sway * 0.3, h - b.hgt * 0.6, b.x + sway, h - b.hgt);
      }
      g.stroke();
    }
  };

  // -------------------------------------------------------------------- Scene
  function Scene(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.maxW = opts.maxW || 1280;
    this.bg = document.createElement('canvas');
    this.parts = [];
    this.extra = {};
    this.kind = '';
    this.t = 0;
    this.quality = 1;
    this.slow = 0;
    this.fast = 0;
    this.running = false;
    this.themeId = null;
    this.s = null;
    this.raf = 0;
    this.last = 0;
    var self = this;
    this.tick = function (now) {
      if (!self.running) return;
      self.raf = root.requestAnimationFrame(self.tick);
      var dt = Math.min(0.1, (now - self.last) / 1000);
      self.last = now;
      if (dt <= 0) return;
      // Drop particles when the device can't keep ~30fps.
      self.slow = dt > 0.04 ? self.slow + dt : Math.max(0, self.slow - dt * 2);
      if (self.slow > 2 && self.quality > 0.3) { self.quality *= 0.65; self.slow = 0; self.fast = 0; self.sync(); }
      // ...and bring them back once it has run smoothly for a while.
      self.fast = dt < 0.025 ? self.fast + dt : 0;
      if (self.fast > 20 && self.quality < 1) { self.quality = Math.min(1, self.quality * 1.25); self.fast = 0; self.sync(); }
      self.frame(dt);
    };
  }

  Scene.prototype.resize = function () {
    var c = this.canvas, cw = c.clientWidth || c.width, ch = c.clientHeight || c.height;
    if (!cw || !ch) return;
    var w = Math.round(Math.min(this.maxW, cw * Math.min(2, root.devicePixelRatio || 1)));
    var h = Math.round(w * ch / cw);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this.parts = []; if (this.s) this.build(); }
  };

  Scene.prototype.set = function (themeId, s) {
    var impl = IMPL[themeId] || IMPL.christmas;
    var kind = impl.kind ? impl.kind(s) : themeId;
    if (themeId !== this.themeId || kind !== this.kind) { this.parts = []; this.extra = {}; }
    this.themeId = themeId; this.kind = kind; this.impl = impl; this.s = s;
    this.build();
  };

  Scene.prototype.build = function () {
    var w = this.canvas.width, h = this.canvas.height, g = this.bg.getContext('2d');
    this.bg.width = w; this.bg.height = h;
    this.impl.build(this, g, w, h, this.s);
    this.sync();
  };

  Scene.prototype.sync = function () {
    var w = this.canvas.width, h = this.canvas.height;
    var n = Math.round(this.impl.count(this.s, w) * this.quality);
    while (this.parts.length < n) this.parts.push(this.impl.spawn(this, w, h, this.s, true));
    if (this.parts.length > n) this.parts.length = n;
  };

  Scene.prototype.frame = function (dt) {
    if (!this.s) return;
    var g = this.g, w = this.canvas.width, h = this.canvas.height, I = this.impl, s = this.s, i;
    dt *= 0.2 + s.speed / 100 * 1.8;
    this.t += dt;
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    if (I.under) I.under(this, g, this.t, dt, w, h, s);
    for (i = 0; i < this.parts.length; i++) I.part(this, g, this.parts[i], dt, this.t, w, h, s);
    g.globalAlpha = 1;
    if (I.over) I.over(this, g, this.t, dt, w, h, s);
    g.globalAlpha = 1;
  };

  Scene.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = root.performance && performance.now ? performance.now() : Date.now();
    this.raf = root.requestAnimationFrame(this.tick);
  };
  Scene.prototype.stop = function () {
    this.running = false;
    if (this.raf) root.cancelAnimationFrame(this.raf);
  };

  A.Scene = Scene;
})(window);
