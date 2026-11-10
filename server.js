#!/usr/bin/env node
// AI-TV relay server: serves the TV screen (/tv) and the phone remote (/),
// and relays theme state from remote -> TV over Server-Sent Events.
// Zero dependencies on purpose: `node server.js` is the whole install.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOM_RE = /^[A-HJ-NP-Z2-9]{4}$/; // no 0/O/1/I: codes are read off a TV
const MAX_BODY = 8 * 1024;
const MAX_ROOMS = 2000;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // rooms nobody ever paired with
const HEARTBEAT_MS = 15000;
const MAX_CLIENTS_PER_ROOM = 16;
const MAX_BACKLOG = 256 * 1024; // drop SSE clients that stop reading
const RATE_WINDOW_MS = 10000;
const RATE_MAX = 300; // API requests per IP per window (a slider drag is ~25/s)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** room code -> { state, rev, clients:Set<{res, role}>, touched } */
const rooms = new Map();

function getRoom(code, create) {
  let room = rooms.get(code);
  if (!room && create) {
    if (rooms.size >= MAX_ROOMS) return null;
    room = { state: null, rev: 0, clients: new Set(), touched: Date.now() };
    rooms.set(code, room);
  }
  if (room) room.touched = Date.now();
  return room;
}

function tvCount(room) {
  let n = 0;
  room.clients.forEach((c) => { if (c.role === 'tv') n++; });
  return n;
}

function send(client, event, data) {
  if (client.res.writableLength > MAX_BACKLOG) return client.res.destroy();
  client.res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
}

function broadcast(room, event, data, except) {
  room.clients.forEach((c) => { if (c !== except) send(c, event, data); });
}

function broadcastPresence(room) {
  broadcast(room, 'presence', { tvs: tvCount(room) });
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': MIME['.json'],
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function handleEvents(req, res, url) {
  const code = (url.searchParams.get('room') || '').toUpperCase();
  const role = url.searchParams.get('role') === 'tv' ? 'tv' : 'remote';
  if (!ROOM_RE.test(code)) return json(res, 400, { error: 'bad room code' });
  // Only a TV may create a room; a remote typing a wrong code gets a clear 404.
  const room = getRoom(code, role === 'tv');
  if (!room) {
    return json(res, role === 'tv' ? 503 : 404, {
      error: role === 'tv' ? 'server full' : 'no TV with that code',
    });
  }

  if (room.clients.size >= MAX_CLIENTS_PER_ROOM) return json(res, 429, { error: 'too many connections' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');

  const client = { res, role };
  room.clients.add(client);
  send(client, 'hello', { state: room.state, rev: room.rev, tvs: tvCount(room) });
  if (role === 'tv') broadcastPresence(room);

  req.on('close', () => {
    room.clients.delete(client);
    room.touched = Date.now();
    if (role === 'tv') broadcastPresence(room);
  });
}

function handleState(req, res, url) {
  const code = (url.searchParams.get('room') || '').toUpperCase();
  if (!ROOM_RE.test(code)) return json(res, 400, { error: 'bad room code' });
  const room = getRoom(code, false);
  if (!room) return json(res, 404, { error: 'no TV with that code' });

  let size = 0;
  const chunks = [];
  let aborted = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      aborted = true;
      json(res, 413, { error: 'state too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    let state;
    try {
      state = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      return json(res, 400, { error: 'invalid JSON' });
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return json(res, 400, { error: 'state must be an object' });
    }
    // `restore` is the TV re-seeding its saved state after a server restart:
    // it must never clobber something a remote has already set.
    if (url.searchParams.get('restore') === '1' && room.state) {
      return json(res, 200, { ok: true, rev: room.rev, kept: true });
    }
    room.state = state;
    room.rev++;
    broadcast(room, 'state', { state: room.state, rev: room.rev });
    json(res, 200, { ok: true, rev: room.rev, tvs: tvCount(room) });
  });
}

function handleStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch (e) {
    rel = '\0';
  }
  if (rel.indexOf('\0') !== -1) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (rel === '/') rel = '/remote.html';
  else if (rel === '/tv') rel = '/tv.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

/** ip -> request count in the current window; cheap guard against code guessing and flooding */
let hits = new Map();
setInterval(() => { hits = new Map(); }, RATE_WINDOW_MS).unref();
function allow(ip) {
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  return n <= RATE_MAX;
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (url.pathname.startsWith('/api/') && !allow(req.socket.remoteAddress)) {
    return json(res, 429, { error: 'slow down' });
  }
  if (url.pathname === '/api/events' && req.method === 'GET') return handleEvents(req, res, url);
  if (url.pathname === '/api/state' && req.method === 'POST') return handleState(req, res, url);
  if (url.pathname === '/api/room' && req.method === 'GET') {
    const room = rooms.get((url.searchParams.get('room') || '').toUpperCase());
    return json(res, 200, { exists: !!room, tvs: room ? tvCount(room) : 0 });
  }
  if (url.pathname === '/api/info') {
    return json(res, 200, { urls: lanAddresses().map((a) => 'http://' + a + ':' + PORT) });
  }
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size });
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end('Method not allowed');
  }
  handleStatic(req, res, url);
});

// Heartbeat keeps proxies and TV browsers from dropping idle SSE streams.
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    room.clients.forEach((c) => send(c, 'ping', 1)); // a real event, so client watchdogs can see it
    const ttl = room.state ? ROOM_TTL_MS : EMPTY_ROOM_TTL_MS;
    if (room.clients.size === 0 && now - room.touched > ttl) rooms.delete(code);
  });
}, HEARTBEAT_MS).unref();

server.maxConnections = 4000;
server.requestTimeout = 15000; // slow-body POSTs
server.headersTimeout = 10000;

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((i) => {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    });
  });
  return out;
}

if (require.main === module) {
  server.listen(PORT, () => {
    const hosts = lanAddresses();
    const base = 'http://' + (hosts[0] || 'localhost') + ':' + PORT;
    console.log('AI-TV is running.');
    console.log('  On the TV, open:     ' + base + '/tv');
    console.log('  On your phone, open: ' + base + '/');
  });
}

module.exports = { server, rooms };
