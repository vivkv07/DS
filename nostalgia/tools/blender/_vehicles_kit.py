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

REGION_NAMES = ['none', 'paint', 'paint2', 'paint3', 'r4', 'r5', 'r6', 'r7']
FONT_BOLD = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
                              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf') if os.path.exists(p)), None)
FONT_COND = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf') if os.path.exists(p)), FONT_BOLD)
FONT_SERIF = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf') if os.path.exists(p)), FONT_BOLD)


def V(*a):
    if len(a) == 1:
        return Vector(a[0])
    return Vector(a)


# =========================================================================== materials
def mat(key, name, region=0, **kw):
    """kit.material with an explicit tint region (kit's people materials carry their own regions).
    region: 0 none, 1 paint (v.color), 2 paint2 (v.color2 / a second livery colour), 3 paint3."""
    return kit.material(key, name, region=region, **kw)


def palette():
    """the vehicle material palette (each call returns the cached materials of this scene)"""
    return {
        'chrome': mat('chrome', 'chrome'),
        'steel': mat('steel', 'steel'),
        'alu': mat('steel', 'alu', base='#b4b8bb', rough=0.45, metal=0.75, grime=0.4),
        'rubber': mat('rubber', 'rubber'),
        'tyre': mat('rubber', 'tyre', base='#1e1e20', rough=0.9, grime=0.25, dirt='#6a604f', ground=1.2),
        'black': mat('paint_black', 'black_trim', base='#1a1a1c', rough=0.55, chips=0.1),
        'plastic': mat('plastic_black', 'plastic', base='#1c1c1e', rough=0.5),
        'glass': mat('paint_black', 'glass_dark', base='#26323a', rough=0.06, var=0.03, grain=0.0, chips=0.0, grime=0.2, dirt='#6a6a60'),
        'head_lens': mat('lamp_lens', 'head_lens', base='#eae6d4', rough=0.1, emit='#fff1cc'),
        'tail_lens': mat('reflector_red', 'tail_lens', base='#a0141a', rough=0.15, emit='#ff3020'),
        'amber': mat('reflector_red', 'amber_lens', base='#d07a10', rough=0.18),
        'reflector': mat('reflector_red', 'reflector'),
        'seat_black': mat('leather_brown', 'rexine_black', base='#1e1b1b', rough=0.45, grime=0.4),
        'seat_red': mat('leather_brown', 'rexine_red', base='#6e1e1c', rough=0.45, grime=0.4),
        'leather': mat('leather_brown', 'leather'),
        'canvas': mat('cloth', 'canvas_black', base='#1d1c1d', rough=0.95, var=0.06, grain=0.1, weave=0.12, grime=0.45, dirt='#4e463a', scale=2.5),
        'wood': mat('wood_raw', 'wood'),
        'engine': mat('steel', 'engine_alu', base='#8c8f92', rough=0.6, metal=0.55, grime=0.75, dirt='#2e2a26'),
        'dark': mat('paint_black', 'underbody', base='#202020', rough=0.8, chips=0.0, grime=0.5, dirt='#3a3228'),
    }


def paint(name, base, region=1, rough=0.35, chips=0.2, **kw):
    """painted steel (region-tinted at runtime)"""
    return mat('paint_black', name, region=region, base=base, rough=rough, chips=chips, **kw)


# =========================================================================== mesh helpers
def lathe_x(name, prof, seg, m, c, closed=False):
    """revolve a profile [(radius, x_offset)] around the X axis, centred at c"""
    o = kit.lathe(name, [(r, z) for (r, z) in prof], seg=seg, mat=m, close_top=False, close_bottom=False)
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
    """a bevelled box (seg 1 = a chamfer: crisp highlights for ~44 tris; bevel 0 = 12 tris)"""
    return kit.box(name, size, loc, m, bevel=bevel, segments=seg)


def section_loft(name, stations, m, seg=16, cap_start=True, cap_end=True, axis='Y'):
    """A body built from superellipse cross-sections along Y (front -Y to rear +Y).
    stations: [(y, x_half_width, z_bottom, z_top, power, (opt) {'zc': centre override})]. Each
    section is a superellipse |x/a|^p + |(z-zc)/b|^p = 1 between z_bottom and z_top."""
    rings = []
    for st in stations:
        y, hw, z0, z1, p = st[:5]
        rings.append(dict(c=(0.0, y, (z0 + z1) / 2.0), r=(hw, (z1 - z0) / 2.0), p=p, side=(1, 0, 0)))
    # loft frames follow the path tangent (Y); `side` = X so rx is the half width and ry the half height
    o = kit.loft(name, rings, seg=seg, side=(1, 0, 0), mat=m, cap_start=cap_start, cap_end=cap_end)
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


def tyre(name, c, R, w, m, seg=20, tread=True, side_r=None):
    """a tyre around the X axis: rounded shoulders, a flat tread band (optional groove lines)"""
    hw = w / 2.0
    sr = side_r if side_r is not None else min(hw * 0.6, R * 0.22)
    rin = R - min(R * 0.36, max(0.35, w * 0.55))
    prof = [(rin, -hw * 0.8), (R - sr, -hw), (R, -hw * 0.5), (R, hw * 0.5), (R - sr, hw), (rin, hw * 0.8)]
    return lathe_x(name, prof, seg, m, c, closed=True)


def spoke_wheel(name, c, R, M, spokes=28, seg=24, tyre_w=0.42, rim_d=0.4, hub_w=0.62, sp_r=0.022, tread_m=None):
    """a spoked wheel (cycles, Luna, RX100, rickshaw): tyre, chrome rim, hub, crossed spokes"""
    parts = [tyre(name + '_tyre', c, R, tyre_w, tread_m or M['tyre'], seg=seg)]
    ri = R - tyre_w * 0.55
    rim = lathe_x(name + '_rim', [(ri - rim_d * 0.6, -0.09), (ri - rim_d * 0.45, -0.12), (ri, -0.1), (ri, 0.1), (ri - rim_d * 0.45, 0.12), (ri - rim_d * 0.6, 0.09)],
                  seg, M['chrome'], c, closed=True)
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
        sp.append(kit.tube(name + '_spoke%d' % i, [Vector(c) + h, Vector(c) + r], sp_r, seg=3, mat=M['chrome'], cap=False))
    parts.append(kit.join(sp, name + '_spokes'))
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
    return kit.loft(name, rings, seg=seg, side=(1, 0, 0), mat=m, cap_start=True, cap_end=True)


def lamp_round(name, c, r, depth, M, lens='head_lens', bezel='chrome', facing=(0, -1, 0), seg=14):
    """a round lamp: a bezel cup + a slightly domed lens, facing `facing`"""
    f = Vector(facing).normalized()
    q = f.to_track_quat('-Z', 'Y')
    cup = kit.lathe(name + '_cup', [(r * 0.55, -depth), (r * 1.05, -depth * 0.55), (r * 1.12, 0.0), (r * 1.02, 0.04)], seg=seg, mat=M[bezel], close_bottom=True, close_top=False)
    lensO = kit.lathe(name + '_lens', [(r * 0.98, 0.0), (r * 0.8, 0.06), (r * 0.4, 0.1), (0.0, 0.11)], seg=seg, mat=M[lens], close_bottom=False, close_top=False)
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
    stalk = kit.tube(name + '_stalk', [Vector(base), Vector(arm_to)], 0.05, seg=5, mat=M['chrome'])
    head = kit.lathe(name + '_head', [(0.0, -0.08), (r, -0.06), (r * 1.02, 0.02), (r * 0.9, 0.06)], seg=12, mat=M['chrome'], close_top=True)
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
    return kit.tube(name, [Vector(p) for p in pts], r, seg=seg, mat=m)


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
              boost=None, under=0.45, smooth_angle=38.0, margin=0.005):
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
                kit.smooth(o, self.smooth.get(o.name, smooth_angle))
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
        return arm, ob


def region_colours(ob):
    """default (baked) colour per tint region, from the source materials"""
    out = {}
    for m in ob.data.materials:
        if not m:
            continue
        r = int(m.get('nos_region', 0))
        if r:
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
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    boost = boost or {}
    names = [m.name if m else '' for m in me.materials]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    lay = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.active
    n_scaled = 0
    for isl in _islands(bm, lay):
        fac = 1.0
        down = 0
        for f in isl:
            nm = names[f.material_index] if f.material_index < len(names) else ''
            for k, s in boost.items():
                if nm.startswith(k):
                    fac = max(fac, s)
            if f.normal.z < -0.75:
                down += 1
        if fac == 1.0 and under and down == len(isl):
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
    kit.assign(ob, M)
    for p in (bpath, opath, epath):
        if p:
            A.textures.append(p)
    kit.log('finish %s: tex %d, orm %s, emit %s in %.1fs' % (A.id, tex, orm, bool(epath), time.time() - t0))
    return M


# =========================================================================== previews (tinted variants)
def _tint_imported(objs, colours, defaults):
    """multiply the imported base colour per _REGION by colour / default (what the runtime does)"""
    for o in objs:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if not m or not m.use_nodes:
                continue
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf is None or not bsdf.inputs['Base Color'].links:
                continue
            src = bsdf.inputs['Base Color'].links[0].from_socket
            at = nt.nodes.new('ShaderNodeAttribute')
            at.attribute_name = '_REGION'
            col = src
            for ri, (rname, hexv) in enumerate(colours.items()):
                idx = REGION_NAMES.index(rname)
                d = defaults.get(rname)
                if not d or not hexv:
                    continue
                want, base = kit.lin(hexv), kit.lin(d)
                ratio = tuple(min(24.0, want[i] / max(base[i], 0.004)) for i in range(3)) + (1.0,)
                cmp_ = nt.nodes.new('ShaderNodeMath')
                cmp_.operation = 'COMPARE'
                nt.links.new(at.outputs['Fac'], cmp_.inputs[0])
                cmp_.inputs[1].default_value = float(idx)
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
            # lamps off in day previews
            try:
                bsdf.inputs['Emission Strength'].default_value = 0.0
            except Exception:
                pass


def preview_variants(A, variants, out_name='variants', size=256, samples=14, view=None, glb_path=None, hide_bones=None):
    """Render the exported GLB once per colour variant ({region: hex}) and tile the shots into
    assets3d/previews/<id>_<out_name>.png. hide_bones: option bones scaled to zero per variant
    (list of lists)."""
    glb_path = glb_path or os.path.join(kit.ASSETS_DIR, A.id + '.glb')
    defaults = (A.tint or {}).get('regions', {})
    outs = []
    for i, var in enumerate(variants):
        hb = (hide_bones or [None] * len(variants))[i] if hide_bones else None
        p = os.path.join(kit.TMP_DIR, '%s_var_%d.png' % (A.id, i))
        _render_tinted(A, glb_path, var, defaults, p, size, samples, view, hb)
        outs.append(p)
    out = os.path.join(kit.PREVIEW_DIR, '%s_%s.png' % (A.id, out_name))
    kit.contact_sheet(outs, out, cols=len(outs), cell=size)
    return out


def _render_tinted(A, glb_path, colours, defaults, out, size, samples, view, hide=None):
    """kit.preview_render with a tint hook (the imported materials get the _REGION multiply)"""
    before_objs = set(bpy.data.objects)
    real_import = bpy.ops.import_scene.gltf

    def hooked(**kw):
        r = real_import(**kw)
        new = [o for o in bpy.data.objects if o not in before_objs]
        _tint_imported(new, colours, defaults)
        if hide:
            # variant parts the runtime hides (scaled-to-zero option bones): drop their vertices
            for o in new:
                if o.type != 'MESH':
                    continue
                gi = {g.index for g in o.vertex_groups if g.name in hide}
                if not gi:
                    continue
                bm = bmesh.new()
                bm.from_mesh(o.data)
                dl = bm.verts.layers.deform.verify()
                kill = [v for v in bm.verts if any(k in gi and w > 0.5 for k, w in v[dl].items())]
                bmesh.ops.delete(bm, geom=kill, context='VERTS')
                bm.to_mesh(o.data)
                bm.free()
        return r
    import types
    ns = types.SimpleNamespace(gltf=hooked)
    saved = bpy.ops.import_scene
    try:
        kit.bpy.ops.import_scene = ns  # kit.preview_render imports through bpy.ops.import_scene.gltf
    except Exception:
        ns = None
    try:
        kit.preview_render(A, glb_path, size=size, samples=samples, view=view, out=out)
    finally:
        try:
            kit.bpy.ops.import_scene = saved
        except Exception:
            pass
    return out
