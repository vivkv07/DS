/* NOSTALGIA — dialogue.js  (owner: cast agent; ARCHITECTURE.md §10 + §19)
 * Bottom dialogue box (in #overlay): procedural pixel-art bust portrait painted from a look
 * description (mood-tinted), speaker name plate in the speaker's colour, speaker-side layout
 * (the hero speaks from the right, everybody else from the left), typewriter text (ACTION /
 * tap / click completes the line, then advances), *slang* highlighted with the glossary line
 * underneath (and a hover tooltip), choices (arrows / W-S + ACTION, number keys, tap), name
 * tokens, and short in-world speech bubbles ("barks"). While open in play mode it pushes the
 * 'dialogue' state (player controls off, clock stopped).
 *
 * API (all safe to call before boot; lines queue until the DOM exists)
 *   await N.dialogue.say(speakerId, text, {mood, auto: seconds, side: 'left'|'right'})
 *   await N.dialogue.choice(speakerId, prompt, ['A', 'B'], {default, mood}) -> index (-1 cancelled)
 *   await N.dialogue.play([{s, t, mood?, choices?, side?}, ...])        -> last choice index
 *   N.dialogue.define(id, {name, color, look, portrait(ctx, w, h, mood) | false, voice, side,
 *       style: 'tape'|'radio'|'chit'|'email'|null, name2026, look2026, color2026})
 *     look may be an object or a function returning one (variants); name may hold tokens.
 *   N.dialogue.speakers[id]  (plain assignment {name, color, portrait} also works)
 *   N.dialogue.cancel() / advance() / isOpen() / current / skip (debug) / textSpeed
 *   N.dialogue.filter(text)  {nick} {NICK} {full} {FULL} + the bible's global rename rule:
 *       "Chinnu" -> nickname, "chinnu_" (email ids) -> lower-case nickname, "Srikanth" -> full
 *       name. Names come from N.player.nick / N.player.full (menus' name card), falling back to
 *       N.player.name (if not 'You'), N.flags.nick / N.flags.full, then Chinnu / Srikanth.
 *   N.dialogue.setNames({nick, full})  sets N.player.nick/name/full and emits 'names:change'.
 *   N.dialogue.names() -> {nick, full, FULL, NICK, slug}
 *   N.dialogue.glossary  {lower-case word or phrase: meaning}  (bible §10 + systems §17)
 *   N.dialogue.dictionary [{word, tag, meaning, src}] (for the Journal's Hyderabadi dictionary)
 *   N.dialogue.gloss(word) -> [[word, meaning], ...] | null (phrase-aware lookup)
 *   N.dialogue.paintPortrait(ctx, w, h, look, mood) / portraitCanvas(speaker, mood)
 *   N.dialogue.bark(target, text, {secs, speaker, color, name, blip, h}) -> {close(), done}
 *       target: actor | npc id | {x, y} | 'player'. A paper speech bubble above the target in
 *       the world (DOM, positioned each frame; one per target; max 6). Emits 'dialogue:bark'.
 *   N.dialogue.is2026() -> the epilogue switch (N.flags.year === 2026 | N.flags.year2026 |
 *       N.seasons.is('year2026')): speakers with look2026/name2026 switch automatically.
 * Moods: neutral happy laugh angry sad surprised shout worried wink tired
 *        (aliases grin→happy, sulk→sad, shock→surprised, cross→angry, smug→wink, proud→happy).
 * Events: dialogue:open|close, dialogue:line {speaker, text, choices}, dialogue:char {speaker,
 *   pitch}, dialogue:choice {speaker, index, text}, dialogue:bark {speaker, text}.
 * Speaker ids 'you' -> 'chinnu' (2003) / 'srikanth' (2026) when those are defined (npcs.js
 * defines the whole cast from the story bible §2 and registers every one here).
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;

  /* ============================================================ helpers */
  function is2026() {
    const f = N.flags || {};
    if (f.year === 2026 || f.year === '2026' || f.year2026 === true) return true;
    try { if (N.seasons && typeof N.seasons.is === 'function' && N.seasons.is('year2026')) return true; } catch (e) { /* stub seasons */ }
    return false;
  }

  /* ============================================================ names */
  function clean(s, max) { return String(s).replace(/[<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 24); }
  function names() {
    const p = N.player || {}, f = N.flags || {};
    let nick = p.nick || (typeof p.name === 'string' && p.name && p.name !== 'You' ? p.name : '') || f.nick || 'Chinnu';
    let full = p.full || p.fullName || p.formalName || f.full || f.fullName || 'Srikanth';
    nick = clean(nick, 16) || 'Chinnu';
    full = clean(full, 24) || 'Srikanth';
    const slug = nick.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '') || 'chinnu';
    return { nick, full, NICK: nick.toUpperCase(), FULL: full.toUpperCase(), slug };
  }
  function filter(text) {
    if (text == null) return '';
    let s = String(text);
    if (s.indexOf('{') < 0 && s.indexOf('hinnu') < 0 && s.indexOf('HINNU') < 0 && s.indexOf('rikanth') < 0 && s.indexOf('RIKANTH') < 0) return s;
    const n = names();
    s = s.replace(/\{nick\}/g, () => n.nick).replace(/\{NICK\}/g, () => n.NICK)
      .replace(/\{full\}/g, () => n.full).replace(/\{FULL\}/g, () => n.FULL);
    if (n.nick !== 'Chinnu') {
      s = s.replace(/\bchinnu(?=_)/g, () => n.slug).replace(/\bChinnu\b/g, () => n.nick).replace(/\bCHINNU\b/g, () => n.NICK);
    }
    if (n.full !== 'Srikanth') s = s.replace(/\bSrikanth\b/g, () => n.full).replace(/\bSRIKANTH\b/g, () => n.FULL);
    return s;
  }

  /* ============================================================ portraits */
  const MOOD_ALIAS = { grin: 'happy', smile: 'happy', proud: 'happy', sulk: 'sad', shock: 'surprised', shocked: 'surprised', cross: 'angry', mad: 'angry', smug: 'wink', sly: 'wink', sleepy: 'tired', yell: 'shout', laughing: 'laugh', scared: 'worried', nervous: 'worried' };
  const MOOD_TINT = { happy: '#f2c230', laugh: '#ffb347', angry: '#e2483a', shout: '#ff6a2a', sad: '#3a6ad8', surprised: '#e8f0ff', worried: '#9a6ad8', wink: '#ff5fb0', tired: '#7a8a9a' };
  function normMood(m) { m = m ? String(m).toLowerCase() : 'neutral'; return MOOD_ALIAS[m] || m; }

  /** Paint a bust (48x48 design grid, scaled to w x h) from a look description. Fields:
   *  kind (N.people kind: fills defaults), skin, hair, hairStyle (short side long bun braid plaits
   *  ponytails bald spiky thin puff curly oiled cropped), streak, moustache (true thin thick huge),
   *  beard (true trim stubble long), beardColor, brows, specs (true round taped thick aviator thin),
   *  specsChain, cap (topi skull gandhi police cricket backcap pith irani dhaka hood), capColor,
   *  dupatta, burqa (true = face open | 'niqab'), bindi, nosestud, earrings, flowers, ribbon,
   *  shirt, stripes, collar (false 'band' 'v'), pockets, tie, tieStripe, jacket, jacketKind
   *  (denim cardigan windcheater sweater safari), saree + border + blouse, vest, apron, towel,
   *  lanyard, idcard, whistle, camera, walkman, pens, badge, earPen, floral, paint (body paint),
   *  tape (cassette overlay), age (kid teen adult old), bg. */
  function paintPortrait(ctx, w, h, look, mood) {
    look = Object.assign({}, look || {});
    mood = normMood(mood);
    const kind = look.kind || '';
    if (kind === 'aunty' || kind === 'saree') { look.hairStyle = look.hairStyle || 'bun'; if (look.bindi == null) look.bindi = true; if (look.flowers == null) look.flowers = kind === 'aunty'; }
    if (kind === 'woman') look.hairStyle = look.hairStyle || 'braid';
    if (kind === 'burqa' && !look.burqa) look.burqa = true;
    if (kind === 'uncle') { look.hairStyle = look.hairStyle || 'bald'; if (look.moustache == null) look.moustache = 'thick'; look.age = look.age || 'old'; }
    if (kind === 'police') { look.cap = look.cap || 'police'; if (look.moustache == null) look.moustache = 'thick'; look.shirt = look.shirt || '#b8a070'; }
    if (kind === 'kid' || kind === 'student') look.age = look.age || 'kid';
    let skin = look.skin || '#a0683f';
    if (look.paint) skin = U.mix(skin, look.paint, 0.62);
    const hair = look.hair || (look.age === 'old' ? '#c8c4bc' : '#1a1412');
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
    const P = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); };
    const Ln = (x0, y0, x1, y1, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw || 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    const shade = (c, f) => U.shade(c, f);
    const kid = look.age === 'kid', old = look.age === 'old', teen = look.age === 'teen';
    let bg = look.bg || '#2a2034';
    if (MOOD_TINT[mood]) bg = U.mix(bg, MOOD_TINT[mood], mood === 'surprised' ? 0.18 : 0.26);

    // ---------------------------------------------------------- background
    R(0, 0, 48, 48, bg);
    E(30, 14, 22, 18, shade(bg, 1.14));
    if (mood === 'surprised' || mood === 'shout') { // burst lines behind the head
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.2;
      for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(24 + Math.cos(t) * 14, 20 + Math.sin(t) * 14); ctx.lineTo(24 + Math.cos(t) * 34, 20 + Math.sin(t) * 34); ctx.stroke(); }
    }
    for (let y = 2; y < 48; y += 4) R(0, y, 48, 1, 'rgba(0,0,0,0.08)');
    const hx = 24, hy = kid ? 22 : 20; // head centre
    const hrx = kid ? 9 : 8.5, hry = kid ? 10 : 11;
    const top = hy - hry;
    const ey = hy + 1;      // eye line
    const my = hy + 7;      // mouth line

    // ------------------------------------------------------------- face parts (shared)
    function faceFeatures(eyeDark) {
      const browC = look.brows || shade(hair === '#c8c4bc' ? '#8a8680' : hair, 0.9);
      const bOff = mood === 'angry' || mood === 'shout' ? 1 : 0;
      // brows
      if (mood === 'sad' || mood === 'worried') { R(hx - 6, ey - 3, 3, 1, browC); R(hx - 4, ey - 4, 2, 1, browC); R(hx + 3, ey - 3, 3, 1, browC); R(hx + 2, ey - 4, 2, 1, browC); }
      else if (mood === 'surprised') { R(hx - 6, ey - 5, 4, 1, browC); R(hx + 2, ey - 5, 4, 1, browC); }
      else {
        R(hx - 6, ey - 3 + bOff, 4, 1, browC); R(hx + 2, ey - 3 + bOff, 4, 1, browC);
        if (bOff) { R(hx - 3, ey - 2, 1, 1, browC); R(hx + 2, ey - 2, 1, 1, browC); }
      }
      if (look.brows && old) { R(hx - 6, ey - 3, 4, 1, look.brows); R(hx + 2, ey - 3, 4, 1, look.brows); }
      // eyes
      const W = '#f4f0e8', K = eyeDark || '#1a1010';
      const closedL = mood === 'happy' || mood === 'laugh' || mood === 'wink';
      const closedR = mood === 'happy' || mood === 'laugh';
      const eye = (x, closed) => {
        if (closed) { R(x, ey, 3, 1, K); R(x - 1, ey + 1, 1, 1, K); R(x + 3, ey + 1, 1, 1, K); return; }
        if (mood === 'tired') { R(x, ey, 3, 1, shade(skin, 0.7)); R(x, ey + 1, 3, 1, W); R(x + 1, ey + 1, 2, 1, K); return; }
        if (mood === 'shout') { R(x, ey - 1, 3, 1, K); R(x + 1, ey, 1, 1, K); R(x, ey + 1, 3, 1, K); return; }
        const eh = mood === 'surprised' ? 3 : mood === 'angry' ? 1 : 2;
        const dy = mood === 'sad' ? 1 : 0;
        R(x, ey - 1 + (mood === 'angry' ? 1 : 0), 3, eh, W);
        R(x + 1, ey - 1 + (mood === 'angry' ? 1 : 0) + dy, 2, Math.max(1, eh - dy), K);
        if (mood === 'surprised') R(x + 1, ey - 1, 1, 1, '#ffffff');
      };
      eye(hx - 5, closedL); eye(hx + 2, closedR);
      if (old) { R(hx - 5, ey + 2, 3, 1, shade(skin, 0.86)); R(hx + 2, ey + 2, 3, 1, shade(skin, 0.86)); }
      // nose
      R(hx, ey + 1, 1, 4, shade(skin, 0.82)); R(hx - 1, ey + 4, 3, 1, shade(skin, 0.78));
      if (look.nosestud) R(hx + 1, ey + 3, 1, 1, look.nosestud);
      if (look.bindi) R(hx - 0.5, ey - 5, 2, 2, look.bindi === true ? '#c0202a' : look.bindi);
      if (look.paint) { R(hx - 1, ey - 7, 1, 3, '#c0202a'); R(hx + 1, ey - 7, 1, 3, '#c0202a'); }
      if (mood === 'happy' || mood === 'laugh' || (kid && mood === 'wink')) { R(hx - 7, ey + 3, 3, 1, 'rgba(230,90,110,0.55)'); R(hx + 4, ey + 3, 3, 1, 'rgba(230,90,110,0.55)'); }
      // mouth
      const M = '#5a2020', T = '#f4f0e8';
      switch (mood) {
        case 'happy': R(hx - 3, my, 6, 1, M); R(hx - 2, my + 1, 4, 1, T); R(hx - 4, my - 1, 1, 1, M); R(hx + 3, my - 1, 1, 1, M); break;
        case 'laugh': E(hx, my + 1, 3.5, 2.5, M); R(hx - 2, my - 1, 4, 1, T); R(hx - 1, my + 2, 2, 1, '#c05050'); break;
        case 'angry': R(hx - 3, my, 6, 2, M); R(hx - 2, my, 4, 1, T); break;
        case 'shout': E(hx, my + 2, 3.5, 3.5, M); R(hx - 2, my - 1, 4, 1, T); R(hx - 1, my + 3, 3, 2, '#c05050'); break;
        case 'sad': R(hx - 2, my, 4, 1, M); R(hx - 3, my + 1, 1, 1, M); R(hx + 2, my + 1, 1, 1, M); break;
        case 'surprised': E(hx, my + 1, 1.6, 2, M); break;
        case 'worried': R(hx - 3, my + 1, 2, 1, M); R(hx - 1, my, 2, 1, M); R(hx + 1, my + 1, 2, 1, M); break;
        case 'wink': R(hx - 2, my, 4, 1, M); R(hx + 2, my - 1, 2, 1, M); break;
        case 'tired': R(hx - 1, my, 3, 1, '#6a2a24'); break;
        default: R(hx - 2, my, 5, 1, '#6a2a24');
      }
    }
    function facialHair() {
      if (look.moustache) {
        const mc = look.moustacheColor || look.beardColor || (old ? '#9a9690' : hair === '#c8c4bc' ? '#9a9690' : hair);
        if (look.moustache === 'huge') { R(hx - 6, my - 2, 13, 2, mc); R(hx - 8, my - 3, 3, 2, mc); R(hx + 6, my - 3, 3, 2, mc); R(hx - 9, my - 5, 2, 2, mc); R(hx + 8, my - 5, 2, 2, mc); }
        else if (look.moustache === 'thick') { R(hx - 4, my - 2, 9, 2, mc); R(hx - 5, my - 1, 2, 2, mc); R(hx + 4, my - 1, 2, 2, mc); }
        else if (look.moustache === 'thin') R(hx - 3, my - 2, 7, 1, mc);
        else { R(hx - 3, my - 2, 7, 1, mc); R(hx - 2, my - 3, 5, 1, mc); }
      }
      if (look.beard) {
        const bc = look.beardColor || (old ? '#b8b4ae' : hair);
        if (look.beard === 'stubble') { ctx.fillStyle = 'rgba(30,20,20,0.28)'; ctx.fillRect(hx - 6, my - 2, 12, 6); ctx.fillRect(hx - 7, my - 4, 2, 4); ctx.fillRect(hx + 5, my - 4, 2, 4); }
        else if (look.beard === 'long') { E(hx, my + 4, 7.5, 9, bc, my - 1, my + 14); R(hx - 8, hy + 1, 2, 7, bc); R(hx + 6, hy + 1, 2, 7, bc); for (let k = 0; k < 4; k++) R(hx - 5 + k * 3, my + 5 + (k & 1), 1, 5, shade(bc, 0.82)); R(hx - 2, my, 5, 1, '#6a2a24'); }
        else { E(hx, my + 3, 7, 4, bc, my - 1, my + 8); R(hx - 8, hy + 2, 2, 6, bc); R(hx + 6, hy + 2, 2, 6, bc); R(hx - 2, my, 5, 1, '#6a2a24'); }
        if (mood === 'laugh' || mood === 'shout') E(hx, my + 1, 3, 2.2, '#5a2020');
      }
    }
    function specs() {
      if (!look.specs) return;
      const sp = look.specs;
      const sc = look.specsColor || (sp === 'thick' ? '#1a1414' : sp === 'aviator' ? '#c9a227' : '#3a3030');
      ctx.strokeStyle = sc; ctx.lineWidth = 1;
      if (sp === 'aviator') {
        P([hx - 8, ey - 2, hx - 1, ey - 2, hx - 2, ey + 3, hx - 6, ey + 3], '#2a2a36');
        P([hx + 1, ey - 2, hx + 8, ey - 2, hx + 6, ey + 3, hx + 2, ey + 3], '#2a2a36');
        R(hx - 7, ey - 1, 2, 1, 'rgba(160,200,255,0.55)'); R(hx + 2, ey - 1, 2, 1, 'rgba(160,200,255,0.55)');
        R(hx - 8, ey - 3, 16, 1, sc);
      } else if (sp === 'round' || sp === 'taped') {
        ctx.beginPath(); ctx.arc(hx - 3.5, ey + 0.5, 3, 0, Math.PI * 2); ctx.moveTo(hx + 7.5, ey + 0.5); ctx.arc(hx + 4.5, ey + 0.5, 3, 0, Math.PI * 2); ctx.stroke();
        R(hx - 1, ey - 1, 3, 1, sc);
        if (sp === 'taped') { R(hx - 1, ey - 2, 3, 3, '#f4f0e8'); R(hx - 1, ey - 1, 3, 1, '#d8d0c0'); }
      } else if (sp === 'thin') {
        ctx.strokeRect(hx - 7.5, ey - 1.5, 7, 4); ctx.strokeRect(hx + 1.5, ey - 1.5, 7, 4); R(hx - 1, ey - 1, 3, 1, sc);
      } else { ctx.lineWidth = sp === 'thick' ? 1.6 : 1; ctx.strokeRect(hx - 7.5, ey - 2.5, 7, 5); ctx.strokeRect(hx + 1.5, ey - 2.5, 7, 5); R(hx - 1, ey - 1, 3, 1, sc); }
      if (sp !== 'aviator') { R(hx - 6, ey - 2, 2, 1, 'rgba(255,255,255,0.45)'); R(hx + 3, ey - 2, 2, 1, 'rgba(255,255,255,0.45)'); }
      if (look.specsChain) { Ln(hx - hrx, ey + 1, hx - hrx - 1, hy + 14, look.specsChain === true ? '#c9a227' : look.specsChain, 0.6); Ln(hx + hrx, ey + 1, hx + hrx + 1, hy + 14, look.specsChain === true ? '#c9a227' : look.specsChain, 0.6); }
    }

    // ------------------------------------------------------------- burqa (face open)
    if (look.burqa) {
      const bq = look.burqaColor || '#141216';
      E(24, 50, 22, 16, bq);
      R(18, 36, 1, 12, shade(bq, 1.5)); R(30, 36, 1, 12, shade(bq, 1.5));
      E(hx, hy, hrx + 3.5, hry + 3, bq);
      if (look.burqa === 'niqab') {
        R(hx - 7, hy - 3, 14, 6, skin);
        R(hx - 5, hy - 1, 3, 2, '#1a1010'); R(hx + 2, hy - 1, 3, 2, '#1a1010');
        R(hx - 8, hy - 4, 16, 1, shade(bq, 1.4));
      } else {
        E(hx, hy + 1, hrx - 1, hry - 1, skin);
        E(hx + 2, hy - 2, hrx - 4, hry - 5, shade(skin, 1.08));
        E(hx, hy - hry + 2, hrx + 1, 4, bq, top - 2, top + 4); // forehead band of the scarf
        if (look.dupatta) { E(hx, top + 1, hrx + 4, 5, look.dupatta, top - 4, top + 3); }
        if (old) { R(hx - 5, hy - 5, 10, 1, shade(skin, 0.88)); }
        faceFeatures(); specs();
      }
      R(hx - 9, hy + 11, 18, 1, shade(bq, 1.6));
      moodMarks(); tapeFx();
      ctx.restore();
      return;
    }

    // ------------------------------------------------------------- hair behind the head
    const hs = look.hairStyle || (kid ? 'short' : 'side');
    if (hs === 'long' || hs === 'braid' || hs === 'plaits') {
      E(hx, hy, hrx + 2.5, hry + 1, hair, top - 2, hy + 3);
      R(hx - hrx - 2, hy - 2, 4, hs === 'long' ? 20 : 10, hair);
      R(hx + hrx - 2, hy - 2, 4, hs === 'long' ? 20 : 10, hair);
    }
    if (hs === 'bun') { E(hx - hrx + 1, hy - 3, 4, 4, hair); if (look.flowers) for (let i = 0; i < 4; i++) R(hx - hrx - 2 + (i & 1) * 2, hy - 6 + i * 2, 2, 2, '#f8f4ea'); }
    if (hs === 'ponytails') {
      for (const s of [-1, 1]) {
        const bx = hx + s * (hrx + 1), by = top + 3;
        for (let k = 0; k < 5; k++) R(bx + s * (k * 1.6) - 1, by - k * 1.4 - 1, 3, 3, k & 1 ? shade(hair, 1.4) : hair);
        R(bx - 1, by - 1, 3, 2, look.ribbon || '#d8202a');
      }
    }

    // ------------------------------------------------------------- shoulders + clothes
    const bodyRx = kid ? 17 : teen ? 19 : 20;
    if (look.vest) { // banian: bare shoulders, white vest
      E(24, 50, bodyRx, 16, skin);
      E(24, 50, bodyRx, 16, shade(skin, 0.86), 45, 48);
      P([15, 48, 15, 38, 18, 35, 20, 35, 21, 39, 27, 39, 28, 35, 30, 35, 33, 38, 33, 48], look.vest === true ? '#f2efe6' : look.vest);
      R(18, 35, 2, 4, look.vest === true ? '#f2efe6' : look.vest); R(28, 35, 2, 4, look.vest === true ? '#f2efe6' : look.vest);
    } else {
      E(24, 50, bodyRx, 16, shirt);
      E(24, 50, bodyRx, 16, shade(shirt, 0.82), 44, 48);
      if (look.floral) for (let y = 37; y < 48; y += 3) for (let x = 7 + ((y / 3) & 1) * 2; x < 42; x += 5) R(x, y, 2, 1, look.floral);
      if (look.stripes) { const sc = look.stripes === true ? shade(shirt, 0.72) : look.stripes; for (let y = 37; y < 48; y += 3) R(6, y, 36, 1, sc); if (look.checks) for (let x = 8; x < 42; x += 4) R(x, 36, 1, 12, sc); }
      if (look.shoulderStripes) { R(10, 37, 6, 1, look.shoulderStripes); R(32, 37, 6, 1, look.shoulderStripes); R(9, 39, 6, 1, look.shoulderStripes); R(33, 39, 6, 1, look.shoulderStripes); }
    }
    if (kind === 'uncle' && !look.shirt && !look.vest && !look.jacket) { E(24, 50, 20, 16, '#f2efe6'); R(16, 34, 2, 14, '#dcd6c8'); R(30, 34, 2, 14, '#dcd6c8'); }
    if (look.saree) { // blouse + pallu over the (wearer's) left shoulder with its border
      const sa = look.saree, bo = look.border || '#f2c230', bl = look.blouse || shade(sa, 0.75);
      E(24, 50, bodyRx, 16, bl);
      P([26, 34, 33, 34, 44, 48, 16, 48], sa);
      Ln(33.5, 34, 44.5, 48, bo, 2);
      Ln(26, 34, 16, 48, shade(sa, 0.8), 1);
      if (look.borderDots) for (let k = 0; k < 4; k++) R(35 + k * 2.5, 37 + k * 3, 1, 1, '#f4f0e8');
    }
    if (look.jacket) {
      const jc = look.jacket, jk = look.jacketKind || 'denim';
      if (jk === 'sweater') { // sleeveless sweater: body panel only
        P([16, 48, 16, 39, 21, 36, 24, 42, 27, 36, 32, 39, 32, 48], jc);
        for (let y = 40; y < 48; y += 2) R(17, y, 14, 1, shade(jc, 0.86));
      } else {
        E(24, 50, bodyRx, 16, jc);
        E(24, 50, bodyRx, 16, shade(jc, 0.82), 44, 48);
        P([20, 35, 24, 44, 28, 35, 27, 48, 21, 48], shirt);
        if (jk === 'denim') { Ln(20, 35, 23, 47, shade(jc, 1.3), 1); Ln(28, 35, 25, 47, shade(jc, 1.3), 1); R(12, 41, 5, 3, shade(jc, 0.8)); R(31, 41, 5, 3, shade(jc, 0.8)); }
        if (jk === 'cardigan') { for (let y = 38; y < 48; y += 3) { R(19, y, 1, 1, '#e8d8b0'); } Ln(20, 35, 21, 48, shade(jc, 0.7), 1); Ln(28, 35, 27, 48, shade(jc, 0.7), 1); }
        if (jk === 'windcheater') { R(23, 36, 2, 12, '#c8c8c8'); P([20, 34, 24, 37, 28, 34, 28, 36, 24, 39, 20, 36], shade(jc, 1.2)); }
      }
    }
    if (look.pockets) { R(14, 39, 6, 5, shade(shirt, 0.9)); R(28, 39, 6, 5, shade(shirt, 0.9)); R(14, 39, 6, 1, shade(shirt, 0.75)); R(28, 39, 6, 1, shade(shirt, 0.75)); R(9, 35, 6, 2, shade(shirt, 0.8)); R(33, 35, 6, 2, shade(shirt, 0.8)); }
    if (look.collar === 'band') { R(19, 34, 10, 2, shade(shirt, 1.1)); R(23, 36, 2, 10, shade(shirt, 0.86)); R(23.5, 38, 1, 1, '#c9a227'); R(23.5, 41, 1, 1, '#c9a227'); }
    else if (look.collar !== false && kind !== 'uncle' && !look.vest && !look.saree && (!look.jacket || look.jacketKind === 'sweater')) {
      ctx.fillStyle = shade(shirt, 1.12);
      ctx.beginPath(); ctx.moveTo(17, 35); ctx.lineTo(24, 42); ctx.lineTo(31, 35); ctx.lineTo(28, 34); ctx.lineTo(24, 38); ctx.lineTo(20, 34); ctx.closePath(); ctx.fill();
    }
    if (kind === 'police') { R(22, 35, 4, 13, '#4a3020'); R(13, 37, 6, 2, '#c03030'); R(29, 37, 6, 2, '#c03030'); }
    if (look.tie) { R(23, 38, 2, 10, look.tie); if (look.tieStripe) for (let y = 39; y < 48; y += 2) R(23, y, 2, 1, look.tieStripe); R(22, 37, 4, 2, shade(look.tie, 0.8)); }
    if (look.apron) { P([18, 48, 18, 40, 30, 40, 30, 48], look.apron); Ln(18, 40, 21, 34, look.apron, 1); Ln(30, 40, 27, 34, look.apron, 1); R(18, 40, 12, 1, shade(look.apron, 1.25)); }
    if (look.towel) { const tc = look.towel; P([8, 48, 10, 37, 16, 34, 19, 36, 15, 48], tc); for (let k = 0; k < 4; k++) { Ln(10 + k * 2, 36, 9 + k * 2.4, 48, 'rgba(255,255,255,0.45)', 0.6); } Ln(9, 41, 17, 41, 'rgba(255,255,255,0.45)', 0.6); Ln(9, 45, 16, 45, 'rgba(255,255,255,0.45)', 0.6); }
    if (look.pens) { R(28, 39, 6, 1, shade(shirt, 0.75)); const pc = ['#2a4ab0', '#c03030', '#1a1a1a']; for (let k = 0; k < Math.min(3, look.pens); k++) R(29 + k * 2, 36, 1, 4, pc[k]); }
    if (look.badge) { E(30, 41, 2, 2, look.badge); R(29, 40, 1, 1, '#ffffff'); }
    if (look.lanyard || look.idcard || look.whistle) {
      const lc = look.lanyard && look.lanyard !== true ? look.lanyard : '#2a5cb8';
      Ln(20.5, 35, 24, 43, lc, 1); Ln(27.5, 35, 24, 43, lc, 1);
      if (look.whistle) { R(23, 42, 4, 2, '#d8dce0'); R(26, 42, 1, 1, '#8a9096'); }
      else { R(21, 43, 6, 5, '#f4f0e8'); R(21, 43, 6, 1, lc); R(22, 45, 2, 2, '#9a7a5a'); }
    }
    if (look.walkman) { Ln(21, 35, 23.5, 41, '#f4f0e8', 0.8); Ln(27, 35, 24.5, 41, '#f4f0e8', 0.8); R(21, 41, 7, 6, '#f2c230'); R(22, 42, 5, 2, '#3a3020'); R(22, 45, 1, 1, '#c03030'); }
    if (look.camera) { Ln(13, 34, 35, 47, '#141414', 1.6); R(31, 41, 11, 7, '#1d1d20'); E(36.5, 44.5, 2.4, 2.4, '#5a6a7a'); R(36, 44, 1, 1, '#d8e4f0'); R(39, 42, 2, 1, '#c9c9c4'); }
    if (look.neem) for (let k = 0; k < 6; k++) { E(14 + k * 4, 37 + (k & 1) * 2, 2, 1.2, '#3a7a2a'); }
    // neck
    R(hx - 4, hy + 8, 8, 7, shade(skin, 0.86));
    if (look.saree || kind === 'aunty' || look.mangalsutra) Ln(20, 35, 24, 40, '#c9a227', 0.6), Ln(28, 35, 24, 40, '#c9a227', 0.6);

    // ------------------------------------------------------------- head
    E(hx - hrx, hy + 1, 2, 3, shade(skin, 0.9)); E(hx + hrx, hy + 1, 2, 3, shade(skin, 0.9));
    E(hx, hy, hrx, hry, skin);
    E(hx + 3, hy - 3, hrx - 4, hry - 5, shade(skin, 1.08));     // lit side
    E(hx, hy + hry - 2, hrx - 2, 3, shade(skin, 0.9), hy + hry - 3, hy + hry + 1); // jaw shade
    if (look.earrings) { R(hx - hrx - 1, hy + 4, 2, 2, look.earrings); R(hx + hrx - 1, hy + 4, 2, 2, look.earrings); }
    if (look.paint) { R(hx - 6, hy + 4, 2, 1, '#c03030'); R(hx + 4, hy + 4, 2, 1, '#c03030'); }

    // hair on top
    switch (hs) {
      case 'bald': E(hx - hrx + 1, hy - 1, 2, 4, look.hair || (old ? '#b8b4ae' : hair)); E(hx + hrx - 1, hy - 1, 2, 4, look.hair || (old ? '#b8b4ae' : hair)); R(hx - 3, top + 2, 6, 1, 'rgba(255,255,255,0.25)'); break;
      case 'spiky':
        E(hx, top + 4, hrx + 1, 6, hair, top - 2, top + 6);
        for (let x = hx - 8; x <= hx + 6; x += 3) R(x, top - 2, 2, 3, hair);
        R(hx + 1, top - 5, 2, 4, hair); R(hx + 3, top - 6, 2, 2, hair); // the cowlick
        R(hx - hrx, top + 5, 2, 4, hair); R(hx + hrx - 2, top + 5, 2, 4, hair);
        break;
      case 'thin': // the same cowlick, going thin (2026)
        E(hx, top + 3, hrx, 4, hair, top - 1, top + 3);
        R(hx - hrx, top + 3, 2, 6, hair); R(hx + hrx - 2, top + 3, 2, 6, hair);
        R(hx + 1, top - 3, 1, 3, hair); R(hx + 2, top - 4, 2, 1, hair);
        R(hx - 3, top + 3, 6, 1, 'rgba(255,255,255,0.18)');
        break;
      case 'cropped': E(hx, top + 3, hrx + 0.5, 5, hair, top - 1, top + 5); R(hx - hrx, top + 4, 2, 5, hair); R(hx + hrx - 2, top + 4, 2, 5, hair); break;
      case 'puff': E(hx, top + 3, hrx + 3, 8, hair, top - 5, top + 7); R(hx - hrx - 1, top + 4, 3, 7, hair); R(hx + hrx - 2, top + 4, 3, 7, hair); R(hx - 4, top - 3, 6, 1, shade(hair, 1.5)); break;
      case 'curly': for (let i = 0; i < 9; i++) E(hx - 9 + i * 2.2, top + 2 + (i % 2), 3, 3, hair); R(hx - hrx, top + 3, 3, 8, hair); R(hx + hrx - 3, top + 3, 3, 8, hair); break;
      case 'long': case 'braid': case 'bun': case 'plaits': case 'ponytails':
        E(hx, top + 4, hrx + 1, 6, hair, top - 2, top + 7);
        R(hx - hrx - 1, top + 5, 3, 10, hair); R(hx + hrx - 2, top + 5, 3, 10, hair);
        R(hx, top + 1, 1, 5, shade(hair, 1.4)); // parting
        if (hs === 'braid') { // plait over the right shoulder with a ribbon
          for (let k = 0; k < 6; k++) R(hx + hrx - 1 + (k & 1), hy + 6 + k * 2.4, 3, 2, k & 1 ? shade(hair, 1.5) : hair);
          R(hx + hrx - 1, hy + 20, 4, 2, look.ribbon || '#c03030');
        }
        if (hs === 'plaits') { // two plaits in front of the shoulders, ribbons at the ends
          for (const s of [-1, 1]) {
            const px = s < 0 ? hx - hrx - 2 : hx + hrx - 1;
            for (let k = 0; k < 6; k++) R(px + (k & 1) * s * 0.5, hy + 4 + k * 2.4, 3, 2, k & 1 ? shade(hair, 1.5) : hair);
            R(px - 1, hy + 18, 5, 2, look.ribbon || '#c03030'); R(px, hy + 20, 1, 2, look.ribbon || '#c03030'); R(px + 2, hy + 20, 1, 2, look.ribbon || '#c03030');
          }
        }
        break;
      case 'oiled': E(hx, top + 4, hrx + 1, 6, hair, top - 1, top + 7); R(hx - 6, top + 1, 9, 1, 'rgba(255,255,255,0.35)'); R(hx - 2, top + 2, 6, 1, 'rgba(255,255,255,0.2)'); R(hx - hrx, top + 5, 2, 6, hair); R(hx + hrx - 2, top + 5, 2, 6, hair); R(hx - 3, top + 1, 1, 5, shade(hair, 1.6)); break;
      default: // short / side parting
        E(hx, top + 4, hrx + 1, 6, hair, top - 2, top + 7);
        R(hx - hrx, top + 5, 2, 5, hair); R(hx + hrx - 2, top + 5, 2, 5, hair);
        if (hs !== 'short') R(hx - 4, top + 6, 9, 2, hair); // fringe swept to the side
        if (hs === 'side') R(hx - 4, top + 1, 1, 5, shade(hair, 1.5));
    }
    if (old && hs !== 'bald' && !look.hair) { R(hx - hrx, top + 5, 2, 3, '#c8c4bc'); R(hx + hrx - 2, top + 5, 2, 3, '#c8c4bc'); }
    if (look.streak) { R(hx - hrx, top + 4, 3, 7, look.streak); R(hx - hrx + 2, top + 2, 2, 3, look.streak); }
    if (look.flowers && hs !== 'bun') for (let i = 0; i < 5; i++) R(hx - hrx - 1 + i * 2, top + 1 + (i % 2), 2, 2, '#f8f4ea');
    if (look.clips) { R(hx - 6, top + 3, 3, 1, look.clips); R(hx + 4, top + 3, 3, 1, look.clips); }
    if (old && hs === 'bald') { R(hx - 4, top + 4, 8, 1, shade(skin, 0.9)); }

    faceFeatures();
    facialHair();
    specs();
    if (look.earPen) { Ln(hx + hrx - 1, top + 6, hx + hrx + 4, top + 12, look.earPen, 1.4); }

    // ------------------------------------------------------------- headwear
    const capC = look.capColor;
    switch (look.cap) {
      case 'topi': case 'skull': E(hx, top + 3, hrx, 5, capC || '#f4f2ea', top - 2, top + 5); R(hx - hrx, top + 4, hrx * 2, 1, 'rgba(0,0,0,0.12)'); for (let x = hx - 6; x < hx + 6; x += 3) R(x, top + 1, 1, 1, 'rgba(0,0,0,0.1)'); break;
      case 'irani': { const c = capC || '#f4f2ea'; R(hx - hrx + 0.5, top - 3, hrx * 2 - 1, 7, c); E(hx, top - 3, hrx - 0.5, 2, shade(c, 1.05)); R(hx - hrx + 0.5, top + 2, hrx * 2 - 1, 2, shade(c, 0.86)); for (let x = hx - 6; x < hx + 7; x += 3) R(x, top - 1, 1, 2, shade(c, 0.9)); break; }
      case 'dhaka': { const c = capC || '#1d1a1e'; P([hx - hrx, top + 4, hx - hrx + 1, top - 2, hx + hrx - 1, top - 4, hx + hrx, top + 4], c); R(hx - hrx, top + 3, hrx * 2, 1, shade(c, 1.6)); break; }
      case 'gandhi': R(hx - hrx, top + 1, hrx * 2, 4, capC || '#f4f2ea'); R(hx - hrx + 1, top, hrx * 2 - 2, 1, '#e8e4d8'); R(hx - 1, top - 1, 2, 2, '#e8e4d8'); break;
      case 'police': R(hx - hrx - 1, top - 1, hrx * 2 + 2, 6, capC || '#6a5a3a'); R(hx - hrx - 1, top + 4, hrx * 2 + 2, 2, '#1a1a22'); R(hx - 2, top, 4, 3, '#c9a227'); break;
      case 'cricket': E(hx, top + 3, hrx + 1, 5, capC || '#2a5cb8', top - 2, top + 5); R(hx - 2, top + 4, hrx + 6, 2, capC || '#2a5cb8'); R(hx - 1, top, 2, 1, shade(capC || '#2a5cb8', 1.4)); break;
      case 'backcap': E(hx, top + 3, hrx + 1, 5, capC || '#c03030', top - 2, top + 5); R(hx - 3, top + 3, 6, 2, shade(capC || '#c03030', 0.7)); R(hx - 2, top + 3, 4, 1, skin); break;
      case 'pith': { const c = capC || '#e8dcc0'; E(hx, top + 4, hrx + 7, 3, shade(c, 0.86)); E(hx, top + 1, hrx + 2, 7, c, top - 6, top + 4); R(hx - hrx - 2, top + 2, hrx * 2 + 4, 2, '#7a5a3a'); R(hx - 4, top - 4, 3, 2, shade(c, 1.12)); break; }
      case 'hood': { const c = capC || '#f2c230'; E(hx, hy - 1, hrx + 4, hry + 3, c, top - 4, hy + 2); R(hx - hrx - 4, hy - 2, 4, 12, c); R(hx + hrx, hy - 2, 4, 12, c); E(hx, top + 3, hrx + 1, 4, shade(c, 0.85), top + 1, top + 6); R(hx - 5, hy + 10, 1, 4, '#f4f0e8'); R(hx + 4, hy + 10, 1, 4, '#f4f0e8'); break; }
      default: break;
    }
    // dupatta over the head
    if (look.dupatta) { E(hx, top + 5, hrx + 3, 8, look.dupatta, top - 3, top + 6); R(hx - hrx - 3, top + 5, 3, 22, look.dupatta); R(hx + hrx, top + 5, 3, 22, look.dupatta); R(hx - hrx - 3, top + 5, 1, 22, shade(look.dupatta, 0.8)); }
    if (look.dupattaShoulder) { P([6, 38, 18, 35, 30, 35, 42, 38, 42, 42, 30, 39, 18, 39, 6, 42], look.dupattaShoulder); }
    moodMarks();
    tapeFx();
    // frame vignette
    R(0, 0, 48, 1, 'rgba(0,0,0,0.3)'); R(0, 47, 48, 1, 'rgba(0,0,0,0.3)');
    ctx.restore();

    function moodMarks() {
      switch (mood) {
        case 'angry': { const c = '#ff3a3a'; R(39, 6, 2, 5, c); R(37, 8, 6, 1, c); R(42, 3, 1, 3, c); R(35, 11, 3, 1, c); break; }
        case 'shout': { const c = '#ffd23a'; R(4, 6, 2, 6, c); R(4, 13, 2, 2, c); R(41, 5, 4, 1, c); R(40, 9, 6, 1, c); R(41, 13, 4, 1, c); break; }
        case 'sad': R(hx - 5, ey + 2, 1, 2, '#9ad0ff'); R(hx - 6, ey + 4, 2, 2, '#9ad0ff'); break;
        case 'surprised': { const c = '#ffffff'; R(40, 4, 2, 6, c); R(40, 11, 2, 2, c); break; }
        case 'worried': E(hx + hrx + 1, top + 6, 1.5, 2.4, '#bfe4ff'); R(hx + hrx, top + 4, 1, 1, '#ffffff'); break;
        case 'happy': case 'laugh': R(40, 6, 1, 5, '#fff3b0'); R(38, 8, 5, 1, '#fff3b0'); R(6, 12, 1, 3, '#fff3b0'); R(5, 13, 3, 1, '#fff3b0'); break;
        case 'wink': R(41, 6, 1, 3, '#ffe0f0'); R(40, 7, 3, 1, '#ffe0f0'); break;
        case 'tired': R(37, 4, 4, 1, '#e8eef8'); R(39, 5, 1, 1, '#e8eef8'); R(37, 6, 4, 1, '#e8eef8'); R(42, 8, 3, 1, '#e8eef8'); R(43, 9, 1, 1, '#e8eef8'); R(42, 10, 3, 1, '#e8eef8'); break;
        default: break;
      }
    }
    function tapeFx() {
      if (!look.tape) return;
      for (let y = 0; y < 48; y += 2) R(0, y, 48, 1, 'rgba(10,20,60,0.22)');
      R(0, 0, 48, 48, 'rgba(60,90,200,0.12)');
      // a little cassette in the corner
      R(31, 36, 15, 10, '#1d1a20'); R(32, 37, 13, 5, look.tapeLabel || '#f2c230'); E(35, 39.5, 1.5, 1.5, '#1d1a20'); E(42, 39.5, 1.5, 1.5, '#1d1a20'); R(34, 43, 9, 2, '#3a3440');
    }
  }

  /* ============================================================ glossary */
  // Bible §10.1 + §10.2 + systems §17, as 'keys (/-separated)|tag|meaning'.
  const GLOSS_SRC = [
    'aa gaye?|Dk|You’ve come? / Here already?', 'aadaab|Dk|A respectful greeting (with a hand raised)',
    'aaj nakad, kal udhaar|Hi|“Cash today, credit tomorrow” (shop sign)', 'aao, mian|Dk|Come, sir',
    'aap bhi|Hi|You too (respectful)', 'aapa|Dk|Elder sister; polite for a woman',
    'aara / aari / aayi|Dk|Coming (m./f.) / has come (“bus aayi”: the bus is here)', 'aara!|Dk|“It’s coming!” (the antenna picture is back)',
    'abba|Dk|Father (also “Abba!”, Telugu: Ouch! / Wow!)', 'abbo, enta traffic!|Te|Wow, so much traffic!', 'abbo|Te|Wow!',
    'accha|Hi|Okay, good', 'agle baras jaldi aana|Hi|“Come back soon next year” (farewell to Ganesh)',
    'ainvayich ghoomra|Dk|Just roaming, for no reason', 'ainvayich|Dk|For no reason', 'amma|Te|Mother', 'ammamma|Te|Maternal grandmother', 'ammi|Dk|Mother',
    'ammo|Te|Oh no!', 'anna / annayya|Te|Elder brother (suffix of respect) / big brother', 'andhera hora|Dk|It’s getting dark',
    'arati pandlu|Te|Bananas', 'arre|Hi|Hey!', 'ashada|Te|The lunar month (Jun–Jul) when Bonalu is held', 'atta|Hi|Wheat flour',
    'ayipoyindi|Te|Has become (“late ayipoyindi”: I’m late)', 'ayyo|Te|Oh no', 'baap re|Hi|Oh my!', 'baarish aari|Dk|Rain is coming',
    'baba|Dk|Little boy (affectionate)', 'babu|Te|Sonny (affectionate)', 'bach gaya|Hi|Saved! / Got away!',
    'baigan|Dk|“Nonsense! My foot!” (literally, brinjal)', 'band karo|Hi|Switch it off / stop it', 'banyan|IE|A cotton vest',
    'beta|Hi|Child (affectionate)', 'bhaago / bhaagra|Dk|Run! / running', 'bhai|Hi|Brother; a friendly suffix',
    'bhatti|Hi|A brick-and-clay stove (haleem is cooked in one)', 'bhogi|Te|The bonfire day before Sankranti', 'bhot|Dk|Very, a lot',
    'bhutta|Hi|Roasted corn on the cob', 'bo kaata|Dk|“Cut!” (the shout when you cut a kite)', 'bokaata|Dk|“Cut!” (the kite shout; also Immu’s password)',
    'bonam / bonalu|Te|A decorated offering pot carried on the head / the festival', 'bun-maska|Dk|A buttered bun (Irani café)',
    'chakkarakeli|Te|A sweet, thin-skinned banana', 'chalo|Hi|Let’s go', 'chalre kya|Dk|Are you going?',
    'chand raat|Dk|“Night of the moon”: the eve of Eid, an all-night shopping night', 'chand dikha kya|Hi|Has the moon been sighted?',
    'chanda|Hi|A festival donation', 'chappal|Hi|Slipper, sandal', 'chappal bazar|P|Slipper Market (a neighbourhood by Kachiguda)',
    'char kaman|P|“Four arches” around Gulzar Houz', 'charkhi|Hi|Spool for kite string', 'chashma wala|Hi|The one with glasses',
    'chee|Hi|Yuck! / Tch!', 'chhote / chhotu|Hi|Little one', 'chhoot ri kya|Dk|Is it leaving without you? (a train)',
    'chitti|Dk|A chit, a written note (a doctor’s chitti = prescription); Te: a pet name, “little one”', 'choosi nadavu|Te|Watch where you walk',
    'chowrasta|Dk|Crossroads', 'chuddam|Te|We’ll see', 'coolie|IE|Railway porter',
    'current poyindi / current gaya|Te / Dk|The power’s gone!', 'dabba|Hi|Tin box; tiffin box; (cricket) out for zero',
    'dappu|Te|A frame drum played in processions', 'darshan|Hi|Seeing the deity at a temple', 'das upar|Dk|Ten extra (₹10 over the meter)',
    'dheel / khench|Hi|Give slack / pull hard (kite string)', 'dhoop|Hi|Harsh sunshine', 'dil khush|Dk|“Happy heart”: a sweet coconut bun',
    'do chai, ek plate osmania|Dk|Two chais and a plate of Osmania biscuits', 'do pauna|Dk|Two small Irani chais',
    'doodh-bhaat|Hi|“Milk-rice”: the little kid who plays but doesn’t count', 'doodhiya|Hi|Milky (a marble)',
    'dosa / idli / vada|Te|South Indian breakfast: crêpe / steamed cake / fritter', 'dupatta|Hi|A long scarf worn with salwar kameez',
    'ee okka aadivaaram nenu pindi ramulu kaadu. pothuraju.|Te|“This one Sunday I am not Flour Ramulu. I am Pothuraju.”',
    'eid mubarak|Dk|Happy Eid', 'eidi|Dk|Money given to children on Eid', 'ekkada|Te|Where?', 'emaindi / emaindi ra|Te|What happened (man)?',
    'farmaish|Dk|A listener’s request or dedication on the radio', 'footboard|IE|The step at a bus door (riding on it is dangerous)',
    'gaay hatao|Hi|Move the cow', 'galla|Dk|Cash till', 'ganpati bappa morya|Hi|“Hail, Lord Ganesh” (festival cry)', 'garam garam|Hi|Piping hot',
    'garu|Te|Respectful suffix (“Sreenivas-garu”)', 'garmi|Hi|Summer heat (chapter card)', 'ghaas pe nakko khelna|Dk|Don’t play on the grass',
    'ghar jao / ghar ku|Dk|Go home / home-wards', 'girni / pindi girni|Dk / Te|Flour mill (pindi, Te: flour)', 'gnapakalu|Te|Memories',
    'goli|Hi|A marble', 'gulal|Hi|Coloured festival powder', 'gurthunda|Te|Do you remember?', 'haa / haan|Dk|Isn’t it? / yes',
    'hai / hai allah|Dk|Oh! / Oh God!', 'haleem|Dk|Slow-cooked wheat-and-meat dish of Ramzan', 'hallu|Dk|Slowly, gently (“hallu chalao”: drive slowly)',
    'hallu hallu|Dk|Slowly, slowly', 'hau|Dk|Yes', 'hau, ho jaata|Dk|Yes, it’ll happen', 'hawai chappal|IE|Rubber flip-flops',
    'howzaat / howzat|IE|“How’s that?”: a cricket appeal', 'imli / imlibun|Hi / P|Tamarind / “tamarind grove”', 'intiki raa|Te|Come home',
    'ji|Hi|Respectful suffix (“Gandhi-ji”)', 'kaavala|Te|Do you want?', 'kab se|Hi|Since when?', 'kadai|Hi|A deep iron wok',
    'kaiku itta bhaagra|Dk|Why are you running so much?', 'kaiku|Dk|Why?', 'kanna|Te|Dear child', 'karam podi|Te|Spiced lentil powder eaten with ghee',
    'karo|Hi|Do (“motor on karo”: switch on the motor)', 'kaun hai|Hi|Who’s there?', 'ke paas milo|Hi|Meet near...',
    'khaata / khaate mein likh doon|Hi|Shop credit book / Shall I put it on your account?', 'khazana|Hi|Treasure',
    'kitta hua|Dk|How much? (what’s the score?)', 'kitte din rakhun|Dk|How many days shall I keep it?', 'kobbari bondam|Te|Tender coconut',
    'kosaru|Te|The little extra a vendor throws in free', 'kotha chappal|Te + Hi|New chappals', 'kothi|Hi|Mansion (gives Koti its name)',
    'ku chalte kya|Dk|Shall we go for...?', 'kurta / salwar kameez / lungi / topi|Hi|Long shirt / trouser-and-tunic suit / wrap / cap',
    'kya bolte, miyan / kya bolte miyan / kya bolte|Dk|“What can I say, sir!”', 'kya karre|Dk|What are you doing?', 'kya re|Dk|What’s up?',
    'laddu|Hi|A round sweet', 'lapet|Dk|Reel in (kite string)', 'light le, mamu|Dk|Chill, buddy', 'line mein|Hi|Stay in the line!',
    'lo|Hi|Here, take it', 'lootna|Dk|To chase and grab a cut kite', 'malai|Hi|Cream; soft coconut flesh', 'mali|Hi|Gardener',
    'mallepoolu|Te|Jasmine flowers', 'mamu|Dk|Buddy (literally, maternal uncle)',
    'manja / saddi|Dk|Coated kite string / plain cotton string (the game uses saddi only)', 'mavayya|Te|Maternal uncle', 'mazboot|Hi|Strong',
    'mee abbayi rank entha|Te|What’s your son’s (EAMCET) rank?', 'mein / mein nakko|Hi / Dk|In / not in (“stadium mein nakko”: not in the stadium)',
    'mera yaadgaar saal|Hi|“My Memorable Year” (the diary)', 'meri chappal kidhar gayi|Dk|Where did my slipper go?',
    'meter nakko|Dk|No meter (fare by haggling)', 'mian / miyan|Dk|Sir, mister', 'moora|Te|A forearm’s length (how jasmine is sold)',
    'mubarak|Dk|Blessed, congratulations', 'muggulu|Te|Rangoli patterns at the gate', 'mummy ki cheppesta|Te + Hi|I’m telling Mummy!',
    'na|Hi|Isn’t it? / right?', 'nakko|Dk|No, don’t', 'namaskar / namaste|Hi|A respectful greeting (palms together)', 'nana / nani|Hi|Maternal grandfather / grandmother',
    'nanna, nuvvu kooda / nanna nuvvu kooda / nuvvu kooda|Te|Dad, you too!', 'nanna|Te|Father', 'naubat pahad|P|“Drum hill” (where Birla Mandir stands)',
    'neeru teeyaga undi|Te|The water is sweet', 'nemmadiga|Te|Slowly', 'nimajjanam|Te|Immersion of Ganesh idols',
    'numaish|Dk|“Exhibition”: the Nampally fair', 'onsite|IE|(IT slang) posted abroad to the client’s office',
    'osmania biscuit / osmania|Dk|The salty-sweet Irani café biscuit', 'paanch|Hi|Five', 'paani / paani aara / paani lo|Hi / Dk|Water / water’s coming / have some water',
    'paani-kam|Dk|“Less water”: strong, milky Irani chai', 'pachadi|Te|Chutney; Ugadi pachadi has six tastes', 'pakka|Hi|Sure, promise',
    'pakka promise|Hi|Sure promise', 'pandaga|Te|Festival (chapter card)', 'pandal|Hi|A festival marquee', 'papad|Hi|A crisp fried wafer (Delhi papad is huge)',
    'patang|Hi|Kite (chapter card)', 'pauna / ek pauna|Dk|A ¾ cup of Irani chai', 'pech|Dk|A kite fight (crossed strings)', 'pesarattu|Te|Green-gram crêpe',
    'petrol bunk|IE|Petrol station (Abba practises “gas station”)', 'phokat|Dk|Free, for nothing', 'poolamma|Te|Flower woman (vendor)',
    'pothuraju|Te|The guardian dancer of Bonalu, painted with turmeric', 'prasadam|Te|Blessed food from a temple',
    'pul|Hi|Bridge (Purana Pul: old bridge; Naya Pul: new bridge)', 'ra / raa|Te|Hey man (familiar) / come', 'raita|Hi|Yogurt side dish',
    'raja goli|Hi|“King marble”: the jackpot marble', 'rava|Hi|Semolina', 're|Hi|Hey (familiar)', 'repu|Te|Tomorrow',
    'right, right|IE|The conductor’s “all clear, go!”', 'ruko|Hi|Stop!', 'rythu bazaar|Te|Farmers’ market (rythu: farmer)', 'saab|Dk|Sir (suffix)',
    'saddi mazboot|Dk|Strong cotton string', 'salaam|Dk|A greeting', 'samosa-ragda|Hi|Samosa with white-pea curry',
    'sankranti / makar sankranti|Te|The January harvest festival of kites', 'sheer khurma|Dk|Eid vermicelli and milk dessert',
    'ssc / eamcet|IE|Class 10 board exam / AP engineering entrance', 'surang|Hi|Tunnel', 'tamata kilo aaru|Te|Tomatoes, six (rupees) a kilo',
    'teekha ya meetha|Hi|Spicy or sweet?', 'teen|Hi|Three (“table teen”)', 'teenmaar|Te|A fast processional drumbeat', 'teis saal|Hi|Twenty-three years',
    'tension nakko|Dk|Don’t worry', 'thatha|Te|Grandfather', 'thak gaya|Hi|Worn out, exhausted', 'theek hai|Hi|Okay', 'thinnava|Te|Have you eaten?',
    'thoda left / thoda right|Hi|A little left / a little right', 'tondaraga / tondaraga cheppandi / tondaraga raa|Te|Quickly (say it quickly / come quickly)',
    'tukkal|Dk|A Hyderabadi kite shape (flavour name)', 'ugadi|Te|Telugu New Year', 'utro|Dk|Get off', 'wala / wallah|Hi|The one with / the one who (chashma wala)',
    'yaadon ki meethi chubhan|Hi|The sweet sting of memories', 'aapki farmaish|Hi|“Your Requests” (the radio dedication show)',
    'baraat / shaadi|Hi|The groom’s wedding procession / a wedding', 'bandi|Te / Hi|A pushcart (samosa bandi, dosa bandi)',
    'biryani|Dk|Hyderabad’s spiced rice-and-meat dish', 'bus udti nahi|Hi|“Buses don’t fly” (Ma’am’s red ink)',
    'chaat / pani puri|Hi|Tangy street snacks / hollow puris dipped in spiced water', 'chhatri|Hi|A small domed kiosk on a rooftop (architecture)',
    'dhobi ghat|Hi|Riverside place where washermen wash and dry clothes', 'irani cafe / irani chai|Dk|Cafés started by Iranian families / their strong milky tea',
    'kakatiya|Te|A medieval Telugu dynasty; the Tank Bund arches copy its gateway', 'kirana|Hi|A neighbourhood grocery shop',
    'langar / nishan sahib|Pa|The free community meal at a gurdwara / its tall saffron flag', 'marfa|Dk|A big flat drum played by Barkas bands',
    'maut ka kuan|Hi|“Well of death”: the motorbike-on-a-wall show at Numaish', 'nivas|Te|Home, residence (“Lakshmi Nivas”)', 'pakda gaya|Hi|Caught!',
    'pehli baar sach|Hi|“The truth, for the first time” (Ma’am’s last red ink)', 'qawwali|Dk|Sufi devotional singing at a dargah', 'sach likho|Hi|Write the truth',
    'sitaphal|Hi|Custard apple (an ice-cream flavour)', '2-in-1 / j-card|IE|A radio-cassette player / the paper insert in a cassette case',
    'eid / eid ul-fitr / ramzan|Dk|The festival that ends the fasting month / the fasting month (Ramadan)', 'garam samose|Hi|Hot samosas',
    'hallu chalao|Dk|Drive slowly', 'hajmola / mango bite / tinkle|IE|A tangy digestive candy / a 50-paise mango toffee / the children’s comic',
    'imli-bun|Dk|Tamarind grove (Imlibun)', 'jeeta kya|Hi|Did (India) win?', 'luna / chetak / rx100 / ambassador|IE|A pedal-start moped / the family scooter / the cool cousin’s motorbike / the classic car',
    'std booth / std / isd / pco|IE|A public telephone cabin with a metered call counter', 'x roads|IE|Crossroads',
    // §10.2 names that mean something
    'chinnu|Te|“Little one” (a pet name)', 'immu|Dk|Pet name for Imran', 'bunty|IE|A pet name', 'patang chacha|Dk|“Uncle Kite”', 'ticket thatha|Te|“Grandpa Ticket”',
    'faramarz|Pe|A Persian name', 'noor-e-iran / cafe noor-e-iran|Pe|“Light of Iran” (an invented café)', 'gulistan / cafe gulistan|Pe|“Rose garden” (an invented café)',
    'toofan tammudu|Hi + Te|“Storm Brother”, a fictional film', 'mass maharaju|Te|“King of the Masses”, a fictional film', 'khazana hunt|Hi|“Treasure Hunt”, a fictional cable show',
    'fateh darwaza|P|Victory Gate', 'bala hissar|P|The upper fort', 'bagh-e-aam|P|The public garden', 'laad bazaar|P|Lac bazaar, for lac bangles',
    'gulzar houz|P|The garden cistern', 'lakdikapul|P|Wooden bridge',
    // systems §17
    'ab aap|Hi|“Now you” (clap game)', 'apnapan|Hi|Belonging, “we’re from the same place” (a bargaining tactic)', 'band / band hai|Hi|Closed / it’s closed',
    'bas|Hi|Enough, stop', 'champi|Hi|Head massage', 'chapak|Hi|Splash! (sound word)', 'dhadaam|Hi|Crash! Thud! (sound word)', 'ghanta|Hi|An hour (also “bell”)',
    'hawa|Hi|Wind', 'jaata hoon|Hi|“I’m leaving” (walking away while bargaining)', 'khabri|Dk|An insider who knows all the news', 'khaao|Hi|Eat!',
    'licence dikhao|Hi|Show your licence', 'mauke|Hi|Chances', 'mol-bhaav|Hi|Bargaining', 'nihari|Dk|Slow-cooked breakfast stew of the Old City',
    'pandaga dabbulu|Te|Festival money given to children', 'pehle mummy ko sambhalo|Hi|“First deal with Mummy”',
    'pet mein chuhe daud rahe hain|Hi|“Rats are running in my stomach”: very hungry', 'phir se suno|Hi|Listen again', 'phir se|Hi|Again', 'poora din|Hi|The whole day',
    'pyaar|Hi|Love; here, charm', 'raddi / raddi-wala|Hi|Old newspapers / the man who buys them by weight', 'sabr|Hi|Patience', 'saans phool gayi|Hi|Out of breath',
    'shant ho ke aao|Hi|“Come back calm”', 'suno|Hi|Listen', 'taali|Hi|A clap', 'ustad|Dk|Master, expert', 'udhaar chukaya|Hi|Debt repaid',
    'neend aa rahi hai|Hi|“I’m getting sleepy”', 'gowli|Dk / Te|Traditional milkman', 'dhobi|Hi|Washerman',
    // everyday words the engine / older demo lines use
    'mast|Hi|Awesome', 'ekdum|Hi|Totally', 'dosth|Hi|Friend', 'lafda|Hi|Trouble, a fight', 'zabardast|Hi|Fantastic', 'khatarnak|Hi|Dangerous / super cool',
    'bindaas|Hi|Carefree', 'chillar|Hi|Loose change', 'galli|Hi|Lane, alley', 'pilla|Te|Kid', 'chacha|Hi|Uncle', 'gaadi|Hi|Vehicle', 'kiraaya|Hi|Rent, fare',
    'kirkiri|Dk|Hassle, irritation', 'maidan|Hi|Open ground', 'chai bandi|Hi|Tea cart', 'bole to|Hi|Meaning…', 'poriya|Te|Boy (Telugu slang)', 'akka|Te|Elder sister',
    'lena|Hi|Want to take it?', 'kya|Hi|What?', 'coolie coolie|IE|Porter? Porter? (railway porters calling)', 'ganpati bappa|Hi|“Lord Ganesh” (festival cry)',
    'oye|Hi|Hey you!', 'namaste|Hi|A respectful greeting (palms together)',
  ];
  function normKey(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\- ]+/g, ' ').replace(/^-+|-+$/g, '').replace(/\s+/g, ' ').trim();
  }
  const GLOSSARY = {};
  const DICTIONARY = [];
  for (const line of GLOSS_SRC) {
    const [keys, tag, meaning] = line.split('|');
    DICTIONARY.push({ word: keys, tag, meaning });
    for (const k of keys.split(' / ')) {
      const n = normKey(k);
      if (n && GLOSSARY[n] == null) GLOSSARY[n] = meaning;
    }
  }
  let glossIndex = null, glossCount = -1;
  function glossIdx() {
    const keys = Object.keys(D.glossary);
    if (glossIndex && keys.length === glossCount) return glossIndex;
    glossIndex = new Map();
    for (const k of keys) { const n = normKey(k); if (n && !glossIndex.has(n)) glossIndex.set(n, D.glossary[k]); }
    glossCount = keys.length;
    return glossIndex;
  }
  /** Phrase-aware lookup: exact phrase, then the longest known sub-phrases. -> [[word, meaning]] | null */
  function gloss(word) {
    const idx = glossIdx();
    const n = normKey(word);
    if (!n) return null;
    const single = (k) => idx.get(k) || (k.length > 3 && /s$/.test(k) ? idx.get(k.slice(0, -1)) : null) || (/-/.test(k) ? idx.get(k.replace(/-/g, ' ')) || idx.get(k.replace(/-/g, '')) : null);
    const direct = single(n);
    if (direct) return [[n, direct]];
    const words = n.split(' ');
    const out = [];
    for (let i = 0; i < words.length;) {
      let hit = 0;
      for (let len = Math.min(7, words.length - i); len >= 1; len--) {
        const k = words.slice(i, i + len).join(' ');
        const m = single(k);
        if (m) { out.push([k, m]); hit = len; break; }
      }
      i += hit || 1;
    }
    return out.length ? out : null;
  }

  /* ============================================================ speakers */
  const speakers = {};
  function define(id, spec) {
    const s = Object.assign({ id, name: id, color: '#f2c230', look: null, portrait: null, voice: 1, side: null, style: null }, spec || {});
    if (s.pitch == null) s.pitch = s.voice || 1; // audio.js reads .pitch for the typewriter blip
    s._cache = {};
    speakers[id] = s;
    return s;
  }
  function speaker(id) {
    if (!id) return speakers.narrator;
    if (id === 'you') { const a = is2026() && speakers.srikanth ? 'srikanth' : speakers.chinnu ? 'chinnu' : null; if (a) id = a; }
    const known = speakers[id];
    if (known) {
      // §10 also allows plain assignment: N.dialogue.speakers[id] = {name, color, portrait}
      if (!known._cache) { known.id = known.id || id; known._cache = {}; if (known.name == null) known.name = id; if (!known.color) known.color = '#f2c230'; if (known.pitch == null) known.pitch = known.voice || 1; }
      return known;
    }
    // the cast (npcs.js) may know this id even if it has not registered yet
    try { if (N.npcs && typeof N.npcs.speakerSpec === 'function') { const sp = N.npcs.speakerSpec(id); if (sp) return define(id, sp); } } catch (e) { N.err('dialogue.npcSpeaker', e); }
    // unknown speaker: make a plausible one from the id (seeded look)
    const rng = U.rng('spk:' + id);
    const look = N.people ? N.people.randomLook(rng) : {};
    const name = String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return define(id, { name, color: rng.pick(['#f2c230', '#2a8c82', '#d8402a', '#7a3a8a', '#3a8a3a', '#c86a2a']), look });
  }
  define('narrator', { name: '', color: '#b9aa92', portrait: false });
  define('you', { name: '{nick}', color: '#f2c230', side: 'right', look: { kind: 'kid', skin: '#b97a4f', hair: '#1a1412', hairStyle: 'spiky', shirt: '#3d6fb0', shoulderStripes: '#f4f0e8', walkman: true, bg: '#2a2034' } });

  function speakerName(spk) {
    let n = is2026() && spk.name2026 != null ? spk.name2026 : spk.name;
    if (typeof n === 'function') { try { n = n(); } catch (e) { n = spk.id; } }
    return filter(n == null ? '' : n);
  }
  function speakerColor(spk) { return (is2026() && spk.color2026) || spk.color || '#f2c230'; }
  function speakerLook(spk) {
    let l = is2026() && spk.look2026 ? spk.look2026 : spk.look;
    if (typeof l === 'function') { try { l = l(); } catch (e) { N.err('dialogue.look:' + spk.id, e); l = null; } }
    return l || {};
  }

  function portraitCanvas(spk, mood) {
    if (typeof spk === 'string') spk = speaker(spk);
    if (!spk || spk.portrait === false) return null;
    const y26 = is2026();
    const fn = (y26 && spk.portrait2026) || spk.portrait;
    const look = typeof fn === 'function' ? null : speakerLook(spk);
    const key = normMood(mood) + '|' + (y26 ? 26 : 3) + '|' + (look && look._key ? look._key : '');
    if (spk._cache[key]) return spk._cache[key];
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const g = c.getContext('2d');
    try {
      if (typeof fn === 'function') fn(g, 48, 48, normMood(mood));
      else paintPortrait(g, 48, 48, look, mood);
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
    buildBarks();
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
  const MOODS = ['neutral', 'happy', 'laugh', 'angry', 'sad', 'surprised', 'shout', 'worried', 'wink', 'tired'];

  function show(line) {
    const spk = speaker(line.s);
    cur = line;
    line.spk = spk;
    line.typing = true; line.shown = 0; line.acc = 0; line.wait = 0; line.blip = 0;
    line.sel = line.choices ? Math.max(0, Math.min(line.choices.length - 1, line.def || 0)) : 0;
    const mood = normMood(line.mood);
    // portrait + name plate + side
    const pc = portraitCanvas(spk, mood);
    const box = dom.box;
    box.classList.toggle('no-face', !pc);
    box.classList.toggle('narrator', spk.id === 'narrator');
    const side = line.side || spk.side || 'left';
    box.classList.toggle('right', side === 'right' && !!pc);
    for (const m of MOODS) box.classList.toggle('mood-' + m, m === mood && m !== 'neutral');
    for (const st of ['tape', 'radio', 'chit', 'email']) box.classList.toggle('style-' + st, spk.style === st || line.style === st);
    if (pc) { const g = dom.faceCanvas.getContext('2d'); g.clearRect(0, 0, 48, 48); g.drawImage(pc, 0, 0); }
    const nm = speakerName(spk);
    dom.name.textContent = nm;
    const col = speakerColor(spk);
    dom.name.style.setProperty('--spk', col);
    box.style.setProperty('--spk', col);
    dom.name.classList.toggle('empty', !nm);
    // text as per-character spans so wrapping never jumps while typing
    dom.text.innerHTML = '';
    line.chars = [];
    const glosses = [];
    const shownText = filter(line.t);
    line.shownText = shownText;
    for (const seg of parse(shownText)) {
      let parent = dom.text;
      if (seg.slang) {
        parent = document.createElement('span');
        parent.className = 'slang';
        const g = gloss(seg.t);
        if (g) {
          const tip = g.map((q) => (g.length > 1 ? q[0] + ': ' : '') + q[1]).join(' · ');
          parent.title = tip; parent.dataset.gloss = tip;
          for (const q of g) if (!glosses.some((x) => x[0] === q[0])) glosses.push(q);
        }
        dom.text.appendChild(parent);
      }
      // words in their own nowrap spans so a word never breaks across lines while typing
      let word = null;
      for (const ch of seg.t) {
        if (ch === '\n') { parent.appendChild(document.createElement('br')); word = null; continue; }
        const sp = document.createElement('span');
        sp.className = 'c';
        sp.textContent = ch;
        if (ch === ' ') { parent.appendChild(sp); word = null; }
        else { if (!word) { word = document.createElement('span'); word.className = 'w'; parent.appendChild(word); } word.appendChild(sp); }
        line.chars.push(sp);
      }
    }
    dom.gloss.innerHTML = '';
    for (const [w, g] of glosses.slice(0, 4)) {
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
    box.classList.remove('ready', 'choosing');
    if (line.choices) {
      line.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.tabIndex = -1;
        b.className = 'dlg-choice';
        b.innerHTML = '<span class="k">' + (i + 1) + '</span><span class="t"></span>';
        b.querySelector('.t').textContent = filter(String(c)).replace(/\*/g, '');
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!LIVE[N.state.mode]) return; if (cur === line && !line.typing) pick(i); else if (cur === line) finishTyping(); });
        b.addEventListener('pointerenter', () => { if (cur === line && !line.typing) { line.sel = i; markSel(); } });
        dom.choices.appendChild(b);
      });
    }
    N.emit('dialogue:line', { speaker: spk.id, text: shownText, choices: line.choices || null, mood });
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
      N.emit('dialogue:line', { speaker: line.s, text: filter(line.t), choices: line.choices || null, skipped: true });
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

  /* ================================================================ barks */
  // Short speech bubbles in the world (DOM in #ui, positioned every frame over the target).
  const barks = [];
  const BARK_MAX = 6;
  let barkHost = null;
  function buildBarks() {
    const ui = document.getElementById('ui') || document.body;
    barkHost = document.createElement('div');
    barkHost.id = 'barks';
    barkHost.setAttribute('aria-live', 'polite');
    ui.appendChild(barkHost);
  }
  function barkTarget(t) {
    if (t == null) return null;
    if (t === 'player') return N.player;
    if (typeof t === 'string') {
      const a = N.npcs && N.npcs.get ? N.npcs.get(t) : null;
      if (a) return a;
      const p = N.places && N.places[t];
      return p || null;
    }
    if (typeof t.x === 'number') return t;
    return null;
  }
  function bark(target, text, opts) {
    opts = opts || {};
    const tgt = barkTarget(target);
    const handle = { closed: false, close() { closeBark(b); }, done: null };
    let resolveDone;
    handle.done = new Promise((r) => { resolveDone = r; });
    const b = { target: tgt, handle, resolveDone, el: null, t: 0, life: 0, h: opts.h != null ? opts.h : (tgt && tgt.barkH) || 15 };
    if (!tgt || text == null || text === '') { b.resolveDone(); handle.closed = true; return handle; }
    const shown = filter(text);
    const plain = shown.replace(/\*/g, '');
    b.life = opts.secs != null ? +opts.secs : U.clamp(1.6 + plain.length * 0.055, 2, 6.5);
    // one bubble per target: replace the old one
    for (const o of barks.slice()) if (o.target === tgt) closeBark(o, true);
    while (barks.length >= BARK_MAX) closeBark(barks[0], true);
    const spkId = opts.speaker || (tgt.npcId) || null;
    const spk = spkId ? speaker(spkId) : null;
    const el = document.createElement('div');
    el.className = 'bark';
    const col = opts.color || (spk ? speakerColor(spk) : '#f2c230');
    el.style.setProperty('--spk', col);
    if (opts.name !== false && spk && spk.id !== 'narrator') {
      const nm = speakerName(spk);
      if (nm) { const n = document.createElement('b'); n.className = 'bark-name'; n.textContent = nm; el.appendChild(n); }
    }
    const tx = document.createElement('span');
    tx.className = 'bark-text';
    for (const seg of parse(shown)) {
      if (seg.slang) { const s = document.createElement('i'); s.textContent = seg.t; const g = gloss(seg.t); if (g) s.title = g.map((q) => q[1]).join(' · '); tx.appendChild(s); }
      else tx.appendChild(document.createTextNode(seg.t));
    }
    el.appendChild(tx);
    if (barkHost) barkHost.appendChild(el);
    b.el = el;
    barks.push(b);
    N.emit('dialogue:bark', { speaker: spkId, text: plain, target: tgt });
    // a couple of typewriter blips when it is near the player
    const p = N.player;
    if (opts.blip !== false && p && Math.hypot((tgt.x || 0) - p.x, (tgt.y || 0) - p.y) < 260) {
      const pitch = spk ? spk.pitch || spk.voice || 1 : 1;
      N.emit('dialogue:char', { speaker: spkId || 'bark', pitch });
      setTimeout(() => N.emit('dialogue:char', { speaker: spkId || 'bark', pitch }), 90);
    }
    return handle;
  }
  function closeBark(b, now) {
    const i = barks.indexOf(b);
    if (i < 0) return;
    barks.splice(i, 1);
    b.handle.closed = true;
    if (b.el) {
      if (now) b.el.remove();
      else { const el = b.el; el.classList.add('out'); setTimeout(() => el.remove(), 220); }
    }
    try { b.resolveDone(); } catch (e) { /* ignore */ }
  }
  function updateBarks(dt) {
    if (!barks.length) return;
    const live = LIVE[N.state.mode];
    for (const b of barks.slice()) {
      if (live) b.t += dt;
      if (b.t >= b.life || (b.target && b.target.alive === false)) closeBark(b);
    }
  }
  function placeBarks() {
    if (!barkHost) return;
    const live = LIVE[N.state.mode] && N.state.mode !== 'minigame';
    barkHost.classList.toggle('hide', !live);
    if (!barks.length || !live) return;
    const Rn = N.render;
    if (!Rn || !Rn.canvas || !Rn.W) return;
    const rect = Rn.canvas.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const b of barks) {
      const t = b.target;
      if (!t || !b.el) continue;
      const v = t.vehicle && t.vehicle.alive ? t.vehicle : t;
      const roofH = t.roofH || 0;
      if (!Rn.inView(v.x, v.y, 30)) { b.el.style.visibility = 'hidden'; continue; }
      const q = Rn.proj(v.x, v.y, b.h + roofH);
      let X = rect.left + (q.x / Rn.W) * rect.width;
      let Y = rect.top + (q.y / Rn.H) * rect.height - 8;
      const w = b.el.offsetWidth || 120, h = b.el.offsetHeight || 30;
      const left = U.clamp(X - w / 2, 6, Math.max(6, vw - w - 6));
      const topY = U.clamp(Y - h, 6, Math.max(6, vh - h - 6));
      b.el.style.visibility = '';
      b.el.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(topY) + 'px)';
      b.el.style.setProperty('--tail', Math.round(U.clamp(X - left, 10, w - 10)) + 'px');
    }
  }

  /* ================================================================= API */
  const D = (N.dialogue = {
    speakers, glossary: GLOSSARY, dictionary: DICTIONARY, skip: false, active: false, textSpeed: 1,
    define, speaker, paintPortrait, portraitCanvas, filter, names, gloss, bark, is2026,
    moods: MOODS.slice(),
    speakerName(id) { return speakerName(speaker(id)); },
    setNames(o) {
      o = o || {};
      const p = N.player;
      if (p) {
        if (o.nick != null) { p.nick = clean(o.nick, 16) || 'Chinnu'; p.name = p.nick; }
        if (o.full != null) p.full = clean(o.full, 24) || 'Srikanth';
      }
      N.emit('names:change', names());
      return names();
    },
    /** Show one line; resolves when the player advances. opts: {mood, auto (s), side} */
    say(speakerId, text, opts) {
      opts = opts || {};
      return enqueue({ s: speakerId, t: text, mood: opts.mood, auto: opts.auto, side: opts.side, style: opts.style });
    },
    /** Prompt + options; resolves with the chosen index. opts: {mood, default, side} */
    choice(speakerId, prompt, options, opts) {
      opts = opts || {};
      const list = (options || []).map(String);
      if (!list.length) return D.say(speakerId, prompt, opts).then(() => 0);
      return enqueue({ s: speakerId, t: prompt, choices: list, def: opts.default || 0, mood: opts.mood, side: opts.side, style: opts.style });
    },
    /** A conversation: [{s, t, mood?, choices?, side?}]. Resolves with the last choice index (if any). */
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
    clearBarks() { for (const b of barks.slice()) closeBark(b, true); },
    barkCount: () => barks.length,
    /** Programmatic ACTION (tests, cutscenes). */
    advance() { poke(); },
    isOpen: () => open,
    get current() { return cur ? { speaker: cur.spk && cur.spk.id, text: cur.shownText != null ? cur.shownText : cur.t, typing: cur.typing, choices: cur.choices || null, selected: cur.sel, mood: normMood(cur.mood) } : null; },
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
          if (ch !== ' ' && (line.blip++ & 1) === 0) N.emit('dialogue:char', { speaker: line.spk.id, pitch: line.spk.pitch || line.spk.voice || 1 });
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

  N.on('game:quit', () => { D.cancel(); D.clearBarks(); });
  N.on('game:new', () => { if (open || queue.length) D.cancel(); D.clearBarks(); });
  N.on('save:loaded', () => D.clearBarks());
  // name or year changes: drop cached portraits (2026 looks) — cheap, they repaint on demand
  N.on('names:change', () => { for (const id in speakers) if (speakers[id]._cache) speakers[id]._cache = {}; });

  // the cast may have been defined before this file loaded (npcs.js loads first)
  try { if (N.npcs && typeof N.npcs.registerSpeakers === 'function') N.npcs.registerSpeakers(); } catch (e) { N.err('dialogue.cast', e); }

  N.addSystem({
    id: 'dialogue', order: 12, runIn: ['*'],
    init: build,
    update(dt) { if (cur && LIVE[N.state.mode]) update(dt); updateBarks(dt); },
    draw() { placeBarks(); },
  });
})();
