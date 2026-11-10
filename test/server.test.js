'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
process.env.AITV_DATA = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'aitv-'));
const { server, rooms } = require('../server.js');

let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; r(); })));
test.after(() => { server.closeAllConnections(); server.close(); });

// Minimal SSE client: resolves with the first `count` events.
function sse(path, count) {
  let req;
  const done = new Promise((resolve, reject) => {
    req = http.get(base + path, (res) => {
      if (res.statusCode !== 200) return resolve({ status: res.statusCode, events: [] });
      const events = [];
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block), data = /^data: (.+)$/m.exec(block);
          if (ev && ev[1] !== 'ping') events.push({ event: ev[1], data: JSON.parse(data[1]) });
          if (events.length >= count) { req.destroy(); return resolve({ status: 200, events }); }
        }
      });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
  });
  return { done, close: () => req.destroy() };
}
const post = (path, body) => fetch(base + path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const tick = () => new Promise((r) => setTimeout(r, 50));

test('serves the remote, the TV screen and static assets', async () => {
  assert.match(await (await fetch(base + '/')).text(), /AI-TV Remote/);
  assert.match(await (await fetch(base + '/tv')).text(), /id="row"/);
  assert.strictEqual((await fetch(base + '/themes.js')).status, 200);
  assert.strictEqual((await fetch(base + '/nope.js')).status, 404);
});

test('blocks path traversal', async () => {
  const res = await new Promise((resolve) => http.get(base + '/..%2f..%2fserver.js', resolve));
  assert.notStrictEqual(res.statusCode, 200);
  res.resume();
});

test('a remote cannot create or write to a room no TV opened', async () => {
  assert.deepStrictEqual(await (await fetch(base + '/api/room?room=ZZZZ')).json(), { exists: false, tvs: 0 });
  assert.strictEqual((await sse('/api/events?role=remote&room=ZZZZ', 1).done).status, 404);
  assert.strictEqual((await post('/api/state?room=ZZZZ', { theme: 'neon' })).status, 404);
  assert.strictEqual((await post('/api/state?room=bad!', {})).status, 400);
});

test('relays state from remote to TV and replays it to late joiners', async () => {
  const tv = sse('/api/events?role=tv&room=ABCD', 3); // hello, own presence, state
  await tick();
  assert.deepStrictEqual(await (await fetch(base + '/api/room?room=abcd')).json(), { exists: true, tvs: 1 });
  const res = await post('/api/state?room=ABCD', { theme: 'neon' });
  assert.strictEqual((await res.json()).tvs, 1);
  const got = (await tv.done).events;
  assert.strictEqual(got[0].event, 'hello');
  assert.strictEqual(got[0].data.state, null);
  assert.deepStrictEqual(got.find((e) => e.event === 'state').data.state, { theme: 'neon' });
  const late = await sse('/api/events?role=remote&room=ABCD', 1).done;
  assert.deepStrictEqual(late.events[0].data.state, { theme: 'neon' });
});

test('restore never overwrites existing state', async () => {
  const res = await post('/api/state?room=ABCD&restore=1', { theme: 'space' });
  assert.strictEqual((await res.json()).kept, true);
  assert.deepStrictEqual(rooms.get('ABCD').state, { theme: 'neon' });
});

test('rejects malformed and oversized bodies', async () => {
  assert.strictEqual((await post('/api/state?room=ABCD', '{nope')).status, 400);
  assert.strictEqual((await post('/api/state?room=ABCD', '[1]')).status, 400);
  const big = await post('/api/state?room=ABCD', { x: 'y'.repeat(9000) }).catch(() => ({ status: 413 }));
  assert.strictEqual(big.status, 413);
  assert.deepStrictEqual(rooms.get('ABCD').state, { theme: 'neon' });
});

test('remotes are told when the TV connects and disconnects', async () => {
  const remote = sse('/api/events?role=remote&room=ABCD', 3);
  await tick();
  const tv = sse('/api/events?role=tv&room=ABCD', 99);
  await tick();
  tv.close();
  const ev = (await remote.done).events;
  assert.deepStrictEqual(ev.map((e) => e.event), ['hello', 'presence', 'presence']);
  assert.deepStrictEqual([ev[1].data.tvs, ev[2].data.tvs], [1, 0]);
});

test('malformed URLs get a 400 instead of crashing the server', async () => {
  for (const p of ['/%E0%A4%A', '/a%00b']) {
    const res = await new Promise((resolve) => http.get(base + p, resolve));
    assert.strictEqual(res.statusCode, 400);
    res.resume();
  }
  assert.strictEqual((await fetch(base + '/api/health')).status, 200);
});

test('stores, serves and removes a background photo; rejects non-JPEGs', async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
  const up = (room, body) => fetch(base + '/api/wallpaper?theme=space&room=' + room, { method: 'POST', body });
  assert.strictEqual((await up('ZZZZ', jpeg)).status, 404);
  assert.strictEqual((await up('ABCD', Buffer.from('GIF89a....'))).status, 415);
  const ok = await (await up('ABCD', jpeg)).json();
  assert.match(ok.v, /^[a-z0-9]+$/);
  const got = await fetch(base + '/api/wallpaper?theme=space&room=ABCD');
  assert.strictEqual(got.headers.get('content-type'), 'image/jpeg');
  assert.strictEqual((await got.arrayBuffer()).byteLength, jpeg.length);
  assert.strictEqual((await fetch(base + '/api/wallpaper?theme=../x&room=ABCD')).status, 400);
  await fetch(base + '/api/wallpaper?theme=space&room=ABCD', { method: 'DELETE' });
  assert.strictEqual((await fetch(base + '/api/wallpaper?theme=space&room=ABCD')).status, 404);
});
