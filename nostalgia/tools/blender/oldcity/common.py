"""NOSTALGIA — tools/blender/oldcity/common.py — shared helpers for the Old City landmarks
(landmarks_oldcity.py). Extends tools/blender/kit.py without editing it (ARCHITECTURE §21).

Conventions (binding, see ARCHITECTURE §21 and design/agent_reports/blender_pipeline.md):
  * 1 u = 1 world unit, Z up, front = -Y, origin on the ground at the footprint centre.
  * The model is built at the worlddata footprint: width along X = lm.w (faces n/s) or lm.d (faces
    e/w); depth along Y = the other one. Heights: lm.h * VS (VS = 1.5); a storey is ~15 u; a
    metre is ~2.4 u (Charminar's 56 m minarets = 135 u).
  * Pack budget: the whole pack is 8 MB shared by every artist. Keep vertex counts lean (the GLB
    size is mostly vertices: ~40 bytes each): hero <= ~1.1 MB, others <= ~150 KB.
"""
import math
from mathutils import Matrix, Vector
import kit
from kit import box, material, prism_from_outline, arch_outline

VS = kit.VS
M_PER_U = 1 / 2.4          # metres per world unit (approx., from Charminar 56 m = 135 u)


def mats(**extra):
    """The Old City palette (library materials with era-correct tints). Add per-asset ones via extra
    (name -> (lib key, overrides))."""
    M = {
        'plaster': material('lime_plaster', 'plaster', base='#e4d3ad', var=0.07, grain=0.04, streaks=0.4),
        'plaster_hi': material('lime_plaster', 'plaster_hi', base='#efe3c6', var=0.05, grain=0.035, streaks=0.25),
        'plaster_shadow': material('lime_plaster_shadow', 'plaster_shadow'),
        'whitewash': material('whitewash', 'whitewash'),
        'granite': material('granite_grey', 'granite'),
        'granite_pink': material('granite_pink', 'granite_pink'),
        'sandstone': material('sandstone', 'sandstone'),
        'red_oxide': material('red_oxide', 'red_oxide'),
        'iron': material('iron_black', 'iron'),
        'gold': material('gold_leaf', 'gold', base='#b89a5a', metal=0.3, rough=0.55),
        'wood_green': material('wood_green', 'wood_green'),
        'wood_blue': material('wood_blue', 'wood_blue'),
        'wood': material('wood_raw', 'wood'),
        'tin': material('tin_rusty', 'tin'),
    }
    for k, (lib, over) in extra.items():
        M[k] = material(lib, k, **over)
    return M


def rot_z(objs, ang):
    """rotate objects about the world Z axis (transform applied)"""
    R = Matrix.Rotation(ang, 4, 'Z')
    for o in objs:
        o.matrix_world = R @ o.matrix_world
        kit.apply_transform(o)
    return objs


def copy_obj(o):
    c = o.copy()
    c.data = o.data.copy()
    kit.link(c, o.users_collection[0] if o.users_collection else None)
    return c


def rot_copies(objs, n=4, step=None):
    """objs + (n-1) copies rotated by `step` (default 2*pi/n) about Z (four-fold facades)."""
    step = step if step is not None else 2 * math.pi / n
    out = list(objs)
    for k in range(1, n):
        for o in objs:
            c = copy_obj(o)
            c.matrix_world = Matrix.Rotation(k * step, 4, 'Z') @ o.matrix_world
            kit.apply_transform(c)
            out.append(c)
    return out


def mirror_x(objs):
    """objs + mirrored copies across the YZ plane (x -> -x), normals fixed."""
    out = list(objs)
    for o in objs:
        c = copy_obj(o)
        c.matrix_world = Matrix.Scale(-1, 4, (1, 0, 0)) @ o.matrix_world
        kit.apply_transform(c)
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(c.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(c.data)
        bm.free()
        out.append(c)
    return out


def arcade_cutter(n, span, z0, h, depth, fy, kind='pointed', wfrac=0.62, spring_frac=0.62, axis='Y', x0=0.0):
    """n arched recess / opening cutters in a row centred on x0 along X (axis 'Y': a wall facing -Y at
    y = fy), joined into one cutter object. Each opening: width step*wfrac, jambs h*spring_frac."""
    cs = []
    step = span / n
    w = step * wfrac
    for i in range(n):
        x = x0 - span / 2 + step * (i + 0.5)
        o = prism_from_outline('arc_cut', arch_outline(w, h * spring_frac, h * (1 - spring_frac), kind, n=6), depth * 2, center=(x, fy, z0))
        cs.append(o)
    c = kit.join(cs, 'arcade_cut')
    if axis == 'X':
        rot_z([c], math.pi / 2)
    return c


def decal(name, outline, mat, y=0.0):
    """a single flat n-gon in the XZ plane at y, facing -Y (dark niche / inlay panels: 1 face, no
    sides, so it costs len(outline) vertices). outline: [(x, z), ...] convex, counter-clockwise
    as seen from the front."""
    import bmesh
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for (x, z) in outline]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


def col_box(name, size, loc, base=True):
    """an invisible camera-ray proxy box (COL_*)"""
    return box('COL_' + name, size, loc, None, base=base)


def col_join(objs, name):
    return kit.join(objs, 'COL_' + name)


def uv_by_normal(ob, tile):
    """Re-project the tiled UVs per face CORNER using the corner's (split) normal instead of the
    face normal (kit.uv_box): corners that share a vertex and a normal now share a UV too, so the
    glTF exporter no longer splits vertices at every face of curved / faceted surfaces (halves the
    vertex count of minarets and domes). Painted sign faces keep their image UVs."""
    me = ob.data
    uvl = me.uv_layers.get('UVMap')
    if uvl is None:
        return ob
    cn = me.corner_normals
    co = [v.co for v in me.vertices]
    skip = set(i for i, m in enumerate(me.materials) if m is not None and 'sign_' in m.name)
    for p in me.polygons:
        if p.material_index in skip:
            continue
        for li in p.loop_indices:
            n = cn[li].vector
            v = co[me.loops[li].vertex_index]
            ax = max(range(3), key=lambda i: abs(n[i]))
            if ax == 2:
                u, w = v.x, v.y
            elif ax == 0:
                u, w = (v.y if n.x > 0 else -v.y), v.z
            else:
                u, w = (-v.x if n.y > 0 else v.x), v.z
            uvl.data[li].uv = (u / tile, w / tile)
    return ob


def finish(A, objs, tile=10.0, tex=512, dice_edge=0, ao_samples=32, ao_dist=8.0, ground_dirt=5.0, ao_strength=0.8, smooth_angle=46.0):
    """join everything into one mesh, finish with tiled textures + vertex-colour AO (kit.finish_tiled),
    then re-project UVs per corner normal (uv_by_normal) so the export stays lean. dice_edge (u) only
    when big flat walls need more AO / dirt samples (it adds vertices)."""
    objs = [o for o in objs if o is not None]
    for o in objs:
        kit.apply_modifiers(o)
    body = kit.join(objs, A.id + '_body')
    kit.smooth(body, smooth_angle)
    out = kit.finish_tiled(A, [body], tile=tile, tex=tex, ao_samples=ao_samples, ao_strength=ao_strength, ao_dist=ao_dist, dice_edge=dice_edge, ground_dirt=ground_dirt)
    uv_by_normal(body, tile)
    # kit.signboard creates 'SignUV' first; once finish_tiled drops it no UV layer is active and the
    # exporter writes texCoord -1 for every texture: make 'UVMap' the active / render layer again
    uvl = body.data.uv_layers.get('UVMap')
    if uvl is not None:
        body.data.uv_layers.active = uvl
        uvl.active_render = True
    return out


def shots(front_az=-35, el=14, fov=32, extra=()):
    """standard previews: a 3/4 front view, a 3/4 back view and optional extra named shots"""
    s = [{'view': {'az': front_az, 'el': el, 'fov': fov, 'pad': 1.0}, 'samples': 20},
         {'name': 'back', 'size': 320, 'samples': 14, 'view': {'az': 180 + 35, 'el': el, 'fov': fov, 'pad': 1.0}}]
    return {'shots': s + list(extra)}
