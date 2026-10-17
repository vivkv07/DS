"""NOSTALGIA — tools/blender/props_street2.py — street props #2 (ARCHITECTURE §21, props artist).

Rooftop clutter (Sintex tank, TV yagi, cable dish, clothesline), colony furniture (cement bench,
colony gate, roadside hoarding), play (gully cricket, municipal playground, lingocha / seven
stones), Deccan granite boulders, festival props (Ganesh idol, Bonalu bonam, Sankranti patang,
light string, Christmas star) and pothole decals. Every asset: family 'prop', one baked atlas
(+ unbaked '@night' glow materials where noted), origin on the ground at the footprint centre,
front = -Y.
"""
import math
import random

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

import kit
import props_kit as P

V = Vector
TAU = math.tau


# =========================================================================== local helpers
def drop_bottom(ob, z=0.02):
    """Delete downward faces lying on the ground (never seen)."""
    kit.apply_modifiers(ob)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    kill = [f for f in bm.faces if f.normal.z < -0.9 and all(v.co.z <= z for v in f.verts)]
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def rod(name, a, b, r, mat, seg=4, cap=False):
    return P.taper(name, [a, b], (r, r), seg=seg, mat=mat, cap_end=cap, cap_start=cap)


def sag(a, b, s, n):
    a, b = V(a), V(b)
    return [a.lerp(b, i / n) - V((0, 0, 4 * s * (i / n) * (1 - i / n))) for i in range(n + 1)]


def surf(name, fn, nu, nv, mats, mfn=None):
    """Parametric grid fn(u, v) -> point; vertex index = j * (nu + 1) + i (v rows)."""
    bm = bmesh.new()
    vs = [[bm.verts.new(fn(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            if mfn:
                f.material_index = mfn(i, j)
    ob = kit.obj_from_bm(bm, name, mats[0])
    for m in mats[1:]:
        ob.data.materials.append(m)
    return ob


def ellip(name, r, loc, mat, seg=10, rings=6, rot=(0, 0, 0)):
    """Low-poly ellipsoid (radii r = (rx, ry, rz)) via a lathe."""
    prof = [(math.sin(math.pi * k / rings), -math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    prof = [(0.0 if abs(p[0]) < 1e-4 else p[0], p[1]) for p in prof]
    ob = kit.lathe(name, prof, seg=seg, mat=mat, close_top=False, close_bottom=False)
    P.xform(ob, loc, rot, r)
    kit.smooth(ob, 80)
    return ob


def quad(name, c, n, w, h, mat, up=(0, 0, 1)):
    """A small flat quad centred at c facing n (paint dots, labels)."""
    n = V(n).normalized()
    a = n.cross(V(up))
    if a.length < 1e-4:
        a = n.cross(V((1, 0, 0)))
    a.normalize()
    b = a.cross(n).normalized()
    c = V(c)
    bm = bmesh.new()
    vs = [bm.verts.new(c + a * sx * w / 2 + b * sy * h / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(n) < 0:
        f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


def poly_mesh(name, verts, faces, mat):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    return kit.obj_from_bm(bm, name, mat)


def paint(key, name, base, **kw):
    return P.M(key, name, base=base, **kw)


def glow(name, base, emit, rough=0.35):
    """Unbaked emissive material whose name ends in '@night' (the runtime scales its glow with
    the night factor). Each colour needs its own key so the exported names stay unique."""
    return kit.material(name, name + '@night', base=base, emit=emit, rough=rough, alpha=1.0, bake=False)


def image_board(name, img, w, h, loc, depth, frame_mat):
    """A board facing -Y whose front face shows `img` (through SignUV, baked like kit.signboard)."""
    sm = kit.sign_material(img, grime=0.45)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=V((w, depth, h)), verts=bm.verts)
    suv = bm.loops.layers.uv.new('SignUV')
    bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        front = f.normal.y < -0.9
        f.material_index = 0 if front else 1
        for lp in f.loops:
            co = lp.vert.co
            lp[suv].uv = ((co.x / w + 0.5), (co.z / h + 0.5)) if front else (0.02, 0.02)
    bmesh.ops.translate(bm, vec=V(loc), verts=bm.verts)
    ob = kit.obj_from_bm(bm, name, sm)
    ob.data.materials.append(frame_mat)
    return ob


def shot(az=-35, el=22, fov=32, name=None, target=None, dist=None, size=None):
    v = {'az': az, 'el': el, 'fov': fov}
    if target is not None:
        v['target'] = tuple(target)
    if dist is not None:
        v['dist'] = dist
    s = {'view': v}
    if name:
        s['name'] = name
    if size:
        s['size'] = size
    return s


def size_meta(A, ob):
    lo, hi = kit.bounds([ob])
    A.meta['size'] = [round(hi.x - lo.x, 2), round(hi.y - lo.y, 2), round(hi.z - lo.z, 2)]
    return lo, hi


# =========================================================================== rooftop
@kit.asset('tank_sintex', 'prop', kind='roof')
def b_tank_sintex(A):
    blk = P.M('sintex_black')
    con = P.M('concrete_old')
    gi = P.M('galvanised')
    pvc = P.M('plastic_white')
    brass = P.M('brass')
    objs = []
    pl = kit.box('plinth', (5.6, 5.6, 0.4), (0, 0, 0), con, base=True)
    objs.append(drop_bottom(pl))
    R, z0 = 2.4, 0.4
    prof = [(R - 0.12, z0), (R, z0 + 0.18)]
    z = z0 + 0.5
    for k in range(5):
        prof += [(R, z), (R - 0.1, z + 0.13), (R, z + 0.26)]
        z += 0.62
    prof += [(R, z + 0.02), (R * 0.86, z + 0.42), (R * 0.6, z + 0.66), (1.0, z + 0.76)]
    ztop = z + 0.76
    tank = kit.lathe('tank', prof, seg=14, mat=blk, close_bottom=False)
    kit.smooth(tank, 50)
    objs.append(tank)
    lid = kit.cylinder('lid', 0.92, 0.3, (0, 0, ztop - 0.02), seg=12, mat=blk)
    objs.append(lid)
    lid_knob = kit.box('lidknob', (0.9, 0.16, 0.12), (0, 0, ztop + 0.28), blk, base=True)
    objs.append(lid_knob)

    def pol(a, r, zz):
        a = math.radians(a)
        return (r * math.cos(a), r * math.sin(a), zz)
    # inlet (GI) up the back, over the shoulder into the dome
    inlet = P.taper('inlet', [pol(70, 3.0, 0.4), pol(70, 3.0, ztop - 0.25), pol(70, 2.55, ztop + 0.1),
                              pol(70, 1.6, ztop + 0.12), pol(70, 1.35, ztop - 0.15)], (0.11, 0.11), seg=6, mat=gi)
    kit.smooth(inlet, 60)
    objs.append(inlet)
    # outlet (GI) low at the front right with a brass valve, elbow down to the roof
    outlet = P.taper('outlet', [pol(-55, 2.2, 0.95), pol(-55, 3.0, 0.95), pol(-55, 3.2, 0.75), pol(-55, 3.2, 0.4)],
                     (0.11, 0.11), seg=6, mat=gi)
    kit.smooth(outlet, 60)
    objs.append(outlet)
    vx, vy, _ = pol(-55, 2.68, 0)
    valve = kit.box('valve', (0.3, 0.3, 0.3), (vx, vy, 0.95), brass)
    valve.rotation_euler = (0, 0, math.radians(-55))
    kit.apply_transform(valve)
    objs.append(valve)
    objs.append(rod('valvestem', (vx, vy, 1.1), (vx, vy, 1.35), 0.04, brass))
    objs.append(kit.cylinder('valvewheel', 0.16, 0.05, (vx, vy, 1.35), seg=6, mat=P.M('paint_red')))
    # overflow (white PVC) out of the upper side, down over the plinth edge
    ov = P.taper('overflow', [pol(200, 2.2, z - 0.25), pol(200, 3.15, z - 0.25), pol(200, 3.3, z - 0.45), pol(200, 3.3, 0.55)],
                 (0.09, 0.09), seg=6, mat=pvc)
    kit.smooth(ov, 60)
    objs.append(ov)
    # a couple of bricks under the outlet
    objs.append(kit.box('brick', (0.9, 0.45, 0.3), (pol(-55, 3.2, 0)[0], pol(-55, 3.2, 0)[1], 0.4), P.M('clay', 'brick', base='#9a4a30'), base=True))
    ob = P.finish_prop(A, objs, size=128)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-35, 24)]}


@kit.asset('antenna_tv', 'prop', kind='roof')
def b_antenna_tv(A):
    gi = P.M('galvanised')
    al = P.M('aluminium')
    cab = P.M('cable_black')
    con = P.M('concrete_old')
    blk = P.M('plastic_black')
    objs = []
    base = kit.box('base', (1.0, 1.0, 0.6), (0, 0, 0), con, base=True)
    objs.append(drop_bottom(base))
    H = 16.0
    mast = rod('mast', (0, 0, 0.3), (0, 0, H - 0.3), 0.1, gi, seg=6, cap=True)
    objs.append(mast)
    rnd = random.Random(7)

    def yagi(tag, z, y0, y1, lengths, r=0.04):
        out = [rod(tag + 'boom', (0, y0, z), (0, y1, z), 0.06, al, seg=4, cap=True)]
        n = len(lengths)
        for i, L in enumerate(lengths):
            y = y0 + (y1 - y0) * i / (n - 1)
            bend = rnd.uniform(-0.12, 0.12)
            sag_ = rnd.uniform(-0.15, 0.1)
            out.append(P.taper('%sel%d' % (tag, i), [(-L / 2, y + bend, z + sag_), (0, y, z), (L / 2, y - bend, z + sag_ * 0.6)],
                               (r, r), seg=4, mat=al, cap_end=False))
        return out
    # big VHF fishbone (points to -Y: reflector at the back)
    objs += yagi('a', H - 0.6, 2.6, -3.0, [4.6, 4.1, 3.6, 3.4, 3.2, 3.0, 2.8])
    # folded dipole loop + junction box
    objs.append(rod('fold', (-2.0, 1.55, H - 0.45), (2.0, 1.55, H - 0.45), 0.035, al))
    objs.append(kit.box('jbox', (0.45, 0.3, 0.3), (0, 1.73, H - 0.5), blk))
    # small UHF yagi lower down
    objs += yagi('b', H - 3.2, 1.2, -1.6, [1.9, 1.7, 1.5, 1.4, 1.3, 1.2], r=0.03)
    objs.append(kit.box('clamp1', (0.3, 0.3, 0.35), (0, 0, H - 0.6), gi))
    objs.append(kit.box('clamp2', (0.26, 0.26, 0.3), (0, 0, H - 3.2), gi))
    # black cable: from the junction box, loosely down the mast, then trailing across the roof
    pts = [(0, 1.73, H - 0.65), (0.15, 0.9, H - 1.2), (0.16, 0.12, H - 2.0)]
    zz = H - 2.0
    k = 0
    while zz > 1.2:
        zz -= 1.6
        k += 1
        a = k * 1.3
        pts.append((0.17 * math.cos(a), 0.17 * math.sin(a), zz))
    pts += [(0.35, 0.3, 0.5), (0.9, 0.9, 0.04), (2.2, 1.6, 0.04), (3.6, 1.9, 0.04)]
    cable = P.taper('cable', pts, (0.045, 0.045), seg=4, mat=cab, cap_end=False)
    objs.append(cable)
    # two thin guy wires
    for i, a in enumerate((2.2, 4.3)):
        objs.append(rod('guy%d' % i, (0, 0, H - 5.5), (4.5 * math.cos(a), 4.5 * math.sin(a), 0.02), 0.025, gi, seg=3))
    for o in objs:
        if o.name.startswith(('a', 'b')) or o.name in ('mast', 'cable'):
            kit.smooth(o, 60)
    ob = P.finish_prop(A, objs, size=128)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-35, 18), shot(-40, 25, 30, 'head', target=(0, 0, H - 1.6), dist=16)]}


@kit.asset('antenna_dish', 'prop', kind='roof')
def b_antenna_dish(A):
    gi = P.M('galvanised')
    dishm = paint('paint_white', 'dish_paint', '#cfd0cc', chips=0.25, under='#8a8c88')
    cab = P.M('cable_black')
    blk = P.M('plastic_black')
    con = P.M('concrete_old')
    objs = []
    objs.append(drop_bottom(kit.box('foot', (1.3, 1.3, 0.35), (0, 0.4, 0), con, base=True)))
    objs.append(kit.box('plate', (0.9, 0.9, 0.08), (0, 0.4, 0.35), gi, base=True))
    objs.append(rod('pole', (0, 0.4, 0.4), (0, 0.4, 2.7), 0.1, gi, seg=6, cap=True))
    f = 1.1
    Rd = 1.5
    front = [(Rd * t, (Rd * t) ** 2 / (4 * f)) for t in (0.0, 0.4, 0.75, 1.0)]
    back = [(Rd * t * 1.0, (Rd * t) ** 2 / (4 * f) - 0.07) for t in (1.0, 0.75, 0.4, 0.0)]
    prof = [(r, z - 0.07) for r, z in reversed(back)] if False else None
    # lathe: back face (bottom, r ascending) -> rim -> front face (r descending)
    prof = [(r, z) for r, z in reversed(back)] + [(Rd + 0.05, Rd ** 2 / (4 * f) + 0.0)] + list(reversed(front))
    dish = kit.lathe('dish', prof, seg=16, mat=dishm, close_top=False, close_bottom=False)
    kit.smooth(dish, 50)
    tilt = math.radians(56)
    C = V((0, -0.35, 2.95))
    M_ = Matrix.Translation(C) @ Matrix.Rotation(tilt, 4, 'X')
    dish.data.transform(M_)
    objs.append(dish)
    ax = (Matrix.Rotation(tilt, 3, 'X') @ V((0, 0, 1))).normalized()
    focus = C + ax * f
    rim_lo = M_ @ V((0, -Rd * 0.98, Rd ** 2 / (4 * f) * 0.96))
    objs.append(rod('arm', rim_lo, focus - ax * 0.15, 0.05, gi, seg=4, cap=True))
    lnb = kit.cylinder('lnb', 0.13, 0.42, (0, 0, -0.21), seg=6, mat=blk)
    lnb.data.transform(Matrix.Translation(focus) @ ax.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    objs.append(lnb)
    objs.append(kit.box('lnbbox', (0.3, 0.26, 0.24), tuple(focus + ax * 0.18 - V((0, 0, 0.05))), blk))
    # mount bracket from the dish back to the pole top
    back_c = C - ax * 0.12
    objs.append(rod('brk', back_c, (0, 0.4, 2.6), 0.08, gi, seg=6, cap=True))
    objs.append(kit.box('clamp', (0.3, 0.3, 0.4), (0, 0.4, 2.55), gi))
    # cable: LNB -> arm -> down the pole -> away over the roof
    cpts = [focus - ax * 0.3, rim_lo + V((0.08, 0, 0)), (0.1, 0.25, 2.3), (0.12, 0.28, 1.4), (0.12, 0.3, 0.55),
            (0.5, 0.95, 0.38), (1.1, 1.4, 0.04), (2.1, 1.6, 0.04)]
    objs.append(P.taper('cable', cpts, (0.035, 0.035), seg=4, mat=cab, cap_end=False))
    ob = P.finish_prop(A, objs, size=128, ao_dist=2.0)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-35, 22), shot(150, 20, 32, 'back')]}


@kit.asset('clothesline', 'prop', kind='roof', wind=True)
def b_clothesline(A):
    gi = P.M('galvanised')
    con = P.M('concrete_old')
    wire_m = P.M('galvanised', 'wire_gi', base='#7a7e80', rust=0.4)
    saree = P.M('cloth_red', 'saree', base='#c0306e', weave=0.05)
    saree_b = P.M('cloth_red', 'saree_border', base='#2f8a4a', weave=0.05)
    zari = P.M('cloth_red', 'saree_zari', base='#d8a838', weave=0.03)
    shirt_a = P.M('cloth_red', 'shirt_blue', base='#6f9cc8', weave=0.12)
    shirt_b = P.M('cloth_red', 'shirt_white', base='#e8e6dc', weave=0.06, dirt='#8a8270')
    towel = P.M('cloth_red', 'towel', base='#e8e0cc', weave=0.14)
    towel_s = P.M('cloth_red', 'towel_stripe', base='#b8302a', weave=0.14)
    lungi = P.M('cloth_red', 'lungi', base='#2a4f8a', weave=0.08)
    objs = []
    X = 7.6
    TOP = 6.6
    SAG = 0.45
    wires_y = (-0.42, 0.42)
    for sx in (-1, 1):
        x = sx * X
        objs.append(drop_bottom(kit.box('foot%d' % sx, (0.8, 0.8, 0.35), (x, 0, 0), con, base=True)))
        objs.append(rod('post%d' % sx, (x, 0, 0.3), (x, 0, TOP + 0.15), 0.13, gi, seg=6, cap=True))
        objs.append(rod('tee%d' % sx, (x, -0.6, TOP), (x, 0.6, TOP), 0.08, gi, seg=6, cap=True))
    for p in objs:
        P.wind(p, 0.0, 0.0, 0.0)

    def wz(x):
        t = (x + X) / (2 * X)
        return TOP - 0.05 - 4 * SAG * t * (1 - t)
    for k, y in enumerate(wires_y):
        w = P.taper('wire%d' % k, sag((-X, y, TOP - 0.05), (X, y, TOP - 0.05), SAG, 12), (0.03, 0.03), seg=3, mat=wire_m, cap_end=False)
        P.wind(w, lambda co, i: 0.15 * math.sin(math.pi * min(1, max(0, (co.x + X) / (2 * X)))), 0.0, 0.0)
        objs.append(w)

    def garment(name, x0, x1, y, drop, mats, nu, nv, phase, folded=False, mfn=None, wave=0.14, flare=0.0):
        """Cloth hanging from the wire at y between x0..x1, `drop` u long. folded: draped over
        the wire (front + back layer, v runs -1 .. 1 with the wire at 0)."""
        def fn(u, v):
            x = x0 + (x1 - x0) * u
            if folded:
                s = 2 * v - 1          # -1 front hem .. 0 wire .. 1 back hem
                d = abs(s)
                yy = y + (-1 if s < 0 else 1) * (0.05 + 0.08 * d) if d > 0.02 else y
                hang = d * drop
            else:
                d = v
                yy = y + 0.02
                hang = d * drop
            xx = x + (x - (x0 + x1) / 2) * flare * d
            ripple = wave * d * math.sin(u * TAU * 1.5 + phase * 6.0 + d * 2.0)
            return V((xx, yy + ripple, wz(x) - 0.04 - hang))
        nvv = nv * 2 if folded else nv
        g = surf(name, fn, nu, nvv, mats, mfn)
        if folded:
            bend = lambda co, i: abs(2 * ((i // (nu + 1)) / nvv) - 1)
        else:
            bend = lambda co, i: (i // (nu + 1)) / nvv
        P.wind(g, bend, phase, 1.0)
        return g
    # saree (folded over the front wire, green border with a zari line at the hem)
    nv_s = 6
    objs.append(garment('saree', -6.8, -1.6, wires_y[0], 4.1, [saree, saree_b, zari], 6, nv_s, 0.05, folded=True,
                        mfn=lambda i, j: (1 if j == 0 or j == 2 * nv_s - 1 else (2 if j in (1, 2 * nv_s - 2) else 0)), wave=0.16))
    # shirt (blue) pegged at the shoulders + its sleeves
    sx0, sx1 = -0.9, 1.3
    objs.append(garment('shirtA', sx0, sx1, wires_y[0], 2.8, [shirt_a], 3, 3, 0.37, wave=0.08, flare=0.05))
    for s, xs in ((-1, sx0), (1, sx1)):
        def sfn(u, v, s=s, xs=xs):
            x = xs + s * (0.05 + 0.35 * v) + s * u * 0.62 * (1 - 0.3 * v)
            return V((x, wires_y[0] + 0.03 + 0.05 * v, wz(xs) - 0.12 - 0.15 * u - 1.6 * v))
        sl = surf('sleeve%d' % s, sfn, 1, 2, [shirt_a])
        P.wind(sl, lambda co, i: 0.2 + 0.6 * (i // 2) / 2, 0.37, 1.0)
        objs.append(sl)
    # white school shirt / banian
    objs.append(garment('shirtB', 1.8, 3.6, wires_y[0], 2.4, [shirt_b], 3, 3, 0.61, wave=0.1))
    # towel with red stripes, draped over the front wire
    objs.append(garment('towel', 4.1, 6.4, wires_y[0], 1.9, [towel, towel_s], 3, 3, 0.83, folded=True,
                        mfn=lambda i, j: 1 if j in (1, 4) else 0, wave=0.08))
    # lungi folded over the back wire
    objs.append(garment('lungi', -1.2, 3.4, wires_y[1], 2.6, [lungi, shirt_b], 4, 3, 0.21, folded=True,
                        mfn=lambda i, j: 1 if j in (1, 4) else 0, wave=0.12))
    ob = P.finish_prop(A, objs, size=128, double=True)
    size_meta(A, ob)
    A.meta['wind'] = True
    A.meta['windAttr'] = {'attribute': '_WIND', 'three': '_wind', 'scale': 255, 'r': 'bend 0 (wire) -> 1 (hem)',
                          'g': 'flutter phase per garment', 'b': 'flutter mask (1 = cloth)', 'a': 'spare'}
    A.preview = {'shots': [shot(-30, 16)]}


# =========================================================================== colony furniture
@kit.asset('bench_cement', 'prop', kind='furniture')
def b_bench_cement(A):
    con = P.M('concrete_old', 'bench_con', base='#a49e92', chips=0.3, under='#c8c2b4', grime=0.7)
    objs = []
    leg_outline = [(-0.85, 0.0), (0.95, 0.0), (0.95, 0.3), (0.5, 0.42), (0.5, 2.0), (1.15, 4.1), (0.78, 4.18),
                   (0.12, 2.0), (-0.5, 2.0), (-0.5, 0.42), (-0.85, 0.3)]
    for sx in (-1, 1):
        leg = kit.prism_from_outline('leg%d' % sx, [(y, z) for y, z in leg_outline], 0.55, axis='X', center=(sx * 3.6, 0, 0), mat=con)
        # prism axis X maps outline x -> -Y; flip so the backrest leans to +Y (the back)
        leg.scale = (1, -1, 1)
        kit.apply_transform(leg)
        bm = bmesh.new()
        bm.from_mesh(leg.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(leg.data)
        bm.free()
        objs.append(drop_bottom(leg))
    seat = kit.box('seat', (9.0, 2.0, 0.34), (0, 0.05, 2.0), con, base=True, bevel=0.06, segments=1)
    objs.append(seat)
    back = kit.box('back', (9.0, 0.3, 1.25), (0, 0, 0), con, bevel=0.05, segments=1)
    P.xform(back, (0, 0.92 + 0.0, 3.35), (math.radians(-16), 0, 0))
    objs.append(back)
    # a broken-off corner chunk lying under the seat
    objs.append(P.blob('chunk', 0.28, (2.2, -0.6, 0.12), subdiv=1, noise=0.3, seed=3, mat=con, scale=(1.3, 0.9, 0.5)))
    for o in objs[:2]:
        kit.flat(o)
    ob = P.finish_prop(A, objs, size=128)
    size_meta(A, ob)
    A.anchor('seat', (0, -0.2, 2.34))
    A.preview = {'shots': [shot(-35, 20)]}


@kit.asset('gate_colony', 'prop', kind='gate')
def b_gate_colony(A):
    plaster = paint('paint_white', 'pillar_cream', '#e6d8a8', chips=0.25, under='#a89c84', streaks=0.35, ground=4.0, dirt='#6a5a40')
    band = paint('paint_red', 'pillar_band', '#8a2a24', chips=0.3, under='#a89c84')
    iron = P.M('rail_steel', 'gate_iron', base='#24282a', rust=0.35)
    tips = P.M('aluminium', 'gate_tips', base='#c8c8c0')
    objs = []
    PX = 13.6
    for sx in (-1, 1):
        x = sx * PX
        objs.append(drop_bottom(kit.box('plinth%d' % sx, (3.2, 3.2, 1.2), (x, 0, 0), band, base=True, bevel=0.05, segments=1)))
        objs.append(kit.box('shaft%d' % sx, (2.5, 2.5, 10.4), (x, 0, 1.2), plaster, base=True))
        objs.append(kit.box('band%d' % sx, (2.7, 2.7, 0.5), (x, 0, 9.2), band, base=True))
        objs.append(kit.box('corn%d' % sx, (3.2, 3.2, 0.55), (x, 0, 11.6), band, base=True, bevel=0.05, segments=1))
        cap = kit.lathe('cap%d' % sx, [(1.45, 0), (1.45, 0.25), (1.0, 0.6), (0.35, 1.3), (0.0, 1.45)], seg=4, mat=plaster, close_bottom=False)
        P.xform(cap, (x, 0, 12.15), (0, 0, math.pi / 4))
        objs.append(cap)
        objs.append(ellip('ball%d' % sx, (0.35, 0.35, 0.35), (x, 0, 13.85), band, seg=6, rings=4))
    # arch: straight beam + arc + vertical bars, name board in the middle
    xi = PX - 1.25
    beam = kit.box('beam', (2 * xi, 0.25, 0.3), (0, 0, 11.75), iron)
    objs.append(beam)
    arc_pts = []
    n = 12
    for i in range(n + 1):
        t = i / n
        x = -xi + 2 * xi * t
        arc_pts.append((x, 0, 11.75 + 4.6 * math.sin(math.pi * t) ** 0.8))
    objs.append(P.taper('arc', arc_pts, (0.14, 0.14), seg=4, mat=iron, cap_end=True, cap_start=True))
    arc2 = [(x * 0.97, 0, 11.75 + (z - 11.75) * 0.82) for x, _, z in arc_pts]
    for i in range(1, n):
        x, _, z = arc_pts[i]
        if abs(x) < 7.4:
            continue
        objs.append(rod('av%d' % i, (x, 0, 11.9), (x, 0, z), 0.07, iron))
    # scroll rings in the side bays
    for sx in (-1, 1):
        ring = kit.lathe('ring%d' % sx, [(0.7, -0.06), (0.7, 0.06)], seg=8, mat=iron, close_top=False, close_bottom=False)
        P.xform(ring, (sx * 9.6, 0, 13.0), (math.pi / 2, 0, 0))
        objs.append(ring)
    board = kit.signboard('board', 'VIJAYA NAGAR COLONY', 14.6, 2.5, loc=(0, -0.05, 14.0), depth=0.16, fg='#f4eed8',
                          bg='#23508a', frame_mat=iron, px=512)
    objs.append(kit.box('boardframe', (15.0, 0.12, 2.9), (0, 0.06, 14.0), iron))
    # gate leaves (hinged at the pillars, opened inwards)
    W, H, z0 = xi - 0.15, 7.6, 0.45

    def leaf(tag, sx, ang):
        parts = []
        # local: hinge at x=0, leaf runs to x = sx*W
        def L(x, z):
            return V((sx * x, 0, z))
        for z in (z0, z0 + 2.2, z0 + H - 1.3):
            parts.append(rod(tag + 'h%.1f' % z, L(0, z), L(W, z), 0.09, iron, cap=True))
        parts.append(rod(tag + 'st0', L(0.05, z0 - 0.05), L(0.05, z0 + H), 0.11, iron, cap=True))
        parts.append(rod(tag + 'st1', L(W - 0.05, z0 - 0.05), L(W - 0.05, z0 + H - 0.6), 0.1, iron, cap=True))
        nb = 13
        for i in range(1, nb):
            x = W * i / nb
            top = z0 + H - 0.35 - 0.6 * math.sin(math.pi * i / nb) * 0 + 0.5 * (1 - abs(2 * i / nb - 1))
            parts.append(rod(tag + 'b%d' % i, L(x, z0), L(x, top), 0.055, iron))
            tp = kit.cylinder(tag + 't%d' % i, 0.13, 0.4, (0, 0, 0), seg=4, mat=tips, r2=0.0)
            P.xform(tp, L(x, top), (0, 0, math.pi / 4))
            parts.append(tp)
        # a diagonal brace
        parts.append(rod(tag + 'diag', L(0.2, z0 + 0.1), L(W - 0.2, z0 + 2.1), 0.06, iron))
        g = kit.join(parts, tag)
        g.data.transform(Matrix.Translation(V((sx * -xi, 0, 0))).inverted() if False else Matrix.Identity(4))
        # rotate about the hinge (z axis), then move to the hinge position
        g.data.transform(Matrix.Translation(V((-sx * xi, 0, 0))) @ Matrix.Rotation(ang, 4, 'Z'))
        return g
    objs.append(leaf('gl', 1, math.radians(-28)))
    objs.append(leaf('gr', -1, math.radians(22)))
    objs.append(board)
    ob = P.finish_prop(A, objs, size=256)
    size_meta(A, ob)
    A.meta['opening'] = round(2 * xi, 2)
    A.preview = {'shots': [shot(-30, 15), shot(0, 8, 24, 'board', target=(0, 0, 14.2), dist=34)]}


def _poster_image(path, w=512, h=192, seed=11):
    """A faded hand-painted cinema-hoarding style poster: colour blocks only (two stylised
    figures, round pseudo-script title blocks, a credits band). No real film, no text."""
    rs = np.random.RandomState(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w
    v = yy / h       # 0 = bottom row (Blender image order)

    def hexc(hx):
        hx = hx.lstrip('#')
        return np.array([int(hx[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)
    img = np.zeros((h, w, 3), np.float32)
    top, bot = hexc('#f0b04a'), hexc('#a83226')
    img[:] = bot[None, None] * (1 - v[..., None]) + top[None, None] * v[..., None]
    # sun-burst rays behind the hero
    ang = np.arctan2(v - 0.55, (u - 0.74) * w / h)
    rays = (np.sin(ang * 14) > 0.4) & (v > 0.2)
    img[rays] = img[rays] * 0.85 + hexc('#f6d27a') * 0.15

    def ell(cx, cy, rx, ry):
        return ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 < 1.0
    # hero: shoulders, face, hair, moustache
    sh = ell(0.74, 0.08, 0.2, 0.36)
    img[sh] = hexc('#2c3e7a')
    face = ell(0.74, 0.55, 0.085, 0.3)
    img[face] = hexc('#d4925e')
    hair = ell(0.74, 0.8, 0.095, 0.17) & (v > 0.66)
    img[hair] = hexc('#22160f')
    img[ell(0.74, 0.47, 0.035, 0.025)] = hexc('#2a1a12')
    img[ell(0.715, 0.6, 0.012, 0.02)] = hexc('#20140e')
    img[ell(0.765, 0.6, 0.012, 0.02)] = hexc('#20140e')
    # heroine at the right edge
    img[ell(0.93, 0.2, 0.09, 0.3)] = hexc('#c43a6a')
    img[ell(0.93, 0.5, 0.055, 0.2)] = hexc('#e0a476')
    hr = ell(0.945, 0.58, 0.07, 0.26) & ~ell(0.925, 0.5, 0.05, 0.19)
    img[hr] = hexc('#1c120c')
    # villain silhouette at the left bottom
    img[ell(0.08, 0.05, 0.12, 0.3)] = hexc('#3a2a3a')
    img[ell(0.08, 0.36, 0.05, 0.13)] = hexc('#5a3a30')
    # title: round pseudo-script glyphs (rings with a tick), yellow with a red outline
    gx = 0.2
    for i in range(6):
        cx = gx + i * 0.068
        cy = 0.6 + rs.uniform(-0.02, 0.02)
        r = 0.028 + rs.uniform(0, 0.008)
        d = np.sqrt(((u - cx) / (r * h / w * 1.0)) ** 2 * (h / w) ** 0 + 0 * u)  # placeholder (overwritten below)
        dx = (u - cx) * w
        dy = (v - cy) * h
        rr = np.sqrt(dx * dx + dy * dy)
        R = r * w
        out_ring = (rr < R * 1.25) & (rr > R * 0.35)
        ring = (rr < R) & (rr > R * 0.55)
        tick = (np.abs(dx - R * 0.2) < R * 0.6) & (dy > R * 0.9) & (dy < R * 1.6)
        tick_o = (np.abs(dx - R * 0.2) < R * 0.85) & (dy > R * 0.65) & (dy < R * 1.85)
        img[out_ring | tick_o] = hexc('#b8221c')
        img[ring | tick] = hexc('#f8e04a')
        if i % 2:
            leg = (np.abs(dx + R * 0.6) < R * 0.18) & (dy < 0) & (dy > -R * 1.6)
            img[leg] = hexc('#f8e04a')
    # sub-title blocks and credits band
    for i in range(9):
        x0 = 0.2 + i * 0.045
        blk = (u > x0) & (u < x0 + 0.03) & (v > 0.36) & (v < 0.42)
        img[blk] = hexc('#f4f0e0')
    band = v < 0.13
    img[band & (u > 0.18) & (u < 0.62)] = hexc('#1e1a2a')
    for i in range(14):
        x0 = 0.2 + i * 0.03
        blk = (u > x0) & (u < x0 + 0.02) & (v > 0.05) & (v < 0.08)
        img[blk] = hexc('#e8e4d4')
    # fading: sun bleach + vertical rain streaks + torn / peeled patches showing old paper
    img = img * 0.72 + hexc('#e6dcc8') * 0.28
    streak = rs.rand(w).astype(np.float32)
    streak = np.convolve(streak, np.ones(5) / 5, mode='same')
    img *= (0.88 + 0.12 * streak[None, :, None] ** 0.5) * (0.9 + 0.1 * v[..., None])
    for k in range(7):
        cx, cy = rs.uniform(0.05, 0.95), rs.uniform(0.05, 0.95)
        rx, ry = rs.uniform(0.02, 0.06), rs.uniform(0.05, 0.14)
        m = ell(cx, cy, rx, ry) & (rs.rand(h, w) > 0.15)
        img[m] = img[m] * 0.3 + hexc('#dcd6c4') * 0.7
    lin = np.where(img <= 0.04045, img / 12.92, ((img + 0.055) / 1.055) ** 2.4)
    arr = np.ones((h, w, 4), np.float32)
    arr[..., :3] = lin
    kit.save_png(arr, path, srgb=True, name='poster_img')
    im = bpy.data.images.load(path, check_existing=False)
    return im


@kit.asset('hoarding_frame', 'prop', kind='hoarding')
def b_hoarding_frame(A):
    import os
    steel = P.M('rail_steel', 'hoard_steel', base='#5a5450', rust=0.6)
    galv = P.M('galvanised')
    con = P.M('concrete_old')
    objs = []
    W, Hb, zb = 40.0, 15.0, 12.0
    img = _poster_image(os.path.join(kit.TMP_DIR, 'hoarding_poster.png'))
    board = image_board('board', img, W, Hb, (0, 0, zb + Hb / 2), 0.25, steel)
    objs.append(board)
    LX = 11.0
    for sx in (-1, 1):
        x = sx * LX
        objs.append(drop_bottom(kit.box('foot%d' % sx, (2.4, 3.6, 0.8), (x, 1.0, 0), con, base=True)))
        # lattice column: two box chords + zigzag lacing
        for dy in (0.4, 1.6):
            objs.append(kit.box('ch%d_%.1f' % (sx, dy), (0.7, 0.3, zb + Hb - 0.3), (x, dy, 0.8), steel, base=True))
        z = 0.9
        k = 0
        while z < zb - 0.5:
            z2 = min(z + 1.6, zb + Hb - 1.0)
            objs.append(rod('lace%d_%d' % (sx, k), (x, 0.4 + (1.2 if k % 2 else 0), z), (x, 0.4 + (0 if k % 2 else 1.2), z2), 0.06, steel))
            z = z2
            k += 1
        # raking strut to the ground at the back
        objs.append(rod('rake%d' % sx, (x, 1.6, zb + 2.0), (x, 7.5, 0.6), 0.16, steel, seg=4, cap=True))
        objs.append(drop_bottom(kit.box('rfoot%d' % sx, (1.2, 1.2, 0.6), (x, 7.6, 0), con, base=True)))
    # back frame: horizontal and vertical members + diagonals
    for z in (zb + 0.3, zb + Hb / 2, zb + Hb - 0.3):
        objs.append(kit.box('hz%.1f' % z, (W - 0.4, 0.25, 0.35), (0, 0.25, z), steel))
    for i in range(9):
        x = -W / 2 + 0.3 + (W - 0.6) * i / 8
        objs.append(kit.box('vt%d' % i, (0.3, 0.25, Hb - 0.4), (x, 0.3, zb + 0.2), steel, base=True))
        if i < 8:
            x2 = -W / 2 + 0.3 + (W - 0.6) * (i + 1) / 8
            za, zc = (zb + 0.5, zb + Hb / 2 - 0.2) if i % 2 == 0 else (zb + Hb / 2 - 0.2, zb + 0.5)
            objs.append(rod('dg%d' % i, (x, 0.35, za), (x2, 0.35, zc), 0.07, steel))
    # catwalk with brackets and a rail along the bottom front
    objs.append(kit.box('walk', (W, 1.4, 0.12), (0, -0.85, zb - 0.35), galv))
    for i in range(5):
        x = -W / 2 + 1 + (W - 2) * i / 4
        objs.append(rod('wb%d' % i, (x, -1.5, zb - 0.42), (x, 0.0, zb - 1.6), 0.07, steel))
    # lamp arms along the top (hood lamps facing the board)
    for i in range(4):
        x = -15 + 10 * i
        objs.append(rod('la%d' % i, (x, 0.1, zb + Hb), (x, -2.6, zb + Hb + 0.9), 0.06, steel))
        hood = kit.cylinder('lh%d' % i, 0.45, 0.4, (0, 0, -0.2), seg=6, mat=galv, r2=0.2)
        P.xform(hood, (x, -2.7, zb + Hb + 0.75), (math.radians(-130), 0, 0))
        objs.append(hood)
    ob = P.finish_prop(A, objs, size=256)
    size_meta(A, ob)
    A.meta['board'] = {'w': W, 'h': Hb, 'z0': zb, 'face': '-Y'}
    A.preview = {'shots': [shot(-30, 12), shot(150, 15, 32, 'back')]}


# =========================================================================== play
def _bat_parts(tag):
    """Cricket bat standing on its toe at the origin, face towards -Y (local)."""
    wood = P.M('wood_raw', 'willow', base='#d2b07a', grain=0.14, grime=0.5, dirt='#6a5034')
    grip = P.M('rubber', 'bat_grip', base='#8a1e22', grain=0.2)
    tape = P.M('rubber', 'bat_tape', base='#222226')
    xs = [(-0.27, -0.06), (0.27, -0.06), (0.27, 0.04), (0.12, 0.17), (-0.12, 0.17), (-0.27, 0.04)]
    blade = kit.extrude_polygon(tag + 'blade', xs, 0.0, 2.7, wood)
    sh = kit.loft(tag + 'shoulder', [{'c': (0, 0.04, 2.7), 'r': (0.27, 0.11)}, {'c': (0, 0.04, 3.0), 'r': (0.1, 0.09)}], seg=6, mat=wood, cap_start=False)
    handle = kit.cylinder(tag + 'handle', 0.095, 1.25, (0, 0.04, 2.95), seg=6, mat=grip)
    knob = ellip(tag + 'knob', (0.1, 0.1, 0.07), (0, 0.04, 4.2), grip, seg=6, rings=3)
    t = kit.extrude_polygon(tag + 'tape', [(x * 1.03, y * 1.25 - 0.003) for x, y in xs], 0.25, 0.45, tape)
    return [blade, sh, handle, knob, t]


@kit.asset('cricket_bat', 'prop', kind='play')
def b_cricket_bat(A):
    objs = _bat_parts('b')
    for o in objs[1:4]:
        kit.smooth(o, 60)
    ob = P.finish_prop(A, objs, size=64)
    size_meta(A, ob)
    A.anchor('grip', (0, 0.04, 3.6))
    A.anchor('toe', (0, 0, 0))
    A.meta['note'] = 'upright on its toe, face to -Y; grip anchor on the handle'
    A.preview = {'shots': [shot(-35, 18)]}


@kit.asset('cricket_stumps', 'prop', kind='play')
def b_cricket_stumps(A):
    wood = P.M('wood_raw', 'stump_wood', base='#c89a62', grain=0.12, grime=0.5, ground=1.0, dirt='#6a5034')
    soil = P.M('clay', 'pitch_soil', base='#a88660', var=0.18, grain=0.25, grime=0.0)
    ball = P.M('cloth_red', 'tennis_ball', base='#cfd84a', weave=0.0, grain=0.2)
    objs = []
    rnd = random.Random(5)
    n = 14
    pts = []
    for i in range(n):
        a = TAU * i / n
        r = 1.0 + rnd.uniform(-0.12, 0.12)
        pts.append((2.2 * r * math.cos(a), 3.4 * r * math.sin(a) - 0.6, 0.02))
    patch = poly_mesh('patch', [(0, -0.6, 0.035)] + pts, [(0, i + 1, (i + 1) % n + 1) for i in range(n)], soil)
    objs.append(patch)
    for i, x in enumerate((-0.46, 0.0, 0.46)):
        st = kit.lathe('stump%d' % i, [(0.11, 0.0), (0.11, 3.45), (0.08, 3.56), (0.0, 3.6)], seg=6, mat=wood, close_bottom=False)
        P.xform(st, (x, 0, 0), (rnd.uniform(-0.04, 0.04), rnd.uniform(-0.05, 0.05), 0))
        kit.smooth(st, 50)
        objs.append(st)
    for i, x in enumerate((-0.23, 0.23)):
        objs.append(rod('bail%d' % i, (x - 0.24, 0, 3.6), (x + 0.24, 0, 3.6), 0.045, wood, seg=4, cap=True))
    bat = _bat_parts('s')
    for o in bat[1:4]:
        kit.smooth(o, 60)
    for o in bat:
        P.xform(o, (0.95, -1.15, 0.0), (math.radians(-17), math.radians(6), math.radians(-14)))
    objs += bat
    tb = ellip('ball', (0.3, 0.3, 0.3), (-1.2, -2.2, 0.3), ball, seg=8, rings=5)
    objs.append(tb)
    ob = P.finish_prop(A, objs, size=128)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-35, 24)]}


def _steel_paint(name, base):
    return P.M('paint_red', name, base=base, chips=0.5, under='#6a625a', rust=0.25, rust_col='#7a3e1e', grime=0.45)


@kit.asset('play_swing', 'prop', kind='play')
def b_play_swing(A):
    blue = _steel_paint('sw_blue', '#2f62b0')
    yel = _steel_paint('sw_yellow', '#e2b322')
    red = _steel_paint('sw_red', '#b72e26')
    chain = P.M('galvanised', 'chain', base='#8a8c8a', rust=0.4)
    con = P.M('concrete_old')
    soil = P.M('clay', 'swing_soil', base='#8a6a4a', var=0.2, grain=0.3, grime=0.0)
    objs = []
    X, H, SP = 5.4, 10.0, 2.7
    for sx in (-1, 1):
        x = sx * X
        for sy in (-1, 1):
            objs.append(rod('leg%d%d' % (sx, sy), (x, sy * SP, 0.0), (x, sy * 0.08, H), 0.17, blue, seg=6, cap=True))
            objs.append(drop_bottom(kit.box('ft%d%d' % (sx, sy), (0.8, 0.8, 0.3), (x, sy * SP * 0.98, 0), con, base=True)))
        objs.append(rod('brace%d' % sx, (x, -SP * 0.7, 3.0), (x, SP * 0.7, 3.0), 0.11, blue, seg=6, cap=True))
    objs.append(rod('top', (-X - 0.4, 0, H), (X + 0.4, 0, H), 0.22, yel, seg=8, cap=True))
    for i, xc in enumerate((-2.4, 2.4)):
        zs = 1.8
        swing = 0.0 if i == 0 else math.radians(9)
        for dx in (-0.85, 0.85):
            a = V((xc + dx, 0, H - 0.2))
            b = V((xc + dx, -math.sin(swing) * (H - zs), H - math.cos(swing) * (H - zs)))
            objs.append(rod('ch%d%.1f' % (i, dx), a, b, 0.045, chain, seg=4))
            objs.append(kit.box('hk%d%.1f' % (i, dx), (0.18, 0.3, 0.3), tuple(a + V((0, 0, 0.1))), chain))
        seat = kit.box('seat%d' % i, (2.0, 0.85, 0.14), (0, 0, 0), red, bevel=0.03, segments=1)
        P.xform(seat, (xc, -math.sin(swing) * (H - zs), H - math.cos(swing) * (H - zs) - 0.05), (-swing, 0, 0))
        objs.append(seat)
        # scuffed dirt hollow under the seat
        n = 10
        rnd = random.Random(i)
        pts = [(xc + 1.4 * math.cos(TAU * k / n) * rnd.uniform(0.85, 1.15), 2.3 * math.sin(TAU * k / n) * rnd.uniform(0.85, 1.15), 0.02) for k in range(n)]
        objs.append(poly_mesh('dirt%d' % i, [(xc, 0, 0.03)] + pts, [(0, k + 1, (k + 1) % n + 1) for k in range(n)], soil))
    for o in objs:
        if o.name.startswith(('leg', 'brace', 'top', 'ch')):
            kit.smooth(o, 60)
    ob = P.finish_prop(A, objs, size=256)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-35, 18)]}


def sweep(name, path, prof, mats, mi=None, side=(1, 0, 0)):
    """Sweep a closed 2D profile [(x, z)] along a 3D path (x along `side`, z = the in-plane normal)."""
    pts = [V(p) for p in path]
    side = V(side)
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        up = side.cross(t).normalized()
        if up.z < 0:
            up = -up
        rings.append([bm.verts.new(p + side * x + up * z) for x, z in prof])
    m = len(prof)
    for i in range(n - 1):
        for k in range(m):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % m], rings[i + 1][(k + 1) % m], rings[i + 1][k]))
            if mi:
                f.material_index = mi[k]
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.obj_from_bm(bm, name, mats[0])
    for mm in mats[1:]:
        ob.data.materials.append(mm)
    return ob


@kit.asset('play_slide', 'prop', kind='play')
def b_play_slide(A):
    blue = _steel_paint('sl_blue', '#2f62b0')
    yel = _steel_paint('sl_yellow', '#e2b322')
    red = _steel_paint('sl_red', '#b72e26')
    chute_m = P.M('steel', 'chute_steel', base='#b8bab8', rough=0.3, grime=0.5, dirt='#4a4640', var=0.08, grain=0.06)
    con = P.M('concrete_old')
    objs = []
    PZ = 8.0
    HW = 1.15
    # platform
    objs.append(kit.box('plat', (2 * HW + 0.3, 1.8, 0.18), (0, 1.2, PZ - 0.18), yel, base=True))
    for sx in (-1, 1):
        x = sx * HW
        # front posts under the platform
        objs.append(rod('post%d' % sx, (x, 0.35, 0.0), (x, 0.35, PZ + 2.1), 0.13, blue, seg=6, cap=True))
        objs.append(drop_bottom(kit.box('pf%d' % sx, (0.7, 0.7, 0.3), (x, 0.35, 0), con, base=True)))
        # ladder rails from the ground at the back up to the platform, continuing as hand rails
        objs.append(P.taper('rail%d' % sx, [(x, 6.6, 0.0), (x, 2.1, PZ), (x, 1.9, PZ + 2.1), (x, 0.35, PZ + 2.1)],
                            (0.12, 0.12), seg=6, mat=blue, cap_end=True, cap_start=True))
        objs.append(drop_bottom(kit.box('lf%d' % sx, (0.7, 0.7, 0.3), (x, 6.6, 0), con, base=True)))
        # side guard on the platform
        objs.append(rod('guard%d' % sx, (x, 0.35, PZ + 1.0), (x, 2.0, PZ + 1.0), 0.08, blue))
    for i in range(1, 8):
        t = i / 8
        y = 6.6 + (2.1 - 6.6) * t
        z = PZ * t
        objs.append(rod('rung%d' % i, (-HW, y, z), (HW, y, z), 0.08, red, seg=4))
    # chute: U channel, polished bed, painted sides
    path = []
    for i in range(9):
        t = i / 8
        y = 0.35 - 9.5 * t
        z = PZ - 0.1 - (PZ - 1.3) * (3 * t * t - 2 * t * t * t)
        path.append((0, y, z))
    path += [(0, -10.6, 1.2), (0, -11.6, 1.15)]
    prof = [(-HW, 0.65), (-HW + 0.15, 0.65), (-HW + 0.15, 0.06), (HW - 0.15, 0.06), (HW - 0.15, 0.65), (HW, 0.65), (HW, -0.06), (-HW, -0.06)]
    ch = sweep('chute', path, prof, [yel, chute_m], mi=[0, 0, 1, 0, 0, 0, 0, 0])
    kit.smooth(ch, 40)
    objs.append(ch)
    # chute supports
    for y, zt in ((-5.0, 3.6), (-10.9, 1.1)):
        for sx in (-1, 1):
            objs.append(rod('sup%d%.0f' % (sx, y), (sx * (HW - 0.2), y, 0.0), (sx * (HW - 0.2), y, zt), 0.1, blue, seg=6))
        objs.append(rod('supx%.0f' % y, (-(HW - 0.2), y, zt - 0.3), ((HW - 0.2), y, zt - 0.3), 0.08, blue))
    for o in objs:
        if o.name.startswith(('post', 'rail', 'sup')):
            kit.smooth(o, 60)
    ob = P.finish_prop(A, objs, size=256)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-55, 20)]}


@kit.asset('play_seesaw', 'prop', kind='play')
def b_play_seesaw(A):
    blue = _steel_paint('ss_blue', '#2f62b0')
    yel = _steel_paint('ss_yellow', '#e2b322')
    red = _steel_paint('ss_red', '#b72e26')
    rub = P.M('rubber', 'tyre', base='#26262a', grime=0.5, dirt='#6a5a48')
    con = P.M('concrete_old')
    objs = []
    PZ = 2.7
    for sy in (-1, 1):
        y = sy * 0.55
        for sx in (-1, 1):
            objs.append(rod('st%d%d' % (sx, sy), (sx * 1.5, y * 1.6, 0.0), (0, y, PZ), 0.13, yel, seg=6, cap=True))
        objs.append(drop_bottom(kit.box('pf%d' % sy, (3.8, 0.7, 0.3), (0, y * 1.6, 0), con, base=True)))
    objs.append(rod('axle', (0, -0.8, PZ), (0, 0.8, PZ), 0.14, blue, seg=6, cap=True))
    tilt = math.radians(9)
    L = 16.0

    def T(x, z):
        return V((x * math.cos(tilt), 0, PZ + 0.25 + x * math.sin(tilt) + z))
    plank = kit.box('plank', (L, 0.9, 0.2), (0, 0, 0), red, bevel=0.04, segments=1)
    P.xform(plank, (0, 0, PZ + 0.25), (0, -tilt, 0))
    objs.append(plank)
    objs.append(kit.box('hub', (1.0, 1.0, 0.35), (0, 0, PZ + 0.05), blue))
    for sx in (-1, 1):
        xh = sx * (L / 2 - 1.6)
        # handle (inverted U) + seat block
        a, b = T(xh, 0.1), T(xh, 1.5)
        for dy in (-0.35, 0.35):
            objs.append(rod('hd%d%.1f' % (sx, dy), a + V((0, dy, 0)), b + V((0, dy, 0)), 0.07, blue, seg=4))
        objs.append(rod('hb%d' % sx, b + V((0, -0.42, 0)), b + V((0, 0.42, 0)), 0.08, blue, seg=6, cap=True))
        sb = kit.box('sb%d' % sx, (1.2, 0.85, 0.2), (0, 0, 0), yel)
        P.xform(sb, tuple(T(sx * (L / 2 - 0.7), 0.2)), (0, -tilt, 0))
        objs.append(sb)
    # half-buried old tyres under both ends (the low end rests on one)
    for sx in (-1, 1):
        prof = []
        for k in range(9):
            a = TAU * k / 8
            prof.append((1.0 + 0.32 * math.cos(a), 0.32 * math.sin(a)))
        ty = kit.lathe('tyre%d' % sx, prof, seg=10, mat=rub, close_top=False, close_bottom=False)
        P.xform(ty, (sx * (L / 2 - 1.0) * math.cos(tilt), 0, -0.25), (math.pi / 2, 0, 0))
        bm = bmesh.new()
        bm.from_mesh(ty.data)
        kill = [f for f in bm.faces if all(v.co.z < 0.0 for v in f.verts)]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(ty.data)
        bm.free()
        kit.smooth(ty, 60)
        objs.append(ty)
    for o in objs:
        if o.name.startswith(('st', 'axle', 'hd', 'hb')):
            kit.smooth(o, 60)
    ob = P.finish_prop(A, objs, size=256)
    size_meta(A, ob)
    A.meta['pivot'] = [0, 0, PZ]
    A.meta['tilt'] = round(math.degrees(tilt), 1)
    A.preview = {'shots': [shot(-30, 22)]}


@kit.asset('lingocha_stones', 'prop', kind='play')
def b_lingocha_stones(A):
    mats = [P.M('granite_grey', 'stone_grey'), P.M('concrete_old', 'stone_shahabad', base='#7c8274', grime=0.3, ground=0.0),
            P.M('clay', 'stone_brick', base='#9a4e34'), P.M('granite_pink', 'stone_pink'), P.M('marble_white', 'stone_tile', base='#d8d0c0')]
    ball = P.M('cloth_red', 'tennis_ball2', base='#cfd84a', weave=0.0, grain=0.2)
    rnd = random.Random(21)
    objs = []
    z = 0.0
    for i in range(7):
        r = 0.62 - i * 0.045 + rnd.uniform(-0.03, 0.03)
        th = rnd.uniform(0.12, 0.17)
        st = kit.lathe('st%d' % i, [(r * 0.9, 0.0), (r, th * 0.45), (r * 0.9, th), (0.0, th * 1.04)], seg=7, mat=mats[i % len(mats)], close_bottom=(i > 0))
        bm = bmesh.new()
        bm.from_mesh(st.data)
        for v in bm.verts:
            if v.co.xy.length > 1e-4:
                k = rnd.uniform(0.82, 1.12)
                v.co.x *= k * (1.15 if i % 2 else 0.95)
                v.co.y *= k
        bm.to_mesh(st.data)
        bm.free()
        P.xform(st, (rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), z), (rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), rnd.uniform(0, TAU)))
        kit.flat(st)
        objs.append(st)
        z += th * 0.98
    objs.append(ellip('ball', (0.3, 0.3, 0.3), (1.05, -0.55, 0.3), ball, seg=8, rings=5))
    ob = P.finish_prop(A, objs, size=64)
    size_meta(A, ob)
    A.meta['stones'] = 7
    A.preview = {'shots': [shot(-35, 25)]}


# =========================================================================== Deccan granite
def boulder(name, size, loc, seed, mats, sub=3, lumps=0.1, boxy=0.8, sink=0.35, rot=0.0, tris=None, split=None, tilt=(0, 0)):
    """A rounded, weathered Deccan granite boulder. size = (w, d, h). mats = [main, lichen, fresh].
    split: (normal, offset, gap) -> two halves pulled apart (a cracked boulder); returns a list."""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, TAU) for _ in range(12)]
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    for v in bm.verts:
        p = v.co.normalized()
        k = (0.6 * math.sin(p.x * 1.8 + ph[0]) * math.sin(p.y * 1.6 + ph[1]) * math.sin(p.z * 1.7 + ph[2])
             + 0.35 * math.sin(p.x * 3.7 + ph[3]) * math.sin(p.y * 3.3 + ph[4]) * math.sin(p.z * 3.9 + ph[5])
             + 0.12 * math.sin(p.x * 7.1 + ph[6]) * math.sin(p.y * 6.7 + ph[7]) * math.sin(p.z * 7.3 + ph[8]))
        q = V([math.copysign(abs(c) ** boxy, c) for c in p])
        q = q.normalized() * (0.55 * q.length + 0.45)
        rr = 1.0 + lumps * k
        co = V((q.x * size[0] / 2, q.y * size[1] / 2, q.z * size[2] / 2)) * rr
        if co.z < -size[2] * 0.25:     # flatter, slightly undercut bottom
            co.z = -size[2] * 0.25 + (co.z + size[2] * 0.25) * 0.55
        v.co = co
    pieces = []
    if split:
        nrm, off, gap = V(split[0]).normalized(), split[1], split[2]
        for sgn in (1, -1):
            b2 = bm.copy()
            geom = b2.verts[:] + b2.edges[:] + b2.faces[:]
            res = bmesh.ops.bisect_plane(b2, geom=geom, plane_co=nrm * off, plane_no=nrm * sgn, clear_outer=True)
            cut_edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
            fill = bmesh.ops.holes_fill(b2, edges=b2.edges[:], sides=0)
            for f in fill['faces']:
                f.material_index = 2
            bmesh.ops.translate(b2, vec=-nrm * sgn * gap, verts=b2.verts)
            pieces.append(b2)
        bm.free()
    else:
        pieces.append(bm)
    out = []
    for j, b in enumerate(pieces):
        bmesh.ops.recalc_face_normals(b, faces=b.faces)
        b.normal_update()
        for f in b.faces:
            if f.material_index == 2:
                continue
            c = f.calc_center_median()
            nz = f.normal.z
            ln = math.sin(c.x * 0.9 + ph[9]) * math.sin(c.y * 1.1 + ph[10]) + 0.5 * math.sin(c.x * 2.3 + c.y * 1.7 + ph[11])
            if nz > 0.35 and ln > 0.25:
                f.material_index = 1
        ob = kit.obj_from_bm(b, '%s_%d' % (name, j), mats[0])
        for m in mats[1:]:
            ob.data.materials.append(m)
        if tris:
            kit.decimate_to(ob, tris)
        P.xform(ob, (0, 0, 0), (tilt[0], tilt[1], rot + (0.08 * j if split else 0)))
        lo, hi = kit.bounds([ob])
        ob.data.transform(Matrix.Translation(V((loc[0], loc[1], loc[2] - lo.z - sink))))
        kit.smooth(ob, 55)
        out.append(ob)
    return out


def _granite_mats(tag, pink=True):
    main = kit.material('granite_pink' if pink else 'granite_grey', tag + '_main', streaks=0.45, dirt='#3a302c', grime=0.5,
                        var=0.16, base='#a58a7e' if pink else '#8e8a84')
    lichen = kit.material('granite_grey', tag + '_lichen', base='#7e7e68', specks=0.35, var=0.25, grain=0.2, grime=0.4, dirt='#3a3a2c')
    fresh = kit.material('granite_pink', tag + '_fresh', base='#c0a090' if pink else '#a8a49c', specks=0.8, grime=0.25, var=0.06)
    return [main, lichen, fresh]


def _rock_finish(A, objs, size=256):
    ob = P.finish_prop(A, objs, size=size, ao_dist=4.0)
    lo, hi = size_meta(A, ob)
    A.meta['footprint'] = [round(hi.x - lo.x, 2), round(hi.y - lo.y, 2)]
    A.meta['height'] = round(hi.z, 2)
    return ob


@kit.asset('rock_deccan_1', 'prop', kind='rock')
def b_rock1(A):
    mats = _granite_mats('r1')
    objs = boulder('big', (15.5, 14.5, 11.5), (0, 0, 0), 4, mats, sub=3, lumps=0.09, boxy=0.75, sink=0.6, rot=0.4, tris=760)
    # a small loose stone at the foot
    objs += boulder('peb', (2.4, 2.0, 1.4), (6.6, -5.2, 0), 9, mats, sub=1, lumps=0.15, sink=0.25)
    _rock_finish(A, objs)
    A.preview = {'shots': [shot(-35, 18)]}


@kit.asset('rock_deccan_2', 'prop', kind='rock')
def b_rock2(A):
    mats = _granite_mats('r2')
    base = boulder('base', (15.0, 14.0, 7.0), (0, 0, 0), 12, mats, sub=3, lumps=0.08, boxy=0.7, sink=0.5, rot=0.2, tris=560)
    lo, hi = kit.bounds(base)
    top = boulder('top', (10.5, 9.5, 9.0), (0.8, -0.4, 0), 31, mats, sub=3, lumps=0.1, boxy=0.85, sink=0.0, rot=1.1, tris=560, tilt=(0.12, -0.18))
    # rest the top boulder on the base: lift so its lowest point meets the base top near the centre
    tlo, thi = kit.bounds(top)
    for o in top:
        o.data.transform(Matrix.Translation(V((0, 0, hi.z - 0.55 - tlo.z))))
    _rock_finish(A, base + top)
    A.preview = {'shots': [shot(-35, 14)]}


@kit.asset('rock_deccan_3', 'prop', kind='rock')
def b_rock3(A):
    mats = _granite_mats('r3')
    objs = []
    objs += boulder('a', (8.5, 7.5, 6.0), (-2.6, 1.2, 0), 41, mats, sub=2, lumps=0.1, boxy=0.7, sink=0.4, rot=0.3, split=((1, 0.25, 0.1), 0.4, 0.35))
    objs += boulder('b', (6.0, 5.5, 4.0), (4.4, 2.8, 0), 43, mats, sub=2, lumps=0.12, boxy=0.75, sink=0.35, rot=1.2, split=((0.2, 1, -0.1), -0.2, 0.25))
    objs += boulder('c', (5.0, 4.5, 3.2), (2.4, -4.4, 0), 47, mats, sub=2, lumps=0.12, boxy=0.8, sink=0.3, rot=2.0)
    objs += boulder('d', (2.2, 2.0, 1.3), (-4.6, -4.2, 0), 49, mats, sub=1, lumps=0.15, sink=0.2)
    _rock_finish(A, objs)
    A.preview = {'shots': [shot(-35, 26)]}


# =========================================================================== festival
@kit.asset('ganesh_idol', 'prop', kind='festival')
def b_ganesh_idol(A):
    skin = kit.material('skin', 'idol_skin', base='#e8b08e', blush=0.08, region=0, grime=0.35, dirt='#8a5a40', var=0.05)
    skin_in = kit.material('skin', 'idol_ear_in', base='#e89a8a', blush=0.0, region=0, grime=0.3, dirt='#8a5a40')
    dhoti = P.M('cloth_red', 'idol_dhoti', base='#e8b830', weave=0.0, grain=0.04)
    dhoti_b = P.M('cloth_red', 'idol_dhoti_b', base='#b8242a', weave=0.0)
    gold = kit.material('gold_leaf', 'idol_gold', base='#d4a838')
    red = P.M('paint_red', 'idol_red', base='#a8242a', chips=0.0)
    green = P.M('paint_red', 'idol_green', base='#2f7a50', chips=0.0)
    lotus = P.M('paint_red', 'idol_lotus', base='#e88aa0', chips=0.0)
    marig = P.M('flower_orange', 'idol_marigold', base='#f08a1a')
    white = P.M('paint_white', 'idol_white', base='#f4f0e4', chips=0.0)
    dark = kit.material('eye_dark', 'idol_eye')
    mouse = P.M('fur_dark', 'idol_mouse', base='#6e6a6e', ground=0.0)
    laddu = P.M('flower_orange', 'idol_laddu', base='#e89a30')
    objs = []
    # pedestal: two tiers (green with gold edges) + lotus seat
    objs.append(drop_bottom(kit.box('ped0', (5.2, 4.4, 0.7), (0, 0.2, 0), green, base=True)))
    objs.append(kit.box('ped0g', (5.3, 4.5, 0.12), (0, 0.2, 0.68), gold, base=True))
    objs.append(kit.box('ped1', (4.4, 3.6, 0.55), (0, 0.2, 0.8), red, base=True))
    lp = []
    for i in range(17):
        t = i / 16
        lp.append(0)
    petals = kit.lathe('lotus', [(1.9, 1.35), (2.15, 1.55), (1.95, 1.8), (1.6, 1.9)], seg=16, mat=lotus, close_bottom=False)
    bm = bmesh.new()
    bm.from_mesh(petals.data)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        k = 1.0 + 0.08 * math.cos(a * 8)
        v.co.x *= k
        v.co.y *= k
        v.co.z += 0.12 * max(0.0, math.cos(a * 8)) * (v.co.z > 1.6)
    bm.to_mesh(petals.data)
    bm.free()
    kit.smooth(petals, 70)
    objs.append(petals)
    Z = 1.9
    # crossed legs (dhoti) + feet
    objs.append(ellip('lap', (1.85, 1.25, 0.55), (0, -0.25, Z + 0.45), dhoti, seg=12, rings=6))
    objs.append(ellip('lapb', (1.9, 1.3, 0.2), (0, -0.25, Z + 0.22), dhoti_b, seg=12, rings=4))
    for sx in (-1, 1):
        objs.append(ellip('foot%d' % sx, (0.42, 0.25, 0.2), (sx * 0.55, -1.25, Z + 0.55), skin, seg=6, rings=4, rot=(0, 0, sx * 0.5)))
    # belly, chest
    objs.append(ellip('belly', (1.25, 1.1, 1.15), (0, -0.4, Z + 1.45), skin, seg=12, rings=7))
    objs.append(ellip('chest', (1.15, 0.85, 0.95), (0, 0.0, Z + 2.45), skin, seg=10, rings=6))
    # sacred thread / dhoti waist band
    objs.append(P.taper('waist', [(1.15 * math.cos(a), -0.4 + 1.0 * math.sin(a), Z + 1.0) for a in np.linspace(0.0, -math.pi, 9)],
                        (0.13, 0.13), seg=5, mat=dhoti_b))
    # head
    HZ = Z + 3.95
    objs.append(ellip('head', (0.95, 0.9, 1.0), (0, -0.15, HZ), skin, seg=12, rings=7))
    objs.append(ellip('brow', (0.75, 0.55, 0.45), (0, -0.55, HZ + 0.15), skin, seg=8, rings=4))
    # ears: large flat fans
    for sx in (-1, 1):
        e = ellip('ear%d' % sx, (0.95, 0.14, 1.1), (sx * 1.25, 0.05, HZ - 0.1), skin, seg=10, rings=4, rot=(0, sx * 0.25, sx * 0.35))
        objs.append(e)
        objs.append(ellip('earin%d' % sx, (0.75, 0.05, 0.88), (sx * 1.22, -0.06, HZ - 0.1), skin_in, seg=8, rings=3, rot=(0, sx * 0.25, sx * 0.35)))
    # trunk: curls to the idol's left (+X) towards the laddu in the lower left hand
    tr = P.taper('trunk', [(0, -0.85, HZ - 0.05), (0.02, -1.1, HZ - 0.6), (0.1, -1.22, HZ - 1.2), (0.35, -1.25, HZ - 1.65),
                           (0.75, -1.2, HZ - 1.8), (1.0, -1.1, HZ - 1.6)], [0.42, 0.34, 0.26, 0.2, 0.15, 0.1], seg=7, mat=skin)
    kit.smooth(tr, 70)
    objs.append(tr)
    # tusk (right one whole)
    tk = kit.cylinder('tusk', 0.1, 0.55, (0, 0, 0), seg=5, mat=white, r2=0.02)
    P.xform(tk, (-0.38, -0.95, HZ - 0.55), (math.radians(115), 0, math.radians(-20)))
    objs.append(tk)
    # eyes + tilak
    for sx in (-1, 1):
        objs.append(ellip('eyew%d' % sx, (0.16, 0.05, 0.1), (sx * 0.42, -0.86, HZ + 0.12), white, seg=6, rings=3, rot=(0, 0, sx * -0.4)))
        objs.append(ellip('eyed%d' % sx, (0.07, 0.04, 0.07), (sx * 0.42, -0.9, HZ + 0.12), dark, seg=5, rings=3, rot=(0, 0, sx * -0.4)))
    objs.append(quad('tilak', (0, -1.03, HZ + 0.45), (0, -1, 0.3), 0.12, 0.42, red))
    # crown (kireetam)
    crown = kit.lathe('crown', [(0.85, HZ + 0.62), (0.92, HZ + 0.85), (0.72, HZ + 1.0), (0.78, HZ + 1.25), (0.5, HZ + 1.7),
                                (0.38, HZ + 1.8), (0.25, HZ + 2.3), (0.0, HZ + 2.75)], seg=10, mat=gold, close_bottom=False)
    kit.smooth(crown, 50)
    objs.append(crown)
    # arms: upper pair raised (holding a goad and a lotus), lower right in blessing, lower left holding laddus
    SH = Z + 2.85
    arms = [
        (-1, [(-0.95, 0.05, SH), (-1.75, 0.15, SH - 0.2), (-2.05, -0.1, SH + 0.65)], (-2.08, -0.12, SH + 0.85)),
        (1, [(0.95, 0.05, SH), (1.75, 0.15, SH - 0.2), (2.05, -0.1, SH + 0.65)], (2.08, -0.12, SH + 0.85)),
        (-1, [(-1.0, -0.1, SH - 0.15), (-1.55, -0.35, SH - 1.0), (-1.4, -1.0, SH - 0.55)], (-1.4, -1.12, SH - 0.35)),
        (1, [(1.0, -0.1, SH - 0.15), (1.6, -0.4, SH - 1.05), (1.25, -1.1, SH - 1.25)], (1.2, -1.2, SH - 1.25)),
    ]
    for i, (sx, pts, hand) in enumerate(arms):
        a = P.taper('arm%d' % i, pts, [0.32, 0.27, 0.22], seg=6, mat=skin)
        kit.smooth(a, 70)
        objs.append(a)
        objs.append(ellip('hand%d' % i, (0.22, 0.12, 0.27), hand, skin, seg=6, rings=3))
        objs.append(P.taper('band%d' % i, [V(pts[1]) + (V(pts[0]) - V(pts[1])) * 0.45, V(pts[1]) + (V(pts[0]) - V(pts[1])) * 0.35], (0.31, 0.31), seg=6, mat=gold, cap_end=False))
    # upper right: goad (ankusha) ; upper left: lotus bud
    objs.append(rod('goad', (-2.1, -0.15, SH + 0.2), (-2.05, -0.1, SH + 1.6), 0.05, gold, seg=4, cap=True))
    objs.append(kit.cylinder('goadtip', 0.14, 0.35, (-2.05, -0.1, SH + 1.6), seg=4, mat=gold, r2=0.0))
    objs.append(ellip('lotusbud', (0.25, 0.25, 0.35), (2.1, -0.12, SH + 1.25), lotus, seg=6, rings=4))
    # blessing palm (lower right): flat, raised, facing front
    objs.append(ellip('palm', (0.25, 0.07, 0.32), (-1.4, -1.22, SH - 0.25), skin, seg=6, rings=3))
    objs.append(quad('palmmark', (-1.4, -1.3, SH - 0.25), (0, -1, 0), 0.12, 0.12, red))
    # bowl of laddus (lower left)
    objs.append(kit.lathe('bowl', [(0.0, 0.0), (0.32, 0.03), (0.48, 0.25)], seg=8, mat=gold, close_top=False, loc=(1.25, -1.35, SH - 1.55)))
    for k, (dx, dy, dz) in enumerate(((0, 0, 0.32), (0.18, 0.1, 0.27), (-0.18, 0.08, 0.27), (0.02, -0.2, 0.27))):
        objs.append(ellip('ld%d' % k, (0.15, 0.15, 0.15), (1.25 + dx, -1.35 + dy, SH - 1.55 + dz), laddu, seg=6, rings=3))
    # necklace (gold) and marigold garland
    neck = [(0.95 * math.cos(a), -0.05 + 0.8 * math.sin(a) - 0.25 * (math.sin(a) < -0.5), Z + 3.15 - 0.55 * max(0, -math.sin(a)) ** 2)
            for a in np.linspace(0.15, math.pi - 0.15, 9) * -1]
    objs.append(P.taper('necklace', neck, (0.07, 0.07), seg=4, mat=gold))
    garl = [(1.1 * math.cos(a), -0.1 + 1.0 * math.sin(a), Z + 3.2 - 1.6 * max(0, -math.sin(a)) ** 1.5)
            for a in np.linspace(0.1, math.pi - 0.1, 11) * -1]
    g = P.taper('garland', garl, (0.17, 0.17), seg=6, mat=marig)
    kit.smooth(g, 80)
    objs.append(g)
    # backdrop: prabhavali arch (gold rim, red field) + halo behind the head
    outer = kit.arch_outline(6.4, 4.0, 3.4, 'round', n=10)
    objs.append(kit.prism_from_outline('prabha', [(x, z) for x, z in outer], 0.2, center=(0, 1.55, Z - 0.45), mat=gold))
    inner = kit.arch_outline(5.6, 3.8, 3.0, 'round', n=10)
    objs.append(kit.prism_from_outline('prabha_in', [(x, z) for x, z in inner], 0.1, center=(0, 1.42, Z - 0.25), mat=red))
    halo = kit.lathe('halo', [(0.0, 0.0), (1.55, 0.0), (1.75, 0.05)], seg=16, mat=gold, close_top=False, close_bottom=False)
    bm = bmesh.new()
    bm.from_mesh(halo.data)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        if v.co.xy.length > 1.6:
            v.co.xy *= 1.0 + 0.1 * math.cos(a * 8)
    bm.to_mesh(halo.data)
    bm.free()
    P.xform(halo, (0, 1.32, HZ + 0.3), (math.pi / 2, 0, 0))
    objs.append(halo)
    # mooshika (the mouse vahana) at the front of the pedestal
    objs.append(ellip('mouse', (0.42, 0.62, 0.35), (1.6, -1.75, 1.35 + 0.3), mouse, seg=8, rings=4, rot=(0, 0, 0.5)))
    objs.append(ellip('mouseh', (0.22, 0.3, 0.22), (1.35, -2.2, 1.35 + 0.42), mouse, seg=6, rings=3, rot=(0, 0, 0.5)))
    objs.append(ellip('mouseear', (0.14, 0.04, 0.14), (1.35, -2.05, 1.35 + 0.65), skin_in, seg=6, rings=3, rot=(0, 0, 0.5)))
    ob = P.finish_prop(A, objs, size=256, ao_strength=0.5)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-20, 12), shot(0, 6, 26, 'face', target=(0, -0.5, 5.2), dist=13)]}


@kit.asset('bonam_pot', 'prop', kind='festival')
def b_bonam_pot(A):
    tur = P.M('turmeric', 'bonam_turmeric', base='#e2a21c', grime=0.3, dirt='#8a5a14')
    brass = P.M('brass', 'bonam_brass')
    kum = P.M('paint_red', 'kumkum', base='#c01a20', chips=0.0)
    lime = P.M('paint_white', 'bonam_lime', base='#f4f2ea', chips=0.0)
    clay = P.M('clay', 'diya_clay')
    neem = P.M('leaf', 'neem', base='#4f8a2c')
    flame = glow('diya_flame', '#ffc04a', '#ffb030')
    objs = []
    prof = [(0.45, 0.0), (0.72, 0.25), (0.8, 0.55), (0.72, 0.85), (0.45, 1.08), (0.36, 1.18), (0.42, 1.28), (0.44, 1.32)]
    pot = kit.lathe('pot', prof, seg=12, mat=tur, close_bottom=False, close_top=False)
    kit.smooth(pot, 60)
    objs.append(pot)
    # brass plate (lid) and a second small pot on top, the diya on it
    objs.append(kit.lathe('plate', [(0.0, 1.28), (0.52, 1.3), (0.6, 1.38), (0.0, 1.36)], seg=12, mat=brass, close_top=False, close_bottom=False))
    small = kit.lathe('small', [(0.2, 1.36), (0.32, 1.45), (0.3, 1.56), (0.18, 1.64), (0.0, 1.66)], seg=10, mat=brass, close_bottom=False)
    kit.smooth(small, 60)
    objs.append(small)
    diya = kit.lathe('diya', [(0.08, 1.64), (0.22, 1.7), (0.24, 1.76), (0.0, 1.73)], seg=8, mat=clay, close_bottom=False, close_top=False)
    objs.append(diya)
    fl = kit.lathe('flame', [(0.0, 1.74), (0.06, 1.8), (0.04, 1.9), (0.0, 2.0)], seg=5, mat=flame, close_bottom=False)
    P.xform(fl, (0.12, 0, 0))
    objs.append(fl)
    # kumkum dots and white lime dashes around the belly
    for i in range(10):
        a = TAU * i / 10
        n = V((math.cos(a), math.sin(a), 0.1))
        objs.append(quad('kd%d' % i, n * 0.805 + V((0, 0, 0.58)) - V((0, 0, 0.08)), n, 0.13, 0.13, kum))
        a2 = a + TAU / 20
        n2 = V((math.cos(a2), math.sin(a2), -0.25))
        objs.append(quad('ld%d' % i, V((math.cos(a2) * 0.765, math.sin(a2) * 0.765, 0.36)), n2, 0.06, 0.2, lime))
    for i in range(8):
        a = TAU * i / 8
        n = V((math.cos(a), math.sin(a), 0.6))
        objs.append(quad('nk%d' % i, V((math.cos(a) * 0.61, math.sin(a) * 0.61, 0.97)), n, 0.1, 0.1, kum))
    # neem sprigs tucked round the neck
    for i in range(7):
        a = TAU * i / 7 + 0.3
        base = V((math.cos(a) * 0.4, math.sin(a) * 0.4, 1.2))
        d = V((math.cos(a), math.sin(a), 0.9))
        objs.append(P.leaf_fan('neem%d' % i, base, d, 0.6, 0.12, n=5, spread=1.0, droop=0.15, mat=neem, seed=i))
    ob = P.finish_prop(A, objs, size=128, double=True)
    size_meta(A, ob)
    A.preview = {'shots': [shot(-30, 22), shot(-20, 35, 28, 'top', target=(0, 0, 1.3), dist=4.6)]}


@kit.asset('kite_patang', 'prop', kind='festival')
def b_kite_patang(A):
    pa = P.M('paper_kite', 'kite_pink')
    pb = P.M('paper_kite', 'kite_yellow', base='#f0c82a')
    pc = P.M('paper_kite', 'kite_green', base='#2f9a4a')
    bamboo = P.M('wood_raw', 'kite_bamboo', base='#c8a868')
    string = P.M('plastic_white', 'manja', base='#e8d8c8')
    spool_w = P.M('wood_raw', 'spool_wood', base='#a87040')
    objs = []
    Hk, Wk = 2.5, 2.7
    # kite lies on the ground (face up), top tip toward +Y; centre bowed up
    cz = 0.12

    def kp(u, v):   # u across (-1..1), v along (-1 bottom .. 1 top)
        # diamond: |u| + |v| <= 1 mapped from a square grid
        x = (u - v) * 0.5
        y = (u + v) * 0.5
        X = x * Wk / 2 * 1.0
        Y = y * Hk / 2 * 1.0
        return X, Y
    # build the diamond from the rotated grid: corners (0,+H/2) top, (+W/2,0), (0,-H/2), (-W/2,0)
    nu = 4

    def fn(s, t):
        a = 2 * s - 1
        b = 2 * t - 1
        # rotated square -> diamond
        X = (a - b) * 0.5 * Wk / 2
        Y = (a + b) * 0.5 * Hk / 2
        bow = 0.22 * (1 - (2 * X / Wk) ** 2) * max(0.0, 0.6 + Y / Hk)
        return V((X, Y, cz + bow + 0.05 * (1 - abs(2 * X / Wk))))
    kite = surf('kite', fn, nu, nu, [pa, pb], mfn=lambda i, j: 0 if i + j < nu else 1)
    objs.append(kite)
    objs.append(P.taper('spine', [(0, -Hk / 2, cz + 0.02), (0, 0, cz + 0.12), (0, Hk / 2, cz + 0.15)], (0.025, 0.025), seg=4, mat=bamboo))
    bow = [(Wk / 2 * s, 0.32 + 0.35 * (1 - s * s) - 0.0, cz + 0.06 + 0.2 * (1 - s * s)) for s in np.linspace(-1, 1, 7)]
    objs.append(P.taper('kaman', bow, (0.02, 0.02), seg=4, mat=bamboo))
    tail = poly_mesh('tail', [(0, -Hk / 2 + 0.05, cz + 0.02), (-0.35, -Hk / 2 - 0.45, 0.04), (0.35, -Hk / 2 - 0.45, 0.04)], [(0, 1, 2)], pc)
    objs.append(tail)
    # string from the bridle to the spool, lying loosely on the ground
    sx, sy = 2.1, -0.6
    pts = [(0, -0.2, cz + 0.12)]
    for k in range(1, 8):
        t = k / 8
        pts.append((sx * t, -0.2 + (sy + 0.2) * t + 0.25 * math.sin(t * 7), 0.03))
    pts.append((sx, sy, 0.42))
    objs.append(P.taper('manja', pts, (0.015, 0.015), seg=3, mat=string, cap_end=False))
    # spool (charkhi): wound drum + two end rings, lying on its side
    drum = kit.cylinder('drum', 0.28, 0.6, (0, 0, -0.3), seg=8, mat=string)
    for o_ in [drum]:
        P.xform(o_, (sx, sy, 0.42), (0, math.pi / 2, 0.4))
        kit.smooth(o_, 60)
        objs.append(o_)
    for e in (-0.33, 0.33):
        ring = kit.lathe('ring%.2f' % e, [(0.28, -0.04), (0.42, -0.04), (0.42, 0.04), (0.28, 0.04)], seg=8, mat=spool_w, close_top=False, close_bottom=False)
        P.xform(ring, (sx + e * math.cos(0.4), sy + e * math.sin(0.4), 0.42), (0, math.pi / 2, 0.4))
        objs.append(ring)
    hd = rod('handle', (sx - 0.75 * math.cos(0.4), sy - 0.75 * math.sin(0.4), 0.42), (sx + 0.75 * math.cos(0.4), sy + 0.75 * math.sin(0.4), 0.42), 0.05, spool_w, seg=5, cap=True)
    objs.append(hd)
    ob = P.finish_prop(A, objs, size=128, double=True)
    size_meta(A, ob)
    A.meta['note'] = 'lying on the ground face up, top tip to +Y; spool at +X'
    A.preview = {'shots': [shot(-30, 45)]}


@kit.asset('light_string', 'prop', kind='festival')
def b_light_string(A):
    cab = P.M('cable_black', 'ls_wire')
    cols = [('bulb_red', '#e8302a', '#ff3a20'), ('bulb_green', '#2ac040', '#30ff50'),
            ('bulb_yellow', '#f0c020', '#ffd030'), ('bulb_blue', '#3060e8', '#4070ff')]
    gm = [glow(n, b, e) for n, b, e in cols]
    objs = []
    L, Hh, S = 20.0, 12.0, 1.6
    a, b = V((-L / 2, 0, Hh)), V((L / 2, 0, Hh))
    wire = sag(a, b, S, 24)
    objs.append(P.taper('wire', wire, (0.035, 0.035), seg=3, mat=cab, cap_end=False))
    n = 24
    for i in range(n):
        t = (i + 0.5) / n
        p = a.lerp(b, t) - V((0, 0, 4 * S * t * (1 - t)))
        bl = kit.lathe('bulb%d' % i, [(0.0, -0.34), (0.13, -0.2), (0.09, -0.04), (0.0, 0.0)], seg=4, mat=gm[i % 4], close_top=False, close_bottom=False)
        P.xform(bl, tuple(p), (0, 0, math.pi / 4 + i * 0.3))
        objs.append(bl)
    ob = P.finish_prop(A, objs, size=64)
    size_meta(A, ob)
    A.anchor('end_L', tuple(a))
    A.anchor('end_R', tuple(b))
    A.meta['ends'] = [list(a), list(b)]
    A.meta['sag'] = S
    A.meta['night'] = True
    A.preview = {'shots': [shot(-25, 10)]}


@kit.asset('christmas_star', 'prop', kind='festival')
def b_christmas_star(A):
    star_m = glow('star_paper', '#d82a2a', '#ff5a30', rough=0.7)
    trim = P.M('paper_kite', 'star_trim', base='#f2d040')
    tail_m = P.M('paper_kite', 'star_tail', base='#f0e8d0')
    tail_r = P.M('paper_kite', 'star_tail_red', base='#d83030')
    cord = P.M('plastic_white', 'star_cord', base='#e8e4da')
    objs = []
    Ro, Ri, D = 1.45, 0.6, 0.42
    C = V((0, 0, 2.15))
    rim = []
    for k in range(10):
        a = math.pi / 2 + TAU * k / 10
        r = Ro if k % 2 == 0 else Ri
        rim.append(C + V((r * math.cos(a), 0, r * math.sin(a))))
    front, back = C + V((0, -D, 0)), C + V((0, D, 0))
    verts = [tuple(p) for p in rim] + [tuple(front), tuple(back)]
    faces = [(i, (i + 1) % 10, 10) for i in range(10)] + [((i + 1) % 10, i, 11) for i in range(10)]
    star = poly_mesh('star', verts, faces, star_m)
    bm = bmesh.new()
    bm.from_mesh(star.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(star.data)
    bm.free()
    objs.append(star)
    # trim: thin gold strips along the 10 rim edges (cheap quads facing out)
    for i in range(10):
        p, q = rim[i], rim[(i + 1) % 10]
        objs.append(rod('trim%d' % i, p, q, 0.05, trim, seg=4))
    # tails: frilly paper streamers from the two lower points and the bottom notch
    def streamer(name, top, length, w, ph, mat):
        pts = [V(top) + V((0.12 * math.sin(ph + s * 2.2), 0.05 * math.cos(ph + s * 3), -length * s)) for s in np.linspace(0, 1, 6)]
        return P.ribbon(name, pts, [w, w * 0.9, w * 0.8, w * 0.7, w * 0.6, w * 0.5], side=(1, 0, 0), mat=mat)
    for k, idx in enumerate((4, 6)):
        p = rim[idx]
        objs.append(streamer('tl%d' % k, p + V((0, 0, 0.05)), 1.4, 0.32, k * 1.7, tail_m))
        objs.append(streamer('tr%d' % k, p + V((0.12 * (1 if k else -1), 0.02, 0.0)), 1.15, 0.2, k * 2.3 + 1, tail_r))
    objs.append(streamer('tc', rim[5] + V((0, 0, 0.0)), 1.0, 0.26, 0.6, tail_m))
    # hanging cord + loop on the top point
    objs.append(rod('cord', rim[0], rim[0] + V((0, 0, 0.6)), 0.025, cord, seg=3))
    ob = P.finish_prop(A, objs, size=64, double=True)
    lo, hi = kit.bounds([ob])
    # bottom of the tails on the ground plane (z = 0); hang point on top
    ob.data.transform(Matrix.Translation(V((0, 0, -lo.z))))
    size_meta(A, ob)
    A.anchor('hang', (0, 0, hi.z - lo.z))
    A.meta['hang'] = [0, 0, round(hi.z - lo.z, 3)]
    A.meta['night'] = True
    A.preview = {'shots': [shot(-30, 12)]}


# =========================================================================== pothole decals
def crack_material(name, R0, ring=1.0, road='#46454a', dark='#2a292c', crack='#121214'):
    """Opaque road-surface material for the pothole rim: darker, cracked asphalt near the hole
    (radius R0) fading to the plain road colour `ring` u further out. Baked (NOS_* contract)."""
    import json
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m['nos'] = json.dumps({'base': road, 'rough': 0.92})
    m['nos_key'] = 'pothole_crack'
    m['nos_bake'] = True
    m['nos_region'] = 0
    nt = m.node_tree
    for n_ in list(nt.nodes):
        nt.nodes.remove(n_)
    B = kit.NodeBuilder(m)
    geo = B.node('ShaderNodeNewGeometry')
    tc = B.node('ShaderNodeTexCoord')
    coord = B.node('NodeReroute', 'NOS_COORD')
    B.link(tc.outputs['Object'], coord.inputs[0])
    wv = B.value(2.3, 'NOS_W')
    B.value(1.0, 'NOS_AOF')
    sep = B.node('ShaderNodeSeparateXYZ')
    B.link(geo.outputs['Position'], sep.inputs[0])
    r = B.math('SQRT', B.math('ADD', B.math('MULTIPLY', sep.outputs[0], sep.outputs[0]), B.math('MULTIPLY', sep.outputs[1], sep.outputs[1])))
    nz = B.noise(coord.outputs[0], wv, 0.9, detail=3.0)
    rr = B.math('ADD', r, B.math('MULTIPLY', B.math('SUBTRACT', nz, 0.5), 0.8))
    near = B.math('SUBTRACT', 1.0, B.ramp(rr, R0, R0 + ring), clamp=True)
    vor = B.node('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature='DISTANCE_TO_EDGE')
    dist = B.node('ShaderNodeVectorMath', operation='ADD')
    B.link(coord.outputs[0], dist.inputs[0])
    nv = B.node('ShaderNodeTexNoise')
    B.link(coord.outputs[0], nv.inputs['Vector'])
    nv.inputs['Scale'].default_value = 3.0
    sc = B.node('ShaderNodeVectorMath', operation='SCALE')
    B.link(nv.outputs['Color'], sc.inputs[0])
    sc.inputs['Scale'].default_value = 0.25
    B.link(sc.outputs['Vector'], dist.inputs[1])
    B.link(dist.outputs['Vector'], vor.inputs['Vector'])
    vor.inputs['Scale'].default_value = 1.6
    cr = B.math('SUBTRACT', 1.0, B.ramp(vor.outputs['Distance'], 0.0, 0.045), clamp=True)
    cr = B.math('MULTIPLY', cr, B.math('POWER', near, 0.7))
    gr = B.noise(coord.outputs[0], wv, 9.0, detail=2.0)
    base = B.mix(B.math('MULTIPLY', B.math('SUBTRACT', gr, 0.5), 0.5), B.rgb(kit.lin(road)), B.rgb(kit.lin('#5a5852')))
    col = B.mix(B.math('MULTIPLY', near, 0.85), base, B.rgb(kit.lin(dark)))
    col = B.mix(cr, col, B.rgb(kit.lin(crack)))
    alb = B.node('NodeReroute', 'NOS_ALBEDO')
    B.link(col, alb.inputs[0])
    rough = B.value(0.92, 'NOS_ROUGH')
    metal = B.value(0.0, 'NOS_METAL')
    bsdf = B.node('ShaderNodeBsdfPrincipled', 'NOS_BSDF')
    B.link(alb.outputs[0], bsdf.inputs['Base Color'])
    B.link(rough, bsdf.inputs['Roughness'])
    B.link(metal, bsdf.inputs['Metallic'])
    out = B.node('ShaderNodeOutputMaterial', 'NOS_OUT')
    B.link(bsdf.outputs[0], out.inputs['Surface'])
    m.diffuse_color = kit.lin(road)
    return m


def _pothole(A, D, depth, seed, seg=18):
    rnd = random.Random(seed)
    R0 = D / 2
    ring = 1.0
    hole = P.M('asphalt_hole', 'ph_bottom', base='#4a4238', dirt='#2a2420', grime=0.6)
    asph = P.M('asphalt_hole', 'ph_chunk', base='#3a393c', grain=0.3, grime=0.5, dirt='#1e1d20')
    grav = P.M('granite_grey', 'ph_gravel', base='#8a8478', grime=0.4)
    crk = crack_material('ph_crack', R0, ring)
    ph = [rnd.uniform(0, TAU) for _ in range(4)]

    def rad(a):
        return R0 * (1 + 0.13 * math.sin(3 * a + ph[0]) + 0.08 * math.sin(5 * a + ph[1]) + 0.06 * rnd.uniform(-1, 1))
    Rs = [rad(TAU * k / seg) for k in range(seg)]
    # rings: (fraction of the ragged radius or absolute offset beyond it, z)
    inner = [(0.0, -depth), (0.45, -depth * 0.95), (0.75, -depth * 0.8), (0.9, -depth * 0.45), (0.98, -0.12), (1.0, -0.01)]
    outer = [(0.35, 0.012), (ring, 0.02)]
    bm = bmesh.new()
    rings = []
    for fr, z in inner:
        if fr == 0.0:
            rings.append([bm.verts.new((rnd.uniform(-0.1, 0.1) * R0, rnd.uniform(-0.1, 0.1) * R0, z))])
            continue
        rw = []
        for k in range(seg):
            a = TAU * k / seg
            jit = rnd.uniform(-0.04, 0.04) * (fr < 0.97)
            rw.append(bm.verts.new((math.cos(a) * Rs[k] * (fr + jit), math.sin(a) * Rs[k] * (fr + jit), z + rnd.uniform(-0.04, 0.04) * (fr < 0.95))))
        rings.append(rw)
    n_in = len(rings)
    for off, z in outer:
        rw = []
        for k in range(seg):
            a = TAU * k / seg
            rr_ = (R0 + off) if off == ring else (Rs[k] + off)
            rw.append(bm.verts.new((math.cos(a) * rr_, math.sin(a) * rr_, z)))
        rings.append(rw)
    for i in range(len(rings) - 1):
        A_, B_ = rings[i], rings[i + 1]
        for k in range(seg):
            if len(A_) == 1:
                f = bm.faces.new((A_[0], B_[k], B_[(k + 1) % seg]))
            else:
                f = bm.faces.new((A_[k], A_[(k + 1) % seg], B_[(k + 1) % seg], B_[k]))
            f.material_index = 0 if i < n_in - 1 else 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    dish = kit.obj_from_bm(bm, 'dish', hole)
    dish.data.materials.append(crk)
    kit.smooth(dish, 50)
    objs = [dish]
    # broken asphalt chunks around the rim (some tipped into the hole)
    nch = 5 + int(D / 2)
    for c in range(nch):
        k = rnd.randrange(seg)
        a = TAU * k / seg + rnd.uniform(-0.1, 0.1)
        rr = Rs[k] * rnd.uniform(0.85, 1.02)
        s = rnd.uniform(0.35, 0.7) * (0.7 + D / 20)
        poly = [(s * math.cos(t) * rnd.uniform(0.6, 1.1), s * math.sin(t) * rnd.uniform(0.6, 1.1)) for t in np.linspace(0, TAU, 6)[:-1]]
        ch = kit.extrude_polygon('ch%d' % c, poly, -0.12, 0.08, asph)
        tip = rnd.uniform(0.1, 0.45)
        P.xform(ch, (math.cos(a) * rr, math.sin(a) * rr, -0.04 - (0.15 if rr < Rs[k] * 0.93 else 0)), (math.cos(a + 1.57) * tip, math.sin(a + 1.57) * tip, rnd.uniform(0, TAU)))
        objs.append(ch)
    # gravel in the bottom
    for g in range(6 + int(D)):
        a = rnd.uniform(0, TAU)
        rr = rnd.uniform(0, 0.75) * R0
        s = rnd.uniform(0.08, 0.18)
        pb = P.blob('g%d' % g, s, (math.cos(a) * rr, math.sin(a) * rr, -depth * (0.95 if rr < 0.45 * R0 else 0.85) + s * 0.3), subdiv=0,
                    noise=0.2, seed=g + seed, mat=grav, scale=(1, 0.8, 0.6))
        objs.append(pb)
    ob = P.finish_prop(A, objs, size=128, ao_strength=0.5, ao_dist=1.5)
    size_meta(A, ob)
    A.meta['decal'] = True
    A.meta['hole'] = round(D, 2)
    A.meta['depth'] = depth
    A.meta['edgeZ'] = 0.02
    A.preview = {'shots': [shot(-30, 50, 30)]}
    return ob


@kit.asset('pothole_1', 'prop', kind='decal')
def b_pothole_1(A):
    _pothole(A, 4.0, 0.5, 1, seg=16)


@kit.asset('pothole_2', 'prop', kind='decal')
def b_pothole_2(A):
    _pothole(A, 6.0, 0.6, 2, seg=18)


@kit.asset('pothole_3', 'prop', kind='decal')
def b_pothole_3(A):
    _pothole(A, 9.0, 0.65, 3, seg=22)
