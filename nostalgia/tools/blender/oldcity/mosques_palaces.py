"""NOSTALGIA — tools/blender/oldcity/mosques_palaces.py — Old City mosque and palaces (ARCHITECTURE §21).

    /home/user/.venvs/blender/bin/python tools/blender/build_all.py mecca_masjid chowmahalla falaknuma purani_haveli

mecca_masjid   the grey granite prayer hall (five great arches, arcaded gallery, two octagonal
               minaret-towers with arcaded galleries and domes). The courtyard is a plaza.
chowmahalla    the walled compound seen from the street (closed for restoration in 2003): the north
               gate with the Khilwat clock tower, crenellated wall, palace roofs glimpsed inside.
falaknuma      the white neo-Palladian palace on its rocky hill (closed in 2003): portico,
               balustrades with urns, scorpion plan (curved wings + tail), the closed gate below.
purani_haveli  Nizam's Museum: a long U-shaped two-storey palace, arcaded verandahs, green louvres.

Conventions: 1 u = 1 world unit, Z up, front = -Y, origin on the ground at the footprint centre.
Vertex budget is the real limit (pack size): openings, windows, trims and doors are single-sided
"decal" planes floating just in front of the walls (4-10 verts each) instead of booleans or boxes.
"""
import math
import bmesh
from mathutils import Matrix, Vector
import kit
from kit import box, cylinder, lathe, arch_outline, prism_from_outline
from oldcity import common

TAU = 2 * math.pi


# =========================================================================== local helpers
def debug_parts(parts):
    """MP_DEBUG=1: log an estimate of exported vertices per part (vertex x box-UV axis groups)"""
    import os
    if not os.environ.get('MP_DEBUG'):
        return
    rows = {}
    for o in parts:
        if o is None or o.type != 'MESH':
            continue
        me = o.data
        keys = set()
        for p in me.polygons:
            n = p.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for vi in p.vertices:
                keys.add((vi, ax, n[ax] > 0))
        k = o.name.split('.')[0]
        r = rows.setdefault(k, [0, 0])
        r[0] += len(keys)
        r[1] += 1
    tot = sum(r[0] for r in rows.values())
    for k, r in sorted(rows.items(), key=lambda kv: -kv[1][0])[:30]:
        kit.log('  %-24s ~%5d verts (%d objs)' % (k, r[0], r[1]))
    kit.log('  TOTAL ~%d verts' % tot)


def planes(name, polys, mat, facing=None):
    """One mesh of single-sided polygons (decals). polys: lists of 3D points. facing: optional
    direction vector all faces must look along (they are flipped if needed)."""
    bm = bmesh.new()
    for pts in polys:
        vs = [bm.verts.new(p) for p in pts]
        f = bm.faces.new(vs)
        f.normal_update()
        if facing is not None and f.normal.dot(Vector(facing)) < 0:
            f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


def fpoly(outline, x0=0.0, z0=0.0, y=0.0):
    """2D outline (x, z) in a wall facing -Y at y (decal coordinates)."""
    return [(x0 + x, y, z0 + z) for (x, z) in outline]


def rect(w, h):
    return [(-w / 2, 0), (w / 2, 0), (w / 2, h), (-w / 2, h)]


def arch(w, h, kind='pointed', n=5, spring=0.62):
    """arched opening outline of total height h (jambs h*spring)"""
    o = arch_outline(w, h * spring, h * (1 - spring), kind, n=n)
    if kind == 'round':
        o = arch_outline(w, h - w / 2, w / 2, 'round', n=n)
    return o


def seg_arch(w, h, rise=0.18, n=4):
    """segmental arch outline (flat-ish arch over a window), total height h"""
    sg = w * rise
    spring = h - sg
    R = (w * w / 4 + sg * sg) / (2 * sg)
    zc = spring + sg - R
    a = math.asin(min(1.0, (w / 2) / R))
    pts = [(-w / 2, 0.0)]
    for i in range(n + 1):
        t = -a + 2 * a * i / n
        pts.append((R * math.sin(t), zc + R * math.cos(t)))
    pts.append((w / 2, 0.0))
    return pts


def place(objs, rot=0.0, off=(0, 0, 0)):
    """rotate objects (built facing -Y at the origin) about Z, then move them"""
    M = Matrix.Translation(Vector(off)) @ Matrix.Rotation(rot, 4, 'Z')
    for o in objs:
        o.matrix_world = M @ o.matrix_world
        kit.apply_transform(o)
    return objs


def wall_face(cx, cy, rot):
    """frame for a wall: returns (rotation, offset) to place decals built facing -Y at y=0 onto a
    wall face whose outward normal is rotated `rot` from -Y, centred at (cx, cy)."""
    return rot, (cx, cy, 0)


def bal(name, length, z, h, mat, depth=1.0, dark=None, n=None, fy=0.0, pitch=2.6):
    """balustrade facing -Y centred on x=0 at y=fy: one solid parapet box with dark gap decals on
    the outer face (reads as balusters from the street; ~4 verts per gap)."""
    out = [box(name + '_p', (length, depth, h), (0, fy, z), mat, base=True)]
    if dark is not None:
        n = n or max(2, int(length / pitch))
        step = length / n
        ps = []
        for i in range(n):
            x = -length / 2 + step * (i + 0.5)
            w = step * 0.3
            yy = fy - depth / 2 - 0.06
            ps.append([(x - w / 2, yy, z + h * 0.26), (x + w / 2, yy, z + h * 0.26), (x + w / 2, yy, z + h * 0.72), (x - w / 2, yy, z + h * 0.72)])
        out.append(planes(name + '_gaps', ps, dark, facing=(0, -1, 0)))
    return out


def bal_ring(name, x0, y0, x1, y1, z, h, mat, dark=None, depth=0.9, sides='nsew', pitch=2.6):
    """balustrades along the edges of a rectangle (roof parapet)"""
    out = []
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    W, D = x1 - x0, y1 - y0
    for s in sides:
        if s == 's':      # -Y edge
            ob = bal(name + 's', W, z, h, mat, depth, dark, pitch=pitch)
            out += place(ob, 0, (cx, y0 + depth / 2, 0))
        elif s == 'n':
            ob = bal(name + 'n', W, z, h, mat, depth, dark, pitch=pitch)
            out += place(ob, math.pi, (cx, y1 - depth / 2, 0))
        elif s == 'w':
            ob = bal(name + 'w', D - 2 * depth, z, h, mat, depth, dark, pitch=pitch)
            out += place(ob, -math.pi / 2, (x0 + depth / 2, cy, 0))
        elif s == 'e':
            ob = bal(name + 'e', D - 2 * depth, z, h, mat, depth, dark, pitch=pitch)
            out += place(ob, math.pi / 2, (x1 - depth / 2, cy, 0))
    return out


def faces_of_rect(x0, y0, x1, y1, sides='nsew'):
    """(rot, (cx, cy), length) of each named side of a rectangle; decals built facing -Y at y=0
    and centred at x=0 land on that side when placed with place(objs, rot, (cx, cy, 0))."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    out = []
    for s in sides:
        if s == 's':
            out.append((0.0, (cx, y0), x1 - x0, s))
        elif s == 'n':
            out.append((math.pi, (cx, y1), x1 - x0, s))
        elif s == 'w':
            out.append((-math.pi / 2, (x0, cy), y1 - y0, s))
        elif s == 'e':
            out.append((math.pi / 2, (x1, cy), y1 - y0, s))
    return out


def window_row(n, span, z, w, h, shape='rect', gap=0.12, x0=0.0):
    """outlines of n evenly spaced openings along a facade (decal coords, y=-gap)"""
    out = []
    step = span / n
    for i in range(n):
        x = x0 - span / 2 + step * (i + 0.5)
        if shape == 'rect':
            o = rect(w, h)
        elif shape == 'seg':
            o = seg_arch(w, h)
        else:
            o = arch(w, h, shape, n=3, spring=0.68 if shape == 'round' else 0.62)
        out.append(fpoly(o, x, z, -gap))
    return out


def comb(name, length, z, h, n, w, mat, y0, y1, cap=True, leaf=False, back=True):
    """a crenellated parapet top (merlons) as a front comb plane at y0, a back one at y1 and the
    merlon tops: cheap silhouettes (no side faces between merlons)"""
    out = []
    step = length / n
    outline = [(-length / 2, 0.0)]
    for i in range(n):
        x = -length / 2 + step * (i + 0.5)
        if leaf:
            outline += [(x - w / 2, 0.0), (x - w / 2, h * 0.5), (x, h), (x + w / 2, h * 0.5), (x + w / 2, 0.0)]
        else:
            outline += [(x - w / 2, 0.0), (x - w / 2, h), (x + w / 2, h), (x + w / 2, 0.0)]
    outline.append((length / 2, 0.0))
    outline.append((length / 2, -0.3))
    outline.append((-length / 2, -0.3))
    out.append(planes(name + '_f', [[(x, y0, z + zz) for (x, zz) in outline]], mat, facing=(0, -1, 0)))
    if back:
        out.append(planes(name + '_b', [[(x, y1, z + zz) for (x, zz) in outline]], mat, facing=(0, 1, 0)))
    if cap and not leaf:
        tops = []
        for i in range(n):
            x = -length / 2 + step * (i + 0.5)
            tops.append([(x - w / 2, y0, z + h), (x + w / 2, y0, z + h), (x + w / 2, y1, z + h), (x - w / 2, y1, z + h)])
        out.append(planes(name + '_t', tops, mat, facing=(0, 0, 1)))
    return out


def rocks(name, pts, mat, seed=1):
    """low boulders (icospheres, squashed and jittered)"""
    import random
    rnd = random.Random(seed)
    objs = []
    for (x, y, r) in pts:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in bm.verts:
            v.co.x *= 1.0 + rnd.uniform(-0.2, 0.25)
            v.co.y *= 1.0 + rnd.uniform(-0.2, 0.25)
            v.co.z *= 0.55 + rnd.uniform(-0.1, 0.15)
        bmesh.ops.translate(bm, vec=Vector((x, y, r * 0.1)), verts=bm.verts)
        objs.append(kit.obj_from_bm(bm, name, mat))
    return objs


# =========================================================================== 1. Mecca Masjid
MM_W, MM_D = 132.0, 90.0
MM_H = 46.0            # hall / facade top (cornice line)
MIN_X = MM_W / 2 - 7.6  # minaret centres
MIN_Y = -MM_D / 2 + 7.6


def mm_minaret(M, x, y):
    """massive octagonal minaret-tower: string courses, arcaded gallery, dome, finial"""
    g = M['granite']
    parts = []
    r0 = 7.4
    # lathe seg=8 gives an octagon; rotate by pi/8 so a flat face looks forward
    prof = [(r0 + 0.9, 0.0), (r0 + 0.9, 3.0), (r0 + 0.3, 3.4), (r0, 3.4),
            (r0, 21.0), (r0 + 0.7, 21.3), (r0 + 0.7, 22.6), (r0, 22.9),
            (r0 - 0.15, 44.6), (r0 + 0.9, 45.2), (r0 + 0.9, 47.0), (r0 - 0.2, 47.4),
            (r0 - 0.5, 58.5),
            (r0 + 0.4, 59.6), (r0 + 1.4, 60.4), (r0 + 1.4, 61.6), (0.0, 61.6)]
    sh = lathe('mm_min', prof, seg=8, mat=g, close_bottom=False)
    parts.append(sh)
    # arcaded gallery: a granite drum with dark arch openings on its eight faces (decals)
    gal_r = r0 - 0.6
    parts.append(lathe('mm_gal', [(gal_r, 61.6), (gal_r, 69.6), (0.0, 69.6)], seg=8, mat=g, close_bottom=False))
    ap = gal_r * math.cos(math.pi / 8)
    side = 2 * gal_r * math.sin(math.pi / 8)
    ops = []
    for i in range(8):
        a = TAU * i / 8 - math.pi / 8
        o = planes('mm_galop', [fpoly(arch(side * 0.66, 6.4, 'pointed', n=3), 0, 62.0, -ap - 0.1)], M['dark'], facing=(0, -1, 0))
        place([o], a + math.pi / 2)
        ops.append(o)
    parts.append(kit.join(ops, 'mm_galops'))
    parts.append(lathe('mm_galtop', [(gal_r + 0.2, 69.6), (gal_r + 1.2, 70.4), (gal_r + 1.2, 71.4), (0, 71.4)], seg=8, mat=M['lime'], close_bottom=False))
    # small dome on a low drum + finial
    R = gal_r - 0.4
    dome = [(R, 71.4), (R, 72.6)]
    for i in range(1, 5):
        t = i / 5 * math.pi / 2
        dome.append((R * math.cos(t) * (1.0 + 0.06 * math.sin(2 * t)), 72.6 + R * 1.1 * math.sin(t)))
    dome.append((0.0, 72.6 + R * 1.1))
    parts.append(lathe('mm_dome', dome, seg=12, mat=M['lime'], close_bottom=False))
    top = 72.6 + R * 1.1
    parts.append(lathe('mm_fin', [(0.6, top - 0.3), (0.3, top + 1.4), (0.55, top + 2.2), (0.0, top + 5.0)], seg=5, mat=M['gold'], close_bottom=False))
    for o in parts:
        o.matrix_world = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.pi / 8, 4, 'Z') @ o.matrix_world
        kit.apply_transform(o)
    return parts


@kit.asset('mecca_masjid', 'landmark', landmark='mecca_masjid', face='e', footprint=[132, 90], height=75.0,
           fit='footprint', floodlit=True)
def mecca_masjid(A):
    """Mecca Masjid prayer hall: grey Deccan granite, five great pointed arches on the east front,
    cornice and arcaded gallery, flat roof with parapet, two octagonal minaret-towers."""
    M = {
        'granite': kit.material('granite_grey', 'granite', base='#6c6863', var=0.13, grain=0.12, specks=0.7, grime=0.65, dirt='#2a2826'),
        'granite_hi': kit.material('granite_grey', 'granite_hi', base='#8a857d', var=0.1, specks=0.5),
        'dark': kit.material('lime_plaster_shadow', 'mm_dark', base='#36322e', streaks=0.0, var=0.05, grime=0.2),
        'lime': kit.material('whitewash', 'mm_lime', base='#d9d3c5', streaks=0.4, grime=0.5),
        'recess': kit.material('granite_grey', 'mm_recess', base='#4e4a45', var=0.12, specks=0.5),
        'gold': kit.material('gold_leaf', 'finial', base='#a08a52', metal=0.3, rough=0.55),
    }
    g, gh, dk = M['granite'], M['granite_hi'], M['dark']
    parts = []
    fy = -MM_D / 2 + 2.0          # front face of the arch screen
    hall_y0 = fy + 14.0           # back wall of the verandah (inner face, the hall)
    # ---- plinth + steps along the front
    parts.append(box('mm_plinth', (MM_W - 2, MM_D - 1, 2.0), (0, 0.5, 0), gh, base=True))
    parts.append(box('mm_step', (MM_W - 26, 2.6, 1.0), (0, fy - 1.3, 0), gh, base=True))
    # ---- the hall block (behind the verandah)
    hall = box('mm_hall', (MM_W - 6, MM_D - (hall_y0 + MM_D / 2) - 1.0, MM_H - 2.0), (0, (hall_y0 + MM_D / 2 - 1.0) / 2, 2.0), g, base=True)
    # side and back walls: blind arcades (recessed-looking darker granite decals)
    for (rot, length, off) in ((math.pi / 2, MM_D - (hall_y0 + MM_D / 2) - 1.0, (MM_W / 2 - 3, (hall_y0 + MM_D / 2 - 1.0) / 2)),
                               (-math.pi / 2, MM_D - (hall_y0 + MM_D / 2) - 1.0, (-MM_W / 2 + 3, (hall_y0 + MM_D / 2 - 1.0) / 2)),
                               (math.pi, MM_W - 22, (0, MM_D / 2 - 1.0))):
        n = max(3, int(round(length / 12.0)))
        o = planes('mm_blind', window_row(n, length - 4, 7.0, (length - 4) / n * 0.6, 26.0, 'pointed', 0.1), M['recess'], facing=(0, -1, 0))
        parts += place([o], rot, (off[0], off[1], 0))
    parts.append(hall)
    # ---- the verandah: arch screen in front of the hall with the five great arches cut through
    scr_w = 2 * MIN_X - 2 * 6.0
    scr = box('mm_screen', (scr_w, 6.0, 38.6), (0, fy + 3.0, 2.0), g, base=True)
    step = scr_w / 5.3
    cutters = []
    for i in range(5):
        x = (i - 2) * step
        w = 16.6 if i == 2 else 14.6
        apex = 37.0 if i == 2 else 34.5
        spring = 21.5 if i == 2 else 20.5
        c = prism_from_outline('mm_ac', arch_outline(w, spring, apex - spring, 'pointed', n=7), 14.0, center=(x, fy + 3.0, 1.9))
        cutters.append(c)
    kit.boolean(scr, kit.join(cutters, 'mm_acs'))
    parts.append(scr)
    # side walls of the verandah (between the screen and the hall) + its roof
    for s in (-1, 1):
        parts.append(box('mm_vside', (5.0, hall_y0 - fy - 6.0, MM_H - 2.0), (s * (scr_w / 2 - 2.5), (fy + 6.0 + hall_y0) / 2, 2.0), g, base=True))
    parts.append(box('mm_vroof', (scr_w - 0.2, hall_y0 - fy - 3.2, 8.0), (0, (fy + 3.2 + hall_y0) / 2, MM_H - 8.0), g, base=True))
    # the hall's front wall seen through the arches: dark with inner arched doorways (decals)
    inner = []
    for i in range(5):
        x = (i - 2) * step
        inner.append(fpoly(arch(8.0, 22.0, 'pointed', n=4), x, 2.0, hall_y0 - 0.1))
    parts.append(planes('mm_inner', inner, dk, facing=(0, -1, 0)))
    # arch frames: a lighter granite moulding around each great arch, spandrel roundels
    fr = []
    for i in range(5):
        x = (i - 2) * step
        w = 16.6 if i == 2 else 14.6
        apex = 37.0 if i == 2 else 34.5
        spring = 21.5 if i == 2 else 20.5
        o = arch_outline(w + 2.4, spring, apex - spring + 1.4, 'pointed', n=7)
        inn = arch_outline(w, spring, apex - spring, 'pointed', n=7)
        # frame = band between outer and inner arch curves (as quads)
        oc, ic = o[1:-1], inn[1:-1]
        for k in range(len(oc) - 1):
            fr.append([(x + oc[k][0], fy - 0.12, 1.9 + oc[k][1]), (x + oc[k + 1][0], fy - 0.12, 1.9 + oc[k + 1][1]),
                       (x + ic[k + 1][0], fy - 0.12, 1.9 + ic[k + 1][1]), (x + ic[k][0], fy - 0.12, 1.9 + ic[k][1])])
    parts.append(planes('mm_frames', fr, gh, facing=(0, -1, 0)))
    ros = []
    for i in range(6):
        x = (i - 2.5) * step
        ros.append([(x + 1.5 * math.cos(TAU * k / 8), fy - 0.15, 33.0 + 1.5 * math.sin(TAU * k / 8)) for k in range(8)])
    parts.append(planes('mm_ros', ros, gh, facing=(0, -1, 0)))
    # ---- cornice (chajja) + the arcaded gallery above it + the parapet
    parts.append(box('mm_cornice', (scr_w + 1.0, 3.2, 1.2), (0, fy + 0.4, 39.4), gh, base=True))
    parts.append(box('mm_cornice2', (scr_w + 0.4, 1.4, 0.8), (0, fy + 0.4, 38.6), g, base=True))
    parts.append(box('mm_gallery', (scr_w, 3.0, 7.0), (0, fy + 1.5, 40.6), gh, base=True))
    parts.append(planes('mm_galarc', window_row(21, scr_w - 3.0, 41.3, (scr_w - 3.0) / 21 * 0.48, 5.2, 'pointed', 0.12 - fy), dk, facing=(0, -1, 0)))
    parts.append(box('mm_galtop', (scr_w + 0.6, 3.6, 1.0), (0, fy + 1.5, 47.6), gh, base=True))
    # front parapet: low solid with block merlons
    parts += comb('mm_mer', scr_w - 2, 48.6, 2.4, 17, 2.6, g, fy + 0.6, fy + 2.4)
    # roof parapet around the hall
    hw, hy0, hy1 = MM_W / 2 - 3.6, hall_y0, MM_D / 2 - 1.0
    for (sx, sy, cx, cy) in ((2 * hw, 1.2, 0, hy1 - 0.6), (1.2, hy1 - hy0, -hw + 0.6, (hy0 + hy1) / 2), (1.2, hy1 - hy0, hw - 0.6, (hy0 + hy1) / 2)):
        parts.append(box('mm_par', (sx, sy, 3.0), (cx, cy, MM_H), gh, base=True))
    # rear corner turrets (small octagonal, domed)
    for s in (-1, 1):
        x, y = s * (MM_W / 2 - 4.5), MM_D / 2 - 4.5
        parts.append(lathe('mm_tur', [(3.0, MM_H - 2), (3.0, MM_H + 6.0), (3.6, MM_H + 6.6), (2.6, MM_H + 7.4),
                                      (1.8, MM_H + 10.0), (0.0, MM_H + 12.6)], seg=8, mat=g, loc=(x, y, 0), close_bottom=False))
    # ---- the two great minaret-towers at the front corners
    for s in (-1, 1):
        parts += mm_minaret(M, s * MIN_X, MIN_Y)
    debug_parts(parts)
    common.finish(A, parts, tile=10.0, tex=256, ao_dist=10.0, ground_dirt=6.0)
    # ---- camera proxies
    common.col_join([common.col_box('hall', (MM_W - 6, MM_D - 14, MM_H), (0, 6, 0)),
                     common.col_box('screen', (scr_w, 6, MM_H - 20), (0, fy + 3, 26)),
                     common.col_box('minL', (12, 12, 72), (-MIN_X, MIN_Y, 0)),
                     common.col_box('minR', (12, 12, 72), (MIN_X, MIN_Y, 0))], 'mecca')
    A.preview = common.shots(front_az=-30, el=12, extra=[
        {'name': 'arches', 'size': 320, 'samples': 14, 'view': {'az': -12, 'el': 6, 'fov': 40, 'target': (0, -40, 26), 'dist': 120}}])


# =========================================================================== 2. Chowmahalla
CH_W, CH_D = 150.0, 170.0
CH_WALL = 15.0


def palace_block(M, name, x0, y0, x1, y1, h, storeys=2, sides='nsew', arcade_sides='s', pediment=None, roof='flat', min_z=0.0, bal_sides='nsew'):
    """a neoclassical palace block (cream lime with white trims): body, cornices, arcaded verandah
    decals on `arcade_sides`, windows elsewhere, balustrade with dark gaps, optional pediment."""
    pl, hi, dk = M['plaster'], M['trim'], M['dark']
    out = [box(name, (x1 - x0, y1 - y0, h + 3.0), ((x0 + x1) / 2, (y0 + y1) / 2, 0), pl, base=True)]
    sh = h / storeys
    dec, trims = [], []
    for (rot, (cx, cy), L, s) in faces_of_rect(x0, y0, x1, y1, sides):
        n = max(2, int(L / 7.0))
        loc = []
        tr = []
        for k in range(storeys):
            z = k * sh + sh * 0.12
            if (k + 1) * sh < min_z + 3.0:
                continue        # hidden behind the compound wall
            if s in arcade_sides:
                loc += window_row(n, L - 3, z, (L - 3) / n * 0.72, sh * 0.8, 'round', 0.14)
                # pilaster strips between the arches (white decals)
                st = (L - 3) / n
                for i in range(n + 1):
                    x = -(L - 3) / 2 + st * i
                    tr.append(fpoly(rect(0.9, sh * 0.86), x, k * sh + sh * 0.06, -0.08))
            else:
                loc += window_row(n, L - 4, z + sh * 0.12, 2.6, sh * 0.55, 'rect', 0.14)
        if loc:
            dec += place([planes(name + '_op', loc, dk, facing=(0, -1, 0))], rot, (cx, cy, 0))
        if tr:
            trims += place([planes(name + '_tr', tr, hi, facing=(0, -1, 0))], rot, (cx, cy, 0))
    out += dec + trims
    if 'roof' in M:
        out.append(planes(name + '_roof', [[(x0 + 0.3, y0 + 0.3, h + 0.05), (x1 - 0.3, y0 + 0.3, h + 0.05), (x1 - 0.3, y1 - 0.3, h + 0.05), (x0 + 0.3, y1 - 0.3, h + 0.05)]], M['roof'], facing=(0, 0, 1)))
    # top cornice + balustrade as decals on the parapet (the wall rises 3 u above the roof)
    for (rot, (cx, cy), L, sd) in faces_of_rect(x0, y0, x1, y1, bal_sides):
        nn = max(2, int(L / 4.4))
        st = L / nn
        ps = [fpoly(rect(st * 0.3, 1.4), -L / 2 + st * (i + 0.5), h + 0.8, -0.06) for i in range(nn)]
        objs = [planes(name + '_g', ps, M['gap'], facing=(0, -1, 0)),
                planes(name + '_c', [fpoly(rect(L, 0.9), 0, h - 0.4, -0.05), fpoly(rect(L, 0.5), 0, h + 2.5, -0.05)], hi, facing=(0, -1, 0))]
        out += place(objs, rot, (cx, cy, 0))
    if pediment:
        (pw, ph) = pediment
        cy = y0
        tri = prism_from_outline(name + '_ped', [(-pw / 2, 0), (pw / 2, 0), (0, ph)], 1.6, center=((x0 + x1) / 2, cy - 0.4, h + 2.4), mat=hi)
        out.append(tri)
    return out


@kit.asset('chowmahalla', 'landmark', landmark='chowmahalla_palace', face='n', footprint=[150, 170], height=68.0,
           fit='footprint', floodlit=True)
def chowmahalla(A):
    """Chowmahalla compound from the street: north gate with the Khilwat clock tower, crenellated
    compound wall, palace blocks (Khilwat Mubarak, Afzal / Mahtab Mahal style) above the wall."""
    M = {
        'plaster': kit.material('lime_plaster', 'ch_plaster', base='#f3ecdc', var=0.07, grain=0.04, streaks=0.45),
        'wall': kit.material('lime_plaster_shadow', 'ch_wall', base='#ece2c8', var=0.1, grain=0.05, streaks=0.55, grime=0.65),
        'trim': kit.material('whitewash', 'ch_trim', base='#f4eedf'),
        'recess': kit.material('lime_plaster_shadow', 'ch_recess', base='#d9b878', var=0.1, streaks=0.5),
        'roof': kit.material('red_oxide', 'ch_roof'),
        'ochre': kit.material('lime_plaster', 'ch_ochre', base='#d2a24c', streaks=0.3),
        'gap': kit.material('lime_plaster_shadow', 'ch_gap', base='#8c7a5c', streaks=0.0),
        'dark': kit.material('lime_plaster_shadow', 'ch_dark', base='#3a3128', streaks=0.0, var=0.05, grime=0.2),
        'door': kit.material('wood_raw', 'ch_door', base='#5a3a22'),
        'iron': kit.material('iron_black', 'ch_iron'),
        'clock': kit.material('clock_face', 'clock@night', emit='#fff3d0', emit_strength=0.0),
    }
    pl, wl, hi, dk = M['plaster'], M['wall'], M['trim'], M['dark']
    parts = []
    hx, hy = CH_W / 2, CH_D / 2
    t = 2.4
    GW, GH, GD = 30.0, 30.0, 12.0     # gate tower
    # ---- compound wall (4 sides; the front split by the gate tower), crenellated
    walls = [(0.0, (0, -hy + t / 2), CH_W, 'front'), (math.pi, (0, hy - t / 2), CH_W, 'back'),
             (-math.pi / 2, (-hx + t / 2, 0), CH_D - 2 * t, 'w'), (math.pi / 2, (hx - t / 2, 0), CH_D - 2 * t, 'e')]
    for (rot, (cx, cy), L, nm) in walls:
        segs = [(-L / 2, -GW / 2), (GW / 2, L / 2)] if nm == 'front' else [(-L / 2, L / 2)]
        for (a, b) in segs:
            ln = b - a
            mid = (a + b) / 2
            o = [box('ch_wall', (ln, t, CH_WALL), (mid, 0, 0), wl, base=True)]
            mer = comb('ch_mer', ln - 1.0, CH_WALL, 2.8, max(2, int(ln / 12.0)), 4.0, wl, -t / 2 + 0.3, t / 2 - 0.3, leaf=True, back=False)
            for m_ in mer:
                m_.location.x += mid
                kit.apply_transform(m_)
            o += mer
            # blind arch recess decals along the outside (street) face (not on the back)
            if nm == 'front':
                n = max(1, int(ln / 18.0))
                o.append(planes('ch_wallarc', window_row(n, ln - 4, 2.5, 6.0, 9.5, 'pointed', t / 2 + 0.06, mid), M['recess'], facing=(0, -1, 0)))
            parts += place(o, rot, (cx, cy, 0))
    # ---- the north gate tower (Khilwat gate) with the clock tower above
    gy = -hy + GD / 2 - 1.5
    gate = box('ch_gate', (GW, GD, GH), (0, gy, 0), pl, base=True)
    gc = prism_from_outline('ch_gcut', arch_outline(12.0, 12.0, 7.5, 'pointed', n=7), 3.0, center=(0, gy - GD / 2, 0.0))
    kit.boolean(gate, gc)
    parts.append(gate)
    fy = gy - GD / 2          # gate front face
    # the closed doors (recessed) with iron studs and a dark frame
    parts.append(planes('ch_doors', [fpoly(arch_outline(11.8, 12.0, 7.4, 'pointed', n=7), 0, 0, fy + 1.4)], M['door'], facing=(0, -1, 0)))
    studs = []
    for i in range(2):
        for j in range(3):
            for s in (-1, 1):
                x = s * (1.5 + i * 2.2)
                z = 2.4 + j * 3.6
                studs.append([(x - 0.18, fy + 1.3, z - 0.18), (x + 0.18, fy + 1.3, z - 0.18), (x + 0.18, fy + 1.3, z + 0.18), (x - 0.18, fy + 1.3, z + 0.18)])
    studs.append([(-0.12, fy + 1.3, 0), (0.12, fy + 1.3, 0), (0.12, fy + 1.3, 18.5), (-0.12, fy + 1.3, 18.5)])
    parts.append(planes('ch_studs', studs, M['iron'], facing=(0, -1, 0)))
    # arch frame and side decoration
    o = arch_outline(15.0, 12.0, 9.2, 'pointed', n=7)
    inn = arch_outline(12.0, 12.0, 7.5, 'pointed', n=7)
    fr = []
    oc, ic = o[1:-1], inn[1:-1]
    for k in range(len(oc) - 1):
        fr.append([(oc[k][0], fy - 0.1, oc[k][1]), (oc[k + 1][0], fy - 0.1, oc[k + 1][1]), (ic[k + 1][0], fy - 0.1, ic[k + 1][1]), (ic[k][0], fy - 0.1, ic[k][1])])
    for s in (-1, 1):
        fr.append(fpoly(rect(1.2, GH - 3), s * (GW / 2 - 2.2), 0, fy - 0.1))   # pilasters
        fr.append(fpoly(rect(1.2, GH - 3), s * 9.6, 0, fy - 0.1))
    parts.append(planes('ch_gfr', fr, hi, facing=(0, -1, 0)))
    # small niches / windows on the gate front upper storey
    parts.append(planes('ch_gwin', window_row(3, 14, 21.5, 2.6, 4.6, 'pointed', 0.1) +
                        [fpoly(arch(3.4, 7.0, 'pointed', n=4), s * 12.4, 6.0, fy - 0.1) for s in (-1, 1)], dk, facing=(0, -1, 0)))
    # cornice + balustrade/merlons on the gate
    parts.append(box('ch_gcor', (GW + 1.6, GD + 1.6, 1.2), (0, gy, GH - 1.2), M['ochre'], base=True))
    parts.append(box('ch_gcor2', (GW + 0.8, GD + 0.8, 0.6), (0, gy, 17.0), hi, base=True))
    for (rot, L, off) in ((0.0, GW, (0, gy - GD / 2 + 0.6)), (math.pi, GW, (0, gy + GD / 2 - 0.6)),
                          (-math.pi / 2, GD - 1.2, (-GW / 2 + 0.6, gy)), (math.pi / 2, GD - 1.2, (GW / 2 - 0.6, gy))):
        parts += place(comb('ch_gmer', L - 5.0, GH, 2.6, max(2, int(L / 4.0)), 2.2, pl, -0.4, 0.4, leaf=True, back=False), rot, (off[0], off[1], 0))
    # corner chhatris on the gate tower
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (GW / 2 - 2.0), gy + sy * (GD / 2 - 2.0)
            parts.append(lathe('ch_chh', [(1.5, GH), (1.5, GH + 4.0), (2.1, GH + 4.5), (1.4, GH + 5.4),
                                          (0.0, GH + 8.6)], seg=8, mat=hi, loc=(x, y, 0), close_bottom=False))
            ops = []
            for k in range(8):
                a_ = TAU * k / 8 + math.pi / 8
                if math.sin(a_) > -0.5 or sy > 0:
                    continue
                o_ = planes('ch_chop', [fpoly(arch(0.8, 3.0, 'pointed', n=2), 0, GH + 0.6, -1.5 * math.cos(math.pi / 8) - 0.06)], dk, facing=(0, -1, 0))
                place([o_], a_ + math.pi / 2, (x, y, 0))
                ops.append(o_)
            if ops:
                parts.append(kit.join(ops, 'ch_chops'))
    # clock tower stage above the gate: square tower, clock dial on the front, cornice, dome
    ct_w = 8.0
    CT0, CT1 = GH, GH + 26.0
    parts.append(box('ch_ctow', (ct_w, ct_w, CT1 - CT0), (0, gy, CT0), pl, base=True))
    parts.append(box('ch_ctcor', (ct_w + 1.4, ct_w + 1.4, 0.9), (0, gy, CT1 - 0.4), M['ochre'], base=True))
    parts.append(box('ch_ctband', (ct_w + 0.6, ct_w + 0.6, 0.6), (0, gy, CT0 + 4.0), M['ochre'], base=True))
    parts.append(box('ch_ctband2', (ct_w + 0.6, ct_w + 0.6, 0.6), (0, gy, CT0 + 13.0), M['ochre'], base=True))
    cz = CT0 + 19.0
    cfy = gy - ct_w / 2
    for (rot) in (0.0, math.pi, math.pi / 2, -math.pi / 2):
        objs = []
        if rot == 0.0:
            objs.append(cylinder('ch_cframe', 4.2, 0.6, (0, -0.25, cz), seg=14, mat=hi, axis='Y', base=False, cap=True))
            objs.append(planes('ch_dial', [[(3.6 * math.cos(TAU * k / 16), -0.6, cz + 3.6 * math.sin(TAU * k / 16)) for k in range(16)]], M['clock'], facing=(0, -1, 0)))
            hands = []
            for (w, L, ang) in ((0.45, 2.2, 50), (0.3, 3.1, -115)):
                h = box('ch_hand', (w, 0.1, L), (0, 0, 0), M['iron'], base=True)
                h.rotation_euler = (0, math.radians(ang), 0)
                h.location = (0, -0.68, cz)
                kit.apply_transform(h)
                hands.append(h)
            objs += hands
        else:
            objs.append(planes('ch_cwin', [fpoly(arch(2.4, 5.0, 'pointed', n=4), 0, cz - 2.5, -0.62)], dk, facing=(0, -1, 0)))
        place(objs, rot, (0, gy, 0))
        # the face sits at the tower wall: move from y=0 to the wall
        d = Vector((0, -ct_w / 2, 0))
        d.rotate(Matrix.Rotation(rot, 3, 'Z'))
        for ob in objs:
            ob.location += d
            kit.apply_transform(ob)
        parts += objs
    # top: a small balustraded terrace and a ribbed dome on a drum
    parts += bal_ring('ch_ctbal', -ct_w / 2, gy - ct_w / 2, ct_w / 2, gy + ct_w / 2, CT1 + 0.5, 2.0, hi, dark=None, depth=0.6)
    parts.append(lathe('ch_ctdome', [(3.4, CT1), (3.4, CT1 + 2.4), (3.9, CT1 + 2.7), (3.5, CT1 + 3.2), (3.6, CT1 + 4.6),
                                     (2.9, CT1 + 7.0), (1.4, CT1 + 8.8), (0.0, CT1 + 11.6)], seg=10, mat=pl, loc=(0, gy, 0), close_bottom=False))
    # ---- the palaces inside (glimpsed over the wall)
    # Khilwat Mubarak: the great durbar hall (tall, at the back)
    parts += palace_block(M, 'ch_khilwat', -36, 30, 36, 66, 34, storeys=2, sides='swe', arcade_sides='s', pediment=(24, 6), min_z=CH_WALL)
    # its gently pitched roof behind the balustrade
    roof = prism_from_outline('ch_kroof', [(-17, 0), (17, 0), (0, 4.5)], 70.0, axis='X', center=(0, 48, 35.5), mat=M['roof'])
    parts.append(roof)
    # two neoclassical mahals (Afzal / Mahtab Mahal style) either side of the long courtyard
    for s in (-1, 1):
        x0, x1 = (s * 16, s * 62) if s > 0 else (s * 62, s * 16)
        parts += palace_block(M, 'ch_mahal%d' % (s + 1), x0, -46, x1, 4, 26, storeys=2, sides='swe', arcade_sides=('e' if s < 0 else 'w') + 's',
                              pediment=None, min_z=CH_WALL)
        # portico pediment on the courtyard side
        tri = prism_from_outline('ch_mped', [(-8, 0), (8, 0), (0, 4.0)], 1.4, center=(0, 0, 28.4), mat=hi)
        place([tri], -s * math.pi / 2, (s * 16, -21, 0))
        parts.append(tri)
    # low front block (offices) behind the gate
    parts += palace_block(M, 'ch_front', -26, -66, 26, -48, 20, storeys=2, sides='n', arcade_sides='n', min_z=CH_WALL, bal_sides='nwe')
    debug_parts(parts)
    common.finish(A, parts, tile=10.0, tex=256, ao_dist=9.0, ground_dirt=5.0)
    cols = [common.col_box('wf', (CH_W, t, CH_WALL), (0, -hy + t / 2, 0)), common.col_box('wb', (CH_W, t, CH_WALL), (0, hy - t / 2, 0)),
            common.col_box('ww', (t, CH_D, CH_WALL), (-hx + t / 2, 0, 0)), common.col_box('we', (t, CH_D, CH_WALL), (hx - t / 2, 0, 0)),
            common.col_box('gate', (GW, GD, GH), (0, gy, 0)), common.col_box('ctow', (8, 8, 30), (0, gy, GH)), common.col_box('khil', (72, 36, 34), (0, 48, 0)),
            common.col_box('m1', (46, 50, 26), (-39, -21, 0)), common.col_box('m2', (46, 50, 26), (39, -21, 0))]
    common.col_join(cols, 'chowmahalla')
    A.preview = common.shots(front_az=-30, el=16, extra=[
        {'name': 'gate', 'size': 320, 'samples': 14, 'view': {'az': -15, 'el': 8, 'fov': 40, 'target': (0, -85, 22), 'dist': 90}}])


def bpy_remove(objs):
    import bpy
    for o in objs:
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if d is not None and d.users == 0:
            bpy.data.meshes.remove(d)


# =========================================================================== 3. Falaknuma
FK_W, FK_D = 110.0, 170.0
FK_BASE = 30.0           # palace floor on the hilltop (raised from the procedural 14: the palace on its hill)


def mound(M, seed=7):
    """the rocky hill under the palace: a jittered super-ellipse mound with a flat top at FK_BASE,
    sloping to the ground at the footprint edge; the front (-Y) slope is long (the approach)."""
    import random
    rnd = random.Random(seed)
    seg = 22

    def ring(rx, ry, cy, z, jit, p=3.0):
        pts = []
        for i in range(seg):
            a = TAU * i / seg
            c, s = math.cos(a), math.sin(a)
            k = (abs(c) ** p + abs(s) ** p) ** (-1 / p)
            j = 1.0 + rnd.uniform(-jit, jit)
            pts.append((rx * c * k * j, cy + ry * s * k * j, z + (rnd.uniform(-0.6, 0.6) if jit else 0)))
        return pts
    rings = [ring(FK_W / 2 - 0.5, FK_D / 2 - 0.5, 0.0, 0.0, 0.0, 2.6),
             ring(FK_W / 2 - 2.5, 78.0, 5.0, 9.5, 0.04, 2.8),
             ring(FK_W / 2 - 4.0, 70.0, 9.0, 20.0, 0.05, 3.0),
             ring(FK_W / 2 - 5.5, 62.0, 14.0, FK_BASE - 0.6, 0.02, 3.2),
             ring(FK_W / 2 - 6.5, 61.0, 14.0, FK_BASE, 0.0, 3.4)]
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    for a, b in zip(vr, vr[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((a[i], a[j], b[j], b[i]))
    top = bm.faces.new(vr[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.obj_from_bm(bm, 'fk_mound', M['rock'])
    ob.data.materials.append(M['pave'])
    for p in ob.data.polygons:
        if p.normal.z > 0.99:
            p.material_index = 1
    return ob


def fk_block(M, name, L, D, h, storeys=2, front_arcade=False, lit=(), ends=True, bal_sides='nsew', urns=0, back=True, pitch=3.0, slim=False):
    """a straight palace block centred at the origin, length L along X, depth D along Y, facing -Y:
    tall dark window decals on the long faces (verandah arches on the front when front_arcade),
    optional end windows, top cornice, balustrade (gaps outside) and `urns` urns along the front."""
    pl, hi, dk = M['plaster'], M['trim'], M['dark']
    out = [box(name, (L, D, h + (2.6 if slim else 0.0)), (0, 0, 0), pl, base=True)]
    sh = h / storeys
    n = max(2, int(L / 6.2))
    for side in ((0, 1) if back else (0,)):
        ops, lits = [], []
        for k in range(storeys):
            z = k * sh + sh * 0.16
            if front_arcade and side == 0:
                ops += window_row(n, L - 2, k * sh + 0.4, (L - 2) / n * 0.66, sh * 0.8, 'round', 0.14)
            else:
                for i, p in enumerate(window_row(n, L - 3, z, 2.2, sh * 0.62, 'round', 0.14)):
                    (lits if (k, i, side) in lit else ops).append(p)
        objs = [planes(name + '_op', ops, dk, facing=(0, -1, 0))]
        if lits:
            objs.append(planes(name + '_lit', lits, M['lit'], facing=(0, -1, 0)))
        for o in objs:
            if side == 0:
                place([o], 0, (0, -D / 2, 0))
            else:
                place([o], math.pi, (0, D / 2, 0))
        out += objs
    if ends:
        for s in (-1, 1):
            ops = [fpoly(arch(2.2, sh * 0.62, 'round', n=3), 0, k * sh + sh * 0.16, -0.14) for k in range(storeys)]
            o = planes(name + '_end', ops, dk, facing=(0, -1, 0))
            place([o], s * math.pi / 2, (s * L / 2, 0, 0))
            out.append(o)
    if slim:
        # parapet is part of the wall: balustrade gaps + a cornice band as decals on the faces
        for side in ((0, 1) if 'n' in bal_sides else (0,)):
            nn = max(2, int(L / pitch))
            st = L / nn
            ps = [fpoly(rect(st * 0.3, 1.2), -L / 2 + st * (i + 0.5), h + 0.65, -0.06) for i in range(nn)]
            objs = [planes(name + '_sg', ps, M['gap'], facing=(0, -1, 0)), planes(name + '_sc', [fpoly(rect(L, 0.8), 0, h - 0.6, -0.05)], hi, facing=(0, -1, 0))]
            place(objs, 0 if side == 0 else math.pi, (0, -D / 2 if side == 0 else D / 2, 0))
            out += objs
        return out
    out.append(box(name + '_cor', (L + 1.2, D + 1.2, 1.0), (0, 0, h - 1.0), hi, base=True))
    out += bal_ring(name + '_bal', -L / 2, -D / 2, L / 2, D / 2, h, 2.6, hi, dark=M['gap'], sides=bal_sides, pitch=pitch)
    for i in range(urns):
        x = -L / 2 + L * i / max(1, urns - 1)
        out.append(lathe(name + '_urn', [(0.55, h + 2.6), (0.8, h + 3.5), (0.0, h + 4.8)], seg=4, mat=hi, loc=(x, -D / 2 + 0.45, 0), close_bottom=False))
    return out


@kit.asset('falaknuma', 'landmark', landmark='falaknuma_palace', face='e', footprint=[110, 170], height=76.0,
           fit='footprint', floodlit=True)
def falaknuma(A):
    """Falaknuma Palace on its rocky hill (closed in 2003): white neo-Palladian main block with a
    tall Corinthian portico and pediment, balustrades with urns, scorpion plan (two curved wings
    sweeping back + the long tail), dark tall windows (a few lit at night), the closed gate."""
    M = {
        'plaster': kit.material('lime_plaster', 'fk_white', base='#efe9dc', var=0.05, grain=0.03, streaks=0.35, grime=0.45),
        'trim': kit.material('whitewash', 'fk_trim', base='#fbf8f0'),
        'gap': kit.material('lime_plaster_shadow', 'fk_gap', base='#b8b2a6', streaks=0.0),
        'dark': kit.material('lime_plaster_shadow', 'fk_glass', base='#5a6066', streaks=0.0, var=0.05, grime=0.15),
        'lit': kit.material('clock_face', 'window@night', base='#3a2a18', emit='#ffcf80', emit_strength=0.0),
        'rock': kit.material('granite_grey', 'fk_rock', base='#7a6d60', var=0.16, grain=0.14, specks=0.5, grime=0.5),
        'pave': kit.material('sandstone', 'fk_pave', base='#cbbfa8', var=0.06),
        'iron': kit.material('iron_black', 'fk_iron'),
    }
    pl, hi, dk = M['plaster'], M['trim'], M['dark']
    B = FK_BASE
    parts = [mound(M)]
    # boulders on the slopes
    parts += rocks('fk_boulder', [(-50, -40, 4.0), (33, -72, 2.6)], M['rock'], seed=3)
    # ---- palace on the terrace
    pal = []
    # central main block (two tall storeys) + portico of tall columns with a pediment
    CB_W, CB_D, CB_H = 40.0, 30.0, 32.0
    cy0 = -16.0                          # main block front face
    main = fk_block(M, 'fk_main', CB_W, CB_D, CB_H, 2, lit={(0, 1, 1), (1, 4, 0)}, urns=4)
    place(main, 0, (0, cy0 + CB_D / 2, B))
    pal += main
    # attic storey over the centre (higher, gives the central mass)
    att = fk_block(M, 'fk_attic', 22.0, 18.0, 8.0, 1, ends=False, back=False, bal_sides='s', urns=0)
    place(att, 0, (0, cy0 + 12.0, B + CB_H))
    pal += att
    # portico: 6 columns full height, entablature, pediment
    py = cy0 - 9.0
    col_h = CB_H - 4.0
    for i in range(6):
        x = (i - 2.5) * 6.0
        pal.append(lathe('fk_col', [(1.2, B + 1.2), (1.0, B + col_h - 2.0), (1.65, B + col_h - 0.2), (1.65, B + col_h)],
                         seg=8, mat=hi, loc=(x, py, 0), close_bottom=False))
    pal.append(box('fk_pstep', (40.0, 12.0, 1.2), (0, py + 2.0, B), hi, base=True))
    pal.append(box('fk_pent', (38.0, 11.0, 3.0), (0, py + 3.5, B + col_h), hi, base=True))
    ped = prism_from_outline('fk_ped', [(-20, 0), (20, 0), (0, 7.5)], 2.0, center=(0, py + 0.2, B + col_h + 3.0), mat=hi)
    pal.append(ped)
    pal.append(prism_from_outline('fk_pedroof', [(-20, 0), (20, 0), (0, 7.5)], 9.0, center=(0, py + 5.6, B + col_h + 3.0), mat=pl))
    pal.append(planes('fk_tymp', [fpoly([(-15.0, 0.8), (15.0, 0.8), (0, 5.8)], 0, B + col_h + 3.0, py - 0.82)], M['plaster'], facing=(0, -1, 0)))
    for x in (0,):
        pal.append(lathe('fk_acro', [(0.6, B + col_h + 3.0 + (7.0 if x == 0 else 0)), (0.85, B + col_h + 3.6 + (7.0 if x == 0 else 0)), (0.5, B + col_h + 4.8 + (7.0 if x == 0 else 0)), (0.0, B + col_h + 5.6 + (7.0 if x == 0 else 0))],
                         seg=4, mat=hi, loc=(x, py - 0.5, 0), close_bottom=False))
    # flanking two-storey blocks with arcaded verandahs
    for s in (-1, 1):
        fl = fk_block(M, 'fk_flank', 16.0, 24.0, 26.0, 2, front_arcade=True, back=False, urns=0)
        place(fl, 0, (s * (CB_W / 2 + 8.0), cy0 + 14.0, B))
        pal += fl
    # the curved wings (claws) sweeping back on both sides: segments along an arc
    wing_pts = [(35.0, -2.0), (43.0, 18.0), (42.5, 40.0), (33.0, 58.0)]
    for s in (-1, 1):
        for k in range(len(wing_pts) - 1):
            (xa, ya), (xb, yb) = wing_pts[k], wing_pts[k + 1]
            xa, xb = s * xa, s * xb
            L = math.hypot(xb - xa, yb - ya) + 1.2
            ang = math.atan2(yb - ya, xb - xa)
            seg = fk_block(M, 'fk_wing', L, 10.0, 24.0, 2, front_arcade=False, lit={(1, 1, 0)} if (k == 1 and s > 0) else (), ends=False, bal_sides='s', pitch=3.4, back=False, slim=True)
            # outward face (-Y of the block) must look away from the courtyard
            rot = ang + (0.0 if s > 0 else math.pi)
            place(seg, rot, ((xa + xb) / 2, (ya + yb) / 2, B))
            pal += seg
    # the tail: a long rear wing on the axis, ending in a rounded pavilion
    tail = fk_block(M, 'fk_tail', 44.0, 12.0, 22.0, 2, ends=False, bal_sides='ns', pitch=3.4, slim=True)
    place(tail, math.pi / 2, (0, 24.0 + 22.0, B))
    pal += tail
    pal.append(lathe('fk_tailend', [(8.0, B), (8.0, B + 24.6), (0, B + 24.6)], seg=12, mat=pl, loc=(0, 66.0, 0), close_bottom=False))
    # small domed belvedere over the main block's back (the silhouette's crown)
    parts += pal
    # ---- approach ramp up the front slope + the closed gate at the foot
    parts.append(ramp_strip(M, B))
    gy = -FK_D / 2 + 2.0
    gate = []
    for s in (-1, 1):
        gate.append(box('fk_gpier', (4.0, 4.0, 15.0), (s * 9.5, gy, 0), hi, base=True))
        gate.append(box('fk_gcap', (5.0, 5.0, 1.0), (s * 9.5, gy, 15.0), hi, base=True))
        gate.append(lathe('fk_gdome', [(1.9, 16.0), (1.6, 18.2), (0.0, 20.6)], seg=8, mat=pl, loc=(s * 9.5, gy, 0), close_bottom=False))
        gate.append(box('fk_gwall', (FK_W / 2 - 13.0, 1.6, 5.0), (s * (11.5 + (FK_W / 2 - 13.0) / 2), gy + 1.0, 0), pl, base=True))
    bars = [[(x - 0.18, 0, 0.4), (x + 0.18, 0, 0.4), (x + 0.18, 0, 12.6), (x - 0.18, 0, 12.6)] for x in [(-7.0 + i * 14.0 / 12) for i in range(13)]]
    bars += [[(-7.5, 0, z), (7.5, 0, z), (7.5, 0, z + 0.5), (-7.5, 0, z + 0.5)] for z in (1.6, 6.0, 11.4)]
    for (yy, f) in ((-0.05, -1),):
        gate.append(planes('fk_gbars', [[(x, gy + yy, z) for (x, _, z) in b] for b in bars], M['iron'], facing=(0, f, 0)))
    parts += gate
    debug_parts(parts)
    common.finish(A, parts, tile=10.0, tex=256, ao_dist=9.0, ground_dirt=4.0)
    cols = [common.col_box('hill', (FK_W - 12, 120, B), (0, 14, 0)), common.col_box('main', (CB_W + 32, CB_D, CB_H), (0, cy0 + CB_D / 2, B)),
            common.col_box('wL', (12, 60, 24), (-43, 29, B)), common.col_box('wR', (12, 60, 24), (43, 29, B)), common.col_box('tail', (14, 52, 22), (0, 46, B))]
    common.col_join(cols, 'falaknuma')
    A.preview = common.shots(front_az=-32, el=14, extra=[
        {'name': 'palace', 'size': 320, 'samples': 14, 'view': {'az': -20, 'el': 10, 'fov': 36, 'target': (0, -10, 52), 'dist': 120}}])


def ramp_strip(M, B):
    """sloped approach road from the gate (front foot) up the front slope to the terrace edge,
    kept just above the mound's jittered rings"""
    prof = [(-FK_D / 2 + 3.0, 0.3), (-78.0, 4.6), (-73.0, 10.6), (-67.0, 16.4), (-61.0, 21.2), (-55.0, 26.0), (-48.5, B + 0.7), (-45.0, B + 0.2)]
    w = 7.0
    bm = bmesh.new()
    rows = [(bm.verts.new((-w / 2, y, z)), bm.verts.new((w / 2, y, z))) for (y, z) in prof]
    for (a, b), (c, d) in zip(rows, rows[1:]):
        bm.faces.new((a, b, d, c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.obj_from_bm(bm, 'fk_road', M['pave'])
    for f in ob.data.polygons:
        if f.normal.z < 0:
            f.flip()
    return ob


# =========================================================================== 4. Purani Haveli
PH_W, PH_D = 66.0, 128.0
PH_H = 27.0                 # two storeys + parapet base


def ph_facade(M, name, L, h, storeys=2, kind='verandah'):
    """decals for a facade of length L facing -Y at y=0: verandah arches with pilasters (kind
    'verandah') or green louvred windows with white surrounds ('windows')."""
    hi, dk, gr = M['trim'], M['dark'], M['green']
    sh = h / storeys
    ops, trs, grn = [], [], []
    if kind == 'verandah':
        n = max(2, int(round(L / 6.0)))
        st = (L - 1.6) / n
        for k in range(storeys):
            for i in range(n):
                x = -(L - 1.6) / 2 + st * (i + 0.5)
                ops.append(fpoly(arch(st * 0.7, sh * 0.78, 'round', n=3, spring=0.7), x, k * sh + 0.5, -0.14))
                # green door glimpsed in the verandah (every other bay)
                if i % 2 == 0:
                    grn.append(fpoly(rect(st * 0.3, sh * 0.48), x, k * sh + 0.5, -0.2))
            for i in range(n + 1):
                trs.append(fpoly(rect(0.9, sh * 0.92), -(L - 1.6) / 2 + st * i, k * sh, -0.08))
    else:
        n = max(2, int(round(L / 6.5)))
        st = (L - 2) / n
        for k in range(storeys):
            for i in range(n):
                x = -(L - 2) / 2 + st * (i + 0.5)
                grn.append(fpoly(rect(2.6, sh * 0.54), x, k * sh + sh * 0.17, -0.1))
    out = [planes(name + '_op', ops, dk, facing=(0, -1, 0)) if ops else None,
           planes(name + '_tr', trs, hi, facing=(0, -1, 0)) if trs else None,
           planes(name + '_gr', grn, gr, facing=(0, -1, 0)) if grn else None]
    return [o for o in out if o is not None]


def ph_block(M, name, x0, y0, x1, y1, h, faces):
    """a block with decal facades: faces = {side: kind}"""
    pl, hi, dk = M['plaster'], M['trim'], M['dark']
    out = [box(name, (x1 - x0, y1 - y0, h + 2.8), ((x0 + x1) / 2, (y0 + y1) / 2, 0), pl, base=True)]
    for (rot, (cx, cy), L, s) in faces_of_rect(x0, y0, x1, y1, ''.join(faces.keys())):
        objs = ph_facade(M, name + s, L - 0.4, h - 1.0, 2, faces[s])
        # balustrade above the cornice: gap + coping decals on the parapet
        nn = max(2, int(L / 4.4))
        st = L / nn
        ps = [fpoly(rect(st * 0.3, 1.3), -L / 2 + st * (i + 0.5), h + 0.75, -0.06) for i in range(nn)]
        objs.append(planes(name + s + '_g', ps, M['gap'], facing=(0, -1, 0)))
        objs.append(planes(name + s + '_c', [fpoly(rect(L, 0.5), 0, h + 2.3, -0.05)], hi, facing=(0, -1, 0)))
        out += place(objs, rot, (cx, cy, 0))
    # floor band and cornice
    out.append(box(name + '_band', (x1 - x0 + 0.8, y1 - y0 + 0.8, 0.6), ((x0 + x1) / 2, (y0 + y1) / 2, (h - 1.0) / 2 - 0.3), hi, base=True))
    out.append(box(name + '_cor', (x1 - x0 + 1.4, y1 - y0 + 1.4, 1.0), ((x0 + x1) / 2, (y0 + y1) / 2, h - 1.0), hi, base=True))
    return out


@kit.asset('purani_haveli', 'landmark', landmark='purani_haveli', face='w', footprint=[66, 128], height=42.0,
           fit='footprint', floodlit=True)
def purani_haveli(A):
    """Purani Haveli (Nizam's Museum since 2000): U-shaped two-storey European-style palace open to
    the street (-Y): two long wings and the main block at the back with a higher central entrance
    block; arcaded verandahs on the courtyard, green louvred windows outside, balustraded parapet,
    the front gate wall with the museum board."""
    M = {
        'plaster': kit.material('lime_plaster', 'ph_plaster', base='#e8cf96', var=0.07, grain=0.04, streaks=0.45),
        'trim': kit.material('whitewash', 'ph_trim', base='#f6f0e0'),
        'gap': kit.material('lime_plaster_shadow', 'ph_gap', base='#8c7a5c', streaks=0.0),
        'dark': kit.material('lime_plaster_shadow', 'ph_dark', base='#3b3328', streaks=0.0, var=0.05, grime=0.2),
        'green': kit.material('wood_green', 'ph_green', base='#3d6b4a'),
        'iron': kit.material('iron_black', 'ph_iron'),
    }
    pl, hi = M['plaster'], M['trim']
    parts = []
    hx, hy = PH_W / 2, PH_D / 2
    WG = 20.0                 # wing width (x)
    BACK = 22.0               # main block depth (y)
    H = PH_H - 3.0            # cornice height (parapet adds 2.8)
    # wings: verandahs on the courtyard side and the street end, windows outside
    parts += ph_block(M, 'ph_wingL', -hx, -hy + 4, -hx + WG, hy - BACK, H, {'e': 'verandah', 's': 'verandah', 'w': 'windows'})
    parts += ph_block(M, 'ph_wingR', hx - WG, -hy + 4, hx, hy - BACK, H, {'w': 'verandah', 's': 'verandah', 'e': 'windows'})
    # main block at the back (verandah to the courtyard, windows behind)
    parts += ph_block(M, 'ph_main', -hx, hy - BACK, hx, hy, H, {'s': 'verandah', 'n': 'windows', 'w': 'windows', 'e': 'windows'})
    # higher central entrance block projecting into the courtyard, with a pediment-like parapet
    ex0, ex1, ey0 = -9.0, 9.0, hy - BACK - 6.0
    parts.append(box('ph_entr', (18.0, BACK + 6.0 - 4.0, H + 12.0), (0, (ey0 + hy - 4.0) / 2, 0), pl, base=True))
    ent = ph_facade(M, 'ph_entf', 17.0, H + 10.0, 2, 'verandah')
    ent.append(planes('ph_entpil', [fpoly(rect(1.4, H + 11.0), x, 0, -0.1) for x in (-8.3, -2.9, 2.9, 8.3)], hi, facing=(0, -1, 0)))
    parts += place(ent, 0, (0, ey0, 0))
    parts.append(box('ph_entcor', (19.4, 1.6, 1.0), (0, ey0 + 0.5, H + 11.0), hi, base=True))
    parts += place(bal('ph_entbal', 18.6, H + 12.0, 2.8, hi, 0.9, M['gap']), 0, (0, ey0 + 0.45, 0))
    parts.append(prism_from_outline('ph_entped', [(-6, 0), (6, 0), (0, 3.6)], 3.0, center=(0, ey0 + 1.5, H + 14.8), mat=hi))
    for s in ():
        parts.append(lathe('ph_entfin', [(0.8, H + 9.8), (0.8, H + 11.2), (1.0, H + 11.6), (0.0, H + 13.2)], seg=6, mat=hi, loc=(s * 8.6, ey0 + 0.5, 0), close_bottom=False))
    # front gate wall between the wings, central arched gateway (iron gate) and the museum board
    gw = PH_W - 2 * WG
    gy = -hy + 1.0
    gwall = box('ph_gwall', (gw, 1.6, 9.0), (0, gy, 0), pl, base=True)
    kit.boolean(gwall, prism_from_outline('ph_gcut', arch_outline(9.0, 5.0, 4.5, 'round', n=6), 4.0, center=(0, gy, 0.0)))
    parts.append(gwall)
    parts.append(box('ph_gcap', (gw + 0.6, 2.2, 0.6), (0, gy, 9.0), hi, base=True))
    for s in (-1, 1):
        parts.append(box('ph_gpier', (2.4, 2.6, 12.0), (s * 6.0, gy, 0), hi, base=True))
        parts.append(lathe('ph_gurn', [(0.7, 12.0), (1.1, 12.8), (0.6, 14.0), (0.0, 14.8)], seg=6, mat=hi, loc=(s * 6.0, gy, 0), close_bottom=False))
    bars = [fpoly(rect(0.3, 8.6), -4.0 + i * 8.0 / 7, 0.4, gy - 0.1) for i in range(8)]
    bars += [fpoly(rect(9.0, 0.4), 0, z, gy - 0.12) for z in (1.6, 8.6)]
    parts.append(planes('ph_bars', bars, M['iron'], facing=(0, -1, 0)))
    sign = kit.signboard('ph_sign', "NIZAM'S MUSEUM", 13.0, 2.6, loc=(0, gy - 0.95, 11.0), fg='#fff4d8', bg='#7a1a1a')
    parts.append(sign)
    debug_parts(parts)
    common.finish(A, parts, tile=10.0, tex=256, ao_dist=8.0, ground_dirt=4.0)
    cols = [common.col_box('wl', (WG, PH_D - BACK - 4, H), (-hx + WG / 2, (-hy + 4 + hy - BACK) / 2, 0)),
            common.col_box('wr', (WG, PH_D - BACK - 4, H), (hx - WG / 2, (-hy + 4 + hy - BACK) / 2, 0)),
            common.col_box('main', (PH_W, BACK + 6, H + 3), (0, hy - (BACK + 6) / 2, 0)), common.col_box('entr', (18, BACK + 2, H + 12), (0, hy - (BACK + 6) / 2 - 2, 0))]
    common.col_join(cols, 'purani_haveli')
    A.preview = common.shots(front_az=-28, el=18, extra=[
        {'name': 'court', 'size': 320, 'samples': 14, 'view': {'az': -6, 'el': 12, 'fov': 42, 'target': (0, 0, 14), 'dist': 110}}])
