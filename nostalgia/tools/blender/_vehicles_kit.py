"""NOSTALGIA — tools/blender/_vehicles_kit.py (vehicles artist) — additive helpers for vehicles.py.

Not an asset-family script (the leading underscore keeps build_all.py from importing it as one);
vehicles.py imports it. Everything here builds on kit.py without changing it (ARCHITECTURE §21):

  * VRig            rigid-skin vehicle rig: objects are added per bone (root, steer*, wheel_*, crank,
                    pedal_*, saddle, prop, opt_* ...), joined into ONE mesh with ONE baked material
                    (one draw call), weights normalised to a single bone per vertex.
  * finish_vehicle  unique UV atlas (lettering / lamps / plates get extra texel density, undersides
                    less), baked albedo x ambient occlusion (with a temporary ground plane so the body
                    darkens towards the road), ORM (roughness / metal) at a lower size, and an
                    EMISSIVE mask baked from the materials' `emit` colours (head / tail lamps, meter
                    lamp). The material is named M_<id>@night: the runtime scales its emission per
                    vehicle (lamps on at night while ridden / driven).
  * tint regions    paint faces carry `_REGION` (1 = paint, 2 = paint2, 3 = paint3) so the runtime can
                    repaint every instance in its vehicles.js colour (v.color / v.color2), like the
                    character tint (kit.write_regions).
  * option bones    `opt_<name>` bones hold variant parts (taxi carrier, govt beacon, gears, slogans);
                    the runtime scales the ones a type does not use to zero.
  * preview_variants  tinted Cycles previews (the _REGION attribute drives a colour per variant),
                    so the review sheet shows the colours the game will actually use.
Coordinates (binding): Blender Z up, front = -Y, the rider's left = +X, wheels on z = 0.
"""
import math
import os
import json
import time
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler
import kit

REGION_NAMES = ['none', 'paint', 'paint2', 'paint3', 'head', 'tail', 'indicator', 'beacon']
R_NONE, R_PAINT, R_PAINT2, R_PAINT3, R_HEAD, R_TAIL, R_IND, R_BEACON = range(8)
UV_ANGLE = float(os.environ.get('NOS_UV_ANGLE', 80))   # smart-project island angle: fewer seams = fewer split vertices
FONT_BOLD = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
                              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf') if os.path.exists(p)), None)
FONT_COND = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf') if os.path.exists(p)), FONT_BOLD)
FONT_SERIF = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf') if os.path.exists(p)), FONT_BOLD)


def V(*a):
    if len(a) == 1:
        return Vector(a[0])
    return Vector(a)


# =========================================================================== tagged primitives (cheap UVs)
# Curved parts (tubes, lathes, lofts) are created ring by ring; the wrappers record the ring sizes so
# finish can mark one seam per surface and unwrap them as a few low-distortion islands instead of
# smart-projecting every facet (fewer UV-split vertices: a much smaller GLB for the same look).
def _tag(o, rings, seg, closed=False):
    o['nos_rings'] = list(rings)
    o['nos_seg'] = int(seg)
    o['nos_closed'] = bool(closed)
    return o


def tube(name, pts, r, seg=8, mat=None, cap=None):
    """kit.tube, tagged; cap=None: only fat tubes get end caps (thin rods, spokes, rails and frame
    tubes ending inside lugs don't need them: fewer split vertices)"""
    if cap is None:
        cap = r >= 0.2
    o = kit.tube(name, pts, r, seg=seg, mat=mat, cap=cap)
    return _tag(o, [seg] * len(pts), seg)


def loft(name, rings, seg=10, side=(1, 0, 0), mat=None, cap_start=True, cap_end=True, arm=None):
    o = kit.loft(name, rings, seg=seg, side=side, mat=mat, cap_start=cap_start, cap_end=cap_end, arm=arm)
    return _tag(o, [seg] * len(rings), seg)


def lathe(name, profile, seg=24, mat=None, loc=(0, 0, 0), close_top=True, close_bottom=True):
    o = kit.lathe(name, profile, seg=seg, mat=mat, loc=loc, close_top=close_top, close_bottom=close_bottom)
    return _tag(o, [1 if r < 1e-4 else seg for (r, z) in profile], seg)


def mark_seams(o, angle=62.0):
    """seams for a tagged ring-built mesh: one longitudinal line (k = 0), cap borders, the closing
    ring of a torus, and every edge sharper than `angle` (those split normals anyway). Returns False
    when the topology no longer matches the tags (then the part is smart-projected)."""
    rings = list(o.get('nos_rings') or [])
    if not rings:
        return False
    info = []
    for ri, n in enumerate(rings):
        for k in range(n):
            info.append((ri, k if n > 1 else -1))
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    if len(bm.verts) != len(info):
        bm.free()
        return False
    closed = bool(o.get('nos_closed'))
    lim = math.radians(angle)
    for e in bm.edges:
        a, b = info[e.verts[0].index], info[e.verts[1].index]
        seam = False
        if a[0] != b[0]:
            if (a[1] == 0 and b[1] in (0, -1)) or (b[1] == 0 and a[1] == -1):
                seam = True
        elif closed and a[0] == 0:
            seam = True
        for f in e.link_faces:
            if len({info[v.index][0] for v in f.verts}) == 1:
                seam = True
        if not seam and len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
            seam = True
        e.seam = seam
    lay = bm.faces.layers.int.get('_cyl') or bm.faces.layers.int.new('_cyl')
    for f in bm.faces:
        f[lay] = 1
    bm.to_mesh(o.data)
    bm.free()
    return True


# =========================================================================== materials
def mat(key, name, region=0, **kw):
    """kit.material with an explicit tint region (kit's people materials carry their own regions).
    region: 0 none, 1 paint (v.color), 2 paint2 (v.color2 / a second livery colour), 3 paint3."""
    return kit.material(key, name, region=region, **kw)


def palette():
    """the vehicle material palette (each call returns the cached materials of this scene). Lamp
    lenses carry their lamp group as tint region (4 head, 5 tail / brake, 6 indicators, 7 beacon):
    the runtime switches each group's baked emission on and off."""
    return {
        'chrome': mat('chrome', 'chrome'),
        'steel': mat('steel', 'steel'),
        'alu': mat('steel', 'alu', base='#b4b8bb', rough=0.45, metal=0.75, grime=0.4),
        'rubber': mat('rubber', 'rubber'),
        'tyre': mat('rubber', 'tyre', base='#1e1e20', rough=0.9, grime=0.25, dirt='#6a604f', ground=1.2),
        'black': mat('paint_black', 'black_trim', base='#1a1a1c', rough=0.55, chips=0.1),
        'plastic': mat('plastic_black', 'plastic', base='#1c1c1e', rough=0.5),
        'glass_dark': mat('paint_black', 'glass_dark', base='#26323a', rough=0.06, var=0.03, grain=0.0, chips=0.0, grime=0.2, dirt='#6a6a60'),
        'glass': mat('glass', 'glass', base='#5a6c72', rough=0.04, alpha=0.38, bake=False),
        'head_lens': mat('lamp_lens', 'head_lens', region=R_HEAD, base='#eae6d4', rough=0.1, emit='#fff1cc'),
        'tail_lens': mat('reflector_red', 'tail_lens', region=R_TAIL, base='#a0141a', rough=0.15, emit='#ff3020'),
        'amber': mat('reflector_red', 'amber_lens', region=R_IND, base='#d07a10', rough=0.18, emit='#ffa020'),
        'beacon': mat('reflector_red', 'beacon_lens', region=R_BEACON, base='#c41a12', rough=0.15, emit='#ff2a10'),
        'reflector': mat('reflector_red', 'reflector'),
        'seat_black': mat('leather_brown', 'rexine_black', base='#1e1b1b', rough=0.45, grime=0.4),
        'seat_red': mat('leather_brown', 'rexine_red', base='#6e1e1c', rough=0.45, grime=0.4),
        'leather': mat('leather_brown', 'leather'),
        'canvas': mat('cloth', 'canvas_black', base='#1d1c1d', rough=0.95, var=0.06, grain=0.1, weave=0.12, grime=0.45, dirt='#4e463a', scale=2.5),
        'wood': mat('wood_raw', 'wood'),
        'engine': mat('steel', 'engine_alu', base='#8c8f92', rough=0.6, metal=0.55, grime=0.75, dirt='#2e2a26'),
        'dark': mat('paint_black', 'underbody', base='#202020', rough=0.8, chips=0.0, grime=0.5, dirt='#3a3228'),
        'interior': mat('cloth', 'interior', base='#5a4a3e', rough=0.9, var=0.05, grain=0.06, weave=0.05, grime=0.3, dirt='#2a2018', scale=3.0),
        'headliner': mat('cloth', 'headliner', base='#cfc6b2', rough=0.95, var=0.04, grain=0.05, weave=0.04, grime=0.25, dirt='#7a7060', scale=3.0),
    }


def paint(name, base, region=1, rough=0.35, chips=0.2, **kw):
    """painted steel (region-tinted at runtime)"""
    return mat('paint_black', name, region=region, base=base, rough=rough, chips=chips, **kw)


# =========================================================================== mesh helpers
def lathe_x(name, prof, seg, m, c, closed=False):
    """revolve a profile [(radius, x_offset)] around the X axis, centred at c"""
    o = lathe(name, [(r, z) for (r, z) in prof], seg=seg, mat=m, close_top=False, close_bottom=False)
    if closed:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        n = len(prof)
        rings = [bm.verts[i * seg:(i + 1) * seg] for i in range(n)]
        for k in range(seg):
            try:
                bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], rings[0][(k + 1) % seg], rings[0][k]))
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
        o['nos_closed'] = True
    o.rotation_euler = (0, math.radians(90), 0)
    o.location = c
    kit.apply_transform(o)
    return o


def xform(o, loc=None, rot=None, scale=None):
    """set and apply an object's transform (rot: Euler tuple in radians)"""
    if scale is not None:
        o.scale = scale
    if rot is not None:
        o.rotation_euler = rot
    if loc is not None:
        o.location = loc
    kit.apply_transform(o)
    return o


def rotate_about(o, pivot, rot):
    """rotate an object's mesh (Euler radians) about a world pivot"""
    pv = Vector(pivot)
    R = rot.to_4x4() if isinstance(rot, Matrix) else Euler(rot).to_matrix().to_4x4()
    M = Matrix.Translation(pv) @ R @ Matrix.Translation(-pv)
    o.data.transform(M)
    return o


def cyl_between(name, a, b, r, seg=8, m=None, r2=None, cap=True):
    """a cylinder from point a to point b"""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = kit.cylinder(name, r, d.length, (0, 0, 0), seg=seg, mat=m, r2=r2, cap=cap, base=True)
    o.rotation_euler = d.normalized().to_track_quat('Z', 'Y').to_euler()
    o.location = a
    kit.apply_transform(o)
    return o


def disc_x(name, c, r, w, m, seg=16, cap=True):
    """a short cylinder along X centred at c"""
    o = kit.cylinder(name, r, w, (0, 0, 0), seg=seg, mat=m, axis='X', base=False, cap=cap)
    return xform(o, loc=c)


def disc_y(name, c, r, w, m, seg=16, cap=True, r2=None):
    """a short cylinder along Y (a lamp facing -Y) centred at c"""
    o = kit.cylinder(name, r, w, (0, 0, 0), seg=seg, mat=m, axis='Y', base=False, cap=cap, r2=r2)
    return xform(o, loc=c)


def rbox(name, size, loc, m, bevel=0.06, seg=1):
    """a bevelled box (seg 1 = a chamfer: crisp highlights for ~44 tris; bevel 0 = 12 tris); its
    chamfers stay sharp-shaded (nos_smooth 32) so panels read crisp"""
    o = kit.box(name, size, loc, m, bevel=bevel, segments=seg)
    o['nos_smooth'] = 32.0
    return o


def section_loft(name, stations, m, seg=16, cap_start=True, cap_end=True, axis='Y'):
    """A body built from superellipse cross-sections along Y (front -Y to rear +Y).
    stations: [(y, x_half_width, z_bottom, z_top, power, (opt) {'zc': centre override})]. Each
    section is a superellipse |x/a|^p + |(z-zc)/b|^p = 1 between z_bottom and z_top."""
    rings = []
    for st in stations:
        y, hw, z0, z1, p = st[:5]
        rings.append(dict(c=(0.0, y, (z0 + z1) / 2.0), r=(hw, (z1 - z0) / 2.0), p=p, side=(1, 0, 0)))
    # loft frames follow the path tangent (Y); `side` = X so rx is the half width and ry the half height
    o = loft(name, rings, seg=seg, side=(1, 0, 0), mat=m, cap_start=cap_start, cap_end=cap_end)
    return o


def plan_prism(name, poly, z0, z1, m, bevel=0.0, seg=2):
    """vertical prism from a plan polygon [(x, y)] (counter-clockwise seen from above)"""
    o = kit.extrude_polygon(name, poly, z0, z1, m)
    if bevel:
        kit.bevel_mod(o, bevel, seg)
    return o


def side_prism(name, prof, x0, x1, m, bevel=0.0, seg=2):
    """prism from a side profile [(y, z)] extruded across X from x0 to x1"""
    o = kit.extrude_polygon(name, [(p[0], p[1]) for p in prof], x0, x1, m)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for v in bm.verts:
        y, z, x = v.co.x, v.co.y, v.co.z
        v.co = Vector((x, y, z))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    if bevel:
        kit.bevel_mod(o, bevel, seg)
    return o


def front_prism(name, prof, y0, y1, m, bevel=0.0, seg=2):
    """prism from a front (cross-section) profile [(x, z)] extruded along Y from y0 to y1"""
    o = kit.extrude_polygon(name, [(p[0], p[1]) for p in prof], y0, y1, m)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for v in bm.verts:
        x, z, y = v.co.x, v.co.y, v.co.z
        v.co = Vector((x, y, z))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    if bevel:
        kit.bevel_mod(o, bevel, seg)
    return o


def tyre(name, c, R, w, m, seg=20, tread=True, side_r=None, knobs=0.0, depth=None):
    """a tyre around the X axis: rounded shoulders, a flat tread band; knobs > 0 pushes every other
    tread segment out by that much (knobbly MTB / tractor-ish tread)"""
    hw = w / 2.0
    sr = side_r if side_r is not None else min(hw * 0.6, R * 0.22)
    rin = R - (depth if depth is not None else min(R * 0.36, max(0.35, w * 0.55)))
    prof = [(rin, -hw * 0.8), (R - sr, -hw), (R, -hw * 0.5), (R, hw * 0.5), (R - sr, hw), (rin, hw * 0.8)]
    o = lathe_x(name, prof, seg, m, c, closed=True)
    if knobs:
        cc = Vector(c)
        for v in o.data.vertices:
            d = Vector((0, v.co.y - cc.y, v.co.z - cc.z))
            if d.length > R - sr * 0.5:
                k = int(round(math.atan2(d.z, d.y) / (2 * math.pi / seg))) % seg
                if k % 2 == 0:
                    v.co = cc + Vector((v.co.x - cc.x, 0, 0)) + d * ((d.length + knobs) / d.length)
    return o


def spoke_wheel(name, c, R, M, spokes=28, seg=24, tyre_w=0.42, rim_d=0.4, hub_w=0.62, sp_r=0.022, tread_m=None, rim_m=None, knobs=0.0, sp_seg=3):
    """a spoked wheel (cycles, Luna, RX100, rickshaw): tyre, chrome rim, hub, crossed spokes"""
    parts = [tyre(name + '_tyre', c, R, tyre_w, tread_m or M['tyre'], seg=seg, knobs=knobs, depth=min(R * 0.3, tyre_w * 0.9 + 0.1))]
    ri = R - tyre_w * 0.55
    rim = lathe_x(name + '_rim', [(ri - rim_d * 0.6, -0.09), (ri - rim_d * 0.45, -0.12), (ri, -0.1), (ri, 0.1), (ri - rim_d * 0.45, 0.12), (ri - rim_d * 0.6, 0.09)],
                  seg, rim_m or M['chrome'], c, closed=True)
    parts.append(rim)
    parts.append(disc_x(name + '_hub', c, 0.17, hub_w, M['chrome'], seg=10, cap=False))
    for sx in (1, -1):
        parts.append(disc_x(name + '_flange', (c[0] + hub_w * 0.38 * sx, c[1], c[2]), 0.28, 0.05, M['chrome'], seg=10, cap=False))
    parts.append(disc_x(name + '_axle', c, 0.06, hub_w + 0.36, M['steel'], seg=6, cap=False))
    sp = []
    ri2 = ri - rim_d * 0.55
    for i in range(spokes):
        a = 2 * math.pi * i / spokes
        side = 1 if i % 2 == 0 else -1
        lead = 0.42 * (1 if (i // 2) % 2 == 0 else -1)
        h = Vector((hub_w * 0.38 * side, 0.26 * math.cos(a + lead), 0.26 * math.sin(a + lead)))
        r = Vector((0.03 * side, ri2 * math.cos(a), ri2 * math.sin(a)))
        sp.append(tube(name + '_spoke%d' % i, [Vector(c) + h, Vector(c) + r], sp_r, seg=sp_seg, mat=M['chrome'], cap=False))
    if sp:
        rings = []
        for o_ in sp:
            rings += list(o_['nos_rings'])
        j = kit.join(sp, name + '_spokes')
        _tag(j, rings, sp_seg)
        j['nos_smooth'] = 180.0     # thin spokes: fully smooth (shared vertices)
        parts.append(j)
    return parts


def disc_wheel(name, c, R, w, M, side=1, seg=18, rim_m=None, cap_m=None, rim_frac=0.62, cap_frac=0.42, hub_bolts=0, tyre_m=None):
    """a pressed-steel wheel (cars, autos, scooters): tyre, painted rim, chrome hubcap; `side` = +1
    when the outer face looks to +X (left wheels), -1 for right wheels"""
    parts = [tyre(name + '_tyre', c, R, w, tyre_m or M['tyre'], seg=seg)]
    hw = w / 2.0
    rr = R * rim_frac
    s = side
    rim = lathe_x(name + '_rim', [(rr * 1.02, -hw * 0.75 * s), (rr, -hw * 0.2 * s), (rr * 0.92, hw * 0.55 * s), (rr * 0.55, hw * 0.65 * s), (0.0, hw * 0.6 * s)],
                  seg, rim_m or M['steel'], c)
    parts.append(rim)
    if cap_frac:
        cr = R * cap_frac
        cap = lathe_x(name + '_cap', [(cr, hw * 0.62 * s), (cr * 0.92, hw * 0.78 * s), (cr * 0.6, hw * 0.9 * s), (0.0, hw * 0.95 * s)], max(10, seg - 4), cap_m or M['chrome'], c)
        parts.append(cap)
    # the inner face (dark brake drum) so the wheel reads solid from behind
    parts.append(lathe_x(name + '_drum', [(0.0, -hw * 0.5 * s), (rr * 0.96, -hw * 0.62 * s)], max(10, seg - 6), M['dark'], c))
    for k in range(hub_bolts):
        a = 2 * math.pi * k / hub_bolts
        p = Vector(c) + Vector((hw * 0.7 * s, math.cos(a) * rr * 0.68, math.sin(a) * rr * 0.68))
        parts.append(disc_x(name + '_bolt', tuple(p), 0.09, 0.12, M['chrome'], seg=6))
    return parts


def mudguard(name, c, R, a0, a1, m, w=0.62, n=12, gap=0.26, thick=0.09, p=4.0, seg=6):
    """a U-section mudguard following a wheel from angle a0 to a1 (around X; 0 = front (-Y), pi/2 = up)"""
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        d = Vector((0, -math.cos(a), math.sin(a)))
        rings.append(dict(c=tuple(Vector(c) + d * (R + gap)), r=(w / 2, thick), p=p, w={'root': 1}))
    return loft(name, rings, seg=seg, side=(1, 0, 0), mat=m, cap_start=True, cap_end=True)


def lamp_round(name, c, r, depth, M, lens='head_lens', bezel='chrome', facing=(0, -1, 0), seg=14):
    """a round lamp: a bezel cup + a slightly domed lens, facing `facing`"""
    f = Vector(facing).normalized()
    q = f.to_track_quat('-Z', 'Y')
    cup = lathe(name + '_cup', [(r * 0.55, -depth), (r * 1.05, -depth * 0.55), (r * 1.12, 0.0), (r * 1.02, 0.04)], seg=seg, mat=M[bezel], close_bottom=True, close_top=False)
    lensO = lathe(name + '_lens', [(r * 0.98, 0.0), (r * 0.8, 0.06), (r * 0.4, 0.1), (0.0, 0.11)], seg=seg, mat=M[lens], close_bottom=False, close_top=False)
    for o in (cup, lensO):
        # the lathe's +Z axis becomes the facing direction
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = f.to_track_quat('Z', 'Y')
        o.location = c
        kit.apply_transform(o)
    return [cup, lensO]


def plate(name, text, w, h, loc, facing='-Y', bg='#f2efe6', fg='#141414', frame=None, px=256):
    """a number plate (painted text, no logos) facing -Y ('front') or +Y ('back') / +X / -X"""
    b = kit.signboard(name, text, w, h, loc=(0, 0, 0), depth=0.05, fg=fg, bg=bg, frame_mat=frame or mat('plastic_black', 'plate_frame'), px=px, font=FONT_COND)
    rz = {'-Y': 0.0, '+Y': math.pi, '+X': math.pi / 2, '-X': -math.pi / 2}[facing]
    return xform(b, loc=loc, rot=(0, 0, rz))


def decal(name, text, w, h, loc, facing='-Y', fg='#1a1a1a', bg='#f2c230', px=512, font=None, depth=0.02, frame=None, tilt=0.0):
    """painted lettering on a thin board facing `facing` (-Y front, +Y back, +X left side, -X right side)"""
    b = kit.signboard(name, text, w, h, loc=(0, 0, 0), depth=depth, fg=fg, bg=bg, frame_mat=frame or mat('paint_black', 'decal_edge', base=bg, chips=0.0), px=px, font=font or FONT_BOLD)
    rz = {'-Y': 0.0, '+Y': math.pi, '+X': math.pi / 2, '-X': -math.pi / 2}[facing]
    return xform(b, loc=loc, rot=(tilt, 0, rz))


def mirror(name, base, arm_to, r, M, facing=(0, 1, 0)):
    """a round rear-view mirror on a stalk"""
    stalk = tube(name + '_stalk', [Vector(base), Vector(arm_to)], 0.05, seg=5, mat=M['chrome'])
    head = lathe(name + '_head', [(0.0, -0.08), (r, -0.06), (r * 1.02, 0.02), (r * 0.9, 0.06)], seg=12, mat=M['chrome'], close_top=True)
    f = Vector(facing).normalized()
    head.rotation_mode = 'QUATERNION'
    head.rotation_quaternion = f.to_track_quat('Z', 'Y')
    head.location = arm_to
    kit.apply_transform(head)
    return [stalk, head]


def seat_pad(name, x0, x1, y0, y1, z0, z1, m, crown=0.12, seg=2, bevel=0.14):
    """a padded seat cushion (rexine): a bevelled box with a slightly crowned top"""
    o = kit.box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), m, bevel=bevel, segments=seg)
    kit.apply_modifiers(o)
    if crown:
        for v in o.data.vertices:
            if v.co.z > (z0 + z1) / 2:
                u = (v.co.x - (x0 + x1) / 2) / max(1e-3, (x1 - x0) / 2)
                w = (v.co.y - (y0 + y1) / 2) / max(1e-3, (y1 - y0) / 2)
                v.co.z += crown * max(0.0, 1 - u * u) * max(0.0, 1 - w * w)
    return o


def hose(name, pts, r, m, seg=6):
    return tube(name, [Vector(p) for p in pts], r, seg=seg, mat=m)


def shell(name, rows, m, thick=0.08, closed=False, inside=None):
    """An open surface through rows of 3D points (each row an open polyline, all rows the same
    length), solidified to `thick`. Faces are oriented away from `inside` (default: the centroid
    lowered to the lowest point), which suits canopies, hoods and hulls."""
    bm = bmesh.new()
    vr = [[bm.verts.new(Vector(p)) for p in row] for row in rows]
    for i in range(len(vr) - 1):
        A, B = vr[i], vr[i + 1]
        n = len(A)
        for k in range(n if closed else n - 1):
            bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]))
    bm.normal_update()
    if inside is None:
        c = Vector((0, 0, 0))
        for v in bm.verts:
            c += v.co
        c /= max(1, len(bm.verts))
        c.z = min(v.co.z for v in bm.verts)
    else:
        c = Vector(inside)
    flip = [f for f in bm.faces if (f.calc_center_median() - c).dot(f.normal) < 0]
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)
    o = kit.obj_from_bm(bm, name, m)
    if thick:
        sm = o.modifiers.new('solid', 'SOLIDIFY')
        sm.thickness = thick
        sm.offset = -1.0
        sm.use_even_offset = True
        kit.apply_modifiers(o)
    return o


def loft_z(name, stations, m, seg=16, cap_start=True, cap_end=True):
    """A shell built from horizontal superellipse sections stacked along Z (an auto's front cowl,
    a scooter's leg shield): stations [(z, y_centre, x_half_width, y_half_depth, power)]."""
    rings = [dict(c=(0.0, yc, z), r=(hw, hd), p=pw) for (z, yc, hw, hd, pw) in stations]
    return loft(name, rings, seg=seg, side=(1, 0, 0), mat=m, cap_start=cap_start, cap_end=cap_end)


def mirror_x(objs, suffix='_R'):
    """mirrored copies (x -> -x) of objects (built on the left, +X), normals fixed"""
    out = []
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        c = o.copy()
        c.data = o.data.copy()
        c.name = o.name + suffix
        kit.link(c)
        c.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        bm = bmesh.new()
        bm.from_mesh(c.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(c.data)
        bm.free()
        out.append(c)
    return out


def assign_faces(ob, rules):
    """per-face material reassignment: rules = [(predicate(centre, normal) -> bool, material)], the
    first matching rule wins (stripes on a canopy, glass in a cabin shell, two-tone paint)."""
    me = ob.data
    idx = {}
    for (_, m) in rules:
        if m.name not in [x.name for x in me.materials if x]:
            me.materials.append(m)
    names = [x.name if x else '' for x in me.materials]
    for p in me.polygons:
        c, n = p.center, p.normal
        for (fn, m) in rules:
            if fn(c, n):
                p.material_index = names.index(m.name)
                break
    return ob


def inner_shell(src, name, m, inset=0.12, keep=None):
    """a copy of (part of) a closed shell pushed inwards by `inset` with flipped normals: the inside
    of a car's cabin (headliner, door cards) seen from the first-person eye. keep(centre, normal)
    selects the faces to copy."""
    c = src.copy()
    c.data = src.data.copy()
    c.name = name
    kit.link(c)
    bm = bmesh.new()
    bm.from_mesh(c.data)
    bm.normal_update()
    if keep is not None:
        kill = [f for f in bm.faces if not keep(f.calc_center_median(), f.normal)]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.normal_update()
    for v in bm.verts:
        if v.link_faces:
            n = Vector((0, 0, 0))
            for f in v.link_faces:
                n += f.normal
            if n.length > 1e-6:
                v.co -= n.normalized() * inset
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(c.data)
    bm.free()
    c.data.materials.clear()
    c.data.materials.append(m)
    return c


def arc_row(y, hw, z_side, z_shoulder, r, z_crown=0.0, n_side=2, n_corner=4, n_top=3, x_off=0.0):
    """one canopy cross-section at y: from the left side bottom (x = +hw) up, round the shoulder
    (radius r), across the top (crowned by z_crown at the centre), down the right side"""
    pts = []
    for i in range(n_side):
        t = i / n_side
        pts.append((hw + x_off, y, z_side + (z_shoulder - z_side) * t))
    for i in range(n_corner + 1):
        a = (math.pi / 2) * i / n_corner
        pts.append((hw - r + r * math.cos(a) + x_off, y, z_shoulder + r * math.sin(a)))
    top = []
    for i in range(1, n_top + 1):
        top.append((hw - r) * (1 - 2 * i / (n_top + 1)))
    for x in top:
        u = x / max(1e-3, hw - r)
        pts.append((x + x_off, y, z_shoulder + r + z_crown * (1 - u * u)))
    right = [(-(p[0] - x_off) + x_off, p[1], p[2]) for p in reversed(pts[:n_side + n_corner + 1])]
    return pts + right


# =========================================================================== rig + finishing
class VRig:
    """Collects parts per bone; build() makes the armature, the rigid skin and the baked material."""

    def __init__(self, A):
        self.A = A
        self.groups = {}
        self.bones = [('root', Vector((0, 0, 0)), Vector((0, -1.0, 0)), None)]
        self.smooth = {}

    def bone(self, n, head, tail=None, parent='root'):
        head = Vector(head)
        tail = Vector(tail) if tail is not None else head + Vector((0.8, 0, 0))
        self.bones.append((n, head, tail, parent))
        return n

    def add(self, bone, *objs, smooth=None):
        for o in objs:
            if o is None:
                continue
            if isinstance(o, (list, tuple)):
                self.add(bone, *o, smooth=smooth)
                continue
            self.groups.setdefault(bone, []).append(o)
            if smooth is not None:
                self.smooth[o.name] = smooth
        return self

    def build(self, tex=512, orm=256, emit=256, ao_samples=24, albedo_samples=6, ao_strength=0.72, ao_dist=2.2, ground=True,
              boost=None, under=0.45, smooth_angle=62.0, margin=0.005):
        A = self.A
        arm_d = bpy.data.armatures.new(A.id + '_rig')
        arm = bpy.data.objects.new(A.id + '_rig', arm_d)
        kit.link(arm, A.coll)
        kit.select_only([arm], arm)
        bpy.ops.object.mode_set(mode='EDIT')
        eb = arm_d.edit_bones
        for (n, h, t, p) in self.bones:
            b = eb.new(n)
            b.head = h
            b.tail = t
            if p:
                b.parent = eb[p]
        bpy.ops.object.mode_set(mode='OBJECT')
        meshes = []
        for b, objs in self.groups.items():
            for o in objs:
                if o.type != 'MESH':
                    continue
                kit.apply_modifiers(o)
                kit.weights(o, b)
                # 62 deg default: 6- and 8-sided tubes shade round and share vertices (smaller
                # GLB); boxes keep crisp edges; per object: rbox chamfers 32, spokes 180
                ang = self.smooth.get(o.name, float(o.get('nos_smooth', smooth_angle)))
                kit.smooth(o, ang)
                if o.get('nos_rings') and not o.modifiers:
                    mark_seams(o, min(ang, 89.0))
                meshes.append(o)
        if os.environ.get('NOS_TRIS'):
            # authoring aid: triangle cost per part (NOS_TRIS=1 build_all.py <id> --one ...)
            cost = {}
            for o in meshes:
                k = o.name.split('.')[0]
                cost[k] = cost.get(k, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
            for k, n in sorted(cost.items(), key=lambda kv: -kv[1])[:40]:
                kit.log('  tris %-22s %5d' % (k, n))
            kit.log('  tris total %d' % sum(cost.values()))
        ob = kit.join(meshes, A.id)
        A.tint = {'attribute': '_REGION', 'names': REGION_NAMES, 'regions': region_colours(ob)}
        kit.write_regions(ob)
        finish_vehicle(A, ob, tex=tex, orm=orm, emit=emit, ao_samples=ao_samples, albedo_samples=albedo_samples, ao_strength=ao_strength,
                       ao_dist=ao_dist, ground=ground, boost=boost, under=under, margin=margin)
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        ob.parent = arm
        kit.normalize_weights(ob, 1)
        A.armature = arm
        self.arm = arm
        self.ob = ob
        after_export(A)
        return arm, ob


def region_colours(ob):
    """default (baked) colour per tint region, from the source materials"""
    out = {}
    for m in ob.data.materials:
        if not m:
            continue
        r = int(m.get('nos_region', 0))
        if r in (R_PAINT, R_PAINT2, R_PAINT3):
            spec = json.loads(m.get('nos', '{}'))
            out.setdefault(REGION_NAMES[r], spec.get('base', '#808080'))
    return out


def _islands(bm, uvl):
    """UV islands of a bmesh: lists of faces connected through edges with matching UVs"""
    parent = {f.index: f.index for f in bm.faces}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in bm.edges:
        lf = e.link_faces
        if len(lf) != 2:
            continue
        f1, f2 = lf
        ok = True
        for v in e.verts:
            u1 = next(l[uvl].uv for l in f1.loops if l.vert == v)
            u2 = next(l[uvl].uv for l in f2.loops if l.vert == v)
            if (u1 - u2).length > 1e-5:
                ok = False
                break
        if ok:
            ra, rb = find(f1.index), find(f2.index)
            if ra != rb:
                parent[ra] = rb
    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.index), []).append(f)
    return list(groups.values())


def uv_atlas_weighted(ob, boost=None, under=0.45, margin=0.005):
    """Smart-project atlas whose islands are rescaled before packing: faces of materials named in
    `boost` ({name prefix: factor}) get more texels (lettering, plates, lamps), faces looking down
    (`under`) fewer. One texture for the whole vehicle."""
    me = ob.data
    uvl = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    me.uv_layers.active = uvl
    kit.select_only([ob], ob)
    bpy.ops.object.mode_set(mode='EDIT')
    ebm = bmesh.from_edit_mesh(me)
    cl = ebm.faces.layers.int.get('_cyl')
    n_cyl = 0
    for f in ebm.faces:
        f.select = bool(cl is not None and f[cl])
        n_cyl += f.select
    bmesh.update_edit_mesh(me)
    if n_cyl:
        # ring-built parts: angle-based unwrap along their seams (a few islands each)
        bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=margin)
    ebm = bmesh.from_edit_mesh(me)
    cl = ebm.faces.layers.int.get('_cyl')
    n_rest = 0
    for f in ebm.faces:
        f.select = not (cl is not None and f[cl])
        n_rest += f.select
    bmesh.update_edit_mesh(me)
    if n_rest:
        bpy.ops.uv.smart_project(angle_limit=math.radians(UV_ANGLE), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception as e:
        kit.log('average_islands_scale failed', e)
    bpy.ops.object.mode_set(mode='OBJECT')
    # the seam-marker face layer has done its job: drop it so the exporter does not ship it as a
    # _CYL vertex attribute (4 bytes a vertex for nothing)
    at = me.attributes.get('_cyl')
    if at is not None:
        me.attributes.remove(at)
    kit.log('uv: %d faces unwrapped along seams, %d smart-projected' % (n_cyl, n_rest))
    boost = boost or {}
    names = [m.name if m else '' for m in me.materials]
    nobake = [bool(m is not None and not m.get('nos_bake', True)) for m in me.materials]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    lay = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.active
    n_scaled = 0
    for isl in _islands(bm, lay):
        fac = 1.0
        down = 0
        glass = 0
        for f in isl:
            nm = names[f.material_index] if f.material_index < len(names) else ''
            for k, s in boost.items():
                if nm.startswith(k):
                    fac = max(fac, s)
            if f.normal.z < -0.75:
                down += 1
            if f.material_index < len(nobake) and nobake[f.material_index]:
                glass += 1
        if glass == len(isl):
            fac = 0.03          # glass is not baked: (almost) no atlas space
        elif fac == 1.0 and under and down == len(isl):
            fac = under
        if fac == 1.0:
            continue
        uvs = [l[lay].uv for f in isl for l in f.loops]
        cx = sum(u.x for u in uvs) / len(uvs)
        cy = sum(u.y for u in uvs) / len(uvs)
        for f in isl:
            for l in f.loops:
                u = l[lay].uv
                l[lay].uv = ((u.x - cx) * fac + cx, (u.y - cy) * fac + cy)
        n_scaled += 1
    bm.to_mesh(me)
    bm.free()
    kit.select_only([ob], ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    except Exception as e:
        kit.log('pack_islands failed', e)
    bpy.ops.object.mode_set(mode='OBJECT')
    kit.log('uv atlas: %d islands rescaled' % n_scaled)


def bake_emit(objs, size):
    """bake the materials' `emit` colours (black elsewhere) into one image (lamp mask)"""
    sc = bpy.context.scene
    mats = []
    for o in objs:
        for m in o.data.materials:
            if m and m not in mats:
                mats.append(m)
    img = kit._img('_emit', size)
    info = []
    for m in mats:
        nt = m.node_tree
        N = nt.nodes
        tn = N.new('ShaderNodeTexImage')
        tn.name = '_bake_target'
        tn.image = img
        N.active = tn
        out = N.get('NOS_OUT')
        if out is None:
            info.append((m, tn, None, None))
            continue
        prev = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
        em = N.new('ShaderNodeEmission')
        spec = json.loads(m.get('nos', '{}'))
        em.inputs['Color'].default_value = kit.lin(spec['emit']) if spec.get('emit') else (0, 0, 0, 1)
        em.inputs['Strength'].default_value = 1.0
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        info.append((m, tn, em, prev))
    kit.select_only(objs, objs[0])
    sc.cycles.samples = 1
    sc.render.bake.margin = 3
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = True
    sc.render.bake.target = 'IMAGE_TEXTURES'
    bpy.ops.object.bake(type='EMIT', margin=3, use_clear=True)
    for (m, tn, em, prev) in info:
        nt = m.node_tree
        out = nt.nodes.get('NOS_OUT')
        if em is not None:
            nt.nodes.remove(em)
            if prev is not None and out is not None:
                nt.links.new(prev, out.inputs['Surface'])
        nt.nodes.remove(tn)
    return img


def vehicle_material(name, base_path, orm_path=None, emit_path=None):
    """the export material: baked base colour (+ ORM) (+ emissive lamp mask)"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    N = nt.nodes
    bsdf = N.get('Principled BSDF')
    t = N.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(base_path, check_existing=True)
    t.image.colorspace_settings.name = 'sRGB'
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if orm_path:
        o = N.new('ShaderNodeTexImage')
        o.image = bpy.data.images.load(orm_path, check_existing=True)
        o.image.colorspace_settings.name = 'Non-Color'
        sep = N.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'], sep.inputs[0])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    else:
        bsdf.inputs['Roughness'].default_value = 0.6
    if emit_path:
        e = N.new('ShaderNodeTexImage')
        e.image = bpy.data.images.load(emit_path, check_existing=True)
        e.image.colorspace_settings.name = 'sRGB'
        nt.links.new(e.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return m


def finish_vehicle(A, ob, tex=512, orm=256, emit=256, ao_samples=24, albedo_samples=6, ao_strength=0.72, ao_dist=2.2, ao_scale=0.5,
                   ground=True, boost=None, under=0.45, margin=0.005):
    """atlas + bakes -> one material M_<id>@night (base colour x AO, ORM, emissive lamp mask)"""
    kit.ensure_dirs()
    kit.apply_modifiers(ob)
    kit.clean_slots(ob)
    sc = bpy.context.scene
    sc.world.light_settings.distance = ao_dist
    t0 = time.time()
    uv_atlas_weighted(ob, boost if boost is not None else {'sign_': 2.6, 'head_lens': 1.6, 'tail_lens': 1.5}, under=under, margin=margin)
    alb = kit.img_array(kit.bake_pass([ob], 'albedo', tex, samples=albedo_samples, name='_alb'))
    gp = None
    if ground:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
        me = bpy.data.meshes.new('_aoground')
        bm.to_mesh(me)
        bm.free()
        gp = bpy.data.objects.new('_aoground', me)
        sc.collection.objects.link(gp)
        gp.location.z = -0.02
    ao_size = max(64, int(tex * ao_scale))
    ao = kit.img_array(kit.bake_pass([ob], 'ao', ao_size, samples=ao_samples, name='_ao', margin=max(2, int(6 * ao_scale))))
    if gp is not None:
        bpy.data.objects.remove(gp, do_unlink=True)
    if ao_size != tex:
        ao = kit.resize_bilinear(ao, tex, tex)
    base = alb.copy()
    k = kit.ao_curve(ao[..., 0], ao_strength)
    for c in range(3):
        base[..., c] *= k
    base[..., 3] = 1.0
    bpath = os.path.join(kit.TMP_DIR, A.id + '_base.png')
    kit.save_png(base, bpath, srgb=True, name=A.id + '_base')
    opath = None
    if orm:
        orm_a = kit.img_array(kit.bake_pass([ob], 'orm', orm, samples=1, name='_orm'))
        orm_a[..., 0] = 1.0
        orm_a[..., 3] = 1.0
        opath = os.path.join(kit.TMP_DIR, A.id + '_orm.png')
        kit.save_png(orm_a, opath, srgb=False, name=A.id + '_orm')
    epath = None
    has_emit = any(m and json.loads(m.get('nos', '{}')).get('emit') for m in ob.data.materials)
    if emit and has_emit:
        e = kit.img_array(bake_emit([ob], emit))
        e[..., 3] = 1.0
        epath = os.path.join(kit.TMP_DIR, A.id + '_emit.png')
        kit.save_png(e, epath, srgb=True, name=A.id + '_emit')
    M = vehicle_material('M_%s@night' % A.id if epath else 'M_' + A.id, bpath, opath, epath)
    kit.drop_uv([ob], 'SignUV')
    slots = list(ob.data.materials)
    keep = [m for m in slots if m is not None and not m.get('nos_bake', True)]
    if not keep:
        kit.assign(ob, M)
    else:
        # baked faces -> M; glass keeps its own constant (transparent) material M_<id>_glass
        newmats = [M] + [kit.glass_material(A.id, m) for m in keep]
        idx_map = {i: (0 if (m is None or m.get('nos_bake', True)) else 1 + keep.index(m)) for i, m in enumerate(slots)}
        fidx = [idx_map.get(p.material_index, 0) for p in ob.data.polygons]
        ob.data.materials.clear()
        for m in newmats:
            ob.data.materials.append(m)
        for p, i in zip(ob.data.polygons, fidx):
            p.material_index = i
    for p in (bpath, opath, epath):
        if p:
            A.textures.append(p)
    kit.log('finish %s: tex %d, orm %s, emit %s in %.1fs' % (A.id, tex, orm, bool(epath), time.time() - t0))
    return M


# =========================================================================== previews (tinted variants)
def _tint_imported(objs, colours, defaults, lamps=0.0):
    """multiply the imported base colour per _REGION by colour / default (what the runtime does);
    lamps > 0 lights the head / tail lamp groups (night shot)"""
    for o in objs:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if not m or not m.use_nodes:
                continue
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf is None:
                continue
            at = nt.nodes.new('ShaderNodeAttribute')
            at.attribute_name = '_REGION'
            if bsdf.inputs['Base Color'].links:
                col = bsdf.inputs['Base Color'].links[0].from_socket
                for rname, hexv in (colours or {}).items():
                    d = defaults.get(rname)
                    if not d or not hexv or rname not in REGION_NAMES:
                        continue
                    want, base = kit.lin(hexv), kit.lin(d)
                    ratio = tuple(min(24.0, want[i] / max(base[i], 0.004)) for i in range(3)) + (1.0,)
                    cmp_ = nt.nodes.new('ShaderNodeMath')
                    cmp_.operation = 'COMPARE'
                    nt.links.new(at.outputs['Fac'], cmp_.inputs[0])
                    cmp_.inputs[1].default_value = float(REGION_NAMES.index(rname))
                    cmp_.inputs[2].default_value = 0.4
                    mx = nt.nodes.new('ShaderNodeMix')
                    mx.data_type = 'RGBA'
                    mx.blend_type = 'MULTIPLY'
                    mx.clamp_result = False
                    nt.links.new(cmp_.outputs[0], mx.inputs[0])
                    nt.links.new(col, kit._sock(mx, 'A', 'RGBA'))
                    kit._sock(mx, 'B', 'RGBA').default_value = ratio
                    col = kit._sock(mx, 'Result', 'RGBA', out=True)
                nt.links.new(col, bsdf.inputs['Base Color'])
            # lamps: only the head / tail groups glow (lamps > 0), everything else off
            if bsdf.inputs['Emission Color'].links:
                k = nt.nodes.new('ShaderNodeMath')
                k.operation = 'COMPARE'
                nt.links.new(at.outputs['Fac'], k.inputs[0])
                k.inputs[1].default_value = 4.5
                k.inputs[2].default_value = 0.6
                bsdf.inputs['Emission Strength'].default_value = 0.0
                if lamps > 0:
                    mul = nt.nodes.new('ShaderNodeMath')
                    mul.operation = 'MULTIPLY'
                    nt.links.new(k.outputs[0], mul.inputs[0])
                    mul.inputs[1].default_value = lamps
                    nt.links.new(mul.outputs[0], bsdf.inputs['Emission Strength'])
            else:
                bsdf.inputs['Emission Strength'].default_value = 0.0


def render_glb(glb_path, out, view=None, size=256, samples=14, colours=None, defaults=None, hide=None, night=False, ground=True):
    """Cycles CPU render of an exported vehicle GLB (what ships), tinted per _REGION like the
    runtime, option-bone parts in `hide` removed; night=True: dusk light with the lamps on."""
    sc = bpy.data.scenes.new('_vprev')
    win = bpy.context.window
    prev = bpy.context.scene
    if win:
        win.scene = sc
    sc.world = bpy.data.worlds.new('_vw')
    kit._preview_world(sc, 0.12 if night else 0.9)
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.04
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 1
    sc.cycles.blur_glossy = 2.0
    sc.cycles.sample_clamp_indirect = 1.5
    try:
        sc.cycles.use_fast_gi = True
        sc.cycles.fast_gi_method = 'REPLACE'
        sc.world.light_settings.distance = 12.0
    except Exception:
        pass
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 4
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.filter_size = 1.8
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.name.startswith('COL_'):
            o.hide_render = True
    arm = next((o for o in objs if o.type == 'ARMATURE'), None)
    if arm:
        if arm.animation_data:
            arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
            if hide and pb.name in hide:
                pb.scale = (0.0, 0.0, 0.0)
    man = {}
    mp = os.path.splitext(glb_path)[0] + '.json'
    if os.path.exists(mp):
        man = json.load(open(mp))
    defaults = defaults if defaults is not None else ((man.get('tint') or {}).get('regions') or {})
    _tint_imported(objs, colours or {}, defaults, lamps=6.0 if night else 0.0)
    bpy.context.view_layer.update()
    lo, hi = Vector(man.get('min', (-5, -10, 0))), Vector(man.get('max', (5, 10, 8)))
    ctr = (lo + hi) / 2
    rad = max((hi - lo).length / 2, 0.5)
    if ground:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=rad * 6)
        gme = bpy.data.meshes.new('_ground')
        bm.to_mesh(gme)
        bm.free()
        g = bpy.data.objects.new('_ground', gme)
        sc.collection.objects.link(g)
        gm = bpy.data.materials.new('_groundm')
        gm.use_nodes = True
        gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = kit.lin('#8d8a84' if not night else '#4a4a50')
        gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
        gme.materials.append(gm)
    ld = bpy.data.lights.new('_sun', 'SUN')
    ld.energy = 0.25 if night else 3.2
    ld.angle = math.radians(3)
    ld.color = (0.7, 0.75, 1.0) if night else (1.0, 0.96, 0.9)
    lo_ = bpy.data.objects.new('_sun', ld)
    sc.collection.objects.link(lo_)
    lo_.rotation_euler = Vector((0.9, 0.35, 0.5)).normalized().to_track_quat('Z', 'Y').to_euler()
    v = view or {}
    az = math.radians(v.get('az', -35.0))
    el = math.radians(v.get('el', 18.0))
    fov = math.radians(v.get('fov', 32.0))
    dist = v.get('dist') or (rad / math.sin(fov / 2)) * v.get('pad', 1.05)
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    tgt = Vector(v.get('target', ctr))
    cd = bpy.data.cameras.new('_cam')
    cd.angle = fov
    cd.clip_start = 0.05
    cd.clip_end = dist * 10 + 100
    cam = bpy.data.objects.new('_cam', cd)
    sc.collection.objects.link(cam)
    cam.location = tgt + d * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = out
    sc.render.image_settings.file_format = 'PNG'
    t0 = time.time()
    bpy.ops.render.render(write_still=True, scene=sc.name)
    kit.log('render %s (%dpx, %d spp) in %.1fs' % (os.path.basename(out), size, samples, time.time() - t0))
    if win:
        win.scene = prev
    for o in list(sc.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    return out


def preview_variants(aid, sets, view=None, size=256, samples=14, out_name='variants', night_view=None):
    """Tinted variant sheet assets3d/previews/<id>_<out_name>.png: sets = [{'colours': {region: hex},
    'hide': [option bones], 'label': str}]; with night_view also <id>_night.png (lamps on)."""
    glb = os.path.join(kit.ASSETS_DIR, aid + '.glb')
    outs = []
    for i, st in enumerate(sets):
        p = os.path.join(kit.TMP_DIR, '%s_var_%d.png' % (aid, i))
        render_glb(glb, p, view=st.get('view', view), size=size, samples=samples, colours=st.get('colours'), hide=st.get('hide'))
        outs.append(p)
    if outs:
        kit.contact_sheet(outs, os.path.join(kit.PREVIEW_DIR, '%s_%s.png' % (aid, out_name)), cols=min(4, len(outs)), cell=size)
    if night_view:
        render_glb(glb, os.path.join(kit.PREVIEW_DIR, aid + '_night.png'), view=night_view, size=320, samples=max(16, samples), night=True,
                   hide=(sets[0].get('hide') if sets else None), colours=(sets[0].get('colours') if sets else None))


def after_export(A):
    """register the variant / night previews (A.preview['variants'], read at exit) to run after
    kit.run_asset exported the GLB (atexit: the build process exits right after); skipped with
    --no-preview / --quick"""
    import atexit
    import sys
    if '--no-preview' in sys.argv or '--quick' in sys.argv or getattr(A, 'quick', False):
        return

    def run():
        pv = (A.preview or {}).get('variants')
        if not pv or not os.path.exists(os.path.join(kit.ASSETS_DIR, A.id + '.glb')):
            return
        try:
            # the main shots again through the tinted renderer, with the option parts of the first
            # variant hidden (kit.preview_render shows every option bone's parts at once)
            sets = pv.get('sets', [])
            if sets and sets[0].get('hide'):
                for i, sh in enumerate(A.preview.get('shots') or [{}]):
                    name = A.id if i == 0 else '%s_%s' % (A.id, sh.get('name', i))
                    render_glb(os.path.join(kit.ASSETS_DIR, A.id + '.glb'), os.path.join(kit.PREVIEW_DIR, name + '.png'), view=sh.get('view'),
                               size=sh.get('size', 384), samples=sh.get('samples', 24), colours=sets[0].get('colours'), hide=sets[0].get('hide'))
            preview_variants(A.id, sets, view=pv.get('view'), size=pv.get('size', 256), samples=pv.get('samples', 14), night_view=pv.get('night'))
        except Exception as e:
            import traceback
            traceback.print_exc()
            kit.log('variant previews failed: %s' % e)
    atexit.register(run)


# =========================================================================== bodywork helpers (motor vehicles)
def u_row(y, hw, z_skirt, zc, hh, p=2.6, n=8, x0=0.0):
    """one cross-section row of an open inverted-U shell at y (scooter rear bodies, mudguards, bonnets):
    from the left skirt (x0 + hw, z_skirt) up over a superellipse top (centre zc, half height hh) and
    down to the right skirt; every row has n + 3 points"""
    zs = min(z_skirt, zc - 0.02)
    pts = [(x0 + hw, y, zs)]
    for i in range(n + 1):
        a = math.pi * i / n
        ca, sa = math.cos(a), math.sin(a)
        ex = math.copysign(abs(ca) ** (2.0 / p), ca)
        ez = abs(sa) ** (2.0 / p)
        pts.append((x0 + hw * ex, y, zc + hh * ez))
    pts.append((x0 - hw, y, zs))
    return pts


def apron_rows(levels, n=8):
    """rows of a leg shield / apron (curved sheet, convex towards -Y): levels = [(z, y_back, hw,
    bulge)], each row runs across x from +hw to -hw"""
    rows = []
    for (z, y0, hw, bulge) in levels:
        row = []
        for i in range(n + 1):
            u = 1 - 2 * i / n
            row.append((hw * u, y0 - bulge * (1 - u * u), z))
        rows.append(row)
    return rows


def ring_y(y, hw, z0, z1, p=2.4, x0=0.0):
    """a loft ring (kit.loft dict) across Y: a superellipse of half width hw between z0 and z1"""
    return dict(c=(x0, y, (z0 + z1) / 2.0), r=(hw, (z1 - z0) / 2.0), p=p, side=(1, 0, 0))


def loft_y(name, stations, m, seg=12, cap_start=True, cap_end=True):
    """a closed body along Y from superellipse stations [(y, hw, z0, z1, p[, x0])]"""
    rings = [ring_y(*s) for s in stations]
    return loft(name, rings, seg=seg, side=(1, 0, 0), mat=m, cap_start=cap_start, cap_end=cap_end)


def tele_fork(name, crown, axle, ax, half, r, m, lower_m=None, lower_r=None, split=0.55, seg=6):
    """telescopic fork: two legs from the crown (top) down to the axle along the steering axis ax,
    `half` apart from the centre line; the lower (slider) part in lower_m (the stanchion in m)"""
    parts = []
    crown, axle = Vector(crown), Vector(axle)
    for sx in (1, -1):
        top = crown + Vector((sx * half, 0, 0))
        bot = axle + Vector((sx * half, 0, 0))
        mid = top.lerp(bot, split)
        parts.append(tube(name + '_stanchion', [top, mid + (bot - top) * 0.05], r, seg=seg, mat=m))
        parts.append(tube(name + '_slider', [mid, bot], lower_r or r * 1.25, seg=seg, mat=lower_m or m, cap=True))
    return parts


def moto_bars(name, centre, pts_left, grip_len, M, bar_m=None, grip_m=None, r=0.09, grip_r=0.15, levers=True, lever_m=None):
    """a handlebar mirrored about x = centre.x: pts_left = polyline offsets (left half, +X) from the
    centre; the grip follows the last segment for grip_len. Returns (parts, {'L': grip centre, 'R': ...})"""
    c = Vector(centre)
    parts = []
    grips = {}
    for sx, S in ((1, 'L'), (-1, 'R')):
        P = [c + Vector((p[0] * sx, p[1], p[2])) for p in pts_left]
        parts.append(tube(name + '_bar', P, r, seg=6, mat=bar_m or M['chrome']))
        d = (P[-1] - P[-2]).normalized()
        g0, g1 = P[-1] - d * grip_len, P[-1] + d * 0.05
        parts.append(tube(name + '_grip', [g0, g1], grip_r, seg=7, mat=grip_m or M['plastic'], cap=True))
        grips[S] = g0.lerp(g1, 0.5)
        if levers:
            side = Vector((0, -1, 0))
            l0 = g0 - d * 0.1 + Vector((0, -0.12, 0.05))
            parts.append(tube(name + '_lever', [l0, l0 + d * (grip_len * 0.75) + side * 0.35 + Vector((0, 0, -0.05))], 0.045, seg=4, mat=lever_m or M['chrome']))
            parts.append(rbox(name + '_perch', (0.22, 0.28, 0.22), tuple(g0 - d * 0.12), lever_m or M['black'], bevel=0.0))
    return parts, grips


def mirrors(name, bases, height, lean, r, M, stalk_m=None):
    """a pair of round mirrors on stalks from bases [(x, y, z) left, right] rising `height`, leaning
    outwards by `lean`; the glass faces back (+Y) to the rider"""
    parts = []
    for b in bases:
        b = Vector(b)
        sx = 1 if b.x >= 0 else -1
        top = b + Vector((sx * lean, 0.1, height))
        parts.append(tube(name + '_stalk', [b, b + Vector((sx * lean * 0.3, 0.02, height * 0.55)), top], 0.045, seg=4, mat=stalk_m or M['chrome']))
        head = lathe(name + '_head', [(0.0, -0.1), (r * 0.9, -0.08), (r, 0.0), (r * 0.95, 0.05)], seg=10, mat=M['chrome'], close_top=True)
        head.rotation_mode = 'QUATERNION'
        head.rotation_quaternion = Vector((sx * 0.25, 1, 0.1)).normalized().to_track_quat('Z', 'Y')
        head.location = top + Vector((0, 0, r * 0.6))
        kit.apply_transform(head)
        parts.append(head)
    return parts


def lens_box(name, size, loc, m, bezel_m=None, facing='-Y', bezel=0.06):
    """a rectangular lamp: a lens (lamp material, glows at night) in a thin bezel"""
    parts = []
    sx, sy, sz = size
    if facing in ('-Y', '+Y'):
        s = 1 if facing == '+Y' else -1
        parts.append(rbox(name + '_lens', (sx, sy, sz), loc, m, bevel=min(0.05, sz * 0.2)))
        if bezel_m is not None:
            l = Vector(loc)
            parts.append(rbox(name + '_bezel', (sx + bezel * 2, sy * 0.7, sz + bezel * 2), tuple(l - Vector((0, s * sy * 0.3, 0))), bezel_m, bevel=0.0))
    else:
        parts.append(rbox(name + '_lens', (sx, sy, sz), loc, m, bevel=min(0.05, sz * 0.2)))
    return parts


def spring(name, a, b, r, turns, m, wire=0.05, seg=3):
    """a coil spring from a to b (rear shocks, seat springs)"""
    a, b = Vector(a), Vector(b)
    d = b - a
    t = d.normalized()
    u = t.orthogonal().normalized()
    v = t.cross(u)
    n = int(turns * 6)
    pts = [a + d * (i / n) + (u * math.cos(2 * math.pi * turns * i / n) + v * math.sin(2 * math.pi * turns * i / n)) * r for i in range(n + 1)]
    return tube(name, pts, wire, seg=seg, mat=m, cap=False)
