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
@kit.asset('high_court', 'landmark', landmark='high_court', face='s', footprint=[168, 62], height=68.0, fit='footprint', floodlit=True)
def high_court(A):
    M = C.mats(
        red=('sandstone', dict(base='#b0533d', var=0.1, grain=0.06, grime=0.35, dirt='#5a2a1e')),
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
    for (z0, z1) in ((1.8, 2.5), (8.0, 8.6), (14.0, 14.8), (22.0, 22.6), (27.2, 28.2)):
        parts.append(band(-XW, XW, YF, YB, z0, z1, white, 0.14))
    parts.append(band(-XW, XW, YF, YB, HR, HR + 2.2, white, 0.3, 'parapet'))
    # chajjas (deep white sunshades) along the front and back
    for fc in (Face('S', YF), Face('N', YB)):
        parts.append(fc.slab(-XW, XW, 14.0, 14.6, 1.8, white, name='chajja'))
        parts.append(fc.slab(-XW, XW, 28.2, 28.8, 1.2, white, name='cornice'))
    # ---- corner pavilions (four), banded, domed
    for sx in (-1, 1):
        for (y0, y1) in ((-27.0, -16.0), (19.0, 30.0)):
            x0, x1 = (74.0, 84.0) if sx > 0 else (-84.0, -74.0)
            parts.append(blk(x0, x1, y0, y1, 0, 36.0, red, 'tower'))
            for (z0, z1) in ((1.8, 2.5), (6.2, 6.7), (14.0, 14.8), (22.6, 23.1), (31.6, 32.1)):
                parts.append(band(x0, x1, y0, y1, z0, z1, white, 0.14))
            parts.append(band(x0, x1, y0, y1, 36.0, 37.4, white, 0.35))
            parts.append(blk(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, 37.39, 37.4, white, 'tcap'))
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            parts.append(kit.cylinder('tdrum', 4.0, 2.4, (cx, cy, 37.4), seg=8, mat=red, cap=False))
            parts.append(big_dome(cx, cy, 39.8, 4.2, 6.5, white, seg=8, n=5))
            # pavilion windows on its three free faces
            fs = [Face('S', y0)] if y0 < 0 else [Face('N', y1)]
            fs.append(Face('E', x1) if sx > 0 else Face('W', x0))
            for fc in fs:
                uc = cy if fc.side in 'EW' else cx
                uc = uc if fc.side in 'SE' else -uc
                fm = white if fc.side == 'S' else None
                arch_win(P, fc, uc, 3.2, 3.6, 6.0, 2.4, dark, fm, off=0.2)
                arch_win(P, fc, uc, 16.6, 3.0, 5.4, 2.0, lit, fm, off=0.2)
                parts.append(fc.slab(uc - 3.4, uc + 3.4, 14.8, 15.3, 1.4, white, name='tch'))
    # ---- central pavilion (projecting), its pishtaq and the great portal
    pav = blk(-24, 24, -28.5, 24, 0, 38.0, red, 'pavilion')
    fr = blk(-13.5, 13.5, -31.5, -28.0, 0, 45.0, red, 'pishtaq')
    AW, AS, AR = 16.0, 17.0, 11.0
    cut1 = prism_from_outline('portal', arch_outline(AW, AS, AR, 'pointed', n=7), 9.0, center=(0, -29.0, 1.8))
    cut2 = prism_from_outline('portal', arch_outline(AW, AS, AR, 'pointed', n=7), 9.0, center=(0, -29.0, 1.8))
    kit.boolean(pav, cut1)
    kit.boolean(fr, cut2)
    parts += [pav, fr]
    for (z0, z1) in ((1.8, 2.5), (8.0, 8.6), (14.0, 14.8), (22.0, 22.6), (27.2, 28.2), (32.6, 33.2)):
        parts.append(band(-24, 24, -28.5, 24, z0, z1, white, 0.14))
    parts.append(band(-24, 24, -28.5, 24, 38.0, 39.4, white, 0.3, 'pav_parapet'))
    for (z0, z1) in ((35.4, 36.0), (40.0, 40.6)):
        parts.append(band(-13.5, 13.5, -31.5, -28.0, z0, z1, white, 0.14))
    parts.append(band(-13.5, 13.5, -31.5, -28.0, 45.0, 46.2, white, 0.3))
    # white archivolt round the portal + spandrel roundels
    ring = prism_from_outline('archivolt', arch_outline(AW + 2.6, AS - 0.8, AR + 2.2, 'pointed', n=7), 0.6, center=(0, -31.8, 1.0), mat=white)
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
        parts += banded_shaft(mx, my, 0, 46.0, 2.5, 2.0, 6.6, 1.0, red, white, seg=8)
        for zb in (38.6, 46.0):
            parts.append(lathe('balcony', [(2.2, zb - 0.9), (3.1, zb - 0.1), (3.1, zb + 0.5), (2.0, zb + 0.5)], seg=8, mat=white, loc=(mx, my, 0), close_bottom=False, close_top=True))
        parts += chhatri(mx, my, 46.5, 1.9, 6.0, white, white)
    # ---- the great central dome on a banded drum
    dx, dy = 0.0, -2.0
    parts.append(lathe('dome_base', [(13.0, 39.4), (13.0, 40.6), (11.6, 40.6)], seg=16, mat=white, loc=(dx, dy, 0), close_bottom=False, close_top=False))
    parts.append(kit.cylinder('drum', 11.2, 6.8, (dx, dy, 40.6), seg=16, mat=red, cap=False))
    parts.append(lathe('drum_top', [(11.2, 47.4), (12.4, 47.8), (12.4, 48.5), (10.9, 48.5)], seg=16, mat=white, loc=(dx, dy, 0), close_bottom=False, close_top=False))
    ring_panels(P, dark, dx, dy, 8, 11.32, 41.4, 2.6, 3.4, 1.6, phase=math.pi / 8)
    DR, DH, DZ = 11.0, 17.0, 48.5
    parts.append(big_dome(dx, dy, DZ, DR, DH, red, seg=16, n=8))
    for t in (0.2,):
        # rings following the onion profile (white stripes on the dome)
        prof = onion_profile(DR, DH, neck=0.95, bulge=1.1, tip=0.08, n=40, base_z=DZ)
        k = int(t * 40)
        r, z = prof[k]
        parts.append(lathe_ring(dx, dy, z - 0.4, r - 0.05, 0.9, 0.18, white, seg=16))
    parts.append(finial(dx, dy, DZ + DH * 1.08, 1.2, M['gold']))
    # ---- side domes on the wings and roofline chhatris / pinnacles
    for sx in (-1, 1):
        x = sx * 50.0
        parts.append(kit.cylinder('sdrum', 5.6, 4.0, (x, 3.0, HR + 2.2), seg=12, mat=red, cap=False))
        parts.append(lathe('sdrum_top', [(5.6, HR + 6.2), (6.4, HR + 6.5), (6.4, HR + 7.0), (5.4, HR + 7.0)], seg=12, mat=white, loc=(x, 3.0, 0), close_bottom=False, close_top=False))
        parts.append(big_dome(x, 3.0, HR + 7.0, 5.6, 9.0, white, seg=12, n=6))
        parts.append(finial(x, 3.0, HR + 7.0 + 9.0 * 1.08, 0.6, M['gold']))
        parts += chhatri(sx * 64.0, YF + 2.2, HR + 2.2, 1.9, 6.4, white, white)
    # pinnacles on the parapet piers (front and back)
    for u in (30.25, 42.75, 55.25):
        for sx in (-1, 1):
            parts.append(pinnacle(sx * u, YF - 0.1, HR + 2.2, 0.42, 3.4, white, seg=4))
    # ---- wing facades: ground-floor arcade, first-floor windows, top lights
    NB, STEP, U0 = 8, 6.25, 24.0
    for fc, front in ((Face('S', YF), True), (Face('N', YB), False)):
        for k in range(NB):
            for su in (-1, 1):
                u = su * (U0 + STEP * (k + 0.5))
                if front:
                    arch_win(P, fc, u, 2.5, 4.6, 6.6, 3.0, dark, white, off=0.2)
                    arch_win(P, fc, u, 16.4, 3.0, 5.6, 2.0, lit if k % 2 == 0 else dark, white, off=0.2)
                else:
                    arch_win(P, fc, u, 16.4, 3.0, 5.6, 2.0, dark, None, off=0.2, n=2)
        # pilasters between bays (front only)
        if front:
            for k in (0, 2, 4, 6, 8):
                for su in (-1, 1):
                    u = su * (U0 + STEP * k)
                    parts.append(fc.slab(u - 0.5, u + 0.5, 1.8, HR, 0.3, white, name='pil'))
    # wing end faces (between the corner pavilions)
    for fc in (Face('E', XW), Face('W', -XW)):
        for k in range(4):
            u = -12.0 + k * 8.0
            arch_win(P, fc, u, 16.4, 3.0, 5.6, 2.0, dark, None, off=0.2, n=2)
    # pavilion back face windows
    fb = Face('N', 24.0)
    for u in (-16, -8, 0, 8, 16):
        arch_win(P, fb, u, 16.4, 3.0, 5.6, 2.0, dark, None, off=0.2, n=2)
    # entrance steps
    parts.append(kit.stairs('steps', 18.0, 1.0, 0.6, 3, (0, -33.0, 0), gran))
    parts += P.objects('hc_panels')
    strip_bottoms(parts)
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
