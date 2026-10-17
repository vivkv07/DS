"""NOSTALGIA — tools/blender/props_kit.py — shared helpers for the props artist's families
(props_trees.py, props_fauna.py, props_poles.py, props_street*.py). ARCHITECTURE §21.

This module registers no assets; it extends kit.py without editing it:
  * PLIB / M(key, **over): extra procedural materials (bark, leaves, fronds, flowers, feathers, fur,
    concrete, porcelain, galvanised steel, cart wood, tarpaulin, steel vessels...) on top of kit.LIB.
  * geometry: taper(), ribbon(), blob(), leaf_fan(), xform(), dup().
  * WIND (binding, design/feedback_3d.md round 3): every tree vertex carries the RGBA vertex
    attribute `_WIND` (glTF `_WIND`, unsigned byte VEC4 after packing = three.js attribute `_wind`,
    values 0..255; a dedicated channel rather than COLOR_0 so no loader ever tints the tree with it):
        R = bend weight   0 at the trunk base -> 1 at frond / branch tips (sway amplitude)
        G = flutter phase 0..1 (per leaf / leaflet cluster; the shader adds it to the time phase)
        B = flutter mask  0 = rigid wood, 1 = leaf / leaflet / flower (high-frequency flutter)
        A = 1 (spare)
  * finish_tree(): bake all LOD parts into one atlas, assemble LOD0 / LOD1 / LOD2 meshes (subsets of
    the baked parts + optional decimation, so every LOD shares the same texture) and a camera-facing
    IMPOSTOR quad (an alpha-masked render of LOD0) -> nodes <id>_LOD0, <id>_LOD1, <id>_LOD2,
    <id>_IMPOSTOR. Mesh data sits at the origin; the nodes are spread along +X only so the preview
    shows the line-up (the runtime uses the geometry and ignores the node offsets: meta.lods[].offset).
  * finish_prop(): bake + join into ONE mesh named <id> (one material, one draw call, instancing).
  * fauna: rig() (simple armature), rigid weights, skin(), clip() keyframing helper.
  * poles: wire() — an empty `wire_<name>` (kept in A.anchors so the manifest lists it).
"""
import math
import os
import random

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

import kit

V = Vector

# =========================================================================== materials
PLIB = {
    # trees
    'bark':          dict(base='#5b4836', rough=0.9, var=0.12, grain=0.22, grime=0.45, dirt='#2a2018', ground=3.0, scale=2.2),
    'bark_grey':     dict(base='#7a7368', rough=0.9, var=0.1, grain=0.2, grime=0.45, dirt='#3a342c', ground=3.0, scale=2.0),
    'palm_trunk':    dict(base='#8a7a62', rough=0.92, var=0.1, grain=0.16, grime=0.5, dirt='#3e3428', ground=4.0, scale=1.6),
    'leaf':          dict(base='#3f6e2c', rough=0.65, var=0.14, grain=0.1, grime=0.35, dirt='#1d3214', scale=1.4),
    'leaf_dark':     dict(base='#2c5224', rough=0.65, var=0.14, grain=0.1, grime=0.35, dirt='#142810', scale=1.4),
    'leaf_light':    dict(base='#5f8c3a', rough=0.6, var=0.14, grain=0.1, grime=0.3, dirt='#2a4018', scale=1.4),
    'frond':         dict(base='#56843a', rough=0.55, var=0.16, grain=0.12, grime=0.25, dirt='#6a6a30', scale=1.2),
    'frond_dry':     dict(base='#a08a50', rough=0.8, var=0.15, grain=0.12, scale=1.2),
    'flower_red':    dict(base='#d8381e', rough=0.6, var=0.12, grain=0.08, grime=0.2, dirt='#7a1a0c', scale=2.0),
    'flower_orange': dict(base='#ec7a22', rough=0.6, var=0.12, grain=0.08, scale=2.0),
    'coconut':       dict(base='#6f7a2e', rough=0.6, var=0.12, grain=0.08, grime=0.3, dirt='#3a3a14', scale=3.0),
    'mango_fruit':   dict(base='#7a9a32', rough=0.5, var=0.15, scale=3.0),
    # birds / animals
    'feather_grey':  dict(base='#8a8e96', rough=0.8, var=0.1, grain=0.12, grime=0.25, dirt='#3a3c44', scale=6.0),
    'feather_black': dict(base='#26272b', rough=0.7, var=0.08, grain=0.1, scale=6.0),
    'feather_brown': dict(base='#6a4a30', rough=0.8, var=0.12, grain=0.14, scale=6.0),
    'feather_green': dict(base='#4fae3a', rough=0.65, var=0.1, grain=0.1, scale=6.0),
    'feather_white': dict(base='#eeece4', rough=0.8, var=0.05, grain=0.06, grime=0.2, dirt='#8a867a', scale=6.0),
    'beak_yellow':   dict(base='#e8b830', rough=0.5, var=0.05, scale=4.0),
    'beak_red':      dict(base='#c8302a', rough=0.45, var=0.05, scale=4.0),
    'fur_white':     dict(base='#e6e0d2', rough=0.9, var=0.1, grain=0.14, grime=0.4, dirt='#7a6e5a', ground=2.0, scale=4.0),
    'fur_tan':       dict(base='#b08452', rough=0.9, var=0.12, grain=0.14, grime=0.4, dirt='#4a3420', ground=2.0, scale=4.0),
    'fur_dark':      dict(base='#3a2e26', rough=0.9, var=0.1, grain=0.14, grime=0.3, dirt='#1a1410', scale=4.0),
    'horn':          dict(base='#4a4038', rough=0.6, var=0.1, grain=0.1, scale=4.0),
    'hoof':          dict(base='#2a2420', rough=0.7, var=0.05, scale=4.0),
    'membrane':      dict(base='#3a2e2a', rough=0.7, var=0.08, grain=0.06, scale=5.0),
    # poles / street
    'concrete':      dict(base='#a8a49a', rough=0.92, var=0.1, grain=0.12, grime=0.5, dirt='#4e4a42', ground=6.0, streaks=0.3, scale=0.8),
    'concrete_old':  dict(base='#8e8a80', rough=0.94, var=0.12, grain=0.14, grime=0.6, dirt='#3e3a32', ground=8.0, streaks=0.45, scale=0.8),
    'porcelain':     dict(base='#f2f0ea', rough=0.18, var=0.03, grain=0.02, grime=0.3, dirt='#7a766a', scale=3.0),
    'galvanised':    dict(base='#9aa0a2', rough=0.45, metal=0.75, var=0.06, grain=0.05, rust=0.2, rust_col='#7a4a2a', grime=0.35, dirt='#3a3632', scale=1.5),
    'rail_steel':    dict(base='#4a4644', rough=0.6, metal=0.6, var=0.08, grain=0.06, rust=0.55, rust_col='#6e3a1c', grime=0.4, dirt='#2a2420', ground=5.0, scale=1.2),
    'transformer':   dict(base='#7e8a84', rough=0.55, metal=0.5, var=0.06, grain=0.04, rust=0.25, rust_col='#7a4426', grime=0.45, dirt='#3a3a32', streaks=0.3, scale=1.0),
    'cable_black':   dict(base='#18181a', rough=0.6, var=0.03, scale=3.0),
    'sodium_lens':   dict(base='#f0c070', rough=0.2, var=0.02, scale=3.0),
    'cart_wood':     dict(base='#6e4e30', rough=0.85, var=0.14, grain=0.2, chips=0.3, under='#4a3220', grime=0.45, dirt='#2a1e14', ground=2.0, scale=1.6),
    'cart_blue':     dict(base='#2f6aa8', rough=0.7, var=0.08, grain=0.12, chips=0.5, under='#6e4e30', grime=0.4, dirt='#2a2620', ground=2.0, scale=1.4),
    'cart_green':    dict(base='#2f7a4a', rough=0.7, var=0.08, grain=0.12, chips=0.5, under='#6e4e30', grime=0.4, dirt='#2a2620', ground=2.0, scale=1.4),
    'tarpaulin_blue': dict(base='#2a5ab0', rough=0.6, var=0.08, grain=0.06, weave=0.04, grime=0.3, dirt='#1a2a40', scale=3.0),
    'cloth_red':     dict(base='#b8302a', rough=0.9, var=0.08, grain=0.08, weave=0.06, grime=0.35, dirt='#4a1a14', scale=4.0),
    'steel_vessel':  dict(base='#c4c6c8', rough=0.25, metal=0.85, var=0.04, grain=0.03, grime=0.3, dirt='#4a4640', scale=3.0),
    'aluminium':     dict(base='#b8bab8', rough=0.4, metal=0.7, var=0.05, grain=0.05, grime=0.4, dirt='#4a4640', scale=3.0),
    'brass':         dict(base='#b08a3a', rough=0.35, metal=0.8, var=0.06, grain=0.04, grime=0.35, dirt='#4a3a1a', scale=3.0),
    'plastic_white': dict(base='#e8e6de', rough=0.45, var=0.04, grain=0.03, grime=0.4, dirt='#6a665a', scale=3.0),
    'sintex_black':  dict(base='#1e2022', rough=0.55, var=0.05, grain=0.04, grime=0.35, dirt='#5a5248', streaks=0.2, scale=1.2),
    'paint_yellow':  dict(base='#e8b820', rough=0.6, var=0.06, grain=0.05, chips=0.35, under='#5a5450', grime=0.4, dirt='#3a3020', scale=1.5),
    'paint_red':     dict(base='#b02a22', rough=0.6, var=0.06, grain=0.05, chips=0.35, under='#5a5450', grime=0.4, dirt='#3a2018', scale=1.5),
    'paint_white':   dict(base='#ecebe4', rough=0.7, var=0.05, grain=0.05, chips=0.3, under='#7a7a72', grime=0.45, dirt='#5a564a', scale=1.5),
    'marble_white':  dict(base='#ece8e0', rough=0.3, var=0.06, grain=0.04, specks=0.15, scale=1.0),
    'jute':          dict(base='#b49464', rough=0.95, var=0.1, grain=0.1, weave=0.12, grime=0.4, dirt='#5a4a30', scale=3.0),
    'clay':          dict(base='#a85a34', rough=0.85, var=0.1, grain=0.08, grime=0.35, dirt='#4a2414', scale=2.5),
    'turmeric':      dict(base='#e0a020', rough=0.85, var=0.08, grain=0.1, scale=3.0),
    'paper_kite':    dict(base='#e04a8a', rough=0.7, var=0.04, grain=0.03, scale=3.0),
    'asphalt_hole':  dict(base='#2c2a28', rough=0.9, var=0.12, grain=0.2, grime=0.3, dirt='#5a4a3a', scale=3.0),
}


def M(key, name=None, **over):
    """A material from PLIB (or kit.LIB) with overrides; cached per name within the scene."""
    if key in PLIB:
        spec = dict(PLIB[key])
        spec.update(over)
        return kit.material(key, name or key if not over else (name or key + '_' + str(abs(hash(tuple(sorted(over.items())))) % 9973)), **spec)
    if not over:
        return kit.material(key, name)
    return kit.material(key, name or key + '_' + str(abs(hash(tuple(sorted(over.items())))) % 9973), **over)


# =========================================================================== geometry helpers
def _frame_for(d):
    up = V((0, 0, 1)) if abs(d.z) < 0.95 else V((1, 0, 0))
    a = d.cross(up).normalized()
    b = d.cross(a).normalized()
    return a, b


def taper(name, pts, radii, seg=6, mat=None, cap_end=True, cap_start=False, squash=1.0):
    """A tapered round tube along a 3D polyline (trunks, branches, roots, legs, horns).
    radii: one per point (or a (r0, r1) pair, linearly interpolated). Parallel-transported frames
    so the tube never twists. squash < 1 flattens the section (along the second axis)."""
    pts = [V(p) for p in pts]
    n = len(pts)
    if len(radii) != n:
        r0, r1 = radii[0], radii[-1]
        radii = [r0 + (r1 - r0) * i / max(1, n - 1) for i in range(n)]
    bm = bmesh.new()
    rings = []
    d0 = (pts[1] - pts[0]).normalized()
    a, b = _frame_for(d0)
    prev_d = d0
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        # parallel transport of (a, b) from prev_d to d
        if prev_d.dot(d) < 0.9999:
            q = prev_d.rotation_difference(d)
            a = q @ a
            b = q @ b
        prev_d = d
        ring = []
        for k in range(seg):
            t = 2 * math.pi * k / seg
            ring.append(bm.verts.new(p + (a * math.cos(t) + b * math.sin(t) * squash) * radii[i]))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        if radii[-1] < 1e-4:
            pass
        else:
            bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def ribbon(name, pts, widths, side=None, mat=None, cols=1, normals=None):
    """A flat strip along a polyline (palm leaflets, frond rachis blades, ribbons, strings).
    widths: per point; side: a vector the strip spreads along (default: horizontal, perpendicular
    to the path); normals: optional per-point spread vectors. cols: segments across."""
    pts = [V(p) for p in pts]
    n = len(pts)
    if len(widths) != n:
        w0, w1 = widths[0], widths[-1]
        widths = [w0 + (w1 - w0) * i / max(1, n - 1) for i in range(n)]
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if normals is not None:
            s = V(normals[i]).normalized()
        elif side is not None:
            s = V(side)
            s = (s - d * s.dot(d)).normalized()
        else:
            s = d.cross(V((0, 0, 1)))
            s = s.normalized() if s.length > 1e-6 else V((1, 0, 0))
        row = []
        for c in range(cols + 1):
            f = c / cols - 0.5
            row.append(bm.verts.new(p + s * widths[i] * f))
        rows.append(row)
    for i in range(n - 1):
        for c in range(cols):
            bm.faces.new((rows[i][c], rows[i][c + 1], rows[i + 1][c + 1], rows[i + 1][c]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return kit.obj_from_bm(bm, name, mat)


def blob(name, r, loc=(0, 0, 0), subdiv=2, noise=0.18, seed=0, mat=None, scale=(1, 1, 1), flat_bottom=0.0):
    """A lumpy ico-sphere (leaf clumps, crowns, rocks, bodies). noise = relative displacement.
    flat_bottom > 0 squashes the lower part (crowns seen from below)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(9)]
    for v in bm.verts:
        p = v.co.normalized()
        k = (math.sin(p.x * 3.1 + ph[0]) * math.sin(p.y * 2.7 + ph[1]) * math.sin(p.z * 3.3 + ph[2])
             + 0.5 * math.sin(p.x * 6.3 + ph[3]) * math.sin(p.y * 5.9 + ph[4]) * math.sin(p.z * 6.1 + ph[5])
             + 0.35 * rnd.uniform(-1, 1))
        rr = 1.0 + noise * k
        q = V((p.x * scale[0], p.y * scale[1], p.z * scale[2])) * rr * r
        if flat_bottom and q.z < 0:
            q.z *= (1.0 - flat_bottom)
        v.co = q + V(loc)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def leaf_fan(name, base, direction, length, width, n=5, spread=1.2, droop=0.3, mat=None, seed=0):
    """A small fan of leaf blades (diamond quads) from `base` along `direction` (neem / ashoka /
    tamarind leaf sprays; cheap: 2 tris per blade)."""
    rnd = random.Random(seed)
    d = V(direction).normalized()
    a, b = _frame_for(d)
    bm = bmesh.new()
    for i in range(n):
        t = (i / max(1, n - 1) - 0.5) * spread
        dd = (d * math.cos(t) + a * math.sin(t)).normalized()
        dd = (dd - V((0, 0, droop * rnd.uniform(0.6, 1.2)))).normalized()
        L = length * rnd.uniform(0.75, 1.1)
        p0 = V(base)
        p2 = p0 + dd * L
        side = dd.cross(V((0, 0, 1)))
        side = side.normalized() if side.length > 1e-6 else a
        side = (side + b * rnd.uniform(-0.3, 0.3)).normalized()
        p1a = p0 + dd * L * 0.45 + side * width * 0.5
        p1b = p0 + dd * L * 0.45 - side * width * 0.5
        vs = [bm.verts.new(p) for p in (p0, p1a, p2, p1b)]
        bm.faces.new(vs)
    return kit.obj_from_bm(bm, name, mat)


def xform(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Set location / rotation (radians, XYZ euler) / scale and bake it into the mesh."""
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale
    kit.apply_transform(ob)
    return ob


def dup(ob, name=None):
    c = ob.copy()
    c.data = ob.data.copy()
    kit.link(c, ob.users_collection[0] if ob.users_collection else None)
    if name:
        c.name = name
    for k in ob.keys():
        try:
            c[k] = ob[k]
        except Exception:
            pass
    return c


# =========================================================================== wind data
WIND_ATTR = '_WIND'


def _val(f, co, i):
    if callable(f):
        return float(f(co, i))
    return float(f)


def wind(ob, bend=0.0, phase=0.0, flutter=0.0):
    """Paint the _WIND attribute (4 floats, point domain, values stored as integers 0..255 so the
    packer turns it into an unsigned-byte VEC4 = three.js attribute `_wind`; divide by 255 in the
    shader). bend / phase / flutter are numbers or fn(world co: Vector, vertex index) -> float in
    0..1 (phase wraps)."""
    me = ob.data
    at = me.attributes.get(WIND_ATTR)
    if at is None:
        at = me.attributes.new(WIND_ATTR, 'QUATERNION', 'POINT')   # 4 floats, not a colour: no COLOR_0
    mw = ob.matrix_world
    vals = []
    for v in me.vertices:
        co = mw @ v.co
        r = min(1.0, max(0.0, _val(bend, co, v.index)))
        g = _val(phase, co, v.index) % 1.0
        bb = min(1.0, max(0.0, _val(flutter, co, v.index)))
        vals += [float(round(r * 255)), float(round(g * 255) % 256), float(round(bb * 255)), 255.0]
    at.data.foreach_set('value', vals)
    return ob


def wind_bend_height(H, power=1.6, base=0.0, top=1.0):
    """bend fn: rises from `base` at z=0 to `top` at z=H (power curve)."""
    return lambda co, i: base + (top - base) * (max(0.0, co.z) / H) ** power


def wind_bend_along(origin, length, w0, w1=1.0, power=1.3):
    """bend fn for a branch / frond: w0 at `origin`, w1 at `length` away from it."""
    o = V(origin)
    return lambda co, i: w0 + (w1 - w0) * min(1.0, (co - o).length / length) ** power


# =========================================================================== finishing
def _set_double(M_, double=True):
    if M_ is not None:
        M_.use_backface_culling = not double
    return M_


def finish_prop(A, objs, size=128, double=False, ao_strength=0.6, ao_dist=None, orm=None, ao_samples=24, albedo_samples=6, name=None, max_tris=None):
    """Props: bake every object into one atlas (size px; prop budget 256), join into ONE mesh named
    <id> (one material = one draw call, instancing-friendly). double=True renders both faces
    (thin cloth, leaves, paper). Returns the joined object."""
    objs = kit.mesh_objects(objs)
    for o in objs:
        kit.apply_modifiers(o)
    ob = kit.join(objs, name or A.id)
    if max_tris:
        kit.decimate_to(ob, max_tris)
    Mt = kit.finish_atlas(A, [ob], size=size, ao_samples=ao_samples, albedo_samples=albedo_samples, ao_strength=ao_strength, ao_dist=ao_dist, orm=orm)
    _set_double(Mt, double)
    A.meta.setdefault('doubleSided', bool(double))
    return ob


def lod(ob, lmin=0, lmax=2):
    """Tag a tree part with the LOD levels it appears in (inclusive)."""
    ob['lod'] = (int(lmin), int(lmax))
    return ob


def _render_impostor(A, objs, px=128, samples=16):
    """Orthographic front render (-Y) of objs with a transparent background -> (path, w, h, lo, hi).
    Flat sky light (no sun), Standard view transform: the image is albedo x sky occlusion."""
    lo, hi = kit.bounds(objs)
    W = hi.x - lo.x
    Hh = hi.z - lo.z
    aspect = W / max(Hh, 1e-3)
    if aspect >= 1:
        rx, ry = px, max(16, int(round(px / aspect / 4)) * 4)
    else:
        rx, ry = max(16, int(round(px * aspect / 4)) * 4), px
    sc = bpy.data.scenes.new('_imp_' + A.id)
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 2
    sc.render.film_transparent = True
    sc.render.resolution_x = rx
    sc.render.resolution_y = ry
    sc.render.filter_size = 1.2
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 4
    try:
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
    except Exception:
        pass
    w = bpy.data.worlds.new('_impw')
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (1.0, 0.98, 0.95, 1)
    bg.inputs['Strength'].default_value = 1.05
    sc.world = w
    # a soft key light from the front-top so the impostor is not flatter than the mesh
    ld = bpy.data.lights.new('_impsun', 'SUN')
    ld.energy = 1.2
    ld.angle = math.radians(20)
    lob = bpy.data.objects.new('_impsun', ld)
    sc.collection.objects.link(lob)
    lob.rotation_euler = V((-0.3, -0.8, 0.9)).normalized().to_track_quat('Z', 'Y').to_euler()
    for o in objs:
        sc.collection.objects.link(o)
    cd = bpy.data.cameras.new('_impcam')
    cd.type = 'ORTHO'
    cd.ortho_scale = max(W, Hh) * 1.0
    cam = bpy.data.objects.new('_impcam', cd)
    sc.collection.objects.link(cam)
    cx = (lo.x + hi.x) / 2
    cz = (lo.z + hi.z) / 2
    cam.location = (cx, lo.y - 50.0, cz)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cd.clip_end = (hi.y - lo.y) + 200
    sc.camera = cam
    out = os.path.join(kit.TMP_DIR, A.id + '_imp.png')
    sc.render.filepath = out
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    win = bpy.context.window
    prev = bpy.context.scene
    if win:
        win.scene = sc
    bpy.ops.render.render(write_still=True, scene=sc.name)
    if win:
        win.scene = prev
    for o in objs:
        sc.collection.objects.unlink(o)
    for o in (lob, cam):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    # bleed colours into the transparent area (no dark fringes when mip-mapped / alpha-tested)
    img = bpy.data.images.load(out, check_existing=False)
    a = np.array(img.pixels[:], np.float32).reshape(img.size[1], img.size[0], 4)
    rgb = a[..., :3].copy()
    al = a[..., 3].copy()
    known = al > 0.5
    for _ in range(12):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(al.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh_k = np.roll(np.roll(known, dy, 0), dx, 1)
            sh_c = np.roll(np.roll(rgb, dy, 0), dx, 1)
            acc += sh_c * sh_k[..., None]
            cnt += sh_k
        grow = (~known) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    a[..., :3] = rgb
    a[..., 3] = (al > 0.5).astype(np.float32)   # crisp mask (alphaTest)
    img.pixels.foreach_set(a.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    return out, W, Hh, lo, hi


def _impostor_material(A, path):
    m = bpy.data.materials.new('M_%s_imp' % A.id)
    m.use_nodes = True
    m.use_backface_culling = False
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(path, check_existing=True)
    t.image.colorspace_settings.name = 'sRGB'
    t.interpolation = 'Linear'
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    # alpha clip at 0.5: the glTF exporter recognises Round -> alphaMode MASK (cutoff 0.5)
    rnd = nt.nodes.new('ShaderNodeMath')
    rnd.operation = 'ROUND'
    nt.links.new(t.outputs['Alpha'], rnd.inputs[0])
    nt.links.new(rnd.outputs[0], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.9
    try:
        m.surface_render_method = 'DITHERED'
    except Exception:
        pass
    m['nos_bake'] = False
    return m


def finish_tree(A, parts, kind, lod_tris=(None, None, None), tex=256, imp_px=128, ao_strength=0.65, ao_dist=None, double=True, lod_dist=(0, 180, 420, 800)):
    """Trees: parts = mesh objects tagged with lod(ob, lmin, lmax) and painted with wind().
    One atlas (tex px) for all parts; LOD k = join of the parts whose range covers k (copies),
    optionally decimated to lod_tris[k]; IMPOSTOR = alpha-masked front render of LOD0 on a quad.
    lod_dist: suggested switch distances (u) LOD0 < d0..., LOD1 from [1], LOD2 from [2], impostor
    from [3] (the runtime may scale them by quality). Writes meta.tree / lods / impostor / wind."""
    parts = kit.mesh_objects(parts)
    for o in parts:
        kit.apply_modifiers(o)
        if o.data.attributes.get(WIND_ATTR) is None:
            wind(o, 0.0, 0.0, 0.0)
        if 'lod' not in o.keys():
            lod(o, 0, 2)
    # parts only used by coarser LODs would occlude LOD0 parts in the AO bake: park them far away
    far = [o for o in parts if tuple(o['lod'])[0] > 0]
    for o in far:
        o.location.x += 10000.0
    Mt = kit.finish_atlas(A, parts, size=tex, ao_samples=24, albedo_samples=6, ao_strength=ao_strength, ao_dist=ao_dist, orm=False)
    _set_double(Mt, double)
    for o in far:
        o.location.x -= 10000.0
        kit.apply_transform(o)
    lods = []
    lod_objs = []
    for k in range(3):
        sel = [o for o in parts if tuple(o['lod'])[0] <= k <= tuple(o['lod'])[1]]
        if not sel:
            continue
        cp = [dup(o) for o in sel]
        ob = kit.join(cp, '%s_LOD%d' % (A.id, k))
        if lod_tris[k]:
            kit.decimate_to(ob, lod_tris[k])
            ob.data.name = ob.name
        if 'lod' in ob.keys():
            del ob['lod']
        lod_objs.append((k, ob))
    for o in parts:
        bpy.data.objects.remove(o, do_unlink=True)
    lod0 = lod_objs[0][1]
    # impostor
    path, W, Hh, lo, hi = _render_impostor(A, [lod0], px=imp_px)
    bm = bmesh.new()
    x0, x1, z0, z1 = lo.x, hi.x, lo.z, hi.z
    vs = [bm.verts.new(p) for p in ((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new('UVMap')
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lp[uvl].uv = uv
    imp = kit.obj_from_bm(bm, '%s_IMPOSTOR' % A.id, _impostor_material(A, path))
    wind(imp, lambda co, i: 0.3 * max(0.0, co.z - z0) / max(1e-3, z1 - z0), 0.0, 0.0)
    A.textures.append(path)
    # line-up for the preview (geometry stays at the origin; only node offsets differ)
    span = max(W, hi.y - lo.y) * 1.15 + 2.0
    out = []
    for i, (k, ob) in enumerate(lod_objs):
        ob.location.x = span * i
        out.append({'node': ob.name, 'lod': k, 'tris': kit.tri_count([ob]), 'offset': [round(ob.location.x, 3), 0, 0],
                    'from': lod_dist[k]})
    imp.location.x = span * len(lod_objs)
    A.meta.update({
        'tree': True, 'kind': kind,
        'lods': out,
        'impostor': {'node': imp.name, 'w': round(W, 3), 'h': round(Hh, 3), 'z0': round(z0, 3), 'x0': round(x0, 3), 'from': lod_dist[3],
                     'offset': [round(imp.location.x, 3), 0, 0], 'billboard': 'cylindrical'},
        'wind': {'attribute': '_WIND', 'three': '_wind', 'scale': 255, 'r': 'bend 0 (trunk base) -> 1 (tips)', 'g': 'flutter phase 0..1', 'b': 'flutter mask (1 = leaf)', 'a': 'spare (1)'},
        'height': round(hi.z, 3), 'crown': [round(W, 3), round(hi.y - lo.y, 3)],
        'doubleSided': bool(double),
    })
    # previews: LOD0 hero (other LODs are out of frame) + the line-up
    ctr = ((lo + hi) / 2)
    rad = max((hi - lo).length / 2, 1.0)
    A.preview = {'shots': [
        {'view': {'target': tuple(ctr), 'dist': rad / math.sin(math.radians(16)) * 1.05, 'az': -30, 'el': 12, 'fov': 32}},
        {'name': 'lods', 'size': 512, 'samples': 12, 'view': {'az': 0, 'el': 4, 'fov': 30,
                                                              'target': ((lo.x + hi.x) / 2 + span * len(lod_objs) / 2, 0.0, (lo.z + hi.z) / 2),
                                                              'dist': (span * len(lod_objs) + W) * 0.5 / math.tan(math.radians(15)) * 1.08}},
    ]}
    return [ob for _, ob in lod_objs] + [imp]


# =========================================================================== fauna (rigid rigs + clips)
def rig(A, name, bones):
    """Armature from [(bone, head, tail, parent or None)]; quaternion pose bones. A.armature = it."""
    arm_d = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_d)
    kit.link(arm, A.coll)
    kit.select_only([arm], arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_d.edit_bones
    for n, h, t, p in bones:
        b = eb.new(n)
        b.head = V(h)
        b.tail = V(t)
        b.roll = 0.0
        if p:
            b.parent = eb[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    A.armature = arm
    A.meta['bones'] = [b[0] for b in bones]
    return arm


def skin(A, mesh, arm, limit=4):
    """After finish (bake): armature modifier + parent; weights must already be on `mesh`."""
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mesh.parent = arm
    kit.normalize_weights(mesh, limit)
    return mesh


def clip(A, arm, name, frames, pose, loop=True, fps=None, **meta):
    """Keyframe a clip: pose(t in 0..1, frame) -> {bone: (euler XYZ radians | Quaternion, loc or None)}
    in each pose bone's local (rest) space. Registers A.clips[name]."""
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    prevq = {}
    for fr in range(frames + 1):
        t = fr / frames
        P = pose(t, fr) or {}
        for pb in arm.pose.bones:
            r, loc = P.get(pb.name, (None, None))
            q = Quaternion() if r is None else (r if isinstance(r, Quaternion) else Euler(r, 'XYZ').to_quaternion())
            pq = prevq.get(pb.name)
            if pq is not None and q.dot(pq) < 0:
                q.negate()
            prevq[pb.name] = q.copy()
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=fr, group=pb.name)
            if loc is not None or pb.parent is None:
                pb.location = V(loc) if loc is not None else V((0, 0, 0))
                pb.keyframe_insert('location', frame=fr, group=pb.name)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = frames
    act.use_cyclic = bool(loop)
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    f = fps or kit.FPS
    A.clips[name] = dict({'loop': bool(loop), 'loco': False, 'frames': frames, 'fps': f, 'duration': round(frames / f, 4)}, **meta)
    return act


# =========================================================================== poles
def wire(A, name, loc):
    """Wire attachment empty `wire_<name>` (glTF node; listed in the manifest anchors)."""
    nm = name if name.startswith('wire_') else 'wire_' + name
    e = bpy.data.objects.new(nm, None)
    e.empty_display_size = 0.3
    kit.link(e, A.coll)
    e.location = loc
    A.anchors[nm] = e
    return e
