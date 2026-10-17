"""NOSTALGIA — tools/blender/oldcity/civic.py — the Musi-bank civic landmarks (Afzalgunj cluster) and
Purana Pul (ARCHITECTURE §21; imported by tools/blender/landmarks_oldcity.py).

    /home/user/.venvs/blender/bin/python tools/blender/build_all.py high_court osmania_hospital \
        state_central_library salar_jung_museum puranapul_arches

high_court            Telangana/AP High Court (1920, Vincent Esch): banded red-and-white sandstone, long
                      symmetrical front, great arched portal in a pishtaq, huge central dome on a drum,
                      banded minarets, side domes, corner pavilions with domes, chhatris, arcaded verandah.
osmania_hospital      Osmania General Hospital (1925, Vincent Esch): very long weathered buff three-storey
                      block, tall central tower with a big dome and corner chhatris, end pavilions with
                      domes, arched windows with chajjas, ground-floor arcades, jaali parapets, chhatris.
state_central_library Asafia State Central Library (1936): cream-yellow; a tall rectangular frontispiece
                      with a great arched portal, a dome behind, wings with tall arched windows between
                      pilasters, cornices, balustraded roof with corner chhatris, wide entrance steps.
salar_jung_museum     Salar Jung Museum (1968): long crescent two-storey buff building embracing a forecourt,
                      central entrance block with an arched portico and the painted name, pierced parapets.
puranapul_arches      Purana Pul (1578): the bridge's two side elevations along the road deck (the deck
                      itself is the ground renderer's road 'puranapul', kind bridge, w 30, flat at y 0.08):
                      22 pointed arches on piers with upstream cutwaters, string course, parapets, refuges.

Conventions: 1 u = 1 world unit, Z up, front = -Y, origin on the ground at the footprint centre; model
width along X = lm.w (all these face 's'), depth along Y = lm.d. Lean vertex budget: openings are flat
arched panels (one n-gon each) in front of the walls, mouldings are boxes, domes are lathes.
"""
import math
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import box, lathe, onion_profile, arch_outline, prism_from_outline
from oldcity import common as C


# =========================================================================== helpers
OUT = {'S': (0, -1, 0), 'N': (0, 1, 0), 'E': (1, 0, 0), 'W': (-1, 0, 0)}


class Face:
    """A vertical wall plane. side S/N/E/W (outward normal), c = the plane coordinate (y for S/N, x for
    E/W). Local coords: u along the wall (left to right seen from outside), z up, off outward."""

    def __init__(self, side, c):
        self.side, self.c = side, c
        self.out = OUT[side]

    def p(self, u, z, off=0.0):
        c = self.c
        if self.side == 'S':
            return (u, c - off, z)
        if self.side == 'N':
            return (-u, c + off, z)
        if self.side == 'E':
            return (c + off, u, z)
        return (c - off, -u, z)

    def slab(self, u0, u1, z0, z1, depth, mat, off0=0.0, name='slab'):
        """a box on the wall: u0..u1, z0..z1, from off0 outwards by depth"""
        uc, oc = (u0 + u1) / 2, off0 + depth / 2
        x, y, _ = self.p(uc, 0, oc)
        du = abs(u1 - u0)
        size = (du, depth, z1 - z0) if self.side in 'SN' else (depth, du, z1 - z0)
        return box(name, size, (x, y, z0), mat, base=True)


class Polys:
    """Collects flat n-gons per material into one mesh each (cheap window / opening panels)."""

    def __init__(self):
        self.d = {}

    def add(self, mat, pts, outward):
        self.d.setdefault(mat.name, (mat, []))[1].append(([tuple(p) for p in pts], Vector(outward)))

    def objects(self, name='panels'):
        out = []
        for key, (mat, polys) in self.d.items():
            bm = bmesh.new()
            for pts, nv in polys:
                vs = [bm.verts.new(p) for p in pts]
                f = bm.faces.new(vs)
                f.normal_update()
                if f.normal.dot(nv) < 0:
                    f.normal_flip()
            out.append(kit.obj_from_bm(bm, '%s_%s' % (name, key), mat))
        return out


def arch_panel(P, face, mat, u, z, w, spring, rise, off, kind='pointed', n=3):
    o = arch_outline(w, spring, rise, kind, n)
    P.add(mat, [face.p(u + x, z + zz, off) for (x, zz) in o], face.out)


def arch_win(P, face, u, z, w, spring, rise, dark, frame_mat=None, f=0.5, off=0.2, kind='pointed', n=3):
    """an arched opening: dark panel + (optional) a proud frame panel around it"""
    if frame_mat is not None:
        arch_panel(P, face, frame_mat, u, z - f * 0.6, w + 2 * f, spring + f * 0.6, rise + f * 0.9, off, kind, n)
    arch_panel(P, face, dark, u, z, w, spring, rise, off + 0.06, kind, n)


def rect_panel(P, face, mat, u0, u1, z0, z1, off):
    P.add(mat, [face.p(u0, z0, off), face.p(u1, z0, off), face.p(u1, z1, off), face.p(u0, z1, off)], face.out)


def band(x0, x1, y0, y1, z0, z1, mat, grow=0.15, name='band'):
    """a moulding band wrapped round a block: four side quads only (no hidden top / bottom)"""
    x0, x1, y0, y1 = x0 - grow, x1 + grow, y0 - grow, y1 + grow
    bm = bmesh.new()
    lo = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0))]
    hi = [bm.verts.new(p) for p in ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    for f in bm.faces:
        f.normal_update()
        c = f.calc_center_median()
        if f.normal.dot(Vector((c.x - (x0 + x1) / 2, c.y - (y0 + y1) / 2, 0))) < 0:
            f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


DICE_NAMES = ('main', 'tower', 'endpav', 'frontis', 'pavilion', 'pishtaq', 'wing', 'centre', 'rear', 'wall')


def dice_walls(objs, zs=(2.5, 7.0, 15.0, 30.0, 45.0, 60.0)):
    """horizontal loop cuts through the big wall blocks only (vertical AO / ground-dirt samples on
    tall walls; without them a wall's AO is interpolated from its ground corners all the way up)"""
    for o in objs:
        if o is None or o.type != 'MESH' or o.name.split('.')[0] not in DICE_NAMES:
            continue
        kit.apply_modifiers(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        top = max(v.co.z for v in bm.verts)
        for z in zs:
            if 0.5 < z < top - 0.5:
                geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
                bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-4, plane_co=(0, 0, z), plane_no=(0, 0, 1))
        bm.to_mesh(o.data)
        bm.free()
    return objs


def strip_bottoms(objs):
    """delete downward faces lying on the ground (never seen)"""
    for o in objs:
        if o is None or o.type != 'MESH':
            continue
        kit.apply_modifiers(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        kill = [f for f in bm.faces if f.normal.z < -0.99 and max(v.co.z for v in f.verts) < 0.05]
        if kill and len(kill) < len(bm.faces):
            bmesh.ops.delete(bm, geom=kill, context='FACES')
            bm.to_mesh(o.data)
        bm.free()
    return objs


def blk(x0, x1, y0, y1, z0, z1, mat, name='block'):
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat, base=True)


def small_dome_profile(r, h, zb):
    return [(r, zb), (r * 1.07, zb + 0.22 * h), (r * 0.92, zb + 0.5 * h), (r * 0.52, zb + 0.8 * h), (r * 0.13, zb + h),
            (r * 0.1, zb + h * 1.08), (0.0, zb + h * 1.3)]


def small_dome(x, y, zb, r, h, mat, seg=8):
    return lathe('sdome', small_dome_profile(r, h, zb), seg=seg, mat=mat, loc=(x, y, 0), close_bottom=False)


def big_dome(x, y, zb, r, h, mat, seg=20, neck=0.95, bulge=1.1, tip=0.08, n=9):
    return lathe('dome', onion_profile(r, h, neck=neck, bulge=bulge, tip=tip, n=n, base_z=zb), seg=seg, mat=mat,
                 loc=(x, y, 0), close_bottom=False)


def finial(x, y, z, s, mat, seg=5):
    return lathe('finial', [(0.35 * s, z), (0.6 * s, z + 0.5 * s), (0.25 * s, z + 1.1 * s), (0.45 * s, z + 1.7 * s),
                            (0.12 * s, z + 2.4 * s), (0.0, z + 3.6 * s)], seg=seg, mat=mat, close_bottom=False)


def chhatri(x, y, z, r, h, post, dome, slab=None, seg=8):
    """an open domed kiosk: base slab, four posts, a chajja slab and a little dome"""
    slab = slab or post
    ph = h * 0.45
    parts = [box('ch_base', (2.3 * r, 2.3 * r, 0.5), (x, y, z), slab, base=True)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(kit.cylinder('ch_post', r * 0.17, ph, (x + sx * 0.8 * r, y + sy * 0.8 * r, z + 0.5), seg=4, mat=post, cap=False))
    parts.append(box('ch_roof', (2.6 * r, 2.6 * r, 0.4), (x, y, z + 0.5 + ph), slab, base=True))
    parts.append(small_dome(x, y, z + 0.9 + ph, r * 0.95, h * 0.5, dome, seg=seg))
    return parts


def pinnacle(x, y, z, r, h, mat, top=None, seg=8):
    """a guldasta: slim shaft with a ring and a little bulb"""
    prof = [(r, z), (r, z + h * 0.62), (r * 1.3, z + h * 0.68), (r * 0.8, z + h * 0.9), (0.0, z + h)]
    return lathe('pinnacle', prof, seg=seg, mat=mat, loc=(x, y, 0), close_bottom=False)


def banded_shaft(x, y, z0, z1, r0, r1, step, bh, mA, mB, seg=12):
    """a cylinder of alternating stone bands (mA body, mB thin bands every `step`)"""
    parts = []
    z = z0
    rr = lambda zz: r0 + (r1 - r0) * (zz - z0) / max(1e-6, z1 - z0)
    while z < z1 - 1e-3:
        za = min(z1, z + step - bh)
        parts.append(kit.cylinder('shaft', rr(z), za - z, (x, y, z), seg=seg, mat=mA, r2=rr(za), cap=False))
        if za < z1 - 1e-3:
            zb = min(z1, za + bh)
            parts.append(kit.cylinder('shaftb', rr(za) + 0.08, zb - za, (x, y, za), seg=seg, mat=mB, r2=rr(zb) + 0.08, cap=False))
            z = zb
        else:
            z = za
    return parts


def ring_panels(P, mat, x, y, n, r, z, w, spring, rise, phase=0.0, kind='pointed'):
    """n arched panels round a drum of radius r (facing out)"""
    o = arch_outline(w, spring, rise, kind, 3)
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        ca, sa = math.cos(a), math.sin(a)
        # local u along the tangent (-sin, cos), outward (cos, sin)
        pts = [(x + ca * r - sa * u, y + sa * r + ca * u, z + zz) for (u, zz) in o]
        P.add(mat, pts, (ca, sa, 0))


def lathe_ring(x, y, z, r, h, proj, mat, seg=20):
    """a thin moulding ring hugging a drum / dome at radius r"""
    return lathe('ring', [(r, z), (r + proj, z + h * 0.3), (r + proj, z + h * 0.7), (r, z + h)], seg=seg, mat=mat,
                 loc=(x, y, 0), close_top=False, close_bottom=False)


def mirror(objs):
    return C.mirror_x(objs)


def win_mat(name, base='#3b3226', emit='#ffcf80'):
    return kit.material('clock_face', name + '@night', base=base, emit=emit, emit_strength=0.0, var=0.04, grain=0.03, grime=0.1)


# =========================================================================== High Court
@kit.asset('high_court', 'landmark', landmark='high_court', face='s', footprint=[168, 62], height=71.5, fit='footprint', floodlit=True)
def high_court(A):
    M = C.mats(
        red=('sandstone', dict(base='#c4705a', var=0.1, grain=0.06, grime=0.35, dirt='#7a3a2c')),
        white=('whitewash', dict(base='#efe6d6', var=0.05, grain=0.04, streaks=0.2)),
        dark=('granite_grey', dict(base='#2c2522', var=0.05, grain=0.03, specks=0.0, grime=0.0)),
    )
    red, white, dark, gran = M['red'], M['white'], M['dark'], M['granite']
    lit = win_mat('hc_win', base='#3a2c22')
    P = Polys()
    parts = []
    XW, YF, YB, HR = 78.0, -22.0, 29.0, 30.0        # main block half width, front, back, roof
    # ---- plinth + main block + bands (red with white stripes)
    parts.append(blk(-82, 82, -24, 31, 0, 1.8, gran, 'plinth'))
    parts.append(blk(-XW, XW, YF, YB, 0, HR, red, 'main'))
    for (z0, z1) in ((1.8, 2.5), (8.0, 8.6), (14.0, 14.8), (27.2, 28.2)):
        parts.append(band(-XW, XW, YF, YB, z0, z1, white, 0.14))
    parts.append(band(-XW, XW, YF, YB, HR, HR + 2.2, white, 0.3, 'parapet'))
    # dense white stripes (flat decals) on the front wings, the pavilion front and the pishtaq
    def stripes(fc, spans, zs, off=0.06):
        for z in zs:
            for (u0, u1) in spans:
                rect_panel(P, fc, white, u0, u1, z, z + 0.55, off)
    ZST = [3.5 + 3.0 * i for i in range(9)]
    stripes(Face('S', YF), [(-74.0, -24.0), (24.0, 74.0)], ZST)
    stripes(Face('S', -28.5), [(-24.0, -13.5), (13.5, 24.0)], ZST)
    stripes(Face('S', -31.5), [(-13.5, -8.3), (8.3, 13.5)], ZST)
    stripes(Face('S', -31.5), [(-13.5, 13.5)], (31.0, 33.8, 37.6, 42.6), off=0.06)
    # chajjas (deep white sunshades) along the front and back
    for fc in (Face('S', YF), Face('N', YB)):
        parts.append(fc.slab(-XW, XW, 14.0, 14.6, 1.8, white, name='chajja'))
        parts.append(fc.slab(-XW, XW, 28.2, 28.8, 1.2, white, name='cornice'))
    # ---- corner pavilions (four), banded, domed
    for sx in (-1, 1):
        for (y0, y1) in ((-27.0, -16.0),):
            x0, x1 = (74.0, 84.0) if sx > 0 else (-84.0, -74.0)
            parts.append(blk(x0, x1, y0, y1, 0, 37.4, red, 'tower'))
            for (z0, z1) in ((1.8, 2.5), (14.0, 14.8), (27.2, 28.2)):
                parts.append(band(x0, x1, y0, y1, z0, z1, white, 0.14))
            parts.append(band(x0, x1, y0, y1, 36.0, 37.4, white, 0.35))
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            parts.append(kit.cylinder('tdrum', 4.0, 2.4, (cx, cy, 37.4), seg=8, mat=red, cap=False))
            parts.append(small_dome(cx, cy, 39.8, 4.1, 6.0, white, seg=8))
            # pavilion windows on its three free faces
            fs = [Face('S', y0)] if y0 < 0 else [Face('N', y1)]
            fs.append(Face('E', x1) if sx > 0 else Face('W', x0))
            for fc in fs:
                uc = cy if fc.side in 'EW' else cx
                uc = uc if fc.side in 'SE' else -uc
                nn = 3 if fc.side in 'SN' else 2
                arch_win(P, fc, uc, 3.2, 3.6, 6.0, 2.4, dark, None, off=0.2, n=nn)
                arch_win(P, fc, uc, 16.6, 3.0, 5.4, 2.0, lit, None, off=0.2, n=nn)
    # ---- central pavilion (projecting), its pishtaq and the great portal
    pav = blk(-24, 24, -28.5, 24, 0, 38.0, red, 'pavilion')
    fr = blk(-13.5, 13.5, -31.5, -28.0, 0, 45.0, red, 'pishtaq')
    AW, AS, AR = 16.0, 17.0, 11.0
    cut1 = prism_from_outline('portal', arch_outline(AW, AS, AR, 'pointed', n=7), 9.0, center=(0, -29.0, 1.8))
    cut2 = prism_from_outline('portal', arch_outline(AW, AS, AR, 'pointed', n=7), 9.0, center=(0, -29.0, 1.8))
    kit.boolean(pav, cut1)
    kit.boolean(fr, cut2)
    parts += [pav, fr]
    for (z0, z1) in ((1.8, 2.5), (14.0, 14.8), (27.2, 28.2), (32.6, 33.2)):
        parts.append(band(-24, 24, -28.5, 24, z0, z1, white, 0.14))
    parts.append(band(-24, 24, -28.5, 24, 38.0, 39.4, white, 0.3, 'pav_parapet'))
    for (z0, z1) in ((35.4, 36.0), (40.0, 40.6)):
        parts.append(band(-13.5, 13.5, -31.5, -28.0, z0, z1, white, 0.14))
    parts.append(band(-13.5, 13.5, -31.5, -28.0, 45.0, 46.2, white, 0.3))
    # white archivolt round the portal + spandrel roundels
    ring = prism_from_outline('archivolt', arch_outline(AW + 2.6, AS - 0.8, AR + 2.2, 'pointed', n=5), 0.6, center=(0, -31.8, 1.0), mat=white)
    kit.boolean(ring, prism_from_outline('av_cut', arch_outline(AW, AS, AR, 'pointed', n=7), 3.0, center=(0, -31.8, 0.5)))
    parts.append(ring)
    fp = Face('S', -31.5)
    for su in (-1, 1):
        rect_panel(P, fp, white, su * 12.6 - 1.4, su * 12.6 + 1.4, 30.0, 33.4, 0.1)
    # inside the portal: door, fanlight, gallery windows
    fin = Face('S', -24.0 + 4.5 - 4.5)   # recess back face: the cutter reaches y = -24.5
    fin = Face('S', -24.5)
    arch_win(P, fin, 0, 1.8, 7.0, 8.5, 4.0, dark, white, off=0.05)
    for u in (-4.5, 0, 4.5):
        arch_win(P, fin, u, 17.0, 2.6, 4.0, 1.6, lit, white, f=0.35, off=0.05)
    # pishtaq flanking windows (front of the pavilion beside the pishtaq)
    fpv = Face('S', -28.5)
    for su in (-1, 1):
        u = su * 18.8
        arch_win(P, fpv, u, 3.2, 4.4, 6.2, 2.6, dark, white, off=0.2)
        arch_win(P, fpv, u, 16.6, 3.4, 5.6, 2.2, lit, white, off=0.2)
        arch_win(P, fpv, u, 29.4, 3.0, 3.6, 1.6, dark, white, off=0.2)
        parts.append(fpv.slab(u - 4.0, u + 4.0, 14.8, 15.3, 1.5, white, name='pch'))
    # flanking banded minarets at the pavilion's front corners
    for sx in (-1, 1):
        mx, my = sx * 24.5, -29.0
        parts.append(kit.cylinder('shaft', 2.5, 46.0, (mx, my, 0), seg=8, mat=red, r2=2.0, cap=False))
        for zb in (4.0, 8.0, 12.0, 16.0, 20.0, 24.0, 28.0, 32.0, 36.0, 40.0):
            rb = 2.5 - 0.5 * zb / 46.0 + 0.1
            parts.append(kit.cylinder('shaftb', rb, 1.0, (mx, my, zb), seg=8, mat=white, cap=False))
        for zb in (46.0,):
            parts.append(lathe('balcony', [(2.2, zb - 0.9), (3.1, zb - 0.1), (3.1, zb + 0.5), (2.0, zb + 0.5)], seg=8, mat=white, loc=(mx, my, 0), close_bottom=False, close_top=True))
        parts.append(kit.cylinder('mkiosk', 1.7, 2.6, (mx, my, 46.5), seg=8, mat=red, cap=False))
        parts.append(small_dome(mx, my, 49.5, 1.8, 3.0, white, seg=8))
    # ---- the great central dome on a banded drum
    dx, dy = 0.0, -2.0
    parts.append(kit.cylinder('drum', 11.2, 6.8, (dx, dy, 40.6), seg=16, mat=red, cap=False))
    parts.append(lathe('drum_top', [(12.4, 47.6), (12.4, 48.5), (10.9, 48.5)], seg=16, mat=white, loc=(dx, dy, 0), close_bottom=False, close_top=False))
    ring_panels(P, dark, dx, dy, 8, 11.32, 41.4, 2.6, 3.4, 1.6, phase=math.pi / 8)
    DR, DH, DZ = 11.0, 17.0, 48.5
    parts.append(big_dome(dx, dy, DZ, DR, DH, white, seg=16, n=7))
    parts.append(finial(dx, dy, DZ + DH * 1.08, 1.2, M['gold']))
    # ---- side domes on the wings and roofline chhatris / pinnacles
    for sx in (-1, 1):
        x = sx * 50.0
        parts.append(kit.cylinder('sdrum', 5.6, 4.0, (x, 3.0, HR + 2.2), seg=10, mat=red, cap=False))
        parts.append(lathe('sdrum_top', [(6.4, HR + 6.2), (6.4, HR + 7.0), (5.4, HR + 7.0)], seg=10, mat=white, loc=(x, 3.0, 0), close_bottom=False, close_top=False))
        parts.append(big_dome(x, 3.0, HR + 7.0, 5.6, 9.0, white, seg=10, n=5))
    # pinnacles on the parapet piers (front and back)
    # ---- wing facades: ground-floor arcade, first-floor windows, top lights
    NB, STEP, U0 = 8, 6.25, 24.0
    for fc, front in ((Face('S', YF), True), (Face('N', YB), False)):
        for k in range(NB):
            for su in (-1, 1):
                u = su * (U0 + STEP * (k + 0.5))
                if front:
                    arch_win(P, fc, u, 2.5, 4.6, 6.6, 3.0, dark, white, off=0.2)
                    arch_win(P, fc, u, 16.4, 3.0, 5.6, 2.0, lit if k % 2 == 0 else dark, None, off=0.2)
        # pilasters between bays (front only)
        if front:
            pass
    # wing end faces (between the corner pavilions)
    # pavilion back face windows
    fb = Face('N', 24.0)
    # entrance steps
    parts.append(blk(-10.0, 10.0, -35.0, -31.0, 0, 1.2, gran, 'steps'))
    parts += P.objects('hc_panels')
    strip_bottoms(parts)
    dice_walls(parts)
    C.finish(A, parts, tile=10.0, tex=256, ao_samples=32, ao_dist=8.0, ground_dirt=5.0)
    # camera-ray proxies
    cols = [C.col_box('hc_main', (2 * XW, YB - YF, HR), (0, (YF + YB) / 2, 0)),
            C.col_box('hc_pav', (48, 52, 38), (0, -2.0, 0)),
            C.col_box('hc_drum', (22, 22, 24), (0, -2.0, 38)),
            C.col_box('hc_tw1', (10, 57, 36), (79, 1.5, 0)),
            C.col_box('hc_tw2', (10, 57, 36), (-79, 1.5, 0))]
    C.col_join(cols, 'high_court')
    A.notes.append('COL_high_court: camera-ray proxy boxes (main block, pavilion, drum, corner pavilions)')
    A.preview = C.shots(front_az=-30, el=12, fov=34, extra=[
        {'name': 'portal', 'size': 320, 'samples': 16, 'view': {'az': -12, 'el': 6, 'fov': 40, 'target': (0, -30, 26), 'dist': 110}}])


def kiosk(x, y, z, r, h, wall, dome, dark=None, P=None, seg=8):
    """a cheap closed chhatri: square base with dark arched openings (decals) + cornice + little dome"""
    parts = [blk(x - r, x + r, y - r, y + r, z, z + h * 0.5, wall, 'kiosk'),
             band(x - r, x + r, y - r, y + r, z + h * 0.5, z + h * 0.5 + 0.4, wall, 0.35, 'kiosk_eave')]
    if dark is not None and P is not None:
        for fc in (Face('S', y - r), Face('N', y + r), Face('E', x + r), Face('W', x - r)):
            uc = {'S': x, 'N': -x, 'E': y, 'W': -y}[fc.side]
            arch_panel(P, fc, dark, uc, z + 0.4, r * 1.1, h * 0.25, r * 0.6, 0.04, 'pointed', 1)
    parts.append(small_dome(x, y, z + h * 0.5 + 0.4, r * 1.02, h * 0.5, dome, seg=seg))
    return parts


# =========================================================================== Osmania General Hospital
@kit.asset('osmania_hospital', 'landmark', landmark='osmania_hospital', face='s', footprint=[194, 76], height=100.0, fit='footprint', floodlit=True)
def osmania_hospital(A):
    M = C.mats(
        buff=('lime_plaster', dict(base='#dcc9a0', var=0.1, grain=0.06, grime=0.45, streaks=0.55, dirt='#7a7058')),
        trim=('lime_plaster', dict(base='#e6dcc8', var=0.07, grain=0.05, grime=0.4, streaks=0.4, dirt='#7a7058')),
        dark=('granite_grey', dict(base='#2a2724', var=0.05, grain=0.03, specks=0.0, grime=0.0)),
        jaali=('granite_grey', dict(base='#5e574c', var=0.06, grain=0.1, specks=0.0, grime=0.0)),
    )
    buff, trim, dark, gran = M['buff'], M['trim'], M['dark'], M['granite']
    lit = win_mat('ogh_win', base='#3c3a30', emit='#fff0c8')
    P = Polys()
    parts = []
    XW, YF, YB, HR = 84.0, -26.0, 34.0, 45.0
    parts.append(blk(-96, 96, -28, 36, 0, 1.8, gran, 'plinth'))
    parts.append(blk(-XW, XW, YF, YB, 0, HR, buff, 'main'))
    for (z0, z1) in ((1.8, 2.6), (15.0, 15.7), (30.0, 30.7)):
        parts.append(band(-XW, XW, YF, YB, z0, z1, trim, 0.15))
    parts.append(band(-XW, XW, YF, YB, HR - 1.0, HR + 2.8, trim, 0.4, 'parapet'))
    for fc in (Face('S', YF), Face('N', YB)):
        parts.append(fc.slab(-XW, XW, 13.8, 14.4, 2.0, trim, name='chajja'))
        parts.append(fc.slab(-XW, XW, 28.8, 29.4, 2.0, trim, name='chajja'))
    # jaali parapet: dark pierced strips on the front parapet between the piers
    fp = Face('S', YF - 0.4)
    for k in range(7):
        for su in (-1, 1):
            u0 = 16.0 + k * 9.75
            rect_panel(P, fp, M['jaali'], su * (u0 + 0.8), su * (u0 + 8.95), HR + 0.1, HR + 2.2, 0.05)
    # ---- end pavilions (projecting, taller, domed)
    for sx in (-1, 1):
        x0, x1 = (XW, 97.0) if sx > 0 else (-97.0, -XW)
        x0, x1 = (x0 - 0.01, x1) if sx > 0 else (x0, x1 + 0.01)
        y0, y1 = -32.0, 30.0
        parts.append(blk(x0, x1, y0, y1, 0, 52.0, buff, 'endpav'))
        for (z0, z1) in ((1.8, 2.6), (15.0, 15.7), (30.0, 30.7)):
            parts.append(band(x0, x1, y0, y1, z0, z1, trim, 0.15))
        parts.append(band(x0, x1, y0, y1, 51.0, 53.6, trim, 0.4))
        cx = (x0 + x1) / 2
        fs, fe = Face('S', y0), (Face('E', x1) if sx > 0 else Face('W', x0))
        uc = cx
        arch_win(P, fs, uc, 2.6, 5.0, 6.8, 3.0, dark, trim, off=0.2)
        arch_win(P, fs, uc, 16.6, 3.4, 6.0, 2.0, lit, trim, off=0.2)
        arch_win(P, fs, uc, 31.6, 3.4, 6.0, 2.0, dark, trim, off=0.2)
        for u in (-2.0,):
            uu = u if fe.side == 'E' else -u
            for z in (16.6,):
                arch_win(P, fe, uu, z, 3.2, 6.0, 2.0, dark, None, off=0.2, n=2)
        # domed corner turret on the pavilion's front
        tx, ty = cx, -24.0
        parts.append(kit.cylinder('pdrum', 5.0, 4.0, (tx, ty, 53.6), seg=10, mat=buff, cap=False))
        parts.append(big_dome(tx, ty, 57.6, 6.0, 9.6, trim, seg=10, n=5))
    # ---- central tower block with the great porch
    TX, TY0, TY1, TH = 16.0, -38.0, 22.0, 84.0
    tower = blk(-TX, TX, TY0, TY1, 0, TH, buff, 'tower')
    kit.boolean(tower, prism_from_outline('porch', arch_outline(14.0, 14.0, 9.0, 'pointed', n=6), 12.0, center=(0, TY0, 1.8)))
    parts.append(tower)
    for (z0, z1) in ((1.8, 2.6), (30.0, 30.7), (45.0, 45.7), (57.5, 58.2)):
        parts.append(band(-TX, TX, TY0, TY1, z0, z1, trim, 0.15))
    parts.append(band(-TX, TX, TY0, TY1, TH - 1.0, TH + 2.6, trim, 0.4, 'tparapet'))
    av = prism_from_outline('archivolt', arch_outline(16.6, 13.4, 10.6, 'pointed', n=6), 0.6, center=(0, TY0 - 0.3, 1.0), mat=trim)
    kit.boolean(av, prism_from_outline('av_cut', arch_outline(14.0, 14.0, 9.0, 'pointed', n=6), 3.0, center=(0, TY0 - 0.3, 0.5)))
    parts.append(av)
    ft = Face('S', TY0)
    fin = Face('S', TY0 + 6.0)
    arch_win(P, fin, 0, 1.8, 6.0, 7.0, 3.4, dark, trim, f=0.4, off=0.05)
    for u in (-3.6, 3.6):
        arch_win(P, fin, u, 15.0, 2.2, 3.4, 1.4, lit, None, off=0.05)
    for z, m in ((32.0, lit), (47.0, dark), (59.4, dark)):
        for u in (-9.0, 0.0, 9.0):
            arch_win(P, ft, u, z, 3.4, 6.4 if z < 59 else 4.4, 2.0, m, trim if z < 59 else None, off=0.2)
    for z in (28.8, 43.8):
        parts.append(ft.slab(-TX, TX, z, z + 0.6, 2.0, trim, name='tch'))
    for fc in (Face('E', TX), Face('W', -TX)):
        uu = -26.0 if fc.side == 'E' else 26.0
        for z in (47.0, 59.4):
            arch_win(P, fc, uu, z, 3.2, 5.0, 1.8, dark, None, off=0.2, n=2)
    # tower top: corner chhatris, drum, big dome
    for qx in (-TX + 2.9, TX - 2.9):
        for qy in (TY0 + 2.9, TY1 - 2.9):
            parts += kiosk(qx, qy, TH + 2.6, 2.8, 8.0, buff, trim)
    dx, dy = 0.0, (TY0 + TY1) / 2
    parts.append(kit.cylinder('drum', 12.0, 7.0, (dx, dy, TH + 2.6), seg=16, mat=buff, cap=False))
    ring_panels(P, dark, dx, dy, 8, 12.1, TH + 3.6, 2.6, 3.0, 1.5, phase=-math.pi / 2)
    parts.append(lathe('drum_top', [(13.3, TH + 9.6), (13.3, TH + 10.4), (12.0, TH + 10.4)], seg=16, mat=trim, loc=(dx, dy, 0), close_bottom=True, close_top=False))
    parts.append(big_dome(dx, dy, TH + 10.4, 12.0, 18.0, trim, seg=16, n=7))
    parts.append(finial(dx, dy, TH + 10.4 + 18.0 * 1.08, 1.2, M['gold']))
    # ---- wing windows: ground-floor arcade, two floors of arched windows with chajjas
    NB, STEP, U0 = 7, 9.75, 16.0
    fF, fB = Face('S', YF), Face('N', YB)
    for k in range(NB):
        for su in (-1, 1):
            u = su * (U0 + STEP * (k + 0.5))
            arch_win(P, fF, u, 2.6, 5.0, 6.6, 3.0, dark, trim, off=0.2)
            arch_win(P, fF, u, 16.6, 3.2, 6.0, 2.0, lit if (k + (su > 0)) % 3 == 0 else dark, None, off=0.2)
            arch_win(P, fF, u, 31.6, 3.2, 6.0, 2.0, lit if (k + 2 * (su > 0)) % 4 == 1 else dark, None, off=0.2)
    # painted name board over the porch (plain lettering)
    parts.append(kit.signboard('ogh_sign', 'OSMANIA GENERAL HOSPITAL', 24.0, 2.4, (0, TY0 - 0.5, 25.6), depth=0.3,
                               fg='#1f5a40', bg='#f2efe4', frame_mat=trim, px=512))
    parts += P.objects('ogh_panels')
    strip_bottoms(parts)
    dice_walls(parts)
    C.finish(A, parts, tile=10.0, tex=256, ao_samples=32, ao_dist=8.0, ground_dirt=5.0)
    cols = [C.col_box('ogh_main', (2 * XW, YB - YF, HR), (0, (YF + YB) / 2, 0)),
            C.col_box('ogh_tower', (2 * TX, TY1 - TY0, TH), (0, (TY0 + TY1) / 2, 0)),
            C.col_box('ogh_dome', (20, 20, 26), (0, dy, TH)),
            C.col_box('ogh_e', (13, 62, 52), (90.5, -1.0, 0)),
            C.col_box('ogh_w', (13, 62, 52), (-90.5, -1.0, 0))]
    C.col_join(cols, 'osmania_hospital')
    A.notes.append('COL_osmania_hospital: camera-ray proxy boxes (main block, tower, dome, end pavilions)')
    A.preview = C.shots(front_az=-30, el=12, fov=34, extra=[
        {'name': 'tower', 'size': 320, 'samples': 16, 'view': {'az': -15, 'el': 8, 'fov': 40, 'target': (0, -30, 40), 'dist': 150}}])


def balustrade(P, face, u0, u1, z0, z1, gap, post, step=2.0, off=0.05):
    """a balustrade read from afar: a dark strip with light posts in front (flat panels)"""
    rect_panel(P, face, gap, u0, u1, z0, z1, off)
    n = max(1, int((u1 - u0) / step))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        rect_panel(P, face, post, u - 0.35, u + 0.35, z0, z1, off + 0.05)


# =========================================================================== State Central Library
@kit.asset('state_central_library', 'landmark', landmark='state_central_library', face='s', footprint=[100, 62], height=58.0, fit='footprint', floodlit=True)
def state_central_library(A):
    M = C.mats(
        cream=('lime_plaster', dict(base='#e8cf95', var=0.08, grain=0.05, grime=0.45, streaks=0.4, dirt='#7a6844')),
        trim=('lime_plaster', dict(base='#f7ecd2', var=0.05, grain=0.04, grime=0.35, streaks=0.3, dirt='#7a6c50')),
        dark=('granite_grey', dict(base='#2c2722', var=0.05, grain=0.03, specks=0.0, grime=0.0)),
    )
    cream, trim, dark, gran = M['cream'], M['trim'], M['dark'], M['granite']
    lit = win_mat('scl_win', base='#3c3326', emit='#ffd890')
    P = Polys()
    parts = []
    XW, YF, YB, HR = 46.0, -22.0, 29.0, 30.0
    parts.append(blk(-48, 48, -24, 31, 0, 2.4, gran, 'plinth'))
    parts.append(blk(-XW, XW, YF, YB, 0, HR, cream, 'main'))
    for (z0, z1) in ((2.4, 3.0), (15.0, 15.9)):
        parts.append(band(-XW, XW, YF, YB, z0, z1, trim, 0.15))
    parts.append(band(-XW, XW, YF, YB, 27.6, 29.0, trim, 0.6, 'cornice'))
    parts.append(band(-XW, XW, YF, YB, HR, HR + 0.6, trim, 0.2, 'bal_base'))
    parts.append(band(-XW, XW, YF, YB, HR + 2.6, HR + 3.2, trim, 0.25, 'bal_cap'))
    # balustrades (front + sides), pierced look
    for fc, (u0, u1) in ((Face('S', YF), (15.2, XW - 0.3)), (Face('S', YF), (-XW + 0.3, -15.2))):
        balustrade(P, fc, u0, u1, HR + 0.6, HR + 2.6, dark, trim, step=2.2)
    for fc in (Face('E', XW), Face('W', -XW)):
        balustrade(P, fc, YF + 0.3, YB - 0.3, HR + 0.6, HR + 2.6, dark, trim, step=3.0)
    # ---- the frontispiece with the great arched portal
    fx, fy0, fy1, fh = 15.0, -31.0, -21.9, 46.0
    fr = blk(-fx, fx, fy0, fy1, 0, fh, cream, 'frontis')
    kit.boolean(fr, prism_from_outline('portal', arch_outline(19.0, 21.0, 14.0, 'pointed', n=7), 12.0, center=(0, fy0, 2.4)))
    parts.append(fr)
    av = prism_from_outline('archivolt', arch_outline(22.0, 20.0, 16.2, 'pointed', n=7), 0.7, center=(0, fy0 - 0.35, 2.4), mat=trim)
    kit.boolean(av, prism_from_outline('av_cut', arch_outline(19.0, 21.0, 14.0, 'pointed', n=7), 3.0, center=(0, fy0 - 0.35, 1.0)))
    parts.append(av)
    parts.append(band(-fx, fx, fy0, fy1, 2.4, 3.0, trim, 0.15))
    parts.append(band(-fx, fx, fy0, fy1, fh - 3.0, fh - 1.8, trim, 0.6, 'fr_cornice'))
    parts.append(band(-fx, fx, fy0, fy1, fh - 0.4, fh + 0.6, trim, 0.3, 'fr_cap'))
    ff = Face('S', fy0)
    # rectangular frame round the arch (pilasters + lintel band) and the panels in the spandrels
    parts.append(ff.slab(-fx + 0.4, -fx + 2.4, 3.0, fh - 3.0, 0.5, trim, name='fr_pil'))
    parts.append(ff.slab(fx - 2.4, fx - 0.4, 3.0, fh - 3.0, 0.5, trim, name='fr_pil'))
    parts.append(ff.slab(-fx + 0.4, fx - 0.4, 34.6, 35.6, 0.5, trim, name='fr_lintel'))
    balustrade(P, ff, -fx + 2.8, fx - 2.8, 37.6, 41.6, dark, trim, step=2.4, off=0.05)
    # inside the portal: tall door, fanlight, gallery windows
    fin = Face('S', fy0 + 12.0 / 2)
    arch_win(P, fin, 0, 2.4, 7.0, 10.0, 4.0, dark, trim, f=0.4, off=0.05)
    for u in (-4.2, 0.0, 4.2):
        arch_win(P, fin, u, 19.5, 2.4, 3.6, 1.4, lit, None, off=0.05)
    parts.append(kit.signboard('scl_sign', 'STATE CENTRAL LIBRARY', 16.0, 1.8, (0, fy0 - 0.4, 32.4), depth=0.25,
                               fg='#6a1a14', bg='#f6ecd2', frame_mat=trim, px=512))
    for sx in (-1, 1):
        parts += kiosk(sx * (fx - 2.2), fy0 + 2.2, fh + 0.6, 2.0, 6.4, cream, trim, dark, P)
    # wide entrance steps
    parts.append(kit.stairs('steps', 30.0, 1.4, 0.8, 3, (0, -35.5, 0), gran))
    # ---- the dome behind the portal
    dx, dy = 0.0, 0.0
    parts.append(kit.cylinder('drum', 8.6, 6.0, (dx, dy, HR), seg=14, mat=cream, cap=False))
    ring_panels(P, dark, dx, dy, 7, 8.7, HR + 1.2, 2.2, 2.4, 1.3, phase=-math.pi / 2)
    parts.append(lathe('drum_top', [(9.6, HR + 6.0), (9.6, HR + 6.8), (8.4, HR + 6.8)], seg=14, mat=trim, loc=(dx, dy, 0), close_bottom=True, close_top=False))
    parts.append(big_dome(dx, dy, HR + 6.8, 8.4, 11.0, trim, seg=14, n=7, neck=1.0, bulge=1.05, tip=0.06))
    parts.append(finial(dx, dy, HR + 6.8 + 11.0 * 1.08, 0.8, M['gold']))
    # corner chhatris
    for qx in (-XW + 2.4, XW - 2.4):
        for qy in (YF + 2.4, YB - 2.4):
            parts += kiosk(qx, qy, HR + 3.2, 2.0, 6.0, cream, trim, dark, P)
    # ---- wings: tall ground-floor windows between pilasters, upper arched windows
    fF = Face('S', YF)
    NB, STEP, U0 = 4, 7.75, 15.0
    for k in range(NB):
        for su in (-1, 1):
            u = su * (U0 + STEP * (k + 0.5))
            arch_win(P, fF, u, 3.0, 3.6, 8.6, 2.2, lit if k == 1 else dark, trim, f=0.45, off=0.2)
            arch_win(P, fF, u, 17.4, 3.2, 6.4, 2.0, dark, trim, f=0.4, off=0.2)
    for k in range(NB + 1):
        for su in (-1, 1):
            u = su * (U0 + STEP * k)
            rect_panel(P, fF, trim, u - 0.7, u + 0.7, 3.0, 27.6, 0.12)
    parts.append(fF.slab(-XW, XW, 13.6, 14.2, 1.6, trim, name='chajja'))
    for fc in (Face('E', XW), Face('W', -XW)):
        for k in range(5):
            u = -18.0 + k * 9.0
            arch_win(P, fc, u, 3.0, 3.4, 8.0, 2.0, dark, None, off=0.2, n=2)
            arch_win(P, fc, u, 17.4, 3.0, 6.0, 1.8, dark, None, off=0.2, n=2)
    fB = Face('N', YB)
    for k in range(8):
        u = -38.5 + k * 11.0
        arch_win(P, fB, u, 17.4, 3.0, 6.0, 1.8, dark, None, off=0.2, n=1)
        arch_win(P, fB, u, 3.0, 3.4, 8.0, 2.0, dark, None, off=0.2, n=1)
    parts += P.objects('scl_panels')
    strip_bottoms(parts)
    dice_walls(parts)
    C.finish(A, parts, tile=10.0, tex=256, ao_samples=32, ao_dist=8.0, ground_dirt=5.0)
    cols = [C.col_box('scl_main', (2 * XW, YB - YF, HR + 3), (0, (YF + YB) / 2, 0)),
            C.col_box('scl_fr', (2 * fx, fy1 - fy0, fh), (0, (fy0 + fy1) / 2, 0)),
            C.col_box('scl_dome', (18, 18, 20), (0, 0, HR))]
    C.col_join(cols, 'state_central_library')
    A.notes.append('COL_state_central_library: camera-ray proxy boxes (main block, frontispiece, dome)')
    A.preview = C.shots(front_az=-30, el=12, fov=34, extra=[
        {'name': 'portal', 'size': 320, 'samples': 16, 'view': {'az': -10, 'el': 6, 'fov': 40, 'target': (0, -30, 22), 'dist': 90}}])


class GFace(Face):
    """a wall plane through (cx, cy) with outward normal (nx, ny); u runs along t = (-ny, nx)"""

    def __init__(self, cx, cy, nx, ny):
        self.cx, self.cy, self.nx, self.ny = cx, cy, nx, ny
        self.out = (nx, ny, 0)
        self.side = 'G'

    def p(self, u, z, off=0.0):
        return (self.cx - self.ny * u + self.nx * off, self.cy + self.nx * u + self.ny * off, z)


def arc_ring(name, cy, r0, r1, a0, a1, n, z0, z1, mat, faces='fbt'):
    """a curved wall segment round the centre (0, cy): radii r0 (front, towards the centre) .. r1,
    angles a0..a1 (0 = +Y), z0..z1. faces: f front, b back, t top, e end caps."""
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        s, c = math.sin(a), math.cos(a)
        rings.append([bm.verts.new((r * s, cy + r * c, z)) for (r, z) in ((r0, z0), (r0, z1), (r1, z1), (r1, z0))])
    for i in range(n):
        A, B = rings[i], rings[i + 1]
        if 'f' in faces:
            bm.faces.new((A[0], B[0], B[1], A[1]))
        if 't' in faces:
            bm.faces.new((A[1], B[1], B[2], A[2]))
        if 'b' in faces:
            bm.faces.new((A[2], B[2], B[3], A[3]))
    if 'e' in faces:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    # outward normals: front faces look at the centre, back faces away, top up
    for f in bm.faces:
        f.normal_update()
        cc = f.calc_center_median()
        d = Vector((cc.x, cc.y - cy, 0))
        rr = d.length
        if abs(f.normal.z) > 0.9:
            want = Vector((0, 0, 1))
        elif rr < (r0 + r1) / 2 - 1e-3:
            want = -d
        elif rr > (r0 + r1) / 2 + 1e-3:
            want = d
        else:
            continue
        if f.normal.dot(want) < 0:
            f.normal_flip()
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if False])
    return kit.obj_from_bm(bm, name, mat)


# =========================================================================== Salar Jung Museum
@kit.asset('salar_jung_museum', 'landmark', landmark='salar_jung_museum', face='s', footprint=[150, 76], height=60.0, fit='footprint', floodlit=False)
def salar_jung_museum(A):
    M = C.mats(
        buff=('lime_plaster', dict(base='#ead9b6', var=0.07, grain=0.05, grime=0.4, streaks=0.35, dirt='#7a6c50')),
        trim=('lime_plaster', dict(base='#f6eedc', var=0.05, grain=0.04, grime=0.3, streaks=0.25, dirt='#7a6c50')),
        dark=('granite_grey', dict(base='#1c1a17', var=0.04, grain=0.03, specks=0.0, grime=0.0)),
    )
    buff, trim, dark, gran = M['buff'], M['trim'], M['dark'], M['granite']
    lit = win_mat('sjm_win', base='#3c3428', emit='#ffd890')
    P = Polys()
    parts = []
    # crescent wing: front (concave) radius RF, back radius RB, centre in front of the building
    RF, RB, CY = 109.2, 127.2, -117.2
    TH = math.asin(75.0 / RB)
    NS, H1, H2 = 14, 18.0, 36.0
    parts.append(arc_ring('wall', CY, RF, RB, -TH, TH, NS, 0, H2 + 2.4, buff, 'fbte'))
    parts.append(arc_ring('plinth', CY, RF - 1.5, RB + 1.0, -TH - 0.01, TH + 0.01, NS, 0, 2.0, gran, 'fbte'))
    for (z0, z1, pr) in ((2.0, 2.7, 0.15), (H1 - 0.6, H1 + 0.4, 0.3)):
        parts.append(arc_ring('band', CY, RF - pr, RF, -TH, TH, NS, z0, z1, trim, 'f'))
    parts.append(arc_ring('chajja', CY, RF - 1.8, RF, -TH, TH, NS, H1 - 2.2, H1 - 1.7, trim, 'ft'))
    parts.append(arc_ring('cornice', CY, RF - 1.2, RF, -TH, TH, NS, H2 - 1.6, H2 - 0.6, trim, 'ft'))
    parts.append(arc_ring('parapet', CY, RF - 0.3, RF + 0.6, -TH, TH, NS, H2, H2 + 3.0, trim, 'ft'))
    # windows / arcade / pierced parapet along the curve (skipping the entrance block)
    for i in range(NS):
        a0 = -TH + 2 * TH * i / NS
        a1 = a0 + 2 * TH / NS
        am = (a0 + a1) / 2
        s, c = math.sin(am), math.cos(am)
        # the chord of this segment at the front radius (the flat face the panels sit on)
        rm = RF * math.cos((a1 - a0) / 2)
        fc = GFace(rm * s, CY + rm * c, -s, -c)
        if abs(rm * s) < 20.0:
            continue
        seg_len = 2 * RF * math.sin((a1 - a0) / 2)
        for k in (-1, 1):
            u = k * seg_len / 4
            arch_win(P, fc, u, 2.7, 5.5, 9.6, 3.3, dark, trim, f=0.5, off=0.25)
            arch_win(P, fc, u, H1 + 1.4, 4.3, 10.0, 2.6, lit if (i + k) % 5 == 0 else dark, None, off=0.25)
        # pierced parapet: dark strip with posts
        balustrade(P, fc, -seg_len / 2 + 0.3, seg_len / 2 - 0.3, H2 + 0.4, H2 + 2.6, dark, trim, step=seg_len / 4, off=0.95)
        # back face: one row of windows
        rb = RB
        fb = GFace(rb * math.cos((a1 - a0) / 2) * s, CY + rb * math.cos((a1 - a0) / 2) * c, s, c)
        arch_win(P, fb, 0, H1 + 1.6, 3.6, 8.4, 2.2, dark, None, off=0.25, n=1)
    # ---- rear hall behind the entrance (fills the plot's depth)
    parts.append(blk(-30, 30, 8.0, 38.0, 0, 32.0, buff, 'rear'))
    parts.append(band(-30, 30, 8.0, 38.0, 30.4, 32.6, trim, 0.35, 'rear_cap'))
    frh = Face('N', 38.0)
    for u in (-22.0, -11.0, 0.0, 11.0, 22.0):
        arch_win(P, frh, u, H1 + 1.6, 3.4, 8.0, 2.0, dark, None, off=0.2, n=1)
    # ---- the central entrance block and its arcaded portico
    EX, EY0, EY1, EH = 17.0, -29.0, 8.0, 54.0
    parts.append(blk(-EX, EX, EY0, EY1, 0, EH, buff, 'centre'))
    for (z0, z1) in ((2.0, 2.7), (H1 - 0.6, H1 + 0.4), (H2 - 1.6, H2 - 0.6)):
        parts.append(band(-EX, EX, EY0, EY1, z0, z1, trim, 0.2))
    parts.append(band(-EX, EX, EY0, EY1, EH - 1.4, EH + 1.6, trim, 0.5, 'centre_cap'))
    fe = Face('S', EY0)
    balustrade(P, fe, -EX + 1.0, EX - 1.0, EH - 1.0, EH + 1.2, dark, trim, step=3.6, off=0.55)
    for u in (-9.0, 0.0, 9.0):
        arch_win(P, fe, u, 30.0, 5.0, 11.0, 3.0, lit if u == 0 else dark, trim, f=0.5, off=0.2)
    for fc in (Face('E', EX), Face('W', -EX)):
        for u in (-24.0, -14.0):
            uu = u if fc.side == 'E' else -u
            arch_win(P, fc, uu, H2 + 0.2, 3.0, 5.0, 1.6, dark, None, off=0.2, n=2)
    por = blk(-16.0, 16.0, -39.0, EY0 + 0.01, 0, 26.0, buff, 'wall')
    cut = kit.join([prism_from_outline('pc', arch_outline(7.4, 11.0, 5.0, 'pointed', n=5), 16.0, center=(u, -39.0, 2.0)) for u in (-10.0, 0.0, 10.0)], 'pcut')
    kit.boolean(por, cut)
    parts.append(por)
    side = kit.join([prism_from_outline('ps', arch_outline(5.4, 9.5, 4.0, 'pointed', n=4), 36.0, axis='X', center=(0, -34.0, 2.0))], 'pside')
    kit.boolean(por, side)
    parts.append(band(-16.0, 16.0, -39.0, EY0, 2.0, 2.6, trim, 0.15))
    parts.append(band(-16.0, 16.0, -39.0, EY0, 18.4, 19.2, trim, 0.4, 'por_cornice'))
    parts.append(band(-16.0, 16.0, -39.0, EY0, 24.6, 26.8, trim, 0.5, 'por_cap'))
    fpo = Face('S', -39.0)
    for u in (-15.0, -5.0, 5.0, 15.0):
        parts.append(fpo.slab(u - 0.9, u + 0.9, 2.6, 24.6, 0.6, trim, name='por_pil'))
    fp = Face('S', -38.0)
    fin = Face('S', -31.0)
    arch_win(P, fin, 0, 2.0, 5.0, 8.0, 3.0, dark, None, off=0.05)
    for u in (-10.0, 10.0):
        arch_win(P, fin, u, 2.0, 3.6, 7.0, 2.0, dark, None, off=0.05)
    # the name, painted plainly on the portico's front above the arches
    parts.append(kit.signboard('sjm_sign', 'SALAR JUNG MUSEUM', 26.0, 2.8, (0, -39.7, 20.0), depth=0.3,
                               fg='#6a1a14', bg='#f6eedc', frame_mat=trim, px=512))
    for sx in (-1, 1):
        parts += kiosk(sx * (EX - 2.4), EY0 + 2.4, EH + 1.6, 2.0, 6.0, buff, trim, dark, P)
    # entrance steps
    parts.append(kit.stairs('steps', 28.0, 1.2, 0.7, 3, (0, -41.4, 0), gran))
    parts += P.objects('sjm_panels')
    strip_bottoms(parts)
    dice_walls(parts)
    C.finish(A, parts, tile=10.0, tex=256, ao_samples=32, ao_dist=8.0, ground_dirt=5.0)
    cols = [C.col_box('sjm_centre', (2 * EX, EY1 - EY0, EH), (0, (EY0 + EY1) / 2, 0)),
            C.col_box('sjm_rear', (60, 30, 32), (0, 23.0, 0)),
            C.col_box('sjm_por', (30, 9, 22), (0, -33.5, 0))]
    for i in range(6):
        a = -TH + 2 * TH * (i + 0.5) / 6
        r = (RF + RB) / 2
        o = C.col_box('sjm_w', (2 * TH / 6 * r * 0.98, RB - RF, H2), (0, 0, 0))
        o.rotation_euler = (0, 0, -a)
        o.location = (r * math.sin(a), CY + r * math.cos(a), 0)
        kit.apply_transform(o)
        cols.append(o)
    C.col_join(cols, 'salar_jung_museum')
    A.notes.append('COL_salar_jung_museum: camera-ray proxy boxes (crescent wing in six chords, entrance block, portico, rear hall)')
    A.preview = C.shots(front_az=-25, el=16, fov=34, extra=[
        {'name': 'entrance', 'size': 320, 'samples': 16, 'view': {'az': -8, 'el': 6, 'fov': 40, 'target': (0, -36, 20), 'dist': 100}}])


# =========================================================================== Purana Pul
# The deck is the ground renderer's road 'puranapul' (kind bridge, w 30, flat at y = 0.08 like every
# road; concrete edge strips out to |v| = 18.5). The terrain and the Musi water are a flat plane at
# y = 0, so the bridge's arches can only be shown ABOVE it: like the procedural model, each side of the
# deck carries the bridge's elevation (22 pointed arches on piers, cutwaters upstream, buttresses
# downstream, string course, parapet, refuges) between |v| = 18.5 and ~22, and nothing stands on the
# deck itself. The landmark is axis-aligned (no face) but the road's straight span runs from world
# (7295, 7517) to (7339, 7663), ~16.8 deg off north-south, so the model is built along that segment
# (Blender (x, y) = world (x - lm.x, -(y - lm.y))): its own X extent (~86 u) exceeds lm.w = 44 on
# purpose; footprint meta [44, 150] keeps the runtime's fit scale at exactly 1.
PP_P1 = (7295.0 - 7317.0, -(7517.0 - 7588.0))     # north end of the straight span (Blender coords)
PP_P2 = (7339.0 - 7317.0, -(7663.0 - 7588.0))     # south end
PP_HALF = 15.0 + 3.5                               # road half width + the renderer's concrete strips


def _arcade_side(sx, L, n, w, spring, rise, x_in, x_out, ztop, mat):
    """the arcaded spandrel layer of one side: one front n-gon with n arch notches + the intrados"""
    bm = bmesh.new()
    step = L / n
    outline = [(-L / 2, ztop), (-L / 2, 0.0)]
    arches = []
    for i in range(n):
        yc = -L / 2 + step * (i + 0.5)
        o = [(yc + x, z) for (x, z) in arch_outline(w, spring, rise, 'pointed', 4)]
        arches.append(o)
        outline += o
    outline += [(L / 2, 0.0), (L / 2, ztop)]
    vs = [bm.verts.new((sx * x_out, y, z)) for (y, z) in outline]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.x * sx < 0:
        f.normal_flip()
    for o in arches:
        yc = (o[0][0] + o[-1][0]) / 2
        a = [bm.verts.new((sx * x_out, y, z)) for (y, z) in o]
        b = [bm.verts.new((sx * x_in, y, z)) for (y, z) in o]
        for k in range(len(o) - 1):
            q = bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
            q.normal_update()
            cc = q.calc_center_median()
            if q.normal.dot(Vector((0, yc - cc.y, spring - cc.z))) < 0:
                q.normal_flip()
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    return kit.obj_from_bm(bm, 'arcade', mat)


def _prism_sides(name, poly, z0, z1, mat, skip_first=True, top=True):
    """vertical prism through a 2D polygon, without the bottom (and the first side, against a wall)"""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for (x, y) in poly]
    hi = [bm.verts.new((x, y, z1)) for (x, y) in poly]
    n = len(poly)
    cx = sum(p[0] for p in poly) / n
    cy = sum(p[1] for p in poly) / n
    for i in range(n):
        if skip_first and i == n - 1:
            continue
        j = (i + 1) % n
        f = bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        f.normal_update()
        cc = f.calc_center_median()
        if f.normal.dot(Vector((cc.x - cx, cc.y - cy, 0))) < 0:
            f.normal_flip()
    if top:
        f = bm.faces.new(hi)
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


def _pyramid(name, poly, z0, apex, mat):
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for (x, y) in poly]
    t = bm.verts.new(apex)
    for i in range(len(poly) - 1):
        f = bm.faces.new((vs[i], vs[i + 1], t))
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


@kit.asset('puranapul_arches', 'landmark', landmark='puranapul_arches', footprint=[44, 150], height=14.4, fit='footprint', floodlit=False)
def puranapul_arches(A):
    M = C.mats(
        stone=('granite_grey', dict(base='#7d776e', var=0.12, grain=0.1, grime=0.5, dirt='#46423c', specks=0.5)),
        lime=('lime_plaster', dict(base='#cfc6b4', var=0.1, grain=0.06, grime=0.5, streaks=0.5, dirt='#6e6858')),
        dark=('granite_grey', dict(base='#24221f', var=0.05, grain=0.03, specks=0.0, grime=0.0)),
    )
    stone, lime, dark = M['stone'], M['lime'], M['dark']
    parts = []
    L, NA = 150.0, 22
    step = L / NA
    AW, ASP, AR = 6.0, 3.4, 3.8            # arch width, springing, rise (apex 7.2 above the water)
    XI, XO = PP_HALF, PP_HALF + 3.0         # inner (deck edge) and outer face of the side walls
    ZS, ZP, ZC = 8.8, 10.6, 11.1             # string course, parapet top, coping top
    for sx in (-1, 1):
        x0, x1 = (XI, XO) if sx > 0 else (-XO, -XI)
        # core wall (deck side up to the parapet), the arcade layer in front of it, dark arch backs
        parts.append(blk(x0, x1 - sx * 1.0 if sx > 0 else x1, -L / 2, L / 2, 0, ZS, stone, 'wall') if sx > 0 else
                     blk(x0 + 1.0, x1, -L / 2, L / 2, 0, ZS, stone, 'wall'))
        parts.append(_arcade_side(sx, L, NA, AW, ASP, AR, XO - 1.0, XO, ZS, stone))
        bk = Face('E' if sx > 0 else 'W', sx * (XO - 1.0))
        P = Polys()
        rect_panel(P, bk, dark, -L / 2, L / 2, 0.0, ASP + AR + 0.2, 0.02)
        parts += P.objects('pp_dark')
        # string course, parapet, coping
        parts.append(blk(x0 - (0.5 if sx < 0 else 0), x1 + (0.5 if sx > 0 else 0), -L / 2, L / 2, ZS, ZS + 0.5, stone, 'string'))
        parts.append(blk(x0 + (0.0 if sx > 0 else 0.4), x1 - (0.4 if sx > 0 else 0.0), -L / 2, L / 2, ZS + 0.5, ZP, lime, 'parapet'))
        parts.append(blk(x0 - 0.2, x1 + 0.2, -L / 2, L / 2, ZP, ZC, stone, 'coping'))
        # piers: upstream (-X) triangular cutwaters, downstream (+X) flat buttresses
        pw = max(step - AW + 0.6, 1.6)
        for i in range(1, NA):
            y = -L / 2 + step * i
            if sx < 0:
                poly = [(-XO, y + pw / 2), (-XO - 2.8, y), (-XO, y - pw / 2)]
                parts.append(_prism_sides('cutwater', poly, 0, 6.0, stone, skip_first=True, top=False))
                parts.append(_pyramid('cw_cap', poly, 6.0, (-XO, y, 7.6), stone))
            else:
                poly = [(XO, y - pw / 2 + 0.2), (XO + 1.1, y - pw / 2 + 0.2), (XO + 1.1, y + pw / 2 - 0.2), (XO, y + pw / 2 - 0.2)]
                parts.append(_prism_sides('buttress', poly, 0, 6.0, stone, skip_first=True, top=False))
                parts.append(_pyramid('bt_cap', [poly[0], poly[1], poly[2], poly[3]], 6.0, (XO, y, 7.4), stone))
        # refuges: half-octagon bays over three piers, rising to the parapet
        for i in (5, 11, 17):
            y = -L / 2 + step * i
            r = 2.6
            pts = [(XO, y - r)]
            for k in range(1, 4):
                a = -math.pi / 2 + math.pi * k / 4
                pts.append((XO + r * 1.15 * math.cos(a), y + r * math.sin(a)))
            pts.append((XO, y + r))
            poly = [(sx * px if sx < 0 else px, py) for (px, py) in pts]
            parts.append(_prism_sides('refuge', poly, 0, ZP, stone, skip_first=True, top=False))
            parts.append(_prism_sides('refuge_cap', [(sx * (abs(px) + 0.25 * (abs(px) > XO + 0.01)), py) if sx < 0 else
                                                     (px + 0.25 * (px > XO + 0.01), py) for (px, py) in pts], ZP, ZC, stone, skip_first=True, top=True))
        # end pillars (abutments) at both ends
        for ye in (-L / 2, L / 2):
            cxp = sx * (XO - 0.6)
            parts.append(blk(cxp - 1.9, cxp + 1.9, ye - 1.9, ye + 1.9, 0, 12.6, stone, 'pillar'))
            sq = [(cxp - 2.2, ye - 2.2), (cxp + 2.2, ye - 2.2), (cxp + 2.2, ye + 2.2), (cxp - 2.2, ye + 2.2), (cxp - 2.2, ye - 2.2)]
            parts.append(blk(cxp - 2.2, cxp + 2.2, ye - 2.2, ye + 2.2, 12.6, 13.2, stone, 'pillar_cap'))
            parts.append(_pyramid('pillar_top', sq, 13.2, (cxp, ye, 14.4), lime))
    # COL proxies (side walls only; the deck stays free), built in the same local frame
    cols = [C.col_box('pp_w', (XO - XI, L, ZP), ((XI + XO) / 2, 0, 0)), C.col_box('pp_e', (XO - XI, L, ZP), (-(XI + XO) / 2, 0, 0))]
    # turn the bridge onto the road's straight span
    ang = math.atan2(PP_P2[0] - PP_P1[0], PP_P1[1] - PP_P2[1])      # local +Y -> P2 -> P1 direction
    mx, my = (PP_P1[0] + PP_P2[0]) / 2, (PP_P1[1] + PP_P2[1]) / 2
    R = Matrix.Translation((mx, my, 0)) @ Matrix.Rotation(ang, 4, 'Z')
    strip_bottoms(parts)
    for o in parts + cols:
        kit.apply_modifiers(o)
        o.matrix_world = R @ o.matrix_world
        kit.apply_transform(o)
    C.finish(A, parts, tile=8.0, tex=256, ao_samples=32, ao_dist=6.0, ground_dirt=2.0)
    C.col_join(cols, 'puranapul_arches')
    A.notes.append('Built along the road span (rotated %.1f deg, centred on (%.1f, %.1f)): X extent exceeds lm.w on purpose; '
                   'deck free for the ground renderer road (|v| < %.1f)' % (math.degrees(ang), mx, my, XI))
    A.notes.append('COL_puranapul_arches: the two side walls (camera-ray proxies)')
    A.preview = C.shots(front_az=-70, el=14, fov=30, extra=[
        {'name': 'arches', 'size': 320, 'samples': 16, 'view': {'az': -100, 'el': 5, 'fov': 36, 'target': (-30, 0, 3), 'dist': 70}}])
