"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

HUSSAIN SAGAR group: the Buddha on Gibraltar Rock, the Tank Bund statues (+ heritage lamps and
railing), the Lumbini Park jetty and musical fountain, NTR Ghat, Prasads (site / open), Birla
Mandir on Naubat Pahad and the Birla Planetarium. Front = -Y, origin = ground centre, Z up.
"""
import math
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
    kit.decimate_to(figure, 1050)
    parts.append(figure)
    A.notes.append('Buddha: %d tris before finish' % kit.tri_count(parts))
    L.finish(A, parts, size=512, ao_dist=6.0)
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


@kit.asset('tank_bund_statue', 'landmark', draw='tank_bund_statue', footprint=[8, 8], height=45.0, fit='footprint',
           variants={'rule': 'idx', 'names': ['scholar', 'poet', 'warrior', 'saint']})
def build_tank_bund_statue(A):
    M = _nometal(L.mats())
    G = kit.material('granite_grey', 'tb_granite', base='#b9b2a6', var=0.06, grain=0.06, specks=0.4, grime=0.5, scale=0.8)
    GD = kit.material('granite_grey', 'tb_granite_dk', base='#8e877c', specks=0.5, scale=0.8)
    BZ = M['bronze']
    parts = []
    # dressed granite plinth: steps, dado, cornice, top block, bronze plaque on the front (road side, -Y)
    parts.append(box('step1', (8.4, 8.4, 1.4), (0, 0, 0), GD, base=True))
    parts.append(box('step2', (7.2, 7.2, 1.2), (0, 0, 1.4), G, base=True))
    parts.append(box('dado_b', (6.4, 6.4, 1.2), (0, 0, 2.6), G, base=True))
    parts.append(box('dado', (5.6, 5.6, 17.6), (0, 0, 3.8), G, base=True))
    parts.append(box('cornice', (6.6, 6.6, 1.2), (0, 0, 21.4), G, base=True))
    parts.append(box('top', (6.0, 6.0, 2.0), (0, 0, 22.6), GD, base=True))
    parts.append(box('plaque', (3.4, 0.2, 2.6), (0, -2.85, 10.4), BZ, base=True))
    parts.append(box('plaque2', (2.4, 0.2, 0.6), (0, -2.85, 14.0), BZ, base=True))
    # heritage lamp posts (black iron, three globes) either side and the bund railing on the lake side (+Y)
    for s in (-1, 1):
        post, heads = L.lamp_post('tb_lamp', 14.0, M, loc=(s * 11.0, 2.0, 0.0), arms=3)
        parts += [post, heads]
        parts.append(box('lamp_base', (1.8, 1.8, 0.8), (s * 11.0, 2.0, 0.0), GD, base=True))
        parts.append(L.railing('rail', 10.0, 3.2, M, loc=(s * 9.6, 4.4, 0.0), posts=4))
    parts.append(L.railing('rail_c', 9.0, 3.2, M, loc=(0, 4.6, 0.0), posts=3))
    z0 = 24.6
    variants = {pose: [_tb_figure(pose, BZ, z0)] for pose in ('scholar', 'poet', 'warrior', 'saint')}
    L.finish(A, parts, size=256, variants=variants)
    L.col_box('tb_plinth', (7, 7, 24), (0, 0, 0))
    L.shots(A, az=-30, el=10, extra=[{'name': 'poses', 'size': 256, 'view': {'az': -10, 'el': 6, 'fov': 26, 'target': (0, 0, 33), 'dist': 50}}])


# =========================================================================== 3. Lumbini Park boat jetty
@kit.asset('lumbini_jetty', 'landmark', draw='boat_jetty', face='s', footprint=[14, 26], height=6.0, fit='footprint')
def build_lumbini_jetty(A):
    M = _nometal(L.mats())
    DECK = kit.material('whitewash', 'jetty_deck', base='#a9a49a', rough=0.9, var=0.1, grain=0.1, grime=0.6, streaks=0.0, dirt='#5f594f', scale=0.8)
    BLUE = L.paint('#2f6fa8', 'jetty_blue')
    WHITE = L.paint('#ecebe6', 'jetty_white')
    ORANGE = L.paint('#e8622a', 'ring_orange')
    RUB = kit.material('rubber', 'tyre')
    parts = []
    # pontoon deck on blue floats (z 0 = water level), steel edge
    parts.append(box('deck', (13.6, 25.6, 0.8), (0, 0, 0.7), DECK, base=True))
    parts.append(box('edge', (14.0, 26.0, 0.5), (0, 0, 0.4), BLUE, base=True))
    for x in (-4.5, 0.0, 4.5):
        parts.append(box('float', (3.6, 24.0, 1.2), (x, 0, -0.7), BLUE, base=True))
    # railings along both long sides (gaps for boarding on the lake end), white painted steel
    for s in (-1, 1):
        parts.append(L.railing('rail_l', 14.0, 3.2, M, loc=(s * 6.6, -5.0, 1.5), rz=PI / 2, posts=5, mat=WHITE))
    parts.append(L.railing('rail_end', 6.0, 3.2, M, loc=(-3.6, 12.6, 1.5), posts=3, mat=WHITE))
    # boarding steps down to the water at the lake end (+Y) and at the shore end (-Y) up to the bank
    parts.append(L.steps('steps_lake', 5.0, 0.7, 0.4, 3, (3.4, 13.6, 0.2), DECK, rz=PI))
    parts.append(L.steps('steps_shore', 6.0, 0.8, 0.45, 4, (0, -14.6, 0.2), DECK))
    # tyre fenders on the sides
    for s in (-1, 1):
        for y in (-8.0, 0.0, 8.0):
            parts.append(cylinder('tyre', 0.75, 0.45, (s * 7.2, y, 0.8), seg=8, mat=RUB, axis='X'))
    # life rings on the railing posts (orange with white bands baked as two-tone)
    for (x, y) in ((-6.85, 1.0), (6.85, -6.0)):
        pts = [(x, y + 0.75 * math.cos(2 * PI * i / 8), 3.5 + 0.75 * math.sin(2 * PI * i / 8)) for i in range(9)]
        parts.append(kit.tube('lifering', pts, 0.2, seg=4, mat=ORANGE, cap=False))
    # ticket kiosk at the shore end with a plain painted sign and a tin roof
    parts.append(box('kiosk', (4.2, 3.4, 4.2), (-3.6, -9.6, 1.5), WHITE, base=True))
    parts.append(box('kiosk_win', (2.4, 0.2, 1.4), (-3.6, -11.35, 3.4), M['black'], base=True))
    parts.append(box('kiosk_sill', (2.8, 0.6, 0.2), (-3.6, -11.5, 3.2), BLUE, base=True))
    parts.append(box('kiosk_roof', (5.4, 4.6, 0.35), (-3.6, -9.6, 5.7), BLUE, base=True))
    parts.append(L.sign_panel('kiosk_sign', 'BOATING TICKETS', 5.0, 1.2, (-3.6, -11.9, 6.6), fg='#ffffff', bg='#2a5cb8', px=256))
    # a pedal boat moored at the lake end
    boat = [ellipse_loft('boat', [(0, -2.6, 0.0, 1.0, 0.5), (0, -1.6, 0.2, 1.7, 1.0), (0, 1.4, 0.2, 1.7, 1.0), (0, 2.4, 0.0, 1.0, 0.5)], WHITE, seg=6),
            box('boat_hull', (3.2, 4.4, 0.5), (0, 0, 0.6), L.paint('#e8c42a', 'boat_yellow'), base=True),
            box('boat_seat', (2.6, 1.0, 0.9), (0, 0.4, 1.1), BLUE, base=True)]
    b = kit.join(boat, 'boat')
    L.place(b, (-9.2, 9.0, 0.0), rz=0.2)
    parts.append(b)
    L.finish(A, parts, size=256)
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
    M = _nometal(L.mats())
    RIM = kit.material('granite_grey', 'fountain_rim', base='#c9c2b4', specks=0.3, scale=0.8)
    FLOOR = L.paint('#2e6f86', 'basin_floor')
    SPRAY = kit.material('glass', 'spray', base='#eef8ff', alpha=0.6, rough=0.1)
    PIPE = L.paint('#5a5f66', 'nozzle_pipe')
    parts = []
    parts.append(_oval_ring('rim', 13.0, 9.0, 11.6, 7.6, 0.0, 1.3, RIM, seg=24))
    parts.append(_oval_ring('rim_cap', 13.3, 9.3, 12.6, 8.6, 1.3, 1.6, RIM, seg=24))
    parts.append(_oval_disc('basin', 11.7, 7.7, 0.15, FLOOR, seg=24))
    parts.append(_oval_disc('water', 11.7, 7.7, 0.85, M['water'], seg=20))
    # nozzle manifolds (three rows) and the frozen jets
    for y in (-3.6, 0.0, 3.6):
        parts.append(box('pipe', (18.0 if y else 20.0, 0.5, 0.5), (0, y, 0.5), PIPE, base=True))
    jets = []
    for (x, h, r) in ((0, 9.0, 0.7), (-4.5, 6.5, 0.5), (4.5, 6.5, 0.5), (-8.5, 4.2, 0.45), (8.5, 4.2, 0.45)):
        jets.append(cylinder('jet', r, h, (x, 0, 0.85), seg=6, mat=SPRAY, r2=0.12, cap=False))
        jets.append(cylinder('foam', r * 2.4, 0.5, (x, 0, 0.85), seg=6, mat=SPRAY, r2=r * 1.2, cap=False))
    for y in (-3.6, 3.6):
        for x in (-7.0, -2.4, 2.4, 7.0):
            # leaning fan jets (tilted outwards)
            j = cylinder('fan', 0.32, 3.6, (0, 0, 0), seg=5, mat=SPRAY, r2=0.1, cap=False)
            j.rotation_euler = (math.copysign(0.35, -y), 0, 0)
            j.location = (x, y, 0.85)
            kit.apply_transform(j)
            jets.append(j)
    parts.append(kit.join(jets, 'jets'))
    # coloured underwater lamps that glow at night
    cols = ['#40c0ff', '#ff5ab4', '#ffd84a']
    for i, x in enumerate((-10.0, -6.5, -3.0, 0.0, 3.0, 6.5, 10.0)):
        for y in (-5.6, 5.6):
            if abs(x) > 9.5 and abs(y) > 0:
                yy = y * 0.55
            else:
                yy = y
            parts.append(box('lamp', (0.9, 0.9, 0.35), (x, yy, 0.55), L.lamp(cols[(i + (y > 0)) % 3]), base=True))
    L.finish(A, parts, size=256)
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


@kit.asset('ntr_memorial', 'landmark', draw='ntr_memorial', face='s', footprint=[40, 28], height=27.0, fit='footprint', floodlit=True)
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
    L.finish(A, parts, size=512)
    L.shots(A, az=-30, el=18)
