"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

Golconda Fort + Qutb Shahi Tombs:
  golconda_bala_hissar  the hilltop citadel (granite hill, boulders, terraces, zig-zag climb,
                        the two-storey baradari, Ibrahim mosque, a cannon bastion)
  golconda_fort_gate    draw 'fort_gate' (Fateh Darwaza + Banjara Darwaza): pointed arch between two
                        round bastions, spiked teak doors standing open, two cannons
  qutb_tomb             draw 'qutb_tomb' (six tombs, fitHeight): arched plinth, cubic chamber,
                        corner turrets, leaf parapet, lotus petals, bulbous dome; variant b adds
                        the two-storey arcaded gallery of the larger tombs
Cheap detail: arches / niches / slits are single dark n-gon 'decals' just proud of the walls
(a few tris each) instead of boolean recesses; only the gate passage is a real cut.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
import kit
import _lmkit as L
from kit import box, cylinder, lathe, arch_outline, prism_from_outline


# =========================================================================== materials
def gmats():
    m = kit.material
    return {
        # Deccan granite: grey-brown, weathered (roughness kept at 0.8 / 0.9 so no ORM map is baked)
        'fort': m('granite_grey', 'gc_fort', base='#93897a', rough=0.8, var=0.2, grain=0.14, grime=0.75, dirt='#3d3a30', specks=0.6, streaks=0.6),
        'fort_lt': m('granite_grey', 'gc_fort_lt', base='#a39886', rough=0.8, var=0.16, grain=0.12, grime=0.6, dirt='#4a4a3a', specks=0.5, streaks=0.45),
        'rock': m('granite_grey', 'gc_rock', base='#8e857a', rough=0.8, var=0.22, grain=0.14, grime=0.6, dirt='#463f36', specks=0.7, scale=0.35),
        'rock_dk': m('granite_grey', 'gc_rock_dk', base='#77706a', rough=0.8, var=0.2, grain=0.14, grime=0.6, dirt='#3a342e', specks=0.7, scale=0.35),
        'scrub': m('granite_grey', 'gc_scrub', base='#7d7a58', rough=0.9, var=0.25, grain=0.2, grime=0.4, dirt='#3d3a26', specks=0.2, scale=0.5),
        'plaster': m('lime_plaster', 'gc_plaster', base='#d5cab0', rough=0.9, var=0.12, grain=0.06, grime=0.6, dirt='#7d7058', streaks=0.45),
        'stucco': m('lime_plaster', 'gc_stucco', base='#bdb5a2', rough=0.9, var=0.14, grain=0.07, grime=0.6, dirt='#5f584a', streaks=0.5),
        'tgranite': m('granite_grey', 'gc_tomb', base='#a39c8c', rough=0.8, var=0.10, grain=0.09, grime=0.5, dirt='#555048', specks=0.4),
        'dome': m('lime_plaster', 'gc_dome', base='#9e978a', rough=0.9, var=0.16, grain=0.07, grime=0.55, dirt='#4c473e', streaks=0.55),
        'dark': L.paint('#2a241e', 'gc_dark', rough=0.9, grime=0.1, streaks=0.0),
        'shade': L.paint('#6a6255', 'gc_shade', rough=0.9, grime=0.3, streaks=0.2),
        'wood': m('wood_raw', 'gc_teak', base='#5e3e24', rough=0.8, grain=0.22, grime=0.45),
        'ironp': L.paint('#34343a', 'gc_iron', rough=0.8, grime=0.3, streaks=0.0),
        'bronze': L.paint('#5c4c34', 'gc_bronze', rough=0.8, var=0.1, grime=0.5, dirt='#2f3b30', streaks=0.0),
        'brass': L.paint('#a08a52', 'gc_brass', rough=0.8, grime=0.3, streaks=0.0),
        'lamp': L.lamp('#ffd9a0'),
    }


# =========================================================================== helpers
def poly(name, outline, mat, loc=(0, 0, 0), rz=0.0, tilt=0.0):
    """single n-gon from an (x, z) outline, facing -Y, tilted about X by `tilt`, turned by rz, moved to loc"""
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0.0, z)) for (x, z) in outline]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return kit.obj_from_bm(bm, name, mat)


def _tally(P, extra=None):
    """log triangle counts per part-name prefix (tuning aid)"""
    import os
    if not os.environ.get('GC_TALLY'):
        return
    t = {}
    for o in list(P) + list(extra or []):
        if o is None:
            continue
        k = o.name.split('.')[0].rstrip('0123456789_')
        t[k] = t.get(k, 0) + kit.tri_count([o])
    kit.log('TALLY ' + ', '.join('%s=%d' % kv for kv in sorted(t.items(), key=lambda kv: -kv[1])))


def up_poly(name, pts, mat):
    """single upward-facing n-gon through 3D points"""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


def arch_decal(name, w, spring, rise, mat, loc, rz=0.0, n=3):
    return poly(name, arch_outline(w, spring, rise, 'pointed', n=n), mat, loc, rz)


def rect_decal(name, w, h, mat, loc, rz=0.0):
    return poly(name, [(-w / 2, 0), (w / 2, 0), (w / 2, h), (-w / 2, h)], mat, loc, rz)


def face_frame(rz, d):
    """(point on face of a square of half-side d turned by rz) -> world mapper for decals"""
    c, s = math.cos(rz), math.sin(rz)
    return lambda x, y, z: (x * c - y * s, x * s + y * c, z)


def arcade(name, span, n, z0, h, mat, fy, rz=0.0, wfrac=0.62, n_seg=3, off=0.06):
    """n pointed arch decals spread along a face (wall plane y = fy before the turn rz)"""
    out = []
    step = span / n
    F = face_frame(rz, 0)
    wfrac = min(0.75, max(wfrac, 0.72))       # broad Qutb Shahi two-centred arches, gentle point
    w = step * wfrac
    rise = min(h * 0.38, 0.6 * w)
    for i in range(n):
        x = -span / 2 + step * (i + 0.5)
        out.append(arch_decal(name, w, h - rise, rise, mat, F(x, fy - off, z0), rz, n=max(n_seg, 6)))
    return out


def boulder(name, loc, rad, mat, seed, sub=1):
    """rounded granite boulder: a jittered icosphere, flattened below"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    for v in bm.verts:
        k = 1.0 + rnd.uniform(-0.13, 0.13)
        v.co = Vector((v.co.x * k, v.co.y * k, v.co.z * k))
        if v.co.z < -0.35:
            v.co.z = -0.35 - (v.co.z + 0.35) * 0.25
    bmesh.ops.scale(bm, vec=Vector(rad), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(rnd.uniform(0, 6.28), 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((loc[0], loc[1], loc[2] + rad[2] * 0.35)), verts=bm.verts)
    return kit.obj_from_bm(bm, name, mat)


def rrect(hx, hy, n, p=5.0):
    """n points round a superellipse (rounded rectangle)"""
    pts = []
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        c, s = math.cos(a), math.sin(a)
        pts.append((hx * math.copysign(abs(c) ** (2 / p), c), hy * math.copysign(abs(s) ** (2 / p), s)))
    return pts


def tier(name, c, h0, h1, z0, z1, mat, seed, n=18, jit=0.8, bulge=1.06, p=5.0):
    """rocky terrace: sloped jittered sides from a bottom rounded rect to a smaller top (flat top)"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    rings = []
    for k, (hx, hy, z, j) in enumerate(((h0[0], h0[1], z0, jit), ((h0[0] + h1[0]) / 2 * bulge, (h0[1] + h1[1]) / 2 * bulge, (z0 + z1) / 2, jit * 1.6), (h1[0], h1[1], z1, jit))):
        ring = []
        for (x, y) in rrect(hx, hy, n, p):
            r = 1.0 + rnd.uniform(-j, j) / max(hx, hy)
            ring.append(bm.verts.new((c[0] + x * r, c[1] + y * r, z + (rnd.uniform(-0.6, 0.6) if 0 < k < 2 else 0))))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def flight(name, x0, x1, y0, y1, z0, z1, zb, n, mat):
    """stair flight climbing along X from (x0, z0) to (x1, z1), between y0 and y1, solid down to zb"""
    rise, dx = (z1 - z0) / n, (x1 - x0) / n
    out = [(x0, zb)]
    z = z0
    x = x0
    for i in range(n):
        z += rise
        out.append((x, z))
        x += dx
        out.append((x, z))
    out.append((x1, zb))
    if x1 < x0:
        out.reverse()
    return prism_from_outline(name, out, abs(y1 - y0), center=(0, (y0 + y1) / 2, 0), mat=mat)


def slope_wall(name, x0, x1, y, z0, z1, zb, h, t, mat):
    """parapet wall along a stair flight (parallelogram top)"""
    o = [(x0, zb), (x1, zb), (x1, z1 + h), (x0, z0 + h)]
    if x1 < x0:
        o = [(x1, zb), (x0, zb), (x0, z0 + h), (x1, z1 + h)]
    return prism_from_outline(name, o, t, center=(0, y, 0), mat=mat)


def crenel_wall(name, p0, p1, z0, h, t, mat, mmat=None, mw=1.5, mh=2.2, gap=None, seed=0, ruin=0.0):
    """straight granite wall from p0 to p1 (2D), base z0, height h, thickness t, block merlons on top;
    ruin > 0 drops some merlons and notches the top (a broken old wall)"""
    rnd = random.Random(seed)
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    Ln = math.hypot(dx, dy)
    a = math.atan2(dy, dx)
    parts = [box(name, (Ln, t, h), (0, 0, 0), mat, base=True)]
    n = max(1, int(Ln / (mw * (gap or 2.0))))
    step = Ln / n
    for i in range(n):
        if ruin and rnd.random() < ruin:
            continue
        x = -Ln / 2 + step * (i + 0.5)
        parts.append(L.place(leaf_merlon(name + '_m', mw, t * 0.9, mh * 1.2, mmat or mat), (x, 0, h - 0.05)))
    w = kit.join(parts, name)
    return L.place(w, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z0), a)


def merlon_ring(name, r, z, n, mat, w=1.6, h=2.6, d=1.4, cx=0.0, cy=0.0, arc=None):
    out = []
    for i in range(n):
        a = (arc[0] + (arc[1] - arc[0]) * (i + 0.5) / n) if arc else 2 * math.pi * i / n
        o = leaf_merlon(name, w, d, h, mat)
        out.append(L.place(o, (cx + r * math.cos(a), cy + r * math.sin(a), z), a + math.pi / 2))
    return kit.join(out, name)


def cannon(name, M, loc, rz, s=1.0, wheels=True):
    """old cannon on a wooden carriage, muzzle towards -Y before the turn rz"""
    x, y, z = loc
    parts = []
    br = lathe(name + '_barrel', [(0.0, -1.0), (0.95, -0.9), (0.95, 0.0), (0.8, 0.3), (0.62, 4.6), (0.78, 5.0), (0.78, 5.5), (0.42, 5.55)], seg=8, mat=M['bronze'])
    br.rotation_euler = (math.radians(96), 0, 0)      # +Z of the lathe -> -Y, muzzle tipped up a little
    kit.apply_transform(br)
    br.location = (0, 0.8, 2.3)
    kit.apply_transform(br)
    parts.append(br)
    for sx in (-1, 1):
        parts.append(prism_from_outline(name + '_cheek', [(-1.4, 0.4), (3.2, 0.4), (3.2, 1.6), (0.6, 2.9), (-1.4, 2.4)], 0.35, axis='X', center=(sx * 0.95, 0, 0), mat=M['wood']))
    if wheels:
        for sx in (-1, 1):
            parts.append(cylinder(name + '_wheel', 1.05, 0.4, (sx * 1.35, -0.6, 1.05), seg=8, mat=M['wood'], axis='X', base=False))
        parts.append(cylinder(name + '_axle', 0.18, 3.2, (0, -0.6, 1.05), seg=4, mat=M['ironp'], axis='X', base=False))
    else:
        parts.append(box(name + '_bed', (2.2, 4.6, 0.5), (0, 0.9, 0), M['wood'], base=True))
    c = kit.join(parts, name)
    return L.place(c, (x, y, z), rz, sc=s)


def onion(name, r, h, z, mat, seg=12, loc=(0, 0), neck=0.88, bulge=1.12, n=9):
    return lathe(name, kit.onion_profile(r, h, neck=neck, bulge=bulge, tip=0.1, n=n, base_z=z), seg=seg, mat=mat, loc=(loc[0], loc[1], 0))


# =========================================================================== proxy shells
def wedge(name, w, run, h, y_front, x=0.0):
    """ramp-shaped shell for a flight of steps: front edge at y_front (toe), top at y_front + run"""
    return _wedge(name, w, run, h, y_front, x)


def _wedge(name, w, run, h, y0, x):
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in ((x - w / 2, y0, 0), (x + w / 2, y0, 0), (x + w / 2, y0 + run, h), (x - w / 2, y0 + run, h),
                                    (x - w / 2, y0 + run, 0), (x + w / 2, y0 + run, 0))]
    bm.faces.new((v[0], v[1], v[2], v[3]))
    bm.faces.new((v[0], v[3], v[4]))
    bm.faces.new((v[1], v[5], v[2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name)


def teeth_outline(span, h, n, base=1.0):
    """leaf-crest outline [(x, z)] along span (n pointed teeth over a base strip)"""
    out = [(-span / 2, 0)]
    step = span / n
    for i in range(n):
        x = -span / 2 + step * i
        out += [(x, base), (x + step * 0.5, h)]
    out += [(span / 2, base), (span / 2, 0)]
    return out


def crest_shell(name, span, half, z, h, n, two=True, sides=4):
    """flat leaf-crest cards round a square (outward face, plus an inward face when two)"""
    out = []
    ol = teeth_outline(span, h, n)
    for k in range(sides):
        rz = k * math.pi / 2
        F = face_frame(rz, 0)
        out.append(poly(name, ol, None, F(0, -half - 0.4, z), rz))
        if two:
            out.append(poly(name, [(-x, zz) for (x, zz) in ol], None, F(0, -half + 0.4, z), rz + math.pi))
    return out


def pinnacle(name, w, z0, z1, z2, loc):
    """square shaft z0..z1 with a pyramid to z2 (turret / minaret shell)"""
    x, y = loc
    b = L.shell_box(name, (w, w, z1 - z0), (x, y, z0))
    p = cylinder(name + '_p', w * 0.72, z2 - z1, (0, 0, 0), seg=4, r2=0.0, cap=False)
    return kit.join([b, L.place(p, (x, y, z1), math.pi / 4)], name)


def block_teeth(span, h, n, base=0.0):
    """battlement outline: n block merlons on a strip"""
    out = [(-span / 2, 0)]
    step = span / n
    for i in range(n):
        x = -span / 2 + step * i
        out += [(x + step * 0.2, base), (x + step * 0.2, h), (x + step * 0.8, h), (x + step * 0.8, base)]
    out += [(span / 2, 0)]
    return out


def bastion_shell(name, r0, r1, h, mh, seg, loc):
    """tapered round bastion (open bottom) whose top rim alternates up / down (crenellation)"""
    x, y = loc
    bm = bmesh.new()
    n = seg * 2
    bot = [bm.verts.new((x + r0 * math.cos(2 * math.pi * i / n), y + r0 * math.sin(2 * math.pi * i / n), 0)) for i in range(n)]
    mid = [bm.verts.new((x + r1 * math.cos(2 * math.pi * i / n), y + r1 * math.sin(2 * math.pi * i / n), h)) for i in range(n)]
    top = [bm.verts.new((x + r1 * math.cos(2 * math.pi * (i + 0.5) / n), y + r1 * math.sin(2 * math.pi * (i + 0.5) / n), h + mh)) for i in range(0, n, 2)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], mid[j], mid[i]))
    if mh > 0:
        for k in range(seg):
            i = 2 * k
            bm.faces.new((mid[i], mid[i + 1], top[k]))
    else:
        for v in top:
            bm.verts.remove(v)
    bm.faces.new(list(mid))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name)


def cannon_shell(name, loc, rz, s=1.0):
    """low shell of cannon(): carriage block + a 5-sided barrel"""
    br = cylinder(name + '_b', 0.95, 6.5, (0, 0, 0), seg=5, r2=0.8, cap=True, base=False)
    br.rotation_euler = (math.radians(96), 0, 0)
    kit.apply_transform(br)
    br.location = (0, -1.6, 2.3)
    kit.apply_transform(br)
    car = L.shell_box(name + '_c', (2.7, 4.8, 2.6), (0, 0.9, 0.0))
    c = kit.join([br, car], name)
    return L.place(c, loc, rz, sc=s)


def crest_shell_rect(name, c, W, D, z, h, pitch):
    """block merlon cards (outward + inward) round a W x D roof centred on c"""
    out = []
    for (rz, span, half) in ((0, W, D / 2), (math.pi / 2, D, W / 2), (math.pi, W, D / 2), (-math.pi / 2, D, W / 2)):
        F = face_frame(rz, 0)
        ol = leaf_teeth(span, h, max(2, int(span / pitch)), fill=0.65)
        for (dy, r) in ((-half - 0.1, rz),):
            x, y, zz = F(0, dy, z)
            out.append(poly(name, ol if r == rz else [(-a, b) for (a, b) in ol], None, (c[0] + x, c[1] + y, zz), r))
    return out


def apart(objs, dx):
    """shift objects along X (bake variants far apart so their AO never sees each other)"""
    for o in objs:
        if o is not None:
            o.location.x += dx
            kit.apply_transform(o)
    return objs


def unapart(los, name, dx):
    for o in los:
        if o.name == name:
            o.location.x -= dx
            kit.apply_transform(o)
            return o


def leaf_teeth(span, h, n, base=0.0, fill=0.7):
    """outline of n Deccani leaf merlons (straight sides, pointed-ogee top) standing on y = 0"""
    out = [(-span / 2, 0)]
    step = span / n
    for i in range(n):
        x = -span / 2 + step * (i + 0.5)
        w = step * fill / 2
        out += [(x - w, 0), (x - w, h * 0.55), (x, h), (x + w, h * 0.55), (x + w, 0)]
    out += [(span / 2, 0)]
    return [(x, z + base) for (x, z) in out]


def leaf_ring(name, r, z, n, w, h, loc):
    """n leaf-merlon cards round a circle (outward faces), for round bastion shells"""
    out = []
    ol = [(-w / 2, 0), (w / 2, 0), (w / 2, h * 0.5), (w * 0.27, h * 0.82), (0, h), (-w * 0.27, h * 0.82), (-w / 2, h * 0.5)]
    for i in range(n):
        a = 2 * math.pi * i / n          # same angles as merlon_ring()
        out.append(poly(name, ol, None, (loc[0] + (r + 0.4) * math.cos(a), loc[1] + (r + 0.4) * math.sin(a), z), a + math.pi / 2))
    return out


def leaf_merlon(name, w, d, h, mat):
    """one solid leaf merlon (prism), base at z 0, centred"""
    ol = [(-w / 2, 0), (w / 2, 0), (w / 2, h * 0.5), (w * 0.27, h * 0.82), (0, h), (-w * 0.27, h * 0.82), (-w / 2, h * 0.5)]
    return prism_from_outline(name, ol, d, mat=mat)


def treads(name, x0, x1, y0, y1, z0, z1, n, mat):
    """light stone tread slabs on a flight() (risers stay dark)"""
    rise, dx = (z1 - z0) / n, (x1 - x0) / n
    out = []
    for i in range(n):
        xa = x0 + dx * i
        out.append(box(name, (abs(dx) * 0.8, abs(y1 - y0), 0.3), (xa + dx * 0.5, (y0 + y1) / 2, z0 + rise * (i + 1)), mat, base=True))
    return kit.join(out, name)


def rock_cone(name, rings, seg, seed, jit=2.5):
    """hand-built rocky hill shell: jittered oval rings [((hx, hy), z, (cx, cy))], top capped"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    R = []
    for k, ((hx, hy), z, (cx, cy)) in enumerate(rings):
        ring = []
        last = k == len(rings) - 1
        for i in range(seg):
            a = 2 * math.pi * i / seg
            j = 0.0 if last else rnd.uniform(-jit, jit)
            ring.append(bm.verts.new((cx + (hx + j) * math.cos(a), cy + (hy + j) * math.sin(a), z + (0 if (k == 0 or last) else rnd.uniform(-1.2, 1.2)))))
        R.append(ring)
    for a_, b_ in zip(R[:-1], R[1:]):
        for i in range(seg):
            bm.faces.new((a_[i], a_[(i + 1) % seg], b_[(i + 1) % seg], b_[i]))
    bm.faces.new(R[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name)


# =========================================================================== Bala Hissar
@kit.asset('golconda_bala_hissar', 'landmark', draw='golconda_bala_hissar', face='s', footprint=[84, 64], height=70.0, fit='footprint', floodlit=True)
def build_bala_hissar(A):
    M = gmats()
    P = []
    # ---- the granite hill (front = -Y = south; +X = east, towards Fateh Darwaza): oval rocky
    # terraces in the detail model, one jittered rocky cone as the shell
    P.append(tier('hill0', (0, 0), (41.5, 31.5), (37, 27), 0, 12, M['rock'], 1, n=20, jit=1.6, p=2.5))
    P.append(tier('hill1', (-2, 2), (33, 24), (28, 19), 10, 24, M['rock'], 2, n=18, jit=1.4, p=2.5))
    P.append(tier('hill2', (-4, 6), (26, 16), (22, 13), 22, 38, M['rock'], 3, n=16, jit=1.0, p=2.5))
    for (cx, cy, hx, hy, z) in ((-2, 2, 34, 25, 12.03), (-4, 6, 26, 17, 24.03)):
        P.append(up_poly('ledge', [(cx + x, cy + y, z) for (x, y) in rrect(hx, hy, 12, 2.5)], M['scrub']))
    # ---- ruined walls hugging the slopes (leaf merlons, broken tops)
    P.append(crenel_wall('rwall0', (-36, -27.5), (0, -27.5), 0, 10.5, 2.2, M['fort'], M['fort_lt'], seed=11, ruin=0.25))
    P.append(crenel_wall('rwall1', (-27, -19.0), (-3, -19.0), 11, 11.0, 2.0, M['fort'], M['fort_lt'], seed=13, ruin=0.3))
    P.append(crenel_wall('rwall1b', (-24, 23.5), (14, 23.5), 11, 10.0, 1.8, M['fort'], M['fort_lt'], seed=15, ruin=0.45))
    # summit parapet (broken) round the citadel top
    P.append(crenel_wall('swall_s', (-22, -4.5), (2, -4.5), 38, 2.0, 1.2, M['fort_lt'], seed=16, ruin=0.3, mh=1.6))
    P.append(crenel_wall('swall_n', (-20, 17.0), (12, 17.0), 38, 2.0, 1.2, M['fort_lt'], seed=18, ruin=0.3, mh=1.6))
    # ---- THE CLIMB: three zig-zag flights (6 u wide, light treads on dark risers) with landings
    S = M['rock_dk']
    T = L.paint('#c9bfae', 'gc_tread', rough=0.9, grime=0.3)
    FLIGHTS = (('fl1', 4, 27, -33.0, 0, 12, 8), ('fl2', 27, 5, -25.0, 12, 26, 8), ('fl3', 5, 17, -16.5, 26, 38, 7))
    for (nm, x0, x1, ya, z0_, z1_, n) in FLIGHTS:
        P.append(flight(nm, x0, x1, ya, ya + 6, z0_, z1_, z0_, n, S))
        P.append(treads(nm + 't', x0, x1, ya, ya + 6, z0_, z1_, n, T))
        P.append(slope_wall(nm + 'p', x0, x1, ya - 0.3, z0_, z1_, z0_, 1.4, 0.7, M['fort']))
    LAND = [((31, -28.0, 0), (8, 10, 12)), ((1.5, -21.0, 12), (7, 10, 14)), ((19.5, -12.0, 26), (6, 9, 12.2))]
    for (c, sz) in LAND:
        P.append(box('land', sz, c, M['fort'], base=True))
    P.append(L.arch_wall('topgate', 7, 7.5, 1.6, [(0, 3.2, 3.2, 2.2)], M['fort_lt'], center=(19.5, -15.6, 38.2)))
    # ---- boulders (the Golconda look: big rounded granite rocks everywhere)
    B = [((-37, -6, 0), (7, 9, 8)), ((-35, 14, 0), (8, 8, 10)), ((-19, 27, 0), (9, 6, 9)), ((1, 28.5, 0), (8, 5.5, 7)),
         ((20, 27, 0), (9, 6, 9)), ((36.5, 15, 0), (6.5, 8, 9)), ((38, -9, 0), (5, 6, 7)), ((-38, -26, 0), (4.5, 5, 6)),
         ((39, -25, 0), (4.5, 5, 6)), ((-28, 10, 12), (6, 6, 7)), ((-22, 19, 11), (7, 5, 8)), ((-6, 21, 13), (8, 4.5, 7)),
         ((13, 19, 12), (7, 5, 8)), ((26, 6, 12), (5, 6, 7)), ((-24, -1, 26), (4, 4.5, 5)), ((14, 13, 26), (5, 4, 6)),
         ((-12, -27, 11), (3.5, 3, 3.5)), ((32, -6, 11), (4, 4, 4))]
    for i, (c, r) in enumerate(B):
        P.append(boulder('rock%d' % i, c, r, M['rock_dk'] if i % 3 == 0 else M['rock'], 100 + i))
    big = sorted(range(len(B)), key=lambda i: -(B[i][1][0] * B[i][1][1] * B[i][1][2]))[:6]
    # ---- cannon bastion on the east shoulder, facing Fateh Darwaza (a round tower from the ground)
    P.append(cylinder('bastion', 5.6, 16.5, (33, -15, 0), seg=12, mat=M['fort'], r2=4.8))
    P.append(merlon_ring('bastion_m', 4.4, 16.4, 7, M['fort_lt'], w=1.4, h=1.8, d=0.9, cx=33, cy=-15, arc=(-math.pi * 0.85, math.pi * 0.75)))
    P.append(cannon('cannon1', M, (33.5, -16.5, 16.4), math.radians(110), s=0.9))
    P.append(cannon('cannon2', M, (31.0, -12.5, 16.4), math.radians(70), s=0.8))
    # ---- summit: the Bala Hissar baradari, a long two-storey pavilion of broad arches
    hx, hy, hc = 34.0, 12.0, (-7.0, 9.0)
    z0 = 38.0
    P.append(box('bh_plinth', (hx + 2, hy + 2, 7.6), (hc[0], hc[1], z0 - 6.3), M['fort'], base=True))
    zb = z0 + 1.3
    H = 16.0
    P.append(box('bh_hall', (hx, hy, H), (hc[0], hc[1], zb), M['fort_lt'], base=True))
    P.append(box('bh_band', (hx + 0.8, hy + 0.8, 0.8), (hc[0], hc[1], zb + H / 2 - 0.4), M['fort'], base=True))
    P.append(box('bh_cornice', (hx + 1.0, hy + 1.0, 0.9), (hc[0], hc[1], zb + H - 0.9), M['fort'], base=True))
    for (rz, span, d, n) in ((0, hx, hy / 2, 9), (math.pi, hx, hy / 2, 9), (math.pi / 2, hy, hx / 2, 3), (-math.pi / 2, hy, hx / 2, 3)):
        for k in range(2):
            for o in arcade('bh_arc', span - 1.5, n, zb + 1.0 + k * H / 2, H / 2 - 2.2, M['dark'], -d, rz):
                o.location = (hc[0], hc[1], 0)
                kit.apply_transform(o)
                P.append(o)
    for (p0, p1) in (((-hx / 2, -hy / 2 + 0.5), (hx / 2, -hy / 2 + 0.5)), ((-hx / 2, hy / 2 - 0.5), (hx / 2, hy / 2 - 0.5)),
                     ((-hx / 2 + 0.5, -hy / 2 + 1.5), (-hx / 2 + 0.5, hy / 2 - 1.5)), ((hx / 2 - 0.5, -hy / 2 + 1.5), (hx / 2 - 0.5, hy / 2 - 1.5))):
        P.append(crenel_wall('bh_par', (hc[0] + p0[0], hc[1] + p0[1]), (hc[0] + p1[0], hc[1] + p1[1]), zb + H, 0.9, 1.0, M['fort_lt'], mw=1.4, mh=2.0, gap=2.1, seed=31))
    # roof pavilion: 18 x 7 x 5 with five arches
    tc = (hc[0], hc[1] + 1.5)
    P.append(box('bh_top', (18, 7, 5), (tc[0], tc[1], zb + H), M['fort_lt'], base=True))
    for o in arcade('bh_toparc', 17, 5, zb + H + 0.5, 4.0, M['dark'], -3.5, 0):
        o.location = (tc[0], tc[1], 0)
        kit.apply_transform(o)
        P.append(o)
    P.append(L.place(kit.merlons('bh_topm', 18, 0, 0.6, 1.4, n=11, w=1.0, mat=M['fort_lt'], kind='leaf'), (tc[0], tc[1] - 3.2, zb + H + 5.0)))
    # ---- Ibrahim mosque: three arches, flat roof, two stubby minarets
    mc = (10.0, 3.0)
    P.append(box('ms_plinth', (11, 8, 6.2), (mc[0], mc[1], z0 - 5.2), M['fort'], base=True))
    P.append(box('ms_body', (9, 6, 6.5), (mc[0], mc[1], z0 + 1.0), M['plaster'], base=True))
    for o in arcade('ms_arc', 8.4, 3, z0 + 1.0, 5.2, M['dark'], -3.0, 0):
        o.location = (mc[0], mc[1], 0)
        kit.apply_transform(o)
        P.append(o)
    P.append(box('ms_chajja', (9.8, 7.0, 0.5), (mc[0], mc[1], z0 + 7.0), M['plaster'], base=True))
    P.append(L.place(kit.merlons('ms_crest', 8.6, 0, 0.5, 1.3, n=7, w=0.9, mat=M['plaster'], kind='leaf'), (mc[0], mc[1] - 3.2, z0 + 7.5)))
    for sx in (-1, 1):
        P.append(lathe('ms_min', [(0.85, z0 + 1.0), (0.85, z0 + 9.5), (1.15, z0 + 9.8), (1.15, z0 + 10.4), (0.75, z0 + 10.6)], seg=6, mat=M['plaster'], loc=(mc[0] + sx * 4.6, mc[1] - 2.9, 0)))
        P.append(onion('ms_dome', 0.8, 1.6, z0 + 10.6, M['plaster'], seg=6, loc=(mc[0] + sx * 4.6, mc[1] - 2.9), n=4))
    _tally(P)
    # ---- shells: the rocky cone, big boulders, walls, landings, bastion, buildings, cannons
    lo = [rock_cone('s_hill', [((42, 32), 0.0, (0, 0)), ((36, 26), 10.0, (-1, 1)), ((28, 19), 22.0, (-3, 3)),
                               ((23, 14), 34.0, (-4, 5)), ((21, 12), 38.5, (-4, 6))], 14, 7)]
    for i in big:
        c, r = B[i]
        lo.append(boulder('s_rock', c, (r[0] * 1.06, r[1] * 1.06, r[2] * 1.06), None, 100 + i, sub=1))
    for nm in ('rwall0', 'rwall1', 'rwall1b'):
        o = [q for q in P if q.name.startswith(nm)][0]
        bb = [o.matrix_world @ Vector(v) for v in o.bound_box]
        xs, ys, zs = [v.x for v in bb], [v.y for v in bb], [v.z for v in bb]
        lo.append(L.shell_box('s_' + nm, (max(xs) - min(xs) + 0.4, max(ys) - min(ys) + 0.4, max(zs) - min(zs) - 1.0), ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs))))
    for (nm, x0, x1, ya, z0_, z1_, n) in FLIGHTS:
        rr = 1.0 if x1 > x0 else -1.0
        ol = [(x0 - rr * 0.3, z0_), (x1, z1_ + 0.4), (x1, z0_)] if x1 > x0 else [(x1, z0_), (x1, z1_ + 0.4), (x0 + 0.3, z0_)]
        lo.append(prism_from_outline('s_' + nm, ol, 6.6, center=(0, ya + 3.0, 0)))
    for (c, sz) in LAND:
        lo.append(L.shell_box('s_land', (sz[0] + 0.4, sz[1] + 0.4, sz[2] + 0.1), c))
    lo.append(L.shell_box('s_tg', (7.4, 2.0, 7.8), (19.5, -15.6, 38.1)))
    lo.append(cylinder('s_bas', 5.9, 17.4, (33, -15, 0), seg=8, r2=5.1, cap=True))
    lo.append(L.shell_box('s_bh', (hx + 2.4, hy + 2.4, H + 7.6), (hc[0], hc[1], z0 - 6.3)))
    lo += crest_shell_rect('s_bhp', hc, hx, hy, zb + H, 2.4, 2.94)
    lo.append(L.shell_box('s_bht', (18.4, 7.4, 6.6), (tc[0], tc[1], zb + H)))
    lo.append(L.shell_box('s_ms', (11.4, 8.4, 13.0), (mc[0], mc[1], z0 - 5.2)))
    for sx in (-1, 1):
        lo.append(pinnacle('s_msm', 2.2, z0 + 7.8, z0 + 10.4, z0 + 12.6, (mc[0] + sx * 4.6, mc[1] - 2.9)))
    lo.append(cannon_shell('s_can1', (33.5, -16.5, 16.4), math.radians(110), 0.9))
    lo.append(cannon_shell('s_can2', (31.0, -12.5, 16.4), math.radians(70), 0.8))
    los = L.finish_proxy(A, P, lo=lo, size=384, ao_dist=6.0, cage=2.5, ray=9.0)
    for o in los:
        kit.smooth(o, 50)
    L.col_box('bh_hill0', (72, 52, 10), (0, 0, 0))
    L.col_box('bh_hill1', (52, 36, 14), (-2, 2, 10))
    L.col_box('bh_hill2', (40, 22, 14), (-4, 6, 24))
    L.col_box('bh_hall', (hx, hy, H), (hc[0], hc[1], zb))
    A.notes.append('rocky cone shell + boulder / wall / landing / building shells; COL_bh_* camera proxies')
    L.shots(A, az=-30, el=12, extra=[{'name': 'east', 'view': {'az': 70, 'el': 8, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== Fort gate
@kit.asset('golconda_fort_gate', 'landmark', draw='fort_gate', face='s', footprint=[60, 22], height=58.0, fit='footprint', floodlit=True)
def build_fort_gate(A):
    M = gmats()
    P = []
    AW, AS, AR = 20.0, 17.0, 12.0        # arch width, spring, rise (apex 29): broad Deccani arch
    WT = 13.0                            # gate-wall thickness
    WH = 46.0
    # gate wall between the bastions, the passage cut through (Deccani two-centred pointed arch)
    wall = box('gw', (30, WT, WH), (0, 0, 0), M['fort'], base=True)
    cut = prism_from_outline('gw_cut', arch_outline(AW, AS, AR, 'pointed', n=8), WT + 4, center=(0, 0, -0.5))
    kit.boolean(wall, cut)
    P.append(wall)
    # shallow recessed rectangular frame round the arch (dressed granite border, recessed field)
    fr = box('gw_frame', (AW + 7.0, 0.7, AS + AR + 4.0), (0, -WT / 2 - 0.3, 0), M['fort_lt'], base=True)
    kit.boolean(fr, box('gw_fcut', (AW + 4.4, 3, AS + AR + 2.6), (0, -WT / 2 - 0.3, -0.5), None, base=True))
    P.append(fr)
    P.append(rect_decal('gw_rec', AW + 4.4, AS + AR + 2.0, M['shade'], (0, -WT / 2 - 0.04, 0.0)))
    # plain lime-plaster panel over the arch
    P.append(rect_decal('gw_panel', 14, 3.0, M['plaster'], (0, -WT / 2 - 0.08, AS + AR + 4.6)))
    # guard gallery over the arch: projecting balcony on corbels, small square openings, leaf merlons
    P.append(box('gc_floor', (20, 2.6, 1.0), (0, -WT / 2 - 1.3, 39.6), M['fort_lt'], base=True))
    for x in (-8.5, -3, 3, 8.5):
        P.append(prism_from_outline('gc_corbel', [(-0.6, 0), (0.6, 0), (0.6, 1.2), (-0.6, 1.2)], 2.4, center=(x, -WT / 2 - 1.2, 37.4), mat=M['fort']))
    P.append(box('gc_wall', (20, 0.9, 3.0), (0, -WT / 2 - 2.2, 40.6), M['fort_lt'], base=True))
    for x in (-6, 0, 6):
        P.append(rect_decal('gc_win', 1.4, 1.6, M['dark'], (x, -WT / 2 - 2.7, 41.4)))
    P.append(L.place(kit.merlons('gc_crest', 20, 0, 0.9, 2.0, n=9, w=1.5, mat=M['fort_lt'], kind='leaf'), (0, -WT / 2 - 2.2, 43.6)))
    # wall-top leaf merlons (front and back edge)
    for y in (-WT / 2 + 0.6, WT / 2 - 0.6):
        P.append(L.place(kit.merlons('gw_m', 24, 0, 1.2, 3.6, n=7, w=2.4, mat=M['fort_lt'], kind='leaf'), (0, y, WH)))
    # two huge rounded bastions: leaf merlons, a few small slits, lichen-streaked granite
    BR, BX, BH = 9.6, 20.6, 50.0
    for sx in (-1, 1):
        cx = sx * BX
        P.append(lathe('bastion', [(BR + 0.8, 0), (BR + 0.3, 3), (BR, 3.4), (BR - 0.7, BH - 2.0), (BR - 0.2, BH - 1.6), (BR - 0.2, BH), (0, BH)], seg=14, mat=M['fort'], loc=(cx, -0.6, 0)))
        P.append(merlon_ring('bastion_m', BR - 0.6, BH - 0.05, 9, M['fort_lt'], w=2.6, h=3.6, d=1.4, cx=cx, cy=-0.6))
        for (ang, z) in ((-0.3, 18.0), (sx * 0.9, 34.0)):
            a = -math.pi / 2 + ang
            r = BR - 0.55 * (z / BH) + 0.08
            P.append(rect_decal('slit', 0.6, 1.8, M['dark'], (cx + r * math.cos(a), -0.6 + r * math.sin(a), z), a + math.pi / 2))
    # the great teak doors, hinged at the front of the passage and swung ~25 deg off the walls,
    # their faces bristling with long iron anti-elephant spikes that catch the light
    DL, SW = 9.0, math.radians(25)
    doors = []
    for sx in (-1, 1):
        hxp, hyp = sx * (AW / 2 - 0.6), -WT / 2 + 3.0
        d = [box('door', (0.9, DL, 22.0), (0, DL / 2, 0.1), M['wood'], base=True)]
        for z in (3.0, 11.0, 19.0):
            d.append(box('door_band', (1.05, DL, 0.5), (0, DL / 2, z), M['ironp'], base=True))
        for z in (5.0, 9.0, 13.0, 17.0):
            for yy in (1.5, 4.5, 7.5):
                sp = cylinder('spike', 0.42, 2.8, (0, 0, 0), seg=4, mat=M['ironp'], r2=0.0, axis='X', base=False)
                d.append(L.place(sp, (-sx * 1.85, yy, z), math.pi if sx > 0 else 0.0))
        rz = sx * SW            # free end swings towards the passage centre
        for o in d:
            P.append(L.place(o, (hxp, hyp, 0), rz))
        doors.append(L.place(L.shell_box('s_door', (1.3, DL + 0.3, 22.3), (-sx * 0.15, DL / 2, 0.0)), (hxp, hyp, 0), rz))
    _tally(P)
    # ---- shells: gate wall with the real passage, gallery block, leaf-merlon cards, bastions
    sw = L.shell_box('s_gw', (30.4, WT + 1.4, WH), (0, 0, 0))
    kit.boolean(sw, prism_from_outline('s_cut', arch_outline(AW - 0.2, AS, AR, 'pointed', n=6), WT + 6, center=(0, 0, -0.5)))
    lo = [sw, L.shell_box('s_gal', (20.4, 3.4, 4.2), (0, -WT / 2 - 2.0, 39.4)),
          poly('s_galc', leaf_teeth(20.4, 2.0, 9, base=0.0), None, (0, -WT / 2 - 2.75, 43.6))]
    for y in (-WT / 2, WT / 2):
        ol = leaf_teeth(24.0, 3.6, 7)
        lo.append(poly('s_wm', ol, None, (0, y - 0.05 if y < 0 else y + 0.05, WH), 0 if y < 0 else math.pi))
    for sx in (-1, 1):
        lo.append(bastion_shell('s_bas', BR + 0.85, BR - 0.1, BH, 0.0, 6, (sx * BX, -0.6)))
        lo += leaf_ring('s_bm', BR - 0.1, BH, 9, 2.6, 3.6, (sx * BX, -0.6))
    lo += doors
    L.finish_proxy(A, P, lo=lo, size=384, ao_dist=6.0)
    for sx in (-1, 1):
        L.col_box('gate_bastion%d' % (sx > 0), (BR * 2, BR * 2, BH), (sx * BX, -0.6, 0))
    L.col_box('gate_top', (AW + 0.4, WT, WH - AS - AR), (0, 0, AS + AR))
    A.notes.append('COL_gate_*: bastions, piers and the mass over the arch (the passage itself is clear)')
    L.shots(A, az=-25, el=8, extra=[{'name': 'arch', 'view': {'az': -5, 'el': 2, 'fov': 40, 'target': (0, -8, 16), 'dist': 60}}])


# =========================================================================== Qutb Shahi tomb
@kit.asset('qutb_tomb', 'landmark', draw='qutb_tomb', footprint=[56, 56], height=75.0, fit='footprint', floodlit=True,
           fitHeight=True, dataH=50, variants={'rule': 'hash', 'names': ['a', 'b']})
def build_qutb_tomb(A):
    M = gmats()
    P = []
    G, ST = M['tgranite'], M['stucco']
    PW, PH = 53.0, 8.0                   # arched plinth (platform)
    CW, CZ, CH = 30.0, PH, 26.0          # cubic chamber
    TOP = CZ + CH                        # roof terrace 34
    # ---- platform: the arched plinth, seven arches a side, steps up the middle of each side
    P.append(box('plinth', (PW, PW, PH), (0, 0, 0), G, base=True))
    P.append(box('plinth_cap', (PW + 0.8, PW + 0.8, 0.7), (0, 0, PH - 0.7), ST, base=True))
    side = []
    side += arcade('pl_arc', PW - 2, 9, 0.6, PH - 1.6, M['dark'], -PW / 2, 0, wfrac=0.62)
    P += L.rot4(side)
    stp = []
    for i in range(4):
        stp.append(box('step', (8, 1.3 * (4 - i), PH / 4), (0, -PW / 2 - 1.3 * (4 - i) / 2, PH / 4 * i), G, base=True))
    P.append(kit.join(stp, 'steps'))
    # ---- chamber (common), its chajja and the leaf parapet with corner turrets
    chamber = box('chamber', (CW, CW, CH), (0, 0, CZ), ST, base=True)    # per variant (baked onto each variant's shell)
    P.append(box('chajja', (CW + 2.2, CW + 2.2, 0.8), (0, 0, TOP - 2.6), G, base=True))
    crest = []
    nT = 7
    for k in range(4):
        out = [(-CW / 2, 0)]
        step = CW / nT
        for i in range(nT):
            x = -CW / 2 + step * i
            out += [(x, 1.0), (x + step * 0.5, 3.6)]
        out += [(CW / 2, 1.0), (CW / 2, 0)]
        c = prism_from_outline('crest', out, 0.7, center=(0, -CW / 2 + 0.35, TOP), mat=ST)
        crest.append(L.place(c, (0, 0, 0), k * math.pi / 2))
    P.append(kit.join(crest, 'crest'))
    for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = sx * (CW / 2 + 0.3), sy * (CW / 2 + 0.3)
        P.append(lathe('turret', [(1.5, CZ), (1.5, TOP + 1.2), (2.1, TOP + 1.6), (2.1, TOP + 2.4), (1.2, TOP + 2.7), (1.45, TOP + 4.4), (0.5, TOP + 6.6), (0.0, TOP + 7.8)], seg=6, mat=ST, loc=(x, y, 0)))
    # ---- drum, lotus petals and the bulbous dome with a finial
    R = 12.4
    P.append(cylinder('drum', R, 5.4, (0, 0, TOP - 0.4), seg=16, mat=G, cap=False))
    P.append(cylinder('drum_band', R + 0.35, 0.8, (0, 0, TOP + 2.6), seg=16, mat=ST, cap=False))
    pet = []
    nP = 16
    for i in range(nP):
        a = 2 * math.pi * (i + 0.5) / nP
        w = 2 * math.pi * R / nP * 0.62
        o = poly('petal', [(-w, 0), (w, 0), (w * 0.8, 1.6), (0, 3.0), (-w * 0.8, 1.6)], ST, tilt=math.radians(-30))
        pet.append(L.place(o, (R * 0.98 * math.cos(a), R * 0.98 * math.sin(a), TOP + 4.6), a + math.pi / 2))
    P.append(kit.join(pet, 'petals'))
    DZ = TOP + 5.0
    dome = lathe('dome', kit.onion_profile(R * 1.0, 26.0, neck=0.9, bulge=1.13, tip=0.08, n=11, base_z=DZ)[:-3], seg=16, mat=M['dome'])
    P.append(dome)
    top = DZ + 26.0 * 1.0
    P.append(lathe('finial', [(1.2, top - 0.6), (1.0, top + 0.6), (0.4, top + 1.2), (0.75, top + 2.2), (0.25, top + 3.4), (0.45, top + 4.0), (0.0, top + 7.2)], seg=6, mat=M['brass']))
    # ---- variant a: the plain cube, a great pointed recess on each face, dark doorway in front
    va = [chamber]
    fa = []
    fa.append(arch_decal('rec', 13.0, 12.0, 8.0, M['shade'], (0, -CW / 2 - 0.06, CZ + 1.0), n=5))
    for sx in (-1, 1):
        for (z, h) in ((CZ + 1.5, 9.0), (CZ + 12.5, 9.0)):
            fa.append(arch_decal('rec_s', 3.4, h * 0.62, h * 0.38, M['shade'], (sx * 10.6, -CW / 2 - 0.06, z)))
    va += L.rot4(fa)
    va.append(arch_decal('door', 5.0, 6.5, 3.4, M['dark'], (0, -CW / 2 - 0.12, CZ + 1.0)))
    for (z, h) in ((CZ + 12.5, 6.5),):
        va.append(arch_decal('jaali', 4.4, h * 0.62, h * 0.38, M['dark'], (0, -CW / 2 - 0.12, z)))
    # ---- variant b: the two-storey arcaded gallery round the chamber (the larger tombs)
    vb = [L.copy(chamber, name='chamber_b')]
    GW, GH = 44.0, 21.0
    vb.append(box('gallery', (GW, GW, GH), (0, 0, CZ), ST, base=True))
    vb.append(box('gal_band', (GW + 1.0, GW + 1.0, 0.7), (0, 0, CZ + GH / 2 - 0.35), G, base=True))
    vb.append(box('gal_cornice', (GW + 1.6, GW + 1.6, 0.8), (0, 0, CZ + GH - 0.8), G, base=True))
    fb = []
    fb += arcade('gal_arc', GW - 3, 5, CZ + 0.6, GH / 2 - 1.8, M['dark'], -GW / 2, 0, wfrac=0.6)
    fb += arcade('gal_arc2', GW - 3, 5, CZ + GH / 2 + 0.6, GH / 2 - 2.0, M['dark'], -GW / 2, 0, wfrac=0.6)
    out = [(-GW / 2, 0)]
    step = GW / 11
    for i in range(11):
        x = -GW / 2 + step * i
        out += [(x, 0.6), (x + step * 0.5, 2.6)]
    out += [(GW / 2, 0.6), (GW / 2, 0)]
    fb.append(prism_from_outline('gal_crest', out, 0.6, center=(0, -GW / 2 + 0.3, CZ + GH), mat=ST))
    vb += L.rot4(fb)
    # small blind arches on the chamber above the gallery roof
    vb += L.rot4(arcade('ch_arc', CW - 4, 5, CZ + GH + 0.6, TOP - 3.0 - CZ - GH - 0.8, M['shade'], -CW / 2, 0, wfrac=0.55))
    _tally(P, va + vb)
    # ---- shells (only these ship; the detail above is baked onto them)
    lo = [L.shell_box('s_plinth', (PW + 0.9, PW + 0.9, PH + 0.05)),
          wedge('s_steps', 8.4, 5.6, PH, -PW / 2 - 0.4)]
    lo += crest_shell('s_crest', CW, CW / 2 - 0.35, TOP, 3.6, 4, two=True)
    for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = sx * (CW / 2 + 0.3), sy * (CW / 2 + 0.3)
        lo.append(pinnacle('s_tur', 2.2, CZ, TOP + 2.6, TOP + 7.8, (x, y)))
    lo.append(lathe('s_drum', [(R + 0.4, TOP - 0.4), (R + 0.4, TOP + 4.0), (R + 1.4, TOP + 6.6), (R * 0.9, TOP + 6.0)], seg=12, close_bottom=False, close_top=True))
    dp = kit.onion_profile(R * 1.0, 26.0, neck=0.9, bulge=1.13, tip=0.08, n=6, base_z=DZ)[:-3]
    lo.append(lathe('s_dome', [(r + 0.25, z) for (r, z) in dp] + [(0.9, top), (0.0, top + 7.2)], seg=12, close_bottom=False))
    lo_a = [L.shell_box('s_ch_a', (CW + 0.2, CW + 0.2, CH - 0.2), (0, 0, CZ))]
    lo_b = [L.shell_box('s_gal', (GW + 0.2, GW + 0.2, GH + 0.05), (0, 0, CZ))]
    lo_b += crest_shell('s_gcrest', GW, GW / 2 - 0.3, CZ + GH, 2.6, 5, two=False)
    lo_b.append(L.shell_box('s_ch_b', (CW + 0.2, CW + 0.2, TOP - CZ - GH - 0.2), (0, 0, CZ + GH)))
    # bake the two variants far apart (their AO must not see each other), then bring them back
    apart(va + lo_a, 1000.0)
    apart(vb + lo_b, 2000.0)
    los = L.finish_proxy(A, P, lo=lo, size=384, ao_dist=6.0, variants={'a': (va, lo_a), 'b': (vb, lo_b)})
    unapart(los, 'var_a', 1000.0)
    unapart(los, 'var_b', 2000.0)
    L.col_box('qt_plinth', (PW, PW, PH), (0, 0, 0))
    L.col_box('qt_body', (CW + 6, CW + 6, TOP - PH), (0, 0, PH))
    L.col_box('qt_dome', (2 * R, 2 * R, 26), (0, 0, DZ))
    A.notes.append('variants a (plain cube) / b (two-storey arcaded gallery) by lm.id hash; fitHeight dataH=50')
    L.shots(A, az=-35, el=12)
