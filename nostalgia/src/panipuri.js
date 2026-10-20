/* NOSTALGIA — panipuri.js  (owner: party games developer) — the PANI PURI EATING CONTEST
 *
 * Gokul Chat, Koti (and every pani-puri cart on the map): Bhaiya serves puris one by one into your leaf
 * dona, faster and faster, for 60 seconds. Tap to eat each one (or HOLD to eat in a steady rhythm).
 *   - A puri goes soggy if you leave it (its ring runs out) and breaks: a miss. The dona holds three; a
 *     fourth one pushes the oldest over the edge: a miss.
 *   - Every puri adds to the TEEKHA cough meter; tapping again while you are still chewing ("gobbling")
 *     adds a lot more. Meter full = "KHO! KHO!": a water break (no eating for 2 s while puris keep coming).
 *   - Rounds: MEETHA (sweet, cools you down), normal, TEEKHA (red, hot), JALDI-JALDI (Bhaiya serves at
 *     double speed; you have to gobble to keep up). params.variant 'meetha' | 'teekha' | 'jaldi' forces one.
 *   - Score = puris eaten. Friends eat beside you with their own tallies (solo: AI friends Immu, Ayesha,
 *     Pappu; party: the other players' live tallies as small plate stacks). Win = most puris.
 *   - Prize: "Pani Puri Champion" bragging + a tin token (N.tape.addToken('pp_champion')); every contest
 *     also feeds Chinnu (tummy).
 *
 * Contract: ARCHITECTURE §18 (minigame DEF), the party contract (src/party.js, BINDING):
 *   N.party.register('panipuri_contest', {name, icon, where: 'gokul_chat', kind: 'score', players, solo: true,
 *     describe(opts), start(ctx) -> {update?, end?(reason)}}); every player plays the same seeded game
 *   (ctx.seed) and calls ctx.report({score}); live tallies go over ctx.send('pp', {n, h, c}) / ctx.on('pp').
 *   Registered on load when N.party.register exists, else on 'boot' / a later check (party.js may still be a
 *   stub while this file loads).
 *
 * API  N.panipuri = {
 *   play(params) -> Promise<result>   open the contest (params: variant, friends [{nick, look, skill}], seed,
 *                                      secs (default 60), party ctx, place, autoplay ...; N.minigames params)
 *   start(placeId?, opts) -> bool      pay ₹5 through N.shops (Gokul Chat) and play (the world entry points)
 *   FRIENDS (the AI roster), TUNE, best (record), champion (bool), registerParty() (re-run the check)
 * }
 * Minigame id 'pp_contest' (aliases panipuri_contest, pani_puri_contest); result {score, eaten, misses,
 *   coughs, gobbles, rank, of, table: [{nick, n, me, ai}], variant, champion}.
 *
 * HOOKS (files this module does not own, all through their public APIs):
 *   - shops.js: N.shops.addRow('gokul_chat', {id: 'pp_contest', ...}) — the row in the Gokul Chat card (₹5),
 *     and the carts buy through N.shops.buy('gokul_chat', 'pp_contest', {force}) (so prices, money, 'shop:buy'
 *     stay in shops.js).
 *   - streetfood.js: N.interact 'pp:<cartId>' beside every pani-puri cart (N.streetfood.spots kind 'panipuri'),
 *     a little to one side of the cart so its own "Pani puri ₹5" stays reachable.
 *   - storycore.js: N.tape.addToken (the tin). audio.js: N.audio.ext.registerSfx (pp_crunch, pp_cough, pp_gulp,
 *     pp_jaldi).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600); } catch (e) { /* ignore */ } }
  function sfx(name, o) { try { return !!(N.audio && N.audio.sfx && N.audio.sfx(name, Object.assign({ ui: true }, o || {}))); } catch (e) { return false; } }

  /* ================================================================ tuning */
  const TUNE = {
    secs: 60, cap: 3, chew: 0.5, life: 2.5, lifeD: -0.5,
    gap0: 0.95, gap1: 0.6, gapD: -0.1, jaldi: 0.38, waterSecs: 2.1, waterReset: 32,
    heat: { normal: 5, teekha: 14, meetha: -10 }, gobble: 13, decay: 9, decayMeetha: 14, coughAt: 100,
    price: 500, tummyPer: 0.45, tummyMax: 35,
  };
  const STORE = 'nostalgia.panipuri.v1';
  const rec = (() => { try { const o = JSON.parse(lsGet(STORE) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
  function saveRec() { lsSet(STORE, JSON.stringify(rec)); }

  /* ================================================================ friends (AI roster) */
  // the colony kids (story_bible §2.3-2.4): looks match their sprites; skill = how close to the serve rate they keep up
  const FRIENDS = [
    { id: 'immu', nick: 'Immu', skill: 0.82, gobble: 0.25, look: { kind: 'kid', skin: '#c68b5e', hair: '#1a1412', shirt: '#2f8a5a', pants: '#2c3550', stripes: '#246e48', specs: true } },
    { id: 'ayesha', nick: 'Ayesha', skill: 0.88, gobble: 0.4, look: { kind: 'kid', girl: true, skin: '#a0683f', hair: '#1a1412', shirt: '#d24d57', pants: '#f4f0e8', cap: 'cricket', capColor: '#1d4f91' } },
    { id: 'pappu', nick: 'Pappu', skill: 0.74, gobble: 0.55, look: { kind: 'kid', skin: '#8d5a3b', hair: '#1a1412', shirt: '#2a8c82', pants: '#3b4a6b' } },
    { id: 'tiger', nick: 'Tiger', skill: 0.86, gobble: 0.6, look: { kind: 'kid', skin: '#7a4a30', hair: '#1a1412', shirt: '#1a1a2a', pants: '#5a4a3a', cap: 'cricket', capColor: '#d8302a' } },
  ];

  /* ================================================================ sounds (N.audio.ext) */
  function regSounds() {
    const X = N.audio && N.audio.ext;
    if (!X || !X.registerSfx || X.__pp) return;
    X.__pp = true;
    const P = X.P;
    X.registerSfx('pp_crunch', (ac, out, t, o) => {
      // the shell cracks + a splash of pani
      let e = P.burst(ac, out, t, { kind: 'white', ft: 'bandpass', f: 3200 * (o.pitch || 1), q: 1.2, a: 0.001, r: 0.05, v: 0.32 });
      e = Math.max(e, P.burst(ac, out, t + 0.012, { kind: 'white', ft: 'highpass', f: 5200, a: 0.001, r: 0.03, v: 0.18 }));
      e = Math.max(e, P.burst(ac, out, t + 0.05, { kind: 'pink', ft: 'lowpass', f: 900, a: 0.01, r: 0.12, v: 0.2 }));
      return e;
    }, { cooldown: 0.04, ui: true });
    X.registerSfx('pp_cough', (ac, out, t) => {
      // two wordless coughs (kid voice: a noisy bark through a vowel formant)
      let e = t;
      for (let i = 0; i < 2; i++) {
        const t0 = t + i * 0.32;
        e = Math.max(e, P.burst(ac, out, t0, { kind: 'pink', ft: 'bandpass', f: 900, f2: 520, q: 1.6, a: 0.008, h: 0.05, r: 0.16, v: 0.5 }));
        e = Math.max(e, P.tone(ac, out, t0, { type: 'sawtooth', f: 330, f2: 230, a: 0.006, h: 0.04, r: 0.12, v: 0.07 }));
      }
      return e;
    }, { cooldown: 0.5, ui: true, caption: 'kho! kho!' });
    X.registerSfx('pp_gulp', (ac, out, t) => {
      let e = t;
      for (let i = 0; i < 3; i++) e = Math.max(e, P.tone(ac, out, t + i * 0.22, { type: 'sine', f: 240, f2: 120, glide: 0.08, a: 0.004, r: 0.1, v: 0.25 }));
      return e;
    }, { cooldown: 0.3, ui: true, caption: 'gulp gulp' });
    X.registerSfx('pp_jaldi', (ac, out, t) => {
      // a fast steel-spoon rattle on the matka: tin-tin-tin-tin
      let e = t;
      for (let i = 0; i < 6; i++) e = Math.max(e, P.strike(ac, out, t + i * 0.07, 1400 + (i % 2) * 220, P.METAL, 0.12, 0.07));
      return e;
    }, { cooldown: 0.4, ui: true, caption: 'jaldi jaldi!' });
  }

  /* ================================================================ the contest (minigame DEF) */
  const MGH = () => N.minigames && N.minigames.helpers;
  const TYPES = {
    normal: { fill: '#6aa84a', label: '' },
    teekha: { fill: '#d8402a', label: 'TEEKHA' },
    meetha: { fill: '#8a4a24', label: 'MEETHA' },
  };
  const ROUND_NAMES = { normal: 'PANI PURI', meetha: 'MEETHA ROUND', teekha: 'TEEKHA ROUND', jaldi: 'JALDI-JALDI!' };
  /** the round schedule for a seed: [{t0, t1, kind}] covering secs */
  function schedule(rng, secs, variant) {
    if (variant && ROUND_NAMES[variant] && variant !== 'normal') return [{ t0: 0, t1: secs, kind: variant }];
    const out = [];
    const order = ['meetha', 'normal', 'teekha', 'jaldi', 'normal', 'teekha', 'jaldi', 'meetha', 'jaldi'];
    let t = 0, i = 0;
    while (t < secs - 0.01) {
      const kind = order[i % order.length];
      const len = kind === 'jaldi' ? 5 + rng.next() * 2 : 7 + rng.next() * 4;
      out.push({ t0: t, t1: Math.min(secs, t + len), kind });
      t += len; i++;
    }
    return out;
  }
  function roundAt(S, t) { for (const r of S.rounds) if (t >= r.t0 && t < r.t1) return r; return S.rounds[S.rounds.length - 1]; }
  /** the serve times (identical for every contestant with the same seed) */
  function serveTimes(S, secs, diff) {
    const out = [];
    let t = 0.8;
    while (t < secs - 0.2) {
      const r = roundAt(S, t), prog = t / secs;
      const kind = r.kind === 'jaldi' ? 'normal' : r.kind;
      const type = kind === 'normal' && S.rng2.next() < 0.12 ? (S.rng2.next() < 0.5 ? 'teekha' : 'meetha') : kind;
      out.push({ t, type });
      const gap = r.kind === 'jaldi' ? TUNE.jaldi : lerp(TUNE.gap0, TUNE.gap1, prog) + TUNE.gapD * (diff - 0.4);
      t += gap * (0.92 + S.rng2.next() * 0.16);
    }
    return out;
  }

  /* -------- an AI (or remote) contestant -------- */
  function makeRival(f, i, seed) {
    return { nick: f.nick, look: f.look || {}, ai: !!f.ai, uid: f.uid || null, skill: f.skill == null ? 0.8 : f.skill, gob: f.gobble == null ? 0.4 : f.gobble,
      rng: U.rng((seed + 977 * (i + 1)) >>> 0), n: 0, heat: 0, water: 0, chew: 0, dona: [], misses: 0, bump: 0, last: 0, remote: !f.ai && !f.me };
  }
  // one AI step: same serve schedule; it eats after a reaction delay (slower kids fall behind in the jaldi
  // rounds and overflow; now and then one looks at the crowd and a puri goes soggy), gobbles to keep up
  function aiStep(S, r, dt, now) {
    if (r.remote) return;
    r.chew = Math.max(0, r.chew - dt);
    r.water = Math.max(0, r.water - dt);
    const rk = roundAt(S, now);
    r.heat = Math.max(0, r.heat - dt * (rk.kind === 'meetha' ? TUNE.decayMeetha : TUNE.decay));
    for (let i = r.dona.length - 1; i >= 0; i--) { const p = r.dona[i]; p.age += dt; if (p.age > S.life) { r.dona.splice(i, 1); r.misses++; } }
    if (r.water > 0 || !r.dona.length) return;
    const p = r.dona[0];
    if (p.react == null) {
      p.react = (0.15 + (1 - r.skill) * 1.2) * (0.6 + r.rng.next() * 0.8);
      if (r.rng.next() < 0.05 * (1.2 - r.skill)) p.react += 1.6; // distracted by the giant wheel lights
    }
    if (p.age < p.react) return;
    r.gobT = Math.max(0, (r.gobT || 0) - dt);
    if (r.chew > 0) {
      // still chewing: only a full dona makes them gobble (a decision every quarter second)
      if (r.dona.length < TUNE.cap || r.gobT > 0) return;
      r.gobT = 0.25;
      if (r.rng.next() > r.gob * r.skill * 0.7 || r.heat > 70) return;
      r.heat += TUNE.gobble;
    }
    r.dona.shift();
    r.n++; r.bump = 0.35; r.chew = TUNE.chew + (1 - r.skill) * 1.1;
    r.heat = Math.max(0, r.heat + TUNE.heat[p.type]);
    if (r.heat >= TUNE.coughAt) { r.heat = TUNE.waterReset; r.water = TUNE.waterSecs; r.cough = 1.2; }
  }

  const def = {
    id: 'pp_contest',
    title: 'Pani Puri Eating Contest',
    sub: 'Gokul Chat, Koti. Sixty seconds, one bhaiya, no mercy.',
    osd: 'GOKUL CHAT · CONTEST',
    place: 'gokul_chat', places: ['gokul_chat'],
    secs: 60,
    goLabel: 'KHAAO!',
    startLabel: 'Shuru karo!',
    keys: { Space: 'eat', ArrowUp: 'eat', KeyW: 'eat', Enter: 'eat', KeyE: 'eat', KeyJ: 'eat', KeyF: 'eat' },
    buttons: () => [{ a: 'eat', label: 'KHAAO!', sub: 'TAP · HOLD', cls: 'big', hold: true }],
    keyHint: () => '<kbd>Space</kbd> tap to eat · hold for a steady rhythm (or click / hold the dona)',
    howto(g) {
      const v = g.params.variant;
      return {
        title: 'Pani Puri Eating Contest',
        lines: [
          'Bhaiya drops puris into your dona one by one. <b>Eat</b> each one before its ring runs out, or it goes soggy and breaks. Three in the dona is the limit.',
          'Every puri heats up your <b style="color:#ff6a4a">TEEKHA</b> meter. Tapping again while you are still chewing is <b>gobbling</b>: much hotter. Full meter = <i>"KHO! KHO!"</i> and a water break.',
          'Rounds: <b style="color:#c88a50">MEETHA</b> cools you, <b style="color:#ff6a4a">TEEKHA</b> burns, <b style="color:#ffd84a">JALDI-JALDI</b> is double speed.' + (v ? ' Today: <b>' + esc(ROUND_NAMES[v] || v) + '</b> only!' : ''),
        ],
        goal: 'EAT THE MOST PURIS IN ' + Math.round(g.params.secs || TUNE.secs) + ' SECONDS',
        keys: '<kbd>Space</kbd> eat &nbsp;·&nbsp; hold for rhythm',
        touch: '<b>KHAAO!</b> (or the dona): tap to eat, hold for a steady rhythm',
      };
    },
    setup(g) {
      const S = g.S, P = g.params;
      S.secs = P.secs || TUNE.secs;
      S.variant = P.variant || null;
      S.rng2 = U.rng((g.baseSeed ^ 0x5eed) >>> 0);
      S.rounds = schedule(U.rng(g.baseSeed >>> 0), S.secs, S.variant);
      S.serves = serveTimes(S, S.secs, g.diff);
      S.si = 0; S.t = 0; S.life = TUNE.life + TUNE.lifeD * (g.diff - 0.4) + (g.assist ? 0.5 : 0);
      S.score = 0; S.eaten = 0; S.misses = 0; S.coughs = 0; S.gobbles = 0; S.combo = 0; S.best = 0;
      S.heat = 0; S.chew = 0; S.water = 0; S.dona = []; S.fly = [];
      S.face = { chew: 0, gasp: 0, red: 0 };
      S.bh = { say: null, sayT: 0, arm: 0 };
      S.round = null; S.banner = null; S.time = 0; S.holdT = 0; S.sendT = 0; S.lastSent = -1;
      S.end = false;
      // the other contestants: party players (live tallies) and AI friends
      const others = [];
      const ctx = P.party;
      if (ctx && Array.isArray(ctx.players)) {
        // party / solo through N.party: the AI friends are simulated here (their skill from ctx.ai), real players send tallies
        ctx.players.forEach((pl) => {
          if (pl.isMe) return;
          let sk = null;
          if (pl.isAI) { try { sk = ctx.ai && ctx.ai.skill ? ctx.ai.skill(pl.uid) : null; } catch (e) { sk = null; } if (!isFinite(sk)) sk = 0.72 + ((U.strHash(String(pl.uid || pl.nick)) >>> 0) % 20) / 100; }
          const fr = FRIENDS.find((f) => pl.npc === f.id || ('ai:' + f.id) === pl.uid);
          others.push({ nick: pl.nick || 'Friend', look: pl.look || (fr && fr.look), ai: !!pl.isAI, uid: pl.uid, skill: sk, gobble: fr ? fr.gobble : 0.4 });
        });
        S.waitParty = typeof ctx.elapsed === 'function';
      } else {
        const list = Array.isArray(P.friends) ? P.friends : FRIENDS.slice(0, P.nFriends == null ? 3 : P.nFriends);
        list.forEach((f) => others.push({ nick: f.nick, look: f.look, ai: true, skill: f.skill, gobble: f.gobble }));
      }
      S.rivals = others.slice(0, 9).map((f, i) => makeRival(f, i, g.baseSeed));
      if (ctx && typeof ctx.on === 'function' && !g.ppListen) {
        g.ppListen = true;
        try {
          // ctx.on(type, fn(data, from)): from = the sender's player entry {uid, nick, ...}
          ctx.on('pp', (d, from) => {
            if (!d || typeof d !== 'object' || !g.S || !g.S.rivals) return;
            const uid = (from && from.uid) || d.uid;
            const r = g.S.rivals.find((q) => q.uid && q.uid === uid);
            if (!r || !r.remote) return;
            const n = clamp(d.n | 0, 0, 999);
            if (n > r.n) r.bump = 0.35;
            r.n = n; r.heat = clamp(+d.h || 0, 0, 100); r.water = d.c ? 1 : 0;
          });
        } catch (e) { N.err('panipuri.party.on', e); }
      }
    },
    layout(g) { lay(g, g.S); g.S.bgKey = null; },
    update(g, dt) { step(g, g.S, dt); },
    idle(g, dt) { const S = g.S; if (S) S.time += dt; },
    pointer(g, type, x, y, id) {
      const S = g.S, L = S.L;
      if (!L) return;
      if (type === 'down' && Math.hypot(x - L.dx, y - L.dy) < L.dr * 2.2) { S.ptr = id; g.press('eat', 'ptr' + id); }
      else if (type === 'up' && S.ptr === id) { S.ptr = null; g.release('eat', 'ptr' + id); }
    },
    bot(g, dt, want) {
      const S = g.S;
      if (want === 'lose') { S.botT = (S.botT || 0) - dt; if (S.botT <= 0) { S.botT = 1.6; g.botPress('eat'); } return; }
      // eat each puri once it has landed; gobble only when the dona is about to overflow and the meter is cool
      if (!S.dona.length || S.water > 0) return;
      if (S.chew > 0 && !(S.dona.length >= 3 && S.heat < 60)) return;
      g.botPress('eat');
    },
    hud(g) {
      const S = g.S;
      return [
        { k: 'TIME', v: Math.max(0, Math.ceil(S.secs - S.t)) + 's', warn: S.secs - S.t < 10 },
        { k: 'PURIS', v: S.eaten, good: S.eaten > 0 },
        { k: 'TEEKHA', v: Math.round(S.heat) + '%', warn: S.heat > 75 },
      ];
    },
    draw(g, ctx) { drawContest(g, ctx, g.S); },
    result(g, r) {
      const S = g.S, tb = table(S);
      const me = tb.find((x) => x.me), rank = tb.indexOf(me) + 1;
      const champ = r.win;
      return {
        title: champ ? 'Pani Puri Champion!' : rank === 2 ? 'So close, yaar!' : 'Bas, bhaiya, bas!',
        line: champ ? 'Bhaiya bangs the steel spoon on the matka. "Champion! Ek extra, phokat!" The whole queue claps.'
          : 'Your eyes are watering and ' + (tb[0] ? tb[0].nick : 'somebody') + ' is grinning with a full mouth. Paani, then phir se?',
        rows: tb.slice(0, 6).map((x, i) => [(i + 1) + '. ' + x.nick, x.n + ' puris']).concat([['Coughs', S.coughs], ['Dropped', S.misses]]),
      };
    },
    stars(g, r) { const S = g.S; return r.win ? 1 + (S.coughs === 0 ? 1 : 0) + (S.misses <= 2 ? 1 : 0) : S.eaten >= 30 ? 1 : 0; },
    cleanup(g) { const S = g.S; if (S && S.party && !S.reported) report(g, S, true); },
  };
  function table(S) {
    const rows = [{ nick: 'You', n: S.eaten, me: true }].concat(S.rivals.map((r) => ({ nick: r.nick, n: r.n, ai: r.ai })));
    rows.sort((a, b) => b.n - a.n || (a.me ? -1 : b.me ? 1 : 0));
    return rows;
  }
  function report(g, S, early) {
    const ctx = g.params.party;
    if (!ctx || S.reported) return;
    S.reported = true;
    try { if (typeof ctx.report === 'function') ctx.report(early ? { score: S.eaten, dnf: true, note: 'left the counter' } : { score: S.eaten, eaten: S.eaten, misses: S.misses, coughs: S.coughs, note: S.eaten + ' puris' }); } catch (e) { N.err('panipuri.party.report', e); }
    // the AI friends' tallies (simulated on this page): the host reports them
    try {
      if (ctx.ai && typeof ctx.ai.report === 'function' && ctx.isHost) for (const r of S.rivals) if (r.ai && r.uid) ctx.ai.report(r.uid, { score: r.n, note: r.n + ' puris' });
    } catch (e) { N.err('panipuri.party.aiReport', e); }
  }
  function sendTally(g, S, force) {
    const ctx = g.params.party;
    if (!ctx || typeof ctx.send !== 'function') return;
    const key = S.eaten * 1000 + (S.water > 0 ? 1 : 0) * 100 + Math.round(S.heat / 10);
    if (!force && (S.sendT > 0 || key === S.lastSent)) return;
    S.sendT = 0.25; S.lastSent = key;
    try { ctx.send('pp', { uid: ctx.me && ctx.me.uid, nick: ctx.me && ctx.me.nick, n: S.eaten, h: Math.round(S.heat), c: S.water > 0 ? 1 : 0 }); } catch (e) { N.err('panipuri.party.send', e); }
  }

  function say(S, t) { S.bh.say = t; S.bh.sayT = 1.7; }
  function miss(g, S, why) {
    S.misses++; S.combo = 0;
    g.shake(4); g.tone(170, 0.14, { type: 'triangle', vol: 0.05 });
    const L = S.L;
    g.pop(why === 'drop' ? 'GIR GAYI!' : 'PHOOT GAYI!', L.dx + (Math.random() - 0.5) * 40, L.dy - L.dr * 1.9, { size: 22, color: '#ff8a7a' });
    g.burst(L.dx, L.dy - L.dr * 0.2, 12, { colors: ['#e2b25a', '#c88a30', '#6aa84a'], speed: 150, grav: 420, life: 0.7, size: 3.5 });
  }
  function step(g, S, dt) {
    S.time += dt;
    if (S.end) return;
    // party: everybody starts on the shared GO (ctx.startAt), whatever the how-to / countdown took here
    if (S.waitParty) {
      let e = 0;
      try { e = g.params.party.elapsed(); } catch (er) { e = 0; }
      if (isFinite(e) && e < 0) { S.waitLeft = -e / 1000; return; }
      S.waitParty = false; S.waitLeft = 0;
    }
    S.t += dt;
    S.sendT -= dt;
    const L = S.L;
    S.bh.sayT -= dt;
    S.face.chew = Math.max(0, S.face.chew - dt); S.face.gasp = Math.max(0, S.face.gasp - dt);
    S.chew = Math.max(0, S.chew - dt);
    // the round banner
    const rk = roundAt(S, S.t);
    if (rk !== S.round) {
      S.round = rk;
      S.banner = { kind: rk.kind, t: 0 };
      if (rk.kind === 'jaldi') { g.sfx('pp_jaldi'); say(S, 'Jaldi jaldi! Chalo!'); }
      else if (rk.kind === 'teekha') say(S, 'Ab teekha! Sambhalo!');
      else if (rk.kind === 'meetha') say(S, 'Thoda meetha, thanda thanda.');
    }
    if (S.banner) S.banner.t += dt;
    // heat
    S.heat = Math.max(0, S.heat - dt * (rk.kind === 'meetha' ? TUNE.decayMeetha : TUNE.decay));
    S.heatMax = Math.max(S.heatMax || 0, S.heat);
    S.face.red += (S.heat / 100 - S.face.red) * Math.min(1, dt * 4);
    if (S.water > 0) { S.water -= dt; if (S.water <= 0) { S.water = 0; say(S, 'Bas? Chalo, khaao!'); } }
    // serving: puris fly from Bhaiya's hand into the dona
    while (S.si < S.serves.length && S.serves[S.si].t <= S.t) {
      const sv = S.serves[S.si++];
      S.fly.push({ type: sv.type, t: 0 });
      S.bh.arm = 1;
      for (const r of S.rivals) if (!r.remote) r.dona.push({ type: sv.type, age: 0 });
      // AI donas overflow too
      for (const r of S.rivals) if (!r.remote && r.dona.length > TUNE.cap) { r.dona.shift(); r.misses++; }
    }
    S.bh.arm = Math.max(0, S.bh.arm - dt * 2.6);
    for (let i = S.fly.length - 1; i >= 0; i--) {
      const f = S.fly[i];
      f.t += dt / 0.28;
      if (f.t >= 1) {
        S.fly.splice(i, 1);
        S.dona.push({ type: f.type, age: 0, wob: Math.random() * TAU });
        g.tone(430, 0.03, { type: 'sine', vol: 0.03 });
        if (S.dona.length > TUNE.cap) { S.dona.shift(); miss(g, S, 'drop'); say(S, 'Arre, gir gayi!'); }
      }
    }
    for (let i = S.dona.length - 1; i >= 0; i--) {
      const p = S.dona[i];
      p.age += dt;
      if (p.age >= S.life) { S.dona.splice(i, 1); miss(g, S, 'soggy'); }
    }
    // eating: a tap eats now (gobbling if still chewing); holding eats in rhythm (never gobbles)
    const tap = g.pressed('eat');
    let eatNow = false, gob = false;
    if (tap) { eatNow = true; gob = S.chew > 0; S.holdT = 0; }
    else if (g.down('eat')) { S.holdT += dt; if (S.chew <= 0 && S.dona.length && S.holdT > 0.12) eatNow = true; }
    else S.holdT = 0;
    if (eatNow) {
      if (S.water > 0) { if (tap) { g.pop('paani pee raha hai...', L.fx, L.fy - L.fr * 1.6, { size: 15, color: '#9ad8ff', font: 'body' }); } }
      else if (!S.dona.length) { if (tap) S.face.chew = 0.12; }
      else eat(g, S, S.dona.shift(), gob);
    }
    // the friends
    for (const r of S.rivals) { aiStep(S, r, dt, S.t); r.bump = Math.max(0, r.bump - dt); if (r.cough > 0) r.cough -= dt; }
    sendTally(g, S, false);
    if (S.t >= S.secs) {
      S.end = true;
      const tb = table(S), me = tb.find((x) => x.me), rank = tb.indexOf(me) + 1;
      const best = tb.filter((x) => !x.me).reduce((m, x) => Math.max(m, x.n), 0);
      const win = S.eaten > 0 && S.eaten >= best && (S.eaten > best || !S.rivals.length);
      S.score = S.eaten;
      say(S, win ? 'Champion! Ek extra phokat!' : 'Time! Bas, bas!');
      sendTally(g, S, true);
      report(g, S, false);
      g.finish(win, { eaten: S.eaten, misses: S.misses, coughs: S.coughs, gobbles: S.gobbles, rank, of: tb.length, table: tb, variant: S.variant || 'mixed', champion: win, delay: 1.6 });
    }
  }
  function eat(g, S, p, gob) {
    const L = S.L;
    S.eaten++;
    S.face.chew = 0.4;
    S.chew = TUNE.chew;
    const fresh = p.age / S.life < 0.55;
    if (fresh) S.combo++; else S.combo = 0;
    S.best = Math.max(S.best, S.combo);
    S.heat = Math.max(0, S.heat + TUNE.heat[p.type] + (gob ? TUNE.gobble : 0));
    if (gob) { S.gobbles++; g.pop('GOBBLE!', L.fx - L.fr * 1.4, L.fy - L.fr * 1.3, { size: 17, color: '#ffb43a', font: 'body' }); }
    g.sfx('pp_crunch', { pitch: 0.9 + Math.random() * 0.25 });
    if (S.eaten % 3 === 0) g.sfx('munch', { vol: 0.6 });
    g.burst(L.dx, L.dy - L.dr * 0.4, fresh ? 12 : 6, { colors: ['#e2b25a', '#f2d08a', TYPES[p.type].fill], speed: fresh ? 180 : 90, grav: 380, life: 0.6, size: 3 });
    const txt = p.type === 'teekha' ? 'TEEKHA!' : p.type === 'meetha' ? 'meetha' : fresh ? (S.combo >= 4 ? 'x' + S.combo : 'CRUNCH!') : 'soggy...';
    g.pop(txt, L.dx + (Math.random() - 0.5) * 36, L.dy - L.dr * 1.7, { size: fresh ? 24 : 18, color: p.type === 'teekha' ? '#ff6a4a' : p.type === 'meetha' ? '#e8b48a' : fresh ? '#ffd84a' : '#d8d0c0', font: fresh ? 'display' : 'body' });
    if (p.type === 'teekha') S.face.gasp = 0.5;
    if (S.heat >= TUNE.coughAt) {
      S.coughs++; S.heat = TUNE.waterReset; S.water = TUNE.waterSecs; S.face.gasp = TUNE.waterSecs; S.combo = 0;
      g.pop('KHO! KHO!', L.fx, L.fy - L.fr * 1.7, { size: 32, color: '#ff8a5a', life: 1.4 });
      g.flash('#ff3a2a', 0.3); g.shake(7);
      g.sfx('pp_cough'); g.sfx('pp_gulp', { delay: 0.7 });
      say(S, 'Arre, paani do isko!');
    }
  }

  /* ---------------------------------------------------------------- drawing */
  function lay(g, S) {
    const A = g.area, W = g.W, P = g.portrait;
    const L = (S.L = {});
    const n = S.rivals.length;
    L.stripH = n ? Math.max(58, Math.min(78, A.h * 0.1)) : 0;
    L.stripY = A.y + 6;
    const top = L.stripY + L.stripH + 6;
    L.cy = top + (A.y + A.h - top) * (P ? 0.4 : 0.47); // counter line
    L.sh = Math.max(34, Math.min(56, (L.cy - top) * 0.28));
    L.bhX = W * 0.5; L.bhS = clamp((L.cy - top - L.sh - 10) / 125, 0.42, 1.25);
    L.dx = W * (P ? 0.42 : 0.47); L.dy = A.y + A.h * (P ? 0.8 : 0.82); L.dr = Math.min(W * (P ? 0.17 : 0.12), A.h * 0.11);
    L.fx = W * (P ? 0.8 : 0.74); L.fy = A.y + A.h * (P ? 0.72 : 0.74); L.fr = Math.min(W * (P ? 0.12 : 0.085), A.h * 0.1);
    L.potX = W * 0.5 + 60 * L.bhS; L.top = top;
    return L;
  }
  function paintBg(g, S) {
    const H = MGH(), W = g.W, Hh = g.H, d = g.dpr, A = g.area, L = S.L;
    S.bgKey = W + 'x' + Hh + ':' + d + ':' + A.h + ':' + S.rivals.length;
    const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
    const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
    let gr = c.createLinearGradient(0, 0, 0, L.cy);
    gr.addColorStop(0, '#e6bf62'); gr.addColorStop(1, '#d39f43');
    c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    // distemper patches + a calendar
    c.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 7; i++) c.fillRect((i * 97) % W, L.top + (i * 53) % Math.max(1, L.cy - L.top), 60, 26);
    const sw = Math.min(W * 0.8, 460);
    H.sign(c, (W - sw) / 2, L.top, sw, L.sh, { fill: '#b22b2b', text: 'GOKUL CHAT', color: '#ffd84a', size: L.sh * 0.6, inner: 'rgba(255,216,74,0.6)' });
    // the contest board (chalk)
    const bw = Math.min(W * 0.24, 150), bh = bw * 0.62, bx = 10, by = L.top + L.sh + 10;
    if (L.cy - by > bh + 6) {
      c.fillStyle = '#2a3a2a'; H.rr(c, bx, by, bw, bh, 4); c.fill(); c.strokeStyle = '#7a5a30'; c.lineWidth = 4; c.stroke();
      H.text(c, 'CONTEST', bx + bw / 2, by + bh * 0.24, { font: 'osd', size: bw * 0.13, color: '#f4efe2' });
      H.text(c, '60 SEC', bx + bw / 2, by + bh * 0.5, { font: 'osd', size: bw * 0.13, color: '#ffd84a' });
      H.text(c, 'Rs 5 ONLY', bx + bw / 2, by + bh * 0.76, { font: 'osd', size: bw * 0.11, color: '#f4efe2' });
    }
    // tube light
    const ty = L.top + L.sh + 6;
    c.fillStyle = 'rgba(255,255,240,0.95)'; H.rr(c, W * 0.35, ty, W * 0.3, 5, 3); c.fill();
    gr = c.createRadialGradient(W / 2, ty + 3, 0, W / 2, ty + 3, W * 0.45); gr.addColorStop(0, 'rgba(255,255,240,0.3)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
    c.fillStyle = gr; c.fillRect(0, ty - W * 0.2, W, W * 0.55);
    // counter: steel top + wooden front
    gr = c.createLinearGradient(0, L.cy, 0, L.cy + A.h * 0.05);
    gr.addColorStop(0, '#e6eaee'); gr.addColorStop(0.5, '#b9c0c8'); gr.addColorStop(1, '#8a929a');
    c.fillStyle = gr; c.fillRect(0, L.cy, W, A.h * 0.05);
    c.fillStyle = '#6a3a24'; c.fillRect(0, L.cy + A.h * 0.05, W, Hh);
    c.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < W; x += 28) c.fillRect(x, L.cy + A.h * 0.05, 2, Hh);
    // matkas on the counter: the pani matka, the teekha jar, the meetha bowl
    const pot = (x, r, metal, fill) => {
      c.fillStyle = metal; c.beginPath(); c.ellipse(x, L.cy - r * 0.6, r, r * 0.9, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - r * 0.4, L.cy - r * 0.8, r * 0.18, r * 0.45, 0, 0, TAU); c.fill();
      c.fillStyle = U.shade(metal, 0.8); c.beginPath(); c.ellipse(x, L.cy - r * 1.35, r * 0.75, r * 0.22, 0, 0, TAU); c.fill();
      c.fillStyle = fill; c.beginPath(); c.ellipse(x, L.cy - r * 1.33, r * 0.65, r * 0.17, 0, 0, TAU); c.fill();
    };
    const pr = Math.min(W * 0.07, A.h * 0.06);
    pot(W * 0.5 + pr * 2.2, pr, '#8a8f96', '#5fa04a');
    pot(W * 0.5 + pr * 3.9, pr * 0.7, '#a8b0b8', '#d8402a');
    pot(W * 0.5 - pr * 2.6, pr * 0.65, '#a8b0b8', '#8a4a24');
    // a heap of puris in a basket
    const bxx = W * 0.5 - pr * 4.6, byy = L.cy;
    c.fillStyle = '#9a6a30'; c.beginPath(); c.ellipse(bxx, byy - pr * 0.3, pr * 1.3, pr * 0.55, 0, 0, TAU); c.fill();
    for (let i = 0; i < 9; i++) puri(c, bxx - pr * 0.9 + (i % 4) * pr * 0.6, byy - pr * 0.55 - Math.floor(i / 4) * pr * 0.35, pr * 0.32, null);
  }
  function puri(c, x, y, r, fill, alpha) {
    if (alpha != null) c.globalAlpha = alpha;
    const gr = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, '#f6d690'); gr.addColorStop(0.7, '#d9a24a'); gr.addColorStop(1, '#b8782a');
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (fill) {
      c.fillStyle = '#7a4a1a'; c.beginPath(); c.ellipse(x, y - r * 0.45, r * 0.42, r * 0.2, 0, 0, TAU); c.fill();
      c.fillStyle = fill; c.beginPath(); c.ellipse(x, y - r * 0.43, r * 0.34, r * 0.14, 0, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  function dona(c, x, y, r) {
    c.fillStyle = '#4f7a3a'; c.beginPath(); c.ellipse(x, y + r * 0.15, r * 1.2, r * 0.48, 0, 0, Math.PI); c.fill();
    c.fillStyle = '#6a9a48'; c.beginPath(); c.ellipse(x, y, r * 1.2, r * 0.34, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(40,70,30,0.6)'; c.lineWidth = 1;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(x + i * r * 0.3, y - r * 0.3); c.lineTo(x + i * r * 0.38, y + r * 0.5); c.stroke(); }
  }
  /** a little kid at the counter seen from the front (for the strip and the contest row) */
  function kidFront(c, x, y, s, look, o) {
    look = look || {}; o = o || {};
    const skin = look.skin || '#a8703f', shirt = look.shirt || '#d8402a', hair = look.hair || '#1a1412';
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = shirt; MGH().rr(c, -11, -18, 22, 20, 6); c.fill();
    if (look.stripes) { c.fillStyle = look.stripes; for (let i = 0; i < 3; i++) c.fillRect(-11, -14 + i * 6, 22, 2); }
    const red = clamp(o.red || 0, 0, 1);
    c.fillStyle = red > 0 ? U.mix(skin, '#e2382a', red * 0.8) : skin; c.beginPath(); c.arc(0, -27, 9, 0, TAU); c.fill();
    c.fillStyle = hair; c.beginPath(); c.arc(0, -29, 9.3, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    if (look.girl) { c.fillRect(-10, -29, 3, 12); c.fillRect(7, -29, 3, 12); c.fillStyle = '#d8302a'; c.fillRect(-10.5, -19, 4, 2.5); c.fillRect(6.5, -19, 4, 2.5); }
    if (look.cap) { c.fillStyle = look.capColor || '#1d4f91'; c.beginPath(); c.arc(0, -30, 9.4, Math.PI, TAU); c.fill(); c.fillRect(-2, -31, 13, 3); }
    c.fillStyle = '#1a1214'; c.beginPath(); c.arc(-3.2, -27, 1.3, 0, TAU); c.arc(3.2, -27, 1.3, 0, TAU); c.fill();
    if (look.specs) { c.strokeStyle = '#2a2a2a'; c.lineWidth = 0.9; c.beginPath(); c.arc(-3.2, -27, 2.6, 0, TAU); c.moveTo(5.8, -27); c.arc(3.2, -27, 2.6, 0, TAU); c.stroke(); }
    // mouth: chewing / coughing / grin
    c.fillStyle = '#5a1a1a';
    if (o.cough) { c.beginPath(); c.ellipse(0, -22, 2.6, 2.4, 0, 0, TAU); c.fill(); }
    else if (o.chew) { c.beginPath(); c.ellipse(0, -22, 2.4, 1 + Math.abs(Math.sin((o.t || 0) * 22)) * 1.4, 0, 0, TAU); c.fill(); }
    else { c.strokeStyle = '#5a1a1a'; c.lineWidth = 1.1; c.beginPath(); c.arc(0, -24, 2.6, 0.3, Math.PI - 0.3); c.stroke(); }
    c.restore();
  }
  function drawStrip(g, ctx, S) {
    const H = MGH(), L = S.L, n = S.rivals.length;
    if (!n) return;
    const W = g.W, pad = 8, w = Math.min(124, (W - pad * 2 - (n - 1) * 6) / n), h = L.stripH;
    const x0 = (W - (w * n + (n - 1) * 6)) / 2;
    S.rivals.forEach((r, i) => {
      const x = x0 + i * (w + 6), y = L.stripY;
      const lead = r.n > S.eaten;
      ctx.fillStyle = 'rgba(18,13,22,0.78)'; H.rr(ctx, x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = lead ? '#ff8a5a' : 'rgba(242,194,48,0.55)'; ctx.lineWidth = 2; H.rr(ctx, x, y, w, h, 8); ctx.stroke();
      // the kid, small, and a stack of empty leaf plates (one per 5 puris)
      const ks = h / 70;
      kidFront(ctx, x + 18 * ks + 4, y + h - 6, ks * 0.95, r.look, { chew: r.bump > 0, cough: r.water > 0 || r.cough > 0, t: S.time, red: r.heat / 100 });
      const plates = Math.min(8, Math.floor(r.n / 5) + (r.n > 0 ? 1 : 0)), px = x + w * 0.62, py = y + h - 10;
      for (let k = 0; k < plates; k++) { ctx.fillStyle = k % 2 ? '#5f8f40' : '#6a9a48'; ctx.beginPath(); ctx.ellipse(px, py - k * 3.2, w * 0.17, 3.6, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(30,50,20,0.55)'; ctx.lineWidth = 0.8; ctx.stroke(); }
      const bump = 1 + r.bump * 0.9;
      ctx.save(); ctx.translate(x + w * 0.76, y + h * 0.36); ctx.scale(bump, bump);
      H.text(ctx, String(r.n), 0, 0, { font: 'display', size: h * 0.36, color: lead ? '#ffb08a' : '#ffd84a', outline: 3 });
      ctx.restore();
      H.text(ctx, r.nick, x + w * 0.5, y + 9, { font: 'body', weight: 800, size: 12, color: '#f4ead8', maxW: w - 8 });
      if (r.water > 0 || r.cough > 0) H.text(ctx, 'kho!', x + w * 0.42, y + h * 0.42, { font: 'body', weight: 800, size: 11, color: '#9ad8ff', outline: 3 });
      // heat bar
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 6, y + h - 4, w - 12, 2.5);
      ctx.fillStyle = r.heat > 70 ? '#ff5a3a' : '#ffb43a'; ctx.fillRect(x + 6, y + h - 4, (w - 12) * clamp(r.heat / 100, 0, 1), 2.5);
    });
  }
  function drawContest(g, ctx, S) {
    const H = MGH(), W = g.W, Hh = g.H, A = g.area;
    if (!S.L) lay(g, S);
    if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + A.h + ':' + S.rivals.length) paintBg(g, S);
    ctx.drawImage(S.bg, 0, 0, W, Hh);
    const L = S.L;
    drawStrip(g, ctx, S);
    // Bhaiya behind the counter (white banian, cap, big moustache), the serving arm swings to the dona
    const s = L.bhS, x = L.bhX, y = L.cy;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#f4efe2'; H.rr(ctx, -34, -86, 68, 90, 18); ctx.fill();
    ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(0, -106, 21, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -112, 21.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = '#efe9dc'; ctx.beginPath(); ctx.arc(0, -118, 19, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(-7, -106, 2.5, 0, TAU); ctx.arc(7, -106, 2.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, -96); ctx.quadraticCurveTo(0, -103, 14, -96); ctx.quadraticCurveTo(0, -92, -14, -96); ctx.fill();
    const talk = S.bh.sayT > 0 && Math.sin(S.time * 18) > 0;
    ctx.fillStyle = '#5a2a1a'; ctx.beginPath(); ctx.ellipse(0, -90, 4, talk ? 3 : 1.2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-30, -70); ctx.lineTo(-48, -22); ctx.stroke();
    ctx.restore();
    const hx = lerp(x + 40 * s, L.dx, S.bh.arm * 0.35), hy = lerp(y - 30 * s, y - 10 * s, S.bh.arm);
    ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 10 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 28 * s, y - 70 * s); ctx.quadraticCurveTo(x + 52 * s, y - 40 * s, hx, hy); ctx.stroke();
    // speech
    if (S.bh.say && S.bh.sayT > 0) {
      const fs = Math.max(13, Math.min(18, 15 * s * 1.1));
      ctx.font = H.font('body', fs, 700);
      const tw = Math.min(W - 16, ctx.measureText(S.bh.say).width + 22), th = fs + 14;
      const bx = clamp(x - tw - 30 * s, 8, W - tw - 8), by = clamp(y - 150 * s, L.top + 4, Hh);
      ctx.fillStyle = '#fff8e6'; H.rr(ctx, bx, by, tw, th, 10); ctx.fill(); ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 2; ctx.stroke();
      H.text(ctx, S.bh.say, bx + tw / 2, by + th / 2 + 1, { font: 'body', weight: 700, size: fs, color: '#1a1214', maxW: tw - 10 });
    }
    // my dona (held out), puris with their freshness rings
    const dx = L.dx, dy = L.dy, dr = L.dr;
    ctx.strokeStyle = '#a8703f'; ctx.lineWidth = dr * 0.32; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(dx - dr * 0.2, Hh + 20); ctx.lineTo(dx - dr * 0.1, dy + dr * 0.35); ctx.stroke();
    dona(ctx, dx, dy, dr);
    S.dona.forEach((p, i) => {
      const px = dx + (i - (S.dona.length - 1) / 2) * dr * 0.8, py = dy - dr * 0.22 + Math.sin(S.time * 3 + p.wob) * 1.2;
      const r = dr * 0.36, k = p.age / S.life;
      ctx.lineWidth = Math.max(3, r * 0.17);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(px, py, r * 1.35, 0, TAU); ctx.stroke();
      ctx.strokeStyle = k < 0.55 ? '#6fdc5a' : k < 0.8 ? '#ffb43a' : '#ff4a3a';
      ctx.beginPath(); ctx.arc(px, py, r * 1.35, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k)); ctx.stroke();
      puri(ctx, px, py, r, TYPES[p.type].fill);
      const sog = Math.max(0, (k - 0.55) / 0.45);
      if (sog > 0) { ctx.fillStyle = 'rgba(90,60,30,' + (sog * 0.45).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); }
      // one tag per run of the same kind (side by side they would overlap)
      if (TYPES[p.type].label && !(i > 0 && S.dona[i - 1].type === p.type)) H.text(ctx, TYPES[p.type].label, px, py - r * 2, { font: 'osd', size: Math.max(13, r * 0.55), color: p.type === 'teekha' ? '#ff6a4a' : '#e8b48a', outline: 4 });
    });
    for (const f of S.fly) {
      const t = H.ease.inOut(Math.min(1, f.t));
      const fx = lerp(hx, dx, t), fy = lerp(hy, dy - dr * 0.25, t) - Math.sin(t * Math.PI) * dr * 1.1;
      puri(ctx, fx, fy, dr * 0.36 * (0.8 + t * 0.2), TYPES[f.type].fill);
    }
    // my face: red with heat, watery eyes, steam; a steel glass on a water break
    const fx = L.fx, fy = L.fy, fr = L.fr, red = clamp(S.face.red, 0, 1), look = (N.player && N.player.look) || {};
    ctx.fillStyle = 'rgba(18,13,22,0.5)'; ctx.beginPath(); ctx.arc(fx, fy, fr * 1.18, 0, TAU); ctx.fill();
    ctx.fillStyle = U.mix(look.skin || '#a8703f', '#e2382a', red * 0.85); ctx.beginPath(); ctx.arc(fx, fy, fr, 0, TAU); ctx.fill();
    ctx.fillStyle = look.hair || '#1a1412'; ctx.beginPath(); ctx.arc(fx, fy - fr * 0.2, fr * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.fill();
    const ey = fy - fr * 0.12;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(fx + sx * fr * 0.35, ey, fr * 0.17, S.face.gasp > 0 ? fr * 0.2 : fr * 0.13, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(fx + sx * fr * 0.35, ey + fr * 0.02, fr * 0.07, 0, TAU); ctx.fill();
      if (red > 0.45) { ctx.fillStyle = '#7ac8ff'; ctx.beginPath(); ctx.ellipse(fx + sx * fr * 0.42, ey + fr * 0.25 + ((S.time * 40) % (fr * 0.5)), fr * 0.05, fr * 0.09, 0, 0, TAU); ctx.fill(); }
    }
    ctx.fillStyle = '#5a1a1a';
    if (S.water > 0) { ctx.beginPath(); ctx.ellipse(fx, fy + fr * 0.45, fr * 0.16, fr * 0.1, 0, 0, TAU); ctx.fill(); }
    else if (S.face.gasp > 0) { ctx.beginPath(); ctx.ellipse(fx, fy + fr * 0.42, fr * 0.22, fr * 0.2, 0, 0, TAU); ctx.fill(); }
    else if (S.face.chew > 0) { const m = Math.abs(Math.sin(S.time * 22)) * fr * 0.12 + fr * 0.04; ctx.beginPath(); ctx.ellipse(fx, fy + fr * 0.42, fr * 0.2, m, 0, 0, TAU); ctx.fill(); }
    else { ctx.strokeStyle = '#5a1a1a'; ctx.lineWidth = Math.max(2, fr * 0.07); ctx.beginPath(); ctx.arc(fx, fy + fr * 0.25, fr * 0.25, 0.2, Math.PI - 0.2); ctx.stroke(); }
    if (red > 0.6) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const k = (S.time * 1.5 + i / 3) % 1;
      ctx.fillStyle = 'rgba(255,255,255,' + ((1 - k) * 0.6).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(fx + sx * (fr * 1.05 + k * fr * 0.5), fy - k * fr * 0.9, fr * (0.1 + k * 0.15), 0, TAU); ctx.fill();
    }
    if (S.water > 0) {
      const gx = fx - fr * 0.1, gy = fy + fr * 0.85, tilt = Math.sin(S.time * 6) * 0.08;
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(-0.5 + tilt);
      ctx.fillStyle = '#c8d0d8'; ctx.beginPath(); ctx.moveTo(-fr * 0.28, -fr * 0.7); ctx.lineTo(fr * 0.28, -fr * 0.7); ctx.lineTo(fr * 0.22, 0); ctx.lineTo(-fr * 0.22, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-fr * 0.16, -fr * 0.62, fr * 0.06, fr * 0.56);
      ctx.restore();
      // the water-break ring
      const k = clamp(S.water / TUNE.waterSecs, 0, 1);
      ctx.strokeStyle = '#7ac8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(fx, fy, fr * 1.35, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      H.text(ctx, 'PAANI BREAK', fx, fy - fr * 1.6, { font: 'osd', size: 18, color: '#9ad8ff', outline: 4 });
    }
    // the TEEKHA (cough) meter
    const mw = Math.max(14, fr * 0.28), mh = fr * 2.6, mx = fx - fr - mw - 14, my = fy - mh * 0.5;
    ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, mx - 3, my - 3, mw + 6, mh + 6, 6); ctx.fill();
    const lvl = clamp(S.heat / 100, 0, 1);
    const gr = ctx.createLinearGradient(0, my + mh, 0, my);
    gr.addColorStop(0, '#ffd84a'); gr.addColorStop(0.6, '#ff7a2a'); gr.addColorStop(1, '#e2183a');
    ctx.fillStyle = gr; ctx.fillRect(mx, my + mh * (1 - lvl), mw, mh * lvl);
    H.text(ctx, 'TEEKHA', mx + mw / 2, my + mh + 12, { font: 'osd', size: 13, color: '#ffd2c8', outline: 3 });
    if (S.heat > 60) {
      const a = (S.heat - 60) / 40 * 0.3 * (0.8 + 0.2 * Math.sin(S.time * 9));
      const v = ctx.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.35, W / 2, Hh / 2, Math.max(W, Hh) * 0.75);
      v.addColorStop(0, 'rgba(255,40,20,0)'); v.addColorStop(1, 'rgba(255,40,20,' + a.toFixed(3) + ')');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, Hh);
    }
    // my tally: a stack of empty donas + the count
    const tx = g.portrait ? 14 : W * 0.08, ty = L.cy + A.h * 0.1;
    const stack = Math.min(12, Math.floor(S.eaten / 5) + (S.eaten ? 1 : 0));
    for (let k = 0; k < stack; k++) { ctx.fillStyle = k % 2 ? '#5f8f40' : '#6a9a48'; ctx.beginPath(); ctx.ellipse(tx + 26, ty + 70 - k * 4.5, 24, 6, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(30,50,20,0.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    H.text(ctx, String(S.eaten), tx + 26, ty + 10, { font: 'display', size: 34, color: '#ffd84a', outline: 5 });
    H.text(ctx, 'PURIS', tx + 26, ty + 36, { font: 'osd', size: 16, color: '#f4efe2', outline: 3 });
    if (S.combo >= 3) H.text(ctx, 'COMBO x' + S.combo, dx, dy + dr * 1.05, { font: 'osd', size: 19, color: '#ffd84a', outline: 4 });
    // the round banner (slides in, then a small tag)
    const rk = S.round;
    if (rk) {
      const B = S.banner, big = B && B.t < 1.6;
      const col = rk.kind === 'teekha' ? '#c8302a' : rk.kind === 'meetha' ? '#8a4a24' : rk.kind === 'jaldi' ? '#f2c230' : '#2a8c82';
      const fg = rk.kind === 'jaldi' ? '#1a1214' : '#fff4d8';
      if (big) {
        const k = H.ease.outBack(Math.min(1, B.t / 0.35)), w = Math.min(W * 0.8, 340), h = 54;
        H.sign(ctx, W / 2 - w / 2, L.cy - h - 6 - (1 - k) * 40, w, h, { fill: col, text: ROUND_NAMES[rk.kind], color: fg, size: 30, rot: Math.sin(B.t * 6) * 0.02 });
      } else {
        const w = 130, h = 24;
        H.sign(ctx, W - w - 10, L.top + L.sh + 8, w, h, { fill: col, text: ROUND_NAMES[rk.kind], color: fg, size: 14, bolts: false });
      }
      if (rk.kind === 'jaldi') { ctx.strokeStyle = 'rgba(255,240,180,0.25)'; ctx.lineWidth = 2; for (let i = 0; i < 8; i++) { const yy = L.top + ((i * 61 + S.time * 600) % Math.max(1, A.h)); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W * 0.18, yy); ctx.moveTo(W, yy); ctx.lineTo(W * 0.82, yy); ctx.stroke(); } }
    }
    // party: waiting for the shared GO
    if (S.waitParty && S.waitLeft > 0) {
      ctx.fillStyle = 'rgba(18,13,22,0.55)'; ctx.fillRect(0, A.y, W, A.h);
      H.text(ctx, 'GET READY', W / 2, A.y + A.h * 0.42, { font: 'display', size: 40, color: '#ffd84a', outline: 6 });
      H.text(ctx, String(Math.ceil(S.waitLeft)), W / 2, A.y + A.h * 0.55, { font: 'display', size: 64, color: '#f4efe2', outline: 7 });
    }
    // the clock (big, last 10 s red)
    const left = Math.max(0, S.secs - S.t);
    H.text(ctx, Math.ceil(left) + '', W - 34, A.y + A.h - 34, { font: 'display', size: 34, color: left < 10 ? '#ff6a4a' : '#f4efe2', outline: 5 });
  }
  N.minigames && N.minigames.register && (N.minigames.register(def), Object.assign(N.minigames.alias || {}, { panipuri_contest: 'pp_contest', pani_puri_contest: 'pp_contest', puri_contest: 'pp_contest' }));

  /* ================================================================ starting a contest (world, shops, party) */
  let pendingPlace = null, busy = false;
  function play(params) {
    const MG = N.minigames;
    if (!MG || !MG.play) return Promise.resolve({ id: 'pp_contest', win: false, error: 'no minigames' });
    regSounds();
    params = Object.assign({ place: 'gokul_chat', difficulty: 0.4 }, params || {});
    busy = true;
    return MG.play('pp_contest', params).then((r) => { busy = false; try { after(r, params); } catch (e) { N.err('panipuri.after', e); } return r; }, (e) => { busy = false; throw e; });
  }
  function after(r, params) {
    if (!r || r.error || r.aborted) return;
    const n = r.eaten | 0;
    // a stomach full of puris
    try { if (n > 0 && N.player && N.player.feed) N.player.feed(Math.min(TUNE.tummyMax, Math.round(n * TUNE.tummyPer)), { quiet: true }); } catch (e) { /* ignore */ }
    if (n > (rec.best | 0)) { rec.best = n; saveRec(); }
    if (N.flags) N.flags.pp_best = Math.max(N.flags.pp_best | 0, n);
    if (r.win && !r.quit) {
      rec.wins = (rec.wins | 0) + 1; saveRec();
      if (N.flags) N.flags.pp_champion = true;
      try { if (N.tape && N.tape.addToken) N.tape.addToken('pp_champion', { name: 'Pani Puri Champion badge', desc: n + ' puris in 60 seconds at ' + placeName(params.place) + '. Bhaiya wrote it on the board in chalk.' }); } catch (e) { N.err('panipuri.token', e); }
      toast('PANI PURI CHAMPION! ' + n + ' puris. Bragging rights till Sankranti.', 3600);
      try { if (N.hud && N.hud.banner) N.hud.banner('PANI PURI CHAMPION', n + ' puris · ' + placeName(params.place), 2600, { kind: 'pass' }); } catch (e) { /* ignore */ }
    } else if (!r.quit) toast(n + ' puris! ' + (r.table && r.table[0] && !r.table[0].me ? r.table[0].nick + ' ate ' + r.table[0].n + '. Next time.' : 'Paani, paani!'), 2800);
    N.emit('panipuri:contest', { eaten: n, win: !!r.win, place: params.place || 'gokul_chat' });
  }
  function placeName(id) { const p = id && N.places && N.places[id]; return p && p.name ? p.name : id && /^panipuri_/.test(id) ? 'the pani puri cart' : 'Gokul Chat'; }
  /** pay through shops.js and play. place: 'gokul_chat' (default) or a pani-puri cart spot id */
  function start(place, opts) {
    if (busy || (N.minigames && N.minigames.isOpen && N.minigames.isOpen())) return false;
    const SH = N.shops;
    pendingPlace = { place: place || 'gokul_chat', opts: opts || {} };
    if (SH && SH.buy) {
      const r = SH.buy('gokul_chat', 'pp_contest', { force: place && place !== 'gokul_chat' });
      if (!r || !r.ok) { pendingPlace = null; toast((r && r.why ? String(r.why).replace(/\*/g, '') : 'Not now') + '', 2200); return false; }
      return true;
    }
    const p = pendingPlace; pendingPlace = null;
    play(Object.assign({ place: p.place }, p.opts));
    return true;
  }
  // the row in the Gokul Chat card (₹5): its act starts the contest (from the card or N.shops.buy)
  function addShopRow() {
    const SH = N.shops;
    if (!SH || !SH.addRow || addShopRow.done) return;
    addShopRow.done = true;
    SH.addRow('gokul_chat', {
      id: 'pp_contest', name: 'Pani puri eating contest', sub: () => '60 s vs your friends' + (rec.best ? ' · your record ' + rec.best : ''), price: TUNE.price,
      when: () => (busy ? 'A contest is on' : null),
      act: () => {
        const p = pendingPlace || { place: 'gokul_chat', opts: {} };
        pendingPlace = null;
        busy = true; // until play() opens (the card closes itself on {close: true})
        setTimeout(() => {
          // friends in the online room: challenge them (the party framework runs the same seeded contest everywhere)
          if (friendsHere() && !p.opts.solo) {
            let r = null;
            try { r = N.party.challenge(PARTY_ID, { place: p.place }); } catch (e) { N.err('panipuri.challenge', e); }
            if (r && r.ok) { busy = false; return; }
          }
          play(Object.assign({ place: p.place }, p.opts));
        }, 60);
        return { close: true };
      },
    });
  }
  // an E prompt beside every pani-puri cart (a little to one side, so the cart's own "Pani puri ₹5" stays reachable)
  const cartIds = [];
  function installCarts() {
    const I = N.interact, SF = N.streetfood;
    if (!I || !I.add) return;
    for (const k of cartIds) I.remove(k);
    cartIds.length = 0;
    const spots = SF && SF.spots ? SF.spots.filter((s) => s && s.kind === 'panipuri') : [];
    for (const sp of spots) {
      const key = 'pp:' + sp.id;
      cartIds.push(key);
      const f = sp.frame || {};
      const ax = isFinite(f.ax) ? f.ax : 1, ay = isFinite(f.ay) ? f.ay : 0, nx = isFinite(f.nx) ? f.nx : 0, ny = isFinite(f.ny) ? f.ny : 1;
      I.add(key, {
        x: sp.x + ax * 13 + nx * 8, y: sp.y + ay * 13 + ny * 8, r: 9, priority: 2,
        label: 'Pani puri contest ₹5',
        enabled: (pl) => !busy && !(pl && pl.vehicle) && !!(sp.present !== false && (!sp.cartE || sp.cartE.alive)) && mins() >= 11 * 60 && mins() <= 22.5 * 60,
        use: () => start(sp.id),
      });
    }
  }
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  function friendsHere() {
    try { return !!(N.party && N.party.challenge && registerParty() && N.online && N.online.room && (N.online.room.n | 0) > 1); } catch (e) { return false; }
  }

  /* ================================================================ the party activity */
  const PARTY_ID = 'panipuri_contest';
  const partySpec = {
    name: 'Pani puri contest', icon: '🥟', where: 'gokul_chat', kind: 'score', players: { min: 1, max: 10 }, solo: true,
    ai: ['immu', 'ayesha', 'pappu'], label: 'Start a pani puri contest',
    token: { id: 'pp_champion', name: 'Pani Puri Champion badge', desc: 'Ate the most puris in sixty seconds' },
    describe(opts) { const v = opts && opts.variant; return 'Sixty seconds at Gokul Chat: who eats the most pani puris? Live tallies as plates.' + (v ? ' (' + (ROUND_NAMES[v] || v) + ')' : ''); },
    options() { return { place: 'gokul_chat' }; },
    start(ctx) {
      let open = true;
      const o = (ctx && ctx.opts) || {};
      // everyone plays the same seeded contest; the minigame reports (and the host reports the AI friends)
      const params = { place: o.place || 'gokul_chat', seed: ctx && ctx.seed != null ? ctx.seed : undefined, variant: o.variant, party: ctx, noRetry: true, skipHowto: true, difficulty: 0.4 };
      if (o.autoplay) params.autoplay = o.autoplay;
      if (o.secs > 0) params.secs = Math.max(10, Math.min(90, +o.secs));
      setTimeout(() => {
        if (!open) return;
        play(params).then((r) => {
          open = false;
          // closed before the end (quit): the cleanup reported a dnf; nothing else to do
          void r;
        });
      }, 0);
      return {
        update() {},
        end(reason) {
          if (open && N.minigames && N.minigames.active === 'pp_contest' && reason !== 'done') N.minigames.abort('party:' + (reason || 'end'));
          open = false;
        },
      };
    },
  };
  let partyRef = null;
  function registerParty() {
    const P = N.party;
    if (!P || typeof P.register !== 'function') return false;
    if (partyRef === P) return true;
    try { P.register(PARTY_ID, partySpec); partyRef = P; return true; } catch (e) { N.err('panipuri.party.register', e); return false; }
  }
  registerParty();

  /* ================================================================ system + boot */
  let checkT = 0, checks = 0;
  N.addSystem({
    id: 'panipuri', order: 89, runIn: ['*'],
    update(dt) {
      // party.js may arrive (or be replaced) after this file: keep checking for a while, then now and then
      checkT -= dt;
      if (checkT <= 0) { checkT = checks++ < 60 ? 1 : 10; registerParty(); if (!cartIds.length && N.streetfood && N.streetfood.spots && N.streetfood.spots.length) installCarts(); }
    },
  });
  function onBoot() { regSounds(); addShopRow(); registerParty(); installCarts(); }
  N.on('boot', onBoot);
  N.on('world:built', () => { if (cartIds.length) installCarts(); });
  if (N.world && N.world.built) onBoot();

  N.panipuri = {
    play, start, FRIENDS, TUNE, registerParty,
    get best() { return rec.best | 0; },
    get champion() { return !!(N.flags && N.flags.pp_champion) || (rec.wins | 0) > 0; },
    get busy() { return busy; },
    carts: () => cartIds.slice(),
    _schedule: (seed, secs, variant) => { const S = { rng2: U.rng((seed ^ 0x5eed) >>> 0) }; S.rounds = schedule(U.rng(seed >>> 0), secs || 60, variant); return { rounds: S.rounds, serves: serveTimes(S, secs || 60, 0.4) }; },
  };
})();
