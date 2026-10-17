/* NOSTALGIA — tests/npcs.cjs  (cast agent: src/npcs.js + src/dialogue.js)
 * Headless Chromium (Playwright, global install). Checks:
 *   data      every bible character (§2 + walk-ons + every speaker id used in the bible's lines)
 *             is defined, registered as a speaker, and paints a non-empty portrait and sprite
 *   sheet     cast sheet screenshots: portraits + sprites (2003), the 2026 cast, moods
 *   world     every character spawned in the world by day (+ 2026 looks), schedules populated
 *   talk      ACTION on a spawned NPC ("Talk to Immu", real key E), aunties / Ammamma -> N.hints
 *   walk      walkTo over short / medium / long distances (camera on the walker: no hops allowed)
 *   follow    Immu follows on foot, mounts his own cycle when the player rides, gets off after
 *   gloss     slang highlighting, glossary tooltips (hover) and the meanings row
 *   names     {nick} {full} {FULL} + the global Chinnu/Srikanth rename rule, name plates
 *   barks     in-world speech bubbles and emotes (screenshot)
 *   phone     390x844 portrait: every bible line (and the bible's choices) fits; side layout
 *   landscape 844x390: every bible line fits
 * Fails on any console error / page error / N.err from src/npcs.js or src/dialogue.js; errors
 * from other modules (other agents' files mid-edit) are listed as "foreign" and also fail unless
 * FOREIGN_OK=1.
 *   node nostalgia/tests/npcs.cjs            ONLY=walk,follow node nostalgia/tests/npcs.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'npcs');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.indexOf(k) >= 0;

const failures = [];
const warnings = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const warn = (msg) => { warnings.push(msg); console.log('  warn ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BIBLE_CAST = ['chinnu', 'srikanth', 'amma', 'nanna', 'ammamma', 'chitti', 'bunty', 'immu', 'imran', 'abba', 'ammi', 'nani', 'ayesha', 'pasha', 'babloo',
  'faramarz', 'pochaiah', 'yadagiri', 'ramulu', 'agarwal', 'bahadur', 'kite_chacha', 'ticket_thatha', 'salim', 'vimala_maam', 'cable_babji', 'photo_uncle',
  'net_uncle', 'flower_aunty', 'tiger', 'caretaker'];
const WALK_ONS = ['loudspeaker', 'bakery_man', 'gokul_man', 'paradise_man', 'bawarchi_man', 'conductor', 'sentry', 'mali', 'watchman', 'guide', 'boatman', 'farmer',
  'chemist', 'painter', 'ticket_man', 'black_ticket', 'narsimha', 'chappal_man', 'bangle_man', 'attar_man', 'recording_man', 'coconut_man', 'dosa_man', 'aunty',
  'stationery_man', 'kirana_kid', 'papad_man', 'bird_man', 'book_man', 'bakery_lady', 'meat_man', 'uncle', 'coach', 'guard', 'carol_aunty', 'waiter', 'crowd', 'radio', 'narrator'];

/* ---------------------------------------------------------- bible lines */
function bibleLines() {
  const txt = fs.readFileSync(path.join(ROOT, 'design', 'story_bible.md'), 'utf8');
  const out = [];
  let inCode = false;
  for (const raw of txt.split('\n')) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
    if (inCode) {
      const m = raw.match(/^\s*([a-z][a-z_0-9]*)(?:\s*\+\s*[a-z_]+)?(?:\s*\(([^)]*)\))?:\s+(.+)$/);
      if (!m) continue;
      let s = m[1];
      if (/tape/.test(m[2] || '')) s = s === 'imran' ? 'imran_tape' : s === 'immu' ? 'immu_tape' : s;
      out.push({ s, t: m[3].trim() });
    } else {
      // §8.2 / §8.3 tables: `speaker`: "line" · "line"
      const m = raw.match(/^\|?\s*\d*\.?\s*`([a-z_]+)`[^"|]*\|?\s*(".*)$/) || raw.match(/^\d+\.\s+`([a-z_]+)`:\s+(".*)$/);
      if (m) { for (const q of m[2].match(/"([^"]+)"/g) || []) out.push({ s: m[1], t: q.slice(1, -1) }); }
    }
  }
  return out;
}
const CHOICES = [
  { s: 'chinnu', t: 'How many faces have no clock?', c: ['2', '4', '6', '8'] },
  { s: 'chinnu', t: 'Ask for the ball at the Assembly gate.', c: ['Uncle, sorry, our ball fell inside. May we please have it?', 'Oye uncle, throw the ball!'] },
  { s: 'chinnu', t: 'Tomatoes are ₹1 a kilo cheaper at Erragadda, but the auto costs ₹10. Buy here or go?', c: ['Buy here', 'Go to Erragadda'] },
  { s: 'chinnu', t: 'In the oldest garden a princess has slept two thousand years. How many princesses?', c: ['1', '2', '4', '0'] },
  { s: 'chinnu', t: 'On the drum hill a white temple stands. How many bells?', c: ['0', '1', '4', '108'] },
  { s: 'chinnu', t: '...', c: ['Then we finish the tape.', 'Then the tunnel. I’ll help you hide. Properly.'] },
  { s: 'chinnu', t: 'There’s no tunnel, Immu.', c: ['Clap him out. Walk back together.', 'Keep the secret. Stay hidden with him.'] },
];

/* ---------------------------------------------------------- page setup */
async function openPage(browser, V) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ text: 'console.error: ' + m.text(), loc: (m.location() || {}).url || '' }); });
  page.on('pageerror', (e) => errors.push({ text: 'pageerror: ' + (e.stack || e.message), loc: e.stack || '' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.setTime(12, 0);
    N.debug.freezeClock(true);
    if (N.traffic && N.traffic.setDensity) N.traffic.setDensity(0.25);
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  await sleep(400);
  return { context, page, errors };
}
function checkErrors(tag, errors, nerr) {
  const mine = [], foreign = [];
  for (const e of errors) (/src\/(npcs|dialogue)\.js/.test(e.loc + e.text) ? mine : foreign).push(e.text.split('\n').slice(0, 3).join(' | '));
  for (const e of nerr || []) (/npc|dialogue|bark/i.test(e) ? mine : foreign).push('N.err ' + e);
  if (mine.length) fail('[' + tag + '] errors from npcs/dialogue: ' + mine.slice(0, 6).join(' || '));
  else ok('[' + tag + '] no errors from npcs.js / dialogue.js');
  if (foreign.length) {
    const msg = '[' + tag + '] ' + foreign.length + ' foreign error(s) (other modules): ' + foreign.slice(0, 3).join(' || ');
    if (process.env.FOREIGN_OK) warn(msg); else fail(msg);
  }
}

/* ======================================================================== desktop */
async function desktop(browser) {
  console.log('\n== desktop 1280x720');
  const { context, page, errors } = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const lines = bibleLines();
  const usedIds = Array.from(new Set(lines.map((l) => l.s)));

  /* ---------------------------------------------------------- data */
  if (want('data')) {
    const r = await page.evaluate(({ cast, walk, used }) => {
      const D = N.dialogue, out = { missing: [], noSpk: [], blankPortrait: [], blankSprite: [], bad: [], n: 0, gloss: Object.keys(D.glossary).length, dict: D.dictionary.length };
      const ids = Array.from(new Set(cast.concat(walk, used)));
      const tmp = document.createElement('canvas'); tmp.width = 48; tmp.height = 48; const g = tmp.getContext('2d');
      const colours = () => { const d = g.getImageData(0, 0, tmp.width, tmp.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return s.size; };
      for (const id of ids) {
        out.n++;
        if (cast.indexOf(id) >= 0 && !N.npcs.defs[id]) out.missing.push(id);
        const spk = D.speakers[id];
        if (!spk || (!spk._cast && id !== 'narrator')) out.noSpk.push(id);
        if (spk && id !== 'narrator' && id !== 'chit' && !D.speakerName(id)) out.bad.push(id + ':noname');
        const pc = D.portraitCanvas(id, 'neutral');
        if (pc) { g.clearRect(0, 0, 48, 48); g.drawImage(pc, 0, 0); if (colours() < 10) out.blankPortrait.push(id); }
        if (N.npcs.defs[id] && N.npcs.defs[id].portrait !== false && !pc) out.blankPortrait.push(id + ':null');
        if (N.npcs.defs[id]) {
          tmp.width = 48; g.save(); g.translate(24, 24); g.scale(2.5, 2.5); N.people.draw(g, N.npcs.look(id), { phase: 0, speed: 0 }); g.restore();
          if (colours() < 4) out.blankSprite.push(id);
          tmp.width = 48;
        }
        for (const m of D.moods) { try { D.portraitCanvas(id, m); } catch (e) { out.bad.push(id + ':' + m + ':' + e.message); } }
      }
      // every cast member has a voice and a plate colour
      for (const id of cast) { const d = N.npcs.defs[id]; if (d && (!d.color || !d.voice)) out.bad.push(id + ':colour/voice'); }
      return out;
    }, { cast: BIBLE_CAST, walk: WALK_ONS, used: usedIds });
    if (r.missing.length) fail('bible §2 characters missing: ' + r.missing.join(', ')); else ok('all ' + BIBLE_CAST.length + ' bible §2 characters defined');
    if (r.noSpk.length) fail('ids without a cast speaker: ' + r.noSpk.join(', ')); else ok(r.n + ' ids (cast + walk-ons + every speaker used in ' + lines.length + ' bible lines) registered in N.dialogue.speakers');
    if (r.blankPortrait.length) fail('blank portraits: ' + r.blankPortrait.join(', ')); else ok('every portrait paints (10 moods each)');
    if (r.blankSprite.length) fail('blank sprites: ' + r.blankSprite.join(', ')); else ok('every sprite paints');
    if (r.bad.length) fail('bad defs: ' + r.bad.slice(0, 10).join(', '));
    if (r.gloss < 330) fail('glossary too small: ' + r.gloss); else ok('glossary: ' + r.gloss + ' keys, dictionary ' + r.dict + ' entries');
    // every *slang* in the bible lines has a gloss
    const miss = await page.evaluate((ls) => {
      const out = new Set();
      for (const l of ls) { const t = N.dialogue.filter(l.t); const re = /\*([^*]+)\*/g; let m; while ((m = re.exec(t))) if (!N.dialogue.gloss(m[1]) && !/^[A-Z !?.]+$/.test(m[1])) out.add(m[1]); }
      return Array.from(out);
    }, lines);
    if (miss.length > 4) fail('slang without a gloss (' + miss.length + '): ' + miss.slice(0, 20).join(' | '));
    else if (miss.length) warn('slang without a gloss: ' + miss.join(' | '));
    else ok('every *slang* in the bible lines has a glossary meaning');
  }

  /* ---------------------------------------------------------- sheets */
  if (want('sheet')) {
    const sheet = async (name, ids, opts) => {
      const h = await page.evaluate(({ ids, opts }) => {
        const old = document.getElementById('__sheet'); if (old) old.remove();
        if (opts.y2026) N.flags.year = 2026; else delete N.flags.year;
        const D = N.dialogue;
        const wrap = document.createElement('div');
        wrap.id = '__sheet';
        wrap.style.cssText = 'position:fixed;left:0;top:0;width:1320px;z-index:9999;background:#120d16;display:grid;grid-template-columns:repeat(' + (opts.cols || 8) + ',156px);gap:8px;padding:12px;font-family:Baloo 2,sans-serif;color:#f4ead8';
        const title = document.createElement('div');
        title.style.cssText = 'grid-column:1/-1;font:22px VT323,monospace;color:#eaf2ff;letter-spacing:2px';
        title.textContent = opts.title;
        wrap.appendChild(title);
        for (const it of ids) {
          const id = typeof it === 'string' ? it : it.id, mood = typeof it === 'string' ? opts.mood || 'neutral' : it.mood;
          const card = document.createElement('div');
          const spk = D.speaker(id);
          card.style.cssText = 'background:#1d1622;border:2px solid ' + (spk.color || '#f2c230') + ';border-radius:6px;padding:6px;display:flex;flex-direction:column;align-items:center;gap:4px';
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:4px';
          const pc = document.createElement('canvas'); pc.width = 96; pc.height = 96; pc.style.cssText = 'width:96px;height:96px;image-rendering:pixelated;border:2px solid #1a1214';
          const src = D.portraitCanvas(id, mood);
          const g = pc.getContext('2d'); g.imageSmoothingEnabled = false;
          if (src) g.drawImage(src, 0, 0, 96, 96); else { g.fillStyle = '#2a2034'; g.fillRect(0, 0, 96, 96); g.fillStyle = '#b9aa92'; g.font = '14px VT323'; g.fillText('no portrait', 12, 50); }
          row.appendChild(pc);
          if (!opts.noSprite && N.npcs.defs[id]) {
            const sc = document.createElement('canvas'); sc.width = 48; sc.height = 96; sc.style.cssText = 'width:48px;height:96px;background:#b5a17e;border:2px solid #1a1214';
            const s = sc.getContext('2d');
            s.fillStyle = '#c9b48e'; s.fillRect(0, 48, 48, 48);
            for (const [y, ang] of [[24, Math.PI / 2], [72, 0]]) { s.save(); s.translate(24, y); s.rotate(ang); s.scale(2.6, 2.6); N.people.draw(s, N.npcs.look(id), { phase: ang ? 0 : 0.9, speed: ang ? 0 : 0.7 }); s.restore(); }
            row.appendChild(sc);
          }
          card.appendChild(row);
          const nm = document.createElement('div'); nm.style.cssText = 'font-weight:800;font-size:14px;line-height:1.1;text-align:center;color:' + (spk.color || '#f2c230');
          nm.textContent = D.speakerName(id) || '(narrator)';
          const sub = document.createElement('div'); sub.style.cssText = 'font:14px VT323,monospace;color:#b9aa92;line-height:1';
          sub.textContent = id + (typeof it === 'string' ? '' : ' · ' + mood);
          card.appendChild(nm); card.appendChild(sub);
          wrap.appendChild(card);
        }
        document.body.appendChild(wrap);
        return wrap.scrollHeight;
      }, { ids, opts });
      await page.setViewportSize({ width: 1344, height: Math.min(4000, h + 4) });
      await sleep(120);
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      await page.evaluate(() => { const s = document.getElementById('__sheet'); if (s) s.remove(); delete N.flags.year; });
      await page.setViewportSize({ width: 1280, height: 720 });
      ok('sheet ' + name + '.png (' + ids.length + ')');
    };
    const castIds = await page.evaluate(() => N.npcs.cast);
    await sheet('cast_2003', castIds, { title: 'NOSTALGIA · THE CAST (2003) · portraits + sprites (facing down / walking right)' });
    await sheet('cast_walkons', WALK_ONS.concat(['immu_tape', 'imran_tape', 'chit', 'email']), { title: 'WALK-ONS + special speakers' });
    await sheet('cast_2026', ['srikanth', 'imran', 'amma', 'nanna', 'abba', 'ayesha', 'faramarz', 'immu', 'chinnu'], { title: 'SIDE B · 2026 (N.flags.year = 2026)', y2026: true, cols: 8 });
    const moods = ['neutral', 'happy', 'laugh', 'angry', 'sad', 'surprised', 'shout', 'worried', 'wink', 'tired'];
    const mm = [];
    for (const id of ['chinnu', 'immu', 'amma', 'faramarz', 'ammamma', 'pasha']) for (const m of moods) mm.push({ id, mood: m });
    await sheet('cast_moods', mm, { title: 'MOODS · neutral happy laugh angry sad surprised shout worried wink tired', cols: 10, noSprite: true });
    // variants
    await page.evaluate(() => { N.npcs.setVariant('chinnu', 'school'); N.npcs.setVariant('immu', 'raincoat'); N.npcs.setVariant('amma', 'night'); N.npcs.setVariant('ramulu', 'pothuraju'); N.npcs.setVariant('abba', 'chandraat'); N.npcs.setVariant('bunty', 'committee'); });
    await sheet('cast_variants', ['chinnu', 'immu', 'amma', 'ramulu', 'abba', 'bunty'], { title: 'VARIANTS · school · raincoat (Chand Raat) · night · Pothuraju (Bonalu) · Chand Raat cap · committee', cols: 6 });
    await page.evaluate(() => { for (const id of ['chinnu', 'immu', 'amma', 'ramulu', 'abba', 'bunty']) N.npcs.setVariant(id, null); });
  }

  /* ---------------------------------------------------------- world */
  if (want('world')) {
    const r = await page.evaluate(() => {
      const ids = N.npcs.cast.filter((id) => id !== 'chinnu');
      const c = N.places.playground_1;
      N.debug.teleport(c.x - 60, c.y + 50);
      const placed = [];
      ids.forEach((id, i) => {
        const col = i % 8, row = Math.floor(i / 8);
        const a = N.npcs.spawn(id, { x: c.x - 64 + col * 17, y: c.y - 28 + row * 19 }, { angle: Math.PI / 2, idle: 'stand', free: true });
        if (a) placed.push(id);
      });
      N.render.camOverride = { x: c.x - 4, y: c.y + 6, zoom: 2.7, snap: true };
      return { placed: placed.length, of: ids.length };
    });
    if (r.placed !== r.of) fail('world: spawned ' + r.placed + '/' + r.of); else ok('spawned ' + r.placed + ' characters at playground_1');
    await sleep(700);
    await shot('world_cast_day');
    await page.evaluate(() => { N.flags.year = 2026; });
    await sleep(300);
    await shot('world_cast_2026');
    await page.evaluate(() => { delete N.flags.year; for (const a of N.npcs.all()) N.npcs.despawn(a); N.render.camOverride = null; });
    // schedules: regulars around the colony at noon
    const s = await page.evaluate(async () => {
      N.debug.teleport('home');
      await new Promise((r) => setTimeout(r, 1500));
      return N.npcs.all().map((a) => a.key + (a.level ? '^' + a.level : ''));
    });
    const need = ['aunty', 'aunty_2', 'aunty_3', 'ammamma', 'agarwal', 'salim'];
    const lack = need.filter((k) => s.indexOf(k) < 0);
    if (lack.length) fail('colony schedules missing: ' + lack.join(', ') + ' (have ' + s.join(', ') + ')'); else ok('colony regulars by schedule: ' + s.join(', '));
    await page.evaluate(() => { const p = N.places.playground_1; N.render.camOverride = { x: p.x - 10, y: p.y - 30, zoom: 2.4, snap: true }; });
    await sleep(500);
    await shot('world_aunty_bench');
    // Patang Chacha on his roof + Faramarz at his café (Old City)
    const oc = await page.evaluate(async () => {
      N.debug.teleport('gulzar_houz');
      await new Promise((r) => setTimeout(r, 1500));
      const k = N.npcs.get('kite_chacha'), f = N.npcs.get('faramarz');
      if (k) N.render.camOverride = { x: k.x, y: k.y + 10, zoom: 2.4, snap: true };
      return { kite: k ? { x: Math.round(k.x), y: Math.round(k.y), level: k.level || null } : null, faramarz: f ? { x: Math.round(f.x), y: Math.round(f.y) } : null, cafe19: !!(N.places.irani_cafe_19 || N.places.cafe_noor_e_iran) };
    });
    if (!oc.kite) fail('Patang Chacha not on his roof by schedule'); else ok('Patang Chacha at ' + JSON.stringify(oc.kite));
    if (oc.cafe19 && !oc.faramarz) fail('Faramarz uncle not at irani_cafe_19'); else if (!oc.cafe19) warn('irani_cafe_19 not in the map yet: Faramarz waits for it'); else ok('Faramarz uncle at ' + JSON.stringify(oc.faramarz));
    await sleep(400);
    await shot('world_patang_roof');
    await page.evaluate(() => { N.render.camOverride = null; N.debug.teleport('home'); });
  }

  /* ---------------------------------------------------------- talk */
  if (want('talk')) {
    await page.evaluate(() => { N.debug.teleport('playground_1'); N.npcs.spawn('immu', 'player', { idle: 'stand' }); });
    await sleep(400);
    const lab = await page.evaluate(() => N.input.actionLabel);
    if (lab !== 'Talk to Immu') fail('talk label: ' + lab); else ok('ACTION label "' + lab + '"');
    await page.keyboard.press('KeyE');
    await sleep(250);
    const c1 = await page.evaluate(() => ({ open: N.dialogue.isOpen(), cur: N.dialogue.current, name: document.querySelector('#dialogue .dlg-name').textContent, right: document.querySelector('#dialogue').classList.contains('right'), mode: N.state.mode }));
    if (!c1.open || !c1.cur || c1.cur.speaker !== 'immu' || c1.name !== 'Immu') fail('talking to Immu did not open his line: ' + JSON.stringify(c1));
    else ok('E opens Immu’s line: “' + c1.cur.text + '” (mode ' + c1.mode + ', left side ' + !c1.right + ')');
    await sleep(600);
    await shot('talk_immu');
    for (let i = 0; i < 4 && (await page.evaluate(() => N.dialogue.isOpen())); i++) { await page.keyboard.press('KeyE'); await sleep(200); }
    if (await page.evaluate(() => N.dialogue.isOpen())) fail('dialogue did not close after E'); else ok('E advances and closes');
    // the hero speaks from the right
    await page.evaluate(() => { N.dialogue.say('chinnu', 'Copy, Agent Immu. *Saddi* ready. *Dheel*... *dheel*... *khench!*', { mood: 'happy' }); });
    await sleep(900);
    const side = await page.evaluate(() => ({ right: document.querySelector('#dialogue').classList.contains('right'), name: document.querySelector('#dialogue .dlg-name').textContent }));
    if (!side.right) fail('chinnu not on the right'); else ok('the hero (' + side.name + ') speaks from the right');
    await shot('talk_chinnu_right');
    await page.evaluate(() => N.dialogue.cancel());
    // aunty network + Ammamma through N.hints (storycore)
    const h = await page.evaluate(async () => {
      if (!N.hints || !N.hints.register || !N.hints.start) return { skipped: true };
      N.hints.register('__test_clue', { clue: 'Find the clock tower that talks with half its faces.', answer: 'mozamjahi_market', name: 'Mozamjahi Market', ammamma: 'A tower that talks? Clocks talk, *kanna*. Mozamjahi.' });
      N.hints.start('__test_clue', { clue: 'Find the clock tower that talks with half its faces.', answer: 'mozamjahi_market', name: 'Mozamjahi Market' });
      const out = {};
      N.npcs.spawn('aunty_2', 'player', { idle: 'stand' });
      await new Promise((r) => setTimeout(r, 300));
      out.label = N.input.actionLabel;
      N.npcs.talkTo('aunty_2');
      await new Promise((r) => setTimeout(r, 100));
      out.aunty = N.dialogue.current && N.dialogue.current.text;
      N.dialogue.cancel(); await new Promise((r) => setTimeout(r, 300));
      N.npcs.spawn('ammamma', 'player', { idle: 'sit' });
      N.npcs.talkTo('ammamma');
      await new Promise((r) => setTimeout(r, 100));
      out.ammamma = N.dialogue.current && N.dialogue.current.text;
      N.dialogue.cancel();
      N.hints.stop();
      N.npcs.despawn('aunty_2'); N.npcs.despawn('ammamma');
      if (N.wanted && N.wanted.clear) N.wanted.clear();
      return out;
    });
    if (h.skipped) warn('N.hints not present: hint hook untested');
    else if (h.label !== 'Ask aunty' || !/Mozamjahi/i.test(h.aunty || '') || !/Mozamjahi/i.test(h.ammamma || '')) fail('hint hook: ' + JSON.stringify(h));
    else ok('“Ask aunty” → ' + h.aunty + ' · Ammamma → ' + h.ammamma);
    await page.evaluate(() => { N.npcs.despawn('immu'); });
  }

  /* ---------------------------------------------------------- walk */
  if (want('walk')) {
    const walk = async (label, id, from, to, opts, scale) => {
      const r = await page.evaluate(async ({ id, from, to, opts, scale }) => {
        const P = N.places, f = P[from] || { x: from[0], y: from[1] };
        N.debug.teleport(f.x + 30, f.y + 30);
        const a = N.npcs.spawn(id, from, { idle: 'stand', key: 'walker_' + id });
        N.render.follow = a; N.render.snapCamera();
        N.time.scale = scale || 1;
        let bad = 0, samples = 0;
        const iv = setInterval(() => { samples++; if (!N.world.isWalkable(a.x, a.y)) bad++; }, 100);
        const t0 = performance.now();
        const tgt = P[to];
        const res = await Promise.race([N.npcs.walkTo('walker_' + id, to, opts), new Promise((r) => setTimeout(() => r('timeout'), 60000))]);
        clearInterval(iv);
        N.time.scale = 1;
        N.render.follow = null;
        const out = { res, ms: Math.round(performance.now() - t0), stats: Object.assign({}, a.stats), bad, samples, left: Math.round(Math.hypot(a.x - tgt.x, a.y - tgt.y)), crow: Math.round(Math.hypot(tgt.x - f.x, tgt.y - f.y)) };
        N.npcs.despawn(a);
        N.debug.teleport(N.player.x, N.player.y);
        return out;
      }, { id, from, to, opts, scale });
      const st = r.stats;
      const line = label + ': ' + r.crow + 'u crow-flies, walked ' + Math.round(st.dist) + 'u in ' + r.ms + 'ms (x' + (scale || 1) + '), replans ' + st.replans + ', unsticks ' + st.unsticks + ', hops ' + st.hops + ', off-walkable samples ' + r.bad + '/' + r.samples;
      if (r.res !== true) fail('walkTo ' + line + ' → ' + r.res + ' (' + r.left + 'u left)');
      else if (st.hops > 0) fail('walkTo got stuck in view (hopped) ' + line);
      else if (r.bad > 0) fail('walkTo left walkable ground ' + line);
      else ok('walkTo ' + line);
      return r;
    };
    await walk('short (home → Café Gulistan)', 'nanna', 'home', 'irani_cafe_7', {}, 1);
    await walk('medium (home → Koti bus stand)', 'bunty', 'home', 'koti_bus_stand', { run: true }, 3);
    await walk('long, road graph (Koti → Charminar plaza)', 'ticket_thatha', 'koti_bus_stand', 'charminar_plaza', { speed: 140 }, 4);
    await walk('long (RTC X Roads → Public Gardens)', 'pochaiah', 'rtc_x_roads', 'public_gardens', { speed: 140 }, 4);
    await walk('across the colony (school_1 → playground_14)', 'vimala_maam', 'school_1', 'playground_14', { speed: 120 }, 3);
    await walk('Old City lanes (Laad Bazaar → Gulzar Houz)', 'bangle_man', 'laad_bazaar', 'gulzar_houz', {}, 2);
    // a mission that ends rejects the walk with a MissionAbort (the script never runs on)
    const ab = await page.evaluate(async () => {
      if (!N.missions || !N.missions.register) return { skipped: true };
      let after = 'not reached', caught = null;
      N.missions.register({ id: '__npc_walk_test', title: 'Walk test', autosave: false, script: async () => {
        N.npcs.spawn('chitti', 'player', { idle: 'stand' });
        try { await N.npcs.walkTo('chitti', 'koti_bus_stand'); after = 'ran on'; } catch (e) { caught = e && e.name; throw e; }
      } });
      N.missions.start('__npc_walk_test');
      await new Promise((r) => setTimeout(r, 400));
      N.missions.abort();
      await new Promise((r) => setTimeout(r, 300));
      N.npcs.despawn('chitti');
      return { after, caught };
    });
    if (ab.skipped) warn('missions not present: abort path untested');
    else if (ab.after !== 'not reached' || ab.caught !== 'MissionAbort') fail('walkTo after mission abort: ' + JSON.stringify(ab));
    else ok('walkTo rejects with MissionAbort when its mission ends');
  }

  /* ---------------------------------------------------------- follow */
  if (want('follow')) {
    await page.evaluate(() => {
      window.__drive = null;
      N.addSystem({
        id: '__drive', order: 1, runIn: ['play'],
        update() {
          const d = window.__drive; if (!d) return;
          const p = N.player, v = p.vehicle || p;
          const wp = d.pts[d.i];
          if (!wp) { N.input.setMove(null); d.done = true; return; }
          const dx = wp.x - v.x, dy = wp.y - v.y, L = Math.hypot(dx, dy);
          if (L < (p.vehicle ? 20 : 8)) { d.i++; return; }
          const m = p.vehicle && d.i === d.pts.length - 1 && L < 60 ? 0.5 : 1;
          N.input.setMove((dx / L) * m, (dy / L) * m, true);
        },
      });
    });
    const route = async (to, maxMs) => page.evaluate(async ({ to, maxMs }) => {
      const p = N.player, v = p.vehicle || p, t = N.places[to];
      const pts = N.npcs.planPath(v.x, v.y, t.x, t.y);
      window.__drive = { pts, i: 0, done: false };
      const a = N.npcs.get('immu');
      let maxD = 0, rideT = 0, n = 0;
      const t0 = performance.now();
      while (!window.__drive.done && performance.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 100));
        const d = Math.hypot(a.x - N.player.x, a.y - N.player.y);
        n++; if (n > 10) maxD = Math.max(maxD, d);
        if (a.vehicle) rideT++;
      }
      window.__drive = null; N.input.setMove(null);
      await new Promise((r) => setTimeout(r, 1800));
      return { done: performance.now() - t0 < maxMs, ms: Math.round(performance.now() - t0), maxD: Math.round(maxD), endD: Math.round(Math.hypot(a.x - N.player.x, a.y - N.player.y)), riding: !!a.vehicle, vtype: a.vehicle ? a.vehicle.type : null, vcolor: a.vehicle ? a.vehicle.color : null, rideT, stats: Object.assign({}, a.stats), pts: pts.length };
    }, { to, maxMs });
    await page.evaluate(() => { N.debug.teleport('home'); const a = N.npcs.spawn('immu', 'player', { idle: 'stand' }); N.npcs.follow('immu', N.player, { ride: true }); });
    await sleep(300);
    const f1 = await route('irani_cafe_7', 20000);
    if (!f1.done || f1.endD > 50) fail('follow on foot: ' + JSON.stringify(f1)); else ok('follow on foot: ' + f1.ms + 'ms, end gap ' + f1.endD + 'u, max gap ' + f1.maxD + 'u');
    await page.evaluate(() => { N.debug.enterVehicle('cycle'); });
    await sleep(300);
    const f2 = await route('koti_bus_stand', 45000);
    await page.screenshot({ path: path.join(OUT, 'follow_riding.png') });
    if (!f2.done) fail('follow ride: the player did not arrive ' + JSON.stringify(f2));
    else if (!f2.riding || f2.vtype !== 'cycle') fail('Immu did not ride his own cycle: ' + JSON.stringify(f2));
    else if (f2.endD > 120 || f2.maxD > 320) fail('Immu fell behind on his cycle: ' + JSON.stringify(f2));
    else ok('Immu rides his own ' + f2.vcolor + ' cycle: end gap ' + f2.endD + 'u, max gap ' + f2.maxD + 'u (' + f2.ms + 'ms, hops ' + f2.stats.hops + ')');
    const f3 = await page.evaluate(async () => {
      N.vehicles.exit(N.player, true);
      await new Promise((r) => setTimeout(r, 3500));
      const a = N.npcs.get('immu');
      return { riding: !!a.vehicle, d: Math.round(Math.hypot(a.x - N.player.x, a.y - N.player.y)), parked: a.ownVehicle && a.ownVehicle.alive && !a.ownVehicle.driver, noEnter: a.ownVehicle && a.ownVehicle.noEnter };
    });
    if (f3.riding || f3.d > 60) fail('Immu did not get off after the player: ' + JSON.stringify(f3)); else ok('Immu gets off and walks over (gap ' + f3.d + 'u, his cycle parked, not borrowable: ' + f3.noEnter + ')');
    await page.evaluate(() => { N.npcs.follow('immu', null); N.npcs.despawn('immu'); });
  }

  /* ---------------------------------------------------------- gloss + names */
  if (want('gloss')) {
    await page.evaluate(() => { N.debug.teleport('playground_1'); N.dialogue.say('yadagiri', 'Gulzar Houz? On Sankranti? *Meter nakko, das upar.* The roads are all kites. *Arre*, {nick}, *pakka*?'); N.dialogue.advance(); });
    await sleep(300);
    const g = await page.evaluate(() => ({
      slang: Array.from(document.querySelectorAll('#dialogue .dlg-text .slang')).map((e) => [e.textContent, e.dataset.gloss || '']),
      row: Array.from(document.querySelectorAll('#dialogue .dlg-gloss .gl')).map((e) => e.textContent),
      shown: getComputedStyle(document.querySelector('#dialogue .dlg-gloss')).display,
    }));
    const noGloss = g.slang.filter((s) => !s[1]);
    if (g.slang.length < 3 || noGloss.length) fail('slang tooltips: ' + JSON.stringify(g)); else ok('slang highlighted with tooltips: ' + g.slang.map((s) => s[0] + ' = ' + s[1]).join(' | '));
    if (g.shown === 'none' || g.row.length < 3) fail('meanings row not shown: ' + JSON.stringify(g.row)); else ok('meanings row: ' + g.row.join(' · '));
    const el = await page.$('#dialogue .dlg-text .slang');
    if (el) { await el.hover(); await sleep(200); }
    await page.screenshot({ path: path.join(OUT, 'gloss_tooltip.png') });
    await page.evaluate(() => N.dialogue.cancel());
  }
  if (want('names')) {
    const n = await page.evaluate(() => {
      N.dialogue.setNames({ nick: 'Pintu', full: 'Ravi Kumar' });
      const out = {};
      out.filter = N.dialogue.filter('{FULL}! {nick}, where is Chinnu? Agent Chinnu, email chinnu_charminar. K. Srikanth, SRIKANTH.');
      out.chinnuName = N.dialogue.speakerName('chinnu');
      out.youName = N.dialogue.speakerName('you');
      out.srikanth = N.dialogue.speakerName('srikanth');
      N.dialogue.say('amma', '*{FULL}!* *Pesarattu* is getting cold!', { mood: 'angry' }); N.dialogue.advance();
      out.text = document.querySelector('#dialogue .dlg-text').textContent;
      out.label = (() => { const a = N.npcs.spawn('chinnu', 'player', { key: '__c' }); const l = a ? a.name : null; N.npcs.despawn('__c'); return l; })();
      return out;
    });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, 'names_amma_angry.png') });
    await page.evaluate(() => { N.dialogue.cancel(); N.dialogue.setNames({ nick: 'Chinnu', full: 'Srikanth' }); });
    const expect = 'RAVI KUMAR! Pintu, where is Pintu? Agent Pintu, email pintu_charminar. K. Ravi Kumar, RAVI KUMAR.';
    if (n.filter !== expect) fail('name filter: ' + n.filter);
    else if (n.chinnuName !== 'Pintu' || n.youName !== 'Pintu' || n.srikanth !== 'K. Ravi Kumar' || n.text !== 'RAVI KUMAR! Pesarattu is getting cold!') fail('names: ' + JSON.stringify(n));
    else ok('names: ' + n.filter + ' · plates ' + n.chinnuName + ' / ' + n.srikanth);
  }

  /* ---------------------------------------------------------- barks + emotes */
  if (want('barks')) {
    const b = await page.evaluate(async () => {
      N.debug.teleport('playground_1');
      const p = N.player;
      const sp = (id, dx, dy) => N.npcs.spawn(id, { x: p.x + dx, y: p.y + dy }, { idle: 'stand' });
      sp('immu', 26, -6); sp('faramarz', -30, -10); sp('chitti', 6, 24); sp('pasha', -44, 22); sp('pochaiah', 44, 26); sp('ammamma', -8, -34);
      N.render.camOverride = { x: p.x, y: p.y, zoom: 2.4, snap: true };
      N.npcs.bark('immu', 'Agent {nick}! Red kite, two o’clock. *Over!*');
      N.npcs.bark('faramarz', '*Do chai, ek plate Osmania!*');
      N.npcs.bark('chitti', '*Mummy ki cheppesta!*');
      N.npcs.emote('pasha', '?', 8); N.npcs.emote('pochaiah', '!', 8); N.npcs.emote('ammamma', '♪', 8);
      await new Promise((r) => setTimeout(r, 500));
      return { n: document.querySelectorAll('#barks .bark').length, txt: Array.from(document.querySelectorAll('#barks .bark-text')).map((e) => e.textContent), vis: Array.from(document.querySelectorAll('#barks .bark')).map((e) => e.style.visibility !== 'hidden' && e.getBoundingClientRect().width > 20) };
    });
    if (b.n !== 3 || b.vis.some((v) => !v) || b.txt[0].indexOf('Agent Chinnu') !== 0) fail('barks: ' + JSON.stringify(b)); else ok('barks shown over their speakers: ' + b.txt.join(' | '));
    await shot('barks_emotes');
    await page.evaluate(() => { N.render.camOverride = null; N.dialogue.clearBarks(); for (const a of N.npcs.all()) if (!/^sched:/.test(a.owner)) N.npcs.despawn(a); });
  }

  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  checkErrors('desktop', errors, nerr);
  await context.close();
}

/* ======================================================================== phone / landscape */
async function lineFit(browser, V, tag) {
  console.log('\n== ' + tag + ' ' + V.viewport.width + 'x' + V.viewport.height);
  const { context, page, errors } = await openPage(browser, V);
  const lines = bibleLines();
  const res = await page.evaluate(({ lines, choices }) => {
    const D = N.dialogue, out = [];
    const vw = window.innerWidth, vh = window.innerHeight;
    const all = lines.concat(choices);
    for (const l of all) {
      D.cancel();
      if (l.c) D.choice(l.s, l.t, l.c); else D.say(l.s, l.t);
      D.advance();
      const box = document.querySelector('#dialogue .dlg-box').getBoundingClientRect();
      const name = document.querySelector('#dialogue .dlg-name').getBoundingClientRect();
      const txt = document.querySelector('#dialogue .dlg-text');
      out.push({ s: l.s, t: l.t, c: !!l.c, h: Math.round(box.height), top: Math.round(box.top), left: Math.round(box.left), right: Math.round(box.right), bottom: Math.round(box.bottom), nameR: Math.round(name.right), nameL: Math.round(name.left), over: txt.scrollWidth > txt.clientWidth + 1 });
    }
    D.cancel();
    return { out, vw, vh, docW: document.documentElement.scrollWidth };
  }, { lines, choices: CHOICES });
  const V2 = V.viewport;
  const maxTop = tag === 'phone' ? 70 : 4;   // keep clear of the top HUD strip on phones
  const maxH = tag === 'phone' ? V2.height * 0.6 : V2.height - 8;
  const bad = res.out.filter((r) => r.left < 0 || r.right > V2.width || r.top < maxTop || r.h > maxH || r.over || r.nameL < 0 || r.nameR > V2.width);
  const tallest = res.out.slice().sort((a, b) => b.h - a.h)[0];
  if (res.docW > V2.width) fail(tag + ': page scrolls horizontally (' + res.docW + ')');
  if (bad.length) fail(tag + ': ' + bad.length + '/' + res.out.length + ' lines do not fit, e.g. ' + JSON.stringify(bad.slice(0, 3)));
  else ok(tag + ': all ' + res.out.length + ' bible lines + choices fit (tallest box ' + tallest.h + 'px, top ' + tallest.top + 'px: ' + tallest.s + ': ' + tallest.t.slice(0, 60) + '…)');
  // screenshots: the tallest line, the tallest choice, a right-side line
  const shotLine = async (l, n) => {
    await page.evaluate((l) => { N.dialogue.cancel(); if (l.c) N.dialogue.choice(l.s, l.t, l.c); else N.dialogue.say(l.s, l.t); N.dialogue.advance(); }, l);
    await sleep(450);
    await page.screenshot({ path: path.join(OUT, tag + '_' + n + '.png') });
  };
  await shotLine(lines.find((l) => l.s === tallest.s && l.t === tallest.t) || tallest, 'tallest_line');
  const tc = res.out.filter((r) => r.c).sort((a, b) => b.h - a.h)[0];
  await shotLine(CHOICES.find((c) => c.t === tc.t), 'tallest_choice');
  await shotLine({ s: 'chinnu', t: 'Ammamma... can I record here? There’s no bell.' }, 'chinnu_right');
  await shotLine({ s: 'immu_tape', t: 'Agent Immu to Agent Chinnu. If you found this, you’re at Sandhya and it’s six o’clock.' }, 'immu_tape');
  await page.evaluate(() => N.dialogue.cancel());
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  checkErrors(tag, errors, nerr);
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (['data', 'sheet', 'world', 'talk', 'walk', 'follow', 'gloss', 'names', 'barks'].some(want)) await desktop(browser);
    if (want('phone')) await lineFit(browser, { viewport: { width: 390, height: 844 }, dpr: 2, touch: true }, 'phone');
    if (want('landscape')) await lineFit(browser, { viewport: { width: 844, height: 390 }, dpr: 2, touch: true }, 'landscape');
  } catch (e) {
    fail('test crashed: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S)' : 'ALL OK') + (warnings.length ? ' (' + warnings.length + ' warning(s))' : '') + ' — screenshots in tests/out/npcs/');
  process.exit(failures.length ? 1 : 0);
})();
