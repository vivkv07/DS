"""NOSTALGIA — tools/blender/props_poles.py — electric poles & street electrics (ARCHITECTURE §21,
design/atmosphere.md "Electric poles and overhead wires", design/feedback_3d.md round 3 item 8). Build:
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py pole_psc pole_rail -j 1

Convention: origin = pole base centre on the ground; front -Y faces the road. Line conductors run
along +-X (parallel to the street), so crossarms run along Y. Every model is ONE mesh / one baked
material (instancing-friendly); pole_streetlight adds a tiny unbaked lens material
'M_pole_streetlight_sodium_lens@night' (the runtime scales its emission at night).

Wire attachment empties (glTF nodes `wire_*`, listed in the manifest anchors and meta.wires) sit
exactly where a conductor clamps:
  wire_L1 / wire_L2 / wire_L3  phase conductors (insulator top grooves, >= 32 u above ground)
  wire_N                       neutral (lower, shackle insulator)
  wire_cable                   black cable-TV / phone wires (bracket ~8-10 u lower, >= 24 u)
  wire_service                 service drops to houses (back, +Y side)
  wire_lamp                    pole_streetlight: the lamp head (light source)
  pole_transformer (double pole along X): the '-X' pole carries wire_L1..3 / wire_N, the '+X' pole
  wire_L1b..3b / wire_Nb (meta.wire_sides says which side connects to which neighbour).
  pole_junction_box: wire_cable_in / wire_cable_out (underground cable stubs) + wire_cable_up.
"""
import math

import bmesh
from mathutils import Vector

import kit
import props_kit as P

V = Vector


# =========================================================================== helpers
def frustum(name, z0, z1, h0, h1, c0=(0.0, 0.0), c1=None, mat=None, bottom=False, top=True):
    """Tapered box between z0 and z1: half sizes h0=(hx, hy) at z0, h1 at z1, centres c0 / c1 (xy)."""
    c1 = c1 or c0
    bm = bmesh.new()
    lo = [bm.verts.new((c0[0] + sx * h0[0], c0[1] + sy * h0[1], z0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    hi = [bm.verts.new((c1[0] + sx * h1[0], c1[1] + sy * h1[1], z1)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if bottom:
        bm.faces.new(list(reversed(lo)))
    if top:
        bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def bar(name, a, b, w, h=None, mat=None):
    """A square-section bar (strap, brace, angle) between points a and b (cheap: 4 sides)."""
    return rnd(kit.tube(name, [a, b], w, seg=4, mat=mat, cap=False))


def rnd(ob, angle=179.0):
    """Smooth shading on round parts (shared vertices = smaller pack)."""
    return kit.smooth(ob, angle)


def finish(A, objs, size=128, zscale=0.15, angle=75.0, **kw):
    """finish_prop with a pole-friendly UV atlas: the mesh is squashed in Z while the atlas is
    unwrapped + packed (a 45 u shaft would otherwise force every island into a thin strip of a
    square atlas), and smart-project uses a wider angle (fewer seams = fewer split vertices).
    The bake itself runs on the real geometry; texels just end up taller than wide."""
    orig = kit.uv_atlas

    def uv(objs_, margin=0.004, angle_=None):
        obs = kit.mesh_objects(objs_)
        for o in obs:
            o.scale = (1.0, 1.0, zscale)
            kit.apply_transform(o)
        orig(obs, margin=margin, angle=angle)
        for o in obs:
            o.scale = (1.0, 1.0, 1.0 / zscale)
            kit.apply_transform(o)
    kit.uv_atlas = uv
    try:
        kw.setdefault('orm', False)
        return P.finish_prop(A, objs, size=size, **kw)
    finally:
        kit.uv_atlas = orig


def del_bottom(ob, z=0.01):
    """Delete downward faces lying on the ground (never seen)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    kill = [f for f in bm.faces if f.normal.z < -0.9 and all(v.co.z < z for v in f.verts)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def pin_insulator(name, loc, s=1.0, seg=4, lite=False):
    """11 kV porcelain pin insulator (two sheds + top groove) on a short steel pin.
    Returns (objs, wire point = the top groove)."""
    prof = [(0.14 * s, 0.0), (0.36 * s, 0.30 * s), (0.20 * s, 0.40 * s), (0.50 * s, 0.66 * s), (0.24 * s, 0.92 * s)]
    if lite:
        prof = [(0.16 * s, 0.0), (0.50 * s, 0.62 * s), (0.24 * s, 0.92 * s)]
    ins = rnd(kit.lathe(name, prof, seg=seg, mat=P.M('porcelain'), loc=loc, close_bottom=False))
    return [ins], V(loc) + V((0, 0, 0.9 * s))


def shackle(name, loc, s=1.0, front=(0, -1, 0)):
    """LT shackle (spool) insulator on a D-iron bracket bolted to the pole face. loc = spool centre.
    The bracket straps run back from the spool along -front. Returns (objs, wire point)."""
    loc = V(loc)
    f = V(front).normalized()
    spool = rnd(kit.lathe(name, [(0.30 * s, -0.30 * s), (0.18 * s, 0.0), (0.30 * s, 0.30 * s)], seg=4, mat=P.M('porcelain'), loc=loc))
    gal = P.M('galvanised')
    back = loc - f * 0.75 * s
    # D-iron: one flat strap loop (top, back, bottom) as a single thin ribbon
    sts = [rnd(kit.tube(name + '_d%d' % k, [loc + V((0, 0, dz * s)), back + V((0, 0, dz * s))], 0.06 * s, seg=3, mat=gal, cap=False))
           for k, dz in enumerate((0.36, -0.36))]
    return [spool] + sts, loc + f * 0.2 * s


def channel_y(name, cx, cz, y0, y1, w=0.34, h=0.42, t=0.07, open_dir=-1, mat=None):
    """Steel C-channel crossarm along Y (outline in XZ), web on the pole side, opening toward
    open_dir (-1 = -X)."""
    # a plain box at game distance (the C profile cost 2x the vertices for no visible gain)
    return kit.box(name, (w, abs(y1 - y0), h), (cx, (y0 + y1) / 2, cz), mat=mat)


def angle_y(name, cx, cz, y0, y1, w=0.3, t=0.06, mat=None):
    """L-angle iron along Y (one leg vertical on the pole side, one leg horizontal)."""
    o = [(-w / 2, -w / 2), (w / 2, -w / 2), (w / 2, -w / 2 + t), (-w / 2 + t, -w / 2 + t), (-w / 2 + t, w / 2), (-w / 2, w / 2)]
    o = [(-x, z) for x, z in o]   # vertical leg on +x (pole side when the arm sits at -X)
    return kit.prism_from_outline(name, o, abs(y1 - y0), axis='Y', center=(cx, (y0 + y1) / 2, cz), mat=mat)


# ---------------------------------------------------------------- PSC shaft
PSC_H = 45.0


def psc_dims(z, H=PSC_H):
    t = z / H
    return 0.55 + (0.30 - 0.55) * t, 0.40 + (0.25 - 0.40) * t   # half sizes (x, y)


def i_outline(hx, hy, ft, wy):
    return [(-hx, -hy), (-hx + ft, -hy), (-hx + ft, -wy), (hx - ft, -wy), (hx - ft, -hy), (hx, -hy),
            (hx, hy), (hx - ft, hy), (hx - ft, wy), (-hx + ft, wy), (-hx + ft, hy), (-hx, hy)]


def section_prism(name, outs, zs, x=0.0, mat=None):
    """Prism through a list of same-length outlines [(x, y)...] at heights zs (no bottom, top cap)."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x + px, py, z)) for px, py in o] for o, z in zip(outs, zs)]
    n = len(outs[0])
    for i in range(len(rings) - 1):
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def psc_shaft(prefix, x=0.0, H=PSC_H, holes=(10.0, 40.0, 9.0, 1.0), mat=None):
    """Indian PSC pole: tapering H-section (flanges at +-X, web recessed from the +-Y faces) with
    the web's through holes (dark inset plates) every ~4 u, on a cement muffing block."""
    mat = mat or P.M('concrete', base='#c4bfb2', grime=0.45)
    hx0, hy0 = psc_dims(0, H)
    hx1, hy1 = psc_dims(H, H)
    objs = [section_prism(prefix + '_shaft', [i_outline(hx0, hy0, 0.2, hy0 * 0.42), i_outline(hx1, hy1, 0.12, hy1 * 0.42)], [0.0, H], x=x, mat=mat)]
    hole = P.M('asphalt_hole', 'pole_hole', base='#24221f', grain=0.05, var=0.05)
    z0, z1, step, hh = holes
    bm = bmesh.new()
    z = z0
    while z + hh < z1:
        for s in (-1, 1):
            zc = z + hh / 2
            hx, hy = psc_dims(zc, H)
            ft = 0.2 + (0.12 - 0.2) * zc / H
            w = hx - ft - 0.08
            y = s * (hy * 0.42 + 0.012)
            vs = [bm.verts.new((x + px, y, pz)) for px, pz in ((-w, z), (w, z), (w, z + hh), (-w, z + hh))]
            f = bm.faces.new(vs if s < 0 else list(reversed(vs)))
        z += step
    if bm.faces:
        objs.append(kit.obj_from_bm(bm, prefix + '_holes', hole))
    else:
        bm.free()
    objs.append(frustum(prefix + '_muff', 0.0, 1.3, (hx0 + 0.35, hy0 + 0.35), (hx0 + 0.12, hy0 + 0.12), (x, 0), mat=P.M('concrete_old')))
    return objs


def clamp_band(name, x, z, hx, hy, h=0.45, mat=None):
    return frustum(name, z - h / 2, z + h / 2, (hx + 0.06, hy + 0.06), (hx + 0.06, hy + 0.06), (x, 0), mat=mat or P.M('galvanised'), bottom=False, top=False)


def danger_board(prefix, x, y, z, w=1.25, h=1.0):
    """Plain red/white danger plate: white plate, red border bar, red warning triangle, red
    'text' bars (no skull, no logos). Faces -Y; y = the plate's back."""
    red = P.M('paint_red')
    bm = bmesh.new()
    yy = y - 0.03
    bm.faces.new([bm.verts.new((x + a, yy, z + b)) for a, b in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))])
    objs = [kit.obj_from_bm(bm, prefix + '_plate', P.M('paint_white'))]
    yy = y - 0.05
    bm = bmesh.new()
    def quad(pts):
        bm.faces.new([bm.verts.new((x + a, yy, z + b)) for a, b in pts])
    quad([(-0.26 * w, 0.0), (0.26 * w, 0.0), (0.0, 0.42 * h)])                      # warning triangle
    quad([(-0.25 * w, -0.42 * h), (0.25 * w, -0.42 * h), (0.25 * w, -0.31 * h), (-0.25 * w, -0.31 * h)])  # '440 V'
    objs.append(kit.obj_from_bm(bm, prefix + '_red', red))
    return objs


def cable_coil(name, loc, r=0.55, mat=None):
    """A loose coil of black cable hanging on a pole (classic cable-TV slack)."""
    loc = V(loc)
    pts = []
    for k in range(6):
        a = k / 5 * math.tau * 1.0
        pts.append(loc + V((math.sin(a) * r * 0.35, -math.cos(a) * 0.12 - 0.1, -r + math.cos(a) * r)))
    return rnd(kit.tube(name, pts, 0.07, seg=3, mat=mat or P.M('cable_black'), cap=False))


def wires(A, d):
    for k, p in d.items():
        P.wire(A, k, tuple(round(c, 4) for c in p))
    A.meta['wires'] = ['wire_' + k for k in d.keys()]


def previews(A, top_target, top_dist=13.0, dist=None):
    main = {'az': -35.0, 'el': 14.0, 'fov': 32.0}
    if dist:
        main['dist'] = dist
    A.preview = {'shots': [{'view': main},
                           {'name': 'top', 'view': {'az': -40.0, 'el': 12.0, 'fov': 32.0, 'target': top_target, 'dist': top_dist}}]}


# =========================================================================== pole_psc
@kit.asset('pole_psc', 'prop', kind='pole', variant='psc', height=PSC_H)
def build_psc(A):
    H = PSC_H
    gal = P.M('galvanised')
    objs = psc_shaft('psc')
    # crossarm: steel channel along Y, bolted to the -X flange
    za = 41.2
    hx, hy = psc_dims(za)
    ax = -(hx + 0.2)
    objs.append(channel_y('arm', ax, za, -4.0, 4.0, mat=gal))
    objs.append(clamp_band('arm_clamp', 0.0, za, hx, hy))
    for s in (-1, 1):   # braces from the arm to the pole
        objs.append(bar('brace%d' % s, (ax, s * 2.6, za - 0.2), (-hx - 0.05, s * 0.2, za - 3.0), 0.07, mat=gal))
    W = {}
    for i, y in enumerate((-3.5, -1.0, 3.5)):
        o, p = pin_insulator('ins%d' % i, (ax, y, za + 0.21))
        objs += o
        W['L%d' % (i + 1)] = p
    # neutral: shackle on a D-iron on the front face
    zn = 37.4
    hx, hy = psc_dims(zn)
    o, p = shackle('neut', (0.0, -hy - 0.78, zn))
    objs += o
    objs.append(clamp_band('neut_clamp', 0.0, zn, hx, hy, h=0.3))
    W['N'] = p
    # service drops: a shackle on the back (+Y) face
    zs = 35.0
    hx, hy = psc_dims(zs)
    o, p = shackle('svc', (0.0, hy + 0.78, zs), front=(0, 1, 0))
    objs += o
    W['service'] = p
    objs.append(clamp_band('svc_clamp', 0.0, zs, hx, hy, h=0.9))
    # stay / guy clamp (eye bolt toward -X, along the line) near the top
    zg = 39.6
    hx, hy = psc_dims(zg)
    objs.append(bar('stay_eye', (-hx, 0, zg), (-hx - 0.5, 0, zg - 0.25), 0.07, mat=gal))
    # cable-TV / phone bracket ~9 u below the neutral + slack coil + amplifier box
    zc = 29.0
    hx, hy = psc_dims(zc)
    objs.append(bar('cab_br', (hx, -0.1, zc), (hx + 0.7, -0.1, zc), 0.07, mat=gal))
    objs.append(bar('cab_hook', (hx + 0.7, -0.1, zc), (hx + 0.7, -0.1, zc - 0.35), 0.05, mat=gal))
    W['cable'] = V((hx + 0.7, -0.1, zc - 0.3))
    objs.append(cable_coil('coil', (hx + 0.2, -hy, zc - 1.0)))
    # danger board on the front flange faces
    zb = 12.5
    hx, hy = psc_dims(zb)
    objs += danger_board('danger', 0.0, -hy, zb)
    for o in objs:
        del_bottom(o)
    wires(A, W)
    finish(A, objs, size=128, ao_samples=16)
    previews(A, (-0.5, 0.0, 39.5))


# =========================================================================== pole_rail
RAIL_H = 42.0
RAIL = [(0.45, -0.37), (0.45, 0.37), (0.37, 0.37), (0.30, 0.08), (-0.22, 0.08), (-0.29, 0.19),
        (-0.45, 0.19), (-0.45, -0.19), (-0.29, -0.19), (-0.22, -0.08), (0.30, -0.08), (0.37, -0.37)]


@kit.asset('pole_rail', 'prop', kind='pole', variant='rail', height=RAIL_H)
def build_rail(A):
    H = RAIL_H
    gal = P.M('galvanised')
    rs = P.M('rail_steel', base='#5e5650', rust=0.75, rust_col='#7a4220')
    objs = [kit.extrude_polygon('rail', RAIL, 0.0, H, mat=rs)]
    objs.append(frustum('muff', 0.0, 1.1, (0.85, 0.75), (0.65, 0.55), mat=P.M('concrete_old')))
    objs.append(kit.box('cap', (1.0, 0.85, 0.08), (0.0, 0.0, H + 0.04), mat=rs))
    # crossarm: angle iron along Y bolted to the head (-X)
    za = 39.0
    ax = -0.62
    objs.append(kit.box('arm', (0.3, 6.8, 0.3), (ax, 0.0, za), mat=gal))
    for s in (-1, 1):
        objs.append(bar('brace%d' % s, (ax, s * 2.3, za - 0.15), (-0.47, s * 0.15, za - 2.6), 0.06, mat=gal))
    W = {}
    o, p = pin_insulator('ins0', (ax, -2.9, za + 0.17))
    objs += o
    W['L1'] = p
    # pole-top pin on a short vertical bracket
    objs.append(bar('top_br', (-0.5, 0, H - 1.5), (-0.62, 0, H + 0.5), 0.07, mat=gal))
    o, p = pin_insulator('ins1', (-0.62, 0.0, H + 0.5))
    objs += o
    W['L2'] = p
    o, p = pin_insulator('ins2', (ax, 2.9, za + 0.17))
    objs += o
    W['L3'] = p
    # neutral shackle on the front web face
    o, p = shackle('neut', (0.05, -0.85, 35.2))
    objs += o
    W['N'] = p
    # second short arm (angle) for service drops (+Y) and cable TV / phone (-Y)
    zc = 30.5
    objs.append(kit.box('arm2', (0.24, 4.0, 0.24), (ax, 0.4, zc), mat=gal))
    o, p = shackle('svc', (ax, 2.2, zc + 0.5), s=0.8, front=(0, 1, 0))
    objs += o
    W['service'] = p
    objs.append(bar('cab_hook', (ax, -1.5, zc), (ax, -1.5, zc - 0.4), 0.05, mat=gal))
    W['cable'] = V((ax, -1.5, zc - 0.35))
    # old enamel-style danger plate (same plain red / white)
    objs += danger_board('danger', 0.0, -0.09, 11.5, w=1.0, h=0.85)
    for o in objs:
        del_bottom(o)
    wires(A, W)
    finish(A, objs, size=128, ao_samples=16)
    previews(A, (-0.6, 0.0, 39.5), top_dist=14.0)


# =========================================================================== pole_streetlight
@kit.asset('pole_streetlight', 'prop', kind='pole', variant='streetlight', height=PSC_H, light={'color': '#ffb050', 'anchor': 'wire_lamp'})
def build_streetlight(A):
    gal = P.M('galvanised')
    objs = psc_shaft('psc', holes=(10.0, 9.0, 14.0, 1.0))
    za = 41.2
    hx, hy = psc_dims(za)
    ax = -(hx + 0.2)
    objs.append(channel_y('arm', ax, za, -3.6, 3.6, mat=gal))
    objs.append(clamp_band('arm_clamp', 0.0, za, hx, hy))
    W = {}
    for i, y in enumerate((-3.1, 0.0, 3.1)):
        if i == 1:
            # centre phase on a pole-top pin
            objs.append(bar('top_br', (-hx - 0.05, 0.0, PSC_H - 1.2), (-hx - 0.2, 0.0, PSC_H + 0.4), 0.07, mat=gal))
            o, p = pin_insulator('ins1', (-hx - 0.2, 0.0, PSC_H + 0.4))
        else:
            o, p = pin_insulator('ins%d' % i, (ax, y, za + 0.21))
        objs += o
        W['L%d' % (i + 1)] = p
    zn = 37.4
    hx, hy = psc_dims(zn)
    o, p = shackle('neut', (0.0, hy + 0.78, zn), front=(0, 1, 0))
    objs += o
    W['N'] = p
    zs = 35.0
    hx, hy = psc_dims(zs)
    o, p = shackle('svc', (0.0, hy + 0.78, zs), front=(0, 1, 0))
    objs += o
    W['service'] = p
    # lamp arm: galvanised pipe curving out over the road (-Y) with a lower brace
    zl = 30.0
    hx, hy = psc_dims(zl)
    pts = [(0.0, -hy + 0.05, zl), (0.0, -2.0, zl + 1.2), (0.0, -4.6, zl + 2.05), (0.0, -7.4, zl + 2.25)]
    objs.append(rnd(P.taper('lamp_arm', pts, (0.16, 0.12), seg=4, mat=gal)))
    objs.append(rnd(kit.tube('lamp_brace', [(0.0, -hy + 0.05, zl - 2.2), (0.0, -1.8, zl - 0.6), (0.0, -3.4, zl + 1.65)], 0.09, seg=4, mat=gal, cap=False)))
    objs.append(clamp_band('lamp_clamp', 0.0, zl, hx, hy, h=0.4))
    # sodium-vapour lantern ("cobra head"): grey housing + glowing lens underneath
    hz = zl + 2.05
    hc = -8.4
    housing = kit.cylinder('lamp_head', 0.6, 2.4, loc=(0.0, hc, 0.0), seg=6, mat=P.M('aluminium', base='#8a8e8c', grime=0.55), axis='Y', base=False)
    P.xform(housing, scale=(1.0, 1.0, 0.45))
    P.xform(housing, loc=(0.0, 0.0, hz))
    objs.append(rnd(housing, 50.0))
    lens_m = P.M('sodium_lens', 'sodium_lens@night', bake=False, emit='#ff9a30', alpha=1.0, rough=0.25)
    lens = kit.cylinder('lamp_lens', 0.46, 1.7, loc=(0.0, hc - 0.1, 0.0), seg=6, mat=lens_m, axis='Y', base=False)
    P.xform(lens, scale=(1.0, 1.0, 0.42))
    P.xform(lens, loc=(0.0, 0.0, hz - 0.12))
    objs.append(rnd(lens, 50.0))
    W['lamp'] = V((0.0, hc - 0.1, hz - 0.3))
    # cable TV bracket
    zc = 28.0
    hx, hy = psc_dims(zc)
    objs.append(bar('cab_br', (hx, 0.1, zc), (hx + 0.7, 0.1, zc), 0.07, mat=gal))
    W['cable'] = V((hx + 0.7, 0.1, zc - 0.05))
    objs += danger_board('danger', 0.0, -psc_dims(12.5)[1], 12.5)
    for o in objs:
        del_bottom(o)
    wires(A, W)
    finish(A, objs, size=128, ao_samples=16)
    A.preview = {'shots': [{'view': {'az': -35.0, 'el': 14.0, 'fov': 32.0}},
                           {'name': 'top', 'view': {'az': -75.0, 'el': 10.0, 'fov': 32.0, 'target': (0.0, -3.6, 36.0), 'dist': 24.0}}]}


# =========================================================================== pole_transformer
TX_H = 45.0


@kit.asset('pole_transformer', 'prop', kind='pole', variant='transformer', height=TX_H, footprint=(10.0, 5.0))
def build_transformer(A):
    gal = P.M('galvanised')
    por = P.M('porcelain')
    tx = P.M('transformer')
    blk = P.M('cable_black')
    PX = 4.2
    objs = []
    W = {}
    for s, suf in ((-1, ''), (1, 'b')):
        x = s * PX
        objs += psc_shaft('p%d' % s, x=x, holes=(10.0, 40.0, 9.0, 1.0))
        za = 41.2
        hx, hy = psc_dims(za)
        ax = x + s * (hx + 0.2)        # crossarms on the outer faces
        objs.append(channel_y('arm%d' % s, ax, za, -3.6, 3.6, mat=gal))
        objs.append(clamp_band('armc%d' % s, x, za, hx, hy))
        for i, y in enumerate((-3.1, 0.0, 3.1)):
            o, p = pin_insulator('ins%d_%d' % (s, i), (ax, y, za + 0.21))
            objs += o
            W['L%d%s' % (i + 1, suf)] = p
        zn = 37.4
        hx, hy = psc_dims(zn)
        o, p = shackle('neut%d' % s, (x, -hy - 0.78, zn))
        objs += o
        W['N' + suf] = p
        # earthing strip down the outer face
        objs.append(bar('earth%d' % s, (x + s * (psc_dims(1.3)[0] + 0.04), 0.0, 1.3), (x + s * (psc_dims(30)[0] + 0.04), 0.0, 30.0), 0.05, mat=gal))
    # AB switch: channel between the poles (along X) with 3 post insulators + blades + operating rod
    zab = 35.0
    zf = 27.0
    hx, hy = psc_dims(zab)
    yab = -hy - 0.2
    objs.append(kit.box('ab_ch', (2 * PX, 0.35, 0.4), (0.0, yab, zab), mat=gal))
    for i, xx in enumerate((-2.0, 0.0, 2.0)):
        objs.append(rnd(kit.cylinder('abp%d' % i, 0.16, 1.0, loc=(xx, yab, zab + 0.2), seg=5, mat=por, cap=False)))
        objs.append(bar('abb%d' % i, (xx, yab + 0.45, zab + 1.25), (xx, yab - 0.45, zab + 1.25), 0.05, mat=gal))
        src = W['L%d' % (i + 1)]
        objs.append(rnd(kit.tube('jmp%d' % i, [src + V((0, 0, 0.05)), V((xx * 0.5 - 2.6, yab - 0.3, zab + 4.0)), V((xx, yab, zab + 1.3))], 0.045, seg=3, mat=gal, cap=False)))
    objs.append(bar('ab_rod', (-PX + 0.7, yab - 0.3, zab), (-PX + 0.7, yab - 0.3, 6.0), 0.06, mat=gal))
    objs.append(kit.box('ab_handle', (0.3, 0.6, 0.3), (-PX + 0.7, yab - 0.4, 6.0), mat=P.M('paint_red')))
    # HV drop-out fuses on a lower channel
    hx, hy = psc_dims(zf)
    yf = -hy - 0.2
    objs.append(kit.box('fu_ch', (2 * PX, 0.35, 0.4), (0.0, yf, zf), mat=gal))
    for i, xx in enumerate((-1.8, 0.0, 1.8)):
        objs.append(rnd(kit.cylinder('fui%d' % i, 0.18, 0.9, loc=(xx, yf - 0.25, zf + 0.2), seg=5, mat=por, cap=False)))
        objs.append(bar('fut%d' % i, (xx, yf - 0.3, zf + 1.1), (xx, yf - 0.5, zf + 2.4), 0.09, mat=P.M('sintex_black', base='#3a3a36')))
        objs.append(rnd(kit.tube('fj%d' % i, [(xx * 0.5 + (i - 1) * 1.0, yab, zab + 1.25), (xx, yf - 0.7, zf + 4.5), (xx, yf - 0.5, zf + 2.4)], 0.04, seg=3, mat=gal, cap=False)))
    # transformer platform: two channels along X between the poles
    zp = 15.0
    for yy in (-1.2, 1.2):
        objs.append(kit.box('plat%d' % int(yy * 10), (2 * PX + 1.0, 0.3, 0.45), (0.0, yy, zp), mat=gal))
    # tank, cover, radiator banks, conservator, bushings
    tz0 = zp + 0.22
    TW, TD, TH = 3.6, 2.4, 4.6
    objs.append(frustum('tank', tz0, tz0 + TH, (TW / 2, TD / 2), (TW / 2, TD / 2), mat=tx, bottom=True, top=False))
    objs.append(frustum('cover', tz0 + TH, tz0 + TH + 0.25, (TW / 2 + 0.15, TD / 2 + 0.15), (TW / 2 + 0.15, TD / 2 + 0.15), mat=tx, bottom=True))
    for sy in (-1, 1):
        for k in range(3):
            xx = -1.15 + k * 1.15
            objs.append(frustum('fin%d_%d' % (sy, k), tz0 + 0.5, tz0 + TH - 0.4, (0.32, 0.45), (0.32, 0.45), (xx, sy * (TD / 2 + 0.45)), mat=tx, bottom=True))
    cz = tz0 + TH + 1.0
    cons = rnd(kit.cylinder('cons', 0.6, 2.6, loc=(0.0, 0.6, cz), seg=7, mat=tx, axis='X', base=False), 50.0)
    objs.append(cons)
    objs.append(kit.box('cons_leg', (0.25, 0.25, 0.8), (0.0, 0.6, tz0 + TH + 0.25), mat=tx, base=True))
    hv_y = -0.7
    for i, xx in enumerate((-1.1, 0.0, 1.1)):
        objs.append(rnd(kit.lathe('hvb%d' % i, [(0.22, 0.0), (0.36, 0.35), (0.16, 0.62), (0.30, 0.95), (0.08, 1.75)],
                                  seg=6, mat=por, loc=(xx, hv_y, tz0 + TH + 0.25), close_bottom=False)))
        top = V((xx, hv_y, tz0 + TH + 2.0))
        objs.append(rnd(kit.tube('hvj%d' % i, [(xx, yf - 0.5, zf + 2.4), (xx * 1.3, -1.6, zf - 3.5), top], 0.045, seg=3, mat=gal, cap=False)))
    for i, xx in enumerate((-1.2, -0.4, 0.4, 1.2)):
        objs.append(rnd(kit.lathe('lvb%d' % i, [(0.18, 0.0), (0.2, 0.2), (0.08, 0.65)], seg=5, mat=por, loc=(xx, 0.85, tz0 + TH + 0.25), close_bottom=False)))
    # LT distribution box below the platform on a bar between the poles, black LT cables
    hx, hy = psc_dims(9.0)
    box_m = P.M('galvanised', base='#78827e', rust=0.4)
    objs.append(frustum('ltbox', 8.0, 10.2, (1.3, 0.5), (1.3, 0.5), (0.0, -hy - 0.55), mat=box_m, bottom=True, top=False))
    objs.append(frustum('ltbox_roof', 10.2, 10.35, (1.45, 0.65), (1.45, 0.65), (0.0, -hy - 0.55), mat=box_m, bottom=True))
    objs.append(kit.box('ltbar', (2 * PX, 0.25, 0.3), (0.0, -hy - 0.1, 9.0), mat=gal))
    for i, xx in enumerate((-0.6, 0.6)):
        objs.append(rnd(kit.tube('ltc%d' % i, [(xx * 1.8, 0.85, tz0 + TH + 0.9), (xx * 3.0, 1.9, tz0 + TH - 1.5), (xx * 3.2, 1.4, zp - 1.0),
                                               (xx, -hy - 0.8, 10.3)], 0.08, seg=4, mat=blk, cap=False)))
    objs.append(rnd(kit.tube('ltup', [(1.0, -hy - 0.6, 10.3), (PX - 0.6, -0.5, 14.0), (PX - 0.55, 0.0, 30.5)], 0.08, seg=4, mat=blk, cap=False)))
    zs = 31.0
    hx, hy = psc_dims(zs)
    o, p = shackle('svc', (PX, hy + 0.78, zs), front=(0, 1, 0))
    objs += o
    W['service'] = p
    zc = 28.0
    hx, hy = psc_dims(zc)
    objs.append(bar('cab_br', (-PX - hx, 0.0, zc), (-PX - hx - 0.7, 0.0, zc), 0.07, mat=gal))
    W['cable'] = V((-PX - hx - 0.7, 0.0, zc - 0.05))
    objs.append(cable_coil('coil', (-PX - hx - 0.2, -hy - 0.1, zc - 1.0)))
    for s in (-1, 1):
        objs += danger_board('danger%d' % s, s * PX, -psc_dims(12.5)[1], 12.5)
    for o in objs:
        del_bottom(o)
    wires(A, W)
    A.meta['wire_sides'] = {'-X': ['wire_L1', 'wire_L2', 'wire_L3', 'wire_N', 'wire_cable'],
                            '+X': ['wire_L1b', 'wire_L2b', 'wire_L3b', 'wire_Nb', 'wire_service']}
    finish(A, objs, size=256, ao_samples=16)
    A.preview = {'shots': [{'view': {'az': -35.0, 'el': 14.0, 'fov': 32.0}},
                           {'name': 'top', 'view': {'az': -30.0, 'el': 14.0, 'fov': 32.0, 'target': (0.0, 0.0, 28.0), 'dist': 42.0}}]}


# =========================================================================== pole_junction_box
@kit.asset('pole_junction_box', 'prop', kind='pole', variant='junction_box', height=6.0, footprint=(4.6, 3.0))
def build_junction(A):
    gal = P.M('galvanised', base='#7c8480', rust=0.35, grime=0.55, streaks=0.35)
    objs = []
    objs.append(frustum('plinth', 0.0, 1.0, (2.3, 1.5), (2.2, 1.4), mat=P.M('concrete_old')))
    BW, BD, BH = 3.8, 1.9, 4.4
    z0 = 1.0
    objs.append(kit.box('cab', (BW, BD, BH), (0.0, 0.0, z0), mat=gal, base=True))
    # sloped roof cap with overhang
    roof = frustum('roof', z0 + BH, z0 + BH + 0.45, (BW / 2 + 0.2, BD / 2 + 0.25), (BW / 2 - 0.1, BD / 2 - 0.1), mat=gal, bottom=True)
    objs.append(roof)
    # front doors (slightly proud), handles, hinges, louvres
    for s in (-1, 1):
        objs.append(kit.box('door%d' % s, (BW / 2 - 0.15, 0.06, BH - 0.4), (s * BW / 4, -BD / 2 - 0.03, z0 + 0.2), mat=gal, base=True))
        objs.append(kit.box('handle%d' % s, (0.08, 0.1, 0.45), (s * 0.25, -BD / 2 - 0.1, z0 + 2.2), mat=P.M('sintex_black')))
        for k in range(3):
            objs.append(kit.box('louv%d_%d' % (s, k), (1.0, 0.1, 0.06), (s * BW / 4, -BD / 2 - 0.08, z0 + 3.4 + k * 0.22), mat=gal))
    objs += danger_board('danger', -BW / 4, -BD / 2 - 0.06, z0 + 1.4, w=0.9, h=0.75)
    # a faded, torn poster pasted on the side (plain colour, no text)
    objs.append(kit.box('poster', (0.04, 1.2, 1.5), (BW / 2 + 0.02, -0.1, z0 + 1.6), mat=P.M('paint_yellow', base='#d8c070', chips=0.7, under='#7c8480'), base=True))
    # cable stubs (black, armoured): down into the ground at the sides, one riser up the back
    blk = P.M('cable_black')
    W = {}
    for s, nm in ((-1, 'cable_in'), (1, 'cable_out')):
        x = s * (BW / 2 - 0.4)
        pts = [(x, 0.3, z0 + 0.3), (x + s * 0.5, 0.4, 0.9), (x + s * 0.9, 0.5, 0.4), (x + s * 1.3, 0.5, 0.05)]
        objs.append(kit.tube('stub_' + nm, pts, 0.14, seg=5, mat=blk, cap=False))
        W[nm] = V(pts[-1])
    rp = [(0.6, BD / 2 + 0.05, z0 + 1.0), (0.6, BD / 2 + 0.25, z0 + BH - 0.5), (0.6, BD / 2 + 0.25, z0 + BH + 0.9)]
    objs.append(kit.tube('riser', rp, 0.1, seg=5, mat=blk))
    W['cable_up'] = V(rp[-1])
    for o in objs:
        del_bottom(o)
    wires(A, W)
    finish(A, objs, size=128, ao_samples=16)
    A.preview = {'shots': [{'view': {'az': -35.0, 'el': 20.0, 'fov': 32.0}},
                           {'name': 'top', 'view': {'az': 30.0, 'el': 30.0, 'fov': 32.0}}]}
