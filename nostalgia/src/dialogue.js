/* NOSTALGIA — dialogue.js
 * Bottom dialogue box (in #overlay): pixel-art portrait painted from a look description,
 * speaker name plate in the speaker's colour, typewriter text (ACTION / tap / click
 * completes the line, then advances), *slang* highlighted with a glossary line, choices
 * (arrows / W-S + ACTION, number keys, tap). While open in play mode it pushes the
 * 'dialogue' state (player controls off, clock stopped). Contract: ARCHITECTURE.md §10.
 *
 *   await N.dialogue.say('amma', 'Home before the *street lights*!', {mood: 'angry'})
 *   const i = await N.dialogue.choice('immu', 'Coming?', ['Pakka!', 'Nakko'])
 *   await N.dialogue.play([{s: 'immu', t: '...'}, {s: 'you', t: '...', choices: [...]}])
 *   N.dialogue.define('immu', {name: 'Immu', color: '#2a8c82', look: {...}})
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;

  /* ============================================================ portraits */
  const SKINS = ['#8d5a3b', '#a0683f', '#b97a4f', '#c68b5e', '#7a4a30', '#d29a6a', '#9a6040'];
  const HAIRS = ['#1a1412', '#1a1412', '#2a1a14', '#3a2418'];

  /** Paint a bust (48x48 design grid, scaled to w x h) from a look description:
   *  {skin, hair, hairStyle: short|side|long|bun|braid|bald|spiky|puff|curly|oiled,
   *   moustache: true|'thick'|'thin', beard: true|'stubble'|'long', specs: true|'round'|'thick',
   *   cap: 'topi'|'police'|'cricket'|'gandhi'|'skull', capColor, dupatta: colour, burqa: bool,
   *   bindi: colour|true, shirt, collar, stripes, earrings: colour, flowers: bool (jasmine),
   *   age: 'kid'|'teen'|'adult'|'old', bg, kind (N.people kind: fills defaults)} */
  function paintPortrait(ctx, w, h, look, mood) {
    look = Object.assign({}, look || {});
    const kind = look.kind || '';
    if (kind === 'aunty' || kind === 'saree') { look.hairStyle = look.hairStyle || 'bun'; look.bindi = look.bindi == null ? true : look.bindi; if (look.flowers == null) look.flowers = kind === 'aunty'; }
    if (kind === 'woman') { look.hairStyle = look.hairStyle || 'braid'; }
    if (kind === 'burqa') look.burqa = true;
    if (kind === 'uncle') { look.hairStyle = look.hairStyle || 'bald'; if (look.moustache == null) look.moustache = 'thick'; look.age = look.age || 'old'; }
    if (kind === 'police') { look.cap = look.cap || 'police'; if (look.moustache == null) look.moustache = 'thick'; look.shirt = look.shirt || '#b8a070'; }
    if (kind === 'kid' || kind === 'student') look.age = look.age || 'kid';
    const skin = look.skin || '#a0683f';
    const hair = look.hair || '#1a1412';
    const shirt = look.shirt || '#e8e0d0';
    const S = w / 48;
    ctx.save();
    ctx.setTransform(S, 0, 0, h / 48, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
    // pixel ellipse (rows of rects) — crisp at any scale
    const E = (cx, cy, rx, ry, c, y0, y1) => {
      ctx.fillStyle = c;
      for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
        if (y0 != null && (y < y0 || y >= y1)) continue;
        const t = (y + 0.5 - cy) / ry;
        if (t * t > 1) continue;
        const hw = Math.round(rx * Math.sqrt(1 - t * t));
        if (hw > 0) ctx.fillRect(cx - hw, y, hw * 2, 1);
      }
    };
    const kid = look.age === 'kid', old = look.age === 'old';
    const bg = look.bg || '#2a2034';
    // background: painted wall with a soft light
    R(0, 0, 48, 48, bg);
    E(30, 14, 22, 18, U.shade(bg, 1.12));
    for (let y = 2; y < 48; y += 4) R(0, y, 48, 1, 'rgba(0,0,0,0.08)');
    const shade = (c, f) => U.shade(c, f);
    const hx = 24, hy = kid ? 22 : 20; // head centre
    const hrx = kid ? 9 : 8.5, hry = kid ? 10 : 11;

    if (look.burqa) {
      E(24, 50, 22, 16, '#141216');
      E(hx, hy, hrx + 3, hry + 3, '#141216');
      R(hx - 7, hy - 3, 14, 6, skin);
      R(hx - 5, hy - 1, 3, 2, '#1a1010'); R(hx + 2, hy - 1, 3, 2, '#1a1010');
      R(hx - 5, hy - 2, 3, 1, 'rgba(255,255,255,0.2)');
      R(hx - 8, hy - 4, 16, 1, '#2a262c');
      ctx.restore();
      return;
    }
    // shoulders + shirt
    E(24, 50, kid ? 17 : 20, 16, shirt);
    E(24, 50, kid ? 17 : 20, 16, shade(shirt, 0.82), 44, 48);
    if (look.stripes) for (let y = 37; y < 48; y += 3) R(6, y, 36, 1, look.stripes);
    if (kind === 'uncle' && !look.shirt) { E(24, 50, 20, 16, '#f2efe6'); R(16, 34, 2, 14, '#dcd6c8'); R(30, 34, 2, 14, '#dcd6c8'); }
    if (look.collar !== false && kind !== 'uncle') { // open collar V
      ctx.fillStyle = shade(shirt, 1.12);
      ctx.beginPath(); ctx.moveTo(17, 35); ctx.lineTo(24, 42); ctx.lineTo(31, 35); ctx.lineTo(28, 34); ctx.lineTo(24, 38); ctx.lineTo(20, 34); ctx.closePath(); ctx.fill();
    }
    if (kind === 'police') { R(22, 35, 4, 13, '#4a3020'); R(13, 37, 6, 2, '#c03030'); R(29, 37, 6, 2, '#c03030'); }
    if (look.tie) R(23, 38, 2, 10, look.tie);
    // neck
    R(hx - 4, hy + 8, 8, 7, shade(skin, 0.86));
    // back hair (long styles, bun)
    // long hair / braid: falls behind the shoulders at the sides (never under the chin)
    if (look.hairStyle === 'long' || look.hairStyle === 'braid') {
      E(hx, hy, hrx + 2.5, hry + 1, hair, hy - hry - 2, hy + 3);
      R(hx - hrx - 2, hy - 2, 4, look.hairStyle === 'long' ? 20 : 12, hair);
      R(hx + hrx - 2, hy - 2, 4, look.hairStyle === 'long' ? 20 : 12, hair);
    }
    if (look.hairStyle === 'bun') E(hx, hy - hry + 1, 5, 4, hair);
    // ears + head
    E(hx - hrx, hy + 1, 2, 3, shade(skin, 0.9)); E(hx + hrx, hy + 1, 2, 3, shade(skin, 0.9));
    E(hx, hy, hrx, hry, skin);
    E(hx + 3, hy - 3, hrx - 4, hry - 5, shade(skin, 1.08));     // lit side
    E(hx, hy + hry - 2, hrx - 2, 3, shade(skin, 0.9), hy + hry - 3, hy + hry + 1); // jaw shade
    if (look.earrings) { R(hx - hrx - 1, hy + 4, 2, 2, look.earrings); R(hx + hrx - 1, hy + 4, 2, 2, look.earrings); }
    // hair on top
    const top = hy - hry;
    switch (look.hairStyle || (kid ? 'short' : 'side')) {
      case 'bald': E(hx - hrx + 1, hy - 1, 2, 4, old ? '#b8b4ae' : hair); E(hx + hrx - 1, hy - 1, 2, 4, old ? '#b8b4ae' : hair); R(hx - 3, top + 2, 6, 1, 'rgba(255,255,255,0.25)'); break;
      case 'spiky': E(hx, top + 4, hrx + 1, 6, hair, top - 2, top + 6); for (let x = hx - 8; x <= hx + 6; x += 3) R(x, top - 2, 2, 3, hair); break;
      case 'puff': E(hx, top + 3, hrx + 2, 7, hair, top - 4, top + 7); R(hx - hrx - 1, top + 4, 3, 7, hair); R(hx + hrx - 2, top + 4, 3, 7, hair); break;
      case 'curly': for (let i = 0; i < 9; i++) E(hx - 9 + i * 2.2, top + 2 + (i % 2), 3, 3, hair); R(hx - hrx, top + 3, 3, 8, hair); R(hx + hrx - 3, top + 3, 3, 8, hair); break;
      case 'long': case 'braid': case 'bun':
        E(hx, top + 4, hrx + 1, 6, hair, top - 2, top + 7);
        R(hx - hrx - 1, top + 5, 3, 10, hair); R(hx + hrx - 2, top + 5, 3, 10, hair);
        R(hx, top + 1, 1, 5, shade(hair, 1.4)); // parting
        if (look.hairStyle === 'braid') { // plait over the right shoulder with a ribbon
          for (let k = 0; k < 6; k++) R(hx + hrx - 1 + (k & 1), hy + 6 + k * 2.4, 3, 2, k & 1 ? U.shade(hair, 1.5) : hair);
          R(hx + hrx - 1, hy + 20, 4, 2, look.ribbon || '#c03030');
        }
        break;
      case 'oiled': E(hx, top + 4, hrx + 1, 6, hair, top - 1, top + 7); R(hx - 6, top + 1, 9, 1, 'rgba(255,255,255,0.35)'); R(hx - hrx, top + 5, 2, 6, hair); R(hx + hrx - 2, top + 5, 2, 6, hair); break;
      default: // short / side parting
        E(hx, top + 4, hrx + 1, 6, hair, top - 2, top + 7);
        R(hx - hrx, top + 5, 2, 5, hair); R(hx + hrx - 2, top + 5, 2, 5, hair);
        if (look.hairStyle !== 'short') R(hx - 4, top + 6, 9, 2, hair); // fringe swept to the side
    }
    if (old && look.hairStyle !== 'bald') { R(hx - hrx, top + 5, 2, 3, '#c8c4bc'); R(hx + hrx - 2, top + 5, 2, 3, '#c8c4bc'); }
    if (look.flowers) for (let i = 0; i < 5; i++) R(hx - hrx - 1 + i * 2, top + 1 + (i % 2), 2, 2, '#f8f4ea');
    // face
    const ey = hy + 1;
    const brow = mood === 'angry' ? 1 : mood === 'sad' ? -1 : 0;
    R(hx - 6, ey - 3 + (brow > 0 ? 1 : 0), 4, 1, shade(hair, 0.9)); R(hx + 2, ey - 3 + (brow > 0 ? 1 : 0), 4, 1, shade(hair, 0.9));
    if (brow > 0) { R(hx - 3, ey - 2, 1, 1, shade(hair, 0.9)); R(hx + 2, ey - 2, 1, 1, shade(hair, 0.9)); }
    if (brow < 0) { R(hx - 6, ey - 4, 1, 1, shade(hair, 0.9)); R(hx + 5, ey - 4, 1, 1, shade(hair, 0.9)); }
    const eyeH = mood === 'surprised' ? 3 : 2;
    R(hx - 5, ey - 1, 3, eyeH, '#f4f0e8'); R(hx + 2, ey - 1, 3, eyeH, '#f4f0e8');
    R(hx - 4, ey - 1, 2, eyeH, '#1a1010'); R(hx + 3, ey - 1, 2, eyeH, '#1a1010');
    if (mood === 'happy') { R(hx - 5, ey + 1, 3, 1, skin); R(hx + 2, ey + 1, 3, 1, skin); }
    R(hx, ey + 1, 1, 4, shade(skin, 0.82)); R(hx - 1, ey + 4, 3, 1, shade(skin, 0.78)); // nose
    if (look.bindi) R(hx - 0.5, ey - 5, 2, 2, look.bindi === true ? '#c0202a' : look.bindi);
    // mouth
    const my = hy + 7;
    if (mood === 'happy') { R(hx - 3, my, 6, 1, '#5a2020'); R(hx - 2, my + 1, 4, 1, '#f4f0e8'); R(hx - 4, my - 1, 1, 1, '#5a2020'); R(hx + 3, my - 1, 1, 1, '#5a2020'); }
    else if (mood === 'angry') { R(hx - 3, my, 6, 2, '#5a2020'); R(hx - 2, my, 4, 1, '#f4f0e8'); }
    else if (mood === 'sad') { R(hx - 2, my, 4, 1, '#5a2020'); R(hx - 3, my + 1, 1, 1, '#5a2020'); R(hx + 2, my + 1, 1, 1, '#5a2020'); }
    else if (mood === 'surprised') { E(hx, my + 1, 1.6, 2, '#5a2020'); }
    else R(hx - 2, my, 5, 1, '#6a2a24');
    // facial hair
    if (look.moustache) {
      const mc = old ? '#9a9690' : hair;
      if (look.moustache === 'thick') { R(hx - 4, my - 2, 9, 2, mc); R(hx - 5, my - 1, 2, 2, mc); R(hx + 4, my - 1, 2, 2, mc); }
      else R(hx - 3, my - 2, 7, 1, mc);
    }
    if (look.beard) {
      const bc = old ? '#b8b4ae' : hair;
      if (look.beard === 'stubble') { ctx.fillStyle = 'rgba(30,20,20,0.25)'; ctx.fillRect(hx - 6, my - 2, 12, 6); }
      else { E(hx, my + 3, 7, look.beard === 'long' ? 7 : 4, bc, my - 1, my + 12); R(hx - 2, my, 5, 1, '#6a2a24'); }
    }
    if (look.specs) {
      const sc = look.specs === 'thick' ? '#1a1414' : '#3a3030';
      ctx.strokeStyle = sc; ctx.lineWidth = 1;
      if (look.specs === 'round') { ctx.beginPath(); ctx.arc(hx - 3.5, ey + 0.5, 3, 0, Math.PI * 2); ctx.arc(hx + 4.5, ey + 0.5, 3, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.strokeRect(hx - 7.5, ey - 2.5, 7, 5); ctx.strokeRect(hx + 1.5, ey - 2.5, 7, 5); }
      R(hx - 1, ey - 1, 3, 1, sc);
      R(hx - 6, ey - 2, 2, 1, 'rgba(255,255,255,0.45)'); R(hx + 3, ey - 2, 2, 1, 'rgba(255,255,255,0.45)');
    }
    // headwear
    if (look.cap === 'topi' || look.cap === 'skull') { E(hx, top + 3, hrx, 5, look.capColor || '#f4f2ea', top - 2, top + 5); R(hx - hrx, top + 4, hrx * 2, 1, 'rgba(0,0,0,0.12)'); }
    else if (look.cap === 'gandhi') { R(hx - hrx, top + 1, hrx * 2, 4, '#f4f2ea'); R(hx - hrx + 1, top, hrx * 2 - 2, 1, '#e8e4d8'); }
    else if (look.cap === 'police') { R(hx - hrx - 1, top - 1, hrx * 2 + 2, 6, '#6a5a3a'); R(hx - hrx - 1, top + 4, hrx * 2 + 2, 2, '#1a1a22'); R(hx - 2, top, 4, 3, '#c9a227'); }
    else if (look.cap === 'cricket') { E(hx, top + 3, hrx + 1, 5, look.capColor || '#2a5cb8', top - 2, top + 5); R(hx - 2, top + 4, hrx + 6, 2, look.capColor || '#2a5cb8'); }
    // dupatta over the head
    if (look.dupatta) { E(hx, top + 5, hrx + 3, 8, look.dupatta, top - 3, top + 6); R(hx - hrx - 3, top + 5, 3, 22, look.dupatta); R(hx + hrx, top + 5, 3, 22, look.dupatta); }
    // frame vignette
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    R(0, 0, 48, 1, 'rgba(0,0,0,0.3)'); R(0, 47, 48, 1, 'rgba(0,0,0,0.3)');
    ctx.restore();
  }

  /* ============================================================ glossary */
  const GLOSSARY = {
    nakko: 'no / don’t (Hyderabadi)', hau: 'yes (Hyderabadi)', 'kya re': 'what’s up, man', baigan: 'nonsense! (lit. brinjal)',
    hallu: 'slowly, easy', pakka: 'for sure', mast: 'awesome', kaiku: 'why?', 'kya bolte': 'what do you say?', ekdum: 'totally',
    bhai: 'brother / buddy', anna: 'elder brother (Telugu)', akka: 'elder sister (Telugu)', amma: 'mother', nanna: 'father (Telugu)',
    ammamma: 'grandmother (mother’s mother)', thatha: 'grandfather', dosth: 'friend', lafda: 'trouble, a fight', zabardast: 'fantastic',
    khatarnak: 'dangerous / super cool', bindaas: 'carefree', chillar: 'loose change', galli: 'lane, alley', bandi: 'roadside cart',
    pilla: 'kid', kanna: 'dear child (Telugu)', arre: 'hey!', abba: 'dad (Urdu)', ammi: 'mom (Urdu)', chacha: 'uncle',
    gaadi: 'vehicle', kiraaya: 'rent', 'irani chai': 'thick sweet tea of the Irani cafés', 'osmania biscuit': 'salty-sweet biscuit for dunking in chai',
    'do pauna': 'two “three-quarter” cups of chai', kirkiri: 'hassle, irritation', 'hallu hallu': 'slowly, slowly', chappal: 'slipper (Amma’s weapon)',
    maidan: 'open ground', 'chai bandi': 'tea cart', 'bole to': 'meaning…', poriya: 'boy (Telugu slang)', gurthunda: 'do you remember? (Telugu)',
  };

  /* ============================================================ speakers */
  const speakers = {};
  function define(id, spec) {
    const s = Object.assign({ id, name: id, color: '#f2c230', look: null, portrait: null, voice: 1 }, spec || {});
    s._cache = {};
    speakers[id] = s;
    return s;
  }
  function speaker(id) {
    if (!id) return speakers.narrator;
    const known = speakers[id];
    if (known) {
      // §10 also allows plain assignment: N.dialogue.speakers[id] = {name, color, portrait}
      if (!known._cache) { known.id = known.id || id; known._cache = {}; if (known.name == null) known.name = id; if (!known.color) known.color = '#f2c230'; }
      return known;
    }
    // unknown speaker: make a plausible one from the id (seeded look)
    const rng = U.rng('spk:' + id);
    const look = N.people ? N.people.randomLook(rng) : {};
    const name = String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return define(id, { name, color: rng.pick(['#f2c230', '#2a8c82', '#d8402a', '#7a3a8a', '#3a8a3a', '#c86a2a']), look });
  }
  define('narrator', { name: '', color: '#b9aa92', portrait: false });
  define('you', { name: 'Chinnu', color: '#d8402a', look: { kind: 'kid', skin: '#a8703f', hair: '#1a1412', hairStyle: 'spiky', shirt: '#d8402a', stripes: '#f2c230', bg: '#3a2030' } });

  function portraitCanvas(spk, mood) {
    if (spk.portrait === false) return null;
    const key = mood || 'neutral';
    if (spk._cache[key]) return spk._cache[key];
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const g = c.getContext('2d');
    try {
      if (typeof spk.portrait === 'function') spk.portrait(g, 48, 48, mood);
      else paintPortrait(g, 48, 48, spk.look || {}, mood);
    } catch (e) { N.err('dialogue.portrait:' + spk.id, e); }
    spk._cache[key] = c;
    return c;
  }

  /* ================================================================= DOM */
  const dom = {};
  function build() {
    const host = document.getElementById('overlay') || document.body;
    const box = document.createElement('div');
    box.id = 'dialogue';
    box.className = 'dlg';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML =
      '<div class="dlg-box">' +
      '<div class="dlg-face"><canvas width="48" height="48"></canvas></div>' +
      '<div class="dlg-body">' +
      '<div class="dlg-name"></div>' +
      '<div class="dlg-text"></div>' +
      '<div class="dlg-choices"></div>' +
      '<div class="dlg-gloss"></div>' +
      '</div>' +
      '<div class="dlg-next" aria-hidden="true">&#9660;</div>' +
      '</div>';
    host.appendChild(box);
    dom.box = box;
    dom.face = box.querySelector('.dlg-face');
    dom.faceCanvas = dom.face.querySelector('canvas');
    dom.name = box.querySelector('.dlg-name');
    dom.text = box.querySelector('.dlg-text');
    dom.choices = box.querySelector('.dlg-choices');
    dom.gloss = box.querySelector('.dlg-gloss');
    dom.next = box.querySelector('.dlg-next');
    // tap / click anywhere on the box = ACTION (choices handle their own taps)
    box.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.dlg-choice')) return;
      e.preventDefault();
      if (cur && LIVE[N.state.mode]) poke();
    });
    window.addEventListener('keydown', (e) => {
      if (!cur || !cur.choices || cur.typing || !LIVE[N.state.mode]) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= cur.choices.length) { e.preventDefault(); pick(n - 1); }
    });
  }

  /* =============================================================== state */
  // Modes in which the box types, takes input and advances (not under pause/map/journal).
  const LIVE = { play: 1, dialogue: 1, cutscene: 1, minigame: 1, gameover: 1 };
  const queue = [];
  let cur = null;          // the line on screen
  let open = false, pushed = false, closeTimer = 0;

  function parse(text) {
    // returns [{t, slang}] segments; *word* -> slang
    const out = [];
    const re = /\*([^*]+)\*/g;
    let last = 0, m;
    text = String(text == null ? '' : text);
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index), slang: false });
      out.push({ t: m[1], slang: true });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ t: text.slice(last), slang: false });
    return out;
  }
  function glossFor(word) {
    const k = String(word).toLowerCase().replace(/[^a-z\s'’]/g, '').trim();
    return D.glossary[k] || D.glossary[k.replace(/s$/, '')] || null;
  }

  function show(line) {
    const spk = speaker(line.s);
    cur = line;
    line.spk = spk;
    line.typing = true; line.shown = 0; line.acc = 0; line.wait = 0; line.blip = 0;
    line.sel = line.choices ? Math.max(0, Math.min(line.choices.length - 1, line.def || 0)) : 0;
    // portrait + name plate
    const pc = portraitCanvas(spk, line.mood);
    dom.box.classList.toggle('no-face', !pc);
    dom.box.classList.toggle('narrator', spk.id === 'narrator');
    if (pc) { const g = dom.faceCanvas.getContext('2d'); g.clearRect(0, 0, 48, 48); g.drawImage(pc, 0, 0); }
    dom.name.textContent = spk.name || '';
    dom.name.style.setProperty('--spk', spk.color || '#f2c230');
    dom.box.style.setProperty('--spk', spk.color || '#f2c230');
    dom.name.classList.toggle('empty', !spk.name);
    // text as per-character spans so wrapping never jumps while typing
    dom.text.innerHTML = '';
    line.chars = [];
    const glosses = [];
    for (const seg of parse(line.t)) {
      let parent = dom.text;
      if (seg.slang) {
        parent = document.createElement('span');
        parent.className = 'slang';
        const g = glossFor(seg.t);
        if (g) { parent.title = g; if (!glosses.some((q) => q[0] === seg.t.toLowerCase())) glosses.push([seg.t.toLowerCase(), g]); }
        dom.text.appendChild(parent);
      }
      for (const ch of seg.t) {
        if (ch === '\n') { parent.appendChild(document.createElement('br')); continue; }
        const sp = document.createElement('span');
        sp.className = 'c';
        sp.textContent = ch;
        parent.appendChild(sp);
        line.chars.push(sp);
      }
    }
    dom.gloss.innerHTML = '';
    for (const [w, g] of glosses) {
      const e = document.createElement('span');
      e.className = 'gl';
      e.innerHTML = '<b></b> ';
      e.firstChild.textContent = w;
      e.appendChild(document.createTextNode(g));
      dom.gloss.appendChild(e);
    }
    dom.gloss.classList.remove('show');
    dom.choices.innerHTML = '';
    dom.choices.classList.remove('show');
    dom.box.classList.remove('ready', 'choosing');
    if (line.choices) {
      line.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.tabIndex = -1;
        b.className = 'dlg-choice';
        b.innerHTML = '<span class="k">' + (i + 1) + '</span><span class="t"></span>';
        b.querySelector('.t').textContent = String(c);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!LIVE[N.state.mode]) return; if (cur === line && !line.typing) pick(i); else if (cur === line) finishTyping(); });
        b.addEventListener('pointerenter', () => { if (cur === line && !line.typing) { line.sel = i; markSel(); } });
        dom.choices.appendChild(b);
      });
    }
    N.emit('dialogue:line', { speaker: spk.id, text: line.t, choices: line.choices || null });
    if (D.skip) { finishTyping(); }
  }

  function finishTyping() {
    const line = cur;
    if (!line) return;
    for (let i = line.shown; i < line.chars.length; i++) line.chars[i].classList.add('on');
    line.shown = line.chars.length;
    line.typing = false;
    line.doneAt = performance.now();
    line.doneT = N.time.now; // game time: an auto line never expires while paused
    dom.box.classList.add('ready');
    if (dom.gloss.childNodes.length) dom.gloss.classList.add('show');
    if (line.choices) { dom.choices.classList.add('show'); dom.box.classList.add('choosing'); markSel(); }
  }
  function markSel() {
    const kids = dom.choices.children;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('sel', i === cur.sel);
  }
  // ACTION / tap: complete the line, or advance / confirm
  function poke() {
    const line = cur;
    if (!line) return;
    if (line.typing) { finishTyping(); return; }
    if (performance.now() - (line.doneAt || 0) < 120) return; // swallow double taps
    if (line.choices) pick(line.sel);
    else done(undefined);
  }
  function pick(i) {
    const line = cur;
    if (!line || !line.choices || line.typing) return;
    N.emit('dialogue:choice', { speaker: line.spk.id, index: i, text: line.choices[i] });
    done(i);
  }
  function done(result) {
    const line = cur;
    cur = null;
    if (!line) return;
    try { line.resolve(result); } catch (e) { N.err('dialogue.resolve', e); }
    next();
  }

  function openBox() {
    clearTimeout(closeTimer);
    if (!open) {
      open = true;
      D.active = true;
      dom.box.classList.add('show');
      if (N.state.mode === 'play') { N.state.push('dialogue'); pushed = true; }
      N.emit('dialogue:open', {});
    }
  }
  function closeBox() {
    if (!open) return;
    open = false;
    D.active = false;
    dom.box.classList.remove('show', 'ready');
    // pop our 'dialogue' state even when the pause menu sits on top of it (cancelled by a load)
    if (pushed) { pushed = false; N.state.remove('dialogue'); }
    N.emit('dialogue:close', {});
  }
  function next() {
    if (cur) return;
    const line = queue.shift();
    if (!line) {
      // keep the box (and the dialogue state) up between lines a script says back to back
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => { if (!cur && !queue.length) closeBox(); }, 30);
      return;
    }
    if (D.skip) { // instant: resolve without showing anything
      N.emit('dialogue:line', { speaker: line.s, text: line.t, choices: line.choices || null, skipped: true });
      const r = line.choices ? (line.def || 0) : undefined;
      Promise.resolve().then(() => line.resolve(r));
      next();
      return;
    }
    openBox();
    show(line);
  }
  function enqueue(line) {
    return new Promise((resolve) => {
      line.resolve = resolve;
      queue.push(line);
      if (dom.box) next(); else Promise.resolve().then(next);
    });
  }

  /* ================================================================= API */
  const D = (N.dialogue = {
    speakers, glossary: GLOSSARY, skip: false, active: false, textSpeed: 1,
    define, speaker, paintPortrait, portraitCanvas,
    /** Show one line; resolves when the player advances. opts: {mood, auto (s)} */
    say(speakerId, text, opts) {
      opts = opts || {};
      return enqueue({ s: speakerId, t: text, mood: opts.mood, auto: opts.auto });
    },
    /** Prompt + options; resolves with the chosen index. opts: {mood, default} */
    choice(speakerId, prompt, options, opts) {
      opts = opts || {};
      const list = (options || []).map(String);
      if (!list.length) return D.say(speakerId, prompt, opts).then(() => 0);
      return enqueue({ s: speakerId, t: prompt, choices: list, def: opts.default || 0, mood: opts.mood });
    },
    /** A conversation: [{s, t, mood?, choices?}]. Resolves with the last choice index (if any). */
    async play(lines) {
      let last;
      for (const l of lines || []) {
        if (!l) continue;
        if (l.choices) last = await D.choice(l.s, l.t, l.choices, l);
        else await D.say(l.s, l.t, l);
      }
      return last;
    },
    /** Close the box and resolve everything pending (lines -> undefined, choices -> -1). */
    cancel() {
      const pend = queue.splice(0);
      if (cur) pend.unshift(cur);
      cur = null;
      for (const l of pend) { try { l.resolve(l.choices ? -1 : undefined); } catch (e) { N.err('dialogue.cancel', e); } }
      closeBox();
    },
    /** Programmatic ACTION (tests, cutscenes). */
    advance() { poke(); },
    isOpen: () => open,
    get current() { return cur ? { speaker: cur.spk && cur.spk.id, text: cur.t, typing: cur.typing, choices: cur.choices || null, selected: cur.sel } : null; },
  });

  /* ============================================================== system */
  function update(dt) {
    const line = cur;
    if (!line) return;
    const I = N.input;
    if (line.typing) {
      if (line.wait > 0) line.wait -= dt;
      else {
        line.acc += dt * 46 * (D.textSpeed || 1);
        while (line.acc >= 1 && line.shown < line.chars.length) {
          line.acc -= 1;
          const sp = line.chars[line.shown++];
          sp.classList.add('on');
          const ch = sp.textContent;
          if (ch !== ' ' && (line.blip++ & 1) === 0) N.emit('dialogue:char', { speaker: line.spk.id, pitch: line.spk.voice || 1 });
          if (ch === '.' || ch === '!' || ch === '?') { line.wait = 0.16; line.acc = 0; break; }
          if (ch === ',' || ch === '—' || ch === ';') { line.wait = 0.07; line.acc = 0; break; }
        }
        if (line.shown >= line.chars.length) finishTyping();
      }
    } else if (line.auto && !line.choices && N.time.now - (line.doneT || 0) > line.auto) {
      done(undefined);
      return;
    }
    if (I.pressed('action')) { I.consume('action'); poke(); return; }
    if (line.choices && !line.typing) {
      const n = line.choices.length;
      if (I.pressed('up') || I.pressed('left')) { line.sel = (line.sel + n - 1) % n; markSel(); }
      if (I.pressed('down') || I.pressed('right')) { line.sel = (line.sel + 1) % n; markSel(); }
    }
  }

  N.on('game:quit', () => D.cancel());
  N.on('game:new', () => { if (open || queue.length) D.cancel(); });

  N.addSystem({
    id: 'dialogue', order: 12, runIn: ['*'],
    init: build,
    update(dt) { if (cur && LIVE[N.state.mode]) update(dt); },
  });
})();
