"""NOSTALGIA — tools/blender/_characters_kit.py (characters artist) — additive helpers for characters.py.

Not an asset-family script (the leading underscore keeps build_all.py from importing it as one);
characters.py imports it. Everything here builds on kit.py without changing it (ARCHITECTURE §21).

Look: "a gentle, handmade toy" — rounded, slightly chunky forms with soft silhouettes, a slightly
large head, mitten hands with a thumb, simple dark toy eyes with a catch-light, cloth with hems you
can see (every garment edge is a little lip), baked weave / grime / AO. Never blocky, never uncanny.

  * Regions + slots  every face carries a tint region (`_REGION`): the 8 kit.REGIONS (none skin hair
                     shirt stripes pants shoes accent) + up to 16 accessory slots (8..23) per asset.
                     A.tint = {attribute, names, regions (default colours), fields (which N.people look
                     fields colour a region: 'shirt' | '@saree:0.72' (a shade of a field) | '#hex'),
                     show (slot visibility rules on the look)}. The runtime (models3d.js) multiplies
                     each region by look colour / default and hides slots whose rule is false.
  * Rule language    True | False | {'f': field} (truthy) | {'f': field, 'in': [values]} |
                     {'f': field, 're': regex} | {'any': [...]} | {'all': [...]} | {'not': rule}.
  * Bodies           body(J, spec, M): torso / arms / hands / legs / skirt (lungi, dhoti, saree,
                     kurta / kameez tails, burqa, frock) / feet (hawai chappals, sandals, shoes),
                     lofts with per-ring bone weights (skirts: per-vertex weights by side).
  * Heads            head(J, M, spec): skull + toy face (eyes with catch-lights, brows, nose, smile,
                     ears) + hair styles (spiky, side, oiled, crop, puff, receding, bald, bun, plait,
                     plaits, ponytails) + facial hair (moustache, trimmed / long beard).
  * Accessories      specs, caps (cricket, back-cap, skull, Gandhi, Irani, police, hood), camera,
                     walkman, tie + ID card, school bag, jhola, satchel, towel, apron, jasmine, stick,
                     lathi, charkhi, notebook, tray, dupatta, pallu.
  * Finishing        finish_character(): join, regions, bake (kit.finish_atlas), skin, anchors.
  * Clips            extra clips on the shared skeleton (sprint, idle_look, sit, sit_ground, talk,
                     wave, clap, fall, getup, pick, push_cart, idle_cart, kite_fly, ride_kainchi,
                     ride_scooty, ride_pillion) + a gait authoring variant with arm overrides.
  * GLB optimizer    strip_constant_channels(): after export, animation channels that hold the
                     bone's rest value for the whole clip are dropped (the runtime's mixer returns
                     unanimated bones to rest), and the binary is compacted (clip libraries are ~40 %
                     smaller). Registered with atexit from the builders, manifest bytes updated.
"""
import math
import os
import json
import struct
import atexit
import random
import time
import bpy
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import loft, material

BASE = list(kit.REGIONS)   # none skin hair shirt stripes pants shoes accent
# loft / lathe segment counts round the main forms (characters are <= 4000 tris with their slots)
SEG = {'torso': 12, 'arm': 8, 'hand': 6, 'thumb': 5, 'leg': 8, 'shoe': 8, 'foot': 7, 'skirt': 14, 'head': 14, 'eye': 8, 'hair': 14, 'cap': 12}
MAX_REGIONS = 24


def V(*a):
    return Vector(a)


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def mir(p, sx):
    return (p[0] * sx, p[1], p[2])


def smooth01(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


# =========================================================================== rules (look -> bool)
def F(field, *vals):
    return {'f': field} if not vals else {'f': field, 'in': list(vals)}


def RE(field, pat):
    return {'f': field, 're': pat}


def ANY(*r):
    return {'any': list(r)}


def ALL(*r):
    return {'all': list(r)}


def NOT(r):
    return {'not': r}


def rule_eval(rule, look):
    """python mirror of the runtime rule evaluation (previews / tests)"""
    if rule is True or rule is None:
        return True
    if rule is False:
        return False
    if 'any' in rule:
        return any(rule_eval(r, look) for r in rule['any'])
    if 'all' in rule:
        return all(rule_eval(r, look) for r in rule['all'])
    if 'not' in rule:
        return not rule_eval(rule['not'], look)
    v = look.get(rule['f'])
    if 'in' in rule:
        return v in rule['in']
    if 're' in rule:
        import re
        return isinstance(v, str) and re.search(rule['re'], v) is not None
    if 'lt' in rule:
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v < rule['lt']
    if 'gt' in rule:
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v > rule['gt']
    return bool(v)


def LT(field, x):
    """numeric field below x (the runtime's per-person `_r` in [0, 1) makes variety: LT('_r', 0.6))"""
    return {'f': field, 'lt': x}


def GT(field, x):
    return {'f': field, 'gt': x}


# =========================================================================== regions + slots
class Look:
    """Tint / accessory spec of one asset (-> A.tint). slot(name, show, tint) reserves a region
    index >= 8 for an accessory; field(region, specs) says which look fields colour a region."""

    def __init__(self):
        self.names = list(BASE)
        self.fields = {}
        self.show = {}
        self.slots = {}
        self.base = {}      # region -> baked base colour (overrides the first material's colour)

    def slot(self, name, show=True, tint=None):
        if name in self.slots:
            return self.slots[name]
        idx = len(self.names)
        assert idx < MAX_REGIONS, 'too many regions'
        self.names.append(name)
        self.slots[name] = idx
        if show is not True:
            self.show[name] = show
        if tint is not None:
            self.fields[name] = list(tint) if isinstance(tint, (list, tuple)) else [tint]
        return idx

    def field(self, region, specs):
        self.fields[region] = list(specs) if isinstance(specs, (list, tuple)) else [specs]
        return self

    def idx(self, name):
        return self.names.index(name)

    def spec(self, ob):
        regs = region_colours(ob, self.names)
        regs.update({k: v for k, v in self.base.items() if k in self.names})
        return {'attribute': '_REGION', 'names': self.names, 'regions': regs, 'fields': self.fields, 'show': self.show}


def write_regions(ob):
    """_REGION point attribute from each face's material region (kit.write_regions without the
    8-region limit): edges between faces of different regions are split first."""
    me = ob.data
    regs = [int(m.get('nos_region', 0)) if m else 0 for m in me.materials]
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
    return sorted(set(regs))


def region_colours(ob, names):
    out = {}
    for m in ob.data.materials:
        if not m:
            continue
        r = int(m.get('nos_region', 0))
        if r and r < len(names):
            spec = json.loads(m.get('nos', '{}'))
            out.setdefault(names[r], spec.get('base', '#808080'))
    return out


# =========================================================================== materials
def mat(key, name, region=0, **kw):
    return material(key, name, region=region, **kw)


def _albedo_src(m):
    nt = m.node_tree
    alb = nt.nodes['NOS_ALBEDO']
    return nt, alb, alb.inputs[0].links[0].from_socket


def add_checks(m, line, scale=2.4, width=0.09, soft=0.03, both=True, strength=0.9):
    """Woven checks (lungi, Immu's half-shirt) mixed into a library material's albedo: lines along
    z (bands) and around the body (x + y), so the pattern reads from every side."""
    nt, alb, src = _albedo_src(m)
    B = kit.NodeBuilder(m)
    coord = nt.nodes['NOS_COORD'].outputs[0]
    sep = B.node('ShaderNodeSeparateXYZ')
    B.link(coord, sep.inputs[0])

    def band(sock):
        s = B.math('MULTIPLY', sock, scale)
        fr = B.math('FRACT', s)
        d = B.math('ABSOLUTE', B.math('SUBTRACT', fr, 0.5))
        return B.math('SUBTRACT', 1.0, B.ramp(d, width, width + soft))

    a = band(sep.outputs[2])
    u = B.math('ADD', sep.outputs[0], sep.outputs[1])
    b = band(u) if both else B.value(0.0)
    f = B.math('MAXIMUM', a, b)
    f = B.math('MULTIPLY', f, strength)
    col = B.mix(f, src, B.rgb(kit.lin(line)))
    B.link(col, alb.inputs[0])
    return m


def add_bands(m, line, z0, z1, n=2, width=0.05, strength=0.9):
    """Thin horizontal lines between z0 and z1 (zari lines inside a saree border, cuff piping)."""
    nt, alb, src = _albedo_src(m)
    B = kit.NodeBuilder(m)
    geo = B.node('ShaderNodeNewGeometry')
    sep = B.node('ShaderNodeSeparateXYZ')
    B.link(geo.outputs['Position'], sep.inputs[0])
    t = B.math('DIVIDE', B.math('SUBTRACT', sep.outputs[2], z0), max(1e-3, (z1 - z0)))
    s = B.math('MULTIPLY', t, float(n))
    d = B.math('ABSOLUTE', B.math('SUBTRACT', B.math('FRACT', s), 0.5))
    f = B.math('SUBTRACT', 1.0, B.ramp(d, width * n, width * n + 0.04))
    inside = B.math('MULTIPLY', B.math('GREATER_THAN', t, 0.0), B.math('LESS_THAN', t, 1.0))
    f = B.math('MULTIPLY', B.math('MULTIPLY', f, inside), strength)
    col = B.mix(f, src, B.rgb(kit.lin(line)))
    B.link(col, alb.inputs[0])
    return m


def add_dots(m, dot, scale=7.0, size=0.18, strength=0.9):
    """Small polka dots (Chitti's frock, a printed nightie)."""
    nt, alb, src = _albedo_src(m)
    B = kit.NodeBuilder(m)
    vor = B.node('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = scale
    B.link(nt.nodes['NOS_COORD'].outputs[0], vor.inputs['Vector'])
    d = vor.outputs['Distance']
    f = B.math('MULTIPLY', B.math('SUBTRACT', 1.0, B.ramp(d, size, size + 0.05)), strength)
    col = B.mix(f, src, B.rgb(kit.lin(dot)))
    B.link(col, alb.inputs[0])
    return m


# =========================================================================== body dimensions
# Torso rings (crotch -> neck) per rig. c = centre, r = (half width, half depth). Names are levels
# the garments refer to.
LEVELS = ['crotch', 'hip', 'waist_lo', 'waist', 'waist_hi', 'belly', 'ribs', 'chest', 'shoulder', 'collar_lo', 'collar', 'neck_lo', 'neck', 'neck_hi']
TORSO = {
    'kid': [((0, 0.02, 2.96), (0.47, 0.32)), ((0, 0.02, 3.18), (0.60, 0.38)), ((0, 0.02, 3.44), (0.60, 0.385)),
            ((0, 0.02, 3.50), (0.635, 0.41)), ((0, 0.02, 3.60), (0.62, 0.40)), ((0, 0.0, 3.95), (0.60, 0.40)),
            ((0, 0.01, 4.35), (0.60, 0.38)), ((0, 0.0, 4.80), (0.65, 0.38)), ((0, 0.02, 5.14), (0.67, 0.36)),
            ((0, 0.04, 5.36), (0.50, 0.30)), ((0, 0.05, 5.46), (0.30, 0.28)), ((0, 0.06, 5.50), (0.25, 0.235)),
            ((0, 0.07, 5.70), (0.24, 0.225)), ((0, 0.06, 5.92), (0.22, 0.21))],
    'adult': [((0, 0.02, 3.92), (0.58, 0.41)), ((0, 0.02, 4.20), (0.76, 0.49)), ((0, 0.02, 4.55), (0.74, 0.48)),
              ((0, 0.02, 4.60), (0.80, 0.53)), ((0, 0.02, 4.72), (0.78, 0.515)), ((0, 0.02, 5.10), (0.75, 0.50)),
              ((0, 0.0, 5.55), (0.79, 0.52)), ((0, -0.01, 6.10), (0.87, 0.53)), ((0, 0.01, 6.60), (0.89, 0.49)),
              ((0, 0.05, 6.92), (0.67, 0.39)), ((0, 0.06, 7.04), (0.41, 0.38)), ((0, 0.07, 7.12), (0.32, 0.31)),
              ((0, 0.08, 7.35), (0.30, 0.29)), ((0, 0.08, 7.62), (0.28, 0.27))],
}
TORSO_W = [{'hips': 1}, {'hips': 1}, {'hips': 0.85, 'spine': 0.15}, {'hips': 0.8, 'spine': 0.2}, {'hips': 0.6, 'spine': 0.4},
           {'spine': 1}, {'spine': 0.5, 'chest': 0.5}, {'chest': 1}, {'chest': 1}, {'chest': 1}, {'chest': 0.7, 'neck': 0.3},
           {'chest': 0.5, 'neck': 0.5}, {'neck': 1}, {'neck': 0.4, 'head': 0.6}]


def rig_of(J):
    return 'kid' if J['head'][2] < 6.5 else 'adult'


class Body:
    """Builds the body parts of one character into self.parts (objects with vertex groups); parts
    without groups get weights later via self.rigid (obj -> bone / dict / fn)."""

    def __init__(self, J, M, spec):
        self.J = J
        self.M = M
        self.s = dict(spec)
        self.rig = rig_of(J)
        self.k = 1.0 if self.rig == 'kid' else 1.32    # radius scale kid -> adult
        self.parts = []
        self.rigid = []

    def add(self, ob, w=None):
        if ob is None:
            return None
        if w is not None:
            self.rigid.append((ob, w))
        self.parts.append(ob)
        return ob

    # ------------------------------------------------------------------ torso
    def torso(self):
        s, M = self.s, self.M
        rings = [list(x) for x in TORSO[self.rig]]
        bel = s.get('belly', 0.0)
        fem = s.get('female', False)
        out = []
        for i, ((c, r), w) in enumerate(zip(rings, TORSO_W)):
            c = list(c)
            rx, ry = r
            name = LEVELS[i]
            if bel and name in ('waist_lo', 'waist', 'waist_hi', 'belly', 'ribs'):
                k = {'waist_lo': 0.45, 'waist': 0.7, 'waist_hi': 0.85, 'belly': 1.0, 'ribs': 0.55}[name] * bel
                ry += 0.30 * k * self.k
                rx += 0.08 * k * self.k
                c[1] -= 0.18 * k * self.k
            if fem:
                if name in ('waist_hi', 'belly'):
                    rx *= 0.88
                if name in ('crotch', 'hip', 'waist_lo'):
                    rx *= 1.05
                    ry *= 1.04
                if name == 'chest':
                    ry += 0.10
                    c[1] -= 0.08
                if name == 'ribs':
                    rx *= 0.92
                if name == 'shoulder':
                    rx *= 0.93
            out.append(dict(c=tuple(c), r=(rx, ry), p=2.25 if i < 9 else 2.0, w=w))
        top, bottom = s.get('top', 'tee'), s.get('bottom', 'shorts')
        skirt = bottom in ('lungi', 'lungi_up', 'dhoti', 'saree', 'skirt', 'frock') or s.get('tail') in ('burqa',)
        mt, mb, sk = M['top'], M.get('bottom', M['top']), M['skin']
        # materials per segment (the segment starting at ring i)
        for i, rg in enumerate(out):
            nm = LEVELS[i]
            if i <= 2:
                rg['mat'] = mb
            elif i == 3:
                rg['mat'] = M.get('belt', mt) if s.get('tucked') else mt
            elif i < 9:
                rg['mat'] = mt
            elif i < 11:
                rg['mat'] = M.get('collar', mt)
            else:
                rg['mat'] = sk
            if top in ('banian', 'blouse') and nm in ('collar_lo', 'collar'):
                rg['mat'] = sk if nm == 'collar' else M.get('collar', mt)
            if top == 'blouse' and nm in ('waist', 'waist_hi', 'belly'):
                rg['mat'] = sk
            if top == 'burqa' and i >= 9:
                rg['mat'] = mt
        if s.get('tucked') and not skirt:
            out[3]['mat'] = M.get('belt', mb)
            out[2]['mat'] = mb
        start = 0
        if skirt:
            start = 2   # the skirt covers crotch / hip
        rings2 = out[start:]
        if top == 'burqa':
            rings2 = rings2[:-1]
        ob = loft('torso', rings2, seg=SEG['torso'], side=(1, 0, 0), cap_start=bool(start), cap_end=False)
        self.add(ob)
        # shirt collar points
        col = s.get('collar')
        cz = TORSO[self.rig][10][0][2]
        k = self.k
        if col == 'shirt':
            for sx in (1, -1):
                o = kit.prism_from_outline('collar_pt', [(-0.13 * k, 0), (0.15 * k, 0.02 * k), (0.03 * k, -0.30 * k)], 0.045 * k,
                                           center=(0, 0, 0), mat=M.get('collar', mt))
                if sx < 0:
                    for v in o.data.vertices:
                        v.co.x = -v.co.x
                    o.data.flip_normals()
                o.rotation_euler = (math.radians(-25), 0, math.radians(-22 * sx))
                o.location = (0.17 * sx * k, -TORSO[self.rig][10][1][1] * 0.95, cz - 0.03)
                kit.apply_transform(o)
                self.add(o, 'chest')
        if s.get('pocket'):
            pz = TORSO[self.rig][7][0][2] - 0.05 * k
            ry = TORSO[self.rig][7][1][1]
            o = kit.box('pocket', (0.34 * k, 0.04, 0.38 * k), (0.33 * k, -ry - 0.0, pz), M.get('pocket', mt), bevel=0.02, segments=1)
            kit.apply_modifiers(o)
            self.add(o, 'chest')
            if s.get('pens'):
                for j in range(s['pens']):
                    pn = kit.cylinder('pen', 0.028 * k, 0.36 * k, (0.25 * k + j * 0.08 * k, -ry - 0.05, pz + 0.02), seg=6, mat=M.get('pen', M['skin']))
                    self.add(pn, 'chest')
        return ob

    # ------------------------------------------------------------------ arms + hands
    def arms(self):
        s, M, J, k = self.s, self.M, self.J, self.k
        sleeve = s.get('sleeve', 'short')
        mt, sk = M['top'], M['skin']
        ms = M.get('sleeve', mt)
        cuff = M.get('cuff', ms)
        sh, el, wr, tip = J['shoulder'], J['elbow'], J['wrist'], J['hand_tip']
        fat = s.get('arm_fat', 1.0)
        for sx in (1, -1):
            S = 'L' if sx > 0 else 'R'

            def au(t):
                return mir(lerp(sh, el, t), sx)

            def af(t):
                return mir(lerp(el, wr, t), sx)
            ua, fa, hd = 'upperarm_' + S, 'forearm_' + S, 'hand_' + S
            r_sh = 0.25 * k * fat
            r_ua = 0.215 * k * fat
            r_el = 0.165 * k * fat
            r_fa = 0.17 * k * fat
            r_wr = 0.125 * k * fat
            rings = [dict(c=mir((0.38 * k, 0.06, sh[2] - 0.05 * k), sx), r=0.22 * k, w={'chest': 1}),
                     dict(c=mir((sh[0] * 0.86, 0.07, sh[2] + 0.0), sx), r=r_sh, w={'chest': 0.4, ua: 0.6})]
            bare_sh = sleeve == 'none'
            rings[0]['mat'] = sk if bare_sh else ms
            rings[1]['mat'] = sk if bare_sh else ms
            hem = {'short': 0.52, 'elbow': 0.98, 'long': None, 'none': None, 'cap': 0.25}.get(sleeve)
            if sleeve == 'none':
                rings += [dict(c=au(0.15), r=r_ua * 1.02, w={ua: 1}, mat=sk), dict(c=au(0.5), r=r_ua * 0.95, w={ua: 1}, mat=sk)]
            elif sleeve in ('short', 'cap', 'elbow'):
                stripe = s.get('sleeve_stripes')
                rings.append(dict(c=au(0.12), r=r_ua * 1.12, w={ua: 1}, mat=ms))
                if stripe and sleeve == 'short':
                    rings += [dict(c=au(0.26), r=r_ua * 1.10, w={ua: 1}, mat=M['stripe']),
                              dict(c=au(0.33), r=r_ua * 1.10, w={ua: 1}, mat=ms)]
                if sleeve == 'elbow':
                    rings.append(dict(c=au(0.6), r=r_ua * 1.12, w={ua: 1}, mat=ms))
                    rings += [dict(c=af(0.08), r=r_el * 1.22, w={ua: 0.4, fa: 0.6}, mat=cuff),
                              dict(c=af(0.14), r=r_el * 1.24, w={fa: 1}, mat=cuff),
                              dict(c=af(0.145), r=r_fa * 0.98, w={fa: 1}, mat=sk)]
                else:
                    rings += [dict(c=au(hem - 0.07), r=r_ua * 1.15, w={ua: 1}, mat=cuff if stripe is None else (M['stripe'] if stripe else cuff)),
                              dict(c=au(hem), r=r_ua * 1.17, w={ua: 1}, mat=cuff if stripe is None else (M['stripe'] if stripe else cuff)),
                              dict(c=au(hem + 0.005), r=r_ua * 0.92, w={ua: 1}, mat=sk)]
            else:  # long sleeves
                rings += [dict(c=au(0.2), r=r_ua * 1.12, w={ua: 1}, mat=ms), dict(c=au(0.6), r=r_ua * 1.08, w={ua: 1}, mat=ms)]
            if sleeve == 'long':
                rings += [dict(c=au(1.0), r=r_el * 1.2, w={ua: 0.5, fa: 0.5}, mat=ms),
                          dict(c=af(0.45), r=r_fa * 1.15, w={fa: 1}, mat=ms),
                          dict(c=af(0.86), r=r_wr * 1.35, w={fa: 0.9, hd: 0.1}, mat=cuff),
                          dict(c=af(0.93), r=r_wr * 1.38, w={fa: 0.8, hd: 0.2}, mat=cuff),
                          dict(c=af(0.935), r=r_wr * 0.95, w={fa: 0.7, hd: 0.3}, mat=sk),
                          dict(c=af(1.0), r=r_wr * 0.9, w={fa: 0.4, hd: 0.6}, mat=sk)]
            elif sleeve == 'elbow':
                rings += [dict(c=af(0.5), r=r_fa * 0.95, w={fa: 1}, mat=sk),
                          dict(c=af(0.8), r=r_wr * 1.05, w={fa: 0.9, hd: 0.1}, mat=sk),
                          dict(c=af(1.0), r=r_wr * 0.9, w={fa: 0.4, hd: 0.6}, mat=sk)]
            else:
                rings += [dict(c=au(0.8), r=r_ua * 0.82, w={ua: 0.85, fa: 0.15}, mat=sk),
                          dict(c=au(1.0), r=r_el, w={ua: 0.5, fa: 0.5}, mat=sk),
                          dict(c=af(0.3), r=r_fa, w={fa: 1}, mat=sk),
                          dict(c=af(0.75), r=r_wr * 1.05, w={fa: 0.9, hd: 0.1}, mat=sk),
                          dict(c=af(1.0), r=r_wr * 0.9, w={fa: 0.4, hd: 0.6}, mat=sk)]
            self.add(loft('arm_' + S, rings, seg=SEG['arm'], side=(0, 1, 0), cap_start=True, cap_end=True))
            self.hand(sx, S)

    def hand(self, sx, S):
        """chunky mitten (palm towards the thigh) + a thumb"""
        J, k, sk = self.J, self.k, self.M['skin']
        wr, tip = J['wrist'], J['hand_tip']
        hk = k * self.s.get('hand', 1.0)
        hd = 'hand_' + S
        H = [dict(c=mir(lerp(wr, tip, -0.02), sx), r=(0.115 * hk, 0.09 * hk)),
             dict(c=mir(lerp(wr, tip, 0.28), sx), r=(0.15 * hk, 0.085 * hk)),
             dict(c=mir(lerp(wr, tip, 0.60), sx), r=(0.155 * hk, 0.082 * hk)),
             dict(c=mir(lerp(wr, tip, 0.88), sx), r=(0.13 * hk, 0.07 * hk)),
             dict(c=mir(lerp(wr, tip, 1.02), sx), r=(0.06 * hk, 0.04 * hk))]
        for h in H:
            h['w'] = {hd: 1}
            h['mat'] = sk
        self.add(loft('hand_' + S, H, seg=SEG['hand'], side=(0, -1, 0)))
        th0 = mir(lerp(wr, tip, 0.22), sx)
        th = [dict(c=th0, r=0.065 * hk, w={hd: 1}, mat=sk),
              dict(c=(th0[0] + 0.06 * sx * hk, th0[1] - 0.15 * hk, th0[2] - 0.08 * hk), r=0.06 * hk, w={hd: 1}, mat=sk),
              dict(c=(th0[0] + 0.09 * sx * hk, th0[1] - 0.24 * hk, th0[2] - 0.17 * hk), r=0.04 * hk, w={hd: 1}, mat=sk)]
        self.add(loft('thumb_' + S, th, seg=SEG['thumb'], side=(1, 0, 0)))

    # ------------------------------------------------------------------ legs
    def legs(self):
        s, M, J, k = self.s, self.M, self.J, self.k
        bottom = s.get('bottom', 'shorts')
        mb, sk = M.get('bottom', M['top']), M['skin']
        hp, kn, an = J['hip'], J['knee'], J['ankle']
        fat = s.get('leg_fat', 1.0)
        for sx in (1, -1):
            S = 'L' if sx > 0 else 'R'
            th, sh, ft = 'thigh_' + S, 'shin_' + S, 'foot_' + S

            def lt(t):
                return mir(lerp(hp, kn, t), sx)

            def ls(t):
                return mir(lerp(kn, an, t), sx)
            r_th = 0.33 * k * fat
            r_kn = 0.205 * k * fat
            r_cf = 0.215 * k * fat
            r_an = 0.135 * k * fat
            top = [dict(c=mir((0.27 * k, 0.02, hp[2]), sx), r=0.34 * k * fat, w={'hips': 1}),
                   dict(c=mir((0.33 * k, 0.0, hp[2] - 0.28 * k), sx), r=(0.38 * k * fat, 0.37 * k * fat), w={'hips': 0.45, th: 0.55})]
            if bottom == 'shorts':
                hem = s.get('hem', 0.48)
                rings = top + [dict(c=lt(0.25), r=r_th * 1.04, w={th: 1}),
                               dict(c=lt(hem - 0.05), r=r_th * 1.06, w={th: 1}),
                               dict(c=lt(hem), r=r_th * 1.08, w={th: 1}),
                               dict(c=lt(hem + 0.005), r=r_th * 0.72, w={th: 1}, mat=sk),
                               dict(c=lt(0.78), r=r_kn * 1.12, w={th: 0.9, sh: 0.1}, mat=sk),
                               dict(c=lt(1.0), r=r_kn, w={th: 0.5, sh: 0.5}, mat=sk),
                               dict(c=ls(0.25), r=(r_cf, r_cf * 1.06), w={sh: 1}, mat=sk),
                               dict(c=ls(0.7), r=r_an * 1.12, w={sh: 1}, mat=sk),
                               dict(c=ls(0.95), r=r_an, w={sh: 0.6, ft: 0.4}, mat=sk),
                               dict(c=mir((an[0], an[1] + 0.03, 0.2 * k), sx), r=r_an * 1.05, w={ft: 1}, mat=sk)]
                for r in rings[:5]:
                    r.setdefault('mat', mb)
            elif bottom in ('pants', 'pyjama', 'salwar', 'jeans'):
                baggy = 1.25 if bottom == 'salwar' else (1.12 if bottom == 'pyjama' else 1.0)
                cuffm = M.get('hemband', mb)
                rings = top + [dict(c=lt(0.25), r=r_th * 1.05 * baggy, w={th: 1}),
                               dict(c=lt(0.62), r=r_th * 0.9 * baggy, w={th: 1}),
                               dict(c=lt(1.0), r=r_kn * 1.25 * baggy, w={th: 0.5, sh: 0.5}),
                               dict(c=ls(0.3), r=r_cf * 1.18 * baggy, w={sh: 1}),
                               dict(c=ls(0.72), r=r_an * 1.65 * (1.05 if bottom != 'salwar' else 1.0), w={sh: 1})]
                if bottom == 'salwar':
                    rings += [dict(c=ls(0.86), r=r_an * 1.55, w={sh: 1}, mat=cuffm),
                              dict(c=ls(0.93), r=r_an * 1.25, w={sh: 0.7, ft: 0.3}, mat=cuffm),
                              dict(c=ls(0.935), r=r_an * 0.95, w={sh: 0.6, ft: 0.4}, mat=sk)]
                else:
                    rings += [dict(c=ls(0.9), r=r_an * 1.72, w={sh: 0.7, ft: 0.3}, mat=cuffm),
                              dict(c=ls(0.94), r=r_an * 1.72, w={sh: 0.6, ft: 0.4}, mat=cuffm),
                              dict(c=ls(0.945), r=r_an * 0.95, w={sh: 0.6, ft: 0.4}, mat=sk)]
                rings += [dict(c=mir((an[0], an[1] + 0.03, 0.2 * k), sx), r=r_an * 1.05, w={ft: 1}, mat=sk)]
                for r in rings:
                    r.setdefault('mat', mb)
            else:
                # under a skirt: only the shin below the hem shows (+ a hidden stub up to the knee)
                hemz = s.get('hem_z', 0.9)
                t0 = max(0.0, min(0.9, 1 - (hemz + 0.5 * k - an[2]) / (kn[2] - an[2])))
                rings = [dict(c=ls(t0), r=r_cf * 0.9, w={sh: 1}, mat=sk)]
                if t0 < 0.3:
                    rings.append(dict(c=ls(0.3), r=(r_cf, r_cf * 1.05), w={sh: 1}, mat=sk))
                rings += [dict(c=ls(0.7), r=r_an * 1.12, w={sh: 1}, mat=sk),
                          dict(c=ls(0.95), r=r_an, w={sh: 0.6, ft: 0.4}, mat=sk),
                          dict(c=mir((an[0], an[1] + 0.03, 0.2 * k), sx), r=r_an * 1.05, w={ft: 1}, mat=sk)]
            self.add(loft('leg_' + S, rings, seg=SEG['leg'], side=(1, 0, 0), cap_start=True, cap_end=True))
            self.foot(sx, S)

    def foot(self, sx, S):
        J, k, sk = self.J, self.k, self.M['skin']
        an, bl, tp = J['ankle'], J['ball'], J['toe']
        ft, to = 'foot_' + S, 'toe_' + S
        fw = self.s.get('foot', 'chappal')
        if fw in ('shoes', 'boots'):
            sm = self.M.get('shoe', self.M['skin'])
            rings = [dict(c=mir((an[0], an[1] + 0.27 * k, 0.24 * k), sx), r=(0.15 * k, 0.1 * k), w={ft: 1}, mat=sm),
                     dict(c=mir((an[0], an[1] + 0.03, (0.42 if fw == 'boots' else 0.3) * k), sx), r=(0.2 * k, 0.21 * k), w={ft: 1}, mat=sm),
                     dict(c=mir((an[0], an[1] - 0.32 * k, 0.22 * k), sx), r=(0.21 * k, 0.15 * k), w={ft: 1}, mat=sm),
                     dict(c=mir((bl[0], bl[1] + 0.05, 0.17 * k), sx), r=(0.21 * k, 0.12 * k), w={ft: 0.5, to: 0.5}, mat=sm),
                     dict(c=mir((tp[0], tp[1] + 0.12 * k, 0.15 * k), sx), r=(0.185 * k, 0.1 * k), w={to: 1}, mat=sm),
                     dict(c=mir((tp[0], tp[1] - 0.04, 0.12 * k), sx), r=(0.09 * k, 0.06 * k), w={to: 1}, mat=sm)]
            o = loft('shoe_' + S, rings, seg=SEG['shoe'], side=(1, 0, 0))
            self.add(o)
            # sole (flat on z = 0)
            so = self.M.get('sole', sm)
            out = [(-0.17, 0.36), (0.0, 0.42), (0.17, 0.36), (0.21, 0.0), (0.23, -0.45), (0.22, -0.74), (0.12, -0.98), (-0.04, -1.02), (-0.19, -0.86), (-0.22, -0.5), (-0.2, 0.0)]
            self.sole(sx, S, out, 0.0, 0.07 * k, so, None)
            return
        # bare foot (on chappals / sandals)
        rings = [dict(c=mir((an[0], an[1] + 0.24 * k, 0.16 * k), sx), r=(0.12 * k, 0.09 * k), w={ft: 1}),
                 dict(c=mir((an[0], an[1] + 0.02, 0.2 * k), sx), r=(0.155 * k, 0.135 * k), w={ft: 1}),
                 dict(c=mir((an[0], an[1] - 0.28 * k, 0.16 * k), sx), r=(0.175 * k, 0.095 * k), w={ft: 1}),
                 dict(c=mir((bl[0], bl[1] + 0.05, 0.135 * k), sx), r=(0.185 * k, 0.07 * k), w={ft: 0.5, to: 0.5}),
                 dict(c=mir((tp[0], tp[1] + 0.08 * k, 0.115 * k), sx), r=(0.165 * k, 0.055 * k), w={to: 1}),
                 dict(c=mir((tp[0], tp[1] - 0.01, 0.11 * k), sx), r=(0.09 * k, 0.04 * k), w={to: 1})]
        for r in rings:
            r['mat'] = sk
        self.add(loft('foot_' + S, rings, seg=SEG['foot'], side=(1, 0, 0)))
        if fw == 'bare':
            return
        s2 = self.k * (1.0 if self.rig == 'kid' else 0.98)
        outline = [(-0.17, 0.34), (0.0, 0.40), (0.17, 0.34), (0.20, 0.0), (0.22, -0.45), (0.22, -0.72), (0.12, -0.95), (-0.04, -0.98), (-0.18, -0.85), (-0.21, -0.5), (-0.19, 0.0)]
        outline = [(x * s2, y * s2) for (x, y) in outline]
        self.sole(sx, S, outline, 0.0, 0.035 * k, self.M['sole'], self.M.get('bed'))
        x0 = J['ankle'][0] * sx
        st = self.M['strap']
        if fw == 'chappal':
            t0 = (x0 + 0.02 * sx * s2, -0.62 * s2, 0.07 * k)
            for side in (1, -1):
                pts = [t0, (x0 + 0.06 * side * sx * s2, -0.42 * s2, 0.2 * k), (x0 + 0.15 * side * sx * s2, -0.2 * s2, 0.2 * k), (x0 + 0.2 * side * sx * s2, -0.08 * s2, 0.07 * k)]
                self.add(kit.tube('strap', pts, 0.036 * k, seg=4, mat=st), self._sole_w(S))
        else:  # sandal: a broad strap over the instep + a toe loop + heel strap
            pts = [(x0 - 0.21 * s2 * sx, -0.3 * s2, 0.06 * k), (x0 - 0.12 * s2 * sx, -0.32 * s2, 0.24 * k), (x0 + 0.05 * s2 * sx, -0.33 * s2, 0.27 * k), (x0 + 0.2 * s2 * sx, -0.3 * s2, 0.08 * k)]
            self.add(kit.tube('strap', pts, 0.06 * k, seg=6, mat=st), self._sole_w(S))
            pts = [(x0 - 0.17 * s2 * sx, 0.18 * s2, 0.06 * k), (x0, 0.26 * s2, 0.2 * k), (x0 + 0.17 * s2 * sx, 0.18 * s2, 0.06 * k)]
            self.add(kit.tube('heel_strap', pts, 0.035 * k, seg=5, mat=st), self._sole_w(S))
            self.add(kit.tube('toe_loop', [(x0 - 0.12 * s2 * sx, -0.66 * s2, 0.05 * k), (x0 - 0.1 * s2 * sx, -0.68 * s2, 0.14 * k), (x0 - 0.05 * s2 * sx, -0.66 * s2, 0.05 * k)], 0.03 * k, seg=5, mat=st), self._sole_w(S))

    def _sole_w(self, S):
        s = self.k

        def w(co, S=S):
            t = min(1.0, max(0.0, (co.y - (-0.62 * s)) / (0.22 * s)))
            return {'foot_' + S: t, 'toe_' + S: 1 - t}
        return w

    def sole(self, sx, S, outline, z0, z1, m_sole, m_bed):
        """a flat sole slab on z = 0 (one object: the top face gets the bed material)"""
        J = self.J
        x0 = J['ankle'][0] * sx
        if sx < 0:
            outline = [(-x, y) for (x, y) in reversed(outline)]
        poly = [(x0 + x, y) for (x, y) in outline]
        top = z1 + (0.03 * self.k if m_bed is not None else 0.0)
        o = kit.extrude_polygon('sole', poly, z0, top, m_sole)
        if m_bed is not None:
            if m_bed.name not in [m.name for m in o.data.materials if m]:
                o.data.materials.append(m_bed)
            bi = [m.name for m in o.data.materials].index(m_bed.name)
            for p in o.data.polygons:
                if p.normal.z > 0.9:
                    p.material_index = bi
        self.add(o, self._sole_w(S))

    # ------------------------------------------------------------------ skirts (wraps / tails)
    def skirt(self, kind=None, m=None, hem_z=None, flare=None, z_top=None, front_pleat=False, border=None, slit=False, rings_n=6):
        """A wrap or tail from the waist down: lungi, dhoti, saree, frock, kurta / kameez / burqa
        tails. Weights per vertex: hips at the top, the thigh of its side lower down (centre front /
        back shared), a little shin at a long hem so it swings with the stride."""
        J, k, s = self.J, self.k, self.s
        kind = kind or s.get('bottom')
        m = m or self.M.get('bottom')
        hz = J['hip'][2]
        tr = TORSO[self.rig]
        z0 = z_top if z_top is not None else (tr[3][0][2] if kind not in ('kameez', 'kurta', 'burqa') else tr[3][0][2])
        hem = hem_z if hem_z is not None else {'lungi': 0.45 * k, 'saree': 0.18 * k, 'dhoti': 0.5 * k, 'lungi_up': J['knee'][2] - 0.1,
                                                 'frock': J['knee'][2] + 0.25, 'skirt': J['knee'][2] - 0.2, 'kameez': J['knee'][2] - 0.05,
                                                 'kurta': J['knee'][2] + 0.1, 'burqa': 0.15 * k}.get(kind, 0.4)
        fl = flare if flare is not None else {'saree': 1.18, 'lungi': 1.12, 'lungi_up': 1.08, 'dhoti': 1.15, 'frock': 1.45, 'skirt': 1.3,
                                               'kameez': 1.12, 'kurta': 1.08, 'burqa': 1.32}.get(kind, 1.1)
        w0 = tr[3][1]
        bel = s.get('belly', 0.0)
        rx0, ry0 = w0[0] * 1.03 + 0.04 * k * bel, w0[1] * 1.05 + 0.25 * k * bel
        if s.get('female'):
            rx0 *= 1.05
        hipw = max(rx0, (J['hip'][0] + 0.38 * k)) * 1.02
        rings = []
        n = rings_n
        for i in range(n + 1):
            t = i / n
            z = z0 + (hem - z0) * t
            # widest at the seat, then hanging (+ flare towards the hem)
            seat = math.sin(min(1.0, t * 2.2) * math.pi / 2)
            rx = rx0 + (hipw - rx0) * seat + (hipw * fl - hipw) * max(0.0, t - 0.3) / 0.7
            ry = ry0 + (ry0 * 1.12 - ry0) * seat + (ry0 * 1.12 * fl * 0.95 - ry0 * 1.12) * max(0.0, t - 0.3) / 0.7
            rings.append(dict(c=(0, 0.02 + 0.03 * t, z), r=(rx, ry), p=2.2, w={'hips': 1}, mat=m))
        # border band at the hem (saree / dhoti border) + a hem lip (fabric thickness)
        if border is not None:
            bm_ = border[0] if isinstance(border, tuple) else border
            bz = border[1] if isinstance(border, tuple) else 0.35 * k
            step = (z0 - hem) / n
            bz = min(bz, 0.8 * step)
            A_, B_ = rings[-2], rings[-1]
            f = bz / step
            rb = (B_['r'][0] + (A_['r'][0] - B_['r'][0]) * f, B_['r'][1] + (A_['r'][1] - B_['r'][1]) * f)
            rings.insert(len(rings) - 1, dict(c=(0, B_['c'][1], hem + bz), r=rb, p=2.2, w={'hips': 1}, mat=bm_))
            rings[-1]['mat'] = bm_
        last = rings[-1]
        rings.append(dict(c=(last['c'][0], last['c'][1], hem), r=(last['r'][0] * 0.94, last['r'][1] * 0.94), p=2.2, w={'hips': 1}, mat=last.get('mat', m)))
        ob = loft('skirt_' + kind, rings, seg=SEG['skirt'], side=(1, 0, 0), cap_start=False, cap_end=False)
        # the hem has a visible inside: a second, slightly smaller ring going up (thickness)
        ob = self._thicken_hem(ob, 0.05 * k)
        hipL = Vector(J['hip'])
        knee_z = J['knee'][2]
        long = hem < knee_z - 0.6

        def wf(co):
            t = min(1.0, max(0.0, (z0 - co.z) / max(0.01, (z0 - hem))))
            side = co.x / max(0.2, abs(co.x) + 0.25 * k)        # -1 .. 1
            wl = smooth01(0.5 + side * 0.9)
            leg = min(1.0, t * 1.6) * (0.75 if long else 0.9)
            d = {'hips': 1.0 - leg}
            sh = 0.0
            if long and t > 0.7:
                sh = (t - 0.7) / 0.3 * 0.25
            for S, wv in (('L', wl), ('R', 1 - wl)):
                if wv > 0.001:
                    d['thigh_' + S] = leg * wv * (1 - sh)
                    if sh:
                        d['shin_' + S] = leg * wv * sh
            return d
        self.add(ob, wf)
        if front_pleat:
            # front pleats: a fan of narrow folds from the navel down (saree) / a tuck (dhoti)
            for j in range(5):
                x = -0.12 * k + j * 0.06 * k
                pts = [(x, -ry0 - 0.02, z0 - 0.15 * k), (x * 1.3, -ry0 * 1.1 - 0.06, (z0 + hem) / 2), (x * 1.6, -ry0 * 1.12 * fl * 0.95 - 0.06, hem + 0.08)]
                pl = kit.tube('pleat', pts, 0.045 * k, seg=5, mat=m)
                self.add(pl, wf)
        return ob

    def _thicken_hem(self, ob, d):
        """extrude the open bottom boundary edge inwards + upwards a little (cloth thickness)"""
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.edges.ensure_lookup_table()
        boundary = [e for e in bm.edges if e.is_boundary]
        if boundary:
            zs = [v.co.z for e in boundary for v in e.verts]
            zmin = min(zs)
            low = [e for e in boundary if all(abs(v.co.z - zmin) < 0.02 for v in e.verts)]
            if low:
                ret = bmesh.ops.extrude_edge_only(bm, edges=low)
                nv = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
                for v in nv:
                    xy = Vector((v.co.x, v.co.y, 0))
                    L = xy.length or 1.0
                    v.co.x -= v.co.x / L * d
                    v.co.y -= v.co.y / L * d
                    v.co.z += d * 1.5
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
        return ob

    # ------------------------------------------------------------------ assembly
    def build(self):
        self.torso()
        self.arms()
        self.legs()
        b = self.s.get('bottom')
        if b in ('lungi', 'lungi_up', 'dhoti', 'saree', 'skirt', 'frock'):
            self.skirt(b, border=self.s.get('border_mat'), front_pleat=b in ('saree', 'dhoti'))
        t = self.s.get('tail')
        if t:
            self.skirt(t, m=self.M['top'], border=self.s.get('tail_border'))
        return self.parts


# =========================================================================== heads, faces, hair
# Skull rings (dz above the head joint, dy, rx, ry) before scaling; the toy face sits on them.
HEADS = {
    'kid': [(-0.02, -0.10, 0.15, 0.13), (0.11, -0.08, 0.33, 0.32), (0.30, -0.03, 0.475, 0.49), (0.52, 0.02, 0.555, 0.575),
            (0.74, 0.04, 0.585, 0.60), (0.95, 0.05, 0.56, 0.59), (1.11, 0.05, 0.47, 0.50), (1.22, 0.05, 0.28, 0.30), (1.255, 0.05, 0.05, 0.06)],
    'man': [(-0.12, -0.13, 0.22, 0.17), (0.03, -0.11, 0.40, 0.35), (0.25, -0.05, 0.49, 0.50), (0.50, 0.01, 0.535, 0.56),
            (0.74, 0.04, 0.545, 0.585), (0.96, 0.05, 0.53, 0.57), (1.12, 0.05, 0.44, 0.48), (1.23, 0.05, 0.25, 0.28), (1.265, 0.05, 0.05, 0.06)],
    'woman': [(-0.08, -0.13, 0.18, 0.15), (0.06, -0.10, 0.36, 0.34), (0.27, -0.04, 0.48, 0.50), (0.51, 0.01, 0.53, 0.56),
              (0.74, 0.04, 0.545, 0.58), (0.96, 0.05, 0.525, 0.565), (1.12, 0.05, 0.44, 0.48), (1.23, 0.05, 0.25, 0.28), (1.265, 0.05, 0.05, 0.06)],
}
HEAD_SCALE = {'kid': 1.04, 'man': 1.13, 'woman': 1.09}


class Head:
    """Skull + toy face + hair for one character, built round the head joint and scaled about it.
    o: shape ('kid' | 'man' | 'woman'), age ('kid' | 'adult' | 'old'), scale, eyes ('kid' | 'adult' |
    'old'), brow (thickness), mouth ('smile' | 'grin' | 'soft' | 'straight'), nose ('button' | 'man')."""

    def __init__(self, J, M, o):
        self.J, self.M, self.o = J, M, dict(o)
        self.shape = o.get('shape', 'kid')
        self.T = HEADS[self.shape]
        self.hz = J['head'][2]
        self.cy = J['head'][1] + 0.02
        self.sc = o.get('scale', HEAD_SCALE[self.shape])
        self.parts = []     # (obj, weights)

    # surface of the skull at (x, z) (unscaled head space): y of the front surface
    def ring_at(self, z):
        T, hz = self.T, self.hz
        zs = [hz + t[0] for t in T]
        if z <= zs[0]:
            return T[0][1:]
        for i in range(len(T) - 1):
            if zs[i] <= z <= zs[i + 1]:
                f = (z - zs[i]) / max(1e-6, zs[i + 1] - zs[i])
                return tuple(T[i][j] + (T[i + 1][j] - T[i][j]) * f for j in (1, 2, 3))
        return T[-1][1:]

    def front_y(self, x, z, back=False):
        dy, rx, ry = self.ring_at(z)
        q = max(0.0, 1 - (x / max(rx, 1e-3)) ** 2)
        return self.cy + dy + (1 if back else -1) * ry * math.sqrt(q)

    def add(self, ob, w='head'):
        self.parts.append((ob, w))
        return ob

    def skull(self):
        sk = self.M['skin']
        rings = [dict(c=(0, self.cy + t[1], self.hz + t[0]), r=(t[2], t[3]), w={'head': 1}, mat=sk) for t in self.T]
        return self.add(loft('head', rings, seg=SEG['head'], side=(1, 0, 0), cap_start=True, cap_end=True))

    def face(self):
        o, M = self.o, self.M
        age = o.get('age', 'kid')
        kid = age == 'kid'
        ez = self.hz + (0.60 if kid else 0.66)
        ex = 0.205 if kid else 0.2
        # eyes: dark toy ovals with a catch-light, set into the face
        ew, eh, ed = (0.085, 0.112, 0.05) if kid else ((0.072, 0.082, 0.045) if age != 'old' else (0.065, 0.06, 0.04))
        if o.get('eyes_big'):
            ew, eh = ew * 1.1, eh * 1.1
        for sx in (1, -1):
            x = ex * sx
            y = self.front_y(x, ez) + 0.012
            e = kit.lathe('eye', [(0.0, -ed), (ew * 0.75, -ed * 0.72), (ew, 0.0), (ew * 0.75, ed * 0.72), (0.0, ed)], seg=SEG['eye'], mat=M['eye_dark'])
            e.scale = (1.0, 1.0, 1.0)
            e.rotation_euler = (math.radians(90), 0, 0)
            kit.apply_transform(e)
            for v in e.data.vertices:
                v.co.z *= eh / ew
            # tilt with the face curvature (eyes look forward and a little out)
            e.rotation_euler = (0, 0, math.radians(-14 * sx))
            e.location = (x, y, ez)
            kit.apply_transform(e)
            self.add(e)
            hl = kit.lathe('glint', [(0.0, -0.02), (0.026, 0.0), (0.0, 0.02)], seg=6, mat=M['eye_white'])
            hl.rotation_euler = (math.radians(90), 0, 0)
            hl.location = (x + 0.028 * sx * (1 if kid else 0.8) - 0.012, y - ed * 0.85, ez + eh * 0.35)
            kit.apply_transform(hl)
            self.add(hl)
            if not kid:
                # upper lid: a soft skin fold over the eye (gives age and calm)
                lid = kit.tube('lid', [(x - ew * 1.05 * sx, y - 0.0, ez + eh * 0.55), (x, y - ed * 0.9, ez + eh * 0.95), (x + ew * 1.1 * sx, y + 0.01, ez + eh * 0.5)],
                               0.03 if age != 'old' else 0.036, seg=5, mat=M['skin'])
                self.add(lid)
            # brows
            bt = o.get('brow', 0.034 if kid else 0.042)
            arch = 0.05 if self.shape == 'woman' else 0.03
            by = self.front_y(x, ez + 0.2) + 0.0
            pts = [(x - 0.11 * sx, by + 0.01, ez + 0.17), (x + 0.0 * sx, by - 0.02, ez + 0.19 + arch), (x + 0.12 * sx, by + 0.02, ez + 0.15)]
            self.add(kit.tube('brow', pts, bt, seg=5, mat=M.get('brow', M['hair'])))
            # ears
            ey = self.cy + 0.06
            rx = self.ring_at(ez - 0.08)[1]
            self.add(loft('ear', [dict(c=(rx * 0.9 * sx, ey, ez - 0.2), r=(0.04, 0.065), w={'head': 1}, mat=M['skin']),
                                  dict(c=((rx + 0.04) * sx, ey + 0.03, ez - 0.11), r=(0.04, 0.1), w={'head': 1}, mat=M['skin']),
                                  dict(c=((rx + 0.035) * sx, ey + 0.05, ez + 0.0), r=(0.032, 0.075), w={'head': 1}, mat=M['skin'])],
                              seg=6, side=(0, 1, 0)))
        # nose: a small rounded button (kids) / a bit longer (adults)
        ny = self.front_y(0, ez - 0.12)
        if kid:
            nose = [dict(c=(0, ny + 0.03, ez - 0.02), r=(0.045, 0.03)), dict(c=(0, ny - 0.035, ez - 0.13), r=(0.075, 0.055)), dict(c=(0, ny - 0.03, ez - 0.19), r=(0.055, 0.035))]
        else:
            big = 1.25 if o.get('nose') == 'big' else 1.0
            nose = [dict(c=(0, ny + 0.04, ez + 0.02), r=(0.045, 0.03)), dict(c=(0, ny - 0.04 * big, ez - 0.13), r=(0.07 * big, 0.05 * big)),
                    dict(c=(0, ny - 0.05 * big, ez - 0.22), r=(0.075 * big, 0.06 * big)), dict(c=(0, ny - 0.02, ez - 0.27), r=(0.05, 0.035))]
        for r in nose:
            r['w'] = {'head': 1}
            r['mat'] = M['skin']
        self.add(loft('nose', nose, seg=7, side=(1, 0, 0)))
        # mouth
        mz = ez - (0.40 if kid else 0.47)
        my = self.front_y(0, mz) + 0.01
        mo = o.get('mouth', 'smile')
        w = 0.13 if kid else 0.14
        if mo == 'grin':
            pts = [(-w * 1.1, my + 0.05, mz + 0.04), (-w * 0.5, my + 0.0, mz - 0.025), (0.0, my - 0.01, mz - 0.04), (w * 0.5, my + 0.0, mz - 0.025), (w * 1.1, my + 0.05, mz + 0.04)]
        elif mo == 'straight':
            pts = [(-w, my + 0.04, mz), (0.0, my, mz - 0.005), (w, my + 0.04, mz)]
        elif mo == 'soft':
            pts = [(-w * 0.9, my + 0.04, mz + 0.015), (0.0, my - 0.005, mz - 0.015), (w * 0.9, my + 0.04, mz + 0.015)]
        else:
            pts = [(-w, my + 0.04, mz + 0.03), (-w * 0.45, my + 0.0, mz - 0.01), (0.0, my - 0.005, mz - 0.02), (w * 0.45, my + 0.0, mz - 0.01), (w, my + 0.04, mz + 0.03)]
        self.add(kit.tube('mouth', pts, 0.026 if kid else 0.028, seg=5, mat=M['lips']))
        self.ez, self.mz, self.my = ez, mz, my

    # ------------------------------------------------------------------ hair
    def cap(self, m, offset=0.035, line=None, keep=None, name='haircap', crown=1.0):
        """a hair shell following the skull above a hairline. line(front 0..1, side 0..1) -> dz of the
        hairline above the head joint (default: forehead line high at the face, low at the back)."""
        rows = [(0.42, 0.0), (0.58, 0.02), (0.76, 0.045), (0.94, 0.055), (1.08, 0.055), (1.20, 0.055), (1.27, 0.05), (1.30, 0.05)]
        rings = []
        for dz, dy in rows:
            dy0, rx, ry = self.ring_at(self.hz + min(dz, 1.25))
            if dz >= 1.26:
                rx, ry = (0.14, 0.16) if dz < 1.29 else (0.03, 0.04)
            rings.append(dict(c=(0, self.cy + dy0 + 0.01, self.hz + dz + (offset * crown if dz > 1.1 else 0)), r=(rx + offset, ry + offset), w={'head': 1}, mat=m))
        hc = loft(name, rings, seg=SEG['hair'], side=(1, 0, 0), cap_start=False, cap_end=True)
        if line is None:
            def line(front, side):
                return 0.66 + 0.38 * front ** 1.5 - 0.12 * side * (1 - front)
        bm = bmesh.new()
        bm.from_mesh(hc.data)
        kill = []
        for v in bm.verts:
            y = v.co.y - self.cy
            z = v.co.z - self.hz
            front = max(0.0, -y / 0.62)
            side = min(1.0, abs(v.co.x) / 0.6)
            if (keep is not None and not keep(front, side, z)) or (keep is None and z < line(front, side)):
                kill.append(v)
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        bm.to_mesh(hc.data)
        bm.free()
        return self.add(hc)

    def tuft(self, m, base, d, L, r0, name='lock', seg=5, bend=None):
        base = Vector(base)
        d = Vector(d).normalized()
        mid = base + d * L * 0.5 + (Vector(bend) * L if bend else Vector())
        end = base + d * L + (Vector(bend) * L * 1.6 if bend else Vector())
        return self.add(loft(name, [dict(c=tuple(base - d * 0.06), r=r0 * 0.9, w={'head': 1}, mat=m), dict(c=tuple(mid), r=r0 * 0.72, w={'head': 1}, mat=m),
                                    dict(c=tuple(end), r=0.03, w={'head': 1}, mat=m)], seg=seg, side=(0, 0, 1)))

    def hair(self, style, m, top_m=None, skin_m=None):
        """top_m: material for the parts that stand above the hair cap (quiff, puff, spikes) so
        they can live in a slot that caps hide; skin_m: the parting strip (girls' hair in a slot)"""
        hz, cy = self.hz, self.cy
        tm = top_m or m
        if style == 'spiky':
            # Chinnu: a chunky crop of upswept locks round the crown, a three-spike fringe, the cowlick
            self.cap(m, 0.03, line=lambda f, s: 0.62 + 0.36 * f ** 1.6 - 0.1 * s * (1 - f))
            rnd = random.Random(11)
            for ring_z, n, kout, kback, kup, L0, r0, skip in ((1.16, 5, 0.35, 0.85, 0.6, 0.26, 0.19, False), (0.98, 6, 0.85, 0.45, 0.25, 0.25, 0.17, True), (0.80, 5, 0.75, 0.4, -0.45, 0.2, 0.15, True)):
                for i in range(n):
                    a = 2 * math.pi * (i + 0.3 + rnd.random() * 0.3) / n + 0.4
                    nx, ny = math.cos(a), math.sin(a)
                    if skip and ny < -0.45:
                        continue
                    skf = 1.22 - ring_z * 0.36
                    base = (nx * 0.5 * skf, cy + 0.06 + ny * 0.55 * skf, hz + ring_z + 0.03)
                    self.tuft(m, base, (nx * kout, ny * kout + kback, kup), L0 * (0.85 + rnd.random() * 0.3), r0, seg=6)
            for i, x in enumerate((-0.24, 0.0, 0.24)):
                base = (x, cy - 0.41, hz + 1.03 - abs(x) * 0.15)
                self.tuft(m, base, (x * 0.6, -0.6, -0.5), 0.27, 0.15, name='fringe', seg=6)
            self.tuft(m, (0.06, cy + 0.28, hz + 1.22), (0.15, 0.4, 0.9), 0.36, 0.11, name='cowlick', bend=(0, -0.25, 0), seg=6)
        elif style in ('side', 'oiled', 'crop'):
            off = {'side': 0.045, 'oiled': 0.03, 'crop': 0.025}[style]
            self.cap(m, off, line=(lambda f, s: 0.70 + 0.30 * f ** 1.4 - 0.12 * s * (1 - f)) if style != 'crop' else (lambda f, s: 0.62 + 0.32 * f ** 1.4 - 0.1 * s * (1 - f)), crown=1.3)
            if style != 'crop':
                # the side-swept front: a soft roll from the parting (left) across the forehead
                y0 = cy - 0.36
                pts = [dict(c=(0.36, y0 + 0.1, hz + 1.08), r=(0.13, 0.09)), dict(c=(0.12, y0 - 0.07, hz + 1.12), r=(0.2, 0.12)),
                       dict(c=(-0.18, y0 - 0.05, hz + 1.07), r=(0.18, 0.11)), dict(c=(-0.42, y0 + 0.12, hz + 0.96), r=(0.09, 0.07))]
                if style == 'oiled':
                    for p in pts:
                        p['r'] = (p['r'][0] * 0.8, p['r'][1] * 0.6)
                for p in pts:
                    p['w'] = {'head': 1}
                    p['mat'] = tm
                self.add(loft('quiff', pts, seg=8, side=(0, 0, 1)))
        elif style == 'puff':
            self.cap(m, 0.045, line=lambda f, s: 0.70 + 0.30 * f ** 1.4 - 0.12 * s * (1 - f), crown=1.3)
            self.puff(tm)
        elif style == 'receding':
            # uncle: hair round the back and the sides only (a shiny crown and a high forehead)
            self.cap(m, 0.03, keep=lambda f, sd, z: 0.5 < z < 1.02 - 0.06 * f and f < 0.32)
        elif style == 'bald':
            # old man: a fringe band round the back of the head from ear to ear
            pts = []
            for i in range(9):
                a = math.radians(-10 + 200 * i / 8)
                x = math.cos(a) * 0.53
                y = cy + 0.05 + math.sin(a) * 0.55
                pts.append((x, y, hz + 0.72 + 0.06 * math.sin(a)))
            self.add(kit.tube('fringe_ring', pts, 0.1, seg=7, mat=m, cap=True))
        elif style in ('bun', 'plait', 'long', 'plaits', 'ponytails'):
            # a centre parting: two smooth halves over the skull
            self.cap(m, 0.04, line=lambda f, s: 0.70 + 0.27 * f ** 1.3 - 0.18 * s * (1 - f), crown=1.2)
            # the parting line: a thin skin-coloured strip on top
            self.add(kit.tube('parting', [(0, cy - 0.42, hz + 1.12), (0, cy - 0.15, hz + 1.30), (0, cy + 0.15, hz + 1.31)], 0.012, seg=4, mat=skin_m or self.M['skin']))
            # hair framing the face, tucked behind the ears
            for sx in (1, -1):
                pts = [dict(c=(0.36 * sx, cy - 0.33, hz + 1.03), r=(0.1, 0.08)), dict(c=(0.52 * sx, cy - 0.2, hz + 0.82), r=(0.1, 0.09)),
                       dict(c=(0.57 * sx, cy + 0.05, hz + 0.66), r=(0.08, 0.1)), dict(c=(0.5 * sx, cy + 0.3, hz + 0.55), r=(0.06, 0.07))]
                for p in pts:
                    p['w'] = {'head': 1}
                    p['mat'] = m
                self.add(loft('side_hair', pts, seg=7, side=(0, 0, 1)))

    def puff(self, m):
        hz, cy = self.hz, self.cy
        pts = [dict(c=(0.0, cy - 0.30, hz + 1.10), r=(0.42, 0.18)), dict(c=(0.02, cy - 0.12, hz + 1.30), r=(0.52, 0.32)),
               dict(c=(0.0, cy + 0.15, hz + 1.33), r=(0.5, 0.3)), dict(c=(0.0, cy + 0.38, hz + 1.18), r=(0.38, 0.2))]
        for p in pts:
            p['w'] = {'head': 1}
            p['mat'] = m
            p['p'] = 2.4
        return self.add(loft('puff', pts, seg=12, side=(1, 0, 0)))

    def bun(self, m, jasmine=None):
        hz, cy = self.hz, self.cy
        b = kit.lathe('bun', [(0.0, -0.2), (0.17, -0.17), (0.25, -0.05), (0.24, 0.06), (0.16, 0.16), (0.0, 0.2)], seg=12, mat=m)
        b.rotation_euler = (math.radians(70), 0, 0)
        b.location = (0, cy + 0.68, hz + 0.62)
        kit.apply_transform(b)
        self.add(b)
        if jasmine is not None:
            # a strand of jasmine round the bun: little white buds on a string
            pts = []
            for i in range(14):
                a = math.radians(-160 + 320 * i / 13)
                pts.append(Vector((math.cos(a) * 0.27, cy + 0.66 + math.sin(a) * 0.08, hz + 0.62 + math.sin(a) * 0.24)))
            buds = []
            for i, p in enumerate(pts):
                bd = kit.lathe('bud', [(0.0, -0.05), (0.05, -0.02), (0.045, 0.03), (0.0, 0.06)], seg=5, mat=jasmine)
                bd.location = p
                kit.apply_transform(bd)
                buds.append(bd)
            j = kit.join(buds, 'jasmine')
            self.add(j)
        return b

    def plait(self, m, ribbon=None, side=0.0, length=None, name='plait', w=None):
        """a braid from the nape down the back (segments of lobes): weighted head -> neck -> chest"""
        hz, cy = self.hz, self.cy
        L = length if length is not None else (1.6 if self.shape == 'kid' else 2.6)
        n = 7 if self.shape != 'kid' else 5
        objs = []
        x0 = side
        for i in range(n):
            t = i / max(1, n - 1)
            r = 0.13 * (1 - 0.45 * t) * (1.0 if self.shape != 'kid' else 0.85)
            z = hz + 0.45 - t * L
            y = cy + 0.52 + 0.08 * math.sin(t * math.pi) + (0.12 * t if self.shape != 'kid' else 0.05 * t)
            lb = kit.lathe('lobe', [(0.0, -r * 1.3), (r * 0.8, -r * 0.9), (r, 0.0), (r * 0.8, r * 0.9), (0.0, r * 1.3)], seg=7, mat=m)
            lb.rotation_euler = (0, math.radians(18 if i % 2 else -18), 0)
            lb.location = (x0 + (0.03 if i % 2 else -0.03), y, z)
            kit.apply_transform(lb)
            objs.append(lb)
        if ribbon is not None:
            t = 1.0
            rb = kit.lathe('ribbon', [(0.0, -0.06), (0.1, -0.05), (0.12, 0.0), (0.1, 0.05), (0.0, 0.06)], seg=8, mat=ribbon)
            rb.location = (x0, cy + 0.52 + 0.12 * t, hz + 0.45 - L * 0.98)
            kit.apply_transform(rb)
            objs.append(rb)
        ob = kit.join(objs, name)
        zN, zC = self.J['neck'][2], self.J['chest'][2]

        def wf(co):
            if co.z > zN + 0.25:
                return {'head': 1.0}
            if co.z > zN - 0.3:
                f = (co.z - (zN - 0.3)) / 0.55
                return {'head': f, 'neck': 1 - f}
            if co.z > zC:
                f = (co.z - zC) / max(0.1, zN - 0.3 - zC)
                return {'neck': f, 'chest': 1 - f}
            return {'chest': 0.6, 'spine': 0.4}
        self.parts.append((ob, w or wf))
        return ob

    def moustache(self, m, kind='thick', name='moustache'):
        mz, my = self.mz, self.my
        th = {'thick': (0.07, 0.055), 'thin': (0.04, 0.03), 'walrus': (0.085, 0.07)}.get(kind, (0.06, 0.05))
        pts = [dict(c=(-0.26, my + 0.07, mz + 0.0), r=(0.03, 0.03)), dict(c=(-0.13, my - 0.02, mz + 0.08), r=th),
               dict(c=(0.0, my - 0.04, mz + 0.10), r=th), dict(c=(0.13, my - 0.02, mz + 0.08), r=th), dict(c=(0.26, my + 0.07, mz + 0.0), r=(0.03, 0.03))]
        for p in pts:
            p['w'] = {'head': 1}
            p['mat'] = m
        return self.add(loft(name, pts, seg=6, side=(0, 0, 1)))

    def beard(self, m, kind='trim', name='beard'):
        """a beard shell along the jaw and chin (trim) or a long tapering beard (long)"""
        hz, cy = self.hz, self.cy
        rings = []
        T = self.T
        # a horseshoe band round the jaw: lofted as rings over the lower face, front half only
        prof = [(0.18, 0.05), (0.06, 0.06), (-0.04, 0.07), (-0.13, 0.06)]
        if kind == 'long':
            prof += [(-0.4, 0.07), (-0.75, 0.05), (-1.05, 0.02)]
        for dz, off in prof:
            z = hz + dz
            dy, rx, ry = self.ring_at(z) if dz > -0.02 else (T[0][1], T[0][2] * (1.0 + (-dz) * 0.4 if kind != 'long' else 1.0), T[0][3])
            if kind == 'long' and dz < -0.13:
                f = min(1.0, (-dz - 0.13) / 0.9)
                rx, ry = 0.3 * (1 - 0.7 * f), 0.22 * (1 - 0.6 * f)
                dy = -0.28 - 0.12 * f
            rings.append(dict(c=(0, cy + dy - 0.02, z), r=(rx + off, ry + off), w={'head': 1}, mat=m))
        ob = loft(name, rings, seg=14, side=(1, 0, 0), cap_start=True, cap_end=True)
        # keep the front / sides (cut the back of the neck)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        kill = [v for v in bm.verts if v.co.y > cy + 0.15]
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        bm.to_mesh(ob.data)
        bm.free()
        return self.add(ob)

    def finish(self):
        """scale everything about the head joint; returns [(obj, weights)]"""
        if self.sc != 1.0:
            piv = Vector((0, self.J['head'][1], self.J['head'][2]))
            Mx = Matrix.Translation(piv) @ Matrix.Scale(self.sc, 4) @ Matrix.Translation(-piv)
            for o, _ in self.parts:
                o.data.transform(Mx)
        return self.parts

    def to_world(self, p):
        """a point in unscaled head space -> model space (for anchors / accessories placed later)"""
        piv = Vector((0, self.J['head'][1], self.J['head'][2]))
        return piv + (Vector(p) - piv) * self.sc


# =========================================================================== accessories
def torso_at(rig, z):
    """(centre y, rx, ry, weights) of the torso at height z (interpolated rings)"""
    T = TORSO[rig]
    zs = [t[0][2] for t in T]
    if z <= zs[0]:
        return T[0][0][1], T[0][1][0], T[0][1][1], TORSO_W[0]
    for i in range(len(T) - 1):
        if zs[i] <= z <= zs[i + 1]:
            f = (z - zs[i]) / max(1e-6, zs[i + 1] - zs[i])
            w = {}
            for b, x in TORSO_W[i].items():
                w[b] = w.get(b, 0) + x * (1 - f)
            for b, x in TORSO_W[i + 1].items():
                w[b] = w.get(b, 0) + x * f
            return (T[i][0][1] + (T[i + 1][0][1] - T[i][0][1]) * f, T[i][1][0] + (T[i + 1][1][0] - T[i][1][0]) * f,
                    T[i][1][1] + (T[i + 1][1][1] - T[i][1][1]) * f, w)
    return T[-1][0][1], T[-1][1][0], T[-1][1][1], TORSO_W[-1]


def body_point(rig, x, z, front=True, off=0.0, belly=0.0):
    """a point on the torso surface (front or back) at lateral x and height z"""
    cy, rx, ry, _ = torso_at(rig, z)
    k = 1.0 if rig == 'kid' else 1.32
    if belly and z < TORSO[rig][7][0][2] and z > TORSO[rig][2][0][2]:
        ry += 0.25 * k * belly
        cy -= 0.15 * k * belly
    q = max(0.0, 1 - (abs(x) / max(rx, 1e-3)) ** 2.25)
    y = ry * q ** (1 / 2.25)
    return Vector((x, cy - (y + off) if front else cy + (y + off), z))


def torso_w(rig, co):
    return dict(torso_at(rig, co.z)[3])


def shell(B, z0, z1, off, m, name='shell', open_front=0.0, seg=14, flare=0.0):
    """a garment shell over the torso between z0 and z1 (jacket, cardigan, shirt over a banian,
    apron backing): torso rings + offset, optionally open at the front (|x| < open_front)."""
    rig = B.rig
    T = TORSO[rig]
    zs = [z0] + [t[0][2] for t in T if z0 < t[0][2] < z1] + [z1]
    rings = []
    for i, z in enumerate(zs):
        cy, rx, ry, w = torso_at(rig, z)
        bel = B.s.get('belly', 0.0)
        if bel and T[2][0][2] < z < T[7][0][2]:
            ry += 0.25 * B.k * bel
            cy -= 0.15 * B.k * bel
            rx += 0.06 * B.k * bel
        fl = flare * max(0.0, (zs[-1] - z) / max(0.01, zs[-1] - zs[0]))
        rings.append(dict(c=(0, cy, z), r=(rx + off + fl, ry + off + fl), p=2.25, w=dict(w), mat=m))
    ob = loft(name, rings, seg=seg, side=(1, 0, 0), cap_start=False, cap_end=False)
    if open_front:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        kill = [v for v in bm.verts if abs(v.co.x) < open_front and v.co.y < 0]
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        bm.to_mesh(ob.data)
        bm.free()
    ob = B._thicken_hem(ob, 0.03 * B.k) if not open_front else ob
    return ob


def sleeve_shell(B, sx, m, off, t1=1.0, name='sleeve'):
    """a sleeve over the arm (jacket / shirt over a banian): shoulder -> t1 along the arm"""
    J, k = B.J, B.k
    S = 'L' if sx > 0 else 'R'
    sh, el, wr = J['shoulder'], J['elbow'], J['wrist']
    ua, fa, hd = 'upperarm_' + S, 'forearm_' + S, 'hand_' + S
    rings = [dict(c=mir((0.36 * k, 0.06, sh[2] - 0.04 * k), sx), r=0.22 * k + off, w={'chest': 1}),
             dict(c=mir((sh[0] * 0.86, 0.07, sh[2]), sx), r=0.25 * k + off, w={'chest': 0.4, ua: 0.6}),
             dict(c=mir(lerp(sh, el, 0.15), sx), r=0.215 * k * 1.1 + off, w={ua: 1})]
    if t1 <= 0.6:
        rings += [dict(c=mir(lerp(sh, el, t1 - 0.06), sx), r=0.215 * k * 1.12 + off, w={ua: 1}),
                  dict(c=mir(lerp(sh, el, t1), sx), r=0.215 * k * 1.15 + off, w={ua: 1}),
                  dict(c=mir(lerp(sh, el, t1 + 0.005), sx), r=0.215 * k * 0.95, w={ua: 1})]
    else:
        rings += [dict(c=mir(lerp(sh, el, 0.6), sx), r=0.2 * k * 1.1 + off, w={ua: 1}),
                  dict(c=mir(el, sx), r=0.17 * k * 1.25 + off, w={ua: 0.5, fa: 0.5}),
                  dict(c=mir(lerp(el, wr, 0.5), sx), r=0.16 * k * 1.15 + off, w={fa: 1}),
                  dict(c=mir(lerp(el, wr, 0.9), sx), r=0.125 * k * 1.4 + off, w={fa: 0.8, hd: 0.2}),
                  dict(c=mir(lerp(el, wr, 0.905), sx), r=0.125 * k * 1.0, w={fa: 0.8, hd: 0.2})]
    for r in rings:
        r['mat'] = m
    return loft(name + '_' + S, rings, seg=10, side=(0, 1, 0), cap_start=False, cap_end=False)


# ------------------------------------------------------------------ head-worn (head space, before Head.finish)
def specs(H, m, kind='round', lens=None, tape=None):
    ez = H.ez
    kid = H.o.get('age') == 'kid'
    ex = 0.205 if kid else 0.2
    r = {'round': 0.13, 'thin': 0.12, 'thick': 0.135, 'aviator': 0.15}.get(kind, 0.13)
    th = {'round': 0.022, 'thin': 0.016, 'thick': 0.034, 'aviator': 0.02}.get(kind, 0.022)
    objs = []
    for sx in (1, -1):
        x = ex * sx
        y = H.front_y(x, ez) - 0.07
        pts = []
        for i in range(13):
            a = 2 * math.pi * i / 12
            rz = r * (1.0 if kind != 'aviator' else (1.05 if math.sin(a) < 0 else 0.85))
            pts.append((x + math.cos(a) * r * 1.05, y + 0.01 * math.cos(a) * sx, ez + math.sin(a) * rz * 0.88))
        objs.append(kit.tube('rim', pts, th, seg=5, mat=m, cap=False))
        if lens is not None:
            l = kit.cylinder('lens', r * 0.98, 0.02, (0, 0, 0), seg=12, mat=lens, axis='Y', base=False)
            l.scale = (1.05, 1.0, 0.88 if kind != 'aviator' else 0.95)
            l.location = (x, y + 0.01, ez - (0.01 if kind == 'aviator' else 0))
            kit.apply_transform(l)
            objs.append(l)
        # temple arm back to the ear
        rx = H.ring_at(ez)[1]
        objs.append(kit.tube('temple', [(x + r * 1.0 * sx, y + 0.02, ez + 0.03), ((rx + 0.03) * sx, H.cy - 0.1, ez + 0.02), ((rx + 0.02) * sx, H.cy + 0.08, ez - 0.06)], th * 0.8, seg=4, mat=m))
    yb = H.front_y(0, ez) - 0.09
    objs.append(kit.tube('bridge', [(-ex + r, yb + 0.02, ez + 0.03), (0, yb - 0.01, ez + 0.06), (ex - r, yb + 0.02, ez + 0.03)], th, seg=4, mat=m))
    if tape is not None:
        t = kit.lathe('tape', [(0.0, -0.05), (0.045, -0.04), (0.05, 0.0), (0.045, 0.04), (0.0, 0.05)], seg=8, mat=tape)
        t.rotation_euler = (0, math.radians(90), 0)
        t.location = (0, yb - 0.01, ez + 0.05)
        kit.apply_transform(t)
        objs.append(t)
    o = kit.join(objs, 'specs')
    return H.add(o)


def cap(H, m, kind='cricket', brim=None):
    """caps in head space: cricket / backcap (dome + brim), skull (taqiyah), gandhi (boat), irani
    (short round brimless), police (peaked, band + flat top + visor), dhaka (Nepali topi)"""
    hz, cy = H.hz, H.cy
    objs = []
    if kind in ('cricket', 'backcap'):
        prof = [(0.62, 0.0), (0.63, 0.12), (0.6, 0.26), (0.5, 0.42), (0.32, 0.53), (0.0, 0.57)]
        d = kit.lathe('dome', prof, seg=SEG['cap'], mat=m, close_bottom=False)
        d.location = (0, cy + 0.05, hz + 0.86)
        kit.apply_transform(d)
        objs.append(d)
        bm = brim or m
        b = kit.lathe('brim', [(0.0, 0.0), (0.52, 0.0), (0.52, 0.04), (0.0, 0.04)], seg=SEG['cap'], mat=bm)
        b.scale = (0.95, 0.75, 1.0)
        b.rotation_euler = (math.radians(-12), 0, 0)
        b.location = (0, cy - 0.58, hz + 0.9)
        kit.apply_transform(b)
        objs.append(b)
        bt = kit.lathe('button', [(0.0, 0.0), (0.06, 0.0), (0.05, 0.04), (0.0, 0.05)], seg=8, mat=m)
        bt.location = (0, cy + 0.05, hz + 1.42)
        kit.apply_transform(bt)
        objs.append(bt)
        o = kit.join(objs, 'cap_' + kind)
        if kind == 'backcap':
            piv = Vector((0, cy + 0.05, 0))
            o.data.transform(Matrix.Translation(piv) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation(-piv))
        return H.add(o)
    if kind == 'skull':
        prof = [(0.575, 0.0), (0.58, 0.1), (0.55, 0.22), (0.44, 0.33), (0.25, 0.39), (0.0, 0.41)]
        d = kit.lathe('skullcap', prof, seg=SEG['cap'], mat=m, close_bottom=False)
        d.scale = (1.0, 1.03, 1.0)
        d.location = (0, cy + 0.07, hz + 0.98)
        kit.apply_transform(d)
        return H.add(d)
    if kind == 'irani':
        prof = [(0.58, 0.0), (0.6, 0.06), (0.6, 0.3), (0.56, 0.36), (0.0, 0.37)]
        d = kit.lathe('iranicap', prof, seg=SEG['cap'], mat=m, close_bottom=False)
        d.rotation_euler = (math.radians(8), 0, 0)
        d.location = (0, cy + 0.08, hz + 1.0)
        kit.apply_transform(d)
        return H.add(d)
    if kind == 'gandhi':
        out = [(-0.62, 0.0), (0.62, 0.0), (0.5, 0.28), (0.0, 0.36), (-0.5, 0.28)]
        p = kit.prism_from_outline('gandhicap', out, 0.66, center=(0, 0, 0), mat=m)
        p.rotation_euler = (0, 0, math.radians(90))
        kit.apply_transform(p)
        kit.bevel_mod(p, 0.05, 2, angle=30)
        kit.apply_modifiers(p)
        p.rotation_euler = (math.radians(-6), math.radians(4), 0)
        p.location = (0, cy + 0.06, hz + 1.08)
        kit.apply_transform(p)
        return H.add(p)
    if kind == 'dhaka':
        prof = [(0.58, 0.0), (0.58, 0.32), (0.5, 0.5), (0.0, 0.52)]
        d = kit.lathe('topi', prof, seg=14, mat=m, close_bottom=False)
        d.rotation_euler = (math.radians(-10), 0, 0)
        d.location = (0, cy + 0.05, hz + 1.0)
        kit.apply_transform(d)
        return H.add(d)
    if kind == 'police':
        band = kit.lathe('band', [(0.6, 0.0), (0.61, 0.14), (0.62, 0.22)], seg=SEG['cap'], mat=m, close_bottom=False, close_top=False)
        top = kit.lathe('crown', [(0.62, 0.22), (0.72, 0.36), (0.74, 0.42), (0.6, 0.47), (0.0, 0.5)], seg=SEG['cap'], mat=m, close_bottom=False)
        for o in (band, top):
            o.scale = (1.0, 1.08, 1.0)
            o.location = (0, cy + 0.05, hz + 0.86)
            kit.apply_transform(o)
            objs.append(o)
        vis = kit.lathe('visor', [(0.0, 0.0), (0.5, 0.0), (0.5, 0.03), (0.0, 0.03)], seg=14, mat=brim or m)
        vis.scale = (0.9, 0.62, 1.0)
        vis.rotation_euler = (math.radians(-22), 0, 0)
        vis.location = (0, cy - 0.5, hz + 0.86)
        kit.apply_transform(vis)
        objs.append(vis)
        return H.add(kit.join(objs, 'policecap'))
    raise ValueError(kind)


def hood(H, m):
    """raincoat hood: a loose shell round the head, open face, down to the neck"""
    hz, cy = H.hz, H.cy
    rows = [(0.05, 0.62, 0.66, 0.14), (0.35, 0.68, 0.72, 0.1), (0.7, 0.70, 0.74, 0.06), (1.0, 0.66, 0.7, 0.05), (1.22, 0.5, 0.54, 0.05), (1.38, 0.22, 0.26, 0.05), (1.43, 0.04, 0.05, 0.05)]
    rings = [dict(c=(0, cy + 0.05 + dy, hz + dz), r=(rx, ry), w={'head': 1}, mat=m) for (dz, rx, ry, dy) in rows]
    ob = loft('hood', rings, seg=SEG['hair'], side=(1, 0, 0), cap_start=False, cap_end=True)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    kill = []
    for v in bm.verts:
        y = v.co.y - cy
        z = v.co.z - hz
        if y < -0.15 and abs(v.co.x) < 0.5 and 0.0 < z < 1.12:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    return H.add(ob)


def head_cover(H, m):
    """a dupatta drawn over the head (Ammi): a soft shell over the hair, open face, falling to the shoulders"""
    hz, cy = H.hz, H.cy
    rows = [(-0.35, 0.78, 0.6, 0.18), (-0.05, 0.66, 0.66, 0.12), (0.35, 0.64, 0.68, 0.08), (0.75, 0.66, 0.7, 0.06), (1.05, 0.6, 0.64, 0.05), (1.26, 0.4, 0.44, 0.05), (1.38, 0.1, 0.12, 0.05)]
    rings = [dict(c=(0, cy + 0.05 + dy, hz + dz), r=(rx, ry), w={'head': 1}, mat=m) for (dz, rx, ry, dy) in rows]
    ob = loft('headcover', rings, seg=SEG['hair'], side=(1, 0, 0), cap_start=False, cap_end=True)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    kill = [v for v in bm.verts if (v.co.y - cy) < -0.12 and abs(v.co.x) < 0.48 and -0.1 < (v.co.z - hz) < 1.1]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    return H.add(ob)


def burqa_hood(H, m):
    """the burqa's head covering: snug round the face oval, flowing onto the shoulders"""
    hz, cy = H.hz, H.cy
    rows = [(-0.5, 0.9, 0.62, 0.2), (-0.15, 0.68, 0.64, 0.12), (0.3, 0.63, 0.67, 0.07), (0.72, 0.65, 0.69, 0.06), (1.04, 0.6, 0.64, 0.05), (1.25, 0.4, 0.44, 0.05), (1.37, 0.1, 0.12, 0.05)]
    rings = [dict(c=(0, cy + 0.05 + dy, hz + dz), r=(rx, ry), w={'head': 1} if dz > -0.2 else {'head': 0.4, 'neck': 0.3, 'chest': 0.3}, mat=m) for (dz, rx, ry, dy) in rows]
    ob = loft('burqahood', rings, seg=SEG['hair'], side=(1, 0, 0), cap_start=False, cap_end=True)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    kill = [v for v in bm.verts if (v.co.y - cy) < -0.15 and abs(v.co.x) < 0.42 and 0.08 < (v.co.z - hz) < 1.05]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    H.parts.append((ob, None))   # keeps its ring weights
    return ob


def bindi(H, m):
    y = H.front_y(0, H.ez + 0.2) - 0.005
    d = kit.cylinder('bindi', 0.035, 0.02, (0, 0, 0), seg=8, mat=m, axis='Y', base=False)
    d.location = (0, y, H.ez + 0.2)
    kit.apply_transform(d)
    return H.add(d)


def earrings(H, m):
    objs = []
    ez = H.ez
    rx = H.ring_at(ez - 0.08)[1]
    for sx in (1, -1):
        e = kit.lathe('earring', [(0.0, -0.06), (0.05, -0.03), (0.05, 0.02), (0.0, 0.04)], seg=6, mat=m)
        e.location = ((rx + 0.06) * sx, H.cy + 0.06, ez - 0.36)
        kit.apply_transform(e)
        objs.append(e)
    return H.add(kit.join(objs, 'earrings'))


# ------------------------------------------------------------------ body-worn
def camera_strap(B, m_body, m_lens, m_strap, cross=False):
    """Nanna's black film camera on its strap: round the neck resting on the tummy (adults), or
    (cross=True, a kid) slung across the body from the left shoulder to the right hip"""
    rig, k = B.rig, B.k
    bel = B.s.get('belly', 0.0)
    T = TORSO[rig]
    if cross:
        zc = T[1][0][2] + 0.32 * k
        front = body_point(rig, -0.42 * k, zc, True, 0.1 * k, bel)
        front.x -= 0.18 * k
    else:
        zc = T[5][0][2] + 0.25 * k
        front = body_point(rig, 0.05 * k, zc, True, 0.12 * k, bel)
    body = kit.box('cam', (0.62 * k, 0.26 * k, 0.36 * k), front + Vector((0, -0.08 * k, 0)), m_body, bevel=0.05 * k, segments=1)
    kit.apply_modifiers(body)
    lens = kit.cylinder('cam_lens', 0.13 * k, 0.2 * k, (0, 0, 0), seg=10, mat=m_lens, axis='Y', base=False)
    lens.location = front + Vector((0.08 * k, -0.28 * k, -0.02 * k))
    kit.apply_transform(lens)
    ring = kit.cylinder('cam_ring', 0.15 * k, 0.05 * k, (0, 0, 0), seg=10, mat=m_body, axis='Y', base=False)
    ring.location = front + Vector((0.08 * k, -0.37 * k, -0.02 * k))
    kit.apply_transform(ring)
    nz = T[10][0][2]
    if cross:
        zs = T[8][0][2]
        pts = [front + Vector((0.2 * k, 0.0, 0.16 * k)), body_point(rig, -0.15 * k, (zc + zs) / 2 - 0.2 * k, True, 0.04, bel),
               body_point(rig, 0.3 * k, zs - 0.15 * k, True, 0.04), Vector((0.5 * k, 0.04, nz - 0.02)),
               body_point(rig, 0.3 * k, zs - 0.15 * k, False, 0.04), body_point(rig, -0.15 * k, (zc + zs) / 2 - 0.2 * k, False, 0.04),
               front + Vector((-0.28 * k, 0.3 * k, 0.16 * k))]
    else:
        pts = [front + Vector((0.28 * k, -0.02, 0.12 * k)), body_point(rig, 0.4 * k, (zc + nz) / 2, True, 0.03, bel),
               Vector((0.36 * k, 0.0, nz - 0.02)), Vector((0.0, 0.3 * k, nz + 0.02)), Vector((-0.36 * k, 0.0, nz - 0.02)),
               body_point(rig, -0.4 * k, (zc + nz) / 2, True, 0.03, bel), front + Vector((-0.28 * k, -0.02, 0.12 * k))]
    strap = kit.tube('cam_strap', pts, 0.03 * k, seg=5, mat=m_strap, cap=False)
    o = kit.join([body, lens, ring, strap], 'camera')

    def wf(co, rig=rig):
        if co.z < T[3][0][2]:
            return {'hips': 0.7, 'spine': 0.3}
        return torso_w(rig, co)
    return B.add(o, wf)


def walkman(B, M):
    """Chinnu's yellow walkman on a shoelace + 90s foam headphones round the neck"""
    rig, k = B.rig, B.k
    objs = []
    wm = kit.box('walkman', (0.40, 0.12, 0.52), (0.08, -0.47, 4.42), M['walkman'], bevel=0.035, segments=1)
    kit.apply_modifiers(wm)
    objs.append(wm)
    objs.append(kit.box('wm_window', (0.26, 0.02, 0.16), (0.08, -0.535, 4.5), M['black']))
    objs.append(kit.box('wm_buttons', (0.3, 0.06, 0.04), (0.08, -0.47, 4.7), M['black']))
    objs.append(kit.tube('lace', [(0.22, 0.02, 5.48), (0.24, -0.25, 5.2), (0.2, -0.44, 4.86), (0.12, -0.47, 4.69), (0.04, -0.47, 4.69), (-0.06, -0.44, 4.9),
                                   (-0.17, -0.28, 5.2), (-0.21, 0.02, 5.48), (0.0, 0.2, 5.52), (0.22, 0.02, 5.48)], 0.022, seg=4, mat=M['lace'], cap=False))
    objs.append(kit.tube('hp_band', [(0.34, -0.12, 5.42), (0.33, 0.12, 5.52), (0.0, 0.31, 5.58), (-0.33, 0.12, 5.52), (-0.34, -0.12, 5.42)], 0.03, seg=5, mat=M['steel']))
    for sx in (1, -1):
        pad = kit.cylinder('hp_pad', 0.13, 0.08, (0, 0, 0), seg=8, mat=M['foam'], base=False)
        pad.rotation_euler = (math.radians(70), 0, math.radians(-25 * sx))
        pad.location = (0.34 * sx, -0.17, 5.36)
        kit.apply_transform(pad)
        objs.append(pad)
        cup = kit.cylinder('hp_cup', 0.09, 0.05, (0, 0, 0), seg=7, mat=M['black'], base=False)
        cup.rotation_euler = (math.radians(70), 0, math.radians(-25 * sx))
        cup.location = (0.37 * sx, -0.1, 5.4)
        kit.apply_transform(cup)
        objs.append(cup)
    o = kit.join(objs, 'walkman')
    return B.add(o, lambda co: {'chest': 0.6, 'neck': 0.4} if co.z > 5.3 else {'chest': 1.0})


def tie_card(B, m_tie, m_stripe, m_card, m_ribbon):
    """school tie (knot + blade under the collar) + an ID card on a ribbon"""
    rig, k = B.rig, B.k
    nz = TORSO[rig][10][0][2]
    p0 = body_point(rig, 0, nz - 0.1 * k, True, 0.03)
    p1 = body_point(rig, 0.0, nz - 0.45 * k, True, 0.04)
    p2 = body_point(rig, 0.02 * k, TORSO[rig][5][0][2] + 0.1 * k, True, 0.04)
    knot = loft('knot', [dict(c=tuple(p0 + Vector((0, 0.0, 0.06 * k))), r=(0.07 * k, 0.04)), dict(c=tuple(p0 + Vector((0, -0.02, -0.04 * k))), r=(0.09 * k, 0.05)),
                         dict(c=tuple(p0 + Vector((0, -0.01, -0.12 * k))), r=(0.05 * k, 0.035))], seg=6, side=(1, 0, 0), mat=m_tie)
    blade = loft('blade', [dict(c=tuple(p0 + Vector((0, 0.0, -0.1 * k))), r=(0.06 * k, 0.025), mat=m_tie), dict(c=tuple(p1), r=(0.1 * k, 0.025), mat=m_stripe),
                           dict(c=tuple((p1 + p2) / 2), r=(0.12 * k, 0.025), mat=m_tie), dict(c=tuple(p2 + Vector((0, 0, 0.08 * k))), r=(0.13 * k, 0.025), mat=m_tie),
                           dict(c=tuple(p2 - Vector((0, 0, 0.06 * k))), r=(0.02 * k, 0.02), mat=m_tie)], seg=6, side=(1, 0, 0))
    cz = TORSO[rig][6][0][2]
    cp = body_point(rig, 0.3 * k, cz, True, 0.05)
    card = kit.box('idcard', (0.26 * k, 0.03, 0.34 * k), cp, m_card, bevel=0.015, segments=1)
    kit.apply_modifiers(card)
    rib = kit.tube('ribbon', [cp + Vector((0.08 * k, 0, 0.17 * k)), body_point(rig, 0.38 * k, (cz + nz) / 2, True, 0.02), Vector((0.3 * k, 0.05, nz)),
                              Vector((0.0, 0.3 * k, nz + 0.04)), Vector((-0.3 * k, 0.05, nz)), body_point(rig, -0.25 * k, (cz + nz) / 2, True, 0.02),
                              cp + Vector((-0.08 * k, 0, 0.17 * k))], 0.022 * k, seg=4, mat=m_ribbon, cap=False)
    o = kit.join([knot, blade, card, rib], 'tie_card')
    return B.add(o, lambda co, rig=rig: torso_w(rig, co))


def backpack(B, m, m_strap=None):
    rig, k = B.rig, B.k
    z0, z1 = TORSO[rig][4][0][2] + 0.05, TORSO[rig][8][0][2] - 0.05 * k
    back = body_point(rig, 0, (z0 + z1) / 2, False, 0.0)
    bag = kit.box('bag', (0.95 * k, 0.42 * k, (z1 - z0)), back + Vector((0, 0.22 * k, 0)), m, bevel=0.1 * k, segments=2)
    kit.apply_modifiers(bag)
    flap = kit.box('flap', (0.9 * k, 0.1 * k, (z1 - z0) * 0.45), back + Vector((0, 0.44 * k, (z1 - z0) * 0.22)), m, bevel=0.04 * k, segments=1)
    kit.apply_modifiers(flap)
    objs = [bag, flap]
    for sx in (1, -1):
        pts = [back + Vector((0.3 * k * sx, 0.05, (z1 - z0) / 2 - 0.05)), Vector((0.36 * k * sx, 0.12 * k, TORSO[rig][9][0][2] + 0.04)),
               Vector((0.4 * k * sx, -0.25 * k, TORSO[rig][8][0][2])), body_point(rig, 0.42 * k * sx, TORSO[rig][7][0][2] - 0.05, True, 0.03),
               body_point(rig, 0.48 * k * sx, TORSO[rig][5][0][2], True, -0.1), back + Vector((0.4 * k * sx, 0.02, -(z1 - z0) / 2 + 0.1))]
        objs.append(kit.tube('bag_strap', pts, 0.045 * k, seg=5, mat=m_strap or m, cap=False))
    o = kit.join(objs, 'backpack')
    return B.add(o, lambda co, rig=rig: torso_w(rig, co))


def crossbody(B, m_bag, m_strap, kind='jhola', side=1):
    """a bag on a strap over the shoulder: jhola (soft cloth bag at the hip) / satchel (leather
    conductor's bag, boxy, worn crossways)"""
    rig, k = B.rig, B.k
    sx = side
    zt = TORSO[rig][9][0][2]
    zh = TORSO[rig][1][0][2] + (0.3 if kind == 'jhola' else 0.55) * k
    hipp = body_point(rig, -0.75 * k * sx, zh, True, 0.0)
    hipp.y += 0.25 * k
    hipp.x -= 0.18 * k * sx
    if kind == 'jhola':
        bag = loft('jhola', [dict(c=tuple(hipp + Vector((0, 0, 0.42 * k))), r=(0.4 * k, 0.1 * k)), dict(c=tuple(hipp + Vector((0, 0, 0.0))), r=(0.46 * k, 0.16 * k)),
                             dict(c=tuple(hipp + Vector((0, 0, -0.4 * k))), r=(0.43 * k, 0.12 * k)), dict(c=tuple(hipp + Vector((0, 0, -0.5 * k))), r=(0.3 * k, 0.05 * k))],
                   seg=10, side=(0, 1, 0), mat=m_bag)
        bag.rotation_euler = (0, 0, 0)
    else:
        bag = kit.box('satchel', (0.22 * k, 0.75 * k, 0.6 * k), hipp, m_bag, bevel=0.06 * k, segments=2)
        kit.apply_modifiers(bag)
        flap = kit.box('satchel_flap', (0.25 * k, 0.76 * k, 0.32 * k), hipp + Vector((-0.02 * k * sx, 0, 0.16 * k)), m_bag, bevel=0.04 * k, segments=1)
        kit.apply_modifiers(flap)
        bag = kit.join([bag, flap], 'satchel')
    pts = [hipp + Vector((0.1 * k * sx, -0.1 * k, 0.4 * k)), body_point(rig, -0.25 * k * sx, (zt + zh) / 2, True, 0.05, B.s.get('belly', 0.0)),
           body_point(rig, 0.3 * k * sx, TORSO[rig][7][0][2] + 0.15 * k, True, 0.04), Vector((0.5 * k * sx, 0.0, zt + 0.06)),
           body_point(rig, 0.3 * k * sx, TORSO[rig][7][0][2] + 0.15 * k, False, 0.04), body_point(rig, -0.3 * k * sx, (zt + zh) / 2, False, 0.05),
           hipp + Vector((0.1 * k * sx, 0.15 * k, 0.4 * k))]
    strap = kit.tube('bag_strap', pts, 0.035 * k, seg=5, mat=m_strap, cap=False)
    o = kit.join([bag, strap], kind)

    def wf(co, rig=rig):
        w = torso_w(rig, co)
        if co.z < TORSO[rig][3][0][2]:
            w = {'hips': 1.0}
        return w
    return B.add(o, wf)


def towel_shoulder(B, m, side=-1):
    """a folded towel (gamcha) over one shoulder, hanging front and back"""
    rig, k = B.rig, B.k
    sx = side
    zs = TORSO[rig][8][0][2]
    pf = body_point(rig, 0.45 * k * sx, zs - 0.9 * k, True, 0.05, B.s.get('belly', 0.0))
    pb = body_point(rig, 0.45 * k * sx, zs - 0.9 * k, False, 0.05)
    top = Vector((0.55 * k * sx, 0.05, zs + 0.2 * k))
    pts = [dict(c=tuple(pf), r=(0.2 * k, 0.03)), dict(c=tuple(body_point(rig, 0.5 * k * sx, zs - 0.3 * k, True, 0.05)), r=(0.2 * k, 0.03)),
           dict(c=tuple(top + Vector((0, -0.2 * k, 0))), r=(0.18 * k, 0.05)), dict(c=tuple(top + Vector((0, 0.2 * k, 0))), r=(0.18 * k, 0.05)),
           dict(c=tuple(body_point(rig, 0.5 * k * sx, zs - 0.3 * k, False, 0.05)), r=(0.2 * k, 0.03)), dict(c=tuple(pb), r=(0.2 * k, 0.03))]
    for p in pts:
        p['mat'] = m
    o = loft('towel', pts, seg=6, side=(0, 0, 1))
    return B.add(o, lambda co, rig=rig: torso_w(rig, co))


def head_cloth(H, m):
    """a towel tied round the head (vendors in the sun): a thick twisted band"""
    hz, cy = H.hz, H.cy
    pts = []
    for i in range(17):
        a = 2 * math.pi * i / 16
        pts.append((math.cos(a) * 0.62, cy + 0.06 + math.sin(a) * 0.66, hz + 1.0 + 0.06 * math.sin(a) + 0.03 * math.cos(3 * a)))
    t = kit.tube('headcloth', pts, 0.11, seg=6, mat=m, cap=False)
    knot = kit.lathe('knot', [(0.0, -0.1), (0.12, -0.05), (0.13, 0.04), (0.0, 0.1)], seg=8, mat=m)
    knot.location = (0.25, cy + 0.68, hz + 1.0)
    kit.apply_transform(knot)
    return H.add(kit.join([t, knot], 'headcloth'))


def apron(B, m):
    rig, k = B.rig, B.k
    z1 = TORSO[rig][7][0][2] + 0.1 * k
    hemz = B.J['knee'][2] + 0.3 * k
    rings = []
    zs = [z1, TORSO[rig][6][0][2], TORSO[rig][5][0][2], TORSO[rig][3][0][2], TORSO[rig][1][0][2], (TORSO[rig][1][0][2] + hemz) / 2, hemz]
    for z in zs:
        if z > TORSO[rig][1][0][2] + 0.01:
            p = body_point(rig, 0, z, True, 0.06 * k, B.s.get('belly', 0.0))
        else:
            p = body_point(rig, 0, TORSO[rig][1][0][2], True, 0.08 * k + (TORSO[rig][1][0][2] - z) * 0.05)
            p.z = z
        rings.append(dict(c=tuple(p), r=(0.5 * k, 0.03), mat=m))
    o = loft('apron', rings, seg=6, side=(1, 0, 0))

    def wf(co, rig=rig):
        if co.z < TORSO[rig][1][0][2]:
            t = min(1.0, (TORSO[rig][1][0][2] - co.z) / 1.5)
            return {'hips': 1 - 0.5 * t, 'thigh_L': 0.25 * t, 'thigh_R': 0.25 * t}
        return torso_w(rig, co)
    return B.add(o, wf)


def stick(B, m, side=-1, length=None, top=None, name='stick'):
    """a walking stick / lathi held in one hand, hanging to the ground in the rest pose"""
    J, k = B.J, B.k
    S = 'L' if side > 0 else 'R'
    g = Vector(mir(lerp(J['wrist'], J['hand_tip'], 0.55), side))
    L = length or (g.z - 0.05)
    a = g + Vector((0, -0.06 * k, 0.25 * k))
    b = g + Vector((0, 0.0, -L))
    objs = [kit.tube(name, [a, (a + b) / 2, b], 0.06 * k, seg=7, mat=m)]
    if top == 'crook':
        objs.append(kit.tube('crook', [a, a + Vector((0, -0.12 * k, 0.14 * k)), a + Vector((0, -0.3 * k, 0.1 * k)), a + Vector((0, -0.33 * k, -0.05 * k))], 0.06 * k, seg=7, mat=m))
    o = kit.join(objs, name)
    return B.add(o, 'hand_' + S)


def charkhi(B, m_wood, m_thread, side=1):
    """a kite-string reel held in one hand: two discs on an axle with handles, thread wound on it"""
    J, k = B.J, B.k
    S = 'L' if side > 0 else 'R'
    g = Vector(mir(lerp(J['wrist'], J['hand_tip'], 0.5), side)) + Vector((0, -0.25 * k, 0))
    core = kit.cylinder('reel', 0.2 * k, 0.4 * k, (0, 0, 0), seg=12, mat=m_thread, axis='X', base=False)
    core.location = g
    kit.apply_transform(core)
    objs = [core]
    for sx in (1, -1):
        d = kit.cylinder('disc', 0.32 * k, 0.04 * k, (0, 0, 0), seg=12, mat=m_wood, axis='X', base=False)
        d.location = g + Vector((0.2 * k * sx, 0, 0))
        kit.apply_transform(d)
        objs.append(d)
    h = kit.cylinder('handle', 0.05 * k, 1.1 * k, (0, 0, 0), seg=6, mat=m_wood, axis='X', base=False)
    h.location = g
    kit.apply_transform(h)
    objs.append(h)
    return B.add(kit.join(objs, 'charkhi'), 'hand_' + S)


def notebook_pocket(B, m_book, side=1):
    rig, k = B.rig, B.k
    pz = TORSO[rig][7][0][2] + 0.05 * k
    p = body_point(rig, 0.3 * k * side, pz, True, 0.0)
    nb = kit.box('notebook', (0.26 * k, 0.07, 0.36 * k), p + Vector((0, -0.04, 0.12 * k)), m_book, bevel=0.015, segments=1)
    kit.apply_modifiers(nb)
    return B.add(nb, 'chest')


def tray(B, m_tray, m_glass, side=1):
    """Salim's tray of chai glasses, carried on one hand at shoulder height"""
    J, k = B.J, B.k
    S = 'L' if side > 0 else 'R'
    g = Vector(mir(J['hand_tip'], side)) + Vector((0, -0.2 * k, 0.12 * k))
    t = kit.cylinder('tray', 0.7 * k, 0.05 * k, g, seg=16, mat=m_tray)
    objs = [t]
    for i in range(5):
        a = 2 * math.pi * i / 5
        gl = kit.cylinder('glass', 0.1 * k, 0.28 * k, g + Vector((math.cos(a) * 0.4 * k, math.sin(a) * 0.4 * k, 0.05 * k)), seg=7, mat=m_glass, r2=0.12 * k)
        objs.append(gl)
    return B.add(kit.join(objs, 'tray'), 'hand_' + S)


def pallu(B, m, m_border):
    """the saree's pallu: from the right hip across the chest, over the left shoulder, down the back"""
    rig, k = B.rig, B.k
    T = TORSO[rig]
    zw = T[3][0][2]
    pts = [(body_point(rig, -0.55 * k, zw + 0.1 * k, True, 0.06), 0.2), (body_point(rig, -0.25 * k, T[5][0][2], True, 0.07), 0.26),
           (body_point(rig, 0.12 * k, T[7][0][2], True, 0.08), 0.28), (body_point(rig, 0.38 * k, T[8][0][2] + 0.05, True, 0.06), 0.26),
           (Vector((0.55 * k, 0.04, T[9][0][2] + 0.1 * k)), 0.22), (body_point(rig, 0.45 * k, T[8][0][2] - 0.05, False, 0.06), 0.28),
           (body_point(rig, 0.35 * k, T[6][0][2], False, 0.08), 0.34), (body_point(rig, 0.3 * k, T[4][0][2], False, 0.1), 0.38),
           (body_point(rig, 0.28 * k, T[1][0][2] - 0.2 * k, False, 0.14), 0.4)]
    rings = []
    for i, (p, w) in enumerate(pts):
        rings.append(dict(c=tuple(p), r=(w * k, 0.035), mat=m if i < len(pts) - 2 else m_border))
    o = loft('pallu', rings, seg=6, side=(0, 0, 1))
    # the border stripe along the outer edge (a thin tube along the lower / outer edge of the sash)
    edge = [p + Vector((0, 0, -w * k * 0.92)) if i < 4 else p + Vector((0.0, 0.0, -w * k * 0.92)) for i, (p, w) in enumerate(pts)]
    e = kit.tube('pallu_border', edge, 0.06 * k, seg=5, mat=m_border, cap=False)

    def wf(co, rig=rig):
        w = torso_w(rig, co)
        if co.z < T[2][0][2]:
            w = {'hips': 1.0}
        return w
    return B.add(kit.join([o, e], 'pallu'), wf)


def dupatta(B, m, over_head=False):
    """a dupatta draped round the front of the neck with both ends falling behind the shoulders"""
    rig, k = B.rig, B.k
    T = TORSO[rig]
    pts = [(body_point(rig, 0.55 * k, T[4][0][2], False, 0.06), 0.24), (body_point(rig, 0.55 * k, T[7][0][2], False, 0.05), 0.24),
           (Vector((0.6 * k, 0.0, T[9][0][2] + 0.06 * k)), 0.2), (body_point(rig, 0.35 * k, T[8][0][2] - 0.05, True, 0.05), 0.18),
           (body_point(rig, 0.0, T[7][0][2] + 0.05 * k, True, 0.07), 0.2), (body_point(rig, -0.35 * k, T[8][0][2] - 0.05, True, 0.05), 0.18),
           (Vector((-0.6 * k, 0.0, T[9][0][2] + 0.06 * k)), 0.2), (body_point(rig, -0.55 * k, T[7][0][2], False, 0.05), 0.24),
           (body_point(rig, -0.55 * k, T[4][0][2], False, 0.06), 0.24), (body_point(rig, -0.5 * k, T[1][0][2] - 0.4 * k, False, 0.1), 0.24)]
    pts = [(body_point(rig, 0.5 * k, T[1][0][2] - 0.4 * k, False, 0.1), 0.24)] + pts
    rings = [dict(c=tuple(p), r=(w * k, 0.03), mat=m) for p, w in pts]
    o = loft('dupatta', rings, seg=6, side=(0, 0, 1))

    def wf(co, rig=rig):
        w = torso_w(rig, co)
        if co.z < T[2][0][2]:
            w = {'hips': 0.6, 'spine': 0.4}
        return w
    return B.add(o, wf)


def bangles(B, m, n=3):
    J, k = B.J, B.k
    objs = []
    for sx in (1, -1):
        for i in range(n):
            t = 0.8 + i * 0.05
            c = Vector(mir(lerp(J['elbow'], J['wrist'], t), sx))
            d = (Vector(mir(J['wrist'], sx)) - Vector(mir(J['elbow'], sx))).normalized()
            pts = []
            a0 = d.orthogonal().normalized()
            b0 = d.cross(a0)
            for j in range(9):
                a = 2 * math.pi * j / 8
                pts.append(c + (a0 * math.cos(a) + b0 * math.sin(a)) * 0.15 * k)
            objs.append(kit.tube('bangle', pts, 0.02 * k, seg=4, mat=m, cap=False))
    o = kit.join(objs, 'bangles')

    def wf(co):
        return {'forearm_L': 0.8, 'hand_L': 0.2} if co.x > 0 else {'forearm_R': 0.8, 'hand_R': 0.2}
    return B.add(o, wf)


def watch(B, m_strap, m_dial, side=1):
    J, k = B.J, B.k
    S = 'L' if side > 0 else 'R'
    c = Vector(mir(lerp(J['elbow'], J['wrist'], 0.9), side))
    pts = []
    d = (Vector(mir(J['wrist'], side)) - Vector(mir(J['elbow'], side))).normalized()
    a0 = d.orthogonal().normalized()
    b0 = d.cross(a0)
    for j in range(9):
        a = 2 * math.pi * j / 8
        pts.append(c + (a0 * math.cos(a) + b0 * math.sin(a)) * 0.135 * k)
    strap = kit.tube('watchstrap', pts, 0.035 * k, seg=4, mat=m_strap, cap=False)
    dial = kit.cylinder('dial', 0.08 * k, 0.04 * k, (0, 0, 0), seg=10, mat=m_dial, axis='X', base=False)
    dial.location = c + Vector((0.13 * k * side, 0, 0.03))
    kit.apply_transform(dial)
    return B.add(kit.join([strap, dial], 'watch'), {'forearm_' + S: 0.7, 'hand_' + S: 0.3})


def belt(B, m_belt, m_buckle):
    rig, k = B.rig, B.k
    z = TORSO[rig][3][0][2] - 0.02
    p = body_point(rig, 0, z, True, 0.02, B.s.get('belly', 0.0))
    bk = kit.box('buckle', (0.22 * k, 0.05, 0.16 * k), p, m_buckle, bevel=0.015, segments=1)
    kit.apply_modifiers(bk)
    return B.add(bk, 'hips')


def lanyard_whistle(B, m_cord, m_whistle, side=1):
    rig, k = B.rig, B.k
    T = TORSO[rig]
    pk = body_point(rig, 0.33 * k * side, T[7][0][2] - 0.05, True, 0.05)
    pts = [Vector((0.55 * k * side, 0.0, T[9][0][2] + 0.02)), body_point(rig, 0.55 * k * side, T[8][0][2] - 0.1, True, 0.04), pk + Vector((0.05, 0, 0.15 * k)), pk]
    cord = kit.tube('cord', pts, 0.025 * k, seg=4, mat=m_cord, cap=False)
    w = kit.cylinder('whistle', 0.05 * k, 0.2 * k, (0, 0, 0), seg=7, mat=m_whistle, axis='Y', base=False)
    w.location = pk + Vector((0, -0.05, -0.04))
    kit.apply_transform(w)
    return B.add(kit.join([cord, w], 'whistle'), 'chest')


def epaulettes(B, m):
    rig, k = B.rig, B.k
    objs = []
    T = TORSO[rig]
    for sx in (1, -1):
        e = kit.box('epaulette', (0.42 * k, 0.24 * k, 0.05 * k), (0.58 * k * sx, 0.0, T[8][0][2] + 0.17 * k), m, bevel=0.02, segments=1)
        e.rotation_euler = (0, math.radians(-14 * sx), 0)
        kit.apply_modifiers(e)
        kit.apply_transform(e)
        objs.append(e)
    return B.add(kit.join(objs, 'epaulettes'), 'chest')


# =========================================================================== finishing
LOOKDEV = os.environ.get('NOS_LOOKDEV')          # 1 = render the unbaked scene and stop (fast look iteration)


def finish_character(A, J, rig_name, B, H, look, tex=512, ao_dist=1.2, organic_angle=70, hard=()):
    """join body + head parts, write regions, bake one atlas, skin to the shared skeleton.
    Returns (mesh, armature, Rig)."""
    parts = []
    for ob, w in B.rigid:
        kit.weights(ob, w)
    for ob, w in H.finish():
        if w is None:
            if not ob.vertex_groups:
                kit.weights(ob, 'head')
        else:
            kit.weights(ob, w)
        parts.append(ob)
    parts = B.parts + parts
    hard = set(hard)
    for o in parts:
        if o.name.split('.')[0] in hard or o.get('hard'):
            kit.smooth(o, 35)
        else:
            kit.smooth(o, organic_angle)
    tri = {}
    for o in parts:
        n = o.name.split('.')[0]
        tri[n] = tri.get(n, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
    kit.log('tris by part: ' + ', '.join('%s %d' % kv for kv in sorted(tri.items(), key=lambda kv: -kv[1])))
    me = kit.join(parts, A.id)
    used = write_regions(me)
    A.tint = look.spec(me)
    A.meta['regionsUsed'] = [look.names[i] for i in used if i < len(look.names)]
    arm = kit.build_armature(J, rig_name, A.coll)
    A.armature = arm
    if not LOOKDEV:
        kit.finish_atlas(A, [me], size=tex, ao_samples=32, albedo_samples=8, ao_strength=0.6, ao_dist=ao_dist, orm=False)
    mod = me.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    me.parent = arm
    kit.normalize_weights(me, 4)
    return me, arm, kit.Rig(arm, J)


def std_anchors(A, J, arm, head_sc=1.0, eye_dz=0.62, top_dz=1.42):
    for sx, S in ((1, 'L'), (-1, 'R')):
        A.anchor('sole_heel_' + S, (J['heel'][0] * sx, J['heel'][1], 0.0), arm, 'foot_' + S)
        A.anchor('sole_toe_' + S, (J['toe'][0] * sx, J['toe'][1], 0.0), arm, 'toe_' + S)
        A.anchor('grip_' + S, tuple(Vector(mir(J['wrist'], sx)) * 0.4 + Vector(mir(J['hand_tip'], sx)) * 0.6), arm, 'hand_' + S)
    A.anchor('eye', (0.0, J['head'][1] - 0.5 * head_sc, J['head'][2] + eye_dz * head_sc), arm, 'head')
    A.anchor('head_top', (0.0, J['head'][1], J['head'][2] + top_dz * head_sc), arm, 'head')


def lookdev_render(A, arm, shots, out_prefix=None, size=320, samples=16):
    """render the unbaked build scene (procedural materials) posed by clip / frame; then exit"""
    import sys
    sc = bpy.context.scene
    kit._preview_world(sc, 0.9)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = False
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    gme = bpy.data.meshes.new('_g')
    bm.to_mesh(gme)
    bm.free()
    g = bpy.data.objects.new('_g', gme)
    sc.collection.objects.link(g)
    gm = bpy.data.materials.new('_gm')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = kit.lin('#b9ad98')
    gme.materials.append(gm)
    ld = bpy.data.lights.new('_s', 'SUN')
    ld.energy = 3.2
    ld.angle = math.radians(3)
    lo = bpy.data.objects.new('_s', ld)
    sc.collection.objects.link(lo)
    lo.rotation_euler = Vector((0.9, 0.35, 0.5)).normalized().to_track_quat('Z', 'Y').to_euler()
    cd = bpy.data.cameras.new('_c')
    cam = bpy.data.objects.new('_c', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    outs = []
    prefix = out_prefix or os.path.join(kit.TMP_DIR, 'lookdev_' + A.id)
    for i, s in enumerate(shots):
        clip, fr = s.get('clip'), s.get('frame', 0)
        if clip and bpy.data.actions.get(clip):
            arm.animation_data_create()
            arm.animation_data.action = bpy.data.actions[clip]
            try:
                arm.animation_data.action_slot = bpy.data.actions[clip].slots[0]
            except Exception:
                pass
        sc.frame_set(int(fr))
        az, el = math.radians(s.get('az', -30)), math.radians(s.get('el', 12))
        tgt = Vector(s.get('target', (0, 0, 3.6)))
        d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        cd.angle = math.radians(s.get('fov', 30))
        cam.location = tgt + d * s.get('dist', 16)
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        p = '%s_%02d.png' % (prefix, i)
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        outs.append(p)
    sheet = prefix + '.png'
    kit.contact_sheet(outs, sheet, cols=min(4, len(outs)), cell=size)
    kit.log('lookdev sheet', sheet)
    sys.stdout.flush()
    os._exit(0)


# =========================================================================== clips (shared skeleton)
# Every clip is authored on kit.Rig (armature space: +X = the character's left, -Y = forward, Z up)
# from KEY POSES: a key is a dict of pose parameters (missing ones inherit from the previous key)
# and the keys are interpolated with C1 Hermite curves (wrapping for loops), so motion flows
# through the keys instead of stopping at each. Feet are always solved with leg IK on top of the
# ground (planted feet roll on the heel / ball with kit.roll_foot); hands use FK angles or IK
# targets (an arm that is IK'd in any key is IK'd in every key: FK keys are converted to their
# wrist positions first, so switching never pops). Positions are in KID units and scale with the
# rig (k = hip height / kid hip height, ~1.30 for adults).
from kit import Rx, Ry, Rz, Raxis, foot_rot, roll_foot   # noqa: E402

LOW = math.radians(40)          # upper-arm Ry from the A-pose down to the side


def rig_k(R):
    return R.hip_z / kit.KID_J['hip'][2]


ZERO = dict(hx=0.0, hy=0.0, hz=0.0, hp=0.0, hr=0.0, hyaw=0.0, sp=0.0, sr=0.0, syaw=0.0, cp=0.0, cr=0.0, cyaw=0.0,
            np=0.0, nr=0.0, nyaw=0.0, xp=0.0, xr=0.0, xyaw=0.0)
for _S in 'LR':
    ZERO.update({'sh' + _S: 0.0, 'sf' + _S: 0.0, 'ua' + _S: 0.0, 'uf' + _S: 0.0, 'ut' + _S: 0.0, 'el' + _S: 0.24, 'hd' + _S: 0.14, 'ht' + _S: 0.0,
                 'fx' + _S: 0.0, 'fy' + _S: 0.0, 'fz' + _S: 0.0, 'ft' + _S: 0.0, 'fw' + _S: 0.08, 'tt' + _S: 0.0, 'g' + _S: 1.0})
TUPLE_KEYS = ('hL', 'hR', 'pL', 'pR', 'kL', 'kR', 'aL', 'aR')


def solve_pose(R, Q):
    """pose parameters -> kit.Rig pose P (see the section comment for the conventions)
    hips hx / hy (forward) / hz; pitch p (forward +), roll r (towards the left +), yaw (turn left +)
    per side S: sh (shrug up), sf (shoulder forward), ua (arm raised sideways from hanging, rad),
    uf (arm swung forwards), ut (upper-arm twist), el (elbow bend), hd (wrist bend), ht (wrist twist),
    hS (IK wrist target, kid units) + pS (elbow pole); legs fx (outwards) fy (forward) fz (up) of
    the ankle, ft (foot pitch, toes up +), fw (toes out), tt (toe bend), gS (1 = grounded: the
    sole rolls on the ground), aS (absolute ankle target, u) + kS (knee pole)."""
    k = rig_k(R)
    J = R.J
    P = R.pose()
    R.fk(P, 'root')
    R.fk(P, 'hips', Rz(Q['hyaw']) @ Ry(Q['hr']) @ Rx(Q['hp']), t=(Q['hx'] * k, -Q['hy'] * k, Q['hz'] * k))
    R.fk(P, 'spine', Rz(Q['syaw']) @ Ry(Q['sr']) @ Rx(Q['sp']))
    R.fk(P, 'chest', Rz(Q['cyaw']) @ Ry(Q['cr']) @ Rx(Q['cp']))
    R.fk(P, 'neck', Rz(Q['nyaw']) @ Ry(Q['nr']) @ Rx(Q['np']))
    R.fk(P, 'head', Rz(Q['xyaw']) @ Ry(Q['xr']) @ Rx(Q['xp']))
    for S, sx in (('L', 1), ('R', -1)):
        ua, fa, hd = 'upperarm_' + S, 'forearm_' + S, 'hand_' + S
        R.fk(P, 'shoulder_' + S, Rz(-sx * Q['sf' + S]) @ Ry(-sx * Q['sh' + S]))
        rest_d = (R.head[fa] - R.head[ua]).normalized()
        hinge = rest_d.cross(Vector((0, -1, 0)))
        tgt = Q.get('h' + S)
        if tgt is not None:
            pole = Q.get('p' + S) or (sx * 0.8, 0.6, -0.3)
            R.arm_ik(P, S, Vector(tgt) * k, None, pole=pole)
        else:
            Rr = Rx(-Q['uf' + S]) @ Ry(sx * (LOW - Q['ua' + S]))
            if Q['ut' + S]:
                Rr = Raxis(Rr.to_3x3() @ rest_d, sx * Q['ut' + S]) @ Rr
            R.fk(P, ua, Rr)
            R.fk(P, fa, Raxis(hinge, Q['el' + S]))
        fd = (R.head[hd] - R.head[fa]).normalized()
        R.fk(P, hd, Raxis(fd, sx * Q['ht' + S]) @ Raxis(hinge, Q['hd' + S]))
    for S, sx in (('L', 1), ('R', -1)):
        yaw = sx * Q['fw' + S]
        th = Q['ft' + S]
        a = Q.get('a' + S)
        grounded = Q['g' + S] > 0.5 and a is None
        if a is not None:
            ankle = Vector((sx * a[0], J['ankle'][1] - a[1], a[2]))
        else:
            x = sx * (J['ankle'][0] + Q['fx' + S] * k)
            f = Q['fy' + S] * k
            if grounded:
                F, z = roll_foot(R, f, th)
                z += Q['fz' + S] * k
            else:
                F, z = f, R.ankle_z + Q['fz' + S] * k
            ankle = Vector((x, J['ankle'][1] - F, z))
        fR = foot_rot(th, yaw)
        tR = foot_rot(0.0, yaw) if (grounded and th < 0 and abs(Q['fz' + S]) < 1e-4) else foot_rot(th + Q['tt' + S], yaw)
        pole = Q.get('k' + S) or (sx * 0.12, -1, 0)
        R.leg_ik(P, S, ankle, fR, tR, pole=pole)
    return P


def wrist_of(R, P, S):
    return P['hand_' + S] @ R.head['hand_' + S]


def expand_keys(keys, base=None):
    out = []
    cur = dict(base or ZERO)
    for t, q in keys:
        cur = dict(cur)
        cur.update(q)
        out.append((float(t), cur))
    return out


def _hermite(v0, v1, m0, m1, dt, s):
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * dt * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * dt * m1


def sample_keys(full, t, loop, ease_ends=True):
    """C1 interpolation of the expanded keys at t in [0, 1] (Hermite with finite-difference
    tangents; loops wrap, one-shots ease in / out of the first / last key)"""
    n = len(full)
    if n == 1:
        return dict(full[0][1])
    ts = [k[0] for k in full]
    if t <= ts[0]:
        return dict(full[0][1])
    if t >= ts[-1]:
        return dict(full[-1][1])
    i = max(j for j in range(n - 1) if ts[j] <= t)
    t0, t1 = ts[i], ts[i + 1]
    dt = max(1e-6, t1 - t0)
    s = (t - t0) / dt

    def nb(j):
        """neighbour key j (wrapped for loops): (time, values)"""
        if 0 <= j < n:
            return ts[j], full[j][1]
        if not loop:
            return None
        if j < 0:   # the last key equals the first: step over it
            return ts[n - 1 + j] - 1.0, full[n - 1 + j][1]
        return ts[j - n + 1] + 1.0, full[j - n + 1][1]
    out = {}
    q0, q1 = full[i][1], full[i + 1][1]
    prv, nxt = nb(i - 1), nb(i + 2)

    def vec(v):
        return list(v) if isinstance(v, (tuple, list)) else [v]
    for key in q0:
        a, b = q0[key], q1.get(key, q0[key])
        if a is None or b is None or isinstance(a, str):
            out[key] = b if s > 0.5 else a
            continue
        tup = isinstance(a, (tuple, list))
        A, B = vec(a), vec(b)
        pv = prv[1].get(key) if prv else None
        nv = nxt[1].get(key) if nxt else None
        PV = vec(pv) if pv is not None and not isinstance(pv, str) else None
        NV = vec(nv) if nv is not None and not isinstance(nv, str) else None
        res = []
        for c in range(len(A)):
            if PV is not None:
                m0 = (B[c] - PV[c]) / max(1e-6, t1 - prv[0])
            else:
                m0 = 0.0 if ease_ends else (B[c] - A[c]) / dt
            if NV is not None:
                m1 = (NV[c] - A[c]) / max(1e-6, nxt[0] - t0)
            else:
                m1 = 0.0 if ease_ends else (B[c] - A[c]) / dt
            res.append(_hermite(A[c], B[c], m0, m1, dt, s))
        out[key] = tuple(res) if tup else res[0]
    return out


def keyed_clip(R, name, frames, keys, loop=True, extra=None, base=None, entry=None, check_feet=True):
    """author a clip from key poses; extra(t, Q) adds per-frame motion (breathing, waving...).
    Returns the manifest entry (+ 'feet': lowest / highest grounded sole point for checks)."""
    k = rig_k(R)
    full = expand_keys(keys, base)
    if loop and full[-1][0] < 1.0:
        full.append((1.0, dict(full[0][1])))
    for S in 'LR':
        if any(q.get('h' + S) is not None for _, q in full):
            for _, q in full:
                if q.get('h' + S) is None:
                    q2 = dict(q)
                    P = solve_pose(R, q2)
                    w = wrist_of(R, P, S)
                    q['h' + S] = tuple(c / k for c in w)
    act = R.begin(name)
    lo, hi = 9.0, -9.0
    for fr in range(frames + 1):
        t = fr / frames
        Q = sample_keys(full, t, loop)
        if extra:
            extra(t, Q)
        P = solve_pose(R, Q)
        R.key(P, fr)
        if check_feet:
            so = kit._soles(R, P)
            for S in 'LR':
                if Q.get('g' + S, 1) > 0.5 and Q.get('a' + S) is None:
                    for v in so[S]:
                        lo, hi = min(lo, v.z), max(hi, v.z)
    R.end(act, 0, frames, cyclic=loop)
    e = {'loop': bool(loop), 'loco': False, 'frames': frames, 'fps': kit.FPS, 'duration': round(frames / kit.FPS, 4)}
    if check_feet and lo < 9:
        e['feet'] = {'low': round(lo, 3), 'high': round(hi, 3)}
    if entry:
        e.update(entry)
    kit.log('clip %s: %d frames%s%s' % (name, frames, ' loop' if loop else '', (' feet z %.3f..%.3f' % (lo, hi)) if lo < 9 else ''))
    return e


def breathe(amp=1.0, n=3):
    def f(t, Q):
        b = math.sin(2 * math.pi * t * n)
        Q['cp'] -= 0.022 * b * amp
        Q['sp'] += 0.008 * b * amp
        Q['shL'] += 0.025 * b * amp
        Q['shR'] += 0.025 * b * amp
        Q['xp'] += 0.012 * b * amp
    return f


def chain(*fs):
    def f(t, Q):
        for g in fs:
            if g:
                g(t, Q)
    return f


# ---------------------------------------------------------------- locomotion variants
GAITS_X = {
    'sprint': dict(stride=20.0, duty=0.23, lift=1.8, thH=0.12, thT=0.95, cap=0.50, bob=0.48, lean=0.34, arm=1.15, elbow=1.62, pelvis=0.24, sway=0.02, footx=0.17, run=True, nominal=105.0),
    'stroll_f': dict(stride=4.4, duty=0.62, lift=0.26, thH=0.24, thT=0.42, cap=0.09, bob=0.0, lean=0.02, arm=0.16, elbow=0.26, pelvis=0.13, sway=0.075, footx=0.17, run=False, nominal=13.0),
    'walk_f': dict(stride=9.4, duty=0.42, lift=0.46, thH=0.27, thT=0.55, cap=0.23, bob=0.03, lean=0.04, arm=0.30, elbow=0.34, pelvis=0.20, sway=0.06, footx=0.15, run=False, nominal=42.0),
    'push_cart': dict(stride=6.6, duty=0.52, lift=0.36, thH=0.24, thT=0.62, cap=0.34, bob=0.02, lean=0.30, arm=0.0, elbow=0.0, pelvis=0.08, sway=0.035, footx=0.30, run=False, nominal=22.0),
}


def gait_clip_x(R, name, g, frames=32, scale=1.0, arms=None, torso=None, hands=None, entry=None):
    """kit.gait_clip with hooks (same planted-foot stance, swing, pelvis and flight solution):
    arms(P, u, g, R) poses the arms instead of the counter-swing; hands(u) -> {S: (wrist target in
    root space, kid units), 'pole': ...} IK's them (push a cart); torso(u, g) -> (spine, chest, neck,
    head) extra pitch. Returns the manifest entry with the slip check."""
    g = dict(g)
    if scale != 1.0:
        for key in ('stride', 'lift', 'footx', 'cap'):
            g[key] = g[key] * scale
    S_, beta = g['stride'], g['duty']
    J = R.J
    footx = g['footx']
    L = R.leg
    k = rig_k(R)
    act = R.begin(name)
    lower = math.radians(38)
    hip_rest = R.hip_z

    def foot_at(u):
        u = u % 1.0
        if u < beta:
            s = u / beta
            th = 0.0
            if s < 0.18:
                th = g['thH'] * (1 - s / 0.18) ** 2
            elif s > 0.58:
                th = -g['thT'] * ((s - 0.58) / 0.42) ** 2
            f = beta * S_ / 2 - S_ * u
            F, z = roll_foot(R, f, th)
            return F, z, th, True, s
        s = (u - beta) / (1 - beta)
        F0, z0 = roll_foot(R, -beta * S_ / 2, -g['thT'])
        F1, z1 = roll_foot(R, beta * S_ / 2, g['thH'])
        m = -S_ * (1 - beta)
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
        kk = 0.985 if not run else (0.95 - 0.06 * math.sin(math.pi * s))
        Lk = L * kk
        d = min(abs(F), Lk * 0.995)
        return z + math.sqrt(Lk * Lk - d * d)

    seq = []
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
            h2 = (u * 2) % 1.0
            q = min(1.0, max(0.0, (h2 * 0.5 - beta) / max(0.01, 0.5 - beta)))
            Fa, za = roll_foot(R, -beta * S_ / 2, -g['thT'])
            Fb, zb = roll_foot(R, beta * S_ / 2, g['thH'])
            a = min(cap, hip_limit(Fa, za, True, 1.0))
            b = min(cap, hip_limit(Fb, zb, True, 0.0))
            hz = a + (b - a) * q + 4 * g['bob'] * q * (1 - q)
        c = math.cos(2 * math.pi * u)
        sway = g['sway'] * math.cos(2 * math.pi * (u - beta / 2))
        yaw = -g['pelvis'] * 0.5 * c
        roll = 0.05 * math.sin(2 * math.pi * u * 2) * (0 if g['run'] else 1)
        dz = hz - hip_rest
        R.fk(P, 'root')
        R.fk(P, 'hips', Rz(yaw) @ Ry(roll), t=(sway, 0, dz))
        lean = g['lean']
        ex = torso(u, g) if torso else (0.0, 0.0, 0.0, 0.0)
        R.fk(P, 'spine', Rx(lean * 0.5 + ex[0]) @ Rz(-yaw * 0.6))
        R.fk(P, 'chest', Rx(lean * 0.5 + ex[1]) @ Rz(-yaw * 0.9))
        R.fk(P, 'neck', Rx(-lean * 0.5 + ex[2]) @ Rz(yaw * 0.3))
        R.fk(P, 'head', Rx(-lean * 0.4 - 0.02 * math.sin(4 * math.pi * u) + ex[3]))
        if hands:
            H = hands(u)
            for s, sx in (('L', 1), ('R', -1)):
                R.fk(P, 'shoulder_' + s, Rz(-sx * 0.15))
                T = Vector(H[s]) * k
                R.arm_ik(P, s, T, None, pole=H.get('pole_' + s, (sx * 0.9, 0.5, -0.4)))
        elif arms:
            arms(P, u, g, R)
        else:
            for s, sx, ph in (('L', 1, 0.5), ('R', -1, 0.0)):
                sw = g['arm'] * math.cos(2 * math.pi * (u - ph - 0.04))
                R.fk(P, 'shoulder_' + s, Rx(-0.12 * sw))
                R.fk(P, 'upperarm_' + s, Rx(-sw) @ Ry(lower * sx))
                el = g['elbow'] + (0.25 * max(0.0, math.cos(2 * math.pi * (u - ph))) if not g['run'] else 0.18 * math.cos(2 * math.pi * (u - ph)))
                ad = (R.head['forearm_' + s] - R.head['upperarm_' + s]).normalized()
                hinge = ad.cross(Vector((0, -1, 0)))
                R.fk(P, 'forearm_' + s, Raxis(hinge, el))
                R.fk(P, 'hand_' + s, Raxis(hinge, 0.12))
        for s, sx, f in (('L', 1, fL), ('R', -1, fR)):
            F, z, th, st, _ = f
            ankle = Vector((sx * footx, -F + J['ankle'][1], z))
            tR = foot_rot(th)
            toeR = Matrix.Identity(4) if th < 0 and st else (foot_rot(th * 0.6) if not st else tR)
            if not st and th < 0:
                toeR = foot_rot(th * 0.4)
            R.leg_ik(P, s, ankle, tR, toeR, pole=(sx * 0.12, -1, 0))
        R.key(P, fr)
        seq.append(kit._soles(R, P))
    R.end(act, 0, frames, cyclic=True)
    slip = kit._slip_report(seq, S_ / frames)
    e = {'loop': True, 'loco': True, 'frames': frames, 'fps': kit.FPS, 'duration': round(frames / kit.FPS, 4),
         'stride': round(S_, 4), 'nominal': g['nominal'], 'speed': round(S_ / (frames / kit.FPS), 3), 'duty': beta,
         'gait': 'run' if g['run'] else 'walk', 'phase0': 'left heel strike', 'slip': slip}
    if entry:
        e.update(entry)
    kit.log('clip %s: stride %.2f u, duty %.2f, nominal %.0f u/s; slip %s' % (name, S_, beta, g['nominal'], slip))
    return e


# ---------------------------------------------------------------- the clip library (both rigs)
BENCH_HIP = 2.6       # hip-joint height (u) of a person on a bench (= view3d_actors' seated people)
STEP_HIP = 2.2        # ... on a kerb / step
BENCH_TOP = 2.22      # seat surfaces the runtime draws under seated models
STEP_TOP = 1.84


def _hz(R, z_abs):
    """hips translation (kid units) that puts the hip joints at absolute height z_abs"""
    return (z_abs - R.hip_z) / rig_k(R)


def clip_idle_look(R, name='idle_look', frames=180):
    """standing about: weight shifts, a long look left, up at the sky (kites, pigeons), right,
    a glance down at the feet (a toe scuffs the dust), a sigh"""
    keys = [
        (0.00, dict(hx=0.05, uaL=0.06, uaR=0.06, elL=0.26, elR=0.26)),
        (0.14, dict(hx=0.08, hr=0.02, nyaw=0.32, xyaw=0.42, cyaw=0.12, syaw=0.04)),
        (0.28, dict(nyaw=0.22, xyaw=0.28, xp=-0.38, np=-0.14, cp=-0.05, cyaw=0.08)),
        (0.40, dict(nyaw=0.0, xyaw=0.0, xp=-0.05, np=0.0, cp=0.0, cyaw=0.0, syaw=0.0, hx=0.0, hr=0.0)),
        (0.54, dict(hx=-0.08, hr=-0.02, nyaw=-0.34, xyaw=-0.42, cyaw=-0.12, syaw=-0.04)),
        (0.68, dict(nyaw=-0.1, xyaw=-0.06, xp=0.32, np=0.12, cyaw=-0.02, gR=0.0, fyR=0.25, fzR=0.12, ftR=0.15)),
        (0.74, dict(fyR=0.05, fzR=0.04, ftR=-0.1)),
        (0.80, dict(gR=1.0, fyR=0.0, fzR=0.0, ftR=0.0, xp=0.05, np=0.0)),
        (0.90, dict(hx=0.03, nyaw=0.0, xyaw=0.0, cp=-0.06, shL=0.12, shR=0.12, syaw=0.0, cyaw=0.0)),
    ]
    return keyed_clip(R, name, frames, keys, loop=True, extra=breathe(1.0, 4))


def clip_talk(R, name='talk', frames=120):
    """chatting: weight on one leg, the right hand explains, palms open, a shrug, the left hand
    on the hip, nods"""
    keys = [
        (0.00, dict(hx=0.06, ufR=0.35, uaR=0.12, elR=1.0, htR=0.3, elL=0.3)),
        (0.18, dict(ufR=0.85, uaR=0.25, elR=1.65, htR=0.9, xr=0.07, xp=0.04)),
        (0.33, dict(ufR=0.55, uaR=0.18, elR=1.25, htR=0.5, xr=0.0)),
        (0.48, dict(ufL=0.5, uaL=0.38, elL=1.05, htL=0.8, ufR=0.6, uaR=0.42, elR=1.1, htR=0.9, shL=0.18, shR=0.18, xp=-0.05, hx=0.02)),
        (0.60, dict(ufL=0.1, uaL=0.1, elL=0.4, htL=0.0, shL=0.0, shR=0.0, xp=0.0)),
        (0.72, dict(ufL=-0.18, uaL=0.62, elL=1.95, htL=-0.4, ufR=0.95, uaR=0.15, elR=1.9, htR=0.2, hx=0.07, xr=-0.06)),
        (0.86, dict(ufR=0.5, elR=1.2, xr=0.0)),
    ]

    def nod(t, Q):
        Q['xp'] += 0.05 * math.sin(2 * math.pi * t * 6)
        Q['xyaw'] += 0.06 * math.sin(2 * math.pi * t * 2 + 0.6)
    return keyed_clip(R, name, frames, keys, loop=True, extra=chain(breathe(0.8, 4), nod))


def clip_wave(R, name='wave', frames=60):
    """a big friendly wave with the right hand (one-shot, back to the stance)"""
    keys = [
        (0.00, {}),
        (0.16, dict(uaR=2.05, ufR=0.35, elR=1.25, htR=0.5, hr=0.03, xr=0.08, shR=0.15)),
        (0.84, dict(uaR=2.05, ufR=0.35, elR=1.25, htR=0.5, hr=0.03, xr=0.08, shR=0.15)),
        (1.00, {}),
    ]

    def wv(t, Q):
        if 0.16 < t < 0.84:
            w = math.sin((t - 0.16) / 0.68 * math.pi * 6)
            Q['utR'] += 0.42 * w
            Q['hdR'] += 0.25 * w
            Q['xyaw'] += 0.04 * w
    return keyed_clip(R, name, frames, keys, loop=False, extra=wv)


def clip_clap(R, name='clap', frames=40):
    """the Golconda clap: arms up in front of the face, two loud cupped claps per loop"""
    o = dict(hL=(0.42, -0.95, 5.55), hR=(-0.42, -0.95, 5.55), pL=(1.0, 0.25, -0.6), pR=(-1.0, 0.25, -0.6), xp=-0.18, np=-0.08, cp=-0.04)
    c = dict(hL=(0.07, -1.18, 5.75), hR=(-0.07, -1.18, 5.75), xp=-0.22, hz=-0.04)
    keys = [(0.00, o), (0.18, c), (0.30, dict(o)), (0.50, dict(o)), (0.68, dict(c)), (0.80, dict(o))]
    return keyed_clip(R, name, frames, keys, loop=True, extra=breathe(0.5, 1))


def _sit_keys(R, hip, kid_dangle):
    """bench / step sitting pose: hips at absolute height `hip`; adults (and kids on a low
    step) plant both feet; a kid on a bench lets them dangle"""
    k = rig_k(R)
    J = R.J
    knee_fwd = (J['hip'][2] - J['knee'][2]) * 0.98   # ~thigh length forwards
    base = dict(hz=_hz(R, hip), hp=-0.12, sp=0.1, cp=0.04, np=-0.02)
    if kid_dangle:
        ank = (J['ankle'][0] + 0.02, knee_fwd + 0.05, hip - (J['knee'][2] - J['ankle'][2]) - 0.05)
        base.update(aL=ank, aR=ank, kL=(0.1, -1, 0.2), kR=(-0.1, -1, 0.2), ftL=-0.25, ftR=-0.25,
                    hL=(0.78, -0.25, (hip - 0.36) / k), hR=(-0.78, -0.25, (hip - 0.36) / k),
                    pL=(0.8, 0.2, -0.5), pR=(-0.8, 0.2, -0.5))
    else:
        base.update(gL=1.0, gR=1.0, fyL=(knee_fwd + 0.12) / k, fyR=(knee_fwd + 0.08) / k, fxL=0.06, fxR=0.06,
                    hL=(0.55, -(knee_fwd * 0.8) / k, (hip + 0.32 * k) / k), hR=(-0.55, -(knee_fwd * 0.8) / k, (hip + 0.32 * k) / k),
                    pL=(0.9, 0.5, -0.4), pR=(-0.9, 0.5, -0.4), kL=(0.15, -1, 0.3), kR=(-0.15, -1, 0.3))
    return base


def clip_sit(R, name='sit', hip=BENCH_HIP, frames=90, kid=False):
    k = rig_k(R)
    J = R.J
    knee_fwd = (J['hip'][2] - J['knee'][2]) * 0.98
    dangle = kid and hip > J['knee'][2] + 0.4
    b = _sit_keys(R, hip, dangle)
    keys = [(0.0, b), (0.5, dict(b, xyaw=0.15, nyaw=0.08, hx=0.01))]

    def swing(t, Q):
        if dangle:
            # a kid swings both legs, alternately, under the bench
            for S, ph in (('L', 0.0), ('R', 0.5)):
                a = list(Q['a' + S])
                s = math.sin(2 * math.pi * (t * 2 + ph))
                a[1] = knee_fwd + 0.05 + 0.45 * s
                a[2] = hip - (J['knee'][2] - J['ankle'][2]) * (0.97 - 0.06 * abs(s)) - 0.05 + 0.25 * max(0.0, s)
                Q['a' + S] = tuple(a)
    return keyed_clip(R, name, frames, keys, loop=True, extra=chain(breathe(1.0, 3), swing),
                      entry={'seat': True, 'hip': hip, 'seatTop': BENCH_TOP if hip >= BENCH_HIP - 0.01 else STEP_TOP}, check_feet=not dangle)


def clip_sit_ground(R, name='sit_ground', frames=90):
    """cross-legged on the ground (marbles, kite strings, chai on the pavement)"""
    k = rig_k(R)
    hip = 0.46 * k
    b = dict(hz=_hz(R, hip), hp=-0.25, sp=0.26, cp=0.12, np=-0.12, xp=-0.08,
             aL=(-0.32 * k, 1.25 * k, 0.30 * k), aR=(-0.36 * k, 0.86 * k, 0.32 * k), fwL=-1.25, fwR=-1.15, ftL=0.25, ftR=0.25,
             kL=(1.0, -0.5, 0.35), kR=(-1.0, -0.5, 0.35),
             hL=(1.02, -0.85, 1.05), hR=(-1.02, -0.85, 1.05), pL=(0.6, 0.6, -0.4), pR=(-0.6, 0.6, -0.4))
    keys = [(0.0, b), (0.5, dict(b, xyaw=0.2, nyaw=0.08, sr=0.03))]
    return keyed_clip(R, name, frames, keys, loop=True, extra=breathe(1.0, 3), entry={'seat': 'ground', 'hip': round(hip, 3)}, check_feet=False)


def fall_end(R):
    """the comic fall ends here (and getup starts here): on the bottom, legs out, leaning back
    on both hands, a little dizzy"""
    k = rig_k(R)
    return dict(hz=_hz(R, 0.46 * k), hy=-0.1, hp=-0.55, sp=0.05, cp=0.05, np=0.12, xp=0.08, xr=0.1,
                gL=1.0, gR=1.0, fyL=2.45, fyR=2.2, fxL=0.12, fxR=0.18, ftL=0.95, ftR=0.85, fwL=0.25, fwR=0.3,
                kL=(0.1, -0.3, 1.0), kR=(-0.1, -0.3, 1.0),
                hL=(0.86, 0.95, 0.28), hR=(-0.86, 0.95, 0.28), pL=(0.8, 0.6, 0.3), pR=(-0.8, 0.6, 0.3))


def clip_fall(R, name='fall', frames=40):
    """a comic tumble (never hurt): a foot slips, arms windmill, a bounce on the bottom, dazed"""
    k = rig_k(R)
    end = fall_end(R)
    stand = dict(hL=None, hR=None)
    keys = [
        (0.00, stand),
        (0.14, dict(gL=0.0, fyL=0.9, fzL=0.45, ftL=0.6, hp=-0.25, sp=-0.18, xp=-0.2, hz=0.06,
                    uaL=1.7, uaR=1.5, ufL=0.7, ufR=0.4, elL=0.6, elR=0.5)),
        (0.32, dict(gL=0.0, gR=0.0, fyL=1.9, fzL=1.25, fyR=1.5, fzR=0.9, ftL=0.8, ftR=0.7, hz=_hz(R, 1.4 * k), hy=-0.25, hp=-0.6,
                    sp=-0.25, uaL=2.3, uaR=2.2, ufL=0.9, ufR=0.8, elL=0.4, elR=0.4)),
        (0.48, dict(end, hz=end['hz'] - 0.05, gL=1.0, gR=1.0, fzL=0.0, fzR=0.0)),
        (0.58, dict(end, hz=end['hz'] + 0.22, gL=0.0, gR=0.0, fzL=0.45, fzR=0.35, hp=-0.7, xp=-0.1)),
        (0.70, dict(end)),
        (1.00, dict(end, xr=-0.12, xyaw=-0.15)),
    ]

    def dizzy(t, Q):
        if t > 0.7:
            a = (t - 0.7) / 0.3 * math.pi * 4
            Q['xr'] += 0.08 * math.sin(a)
            Q['xyaw'] += 0.1 * math.cos(a)
    return keyed_clip(R, name, frames, keys, loop=False, extra=dizzy, check_feet=False)


def clip_getup(R, name='getup', frames=48):
    k = rig_k(R)
    end = fall_end(R)
    end = dict(end, xr=-0.12, xyaw=-0.15)
    keys = [
        (0.00, end),
        (0.28, dict(fyL=0.75, fyR=0.55, ftL=0.0, ftR=0.0, fwL=0.15, fwR=0.15, hp=0.25, sp=0.5, cp=0.15, xr=0.0, xyaw=0.0, np=0.0, xp=0.1,
                    hL=(0.95, 0.1, 0.3), hR=(-0.95, 0.15, 0.3), kL=(0.2, -1, 0.4), kR=(-0.2, -1, 0.4))),
        (0.50, dict(hz=_hz(R, 1.55 * k), hy=0.45, hp=0.75, sp=0.45, cp=0.2, fyL=0.2, fyR=0.05,
                    hL=(0.55, -0.95, 1.95), hR=(-0.55, -0.95, 1.95), kL=(0.12, -1, 0), kR=(-0.12, -1, 0))),
        (0.72, dict(hz=-0.15, hy=0.05, hp=0.15, sp=0.08, cp=0.0, fyL=0.0, fyR=0.0, fxL=0.0, fxR=0.0, fwL=0.08, fwR=0.08,
                    hL=(0.6, 0.55, 3.0), hR=(-0.6, 0.55, 3.0), pL=(0.8, -0.2, -0.3), pR=(-0.8, -0.2, -0.3), xp=0.15)),
        (0.80, dict(hL=(0.6, 0.66, 2.85), hR=(-0.6, 0.6, 2.95), hz=-0.08)),
        (0.88, dict(hL=(0.6, 0.55, 3.0), hR=(-0.6, 0.68, 2.85))),
        (1.00, dict(hz=0.0, hy=0.0, hp=0.0, sp=0.0, xp=0.0, hL=None, hR=None)),
    ]
    return keyed_clip(R, name, frames, keys, loop=False, check_feet=False)


def clip_pick(R, name='pick', frames=40):
    """squat, pick something up from the ground with the right hand, stand and look at it"""
    k = rig_k(R)
    keys = [
        (0.00, dict(hL=None, hR=None)),
        (0.32, dict(hz=_hz(R, 1.72 * k), hy=0.18, hp=0.55, sp=0.42, cp=0.22, np=0.1, xp=0.2, ftL=-0.28, ftR=-0.18, fyL=0.12, fyR=-0.1,
                    fxL=0.1, fxR=0.1, kL=(0.5, -1, 0), kR=(-0.5, -1, 0),
                    hR=(-0.28, -1.5, 0.32), pR=(-0.6, 0.4, 0.2), hL=(0.62, -1.15, 2.05), pL=(0.8, 0.5, -0.3))),
        (0.48, dict(hR=(-0.26, -1.48, 0.28), xp=0.24)),
        (0.74, dict(hz=-0.05, hy=0.0, hp=0.05, sp=0.05, cp=0.0, np=0.06, xp=0.32, ftL=0.0, ftR=0.0, fyL=0.0, fyR=0.0, fxL=0.0, fxR=0.0,
                    kL=None, kR=None, hR=(-0.35, -1.05, 4.55), pR=(-0.9, 0.6, -0.3), hL=(0.62, -0.1, 2.95), xr=0.12)),
        (0.88, dict(hR=(-0.3, -1.0, 4.6), xr=0.16, xyaw=-0.1)),
        (1.00, dict(hz=0.0, np=0.0, xp=0.0, xr=0.0, xyaw=0.0, hL=None, hR=None)),
    ]
    return keyed_clip(R, name, frames, keys, loop=False, check_feet=False)


def clip_kite_fly(R, name='kite_fly', frames=90):
    """flying a patang: feet apart, leaning back, eyes on the sky, the right hand high on the
    string with three tugs, the charkhi in the left hand at the waist"""
    up = dict(fxL=0.18, fxR=0.18, fyL=0.25, fyR=-0.2, fwL=0.25, fwR=0.2, hp=-0.06, sp=-0.1, cp=-0.06, np=-0.22, xp=-0.42,
              hR=(-0.32, -1.25, 6.75), pR=(-1.0, 0.3, -0.2), hL=(0.42, -0.95, 3.85), pL=(0.9, 0.6, -0.3))
    dn = dict(up, hR=(-0.3, -1.1, 6.05), sp=-0.06, hx=-0.03)
    keys = [(0.0, up), (0.10, dn), (0.22, dict(up)), (0.33, dict(dn)), (0.45, dict(up)), (0.56, dict(dn)), (0.70, dict(up, xyaw=-0.15, nyaw=-0.06)),
            (0.85, dict(up, xyaw=0.12, nyaw=0.05))]
    return keyed_clip(R, name, frames, keys, loop=True, extra=breathe(0.6, 2))


def clip_direct(R, name='direct', frames=48):
    """a traffic constable at a junction: the left arm out (stop), the right arm waves the
    traffic on, the head turns with it"""
    a = dict(uaL=1.55, ufL=0.1, elL=0.12, htL=1.3, hdL=-0.5, uaR=0.35, ufR=0.15, elR=1.4, hx=0.03, xyaw=0.25, nyaw=0.1)
    b = dict(a, ufR=1.35, uaR=0.25, elR=0.45, xyaw=-0.1, nyaw=-0.05)
    keys = [(0.0, a), (0.5, b)]
    return keyed_clip(R, name, frames, keys, loop=True, extra=breathe(0.5, 1))


CART_HANDS = {'L': (0.62, -1.62, 3.42), 'R': (-0.62, -1.62, 3.42), 'pole_L': (0.9, 0.6, -0.5), 'pole_R': (-0.9, 0.6, -0.5)}


def clip_push_cart(R, name='push_cart', scale=1.0):
    """walking behind a handcart: shorter steps, leaning into the handle, both hands on it (the
    cart rolls with the root, so the hands are fixed in root space)"""
    return gait_clip_x(R, name, GAITS_X['push_cart'], frames=32, scale=scale, hands=lambda u: CART_HANDS, entry={'set': 'cart'})


def clip_idle_cart(R, name='idle_cart', frames=120):
    b = dict(hL=CART_HANDS['L'], hR=CART_HANDS['R'], pL=CART_HANDS['pole_L'], pR=CART_HANDS['pole_R'], sp=0.12, cp=0.06, hy=-0.05)
    keys = [(0.0, b), (0.5, dict(b, xyaw=0.25, nyaw=0.1, hx=0.05))]
    return keyed_clip(R, name, frames, keys, loop=True, extra=breathe(0.9, 4), entry={'set': 'cart'})


def _feet_on_pedals(R, G, th):
    """ankle targets / foot rotations with the balls of the feet on the pedals (kit.ride_clip)"""
    J = R.J
    bb = Vector(G['bb'])
    cr = G['crank']
    px = G['pedal_x']
    out = {}
    for s, sx, sign in (('L', 1, 1), ('R', -1, -1)):
        ped = bb + Vector((sx * px, sign * cr * math.cos(th), sign * cr * math.sin(th)))
        ang = math.atan2(sign * math.sin(th), sign * math.cos(th))
        pitch = -0.28 - 0.18 * math.sin(ang - 0.6)
        ball = ped + Vector((0, 0, G.get('pedal_up', 0.12)))
        Rf = foot_rot(pitch)
        ball_rest = Vector((sx * J['ball'][0], J['ball'][1], J['ball'][2]))
        ankle_rest = Vector((sx * J['ankle'][0], J['ankle'][1], J['ankle'][2]))
        out[s] = (ball + Rf.to_3x3() @ (ankle_rest - ball_rest), Rf)
    return out


def clip_ride_kainchi(R, G, name='ride_kainchi', frames=32):
    """'kainchi' (scissors): a kid on a full-size Hero cycle cannot reach the saddle, so he stands
    on the pedals beside the frame (left side) with the right leg through the triangle under the
    top tube, leaning over to the handlebar. Authored in the cycle's model frame like ride_cycle:
    one clip cycle = one crank turn (phase 0 = left crank back)."""
    act = R.begin(name)
    J = R.J
    leg = R.leg
    worst = 0.0
    for fr in range(frames + 1):
        th = 2 * math.pi * fr / frames
        P = R.pose()
        feet = _feet_on_pedals(R, G, th)
        side = math.sin(th)
        hip0 = Vector((1.05, 0.55, 3.98))
        dip = 0.0
        for s, sx in (('L', 1), ('R', -1)):
            hj = hip0 + Vector((sx * R.head['thigh_L'].x, 0, 0))
            d = (feet[s][0] - hj).length
            if d > leg * 0.975:
                dip = max(dip, d - leg * 0.975)
        dip = min(dip, 0.6)
        worst = max(worst, dip)
        # the weight goes onto the pedal that is pushing down (the body bobs and sways with it)
        t = Vector((hip0.x - 0.08 * side, hip0.y - J['hip'][1], hip0.z - dip - R.hip_z + 0.06 * abs(side)))
        R.fk(P, 'root')
        R.fk(P, 'hips', Rz(-0.32) @ Ry(-0.2 + 0.05 * side) @ Rx(0.32), t=tuple(t))
        R.fk(P, 'spine', Rx(0.3) @ Ry(-0.14) @ Rz(-0.05))
        R.fk(P, 'chest', Rx(0.22) @ Ry(-0.1) @ Rz(0.06 * side))
        R.fk(P, 'neck', Rx(-0.42) @ Rz(0.18))
        R.fk(P, 'head', Rx(-0.3) @ Rz(0.12))
        for s, sx in (('L', 1), ('R', -1)):
            R.fk(P, 'shoulder_' + s, Rx(0.08))
            R.arm_ik(P, s, Vector(G['grip_' + s]), None, pole=(sx * 0.9, 0.5, -0.1))
        for s, sx in (('L', 1), ('R', -1)):
            ankle, Rf = feet[s]
            R.leg_ik(P, s, ankle, Rf, Rf, pole=(sx * 0.25 + (0.35 if s == 'R' else 0.2), -1, 0.3))
        R.key(P, fr)
    R.end(act, 0, frames, cyclic=True)
    kit.log('clip %s: max hip dip %.2f u' % (name, worst))
    return {'loop': True, 'loco': False, 'ride': True, 'kainchi': True, 'frames': frames, 'fps': kit.FPS, 'duration': round(frames / kit.FPS, 4),
            'phase': 'crank angle / 2pi (0 = left crank back)', 'vehicle': G.get('vehicle'), 'saddleDrop': G.get('saddleDrop', 0.0), 'hipDip': round(worst, 3)}


# Seat-frame riding (scooters, motorcycle pillions): authored with the rider's root at the vehicle's
# seat anchor (seat_driver / seat_pillion, the seat top centre): the runtime parents the model to
# that anchor. Feet / hands are relative to the seat (kid units, adults scale with k).
SCOOTY_KID = {'grip_L': (1.12, -2.55, 1.55), 'grip_R': (-1.12, -2.55, 1.55), 'foot': (0.62, 1.05, -2.05), 'hip': (0.0, 0.18, 0.36)}
SCOOTY_ADULT = {'grip_L': (1.15, -2.25, 1.3), 'grip_R': (-1.15, -2.25, 1.3), 'foot': (0.62, 1.15, -1.95), 'hip': (0.0, 0.2, 0.34)}


def clip_ride_seat(R, name, kind='scooty', frames=60, kid=False):
    """seated riding in the seat frame: kind 'scooty' (hands on the grips, feet on the floorboard;
    a kid's feet barely reach: on tiptoe), 'pillion' (astride behind the driver, hands at his
    waist, feet on the pillion pegs), 'pillion_side' (side-saddle, both legs on the left, the
    right hand on the driver's shoulder - sarees)"""
    k = rig_k(R)
    J = R.J
    G = SCOOTY_KID if kid else SCOOTY_ADULT
    hip = Vector(G['hip']) * k
    base = dict(hz=(hip.z - R.hip_z) / k, hy=-hip.y / k, hp=-0.05, sp=0.18, cp=0.08, np=-0.12, xp=-0.08)
    if kind == 'scooty':
        f = G['foot']
        tip = -0.55 if kid else 0.0
        base.update(aL=(f[0] * k, f[1] * k, f[2] * k + R.ankle_z + (0.25 * k if kid else 0)), aR=(f[0] * k, f[1] * k, f[2] * k + R.ankle_z + (0.25 * k if kid else 0)),
                    ftL=tip, ftR=tip, kL=(0.3, -1, 0.3), kR=(-0.3, -1, 0.3),
                    hL=G['grip_L'], hR=G['grip_R'], pL=(0.9, 0.6, -0.3), pR=(-0.9, 0.6, -0.3), sp=0.3 if kid else 0.22)
    elif kind == 'pillion':
        base.update(aL=(0.95 * k, -0.15 * k, -1.85 * k + R.ankle_z), aR=(0.95 * k, -0.15 * k, -1.85 * k + R.ankle_z), ftL=-0.15, ftR=-0.15,
                    kL=(0.6, -1, 0.3), kR=(-0.6, -1, 0.3),
                    hL=(0.62, -1.15, (hip.z + 1.25 * k) / k), hR=(-0.62, -1.15, (hip.z + 1.25 * k) / k), pL=(1.0, 0.4, -0.4), pR=(-1.0, 0.4, -0.4), sp=0.28)
    else:   # side-saddle: hips turned to the left, both feet on the left footrest
        base.update(hyaw=1.35, syaw=-0.25, cyaw=-0.2, nyaw=-0.35, xyaw=-0.25,
                    aL=(1.75 * k, -0.35 * k, -1.85 * k + R.ankle_z), aR=(-1.75 * k, 0.2 * k, -1.85 * k + R.ankle_z), ftL=0.0, ftR=0.0,
                    kL=(1, -0.3, 0.3), kR=(1, -0.3, 0.3),
                    hR=(-0.35, -1.4, (hip.z + 1.6 * k) / k), pR=(-0.8, 0.4, -0.4), hL=(0.85, -0.55, (hip.z + 0.45 * k) / k), pL=(0.9, 0.3, -0.4))
    keys = [(0.0, base), (0.5, dict(base, hx=0.03, xyaw=base.get('xyaw', 0.0) + 0.12))]

    def bump(t, Q):
        Q['hz'] += 0.02 * math.sin(2 * math.pi * t * 4)
    return keyed_clip(R, name, frames, keys, loop=True, extra=chain(breathe(0.6, 2), bump), check_feet=False,
                      entry={'ride': True, 'frame': 'seat', 'anchor': 'seat_pillion' if kind != 'scooty' else 'seat_driver', 'geom': {kk: list(v) for kk, v in G.items()} if kind == 'scooty' else None})


def build_clip_library(A, R, rig):
    """every clip of the shared skeleton for `rig` ('kid' | 'adult') -> A.clips"""
    import vehicles
    kid = rig == 'kid'
    k = rig_k(R)
    scale = 1.0 if kid else R.leg / 3.1
    C = A.clips
    C['idle'] = kit.idle_clip(R, 'idle', frames=120)
    C['idle_look'] = clip_idle_look(R)
    for g in ('stroll', 'walk', 'run'):
        C[g] = kit.gait_clip(R, g, kit.GAITS[g], frames=32, scale=scale)
    C['sprint'] = gait_clip_x(R, 'sprint', GAITS_X['sprint'], frames=32, scale=scale)
    if not kid:
        C['stroll_f'] = gait_clip_x(R, 'stroll_f', GAITS_X['stroll_f'], frames=32, scale=scale, entry={'style': 'f', 'base': 'stroll'})
        C['walk_f'] = gait_clip_x(R, 'walk_f', GAITS_X['walk_f'], frames=32, scale=scale, entry={'style': 'f', 'base': 'walk'})
    if kid:
        C['ride_cycle'] = kit.ride_clip(R, vehicles.hero_geom(vehicles.SADDLE_DROP['chinnu_cycle']), 'ride_cycle', frames=32, lean=0.95, hip_back=0.16, hip_up=0.24, rock=0.07)
        C['ride_kainchi'] = clip_ride_kainchi(R, vehicles.hero_geom(0.0))
    else:
        C['ride_cycle'] = kit.ride_clip(R, vehicles.hero_geom(0.0), 'ride_cycle', frames=32, lean=0.8, hip_back=0.2, hip_up=0.3, rock=0.04)
    C['ride_scooty'] = clip_ride_seat(R, 'ride_scooty', 'scooty', kid=kid)
    C['ride_pillion'] = clip_ride_seat(R, 'ride_pillion', 'pillion', kid=kid)
    if not kid:
        C['ride_pillion_side'] = clip_ride_seat(R, 'ride_pillion_side', 'pillion_side', kid=False)
    C['sit'] = clip_sit(R, 'sit', BENCH_HIP, kid=kid)
    C['sit_step'] = clip_sit(R, 'sit_step', STEP_HIP, kid=kid)
    C['sit_ground'] = clip_sit_ground(R)
    C['talk'] = clip_talk(R)
    C['wave'] = clip_wave(R)
    C['clap'] = clip_clap(R)
    C['fall'] = clip_fall(R)
    C['getup'] = clip_getup(R)
    C['pick'] = clip_pick(R)
    C['kite_fly'] = clip_kite_fly(R)
    if not kid:
        C['direct'] = clip_direct(R)
        C['push_cart'] = clip_push_cart(R, scale=scale)
        C['idle_cart'] = clip_idle_cart(R)
    return C


# =========================================================================== GLB optimizer (clip libraries)
_NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
_CT = {5126: 'f', 5125: 'I', 5123: 'H', 5122: 'h', 5121: 'B', 5120: 'b'}


def _read_glb(path):
    data = open(path, 'rb').read()
    jl = struct.unpack('<I', data[12:16])[0]
    J = json.loads(data[20:20 + jl])
    off = 20 + jl
    BIN = b''
    if off + 8 <= len(data):
        bl = struct.unpack('<I', data[off:off + 4])[0]
        BIN = data[off + 8:off + 8 + bl]
    return J, BIN


def _write_glb(path, J, BIN):
    js = json.dumps(J, separators=(',', ':')).encode('utf8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    BIN = BIN + b'\0' * ((4 - len(BIN) % 4) % 4)
    total = 12 + 8 + len(js) + (8 + len(BIN) if BIN else 0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A))
        f.write(js)
        if BIN:
            f.write(struct.pack('<II', len(BIN), 0x004E4942))
            f.write(BIN)


def _acc_read(J, BIN, ai):
    a = J['accessors'][ai]
    n = _NC[a['type']]
    fmt = _CT[a['componentType']]
    size = struct.calcsize(fmt)
    bv = J['bufferViews'][a['bufferView']]
    stride = bv.get('byteStride') or n * size
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<%d%s' % (n, fmt), BIN, o + i * stride) for i in range(a['count'])]


def optimize_glb(path, resample=None, eps=2e-5):
    """Shrink an exported clip library in place: animation channels that hold the bone's rest
    value for the whole clip are dropped (three's mixer blends unanimated bones to their rest
    state), slow clips can be resampled (resample: {clip: step}: every step-th key + the last),
    identical key-time arrays are shared and unused data is compacted away. Returns (old, new)
    byte sizes. Lossless for the runtime except the resampling (linear between kept keys)."""
    old = os.path.getsize(path)
    J, BIN = _read_glb(path)
    nodes = J.get('nodes', [])
    anims = J.get('animations', [])
    if not anims:
        return old, old
    rest_of = {'translation': (0.0, 0.0, 0.0), 'rotation': (0.0, 0.0, 0.0, 1.0), 'scale': (1.0, 1.0, 1.0)}
    new_anim_data = []      # (anim index, channels) with python value lists
    dropped = 0
    for an in anims:
        step = (resample or {}).get(an.get('name'), 1)
        chans = []
        for ch in an['channels']:
            sm = an['samplers'][ch['sampler']]
            path_ = ch['target']['path']
            node = nodes[ch['target']['node']]
            rest = tuple(node.get(path_, rest_of[path_]))
            vals = _acc_read(J, BIN, sm['output'])
            times = [t[0] for t in _acc_read(J, BIN, sm['input'])]
            if path_ == 'rotation':
                same = all(abs(abs(sum(v[i] * rest[i] for i in range(4))) - 1.0) < eps for v in vals)
            else:
                same = all(max(abs(v[i] - rest[i]) for i in range(len(rest))) < eps * 10 for v in vals)
            if same:
                dropped += 1
                continue
            if step > 1 and len(times) > 4 and sm.get('interpolation', 'LINEAR') == 'LINEAR':
                idx = list(range(0, len(times), step))
                if idx[-1] != len(times) - 1:
                    idx.append(len(times) - 1)
                times = [times[i] for i in idx]
                vals = [vals[i] for i in idx]
            chans.append((ch['target'], sm.get('interpolation', 'LINEAR'), times, vals))
        new_anim_data.append((an, chans))
    # rebuild: keep non-animation buffer views verbatim, append animation data packed
    anim_acc = set()
    for an in anims:
        for sm in an['samplers']:
            anim_acc.add(sm['input'])
            anim_acc.add(sm['output'])
    acc = J['accessors']
    keep_acc = [i for i in range(len(acc)) if i not in anim_acc]
    used_bv = set()
    for i in keep_acc:
        if acc[i].get('bufferView') is not None:
            used_bv.add(acc[i]['bufferView'])
    for im in J.get('images', []):
        if im.get('bufferView') is not None:
            used_bv.add(im['bufferView'])
    parts, off = [], 0

    def push(b, align=4):
        nonlocal off
        pad = (align - off % align) % align
        if pad:
            parts.append(b'\0' * pad)
            off += pad
        o = off
        parts.append(b)
        off += len(b)
        return o
    bv_map, new_bvs = {}, []
    for i, bv in enumerate(J.get('bufferViews', [])):
        if i not in used_bv:
            continue
        src = BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        nb = dict(bv)
        nb['byteOffset'] = push(src)
        bv_map[i] = len(new_bvs)
        new_bvs.append(nb)
    acc_map, new_acc = {}, []
    for i in keep_acc:
        a = dict(acc[i])
        if a.get('bufferView') is not None:
            a['bufferView'] = bv_map[a['bufferView']]
        acc_map[i] = len(new_acc)
        new_acc.append(a)
    for im in J.get('images', []):
        if im.get('bufferView') is not None:
            im['bufferView'] = bv_map[im['bufferView']]
    # animation data: one buffer view for key times (deduplicated), one for values
    tblob, vblob = [], []
    t_off = v_off = 0
    t_cache = {}
    t_acc_specs, v_acc_specs = [], []
    for an, chans in new_anim_data:
        an['channels'], an['samplers'] = [], []
        for target, interp, times, vals in chans:
            tb = struct.pack('<%df' % len(times), *times)
            if tb not in t_cache:
                t_cache[tb] = len(t_acc_specs)
                t_acc_specs.append((t_off, len(times), min(times), max(times)))
                tblob.append(tb)
                t_off += len(tb)
            n = len(vals[0])
            flat = [x for v in vals for x in v]
            vb = struct.pack('<%df' % len(flat), *flat)
            v_acc_specs.append((v_off, len(vals), n))
            vblob.append(vb)
            v_off += len(vb)
            an['samplers'].append({'input': ('T', t_cache[tb]), 'output': ('V', len(v_acc_specs) - 1), 'interpolation': interp})
            an['channels'].append({'sampler': len(an['samplers']) - 1, 'target': target})
    TYPES = {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}
    if tblob:
        tbv = len(new_bvs)
        new_bvs.append({'buffer': 0, 'byteOffset': push(b''.join(tblob)), 'byteLength': t_off})
        vbv = len(new_bvs)
        new_bvs.append({'buffer': 0, 'byteOffset': push(b''.join(vblob)), 'byteLength': v_off})
        t_idx = []
        for o, cnt, mn, mx in t_acc_specs:
            t_idx.append(len(new_acc))
            new_acc.append({'bufferView': tbv, 'byteOffset': o, 'componentType': 5126, 'count': cnt, 'type': 'SCALAR', 'min': [mn], 'max': [mx]})
        v_idx = []
        for o, cnt, n in v_acc_specs:
            v_idx.append(len(new_acc))
            new_acc.append({'bufferView': vbv, 'byteOffset': o, 'componentType': 5126, 'count': cnt, 'type': TYPES[n]})
        for an, _ in new_anim_data:
            for sm in an['samplers']:
                sm['input'] = t_idx[sm['input'][1]]
                sm['output'] = v_idx[sm['output'][1]]
    J['animations'] = [an for an, ch in new_anim_data if ch]
    # remap the other accessor references
    for m in J.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
            if 'targets' in p:
                p['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in p['targets']]
    for s in J.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    J['accessors'] = new_acc
    J['bufferViews'] = new_bvs
    nbin = b''.join(parts)
    J['buffers'] = [{'byteLength': len(nbin) + ((4 - len(nbin) % 4) % 4)}]
    _write_glb(path, J, nbin)
    new = os.path.getsize(path)
    kit.log('optimize %s: %d constant channels dropped, %.1f -> %.1f KB' % (os.path.basename(path), dropped, old / 1024, new / 1024))
    return old, new


_kit_export_glb = kit.export_glb


def _export_glb_hook(A, path=None):
    """kit.export_glb + optimize_glb for assets that opt in (A.nos_optimize = {resample: ...});
    every other asset exports exactly as before"""
    p = _kit_export_glb(A, path)
    opt = getattr(A, 'nos_optimize', None)
    if opt is not None:
        optimize_glb(p, **opt)
    return p


if not getattr(kit.export_glb, 'nos_hook', False):
    _export_glb_hook.nos_hook = True
    kit.export_glb = _export_glb_hook


# =========================================================================== previews of clips on a built body
def clip_sheet(A, body_glb, frames, out_name, size=160, samples=10, view=None, cols=8):
    """render (clip, frame) poses of an already exported character GLB with the actions of this
    build (kit.preview_render looks clips up in bpy.data.actions) -> assets3d/previews/<out>.png"""
    if not os.path.exists(body_glb):
        kit.log('clip_sheet: %s missing (build the body first)' % body_glb)
        return None
    outs = []
    for j, (clip, fr) in enumerate(frames):
        p = os.path.join(kit.TMP_DIR, '%s_%s_%02d.png' % (A.id, out_name, j))
        kit.preview_render(A, body_glb, size=size, samples=samples, view=view, out=p, frame=fr, clip=clip)
        outs.append(p)
    out = os.path.join(kit.PREVIEW_DIR, '%s_%s.png' % (A.id, out_name))
    kit.contact_sheet(outs, out, cols=min(cols, len(outs)), cell=size)
    kit.log('clip sheet', out)
    return out


def ride_sheet(A, body_glb, vehicle_id, clip, drop=0.0, frames=(0, 8, 16, 24), size=224, samples=10, out_name='ride'):
    """kit.preview_ride for any riding clip name (ride_cycle, ride_kainchi)"""
    act = bpy.data.actions.get(clip)
    if not act:
        return None
    keep = bpy.data.actions.get('ride_cycle')
    if clip != 'ride_cycle':
        if keep:
            keep.name = '_keep_ride_cycle'
        act.name = 'ride_cycle'
    import types
    try:
        tmp_id = A.id if out_name == 'ride' else A.id + '__' + out_name
        p = kit.preview_ride(types.SimpleNamespace(id=tmp_id), body_glb, vehicle_id, drop, frames=frames, size=size, samples=samples)
        if p and out_name != 'ride':
            q = os.path.join(kit.PREVIEW_DIR, '%s_%s.png' % (A.id, out_name))
            os.replace(p, q)
            p = q
    finally:
        if clip != 'ride_cycle':
            act.name = clip
            if keep:
                keep.name = 'ride_cycle'
    return p


# =========================================================================== looks -> tints (python mirror of models3d_people.js)
DEFAULT_FIELDS = {'skin': ['skin'], 'hair': ['hair'], 'shirt': ['shirt', 'kameez', 'saree'], 'stripes': ['stripes', 'shoulders'],
                  'pants': ['pants', 'lungi'], 'shoes': ['shoes', 'chappal'], 'accent': ['accent']}


def _is_col(v):
    return isinstance(v, str) and v.startswith('#') and len(v) in (4, 7)


def shade_hex(h, f):
    r, g, b = kit.hex_rgb(h)
    return '#%02x%02x%02x' % (int(min(1, r * f) * 255), int(min(1, g * f) * 255), int(min(1, b * f) * 255))


def pick_field(specs, look):
    for s in specs or []:
        if s.startswith('#'):
            return s
        if s.startswith('@'):
            f, _, k = s[1:].partition(':')
            v = look.get(f)
            if _is_col(v):
                return shade_hex(v, float(k or 1))
            continue
        if s in look:
            v = look[s]
            if _is_col(v):
                return v
    return None


def resolve_look(spec, look, default_look, ctx=None):
    """-> ({region: '#hex' or None}, hidden set) exactly like the runtime"""
    names, fields, show = spec['names'], spec.get('fields') or {}, spec.get('show') or {}
    cols, hidden = {}, set()
    c = dict(look)
    c.update(ctx or {})
    for i, n in enumerate(names):
        if i == 0:
            continue
        fl = fields.get(n) or DEFAULT_FIELDS.get(n)
        want = pick_field(fl, look) or pick_field(fl, default_look or {})
        cols[n] = want
        if n in show and not rule_eval(show[n], c):
            hidden.add(n)
    return cols, hidden


def render_variants(A, glb, variants, out, view=None, size=256, samples=14, clip=None, frames=None, cols=None, spec=None, default_look=None):
    """Import the exported GLB once and render it dressed as each variant (region tints and slot
    visibility like the runtime), optionally posed at (clip, frame) pairs. variants: [(name,
    look, ctx)]; frames: [(clip, frame)] renders the first variant at each frame instead.
    Returns the contact sheet path (and writes it to `out`)."""
    man = json.load(open(os.path.join(kit.ASSETS_DIR, A.id + '.json')))
    spec = spec or man['tint']
    default_look = default_look or man['meta'].get('look', {})
    names, base = spec['names'], spec['regions']
    sc = bpy.data.scenes.new('_variants')
    win = bpy.context.window
    prev_scene = bpy.context.scene
    if win:
        win.scene = sc
    sc.world = bpy.data.worlds.new('_vw')
    kit._preview_world(sc, 0.9)
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    try:
        sc.cycles.use_fast_gi = True
        sc.cycles.fast_gi_method = 'REPLACE'
        sc.world.light_settings.distance = 6.0
    except Exception:
        pass
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 4
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.filter_size = 1.6
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    sc.render.fps = kit.FPS
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in objs if o.type == 'ARMATURE'), None)
    # material: per-region multiply + hide (transparent)
    ctl = {}
    for o in objs:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if not m or not m.use_nodes or m.name in ctl:
                continue
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            outn = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
            if bsdf is None or not bsdf.inputs['Base Color'].links:
                continue
            at = nt.nodes.new('ShaderNodeAttribute')
            at.attribute_name = '_REGION'
            col = bsdf.inputs['Base Color'].links[0].from_socket
            mixes, hides = {}, {}
            hsum = None
            for i, n in enumerate(names):
                if i == 0:
                    continue
                cmp_ = nt.nodes.new('ShaderNodeMath')
                cmp_.operation = 'COMPARE'
                nt.links.new(at.outputs['Fac'], cmp_.inputs[0])
                cmp_.inputs[1].default_value = float(i)
                cmp_.inputs[2].default_value = 0.4
                mx = nt.nodes.new('ShaderNodeMix')
                mx.data_type = 'RGBA'
                mx.blend_type = 'MULTIPLY'
                mx.clamp_result = False
                nt.links.new(cmp_.outputs[0], mx.inputs[0])
                nt.links.new(col, kit._sock(mx, 'A', 'RGBA'))
                kit._sock(mx, 'B', 'RGBA').default_value = (1, 1, 1, 1)
                col = kit._sock(mx, 'Result', 'RGBA', out=True)
                mixes[n] = mx
                hv = nt.nodes.new('ShaderNodeMath')
                hv.operation = 'MULTIPLY'
                nt.links.new(cmp_.outputs[0], hv.inputs[0])
                hv.inputs[1].default_value = 0.0
                hides[n] = hv
                if hsum is None:
                    hsum = hv.outputs[0]
                else:
                    ad = nt.nodes.new('ShaderNodeMath')
                    ad.operation = 'ADD'
                    nt.links.new(hsum, ad.inputs[0])
                    nt.links.new(hv.outputs[0], ad.inputs[1])
                    hsum = ad.outputs[0]
            nt.links.new(col, bsdf.inputs['Base Color'])
            if outn is not None and hsum is not None:
                tr = nt.nodes.new('ShaderNodeBsdfTransparent')
                ms = nt.nodes.new('ShaderNodeMixShader')
                nt.links.new(hsum, ms.inputs[0])
                nt.links.new(bsdf.outputs[0], ms.inputs[1])
                nt.links.new(tr.outputs[0], ms.inputs[2])
                nt.links.new(ms.outputs[0], outn.inputs['Surface'])
            ctl[m.name] = (mixes, hides)

    def dress(look, ctx):
        cols_, hidden = resolve_look(spec, look, default_look, ctx)
        for mixes, hides in ctl.values():
            for n, mx in mixes.items():
                want, b = cols_.get(n), base.get(n)
                if want and b:
                    w, bb = kit.lin(want), kit.lin(b)
                    kit._sock(mx, 'B', 'RGBA').default_value = tuple(min(24.0, w[c] / max(bb[c], 0.004)) for c in range(3)) + (1.0,)
                else:
                    kit._sock(mx, 'B', 'RGBA').default_value = (1, 1, 1, 1)
                hides[n].inputs[1].default_value = 1.0 if n in hidden else 0.0

    def pose(clip_, fr):
        if arm is None:
            return
        act = bpy.data.actions.get(clip_) if clip_ else None
        if act:
            arm.animation_data_create()
            arm.animation_data.action = act
            try:
                arm.animation_data.action_slot = act.slots[0]
            except Exception:
                pass
            sc.frame_set(int(fr or 0))
        else:
            if arm.animation_data:
                arm.animation_data.action = None
            for pb in arm.pose.bones:
                pb.matrix_basis = Matrix.Identity(4)
            sc.frame_set(0)
        bpy.context.view_layer.update()
    # ground, sun, camera
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    gp = bpy.data.meshes.new('_vg')
    bm.to_mesh(gp)
    bm.free()
    g = bpy.data.objects.new('_vg', gp)
    sc.collection.objects.link(g)
    gm = bpy.data.materials.new('_vgm')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = kit.lin('#b9ad98')
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    gp.materials.append(gm)
    ld = bpy.data.lights.new('_vs', 'SUN')
    ld.energy = 3.2
    ld.angle = math.radians(3)
    ld.color = (1.0, 0.96, 0.9)
    lo_ = bpy.data.objects.new('_vs', ld)
    sc.collection.objects.link(lo_)
    lo_.rotation_euler = Vector((0.9, 0.35, 0.5)).normalized().to_track_quat('Z', 'Y').to_euler()
    v = view or {}
    hgt = man['size'][2] if man.get('size') and man['size'][2] > 0 else 8.0
    az, el = math.radians(v.get('az', -32.0)), math.radians(v.get('el', 10.0))
    fov = math.radians(v.get('fov', 30.0))
    tgt = Vector(v.get('target', (0, 0, hgt * 0.5)))
    dist = v.get('dist') or (hgt * 0.62 / math.tan(fov / 2))
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    cd = bpy.data.cameras.new('_vc')
    cd.angle = fov
    cd.clip_start = 0.05
    cam = bpy.data.objects.new('_vc', cd)
    sc.collection.objects.link(cam)
    cam.location = tgt + d * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    shots = []
    if frames:
        nm, lk, cx = variants[0]
        dress(lk, cx)
        for j, (c_, fr) in enumerate(frames):
            shots.append((('%s_%02d' % (c_, j)), c_, fr))
    else:
        shots = [(nm, clip, frames) for nm, _, _ in variants]
    outs = []
    for j, (nm, c_, fr) in enumerate(shots):
        if not frames:
            dress(variants[j][1], variants[j][2])
        pose(c_, fr)
        p = os.path.join(kit.TMP_DIR, '%s_v_%02d.png' % (A.id, j))
        sc.render.filepath = p
        sc.render.image_settings.file_format = 'PNG'
        t0 = time.time()
        bpy.ops.render.render(write_still=True, scene=sc.name)
        kit.log('variant render %s %s (%.1fs)' % (A.id, nm, time.time() - t0))
        outs.append(p)
    if win:
        win.scene = prev_scene
    for o in list(sc.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    kit.contact_sheet(outs, out, cols=cols or len(outs), cell=size)
    kit.log('variants sheet', out)
    return out


def previews_on():
    import sys
    return not ('--no-preview' in sys.argv or '--quick' in sys.argv)


def post_previews(A, variants, face=None, gait=True, ride=None, kainchi=None):
    """after kit.run_asset (atexit, same process): the dressed previews that replace kit's undressed
    ones: <id>.png (every variant), <id>_face.png, <id>_gait.png (walk + run strip, side view, the
    default look), <id>_ride.png / <id>_kainchi.png (riding the Hero cycle)"""
    glb = os.path.join(kit.ASSETS_DIR, A.id + '.glb')

    def run():
        if not os.path.exists(glb) or not previews_on():
            return
        try:
            render_variants(A, glb, variants, os.path.join(kit.PREVIEW_DIR, A.id + '.png'), size=256, samples=14)
            if face:
                render_variants(A, glb, variants[:1], os.path.join(kit.PREVIEW_DIR, A.id + '_face.png'), view=face, size=256, samples=18)
            if gait:
                fr = [('walk', f) for f in range(0, 32, 4)] + [('run', f) for f in range(0, 32, 4)]
                render_variants(A, glb, variants[:1], os.path.join(kit.PREVIEW_DIR, A.id + '_gait.png'), size=160, samples=8, frames=fr, cols=8,
                                view={'az': -90, 'el': 4, 'fov': 30})
            if ride:
                ride_sheet(A, glb, ride.get('vehicle', 'hero_cycle'), 'ride_cycle', ride.get('drop', 0.0))
            if kainchi:
                ride_sheet(A, glb, 'hero_cycle', 'ride_kainchi', 0.0, out_name='kainchi')
        except Exception as e:
            import traceback
            traceback.print_exc()
            kit.log('post_previews failed: %s' % e)
    atexit.register(run)
