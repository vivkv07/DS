"""NOSTALGIA — tools/blender/props_trees.py — the city's trees (props artist, ARCHITECTURE §21,
design/feedback_3d.md round 3 item 6, design/atmosphere.md "Wind").

Every tree: LOD0 / LOD1 / LOD2 meshes + an impostor quad (props_kit.finish_tree), one 256 atlas,
and the baked `_WIND` vertex attribute:
    R bend    0 at the trunk base -> ~0.2-0.3 at the trunk top -> 1 at frond / branch tips
    G phase   one random value per frond / leaf clump (coherent motion)
    B flutter 0 wood, 1 leaves & flowers (palm fronds ramp 0.3 at the rachis base -> 1 at the tip)
Ids (family 'prop', meta kind = world tree kind): tree_coconut, tree_palm, tree_neem, tree_banyan,
tree_gulmohar, tree_gulmohar_green, tree_ashoka, tree_mango, tree_tamarind.
"""
import math
import random

import bpy
import bmesh
from mathutils import Vector

import kit
import props_kit as P

V = Vector


# =========================================================================== material helpers
def _alb_src(m):
    nt = m.node_tree
    alb = nt.nodes['NOS_ALBEDO']
    lk = alb.inputs[0].links[0]
    src = lk.from_socket
    nt.links.remove(lk)
    return nt, alb, src


def add_patches(m, col, scale, lo=0.55, hi=0.62, amount=1.0, seed=0.0, detail=3.0):
    """Mix a second colour into a material's albedo through a noise threshold (flowers, dry
    leaves, lichen). Only once per material (materials are cached per name)."""
    if m.get('_patched_' + col):
        return m
    m['_patched_' + col] = True
    nt, alb, src = _alb_src(m)
    B = kit.NodeBuilder(m)
    coord = nt.nodes['NOS_COORD'].outputs[0]
    w = nt.nodes['NOS_W'].outputs[0]
    n = B.noise(coord, B.math('ADD', w, seed), scale, detail=detail)
    f = B.math('MULTIPLY', B.ramp(n, lo, hi), amount)
    B.link(B.mix(f, src, B.rgb(kit.lin(col))), alb.inputs[0])
    return m


def add_rings(m, period, col, amount=0.6, sharp=(0.55, 0.9), wobble=0.25):
    """Horizontal growth rings / leaf scars (palm trunks): sin(z) bands, a little noisy."""
    if m.get('_rings'):
        return m
    m['_rings'] = True
    nt, alb, src = _alb_src(m)
    B = kit.NodeBuilder(m)
    coord = nt.nodes['NOS_COORD'].outputs[0]
    w = nt.nodes['NOS_W'].outputs[0]
    sep = B.node('ShaderNodeSeparateXYZ')
    B.link(coord, sep.inputs[0])
    n = B.noise(coord, w, 0.9, detail=2.0)
    z = B.math('ADD', sep.outputs[2], B.math('MULTIPLY', n, wobble * period))
    s = B.math('SINE', B.math('MULTIPLY', z, 2 * math.pi / period))
    f = B.math('MULTIPLY', B.ramp(s, sharp[0], sharp[1]), amount)
    B.link(B.mix(f, src, B.rgb(kit.lin(col))), alb.inputs[0])
    return m


def leafmat(name, base, specks=0.55, scale=0.2, var=0.2, grain=0.18, dirt=None, rough=0.6, **kw):
    """Foliage material: leafy light/dark speckle at roughly leaf-cluster size (survives 256 px)."""
    return P.M('leaf', name=name, base=base, specks=specks, scale=scale, var=var, grain=grain,
               dirt=dirt or kit.shade(base, 0.45), rough=rough, **kw)


# =========================================================================== geometry helpers
def lump(name, r, loc=(0, 0, 0), seg=6, rings=4, noise=0.2, seed=0, mat=None, scale=(1, 1, 1), flat_bottom=0.0, jitter=0.12):
    """A low-poly lumpy leaf clump: a jittered UV sphere (2*seg*(rings-1) tris) — cheaper steps
    between the 20-tri icosahedron and the 80-tri ico-sphere."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    # UV seam along one meridian (+ the pole edges) -> one island
    mer = [v for v in bm.verts if abs(v.co.x) + abs(v.co.y) > 1e-4]
    a0 = math.atan2(mer[0].co.y, mer[0].co.x)

    def on_mer(v):
        if abs(v.co.x) + abs(v.co.y) <= 1e-4:
            return True
        da = (math.atan2(v.co.y, v.co.x) - a0 + math.pi) % (2 * math.pi) - math.pi
        return abs(da) < 1e-3
    for e in bm.edges:
        if on_mer(e.verts[0]) and on_mer(e.verts[1]):
            e.seam = True
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(6)]
    rot = rnd.uniform(0, 6.28)
    for v in bm.verts:
        p = v.co.normalized()
        k = (math.sin(p.x * 3.1 + ph[0]) * math.sin(p.y * 2.7 + ph[1]) * math.sin(p.z * 3.3 + ph[2])
             + 0.6 * rnd.uniform(-1, 1))
        rr = 1.0 + noise * k
        q = V((p.x * math.cos(rot) - p.y * math.sin(rot), p.x * math.sin(rot) + p.y * math.cos(rot), p.z))
        q = V((q.x * scale[0], q.y * scale[1], q.z * scale[2])) * rr * r
        q += V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * jitter * r
        if flat_bottom and q.z < 0:
            q.z *= (1.0 - flat_bottom)
        v.co = q + V(loc)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.obj_from_bm(bm, name, mat)
    ob['uvw'] = 'unwrap'
    return ob


def bez(p0, p1, p2, n):
    """Quadratic Bezier polyline (n points)."""
    p0, p1, p2 = V(p0), V(p1), V(p2)
    return [p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t for t in (i / (n - 1) for i in range(n))]


def flute(ob, axis_pts, lobes=5, amp=0.25, zmax=8.0, flare=0.6, seed=0):
    """Buttressed / fluted trunk: radial lobes + base flare, fading out above zmax."""
    rnd = random.Random(seed)
    ph = rnd.uniform(0, 6.28)
    pts = [V(p) for p in axis_pts]
    for v in ob.data.vertices:
        z = v.co.z
        if z >= zmax:
            continue
        # axis point at this height
        c = pts[0]
        for a, b in zip(pts, pts[1:]):
            if a.z <= z <= b.z:
                t = (z - a.z) / max(1e-6, b.z - a.z)
                c = a.lerp(b, t)
                break
        d = V((v.co.x - c.x, v.co.y - c.y, 0))
        if d.length < 1e-6:
            continue
        th = math.atan2(d.y, d.x)
        f = (1 - z / zmax) ** 2
        k = 1 + f * (amp * math.cos(lobes * th + ph) + amp * 0.5 * math.cos((lobes + 2) * th + 2 * ph) + flare)
        nd = d * k
        v.co.x = c.x + nd.x
        v.co.y = c.y + nd.y
    return ob


def bmesh_merge(ob, dist=1e-4):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data)
    bm.free()


def verts(ob):
    return len(ob.data.vertices)


def taper(name, pts, radii, seg=6, mat=None, cap_end=True, cap_start=False, squash=1.0):
    """props_kit.taper + one longitudinal UV seam (one island per tube after unwrap)."""
    ob = P.taper(name, pts, radii, seg=seg, mat=mat, cap_end=cap_end, cap_start=cap_start, squash=squash)
    n = len(pts)
    me = ob.data
    if len(me.vertices) == n * seg:
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        for e in bm.edges:
            a, b = sorted(v.index for v in e.verts)
            if a % seg == 0 and b == a + seg:
                e.seam = True
        bm.to_mesh(me)
        bm.free()
        ob['uvw'] = 'unwrap'
    return ob


def fan(name, base, direction, length, width, n=5, spread=1.4, droop=0.3, mat=None, seed=0, notch=0.35):
    """A star-shaped leaf spray: n pointed blades around one shared base vertex, notches between
    them (one connected mesh: 2n+1 verts, 2n tris)."""
    rnd = random.Random(seed)
    d = V(direction).normalized()
    a, b = P._frame_for(d)
    bm = bmesh.new()
    p0 = V(base)
    c = bm.verts.new(p0)
    side = d.cross(V((0, 0, 1)))
    side = side.normalized() if side.length > 1e-6 else a
    ring = []
    for i in range(2 * n + 1):
        t = (i / (2 * n) - 0.5) * spread
        dd = (d * math.cos(t) + side * math.sin(t)).normalized()
        dd = (dd - V((0, 0, droop * rnd.uniform(0.6, 1.2) * (1 if i % 2 else 0.6)))).normalized()
        dd = (dd + b * rnd.uniform(-0.15, 0.15)).normalized()
        L = length * rnd.uniform(0.75, 1.1) * (1.0 if i % 2 else notch)
        ring.append(bm.verts.new(p0 + dd * L))
    for i in range(2 * n):
        bm.faces.new((c, ring[i], ring[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.obj_from_bm(bm, name, mat)
    ob['uvw'] = 'unwrap'
    return ob


def uv_atlas_trees(objs, margin=0.004, angle=60.0):
    """kit.uv_atlas replacement for trees: objects flagged uvw='unwrap' (open strips, fans, tubes
    and spheres with marked seams) get an angle-based unwrap = one island each, the rest smart
    project; then one shared pack. Far fewer split vertices than smart project everywhere."""
    objs = kit.mesh_objects(objs)
    if not objs:
        return
    for o in objs:
        uvl = o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
        o.data.uv_layers.active = uvl
        try:
            uvl.active_render = True
        except Exception:
            pass
    kit.select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)

    def sel(flag):
        any_ = False
        for o in objs:
            bm = bmesh.from_edit_mesh(o.data)
            f_on = (o.get('uvw') == 'unwrap') == flag
            for f in bm.faces:
                f.select_set(f_on)
            any_ = any_ or (f_on and len(bm.faces) > 0)
            bmesh.update_edit_mesh(o.data)
        return any_
    if sel(True):
        bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=margin)
    if sel(False):
        bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.uv.select_all(action='SELECT')
    except Exception:
        pass
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    except Exception as e:
        kit.log('pack_islands failed', e)
    bpy.ops.object.mode_set(mode='OBJECT')


def tris(ob):
    return kit.tri_count([ob])


# =========================================================================== tree builder
class Tree:
    """Collects tree parts with LOD ranges and paints wind with one bend field per tree:
    bend = tb * min(1, z / zt)^1.5 + (1 - tb) * min(1, d / Rc)^1.15, d = distance from the trunk
    axis (plus height above the trunk top) — so wood and leaves that touch move together."""

    def __init__(self, A, seed, zt, tb=0.25, Rc=12.0, axis=(0.0, 0.0), above=0.6):
        self.A = A
        self.rnd = random.Random(seed)
        self.zt = zt
        self.tb = tb
        self.Rc = Rc
        self.ax = V((axis[0], axis[1], 0))
        self.above = above
        self.parts = []
        self.n = 0

    def bend(self, co, *_):
        z = max(0.0, co.z)
        base = self.tb * min(1.0, z / self.zt) ** 1.5
        dh = V((co.x - self.ax.x, co.y - self.ax.y, 0)).length
        d = math.sqrt(dh * dh + (max(0.0, z - self.zt) * self.above) ** 2)
        return base + (1 - self.tb) * min(1.0, d / self.Rc) ** 1.15

    def name(self, s):
        self.n += 1
        return '%s_%03d' % (s, self.n)

    def add(self, ob, l0=0, l1=2, smooth=True):
        if smooth:
            kit.smooth(ob, 180.0)
        P.lod(ob, l0, l1)
        self.parts.append(ob)
        return ob

    # ---- wood
    def trunk(self, pts, radii, seg=7, mat=None, lods=(0, 2), flute_kw=None, cap=False):
        ob = taper(self.name('trunk'), pts, radii, seg=seg, mat=mat, cap_end=cap)
        if flute_kw:
            flute(ob, pts, **flute_kw)
        zt, tb = self.zt, self.tb
        P.wind(ob, lambda co, i: tb * min(1.0, max(0.0, co.z) / zt) ** 1.5, 0.0, 0.0)
        return self.add(ob, *lods)

    def limb(self, pts, radii, seg=5, mat=None, lods=(0, 2), phase=0.0, cap=False):
        ob = taper(self.name('limb'), pts, radii, seg=seg, mat=mat, cap_end=cap)
        P.wind(ob, self.bend, phase, 0.0)
        return self.add(ob, *lods)

    # ---- foliage
    def clump(self, c, r, mat, lods=(0, 2), kind='lump', seg=6, rings=4, subdiv=2, scale=(1, 1, 0.8), noise=0.22,
              flat=0.3, phase=None, flutter=1.0):
        ph = self.rnd.random() if phase is None else phase
        sd = self.rnd.randrange(10 ** 6)
        if kind == 'ico':
            ob = P.blob(self.name('clump'), r, loc=c, subdiv=subdiv, noise=noise, seed=sd, mat=mat, scale=scale, flat_bottom=flat)
        else:
            ob = lump(self.name('clump'), r, loc=c, seg=seg, rings=rings, noise=noise, seed=sd, mat=mat, scale=scale, flat_bottom=flat)
        P.wind(ob, self.bend, ph, flutter)
        return self.add(ob, *lods)

    def spray(self, base, d, length, width, mat, n=5, spread=1.4, droop=0.35, lods=(0, 0), phase=None):
        ph = self.rnd.random() if phase is None else phase
        ob = fan(self.name('spray'), base, d, length, width, n=n, spread=spread, droop=droop, mat=mat,
                        seed=self.rnd.randrange(10 ** 6))
        P.wind(ob, self.bend, ph, 1.0)
        return self.add(ob, *lods)

    def finish(self, kind, tex=256, lod_tris=(None, None, None), **kw):
        for k in range(3):
            n = sum(tris(o) for o in self.parts if o['lod'][0] <= k <= o['lod'][1])
            nv = sum(verts(o) for o in self.parts if o['lod'][0] <= k <= o['lod'][1])
            kit.log('%s LOD%d planned tris %d verts %d' % (self.A.id, k, n, nv))
        # fewer UV islands = fewer split vertices (positions stay float in the pack: vertex count
        # drives size): smart-project with a wide angle limit while this tree bakes
        orig = kit.uv_atlas
        kit.uv_atlas = lambda objs, margin=0.004, angle=60.0: uv_atlas_trees(objs, margin=margin, angle=UV_ANGLE)
        try:
            return P.finish_tree(self.A, self.parts, kind, lod_tris=lod_tris, tex=tex, **kw)
        finally:
            kit.uv_atlas = orig


UV_ANGLE = 85.0


# ---- crown helpers
def scatter(rnd, center, radii, n, shell=0.7, top_bias=0.25, min_d=0.0):
    """n points in an ellipsoid, biased to the outer shell (clump centres)."""
    c = V(center)
    out = []
    tries = 0
    while len(out) < n and tries < n * 400:
        tries += 1
        d = V((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1) + top_bias))
        if d.length < 1e-6:
            continue
        d.normalize()
        f = rnd.uniform(shell, 1.0)
        p = c + V((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * f
        if all((p - q).length >= min_d for q in out):
            out.append(p)
    return out


def edge_sprays(T, center, radii, pts, mat, n_per=1, length=3.0, width=1.0, blades=5, droop=0.3, spread=1.4,
                lods=(0, 0), outer=0.75, zmin=-1e9, push=1.0):
    """Leaf sprays on the crown silhouette: from clump points near the shell, pointing outward."""
    c = V(center)
    for p in pts:
        q = p - c
        rel = V((q.x / radii[0], q.y / radii[1], q.z / radii[2])).length
        if rel < outer or p.z < zmin:
            continue
        for _ in range(n_per):
            d = V((q.x / radii[0], q.y / radii[1], q.z / radii[2] * 0.6)).normalized()
            d = (d + V((T.rnd.uniform(-0.4, 0.4), T.rnd.uniform(-0.4, 0.4), T.rnd.uniform(-0.2, 0.3)))).normalized()
            base = c + V((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * (0.86 * push)
            T.spray(base, d, length * T.rnd.uniform(0.8, 1.2), width, mat, n=blades, spread=spread, droop=droop, lods=lods)


# =========================================================================== palms
def frond_path(base, az, L, e0, e1, n, wav=0.0):
    """Rachis polyline: starts at elevation e0 (deg), bends under gravity to e1 at the tip."""
    f = V((math.cos(az), math.sin(az), 0))
    pts = [V(base)]
    step = L / (n - 1)
    p = V(base)
    for i in range(1, n):
        t = i / (n - 1)
        e = math.radians(e0 + (e1 - e0) * t ** 1.4)
        p = p + (f * math.cos(e) + V((0, 0, math.sin(e)))) * step
        pts.append(p.copy())
    return pts


def _interp(pts, t):
    n = len(pts) - 1
    x = t * n
    i = min(int(x), n - 1)
    u = x - i
    p = pts[i].lerp(pts[i + 1], u)
    d = (pts[i + 1] - pts[i]).normalized()
    return p, d


def pinnate(name, pts, mat, leaf_len=4.0, hang=40.0, sweep=0.45, rachis_w=None, seed=0, plume=0.0, sag=0.12, petiole=0):
    """A pinnate palm frond, vertex-cheap: the rachis is a polyline (pts) and every segment
    carries one leaflet triangle on each side sharing that segment's edge (the inverted-V crease
    reads as the rachis). One connected open mesh = one UV island: (n) + 2(n-1) verts.
    hang = degrees below the frond plane (positive = drooping inverted V, coconut; negative = up)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    n = len(pts)
    K = n - 1
    cv = [bm.verts.new(p) for p in pts]
    for j in range(K):
        p0, p1 = pts[j], pts[j + 1]
        d = (p1 - p0).normalized()
        s = d.cross(V((0, 0, 1)))
        s = s.normalized() if s.length > 1e-6 else V((1, 0, 0))
        u = s.cross(d).normalized()
        t = (j + 0.5) / K
        prof = math.sin(math.pi * (0.1 + 0.86 * t)) ** 0.6
        for side in (-1, 1):
            L = leaf_len * prof * rnd.uniform(0.85, 1.12)
            a = math.radians(hang + rnd.uniform(-7, 7))
            pl = plume * (1 if (j % 2) else -1) * side
            ld = (s * side * math.cos(a) - u * math.sin(a) + d * sweep + u * pl).normalized()
            tip = p0.lerp(p1, 0.4) + ld * L - V((0, 0, L * sag))
            vt = bm.verts.new(tip)
            if side < 0:
                bm.faces.new((cv[j], vt, cv[j + 1]))
            else:
                bm.faces.new((cv[j], cv[j + 1], vt))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.obj_from_bm(bm, name, mat)
    ob['uvw'] = 'unwrap'
    return ob


def vblade(name, pts, width, mat, hang=35.0, sweep=0.0):
    """Cheap LOD frond: two solid blades in an inverted V along the rachis (2 tris / segment / side)."""
    n = len(pts)
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        s = d.cross(V((0, 0, 1)))
        s = s.normalized() if s.length > 1e-6 else V((1, 0, 0))
        u = s.cross(d).normalized()
        t = i / (n - 1)
        w = width * math.sin(math.pi * (0.1 + 0.85 * t)) ** 0.6
        a = math.radians(hang)
        l = p + (-s * math.cos(a) - u * math.sin(a)) * w + d * sweep * w
        r = p + (s * math.cos(a) - u * math.sin(a)) * w + d * sweep * w
        rows.append((bm.verts.new(l), bm.verts.new(p), bm.verts.new(r)))
    for i in range(n - 1):
        bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        bm.faces.new((rows[i][1], rows[i][2], rows[i + 1][2], rows[i + 1][1]))
    ob = kit.obj_from_bm(bm, name, mat)
    ob['uvw'] = 'unwrap'
    return ob


def frond_wind(ob, base, L, tb, phase, fl0=0.3):
    o = V(base)
    P.wind(ob, lambda co, i: tb + (1 - tb) * min(1.0, (co - o).length / L) ** 1.25, phase,
           lambda co, i: fl0 + (1 - fl0) * min(1.0, (co - o).length / L))
    return ob


def build_palm_crown(T, top, fronds, mats, rachis, dry_mat=None, dry=(), lod1=None, lod2=None, tb=0.28):
    """fronds: list of dicts (az, L, e0, e1, hang, nleaf, leaf_len, lods). LOD1 / LOD2 frond lists
    get V-blade versions."""
    for k, fd in enumerate(fronds):
        base = V(top) + V((math.cos(fd['az']), math.sin(fd['az']), 0)) * fd.get('off', 0.5) + V((0, 0, fd.get('dz', 0)))
        pts = frond_path(base, fd['az'], fd['L'], fd['e0'], fd['e1'], fd.get('nleaf', 11) + 1)
        mat = fd.get('mat') or mats[k % len(mats)]
        ob = pinnate(T.name('frond'), pts, mat, leaf_len=fd.get('leaf_len', fd['L'] * 0.24), hang=fd.get('hang', 40),
                     sweep=fd.get('sweep', 0.45), seed=T.rnd.randrange(10 ** 6), plume=fd.get('plume', 0.0),
                     rachis_w=fd.get('rachis_w', (0.42, 0.12)), sag=fd.get('sag', 0.12))
        frond_wind(ob, base, fd['L'], tb, T.rnd.random(), fd.get('fl0', 0.3))
        T.add(ob, *fd.get('lods', (0, 0)))
    for lst, lv in ((lod1, 1), (lod2, 2)):
        for k, fd in enumerate(lst or []):
            base = V(top) + V((math.cos(fd['az']), math.sin(fd['az']), 0)) * 0.5 + V((0, 0, fd.get('dz', 0)))
            pts = frond_path(base, fd['az'], fd['L'], fd['e0'], fd['e1'], fd.get('n', 5))
            mat = fd.get('mat') or mats[k % len(mats)]
            if fd.get('nleaf'):
                pts = frond_path(base, fd['az'], fd['L'], fd['e0'], fd['e1'], fd['nleaf'] + 1)
                ob = pinnate(T.name('pfrond'), pts, mat, leaf_len=fd.get('leaf_len', fd['L'] * 0.24), hang=fd.get('hang', 40),
                             sweep=fd.get('sweep', 0.45), seed=T.rnd.randrange(10 ** 6), plume=fd.get('plume', 0.0),
                             rachis_w=(0.5, 0.2), sag=fd.get('sag', 0.12))
            else:
                ob = vblade(T.name('vfrond'), pts, fd.get('w', fd['L'] * 0.2), mat, hang=fd.get('hang', 35), sweep=fd.get('sweep', 0.3))
            frond_wind(ob, base, fd['L'], tb, T.rnd.random(), fd.get('fl0', 0.3))
            T.add(ob, lv, fd.get('l1', lv))


def ringed_trunk_pts(H, lean, az, n, wob=0.25, seed=0, curve=1.8):
    rnd = random.Random(seed)
    d = V((math.cos(az), math.sin(az), 0))
    side = V((-d.y, d.x, 0))
    pts = []
    for i in range(n):
        t = i / (n - 1)
        off = lean * (1 - (1 - t) ** curve)
        w = wob * math.sin(t * 5.0 + rnd.uniform(0, 0.4))
        pts.append(d * off + side * w + V((0, 0, H * t)))
    return pts


# --------------------------------------------------------------------------- coconut
@kit.asset('tree_coconut', 'prop', kind='coconut')
def build_coconut(A):
    T = Tree(A, 1101, zt=40.0, tb=0.3, Rc=20.0)
    rnd = T.rnd
    H = 40.5
    lean_az = math.radians(-60)
    pts = ringed_trunk_pts(H, 6.0, lean_az, 12, wob=0.35, seed=3)
    radii = []
    for i, p in enumerate(pts):
        t = i / (len(pts) - 1)
        r = 0.78 + 0.22 * (1 - t) ** 3 + 0.75 * max(0.0, 1 - t * 9) ** 1.5
        radii.append(r * (1.06 if i % 2 else 0.95))
    bark = add_rings(P.M('palm_trunk', name='coco_trunk', base='#8c7d66', grain=0.22, var=0.14, scale=1.2),
                     1.6, '#4e4236', amount=0.75, sharp=(0.45, 0.85))
    T.trunk(pts, radii, seg=7, mat=bark, lods=(0, 0))
    # LOD1/2 trunk: fewer rings
    sel2 = (0, 1, 3, 7, 11)
    T.trunk([pts[i] for i in sel2], [radii[i] for i in sel2], seg=5, mat=bark, lods=(1, 1))
    sel3 = (0, 2, 11)
    T.trunk([pts[i] for i in sel3], [radii[i] for i in sel3], seg=4, mat=bark, lods=(2, 2))
    top = pts[-1]
    # crown heart: frond boots + spear
    boots = P.M('palm_trunk', name='coco_boot', base='#7a6a40', var=0.2, grain=0.2, scale=2.0)
    T.clump(top + V((0, 0, 0.3)), 1.35, boots, lods=(0, 1), kind='ico', subdiv=1, scale=(1, 1, 1.25), noise=0.15, flat=0.0, flutter=0.0)
    sp = taper(T.name('spear'), [top, top + V((0.3, 0.2, 5.5))], (0.35, 0.02), seg=4, mat=P.M('frond', name='coco_spear', base='#8aa04a'))
    frond_wind(sp, top, 6.0, 0.3, 0.5, 0.3)
    T.add(sp, 0, 0)
    gmats = [P.M('frond', name='coco_f1', base='#5a8a36', var=0.2, grain=0.2, scale=0.8),
             P.M('frond', name='coco_f2', base='#6b9440', var=0.2, grain=0.2, scale=0.8),
             P.M('frond', name='coco_f3', base='#4c7a30', var=0.2, grain=0.2, scale=0.8),
             add_patches(P.M('frond', name='coco_f4', base='#76984a', var=0.2, grain=0.2, scale=0.8), '#b0a454', 0.6, 0.6, 0.7, 0.8)]
    dry_m = P.M('frond_dry', name='coco_dry', base='#8a6c40', var=0.22, grain=0.2, dirt='#4a3420', grime=0.3)
    N = 13
    fronds = []
    for k in range(N):
        az = k * math.radians(137.5) + 0.3
        a = k / (N - 1)  # 0 = young (up), 1 = old (low)
        fronds.append(dict(az=az, L=rnd.uniform(18.0, 21.0) - 3.0 * (1 - a) ** 2, e0=58 - 66 * a + rnd.uniform(-6, 6),
                           e1=-45 - 38 * a + rnd.uniform(-8, 8), dz=-1.2 * a + rnd.uniform(-0.3, 0.3),
                           hang=36 + 16 * a, nleaf=10, lods=(0, 0)))
    # two dry hanging fronds
    for az in (lean_az + 2.2, lean_az - 1.7):
        fronds.append(dict(az=az, L=14.0, e0=-48, e1=-86, dz=-1.6, hang=65, nleaf=6, mat=dry_m, lods=(0, 0),
                           leaf_len=3.0, sweep=0.2, fl0=0.2))
    lod1 = [dict(az=f['az'], L=f['L'], e0=f['e0'], e1=f['e1'], dz=f['dz'], nleaf=4, hang=f['hang'], leaf_len=f['L'] * 0.27) for f in fronds[:11]]
    lod1.append(dict(az=fronds[N]['az'], L=13.0, e0=-50, e1=-86, dz=-1.6, nleaf=3, hang=65, mat=dry_m, leaf_len=3.0, sweep=0.2))
    lod2 = [dict(az=f['az'], L=f['L'], e0=f['e0'], e1=f['e1'], dz=f['dz'], nleaf=2, hang=40, leaf_len=f['L'] * 0.3) for f in fronds[:7]]
    build_palm_crown(T, top, fronds, gmats, None, lod1=lod1, lod2=lod2, tb=0.3)
    # coconuts: a hanging cluster under the crown, on the street side
    nutm = P.M('coconut', name='coco_nut', base='#6f7f2c', var=0.15, grain=0.1)
    ph = rnd.random()
    for j in range(4):
        a = j * 2.3 + 0.4
        rr = 1.25 + 0.35 * (j % 2)
        c = top + V((math.cos(a) * rr, math.sin(a) * rr - 0.4, -1.7 - 0.5 * (j % 3)))
        T.clump(c, 0.78, nutm, lods=(0, 0), kind='ico', subdiv=1, scale=(1, 1, 1.18), noise=0.05, flat=0.0, phase=ph, flutter=0.0)
    T.clump(top + V((0, -0.4, -2.0)), 1.9, nutm, lods=(1, 1), kind='ico', subdiv=1, scale=(1.1, 1.1, 0.8), noise=0.2, flat=0.0, phase=ph, flutter=0.0)
    T.finish('coconut', tex=256)


# --------------------------------------------------------------------------- roadside palm (royal palm)
@kit.asset('tree_palm', 'prop', kind='palm')
def build_palm(A):
    T = Tree(A, 2202, zt=33.0, tb=0.22, Rc=14.0)
    rnd = T.rnd
    H = 33.0
    pts = [V((0.15 * math.sin(i * 0.9), 0.1 * math.cos(i * 0.7), H * i / 9)) for i in range(10)]
    radii = []
    for i in range(10):
        t = i / 9
        r = 0.95 + 0.25 * math.sin(math.pi * min(1, t * 1.4)) + 0.45 * max(0, 1 - t * 8) ** 1.5
        radii.append(r * (0.86 if t > 0.75 else 1.0))
    bark = add_rings(P.M('bark_grey', name='palm_grey', base='#a29c90', var=0.08, grain=0.12, grime=0.4, scale=1.0),
                     0.9, '#7a746a', amount=0.35, sharp=(0.7, 0.95))
    T.trunk(pts[:8], radii[:8], seg=7, mat=bark, lods=(0, 0))
    T.trunk([pts[i] for i in (0, 2, 5, 7)], [radii[i] for i in (0, 2, 5, 7)], seg=6, mat=bark, lods=(1, 1))
    T.trunk([pts[0], pts[7]], [radii[0], radii[7]], seg=5, mat=bark, lods=(2, 2))
    # glossy green crownshaft
    shaft = P.M('leaf', name='palm_shaft', base='#5f8a3a', var=0.1, grain=0.08, rough=0.35, scale=1.0)
    cs = [pts[7], pts[7] + V((0, 0, 3.5)), pts[7] + V((0, 0, 7.0)), pts[7] + V((0, 0, 8.6))]
    sh = taper(T.name('shaft'), cs, [radii[7] * 0.98, radii[7] * 1.05, radii[7] * 0.85, 0.45], seg=7, mat=shaft, cap_end=True)
    P.wind(sh, T.bend, 0.0, 0.0)
    T.add(sh, 0, 1)
    sh2 = taper(T.name('shaft2'), [cs[0], cs[-1]], [radii[7], 0.5], seg=5, mat=shaft, cap_end=False)
    P.wind(sh2, T.bend, 0.0, 0.0)
    T.add(sh2, 2, 2)
    top = cs[-1] - V((0, 0, 0.4))
    gm = [P.M('frond', name='palm_f1', base='#4f8a34', var=0.18, grain=0.18, scale=0.8),
          P.M('frond', name='palm_f2', base='#5e9a3c', var=0.18, grain=0.18, scale=0.8),
          P.M('frond', name='palm_f3', base='#447a2c', var=0.18, grain=0.18, scale=0.8)]
    N = 15
    fronds = []
    for k in range(N):
        az = k * math.radians(137.5)
        a = k / (N - 1)
        fronds.append(dict(az=az, L=rnd.uniform(13.0, 15.0) - 2.0 * (1 - a) ** 2, e0=72 - 62 * a, e1=-20 - 35 * a + rnd.uniform(-6, 6),
                           dz=-0.9 * a, hang=-12 + 30 * a, nleaf=12, n=7, lods=(0, 0), plume=0.25, leaf_len=3.0, sweep=0.35))
    lod1 = [dict(az=f['az'], L=f['L'], e0=f['e0'], e1=f['e1'], dz=f['dz'], n=4, w=2.8, hang=5) for f in fronds[:13]]
    lod2 = [dict(az=f['az'], L=f['L'], e0=f['e0'], e1=f['e1'], dz=f['dz'], n=3, w=3.0, hang=10) for f in fronds[:8]]
    build_palm_crown(T, top, fronds, gm, None, lod1=lod1, lod2=lod2, tb=0.22)
    T.finish('palm', tex=256)


# =========================================================================== broadleaf trees
def crown(T, center, radii, n_big, n_small, mats, r_big, r_small, lod1_n, r_lod1, lod2_n, r_lod2, spray_mat=None,
          sprays=dict(), flat=0.35, shell=0.55, big_kw=None, small_kw=None, top_bias=0.25, limb_to=None):
    """Clumps for LOD0 (big lumps + small outer bumps + edge sprays), LOD1 masses, LOD2 masses.
    Returns the LOD0 big clump centres (for limbs)."""
    rnd = T.rnd
    c = V(center)
    big = scatter(rnd, c, (radii[0] - r_big * 0.7, radii[1] - r_big * 0.7, radii[2] - r_big * 0.6), n_big, shell=shell,
                  top_bias=top_bias, min_d=r_big * 0.9)
    for i, p in enumerate(big):
        hi = (p.z - c.z) / radii[2]
        m = mats[min(len(mats) - 1, max(0, int((hi + 1) / 2 * len(mats))))] if len(mats) > 1 else mats[0]
        T.clump(p, r_big * rnd.uniform(0.85, 1.15), m, lods=(0, 0), flat=flat, **(big_kw or {}))
    small = scatter(rnd, c, (radii[0] - r_small * 0.5, radii[1] - r_small * 0.5, radii[2] - r_small * 0.4), n_small,
                    shell=0.85, top_bias=top_bias * 0.5, min_d=r_small * 1.2)
    for p in small:
        m = mats[rnd.randrange(len(mats))]
        T.clump(p, r_small * rnd.uniform(0.8, 1.2), m, lods=(0, 0), flat=0.2, **(small_kw or dict(kind='ico', subdiv=1, noise=0.25, scale=(1, 1, 0.85))))
    if spray_mat is not None and sprays:
        edge_sprays(T, c, radii, big + small, spray_mat, **sprays)
    l1 = scatter(rnd, c, (radii[0] - r_lod1 * 0.7, radii[1] - r_lod1 * 0.7, radii[2] - r_lod1 * 0.6), lod1_n, shell=0.45,
                 top_bias=top_bias, min_d=r_lod1 * 0.8)
    for i, p in enumerate(l1):
        T.clump(p, r_lod1 * rnd.uniform(0.9, 1.1), mats[i % len(mats)], lods=(1, 1), flat=flat, seg=6, rings=4, noise=0.2)
    l2 = scatter(rnd, c, (radii[0] - r_lod2 * 0.75, radii[1] - r_lod2 * 0.75, radii[2] - r_lod2 * 0.6), lod2_n, shell=0.3,
                 top_bias=top_bias, min_d=r_lod2 * 0.7)
    for i, p in enumerate(l2):
        T.clump(p, r_lod2, mats[i % len(mats)], lods=(2, 2), kind='ico', subdiv=1, noise=0.18, flat=flat, scale=(1, 1, 0.85))
    return big


def limbs_to(T, fork, targets, r0, r1=0.25, seg=5, mat=None, lods=(0, 1), rise=0.35, n=4):
    for t in targets:
        t = V(t)
        f = V(fork)
        mid = f.lerp(t, 0.45) + V((0, 0, (t - f).length * rise * 0.3))
        mid.z = max(mid.z, f.z + (t.z - f.z) * 0.6)
        T.limb(bez(f, mid, t, n), (r0, r1), seg=seg, mat=mat, lods=lods, phase=T.rnd.random())


# --------------------------------------------------------------------------- neem
@kit.asset('tree_neem', 'prop', kind='neem')
def build_neem(A):
    T = Tree(A, 3303, zt=10.0, tb=0.22, Rc=13.0)
    bark = P.M('bark', name='neem_bark', base='#4e443c', var=0.14, grain=0.3, grime=0.5, dirt='#221c18', scale=2.5)
    tp = [V((0, 0, 0)), V((0.2, 0.1, 4)), V((0.5, -0.1, 8)), V((0.6, 0, 10.5))]
    T.trunk(tp, [1.35, 1.0, 0.9, 0.8], seg=7, mat=bark, lods=(0, 2), flute_kw=dict(lobes=4, amp=0.12, zmax=2.5, flare=0.35))
    c = V((0.4, 0, 20.5))
    radii = (12.0, 11.5, 9.0)
    mats = [leafmat('neem_l1', '#36602a', specks=0.6, scale=0.22),
            leafmat('neem_l2', '#3f6e2e', specks=0.6, scale=0.22),
            leafmat('neem_l3', '#4c7c34', specks=0.6, scale=0.22)]
    big = crown(T, c, radii, 7, 9, mats, 5.0, 2.6, 6, 6.2, 4, 7.0,
                spray_mat=leafmat('neem_spray', '#4a7a30', specks=0.3, scale=0.3),
                sprays=dict(n_per=1, length=3.2, width=0.9, blades=5, droop=0.3, outer=0.72, zmin=c.z - 4),
                big_kw=dict(seg=7, rings=5, noise=0.24), flat=0.35)
    # forked limbs reaching into the lower clumps
    fork = tp[-1]
    tg = sorted(big, key=lambda p: p.z)[:4]
    limbs_to(T, fork, [p.lerp(c, 0.25) for p in tg], 0.62, 0.22, seg=5, mat=bark, lods=(0, 1))
    limbs_to(T, tp[2], [c + V((-5, 4, -3)), c + V((4, -5, -2.5))], 0.45, 0.18, seg=4, mat=bark, lods=(0, 0))
    T.finish('neem', tex=256)


# --------------------------------------------------------------------------- banyan
@kit.asset('tree_banyan', 'prop', kind='banyan')
def build_banyan(A):
    T = Tree(A, 4404, zt=13.0, tb=0.18, Rc=20.0, above=0.4)
    rnd = T.rnd
    bark = P.M('bark_grey', name='banyan_bark', base='#7e776c', var=0.14, grain=0.26, grime=0.55, dirt='#3a342c', scale=1.8)
    tp = [V((0, 0, 0)), V((0.3, 0, 5)), V((0.2, 0.3, 10)), V((0, 0, 13.5))]
    T.trunk(tp, [3.4, 2.6, 2.3, 2.1], seg=10, mat=bark, lods=(0, 0), flute_kw=dict(lobes=5, amp=0.22, zmax=9.0, flare=0.45, seed=2))
    T.trunk(tp, [3.4, 2.6, 2.3, 2.1], seg=7, mat=bark, lods=(1, 1), flute_kw=dict(lobes=3, amp=0.15, zmax=6.0, flare=0.4, seed=2))
    T.trunk([tp[0], tp[-1]], [3.6, 2.1], seg=6, mat=bark, lods=(2, 2))
    c = V((0, 0, 25.5))
    radii = (20.0, 18.0, 7.5)
    mats = [leafmat('ban_l1', '#2f5a24', specks=0.55, scale=0.2),
            leafmat('ban_l2', '#3a6a2a', specks=0.55, scale=0.2),
            leafmat('ban_l3', '#4a7a32', specks=0.55, scale=0.2)]
    big = crown(T, c, radii, 7, 8, mats, 6.0, 3.2, 6, 7.2, 5, 8.5,
                spray_mat=leafmat('ban_spray', '#3e6c2a', specks=0.3, scale=0.3),
                sprays=dict(n_per=1, length=3.6, width=1.6, blades=4, droop=0.35, outer=0.7, zmin=c.z - 3, spread=1.2),
                big_kw=dict(seg=7, rings=4, noise=0.22, scale=(1.25, 1.25, 0.7)), flat=0.45, shell=0.35, top_bias=0.1,
                small_kw=dict(seg=5, rings=4, noise=0.25, scale=(1.2, 1.2, 0.8)))
    # big horizontal limbs
    top = tp[-1]
    limb_ends = []
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        e = V((math.cos(a) * radii[0] * 0.75, math.sin(a) * radii[1] * 0.75, c.z - 3.5 + rnd.uniform(-1, 1)))
        limb_ends.append(e)
        mid = top.lerp(e, 0.5) + V((0, 0, 2.5))
        T.limb(bez(top + V((0, 0, -1.0)), mid, e, 4), (1.2, 0.35), seg=5, mat=bark, lods=(0, 1), phase=rnd.random())
    # aerial roots: hanging from the limbs; a few reach the ground as pillar roots
    rootm = P.M('bark', name='banyan_root', base='#6e5a48', var=0.14, grain=0.2, scale=2.0)
    for k, e in enumerate(limb_ends):
        top_l = top + V((0, 0, -1.0))
        for j, f in enumerate((0.45, 0.75)):
            mid = top_l.lerp(e, 0.5) + V((0, 0, 2.5))
            p = bez(top_l, mid, e, 9)[int(f * 8)]
            p = p + V((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), -0.3))
            wtop = T.bend(p)
            if (k + j) % 4 == 1:
                # pillar root: reaches the ground, rigid at its foot
                q = [p, p + V((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), -p.z * 0.5)), V((p.x + rnd.uniform(-0.5, 0.5), p.y + rnd.uniform(-0.5, 0.5), 0.0))]
                ob = taper(T.name('pillar'), q, [0.35, 0.5, 0.75], seg=5, mat=rootm, cap_end=False)
                P.wind(ob, lambda co, i, w=wtop, z0=p.z: w * max(0.0, co.z / z0) ** 1.5, 0.0, 0.0)
                T.add(ob, 0, 1)
            else:
                L = rnd.uniform(9, p.z - 6)
                q = [p, p + V((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), -L * 0.5)), p + V((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), -L))]
                ob = taper(T.name('aroot'), q, [0.2, 0.12, 0.03], seg=3, mat=rootm, cap_end=False)
                z0 = p.z
                P.wind(ob, lambda co, i, w=wtop, z0=z0, L=L: w + (0.72 - w) * min(1.0, (z0 - co.z) / L), rnd.random(), 0.0)
                T.add(ob, 0, 0)
                if k % 2 == 0:
                    # thin strands beside it
                    L2 = L * 0.6
                    p2 = p + V((0.6, 0.4, 0))
                    ob = taper(T.name('aroot'), [p2, p2 + V((0.2, 0, -L2))], [0.12, 0.02], seg=3, mat=rootm, cap_end=False)
                    P.wind(ob, lambda co, i, w=wtop, z0=p2.z, L=L2: w + (0.72 - w) * min(1.0, (z0 - co.z) / L), rnd.random(), 0.0)
                    T.add(ob, 0, 0)
    T.finish('banyan', tex=256)


# --------------------------------------------------------------------------- gulmohar (shared builder)
def gulmohar(A, flowering):
    T = Tree(A, 5505, zt=8.5, tb=0.2, Rc=15.0)
    rnd = T.rnd
    bark = P.M('bark_grey', name='gul_bark', base='#6e665c', var=0.12, grain=0.22, grime=0.45, scale=2.0)
    tp = [V((0, 0, 0)), V((0.3, 0.2, 4)), V((0.6, 0.1, 8.5))]
    T.trunk(tp, [1.25, 0.95, 0.85], seg=7, mat=bark, lods=(0, 2), flute_kw=dict(lobes=4, amp=0.12, zmax=2.0, flare=0.35))
    c = V((0.6, 0, 23.0))
    radii = (15.5, 14.5, 4.8)
    if flowering:
        mats = [add_patches(leafmat('gul_f1', '#5e8c34', specks=0.4, scale=0.25), '#d8341a', 0.55, 0.42, 0.5, 1.0, seed=1.0),
                add_patches(leafmat('gul_f2', '#6a9638', specks=0.4, scale=0.25), '#e0501e', 0.6, 0.38, 0.46, 1.0, seed=2.0),
                add_patches(leafmat('gul_f3', '#5a8632', specks=0.4, scale=0.25), '#cc2a16', 0.5, 0.45, 0.53, 1.0, seed=3.0)]
        spray = P.M('flower_red', name='gul_flower', base='#dc3a1c', specks=0.4, scale=0.4, var=0.15)
    else:
        mats = [leafmat('gul_g1', '#5c8e36', specks=0.5, scale=0.25),
                leafmat('gul_g2', '#6c9c3e', specks=0.5, scale=0.25),
                leafmat('gul_g3', '#4e7e30', specks=0.5, scale=0.25)]
        spray = leafmat('gul_spray', '#6a9a3c', specks=0.3, scale=0.3)
    big = crown(T, c, radii, 7, 9, mats, 5.0, 2.5, 6, 6.0, 4, 7.2, spray_mat=spray,
                sprays=dict(n_per=1, length=3.0, width=1.1, blades=5, droop=0.15, outer=0.62, spread=1.6),
                big_kw=dict(seg=7, rings=4, noise=0.2, scale=(1.3, 1.3, 0.62)), flat=0.5, shell=0.3, top_bias=0.0,
                small_kw=dict(kind='ico', subdiv=1, noise=0.25, scale=(1.2, 1.2, 0.7)))
    fork = tp[-1]
    tg = []
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.5
        tg.append(c + V((math.cos(a) * 9.5, math.sin(a) * 9.0, -2.5)))
    limbs_to(T, fork, tg, 0.55, 0.2, seg=5, mat=bark, lods=(0, 1), rise=0.2, n=4)
    T.finish('gulmohar', tex=256)
    if not flowering:
        A.meta['variant'] = 'green'


@kit.asset('tree_gulmohar', 'prop', kind='gulmohar')
def build_gulmohar(A):
    gulmohar(A, True)


@kit.asset('tree_gulmohar_green', 'prop', kind='gulmohar', variant='green')
def build_gulmohar_green(A):
    gulmohar(A, False)


# --------------------------------------------------------------------------- ashoka (pendula)
@kit.asset('tree_ashoka', 'prop', kind='ashoka')
def build_ashoka(A):
    T = Tree(A, 6606, zt=38.0, tb=0.3, Rc=4.5, above=1.0)
    rnd = T.rnd
    bark = P.M('bark', name='ash_bark', base='#4a3e34', var=0.1, grain=0.2, scale=2.5)
    tp = [V((0, 0, 0)), V((0.1, 0, 12)), V((0.2, 0.1, 26)), V((0.2, 0, 38))]
    T.trunk(tp, [0.75, 0.55, 0.35, 0.12], seg=6, mat=bark, lods=(0, 2))
    mats = [leafmat('ash_l1', '#1f4019', specks=0.5, scale=0.25, rough=0.35),
            leafmat('ash_l2', '#28501f', specks=0.5, scale=0.25, rough=0.35),
            leafmat('ash_l3', '#335c26', specks=0.5, scale=0.25, rough=0.35)]
    spray = leafmat('ash_spray', '#2c5422', specks=0.3, scale=0.3, rough=0.35)
    H = 40.0
    z0 = 4.0

    def R(z):  # columnar radius profile
        t = (z - z0) / (H - z0)
        return max(0.6, 4.2 * (1 - t ** 2.2) * (0.75 + 0.25 * math.sin(math.pi * min(1, t * 2.5))))
    # LOD0: tiers of hanging clumps around the column
    nt = 9
    for i in range(nt):
        z = z0 + 2.5 + (H - z0 - 4.5) * i / (nt - 1)
        r = R(z)
        T.clump(V((0.15, 0, z)), r * 0.95, mats[i % 3], lods=(0, 0), seg=6, rings=4, noise=0.2, scale=(1, 1, 1.25), flat=0.0)
        # drooping sprays around this tier
        k = 4 if r > 2.5 else 3
        for j in range(k):
            a = j * 2 * math.pi / k + i * 0.9 + rnd.uniform(-0.3, 0.3)
            d = V((math.cos(a), math.sin(a), 0.15))
            base = V((0.15, 0, z + r * 0.3)) + V((d.x, d.y, 0)) * r * 0.75
            T.spray(base, d, max(2.2, r * 0.9), 0.75, spray, n=4, spread=0.9, droop=2.2, lods=(0, 0))
    tip = taper(T.name('tip'), [V((0.2, 0, H - 3.0)), V((0.25, 0, H + 0.3))], (0.9, 0.05), seg=5, mat=mats[2], cap_end=False)
    P.wind(tip, T.bend, rnd.random(), 1.0)
    T.add(tip, 0, 1)
    for i in range(5):
        z = z0 + 3 + (H - z0 - 6) * i / 4
        T.clump(V((0.15, 0, z)), R(z) * 1.05, mats[i % 3], lods=(1, 1), seg=6, rings=4, noise=0.18, scale=(1, 1, 1.5), flat=0.0)
    col = lump(T.name('col'), 1.0, (0.15, 0, (H + z0) / 2), seg=6, rings=5, noise=0.1, seed=1, mat=mats[1],
               scale=(3.9, 3.9, (H - z0) / 2), jitter=0.04)
    P.wind(col, T.bend, rnd.random(), 1.0)
    T.add(col, 2, 2)
    T.finish('ashoka', tex=256)


# --------------------------------------------------------------------------- mango
@kit.asset('tree_mango', 'prop', kind='mango')
def build_mango(A):
    T = Tree(A, 7707, zt=7.0, tb=0.18, Rc=13.0)
    rnd = T.rnd
    bark = P.M('bark', name='mango_bark', base='#4a3a2e', var=0.12, grain=0.3, grime=0.5, scale=2.2)
    tp = [V((0, 0, 0)), V((0.3, 0, 3.5)), V((0.5, 0.2, 7.0))]
    T.trunk(tp, [1.75, 1.35, 1.2], seg=8, mat=bark, lods=(0, 2), flute_kw=dict(lobes=4, amp=0.15, zmax=2.5, flare=0.4))
    c = V((0.4, 0, 19.0))
    radii = (13.0, 12.5, 11.5)
    mats = [leafmat('mango_l1', '#1f4a1c', specks=0.45, scale=0.2, rough=0.45),
            leafmat('mango_l2', '#265420', specks=0.45, scale=0.2, rough=0.45),
            leafmat('mango_l3', '#305e26', specks=0.45, scale=0.2, rough=0.45)]
    big = crown(T, c, radii, 7, 9, mats, 5.4, 2.8, 6, 6.6, 4, 7.6,
                spray_mat=leafmat('mango_spray', '#2a5a22', specks=0.3, scale=0.3, rough=0.45),
                sprays=dict(n_per=1, length=3.4, width=1.2, blades=4, droop=0.45, outer=0.75, spread=1.1, zmin=c.z - 6),
                big_kw=dict(seg=7, rings=5, noise=0.2), flat=0.4, shell=0.5, top_bias=0.35)
    tg = sorted(big, key=lambda p: p.z)[:4]
    limbs_to(T, tp[-1], [p.lerp(c, 0.3) for p in tg], 0.8, 0.25, seg=5, mat=bark, lods=(0, 1))
    # a few mangoes hanging below the crown edge
    fruit = P.M('mango_fruit', name='mango_fr', base='#8aa034', var=0.2)
    fruit = add_patches(fruit, '#d8a030', 0.8, 0.5, 0.6, 0.8)
    for j in range(5):
        a = j * 1.3 + 0.5
        p = c + V((math.cos(a) * radii[0] * 0.7, math.sin(a) * radii[1] * 0.7, -radii[2] * 0.55 + rnd.uniform(-0.5, 0.5)))
        T.clump(p, 0.55, fruit, lods=(0, 0), kind='ico', subdiv=1, scale=(0.85, 0.85, 1.3), noise=0.05, flat=0.0, flutter=0.0)
    T.finish('mango', tex=256)


# --------------------------------------------------------------------------- tamarind
@kit.asset('tree_tamarind', 'prop', kind='tamarind')
def build_tamarind(A):
    T = Tree(A, 8808, zt=9.0, tb=0.18, Rc=15.0)
    rnd = T.rnd
    bark = P.M('bark', name='tam_bark', base='#3e342c', var=0.16, grain=0.4, grime=0.6, dirt='#1a1410', scale=2.6)
    tp = [V((0, 0, 0)), V((0.6, 0.2, 3.5)), V((0.4, -0.2, 6.5)), V((1.0, 0, 9.0))]
    T.trunk(tp, [2.0, 1.5, 1.35, 1.2], seg=8, mat=bark, lods=(0, 2), flute_kw=dict(lobes=3, amp=0.22, zmax=5.0, flare=0.4, seed=4))
    # irregular crown: three lobes at different heights
    mats = [leafmat('tam_l1', '#3a5e2a', specks=0.7, scale=0.3),
            leafmat('tam_l2', '#46703a', specks=0.7, scale=0.3),
            leafmat('tam_l3', '#557c3a', specks=0.7, scale=0.3)]
    spray = leafmat('tam_spray', '#4e7636', specks=0.4, scale=0.35)
    lobes = [(V((-6, 2, 22)), (9.0, 8.5, 7.0)), (V((6, -2, 24.5)), (9.0, 8.0, 7.5)), (V((0.5, 5, 26)), (7.0, 6.5, 6.5))]
    nb = (3, 3, 2)
    ns = (3, 3, 3)
    allbig = []
    for li, ((c, rr), b, s) in enumerate(zip(lobes, nb, ns)):
        big = crown(T, c, rr, b, s, mats, 4.6, 2.4, 2, 6.0, 1 if li < 2 else 1, 7.5, spray_mat=spray,
                    sprays=dict(n_per=1, length=3.0, width=0.8, blades=6, droop=0.3, outer=0.68, spread=1.6, zmin=c.z - 3),
                    big_kw=dict(seg=7, rings=5, noise=0.25), flat=0.35, shell=0.5)
        allbig += big
    fork = tp[-1]
    for c, rr in lobes:
        e = c + V((0, 0, -rr[2] * 0.45))
        mid = fork.lerp(e, 0.5) + V((0, 0, 2.0))
        T.limb(bez(fork, mid, e, 4), (0.95, 0.3), seg=6, mat=bark, lods=(0, 1), phase=rnd.random())
        # secondary limbs
        for k in range(1):
            e2 = c + V((rnd.uniform(-1, 1) * rr[0] * 0.6, rnd.uniform(-1, 1) * rr[1] * 0.6, -rr[2] * 0.4))
            m2 = mid.lerp(e, 0.3)
            T.limb(bez(m2, m2.lerp(e2, 0.5) + V((0, 0, 1.2)), e2, 3), (0.45, 0.15), seg=4, mat=bark, lods=(0, 0), phase=rnd.random())
    T.finish('tamarind', tex=256)
