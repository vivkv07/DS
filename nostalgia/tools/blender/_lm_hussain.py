"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

HUSSAIN SAGAR group: the Buddha on Gibraltar Rock, the Tank Bund statues (+ heritage lamps and
railing), the Lumbini Park jetty and musical fountain, NTR Ghat, Prasads (site / open), Birla
Mandir on Naubat Pahad and the Birla Planetarium. Front = -Y, origin = ground centre, Z up.
"""
import math
import os
import random
import bmesh
from mathutils import Vector, Matrix
import kit
import _lmkit as L
from kit import box, cylinder, lathe

PI = math.pi


# =========================================================================== private helpers
def _obj(bm, name, mat):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def trim(objs, keep=()):
    """drop the downward-facing faces (never seen: they sit on the ground or on the part below);
    objects whose name starts with one in `keep` are left alone (overhangs seen from below)."""
    for o in objs:
        if o is None or o.type != 'MESH' or any(o.name.startswith(k) for k in keep):
            continue
        kit.apply_modifiers(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        dead = [f for f in bm.faces if f.normal.z < -0.95]
        if dead and len(dead) < len(bm.faces):
            bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
            bm.to_mesh(o.data)
        bm.free()
    return objs


def report(objs):
    tot = {}
    for o in objs:
        if o is None:
            continue
        n = o.name.split('.')[0]
        tot[n] = tot.get(n, 0) + kit.tri_count([o])
    kit.log('tris by part: ' + ', '.join('%s %d' % kv for kv in sorted(tot.items(), key=lambda kv: -kv[1])))


def rock_mound(name, rx, ry, h, mat, seed=1, na=16, prof=None, rough=0.22, zj=0.5, z0=-2.5, cx=0.0, cy=0.0):
    """craggy rock island / hillock: a polar grid of rings (profile [(r_frac, z_frac)] bottom to
    top) with random radial and vertical jitter, closed by a top vertex."""
    rnd = random.Random(seed)
    prof = prof or [(1.0, None), (0.97, 0.18), (0.82, 0.5), (0.55, 0.82), (0.25, 1.0)]
    bm = bmesh.new()
    rings = []
    # per-angle low-frequency lobes so the outline is not a perfect ellipse
    lob = [1.0 + rough * 0.8 * (rnd.random() - 0.5) for _ in range(na)]
    lob = [(lob[i - 1] + 2 * lob[i] + lob[(i + 1) % na]) / 4 for i in range(na)]
    for j, (rf, zf) in enumerate(prof):
        ring = []
        for i in range(na):
            a = 2 * PI * (i + (0.5 if j % 2 else 0.0)) / na
            k = rf * lob[i] * (1.0 + rough * (rnd.random() - 0.5) * (0.4 if zf is None else 1.0))
            z = z0 if zf is None else h * zf + (rnd.random() - 0.5) * zj * h * 0.25
            ring.append(bm.verts.new((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a), z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        A, B = rings[j], rings[j + 1]
        for i in range(na):
            bm.faces.new((A[i], A[(i + 1) % na], B[(i + 1) % na], B[i]))
    top = bm.verts.new((cx, cy, h * (1.0 + 0.05 * rnd.random())))
    R = rings[-1]
    for i in range(na):
        bm.faces.new((R[i], R[(i + 1) % na], top))
    bm.faces.new(list(reversed(rings[0])))
    return _obj(bm, name, mat)


def _copy_nomat(o, A):
    c = o.copy()
    c.data = o.data.copy()
    kit.link(c, A.coll)
    c.data.materials.clear()
    return c


def boulder(name, r, loc, mat, seed=1, sq=0.7, sub=0):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        v.co *= 1.0 + 0.28 * (rnd.random() - 0.5)
        v.co.z *= sq
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return _obj(bm, name, mat)


def surf_pts(rings_z, x_list, zs, front=True):
    """points on the front (or back) of an elliptic loft defined by rings_z [(z, rx, ry, yc)]"""
    out = []
    for x, z in zip(x_list, zs):
        # interpolate the ring at z
        for k in range(len(rings_z) - 1):
            z0, rx0, ry0, y0 = rings_z[k]
            z1, rx1, ry1, y1 = rings_z[k + 1]
            if z0 <= z <= z1:
                t = (z - z0) / max(1e-6, z1 - z0)
                rx, ry, yc = rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t, y0 + (y1 - y0) * t
                break
        else:
            z0, rx, ry, yc = rings_z[-1]
        u = max(-0.98, min(0.98, x / rx))
        y = yc - ry * math.sqrt(1 - u * u) * (1 if front else -1)
        out.append((x, y, z))
    return out


def petal_ring(name, n, r, z, w, h, tilt, mat, phase=0.0, depth=0.35):
    out = []
    outline = [(-w / 2, 0), (w / 2, 0), (w * 0.48, h * 0.45), (w * 0.22, h * 0.85), (0, h), (-w * 0.22, h * 0.85), (-w * 0.48, h * 0.45)]
    for i in range(n):
        a = phase + 2 * PI * i / n
        o = kit.prism_from_outline(name, outline, depth, center=(0, 0, 0), mat=mat)
        o.rotation_euler = (math.radians(-tilt), 0, a + PI / 2)
        o.location = (r * math.cos(a), r * math.sin(a), z)
        kit.apply_transform(o)
        out.append(o)
    return kit.join(out, name)


def ellipse_loft(name, rings, mat, seg=14, cap_end=True, cap_start=True):
    """rings: [(x, y, z, rx, ry)] stacked roughly along Z"""
    return kit.loft(name, [{'c': (x, y, z), 'r': (rx, ry)} for (x, y, z, rx, ry) in rings], seg=seg, mat=mat,
                    cap_start=cap_start, cap_end=cap_end)


# =========================================================================== 1. Buddha (Gibraltar Rock)
@kit.asset('buddha_statue', 'hero_landmark', draw='buddha_statue', face='s', footprint=[20, 20], height=90.0,
           fit='footprint', floodlit=True)
def build_buddha(A):
    M = L.mats()
    STONE = kit.material('granite_grey', 'white_granite', base='#e4e1d9', var=0.05, grain=0.04, specks=0.18, grime=0.4, dirt='#8a857c', scale=0.5)
    ROCK = kit.material('granite_grey', 'gibraltar_rock', base='#8a8278', var=0.16, grain=0.14, specks=0.5, grime=0.6, dirt='#3e3a34', scale=0.35)
    PLAT = kit.material('granite_grey', 'buddha_platform', base='#b4ada2', var=0.06, grain=0.06, grime=0.5, scale=0.6)
    parts = []
    # ---- the rock island (spreads to ~ +-19) and a few loose boulders at the waterline
    parts.append(rock_mound('rock', 17.5, 16.0, 6.0, ROCK, seed=7, na=18,
                            prof=[(1.08, None), (1.0, 0.1), (0.86, 0.45), (0.66, 0.85), (0.5, 1.0)], rough=0.3))
    for i, (a, d, r) in enumerate(((0.3, 17.5, 2.6), (1.4, 18.0, 2.0), (2.5, 16.5, 3.0), (3.6, 18.5, 2.2), (4.6, 17.0, 2.8), (5.6, 18.2, 1.8))):
        parts.append(boulder('bould', r, (d * math.cos(a), d * math.sin(a), 0.2), ROCK, seed=i + 3))
    # ---- stepped granite platform, plain railing posts on its edge, then the lotus pedestal
    parts.append(cylinder('plat1', 10.8, 2.6, (0, 0, 3.6), seg=8, mat=PLAT))
    parts.append(cylinder('plat2', 8.6, 2.6, (0, 0, 6.2), seg=8, mat=PLAT))
    parts.append(L.steps('plat_steps', 5.0, 0.9, 0.6, 4, (0, -12.2, 3.6), PLAT))
    parts.append(lathe('lotus_drum', [(6.6, 8.8), (7.0, 9.3), (5.6, 9.8), (5.2, 11.0), (6.2, 12.2), (7.4, 13.4), (7.6, 14.6), (6.8, 15.0), (0.0, 15.0)], seg=16, mat=STONE))
    parts.append(petal_ring('petals_lo', 12, 6.0, 10.4, 3.9, 4.6, 58, STONE))
    # ---- the standing figure, feet at z = ZF, ~72 u tall
    ZF = 15.0
    fig = []
    # robe body (outer robe hem at ~7.5 over the under-robe falling to the ankles)
    body_r = [(0.6, 5.9, 3.9, 0.0), (1.6, 6.0, 4.0, 0.0), (6.6, 5.7, 3.8, 0.0), (7.2, 5.7, 3.8, 0.0), (7.3, 6.4, 4.4, 0.0),
              (9.0, 6.3, 4.3, 0.0), (18.0, 6.0, 4.0, 0.1), (28.0, 6.1, 4.0, 0.2), (36.0, 6.4, 4.2, 0.2), (43.0, 6.1, 4.0, 0.1),
              (51.0, 6.7, 4.2, 0.0), (57.0, 7.7, 4.3, 0.0), (60.5, 8.1, 4.1, 0.1), (63.0, 6.7, 3.5, 0.3), (64.4, 2.8, 2.5, 0.4)]
    fig.append(ellipse_loft('robe', [(0, yc, z, rx, ry) for (z, rx, ry, yc) in body_r], STONE, seg=18))
    # feet peeping out under the hem
    for s in (-1, 1):
        fig.append(ellipse_loft('foot', [(s * 2.1, -1.5, 0.0, 1.25, 1.0), (s * 2.2, -4.3, 0.2, 1.3, 1.1), (s * 2.3, -5.8, 0.25, 1.1, 0.5)], STONE, seg=8))
    # soft U-shaped robe folds sweeping across the front (thin ridges on the surface)
    folds = []
    for k, zc in enumerate((45.0, 38.0, 31.0, 24.0, 17.0, 11.5)):
        xs = [-5.4 + 10.8 * i / 8 for i in range(9)]
        sag = 3.6 + k * 0.3
        zs = [zc + 1.2 * (k * 0.12) * (x / 5.4) + sag * ((x / 5.4) ** 2) for x in xs]
        pts = surf_pts(body_r, xs, zs)
        pts = [(x, y - 0.05, z) for (x, y, z) in pts]
        folds.append(kit.tube('fold', pts, 0.3, seg=3, mat=STONE))
    fig.append(kit.join(folds, 'folds'))
    # neckline of the robe
    fig.append(kit.tube('neckline', surf_pts(body_r, [-4.0, -2.6, -1.3, 0, 1.3, 2.6, 4.0], [63.3, 62.0, 61.0, 60.6, 61.0, 62.0, 63.3]), 0.34, seg=4, mat=STONE))
    # neck and head (slightly flattened face), ushnisha, hair cap, long earlobes, simple features
    fig.append(cylinder('neck', 1.85, 2.6, (0, 0.4, 63.8), seg=10, mat=STONE, r2=1.7))
    head = [(0, 0.3, 65.6, 2.0, 2.1), (0, 0.15, 66.4, 2.7, 2.8), (0, 0.1, 68.0, 3.1, 3.2), (0, 0.1, 70.2, 3.3, 3.4),
            (0, 0.15, 72.4, 3.35, 3.45), (0, 0.25, 74.2, 3.0, 3.1), (0, 0.3, 75.3, 2.1, 2.2), (0, 0.3, 75.7, 0.9, 1.0)]
    fig.append(ellipse_loft('head', head, STONE, seg=16))
    HAIR = kit.material('granite_grey', 'buddha_hair', base='#c9c5bc', var=0.05, grain=0.25, specks=0.3, grime=0.6, dirt='#6a655c', scale=2.5)
    fig.append(ellipse_loft('hair', [(0, 0.75, 71.3, 3.42, 3.2), (0, 0.6, 73.2, 3.45, 3.42), (0, 0.45, 74.8, 3.1, 3.1),
                                     (0, 0.35, 75.9, 2.4, 2.45), (0, 0.3, 76.6, 1.3, 1.3)], HAIR, seg=14))
    fig.append(ellipse_loft('ushnisha', [(0, 0.35, 76.0, 1.9, 1.9), (0, 0.35, 77.3, 2.0, 2.0), (0, 0.35, 78.5, 1.55, 1.55), (0, 0.35, 79.2, 0.6, 0.6)], HAIR, seg=10))
    for s in (-1, 1):
        fig.append(ellipse_loft('ear', [(s * 3.2, 0.7, 65.4, 0.3, 0.5), (s * 3.45, 0.6, 66.6, 0.45, 0.75), (s * 3.55, 0.55, 69.5, 0.4, 0.9),
                                         (s * 3.5, 0.6, 71.6, 0.35, 0.8), (s * 3.3, 0.7, 72.4, 0.25, 0.4)], STONE, seg=6))
    # nose (small wedge), brow ridge, closed-eye lids as shallow strips, lips
    fig.append(kit.prism_from_outline('nose', [(-0.45, 0.0), (0.45, 0.0), (0.12, 2.0), (-0.12, 2.0)], 0.7, center=(0, -3.25, 68.6), mat=STONE))
    for s in (-1, 1):
        fig.append(kit.tube('lid', [(s * 0.6, -3.2, 70.1), (s * 1.3, -3.15, 69.9), (s * 2.1, -2.85, 70.1)], 0.13, seg=4, mat=HAIR))
    fig.append(kit.tube('lips', [(-0.75, -3.05, 67.5), (0, -3.25, 67.4), (0.75, -3.05, 67.5)], 0.18, seg=4, mat=STONE))
    # RIGHT arm (figure's right = -X): abhaya mudra, forearm raised, palm facing out (-Y)
    fig.append(ellipse_loft('r_upper', [(-7.6, 0.2, 61.2, 2.3, 2.3), (-9.1, 0.3, 56.0, 2.1, 2.1), (-9.7, 0.2, 50.5, 1.9, 1.9)], STONE, seg=10))
    fig.append(kit.tube('r_fore', [(-9.7, 0.2, 50.0), (-9.8, -2.2, 52.0), (-9.5, -4.4, 55.8), (-9.3, -5.0, 57.6)], 1.45, seg=8, mat=STONE))
    # the robe hanging in a soft drape below the raised forearm
    fig.append(kit.prism_from_outline('r_drape', [(0.6, 0.0), (-1.8, 2.6), (-4.2, 5.0), (-4.6, 7.4), (-0.6, 7.4), (1.6, 3.0)], 1.0,
                                      center=(0, 0, 0), mat=STONE, axis='X'))
    dr = fig[-1]
    dr.location = (-10.1, -0.6, 46.5)
    kit.apply_transform(dr)
    palm = ellipse_loft('r_palm', [(-9.25, -5.1, 57.2, 1.35, 0.6), (-9.25, -5.2, 59.6, 1.5, 0.6), (-9.25, -5.25, 61.6, 1.4, 0.5), (-9.25, -5.25, 63.6, 1.1, 0.4), (-9.25, -5.25, 64.2, 0.5, 0.2)], STONE, seg=8)
    fig.append(palm)
    fig.append(kit.tube('r_thumb', [(-8.1, -5.0, 58.0), (-7.65, -5.15, 59.6), (-7.6, -5.2, 60.6)], 0.38, seg=5, mat=STONE))
    # LEFT arm: hanging, the hand gathering the robe at hip height
    fig.append(ellipse_loft('l_upper', [(7.6, 0.2, 61.2, 2.3, 2.3), (9.1, 0.3, 56.0, 2.1, 2.1), (9.6, 0.3, 50.0, 1.9, 1.9)], STONE, seg=10))
    fig.append(kit.tube('l_fore', [(9.6, 0.3, 50.2), (9.5, -0.8, 46.0), (8.8, -2.6, 41.6)], 1.5, seg=8, mat=STONE))
    fig.append(ellipse_loft('l_hand', [(8.6, -2.9, 41.8, 1.4, 1.1), (8.4, -3.2, 39.8, 1.4, 1.2), (8.3, -3.2, 38.2, 1.0, 0.9)], STONE, seg=8))
    # the gathered robe falling from the left hand in folds almost to the ankles
    fig.append(ellipse_loft('l_drape', [(8.3, -2.4, 40.0, 1.5, 1.2), (7.9, -1.6, 32.0, 2.0, 1.3), (7.6, -1.0, 22.0, 2.4, 1.3), (7.5, -0.6, 12.0, 2.7, 1.3), (7.5, -0.5, 6.2, 2.8, 1.2)], STONE, seg=8))
    for dx in (-1.6, 0.0, 1.6):
        fig.append(kit.tube('l_fold', [(8.6 + dx * 0.6, -2.7, 38.5), (8.0 + dx * 0.9, -2.8, 28.0), (7.6 + dx * 1.1, -2.2, 16.0), (7.5 + dx * 1.2, -1.9, 6.6)], 0.32, seg=3, mat=STONE))
    for o in fig:
        o.location = (0, 0, ZF)
        kit.apply_transform(o)
    figure = kit.join(fig, 'figure')
    parts.append(figure)
    # ---------------- the shell: hand-built low lofts following the figure, auto shell for the rock
    lo = []
    sub = [0, 4, 8, 10, 11, 12, 13, 14]
    lf = [ellipse_loft('robe_lo', [(0, body_r[i][3], body_r[i][0], body_r[i][1] + 0.25, body_r[i][2] + 0.3) for i in sub], None, seg=8, cap_start=False, cap_end=False)]
    lf.append(ellipse_loft('head_lo', [(0, 0.4, 63.9, 2.0, 2.0), (0, 0.15, 66.6, 3.0, 3.1), (0, 0.25, 71.5, 3.6, 3.6),
                                       (0, 0.35, 75.0, 3.25, 3.25), (0, 0.35, 76.6, 2.1, 2.1), (0, 0.35, 78.4, 1.7, 1.7), (0, 0.35, 79.4, 0.3, 0.3)], None, seg=8, cap_start=False))
    lf.append(ellipse_loft('r_upper_lo', [(-7.4, 0.2, 61.6, 2.4, 2.4), (-9.2, 0.3, 56.0, 2.2, 2.2), (-9.8, 0.2, 50.0, 2.0, 2.0)], None, seg=6))
    lf.append(kit.tube('r_fore_lo', [(-9.7, 0.2, 49.6), (-9.8, -2.2, 52.0), (-9.5, -4.4, 55.8), (-9.3, -5.0, 57.6)], 1.6, seg=6))
    lf.append(ellipse_loft('r_palm_lo', [(-9.0, -5.1, 57.0, 1.6, 0.8), (-9.0, -5.2, 60.6, 1.75, 0.75), (-9.1, -5.25, 63.4, 1.3, 0.6), (-9.25, -5.25, 64.4, 0.4, 0.3)], None, seg=6))
    d2 = kit.prism_from_outline('r_drape_lo', [(0.7, -0.1), (-1.9, 2.6), (-4.4, 5.0), (-4.8, 7.6), (-0.6, 7.6), (1.7, 3.0)], 1.4, center=(0, 0, 0), axis='X')
    d2.location = (-10.1, -0.6, 46.5)
    kit.apply_transform(d2)
    lf.append(d2)
    lf.append(ellipse_loft('l_upper_lo', [(7.4, 0.2, 61.6, 2.4, 2.4), (9.2, 0.3, 56.0, 2.2, 2.2), (9.7, 0.3, 50.0, 2.0, 2.0)], None, seg=6))
    lf.append(kit.tube('l_fore_lo', [(9.6, 0.3, 50.4), (9.5, -0.8, 46.0), (8.8, -2.6, 41.6)], 1.65, seg=6))
    lf.append(ellipse_loft('l_hand_drape_lo', [(8.6, -2.9, 42.2, 1.6, 1.35), (8.3, -2.6, 38.4, 1.7, 1.5), (7.9, -1.8, 32.0, 2.2, 1.6), (7.5, -0.8, 18.0, 2.7, 1.6), (7.5, -0.5, 6.0, 3.0, 1.5)], None, seg=6))
    for s_ in (-1, 1):
        lf.append(ellipse_loft('foot_lo', [(s_ * 2.1, -2.6, 0.0, 1.4, 0.9), (s_ * 2.3, -6.1, 0.1, 1.1, 0.6)], None, seg=4, cap_start=False))
    for o in lf:
        o.location = (0, 0, ZF)
        kit.apply_transform(o)
    lo += lf
    lo.append(lathe('lotus_lo', [(10.9, 3.6), (10.9, 6.2), (8.7, 6.2), (8.7, 8.8), (6.6, 9.6), (8.4, 13.6), (7.9, 15.1), (0.0, 15.2)], seg=8, close_bottom=False))
    lo.append(L.place(kit.prism_from_outline('plat_steps_lo', [(-14.0, 3.2), (-14.0, 4.0), (-10.4, 6.3), (-9.0, 6.3), (-9.0, 3.2)], 5.4, axis='X'), (0, 0, 0)))
    rk = [o for o in parts if o.name.startswith(('rock', 'bould'))]
    rock_lo = kit.join([_copy_nomat(o, A) for o in rk], 'rock_lo')
    L._auto_lo(rock_lo, 80)
    lo.append(rock_lo)
    trim(lo)
    report(lo)
    L.finish_proxy(A, parts, lo=lo, size=384, ao_dist=6.0, ao_samples=64, ao_strength=0.65)
    L.col_box('buddha_rock', (30, 28, 6), (0, 0, -1))
    L.col_box('buddha_fig', (18, 9, 75), (0, 0, 15))
    L.shots(A, az=-25, el=10, extra=[{'name': 'face', 'size': 320, 'view': {'az': -15, 'el': 4, 'fov': 30, 'target': (0, 0, 78), 'dist': 40}}])


# =========================================================================== 2. Tank Bund statues (4 generic poses)
def _nometal(M):
    """palette copy whose iron / bronze are non-metal paints (no ORM texture on small models)"""
    M = dict(M)
    M['iron'] = kit.material('iron_black', 'iron_paint', base='#222326', metal=0.0, rough=0.5)
    M['bronze'] = kit.material('gold_leaf', 'bronze_paint', base='#6a5236', metal=0.0, rough=0.5, var=0.12, grain=0.06, grime=0.7, dirt='#2f3b30')
    return M


def _tb_figure(pose, BZ, z0):
    """a dignified ~2x life-size bronze figure facing -Y standing (or seated) at z0"""
    p = []
    if pose == 'saint':
        p.append(box('seat', (5.4, 4.2, 1.0), (0, 0, 0), BZ, base=True))
        p.append(ellipse_loft('legs', [(0, -0.5, 1.0, 3.1, 2.1), (0, -0.5, 2.2, 3.0, 2.0), (0, -0.2, 3.0, 2.1, 1.5)], BZ, seg=8))
        p.append(ellipse_loft('torso', [(0, 0.1, 2.8, 2.0, 1.4), (0, 0.1, 6.4, 1.9, 1.3), (0, 0.1, 8.4, 2.2, 1.3), (0, 0.1, 9.2, 2.1, 1.15),
                                        (0, 0.2, 9.8, 0.9, 0.8)], BZ, seg=8))
        hz = 9.6
        p.append(ellipse_loft('head', [(0, 0.15, hz, 0.7, 0.75), (0, 0.05, hz + 0.9, 1.05, 1.15), (0, 0.05, hz + 1.9, 1.05, 1.12), (0, 0.1, hz + 2.6, 0.55, 0.6)], BZ, seg=8))
        p.append(cylinder('staff', 0.22, 14.0, (-3.3, -0.9, 0.0), seg=4, mat=BZ))
        p.append(kit.tube('r_arm', [(-2.1, 0.1, 9.0), (-2.9, 0.0, 6.6), (-3.2, -0.8, 7.4)], 0.5, seg=5, mat=BZ))
        p.append(kit.tube('l_arm', [(2.1, 0.1, 9.0), (2.6, -0.1, 6.4), (1.6, -1.7, 3.6)], 0.5, seg=5, mat=BZ))
        # robe edge falling over the left shoulder
        p.append(kit.tube('robe', [(1.6, -0.6, 9.4), (0.4, -1.35, 7.4), (-1.0, -1.3, 4.6)], 0.4, seg=4, mat=BZ))
    else:
        p.append(ellipse_loft('body', [(0, 0, 0.0, 1.95, 1.45), (0, 0, 3.0, 1.75, 1.3), (0, 0, 7.6, 1.85, 1.3), (0, 0, 9.6, 1.9, 1.3),
                                       (0, 0, 12.4, 2.25, 1.35), (0, 0, 13.6, 2.4, 1.25), (0, 0.1, 14.3, 1.2, 0.9), (0, 0.1, 14.8, 0.7, 0.7)], BZ, seg=8))
        p.append(ellipse_loft('head', [(0, 0.05, 14.6, 0.7, 0.75), (0, 0.0, 15.4, 1.05, 1.15), (0, 0.0, 16.4, 1.05, 1.12), (0, 0.05, 17.2, 0.55, 0.6)], BZ, seg=8))
        for s in (-1, 1):
            p.append(box('foot', (0.8, 1.2, 0.45), (s * 0.7, -1.3, 0.0), BZ, base=True))
        if pose == 'scholar':
            p.append(kit.tube('r_arm', [(-2.2, 0, 13.4), (-2.6, 0.1, 10.6), (-2.5, -0.3, 8.0)], 0.55, seg=5, mat=BZ))
            p.append(kit.tube('l_arm', [(2.2, 0, 13.4), (2.6, 0.1, 10.8), (1.3, -1.5, 11.2)], 0.55, seg=5, mat=BZ))
            bk = box('book', (1.9, 0.55, 2.4), (0, 0, 0), BZ, base=True)
            L.place(bk, (1.0, -1.8, 9.8), rz=0.25)
            p.append(bk)
            # long coat flaring at the knees
            p.append(ellipse_loft('coat', [(0, 0, 4.0, 2.05, 1.5), (0, 0, 6.0, 1.95, 1.42)], BZ, seg=8))
        elif pose == 'poet':
            p.append(kit.tube('r_arm', [(-2.2, 0, 13.4), (-3.3, -1.0, 14.6), (-3.4, -2.0, 17.2)], 0.5, seg=5, mat=BZ))
            p.append(box('r_hand', (0.9, 0.35, 1.2), (-3.4, -2.05, 17.0), BZ, base=True))
            p.append(kit.tube('l_arm', [(2.2, 0, 13.4), (2.7, 0.0, 10.6), (2.6, -0.4, 8.2)], 0.55, seg=5, mat=BZ))
            # shawl over the left shoulder, one end hanging down the front, the other across the chest
            sh = box('shawl', (1.7, 0.35, 7.4), (0, 0, 0), BZ, base=True)
            L.place(sh, (1.75, -1.45, 6.4), rz=0.0)
            p.append(sh)
            p.append(kit.tube('shawl_x', [(2.0, -0.9, 13.6), (0.6, -1.5, 11.6), (-1.6, -1.4, 9.2), (-1.9, -0.6, 8.6)], 0.45, seg=4, mat=BZ))
        elif pose == 'warrior':
            p.append(ellipse_loft('turban', [(0, 0.05, 15.9, 1.15, 1.2), (0, 0.0, 16.9, 1.38, 1.4), (0, 0.05, 17.7, 1.05, 1.1), (0, 0.1, 18.1, 0.4, 0.4)], BZ, seg=8))
            p.append(box('blade', (0.36, 0.14, 7.2), (0, -2.1, 0.8), BZ, base=True))
            p.append(box('guard', (1.7, 0.35, 0.3), (0, -2.1, 8.0), BZ, base=True))
            p.append(cylinder('hilt', 0.2, 1.0, (0, -2.1, 8.3), seg=4, mat=BZ))
            for s in (-1, 1):
                p.append(kit.tube('arm', [(s * 2.2, 0, 13.4), (s * 2.6, -0.5, 10.9), (s * 0.45, -2.0, 9.4)], 0.55, seg=5, mat=BZ))
            # sash at the waist
            p.append(ellipse_loft('sash', [(0, 0, 8.6, 2.0, 1.45), (0, 0, 9.4, 2.0, 1.45)], BZ, seg=8))
    for o in p:
        o.location = (0, 0, z0)
        kit.apply_transform(o)
    return kit.join(p, 'fig_' + pose)


def _tb_figure_lo(pose, z0):
    """low shell of _tb_figure (5-6 sided lofts)"""
    p = []
    if pose == 'saint':
        p.append(box('seat_lo', (5.6, 4.4, 1.1), (0, 0, 0), None, base=True))
        p.append(ellipse_loft('legs_lo', [(0, -0.5, 1.0, 3.3, 2.3), (0, -0.3, 3.0, 2.3, 1.7)], None, seg=5, cap_start=False))
        p.append(ellipse_loft('torso_lo', [(0, 0.1, 2.8, 2.2, 1.6), (0, 0.1, 8.4, 2.4, 1.5), (0, 0.15, 9.6, 1.6, 1.2), (0, 0.1, 10.6, 1.15, 1.25),
                                           (0, 0.05, 11.8, 1.15, 1.25), (0, 0.1, 12.4, 0.3, 0.3)], None, seg=5, cap_start=False))
        p.append(cylinder('staff_lo', 0.3, 14.0, (-3.3, -0.9, 0.0), seg=3, cap=False))
        p.append(kit.tube('r_arm_lo', [(-2.1, 0.1, 9.0), (-2.9, 0.0, 6.6), (-3.2, -0.8, 7.4)], 0.65, seg=3))
        p.append(kit.tube('l_arm_lo', [(2.1, 0.1, 9.0), (2.6, -0.1, 6.4), (1.6, -1.7, 3.6)], 0.65, seg=3))
    else:
        top = 18.3 if pose == 'warrior' else 17.4
        p.append(ellipse_loft('body_lo', [(0, 0, 0.0, 2.15, 1.65), (0, 0, 9.6, 2.1, 1.5), (0, 0, 13.6, 2.6, 1.45), (0, 0.1, 14.5, 1.0, 0.95),
                                          (0, 0.0, 15.6, 1.25 if pose != 'warrior' else 1.5, 1.3 if pose != 'warrior' else 1.5),
                                          (0, 0.0, 16.6, 1.2 if pose != 'warrior' else 1.5, 1.25 if pose != 'warrior' else 1.5), (0, 0.05, top - 0.45, 0.85 if pose != 'warrior' else 1.1, 0.9 if pose != 'warrior' else 1.1), (0, 0.05, top, 0.2, 0.2)], None, seg=5, cap_start=False))
        if pose == 'scholar':
            p.append(kit.tube('r_arm_lo', [(-2.2, 0, 13.4), (-2.6, 0.1, 10.6), (-2.5, -0.3, 8.0)], 0.7, seg=3))
            p.append(kit.tube('l_arm_lo', [(2.2, 0, 13.4), (2.6, 0.1, 10.8), (1.3, -1.5, 11.2)], 0.7, seg=3))
            bk = box('book_lo', (2.1, 0.75, 2.6), (0, 0, 0), None, base=True)
            p.append(L.place(bk, (1.0, -1.8, 9.7), rz=0.25))
        elif pose == 'poet':
            p.append(kit.tube('r_arm_lo', [(-2.2, 0, 13.4), (-3.3, -1.0, 14.6), (-3.4, -2.0, 17.6)], 0.7, seg=3))
            p.append(kit.tube('l_arm_lo', [(2.2, 0, 13.4), (2.7, 0.0, 10.6), (2.6, -0.4, 8.2)], 0.7, seg=3))
        elif pose == 'warrior':
            p.append(box('blade_lo', (0.5, 0.3, 7.8), (0, -2.1, 0.7), None, base=True))
            p.append(box('guard_lo', (1.9, 0.5, 0.5), (0, -2.1, 7.9), None, base=True))
            for s in (-1, 1):
                p.append(kit.tube('arm_lo', [(s * 2.2, 0, 13.4), (s * 2.6, -0.5, 10.9), (s * 0.45, -2.0, 9.4)], 0.7, seg=3))
    for o in p:
        o.location = (0, 0, z0)
        kit.apply_transform(o)
    return p


@kit.asset('tank_bund_statue', 'landmark', draw='tank_bund_statue', footprint=[8, 8], height=45.0, fit='footprint',
           variants={'rule': 'idx', 'names': ['scholar', 'poet', 'warrior', 'saint']})
def build_tank_bund_statue(A):
    M = _nometal(L.mats())
    G = kit.material('granite_grey', 'tb_granite', base='#b9b2a6', var=0.04, grain=0.03, specks=0.15, grime=0.4, scale=0.8)
    GD = kit.material('granite_grey', 'tb_granite_dk', base='#8e877c', var=0.04, grain=0.03, specks=0.15, scale=0.8)
    BZ = M['bronze']
    IR = M['iron']
    parts, lo, keep = [], [], []
    # dressed granite plinth: steps, dado, cornice, top block, bronze plaque on the front (road side, -Y)
    parts.append(box('step1', (8.4, 8.4, 1.4), (0, 0, 0), GD, base=True))
    parts.append(box('step2', (7.2, 7.2, 1.2), (0, 0, 1.4), G, base=True))
    parts.append(box('dado_b', (6.4, 6.4, 1.2), (0, 0, 2.6), G, base=True))
    parts.append(box('dado', (5.6, 5.6, 17.6), (0, 0, 3.8), G, base=True))
    parts.append(box('dado_panel', (4.4, 5.8, 15.0), (0, 0, 5.0), G, base=True))
    parts.append(box('dado_panel2', (5.8, 4.4, 15.0), (0, 0, 5.0), G, base=True))
    parts.append(box('cornice', (6.6, 6.6, 1.2), (0, 0, 21.4), G, base=True))
    parts.append(box('top', (6.0, 6.0, 2.0), (0, 0, 22.6), GD, base=True))
    parts.append(box('plaque', (3.4, 0.2, 2.6), (0, -2.95, 10.4), BZ, base=True))
    parts.append(box('plaque2', (2.4, 0.2, 0.6), (0, -2.95, 14.0), BZ, base=True))
    lo.append(L.shell_box('plinth_lo1', (8.5, 8.5, 2.6), (0, 0, 0)))
    lo.append(L.shell_box('plinth_lo2', (6.3, 6.3, 18.8), (0, 0, 2.6)))
    lo.append(L.shell_box('plinth_lo3', (6.7, 6.7, 3.2), (0, 0, 21.4)))
    # heritage lamp posts (black iron, three lanterns) either side and the bund railing on the lake side (+Y)
    for s in (-1, 1):
        x, y = s * 11.0, 2.0
        post, _heads = L.lamp_post('tb_lamp', 14.0, M, loc=(x, y, 0.0), arms=3)
        _heads.data.materials.clear()
        _heads.data.materials.append(IR)
        parts += [post, _heads, box('lamp_base', (1.8, 1.8, 0.8), (x, y, 0.0), GD, base=True)]
        pl = lathe('lamp_lo', [(1.5, 0.0), (1.5, 0.8), (0.45, 1.0), (0.22, 15.6)], seg=3, close_bottom=False, close_top=False)
        lo.append(L.place(pl, (x, y, 0), rz=PI / 4))
        lo.append(cylinder('lamp_arm_lo', 0.3, 3.4, (x, y, 13.6), seg=3, cap=False, axis='X', base=False))
        for dx in (-1.4, 0.0, 1.4):
            hz = 14.0 - (0.6 if dx else 0.0)
            keep.append(cylinder('tb_lantern', 0.45, 1.3, (x + dx, y, hz + 0.05), seg=3, mat=M['lamp'], r2=0.55, cap=False))
    parts.append(L.railing('rail', 29.2, 3.2, M, loc=(0, 4.5, 0.0), posts=4))

    def rail_lo(cx, cy, ln, n):
        for z in (3.0,):
            lo.append(cylinder('rail_lo', 0.25, ln + 0.3, (cx - ln / 2 - 0.15, cy, z), seg=3, cap=False, axis='X', base=False))
        for i in range(n):
            xx = cx - ln / 2 + ln * i / (n - 1)
            lo.append(cylinder('post_lo', 0.3, 3.2, (xx, cy, 0.0), seg=3, cap=False))
    rail_lo(0.0, 4.5, 29.2, 4)
    z0 = 24.6
    variants = {pose: ([_tb_figure(pose, BZ, z0)], _tb_figure_lo(pose, z0)) for pose in ('scholar', 'poet', 'warrior', 'saint')}
    trim(lo)
    report(lo)
    keep = [kit.join(keep, 'tb_lanterns')]
    for o in L.finish_proxy(A, parts, lo=lo, keep=keep, size=256, variants=variants, ao_samples=48, ao_strength=0.6):
        kit.smooth(o, 80)
    L.col_box('tb_plinth', (7, 7, 24), (0, 0, 0))
    L.shots(A, az=-30, el=10, extra=[{'name': 'poses', 'size': 256, 'view': {'az': -10, 'el': 6, 'fov': 26, 'target': (0, 0, 33), 'dist': 50}}])


# =========================================================================== 3. Lumbini Park boat jetty
@kit.asset('lumbini_jetty', 'landmark', draw='boat_jetty', face='s', footprint=[14, 26], height=6.0, fit='footprint')
def build_lumbini_jetty(A):
    """Lumbini Park boating jetty: grey pontoon deck on blue floats, white railings, the blue
    ticket kiosk at the shore end with a painted BOATING sign, shore steps, tyre fenders and a
    yellow pedal boat moored alongside."""
    M = _nometal(L.mats())
    DECK = kit.material('whitewash', 'jetty_deck', base='#a9a49a', rough=0.9, var=0.06, grain=0.04, grime=0.4, streaks=0.0, dirt='#5f594f', scale=0.8)
    BLUE = L.paint('#2f6fa8', 'jetty_blue')
    WHITE = L.paint('#ecebe6', 'jetty_white')
    ORANGE = L.paint('#e8622a', 'ring_orange')
    YEL = L.paint('#e8c42a', 'boat_yellow')
    RUB = L.paint('#262626', 'tyre_paint')
    parts, lo = [], []
    DX, DW, Y0, Y1 = -2.0, 10.0, -9.4, 13.0
    DC, DL = (Y0 + Y1) / 2, Y1 - Y0
    # pontoon deck on blue floats (z 0 = water level), steel edge
    parts.append(box('deck', (DW - 0.4, DL - 0.4, 0.8), (DX, DC, 0.7), DECK, base=True))
    parts.append(box('edge', (DW, DL, 0.5), (DX, DC, 0.4), BLUE, base=True))
    for x in (-3.2, 0.0, 3.2):
        parts.append(box('float', (2.6, DL - 1.6, 1.2), (DX + x, DC, -0.7), BLUE, base=True))
    lo.append(L.shell_box('deck_lo', (DW + 0.2, DL + 0.2, 2.2), (DX, DC, -0.7)))
    # tyre fenders on the sides
    for sx in (-1, 1):
        for y in (-4.0, 3.0, 10.0):
            parts.append(cylinder('tyre', 0.7, 0.4, (DX + sx * (DW / 2 + 0.1), y, 0.7), seg=8, mat=RUB, axis='X', base=False))
    # white railings along both long sides and the lake end (open where the boat ties up)
    RL = 11.0
    for sx in (-1, 1):
        parts.append(L.railing('rail_l', RL, 3.0, M, loc=(DX + sx * (DW / 2 - 0.3), Y0 + 2.6 + RL / 2, 1.5), rz=PI / 2, posts=4, mat=WHITE))
    parts.append(L.railing('rail_end', DW - 0.6, 3.0, M, loc=(DX, Y1 - 0.3, 1.5), posts=3, mat=WHITE))
    for (x, y) in ((DX - DW / 2 + 0.05, 2.0),):
        pts = [(x, y + 0.75 * math.cos(2 * PI * i / 8), 3.2 + 0.75 * math.sin(2 * PI * i / 8)) for i in range(9)]
        parts.append(kit.tube('lifering', pts, 0.2, seg=4, mat=ORANGE, cap=False))

    def rail_lo(p0, p1, posts):
        ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        rz = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        r = cylinder('rail_lo', 0.22, ln + 0.3, (0, 0, 0), seg=3, cap=False, axis='X', base=False)
        lo.append(L.place(r, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 4.4), rz=rz))
        for i in range(posts):
            t = i / (posts - 1)
            lo.append(cylinder('post_lo', 0.26, 3.0, (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, 1.5), seg=3, cap=False))
    for sx in (-1, 1):
        xx = DX + sx * (DW / 2 - 0.3)
        rail_lo((xx, Y0 + 2.6), (xx, Y0 + 2.6 + RL), 3)
    rail_lo((DX - DW / 2 + 0.3, Y1 - 0.3), (DX + DW / 2 - 0.3, Y1 - 0.3), 2)
    # shore steps up to the bank (-Y)
    parts.append(L.steps('steps_shore', 5.0, 0.7, 0.45, 4, (DX + 1.5, Y0 - 1.4, 0.2), DECK))
    lo.append(L.place(kit.prism_from_outline('steps_lo', [(-12.4, 0.0), (-12.4, 0.75), (-9.4, 2.1), (-9.4, 0.0)], 5.2, axis='X'), (DX + 1.5, 0, 0)))
    # ticket kiosk at the shore end: blue roof, a painted sign
    KX, KY = DX - 2.4, Y0 + 2.0
    parts.append(box('kiosk', (4.2, 3.4, 4.2), (KX, KY, 1.5), WHITE, base=True))
    parts.append(box('kiosk_win', (2.4, 0.2, 1.4), (KX, KY - 1.75, 3.4), M['black'], base=True))
    parts.append(box('kiosk_sill', (2.8, 0.6, 0.2), (KX, KY - 1.9, 3.2), BLUE, base=True))
    parts.append(box('kiosk_roof', (5.0, 4.4, 0.4), (KX, KY, 5.7), BLUE, base=True))
    parts.append(L.sign_panel('kiosk_sign', 'BOATING', 4.6, 1.3, (KX, KY - 1.6, 6.75), fg='#ffffff', bg='#2a5cb8', px=256))
    lo.append(L.shell_box('kiosk_lo', (5.1, 4.5, 4.6), (KX, KY, 1.5)))
    lo.append(L.shell_box('kiosk_sign_lo', (4.8, 0.6, 1.4), (KX, KY - 1.6, 6.05)))
    # a yellow pedal boat moored alongside (+X side)
    boat = [ellipse_loft('boat', [(0, -2.6, 0.0, 1.0, 0.5), (0, -1.6, 0.2, 1.6, 1.0), (0, 1.4, 0.2, 1.6, 1.0), (0, 2.4, 0.0, 1.0, 0.5)], WHITE, seg=6),
            box('boat_hull', (3.0, 4.4, 0.5), (0, 0, 0.6), YEL, base=True),
            box('boat_seat', (2.4, 1.0, 0.9), (0, 0.4, 1.1), BLUE, base=True),
            box('boat_canopy', (2.8, 2.0, 0.2), (0, 0.6, 2.7), YEL, base=True)]
    for sx in (-1, 1):
        boat.append(box('boat_strut', (0.15, 0.15, 1.6), (sx * 1.25, 0.6, 1.1), WHITE, base=True))
    parts.append(L.place(kit.join(boat, 'boat'), (5.0, 6.0, 0.0)))
    lo.append(L.shell_box('boat_lo', (3.3, 5.2, 1.6), (5.0, 6.0, 0.0)))
    lo.append(L.shell_box('boat_top_lo', (2.9, 2.1, 1.3), (5.0, 6.6, 1.6)))
    trim(lo)
    report(lo)
    for o in L.finish_proxy(A, parts, lo=lo, size=256, ao_samples=48, ao_strength=0.6):
        kit.smooth(o, 80)
    L.shots(A, az=-35, el=22)


# =========================================================================== 4. Lumbini musical fountain
def _oval_ring(name, rx0, ry0, rx1, ry1, z0, z1, mat, seg=24):
    """a closed oval band (rim): outer ellipse (rx0, ry0), inner (rx1, ry1)"""
    bm = bmesh.new()
    def ring(rx, ry, z):
        return [bm.verts.new((rx * math.cos(2 * PI * i / seg), ry * math.sin(2 * PI * i / seg), z)) for i in range(seg)]
    ob, ot, it, ib = ring(rx0, ry0, z0), ring(rx0, ry0, z1), ring(rx1, ry1, z1), ring(rx1, ry1, z0)
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((it[i], it[j], ib[j], ib[i]))
    o = kit.obj_from_bm(bm, name, mat)
    return o


def _oval_disc(name, rx, ry, z, mat, seg=24):
    bm = bmesh.new()
    vs = [bm.verts.new((rx * math.cos(2 * PI * i / seg), ry * math.sin(2 * PI * i / seg), z)) for i in range(seg)]
    bm.faces.new(vs)
    return kit.obj_from_bm(bm, name, mat)


@kit.asset('musical_fountain', 'landmark', draw='musical_fountain', face='s', footprint=[26, 18], height=9.0, fit='footprint')
def build_musical_fountain(A):
    """Lumbini Park musical fountain: an oval granite-rimmed basin of blue water with nozzle
    manifolds; the frozen water columns (tall centre jet, side jets, leaning fan jets) are
    @night lamp materials in three colours, so the show glows blue / pink / gold after dark."""
    M = _nometal(L.mats())
    RIM = kit.material('granite_grey', 'fountain_rim', base='#c9c2b4', var=0.05, grain=0.03, specks=0.15, scale=0.8)
    WATER = L.paint('#2f7f98', 'basin_water', var=0.05, grain=0.0, grime=0.0, streaks=0.0)
    PIPE = L.paint('#3d4a52', 'nozzle_pipe', var=0.0, grain=0.0, grime=0.0, streaks=0.0)
    FOAM = L.paint('#dff1f7', 'jet_foam', var=0.0, grain=0.0, grime=0.0, streaks=0.0)
    parts, lo = [], []
    parts.append(_oval_ring('rim', 13.0, 9.0, 11.6, 7.6, 0.0, 1.3, RIM, seg=32))
    parts.append(_oval_ring('rim_cap', 13.3, 9.3, 12.6, 8.6, 1.3, 1.6, RIM, seg=32))
    parts.append(_oval_disc('water', 11.7, 7.7, 0.85, WATER, seg=32))
    for y in (-3.6, 0.0, 3.6):
        parts.append(box('pipe', (18.0 if y else 20.0, 0.5, 0.2), (0, y, 0.86), PIPE, base=True))
    for (x, r) in ((0, 1.7), (-4.5, 1.2), (4.5, 1.2), (-8.5, 1.1), (8.5, 1.1)):
        parts.append(_oval_disc('foam', r, r, 0.88, FOAM, seg=12))
    for y in (-5.6, 5.6):
        for x in (-10.0, -6.5, -3.0, 0.0, 3.0, 6.5, 10.0):
            yy = y * 0.55 if abs(x) > 9.5 else y
            parts.append(box('uw_lamp', (0.7, 0.7, 0.05), (x, yy, 0.86), FOAM, base=True))
    lo.append(_oval_ring('rim_lo', 13.35, 9.35, 11.55, 7.55, 0.0, 1.62, None, seg=12))
    lo.append(_oval_disc('water_lo', 11.6, 7.6, 0.9, None, seg=12))
    # the jets: glowing water columns (three colours), kept unbaked
    BLUE, PINK, GOLD = L.lamp('#c4e8ff', 'jet_blue'), L.lamp('#ffc4ea', 'jet_pink'), L.lamp('#ffe9a8', 'jet_gold')
    jets = []
    for (x, h, r, m) in ((0, 9.0, 0.8, BLUE), (-4.5, 6.5, 0.6, PINK), (4.5, 6.5, 0.6, PINK), (-8.5, 4.2, 0.55, GOLD), (8.5, 4.2, 0.55, GOLD)):
        jets.append(cylinder('jet', r, h, (x, 0, 0.85), seg=4, mat=m, r2=0.08, cap=False))
    for y in (-3.6, 3.6):
        for i, x in enumerate((-7.0, -2.4, 2.4, 7.0)):
            j = cylinder('fan', 0.35, 3.6, (0, 0, 0), seg=3, mat=BLUE if i % 2 else GOLD, r2=0.05, cap=False)
            j.rotation_euler = (math.copysign(0.35, -y), 0, 0)
            j.location = (x, y, 0.85)
            kit.apply_transform(j)
            jets.append(j)
    keep = [kit.join(jets, 'jets')]
    report(lo)
    L.finish_proxy(A, parts, lo=lo, keep=keep, size=256, ao_samples=48, ao_strength=0.6)
    L.shots(A, az=-30, el=24)


# =========================================================================== 5. NTR Ghat (memorial in NTR Gardens)
def _tusk(name, base, top, height, r0, r1, mat, n=7, seg=8, bow=0.0):
    """a curved tapering ivory tusk from base (x, y, z) rising and curling in to top (x, y)"""
    bx, by, bz = base
    tx, ty = top
    rings = []
    for i in range(n):
        t = i / (n - 1)
        h = 1 - t ** 1.7            # horizontal fraction: stays out, then sweeps in near the top
        x = tx + (bx - tx) * h
        y = ty + (by - ty) * h
        z = bz + height * math.sin(t * PI / 2) ** 0.85
        rings.append((x, y, z, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t))
    return ellipse_loft(name, rings, mat, seg=seg)


def build_ntr_memorial(A):
    M = _nometal(L.mats())
    PAVE = kit.material('granite_grey', 'ntr_paving', base='#cfc7b8', specks=0.3, grime=0.4, scale=0.9)
    BLACK = kit.material('granite_grey', 'ntr_black_granite', base='#2a2826', specks=0.25, rough=0.3, grime=0.2, scale=1.0)
    IVORY = kit.material('whitewash', 'ntr_ivory', base='#f2ebdc', var=0.04, grain=0.03, grime=0.3, streaks=0.1, scale=0.4)
    LAWN = kit.material('wood_green', 'ntr_lawn', base='#4f8f3a', chips=0.0, grain=0.15, var=0.15, rough=0.9, grime=0.2, scale=0.6)
    HEDGE = L.paint('#2f6a2c', 'ntr_hedge')
    FLOW = [L.paint(c, 'ntr_flower_' + c.strip('#')) for c in ('#e8402a', '#f2b030', '#e85aa0')]
    parts = []
    parts.append(box('terrace', (40.0, 28.0, 0.6), (0, 0, 0), PAVE, base=True))
    # lawns either side of the central walk, hedges and flower beds
    for s in (-1, 1):
        parts.append(box('lawn', (12.0, 24.0, 0.3), (s * 13.0, 0, 0.6), LAWN, base=True))
        parts.append(box('hedge', (12.0, 0.9, 1.0), (s * 13.0, -12.4, 0.6), HEDGE, base=True))
        parts.append(box('hedge', (12.0, 0.9, 1.0), (s * 13.0, 12.4, 0.6), HEDGE, base=True))
        parts.append(box('hedge', (0.9, 24.0, 1.0), (s * 19.4, 0, 0.6), HEDGE, base=True))
        for k, y in enumerate((-7.0, 0.0, 7.0)):
            parts.append(box('bed', (6.0, 2.4, 0.6), (s * 13.0, y, 0.9), FLOW[(k + (s > 0)) % 3], base=True))
    # reflecting pool along the front walk
    parts.append(box('pool_rim', (7.0, 11.0, 0.9), (0, -7.6, 0.6), BLACK, base=True))
    parts.append(box('pool', (6.0, 10.0, 0.1), (0, -7.6, 1.42), M['water'], base=True))
    # the samadhi: stepped octagonal platform, black granite tomb slab with a bed of flowers
    parts.append(cylinder('plat1', 7.2, 1.4, (0, 4.0, 0.6), seg=8, mat=PAVE))
    parts.append(cylinder('plat2', 5.8, 1.2, (0, 4.0, 2.0), seg=8, mat=BLACK))
    parts.append(L.steps('plat_steps', 4.0, 0.7, 0.45, 3, (0, -2.6, 0.6), PAVE))
    parts.append(box('samadhi', (3.4, 5.0, 1.4), (0, 4.0, 3.2), BLACK, base=True))
    parts.append(box('flowers', (2.8, 4.2, 0.35), (0, 4.0, 4.6), FLOW[1], base=True))
    # four great ivory tusks rising from the platform corners and meeting over the samadhi
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(_tusk('tusk', (sx * 5.4, 4.0 + sy * 4.6, 2.0), (sx * 0.6, 4.0 + sy * 0.5), 22.0, 1.15, 0.3, IVORY, n=8, seg=8))
            parts.append(cylinder('tusk_sock', 1.5, 1.4, (sx * 5.4, 4.0 + sy * 4.6, 2.0), seg=8, mat=M['gold'], r2=1.25))
    parts.append(lathe('finial', [(0.9, 23.2), (1.3, 23.9), (0.6, 24.8), (0.9, 25.6), (0.3, 26.6), (0.0, 27.2)], seg=8, mat=M['gold'], loc=(0, 4.0, 0)))
    # garden lamp posts at the front corners of the walk
    for s in (-1, 1):
        post, heads = L.lamp_post('ntr_lamp', 8.0, M, loc=(s * 5.2, -12.0, 0.6), arms=1)
        parts += [post, heads]
    # two trees at the back corners
    for s in (-1, 1):
        parts.append(cylinder('trunk', 0.6, 6.0, (s * 16.5, 10.0, 0.6), seg=5, mat=M['wood']))
        parts.append(boulder('crown', 4.2, (s * 16.5, 10.0, 8.4), L.paint('#3f7f34', 'ntr_leaves'), seed=11 + s, sq=0.8, sub=1))
    report(parts)
    L.finish(A, parts, size=512)
    L.shots(A, az=-30, el=18)


# parked (owner must-have, returns with lazy per-GLB loading): buildable only with NOSTALGIA_PARKED=1, never packed
if os.environ.get('NOSTALGIA_PARKED') == '1':
    kit.asset('ntr_memorial', 'landmark', draw='ntr_memorial', face='s', footprint=[40, 28], height=27.0, fit='footprint', floodlit=True)(build_ntr_memorial)


# =========================================================================== 6. Birla Mandir (Naubat Pahad)
def _plan(a, d1, d2, cx=0.0, cy=0.0):
    """pancha-ratha square plan (Odia rekha deul): corner kanikas, anurathas projecting d1, the
    central raha projecting d2; CCW outline (36 points)"""
    side = [(-a, -a), (-0.66 * a, -a), (-0.66 * a, -a - d1), (-0.3 * a, -a - d1), (-0.3 * a, -a - d2),
            (0.3 * a, -a - d2), (0.3 * a, -a - d1), (0.66 * a, -a - d1), (0.66 * a, -a)]
    out = []
    for k in range(4):
        c, s = math.cos(k * PI / 2), math.sin(k * PI / 2)
        out += [(cx + x * c - y * s, cy + x * s + y * c) for (x, y) in side]
    return out


def _plan_lo(a, d1, cx=0.0, cy=0.0):
    """shell plan of _plan: a chamfered square through the anurathas (8 points)"""
    side = [(-0.7 * a, -a - d1 * 0.9), (0.7 * a, -a - d1 * 0.9)]
    out = []
    for k in range(4):
        c, s = math.cos(k * PI / 2), math.sin(k * PI / 2)
        out += [(cx + x * c - y * s, cy + x * s + y * c) for (x, y) in side]
    return out


def _rings_loft(name, rings, mat=None, cap=True):
    """loft through stacked 2D outlines [(z, [(x, y)...])] of equal point counts (no bottom face)"""
    bm = bmesh.new()
    R = [[bm.verts.new((x, y, z)) for (x, y) in pts] for (z, pts) in rings]
    n = len(R[0])
    for j in range(len(R) - 1):
        for i in range(n):
            k = (i + 1) % n
            bm.faces.new((R[j][i], R[j][k], R[j + 1][k], R[j + 1][i]))
    if cap:
        bm.faces.new(R[-1])
    return _obj(bm, name, mat)


def _ribbed(name, prof, seg, rib, mat, loc=(0, 0, 0)):
    """lathe whose radius alternates by `rib` per segment (amalaka ribs, carved pillars)"""
    bm = bmesh.new()
    rings = []
    for (r, z) in prof:
        if r < 1e-4:
            rings.append([bm.verts.new((loc[0], loc[1], loc[2] + z))])
            continue
        rings.append([bm.verts.new((loc[0] + r * (1 - rib * (k % 2)) * math.cos(2 * PI * k / seg),
                                    loc[1] + r * (1 - rib * (k % 2)) * math.sin(2 * PI * k / seg), loc[2] + z)) for k in range(seg)])
    for j in range(len(rings) - 1):
        A, B = rings[j], rings[j + 1]
        for k in range(seg):
            if len(B) == 1:
                bm.faces.new((A[k], A[(k + 1) % seg], B[0]))
            elif len(A) == 1:
                bm.faces.new((A[0], B[(k + 1) % seg], B[k]))
            else:
                bm.faces.new((A[k], A[(k + 1) % seg], B[(k + 1) % seg], B[k]))
    return _obj(bm, name, mat)


def _rekha(name, cx, cy, z0, a0, hb, hg, M, courses=12, lo_rings=5, lo_seg=8):
    """an Odia rekha deul: pitha (base), bada (wall) with raha niches, the curvilinear ribbed
    gandi in horizontal courses with bhumi-amalakas on the corners, beki, ribbed amalaka and
    kalasha. Returns (hi parts, lo parts, top z)."""
    W, T, D = M['bm_w'], M['bm_t'], M['bm_d']
    d1, d2 = a0 * 0.1, a0 * 0.2
    hi, lo = [], []

    def prof(u):
        return 1.0 - 0.44 * u ** 1.7
    # pitha: two stepped mouldings
    hi.append(kit.extrude_polygon(name + '_pitha', _plan(a0 + 1.0, d1, d2, cx, cy), z0 - 1.6, z0 - 0.7, T))
    hi.append(kit.extrude_polygon(name + '_pitha2', _plan(a0 + 0.6, d1, d2, cx, cy), z0 - 0.7, z0, W))
    # bada: wall with a base band, a cornice and a recessed niche on each raha
    hi.append(kit.extrude_polygon(name + '_bada', _plan(a0, d1, d2, cx, cy), z0, z0 + hb, W))
    hi.append(kit.extrude_polygon(name + '_band', _plan(a0 + 0.25, d1, d2, cx, cy), z0 + hb * 0.12, z0 + hb * 0.2, T))
    hi.append(kit.extrude_polygon(name + '_band2', _plan(a0 + 0.3, d1, d2, cx, cy), z0 + hb * 0.55, z0 + hb * 0.6, T))
    hi.append(kit.extrude_polygon(name + '_corn', _plan(a0 + 0.45, d1, d2, cx, cy), z0 + hb - 0.9, z0 + hb, T))
    for k in range(4):
        c, s = math.cos(k * PI / 2), math.sin(k * PI / 2)
        r = a0 + d2
        nx, ny = cx + r * s, cy - r * c
        n = box(name + '_niche', (a0 * 0.34, 0.5, hb * 0.28), (0, 0, 0), D, base=True)
        fr = box(name + '_nfr', (a0 * 0.48, 0.4, hb * 0.36), (0, 0.15, 0), T, base=True)
        pr = kit.join([fr, n], name + '_niche')
        L.place(pr, (nx, ny, z0 + hb * 0.24), rz=k * PI / 2)
        hi.append(pr)
    # gandi courses
    zg = z0 + hb
    for k in range(courses):
        u0, u1 = k / courses, (k + 1) / courses
        s = prof((u0 + u1) / 2)
        za, zb = zg + hg * u0, zg + hg * u1
        hi.append(kit.extrude_polygon(name + '_c', _plan(a0 * s, d1 * s, d2 * s, cx, cy), za, zb - (zb - za) * 0.22, W))
        hi.append(kit.extrude_polygon(name + '_g', _plan(a0 * s * 0.97, d1 * s, d2 * s, cx, cy), zb - (zb - za) * 0.22, zb, D if k % 4 == 3 else T))
        if k % 4 == 3:   # bhumi-amalakas on the four kanikas
            for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                hi.append(_ribbed(name + '_ba', [(0.3, 0), (a0 * s * 0.24, 0.25), (a0 * s * 0.24, (zb - za) * 0.55), (0.3, (zb - za) * 0.8)], 12, 0.12, T,
                                  loc=(cx + sx * a0 * s * 0.84, cy + sy * a0 * s * 0.84, zb - (zb - za) * 0.4)))
    # raha rib: a raised spine up the middle of each face (the central ratha of the gandi)
    zt = zg + hg
    st = prof(1.0)
    # beki (neck), amalaka, kalasha
    ra = a0 * st
    top = [(ra * 0.82, zt), (ra * 0.62, zt + 0.5), (ra * 0.62, zt + 1.3), (ra * 0.95, zt + 1.6), (ra * 1.12, zt + 2.4), (ra * 1.12, zt + 3.0),
           (ra * 0.95, zt + 3.8), (ra * 0.5, zt + 4.2), (0.0, zt + 4.25)]
    hi.append(_ribbed(name + '_amalaka', top, 32, 0.07, W, loc=(cx, cy, 0)))
    kal = [(ra * 0.45, zt + 4.2), (ra * 0.5, zt + 4.9), (ra * 0.42, zt + 5.6), (ra * 0.22, zt + 6.2), (ra * 0.3, zt + 6.6), (ra * 0.08, zt + 7.6), (0.0, zt + 8.6)]
    hi.append(lathe(name + '_kalasha', kal, seg=16, mat=M['bm_gold'], loc=(cx, cy, 0)))
    # ---- shell
    rings = [(z0 - 1.6, _plan_lo(a0 + 1.0, d1, cx, cy)), (z0 + hb, _plan_lo(a0 + 0.2, d1, cx, cy))]
    for i in range(1, lo_rings + 1):
        u = i / lo_rings
        s = prof(min(1.0, max(0.0, u)))
        rings.append((zg + hg * u, _plan_lo(a0 * s, d1 * s, cx, cy)))
    lo.append(_rings_loft(name + '_lo', rings, cap=False))
    tp = [(ra * 0.8, zt - 0.2), (ra * 1.12, zt + 1.6), (ra * 1.12, zt + 3.2), (ra * 0.45, zt + 4.4), (ra * 0.3, zt + 6.2), (0.0, zt + 8.6)]
    if lo_seg < 8:
        tp = [(ra * 0.8, zt - 0.2), (ra * 1.15, zt + 1.8), (ra * 1.1, zt + 3.3), (ra * 0.35, zt + 5.0), (0.0, zt + 8.6)]
    lo.append(lathe(name + '_lo_am', tp, seg=lo_seg, loc=(cx, cy, 0), close_bottom=False))
    return hi, lo, zt + 8.6


@kit.asset('birla_planetarium', 'landmark', draw='birla_planetarium', face='s', footprint=[58, 58], height=54.0, fit='footprint', floodlit=True)
def build_birla_planetarium(A):
    """B.M. Birla Planetarium (1985) on Naval Pahad: the big white hemispherical dome on a
    ribbed drum, the entrance portico with the blue BIRLA PLANETARIUM board, and the science
    museum block behind."""
    M = L.mats()
    WH = kit.material('whitewash', 'pl_white', base='#f2f1ec', var=0.02, grain=0.01, grime=0.15, streaks=0.1, scale=0.5)
    TR = L.paint('#fbfbf8', 'pl_trim', var=0.0, grain=0.0, grime=0.05, streaks=0.0)
    GL = L.paint('#3a4650', 'pl_glass', var=0.0, grain=0.0, grime=0.0, streaks=0.0)
    PAVE = L.paint('#b9b4aa', 'pl_pave', var=0.03, grain=0.0, grime=0.1, streaks=0.0)
    hi, lo = [], []
    DY, RD, HD = -3.0, 19.0, 14.0
    hi.append(box('plinth', (58, 58, 0.8), (0, 0, 0), PAVE, base=True))
    lo.append(L.shell_box('plinth_lo', (58.2, 58.2, 0.85), (0, 0, 0)))
    # drum with pilasters and a band of dark windows, the cornice, the dome, a small lantern
    hi.append(cylinder('drum', RD, HD, (0, DY, 0.8), seg=48, mat=WH))
    for i in range(24):
        a = 2 * PI * i / 24
        p = box('pil', (1.2, 0.6, HD - 1.0), (0, 0, 0), TR, base=True)
        hi.append(L.place(p, ((RD + 0.2) * math.cos(a), DY + (RD + 0.2) * math.sin(a), 0.8), rz=a + PI / 2))
    hi.append(cylinder('drum_win', RD + 0.05, 2.0, (0, DY, 8.4), seg=48, mat=GL))
    hi.append(cylinder('cornice', RD + 1.0, 1.0, (0, DY, HD + 0.8), seg=48, mat=TR))
    zd = HD + 1.8
    prof = [(RD * math.cos(a), zd + RD * 0.95 * math.sin(a)) for a in [PI / 2 * i / 16 for i in range(16)]] + [(0.0, zd + RD * 0.95)]
    hi.append(lathe('dome', prof, seg=48, mat=WH, loc=(0, DY, 0)))
    zt = zd + RD * 0.95
    hi.append(cylinder('lantern', 1.6, 1.6, (0, DY, zt - 0.4), seg=16, mat=TR))
    hi.append(lathe('finial', [(0.6, zt + 1.2), (0.9, zt + 1.8), (0.15, zt + 3.2), (0.0, zt + 3.6)], seg=12, mat=M['gold'], loc=(0, DY, 0)))
    lp = [(RD + 0.25, 0.8), (RD + 0.25, HD + 0.8), (RD + 1.1, HD + 0.8), (RD + 1.1, zd)]
    for i in range(8):
        a = PI / 2 * i / 8.6
        lp.append((RD * math.cos(a) + 0.2, zd + RD * 0.95 * math.sin(a) + 0.1))
    lp += [(1.8, zt + 0.1), (1.7, zt + 1.3), (0.0, zt + 3.6)]
    lo.append(lathe('dome_lo', lp, seg=14, loc=(0, DY, 0), close_bottom=False))
    # science museum block behind
    BY0, BY1 = 12.0, 28.5
    hi.append(box('block', (54, BY1 - BY0, 22.0), (0, (BY0 + BY1) / 2, 0.8), WH, base=True))
    for z in (4.0, 11.0, 18.0):
        hi.append(box('block_win', (50, BY1 - BY0 + 0.2, 2.6), (0, (BY0 + BY1) / 2, z), GL, base=True))
    hi.append(box('block_par', (54.6, BY1 - BY0 + 0.6, 1.2), (0, (BY0 + BY1) / 2, 22.8), TR, base=True))
    lo.append(L.shell_box('block_lo', (54.8, BY1 - BY0 + 0.8, 23.3), (0, (BY0 + BY1) / 2, 0.8)))
    # entrance portico in front of the drum, with the name board
    PY0, PY1 = -28.0, -19.0
    hi.append(box('portico', (20, PY1 - PY0, 0.9), (0, (PY0 + PY1) / 2, 9.0), TR, base=True))
    for x in (-9.0, -3.0, 3.0, 9.0):
        hi.append(box('pcol', (1.0, 1.0, 8.2), (x, PY0 + 0.8, 0.8), TR, base=True))
    hi.append(box('pback', (14, 1.0, 8.2), (0, PY1 + 0.3, 0.8), GL, base=True))
    hi.append(L.sign_panel('pl_sign', 'BIRLA PLANETARIUM', 18.0, 2.6, (0, PY0 - 0.2, 11.3), fg='#ffffff', bg='#1d4e8a', px=512))
    lo.append(L.shell_box('portico_lo', (20.4, PY1 - PY0 + 0.8, 9.3), (0, (PY0 + PY1) / 2, 0.8)))
    lo.append(L.shell_box('sign_lo', (18.4, 0.9, 2.9), (0, PY0 - 0.2, 9.95)))
    trim(lo)
    report(lo)
    for o in L.finish_proxy(A, hi, lo=lo, size=256, ao_samples=48, ao_strength=0.6):
        kit.smooth(o, 80)
    L.shots(A, az=-30, el=12)


def _stairs2(name, w, run, rise, n, loc, tread, riser):
    """kit.stairs with a darker riser plate on every step (reads as steps once baked)"""
    x, y, z = loc
    p = [kit.stairs(name, w, run, rise, n, (x, y, z), tread)]
    for i in range(n):
        yf = y - run * n / 2 + run * i
        p.append(box(name + '_r', (w - 0.02, 0.08, rise * 0.8), (x, yf - 0.03, z + rise * i), riser, base=True))
    return kit.join(p, name)


@kit.asset('birla_mandir', 'hero_landmark', draw='birla_mandir', face='s', footprint=[64, 56], height=78.0, fit='footprint', floodlit=True)
def build_birla_mandir(A):
    """Birla Mandir (Sri Venkateswara, 1976) on Naubat Pahad: all white Rajasthani marble on a
    rocky hillock. Broad flights of steps up the front to a Dravidian-style entrance gopuram on
    the terrace edge; behind it the pillared porch and the jagamohana (pidha roof), then the tall
    curvilinear Utkala rekha shikhara over the sanctum (amalaka + kalasha) dominating everything,
    with the two smaller shikharas of the Padmavati and Andal shrines either side. No bells."""
    M = L.mats()
    M['bm_w'] = kit.material('whitewash', 'bm_marble', base='#f8f6f1', rough=0.4, var=0.015, grain=0.01, grime=0.06, streaks=0.03, dirt='#cfc9bd', scale=0.5)
    M['bm_t'] = kit.material('whitewash', 'bm_marble_trim', base='#f0ece4', rough=0.4, var=0.015, grain=0.01, grime=0.06, streaks=0.02, dirt='#c8c1b4', scale=0.5)
    M['bm_d'] = L.paint('#d6d0c4', 'bm_marble_shade', var=0.0, grain=0.0, grime=0.0, streaks=0.0)
    M['bm_gold'] = L.paint('#d7b45a', 'bm_gold', var=0.0, grain=0.0, grime=0.0, streaks=0.0)
    ROCK = kit.material('granite_grey', 'naubat_rock', base='#7e756b', var=0.05, grain=0.0, specks=0.0, grime=0.2, dirt='#6a6259', scale=0.15)
    SCRUB = L.paint('#6d7a45', 'naubat_scrub', var=0.05, grain=0.0, grime=0.0, streaks=0.0)
    PAVE = kit.material('whitewash', 'bm_pave', base='#e6e2d8', rough=0.5, var=0.02, grain=0.01, grime=0.1, streaks=0.0, scale=0.4)
    DOOR = L.paint('#5e4128', 'bm_door', var=0.0, grain=0.0, grime=0.0, streaks=0.0)
    W, T, D = M['bm_w'], M['bm_t'], M['bm_d']
    hi, lo = [], []
    ZT = 18.0          # terrace level
    TX, TY0, TY1 = 29.5, -10.0, 27.4
    SW = 12.0          # stair width
    # stair profile (y, z): two flights and a landing from the road (y = -28.6) to the terrace
    RAMP = [(-28.6, 0.0), (-28.6, 0.6), (-20.4, 8.4), (-18.0, 8.4), (-10.0, ZT)]
    # ---------------- Naubat Pahad: the rocky hillock with a gorge for the stairs
    hill = rock_mound('naubat', 31.5, 27.8, ZT - 0.5, ROCK, seed=11, na=24,
                      prof=[(1.0, None), (1.0, 0.0), (0.98, 0.2), (0.94, 0.5), (0.9, 0.8), (0.82, 1.0)], rough=0.14, zj=0.25, z0=-1.0)
    gorge = kit.prism_from_outline('gorge', [(-40.0, -0.4), (-28.6, -0.4), (-20.4, 7.8), (-18.0, 7.8), (-10.0, ZT - 0.6), (-10.0, 60.0), (-40.0, 60.0)], SW + 3.0, axis='X')
    kit.boolean(hill, gorge)
    rocks = []
    rnd = random.Random(5)
    for i in range(18):
        a = 2 * PI * i / 18 + rnd.random() * 0.25
        if 4.3 < a < 5.1:
            continue        # keep the stair approach clear
        rr = 0.9 + 0.08 * rnd.random()
        rocks.append(boulder('nb_boulder', 2.4 + 1.8 * rnd.random(), (30.0 * rr * math.cos(a), 26.5 * rr * math.sin(a), 0.5 + 6.0 * rnd.random()), ROCK, seed=20 + i, sq=0.6, sub=1))
    for i in range(14):
        a = 2 * PI * rnd.random()
        if 4.2 < a < 5.2:
            continue
        rocks.append(boulder('nb_scrub', 1.6 + rnd.random(), (29.0 * math.cos(a), 25.6 * math.sin(a), 2.0 + 9.0 * rnd.random()), SCRUB, seed=40 + i, sq=0.5, sub=1))
    hill_lo = hill.copy()
    hill_lo.data = hill.data.copy()
    kit.link(hill_lo, A.coll)
    hill_lo.data.materials.clear()
    hill_lo.name = 'naubat_lo'
    L._auto_lo(hill_lo, 150)
    bm = bmesh.new()      # drop the shell faces hidden inside the terrace block
    bm.from_mesh(hill_lo.data)
    dead = [f for f in bm.faces if all(abs(v.co.x) < TX - 0.5 and TY0 + 0.5 < v.co.y < TY1 - 0.5 and v.co.z > 8.5 for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(hill_lo.data)
    bm.free()
    hi.append(kit.join([hill] + rocks, 'naubat_hi'))
    lo.append(hill_lo)
    # ---------------- terrace: retaining wall, marble paving, solid carved balustrade on the edge
    hi.append(box('terrace_wall', (2 * TX, TY1 - TY0, ZT - 8.0), (0, (TY0 + TY1) / 2, 8.0), T, base=True))
    hi.append(box('terrace_pave', (2 * TX - 0.4, TY1 - TY0 - 0.4, 0.3), (0, (TY0 + TY1) / 2, ZT - 0.15), PAVE, base=True))
    hi.append(box('terrace_band', (2 * TX + 0.5, TY1 - TY0 + 0.5, 0.6), (0, (TY0 + TY1) / 2, ZT - 0.9), W, base=True))
    BH = 1.9

    def balus(x0, y0, x1, y1):
        ln = math.hypot(x1 - x0, y1 - y0)
        rz = math.atan2(y1 - y0, x1 - x0)
        p = [box('bal_wall', (ln, 0.6, 1.4), (0, 0, 0), W, base=True), box('bal_cap', (ln + 0.3, 0.9, 0.35), (0, 0, 1.4), T, base=True)]
        n = max(2, int(ln / 2.4))
        for i in range(n + 1):
            p.append(box('bal_post', (0.7, 0.9, BH), (-ln / 2 + ln * i / n, 0, 0), T, base=True))
        for i in range(n):
            p.append(box('bal_panel', (ln / n - 1.3, 0.75, 0.8), (-ln / 2 + ln * (i + 0.5) / n, 0, 0.3), D, base=True))
        hi.append(L.place(kit.join(p, 'balustrade'), ((x0 + x1) / 2, (y0 + y1) / 2, ZT), rz=rz))
    e = 0.3
    balus(-TX + e, TY0 + e, -7.6, TY0 + e)
    balus(7.6, TY0 + e, TX - e, TY0 + e)
    balus(TX - e, TY0 + e, TX - e, TY1 - e)
    balus(-TX + e, TY0 + e, -TX + e, TY1 - e)
    balus(-TX + e, TY1 - e, TX - e, TY1 - e)
    # shell: the terrace block up to the balustrade top (the courtyard paving bakes onto its top)
    lo.append(L.shell_box('terrace_lo', (2 * TX + 0.6, TY1 - TY0 + 0.6, ZT + BH - 8.0), (0, (TY0 + TY1) / 2, 8.0)))
    # ---------------- the broad flights of steps up the front, with a landing and marble parapets
    n1, n2 = 13, 14
    RISER = L.paint('#a59e92', 'bm_riser', var=0.0, grain=0.0, grime=0.0, streaks=0.0)
    hi.append(_stairs2('steps1', SW, 8.2 / n1, 7.8 / n1, n1, (0, -24.5, 0.6), W, RISER))
    hi.append(box('steps1_fill', (SW, 8.2, 0.6), (0, -24.5, 0.0), T, base=True))
    hi.append(box('landing', (SW, 2.6, 8.4), (0, -19.2, 0.0), W, base=True))
    hi.append(box('landing_pave', (SW + 0.01, 2.6, 0.2), (0, -19.2, 8.3), PAVE, base=True))
    hi.append(box('steps2_fill', (SW, 8.2, 8.4), (0, -14.0, 0.0), T, base=True))
    hi.append(_stairs2('steps2', SW, 8.0 / n2, (ZT - 8.4) / n2, n2, (0, -14.0, 8.4), W, RISER))
    par_ol = [(-28.9, 0.0)] + [(y, z + 1.2) for (y, z) in RAMP[1:]] + [(-10.0, 0.0)]
    par_ol[1] = (-28.9, 1.8)
    for s in (-1, 1):
        par = kit.prism_from_outline('stair_par', par_ol, 0.9, axis='X', mat=T)
        hi.append(L.place(par, (s * (SW / 2 + 0.45), 0, 0)))
        for (yy, zz) in ((-28.5, 0.0), (-19.2, 8.4)):
            hi.append(box('stair_post', (1.3, 1.3, 2.8), (s * (SW / 2 + 0.45), yy, zz), T, base=True))
            hi.append(lathe('stair_lamp', [(0.4, 0), (0.55, 0.5), (0.3, 1.2), (0.0, 1.4)], seg=8, mat=T, loc=(s * (SW / 2 + 0.45), yy, zz + 2.8)))
    lo_ol = [(-29.0, 0.0), (-29.0, 1.9), (-20.4, 9.5), (-18.0, 9.5), (-10.0, ZT + 1.2), (-10.0, 0.0)]
    lo.append(kit.prism_from_outline('steps_lo', lo_ol, SW + 2.2, axis='X'))
    # ---------------- entrance gopuram (Dravidian-style gateway tower) on the terrace edge
    GY = -6.5      # centre (front face at y = -10)
    GW, GD = 15.0, 7.0
    gp = [box('gp_base', (GW, GD, 9.0), (0, GY, ZT), W, base=True),
          box('gp_plinth', (GW + 0.8, GD + 0.8, 1.0), (0, GY, ZT), T, base=True),
          box('gp_cornice', (GW + 1.0, GD + 1.0, 0.8), (0, GY, ZT + 9.0), T, base=True)]
    cut = box('gp_door_cut', (4.6, 2.4, 7.0), (0, GY - GD / 2, ZT + 1.0), None, base=True)
    kit.boolean(gp[0], cut)
    gp.append(box('gp_door', (4.6, 0.3, 7.0), (0, GY - GD / 2 + 1.1, ZT + 1.0), DOOR, base=True))
    fr = box('gp_door_frame', (6.0, 0.4, 8.2), (0, GY - GD / 2 - 0.15, ZT + 0.95), T, base=True)
    kit.boolean(fr, box('gp_door_cut2', (4.6, 1.0, 7.0), (0, GY - GD / 2 - 0.15, ZT + 1.0), None, base=True))
    gp.append(fr)
    for x in (-6.4, -4.2, 4.2, 6.4):
        gp.append(box('gp_pil', (0.7, 0.4, 7.6), (x, GY - GD / 2 - 0.1, ZT + 1.0), T, base=True))
    for x in (-5.3, 5.3):
        gp.append(box('gp_nich', (1.2, 0.2, 3.0), (x, GY - GD / 2 - 0.05, ZT + 3.2), D, base=True))
    ZG = ZT + 9.8
    NT, TH = 5, 3.0
    for i in range(NT):
        w, d, z = GW - 1.0 - 2.0 * i, GD - 0.8 - 0.7 * i, ZG + TH * i
        gp.append(box('gp_tier', (w, d, TH - 0.6), (0, GY, z), W, base=True))
        gp.append(box('gp_tcor', (w + 0.6, d + 0.6, 0.6), (0, GY, z + TH - 0.6), T, base=True))
        nk = max(3, int(w / 2.2))
        for j in range(nk):
            x = -w / 2 + 0.7 + (w - 1.4) * j / (nk - 1)
            for yy in (GY - d / 2 - 0.05, GY + d / 2 + 0.05):
                gp.append(box('gp_kuta', (0.9, 0.5, 1.6), (x, yy, z + 0.3), D if j % 2 else T, base=True))
    zs = ZG + TH * NT
    vault = [(-1.7, 0.0), (1.7, 0.0), (1.8, 1.0), (1.4, 2.2), (0.6, 3.0), (0.0, 3.2), (-0.6, 3.0), (-1.4, 2.2), (-1.8, 1.0)]
    sh = kit.prism_from_outline('gp_shala', vault, 6.4, axis='X', mat=W)
    gp.append(L.place(sh, (0, GY, zs)))
    for x in (-2.4, -1.2, 0.0, 1.2, 2.4):
        gp.append(lathe('gp_kal', [(0.32, 0), (0.45, 0.4), (0.25, 0.9), (0.08, 1.6), (0.0, 1.8)], seg=8, mat=M['bm_gold'], loc=(x, GY, zs + 3.05)))
    hi += gp
    tw, td = GW - 1.0 - 2.0 * (NT - 1), GD - 0.8 - 0.7 * (NT - 1)
    lo.append(L.shell_box('gp_lo_base', (GW + 1.0, GD + 1.0, 9.8), (0, GY, ZT)))
    lo.append(_rings_loft('gp_lo_tiers', [(ZG, [(-GW / 2 + 0.2, GY - GD / 2 + 0.2), (GW / 2 - 0.2, GY - GD / 2 + 0.2), (GW / 2 - 0.2, GY + GD / 2 - 0.2), (-GW / 2 + 0.2, GY + GD / 2 - 0.2)]),
                                          (zs, [(-tw / 2 - 0.3, GY - td / 2 - 0.3), (tw / 2 + 0.3, GY - td / 2 - 0.3), (tw / 2 + 0.3, GY + td / 2 + 0.3), (-tw / 2 - 0.3, GY + td / 2 + 0.3)])], cap=False))
    lsh = kit.prism_from_outline('gp_lo_shala', [(-1.9, 0.0), (1.9, 0.0), (1.6, 2.0), (0.0, 4.6), (-1.6, 2.0)], 6.8, axis='X')
    lo.append(L.place(lsh, (0, GY, zs - 0.05)))
    # ---------------- porch (carved pillars) + jagamohana with its stepped pidha roof
    ZB = ZT + 2.0
    JY0, JY1 = 3.0, 11.0
    JC = (JY0 + JY1) / 2
    hi.append(box('jm_pitha', (21.6, JY1 - JY0 + 0.6, 2.0), (0, JC, ZT), T, base=True))
    hi.append(box('jm_wall', (20.0, JY1 - JY0, 9.0), (0, JC, ZB), W, base=True))
    for zz, hh in ((ZB + 1.0, 0.6), (ZB + 5.4, 0.4), (ZB + 8.2, 0.8)):
        hi.append(box('jm_band', (20.6, JY1 - JY0 + 0.6, hh), (0, JC, zz), T, base=True))
    for sx in (-1, 1):
        for yy in (JC - 2.0, JC + 2.0):
            hi.append(box('jm_win', (0.4, 2.0, 3.8), (sx * 10.05, yy, ZB + 2.2), D, base=True))
            hi.append(box('jm_winf', (0.3, 2.8, 4.6), (sx * 10.0, yy, ZB + 1.8), T, base=True))
    zp = ZB + 9.0
    for i in range(4):
        w, d = 21.0 - 2.6 * i, (JY1 - JY0 + 1.0) - 1.2 * i
        hi.append(box('jm_pidha', (w, d, 1.6), (0, JC, zp + 2.2 * i), W, base=True))
        hi.append(box('jm_pidha_g', (w - 1.0, d - 1.0, 0.6), (0, JC, zp + 2.2 * i + 1.6), D, base=True))
    zc = zp + 2.2 * 4
    hi.append(_ribbed('jm_crown', [(3.6, zc), (4.0, zc + 0.7), (3.4, zc + 2.1), (2.3, zc + 3.2), (1.8, zc + 3.7), (2.6, zc + 4.2), (2.7, zc + 4.8), (1.8, zc + 5.3), (0.0, zc + 5.4)], 24, 0.06, W, loc=(0, JC, 0)))
    hi.append(lathe('jm_kal', [(0.7, zc + 5.3), (0.9, zc + 5.9), (0.45, zc + 6.6), (0.12, zc + 7.5), (0.0, zc + 8.0)], seg=12, mat=M['bm_gold'], loc=(0, JC, 0)))
    lo.append(L.shell_box('jm_lo', (21.8, JY1 - JY0 + 0.8, zp - ZT + 0.2), (0, JC, ZT)))
    lo.append(_rings_loft('jm_lo_roof', [(zp + 0.2, [(-10.7, JY0 - 0.7), (10.7, JY0 - 0.7), (10.7, JY1 + 0.7), (-10.7, JY1 + 0.7)]),
                                         (zc, [(-6.3, JC - 2.1), (6.3, JC - 2.1), (6.3, JC + 2.1), (-6.3, JC + 2.1)])], cap=True))
    lo.append(lathe('jm_lo_crown', [(4.2, zc - 0.1), (3.2, zc + 2.6), (2.7, zc + 4.6), (0.0, zc + 8.0)], seg=8, loc=(0, JC, 0), close_bottom=False))
    # porch: carved pillars, deep chajja, parapet; jaali screens on the sides
    PY0 = -1.6
    PC = (PY0 + JY0) / 2
    hi.append(box('po_floor', (18.0, JY0 - PY0 + 0.4, 2.0), (0, PC, ZT), T, base=True))
    for i in range(6):
        x = -7.5 + 3.0 * i
        hi.append(_ribbed('po_pillar', [(0.75, 0), (0.75, 0.8), (0.5, 1.0), (0.5, 2.6), (0.7, 3.0), (0.5, 3.4), (0.45, 5.4), (0.75, 6.0), (0.95, 6.6), (0.95, 7.0)], 12, 0.15, W, loc=(x, PY0 + 0.6, ZB)))
    for sx in (-1, 1):
        hi.append(box('po_jaali', (0.5, JY0 - PY0, 7.0), (sx * 8.75, PC, ZB), D, base=True))
        hi.append(box('po_jaali_f', (0.6, JY0 - PY0, 0.5), (sx * 8.8, PC, ZB + 3.3), T, base=True))
    hi.append(box('po_door', (4.0, 0.3, 5.8), (0, JY0 - 0.05, ZB), DOOR, base=True))
    hi.append(box('po_door_f', (5.4, 0.3, 6.6), (0, JY0 - 0.02, ZB - 0.05), T, base=True))
    hi.append(box('po_roof', (19.4, JY0 - PY0 + 1.6, 0.9), (0, PC - 0.6, ZB + 7.0), T, base=True))
    hi.append(box('po_par', (18.6, JY0 - PY0 + 0.6, 1.4), (0, PC - 0.3, ZB + 7.9), W, base=True))
    lo.append(L.shell_box('po_lo', (19.6, JY0 - PY0 + 1.6, 11.3), (0, PC - 0.6, ZT)))
    # ---------------- the main rekha deul over the sanctum, and the two side shrines
    h1, l1, _ = _rekha('deul', 0.0, 18.6, ZT + 2.0, 7.6, 12.0, 32.0, M, courses=12, lo_rings=4)
    hi += h1
    lo += l1
    for s in (-1, 1):
        h2, l2, _ = _rekha('shrine', s * 19.5, 15.5, ZT + 1.6, 4.2, 6.4, 11.0, M, courses=6, lo_rings=2, lo_seg=6)
        hi += h2
        lo += l2
    trim(lo)
    report(lo)
    L.finish_proxy(A, hi, lo=lo, size=512, ao_dist=6.0, ao_samples=64, ao_strength=0.6)
    L.col_box('bm_hill', (58, 50, ZT), (0, 2, 0))
    L.col_box('bm_deul', (18, 18, 50), (0, 18, ZT))
    L.shots(A, az=-30, el=12, extra=[{'name': 'front', 'size': 320, 'view': {'az': 0, 'el': 8, 'fov': 32, 'pad': 1.05}},
                                     {'name': 'tower', 'size': 320, 'view': {'az': -50, 'el': 4, 'fov': 30, 'target': (0, 14, 46), 'dist': 90}}])
