// Theme catalogue + state helpers shared by the TV screen and the phone remote.
// Written as ES5 in a classic script: TV browsers ship old, never-updated engines.
(function (root) {
  'use strict';
  var A = (root.AITV = root.AITV || {});

  A.FONTS = {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    rounded: "ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', Verdana, sans-serif",
    mono: "'Courier New', Menlo, Consolas, monospace",
    display: "Copperplate, 'Palatino Linotype', Palatino, Georgia, serif"
  };
  A.FONT_CHOICES = [
    { v: 'theme', label: 'Theme' },
    { v: 'serif', label: 'Serif' },
    { v: 'sans', label: 'Sans' },
    { v: 'rounded', label: 'Rounded' },
    { v: 'mono', label: 'Mono' }
  ];

  // Tiles are generic coloured tiles with a letter, not real logos.
  A.APPS = [
    // `glyph` is the app's name set as text (never a logo image); `ink` tints it.
    { id: 'netflix', name: 'Netflix', glyph: 'N', big: true, ink: '#ff2a34', color: '#c8141c', url: 'https://www.netflix.com' },
    { id: 'disney', name: 'Disney+', glyph: 'Disney+', ink: '#ffffff', color: '#16307a', url: 'https://www.disneyplus.com' },
    { id: 'max', name: 'Max', glyph: 'max', ink: '#ffffff', color: '#5b2bd9', url: 'https://www.max.com' },
    { id: 'prime', name: 'Prime Video', glyph: 'prime video', two: true, ink: '#ffffff', color: '#1a98d5', url: 'https://www.primevideo.com' },
    { id: 'youtube', name: 'YouTube', glyph: '\u25B6', big: true, ink: '#ff3b30', color: '#d93025', url: 'https://www.youtube.com/tv' },
    { id: 'hulu', name: 'Hulu', glyph: 'hulu', ink: '#3ddc84', color: '#1aa35c', url: 'https://www.hulu.com' },
    { id: 'spotify', name: 'Spotify', glyph: '\u266B', big: true, ink: '#3ddc84', color: '#168d40', url: 'https://open.spotify.com' },
    { id: 'twitch', name: 'Twitch', glyph: 'twitch', ink: '#b78cff', color: '#7d3fe0', url: 'https://www.twitch.tv' }
  ];

  A.THEMES = [
    {
      id: 'christmas', name: 'Christmas', tagline: 'Snowfall, bows and string lights',
      greeting: 'Merry Christmas',
      bg: ['#0b2a1e', '#123d2b', '#1a0f0f'], accent: '#d4af37', text: '#fff8e7', font: 'serif',
      swatches: ['#d4af37', '#c8102e', '#2e9e5b', '#f2f2f2', '#7cc4ff', '#ff8fb1', '#ff9d2e', '#b98cff'],
      knobs: [
        { key: 'wind', label: 'Wind', type: 'range', def: 30 },
        { key: 'lights', label: 'String lights', type: 'choice', def: 'twinkle',
          options: [{ v: 'steady', label: 'Steady' }, { v: 'chase', label: 'Chase' }, { v: 'twinkle', label: 'Twinkle' }, { v: 'off', label: 'Off' }] },
        { key: 'ribbon', label: 'Ribbon', type: 'choice', def: 'red',
          options: [{ v: 'red', label: 'Red' }, { v: 'gold', label: 'Gold' }, { v: 'green', label: 'Green' }, { v: 'silver', label: 'Silver' }] }
      ]
    },
    {
      id: 'halloween', name: 'Halloween', tagline: 'Fog, bats and a harvest moon',
      greeting: 'Happy Haunting',
      bg: ['#0d0714', '#2a0f3a', '#3d1a08'], accent: '#ff7a18', text: '#f4e9d8', font: 'display',
      swatches: ['#ff7a18', '#9dff3c', '#b45cff', '#ff3b3b', '#ffd23c', '#3ce0c4', '#ff5fa2', '#e8e8e8'],
      knobs: [
        { key: 'fog', label: 'Fog', type: 'range', def: 50 },
        { key: 'bats', label: 'Bats', type: 'range', def: 40 },
        { key: 'mood', label: 'Mood', type: 'choice', def: 'cute',
          options: [{ v: 'cute', label: 'Pumpkins' }, { v: 'eerie', label: 'Eerie eyes' }] }
      ]
    },
    {
      id: 'neon', name: 'Neon Cyberpunk', tagline: 'Glowing grid and data rain',
      greeting: 'System online',
      bg: ['#05010f', '#12032b', '#001a2e'], accent: '#00f0ff', text: '#e6fbff', font: 'mono',
      swatches: ['#00f0ff', '#ff2bd6', '#9dff3c', '#ffb02e', '#7a5cff', '#ff4d4d', '#3cffb0', '#ffffff'],
      knobs: [
        { key: 'second', label: 'Second neon', type: 'choice', def: 'magenta',
          options: [{ v: 'magenta', label: 'Magenta' }, { v: 'lime', label: 'Lime' }, { v: 'amber', label: 'Amber' }, { v: 'violet', label: 'Violet' }] },
        { key: 'rain', label: 'Data rain', type: 'range', def: 50 },
        { key: 'glitch', label: 'Glitch', type: 'range', def: 25 }
      ]
    },
    {
      id: 'space', name: 'Space', tagline: 'Drifting stars and nebulae',
      greeting: 'Welcome aboard',
      bg: ['#02030a', '#0b1030', '#2a1048'], accent: '#7c9cff', text: '#eaf0ff', font: 'sans',
      swatches: ['#7c9cff', '#c08cff', '#5ce1e6', '#ff9d6c', '#ff7ac8', '#9dffb0', '#ffe27a', '#ffffff'],
      knobs: [
        { key: 'twinkle', label: 'Twinkle', type: 'range', def: 60 },
        { key: 'hue', label: 'Nebula colour', type: 'range', def: 72, max: 100 },
        { key: 'planet', label: 'Planet', type: 'choice', def: 'ringed',
          options: [{ v: 'ringed', label: 'Ringed' }, { v: 'moon', label: 'Moon' }, { v: 'none', label: 'None' }] }
      ]
    },
    {
      id: 'nature', name: 'Cozy Nature', tagline: 'Hills, fireflies and soft light',
      greeting: '',
      bg: ['#f2c98a', '#7fa37a', '#1f3b2f'], accent: '#e8a23b', text: '#fff9ec', font: 'rounded',
      swatches: ['#e8a23b', '#ffd86b', '#9be37a', '#ff8f6b', '#ffb3d1', '#8fd3ff', '#d9b38c', '#ffffff'],
      knobs: [
        { key: 'time', label: 'Time of day', type: 'choice', def: 'auto',
          options: [{ v: 'auto', label: 'Auto' }, { v: 'dawn', label: 'Dawn' }, { v: 'day', label: 'Day' }, { v: 'dusk', label: 'Dusk' }, { v: 'night', label: 'Night' }] },
        { key: 'drift', label: 'In the air', type: 'choice', def: 'fireflies',
          options: [{ v: 'fireflies', label: 'Fireflies' }, { v: 'leaves', label: 'Leaves' }, { v: 'petals', label: 'Petals' }] },
        { key: 'wind', label: 'Wind', type: 'range', def: 35 }
      ]
    }
  ];

  A.theme = function (id) {
    for (var i = 0; i < A.THEMES.length; i++) if (A.THEMES[i].id === id) return A.THEMES[i];
    return A.THEMES[0];
  };

  A.themeDefaults = function (id) {
    var t = A.theme(id);
    var s = { intensity: 60, speed: 50, accent: t.accent, decorations: true, font: 'theme', sound: false, photo: '' };
    for (var i = 0; i < t.knobs.length; i++) s[t.knobs[i].key] = t.knobs[i].def;
    return s;
  };

  // Seasonal default so the first thing on screen already fits the calendar.
  A.seasonalTheme = function (date) {
    var m = (date || new Date()).getMonth();
    if (m === 9) return 'halloween';
    if (m === 10 || m === 11) return 'christmas';
    return 'space';
  };

  A.defaultState = function () {
    var st = { theme: A.seasonalTheme(), settings: {}, apps: [], name: '', safe: 4, focus: 0 };
    for (var i = 0; i < A.THEMES.length; i++) st.settings[A.THEMES[i].id] = A.themeDefaults(A.THEMES[i].id);
    for (var j = 0; j < A.APPS.length; j++) st.apps.push(A.APPS[j].id);
    return st;
  };

  function num(v, def, min, max) {
    v = Number(v);
    if (!isFinite(v)) return def;
    return Math.max(min, Math.min(max, v));
  }
  function oneOf(v, options, def) {
    for (var i = 0; i < options.length; i++) if (options[i].v === v) return v;
    return def;
  }

  // State arrives over the network, so every field is validated before use.
  A.normalize = function (raw) {
    var d = A.defaultState();
    if (!raw || typeof raw !== 'object') return d;
    var out = { settings: {} };
    out.theme = A.theme(raw.theme).id === raw.theme ? raw.theme : d.theme;
    out.name = typeof raw.name === 'string' ? raw.name.slice(0, 20) : '';
    out.safe = num(raw.safe, d.safe, 0, 10);
    out.apps = [];
    if (Array.isArray(raw.apps)) {
      for (var a = 0; a < A.APPS.length; a++) if (raw.apps.indexOf(A.APPS[a].id) !== -1) out.apps.push(A.APPS[a].id);
    } else out.apps = d.apps;
    out.focus = Math.round(num(raw.focus, 0, 0, Math.max(0, out.apps.length - 1)));
    for (var i = 0; i < A.THEMES.length; i++) {
      var t = A.THEMES[i];
      var def = d.settings[t.id];
      var src = (raw.settings && raw.settings[t.id]) || {};
      var s = {
        intensity: num(src.intensity, def.intensity, 0, 100),
        speed: num(src.speed, def.speed, 0, 100),
        accent: /^#[0-9a-fA-F]{6}$/.test(src.accent) ? src.accent : def.accent,
        decorations: src.decorations === undefined ? true : !!src.decorations,
        font: oneOf(src.font, A.FONT_CHOICES, 'theme'),
        sound: !!src.sound,
        photo: typeof src.photo === 'string' && /^[a-z0-9]{1,16}$/.test(src.photo) ? src.photo : ''
      };
      for (var k = 0; k < t.knobs.length; k++) {
        var kb = t.knobs[k];
        s[kb.key] = kb.type === 'range' ? num(src[kb.key], kb.def, 0, kb.max || 100) : oneOf(src[kb.key], kb.options, kb.def);
      }
      out.settings[t.id] = s;
    }
    return out;
  };

  A.fontStack = function (themeId, choice) {
    return A.FONTS[choice === 'theme' || !A.FONTS[choice] ? A.theme(themeId).font : choice];
  };

  A.NEON_SECOND = { magenta: '#ff2bd6', lime: '#9dff3c', amber: '#ffb02e', violet: '#8a5cff' };
  A.RIBBONS = { red: '#c8102e', gold: '#d4af37', green: '#1f8a4c', silver: '#d9dde3' };
})(typeof window !== 'undefined' ? window : globalThis);
