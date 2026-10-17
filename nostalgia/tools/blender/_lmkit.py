"""NOSTALGIA — tools/blender/_lmkit.py — shared helpers for the landmark family scripts
(landmarks_centre.py, landmarks_west.py and their `_lm_*.py` parts). Extends kit.py without
editing it (ARCHITECTURE §21). Not an asset module (leading underscore: build_all skips it).

Budget rule of thumb for these sets (the whole pack is <= 8 MB of base64 and this family's share
is ~3 MB for ~45 models): after the packer's quantisation a triangle costs ~30-40 bytes and a
256² WebP atlas ~10-20 KB, so aim for
    small models (statue, gate, shelter, kit temple)   600 - 2 500 tris, atlas 256
    mid-size (stations, cinemas, churches, market)     2 000 - 5 000 tris, atlas 256-512
    heroes (Buddha, Birla Mandir, LB Stadium, Golconda, Cyber Towers)  <= 9 000 tris, atlas 512
and use `finish()` (one baked atlas material + optional unbaked glass / @night lamps).
Never `dice` big landmarks here (that's what makes finish_tiled heavy).

Conventions recap (binding, see blender_pipeline.md): 1 u = 1 world unit, Z up, front = -Y,
origin = ground centre of the worlddata footprint (w x d; for faces e/w the model width = lm.d),
heights already x VS (a storey = 15 u). Night glow: materials named '*@night' that are NOT baked
(`lamp()` below). Variants: top-level objects named `var_<name>` are toggled by models3d
(meta `variants`, see models3d.js "landmark variants").
"""
import math
import bpy
from mathutils import Vector, Matrix
import kit
from kit import box, cylinder, lathe, prism_from_outline, arch_outline

VS = kit.VS
STOREY = kit.FLOOR_H


# =========================================================================== materials
def mats():
    """The common landmark palette (all from kit.LIB keys + overrides). Keys:
    plaster cream white marble granite granite_dk pink_granite sandstone brick red_oxide concrete
    asphalt bronze gold iron steel wood tin tile_red green_paint blue_paint glass glass_dark
    lamp (night glow) water black"""
    m = kit.material
    return {
        'plaster': m('lime_plaster', 'plaster'),
        'cream': m('lime_plaster', 'cream', base='#e9d9b2', streaks=0.25),
        'white': m('whitewash', 'white'),
        'marble': m('whitewash', 'marble', base='#f2efe8', rough=0.45, var=0.04, grain=0.03, grime=0.25, streaks=0.12, scale=0.5),
        'granite': m('granite_grey', 'granite'),
        'granite_dk': m('granite_grey', 'granite_dk', base='#6f6b66'),
        'pink_granite': m('granite_pink', 'pink_granite'),
        'sandstone': m('sandstone', 'sandstone'),
        'brick': m('red_oxide', 'brick', base='#9a4a32', rough=0.85, var=0.12, grain=0.12, scale=1.2),
        'red_oxide': m('red_oxide', 'red_oxide'),
        'concrete': m('whitewash', 'concrete', base='#b7b2a8', rough=0.9, var=0.10, grain=0.08, grime=0.55, streaks=0.4, dirt='#5f594f'),
        'asphalt': m('granite_grey', 'asphalt', base='#3b3a39', specks=0.2, grime=0.2),
        'bronze': m('gold_leaf', 'bronze', base='#5e4a33', metal=0.55, rough=0.5, var=0.1, grain=0.05, grime=0.55, dirt='#2f3b30'),
        'gold': m('gold_leaf', 'gold'),
        'iron': m('iron_black', 'iron'),
        'steel': m('steel', 'steel'),
        'wood': m('wood_raw', 'wood'),
        'tin': m('tin_rusty', 'tin'),
        'tile_red': m('red_oxide', 'tile_red', base='#a8573c', rough=0.8, grain=0.1),
        'green_paint': m('wood_green', 'green_paint'),
        'blue_paint': m('wood_blue', 'blue_paint'),
        'black': m('paint_black', 'black'),
        'glass': m('glass', 'glass'),
        'glass_dark': m('glass', 'glass_dark', base='#3f5f6e', alpha=0.85, rough=0.08, metal=0.3),
        'lamp': lamp('#ffd9a0'),
        'water': m('glass', 'water', base='#3a8a93', alpha=0.8, rough=0.05),
    }


def paint(base, name=None, key='whitewash', **over):
    """A plain painted surface of any colour (whitewash library detail, own name)."""
    return kit.material(key, name or ('paint_' + base.strip('#')), base=base, **over)


def lamp(col='#ffd9a0', name=None):
    """Unbaked emissive material whose name ends in @night (runtime: glows with H.night)."""
    return kit.material('lamp_lens', (name or 'lamp_' + col.strip('#')) + '@night', base=col, emit=col, emit_strength=1.0, bake=False, alpha=1.0)


def sign_panel(name, text, w, h, loc, fg='#1a1a1a', bg='#f2c230', px=256, rot_z=0.0, depth=0.15, frame=None):
    """kit.signboard facing -Y at loc, turned by rot_z (radians) about its own centre."""
    s = kit.signboard(name, text, w, h, (0, 0, 0), depth=depth, fg=fg, bg=bg, px=px, frame_mat=frame)
    s.rotation_euler = (0, 0, rot_z)
    s.location = loc
    kit.apply_transform(s)
    return s


# =========================================================================== geometry helpers
def place(ob, loc=(0, 0, 0), rz=0.0, sc=None):
    if sc is not None:
        ob.scale = sc if hasattr(sc, '__len__') else (sc, sc, sc)
    ob.rotation_euler = (0, 0, rz)
    ob.location = loc
    kit.apply_transform(ob)
    return ob


def copy(ob, loc=(0, 0, 0), rz=0.0, name=None):
    c = ob.copy()
    c.data = ob.data.copy()
    c.name = name or ob.name
    kit.link(c, ob.users_collection[0] if ob.users_collection else None)
    c.matrix_world = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, 'Z') @ ob.matrix_world
    kit.apply_transform(c)
    return c


def mirror_x(objs):
    """objs + mirrored copies across x = 0"""
    out = list(objs)
    for o in objs:
        c = o.copy()
        c.data = o.data.copy()
        kit.link(c, o.users_collection[0] if o.users_collection else None)
        c.matrix_world = Matrix.Scale(-1, 4, Vector((1, 0, 0))) @ o.matrix_world
        kit.apply_transform(c)
        _flip(c)
        out.append(c)
    return out


def _flip(ob):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def rot4(objs):
    """objs + three copies rotated by 90° steps about Z (four-fold symmetric buildings)."""
    out = list(objs)
    for k in (1, 2, 3):
        for o in objs:
            out.append(copy(o, rz=k * math.pi / 2))
    return out


def ring(make, n, r, z=0.0, phase=0.0):
    """n objects from make(i) placed round a circle of radius r, facing outwards (-Y out)."""
    out = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        o = make(i)
        o.rotation_euler = (0, 0, a + math.pi / 2)
        o.location = (r * math.cos(a), r * math.sin(a), z)
        kit.apply_transform(o)
        out.append(o)
    return out


def column(name, r, h, loc, mat, seg=8, cap=None, base_h=0.6):
    """plain column: square base, shaft, simple capital"""
    x, y, z = loc
    parts = [box(name + '_b', (2.5 * r, 2.5 * r, base_h), (x, y, z), mat, base=True),
             cylinder(name + '_s', r, h - 2 * base_h, (x, y, z + base_h), seg=seg, mat=mat),
             box(name + '_c', (2.4 * r, 2.4 * r, base_h), (x, y, z + h - base_h), cap or mat, base=True)]
    return kit.join(parts, name)


def arch_wall(name, w, h, depth, openings, mat, kind='pointed', center=(0, 0, 0), axis='Y'):
    """A wall slab (w x h, thickness depth, front at -Y) with arched openings cut through.
    openings: [(x, width, spring, rise), ...] in wall coordinates (x from the centre, z from the bottom)."""
    cx, cy, cz = center
    wall = box(name, (w, depth, h), (0, 0, 0), mat, base=True)
    cuts = []
    for (x, ow, spring, rise) in openings:
        c = prism_from_outline(name + '_cut', arch_outline(ow, spring, rise, kind, n=6), depth + 2.0, center=(x, 0, -0.01))
        cuts.append(c)
    if cuts:
        kit.boolean(wall, kit.join(cuts, name + '_cuts'))
    if axis == 'X':
        wall.rotation_euler = (0, 0, math.pi / 2)
    wall.location = (cx, cy, cz)
    kit.apply_transform(wall)
    return wall


def blind_arcade(name, w, z0, h, n, fy, depth=0.6, kind='pointed'):
    """cutter for n blind arched recesses along a face at y = fy (boolean DIFFERENCE it)"""
    cs = []
    step = w / n
    for i in range(n):
        x = -w / 2 + step * (i + 0.5)
        cs.append(prism_from_outline('arc', arch_outline(step * 0.66, h * 0.62, h * 0.33, kind, n=5), depth * 2, center=(x, fy, z0)))
    return kit.join(cs, name)


def window_grid(name, w, z0, rows, cols, fy, win=(2.0, 3.2), row_h=STOREY, depth=0.8):
    """cutter for a grid of rectangular window recesses on a face at y = fy"""
    cs = []
    step = w / cols
    for r in range(rows):
        for c in range(cols):
            x = -w / 2 + step * (c + 0.5)
            cs.append(box('win', (win[0], depth * 2, win[1]), (x, fy, z0 + r * row_h + (row_h - win[1]) * 0.55), None, base=True))
    return kit.join(cs, name)


def dome(name, r, h, z, mat, seg=16, loc=(0, 0), kind='onion', n=10, finial=None):
    """onion / hemisphere dome on a short drum at height z; finial material optional"""
    if kind == 'onion':
        prof = kit.onion_profile(r, h, neck=0.9, bulge=1.1, tip=0.08, n=n, base_z=z)
    else:
        prof = [(r * math.cos(a), z + h * math.sin(a)) for a in [math.pi / 2 * i / n for i in range(n)]] + [(0.0, z + h)]
    d = lathe(name, prof, seg=seg, mat=mat, loc=(loc[0], loc[1], 0))
    if finial is not None:
        f = lathe(name + '_fin', [(r * 0.08, z + h - 0.2), (r * 0.12, z + h + r * 0.15), (r * 0.04, z + h + r * 0.45), (0.0, z + h + r * 0.6)], seg=6, mat=finial, loc=(loc[0], loc[1], 0))
        d = kit.join([d, f], name)
    return d


def lamp_post(name, h, M, loc=(0, 0, 0), arms=1, style='heritage'):
    """Tank Bund / park heritage lamp post (black iron, fluted base, lantern heads that glow)."""
    x, y, z = loc
    parts = [lathe(name + '_base', [(0.55, 0), (0.55, 0.9), (0.35, 1.2), (0.28, 2.6), (0.18, 3.0), (0.14, h)], seg=8, mat=M['iron'], loc=(x, y, z))]
    heads = []
    offs = [(0, 0)] if arms == 1 else [(-1.4, 0), (1.4, 0)] if arms == 2 else [(-1.4, 0), (1.4, 0), (0, 0)]
    if arms > 1:
        parts.append(kit.tube(name + '_arm', [(x - 1.4, y, z + h - 0.6), (x - 0.7, y, z + h - 0.1), (x + 0.7, y, z + h - 0.1), (x + 1.4, y, z + h - 0.6)], 0.09, seg=5, mat=M['iron']))
    for (dx, dy) in offs:
        hz = z + h - (0.6 if arms > 1 and dx else 0.0)
        parts.append(cylinder(name + '_cap', 0.55, 0.25, (x + dx, y + dy, hz + 1.25), seg=6, mat=M['iron'], r2=0.1))
        heads.append(cylinder(name + '_glass', 0.38, 1.2, (x + dx, y + dy, hz + 0.05), seg=6, mat=M['lamp'], r2=0.48))
    return kit.join(parts, name), kit.join(heads, name + '_lamps')


def railing(name, length, h, M, loc=(0, 0, 0), rz=0.0, posts=None, mat=None):
    """iron railing along X (posts, two rails, thin balusters as a flat grill strip)"""
    mat = mat or M['iron']
    n = posts or max(2, int(length / 4) + 1)
    parts = []
    for i in range(n):
        x = -length / 2 + length * i / (n - 1)
        parts.append(box(name + '_p', (0.3, 0.3, h), (x, 0, 0), mat, base=True))
    parts.append(box(name + '_t', (length, 0.25, 0.2), (0, 0, h - 0.2), mat, base=True))
    parts.append(box(name + '_m', (length, 0.12, 0.12), (0, 0, h * 0.35), mat, base=True))
    r = kit.join(parts, name)
    return place(r, loc, rz)


def steps(name, w, run, rise, n, loc, mat, rz=0.0):
    s = kit.stairs(name, w, run, rise, n, (0, 0, 0), mat)
    return place(s, loc, rz)


def col_box(name, size, loc):
    """invisible camera-ray proxy (COL_*), base at loc"""
    return box('COL_' + name, size, loc, None, base=True)


# =========================================================================== finishing
def finish(A, objs, size=256, ao_samples=24, ao_strength=0.75, ao_dist=None, variants=None):
    """Weld + bake one atlas (kit.finish_atlas). `variants`: {name: [objs]} kept as separate
    top-level objects `var_<name>` (sharing the same atlas); everything else is joined into
    `<id>_body` (one draw call, plus glass / @night lamp materials)."""
    body = [o for o in objs if o is not None]
    groups = []
    if body:
        groups.append(kit.join(body, A.id + '_body'))
    for name, vo in (variants or {}).items():
        vo = [o for o in vo if o is not None]
        if vo:
            groups.append(kit.join(vo, 'var_' + name))
    for g in groups:
        kit.apply_modifiers(g)
        kit.smooth(g, 35)
    kit.finish_atlas(A, groups, size=size, ao_samples=ao_samples, ao_strength=ao_strength, ao_dist=ao_dist)
    for g in groups:
        # the atlas join can rename: keep the variant node names exact
        pass
    return groups


def shots(A, az=-35, el=14, fov=32, extra=None, samples=14, size=320):
    """standard preview: 3/4 front view (+ extra shot dicts)"""
    s = [{'view': {'az': az, 'el': el, 'fov': fov, 'pad': 1.05}, 'samples': samples, 'size': size}]
    for e in extra or []:
        e = dict(e)
        e.setdefault('samples', samples)
        e.setdefault('size', 256)
        s.append(e)
    A.preview = {'shots': s}
