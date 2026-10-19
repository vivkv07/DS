/* NOSTALGIA — tests/online_mock.cjs
 * A small local stand-in for the Supabase project, used by tests/online.cjs because the test machine
 * cannot reach *.supabase.co (egress policy). It speaks the same wire protocols the real supabase-js
 * client uses, so the game's real SDK code path runs unchanged:
 *   - PostgREST RPC:  POST /rest/v1/rpc/<fn>  (save_put, save_get, journey_put, journey_get, profile_set,
 *     profile_get) with the SAME rules as supabase/migrations/*_online.sql: code format, sha256(code) keys,
 *     sizes, the per-code rate limit (40 / minute), the nickname charset + blocklist and the newer-save guard.
 *   - Realtime (Phoenix channels, vsn 1.0.0 JSON) over a hand-written WebSocket server (RFC 6455, no deps):
 *     phx_join / phx_leave / heartbeat, presence track / untrack with presence_state + presence_diff,
 *     broadcast relay with {self: false}. Socket close = presence leave (a dropped player disappears).
 * No dependencies. start({key}) -> Promise<{url, port, close(), db, rooms, addFakes(topic, n), calls}>
 */
'use strict';
const http = require('http');
const crypto = require('crypto');

const CODE_RE = /^[A-Z]{3,8}-[A-Z]{3,8}-[A-Z]{3,8}-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{5}$/;
const NICK_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{1,10}[A-Za-z0-9]$/;
const BAD_RE = /(fuck|shit|bitch|sex|porn|nazi|dick|cunt|chutiya|madarc|behenc|bhosd|gaand|randi|lund|kutta|saala|haraami|lanja|dengu)/;

function start(opts) {
  opts = opts || {};
  const KEY = opts.key || 'test-publishable-key';
  const db = { saves: new Map(), journeys: new Map(), profiles: new Map(), rate: new Map() };
  const calls = [];
  const keyOf = (code) => {
    if (typeof code !== 'string') return null;
    const c = code.trim().toUpperCase();
    return CODE_RE.test(c) ? crypto.createHash('sha256').update(c, 'utf8').digest('hex') : null;
  };
  const allow = (k) => {
    const now = Date.now(), r = db.rate.get(k);
    if (!r || r.win < now - 60000) { db.rate.set(k, { win: now, n: 1 }); return true; }
    r.n++;
    return r.n <= 40;
  };
  const no = (reason, extra) => Object.assign({ ok: false, reason }, extra || {});
  const RPC = {
    save_put({ code, slot, data, version }) {
      const k = keyOf(code); if (!k) return no('bad_code'); if (!allow(k)) return no('rate');
      if (slot !== 0 && slot !== 1) return no('bad_slot');
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Number.isInteger(version) || version < 1 || version > 1000 || data.game !== 'nostalgia' || typeof data.t !== 'number') return no('bad_data');
      if (Buffer.byteLength(JSON.stringify(data)) > 524288) return no('too_big');
      const t = Math.round(data.t);
      if (t > Date.now() + 86400000) return no('bad_data');
      const id = k + ':' + slot, prev = db.saves.get(id);
      if (prev) {
        if (prev.version > version) return no('newer_build', { cloud_v: prev.version, cloud_t: prev.t });
        if (prev.t > t) return no('newer_save', { cloud_v: prev.version, cloud_t: prev.t });
      }
      db.saves.set(id, { slot, data, version, t });
      return { ok: true, cloud_t: t };
    },
    save_get({ code }) {
      const k = keyOf(code); if (!k) return no('bad_code'); if (!allow(k)) return no('rate');
      const saves = [0, 1].map((s) => db.saves.get(k + ':' + s)).filter(Boolean).map((r) => ({ slot: r.slot, version: r.version, t: r.t, data: r.data }));
      const p = db.profiles.get(k);
      return { ok: true, saves, nick: p ? p.nick : null };
    },
    journey_put({ code, data }) {
      const k = keyOf(code); if (!k) return no('bad_code'); if (!allow(k)) return no('rate');
      if (!data || typeof data !== 'object' || Array.isArray(data)) return no('bad_data');
      if (Buffer.byteLength(JSON.stringify(data)) > 32768) return no('too_big');
      db.journeys.set(k, { data, updated: Date.now() });
      return { ok: true };
    },
    journey_get({ code }) {
      const k = keyOf(code); if (!k) return no('bad_code'); if (!allow(k)) return no('rate');
      const j = db.journeys.get(k);
      return { ok: true, journey: j ? j.data : null, updated: j ? j.updated : null };
    },
    profile_set({ code, nick }) {
      const k = keyOf(code); if (!k) return no('bad_code'); if (!allow(k)) return no('rate');
      const n = String(nick == null ? '' : nick).replace(/\s+/g, ' ').trim();
      if (n.length < 3 || n.length > 12 || !NICK_RE.test(n)) return no('bad_nick');
      if (BAD_RE.test(n.replace(/[^A-Za-z]/g, '').toLowerCase())) return no('bad_nick');
      db.profiles.set(k, { nick: n });
      return { ok: true, nick: n };
    },
    profile_get({ code }) {
      const k = keyOf(code); if (!k) return no('bad_code'); if (!allow(k)) return no('rate');
      const p = db.profiles.get(k);
      return { ok: true, nick: p ? p.nick : null };
    },
  };

  /* ---------------------------------------------------------------- realtime state */
  const rooms = new Map(); // topic -> Map(memberId -> {sock, key, meta, ref, self})
  let refN = 1;
  const ref = () => String(refN++);
  function members(topic) { let m = rooms.get(topic); if (!m) { m = new Map(); rooms.set(topic, m); } return m; }
  function stateOf(topic) {
    const out = {};
    for (const m of members(topic).values()) if (m.meta) out[m.key] = { metas: [Object.assign({ phx_ref: m.pref }, m.meta)] };
    return out;
  }
  function sendTo(sock, msg) { if (sock && !sock.dead) sock.sendText(JSON.stringify(msg)); }
  function diff(topic, joins, leaves) {
    for (const m of members(topic).values()) sendTo(m.sock, { topic, event: 'presence_diff', payload: { joins, leaves }, ref: null });
  }
  function leave(topic, id) {
    const M = members(topic), m = M.get(id);
    if (!m) return;
    M.delete(id);
    if (m.meta) diff(topic, {}, { [m.key]: { metas: [Object.assign({ phx_ref: m.pref }, m.meta)] } });
    if (!M.size) rooms.delete(topic);
  }
  let sockN = 1;
  function onMessage(sock, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const { topic, event, payload, ref: r } = msg;
    const reply = (status, response) => sendTo(sock, { topic, event: 'phx_reply', payload: { status, response: response || {} }, ref: r, join_ref: msg.join_ref });
    if (topic === 'phoenix' && event === 'heartbeat') return reply('ok');
    const id = sock.id + '|' + topic;
    if (event === 'phx_join') {
      const conf = (payload && payload.config) || {};
      const key = (conf.presence && conf.presence.key) || ('anon' + sock.id);
      members(topic).set(id, { sock, key, meta: null, pref: null, self: !!(conf.broadcast && conf.broadcast.self) });
      sock.topics.add(topic);
      reply('ok', { postgres_changes: [] });
      sendTo(sock, { topic, event: 'presence_state', payload: stateOf(topic), ref: null });
      return;
    }
    const m = members(topic).get(id);
    if (event === 'phx_leave') { leave(topic, id); sock.topics.delete(topic); return reply('ok'); }
    if (event === 'access_token') return;
    if (!m) return reply('error', { reason: 'unmatched topic' });
    if (event === 'presence' && payload) {
      if (payload.event === 'track') {
        const old = m.meta ? { [m.key]: { metas: [Object.assign({ phx_ref: m.pref }, m.meta)] } } : {};
        m.meta = payload.payload || {}; m.pref = ref();
        diff(topic, { [m.key]: { metas: [Object.assign({ phx_ref: m.pref }, m.meta)] } }, old);
      } else if (payload.event === 'untrack' && m.meta) {
        const old = { [m.key]: { metas: [Object.assign({ phx_ref: m.pref }, m.meta)] } };
        m.meta = null;
        diff(topic, {}, old);
      }
      return reply('ok');
    }
    if (event === 'broadcast' && payload) {
      for (const [oid, o] of members(topic)) if (oid !== id || o.self) sendTo(o.sock, { topic, event: 'broadcast', payload, ref: null });
      calls.push({ t: Date.now(), kind: 'broadcast', topic, event: payload.event });
      return reply('ok');
    }
    reply('ok');
  }

  /* ---------------------------------------------------------------- tiny websocket server */
  function wsAccept(req, socket) {
    const k = req.headers['sec-websocket-key'];
    const acc = crypto.createHash('sha1').update(k + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
    socket.setNoDelay(true);
    const sock = { id: sockN++, socket, dead: false, topics: new Set(), buf: Buffer.alloc(0), frags: [] };
    sock.sendText = (s) => {
      const b = Buffer.from(s, 'utf8'), n = b.length;
      let h;
      if (n < 126) { h = Buffer.alloc(2); h[1] = n; } else if (n < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
      h[0] = 0x81;
      try { socket.write(Buffer.concat([h, b])); } catch (e) { /* closed */ }
    };
    const kill = () => {
      if (sock.dead) return;
      sock.dead = true;
      for (const t of Array.from(sock.topics)) leave(t, sock.id + '|' + t);
      try { socket.destroy(); } catch (e) { /* ignore */ }
    };
    sock.kill = kill;
    socket.on('data', (d) => {
      sock.buf = Buffer.concat([sock.buf, d]);
      for (;;) {
        const B = sock.buf;
        if (B.length < 2) return;
        const fin = (B[0] & 0x80) !== 0, op = B[0] & 0x0f, masked = (B[1] & 0x80) !== 0;
        let len = B[1] & 0x7f, off = 2;
        if (len === 126) { if (B.length < 4) return; len = B.readUInt16BE(2); off = 4; } else if (len === 127) { if (B.length < 10) return; len = Number(B.readBigUInt64BE(2)); off = 10; }
        const mo = off; if (masked) off += 4;
        if (B.length < off + len) return;
        let p = B.slice(off, off + len);
        if (masked) { const mk = B.slice(mo, mo + 4); p = Buffer.from(p); for (let i = 0; i < p.length; i++) p[i] ^= mk[i & 3]; }
        sock.buf = B.slice(off + len);
        if (op === 8) { try { socket.write(Buffer.from([0x88, 0])); } catch (e) { /* ignore */ } kill(); return; }
        if (op === 9) { const h = Buffer.from([0x8a, p.length]); try { socket.write(Buffer.concat([h, p])); } catch (e) { /* ignore */ } continue; }
        if (op === 10) continue;
        if (op === 0 || op === 1) {
          sock.frags.push(p);
          if (fin) { const s = Buffer.concat(sock.frags).toString('utf8'); sock.frags = []; try { onMessage(sock, s); } catch (e) { console.error('mock ws', e); } }
        }
      }
    });
    socket.on('close', kill);
    socket.on('error', kill);
    allSocks.add(sock);
  }
  const allSocks = new Set();

  /* ---------------------------------------------------------------- http */
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
      req.on('end', () => {
        if (req.headers.apikey !== KEY) { res.writeHead(401, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify({ message: 'Invalid API key' })); return; }
        const fn = RPC[m[1]];
        if (!fn) { res.writeHead(404, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify({ code: 'PGRST202', message: 'not found' })); return; }
        let args = {};
        try { args = JSON.parse(body || '{}'); } catch (e) { args = {}; }
        const out = fn(args);
        calls.push({ t: Date.now(), kind: 'rpc', fn: m[1], ok: out.ok, reason: out.reason || null });
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
        res.end(JSON.stringify(out));
      });
      return;
    }
    res.writeHead(404, cors); res.end('not found');
  });
  server.on('upgrade', (req, socket) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/realtime/v1/websocket' || u.searchParams.get('apikey') !== KEY) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wsAccept(req, socket);
  });
  return new Promise((resolve) => {
    server.listen(opts.port || 0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: 'http://127.0.0.1:' + port, port, db, rooms, calls, key: KEY,
        /** n fake members tracked in `topic` (for the room-cap test) */
        addFakes(topic, n) {
          const fakes = [];
          for (let i = 0; i < n; i++) {
            const sock = { id: 'fake' + (sockN++), dead: false, topics: new Set([topic]), sendText() {} };
            const id = sock.id + '|' + topic, key = 'fake' + i + '_' + sock.id;
            const mem = { sock, key, meta: { n: 'Bot' + (i + 1), l: { kind: 'kid', shirt: '#888888' }, j: Date.now() - 100000 + i }, pref: ref(), self: false };
            members(topic).set(id, mem);
            diff(topic, { [key]: { metas: [Object.assign({ phx_ref: mem.pref }, mem.meta)] } }, {});
            fakes.push(id);
          }
          return () => { for (const id of fakes) leave(topic, id); };
        },
        close() { for (const s of allSocks) { try { s.kill(); } catch (e) { /* ignore */ } } return new Promise((r) => server.close(() => r())); },
      });
    });
  });
}
module.exports = { start };
