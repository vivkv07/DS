#!/usr/bin/env node
/* NOSTALGIA — tools/check_registry.cjs  (owner: world-reconcile agent)
 * Diffs every PLACE id the design documents use against src/worlddata.js and fails (exit 1)
 * if any is missing. Sources:
 *   design/story_bible.md     §3.2 registry tables (first column, incl. `a`..`b` ranges and
 *                             (= alias) forms), the "Places:" line of every mission in §4,
 *                             the spot columns of §6, and numbered / prefixed ids anywhere in §3-§7
 *   design/systems_design.md  §5, §7, §9, §15 #6, §16 (numbered / prefixed ids + §16 "Ids" column)
 *   design/places_registry.md every round (table first columns + prefix minimum counts)
 * Non-place map objects named by the bible (kaman arches = landmarks, birla_mandir_steps = road)
 * are checked against landmarks / roads instead. Ids the registry keeps OUT of the game are
 * skipped (jubilee_bus_station, bhramaramba_mallikarjuna_theatres, rythu_bazaar_falaknuma).
 * Also checks the extra structure the story needs: roof zones (home_terrace + the M1 lootna
 * chain), stairs places, Tank Bund statues 1-12 from the Lumbini end, podium junctions,
 * respect zones for every worship place.
 * Usage: node tools/check_registry.cjs [--verbose]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadWorldData } = require('./validate_map.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const verbose = process.argv.includes('--verbose');

const OUT_OF_GAME = new Set(['jubilee_bus_station', 'bhramaramba_mallikarjuna_theatres', 'rythu_bazaar_falaknuma']);
// everyday prefixes: a numbered `<prefix>_<n>` anywhere in the scanned sections is a place id
const PREFIXES = ['school', 'kirana', 'banana_cart', 'flower_cart', 'stationery', 'pindi_girni', 'playground', 'irani_cafe', 'rythu_bazaar',
  'bus_stop', 'std', 'barber', 'cycle_rent', 'video_parlour', 'bakery', 'chai_bandi', 'meat_shop', 'medical_shop', 'iyengar_bakery',
  'samosa_bandi', 'dosa_bandi', 'photo_studio', 'coconut_cart', 'internet_cafe', 'mosque', 'church', 'temple', 'kite_stall',
  'recording_centre', 'electronics_shop'];
const PREFIX_RE = new RegExp('^(' + PREFIXES.join('|') + ')_\\d+$');
// map objects that are not places
const NON_PLACE = { kaman_machli: 'landmark', kaman_charminar: 'landmark', kaman_kali: 'landmark', kaman_sher_e_batil: 'landmark', birla_mandir_steps: 'road' };

/** Split a markdown file into sections by heading; returns [{title, level, text}] */
function sections(md) {
  const out = []; let cur = { title: '', level: 0, lines: [] };
  for (const line of md.split('\n')) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) { out.push(cur); cur = { title: m[2], level: m[1].length, lines: [] }; } else cur.lines.push(line);
  }
  out.push(cur);
  return out.map((s) => ({ title: s.title, level: s.level, text: s.lines.join('\n') }));
}
/** Expand `a_5`..`a_8` ranges and plain backtick ids from a string */
function idsIn(str) {
  const ids = [];
  const rng = /`([a-z][a-z0-9_]*?)_(\d+)`\s*\.\.\s*`(?:([a-z][a-z0-9_]*?)_)?(\d+)`/g;
  let m;
  const consumed = [];
  while ((m = rng.exec(str))) {
    const pre = m[1], a = +m[2], b = +m[4];
    if (b >= a && b - a < 60) for (let i = a; i <= b; i++) ids.push(pre + '_' + i);
    consumed.push([m.index, m.index + m[0].length]);
  }
  // `kite_stall_1`..`3` style (handled above), `cassette_1`..`16` too; now single ids
  const one = /`([a-z][a-z0-9_]*)`/g;
  while ((m = one.exec(str))) {
    if (consumed.some(([s, e]) => m.index >= s && m.index < e)) continue;
    ids.push(m[1]);
  }
  // bare ranges like `flower_cart_5`..`8`
  return ids;
}
function firstCol(line) {
  if (!/^\|/.test(line) || /^\|\s*-/.test(line)) return null;
  const cells = line.split('|').slice(1, -1);
  return cells.length ? cells[0] : null;
}

function collect() {
  const want = new Map(); // id -> Set(sources)
  const add = (id, src) => {
    if (!id || OUT_OF_GAME.has(id)) return;
    if (!want.has(id)) want.set(id, new Set());
    want.get(id).add(src);
  };
  const prefixMin = {}; // 'mosque_' -> n
  // ---------------- story bible
  const bible = sections(read('design/story_bible.md'));
  let inReg = false, inItems = false;
  for (const s of bible) {
    const t = s.title;
    if (/^3\.2 /.test(t)) inReg = true;
    if (/^3\.3 /.test(t)) inReg = false;
    const sec = /^([3-7])\./.exec(t) || /^(M\d+|SA\d) /.exec(t) || /^Small activities/.exec(t) ? true : false;
    if (inReg) {
      for (const line of s.text.split('\n')) {
        if (/^\*\*Items and non-place ids/.test(line)) inItems = true;
        else if (/^\*\*/.test(line)) inItems = false;
        if (inItems) continue;
        const c = firstCol(line);
        if (!c || /^\s*id/.test(c)) continue;
        for (const id of idsIn(c)) {
          if (/_\*$/.test(id)) continue;
          add(id, 'bible §3.2');
        }
        const hm = /`hide_\*` \((\d+)\)/.exec(c); if (hm) prefixMin.hide_ = +hm[1];
        const gm = /`giver_\*` \((\d+)\)/.exec(c); if (gm) prefixMin.giver_ = +gm[1];
      }
    }
    if (sec || inReg) {
      for (const line of s.text.split('\n')) {
        if (/^- \*\*Places:\*\*/.test(line) || /^  [`a-z(]/.test(line) && /Places/.test(s.text.split(line)[0].split('\n').slice(-2).join(''))) {
          for (const id of idsIn(line)) add(id, 'bible ' + t.split(' ')[0] + ' Places');
        }
        for (const id of idsIn(line)) {
          if (PREFIX_RE.test(id) || /^hide_[a-z_]+$/.test(id) && id !== 'hide_' || /^giver_[a-z_]+$/.test(id)) add(id, 'bible ' + t.split(' ').slice(0, 2).join(' '));
        }
      }
    }
    // §6 spot columns: every backticked id in the "Spot" / "Stop" column of a K/G/C/T/F table
    if (/^6\.\d/.test(t)) {
      let col = -1;
      for (const line of s.text.split('\n')) {
        if (/^\| #/.test(line)) { col = line.split('|').findIndex((c) => /^\s*(Spot|Stop)/.test(c)); continue; }
        if (col < 0 || !/^\| [KGCTF]\d+/.test(line)) continue;
        const cells = line.split('|');
        for (const id of idsIn(cells[col] || '')) add(id, 'bible ' + t.split(' ')[0] + ' spot');
      }
    }
  }
  // the "Places:" line may wrap onto the next line: grab continuation lines explicitly
  const braw = read('design/story_bible.md').split('\n');
  for (let i = 0; i < braw.length; i++) {
    if (!/^- \*\*Places:\*\*/.test(braw[i])) continue;
    for (let j = i; j < i + 4 && j < braw.length; j++) {
      if (j > i && !/^  \S/.test(braw[j])) break;
      for (const id of idsIn(braw[j])) add(id, 'bible Places');
    }
  }
  // ---------------- systems design
  const sys = sections(read('design/systems_design.md'));
  for (const s of sys) {
    const t = s.title;
    const num = (/^(\d+)\./.exec(t) || [])[1];
    if (!['5', '7', '9', '15', '16'].includes(num)) continue;
    for (const line of s.text.split('\n')) {
      if (num === '15' && !/^\| 6 /.test(line)) continue;
      for (const id of idsIn(line)) {
        if (PREFIX_RE.test(id) || /^hide_[a-z_]+$/.test(id)) add(id, 'systems §' + num);
      }
      if (num === '16' || num === '15') {
        const cells = line.split('|');
        const col = num === '16' ? cells[2] : cells[3];
        if (col && /^\| /.test(line) && !/^\|\s*-/.test(line)) for (const id of idsIn(col)) if (!/^(_ground|junction|respect)$/.test(id)) add(id, 'systems §' + num);
      }
    }
  }
  // ---------------- places registry (every round)
  const reg = read('design/places_registry.md');
  for (const line of reg.split('\n')) {
    const c = firstCol(line);
    if (!c) continue;
    for (const id of idsIn(c)) {
      if (/\*$/.test(id)) continue;
      if (/^(walkman|cassette_player|coconut)$/.test(id)) continue; // items / tree kind
      add(id, 'places_registry');
    }
  }
  // prefix minimums from the registry text ("at least 2" etc.) are enforced by validate_map.cjs
  return { want, prefixMin };
}

function main() {
  const D = loadWorldData();
  const places = new Map(D.places.map((p) => [p.id, p]));
  const lms = new Map(D.landmarks.map((l) => [l.id, l]));
  const roads = new Set(D.roads.map((r) => r.id));
  const { want, prefixMin } = collect();
  const errors = [], warns = [];
  for (const [id, src] of want) {
    if (NON_PLACE[id]) {
      const ok = NON_PLACE[id] === 'landmark' ? lms.has(id) : roads.has(id);
      if (!ok) errors.push(`missing ${NON_PLACE[id]} "${id}" (${[...src].join(', ')})`);
      continue;
    }
    // non-place tokens that slip through (flags/items that share a name with nothing) are
    // only errors when they look like place ids: in a registry first column or numbered
    if (!places.has(id)) {
      const strong = [...src].some((s) => /§3\.2|Places|spot|places_registry|systems §1[56]/.test(s)) || PREFIX_RE.test(id) || /^hide_/.test(id);
      (strong ? errors : warns).push(`missing place "${id}" (${[...src].join(', ')})`);
    }
  }
  for (const [pre, n] of Object.entries(prefixMin)) {
    const c = D.places.filter((p) => p.id.startsWith(pre)).length;
    if (c < n) errors.push(`need >= ${n} "${pre}*" places, have ${c}`);
  }
  // ---- extra structure the story needs
  const P = (id) => places.get(id);
  if (!P('cafe_noor_e_iran') || P('cafe_noor_e_iran').alias !== 'irani_cafe_19') errors.push('cafe_noor_e_iran must alias irani_cafe_19');
  const ic7 = lms.get('irani_cafe_7');
  if (!ic7 || !/GULISTAN/i.test(ic7.sign || '')) errors.push('irani_cafe_7 sign must read "Café Gulistan"');
  if (!P('irani_cafe_7') || !/Gulistan/.test(P('irani_cafe_7').name)) errors.push('irani_cafe_7 must be named Café Gulistan');
  if (P('irani_cafe_1') && /Noor|Faramarz/i.test(P('irani_cafe_1').name)) errors.push('irani_cafe_1 must stay Nimrah Café');
  const sai = lms.get('dilsukhnagar_sai_temple');
  for (let k = 5; k <= 8; k++) {
    const f = P('flower_cart_' + k);
    if (!f || !sai || Math.hypot(f.x - sai.x, f.y - sai.y) > 140) errors.push(`flower_cart_${k} must be in the Sai Baba temple lane (<= 140 u from the temple)`);
  }
  // Tank Bund statues 1..12 counted from the Lumbini (south-west) end
  const st = [];
  for (let k = 1; k <= 12; k++) { const l = lms.get('tank_bund_statue_' + k); if (!l) errors.push('missing landmark tank_bund_statue_' + k); else st.push(l); }
  if (st.length === 12) {
    const lum = P('lumbini_park');
    for (let k = 1; k < 12; k++) if (Math.hypot(st[k].x - lum.x, st[k].y - lum.y) < Math.hypot(st[k - 1].x - lum.x, st[k - 1].y - lum.y)) { errors.push('tank bund statues are not numbered from the Lumbini end'); break; }
  }
  // roofs
  const roofs = new Map((D.roofs || []).map((r) => [r.id, r]));
  if (!roofs.has('home_terrace')) errors.push('roof zone "home_terrace" missing');
  const lootna = (D.roofs || []).filter((r) => r.group === 'lakshmi_lootna');
  if (lootna.length < 6) errors.push(`M1 needs >= 6 lootna terraces (group lakshmi_lootna), have ${lootna.length}`);
  for (const r of D.roofs || []) {
    if (!r.stairs || !r.stairs.length) { if (!r.noStairs) errors.push(`roof ${r.id} has no stairs`); continue; }
    for (const s of r.stairs) if (!places.has(s.place)) errors.push(`roof ${r.id}: stairs place ${s.place} missing`);
  }
  for (const pl of D.planks || []) { if (!roofs.has(pl.a) || !roofs.has(pl.b)) errors.push(`plank ${pl.id} joins unknown roofs`); }
  if (!roofs.has('patang_chacha_roof')) errors.push('roof zone "patang_chacha_roof" (ending) missing');
  // podium junctions
  const pods = D.places.filter((p) => p.podium);
  if (!P('rtc_x_roads') || !P('rtc_x_roads').podium) errors.push('rtc_x_roads must have a podium (Pochaiah\'s home podium)');
  if (pods.length < 10) errors.push(`want >= 10 podium junctions, have ${pods.length}`);
  // respect zones for worship places
  const respectIds = new Set((D.respect || []).map((z) => z.place || z.id));
  const worship = D.places.filter((p) => /^(temple|mosque|church|dargah|gurudwara)$/.test(p.kind) && !p.alias);
  for (const p of worship) if (!respectIds.has(p.id)) errors.push(`no respect zone for ${p.kind} place ${p.id}`);
  for (const id of ['charminar', 'mecca_masjid', 'birla_mandir', 'badshahi_ashurkhana', 'gurudwara_gowliguda', 'moula_ali_dargah']) if (!respectIds.has(id)) errors.push('no respect zone for ' + id);

  if (verbose) console.log('checked ids:', [...want.keys()].sort().join(' '));
  console.log(`registry ids checked: ${want.size}; roofs ${roofs.size}, planks ${(D.planks || []).length}, podiums ${pods.length}, respect zones ${(D.respect || []).length}`);
  for (const w of warns) console.log('WARN ', w);
  for (const e of errors) console.log('ERROR', e);
  console.log(errors.length ? `FAIL: ${errors.length} errors` : 'OK: every registry id exists');
  process.exit(errors.length ? 1 : 0);
}
if (require.main === module) main();
module.exports = { collect };
