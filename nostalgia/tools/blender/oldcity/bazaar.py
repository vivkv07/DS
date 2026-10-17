"""NOSTALGIA — tools/blender/oldcity/bazaar.py — Old City bazaar buildings (ARCHITECTURE §21).

    /home/user/.venvs/blender/bin/python tools/blender/build_all.py bangle_shop pathergatti_arcade madina_building

bangle_shop        — the Laad Bazaar shopfront kit (draw 'bangle_shop', 4 shops share it): a
                     two-storey lime-plaster front split into two narrow shop bays with rolled-up
                     tin shutters, a raised gadda floor and a stepped plinth, walls and counters
                     glittering with stacked lac / glass bangles (red, green, gold, pink, blue),
                     hanging bangle bunches, a tube light, striped cloth awnings, painted boards,
                     an upper floor with a wooden jharokha and a grilled arched window, wires,
                     a meter box and a Sintex tank on the roof.
pathergatti_arcade — Pathergatti (c. 1911, Nizam VII): the grey-pink dressed-granite shop row
                     with a ground-floor arcade of pointed Qutb Shahi arches on square piers,
                     shops behind (dark recesses, cloth bolts, boards), a chajja on brackets,
                     pairs of pointed arched windows with jaali bars, a parapet of leaf merlons
                     with pier finials and domed corner chhatris.
madina_building    — the Madina Building at Madina circle: a three-storey cream lime-plaster
                     Indo-Saracenic block, arcaded shops below, arched windows with green
                     shutters, cast-iron balconies, cornice bands, a merlon parapet with domed
                     corner turrets and a taller arched central gable; 'HOTEL MADINA' and cloth
                     store boards.

Conventions: front = -Y, origin on the ground at the footprint centre, width along X = the
worlddata footprint[0] (lm.d for faces e / w).
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import box, cylinder, material, prism_from_outline, arch_outline, lathe, tube
from oldcity import common
from oldcity.common import col_box, col_join


# =========================================================================== local helpers
def _mesh(name, build, mats):
    """build(bm, midx) -> fills a bmesh; mats: list of materials (slot order)."""
    bm = bmesh.new()
    build(bm)
    ob = kit.obj_from_bm(bm, name, mats[0])
    for m in mats[1:]:
        ob.data.materials.append(m)
    return ob


def quad(name, pts, mat):
    """one single-sided quad (counter-clockwise seen from the front)"""
    return _mesh(name, lambda bm: bm.faces.new([bm.verts.new(p) for p in pts]), [mat])


def wall_quad(name, x0, x1, z0, z1, y, mat, facing=-1):
    """a quad in the XZ plane at y, facing -Y (facing=-1) or +Y"""
    if facing < 0:
        pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
    else:
        pts = [(x1, y, z0), (x0, y, z0), (x0, y, z1), (x1, y, z1)]
    return quad(name, pts, mat)


def side_quad(name, y0, y1, z0, z1, x, mat, facing=1):
    """a quad in the YZ plane at x, facing +X (facing=1) or -X"""
    if facing > 0:
        pts = [(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)]
    else:
        pts = [(x, y1, z0), (x, y0, z0), (x, y0, z1), (x, y1, z1)]
    return quad(name, pts, mat)


def bx(name, x0, x1, y0, y1, z0, z1, mat):
    """axis box from bounds"""
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat, base=True)


def banded(name, x, y, r, z0, bands, seg=6, rot=0.0, cap=True, taper=0.9):
    """a vertical stack of bangles: an n-gon column whose bands carry their own material; each
    band tapers slightly (r at its bottom, r*taper at its top) so the stacks read as bulges."""
    mats = []
    for (_, m) in bands:
        if m not in mats:
            mats.append(m)

    def build(bm):
        angs = [rot + 2 * math.pi * k / seg for k in range(seg)]
        z = z0
        last = None
        for i, (h, m) in enumerate(bands):
            A = [bm.verts.new((x + r * math.cos(a), y + r * math.sin(a), z)) for a in angs]
            z += h
            Bv = [bm.verts.new((x + r * taper * math.cos(a), y + r * taper * math.sin(a), z)) for a in angs]
            for k in range(seg):
                f = bm.faces.new((A[k], A[(k + 1) % seg], Bv[(k + 1) % seg], Bv[k]))
                f.material_index = mats.index(m)
            last = Bv
        if cap:
            f = bm.faces.new(last)
            f.material_index = mats.index(bands[-1][1])
    return _mesh(name, build, mats)


def flat_grill(name, x0, x1, z0, z1, y, mat, bars=6, bw=0.14, rails=3):
    """a window grill as front-facing flat bars (cheap; read from the street)"""
    def build(bm):
        def q(a, b, c, d):
            bm.faces.new([bm.verts.new(p) for p in ((a, y, c), (b, y, c), (b, y, d), (a, y, d))])
        for i in range(bars):
            x = x0 + (x1 - x0) * (i + 0.5) / bars
            q(x - bw / 2, x + bw / 2, z0, z1)
        for j in range(rails):
            z = z0 + (z1 - z0) * j / (rails - 1)
            q(x0, x1, z - bw / 2, z + bw / 2)
    return _mesh(name, build, [mat])


def sawtooth_column(name, x0, x1, y, z0, bands, lean=0.35, facing=-1):
    """flat bangle stack on a back wall: a strip of quads, each band tilted (top forward) so the
    sun picks out each stack of rings; bands = [(h, mat), ...]. Faces -Y."""
    mats = []
    for (_, m) in bands:
        if m not in mats:
            mats.append(m)

    def build(bm):
        z = z0
        for (h, m) in bands:
            yb, yt = y, y - lean
            f = bm.faces.new([bm.verts.new(p) for p in ((x0, yb, z), (x1, yb, z), (x1, yt, z + h), (x0, yt, z + h))])
            f.material_index = mats.index(m)
            z += h
    return _mesh(name, build, mats)


def strip(name, x0, x1, p0, p1, t, mat):
    """a thin slab from (y0, z0) to (y1, z1) spanning x0..x1 (awnings, sloped chajjas)"""
    (y0, z0), (y1, z1) = p0, p1
    L = math.hypot(y1 - y0, z1 - z0)
    o = box(name, (x1 - x0, L, t), (0, 0, 0), mat)
    o.rotation_euler = (math.atan2(z1 - z0, y1 - y0), 0, 0)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    kit.apply_transform(o)
    return o


def awning(name, x0, x1, y0, z0, y1, z1, drop, mats, n):
    """striped cloth awning (double-sided): sloped top from (y0, z0) to (y1, z1) + a hanging front
    valance `drop` deep; n stripes alternating mats."""
    def build(bm):
        for i in range(n):
            xa = x0 + (x1 - x0) * i / n
            xb = x0 + (x1 - x0) * (i + 1) / n
            pts = [(xa, y0, z0), (xb, y0, z0), (xb, y1, z1), (xa, y1, z1)]
            val = [(xa, y1, z1), (xb, y1, z1), (xb, y1 - 0.05, z1 - drop), (xa, y1 - 0.05, z1 - drop)]
            for poly in (pts, val):
                vs = [bm.verts.new(p) for p in poly]
                f1 = bm.faces.new(vs)
                f1.material_index = i % 2
                vs2 = [bm.verts.new(p) for p in reversed(poly)]
                f2 = bm.faces.new(vs2)
                f2.material_index = i % 2
    # orient: top faces upward (+Z) — the first face (xa..xb, y0->y1 going -Y) is CCW from above
    return _mesh(name, build, mats)


def recess_cutters(specs, depth, fy, axis='Y'):
    """arched (or square) cutters for blind recesses: specs [(x, z0, w, spring, rise, kind)] in a
    wall facing -Y whose front face is at fy; the cutter goes `depth` into the wall."""
    cs = []
    for (x, z0, w, spring, rise, kind) in specs:
        if kind == 'rect':
            ol = [(-w / 2, 0), (w / 2, 0), (w / 2, spring), (-w / 2, spring)]
        else:
            ol = arch_outline(w, spring, rise, kind, n=5)
        cs.append(prism_from_outline('cut', ol, depth + 2.0, center=(x, fy - 1.0 + depth / 2, z0)))
    c = kit.join(cs, 'recess_cut')
    if axis == 'X':
        common.rot_z([c], math.pi / 2)
    return c


def arch_panel(name, x, z0, w, spring, rise, y, mat, kind='pointed', depth=0.1):
    """an arch-shaped panel (dark back of a recess, shutters, frames) facing -Y at y"""
    ol = arch_outline(w, spring, rise, kind, n=5) if kind != 'rect' else [(-w / 2, 0), (w / 2, 0), (w / 2, spring), (-w / 2, spring)]
    return prism_from_outline(name, ol, depth, center=(x, y + depth / 2, z0), mat=mat)


def arch_frame(name, x, z0, w, spring, rise, y, mat, kind='pointed', border=0.5, depth=0.14):
    """a moulded frame round an arched opening: an outer arch plate with the opening cut out;
    front face at y (facing -Y)"""
    o = arch_panel(name, x, z0 - border * 0.8, w + 2 * border, spring + border * 0.8, rise + border, y, mat, kind, depth)
    kit.boolean(o, recess_cutters([(x, z0, w, spring, rise, kind)], depth + 0.5, y - 0.2))
    return o


def arch_ring(name, x, z0, w, spring, rise, y, mat, kind='pointed', border=0.5, n=5):
    """a flat moulded frame round an arched opening (one coplanar strip: cheap, shared verts),
    facing -Y at y"""
    inner = arch_outline(w, spring, rise, kind, n=n)
    outer = arch_outline(w + 2 * border, spring + border * 0.3, rise + border * 0.9, kind, n=n)
    outer = [(px, pz - border * 0.6) if i in (0, len(outer) - 1) else (px, pz) for i, (px, pz) in enumerate(outer)]

    def build(bm):
        vi = [bm.verts.new((x + px, y, z0 + pz)) for (px, pz) in inner]
        vo = [bm.verts.new((x + px, y, z0 + pz)) for (px, pz) in outer]
        for i in range(len(inner) - 1):
            bm.faces.new((vo[i], vi[i], vi[i + 1], vo[i + 1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            if f.normal.y > 0:
                f.normal_flip()
    return _mesh(name, build, [mat])


def shelf(name, x0, x1, y0, y1, z0, z1, mat):
    """a shelf board: front + top faces only"""
    def build(bm):
        for poly in (((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)),
                     ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))):
            bm.faces.new([bm.verts.new(p) for p in poly])
    return _mesh(name, build, [mat])


def dome(name, r, h, loc, mat, seg=8, finial=None):
    """small bulbous dome on a ring (chhatris, turrets)"""
    prof = kit.onion_profile(r, h, neck=0.8, bulge=1.06, tip=0.1, n=5)
    return lathe(name, prof, seg=seg, mat=mat, loc=loc, close_bottom=False)


def chhatri(name, cx, cy, z, s, h, M, post_mat, dome_mat, seg=8):
    """a small square kiosk: plinth, four posts, a chajja slab, a dome"""
    parts = [bx(name + '_pl', cx - s, cx + s, cy - s, cy + s, z, z + 0.6, post_mat)]
    p = 0.28 * s
    ph = h * 0.45
    for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        px, py = cx + sx * (s - p), cy + sy * (s - p)
        parts.append(bx(name + '_po', px - p, px + p, py - p, py + p, z + 0.6, z + 0.6 + ph, post_mat))
    zc = z + 0.6 + ph
    parts.append(bx(name + '_ch', cx - s * 1.25, cx + s * 1.25, cy - s * 1.25, cy + s * 1.25, zc, zc + 0.35, post_mat))
    parts.append(dome(name + '_dm', s * 0.95, h - ph - 0.95 - 0.6, (cx, cy, zc + 0.35), dome_mat, seg=seg))
    return parts


def wire(name, p0, p1, sag, mat, n=5, r=0.07):
    pts = []
    for i in range(n + 1):
        t = i / n
        p = Vector(p0).lerp(Vector(p1), t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(p)
    return tube(name, pts, r, seg=3, mat=mat, cap=False)


def finish(A, objs, **kw):
    """common.finish + make 'UVMap' the active / render UV layer again (signboards add 'SignUV'
    first; once finish_tiled drops it no layer is active and the exporter writes texCoord -1)."""
    out = common.finish(A, objs, **kw)
    for o in A.objects():
        if o.type == 'MESH' and o.data.uv_layers.get('UVMap'):
            uv = o.data.uv_layers['UVMap']
            uv.active = True
            uv.active_render = True
    return out


def kit_shade(h, f):
    h = h.lstrip('#')
    return '#%02x%02x%02x' % tuple(int(int(h[i:i + 2], 16) * f) for i in (0, 2, 4))


def bangle_mats():
    """glossy lac / glass bangle colours (reflector-like gloss, slight metal glitter)"""
    def bm_(n, base, **k):
        d = dict(base=base, rough=0.3, metal=0.25, var=0.12, grain=0.05, scale=6.0, emit=kit_shade(base, 0.22))
        d.update(k)
        return material('reflector_red', n, **d)
    return {
        'red': bm_('bangle_red', '#c3122a'),
        'green': bm_('bangle_green', '#138a3c'),
        'gold': material('gold_leaf', 'bangle_gold', base='#e0ad32', rough=0.3, metal=0.6, scale=6.0, emit='#3a2a08'),
        'pink': bm_('bangle_pink', '#e23a8e'),
        'blue': bm_('bangle_blue', '#2443c8'),
        'maroon': bm_('bangle_maroon', '#7c0f2c'),
    }


# =========================================================================== bangle shop
@kit.asset('bangle_shop', 'landmark', draw='bangle_shop', face='n', footprint=[22, 16], height=30.0, fit='footprint', floodlit=False)
def build(A):
    """Laad Bazaar bangle shop: two narrow bays (X -11..11, Y -8..8, front -Y), 30 u tall."""
    M = common.mats(
        interior=('lime_plaster_shadow', dict(base='#a8865e', var=0.1)),
        dark=('lime_plaster_shadow', dict(base='#2a2420', var=0.05, grime=0.1)),
        gadda=('whitewash', dict(base='#ece6d8')),
        awn_red=('cloth', dict(base='#c21f2a', region=0)),
        awn_yel=('cloth', dict(base='#efbd2c', region=0)),
        steel=('steel', dict(base='#8c9096')),
        tank=('plastic_black', dict(base='#1d1d20')),
    )
    M['bulbs@night'] = material('lamp_lens', 'bulbs@night', base='#ffd070', emit='#ffb040')
    M['tube@night'] = material('lamp_lens', 'tubelight@night', base='#eef4f0', emit='#e6f2ff')
    B = bangle_mats()
    BL = [B['red'], B['green'], B['gold'], B['pink'], B['blue'], B['maroon']]
    rng = random.Random(1001)
    W, D = 11.0, 8.0          # half width, half depth
    FY = -5.6                 # facade plane
    BACK = 1.6                # interior back wall (bangle wall)
    GF = 12.0                 # ground floor top (upper mass underside)
    ROOF = 27.0
    TOP = 30.0
    FL = 1.6                  # raised shop floor
    bays = [(-10.2, -0.55), (0.55, 10.2)]
    objs = []
    # ---- shell
    objs.append(bx('back', -W, W, BACK, D, 0, ROOF, M['plaster']))
    objs.append(bx('upper', -W, W, FY, BACK, GF, ROOF, M['plaster']))
    objs.append(bx('pier_l', -W, -10.2, FY, BACK, 0, GF, M['plaster']))
    objs.append(bx('pier_r', 10.2, W, FY, BACK, 0, GF, M['plaster']))
    objs.append(bx('pier_c', -0.55, 0.55, FY, BACK, 0, GF, M['plaster']))
    objs.append(bx('pilaster_c', -0.8, 0.8, FY - 0.3, FY + 0.1, 0, GF, M['plaster_hi']))
    for x in (-W, W):
        objs.append(bx('pilaster_e', x - 0.15 if x > 0 else x - 0.15, x + 0.15, FY - 0.3, FY + 0.1, 0, ROOF, M['plaster_hi']))
    # lintel beam with the shutter boxes, plinth step
    objs.append(bx('lintel', -W - 0.1, W + 0.1, FY - 0.35, FY + 0.05, GF - 1.4, GF, M['plaster_hi']))
    objs.append(bx('step', -W, W, -D + 0.3, FY, 0, 0.8, M['granite']))
    # ---- per bay: floor, gadda, counter, bangle wall, rods, bunches, shutter, awning, sign
    signs = [('BANGLE STORES', '#7a1a3a', '#ffe23a'), ('LAC CHUDI CENTRE', '#1d4e8a', '#fff4d8')]
    for bi, (x0, x1) in enumerate(bays):
        xc = (x0 + x1) / 2
        objs.append(bx('floor', x0, x1, FY, BACK, 0, FL, M['plaster_hi']))
        objs.append(bx('gadda', x0 + 0.3, x1 - 0.3, -1.6, BACK - 0.2, FL, FL + 0.45, M['gadda']))
        # interior: dark-ish back-wall frame + shelves of bangle stacks (sawtooth bands)
        objs.append(wall_quad('inwall', x0, x1, FL, GF, BACK - 0.02, M['interior']))
        cols = 4
        cw = (x1 - x0 - 0.6) / cols
        for t, (z0, z1) in enumerate(((FL + 0.6, 5.0), (5.35, 8.0), (8.35, 10.9))):
            objs.append(shelf('shelf', x0, x1, BACK - 1.1, BACK, z0 - 0.35, z0, M['wood']))
            for c in range(cols):
                cx0 = x0 + 0.3 + c * cw + 0.08
                nb = 4
                hb = (z1 - z0) / nb
                bands = [(hb, BL[rng.randrange(len(BL))]) for _ in range(nb)]
                objs.append(sawtooth_column('stack', cx0, cx0 + cw - 0.16, BACK - 0.05, z0, bands, lean=0.45))
        objs.append(shelf('shelf_top', x0, x1, BACK - 1.1, BACK, 10.9, 11.2, M['wood']))
        # side walls of the bay lined with bangle bands too (one strip each)
        for sx, face in ((x0 + 0.02, 1), (x1 - 0.02, -1)):
            for k, z in enumerate((FL + 0.8, 5.4, 8.4)):
                m = BL[rng.randrange(len(BL))]
                objs.append(side_quad('sidestack', -2.2, BACK - 1.2, z, z + 2.3, sx, m, facing=face))
        # glass-topped display counter at the front with bangle rods
        objs.append(bx('counter', x0 + 0.5, x1 - 0.5, FY + 0.35, FY + 1.9, FL, FL + 2.4, M['wood']))
        objs.append(bx('counter_top', x0 + 0.4, x1 - 0.4, FY + 0.25, FY + 2.0, FL + 2.4, FL + 2.6, M['plaster_hi']))
        for k in range(2):
            rx = x0 + 2.2 + k * (x1 - x0 - 4.4)
            bands = [(0.7, BL[rng.randrange(len(BL))]) for _ in range(4)]
            objs.append(banded('rod', rx, FY + 1.1, 0.5, FL + 2.6, bands, seg=6, rot=math.pi / 6))
        # hanging glass-bangle bunches on strings from the lintel
        for k in range(2):
            hx = xc + (k - 0.5) * 3.4 + rng.uniform(-0.3, 0.3)
            zt = GF - 1.4
            bands = [(0.7, BL[rng.randrange(len(BL))]), (0.7, B['gold'])]
            objs.append(banded('bunch', hx, FY + 0.6, 0.45, zt - 2.6, bands, seg=6, cap=True, taper=1.12))
            objs.append(quad('string', [(hx - 0.05, FY + 0.6, zt - 1.2), (hx + 0.05, FY + 0.6, zt - 1.2), (hx + 0.05, FY + 0.6, zt), (hx - 0.05, FY + 0.6, zt)], M['iron']))
        # tube light under the lintel
        objs.append(bx('tube', xc - 2.6, xc + 2.6, FY + 0.6, FY + 0.85, GF - 1.75, GF - 1.5, M['tube@night']))
        # bulb string along the lintel (glows at night)
        objs.append(bx('bulbs', x0 + 0.2, x1 - 0.2, FY - 0.75, FY - 0.6, GF - 1.75, GF - 1.6, M['bulbs@night']))
        # rolled-up tin shutter + guide channels
        objs.append(cylinder('shutter', 0.75, x1 - x0, (xc, FY - 0.55, GF - 0.75), seg=8, mat=M['tin'], axis='X', base=False))
        for gx in (x0 + 0.1, x1 - 0.1):
            objs.append(wall_quad('guide', gx - 0.14, gx + 0.14, 0.8, GF - 1.4, FY - 0.03, M['tin']))
        # striped cloth awning sloping down to the street
        objs.append(awning('awning', x0 - 0.2, x1 + 0.2, FY - 0.4, GF + 0.6, -D + 0.2, GF - 0.7, 0.6, [M['awn_red'], M['awn_yel']], 5))
        # painted signboard above the awning
        t, bgc, fgc = signs[bi]
        objs.append(kit.signboard('sign', t, x1 - x0 - 0.2, 2.6, (xc, FY - 0.25, GF + 2.2), depth=0.3, fg=fgc, bg=bgc, frame_mat=M['wood'], px=320))
    # ---- upper storey: cornice under the windows, arched windows, jharokha, grill, chajja, parapet
    objs.append(bx('band1', -W - 0.1, W + 0.1, FY - 0.5, FY, GF + 3.7, GF + 4.2, M['plaster_hi']))
    up = objs[1]
    wins = [(-5.4, 16.8, 3.4, 3.8, 2.2, 'pointed'), (5.4, 16.8, 3.4, 3.8, 2.2, 'pointed')]
    kit.boolean(up, recess_cutters(wins, 0.9, FY))
    for (x, z0, w, sp, ri, kd) in wins:
        objs.append(arch_panel('winback', x, z0, w, sp, ri, FY + 0.85, M['dark'], kd))
        objs.append(arch_ring('winframe', x, z0, w, sp, ri, FY - 0.06, M['plaster_hi'], kd, border=0.55))
        objs.append(bx('sill', x - w / 2 - 0.6, x + w / 2 + 0.6, FY - 0.45, FY, z0 - 0.6, z0, M['plaster_hi']))
    # left: wooden jharokha balcony (green painted) on brackets
    jx0, jx1, jy = -8.3, -2.5, FY - 1.7
    objs.append(bx('jh_base', jx0, jx1, jy, FY, 15.8, 16.4, M['wood_green']))
    objs.append(bx('jh_rail', jx0, jx1, jy, jy + 0.3, 16.4, 18.6, M['wood_green']))
    for x in (jx0 + 0.15, jx1 - 0.15):
        objs.append(bx('jh_post', x - 0.15, x + 0.15, jy, jy + 0.3, 18.6, 22.6, M['wood']))
    objs.append(strip('jh_roof', jx0 - 0.4, jx1 + 0.4, (FY, 23.8), (jy - 0.5, 22.5), 0.25, M['tin']))
    # right: iron grill over the window
    objs.append(flat_grill('grill', 3.75, 7.05, 16.8, 20.6, FY - 0.3, M['iron'], bars=5, rails=3))
    # sloped tin chajja over the upper floor + cornice + parapet
    objs.append(strip('chajja', -W - 0.2, W + 0.2, (FY + 0.1, 25.4), (FY - 1.5, 24.6), 0.22, M['plaster_hi']))
    objs.append(bx('cornice', -W - 0.15, W + 0.15, FY - 0.45, D, ROOF - 0.5, ROOF, M['plaster_hi']))
    objs.append(bx('par_f', -W, W, FY, FY + 0.6, ROOF, TOP - 0.4, M['plaster']))
    objs.append(bx('par_l', -W, -W + 0.6, FY, D, ROOF, TOP - 0.4, M['plaster']))
    objs.append(bx('par_r', W - 0.6, W, FY, D, ROOF, TOP - 0.4, M['plaster']))
    objs.append(bx('coping', -W - 0.1, W + 0.1, FY - 0.15, FY + 0.75, TOP - 0.4, TOP, M['plaster_hi']))
    # roof: Sintex tank and a TV antenna
    objs.append(cylinder('tank', 1.5, 2.8, (6.5, 4.5, ROOF), seg=8, mat=M['tank']))
    objs.append(tube('antenna', [(-7, 5, ROOF), (-7, 5, ROOF + 7)], 0.08, seg=4, mat=M['iron']))
    objs.append(tube('ant_x', [(-8.6, 5, ROOF + 6.2), (-5.4, 5, ROOF + 6.2)], 0.06, seg=4, mat=M['iron']))
    # wires across the front + a meter box
    objs.append(wire('wire1', (-W, FY - 0.6, 22.4), (W, FY - 0.6, 22.8), 1.6, M['iron']))
    objs.append(wire('wire2', (-W, FY - 0.9, 21.6), (W, FY - 0.9, 21.2), 1.3, M['iron']))
    objs.append(bx('meter', -W + 0.1, -W + 0.75, FY - 0.6, FY - 0.25, 6.0, 7.4, M['steel']))
    # back: two small windows (lived-in upper floor)
    for x in (-5, 5):
        objs.append(wall_quad('backwin', x - 1.4, x + 1.4, 16.5, 21.5, D + 0.02, M['dark'], facing=1))
    finish(A, objs, tile=8.0, tex=256, ao_dist=6.0, ground_dirt=3.0, smooth_angle=62.0)
    col_join([col_box('back', (2 * W, D - BACK, ROOF), (0, (D + BACK) / 2, 0)),
              col_box('upper', (2 * W, BACK - FY, ROOF - GF), (0, (BACK + FY) / 2, GF)),
              col_box('pl', (0.8, BACK - FY, GF), (-W + 0.4, (BACK + FY) / 2, 0)),
              col_box('pr', (0.8, BACK - FY, GF), (W - 0.4, (BACK + FY) / 2, 0))], 'bangle_shop')
    A.notes.append('COL_bangle_shop: camera-ray proxy (back block, upper floor, side piers)')
    A.preview = common.shots(front_az=-30, el=10, fov=34, extra=[
        {'name': 'close', 'size': 320, 'samples': 16, 'view': {'az': -12, 'el': 4, 'fov': 22, 'pad': 0.55}}])
