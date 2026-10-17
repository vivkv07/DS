/* NOSTALGIA — tests/seasons.cjs  (owner: world-reconcile + seasons agent)
 * Headless Chromium checks for the map reconcile, roof zones, respect zones and seasons:
 *   registry  tools/check_registry.cjs + tools/validate_map.cjs pass; every WORLD_DATA place is in
 *             N.places; the bible's NEW ids exist; Tank Bund statues are numbered from Lumbini
 *   respect   N.respect.at / near / procession answers (mosque compound, forecourt, Charminar
 *             interior, nothing at home); every worship place has a zone; no bible collectible
 *             spot (K / G lists) lies inside a compound
 *   roofs     teleport onto home_terrace, walk the M1 lootna route over all six terraces and five
 *             planks (synthetic stick input), can't step off an edge, stairs down / up with ACTION,
 *             roof-only interactables, an NPC put on a roof, save/load keeps the level
 *   seasons   the bible §1.4 calendar (autoFor), set/override/mirror into N.flags, season:change,
 *             day + night screenshots of every season at its place (tests/out/seasons_*.png)
 *   perf      per-overlay draw cost in the busiest festival scenes (N.seasons.profile)
 * Fails on any console error, page error or N.err.
 *   node tests/seasons.cjs            ONLY=registry,respect,roofs,seasons,perf   SHOTS=0 (no screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || 'registry,respect,roofs,seasons,perf').split(',');
const SHOTS = process.env.SHOTS !== '0';

const failures = [];
const fail = (sec, msg) => { failures.push('[' + sec + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// bible collectible spots (K and G lists) that are hide_* places
function bibleHides() {
  const t = fs.readFileSync(path.join(ROOT, 'design/story_bible.md'), 'utf8');
  const sec = t.slice(t.indexOf('### 6.1 '), t.indexOf('### 6.3 '));
  return [...new Set((sec.match(/hide_[a-z_]+/g) || []))];
}

async function main() {
  // ------------------------------------------------------------ node-side tools
  if (ONLY.includes('registry')) {
    console.log('\n== registry (tools)');
    for (const tool of ['tools/validate_map.cjs', 'tools/check_registry.cjs']) {
      try { const out = execFileSync('node', [path.join(ROOT, tool), '--quiet'], { encoding: 'utf8' }); ok(tool + ': ' + out.trim().split('\n').pop()); }
      catch (e) { fail('registry', tool + ' failed:\n' + ((e.stdout || '') + (e.stderr || '')).split('\n').filter((l) => /ERROR|FAIL/.test(l)).slice(0, 12).join('\n')); }
    }
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed in tests */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); if (N.dialogue && N.dialogue.skip !== undefined) N.dialogue.skip = true; if (N.dialogue && N.dialogue.cancel) N.dialogue.cancel(); });
  await sleep(300);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(OUT, 'seasons_' + name + '.png') }); };
  // put the camera somewhere and settle (freezes the clock)
  const view = async (place, date, opts) => {
    opts = opts || {};
    return page.evaluate(([place, date, opts]) => {
      if (opts.flags) Object.assign(N.flags, opts.flags);
      if (N.calendar && N.calendar.set) N.calendar.set(date[0], date[1], date[2], date[3], date[4] || 0);
      else { N.seasons.autoFor({ y: date[0], m: date[1], d: date[2] }); N.debug.setTime(date[3], date[4] || 0); }
      N.debug.freezeClock && N.debug.freezeClock(true);
      const p = N.places[place];
      N.debug.teleport(place);
      N.render.camOverride = { x: p.x + (opts.dx || 0), y: p.y + (opts.dy || 0), zoom: opts.zoom || 1, snap: true };
      return N.seasons.active();
    }, [place, date, opts]);
  };

  // ------------------------------------------------------------ registry (in page)
  if (ONLY.includes('registry')) {
    console.log('\n== registry (in page)');
    const r = await page.evaluate(() => {
      const D = N.WORLD_DATA;
      const missing = D.places.filter((p) => !N.places[p.id]).map((p) => p.id);
      const NEW = ['irani_cafe_19', 'cafe_noor_e_iran', 'recording_centre_1', 'electronics_shop_1', 'charminar_gallery'];
      const newOk = NEW.filter((id) => N.places[id]);
      const lm7 = D.landmarks.find((l) => l.id === 'irani_cafe_7');
      const st = [];
      for (let k = 1; k <= 12; k++) { const l = D.landmarks.find((x) => x.id === 'tank_bund_statue_' + k); if (l) st.push(Math.round(Math.hypot(l.x - N.places.lumbini_park.x, l.y - N.places.lumbini_park.y))); }
      const flowers = [5, 6, 7, 8].map((k) => Math.round(Math.hypot(N.places['flower_cart_' + k].x - N.places.dilsukhnagar_sai_temple.x, N.places['flower_cart_' + k].y - N.places.dilsukhnagar_sai_temple.y)));
      const pods = (N.world.podiums || []).length;
      const coconut = N.world.trees.filter((t) => t.kind === 'coconut').length;
      return { missing, newOk, NEW, sign: lm7 && lm7.sign, st, flowers, pods, coconut, places: Object.keys(N.places).length, rtcPod: (N.world.podiums || []).some((p) => p.id === 'rtc_x_roads') };
    });
    if (r.missing.length) fail('registry', 'places missing from N.places: ' + r.missing.join(', ')); else ok(r.places + ' places loaded');
    if (r.newOk.length !== r.NEW.length) fail('registry', 'bible NEW ids missing: ' + r.NEW.filter((i) => r.newOk.indexOf(i) < 0)); else ok('bible NEW ids: ' + r.NEW.join(', '));
    if (!/GULISTAN/.test(r.sign || '')) fail('registry', 'irani_cafe_7 sign is ' + r.sign); else ok('irani_cafe_7 reads ' + r.sign);
    if (r.st.length !== 12 || r.st.some((d, i) => i && d < r.st[i - 1])) fail('registry', 'Tank Bund statues not numbered from Lumbini: ' + r.st); else ok('Tank Bund statues 1..12 from the Lumbini end');
    if (r.flowers.some((d) => d > 140)) fail('registry', 'flower carts 5..8 not by the Sai temple: ' + r.flowers); else ok('flower_cart_5..8 in the Sai Baba temple lane (' + r.flowers.join(', ') + ' u)');
    if (r.pods < 10 || !r.rtcPod) fail('registry', 'podiums: ' + r.pods); else ok(r.pods + ' podium junctions (rtc_x_roads included)');
    if (r.coconut < 40) fail('registry', 'only ' + r.coconut + ' coconut trees'); else ok(r.coconut + ' coconut trees (Necklace Road + colony compounds)');
  }

  // ------------------------------------------------------------ respect zones
  if (ONLY.includes('respect')) {
    console.log('\n== respect zones');
    const hides = bibleHides();
    const r = await page.evaluate((hides) => {
      const R = N.respect, D = N.WORLD_DATA;
      const mm = D.landmarks.find((l) => l.id === 'mecca_masjid');
      const ch = D.landmarks.find((l) => l.id === 'charminar');
      const z = R.zones;
      const worship = D.places.filter((p) => /^(temple|mosque|church|dargah|gurudwara)$/.test(p.kind) && !p.alias).map((p) => p.id);
      const zp = new Set(z.map((q) => q.place));
      const noZone = worship.filter((id) => !zp.has(id));
      const mz = z.find((q) => q.id === 'mecca_masjid');
      const fc = mz.forecourt[0];
      const res = {
        n: z.length, noZone,
        mosque: R.at(mm.x, mm.y), fore: R.at(fc[0] + fc[2] / 2, fc[1] + fc[3] / 2), charminar: R.at(ch.x, ch.y),
        home: R.at(N.places.home.x, N.places.home.y), plaza: R.at(N.places.charminar_plaza.x, N.places.charminar_plaza.y),
        near: R.near(mm.x + mm.w / 2 + 60, mm.y, 80), far: R.near(N.places.home.x, N.places.home.y, 40),
        birlaSteps: (() => { const st = D.roads.find((q) => q.id === 'birla_mandir_steps'); return st ? R.at(st.pts[1][0], st.pts[1][1]) : null; })(),
      };
      R.procession('test_proc', [[4580, 2560], [4700, 2560]], 10, { name: 'Test procession' });
      res.proc = R.at(4640, 2562);
      R.endProcession('test_proc');
      res.procOff = R.at(4640, 2562);
      res.badHides = hides.filter((id) => { const p = N.places[id]; const h = p && R.at(p.x, p.y); return h && h.part === 'compound'; });
      res.missingHides = hides.filter((id) => !N.places[id]);
      res.json = JSON.stringify(res.mosque).length > 0;
      return res;
    }, hides);
    if (r.noZone.length) fail('respect', 'worship places without a zone: ' + r.noZone.join(', ')); else ok(r.n + ' respect zones; every temple / mosque / church / dargah / gurudwara covered');
    if (!r.mosque || r.mosque.id !== 'mecca_masjid' || r.mosque.part !== 'compound') fail('respect', 'Mecca Masjid compound: ' + JSON.stringify(r.mosque)); else ok('at(Mecca Masjid) = compound (mosque)');
    if (!r.fore || r.fore.part !== 'forecourt') fail('respect', 'Mecca Masjid forecourt: ' + JSON.stringify(r.fore)); else ok('at(Mecca Masjid gate + 15 u) = forecourt');
    if (!r.charminar || r.charminar.kind !== 'charminar') fail('respect', 'Charminar interior: ' + JSON.stringify(r.charminar)); else ok("at(Charminar) = Charminar's interior");
    if (r.home) fail('respect', 'home is in a respect zone: ' + JSON.stringify(r.home)); else ok('at(home) = null');
    if (r.plaza && r.plaza.part === 'compound') fail('respect', 'the Charminar plaza must stay open for the M12 chase'); else ok('Charminar plaza is not a compound');
    if (!r.near || !(r.near.d <= 80)) fail('respect', 'near() missed the Mecca Masjid'); else ok('near(60 u from the Mecca Masjid wall) = ' + r.near.zone.id + ' at ' + Math.round(r.near.d) + ' u');
    if (r.far) fail('respect', 'near(home) found ' + r.far.zone.id); else ok('near(home, 40) = null');
    if (!r.birlaSteps) fail('respect', 'Birla Mandir steps are not walk-only'); else ok('Birla Mandir steps are in the temple zone');
    if (!r.proc || r.proc.kind !== 'procession' || r.procOff) fail('respect', 'procession add/remove: ' + JSON.stringify([r.proc, r.procOff])); else ok('procession zones add and remove');
    if (r.badHides.length) fail('respect', 'collectible spots inside a compound: ' + r.badHides.join(', ')); else ok(hides.length + ' bible K/G spots are outside every compound');
    if (r.missingHides.length) fail('respect', 'bible hide spots missing: ' + r.missingHides.join(', '));
  }

  // ------------------------------------------------------------ roof zones
  if (ONLY.includes('roofs')) {
    console.log('\n== roof zones');
    await page.evaluate(() => { N.debug.setTime(10, 0); N.debug.freezeClock && N.debug.freezeClock(true); N.render.camOverride = null; N.debug.teleport('home_terrace'); });
    await sleep(300);
    let st = await page.evaluate(() => ({ level: N.player.level, x: N.player.x, y: N.player.y, roofs: N.world.roofs.list.length, planks: N.world.roofs.planks.length, route: N.world.roofs.route().map((r) => r.id) }));
    if (st.level !== 'home_terrace') fail('roofs', 'teleport home_terrace -> level ' + st.level); else ok('teleport(home_terrace) puts Chinnu on the home terrace (' + st.roofs + ' roofs, ' + st.planks + ' planks)');
    if (st.route.length < 6) fail('roofs', 'lootna route has ' + st.route.length + ' terraces');
    await shot('roof_home');
    // walk the M1 lootna route with the stick: plank centres between terraces
    const walk = await page.evaluate(async () => {
      const RF = N.world.roofs;
      const pts = [];
      const route = RF.route();
      pts.push([RF.get('home_terrace').stairs[0].tx, RF.get('home_terrace').stairs[0].ty]);
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i], b = route[i + 1];
        const p = RF.planks.find((q) => (q.a === a.id && q.b === b.id) || (q.a === b.id && q.b === a.id));
        const [x, y, w, d] = p.rect;
        const c = [x + w / 2, y + d / 2];
        // approach the plank along its axis: a point on each roof in line with it
        if (p.horiz) { const sa = a.cx < b.cx ? -1 : 1; pts.push([c[0] + sa * (w / 2 + 6), c[1]], c, [c[0] - sa * (w / 2 + 6), c[1]]); }
        else { const sa = a.cy < b.cy ? -1 : 1; pts.push([c[0], c[1] + sa * (d / 2 + 6)], c, [c[0], c[1] - sa * (d / 2 + 6)]); }
      }
      const end = route[route.length - 1].stairs[0];
      pts.push([end.tx, end.ty]);
      const seen = new Set();
      for (const [tx, ty] of pts) {
        for (let k = 0; k < 240; k++) {
          const dx = tx - N.player.x, dy = ty - N.player.y, l = Math.hypot(dx, dy);
          if (l < 2.5) break;
          N.input.setMove(dx / l, dy / l, true);
          await new Promise((r) => requestAnimationFrame(r));
          if (N.player.level) seen.add(N.player.level);
        }
      }
      N.input.setMove(null);
      return { seen: [...seen], level: N.player.level, x: N.player.x, y: N.player.y, end: [end.tx, end.ty] };
    });
    if (walk.level !== 'lakshmi_t6' || walk.seen.length < 6) fail('roofs', 'lootna walk ended on ' + walk.level + ' after ' + walk.seen.join(' > ')); else ok('lootna walk: ' + walk.seen.join(' > '));
    await shot('roof_lootna_end');
    // try to walk off the edge
    const edge = await page.evaluate(async () => {
      N.input.setMove(0, -1, true);
      for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
      N.input.setMove(1, 0, true);
      for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
      N.input.setMove(null);
      const a = N.world.roofs.at(N.player.x, N.player.y);
      return { level: N.player.level, on: !!a };
    });
    if (edge.level !== 'lakshmi_t6' || !edge.on) fail('roofs', 'walked off the roof: ' + JSON.stringify(edge)); else ok('the parapet holds (no falls)');
    // stairs: down with ACTION at the landing, up again with ACTION at the foot
    const stairs = await page.evaluate(async () => {
      const r = N.world.roofs.get('lakshmi_t6'), s = r.stairs[0];
      N.player.teleport(s.tx, s.ty);
      const fr = (n) => new Promise(async (res) => { for (let i = 0; i < n; i++) await new Promise((q) => requestAnimationFrame(q)); res(); });
      await fr(4);
      const label1 = N.interact.current && N.interact.current.label;
      N.input.press('action'); await fr(40);
      const down = { level: N.player.level, x: Math.round(N.player.x), y: Math.round(N.player.y), foot: [s.x, s.y] };
      await fr(4);
      const label2 = N.interact.current && N.interact.current.label;
      N.input.press('action'); await fr(40);
      const up = { level: N.player.level };
      return { label1, label2, down, up };
    });
    if (stairs.down.level !== null || Math.hypot(stairs.down.x - stairs.down.foot[0], stairs.down.y - stairs.down.foot[1]) > 8) fail('roofs', 'stairs down: ' + JSON.stringify(stairs)); else ok('ACTION "' + stairs.label1 + '" -> ground at the stairs foot');
    if (stairs.up.level !== 'lakshmi_t6') fail('roofs', 'stairs up: ' + JSON.stringify(stairs)); else ok('ACTION "' + stairs.label2 + '" -> back on the terrace');
    // roof-only interactables: the home-terrace kite is offered on the roof, not from the alley below
    const inter = await page.evaluate(async () => {
      const fr = (n) => new Promise(async (res) => { for (let i = 0; i < n; i++) await new Promise((q) => requestAnimationFrame(q)); res(); });
      N.world.roofs.add = undefined;
      N.debug.teleport('home_terrace'); await fr(4);
      const onRoof = N.interact.current && N.interact.current.label;
      const home = N.world.roofs.get('home_terrace');
      N.player.teleport(home.x + home.w + 4, N.places.home_terrace.y, { ground: true }); await fr(4);
      const below = N.interact.current && N.interact.current.label;
      return { onRoof, below, level: N.player.level };
    });
    if (inter.level) fail('roofs', 'teleport {ground:true} kept the roof level');
    if (/patang/i.test(inter.below || '')) fail('roofs', 'roof interactable offered from the ground: ' + inter.below); else ok('roof interactables: on the terrace "' + inter.onRoof + '", below it "' + inter.below + '"');
    // an NPC on Immu's terrace (drawn at roof height), then taken down
    const npc = await page.evaluate(async () => {
      const fr = (n) => new Promise(async (res) => { for (let i = 0; i < n; i++) await new Promise((q) => requestAnimationFrame(q)); res(); });
      const a = new N.Actor({ kind: 'npc', r: 3.4, solid: true, look: N.people.randomLook(N.util.rng('immu-test'), 'kid'), anim: { phase: 0, speed: 0 } });
      a.draw = function () { const s = this; N.render.queue('actors', s.y, () => N.draw.sprite(s.x, s.y, s.angle, 8, (c) => N.people.draw(c, s.look, s.anim))); };
      N.entities.add(a);
      const ok1 = N.world.roofs.place(a, 'friend_terrace');
      const r = N.world.roofs.get('friend_terrace');
      N.render.camOverride = { x: r.cx, y: r.cy, zoom: 2, snap: true };
      await fr(10);
      const lv = a.level;
      N.world.roofs.remove(a);
      const after = { level: a.level, walk: N.world.isWalkable(a.x, a.y) };
      N.world.roofs.place(a, 'friend_terrace');
      return { ok1, lv, after, id: a.id };
    });
    await shot('roof_npc_friend');
    if (!npc.ok1 || npc.lv !== 'friend_terrace' || npc.after.level || !npc.after.walk) fail('roofs', 'NPC on roof: ' + JSON.stringify(npc)); else ok("an NPC stands on Immu's terrace and comes down again");
    // save / load keeps the roof
    const sv = await page.evaluate(async () => {
      if (!N.save || !N.save.save) return { skip: true };
      N.render.camOverride = null;
      N.debug.teleport('home_terrace');
      const saved = N.save.save({ reason: 'test', toast: false });
      N.debug.teleport('playground_1');
      const loaded = N.save.load();
      await new Promise((r) => setTimeout(r, 100));
      return { saved, loaded, level: N.player.level };
    });
    if (!sv.skip && (!sv.saved || !sv.loaded || sv.level !== 'home_terrace')) fail('roofs', 'save/load: ' + JSON.stringify(sv)); else ok('save + load keeps Chinnu on the home terrace');
    await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); if (N.dialogue && N.dialogue.cancel) N.dialogue.cancel(); });
  }

  // ------------------------------------------------------------ seasons
  if (ONLY.includes('seasons')) {
    console.log('\n== seasons');
    const cal = await page.evaluate(() => {
      const t = (y, m, d) => N.seasons.calendarFor({ y, m, d });
      const on = (o) => Object.keys(o).filter((k) => o[k]).sort().join(' ');
      return {
        sankranti: on(t(2003, 1, 14)), bhogi: on(t(2003, 1, 13)), feb20: on(t(2003, 2, 20)), may: on(t(2003, 5, 15)), bonalu: on(t(2003, 7, 20)),
        prasads: on(t(2003, 7, 25)), ganesh: on(t(2003, 9, 3)), imm: on(t(2003, 9, 9)), ramzan: on(t(2003, 11, 1)), chand: on(t(2003, 11, 25)),
        eid: on(t(2003, 11, 26)), xmas: on(t(2003, 12, 20)), y2026: on(t(2026, 1, 17)),
      };
    });
    const want = {
      sankranti: 'numaish sankranti', bhogi: 'numaish sankranti', feb20: 'world_cup', may: 'summer', bonalu: 'bonalu monsoon', prasads: 'monsoon prasads_open',
      ganesh: 'ganesh monsoon prasads_open', imm: 'ganesh ganesh_immersion monsoon prasads_open', ramzan: 'prasads_open ramzan', chand: 'chand_raat prasads_open ramzan',
      eid: 'eid prasads_open', xmas: 'christmas prasads_open', y2026: 'numaish prasads_open year2026',
    };
    let calOk = true;
    for (const k in want) if (cal[k] !== want[k]) { calOk = false; fail('seasons', 'calendar ' + k + ': got "' + cal[k] + '", want "' + want[k] + '"'); }
    if (calOk) ok('bible §1.4 calendar: ' + Object.keys(want).length + ' dates match');
    const api = await page.evaluate(() => {
      const ev = [];
      const h = (e) => ev.push(e.name + ':' + e.on);
      N.on('season:change', h);
      N.seasons.autoFor({ y: 2003, m: 1, d: 14 });
      N.seasons.set('christmas', true);
      const mirror = N.flags.christmas === true && N.seasons.is('christmas');
      N.seasons.autoFor({ y: 2003, m: 1, d: 15 }); // overrides stay on top of the calendar
      const kept = N.seasons.is('christmas');
      N.seasons.set('christmas', null);
      const dropped = !N.seasons.is('christmas') && N.flags.christmas === false;
      N.off('season:change', h);
      return { mirror, kept, dropped, ev };
    });
    if (!api.mirror || !api.kept || !api.dropped || api.ev.indexOf('christmas:true') < 0 || api.ev.indexOf('christmas:false') < 0) fail('seasons', 'set/override/mirror: ' + JSON.stringify(api)); else ok('set / override / N.flags mirror / season:change');
    // every season at its place, day and night
    const SC = [
      ['sankranti', 'home', [2003, 1, 14, 10], [2003, 1, 14, 18, 45], { zoom: 1.1, dy: -30 }],
      ['bhogi', 'playground_1', [2003, 1, 13, 6, 20], null, { zoom: 1.2 }],
      ['numaish', 'nampally_exhibition', [2003, 1, 25, 17], [2003, 1, 25, 20], { zoom: 0.9 }],
      ['summer', 'bus_stop_10', [2003, 5, 15, 13], null, { zoom: 1.2 }],
      ['bonalu', 'ujjaini_mahankali_temple', [2003, 7, 20, 11], [2003, 7, 20, 20], { zoom: 1.1 }],
      ['bonalu_oldcity', 'lal_darwaza_temple', [2003, 7, 20, 12], null, { zoom: 1.1 }],
      ['ganesh', 'playground_1', [2003, 9, 3, 12], [2003, 9, 3, 20, 30], { zoom: 1.1 }],
      ['ganesh_immersion', 'ganesh_immersion_point', [2003, 9, 9, 14], [2003, 9, 9, 21], { zoom: 1 }],
      ['khairatabad', 'khairatabad_ganesh', [2003, 9, 3, 12], null, { zoom: 1.2 }],
      ['ramzan', 'charminar', [2003, 11, 10, 17], [2003, 11, 10, 21], { zoom: 0.9, dy: -60 }],
      ['chand_raat', 'charminar', [2003, 11, 25, 18], [2003, 11, 25, 21, 30], { zoom: 0.9, dy: -40 }],
      ['christmas', 'church_wesley', [2003, 12, 20, 16], [2003, 12, 20, 20], { zoom: 0.9 }],
      ['prasads_fence', 'prasads_imax', [2003, 7, 20, 12], null, { zoom: 1.2 }],
      ['prasads_open', 'prasads_imax', [2003, 7, 26, 12], [2003, 7, 26, 20], { zoom: 1.2 }],
      ['year2026', 'charminar', [2026, 1, 17, 16], [2026, 1, 17, 20], { zoom: 0.85, flags: { year: 2026 } }],
      ['monsoon_rain', 'abids', [2003, 7, 1, 15], null, { zoom: 1, flags: { rain: true } }],
    ];
    for (const [name, place, day, night, opts] of SC) {
      const a = await view(place, day, opts);
      await sleep(1200);
      await shot(name + '_day');
      let b = null;
      if (night) { b = await view(place, night, opts); await sleep(1100); await shot(name + '_night'); }
      const e = await page.evaluate(() => N.debug.errors.length);
      ok(name + ' @ ' + place + ': ' + a.join(' ') + (b ? ' | night: ' + b.join(' ') : '') + (e ? ' (errors!)' : ''));
      await page.evaluate(() => { delete N.flags.rain; if (N.flags.year === 2026) N.flags.year = 2003; });
    }
    const respectDyn = await page.evaluate(() => {
      N.calendar ? N.calendar.set(2003, 7, 20, 11, 0) : N.seasons.autoFor({ y: 2003, m: 7, d: 20 });
      const b = N.respect.zones.filter((z) => z.kind === 'procession').map((z) => z.id);
      N.calendar ? N.calendar.set(2003, 9, 9, 14, 0) : N.seasons.autoFor({ y: 2003, m: 9, d: 9 });
      const g = N.respect.zones.filter((z) => z.kind === 'procession').map((z) => z.id);
      N.calendar ? N.calendar.set(2003, 10, 1, 12, 0) : N.seasons.autoFor({ y: 2003, m: 10, d: 1 });
      const none = N.respect.zones.filter((z) => z.kind === 'procession').length;
      return { b, g, none };
    });
    if (!respectDyn.b.length || !respectDyn.g.some((id) => /tank_bund/.test(id)) || respectDyn.none) fail('seasons', 'procession respect zones: ' + JSON.stringify(respectDyn)); else ok('procession respect zones follow the festivals (' + respectDyn.b.length + ' Bonalu, Tank Bund immersion)');
  }

  // ------------------------------------------------------------ perf
  if (ONLY.includes('perf')) {
    console.log('\n== perf (headless, software raster)');
    const scenes = [['chand_raat', 'charminar', [2003, 11, 25, 21, 30], { zoom: 0.9, dy: -40 }], ['ganesh_immersion', 'ganesh_immersion_point', [2003, 9, 9, 21], {}], ['sankranti', 'home', [2003, 1, 14, 10], {}], ['bonalu', 'ujjaini_mahankali_temple', [2003, 7, 20, 20], {}], ['numaish', 'nampally_exhibition', [2003, 1, 25, 20], { zoom: 0.9 }]];
    for (const [name, place, date, opts] of scenes) {
      await view(place, date, opts);
      await sleep(1500);
      const r = await page.evaluate(async () => {
        N.seasons.profile = true;
        const acc = {}; let fr = 0;
        for (let i = 0; i < 60; i++) { await new Promise((q) => requestAnimationFrame(q)); for (const k in N.seasons.prof) acc[k] = (acc[k] || 0) + N.seasons.prof[k]; fr += N.perf.frameMs || 0; }
        N.seasons.profile = false;
        let tot = 0; for (const k in acc) { acc[k] = +(acc[k] / 60).toFixed(2); tot += acc[k]; }
        return { acc, tot: +tot.toFixed(2), frame: +(fr / 60).toFixed(2) };
      });
      if (r.tot > 4) fail('perf', name + ' overlays cost ' + r.tot + ' ms/frame'); else ok(name + ': overlays ' + r.tot + ' ms/frame ' + JSON.stringify(r.acc) + ', whole frame ' + r.frame + ' ms');
    }
  }

  const nerr = await page.evaluate(() => N.debug.errors.map((e) => (e.where || '') + ': ' + String(e.msg || e.message || e).slice(0, 200)));
  for (const e of nerr) errors.push('N.err ' + e);
  await browser.close();
  if (errors.length) { for (const e of errors.slice(0, 20)) fail('errors', e); } else ok('no console / page / N.err errors');
  console.log(failures.length ? '\nFAIL: ' + failures.length + ' failure(s)\n' + failures.join('\n') : '\nOK: seasons, roofs, respect and registry checks passed');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
