/* NOSTALGIA — tools/geo/project.cjs   (node, no dependencies; also loads as a classic script)
 *
 * Real latitude/longitude -> NOSTALGIA world units (amendment A1, Map v2).
 *
 *   1. Base projection (uniform): local equirectangular projection about the frame centre with ONE
 *      scale, +x east, +y south. The A1 frame is lon 78.33507-78.56093 E, lat 17.31218-17.47482 N
 *      (24.0 x 18.0 km). Chosen preset: 15000 x 11250 u, BASE_UPM = 0.625 u per metre (1.6 m per
 *      world unit); presets for 12000 x 9000 (2 m/u, the A1 target), 14000 x 10500 and 16000 x 12000
 *      cover the same frame (see PRESETS and design/geo/projection_report.md for why 15000 x 11250).
 *   2. Warp (smooth, monotonic): a flow-based density-equalising map (Gastner, Seguy & More 2018,
 *      PNAS 115:E2156) of the frame rectangle onto itself. A target magnification field
 *      M_t(x, y) (>1 in the dense cores, <1 in the empty outskirts) defines the density
 *      rho0 = M_t^2; the Poisson problem  lap(phi) = rho0 - mean(rho0)  (Neumann boundary) is solved
 *      once with a cosine transform, and every point is carried along
 *          dX/dt = grad(phi)(X) / ((1 - t) rho0(X) + t mean(rho0)),   t: 0 -> 1.
 *      The exact flow of a smooth velocity field is a diffeomorphism (a bijection with positive
 *      Jacobian everywhere: no fold-overs), keeps the rectangle (boundary points slide along it),
 *      and ends with area magnification det J = rho0 / mean(rho0) exactly, i.e. the local linear
 *      scale is M(x) = M_t(x) / sqrt(mean(M_t^2)). Velocity is the gradient field divided by a
 *      positive density, so the map has no swirl; heavy-tailed core kernels keep the change of
 *      scale gradual, which keeps compass bearings between neighbours (see the report).
 *
 * API (module.exports in node; window.NOSTALGIA_GEO in a browser / vm sandbox):
 *   project(lat, lon)          -> [x, y]   world units (warped); a point outside the frame moves with
 *                              its foot on the frame edge, so it lands outside 0..W x 0..H
 *   inFrame(lat, lon)          -> true inside the A1 frame (= inside the world rectangle)
 *   unproject(x, y)            -> [lat, lon]   (inverse, Newton-polished to < 0.01 u)
 *   base(lat, lon)             -> [x, y]   uniform 2 m/u projection, no warp
 *   baseInverse(x, y)          -> [lat, lon]
 *   warp(bx, by) / unwarp(x, y)   base world units <-> warped world units
 *   projectLine(pts, {maxSegM}) / projectRing(pts, {maxSegM})   [[lat, lon], ...] -> [[x, y], ...]
 *                              (densified first, default every 40 m, so long straight segments
 *                              follow the warp; rings stay closed)
 *   placeWorld(entry)          -> [x, y] for a places.json entry: colony / roof entries that carry
 *                              anchor_latlon + offset_u keep their game-unit layout:
 *                              project(anchor) + offset_u; everything else project(lat, lon)
 *   scaleAt(lat, lon)          -> {m, s1, s2, aniso, rot, upm, mpu, bearingMaxErr}
 *                              m = sqrt(det J) relative to the base (1 = 2 m/u), s1 >= s2 the
 *                              principal stretches, aniso = s2/s1, rot = local rotation (deg),
 *                              upm = world units per metre, mpu = metres per unit, bearingMaxErr =
 *                              worst bearing change (deg) of a short segment through that point
 *   jacobian(lat, lon)         -> [[dx/dbx, dx/dby], [dy/dbx, dy/dby]] (d warped / d base)
 *   targetM(lat, lon)          -> the design magnification at a point (normalised)
 *   create(params)             -> a new projector with other parameters (same API), e.g.
 *                              create(PRESETS['12000x9000']) for the A1 target size
 *   PARAMS (= PRESETS[PRESET]), PRESETS, PRESET, WORLD_W, WORLD_H, BASE_UPM, FRAME,
 *   init() (forces the one-time Poisson solve, ~0.5 s; otherwise done on the first call)
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- parameters (the design)
  // Density kernels: rho = background 1 + sum a * (1 + d^2 / s^2)^-p (d, s in metres; a < 0 = sink).
  // Every preset covers the SAME A1 frame (24.0 x 18.0 km about 17.3935 N, 78.448 E); a bigger world = a larger
  // base scale. Each preset was tuned with tools/geo/tune_projection.cjs against the same footprint targets in
  // absolute u/m (see design/geo/projection_report.md, "World size"). PRESET is the chosen one.
  const NAMES = {
    old_city: 'Old City (Charminar, Mecca Masjid, Laad Bazaar, Gulzar Houz, Chowmahalla, Madina)',
    musi: 'Musi corridor (Salar Jung Museum, High Court, Osmania Hospital, Afzalgunj, Naya Pul)',
    abids_koti: 'Abids / Koti / Nampally / Sultan Bazaar',
    himayatnagar: 'Himayatnagar colony / Narayanguda',
    tank_bund: 'Tank Bund / Lumbini / Secretariat',
    secunderabad: 'Secunderabad Clock Tower / station / Monda Market',
    sink_south: 'sink: Falaknuma / Chandrayangutta / Barkas (south end of the dense band)',
    sink_north: 'sink: Cantonment / Bowenpally (north end of the dense band)',
  };
  function preset(w, h, gain, cores, plateau, sinks) {
    const named = (c) => Object.assign({ id: c.id, name: NAMES[c.id] || c.id }, c);
    return {
      world: { w, h },
      baseUnitsPerMetre: w / 24000, // same 24 km wide frame for every size
      centre: { lat: 17.3935, lon: 78.448 }, // A1 frame mid-point
      grid: { nx: Math.round((256 * w) / 12000 / 16) * 16, ny: Math.round((192 * w) / 12000 / 16) * 16 }, // ~94 m cells
      mode: 'gradient', // 'gradient' (one linearised optimal-transport step: symmetric Jacobian, no rotation) | 'flow'
      gain, // gradient mode: T(b) = b + gain * grad(phi) / mean(rho)
      steps: 48, // RK4 steps (flow mode only)
      background: 1,
      cores: cores.map(named),
      plateau: Object.assign({ id: 'plateau', name: 'broad plateau over the historic city' }, plateau), // keeps the inner ring above the outskirts
      sinks: sinks.map(named),
    };
  }
  const PRESETS = {
    '12000x9000': preset(12000, 9000, 0.8, [
      { id: 'old_city', lat: 17.3625, lon: 78.4735, a: 5.525, s: 598, p: 0.8 },
      { id: 'musi', lat: 17.3720, lon: 78.4770, a: 1.512, s: 376, p: 1.3 },
      { id: 'abids_koti', lat: 17.3865, lon: 78.4790, a: 3.2, s: 595, p: 1.1 },
      { id: 'himayatnagar', lat: 17.3985, lon: 78.4865, a: 2.6, s: 442, p: 0.9 },
      { id: 'tank_bund', lat: 17.4150, lon: 78.4780, a: 1.85, s: 880, p: 1 },
      { id: 'secunderabad', lat: 17.4375, lon: 78.4995, a: 3.35, s: 553, p: 0.9 },
    ], { lat: 17.3935, lon: 78.4730, a: 1.6, s: 3200, p: 0.9 }, [
      { id: 'sink_south', lat: 17.3380, lon: 78.4705, a: -0.6, s: 748, p: 1.5 },
      { id: 'sink_north', lat: 17.4755, lon: 78.5085, a: -0.9, s: 1895, p: 0.7 },
    ]),
    '14000x10500': preset(14000, 10500, 0.8, [
      { id: 'old_city', lat: 17.3625, lon: 78.4735, a: 4.033, s: 598, p: 0.8 },
      { id: 'musi', lat: 17.3705, lon: 78.4785, a: 0.424, s: 271, p: 1 },
      { id: 'abids_koti', lat: 17.3865, lon: 78.4790, a: 1.663, s: 506, p: 0.7 },
      { id: 'himayatnagar', lat: 17.4015, lon: 78.4880, a: 1.766, s: 376, p: 1 },
      { id: 'tank_bund', lat: 17.4150, lon: 78.4780, a: 0.939, s: 650, p: 1.1 },
      { id: 'secunderabad', lat: 17.4375, lon: 78.4995, a: 1.91, s: 553, p: 1 },
    ], { lat: 17.3950, lon: 78.4820, a: 1.175, s: 3680, p: 0.8 }, [
      { id: 'sink_south', lat: 17.3350, lon: 78.4735, a: -0.4, s: 1275, p: 1.1 },
      { id: 'sink_north', lat: 17.4650, lon: 78.4980, a: -0.6, s: 1725, p: 0.8 },
    ]),
    '15000x11250': preset(15000, 11250, 0.75, [
      { id: 'old_city', lat: 17.3625, lon: 78.4720, a: 3.5, s: 442, p: 0.7 },
      { id: 'musi', lat: 17.3705, lon: 78.4785, a: 0.905, s: 598, p: 0.7 },
      { id: 'abids_koti', lat: 17.3880, lon: 78.4775, a: 1.436, s: 684, p: 0.9 },
      { id: 'himayatnagar', lat: 17.4000, lon: 78.4895, a: 1.535, s: 442, p: 1.1 },
      { id: 'tank_bund', lat: 17.4165, lon: 78.4750, a: 0.815, s: 880, p: 1.1 },
      { id: 'secunderabad', lat: 17.4375, lon: 78.4980, a: 1.148, s: 860, p: 1.2 },
    ], { lat: 17.3950, lon: 78.4820, a: 0.668, s: 3680, p: 0.8 }, [
      { id: 'sink_south', lat: 17.3350, lon: 78.4705, a: -0.4, s: 1275, p: 1.2 },
      { id: 'sink_north', lat: 17.4680, lon: 78.4980, a: -0.6, s: 1246, p: 1 },
    ]),
    '16000x12000': preset(16000, 12000, 0.8, [
      { id: 'old_city', lat: 17.3625, lon: 78.4720, a: 3.064, s: 442, p: 0.7 },
      { id: 'musi', lat: 17.3705, lon: 78.4800, a: 0.774, s: 376, p: 1 },
      { id: 'abids_koti', lat: 17.3895, lon: 78.4775, a: 1.25, s: 684, p: 1 },
      { id: 'himayatnagar', lat: 17.4015, lon: 78.4895, a: 0.997, s: 376, p: 0.9 },
      { id: 'tank_bund', lat: 17.4180, lon: 78.4750, a: 0.713, s: 880, p: 0.9 },
      { id: 'secunderabad', lat: 17.4390, lon: 78.5010, a: 0.997, s: 553, p: 1 },
    ], { lat: 17.3965, lon: 78.4820, a: 0.575, s: 3680, p: 0.8 }, [
      { id: 'sink_south', lat: 17.3365, lon: 78.4720, a: -0.5, s: 1466, p: 0.9 },
      { id: 'sink_north', lat: 17.4650, lon: 78.4995, a: -0.4, s: 1500, p: 1 },
    ]),

  };
  const PRESET = '15000x11250';
  const PRESET_NOTE = 'Chosen: 15000 x 11250 u (1.6 m/u), the smallest preset that gives the dense cores their footprint room and keeps bearings between neighbouring places under 15 deg. 12000 x 9000 (the A1 target) cannot do both: the dense band (Charminar to Secunderabad) is 10 km of an 18 km frame, so its north-south growth must come out of the short strips beyond its ends, and bearings there bend by up to ~22 deg.';
  const PARAMS = PRESETS[PRESET];

  const RAD = Math.PI / 180;

  function create(params) {
    const P = params;
    const W = P.world.w, H = P.world.h, UPM = P.baseUnitsPerMetre;
    const phi0 = P.centre.lat * RAD;
    // metres per degree on WGS84 at the centre latitude
    const M_LAT = 111132.954 - 559.822 * Math.cos(2 * phi0) + 1.175 * Math.cos(4 * phi0) - 0.0023 * Math.cos(6 * phi0);
    const M_LON = 111412.84 * Math.cos(phi0) - 93.5 * Math.cos(3 * phi0) + 0.118 * Math.cos(5 * phi0);
    const KX = M_LON * UPM, KY = M_LAT * UPM; // world units per degree
    const FRAME = {
      lonW: P.centre.lon - W / 2 / KX, lonE: P.centre.lon + W / 2 / KX,
      latN: P.centre.lat + H / 2 / KY, latS: P.centre.lat - H / 2 / KY,
      mPerDegLat: M_LAT, mPerDegLon: M_LON,
    };
    const base = (lat, lon) => [W / 2 + (lon - P.centre.lon) * KX, H / 2 - (lat - P.centre.lat) * KY];
    const baseInverse = (x, y) => [P.centre.lat - (y - H / 2) / KY, P.centre.lon + (x - W / 2) / KX];

    // kernels in base world units
    const kern = [];
    const addK = (c, sign) => {
      const [x, y] = base(c.lat, c.lon);
      const s = c.s * UPM;
      kern.push({ x, y, a: c.a * (sign || 1), is2: 1 / (s * s), p: c.p });
    };
    for (const c of P.cores) addK(c);
    if (P.plateau) addK(P.plateau);
    for (const c of P.sinks || []) addK(c);
    const bg = P.background;
    function rho0(x, y) {
      let r = bg;
      for (let i = 0; i < kern.length; i++) {
        const k = kern[i], dx = x - k.x, dy = y - k.y;
        r += k.a * Math.pow(1 + (dx * dx + dy * dy) * k.is2, -k.p);
      }
      return r;
    }

    // ---------------------------------------------------------------- Poisson solve (DCT)
    const NX = P.grid.nx, NY = P.grid.ny, HX = W / NX, HY = H / NY;
    let GX = null, GY = null, RHOBAR = 0, ready = false;
    function init() {
      if (ready) return api;
      // cell-centred density
      const f = new Float64Array(NX * NY);
      let sum = 0;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        // 2x2 supersampling per cell for an accurate mean and spectrum
        let v = 0;
        for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) v += rho0((i + ox) * HX, (j + oy) * HY);
        v /= 4; f[j * NX + i] = v; sum += v;
      }
      RHOBAR = sum / (NX * NY);
      // forward DCT-II, separable: rows then columns
      const cx = new Float64Array(NX * NX), cy = new Float64Array(NY * NY);
      for (let m = 0; m < NX; m++) for (let i = 0; i < NX; i++) cx[m * NX + i] = Math.cos((Math.PI * m * (i + 0.5)) / NX);
      for (let n = 0; n < NY; n++) for (let j = 0; j < NY; j++) cy[n * NY + j] = Math.cos((Math.PI * n * (j + 0.5)) / NY);
      const t1 = new Float64Array(NX * NY); // [j][m]
      for (let j = 0; j < NY; j++) for (let m = 0; m < NX; m++) {
        let s = 0; const row = j * NX, cm = m * NX;
        for (let i = 0; i < NX; i++) s += f[row + i] * cx[cm + i];
        t1[j * NX + m] = s;
      }
      const A = new Float64Array(NX * NY); // [n][m]
      for (let n = 0; n < NY; n++) for (let m = 0; m < NX; m++) {
        let s = 0; const cn = n * NY;
        for (let j = 0; j < NY; j++) s += t1[j * NX + m] * cy[cn + j];
        A[n * NX + m] = s;
      }
      // phi coefficients (with inverse-transform weights and 1/(NX NY) folded in)
      const kx = (m) => (Math.PI * m) / W, ky = (n) => (Math.PI * n) / H;
      const PH = new Float64Array(NX * NY);
      for (let n = 0; n < NY; n++) for (let m = 0; m < NX; m++) {
        if (!m && !n) continue;
        const w = (m ? 2 : 1) * (n ? 2 : 1) / (NX * NY);
        PH[n * NX + m] = (-A[n * NX + m] / (kx(m) * kx(m) + ky(n) * ky(n))) * w;
      }
      // gradient on the (NX+1) x (NY+1) corner nodes
      const NXp = NX + 1, NYp = NY + 1;
      const sx = new Float64Array(NX * NXp), cxn = new Float64Array(NX * NXp);
      for (let m = 0; m < NX; m++) for (let i = 0; i < NXp; i++) { const a = kx(m) * i * HX; sx[m * NXp + i] = Math.sin(a); cxn[m * NXp + i] = Math.cos(a); }
      const syn = new Float64Array(NY * NYp), cyn = new Float64Array(NY * NYp);
      for (let n = 0; n < NY; n++) for (let j = 0; j < NYp; j++) { const a = ky(n) * j * HY; syn[n * NYp + j] = Math.sin(a); cyn[n * NYp + j] = Math.cos(a); }
      const Tx = new Float64Array(NY * NXp), Ty = new Float64Array(NY * NXp);
      for (let n = 0; n < NY; n++) for (let i = 0; i < NXp; i++) {
        let sX = 0, sY = 0;
        for (let m = 0; m < NX; m++) {
          const c = PH[n * NX + m]; if (!c) continue;
          sX += c * -kx(m) * sx[m * NXp + i];
          sY += c * cxn[m * NXp + i];
        }
        Tx[n * NXp + i] = sX; Ty[n * NXp + i] = sY;
      }
      GX = new Float64Array(NXp * NYp); GY = new Float64Array(NXp * NYp);
      for (let j = 0; j < NYp; j++) for (let i = 0; i < NXp; i++) {
        let gX = 0, gY = 0;
        for (let n = 0; n < NY; n++) {
          gX += Tx[n * NXp + i] * cyn[n * NYp + j];
          gY += Ty[n * NXp + i] * -ky(n) * syn[n * NYp + j];
        }
        GX[j * NXp + i] = gX; GY[j * NXp + i] = gY;
      }
      // exact Neumann condition on the frame edges (removes round-off)
      for (let j = 0; j < NYp; j++) { GX[j * NXp] = 0; GX[j * NXp + NX] = 0; }
      for (let i = 0; i < NXp; i++) { GY[i] = 0; GY[NY * NXp + i] = 0; }
      ready = true;
      return api;
    }
    function grad(x, y, out) {
      let fx = x / HX, fy = y / HY;
      if (fx < 0) fx = 0; else if (fx > NX) fx = NX;
      if (fy < 0) fy = 0; else if (fy > NY) fy = NY;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i >= NX) i = NX - 1; if (j >= NY) j = NY - 1;
      const u = fx - i, v = fy - j, NXp = NX + 1, k = j * NXp + i;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      out[0] = GX[k] * w00 + GX[k + 1] * w10 + GX[k + NXp] * w01 + GX[k + NXp + 1] * w11;
      out[1] = GY[k] * w00 + GY[k + 1] * w10 + GY[k + NXp] * w01 + GY[k + NXp + 1] * w11;
    }
    const g = [0, 0];
    function vel(x, y, t, out) {
      grad(x, y, g);
      const r = (1 - t) * rho0(x, y) + t * RHOBAR;
      out[0] = g[0] / r; out[1] = g[1] / r;
    }
    const clampX = (x) => (x < 0 ? 0 : x > W ? W : x), clampY = (y) => (y < 0 ? 0 : y > H ? H : y);
    const k1 = [0, 0], k2 = [0, 0], k3 = [0, 0], k4 = [0, 0];
    function flow(x, y, t0, t1) {
      const N = P.steps, h = (t1 - t0) / N;
      let t = t0;
      for (let s = 0; s < N; s++) {
        vel(x, y, t, k1);
        vel(clampX(x + 0.5 * h * k1[0]), clampY(y + 0.5 * h * k1[1]), t + 0.5 * h, k2);
        vel(clampX(x + 0.5 * h * k2[0]), clampY(y + 0.5 * h * k2[1]), t + 0.5 * h, k3);
        vel(clampX(x + h * k3[0]), clampY(y + h * k3[1]), t + h, k4);
        x = clampX(x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]));
        y = clampY(y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]));
        t += h;
      }
      return [x, y];
    }
    // optional local shape corrections (P.shears): psi = a/2 (dy^2 - dx^2) w(r), w = (1 - r^2/R^2)^3 inside R.
    // grad(psi) is added to the gradient-mode warp, so the map stays the gradient of one function (symmetric Jacobian,
    // no rotation) and nothing outside R moves; a > 0 trades east-west stretch for north-south stretch at the centre
    // (area kept there). check_projection.cjs verifies that no cell folds over.
    const SH = (P.shears || []).map((c) => { const [x, y] = base(c.lat, c.lon); return { x, y, a: c.a, R2: (c.R * UPM) * (c.R * UPM) }; });
    function shearAdd(bx, by, out) {
      for (let i = 0; i < SH.length; i++) {
        const c = SH[i], dx = bx - c.x, dy = by - c.y, s = (dx * dx + dy * dy) / c.R2;
        if (s >= 1) continue;
        const w = (1 - s) * (1 - s) * (1 - s), q = (dy * dy - dx * dx) / 2, dw = (-6 / c.R2) * (1 - s) * (1 - s);
        out[0] += c.a * (-dx * w + q * dw * dx);
        out[1] += c.a * (dy * w + q * dw * dy);
      }
    }
    // gradient mode: T(b) = b + gain / mean(rho0) * grad(phi)(b)  (gradient of a convex function)
    function gstep(bx, by) {
      grad(bx, by, g);
      const k = (P.gain == null ? 1 : P.gain) / RHOBAR;
      const o = [bx + k * g[0], by + k * g[1]];
      if (SH.length) shearAdd(bx, by, o);
      return [clampX(o[0]), clampY(o[1])];
    }
    const fwdIn = (bx, by) => (P.mode === 'gradient' ? gstep(bx, by) : flow(bx, by, 0, 1));
    // outside the frame a point moves with its foot on the frame edge (continuous, monotonic, and the
    // result lies outside the world rectangle, so callers can tell; see inFrame())
    function fwd(bx, by) {
      const cx = clampX(bx), cy = clampY(by), r = fwdIn(cx, cy);
      if (cx !== bx || cy !== by) { r[0] += bx - cx; r[1] += by - cy; }
      return r;
    }
    function warp(bx, by) { if (!ready) init(); return fwd(bx, by); }
    function unwarp(x, y) {
      if (!ready) init();
      let [bx, by] = P.mode === 'gradient' ? [x, y] : flow(clampX(x), clampY(y), 1, 0); // first guess, then Newton
      for (let it = 0; it < (P.mode === 'gradient' ? 30 : 4); it++) {
        const f = fwd(bx, by), ex = f[0] - x, ey = f[1] - y;
        if (Math.abs(ex) + Math.abs(ey) < 1e-3) break;
        const e = 0.5, fx = fwd(bx + e, by), fy = fwd(bx, by + e);
        const a = (fx[0] - f[0]) / e, b = (fy[0] - f[0]) / e, c = (fx[1] - f[1]) / e, d = (fy[1] - f[1]) / e;
        const det = a * d - b * c;
        bx -= (d * ex - b * ey) / det; by -= (-c * ex + a * ey) / det;
      }
      return [bx, by];
    }
    const project = (lat, lon) => { const b = base(lat, lon); return warp(b[0], b[1]); };
    const inFrame = (lat, lon) => lat >= FRAME.latS && lat <= FRAME.latN && lon >= FRAME.lonW && lon <= FRAME.lonE;
    const unproject = (x, y) => { const b = unwarp(x, y); return baseInverse(b[0], b[1]); };

    function haversineM(a, b) {
      const R = 6371008.8, x = (b[1] - a[1]) * RAD * Math.cos(((a[0] + b[0]) / 2) * RAD), y = (b[0] - a[0]) * RAD;
      return R * Math.hypot(x, y);
    }
    function densify(pts, maxSegM) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.ceil(haversineM(a, b) / maxSegM);
        for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
      }
      return out;
    }
    function projectLine(pts, opt) {
      const m = (opt && opt.maxSegM) || 40;
      return (m > 0 ? densify(pts, m) : pts).map((p) => project(p[0], p[1]));
    }
    const projectRing = projectLine;
    function placeWorld(e) {
      if (e && e.anchor_latlon && e.offset_u) {
        const a = project(e.anchor_latlon[0], e.anchor_latlon[1]);
        return [a[0] + e.offset_u[0], a[1] + e.offset_u[1]];
      }
      return project(e.lat, e.lon);
    }
    // Jacobian of the warp at a base point by central differences (step in base units)
    function jacB(bx, by, e) {
      e = e || 2;
      const xp = warp(bx + e, by), xm = warp(bx - e, by), yp = warp(bx, by + e), ym = warp(bx, by - e);
      return [[(xp[0] - xm[0]) / (2 * e), (yp[0] - ym[0]) / (2 * e)], [(xp[1] - xm[1]) / (2 * e), (yp[1] - ym[1]) / (2 * e)]];
    }
    function analyse(J) {
      const a = J[0][0], b = J[0][1], c = J[1][0], d = J[1][1];
      // singular values of J
      const E = (a + d) / 2, F = (a - d) / 2, G = (c + b) / 2, Hh = (c - b) / 2;
      const Q = Math.hypot(E, Hh), R = Math.hypot(F, G);
      const s1 = Q + R, s2 = Q - R, rot = Math.atan2(Hh, E) / RAD;
      // worst bearing change over directions (sampled every 2 deg, refined)
      let worst = 0;
      for (let k = 0; k < 90; k++) {
        const th = (k * Math.PI) / 90, ux = Math.cos(th), uy = Math.sin(th);
        const vx = a * ux + b * uy, vy = c * ux + d * uy;
        let dth = Math.atan2(vy, vx) - th;
        while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
        if (Math.abs(dth) > worst) worst = Math.abs(dth);
      }
      return { det: a * d - b * c, m: Math.sqrt(Math.max(0, a * d - b * c)), s1, s2, aniso: s2 / s1, rot, bearingMaxErr: worst / RAD };
    }
    function jacobian(lat, lon) { const b = base(lat, lon); return jacB(b[0], b[1]); }
    function scaleAt(lat, lon) {
      const r = analyse(jacobian(lat, lon));
      r.upm = r.m * UPM; r.mpu = 1 / r.upm;
      return r;
    }
    function targetM(lat, lon) { if (!ready) init(); const b = base(lat, lon); return Math.sqrt(rho0(b[0], b[1]) / RHOBAR); }

    const api = {
      PARAMS: P, WORLD_W: W, WORLD_H: H, BASE_UPM: UPM, FRAME, PRESETS, PRESET, PRESET_NOTE,
      init, project, unproject, inFrame, base, baseInverse, warp, unwarp, projectLine, projectRing, placeWorld,
      jacobian, jacB, analyse, scaleAt, targetM, densify, haversineM,
      rho0: (x, y) => rho0(x, y), get rhoBar() { if (!ready) init(); return RHOBAR; },
      create,
    };
    return api;
  }

  const def = create(PARAMS);
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else root.NOSTALGIA_GEO = def;
})(typeof window !== 'undefined' ? window : globalThis);
