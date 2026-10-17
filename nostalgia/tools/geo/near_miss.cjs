/* NOSTALGIA — tools/geo/near_miss.cjs   (Map v2 regression fix; called by build_worlddata.cjs step 9.76)
 *
 * Near-miss junctions: a road end that stops just short of another road is extended onto it.
 * The curated alignments and the OSM strokes come from different sources, clusters were moved, duplicate
 * runs were trimmed, so ~2,000 ends of the first Map v2 build stopped 5-60 u short of the road they meet.
 * world.js only joins an end that lies within the other road's w / 2 + 6 (buildRoadGraph, T-junctions), so
 * those were dead ends in N.world.roads, and routes (the HUD GPS, NPC drivers, pursuers) made long detours:
 * the Afzalgunj, Musallam Jung and Purana Pul bridges each dead-ended on one bank, Koti -> Charminar was
 * 1.88x the straight distance, Charminar -> Golconda 2.14x, and the median detour of random routes 1.44x
 * (v1: 1.23x). After this pass: 1.27x median, and those three routes 1.50x / 1.29x / 1.32x (Salar Jung).
 *
 * Rules (deterministic, road order):
 *  - an end counts as joined when another road's centre line is within that road's w / 2 + 6 (the engine rule),
 *    or it lies within 12 u of the frame edge;
 *  - otherwise: another road straight ahead (curated 72 u, OSM 44 u: the probe point inside its carriageway),
 *    else the nearest road beside it whose carriageway edge is within 30 u (curated) / 18 u (OSM) and that
 *    lies ahead of the end (OSM: within ~70 deg; anything practically touching, gap <= 8 u, also sideways);
 *  - meeting another road's own open end (within 10 u) joins end to end;
 *  - the connector (the carriageway, sampled every 3 u) must stay clear of water, solid footprints, rails,
 *    roof zones and the frame; of the sandy Musi bed unless a bridge is involved; OSM lanes also keep out of
 *    the no-infill zones (cluster layouts, real parks, landmark compounds);
 *  - it runs after every landmark is placed (none of them moves); the connectors are painted into the
 *    placement raster so the places and the building blocks are laid out around them.
 *
 * joinNearMisses(ctx) -> stats; ctx = {roads, segIndex, OCC, WR, NI, W, H, FOOT, ptR}. Mutates road.pts.
 */
'use strict';

function joinNearMisses(ctx) {
  const { segIndex, OCC, WR, NI, W, H, FOOT, ptR } = ctx;
  const roads = ctx.roads.filter((r) => r.kind !== 'path');
  const stats = { ends: 0, open: 0, ahead: 0, near: 0, endToEnd: 0, blocked: 0, curated: [], left: [] };
  const HJ = segIndex(roads, 64);
  const isOsm = (r) => r.src === 'osm' || r.src === 'grid';
  const atFrame = (p) => p[0] < 12 || p[1] < 12 || p[0] > W - 12 || p[1] > H - 12;
  const done = new Set(); // 'id:end' of ends another road was joined to end to end
  const conns = [];
  const isJoined = (r, e) => HJ.near(e[0], e[1], 64).some(({ it, q }) => it.ref !== r && q.d2 <= (it.ref.w / 2 + 6) ** 2);
  const blocked = (r, a, b, bridge) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux, hw = r.w / 2;
    for (let t = 0; t <= L; t += 3) for (const o of [-hw, 0, hw]) {
      const x = a[0] + ux * t + nx * o, y = a[1] + uy * t + ny * o, v = OCC.get(x, y), wv = WR.get(x, y);
      if (v === 2 || v === 3 || v === 4 || v === 6 || v === 255 || wv === 1) return true; // water, solid, rail, roof, off-frame
      if ((v === 7 || wv === 2) && !bridge) return true;                                     // the sandy Musi bed
      if (isOsm(r) && o === 0 && t > 4 && NI.get(x, y)) return true;                        // no-infill zones
    }
    return false;
  };
  const tag = (r, end) => r.id + (end ? '>' : '<');
  for (const r of roads) {
    for (const end of [0, 1]) {
      const pts = r.pts; if (pts.length < 2) continue;
      const e = end ? pts[pts.length - 1] : pts[0], pr = end ? pts[pts.length - 2] : pts[1];
      stats.ends++;
      if (atFrame(e) || done.has(r.id + ':' + end) || isJoined(r, e)) continue;
      stats.open++;
      const dx = e[0] - pr[0], dy = e[1] - pr[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
      const osm = isOsm(r), AHEAD = osm ? 44 : 72, GAP = osm ? 18 : 30, FWD = osm ? 0.35 : 0;
      const other = (B) => B !== r && B.kind !== 'path';
      let hit = null, host = null, how = '';
      for (let t = 4; t <= AHEAD && !hit; t += 4) { // straight on into another road's carriageway
        const x = e[0] + ux * t, y = e[1] + uy * t, n2 = HJ.nearest(x, y, 64, other);
        if (n2 && n2.q.d2 < (n2.it.ref.w / 2) ** 2) { hit = [n2.q.x, n2.q.y]; host = n2.it; how = 'ahead'; }
      }
      if (!hit) { // the nearest road beside / ahead of the end
        let best = null;
        for (const c of HJ.near(e[0], e[1], GAP + 6 + 40, other)) {
          const B = c.it.ref, d = Math.sqrt(c.q.d2), gap = d - (B.w / 2 + 6);
          if (gap > GAP) continue;
          const fx = (c.q.x - e[0]) / (d || 1), fy = (c.q.y - e[1]) / (d || 1), fwd = fx * ux + fy * uy;
          if (fwd < FWD && !(gap <= 8 && fwd >= -0.2)) continue; // ahead-ish, or practically touching
          if (!best || c.q.d2 < best.q.d2) best = c;
        }
        if (best) { hit = [best.q.x, best.q.y]; host = best.it; how = 'near'; }
      }
      if (!hit) { if (!osm) stats.left.push(tag(r, end) + ' ' + ptR(e).join(',') + ' (no road ahead / beside)'); continue; }
      // meeting the other road's own open end: join end to end
      const B = host.ref, hb = [B.pts[0], B.pts[B.pts.length - 1]];
      for (const k of [0, 1]) {
        const hp = hb[k];
        if (Math.hypot(hp[0] - hit[0], hp[1] - hit[1]) < 10 && !isJoined(B, hp)) { hit = [hp[0], hp[1]]; done.add(B.id + ':' + k); how = 'endToEnd'; }
      }
      if (blocked(r, e, hit, r.kind === 'bridge' || B.kind === 'bridge')) { stats.blocked++; if (!osm) stats.left.push(tag(r, end) + ' ' + ptR(e).join(',') + ' (blocked towards ' + B.id + ')'); continue; }
      const q = ptR(hit);
      if (Math.hypot(q[0] - e[0], q[1] - e[1]) < 1) continue;
      if (end) pts.push(q); else pts.unshift(q);
      conns.push([r, [e[0], e[1]], q]);
      stats[how]++;
      if (!osm) stats.curated.push(tag(r, end) + B.id + ' ' + Math.round(Math.hypot(q[0] - e[0], q[1] - e[1])) + 'u');
    }
  }
  // the placement raster learns the connectors (the places are laid out next); the caller rebuilds its road index
  for (const [r, a, b] of conns) OCC.fillThick([a, b], r.w / 2 + (FOOT[r.kind] || 0) + 2, (o) => { const v = OCC.a[o]; if (!v || v === 7 || v === 8) OCC.a[o] = 1; });
  stats.joined = conns.length;
  return stats;
}

module.exports = { joinNearMisses };
