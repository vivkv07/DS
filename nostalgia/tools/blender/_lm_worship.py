"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

Places of worship (group WORSHIP): St Joseph's Cathedral, St Mary's Church, Wesley Church, the
Dilsukhnagar Sai Baba temple, Ujjaini Mahankali (Secunderabad), Lal Darwaza Mahankali (Old City) and
the neighbourhood kits (temple / mosque / church / dargah). Modelled plainly and respectfully: no
deity figures (sanctum doorways are closed / dim panels), nothing comic, nothing destructible.
Low-poly silhouettes; colour detail (painted gopuram niches, striped compound walls) comes from small
generated images baked into the one atlas (SignUV, like the signboards).
"""
import math
import bmesh
import bpy
import kit
import _lmkit as L
from kit import box, cylinder, lathe, prism_from_outline, arch_outline

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

SAFFRON = '#f08a24'
TEMPLE_RED = '#b8262a'
GREEN = '#1f7a3e'


# =========================================================================== palette + finishing
def _p(col, name=None, key='whitewash', **kw):
    """low-noise painted surface (small WebP atlas): uniform roughness, faint grain and grime"""
    spec = dict(var=0.02, grain=0.0, grime=0.3, streaks=0.12, rough=0.9, metal=0.0)
    spec.update(kw)
    return L.paint(col, name=name or ('w_' + col.strip('#')), key=key, **spec)


def _pal():
    return {
        'white': _p('#f2efe6', 'w_white'),
        'cream': _p('#ece0c4', 'w_cream'),
        'grey': _p('#8f8c86', 'w_grey'),
        'slate': _p('#6f6d6a', 'w_slate'),
        'tile': _p('#a5573e', 'w_tile'),
        'dark': _p('#2e3440', 'w_dark', grime=0.0, streaks=0.0),
        'door': _p('#4a3426', 'w_door', grime=0.1, streaks=0.0),
        'gold': _p('#c9a23a', 'w_gold', grime=0.15, streaks=0.0),
        'stone': _p('#b8b2a6', 'w_stone'),
        'green': _p(GREEN, 'w_green', grime=0.15),
        'saffron': _p(SAFFRON, 'w_saffron', grime=0.1, streaks=0.0),
        'red': _p(TEMPLE_RED, 'w_red', grime=0.2),
        'lamp': L.lamp('#ffd9a0'),
    }


def _aabb(o):
    me = o.data
    if len(me.vertices) != 8 or len(me.polygons) != 6:
        return None
    mn = [min(v.co[i] for v in me.vertices) for i in range(3)]
    mx = [max(v.co[i] for v in me.vertices) for i in range(3)]
    for v in me.vertices:
        for i in range(3):
            if min(abs(v.co[i] - mn[i]), abs(v.co[i] - mx[i])) > 1e-3:
                return None
    return mn, mx


def _cull(objs):
    """drop faces nobody can see: undersides on the ground and faces buried in another solid box"""
    occ = []
    for o in objs:
        bb = _aabb(o)
        if bb:
            occ.append((o, bb[0], bb[1]))
    e, off = 0.02, 0.06
    gone = 0
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.normal_update()
        kill = []
        for f in bm.faces:
            n = f.normal
            if n.z < -0.9 and all(v.co.z <= 0.03 for v in f.verts):
                kill.append(f)
                continue
            pts = [v.co + n * off for v in f.verts] + [f.calc_center_median() + n * off]
            for (oo, mn, mx) in occ:
                if oo is o:
                    continue
                if all(mn[0] - e <= p.x <= mx[0] + e and mn[1] - e <= p.y <= mx[1] + e and mn[2] - e <= p.z <= mx[2] + e for p in pts):
                    kill.append(f)
                    break
        if kill:
            gone += len(kill)
            bmesh.ops.delete(bm, geom=kill, context='FACES_ONLY')
            bm.to_mesh(o.data)
        bm.free()
    kit.log('cull: dropped %d hidden faces' % gone)


def _finish(A, objs, size=512, variants=None, ao_samples=64):
    """L.finish without the ORM map (plain painted surfaces), after culling hidden faces"""
    body = [o for o in objs if o is not None]
    allv = list(body)
    for vo in (variants or {}).values():
        allv += [o for o in vo if o is not None]
    for o in allv:
        kit.apply_modifiers(o)
    _cull(allv)
    groups = []
    if body:
        groups.append(kit.join(body, A.id + '_body'))
    for name, vo in (variants or {}).items():
        vo = [o for o in vo if o is not None]
        if vo:
            groups.append(kit.join(vo, 'var_' + name))
    for g in groups:
        kit.smooth(g, 50)
    import os
    size = int(os.environ.get('WS_SIZE', size))
    kit.finish_atlas(A, groups, size=size, ao_samples=ao_samples, ao_strength=0.75, orm=False)
    return groups



# =========================================================================== small helpers
def _ngon(name, pts, mat, y=0.0):
    """one flat face from an outline [(x, z)] in the XZ plane at y, facing -Y (painted panels)"""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for (x, z) in pts]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


def _panel(name, pts, mat, loc, rz=0.0):
    """flat painted panel (outline in XZ, facing -Y) moved to loc and turned by rz"""
    return L.place(_ngon(name, pts, mat), loc, rz)


def _disc(name, r, n, mat, loc, rz=0.0):
    """flat round panel (n-gon) facing -Y, centred at loc"""
    pts = [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    return L.place(_ngon(name, pts, mat), loc, rz)


def _rect(w, h):
    return [(-w / 2, 0), (w / 2, 0), (w / 2, h), (-w / 2, h)]


def _lancet(w, h, kind='pointed', n=3):
    """window / door outline of total height h (spring + rise)"""
    rise = w * (0.9 if kind == 'pointed' else 0.5)
    return arch_outline(w, max(0.1, h - rise), rise, kind, n=n)


def _wall_windows(name, mat, xs, z, w, h, y, rz=0.0, kind='pointed'):
    """a row of window panels along a wall at depth y (wall-local x positions), then turned by rz"""
    out = []
    for x in xs:
        out.append(_ngon(name, [(px + x, pz + z) for (px, pz) in _lancet(w, h, kind)], mat, y=y))
    o = kit.join(out, name)
    return L.place(o, (0, 0, 0), rz)


def _cross(name, h, loc, mat, w=None, t=0.45):
    x, y, z = loc
    w = w or h * 0.55
    return kit.join([box(name, (t, t, h), (x, y, z), mat, base=True),
                     box(name + '_b', (w, t, t), (x, y, z + h * 0.62), mat, base=True)], name)


def _gable(name, w, d, eave, rise, loc, mat):
    """house-shaped prism (gable ends face -Y / +Y), base centre at loc"""
    out = [(-w / 2, 0), (w / 2, 0), (w / 2, eave), (0, eave + rise), (-w / 2, eave)]
    return prism_from_outline(name, out, d, center=loc, mat=mat)


def _roof(name, w, d, eave, rise, loc, mat, over=1.0, t=0.6):
    """two thin roof slabs on a gable (ridge along Y), overhanging by `over`"""
    x, y, z = loc
    hw = w / 2
    a = math.atan2(rise, hw)
    run = hw + over
    Ls = run / math.cos(a) + t * math.tan(a)
    out = []
    for s in (-1, 1):
        r = box(name, (Ls, d + 2 * over, t), (0, 0, 0), mat)
        r.rotation_euler = (0, s * a, 0)
        cx = s * run / 2 + s * math.sin(a) * t / 2
        cz = eave + rise - run * math.tan(a) / 2 + math.cos(a) * t / 2
        r.location = (x + cx, y, z + cz)
        kit.apply_transform(r)
        out.append(r)
    return kit.join(out, name)


def _spire(name, r, h, loc, mat, seg=4, rot=True):
    s = cylinder(name, r, h, loc, seg=seg, mat=mat, r2=0.0)
    if rot and seg == 4:
        x, y, z = loc
        s.location = (-x, -y, 0)
        kit.apply_transform(s)
        s.rotation_euler = (0, 0, math.pi / 4)
        s.location = (x, y, 0)
        kit.apply_transform(s)
    return s


def _kalash(name, loc, s, mat, seg=6):
    x, y, z = loc
    return lathe(name, [(0.5 * s, 0), (0.9 * s, 0.5 * s), (0.6 * s, 1.1 * s), (0.25 * s, 1.4 * s), (0.4 * s, 1.7 * s), (0.0, 2.6 * s)],
                 seg=seg, mat=mat, loc=(x, y, z))


def _flag(name, loc, h, col, M, size=3.0, pole=None):
    """pole + triangular pennant (thin prism) pointing +X"""
    x, y, z = loc
    p = cylinder(name + '_pole', 0.16, h, (x, y, z), seg=4, mat=pole or M['steel'])
    f = prism_from_outline(name, [(0, 0), (size * 1.5, size * 0.5), (0, size)], 0.12, center=(x + 0.15, y, z + h - size - 0.2), mat=_p(col))
    return kit.join([p, f], name)


def _tree(name, loc, r, h, col='#4f7f34', seed=1):
    """neem / peepal: trunk + two low-poly canopy blobs"""
    x, y, z = loc
    parts = [cylinder(name + '_t', r * 0.12, h * 0.55, (x, y, z), seg=5, mat=_p('#6a5440', 'w_bark'), r2=r * 0.08)]
    for i, (dx, dy, dz, k) in enumerate(((0, 0, h * 0.62, 1.0), (r * 0.45, -r * 0.2, h * 0.5, 0.7))):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        for v in bm.verts:
            j = math.sin((v.co.x * 3.1 + v.co.y * 1.7 + v.co.z * 2.3 + seed + i) * 2.0) * 0.12
            v.co.x *= r * k * (1 + j)
            v.co.y *= r * k * (1 - j)
            v.co.z *= r * k * 0.62
        bmesh.ops.translate(bm, vec=(x + dx, y + dy, z + dz), verts=bm.verts)
        parts.append(kit.obj_from_bm(bm, name + '_c', _p(col, 'w_leaf_' + col.strip('#'), grime=0.2)))
    return kit.join(parts, name)


# =========================================================================== generated images
def _img(name, W, H, paint):
    """small generated sRGB image: paint(a) fills a numpy (H, W, 4) array, row 0 = bottom"""
    img = bpy.data.images.new(name, W, H, alpha=False)
    a = np.ones((H, W, 4), dtype=np.float32)
    paint(a)
    img.pixels.foreach_set(a.ravel())
    img.update()
    return img


def _rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def _stripe_img(name, c1, c2, n=2):
    def p(a):
        W = a.shape[1]
        for i in range(n):
            a[:, i * W // n:(i + 1) * W // n, :3] = _rgb(c1 if i % 2 == 0 else c2)
    return _img(name, 32, 8, p)


def _niche_img(name, base, niche, trim):
    """one gopuram / vimana tier module: a coloured field, an arched niche, cornice lines"""
    def p(a):
        H, W = a.shape[:2]
        a[:, :, :3] = _rgb(base)
        yy, xx = np.mgrid[0:H, 0:W]
        cx = (W - 1) / 2
        hw = W * 0.2
        body = (np.abs(xx - cx) <= hw) & (yy >= H * 0.18) & (yy <= H * 0.62)
        top = ((xx - cx) ** 2 / (hw * hw) + (yy - H * 0.62) ** 2 / ((H * 0.16) ** 2)) <= 1.0
        m = body | top
        a[m, :3] = _rgb(niche)
        inner = (np.abs(xx - cx) <= hw * 0.5) & (yy >= H * 0.22) & (yy <= H * 0.6)
        a[inner, :3] = [c * 0.55 for c in _rgb(niche)]
        a[(yy < H * 0.1), :3] = _rgb(trim)
        a[(yy >= H * 0.88), :3] = _rgb(trim)
        side = (np.abs(xx - cx) > W * 0.44)
        a[side & (yy >= H * 0.1) & (yy < H * 0.88), :3] = [c * 0.85 for c in _rgb(base)]
    return _img(name, 32, 32, p)


def _tex_box(name, size, loc, img, side_mat, tile=None, base=True, faces='all'):
    """box whose vertical faces carry img through SignUV (tile=(tu, tv) world units per image
    repeat; None = the image stretched once over each face). faces='front' paints -Y only."""
    sx, sy, sz = size
    sm = kit.sign_material(img)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    suv = bm.loops.layers.uv.new('SignUV')
    bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        vert = abs(n.z) < 0.5 and (faces == 'all' or n.y < -0.9 or (faces == 'fb' and abs(n.y) > 0.9))
        f.material_index = 0 if vert else 1
        for lp in f.loops:
            co = lp.vert.co
            if not vert:
                lp[suv].uv = (0.02, 0.02)
                continue
            if abs(n.y) > abs(n.x):
                s, span = (co.x if n.y < 0 else -co.x), sx
            else:
                s, span = (co.y if n.x > 0 else -co.y), sy
            if tile:
                lp[suv].uv = ((s + span / 2) / tile[0], (co.z + sz / 2) / tile[1])
            else:
                lp[suv].uv = (s / span + 0.5, co.z / sz + 0.5)
    x, y, z = loc
    bmesh.ops.translate(bm, vec=(x, y, z + (sz / 2 if base else 0)), verts=bm.verts)
    ob = kit.obj_from_bm(bm, name, sm)
    ob.data.materials.append(side_mat)
    return ob


def _compound(name, W, D, h, t, gate_w, mat, img=None, tile=None, cap=None, back=True):
    """perimeter wall round W x D (centred) with a gate gap gate_w in the front (-Y) side"""
    segs = []
    fw = (W - gate_w) / 2
    for s in (-1, 1):
        segs.append(((s * (gate_w / 2 + fw / 2), -D / 2 + t / 2), (fw, t)))
        segs.append(((s * (W / 2 - t / 2), 0), (t, D - 2 * t)))
    if back:
        segs.append(((0, D / 2 - t / 2), (W, t)))
    out = []
    for (cx, cy), (sx, sy) in segs:
        if img is not None:
            out.append(_tex_box(name, (sx, sy, h), (cx, cy, 0), img, mat, tile=tile))
        else:
            out.append(box(name, (sx, sy, h), (cx, cy, 0), mat, base=True))
        if cap is not None:
            out.append(box(name + '_cap', (sx + 0.3, sy + 0.3, 0.4), (cx, cy, h), cap, base=True))
    return kit.join(out, name)


# =========================================================================== temple pieces
def _vimana(name, loc, w, z0, h, cols, M, tiers=3, cap='dome', img=None):
    """Dravidian vimana over a sanctum: stepped tiers with ledges, a dome / octagonal cap + kalash"""
    x, y, _ = loc
    out = []
    th = h * 0.68 / tiers
    ww, zz = w, z0
    for t in range(tiers):
        c = cols[t % len(cols)]
        if img is not None:
            out.append(_tex_box(name, (ww, ww, th), (x, y, zz), img[t % len(img)], _p(c), tile=(th, th)))
        else:
            out.append(box(name, (ww, ww, th), (x, y, zz), _p(c), base=True))
        out.append(box(name + '_l', (ww + 0.8, ww + 0.8, 0.6), (x, y, zz + th - 0.3), _p('#f4ede0', 'temple_white'), base=True))
        zz += th
        ww *= 0.74
    ch = h - (zz - z0) - h * 0.1
    seg = 8
    if cap == 'dome':
        prof = [(ww * 0.55, zz), (ww * 0.62, zz + ch * 0.25), (ww * 0.58, zz + ch * 0.55), (ww * 0.35, zz + ch * 0.85), (0.0, zz + ch)]
    else:
        prof = [(ww * 0.6, zz), (ww * 0.7, zz + ch * 0.4), (ww * 0.4, zz + ch * 0.85), (0.0, zz + ch)]
    out.append(lathe(name + '_cap', prof, seg=seg, mat=_p(cols[0]), loc=(x, y, 0)))
    out.append(_kalash(name + '_k', (x, y, zz + ch - 0.3), max(0.5, w * 0.06), M['gold']))
    return kit.join(out, name)


def _gopuram(name, loc, w, d, h, cols, M, tiers=4, door=True):
    """painted gopuram gateway: base block with a doorway, tapering painted tiers, barrel-vault top"""
    x, y, _ = loc
    white = _p('#f4ede0', 'temple_white')
    out = []
    bh = h * 0.28
    out.append(box(name + '_base', (w, d, bh), (x, y, 0), white, base=True))
    if door:
        dw = min(6.5, w * 0.4)
        out.append(_panel(name + '_door', _lancet(dw, min(bh - 1.5, 11), 'round'), _p('#3a2a20', 'door_dark'), (x, y - d / 2 - 0.05, 0)))
        out.append(_panel(name + '_doorb', _lancet(dw, min(bh - 1.5, 11), 'round'), _p('#3a2a20', 'door_dark'), (x, y + d / 2 + 0.05, 0), rz=math.pi))
    out.append(box(name + '_c0', (w + 1.0, d + 1.0, 0.8), (x, y, bh), white, base=True))
    th = (h * 0.62) / tiers
    ww, dd, zz = w * 0.92, d * 0.86, bh + 0.8
    imgs = [_niche_img('gop_%s_%d' % (name, i), cols[i % len(cols)], cols[(i + 2) % len(cols)], '#f4ede0') for i in range(min(tiers, len(cols)))]
    for t in range(tiers):
        out.append(_tex_box(name + '_t', (ww, dd, th), (x, y, zz), imgs[t % len(imgs)], _p(cols[t % len(cols)]), tile=(th * 0.9, th)))
        out.append(box(name + '_tl', (ww + 0.7, dd + 0.7, 0.5), (x, y, zz + th - 0.25), white, base=True))
        zz += th
        ww *= 0.84
        dd *= 0.8
    # barrel-vault crown (shala) along X with kalashas
    vr = dd * 0.62
    vault = prism_from_outline(name + '_v', [(-vr, 0)] + [(vr * math.cos(math.pi - math.pi * i / 6), vr * 1.15 * math.sin(math.pi * i / 6)) for i in range(7)][1:-1] + [(vr, 0)],
                               ww, axis='X', center=(x, y, zz + 0.2), mat=_p(cols[0]))
    out.append(vault)
    n = 3 if ww < 10 else 5
    for i in range(n):
        kx = x - ww * 0.36 + ww * 0.72 * i / (n - 1)
        out.append(_kalash(name + '_k', (kx, y, zz + vr * 1.1), 0.55, M['gold']))
    return kit.join(out, name)


# =========================================================================== 1. St Joseph's Cathedral
@kit.asset('st_josephs_cathedral', 'landmark', landmark='church_st_josephs', face='e', footprint=[70, 50], height=66.0,
           fit='footprint', floodlit=True)
def build_st_josephs(A):
    """St Joseph's Cathedral, Gunfoundry (1875; facade + twin towers 1891): cream Italianate facade
    with grey trim, twin bell towers with belfry stages, cupolas and crosses, a pediment, the main
    round-arched door with a plain statue niche above, tall arched windows, a clock on the left
    tower; nave with side aisles and an apse behind; compound wall and gate."""
    M = _pal()
    cream, grey, roof, dark, wood = M['cream'], M['grey'], M['slate'], M['dark'], M['door']
    M['marble'] = M['white']
    M['black'] = M['dark']
    P = []
    W, D = 70.0, 50.0
    fy = -14.0          # facade plane
    # compound wall + gate pillars with lamps
    P.append(_compound('sj_wall', W, D, 3.2, 0.8, 16.0, cream))
    for s in (-1, 1):
        P.append(box('sj_gp', (2.2, 2.2, 5.0), (s * 9.1, -D / 2 + 0.4, 0), cream, base=True))
        P.append(box('sj_gl', (1.0, 1.0, 1.0), (s * 9.1, -D / 2 + 0.4, 5.0), M['lamp'], base=True))
    # forecourt steps
    P.append(L.steps('sj_steps', 18.0, 1.4, 0.6, 2, (0, fy - 1.4, 0), grey))
    # nave + clerestory, side aisles, apse
    P.append(_gable('sj_nave', 20.0, 30.0, 26.0, 8.0, (0, 5.0, 0), cream))
    P.append(_roof('sj_nroof', 20.0, 30.0, 26.0, 8.0, (0, 5.0, 0), roof, over=0.8))
    for s in (-1, 1):
        P.append(box('sj_aisle', (6.0, 26.0, 14.0), (s * 13.0, 5.5, 0), cream, base=True))
        P.append(box('sj_aroof', (7.0, 27.0, 0.6), (s * 13.2, 5.5, 14.0), roof, base=True))
    P.append(cylinder('sj_apse', 8.5, 22.0, (0, 20.0, 0), seg=8, mat=cream))
    P.append(cylinder('sj_apr', 9.2, 7.0, (0, 20.0, 22.0), seg=8, mat=roof, r2=0.5))
    # side windows: aisle (round arched) + clerestory
    ys = [-2.0, 4.0, 10.0, 16.0]
    for s, rz in ((1, math.pi / 2), (-1, -math.pi / 2)):
        P.append(_wall_windows('sj_aw', dark, ys, 3.0, 2.4, 8.0, -16.06, rz=rz, kind='round'))
        P.append(_wall_windows('sj_cw', dark, ys, 16.5, 2.2, 7.0, -10.06, rz=rz, kind='round'))
    # central facade block + pediment
    P.append(box('sj_front', (16.0, 8.0, 30.0), (0, fy + 4.0, 0), cream, base=True))
    P.append(prism_from_outline('sj_ped', [(-8.6, 0), (8.6, 0), (0, 6.5)], 1.6, center=(0, fy + 0.6, 30.0), mat=cream))
    P.append(prism_from_outline('sj_pedc', [(-9.4, 0), (9.4, 0), (0, 7.1)], 1.0, center=(0, fy + 1.6, 29.8), mat=grey))
    P.append(_cross('sj_xp', 5.0, (0, fy + 1.0, 36.0), grey))
    # grey trim bands across the whole front
    for z, h in ((13.5, 1.0), (29.0, 1.2)):
        P.append(box('sj_band', (36.4, 0.8, h), (0, fy - 0.3, z), grey, base=True))
    P.append(box('sj_plinth', (36.4, 0.6, 1.4), (0, fy - 0.2, 0), grey, base=True))
    # door with grey surround, statue niche, arched windows, oculus
    P.append(_panel('sj_dsur', _lancet(9.0, 12.5, 'round', n=4), grey, (0, fy - 0.04, 0)))
    P.append(_panel('sj_door', _lancet(6.6, 11.0, 'round', n=4), wood, (0, fy - 0.08, 0)))
    P.append(_panel('sj_niche', _lancet(4.2, 9.0, 'round', n=4), grey, (0, fy - 0.04, 15.6)))
    fig = cylinder('sj_fig', 0.95, 5.6, (0, fy - 0.9, 16.6), seg=6, mat=M['marble'], r2=0.55)
    head = cylinder('sj_figh', 0.6, 1.1, (0, fy - 0.9, 22.2), seg=6, mat=M['marble'], r2=0.4)
    P += [fig, head]
    for s in (-1, 1):
        P.append(_panel('sj_fw', _lancet(2.6, 9.5, 'round'), dark, (s * 5.2, fy - 0.06, 3.2)))
        P.append(_panel('sj_fw2', _lancet(2.2, 6.5, 'round'), dark, (s * 4.6, fy - 0.06, 18.5)))
    P.append(_disc('sj_ocu', 1.8, 10, dark, (0, fy - 0.85, 32.6)))
    # twin towers
    for s in (-1, 1):
        tx = s * 13.0
        ty = fy + 4.0
        P.append(box('sj_tw', (10.0, 10.0, 34.0), (tx, ty - 0.6, 0), cream, base=True))
        P.append(box('sj_tc1', (11.0, 11.0, 1.2), (tx, ty - 0.6, 34.0), grey, base=True))
        P.append(box('sj_bel', (8.4, 8.4, 11.0), (tx, ty - 0.6, 35.2), cream, base=True))
        for k in range(4):
            rz = k * math.pi / 2
            o = _ngon('sj_bo', _lancet(3.2, 7.4, 'round', n=4), dark, y=-4.25)
            o = L.place(o, (0, 0, 36.6), rz)
            o.location = (tx, ty - 0.6, 0)
            kit.apply_transform(o)
            P.append(o)
        P.append(box('sj_tc2', (9.4, 9.4, 1.0), (tx, ty - 0.6, 46.2), grey, base=True))
        P.append(cylinder('sj_drum', 3.6, 3.4, (tx, ty - 0.6, 47.2), seg=8, mat=cream))
        P.append(L.dome('sj_dome', 3.9, 5.0, 50.6, roof, seg=8, loc=(tx, ty - 0.6), kind='hemi', n=4))
        P.append(cylinder('sj_lan', 0.9, 2.2, (tx, ty - 0.6, 55.4), seg=6, mat=grey))
        P.append(_cross('sj_x', 7.6, (tx, ty - 0.6, 57.4), grey, w=3.6, t=0.5))
        # tall arched windows on the tower fronts
        P.append(_panel('sj_tw1', _lancet(2.4, 9.0, 'round'), dark, (tx, ty - 5.66, 3.5)))
        P.append(_panel('sj_tw2', _lancet(2.2, 7.0, 'round'), dark, (tx, ty - 5.66, 17.0)))
    # clock on the left tower
    cx, cy = -13.0, fy + 4.0 - 5.7
    P.append(_disc('sj_clk', 2.2, 12, M['marble'], (cx, cy - 0.05, 29.0)))
    P.append(_panel('sj_hands', [(-0.15, 0), (0.15, 0), (0.15, 1.5), (1.7, 1.5), (1.7, 1.8), (-0.15, 1.8)], M['dark'], (cx, cy - 0.1, 27.4)))
    _finish(A, P, size=512)
    L.col_box('sj', (36, 38, 30), (0, 3, 0))
    L.shots(A, az=-35, el=12)
