"""NOSTALGIA — tools/blender/kit.py (pipeline technical artist) — ARCHITECTURE §21.

The shared Blender kit every asset script imports. Blender runs headless as the Python module
bpy 5.2 LTS (`/home/user/.venvs/blender/bin/python`); assets are *authored as code* so they are
reproducible and reviewable in git. One script per asset family (characters.py, vehicles.py,
landmarks_*.py, props.py) registers builders with @kit.asset(...); tools/blender/build_all.py runs
them (one fresh Blender process per asset), and tools/pack_assets3d.cjs packs the results into
src/assets3d_pack.js for the game (src/models3d.js).

Conventions (binding, mirrored in ARCHITECTURE §21):
  * Units: 1 Blender unit = 1 game world unit (u). Z up in Blender; the glTF exporter converts to
    three.js Y-up. Heights already include the 3D vertical scale VS = 1.5 (a storey is 15 u,
    kids ~7 u tall, adults ~9 u).
  * Front: every model faces -Y in Blender (Blender's "Front" view). After export that is +Z in the
    GLB; the runtime turns it to a game facing angle a with rotation.y = PI/2 - a, so a landmark
    with face 's' needs no rotation (FR = {s: 0, n: PI, e: PI/2, w: -PI/2}, like view3d_landmarks).
  * Origin: on the ground (z = 0), centred on the footprint the 2D map uses (landmarks: worlddata
    w x d; for face e/w the front runs along the world y axis, so model width = lm.d).
  * Names: asset ids are snake_case (kid_chinnu, hero_cycle, charminar_proto); the file is
    assets3d/<id>.glb + assets3d/<id>.json (manifest) + assets3d/previews/<id>.png.
    Bones: root hips spine chest neck head shoulder_L upperarm_L forearm_L hand_L thigh_L shin_L
    foot_L toe_L (+ _R). Anchors are empties named anchor_<name> (seat_driver, seat_pillion,
    handlebar, grip_L/R, pedal_L/R, headlight, wheel_front/rear, sole_heel_L, sole_toe_L, eye...).
    Collision proxies (camera ray only, never drawn) are meshes named COL_<anything>.
    Materials: one baked atlas material per asset (M_<id>) + optional M_<id>_glass (transparent) and
    materials whose name ends with '@night' (emissive scaled by the night factor at runtime).
  * Budgets (tris): hero landmark 60k, landmark 20k, vehicle 6k, character 4k, prop 1.5k; textures
    <= 1024^2 (hero landmark), 512^2 otherwise, WebP in the GLB; whole pack <= ~8 MB.
  * Clips (characters): idle walk run (+ stroll ride_cycle ride_scooty sit talk wave fall getup
    pick). Locomotion clips are in place (root fixed, the stance foot moves backwards at exactly
    stride / cycle), phase 0 = left heel strike, and carry {stride, nominal, duty, gait} in the
    manifest so the runtime drives the phase from real distance travelled (no foot sliding).
"""
import bpy
import bmesh
import math
import os
import sys
import json
import time
import hashlib
import tempfile
import struct
from mathutils import Vector, Matrix, Quaternion, Euler

try:
    import numpy as np
except Exception:  # numpy ships with bpy; keep a clear message if not
    np = None

# =========================================================================== paths, constants
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ASSETS_DIR = os.path.join(ROOT, 'assets3d')
PREVIEW_DIR = os.path.join(ASSETS_DIR, 'previews')
TMP_DIR = os.environ.get('NOSTALGIA_BLENDER_TMP') or os.path.join(tempfile.gettempdir(), 'nostalgia_blender')

VS = 1.5                 # 3D vertical scale of static world heights (N.view3d.VS)
FLOOR_H = 10 * VS        # one storey in 3D units
KID_H = 7.0              # kid height (u)
ADULT_H = 9.0            # adult height (u)
FPS = 30                 # authoring frame rate (glTF animations are sampled per frame)
KIT_VERSION = 1

BUDGET_TRIS = {'hero_landmark': 60000, 'landmark': 20000, 'vehicle': 6000, 'character': 4000, 'prop': 1500}
BUDGET_TEX = {'hero_landmark': 1024, 'landmark': 512, 'vehicle': 512, 'character': 512, 'prop': 256}
FAMILY_BUDGET = {'character': 'character', 'vehicle': 'vehicle', 'landmark': 'landmark', 'hero_landmark': 'hero_landmark', 'prop': 'prop'}

BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
         'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L', 'toe_L',
         'shoulder_R', 'upperarm_R', 'forearm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R', 'toe_R']
CLIPS = ['idle', 'walk', 'run', 'stroll', 'ride_cycle', 'ride_scooty', 'sit', 'talk', 'wave', 'fall', 'getup', 'pick']
# tint regions of characters (vertex attribute _REGION = index); the runtime maps N.people look fields
REGIONS = ['none', 'skin', 'hair', 'shirt', 'stripes', 'pants', 'shoes', 'accent']


def log(*a):
    print('[kit]', *a, flush=True)


def ensure_dirs():
    for d in (ASSETS_DIR, PREVIEW_DIR, TMP_DIR):
        os.makedirs(d, exist_ok=True)


# =========================================================================== registry
REGISTRY = {}


def asset(id, family, **meta):
    """Decorator: register a builder fn(A) for asset `id` (family: character | vehicle | landmark |
    hero_landmark | prop). meta goes into the manifest (e.g. draw='charminar', face='n',
    footprint=(64, 64), vehicleTypes=[...], role='player')."""
    def deco(fn):
        REGISTRY[id] = {'id': id, 'family': family, 'build': fn, 'meta': meta, 'module': fn.__module__}
        return fn
    return deco


# =========================================================================== colours
def hex_rgb(h):
    """'#rrggbb' -> sRGB floats (0..1)"""
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def s2l(c):
    """sRGB channel -> linear"""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def l2s(c):
    c = max(0.0, c)
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def lin(h, a=1.0):
    """'#rrggbb' -> linear RGBA tuple (what Blender colour sockets expect)"""
    r, g, b = hex_rgb(h)
    return (s2l(r), s2l(g), s2l(b), a)


def shade(h, f):
    r, g, b = hex_rgb(h)
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(c * 255 * f)))) for c in (r, g, b))


# =========================================================================== scene
def reset():
    """Fresh empty scene with the pipeline's unit/render conventions."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'NONE'
    sc.unit_settings.scale_length = 1.0
    sc.render.fps = FPS
    sc.frame_start = 0
    sc.frame_end = 32
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = max(1, min(4, os.cpu_count() or 2))
    world = bpy.data.worlds.new('World')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
        bg.inputs['Strength'].default_value = 1.0
    world.light_settings.distance = 6.0  # AO bake distance (u)
    return sc


def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


CUR = {'coll': None}


def link(obj, coll=None):
    (coll or CUR['coll'] or bpy.context.scene.collection).objects.link(obj)
    return obj


def select_only(objs, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def mesh_objects(objs):
    return [o for o in objs if o.type == 'MESH']


# =========================================================================== material library
# PBR palette. Each entry: base colour (sRGB hex), roughness, metallic and the procedural detail
# that is baked into the atlas / tile textures: var (large-scale tone variation), grain (fine
# noise), grime (dirt in crevices via AO), ground (dirt rising from the ground, u), streaks (rain
# streaks on plaster), specks (granite), chips (edge wear revealing `under`), rust (tin), weave
# (cloth), region (character tint region, see REGIONS).
LIB = {
    # building stuff
    'lime_plaster':  dict(base='#e6d3aa', rough=0.92, var=0.08, grain=0.05, grime=0.55, dirt='#8b7a5c', ground=6.0, streaks=0.35, scale=0.18),
    'lime_plaster_shadow': dict(base='#d9c49a', rough=0.92, var=0.08, grain=0.05, grime=0.6, dirt='#7e6d50', ground=6.0, streaks=0.3, scale=0.18),
    'whitewash':     dict(base='#f0ece2', rough=0.95, var=0.05, grain=0.06, grime=0.45, dirt='#9a9284', ground=4.0, streaks=0.25, scale=0.25),
    'granite_grey':  dict(base='#8e8983', rough=0.78, var=0.10, grain=0.10, grime=0.35, dirt='#4e4a46', specks=0.6, scale=0.6),
    'granite_pink':  dict(base='#a88a7c', rough=0.78, var=0.10, grain=0.10, grime=0.35, dirt='#5a4840', specks=0.6, scale=0.6),
    'sandstone':     dict(base='#c39a6b', rough=0.85, var=0.12, grain=0.08, grime=0.4, dirt='#6e5236', ground=3.0, scale=0.3),
    'red_oxide':     dict(base='#8c3b2a', rough=0.55, var=0.08, grain=0.05, grime=0.3, dirt='#4a2418', scale=0.4),
    'tin_rusty':     dict(base='#8d9297', rough=0.55, metal=0.35, var=0.08, grain=0.06, rust=0.55, rust_col='#7c3f1d', grime=0.3, dirt='#3a3430', scale=0.5),
    'wood_blue':     dict(base='#2f5f8c', rough=0.7, var=0.08, grain=0.12, chips=0.45, under='#7a5c3c', grime=0.35, dirt='#2a2620', scale=1.2),
    'wood_green':    dict(base='#2f6b48', rough=0.7, var=0.08, grain=0.12, chips=0.45, under='#7a5c3c', grime=0.35, dirt='#2a2620', scale=1.2),
    'wood_raw':      dict(base='#7a5a3a', rough=0.8, var=0.12, grain=0.18, grime=0.35, dirt='#3a2a1a', scale=1.5),
    'iron_black':    dict(base='#26262a', rough=0.5, metal=0.4, var=0.05, grain=0.05, rust=0.2, rust_col='#5a3420', scale=1.0),
    'gold_leaf':     dict(base='#c9a23a', rough=0.35, metal=0.7, var=0.08, grain=0.04, grime=0.3, dirt='#5a4a20', scale=1.0),
    'clock_face':    dict(base='#f4efe0', rough=0.6, var=0.02, grain=0.02, grime=0.2, dirt='#8a8270', scale=1.0),
    'glass':         dict(base='#8fb0bc', rough=0.05, alpha=0.35, bake=False),
    # vehicles
    'paint_black':   dict(base='#141418', rough=0.32, var=0.03, grain=0.02, chips=0.25, under='#6a6d72', grime=0.35, dirt='#3a342c', scale=2.0),
    'chrome':        dict(base='#c9ccd0', rough=0.2, metal=0.9, var=0.04, grain=0.03, rust=0.08, rust_col='#7a5a40', grime=0.25, dirt='#4a4440', scale=2.0),
    'steel':         dict(base='#9a9da2', rough=0.4, metal=0.8, var=0.04, grain=0.04, grime=0.3, dirt='#3a3632', scale=2.0),
    'rubber':        dict(base='#1c1c1e', rough=0.88, var=0.04, grain=0.08, grime=0.15, dirt='#5a5248', scale=3.0),
    'leather_brown': dict(base='#4a2c1c', rough=0.55, var=0.08, grain=0.1, grime=0.3, dirt='#20140c', scale=3.0),
    'reflector_red': dict(base='#b3201a', rough=0.25, var=0.02, grain=0.02, scale=2.0),
    'lamp_lens':     dict(base='#e8e2c8', rough=0.15, var=0.02, grain=0.01, scale=2.0),
    # people (regions for runtime tinting)
    'skin':          dict(base='#b97a4f', rough=0.6, var=0.05, grain=0.04, grime=0.25, dirt='#6a3a22', scale=3.0, region=1, blush=0.12),
    'hair':          dict(base='#1a1412', rough=0.55, var=0.06, grain=0.25, grime=0.2, dirt='#000000', scale=6.0, region=2, strands=1.0),
    'cloth':         dict(base='#3d6fb0', rough=0.9, var=0.07, grain=0.08, weave=0.06, grime=0.5, dirt='#2a2620', scale=4.0, region=3),
    'cloth_stripe':  dict(base='#f2f0ea', rough=0.9, var=0.05, grain=0.08, weave=0.06, grime=0.5, dirt='#4a4640', scale=4.0, region=4),
    'cloth_pants':   dict(base='#8a7a55', rough=0.9, var=0.07, grain=0.08, weave=0.08, grime=0.55, dirt='#3a3020', scale=4.0, region=5),
    'chappal':       dict(base='#2f62b5', rough=0.7, var=0.05, grain=0.05, grime=0.4, dirt='#2a2620', scale=4.0, region=6),
    'chappal_sole':  dict(base='#ece8de', rough=0.8, var=0.05, grain=0.05, grime=0.6, dirt='#5a5248', scale=4.0, region=0),
    'eye_white':     dict(base='#ece6da', rough=0.3, var=0.0, grain=0.0, scale=1.0),
    'eye_dark':      dict(base='#16100c', rough=0.2, var=0.0, grain=0.0, scale=1.0),
    'lips':          dict(base='#8a4a3a', rough=0.5, var=0.02, grain=0.02, scale=3.0, region=0),
    'walkman':       dict(base='#f2c230', rough=0.35, var=0.03, grain=0.02, grime=0.35, dirt='#5a4a1a', scale=4.0, region=7),
    'plastic_black': dict(base='#202022', rough=0.45, var=0.03, grain=0.03, grime=0.3, dirt='#4a4440', scale=4.0),
    'foam_orange':   dict(base='#e0702a', rough=0.95, var=0.05, grain=0.15, grime=0.3, dirt='#5a2a10', scale=6.0),
    'shoelace':      dict(base='#e9e4d6', rough=0.9, var=0.05, grain=0.1, scale=6.0),
}


def _sock(node, name, typ=None, out=False):
    socks = node.outputs if out else node.inputs
    for s in socks:
        if s.name == name and (typ is None or s.type == typ):
            return s
    raise KeyError('%s has no %s socket %s (%s)' % (node.bl_idname, 'output' if out else 'input', name, typ))


class NodeBuilder:
    """tiny helper around a material node tree"""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.N = self.nt.nodes
        self.L = self.nt.links
        self.x = -1600

    def node(self, typ, name=None, **props):
        n = self.N.new(typ)
        n.location = (self.x, 0)
        self.x += 160
        if name:
            n.name = name
            n.label = name
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.L.new(a, b)

    def value(self, v, name=None):
        n = self.node('ShaderNodeValue', name)
        n.outputs[0].default_value = v
        return n.outputs[0]

    def rgb(self, col, name=None):
        n = self.node('ShaderNodeRGB', name)
        n.outputs[0].default_value = col if len(col) == 4 else tuple(col) + (1,)
        return n.outputs[0]

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op)
        n.use_clamp = bool(clamp)
        self._in(n.inputs[0], a)
        if b is not None:
            self._in(n.inputs[1], b)
        if c is not None:
            self._in(n.inputs[2], c)
        return n.outputs[0]

    def _in(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.link(v, sock)
        else:
            sock.default_value = v

    def mix(self, fac, a, b, blend='MIX', clamp=True):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        n.clamp_result = clamp
        self._in(n.inputs[0], fac)
        self._in(_sock(n, 'A', 'RGBA'), a)
        self._in(_sock(n, 'B', 'RGBA'), b)
        return _sock(n, 'Result', 'RGBA', out=True)

    def noise(self, vec, w, scale, detail=4.0, rough=0.55, distortion=0.0, ntype='FBM'):
        n = self.node('ShaderNodeTexNoise', noise_dimensions='4D')
        try:
            n.noise_type = ntype
        except Exception:
            pass
        self._in(n.inputs['Vector'], vec)
        self._in(n.inputs['W'], w)
        self._in(n.inputs['Scale'], scale)
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = distortion
        return n.outputs['Factor']

    def ramp(self, fac, a, b):
        """map fac in [a, b] -> [0, 1] (clamped)"""
        n = self.node('ShaderNodeMapRange')
        n.clamp = True
        self._in(n.inputs['Value'], fac)
        n.inputs['From Min'].default_value = a
        n.inputs['From Max'].default_value = b
        n.inputs['To Min'].default_value = 0.0
        n.inputs['To Max'].default_value = 1.0
        return n.outputs['Result']

    def vmul(self, vec, s):
        n = self.node('ShaderNodeVectorMath', operation='SCALE')
        self._in(n.inputs[0], vec)
        n.inputs['Scale'].default_value = s
        return n.outputs['Vector']


MATS = {}


def material(key, name=None, **over):
    """A procedural PBR material from LIB[key] (+ overrides). Cached per name within a scene.
    Named nodes: NOS_ALBEDO (linear colour), NOS_ROUGH, NOS_METAL (values), NOS_COORD (vector
    reroute every noise reads), NOS_W (4D noise W), NOS_AOF (grime factor; 0 in tile bakes)."""
    spec = dict(LIB.get(key, {}))
    spec.update(over)
    name = name or key
    if name in MATS and MATS[name].name in bpy.data.materials:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m['nos'] = json.dumps(spec)
    m['nos_key'] = key
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    B = NodeBuilder(m)
    tc = B.node('ShaderNodeTexCoord')
    coord = B.node('NodeReroute', 'NOS_COORD')
    B.link(tc.outputs['Object'], coord.inputs[0])
    wv = B.value(float(spec.get('seed', (int(hashlib.md5(name.encode()).hexdigest()[:6], 16) % 997) * 0.37)), 'NOS_W')
    aof = B.value(1.0, 'NOS_AOF')
    vec = coord.outputs[0]
    sc = float(spec.get('scale', 1.0))
    base = B.rgb(lin(spec.get('base', '#808080')), 'NOS_BASE')
    col = base
    # large-scale tone variation + fine grain
    if spec.get('var'):
        n1 = B.noise(vec, wv, sc * 0.35, detail=3.0, rough=0.5)
        f = B.math('MULTIPLY_ADD', B.math('SUBTRACT', n1, 0.5), spec['var'] * 2.0, 1.0)
        tint = B.node('ShaderNodeCombineColor')
        B.link(f, tint.inputs[0]); B.link(f, tint.inputs[1]); B.link(f, tint.inputs[2])
        col = B.mix(1.0, col, tint.outputs[0], 'MULTIPLY')
    if spec.get('grain'):
        n2 = B.noise(vec, wv, sc * 6.0, detail=2.0, rough=0.6)
        f = B.math('MULTIPLY_ADD', B.math('SUBTRACT', n2, 0.5), spec['grain'] * 2.0, 1.0)
        tint = B.node('ShaderNodeCombineColor')
        B.link(f, tint.inputs[0]); B.link(f, tint.inputs[1]); B.link(f, tint.inputs[2])
        col = B.mix(1.0, col, tint.outputs[0], 'MULTIPLY')
    if spec.get('weave'):  # cloth: fine cross-hatched threads
        sep = B.node('ShaderNodeSeparateXYZ')
        B.link(vec, sep.inputs[0])
        s1 = B.math('SINE', B.math('MULTIPLY', B.math('ADD', sep.outputs[0], sep.outputs[2]), 55.0))
        s2 = B.math('SINE', B.math('MULTIPLY', B.math('SUBTRACT', sep.outputs[1], sep.outputs[2]), 55.0))
        f = B.math('MULTIPLY_ADD', B.math('MULTIPLY', s1, s2), spec['weave'], 1.0)
        tint = B.node('ShaderNodeCombineColor')
        B.link(f, tint.inputs[0]); B.link(f, tint.inputs[1]); B.link(f, tint.inputs[2])
        col = B.mix(1.0, col, tint.outputs[0], 'MULTIPLY')
    if spec.get('strands'):  # hair: streaky along z
        sep = B.node('ShaderNodeSeparateXYZ')
        B.link(vec, sep.inputs[0])
        cmb = B.node('ShaderNodeCombineXYZ')
        B.link(B.math('MULTIPLY', sep.outputs[0], 9.0), cmb.inputs[0])
        B.link(B.math('MULTIPLY', sep.outputs[1], 9.0), cmb.inputs[1])
        B.link(B.math('MULTIPLY', sep.outputs[2], 0.8), cmb.inputs[2])
        n3 = B.noise(cmb.outputs[0], wv, sc, detail=2.0)
        hi = B.rgb(lin(shade(spec['base'], 2.3)))
        col = B.mix(B.math('MULTIPLY', B.ramp(n3, 0.55, 0.8), 0.6), col, hi)
    if spec.get('blush'):  # skin: warm uneven tone
        n4 = B.noise(vec, wv, sc * 0.8, detail=2.0)
        warm = B.rgb(lin(shade('#c0603c', 1.0)))
        col = B.mix(B.math('MULTIPLY', B.ramp(n4, 0.45, 0.75), spec['blush']), col, warm)
    if spec.get('specks'):  # granite: dark and light specks
        n5 = B.noise(vec, B.math('ADD', wv, 3.1), sc * 14.0, detail=1.0)
        dark = B.rgb(lin(shade(spec['base'], 0.45)))
        light = B.rgb(lin(shade(spec['base'], 1.35)))
        col = B.mix(B.math('MULTIPLY', B.ramp(n5, 0.62, 0.7), spec['specks']), col, dark)
        n6 = B.noise(vec, B.math('ADD', wv, 7.7), sc * 11.0, detail=1.0)
        col = B.mix(B.math('MULTIPLY', B.ramp(n6, 0.66, 0.74), spec['specks']), col, light)
    if spec.get('streaks'):  # rain streaks: noise stretched along z
        sep = B.node('ShaderNodeSeparateXYZ')
        B.link(vec, sep.inputs[0])
        cmb = B.node('ShaderNodeCombineXYZ')
        B.link(B.math('MULTIPLY', sep.outputs[0], 1.0), cmb.inputs[0])
        B.link(B.math('MULTIPLY', sep.outputs[1], 1.0), cmb.inputs[1])
        B.link(B.math('MULTIPLY', sep.outputs[2], 0.06), cmb.inputs[2])
        n7 = B.noise(cmb.outputs[0], wv, sc * 2.5, detail=3.0)
        dirt = B.rgb(lin(spec.get('dirt', '#606060')))
        col = B.mix(B.math('MULTIPLY', B.ramp(n7, 0.5, 0.75), spec['streaks']), col, dirt)
    if spec.get('rust'):
        n8 = B.noise(vec, B.math('ADD', wv, 1.7), sc * 1.6, detail=5.0, rough=0.65)
        rust = B.rgb(lin(spec.get('rust_col', '#7a3e1e')))
        rf = B.math('MULTIPLY', B.ramp(n8, 0.52, 0.62), spec['rust'])
        col = B.mix(rf, col, rust)
    else:
        rf = None
    if spec.get('chips'):  # edge wear: bevel-normal difference, broken up by noise
        geo = B.node('ShaderNodeNewGeometry')
        bev = B.node('ShaderNodeBevel')
        bev.inputs['Radius'].default_value = spec.get('chip_r', 0.12)
        dot = B.node('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        B.link(geo.outputs['Normal'], dot.inputs[0]); B.link(bev.outputs['Normal'], dot.inputs[1])
        edge = B.ramp(B.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.02, 0.12)
        n9 = B.noise(vec, B.math('ADD', wv, 5.3), sc * 3.0, detail=4.0)
        cf = B.math('MULTIPLY', B.math('MULTIPLY', edge, B.ramp(n9, 0.4, 0.6)), spec['chips'])
        cf = B.math('MULTIPLY', cf, aof)
        col = B.mix(cf, col, B.rgb(lin(spec.get('under', '#808080'))))
    if spec.get('grime'):  # dirt in crevices (ray-traced AO, baked)
        ao = B.node('ShaderNodeAmbientOcclusion')
        ao.samples = 8
        ao.inputs['Distance'].default_value = spec.get('grime_d', 1.5)
        gf = B.math('MULTIPLY', B.math('POWER', B.math('SUBTRACT', 1.0, ao.outputs['AO']), 1.5), spec['grime'])
        gf = B.math('MULTIPLY', gf, aof)
        col = B.mix(gf, col, B.rgb(lin(spec.get('dirt', '#404040'))))
    if spec.get('ground'):  # dirt rising from the ground (object z)
        sep = B.node('ShaderNodeSeparateXYZ')
        geo2 = B.node('ShaderNodeNewGeometry')
        B.link(geo2.outputs['Position'], sep.inputs[0])
        n10 = B.noise(vec, B.math('ADD', wv, 9.1), sc * 1.5, detail=3.0)
        h = B.math('MULTIPLY_ADD', n10, spec['ground'] * 0.6, spec['ground'] * 0.7)
        gfac = B.math('SUBTRACT', 1.0, B.math('DIVIDE', sep.outputs[2], h), clamp=True)
        gfac = B.math('MULTIPLY', B.math('MULTIPLY', gfac, gfac), 0.55)
        gfac = B.math('MULTIPLY', gfac, aof)
        col = B.mix(gfac, col, B.rgb(lin(spec.get('dirt', '#605040'))))
    alb = B.node('NodeReroute', 'NOS_ALBEDO')
    B.link(col, alb.inputs[0])
    rough = B.value(float(spec.get('rough', 0.8)), 'NOS_ROUGH')
    if rf is not None:
        rough = B.math('ADD', rough, B.math('MULTIPLY', rf, 0.3))
    metal = B.value(float(spec.get('metal', 0.0)), 'NOS_METAL')
    bsdf = B.node('ShaderNodeBsdfPrincipled', 'NOS_BSDF')
    B.link(alb.outputs[0], bsdf.inputs['Base Color'])
    B.link(rough, bsdf.inputs['Roughness'])
    B.link(metal, bsdf.inputs['Metallic'])
    if spec.get('alpha') is not None and spec['alpha'] < 0.999:
        bsdf.inputs['Alpha'].default_value = spec['alpha']
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    if spec.get('emit'):
        bsdf.inputs['Emission Color'].default_value = lin(spec['emit'])
        bsdf.inputs['Emission Strength'].default_value = spec.get('emit_strength', 1.0)
    out = B.node('ShaderNodeOutputMaterial', 'NOS_OUT')
    B.link(bsdf.outputs[0], out.inputs['Surface'])
    m.diffuse_color = lin(spec.get('base', '#808080'))
    m['nos_region'] = int(spec.get('region', 0))
    m['nos_bake'] = bool(spec.get('bake', True))
    MATS[name] = m
    return m


def assign(obj, mat):
    """Replace all material slots of obj with mat."""
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


# =========================================================================== mesh construction
def obj_from_bm(bm, name, mat=None, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    if mat is not None:
        me.materials.append(mat)
    return ob


def box(name, size, loc=(0, 0, 0), mat=None, bevel=0.0, segments=2, base=False):
    """Axis box of size (sx, sy, sz) centred at loc (base=True: loc is the bottom centre)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    off = Vector(loc) + (Vector((0, 0, size[2] / 2)) if base else Vector())
    bmesh.ops.translate(bm, vec=off, verts=bm.verts)
    ob = obj_from_bm(bm, name, mat)
    if bevel > 0:
        bevel_mod(ob, bevel, segments)
    return ob


def cylinder(name, r, depth, loc=(0, 0, 0), seg=16, mat=None, r2=None, axis='Z', cap=True, base=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=depth)
    if base:
        bmesh.ops.translate(bm, vec=Vector((0, 0, depth / 2)), verts=bm.verts)
    if axis == 'X':
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=bm.verts)
    elif axis == 'Y':
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return obj_from_bm(bm, name, mat)


def tube(name, pts, r, seg=8, mat=None, cap=True):
    """A round tube along a polyline of 3D points (frames, rails, handlebars)."""
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        a = d.cross(up).normalized()
        b = d.cross(a).normalized()
        ring = []
        for k in range(seg):
            t = 2 * math.pi * k / seg
            ring.append(bm.verts.new(p + (a * math.cos(t) + b * math.sin(t)) * r))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(bm, name, mat)


def lathe(name, profile, seg=24, mat=None, loc=(0, 0, 0), close_top=True, close_bottom=True):
    """Revolve a profile [(radius, z), ...] (bottom to top) around Z (minarets, domes, columns)."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        if r < 1e-4:
            ring = [bm.verts.new((0, 0, z))]
        else:
            for k in range(seg):
                t = 2 * math.pi * k / seg
                ring.append(bm.verts.new((r * math.cos(t), r * math.sin(t), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        A, Bv = rings[i], rings[i + 1]
        if len(A) == 1 and len(Bv) == 1:
            continue
        for k in range(seg):
            if len(A) == 1:
                bm.faces.new((A[0], Bv[k], Bv[(k + 1) % seg]))
            elif len(Bv) == 1:
                bm.faces.new((A[k], A[(k + 1) % seg], Bv[0]))
            else:
                bm.faces.new((A[k], A[(k + 1) % seg], Bv[(k + 1) % seg], Bv[k]))
    if close_bottom and len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if close_top and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return obj_from_bm(bm, name, mat)


def onion_profile(r, h, neck=0.55, bulge=1.12, tip=0.12, n=14, base_z=0.0):
    """Profile of a Deccani onion / bulbous dome: a waist, a bulge, a pointed tip and a finial."""
    pts = [(r * neck, base_z)]
    for i in range(1, n + 1):
        t = i / n
        # bulge peaks at t ~ 0.3, then an ogee curve to the tip
        if t < 0.32:
            rr = r * (neck + (bulge - neck) * math.sin(t / 0.32 * math.pi / 2))
        else:
            u = (t - 0.32) / 0.68
            rr = r * bulge * (math.cos(u * math.pi / 2) ** 1.25) * (1 - 0.15 * math.sin(u * math.pi))
        pts.append((max(rr, r * 0.02), base_z + h * t))
    pts.append((r * tip * 0.6, base_z + h * 1.02))
    pts.append((r * tip, base_z + h * 1.08))
    pts.append((0.0, base_z + h * 1.35))
    return pts


def arch_outline(w, spring, rise, kind='pointed', n=10):
    """2D outline [(x, z), ...] of an arched opening of width w: straight jambs up to `spring`,
    the arch `rise` above it (apex at spring + rise). kind: 'pointed' (two-centred, the Qutb Shahi
    arch), 'round', 'cusped' (multifoil Mughal arch: a pointed arch with scalloped lobes)."""
    half = w / 2.0
    arc = []
    if kind == 'round':
        for i in range(n + 1):
            t = math.pi - math.pi * i / n
            arc.append((half * math.cos(t), spring + rise * math.sin(t)))
    else:
        rise = max(rise, half * 1.001)
        R = (half * half + rise * rise) / (2 * half)   # radius of each arc
        c = R - half                                   # left arc centre x (right arc: -c)
        a1 = math.atan2(rise, -c)
        for i in range(n + 1):                         # left arc: left jamb -> apex
            t = math.pi + (a1 - math.pi) * i / n
            arc.append((c + R * math.cos(t), spring + R * math.sin(t)))
        a0 = math.atan2(rise, c)
        for i in range(1, n + 1):                      # right arc: apex -> right jamb
            t = a0 - a0 * i / n
            arc.append((-c + R * math.cos(t), spring + R * math.sin(t)))
        if kind == 'cusped':
            lobes = 5
            out = []
            m = len(arc) - 1
            for j, (x, z) in enumerate(arc):
                u = j / m
                k = abs(math.sin(u * lobes * math.pi))
                vx, vz = x, z - spring
                L = math.hypot(vx, vz) or 1.0
                d = -w * 0.035 * (1 - k)
                out.append((x + vx / L * d, z + vz / L * d))
            arc = out
    return [(-half, 0.0)] + arc + [(half, 0.0)]


def prism_from_outline(name, outline, depth, axis='Y', center=(0, 0, 0), mat=None):
    """Extrude a 2D outline [(x, z)...] (in the XZ plane) by `depth` along Y (centred), then move
    to `center`; axis='X' rotates it so the outline lies in the YZ plane (for walls facing X)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for (x, z) in outline]
    back = [bm.verts.new((x, depth / 2, z)) for (x, z) in outline]
    n = len(outline)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if axis == 'X':
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return obj_from_bm(bm, name, mat)


def extrude_polygon(name, poly, z0, z1, mat=None):
    """Vertical prism from a 2D polygon [(x, y), ...] between z0 and z1 (plinths, parapets)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for (x, y) in poly]
    hi = [bm.verts.new((x, y, z1)) for (x, y) in poly]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(bm, name, mat)


def array_objects(src, count, offset, name=None):
    """Duplicate src count times along offset (Vector); returns the list incl. src."""
    out = [src]
    for i in range(1, count):
        o = src.copy()
        o.data = src.data.copy()
        o.location = src.location + Vector(offset) * i
        link(o, src.users_collection[0] if src.users_collection else None)
        out.append(o)
    return out


def ring_array(src, count, radius, z=None, phase=0.0, face_out=True):
    """Duplicate src around Z (balusters, merlons around a minaret balcony)."""
    out = []
    for i in range(count):
        a = phase + 2 * math.pi * i / count
        o = src if i == 0 else src.copy()
        if i:
            o.data = src.data.copy()
            link(o, src.users_collection[0] if src.users_collection else None)
        o.location = Vector((radius * math.cos(a), radius * math.sin(a), src.location.z if z is None else z))
        if face_out:
            o.rotation_euler = (0, 0, a + math.pi / 2)
        out.append(o)
    return out


def merlons(name, length, z, depth, h, n=None, w=None, mat=None, kind='leaf'):
    """A row of parapet merlons centred on the X axis (rotate/move the result): kind 'block' or
    'leaf' (the Qutb Shahi pointed leaf cresting)."""
    w = w or 1.2
    n = n or max(1, int(length / (w * 1.6)))
    objs = []
    step = length / n
    for i in range(n):
        x = -length / 2 + step * (i + 0.5)
        if kind == 'block':
            o = box('%s_%d' % (name, i), (w, depth, h), (x, 0, z), mat, base=True)
        else:
            outline = [(-w / 2, 0), (w / 2, 0), (w / 2, h * 0.45), (w * 0.18, h * 0.8), (0, h), (-w * 0.18, h * 0.8), (-w / 2, h * 0.45)]
            o = prism_from_outline('%s_%d' % (name, i), outline, depth, center=(x, 0, z), mat=mat)
        objs.append(o)
    return join(objs, name)


def stairs(name, w, run, rise, steps, loc=(0, 0, 0), mat=None):
    objs = []
    for i in range(steps):
        objs.append(box('%s_%d' % (name, i), (w, run * (steps - i), rise), (loc[0], loc[1] + run * i / 2, loc[2] + rise * i), mat, base=True))
    return join(objs, name)


def grill(name, w, h, bars=6, r=0.06, frame=0.1, loc=(0, 0, 0), mat=None, axis='Y'):
    """A window grill of vertical bars + a frame in the XZ plane (facing -Y)."""
    objs = []
    for i in range(bars):
        x = -w / 2 + w * (i + 0.5) / bars
        objs.append(cylinder('%s_b%d' % (name, i), r, h, (x, 0, 0), seg=6, mat=mat))
    objs.append(box(name + '_t', (w + frame, frame, frame), (0, 0, h), mat))
    objs.append(box(name + '_m', (w + frame, frame, frame), (0, 0, h * 0.5), mat))
    objs.append(box(name + '_l', (w + frame, frame, frame), (0, 0, 0), mat))
    o = join(objs, name)
    if axis == 'X':
        o.rotation_euler = (0, 0, math.pi / 2)
        apply_transform(o)
    o.location = loc
    apply_transform(o)
    return o


def loft(name, rings, seg=10, side=(1, 0, 0), mat=None, cap_start=True, cap_end=True, arm=None):
    """Tube through elliptical cross-sections. rings: list of dicts {c: centre, r: radius or
    (rx, ry) (rx along `side`, ry along the front), p: superellipse power (2 = ellipse), mat:
    material for the segment that starts at this ring, w: {bone: weight} (vertex groups for
    skinning), dz/dy: shape offsets}. The frame of each ring follows the path tangent."""
    bm = bmesh.new()
    pts = [Vector(r['c']) for r in rings]
    n = len(pts)
    mats = []
    vrings = []
    deform = bm.verts.layers.deform.verify()
    groups = {}
    side = Vector(side)
    for i, r in enumerate(rings):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        if t.length < 1e-6:
            t = Vector((0, 0, 1))
        t.normalize()
        sd = Vector(r.get('side', side))
        s = sd - t * sd.dot(t)
        if s.length < 1e-6:
            s = t.orthogonal()
        s.normalize()
        f = t.cross(s).normalized()
        rad = r['r']
        rx, ry = (rad, rad) if not isinstance(rad, (tuple, list)) else rad
        pw = r.get('p', 2.0)
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            ca, sa = math.cos(a), math.sin(a)
            ex = math.copysign(abs(ca) ** (2.0 / pw), ca)
            ey = math.copysign(abs(sa) ** (2.0 / pw), sa)
            off = s * (rx * ex) + f * (ry * ey)
            if r.get('fy') is not None and ey < 0:   # flatter / fuller front (f points to -Y side when t is up)
                off += f * (ry * ey * (r['fy'] - 1))
            v = bm.verts.new(pts[i] + off)
            w = r.get('w')
            if w:
                for b, x in w.items():
                    if b not in groups:
                        groups[b] = len(groups)
                    v[deform][groups[b]] = x
            ring.append(v)
        vrings.append(ring)
    slot = {}

    def mi(m):
        if m is None:
            return 0
        if m.name not in slot:
            slot[m.name] = len(mats)
            mats.append(m)
        return slot[m.name]
    base_m = mat
    cur = base_m
    for i in range(n - 1):
        cur = rings[i].get('mat', cur)
        idx = mi(cur)
        A, B = vrings[i], vrings[i + 1]
        for k in range(seg):
            fc = bm.faces.new((A[k], A[(k + 1) % seg], B[(k + 1) % seg], B[k]))
            fc.material_index = idx
    if cap_start:
        c0 = bm.faces.new(list(reversed(vrings[0])))
        c0.material_index = mi(rings[0].get('mat', base_m))
    if cap_end:
        c1 = bm.faces.new(vrings[-1])
        c1.material_index = mi(rings[-2].get('mat', cur) if n > 1 else cur)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    for m in mats:
        me.materials.append(m)
    if not mats and mat is not None:
        me.materials.append(mat)
    inv = {v: k for k, v in groups.items()}
    for gi in range(len(groups)):
        ob.vertex_groups.new(name=inv[gi])
    return ob


# =========================================================================== object ops (no context needed)
def apply_transform(ob):
    """Bake the object's transform into its mesh data (origin stays at the world origin)."""
    if ob.type != 'MESH':
        return ob
    ob.data.transform(ob.matrix_basis)
    ob.matrix_basis = Matrix.Identity(4)
    return ob


def apply_modifiers(ob):
    """Evaluate and bake all modifiers into the mesh (robust headless, no operators)."""
    if ob.type != 'MESH' or not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def join(objs, name=None):
    """Join mesh objects into the first one (modifiers + transforms applied, vertex groups and
    material slots merged by name). Returns the joined object."""
    objs = [o for o in objs if o is not None and o.type == 'MESH']
    if not objs:
        return None
    for o in objs:
        apply_modifiers(o)
    tgt = objs[0]
    if len(objs) > 1:
        select_only(objs, tgt)
        bpy.ops.object.join()
    if name:
        tgt.name = name
        tgt.data.name = name
    return tgt


def boolean(target, cutter, op='DIFFERENCE', solver='EXACT', keep=False):
    """Boolean with a cutter object (applied). solver EXACT is robust for arches."""
    apply_transform(cutter)
    mod = target.modifiers.new('bool', 'BOOLEAN')
    mod.operation = op
    mod.object = cutter
    try:
        mod.solver = solver
    except Exception:
        pass
    apply_modifiers(target)
    if not keep:
        d = cutter.data
        bpy.data.objects.remove(cutter)
        if d.users == 0:
            bpy.data.meshes.remove(d)
    return target


def bevel_mod(ob, width, segments=2, angle=35.0, harden=True):
    """Bevel the sharp edges (limit by angle) + weighted normals: clean silhouettes and highlights."""
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.use_clamp_overlap = True
    try:
        m.harden_normals = False
    except Exception:
        pass
    return ob


def smooth(ob, angle=40.0):
    """Smooth shading with sharp edges above `angle` (glTF exports the split normals)."""
    if ob.type != 'MESH':
        return ob
    me = ob.data
    try:
        me.shade_smooth()
    except Exception:
        for p in me.polygons:
            p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        # Blender < 4.1 fallback: mark sharp edges by angle with bmesh
        bm = bmesh.new()
        bm.from_mesh(me)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle):
                e.smooth = False
        bm.to_mesh(me)
        bm.free()
    return ob


def flat(ob):
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type != 'MESH':
            continue
        dg = bpy.context.evaluated_depsgraph_get()
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        n += sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
    return n


def decimate_to(ob, max_tris):
    """Collapse-decimate a mesh down to max_tris (keeps UVs / attributes as well as it can)."""
    n = tri_count([ob])
    if n <= max_tris:
        return ob
    m = ob.modifiers.new('decimate', 'DECIMATE')
    m.ratio = max(0.02, max_tris / n * 0.98)
    m.use_collapse_triangulate = True
    apply_modifiers(ob)
    log('decimated %s: %d -> %d tris' % (ob.name, n, tri_count([ob])))
    return ob


def dice(ob, max_edge):
    """Split long edges so per-vertex AO / dirt has enough samples on big flat walls."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for _ in range(8):
        long_e = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long_e:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_e, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def set_region(ob, region):
    """Character tint region per face (written to the _REGION point attribute at finish)."""
    ob['nos_region'] = int(region)
    return ob


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


# =========================================================================== empties / anchors
def anchor(name, loc, parent=None, bone=None, coll=None):
    """An anchor empty 'anchor_<name>' (exported as a glTF node). With an armature parent and a
    bone, it follows that bone (sole points, hand grips, the first-person eye)."""
    e = bpy.data.objects.new('anchor_' + name, None)
    e.empty_display_size = 0.3
    link(e, coll)
    if parent is not None:
        e.parent = parent
        if bone:
            e.parent_type = 'BONE'
            e.parent_bone = bone
            b = parent.data.bones[bone]
            # bone parenting is relative to the bone's tail
            bmat = parent.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))
            e.matrix_parent_inverse = bmat.inverted()
        else:
            e.matrix_parent_inverse = parent.matrix_world.inverted()
        e.matrix_basis = Matrix.Translation(Vector(loc))
    else:
        e.location = loc
    return e


# =========================================================================== text images (signboards)
def text_image(text, w=512, h=128, fg='#1a1a1a', bg='#f2c230', font=None, size=0.62, name=None, border=None):
    """Paint `text` into a new image (w x h) by rendering a text object with Cycles in a temporary
    scene (emission only: 4 samples, no lighting). Returns a bpy image (also saved under TMP_DIR)."""
    ensure_dirs()
    sc0 = bpy.context.window.scene if bpy.context.window else bpy.context.scene
    sc = bpy.data.scenes.new('_text')
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 4
    sc.cycles.use_denoising = False
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    wd = bpy.data.worlds.new('_tw')
    wd.use_nodes = True
    wd.node_tree.nodes['Background'].inputs['Color'].default_value = lin(bg)
    wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sc.world = wd
    cd = bpy.data.curves.new('_txt', 'FONT')
    cd.body = text
    cd.align_x = 'CENTER'
    cd.align_y = 'CENTER'
    if font:
        cd.font = bpy.data.fonts.load(font)
    to = bpy.data.objects.new('_txt', cd)
    sc.collection.objects.link(to)
    tm = bpy.data.materials.new('_txtm')
    tm.use_nodes = True
    nt = tm.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = lin(fg)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], o.inputs[0])
    cd.materials.append(tm)
    cam_d = bpy.data.cameras.new('_tc')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = w / h * 1.0 if w >= h else 1.0
    cam = bpy.data.objects.new('_tc', cam_d)
    sc.collection.objects.link(cam)
    cam.location = (0, 0, 5)
    sc.camera = cam
    # fit text width
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    cd.size = 1.0
    tw = max(1e-3, to.dimensions.x)
    th = max(1e-3, to.dimensions.y)
    aspect = w / h
    s = min(aspect * 0.86 / tw, size / th)
    cd.size = s
    path = os.path.join(TMP_DIR, (name or ('text_' + hashlib.md5((text + fg + bg).encode()).hexdigest()[:8])) + '.png')
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'
    win = bpy.context.window
    if win:
        win.scene = sc
    bpy.ops.render.render(write_still=True, scene=sc.name)
    if win:
        win.scene = sc0
    img = bpy.data.images.load(path)
    bpy.data.scenes.remove(sc)
    return img


# =========================================================================== UVs
def uv_atlas(objs, margin=0.004, angle=60.0):
    """Smart-project all objects into one shared, packed UV atlas (one texture for the asset)."""
    objs = mesh_objects(objs)
    if not objs:
        return
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
    select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    except Exception as e:
        log('pack_islands failed', e)
    bpy.ops.object.mode_set(mode='OBJECT')


def uv_box(ob, tile=16.0, name='UVMap'):
    """World-scale box projection: each face is projected on its dominant axis plane, 1 UV unit
    = `tile` world units (tileable materials on big landmarks)."""
    me = ob.data
    uvl = me.uv_layers.get(name) or me.uv_layers.new(name=name)
    mw = ob.matrix_world
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            v = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 2:
                u, w = v.x, v.y
            elif ax == 0:
                u, w = (v.y if n.x > 0 else -v.y), v.z
            else:
                u, w = (-v.x if n.y > 0 else v.x), v.z
            uvl.data[li].uv = (u / tile, w / tile)
    return ob


# =========================================================================== baking
def _img(name, size, float_buffer=True, alpha=False):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=float_buffer)
    if float_buffer:
        img.colorspace_settings.name = 'Linear Rec.709'
    return img


def _bake_setup(mats, img, mode):
    """Route each material's NOS_* sockets to an Emission shader for an EMIT bake; mode: albedo |
    orm | ao (ao keeps the BSDF). Adds the target image node (active). Returns restore info."""
    info = []
    for m in mats:
        nt = m.node_tree
        N = nt.nodes
        tn = N.new('ShaderNodeTexImage')
        tn.name = '_bake_target'
        tn.image = img
        N.active = tn
        tn.select = True
        out = N.get('NOS_OUT')
        prev = out.inputs['Surface'].links[0].from_socket if (out and out.inputs['Surface'].links) else None
        em = None
        if mode in ('albedo', 'orm') and out is not None:
            em = N.new('ShaderNodeEmission')
            em.name = '_bake_emit'
            em.inputs['Strength'].default_value = 1.0
            if mode == 'albedo':
                src = N.get('NOS_ALBEDO')
                if src is not None:
                    nt.links.new(src.outputs[0], em.inputs['Color'])
                else:
                    em.inputs['Color'].default_value = m.diffuse_color
            else:
                cmb = N.new('ShaderNodeCombineColor')
                cmb.name = '_bake_cmb'
                cmb.inputs[0].default_value = 1.0
                r = N.get('NOS_BSDF')
                rs = r.inputs['Roughness'].links[0].from_socket if (r and r.inputs['Roughness'].links) else None
                ms = r.inputs['Metallic'].links[0].from_socket if (r and r.inputs['Metallic'].links) else None
                if rs is not None:
                    nt.links.new(rs, cmb.inputs[1])
                else:
                    cmb.inputs[1].default_value = 0.8
                if ms is not None:
                    nt.links.new(ms, cmb.inputs[2])
                else:
                    cmb.inputs[2].default_value = 0.0
                nt.links.new(cmb.outputs[0], em.inputs['Color'])
            nt.links.new(em.outputs[0], out.inputs['Surface'])
        info.append((m, tn, em, prev))
    return info


def _bake_restore(info):
    for (m, tn, em, prev) in info:
        nt = m.node_tree
        out = nt.nodes.get('NOS_OUT')
        if em is not None:
            nt.nodes.remove(em)
            c = nt.nodes.get('_bake_cmb')
            if c:
                nt.nodes.remove(c)
            if prev is not None and out is not None:
                nt.links.new(prev, out.inputs['Surface'])
        nt.nodes.remove(tn)


def bake_pass(objs, mode, size, samples=16, margin=6, name=None):
    """Bake one pass ('albedo' | 'orm' | 'ao') of all objects into one float image; returns it."""
    sc = bpy.context.scene
    objs = mesh_objects(objs)
    mats = []
    for o in objs:
        for m in o.data.materials:
            if m and m not in mats and m.get('nos_bake', True):
                mats.append(m)
    img = _img(name or ('_bake_' + mode), size)
    info = _bake_setup(mats, img, mode)
    select_only(objs, objs[0])
    sc.cycles.samples = samples
    sc.render.bake.margin = margin
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = True
    sc.render.bake.target = 'IMAGE_TEXTURES'
    t0 = time.time()
    if mode == 'ao':
        bpy.ops.object.bake(type='AO', margin=margin, use_clear=True)
    else:
        bpy.ops.object.bake(type='EMIT', margin=margin, use_clear=True)
    _bake_restore(info)
    log('baked %s %dx%d (%d samples) in %.1fs' % (mode, size, size, samples, time.time() - t0))
    return img


def img_array(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def save_png(arr_lin, path, srgb=True, name=None):
    """Write a linear float array (h, w, 4) to an 8-bit PNG (sRGB-encoded when srgb)."""
    h, w = arr_lin.shape[:2]
    out = arr_lin.copy()
    if srgb:
        c = np.clip(out[..., :3], 0, None)
        out[..., :3] = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    out = np.clip(out, 0, 1)
    img = bpy.data.images.new(name or os.path.basename(path), w, h, alpha=True)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    img.pixels.foreach_set(out.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def ao_curve(ao, strength=0.75, gamma=1.0, lift=0.0):
    a = np.clip(ao, 0, 1) ** gamma
    a = lift + (1 - lift) * a
    return 1.0 - strength * (1.0 - a)


# =========================================================================== finishing (atlas mode)
def resize_bilinear(a, H, W):
    """bilinear resample of an (h, w, c) float array"""
    h, w = a.shape[:2]
    ys = (np.arange(H) + 0.5) * h / H - 0.5
    xs = (np.arange(W) + 0.5) * w / W - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    x1 = np.clip(x0 + 1, 0, w - 1)
    fy = np.clip(ys - y0, 0, 1)[:, None, None]
    fx = np.clip(xs - x0, 0, 1)[None, :, None]
    a00 = a[y0][:, x0]
    a01 = a[y0][:, x1]
    a10 = a[y1][:, x0]
    a11 = a[y1][:, x1]
    return (a00 * (1 - fx) + a01 * fx) * (1 - fy) + (a10 * (1 - fx) + a11 * fx) * fy


def finish_atlas(A, objs, size=None, ao_samples=32, albedo_samples=8, ao_strength=0.7, ao_dist=None, orm=None, ao_scale=0.5):
    """Unique UV atlas -> baked base colour (procedural albedo x AO) [+ ORM] -> one material
    M_<id> on every baked object. Non-baked materials (glass) are kept. Returns the material."""
    ensure_dirs()
    size = size or BUDGET_TEX.get(A.budget_key, 512)
    objs = mesh_objects(objs)
    for o in objs:
        apply_modifiers(o)
    if ao_dist:
        bpy.context.scene.world.light_settings.distance = ao_dist
    uv_atlas(objs)
    alb = img_array(bake_pass(objs, 'albedo', size, samples=albedo_samples, name='_alb'))
    ao_size = max(64, int(size * ao_scale))
    ao = img_array(bake_pass(objs, 'ao', ao_size, samples=ao_samples, name='_ao', margin=max(2, int(6 * ao_scale))))
    if ao_size != size:
        ao = resize_bilinear(ao, size, size)
    use_orm = orm
    mats = []
    for o in objs:
        for m in o.data.materials:
            if m and m not in mats:
                mats.append(m)
    if use_orm is None:
        specs = [json.loads(m.get('nos', '{}')) for m in mats if m.get('nos_bake', True)]
        rough = set(round(float(s.get('rough', 0.8)), 1) for s in specs)
        use_orm = any(float(s.get('metal', 0)) > 0.05 for s in specs) or len(rough) > 2
    base = alb.copy()
    k = ao_curve(ao[..., 0], ao_strength)
    base[..., 0] *= k
    base[..., 1] *= k
    base[..., 2] *= k
    base[..., 3] = 1.0
    bpath = os.path.join(TMP_DIR, A.id + '_base.png')
    save_png(base, bpath, srgb=True, name=A.id + '_base')
    opath = None
    if use_orm:
        orm_a = img_array(bake_pass(objs, 'orm', size, samples=1, name='_orm'))
        orm_a[..., 0] = 1.0
        orm_a[..., 3] = 1.0
        opath = os.path.join(TMP_DIR, A.id + '_orm.png')
        save_png(orm_a, opath, srgb=False, name=A.id + '_orm')
    M = baked_material('M_' + A.id, bpath, opath, rough=0.8)
    for o in objs:
        slots = list(o.data.materials)
        keep = [m for m in slots if m is not None and not m.get('nos_bake', True)]
        if not keep:
            assign(o, M)
        else:
            # faces with a baked material -> M, glass keeps its own (cheap PBR constant) material
            idx_map = {}
            newmats = [M] + [glass_material(A.id, m) for m in keep]
            for i, m in enumerate(slots):
                idx_map[i] = 0 if (m is None or m.get('nos_bake', True)) else 1 + keep.index(m)
            fidx = [idx_map.get(p.material_index, 0) for p in o.data.polygons]
            o.data.materials.clear()
            for m in newmats:
                o.data.materials.append(m)
            for p, i in zip(o.data.polygons, fidx):
                p.material_index = i
    A.textures.append(bpath)
    if opath:
        A.textures.append(opath)
    return M


def baked_material(name, base_path, orm_path=None, rough=0.8, metal=0.0, vcol=None, emissive=None):
    """Final export material: Principled with the baked base colour [and ORM, vertex colour]."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    N = nt.nodes
    bsdf = N.get('Principled BSDF')
    t = N.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(base_path, check_existing=True)
    t.image.colorspace_settings.name = 'sRGB'
    col = t.outputs['Color']
    if vcol:
        vc = N.new('ShaderNodeVertexColor')
        vc.layer_name = vcol
        mx = N.new('ShaderNodeMix')
        mx.data_type = 'RGBA'
        mx.blend_type = 'MULTIPLY'
        mx.inputs[0].default_value = 1.0
        nt.links.new(col, _sock(mx, 'A', 'RGBA'))
        nt.links.new(vc.outputs['Color'], _sock(mx, 'B', 'RGBA'))
        col = _sock(mx, 'Result', 'RGBA', out=True)
    nt.links.new(col, bsdf.inputs['Base Color'])
    if orm_path:
        o = N.new('ShaderNodeTexImage')
        o.image = bpy.data.images.load(orm_path, check_existing=True)
        o.image.colorspace_settings.name = 'Non-Color'
        sep = N.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'], sep.inputs[0])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    else:
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
    if emissive:
        bsdf.inputs['Emission Color'].default_value = lin(emissive)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return m


GLASS_CACHE = {}


def glass_material(aid, src):
    """Non-baked material (glass, lamp lenses): constant PBR; names ending in '@night' keep the
    suffix (the runtime scales their emission with the night factor)."""
    if src.name in GLASS_CACHE and GLASS_CACHE[src.name].name in bpy.data.materials:
        return GLASS_CACHE[src.name]
    spec = json.loads(src.get('nos', '{}'))
    night = src.name.endswith('@night')
    m = bpy.data.materials.new('M_%s_%s%s' % (aid, src.get('nos_key', 'glass'), '@night' if night else ''))
    m.use_nodes = True
    m.use_backface_culling = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = lin(spec.get('base', '#9fb8c0'))
    b.inputs['Roughness'].default_value = float(spec.get('rough', 0.05))
    b.inputs['Metallic'].default_value = float(spec.get('metal', 0.0))
    a = float(spec.get('alpha', 0.4))
    if a < 0.999:
        b.inputs['Alpha'].default_value = a
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    GLASS_CACHE[src.name] = m
    if spec.get('emit'):
        b.inputs['Emission Color'].default_value = lin(spec['emit'])
        b.inputs['Emission Strength'].default_value = 1.0
    return m


# =========================================================================== finishing (tile mode, big landmarks)
def tile_texture(mat, size=512, tile=16.0):
    """Bake a seamless tile of a library material: noise sampled on a 4D torus so the image
    wraps; returns the PNG path (cached by material spec + size)."""
    ensure_dirs()
    spec = mat.get('nos', '{}')
    key = hashlib.md5((spec + str(size) + str(tile) + str(KIT_VERSION)).encode()).hexdigest()[:10]
    path = os.path.join(TMP_DIR, 'tile_%s_%s.png' % (mat.get('nos_key', mat.name), key))
    if os.path.exists(path):
        return path
    # temporary plane with UVs 0..1 and the torus mapping into NOS_COORD / NOS_W
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new('UVMap')
    for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uvl].uv = uv
    pl = obj_from_bm(bm, '_tileplane')
    m2 = mat.copy()
    pl.data.materials.append(m2)
    nt = m2.node_tree
    N = nt.nodes
    R = tile / (2 * math.pi)
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['UV'], sep.inputs[0])

    def trig(op, s):
        a = N.new('ShaderNodeMath')
        a.operation = 'MULTIPLY'
        nt.links.new(s, a.inputs[0])
        a.inputs[1].default_value = 2 * math.pi
        b = N.new('ShaderNodeMath')
        b.operation = op
        nt.links.new(a.outputs[0], b.inputs[0])
        c = N.new('ShaderNodeMath')
        c.operation = 'MULTIPLY'
        nt.links.new(b.outputs[0], c.inputs[0])
        c.inputs[1].default_value = R
        return c.outputs[0]
    cmb = N.new('ShaderNodeCombineXYZ')
    nt.links.new(trig('COSINE', sep.outputs[0]), cmb.inputs[0])
    nt.links.new(trig('SINE', sep.outputs[0]), cmb.inputs[1])
    nt.links.new(trig('COSINE', sep.outputs[1]), cmb.inputs[2])
    coord = N.get('NOS_COORD')
    for l in list(coord.inputs[0].links):
        nt.links.remove(l)
    nt.links.new(cmb.outputs[0], coord.inputs[0])
    w = N.get('NOS_W')
    wsrc = trig('SINE', sep.outputs[1])
    # every noise W input reads NOS_W (+ offsets): replace NOS_W by the torus w + its old value
    add = N.new('ShaderNodeMath')
    add.operation = 'ADD'
    nt.links.new(wsrc, add.inputs[0])
    add.inputs[1].default_value = w.outputs[0].default_value
    for l in list(w.outputs[0].links):
        nt.links.new(add.outputs[0], l.to_socket)
    aof = N.get('NOS_AOF')
    if aof:
        aof.outputs[0].default_value = 0.0
    img = bake_pass([pl], 'albedo', size, samples=1, margin=0, name='_tile')
    arr = img_array(img)
    save_png(arr, path, srgb=True)
    d = pl.data
    bpy.data.objects.remove(pl)
    bpy.data.meshes.remove(d)
    bpy.data.materials.remove(m2)
    return path


def finish_tiled(A, objs, tile=16.0, tex=512, ao_samples=64, ao_strength=0.8, ao_dist=8.0, dice_edge=6.0, ground_dirt=6.0):
    """Big landmarks: per-material seamless tile textures (crisp up close) on world-scale box
    UVs + ambient occlusion and ground dirt baked into vertex colours (COLOR_0, multiplied)."""
    ensure_dirs()
    objs = mesh_objects(objs)
    for o in objs:
        apply_modifiers(o)
        apply_transform(o)
        if dice_edge:
            dice(o, dice_edge)
    sc = bpy.context.scene
    sc.world.light_settings.distance = ao_dist
    # AO into a byte colour attribute per face corner
    for o in objs:
        me = o.data
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        ca = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = ca
    select_only(objs, objs[0])
    sc.cycles.samples = ao_samples
    sc.render.bake.target = 'VERTEX_COLORS'
    t0 = time.time()
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    log('baked AO to vertex colours (%d samples) in %.1fs' % (ao_samples, time.time() - t0))
    sc.render.bake.target = 'IMAGE_TEXTURES'
    # shape AO + ground dirt (in sRGB byte colours; three multiplies COLOR_0 in linear)
    for o in objs:
        me = o.data
        ca = me.color_attributes['AO']
        n = len(ca.data)
        arr = np.empty(n * 4, np.float32)
        ca.data.foreach_get('color', arr)
        arr = arr.reshape(n, 4)
        zs = np.empty(n, np.float32)
        vidx = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get('vertex_index', vidx)
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        zs = co[vidx, 2]
        ao = arr[:, 0]
        k = ao_curve(ao, ao_strength, gamma=1.2)
        if ground_dirt:
            g = np.clip(1.0 - zs / ground_dirt, 0, 1) ** 2 * 0.25
            k = k * (1 - g)
        arr[:, 0] = k
        arr[:, 1] = k * (1 - 0.04 * (1 - k))  # dirt is a touch warm
        arr[:, 2] = k * (1 - 0.1 * (1 - k))
        arr[:, 3] = 1.0
        ca.data.foreach_set('color', arr.ravel())
    # tile textures + final materials (one per library material)
    finals = {}
    for o in objs:
        uv_box(o, tile)
        slots = list(o.data.materials)
        newm = []
        for m in slots:
            if m is None:
                continue
            if not m.get('nos_bake', True):
                newm.append(glass_material(A.id, m))
                continue
            if m.name not in finals:
                spec = json.loads(m.get('nos', '{}'))
                p = tile_texture(m, tex, tile)
                fm = baked_material('M_%s_%s' % (A.id, m.get('nos_key', m.name)), p, None, rough=float(spec.get('rough', 0.8)), metal=float(spec.get('metal', 0)), vcol='AO')
                if m.name.endswith('@night'):
                    fm.name = fm.name + '@night'
                finals[m.name] = fm
                A.textures.append(p)
            newm.append(finals[m.name])
        fidx = [p.material_index for p in o.data.polygons]
        o.data.materials.clear()
        for m in newm:
            o.data.materials.append(m)
        for p, i in zip(o.data.polygons, fidx):
            p.material_index = min(i, len(newm) - 1)
    return list(finals.values())


# =========================================================================== region attribute (characters)
def write_regions(ob):
    """_REGION float point attribute from each face's source material region (vertices on region
    borders were split by finish so every vertex has one region)."""
    me = ob.data
    regs = [int(m.get('nos_region', 0)) if m else 0 for m in me.materials]
    # split edges between faces of different regions so every vertex has one region
    bm = bmesh.new()
    bm.from_mesh(me)
    split = [e for e in bm.edges if len(e.link_faces) == 2 and regs[e.link_faces[0].material_index] != regs[e.link_faces[1].material_index]]
    if split:
        bmesh.ops.split_edges(bm, edges=split)
    bm.to_mesh(me)
    bm.free()
    at = me.attributes.get('_REGION') or me.attributes.new('_REGION', 'FLOAT', 'POINT')
    vals = [0.0] * len(me.vertices)
    for p in me.polygons:
        r = regs[p.material_index] if p.material_index < len(regs) else 0
        for v in p.vertices:
            vals[v] = float(r)
    at.data.foreach_set('value', vals)
    return {REGIONS[r]: True for r in set(regs) if r}


def region_colours(ob):
    """Average base colour (linear) per region from the source materials (for runtime tinting)."""
    out = {}
    for m in ob.data.materials:
        if not m:
            continue
        r = int(m.get('nos_region', 0))
        if r:
            spec = json.loads(m.get('nos', '{}'))
            out[REGIONS[r]] = spec.get('base', '#808080')
    return out


# =========================================================================== export
class AssetContext:
    """Passed to every builder: id, family, the asset collection, anchors, clips, manifest meta."""

    def __init__(self, entry):
        self.id = entry['id']
        self.family = entry['family']
        self.meta = dict(entry.get('meta') or {})
        self.budget_key = FAMILY_BUDGET.get(self.family, 'prop')
        self.coll = collection(self.id)
        CUR['coll'] = self.coll
        self.anchors = {}
        self.clips = {}
        self.textures = []
        self.tint = None
        self.notes = []
        self.armature = None
        self.preview = {}

    def anchor(self, name, loc, parent=None, bone=None):
        e = anchor(name, loc, parent, bone, self.coll)
        self.anchors[name] = e
        return e

    def objects(self):
        return list(self.coll.all_objects)


def export_glb(A, path=None):
    """Export the asset collection as GLB (WebP textures, Y-up, modifiers applied, animations as
    separate clips). Returns the path."""
    ensure_dirs()
    path = path or os.path.join(ASSETS_DIR, A.id + '.glb')
    objs = A.objects()
    select_only(objs, objs[0])
    lc = bpy.context.view_layer.layer_collection.children.get(A.coll.name)
    if lc:
        bpy.context.view_layer.active_layer_collection = lc
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_image_format='WEBP', export_image_quality=82, export_texcoords=True, export_normals=True,
              export_tangents=False, export_attributes=True, export_extras=False, export_cameras=False, export_lights=False,
              export_animations=bool(A.clips), export_animation_mode='ACTIONS', export_force_sampling=True,
              export_frame_range=False, export_anim_slide_to_zero=True, export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True,
              export_skins=True, export_influence_nb=4, export_morph=False, export_vertex_color='ACTIVE',
              export_rest_position_armature=True, export_def_bones=False, export_leaf_bone=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        # option names drift between Blender versions: drop unknown ones
        log('export option issue:', e)
        for k in ('export_image_quality', 'export_anim_slide_to_zero', 'export_rest_position_armature'):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    return path


def glb_info(path):
    """Read a GLB's JSON chunk: tris, nodes, animations, images (for the manifest + checks)."""
    data = open(path, 'rb').read()
    jl = struct.unpack('<I', data[12:16])[0]
    j = json.loads(data[20:20 + jl])
    tris = 0
    for m in j.get('meshes', []):
        for p in m['primitives']:
            if 'indices' in p:
                tris += j['accessors'][p['indices']]['count'] // 3
            else:
                tris += j['accessors'][p['attributes']['POSITION']]['count'] // 3
    return {
        'bytes': len(data), 'tris': tris,
        'nodes': [n.get('name') for n in j.get('nodes', [])],
        'animations': [a.get('name') for a in j.get('animations', [])],
        'images': [(im.get('mimeType'), im.get('name')) for im in j.get('images', [])],
        'materials': [m.get('name') for m in j.get('materials', [])],
        'extensions': j.get('extensionsUsed', []),
        'json': j,
    }


def write_manifest(A, glb_path, extra=None):
    info = glb_info(glb_path)
    lo, hi = bounds([o for o in A.objects() if o.type == 'MESH' and not o.name.startswith('COL_')])
    man = {
        'id': A.id, 'family': A.family, 'kit': KIT_VERSION,
        'file': os.path.basename(glb_path), 'bytes': info['bytes'], 'kb': round(info['bytes'] / 1024, 1),
        'tris': info['tris'], 'budget': BUDGET_TRIS.get(A.budget_key),
        'size': [round(hi.x - lo.x, 3), round(hi.y - lo.y, 3), round(hi.z - lo.z, 3)],
        'min': [round(lo.x, 3), round(lo.y, 3), round(lo.z, 3)], 'max': [round(hi.x, 3), round(hi.y, 3), round(hi.z, 3)],
        'front': '-Y', 'up': 'Z', 'units': 'u',
        'anchors': {k: [round(v, 4) for v in e.matrix_world.translation] for k, e in A.anchors.items()},
        'clips': A.clips, 'materials': info['materials'], 'images': [m for m, _ in info['images']],
        'meta': A.meta, 'tint': A.tint, 'notes': A.notes,
        'blender': bpy.app.version_string, 'script': REGISTRY.get(A.id, {}).get('module'),
    }
    if extra:
        man.update(extra)
    path = os.path.join(ASSETS_DIR, A.id + '.json')
    with open(path, 'w') as f:
        json.dump(man, f, indent=1, sort_keys=True)
    return man


# =========================================================================== previews
def _preview_world(sc, strength=1.0):
    w = sc.world
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    # soft sky: bluish up, warm ground bounce (gradient on the view z)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = lin('#9a8f80')
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = lin('#a9c4e6')
    nt.links.new(sep.outputs[2], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs[0])


def preview_render(A, glb_path=None, size=384, samples=24, view=None, out=None, frame=None, clip=None, ground=True, sun=(0.9, 0.35, 0.5)):
    """Re-import the exported GLB into a clean scene and render a 3/4 view with Cycles CPU (what
    you see is what ships): sky light + sun + ground shadow. Returns the PNG path."""
    ensure_dirs()
    glb_path = glb_path or os.path.join(ASSETS_DIR, A.id + '.glb')
    out = out or os.path.join(PREVIEW_DIR, A.id + '.png')
    sc = bpy.data.scenes.new('_preview_' + os.path.basename(out))
    win = bpy.context.window
    prev_scene = bpy.context.scene
    if win:
        win.scene = sc
    sc.world = bpy.data.worlds.new('_pw')
    _preview_world(sc, 0.9)
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 1
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 2.0
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 4
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.film_transparent = False
    sc.render.filter_size = 1.8
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    sc.render.fps = FPS
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.name.startswith('COL_'):
            o.hide_render = True
    # pose characters: a clip at a frame
    arm = next((o for o in objs if o.type == 'ARMATURE'), None)
    if arm and clip and bpy.data.actions.get(clip):
        act = bpy.data.actions[clip]
        arm.animation_data_create()
        arm.animation_data.action = act
        try:
            if act.slots:
                arm.animation_data.action_slot = act.slots[0]
        except Exception:
            pass
        sc.frame_set(int(frame or 0))
    elif arm:
        if arm.animation_data:
            arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    meshes = [o for o in objs if o.type == 'MESH' and not o.name.startswith('COL_')]
    # bounds of the evaluated (posed) meshes
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            w = mw @ v.co
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
        ev.to_mesh_clear()
    ctr = (lo + hi) / 2
    ext = hi - lo
    rad = max(ext.length / 2, 0.5)
    if ground:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=rad * 6)
        gp = bpy.data.meshes.new('_ground')
        bm.to_mesh(gp)
        bm.free()
        g = bpy.data.objects.new('_ground', gp)
        sc.collection.objects.link(g)
        g.location.z = lo.z
        gm = bpy.data.materials.new('_groundm')
        gm.use_nodes = True
        gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = lin('#b9ad98')
        gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
        gp.materials.append(gm)
    # sun
    ld = bpy.data.lights.new('_sun', 'SUN')
    ld.energy = 3.2
    ld.angle = math.radians(3)
    ld.color = (1.0, 0.96, 0.9)
    lo_ = bpy.data.objects.new('_sun', ld)
    sc.collection.objects.link(lo_)
    sd = Vector(sun).normalized()
    lo_.rotation_euler = sd.to_track_quat('Z', 'Y').to_euler()
    # camera: 3/4 view from the front-left (front = -Y)
    v = view or {}
    az = math.radians(v.get('az', -35.0))   # 0 = straight at the front (-Y side)
    el = math.radians(v.get('el', 18.0))
    fov = math.radians(v.get('fov', 32.0))
    dist = v.get('dist') or (rad / math.sin(fov / 2)) * v.get('pad', 1.08)
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
    log('preview %s (%dpx, %d spp) in %.1fs' % (os.path.basename(out), size, samples, time.time() - t0))
    if win:
        win.scene = prev_scene
    # clean up the preview scene and its imported data
    for o in list(sc.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    return out


def contact_sheet(paths, out, cols=4, cell=256, label=True):
    """Tile PNGs into one sheet (numpy; nearest-neighbour downscale to the cell size)."""
    imgs = []
    for p in paths:
        if os.path.exists(p):
            imgs.append(bpy.data.images.load(p, check_existing=False))
    if not imgs:
        return None
    rows = (len(imgs) + cols - 1) // cols
    W, Hh = cols * cell, rows * cell
    sheet = np.ones((Hh, W, 4), np.float32) * np.array([0.12, 0.11, 0.13, 1], np.float32)
    for i, im in enumerate(imgs):
        a = img_array(im)  # stored values (already display-encoded for PNG)
        h, w = a.shape[:2]
        s = max(h, w) / cell
        ys = (np.arange(int(h / s)) * s).astype(int).clip(0, h - 1)
        xs = (np.arange(int(w / s)) * s).astype(int).clip(0, w - 1)
        small = a[ys][:, xs]
        r, c = i // cols, i % cols
        y0 = Hh - (r + 1) * cell
        x0 = c * cell
        sheet[y0:y0 + small.shape[0], x0:x0 + small.shape[1]] = small
    img = bpy.data.images.new('_sheet', W, Hh, alpha=True)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    for im in imgs:
        bpy.data.images.remove(im)
    return out


# =========================================================================== run one asset
def run_asset(aid, previews=True, quick=False):
    """Build, finish, export, manifest and preview one registered asset in a fresh scene."""
    ent = REGISTRY[aid]
    t0 = time.time()
    reset()
    MATS.clear()
    A = AssetContext(ent)
    A.quick = quick
    log('building', aid, '(%s)' % ent['family'])
    ent['build'](A)
    glb = export_glb(A)
    man = write_manifest(A, glb)
    budget = BUDGET_TRIS.get(A.budget_key)
    status = 'ok'
    if budget and man['tris'] > budget:
        status = 'OVER BUDGET'
    log('%s: %d tris (budget %s) %s, %.1f KB, clips %s, anchors %d' % (aid, man['tris'], budget, status, man['kb'], list(A.clips.keys()), len(A.anchors)))
    if previews and not quick:
        shots = A.preview.get('shots') or [{}]
        outs = []
        for i, s in enumerate(shots):
            name = A.id if i == 0 else '%s_%s' % (A.id, s.get('name', i))
            outs.append(preview_render(A, glb, size=s.get('size', 384), samples=s.get('samples', 24), view=s.get('view'),
                                       out=os.path.join(PREVIEW_DIR, name + '.png'), frame=s.get('frame'), clip=s.get('clip')))
        if A.preview.get('sheet'):
            sh = A.preview['sheet']
            frames = []
            for j, (clip, fr) in enumerate(sh['frames']):
                p = os.path.join(TMP_DIR, '%s_sheet_%02d.png' % (A.id, j))
                preview_render(A, glb, size=sh.get('size', 192), samples=sh.get('samples', 12), view=sh.get('view'), out=p, frame=fr, clip=clip, sun=sh.get('sun', (0.9, 0.35, 0.5)))
                frames.append(p)
            contact_sheet(frames, os.path.join(PREVIEW_DIR, A.id + '_' + sh.get('name', 'sheet') + '.png'), cols=sh.get('cols', 8), cell=sh.get('size', 192))
    log('done %s in %.1fs' % (aid, time.time() - t0))
    return man


# =========================================================================== rigs (shared kid / adult skeleton)
# Joint positions (Blender: front -Y, the character's left = +X, Z up, feet on z = 0). The rest
# pose is a relaxed A-pose (arms 45 deg down), knees and elbows very slightly bent so IK and heat
# weighting know which way they bend. Adults use the same bone names and hierarchy.
KID_J = {
    'pelvis': (0, 0.0, 3.30), 'spine': (0, 0.02, 3.95), 'chest': (0, 0.0, 4.62), 'neck': (0, 0.06, 5.52),
    'head': (0, 0.06, 5.80), 'head_top': (0, 0.02, 7.02),
    'clav': (0.12, 0.04, 5.36), 'shoulder': (0.66, 0.08, 5.30), 'elbow': (1.30, 0.10, 4.66), 'wrist': (1.86, 0.02, 4.10),
    'hand_tip': (2.20, -0.02, 3.76),
    'hip': (0.34, 0.0, 3.36), 'knee': (0.35, -0.07, 1.84), 'ankle': (0.36, 0.05, 0.34), 'ball': (0.37, -0.58, 0.12),
    'toe': (0.38, -0.86, 0.08), 'heel': (0.36, 0.26, 0.0),
}
ADULT_J = {
    'pelvis': (0, 0.0, 4.30), 'spine': (0, 0.03, 5.05), 'chest': (0, 0.0, 5.95), 'neck': (0, 0.08, 7.15),
    'head': (0, 0.08, 7.45), 'head_top': (0, 0.02, 8.95),
    'clav': (0.16, 0.05, 6.95), 'shoulder': (0.95, 0.1, 6.88), 'elbow': (1.80, 0.12, 6.02), 'wrist': (2.52, 0.03, 5.30),
    'hand_tip': (2.92, -0.02, 4.90),
    'hip': (0.44, 0.0, 4.36), 'knee': (0.46, -0.09, 2.38), 'ankle': (0.47, 0.06, 0.40), 'ball': (0.48, -0.74, 0.14),
    'toe': (0.49, -1.08, 0.09), 'heel': (0.47, 0.32, 0.0),
}


def build_armature(J, name='rig', coll=None):
    """Armature with the standard bone names (BONES) from joint positions J."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    link(ob, coll)
    select_only([ob], ob)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones

    def bone(n, h, t, parent=None, connect=False):
        b = eb.new(n)
        b.head = Vector(h)
        b.tail = Vector(t)
        b.roll = 0.0
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b
    bone('root', (0, 0, 0), (0, 0, 0.8))
    bone('hips', J['pelvis'], J['spine'], 'root')
    bone('spine', J['spine'], J['chest'], 'hips', True)
    bone('chest', J['chest'], J['neck'], 'spine', True)
    bone('neck', J['neck'], J['head'], 'chest', True)
    bone('head', J['head'], J['head_top'], 'neck', True)
    for s, sx in (('L', 1), ('R', -1)):
        def m(p):
            return (p[0] * sx, p[1], p[2])
        bone('shoulder_' + s, m(J['clav']), m(J['shoulder']), 'chest')
        bone('upperarm_' + s, m(J['shoulder']), m(J['elbow']), 'shoulder_' + s, True)
        bone('forearm_' + s, m(J['elbow']), m(J['wrist']), 'upperarm_' + s, True)
        bone('hand_' + s, m(J['wrist']), m(J['hand_tip']), 'forearm_' + s, True)
        bone('thigh_' + s, m(J['hip']), m(J['knee']), 'hips')
        bone('shin_' + s, m(J['knee']), m(J['ankle']), 'thigh_' + s, True)
        bone('foot_' + s, m(J['ankle']), m(J['ball']), 'shin_' + s, True)
        bone('toe_' + s, m(J['ball']), m(J['toe']), 'foot_' + s, True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return ob


def bind_heat(meshes, arm):
    """Automatic (bone heat) weights for the given meshes; returns those that got weights."""
    ok = []
    for me in meshes:
        select_only([me, arm], arm)
        try:
            bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        except Exception as e:
            log('heat weights failed for', me.name, e)
        if me.vertex_groups and any(len(me.vertex_groups) for _ in [0]):
            ok.append(me)
    return ok


def weights(ob, w):
    """Vertex groups for skinning: w = bone name, {bone: weight} or fn(world co) -> {bone: weight}.
    (The Armature modifier is added once, on the joined mesh.)"""
    for vg in list(ob.vertex_groups):
        ob.vertex_groups.remove(vg)
    groups = {}

    def grp(n):
        if n not in groups:
            groups[n] = ob.vertex_groups.new(name=n)
        return groups[n]
    for v in ob.data.vertices:
        d = w(ob.matrix_world @ v.co) if callable(w) else ({w: 1.0} if isinstance(w, str) else w)
        tot = sum(d.values()) or 1.0
        for b, x in d.items():
            if x > 0:
                grp(b).add([v.index], x / tot, 'REPLACE')
    return ob


def normalize_weights(ob, limit=4):
    """Keep the 4 strongest influences per vertex and normalise (glTF / three use 4)."""
    names = {g.index: g.name for g in ob.vertex_groups}
    for v in ob.data.vertices:
        gs = sorted([(g.weight, g.group) for g in v.groups], reverse=True)
        keep = gs[:limit]
        tot = sum(w for w, _ in keep) or 1.0
        for w, gi in gs[limit:]:
            ob.vertex_groups[names[gi]].remove([v.index])
        for w, gi in keep:
            ob.vertex_groups[names[gi]].add([v.index], w / tot, 'REPLACE')


def Rx(a):
    return Matrix.Rotation(a, 4, 'X')


def Ry(a):
    return Matrix.Rotation(a, 4, 'Y')


def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')


def Raxis(axis, a):
    return Matrix.Rotation(a, 4, Vector(axis).normalized())


def _frame(d, side):
    """orthonormal basis (columns side', d, side' x d) from a direction and a side hint"""
    d = Vector(d).normalized()
    s = Vector(side)
    s = (s - d * s.dot(d))
    if s.length < 1e-6:
        s = d.orthogonal()
    s.normalize()
    t = s.cross(d)
    M = Matrix((s, d, t)).transposed()
    return M


def _align(d_from, s_from, d_to, s_to):
    """rotation (4x4) taking the frame (d_from, s_from) to (d_to, s_to)"""
    A = _frame(d_from, s_from)
    B = _frame(d_to, s_to)
    return (B @ A.transposed()).to_4x4()


def smooth01(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class Rig:
    """Pose solver for clip authoring. A pose P maps bone -> armature-space rigid transform applied
    to the rest bone (P = I is the rest pose). fk() rotates a bone about its rest head in its
    parent's rest-aligned axes; leg_ik() / arm_ik() solve 2-bone chains in armature space; key()
    converts P to pose-bone basis keys: basis = rest^-1 @ P_parent^-1 @ P @ rest."""

    def __init__(self, ob, J):
        self.ob = ob
        self.J = J
        bones = ob.data.bones
        self.names = [b.name for b in bones]
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.restinv = {k: v.inverted() for k, v in self.rest.items()}
        self.head = {b.name: b.head_local.copy() for b in bones}
        self.tail = {b.name: b.tail_local.copy() for b in bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.prevq = {}
        self.hip_z = self.head['thigh_L'].z
        self.leg = (self.head['shin_L'] - self.head['thigh_L']).length + (self.head['foot_L'] - self.head['shin_L']).length
        self.ankle_z = self.head['foot_L'].z
        self.ball_z = self.head['toe_L'].z
        self.heel_back = J['heel'][1] - J['ankle'][1]     # +Y = behind the ankle
        self.ball_fwd = J['ankle'][1] - J['ball'][1]      # forward distance ankle -> ball

    def pose(self):
        return {n: Matrix.Identity(4) for n in self.names}

    def fk(self, P, n, R=None, t=None):
        p = self.parent[n]
        Pp = P[p] if p else Matrix.Identity(4)
        h = self.head[n]
        D = Matrix.Translation(h) @ (R if R is not None else Matrix.Identity(4)) @ Matrix.Translation(-h)
        if t is not None:
            D = Matrix.Translation(Vector(t)) @ D
        P[n] = Pp @ D
        return P[n]

    def place(self, P, n, R_world, to):
        """absolute: bone n rotated by R_world (armature axes) with its head moved to `to`"""
        P[n] = Matrix.Translation(Vector(to)) @ R_world @ Matrix.Translation(-self.head[n])
        return P[n]

    def at(self, P, n, p):
        return P[n] @ Vector(p)

    def leg_ik(self, P, s, ankle, foot_R, toe_R=None, pole=(0, -1, 0)):
        th, sh, ft, to = 'thigh_' + s, 'shin_' + s, 'foot_' + s, 'toe_' + s
        Hp = P['hips'] @ self.head[th]
        l1 = (self.head[sh] - self.head[th]).length
        l2 = (self.head[ft] - self.head[sh]).length
        A = Vector(ankle)
        d = A - Hp
        L = min(max(d.length, abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9995)
        u = d.normalized()
        A2 = Hp + u * L
        a = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
        hk = math.sqrt(max(0.0, l1 * l1 - a * a))
        pole = Vector(pole)
        pv = pole - u * pole.dot(u)
        if pv.length < 1e-6:
            pv = Vector((0, -1, 0))
        pv.normalize()
        K = Hp + u * a + pv * hk
        n_des = pv.cross(u).normalized()
        X = Vector((1, 0, 0))
        r1 = (self.head[sh] - self.head[th]).normalized()
        r2 = (self.head[ft] - self.head[sh]).normalized()
        self.place(P, th, _align(r1, X, K - Hp, n_des), Hp)
        self.place(P, sh, _align(r2, X, A2 - K, n_des), K)
        self.place(P, ft, foot_R, A2)
        B = P[ft] @ self.head[to]
        self.place(P, to, toe_R if toe_R is not None else foot_R, B)
        return A2, K

    def arm_ik(self, P, s, hand, hand_R=None, pole=(0, 0.6, -0.4)):
        ua, fa, hd = 'upperarm_' + s, 'forearm_' + s, 'hand_' + s
        Sp = P['shoulder_' + s] @ self.head[ua]
        l1 = (self.head[fa] - self.head[ua]).length
        l2 = (self.head[hd] - self.head[fa]).length
        T = Vector(hand)
        d = T - Sp
        L = min(max(d.length, abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9995)
        u = d.normalized()
        T2 = Sp + u * L
        a = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
        hk = math.sqrt(max(0.0, l1 * l1 - a * a))
        pole = Vector(pole)
        pv = pole - u * pole.dot(u)
        if pv.length < 1e-6:
            pv = Vector((0, 1, 0))
        pv.normalize()
        E = Sp + u * a + pv * hk
        n_des = u.cross(pv).normalized()
        r1 = (self.head[fa] - self.head[ua]).normalized()
        r2 = (self.head[hd] - self.head[fa]).normalized()
        side_rest = r1.cross(r2)
        if side_rest.length < 1e-4:
            side_rest = Vector((0, 1, 0)).cross(r1)
        self.place(P, ua, _align(r1, side_rest, E - Sp, n_des), Sp)
        self.place(P, fa, _align(r2, side_rest, T2 - E, n_des), E)
        if hand_R is not None:
            self.place(P, hd, hand_R, T2)
        else:
            self.fk(P, hd)
        return T2, E

    def key(self, P, frame, loc_bones=('root', 'hips')):
        pbs = self.ob.pose.bones
        for n in self.names:
            p = self.parent[n]
            Pp = P[p] if p else Matrix.Identity(4)
            basis = self.restinv[n] @ Pp.inverted() @ P[n] @ self.rest[n]
            loc, q, _ = basis.decompose()
            pq = self.prevq.get(n)
            if pq is not None and q.dot(pq) < 0:
                q.negate()
            self.prevq[n] = q.copy()
            pb = pbs[n]
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=frame, group=n)
            if n in loc_bones:
                pb.location = loc
                pb.keyframe_insert('location', frame=frame, group=n)

    def begin(self, name):
        ob = self.ob
        ob.animation_data_create()
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ob.animation_data.action = act
        self.prevq = {}
        for pb in ob.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            pb.matrix_basis = Matrix.Identity(4)
        return act

    def end(self, act, f0, f1, cyclic=True):
        act.use_frame_range = True
        act.frame_start = f0
        act.frame_end = f1
        act.use_cyclic = bool(cyclic)
        self.ob.animation_data.action = None
        for pb in self.ob.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)


# ---------------------------------------------------------------- gait (planted-foot locomotion)
def roll_foot(R, f, th):
    """Sagittal foot placement: the flat-foot ankle reference at forward distance f (forward = -Y);
    pitch th > 0 (toes up) pivots on the heel contact, th < 0 (heel up) on the ball joint.
    Returns (forward, height) of the ankle."""
    za, hb, bl, zb = R.ankle_z, R.heel_back, R.ball_fwd, R.ball_z
    c, s = math.cos(th), math.sin(th)
    if th >= 0:
        # vector heel->ankle = (hb, za) rotated by th (counter-clockwise lifts the toes)
        F = (f - hb) + hb * c - za * s
        z = hb * s + za * c
    else:
        # vector ball->ankle = (-bl, za - zb) rotated by th (clockwise lifts the heel)
        dz = za - zb
        F = (f + bl) + (-bl) * c - dz * s
        z = zb + (-bl) * s + dz * c
    return F, z


def foot_rot(th, yaw=0.0):
    """world rotation of the foot bone for pitch th (toes up positive)"""
    return Rz(yaw) @ Rx(-th)


GAITS = {
    # nominal: the speed (u/s) the clip is designed for; stride: u per cycle; duty: stance fraction
    'stroll': dict(stride=4.8, duty=0.60, lift=0.32, thH=0.28, thT=0.5, cap=0.10, bob=0.0, lean=0.03, arm=0.32, elbow=0.18, pelvis=0.10, sway=0.06, footx=0.30, run=False, nominal=14.0),
    'walk': dict(stride=10.4, duty=0.40, lift=0.62, thH=0.30, thT=0.62, cap=0.26, bob=0.04, lean=0.07, arm=0.55, elbow=0.42, pelvis=0.16, sway=0.04, footx=0.27, run=False, nominal=45.0),
    'run': dict(stride=16.0, duty=0.27, lift=1.45, thH=0.16, thT=0.85, cap=0.42, bob=0.42, lean=0.22, arm=0.95, elbow=1.45, pelvis=0.20, sway=0.02, footx=0.20, run=True, nominal=80.0),
}


def gait_clip(R, name, g, frames=32, arm_lower=None):
    """Author an in-place cyclic locomotion clip. Phase u in [0, 1): 0 = left heel strike. The
    stance foot moves backwards (+Y) at exactly stride per cycle (planted in the world when the
    character moves forwards at stride * cycles/s). Returns the manifest entry."""
    S, beta = g['stride'], g['duty']
    J = R.J
    footx = g['footx']
    L = R.leg
    act = R.begin(name)
    lower = arm_lower if arm_lower is not None else math.radians(38)
    hip_rest = R.hip_z

    def foot_at(u):
        """forward coordinate + height + pitch of one foot at phase u (stance first)"""
        u = u % 1.0
        if u < beta:
            s = u / beta
            th = 0.0
            if s < 0.18:
                th = g['thH'] * (1 - s / 0.18) ** 2
            elif s > 0.58:
                th = -g['thT'] * ((s - 0.58) / 0.42) ** 2
            f = beta * S / 2 - S * u
            F, z = roll_foot(R, f, th)
            return F, z, th, True, s
        s = (u - beta) / (1 - beta)
        F0, z0 = roll_foot(R, -beta * S / 2, -g['thT'])
        F1, z1 = roll_foot(R, beta * S / 2, g['thH'])
        m = -S * (1 - beta)
        s2, s3 = s * s, s * s * s
        F = (2 * s3 - 3 * s2 + 1) * F0 + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * F1 + (s3 - s2) * m
        lift = g['lift'] * math.sin(math.pi * (s ** 0.75 if g['run'] else s))
        z = z0 + (z1 - z0) * s + lift
        e = 0.5 - 0.5 * math.cos(math.pi * s)
        th = -g['thT'] + (g['thT'] + g['thH']) * e
        if g['run']:
            th -= 0.45 * math.sin(math.pi * s) * (1 - s)
        return F, z, th, False, s

    def hip_limit(F, z, run, s):
        k = 0.985 if not run else (0.95 - 0.06 * math.sin(math.pi * s))
        Lk = L * k
        d = min(abs(F), Lk * 0.995)
        return z + math.sqrt(Lk * Lk - d * d)

    out_slip = []
    for fr in range(frames + 1):
        u = fr / frames
        P = R.pose()
        fL = foot_at(u)
        fR = foot_at(u + 0.5)
        cap = hip_rest - g['cap']
        lims = [hip_limit(f[0], f[1], g['run'], f[4]) for f in (fL, fR) if f[3]]
        if lims:
            hz = min([cap] + lims)
        else:
            # flight: ballistic arc between push-off and landing
            h2 = (u * 2) % 1.0
            q = min(1.0, max(0.0, (h2 * 0.5 - beta) / max(0.01, 0.5 - beta)))
            Fa, za = roll_foot(R, -beta * S / 2, -g['thT'])
            Fb, zb = roll_foot(R, beta * S / 2, g['thH'])
            a = min(cap, hip_limit(Fa, za, True, 1.0))
            b = min(cap, hip_limit(Fb, zb, True, 0.0))
            hz = a + (b - a) * q + 4 * g['bob'] * q * (1 - q)
        # pelvis: sway towards the stance side, yaw with the swinging leg, drop on the swing side
        c = math.cos(2 * math.pi * u)
        sway = g['sway'] * math.cos(2 * math.pi * (u - beta / 2))   # weight over the stance foot
        yaw = -g['pelvis'] * 0.5 * c                                # left hip forwards at left heel strike
        roll = 0.05 * math.sin(2 * math.pi * u * 2) * (0 if g['run'] else 1)
        dz = hz - hip_rest
        R.fk(P, 'root')
        R.fk(P, 'hips', Rz(yaw) @ Ry(roll), t=(sway, 0, dz))
        lean = g['lean']
        R.fk(P, 'spine', Rx(lean * 0.5) @ Rz(-yaw * 0.6))
        breath = 0.0
        R.fk(P, 'chest', Rx(lean * 0.5 + breath) @ Rz(-yaw * 0.9))
        R.fk(P, 'neck', Rx(-lean * 0.5) @ Rz(yaw * 0.3))
        R.fk(P, 'head', Rx(-lean * 0.4 - 0.02 * math.sin(4 * math.pi * u)))
        # arms swing against the legs (left arm forward at u = 0.5), slight lag
        for s, sx, ph in (('L', 1, 0.5), ('R', -1, 0.0)):
            sw = g['arm'] * math.cos(2 * math.pi * (u - ph - 0.04))
            R.fk(P, 'shoulder_' + s, Rx(-0.12 * sw) @ Ry(0))
            up = Ry(lower * sx)
            R.fk(P, 'upperarm_' + s, Rx(-sw) @ up)
            el = g['elbow'] + (0.25 * max(0.0, math.cos(2 * math.pi * (u - ph))) if not g['run'] else 0.18 * math.cos(2 * math.pi * (u - ph)))
            # elbow hinge: axis = rest arm dir x forward, rotating the forearm forwards
            ad = (R.head['forearm_' + s] - R.head['upperarm_' + s]).normalized()
            hinge = ad.cross(Vector((0, -1, 0)))
            R.fk(P, 'forearm_' + s, Raxis(hinge, el))
            R.fk(P, 'hand_' + s, Raxis(hinge, 0.12))
        # legs: ankle targets in armature space (forward = -Y)
        for s, sx, f in (('L', 1, fL), ('R', -1, fR)):
            F, z, th, st, _ = f
            ankle = Vector((sx * footx + (0 if st else 0.0), -F + J['ankle'][1], z))
            tR = foot_rot(th)
            toeR = Matrix.Identity(4) if th < 0 and st else (foot_rot(th * 0.6) if not st else tR)
            if not st and th < 0:
                toeR = foot_rot(th * 0.4)
            R.leg_ik(P, s, ankle, tR, toeR, pole=(sx * 0.12, -1, 0))
        R.key(P, fr)
        # bookkeeping: grounded sole points must move +Y at S per cycle
        out_slip.append(_soles(R, P))
    R.end(act, 0, frames, cyclic=True)
    slip = _slip_report(out_slip, S / frames)
    entry = {'loop': True, 'loco': True, 'frames': frames, 'fps': FPS, 'duration': round(frames / FPS, 4),
             'stride': S, 'nominal': g['nominal'], 'speed': round(S / (frames / FPS), 3), 'duty': beta,
             'gait': 'run' if g['run'] else 'walk', 'phase0': 'left heel strike', 'slip': slip}
    log('clip %s: stride %.1f u, duty %.2f, nominal %.0f u/s -> %.2f cycles/s; slip %s' % (name, S, beta, g['nominal'], g['nominal'] / S, slip))
    return entry


def _soles(R, P):
    """armature-space heel / toe-tip contact points of both feet for a pose"""
    out = {}
    J = R.J
    for s, sx in (('L', 1), ('R', -1)):
        heel = Vector((sx * J['heel'][0], J['heel'][1], 0.0))
        toe = Vector((sx * J['toe'][0], J['toe'][1], 0.0))
        out[s] = (P['foot_' + s] @ heel, P['toe_' + s] @ toe)
    return out


def _slip_report(seq, step):
    """max / mean slip (u per frame) of grounded sole points, relative to the expected backward
    motion `step` per frame, and the lowest sole height"""
    worst, tot, n, low = 0.0, 0.0, 0, 9.0
    for i in range(1, len(seq)):
        for s in ('L', 'R'):
            for k in (0, 1):
                a, b = seq[i - 1][s][k], seq[i][s][k]
                low = min(low, b.z)
                if a.z < 0.03 and b.z < 0.03:
                    d = math.hypot(b.x - a.x, (b.y - a.y) - step)
                    worst = max(worst, d)
                    tot += d
                    n += 1
    return {'max': round(worst, 4), 'mean': round(tot / max(1, n), 4), 'pairs': n, 'step': round(step, 4), 'ratio': round((tot / max(1, n)) / step, 4) if step else 0, 'low': round(low, 3)}


def idle_clip(R, name='idle', frames=120, arm_lower=None):
    """Standing: breathing, a weight shift and a glance left / right; feet stay planted."""
    act = R.begin(name)
    J = R.J
    lower = arm_lower if arm_lower is not None else math.radians(40)
    hip_rest = R.hip_z
    for fr in range(frames + 1):
        t = fr / frames
        P = R.pose()
        w = math.sin(2 * math.pi * t)                # one weight shift per loop
        br = math.sin(2 * math.pi * t * 3)            # three breaths per loop
        look = 0.42 * (smooth01((t - 0.18) / 0.1) - smooth01((t - 0.42) / 0.1)) - 0.36 * (smooth01((t - 0.6) / 0.1) - smooth01((t - 0.82) / 0.1))
        R.fk(P, 'root')
        R.fk(P, 'hips', Ry(0.025 * w) @ Rz(0.03 * w), t=(0.07 * w, 0, -0.06 - 0.03 * abs(w)))
        R.fk(P, 'spine', Rx(0.01 * br) @ Ry(-0.02 * w))
        R.fk(P, 'chest', Rx(-0.025 * br) @ Ry(-0.012 * w))
        R.fk(P, 'neck', Rz(look * 0.4) @ Rx(0.01 * br))
        R.fk(P, 'head', Rz(look * 0.6) @ Rx(-0.03 + 0.02 * math.sin(2 * math.pi * t * 2)))
        for s, sx in (('L', 1), ('R', -1)):
            R.fk(P, 'shoulder_' + s, Rx(0.0) @ Ry(-0.02 * br * sx))
            R.fk(P, 'upperarm_' + s, Rx(0.04 + 0.02 * br) @ Ry(lower * sx))
            ad = (R.head['forearm_' + s] - R.head['upperarm_' + s]).normalized()
            hinge = ad.cross(Vector((0, -1, 0)))
            R.fk(P, 'forearm_' + s, Raxis(hinge, 0.22 + 0.02 * br))
            R.fk(P, 'hand_' + s, Raxis(hinge, 0.15))
            ankle = Vector((sx * 0.33, J['ankle'][1] - 0.02 * sx, R.ankle_z))
            R.leg_ik(P, s, ankle, foot_rot(0.0, yaw=sx * 0.08), foot_rot(0.0, yaw=sx * 0.08), pole=(sx * 0.2, -1, 0))
        R.key(P, fr)
    R.end(act, 0, frames, cyclic=True)
    return {'loop': True, 'loco': False, 'frames': frames, 'fps': FPS, 'duration': round(frames / FPS, 4)}
