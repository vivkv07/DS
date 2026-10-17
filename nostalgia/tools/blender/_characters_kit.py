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
import bpy
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import loft, material

BASE = list(kit.REGIONS)   # none skin hair shirt stripes pants shoes accent
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
    return bool(v)


# =========================================================================== regions + slots
class Look:
    """Tint / accessory spec of one asset (-> A.tint). slot(name, show, tint) reserves a region
    index >= 8 for an accessory; field(region, specs) says which look fields colour a region."""

    def __init__(self):
        self.names = list(BASE)
        self.fields = {}
        self.show = {}
        self.slots = {}

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
        return {'attribute': '_REGION', 'names': self.names, 'regions': region_colours(ob, self.names),
                'fields': self.fields, 'show': self.show}


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
        ob = loft('torso', rings2, seg=14, side=(1, 0, 0), cap_start=bool(start), cap_end=False)
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
            self.add(loft('arm_' + S, rings, seg=10, side=(0, 1, 0), cap_start=True, cap_end=True))
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
        self.add(loft('hand_' + S, H, seg=8, side=(0, -1, 0)))
        th0 = mir(lerp(wr, tip, 0.22), sx)
        th = [dict(c=th0, r=0.065 * hk, w={hd: 1}, mat=sk),
              dict(c=(th0[0] + 0.06 * sx * hk, th0[1] - 0.15 * hk, th0[2] - 0.08 * hk), r=0.06 * hk, w={hd: 1}, mat=sk),
              dict(c=(th0[0] + 0.09 * sx * hk, th0[1] - 0.24 * hk, th0[2] - 0.17 * hk), r=0.04 * hk, w={hd: 1}, mat=sk)]
        self.add(loft('thumb_' + S, th, seg=6, side=(1, 0, 0)))

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
            self.add(loft('leg_' + S, rings, seg=10, side=(1, 0, 0), cap_start=True, cap_end=True))
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
            o = loft('shoe_' + S, rings, seg=10, side=(1, 0, 0))
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
        self.add(loft('foot_' + S, rings, seg=8, side=(1, 0, 0)))
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
                self.add(kit.tube('strap', pts, 0.036 * k, seg=6, mat=st), self._sole_w(S))
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
        J = self.J
        x0 = J['ankle'][0] * sx
        if sx < 0:
            outline = [(-x, y) for (x, y) in reversed(outline)]
        poly = [(x0 + x, y) for (x, y) in outline]
        objs = []
        if m_bed is not None:
            objs.append(kit.extrude_polygon('sole', poly, z0, z1, m_sole))
            objs.append(kit.extrude_polygon('bed', poly, z1, z1 + 0.03 * self.k, m_bed))
        else:
            objs.append(kit.extrude_polygon('sole', poly, z0, z1, m_sole))
        for o in objs:
            kit.bevel_mod(o, 0.012 * self.k, 1, angle=30)
            kit.apply_modifiers(o)
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
        ob = loft('skirt_' + kind, rings, seg=16, side=(1, 0, 0), cap_start=False, cap_end=False)
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
    'kid': [(-0.02, -0.12, 0.19, 0.15), (0.10, -0.09, 0.37, 0.36), (0.30, -0.02, 0.51, 0.52), (0.52, 0.02, 0.565, 0.58),
            (0.74, 0.04, 0.58, 0.60), (0.95, 0.05, 0.55, 0.585), (1.11, 0.05, 0.455, 0.49), (1.22, 0.05, 0.26, 0.28), (1.255, 0.05, 0.05, 0.06)],
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
        return self.add(loft('head', rings, seg=16, side=(1, 0, 0), cap_start=True, cap_end=True))

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
            e = kit.lathe('eye', [(0.0, -ed), (ew * 0.75, -ed * 0.72), (ew, 0.0), (ew * 0.75, ed * 0.72), (0.0, ed)], seg=10, mat=M['eye_dark'])
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
            self.add(loft('ear', [dict(c=(rx * 0.86 * sx, ey, ez - 0.22), r=(0.05, 0.08), w={'head': 1}, mat=M['skin']),
                                  dict(c=((rx + 0.07) * sx, ey + 0.02, ez - 0.12), r=(0.045, 0.13), w={'head': 1}, mat=M['skin']),
                                  dict(c=((rx + 0.06) * sx, ey + 0.05, ez + 0.02), r=(0.035, 0.09), w={'head': 1}, mat=M['skin'])],
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
        hc = loft(name, rings, seg=16, side=(1, 0, 0), cap_start=False, cap_end=True)
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
        return self.add(loft(name, [dict(c=tuple(base - d * 0.04), r=r0, w={'head': 1}, mat=m), dict(c=tuple(mid), r=r0 * 0.62, w={'head': 1}, mat=m),
                                    dict(c=tuple(end), r=0.015, w={'head': 1}, mat=m)], seg=seg, side=(0, 0, 1)))

    def hair(self, style, m):
        hz, cy = self.hz, self.cy
        if style == 'spiky':
            # Chinnu: a chunky crop of upswept locks round the crown, a three-spike fringe, the cowlick
            self.cap(m, 0.03, line=lambda f, s: 0.62 + 0.36 * f ** 1.6 - 0.1 * s * (1 - f))
            rnd = random.Random(11)
            for ring_z, n, kout, kback, kup, L0, r0, skip in ((1.17, 6, 0.3, 0.9, 0.55, 0.22, 0.15, False), (1.0, 7, 0.8, 0.5, 0.25, 0.24, 0.14, True), (0.82, 6, 0.7, 0.45, -0.45, 0.2, 0.13, True)):
                for i in range(n):
                    a = 2 * math.pi * (i + 0.3 + rnd.random() * 0.35) / n + 0.4
                    nx, ny = math.cos(a), math.sin(a)
                    if skip and ny < -0.45:
                        continue
                    skf = 1.22 - ring_z * 0.36
                    base = (nx * 0.5 * skf, cy + 0.06 + ny * 0.55 * skf, hz + ring_z + 0.03)
                    self.tuft(m, base, (nx * kout, ny * kout + kback, kup), L0 * (0.85 + rnd.random() * 0.3), r0)
            for i, x in enumerate((-0.3, -0.1, 0.1, 0.3)):
                base = (x, cy - 0.41, hz + 1.03 - abs(x) * 0.15)
                self.tuft(m, base, (x * 0.5, -0.6, -0.5), 0.27, 0.12, name='fringe')
            self.tuft(m, (0.06, cy + 0.28, hz + 1.22), (0.15, 0.4, 0.9), 0.36, 0.09, name='cowlick', bend=(0, -0.25, 0))
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
                    p['mat'] = m
                self.add(loft('quiff', pts, seg=8, side=(0, 0, 1)))
        elif style == 'puff':
            self.cap(m, 0.045, line=lambda f, s: 0.70 + 0.30 * f ** 1.4 - 0.12 * s * (1 - f), crown=1.3)
            self.puff(m)
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
            self.add(kit.tube('parting', [(0, cy - 0.42, hz + 1.12), (0, cy - 0.15, hz + 1.30), (0, cy + 0.15, hz + 1.31)], 0.012, seg=4, mat=self.M['skin']))
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
    q = max(0.0, 1 - (x / max(rx, 1e-3)) ** 2.25)
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
        d = kit.lathe('dome', prof, seg=16, mat=m, close_bottom=False)
        d.location = (0, cy + 0.05, hz + 0.86)
        kit.apply_transform(d)
        objs.append(d)
        bm = brim or m
        b = kit.lathe('brim', [(0.0, 0.0), (0.52, 0.0), (0.52, 0.04), (0.0, 0.04)], seg=14, mat=bm)
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
        d = kit.lathe('skullcap', prof, seg=16, mat=m, close_bottom=False)
        d.scale = (1.0, 1.03, 1.0)
        d.location = (0, cy + 0.07, hz + 0.98)
        kit.apply_transform(d)
        return H.add(d)
    if kind == 'irani':
        prof = [(0.58, 0.0), (0.6, 0.06), (0.6, 0.3), (0.56, 0.36), (0.0, 0.37)]
        d = kit.lathe('iranicap', prof, seg=16, mat=m, close_bottom=False)
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
        band = kit.lathe('band', [(0.6, 0.0), (0.61, 0.14), (0.62, 0.22)], seg=16, mat=m, close_bottom=False, close_top=False)
        top = kit.lathe('crown', [(0.62, 0.22), (0.72, 0.36), (0.74, 0.42), (0.6, 0.47), (0.0, 0.5)], seg=16, mat=m, close_bottom=False)
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
    ob = loft('hood', rings, seg=16, side=(1, 0, 0), cap_start=False, cap_end=True)
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
    ob = loft('headcover', rings, seg=16, side=(1, 0, 0), cap_start=False, cap_end=True)
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
    ob = loft('burqahood', rings, seg=16, side=(1, 0, 0), cap_start=False, cap_end=True)
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
def camera_strap(B, m_body, m_lens, m_strap):
    """Nanna's black film camera on its strap round the neck, resting on the tummy"""
    rig, k = B.rig, B.k
    zc = TORSO[rig][5][0][2] + 0.25 * k
    front = body_point(rig, 0.05 * k, zc, True, 0.12 * k, B.s.get('belly', 0.0))
    body = kit.box('cam', (0.62 * k, 0.26 * k, 0.36 * k), front + Vector((0, -0.08 * k, 0)), m_body, bevel=0.05 * k, segments=2)
    kit.apply_modifiers(body)
    lens = kit.cylinder('cam_lens', 0.13 * k, 0.2 * k, (0, 0, 0), seg=12, mat=m_lens, axis='Y', base=False)
    lens.location = front + Vector((0.08 * k, -0.28 * k, -0.02 * k))
    kit.apply_transform(lens)
    ring = kit.cylinder('cam_ring', 0.15 * k, 0.05 * k, (0, 0, 0), seg=12, mat=m_body, axis='Y', base=False)
    ring.location = front + Vector((0.08 * k, -0.37 * k, -0.02 * k))
    kit.apply_transform(ring)
    nz = TORSO[rig][10][0][2]
    pts = [front + Vector((0.28 * k, -0.02, 0.12 * k)), body_point(rig, 0.4 * k, (zc + nz) / 2, True, 0.03, B.s.get('belly', 0.0)),
           Vector((0.36 * k, 0.0, nz - 0.02)), Vector((0.0, 0.3 * k, nz + 0.02)), Vector((-0.36 * k, 0.0, nz - 0.02)),
           body_point(rig, -0.4 * k, (zc + nz) / 2, True, 0.03, B.s.get('belly', 0.0)), front + Vector((-0.28 * k, -0.02, 0.12 * k))]
    strap = kit.tube('cam_strap', pts, 0.03 * k, seg=5, mat=m_strap, cap=False)
    o = kit.join([body, lens, ring, strap], 'camera')
    return B.add(o, lambda co, rig=rig: torso_w(rig, co))


def walkman(B, M):
    """Chinnu's yellow walkman on a shoelace + 90s foam headphones round the neck"""
    rig, k = B.rig, B.k
    objs = []
    wm = kit.box('walkman', (0.40, 0.12, 0.52), (0.08, -0.47, 4.42), M['walkman'], bevel=0.035, segments=2)
    kit.apply_modifiers(wm)
    objs.append(wm)
    objs.append(kit.box('wm_window', (0.26, 0.02, 0.16), (0.08, -0.535, 4.5), M['black']))
    objs.append(kit.box('wm_buttons', (0.3, 0.06, 0.04), (0.08, -0.47, 4.7), M['black']))
    objs.append(kit.tube('lace', [(0.22, 0.02, 5.48), (0.24, -0.25, 5.2), (0.2, -0.44, 4.86), (0.12, -0.47, 4.69), (0.04, -0.47, 4.69), (-0.06, -0.44, 4.9),
                                   (-0.17, -0.28, 5.2), (-0.21, 0.02, 5.48), (0.0, 0.2, 5.52), (0.22, 0.02, 5.48)], 0.022, seg=5, mat=M['lace'], cap=False))
    objs.append(kit.tube('hp_band', [(0.34, -0.12, 5.42), (0.33, 0.12, 5.52), (0.0, 0.31, 5.58), (-0.33, 0.12, 5.52), (-0.34, -0.12, 5.42)], 0.03, seg=5, mat=M['steel']))
    for sx in (1, -1):
        pad = kit.cylinder('hp_pad', 0.13, 0.08, (0, 0, 0), seg=12, mat=M['foam'], base=False)
        pad.rotation_euler = (math.radians(70), 0, math.radians(-25 * sx))
        pad.location = (0.34 * sx, -0.17, 5.36)
        kit.apply_transform(pad)
        objs.append(pad)
        cup = kit.cylinder('hp_cup', 0.09, 0.05, (0, 0, 0), seg=10, mat=M['black'], base=False)
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
