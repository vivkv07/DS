"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

CIVIC CENTRE group: the (A.P.) Legislative Assembly, Jubilee Hall and the State Museum in Public
Gardens, Lal Bahadur Stadium (variants quiet / match), Mozamjahi Market and the Karachi Bakery
frontage, and the two stations (Nampally = Hyderabad Deccan, Kachiguda).
Budget style: low-poly masses; windows / arches are single flat n-gon panels laid 0.06 u proud of
the walls (a few tris each) instead of booleans; parapets are one extruded crenellation strip per
side; detail and dirt come from the baked atlas (L.finish, 512).
"""
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
import kit
import _lmkit as L
from kit import box, cylinder, lathe, arch_outline, prism_from_outline

PI = math.pi
EPS = 0.07


# =========================================================================== private helpers
def _face(name, pts, mat):
    """one flat polygon from 3D points (counter-clockwise seen from the front side)"""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)
    return kit.obj_from_bm(bm, name, mat)


def _xform(ob, rz=0.0, loc=(0, 0, 0)):
    ob.matrix_world = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, 'Z') @ ob.matrix_world
    kit.apply_transform(ob)
    return ob


def _outline(kind, w, h, spring=None, n=4):
    """2D opening outline (x, z), base at z = 0, clockwise from the bottom-left (arch_outline order)"""
    if kind == 'rect':
        return [(-w / 2, 0), (-w / 2, h), (w / 2, h), (w / 2, 0)]
    sp = spring if spring is not None else h - w * 0.55
    return arch_outline(w, sp, h - sp, kind, n=n)


def panel(name, kind, w, h, x, z, mat, y=0.0, n=4, spring=None):
    """flat opening panel facing -Y at (x, y - EPS, z)"""
    ol = _outline(kind, w, h, spring, n)
    pts = [(x + px, y - EPS, z + pz) for (px, pz) in reversed(ol)]
    return _face(name, pts, mat)


def row(name, kind, length, count, w, h, z, mat, y=0.0, skip=(), n=4, spring=None, x0=0.0):
    """count evenly spaced opening panels along X (centred on x0) at plane y"""
    out = []
    step = length / count
    for i in range(count):
        if i in skip:
            continue
        x = x0 - length / 2 + step * (i + 0.5)
        out.append(panel(name, kind, w, h, x, z, mat, y, n, spring))
    return kit.join(out, name) if out else None


def rect_rows(name, cx, cy, W, D, rows, mat, sides='fblr'):
    """opening rows on the four faces of a W x D block centred at (cx, cy).
    rows: [(kind, w, h, z, pitch), ...] (count per face = length / pitch)."""
    out = []
    for s, rz, length, half in (('f', 0.0, W, D / 2), ('r', PI / 2, D, W / 2), ('b', PI, W, D / 2), ('l', -PI / 2, D, W / 2)):
        if s not in sides:
            continue
        for (kind, w, h, z, pitch) in rows:
            c = max(1, int(round(length / pitch)))
            o = row(name, kind, length - 2.0, c, w, h, z, mat, y=-half)
            if o:
                out.append(_xform(o, rz, (cx, cy, 0)))
    return out


def crenel(name, length, z, h, depth, n, mat, kind='block', tooth=0.5):
    """parapet strip along X centred on the origin, base at z: n teeth (block / pointed / leaf)"""
    step = length / n
    pts = [(-length / 2, 0.0)]
    for i in range(n):
        a = -length / 2 + step * i
        tw = step * tooth
        x0 = a + (step - tw) / 2
        x1 = x0 + tw
        pts.append((x0, h * 0.45))
        if kind == 'block':
            pts += [(x0, h), (x1, h)]
        else:
            pts += [(x0, h * 0.75), ((x0 + x1) / 2, h * 1.15), (x1, h * 0.75)]
        pts.append((x1, h * 0.45))
    pts.append((length / 2, h * 0.45))
    pts.append((length / 2, 0.0))
    # outline must be simple: insert the low run between teeth
    out = [pts[0]]
    for p in pts[1:]:
        out.append(p)
    ol = [(x, zz) for (x, zz) in out]
    return prism_from_outline(name, ol, depth, center=(0, 0, z), mat=mat)


def rect_crenel(name, cx, cy, W, D, z, h, depth, pitch, mat, kind='block', sides='fblr'):
    out = []
    for s, rz, length, half in (('f', 0.0, W, D / 2), ('r', PI / 2, D, W / 2), ('b', PI, W, D / 2), ('l', -PI / 2, D, W / 2)):
        if s not in sides:
            continue
        o = crenel(name, length + depth, z, h, depth, max(2, int(round(length / pitch))), mat, kind)
        _xform(o, 0, (0, -half + depth / 2, 0))
        out.append(_xform(o, rz, (cx, cy, 0)))
    return out


def chajja(name, cx, cy, W, D, z, out, th, mat, sides='fblr'):
    """projecting thin eave (sunshade) round a block (one slab per side)"""
    res = []
    for s, rz, length, half in (('f', 0.0, W, D / 2), ('r', PI / 2, D, W / 2), ('b', PI, W, D / 2), ('l', -PI / 2, D, W / 2)):
        if s not in sides:
            continue
        o = box(name, (length + 2 * out, out, th), (0, -half - out / 2, z), mat, base=True)
        res.append(_xform(o, rz, (cx, cy, 0)))
    return res


def blk(name, cx, cy, W, D, z0, z1, mat):
    """an open-bottom block (no hidden base face)"""
    o = box(name, (W, D, z1 - z0), (cx, cy, z0), mat, base=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    return o


def onion(name, r, h, z, mat, seg=12, loc=(0, 0), n=7, fin=None, neck=0.9, bulge=1.12):
    prof = kit.onion_profile(r, h, neck=neck, bulge=bulge, tip=0.08, n=n, base_z=z)
    d = lathe(name, prof, seg=seg, mat=mat, loc=(loc[0], loc[1], 0), close_bottom=False)
    if fin is not None:
        d = kit.join([d, lathe(name + '_f', [(r * 0.1, z + h * 1.3), (r * 0.06, z + h * 1.55), (0.0, z + h * 1.75)], seg=4, mat=fin, loc=(loc[0], loc[1], 0), close_bottom=False)], name)
    return d


def hemi(name, r, h, z, mat, seg=12, loc=(0, 0), n=5, point=0.0):
    prof = [(r * math.cos(a), z + h * math.sin(a)) for a in [PI / 2 * i / n for i in range(n)]]
    prof.append((0.0, z + h + point))
    return lathe(name, prof, seg=seg, mat=mat, loc=(loc[0], loc[1], 0), close_bottom=False)


def chhatri(name, x, y, z, r, mat, dmat=None, h=None, seg=6, posts=4, n=3):
    """open kiosk: four posts, an overhanging eave and a small dome (~110 tris at seg 6)"""
    h = h or r * 1.5
    parts = []
    for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))[:posts]:
        parts.append(blk(name + '_p', x + sx * 0.8 * r, y + sy * 0.8 * r, 0.35 * r, 0.35 * r, z, z + h, mat))
    parts.append(cylinder(name + '_e', 1.4 * r, 0.45, (x, y, z + h), seg=seg, mat=mat, r2=1.15 * r))
    parts.append(onion(name + '_d', r, r * 1.3, z + 0.45 + h, dmat or mat, seg=seg, loc=(x, y), n=n))
    parts.append(cylinder(name + '_core', 0.55 * r, h, (x, y, z), seg=seg, mat=_CORE[0] or mat))
    return kit.join(parts, name)


_CORE = [None]


def chhatri_lo(name, x, y, z, r, h=None, seg=6):
    """shell of chhatri(): drum round the posts, the eave, the onion"""
    h = h or r * 1.5
    zd = z + 0.45 + h
    prof = [(0.98 * r, z), (0.98 * r, z + h), (1.42 * r, z + h), (1.17 * r, z + h + 0.5), (r * 1.0, zd + 0.1), (r * 1.15, zd + r * 0.4),
            (r * 0.75, zd + r * 0.95), (0.0, zd + r * 1.75)]
    return lathe(name, prof, seg=seg, loc=(x, y, 0), close_bottom=False)


def drum_dome(name, x, y, z, r, drum_h, dome_h, mat, dmat=None, seg=16, kind='onion', fin=None, n=8):
    parts = [cylinder(name + '_dr', r, drum_h, (x, y, z), seg=seg, mat=mat, cap=False),
             cylinder(name + '_rim', r * 1.12, 0.6, (x, y, z + drum_h), seg=seg, mat=mat)]
    if kind == 'onion':
        parts.append(onion(name + '_d', r, dome_h, z + drum_h + 0.6, dmat or mat, seg=seg, loc=(x, y), n=n, fin=fin))
    else:
        parts.append(hemi(name + '_d', r * 1.02, dome_h, z + drum_h + 0.6, dmat or mat, seg=seg, loc=(x, y), n=n // 2 + 1, point=dome_h * 0.15))
    return kit.join(parts, name)


def img_quad(name, img, w, h, loc, mat=None, rz=0.0):
    """a single quad facing -Y painted with a bpy image (through 'SignUV'); bakes into the atlas"""
    sm = mat or kit.sign_material(img)
    bm = bmesh.new()
    suv = bm.loops.layers.uv.new('SignUV')
    bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[suv].uv = uv
    ob = kit.obj_from_bm(bm, name, sm)
    return _xform(ob, rz, loc)


def np_image(name, arr):
    """bpy image from a float array (H, W, 4) in linear colour, row 0 = bottom"""
    import numpy as np
    H, W = arr.shape[:2]
    img = bpy.data.images.new(name, W, H, alpha=False, float_buffer=False)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    import os
    p = os.path.join(kit.TMP_DIR, name + '.png')
    img.filepath_raw = p
    img.file_format = 'PNG'
    img.save()
    return img


def tri_report(tag, parts):
    """debug: tris per part-name prefix (env CIVIC_DEBUG=1)"""
    import os
    if not os.environ.get('CIVIC_DEBUG'):
        return
    agg = {}
    for o in parts:
        if o is None or o.type != 'MESH':
            continue
        n = o.name.split('.')[0]
        t = sum(len(p.vertices) - 2 for p in o.data.polygons)
        agg[n] = agg.get(n, 0) + t
    tot = sum(agg.values())
    print('[civic] %s total %d :: %s' % (tag, tot, ', '.join('%s=%d' % kv for kv in sorted(agg.items(), key=lambda kv: -kv[1]))))


# =========================================================================== painted facades
def _rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


class Fac:
    """A facade painter: draws openings / bands / mouldings (in world units, x from the left edge
    as seen from the front, z up from the bottom) into an image that `fbox` maps onto a wall.
    The image (sRGB) is baked into the asset atlas, so all this detail costs no triangles."""

    def __init__(self, w, h, bg, ppu=5.0, noise=0.012, seed=1):
        import numpy as np
        self.np = np
        self.w, self.h, self.ppu = float(w), float(h), ppu
        self.W = max(8, min(1024, int(round(w * ppu))))
        self.H = max(8, min(1024, int(round(h * ppu))))
        self.sx = self.W / self.w
        self.sz = self.H / self.h
        self.a = np.ones((self.H, self.W, 4), dtype=np.float32)
        self.a[..., :3] = _rgb(bg)
        if noise:
            rng = np.random.default_rng(seed)
            n = rng.random((self.H // 4 + 1, self.W // 4 + 1)).repeat(4, 0).repeat(4, 1)[:self.H, :self.W]
            self.a[..., :3] *= (1.0 + (n[..., None] - 0.5) * noise * 2)
        zz, xx = np.mgrid[0:self.H, 0:self.W]
        self.X = (xx + 0.5) / self.sx
        self.Z = (zz + 0.5) / self.sz

    def _put(self, m, col, alpha=1.0):
        c = self.np.array(_rgb(col), dtype=self.np.float32)
        self.a[m, :3] = self.a[m, :3] * (1 - alpha) + c * alpha

    def rect(self, x0, z0, x1, z1, col, alpha=1.0):
        m = (self.X >= x0) & (self.X <= x1) & (self.Z >= z0) & (self.Z <= z1)
        self._put(m, col, alpha)
        return self

    def band(self, z0, z1, col, alpha=1.0):
        return self.rect(-1, z0, self.w + 1, z1, col, alpha)

    def _arch_mask(self, cx, z0, w, h, kind='pointed', spring=None):
        np = self.np
        X, Z = self.X - cx, self.Z - z0
        half = w / 2.0
        if kind == 'rect':
            return (np.abs(X) <= half) & (Z >= 0) & (Z <= h)
        sp = spring if spring is not None else (h - half if kind == 'round' else h - w * 0.62)
        sp = max(0.0, sp)
        rise = h - sp
        jamb = (np.abs(X) <= half) & (Z >= 0) & (Z <= sp)
        if kind == 'round':
            top = ((X / half) ** 2 + ((Z - sp) / max(rise, 1e-3)) ** 2 <= 1.0) & (Z >= sp)
        else:
            rise = max(rise, half * 1.001)
            R = (half * half + rise * rise) / (2 * half)
            c = R - half
            top = ((X - c) ** 2 + (Z - sp) ** 2 <= R * R) & ((X + c) ** 2 + (Z - sp) ** 2 <= R * R) & (Z >= sp)
            if kind == 'cusped':
                ang = np.arctan2(Z - sp, X)
                lobe = np.abs(np.sin(ang * 3.0))
                r = np.hypot(X, Z - sp)
                top &= ~((r > half * 0.75) & (lobe < 0.35) & (Z < sp + rise * 0.7))
        return jamb | top

    def arch(self, cx, z0, w, h, col, kind='pointed', frame=None, fw=0.45, spring=None, sill=None, shade=True):
        if frame:
            sp = spring + fw if spring is not None else None
            self._put(self._arch_mask(cx, z0 - fw * 0.6, w + 2 * fw, h + fw * 1.6, kind, sp), frame)
        m = self._arch_mask(cx, z0, w, h, kind, spring)
        self._put(m, col)
        if shade:   # a darker top inside the opening (depth cue)
            sh = m & (self.Z > z0 + h * 0.55)
            self._put(sh, '#000000', 0.25)
        if sill:
            self.rect(cx - w / 2 - 0.4, z0 - 0.45, cx + w / 2 + 0.4, z0, sill)
        return self

    def arches(self, n, z0, w, h, col, x0=0.0, x1=None, kind='pointed', frame=None, fw=0.45, skip=(), spring=None, sill=None, shade=True):
        x1 = self.w if x1 is None else x1
        step = (x1 - x0) / n
        for i in range(n):
            if i in skip:
                continue
            self.arch(x0 + step * (i + 0.5), z0, w, h, col, kind, frame, fw, spring, sill, shade)
        return self

    def pilasters(self, n, w, col, x0=0.0, x1=None, z0=0, z1=None):
        x1 = self.w if x1 is None else x1
        z1 = self.h if z1 is None else z1
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            self.rect(x - w / 2, z0, x + w / 2, z1, col)
        return self

    def dirt(self, h=2.0, col='#6a5a48', alpha=0.35):
        """ground splash / rain streak darkening at the bottom"""
        np = self.np
        f = np.clip(1.0 - self.Z / max(h, 1e-3), 0, 1) * alpha
        c = np.array(_rgb(col), dtype=np.float32)
        self.a[..., :3] = self.a[..., :3] * (1 - f[..., None]) + c * f[..., None]
        return self

    def image(self, name):
        return np_image(name, self.a)


_FACE = {  # side: (outward normal, u axis as seen from outside)
    'f': ((0, -1, 0), (1, 0, 0)), 'r': ((1, 0, 0), (0, 1, 0)),
    'b': ((0, 1, 0), (-1, 0, 0)), 'l': ((-1, 0, 0), (0, -1, 0)),
}


def fbox(name, cx, cy, W, D, z0, z1, mat, faces=None, top=True, top_mat=None, grime=0.12):
    """Box W x D from z0 to z1 (no bottom face) whose side faces carry painted images.
    faces: {'f'|'r'|'b'|'l': Fac or bpy image or material}. Sides not listed use `mat`."""
    faces = faces or {}
    bm = bmesh.new()
    suv = bm.loops.layers.uv.new('SignUV')
    bm.loops.layers.uv.new('UVMap')
    mats = [mat]
    hw, hd = W / 2.0, D / 2.0
    for s, (n, u) in _FACE.items():
        n, u = Vector(n), Vector(u)
        half = hd if abs(n.y) > 0.5 else hw
        lw = hw if abs(n.y) > 0.5 else hd
        c = Vector((cx, cy, 0)) + n * half
        q = [c - u * lw + Vector((0, 0, z0)), c + u * lw + Vector((0, 0, z0)), c + u * lw + Vector((0, 0, z1)), c - u * lw + Vector((0, 0, z1))]
        f = bm.faces.new([bm.verts.new(p) for p in q])
        spec = faces.get(s)
        mi = 0
        if spec is not None:
            if isinstance(spec, Fac):
                spec = spec.image('%s_%s_%s' % (_ASSET[0], name, s))
            if isinstance(spec, bpy.types.Image):
                spec = kit.sign_material(spec, grime=grime)
            if spec not in mats:
                mats.append(spec)
            mi = mats.index(spec)
        f.material_index = mi
        for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            l[suv].uv = uv
    if top:
        q = [(cx - hw, cy - hd, z1), (cx + hw, cy - hd, z1), (cx + hw, cy + hd, z1), (cx - hw, cy + hd, z1)]
        f = bm.faces.new([bm.verts.new(p) for p in q])
        tm = top_mat or mat
        if tm not in mats:
            mats.append(tm)
        f.material_index = mats.index(tm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    ob = kit.obj_from_bm(bm, name, mats[0])
    for m in mats[1:]:
        ob.data.materials.append(m)
    return ob


_ASSET = ['x']


def sign(name, text, w, h, loc, fg, bg, rz=0.0, px=256, depth=0.2):
    return L.sign_panel(name, text, w, h, loc, fg=fg, bg=bg, px=px, rot_z=rz, depth=depth)


def teeth(name, length, z, h, pitch, mat, kind='block', fill=0.55, two=True):
    """parapet teeth along X centred on the origin at y = 0 (flat faces: front [+ back])"""
    n = max(1, int(round(length / pitch)))
    step = length / n
    tw = step * fill
    out = []
    for i in range(n):
        x = -length / 2 + step * (i + 0.5)
        if kind == 'block':
            ol = [(x - tw / 2, 0), (x + tw / 2, 0), (x + tw / 2, h), (x - tw / 2, h)]
        else:
            ol = [(x - tw / 2, 0), (x + tw / 2, 0), (x + tw / 2, h * 0.6), (x, h * 1.1), (x - tw / 2, h * 0.6)]
        out.append(_face(name, [(px, -EPS, z + pz) for (px, pz) in ol], mat))
        if two:
            out.append(_face(name, [(px, EPS, z + pz) for (px, pz) in reversed(ol)], mat))
    return kit.join(out, name)


def rect_teeth(name, cx, cy, W, D, z, h, pitch, mat, kind='block', sides='fblr', two=True):
    out = []
    for s, rz, length, half in (('f', 0.0, W, D / 2), ('r', PI / 2, D, W / 2), ('b', PI, W, D / 2), ('l', -PI / 2, D, W / 2)):
        if s not in sides:
            continue
        o = teeth(name, length, z, h, pitch, mat, kind, two=two)
        _xform(o, 0, (0, -half, 0))
        out.append(_xform(o, rz, (cx, cy, 0)))
    return out


def ppaint(base, name):
    """plain painted surface (same roughness everywhere: keeps the atlas free of an ORM map)"""
    return L.paint(base, name, key='whitewash')


# =========================================================================== 1. Legislative Assembly
@kit.asset('assembly', 'landmark', draw='assembly', face='e', footprint=[70, 66], height=60.0, fit='footprint', floodlit=True)
def build_assembly(A):
    """The 1913 Town Hall (A.P. Legislative Assembly), Public Gardens: white Indo-Saracenic /
    Rajasthani palace; tall central entrance block with the big dome, corner towers with chhatris,
    arched verandahs, jharokha balconies, crenellated parapets."""
    _ASSET[0] = A.id
    WALL, TRIM, DARK, GLZ, BAND = '#f5f2ea', '#fdfcf8', '#2f2a27', '#46525a', '#e2dccf'
    W = ppaint(WALL, 'asm_wall')
    T = ppaint(TRIM, 'asm_trim')
    ST = ppaint('#b4ada2', 'asm_stone')
    GO = ppaint('#c9a24a', 'asm_gold')
    P = []
    TOP = 28.0
    Z0 = 1.2

    def storeys(f, n_lo, n_hi, x0=0.0, x1=None, lo=('cusped', 2.8, 7.0), hi=('cusped', 2.6, 6.0), cols=True):
        f.dirt(2.5)
        f.band(12.6 - Z0, 13.4 - Z0, BAND).band(13.4 - Z0, 13.9 - Z0, '#9d968a', 0.5)
        f.band(f.h - 1.0, f.h, BAND)
        if cols:
            f.pilasters(n_lo, 0.7, TRIM, x0, x1)
        f.arches(n_lo, 2.2, lo[1], lo[2], GLZ, x0, x1, kind=lo[0], frame=TRIM, sill=BAND)
        f.arches(n_hi, 15.5 - Z0, hi[1], hi[2], GLZ, x0, x1, kind=hi[0], frame=TRIM, sill=BAND)
        return f

    # plinth + steps
    P.append(blk('plinth', 0, 1, 70, 64, 0, Z0, ST))
    P.append(blk('step1', 0, -32.0, 16, 2.0, 0, 0.8, ST))
    # main block
    hM = TOP - Z0
    P.append(fbox('main', 0, 6, 54, 48, Z0, TOP, W, faces={
        'r': storeys(Fac(48, hM, WALL, seed=2), 8, 8), 'l': storeys(Fac(48, hM, WALL, seed=3), 8, 8),
        'b': storeys(Fac(54, hM, WALL, seed=4), 9, 9)}))
    # verandah wings: deep open arcades (dark behind white arches) on two floors
    for sx in (-1, 1):
        f = Fac(13, TOP - 1 - Z0, WALL, seed=5)
        f.dirt(2.0).band(11.6, 13.0, BAND)
        f.arches(3, 0.0, 3.4, 10.0, DARK, kind='cusped', frame=TRIM, fw=0.5)
        f.arches(3, 13.0, 3.0, 8.5, DARK, kind='cusped', frame=TRIM, fw=0.45)
        f.rect(0, 13.0, 13, 14.2, '#c8c0b0')   # first-floor balustrade line
        f.band(f.h - 1.2, f.h, BAND)
        P.append(fbox('ver', sx * 17.5, -21, 13, 6, Z0, TOP - 1, W, faces={'f': f}))
    P += rect_teeth('vt', -17.5, -21, 13, 6, TOP - 1, 1.8, 2.2, T, 'pointed', sides='f', two=False)
    P += rect_teeth('vt', 17.5, -21, 13, 6, TOP - 1, 1.8, 2.2, T, 'pointed', sides='f', two=False)
    P.append(box('ver_chj', (50, 1.6, 0.35), (0, -24.6, 12.4), T, base=True))
    # corner towers (square, two floors + a balcony storey) with chhatris
    TT = TOP + 6
    for sx in (-1, 1):
        for cy in (-21.0, 24.0):
            fs = {}
            for side in 'fblr':
                f = Fac(12, TT - Z0, WALL, seed=7)
                f.dirt(2.5).band(12.6 - Z0, 13.6 - Z0, BAND).band(TT - Z0 - 6.5, TT - Z0 - 5.6, BAND)
                f.arch(6, 2.2, 3.0, 7.5, GLZ, 'cusped', frame=TRIM, sill=BAND)
                f.arch(6, 15.3 - Z0, 2.8, 6.5, GLZ, 'cusped', frame=TRIM, sill=BAND)
                f.arches(3, TT - Z0 - 5.0, 1.8, 3.8, DARK, 1.5, 10.5, kind='cusped', frame=TRIM, fw=0.3)
                f.band(f.h - 0.8, f.h, BAND)
                fs[side] = f
            P.append(fbox('tower', sx * 29, cy, 12, 12, Z0, TT, W, faces=fs))
            P += rect_teeth('tt', sx * 29, cy, 12, 12, TT, 1.6, 2.4, T, 'pointed', sides=('f' if cy < 0 else 'b') + ('l' if sx < 0 else 'r'), two=False)
            P.append(chhatri('tch', sx * 29, cy, TT, 2.8, T, seg=6))
    # central entrance block: the great cusped arch, jharokha above, parapet, the big dome
    hC = 38.0 - Z0
    f = Fac(22, hC, WALL, seed=9)
    f.dirt(2.5)
    f.rect(0, 0, 1.6, hC, TRIM).rect(20.4, 0, 22, hC, TRIM)
    f.arch(11, 0, 9.5, 17.5, DARK, 'cusped', frame=TRIM, fw=1.0)
    f.rect(5.5, 19.5, 16.5, 20.2, BAND)
    f.arch(4.6, 21.5, 2.6, 6, GLZ, 'cusped', frame=TRIM)
    f.arch(17.4, 21.5, 2.6, 6, GLZ, 'cusped', frame=TRIM)
    f.arches(5, 31.0, 1.8, 4.0, GLZ, 3, 19, kind='cusped', frame=TRIM, fw=0.3)
    f.band(hC - 1.2, hC, BAND)
    fs = storeys(Fac(20, hC, WALL, seed=10), 3, 3, cols=False)
    P.append(fbox('centre', 0, -21, 22, 20, Z0, 38.0, W, faces={'f': f, 'l': fs, 'r': fs}))
    P += rect_teeth('ct', 0, -21, 22, 20, 38.0, 2.2, 2.4, T, 'pointed', sides='flr', two=False)
    # jharokha: corbelled oriel with a curved (bangla-like) roof
    fj = Fac(8, 5.5, TRIM, noise=0.01)
    fj.arches(3, 0.6, 1.7, 4.2, DARK, kind='cusped', frame='#e8e2d4', fw=0.25).band(0, 0.5, BAND)
    P.append(fbox('jhar', 0, -32.2, 8, 2.4, 22.0, 27.5, T, faces={'f': fj}))
    P.append(cylinder('jh_corbel', 3.6, 1.6, (0, -32.2, 20.4), seg=4, mat=T, r2=4.6, cap=False))
    P.append(_xform(cylinder('jh_roof', 3.4, 1.8, (0, 0, 0), seg=4, mat=T, r2=0.8), PI / 4, (0, -32.2, 27.5)))
    # dome on a drum, pinnacles at the block corners
    P.append(drum_dome('bigdome', 0, -19, 38.0, 8.0, 4.0, 13.5, W, seg=12, fin=GO, n=5))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(cylinder('pin', 1.0, 4.5, (sx * 10, -21 + sy * 9, 38.0), seg=4, mat=T, r2=0.05))
    tri_report(A.id, P)
    # ---- the shell (hand-built: keeps the onion domes and chhatris round)
    lo = [blk('plinth_lo', 0, 1, 70.3, 64.3, 0, Z0 + 0.05, None),
          blk('main_lo', 0, 6, 54.2, 48.2, Z0, TOP + 0.05, None),
          blk('centre_lo', 0, -21, 22.3, 20.3, Z0, 38.0 + 1.1, None),
          blk('jhar_lo', 0, -32.3, 8.6, 2.8, 20.4, 28.6, None),
          kit.prism_from_outline('chajja_lo', [(-25.0, 12.4), (25.0, 12.4), (25.0, 12.8), (-25.0, 12.8)], 1.7, center=(0, -24.6, 0))]
    for sx in (-1, 1):
        lo.append(blk('ver_lo', sx * 17.5, -21, 13.2, 6.2, Z0, TOP - 1 + 0.9, None))
        for cy in (-21.0, 24.0):
            lo.append(blk('tower_lo', sx * 29, cy, 12.2, 12.2, Z0, TT + 0.8, None))
            lo.append(chhatri_lo('tch_lo', sx * 29, cy, TT, 2.8, seg=6))
    prof = [(rr + 0.15, zz) for (rr, zz) in kit.onion_profile(8.0, 13.5, neck=0.9, bulge=1.12, tip=0.08, n=5, base_z=38.0 + 4.0 + 0.6)]
    prof = [(8.15, 38.0), (8.15, 42.0), (9.1, 42.0), (9.1, 42.6)] + prof[:-1] + [(0.0, 42.6 + 13.5 * 1.75)]
    lo.append(lathe('dome_lo', prof, seg=12, loc=(0, -19, 0), close_bottom=False))
    for sx in (-1, 1):
        for sy in (-1, 1):
            lo.append(cylinder('pin_lo', 1.1, 4.6, (sx * 10, -21 + sy * 9, 38.0), seg=4, r2=0.05, cap=False))
    for o in lo:
        o.data.materials.clear()
    for o in L.finish_proxy(A, P, lo=lo, size=384, ao_samples=48, ao_strength=0.65):
        kit.smooth(o, 80)
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}, {'name': 'detail', 'view': {'az': -90, 'el': 3, 'fov': 30, 'target': (-29, -21, 34), 'dist': 60}}])


def _minaret(name, x, y, z0, h, r, mat, cap, seg=8):
    """slender octagonal turret with two rings and a small onion cap; returns (hi, lo)"""
    hi = [cylinder(name + '_s', r, h, (x, y, z0), seg=seg, mat=mat, r2=r * 0.85),
          cylinder(name + '_r1', r * 1.35, 0.5, (x, y, z0 + h * 0.45), seg=seg, mat=cap),
          cylinder(name + '_r2', r * 1.45, 0.6, (x, y, z0 + h), seg=seg, mat=cap)]
    hi.append(onion(name + '_d', r * 1.05, r * 1.6, z0 + h + 0.6, cap, seg=seg, loc=(x, y), n=5))
    lo = lathe(name + '_lo', [(r + 0.15, z0), (r * 0.9, z0 + h), (r * 1.45, z0 + h + 0.3), (r * 1.2, z0 + h + 0.9), (r * 1.25, z0 + h + 1.2),
                              (0.0, z0 + h + 0.6 + r * 1.6 * 1.35)], seg=6, loc=(x, y, 0), close_bottom=False)
    return hi, lo


def _dome_lo(name, x, y, z, r, drum_h, dome_h, seg=10):
    """shell of drum_dome() (onion kind)"""
    zb, h = z + drum_h + 0.6, dome_h
    prof = [(r + 0.15, z), (r + 0.15, z + drum_h), (r * 1.12 + 0.1, z + drum_h), (r * 1.12 + 0.1, zb), (r * 1.13 + 0.15, zb + 0.3 * h),
            (r * 0.95 + 0.15, zb + 0.6 * h), (r * 0.45 + 0.1, zb + 0.88 * h), (r * 0.12, zb + 1.05 * h), (0.0, zb + 1.75 * h)]
    return lathe(name, prof, seg=seg, loc=(x, y, 0), close_bottom=False)


# =========================================================================== 2. Jubilee Hall (Public Gardens)
@kit.asset('jubilee_hall', 'landmark', draw='jubilee_hall', face='e', footprint=[34, 48], height=33.0, fit='footprint', floodlit=True)
def build_jubilee_hall(A):
    """Jubilee Hall (1913), Public Gardens: a white single-storey Indo-Saracenic hall: arched
    front portico with a crenellated parapet, tall cusped-arch windows along the sides, slender
    corner turrets with small onion caps and a central onion dome on the roof."""
    _ASSET[0] = A.id
    WALL, TRIM, DARK, GLZ, BAND = '#f3eee3', '#fdfcf8', '#2f2a27', '#46525a', '#e0d9cb'
    W = ppaint(WALL, 'jh_wall')
    T = ppaint(TRIM, 'jh_trim')
    ST = ppaint('#b4ada2', 'jh_stone')
    GO = ppaint('#c9a24a', 'jh_gold')
    P, lo = [], []
    Z0, HT = 1.2, 17.0
    P.append(blk('plinth', 0, 0, 34, 48, 0, Z0, ST))
    P.append(blk('steps', 0, -24.6, 12, 1.4, 0, 0.7, ST))
    lo.append(blk('plinth_lo', 0, -0.4, 34.2, 48.8, 0, Z0 + 0.05, None))
    # the hall
    fs = {}
    for side, L_ in (('l', 40), ('r', 40), ('b', 26)):
        f = Fac(L_, HT - Z0, WALL, seed=3)
        f.dirt(2.0).band(1.0, 1.6, BAND).band(f.h - 1.4, f.h, BAND)
        f.pilasters(int(L_ / 5), 0.6, TRIM)
        f.arches(int(L_ / 5), 2.4, 2.4, 9.0, GLZ, kind='cusped', frame=TRIM, sill=BAND)
        fs[side] = f
    P.append(fbox('hall', 0, 2, 26, 40, Z0, HT, W, faces=fs))
    P += rect_teeth('ht', 0, 2, 26, 40, HT, 1.6, 2.0, T, 'pointed', two=False)
    lo.append(blk('hall_lo', 0, 2, 26.3, 40.3, Z0, HT + 1.0, None))
    # front portico: three great cusped arches (dark verandah behind), parapet with a raised centre
    f = Fac(22, 13.0 - Z0, WALL, seed=5)
    f.dirt(2.0).band(f.h - 1.0, f.h, BAND)
    f.arches(3, 0.0, 5.0, 9.4, DARK, kind='cusped', frame=TRIM, fw=0.6)
    f.pilasters(3, 0.8, TRIM, z1=10.4)
    P.append(fbox('portico', 0, -20.5, 22, 3.0, Z0, 13.0, W, faces={'f': f, 'l': Fac(3, 13.0 - Z0, WALL), 'r': Fac(3, 13.0 - Z0, WALL)}))
    P += rect_teeth('pt', 0, -20.5, 22, 3.0, 13.0, 1.5, 1.8, T, 'pointed', sides='f', two=False)
    fc = Fac(10, 3.4, WALL, seed=6)
    fc.rect(1.0, 0.6, 9.0, 2.8, TRIM).rect(2.0, 1.0, 8.0, 2.4, BAND)
    P.append(fbox('pt_raise', 0, -21.0, 10, 2.0, 13.0, 16.4, W, faces={'f': fc}))
    lo.append(blk('portico_lo', 0, -20.5, 22.3, 3.3, Z0, 14.4, None))
    lo.append(blk('pt_raise_lo', 0, -21.0, 10.3, 2.3, 14.4, 16.6, None))
    # corner turrets of the hall and the portico ends
    for (x, y, h) in ((-13, -18, 18.0), (13, -18, 18.0), (-13, 22, 18.0), (13, 22, 18.0), (-11.6, -21.6, 16.0), (11.6, -21.6, 16.0)):
        hi_, lo_ = _minaret('tur', x, y, Z0, h, 1.25 if h > 17 else 1.0, W, T)
        P += hi_
        lo.append(lo_)
    # central dome on a drum
    P.append(drum_dome('dome', 0, 2, HT, 6.0, 3.0, 8.0, W, seg=16, fin=GO, n=6))
    lo.append(_dome_lo('dome_lo', 0, 2, HT, 6.0, 3.0, 8.0, seg=8))
    tri_report(A.id, P)
    for o in L.finish_proxy(A, P, lo=lo, size=256, ao_samples=48, ao_strength=0.65):
        kit.smooth(o, 80)
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 3. State Museum (Public Gardens)
@kit.asset('state_museum', 'landmark', landmark='state_museum', face='n', footprint=[58, 40], height=36.0, fit='footprint', floodlit=True)
def build_state_museum(A):
    """A.P. State Archaeology Museum (1920s), Public Gardens: a cream two-storey Indo-Saracenic
    block with arcaded verandahs, a tall central pishtaq (great cusped arch) flanked by slender
    minarets with chhatri caps, end pavilions, merlon parapets and a central onion dome."""
    _ASSET[0] = A.id
    WALL, TRIM, DARK, GLZ, BAND = '#ead8a6', '#fbf4e2', '#2f2a27', '#46525a', '#d8c08a'
    W = ppaint(WALL, 'sm_wall')
    T = ppaint(TRIM, 'sm_trim')
    ST = ppaint('#b4ada2', 'sm_stone')
    GO = ppaint('#c9a24a', 'sm_gold')
    P, lo = [], []
    Z0, TOP = 1.5, 24.0
    P.append(blk('plinth', 0, 0, 58, 40, 0, Z0, ST))
    P.append(L.steps('steps', 12, 0.7, 0.5, 3, (0, -20.2, 0), ST))
    lo.append(blk('plinth_lo', 0, -0.6, 58.2, 41.4, 0, Z0 + 0.05, None))

    def facade(w, seed, n):
        f = Fac(w, TOP - Z0, WALL, seed=seed, noise=0.0)
        f.dirt(2.5).band(10.6, 11.6, BAND).band(f.h - 1.2, f.h, BAND)
        f.pilasters(n, 0.6, TRIM)
        f.arches(n, 1.4, w / n * 0.62, 8.2, DARK, kind='cusped', frame=TRIM, fw=0.4)
        f.arches(n, 12.6, w / n * 0.45, 6.6, GLZ, kind='cusped', frame=TRIM, sill=BAND)
        return f
    P.append(fbox('main', 0, 2, 40, 30, Z0, TOP, W, faces={'f': facade(40, 2, 8), 'l': facade(30, 4, 6), 'r': facade(30, 5, 6)}))
    P += rect_teeth('mt', 0, 2, 40, 30, TOP, 1.5, 2.0, T, 'pointed', two=False)
    lo.append(blk('main_lo', 0, 2, 40.3, 30.3, Z0, TOP + 0.9, None))
    # end pavilions (slightly projecting, taller) with chhatris
    for sx in (-1, 1):
        P.append(fbox('pav', sx * 24.5, 1, 9, 34, Z0, TOP + 3, W, faces={'f': facade(9, 6, 2), 'l' if sx < 0 else 'r': facade(34, 8, 7)}))
        P += rect_teeth('pvt', sx * 24.5, 1, 9, 34, TOP + 3, 1.5, 2.0, T, 'pointed', two=False)
        lo.append(blk('pav_lo', sx * 24.5, 1, 9.3, 34.3, Z0, TOP + 3.9, None))
        P.append(chhatri('pch', sx * 24.5, -12, TOP + 3, 2.4, T, seg=8))
        lo.append(chhatri_lo('pch_lo', sx * 24.5, -12, TOP + 3, 2.4, seg=6))
    # central pishtaq: the great cusped arch, jaali band above, flanked by minarets
    hp = 31.0
    f = Fac(18, hp - Z0, WALL, seed=9)
    f.dirt(2.5)
    f.rect(0, 0, 1.4, f.h, TRIM).rect(16.6, 0, 18, f.h, TRIM)
    f.arch(9, 0, 9.0, 18.0, DARK, 'cusped', frame=TRIM, fw=0.9)
    f.rect(3.0, 20.5, 15.0, 21.2, BAND)
    f.arches(5, 22.4, 1.6, 4.2, GLZ, 2.5, 15.5, kind='cusped', frame=TRIM, fw=0.3)
    f.band(f.h - 1.0, f.h, BAND)
    P.append(fbox('pishtaq', 0, -15.0, 18, 4.0, Z0, hp, W, faces={'f': f}))
    P += rect_teeth('pst', 0, -15.0, 18, 4.0, hp, 1.8, 1.8, T, 'pointed', sides='f', two=False)
    lo.append(blk('pishtaq_lo', 0, -15.0, 18.3, 4.3, Z0, hp + 1.1, None))
    for sx in (-1, 1):
        hi_, lo_ = _minaret('min', sx * 9.6, -16.8, Z0, 32.0, 1.2, W, T)
        P += hi_
        lo.append(lo_)
    # central dome behind the pishtaq
    P.append(drum_dome('dome', 0, 2, TOP, 6.0, 2.4, 7.0, W, seg=16, fin=GO, n=6))
    lo.append(_dome_lo('dome_lo', 0, 2, TOP, 6.0, 2.4, 7.0, seg=8))
    tri_report(A.id, P)
    for o in L.finish_proxy(A, P, lo=lo, size=256, ao_samples=48, ao_strength=0.65):
        kit.smooth(o, 80)
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


def _shed(name, cx, cy, W, D, h, P, lo, M):
    """platform shed behind a station: steel columns, a pitched tin roof; inside reads dark"""
    TIN = ppaint('#8c8a84', name + '_tin')
    COL = ppaint('#5b2a2a', name + '_col')
    DK = ppaint('#4f4943', name + '_dark')
    P.append(box(name + '_in', (W - 3.0, D - 3.0, h - 0.5), (cx, cy, 0.0), DK, base=True))
    n = max(2, int(W / 8))
    for i in range(n + 1):
        x = cx - W / 2 + 0.6 + (W - 1.2) * i / n
        for y in (cy - D / 2 + 0.6, cy + D / 2 - 0.6):
            P.append(box(name + '_c', (0.6, 0.6, h), (x, y, 0.0), COL, base=True))
    for y in (cy - D / 2 + 0.6, cy + D / 2 - 0.6):
        P.append(box(name + '_beam', (W, 0.7, 0.8), (cx, y, h - 0.8), COL, base=True))
    roof = prism_from_outline(name + '_roof', [(-D / 2 - 1.0, 0.0), (D / 2 + 1.0, 0.0), (0.0, 3.0)], W + 1.0, axis='X', mat=TIN)
    P.append(L.place(roof, (cx, cy, h)))
    lo.append(blk(name + '_lo', cx, cy, W + 0.2, D + 0.2, 0.0, h, None))
    lo.append(L.place(prism_from_outline(name + '_roof_lo', [(-D / 2 - 1.1, -0.1), (D / 2 + 1.1, -0.1), (0.0, 3.1)], W + 1.2, axis='X'), (cx, cy, h)))


# =========================================================================== 4. Nampally (Hyderabad Deccan) station
@kit.asset('nampally_station', 'landmark', landmark='nampally_station', face='w', footprint=[110, 50], height=45.0, fit='footprint')
def build_nampally_station(A):
    """Hyderabad Deccan (Nampally) station, 1907: long cream two-storey wings with maroon arched
    openings and bands, a taller central block with the great arched entrance, the yellow
    HYDERABAD name board above it, domed corner turrets, and the platform shed behind."""
    _ASSET[0] = A.id
    WALL, TRIM, MAR, DARK, BAND = '#ecdcb4', '#f6edd6', '#7a2e2a', '#2b2421', '#8a3a33'
    W = ppaint(WALL, 'np_wall')
    T = ppaint(TRIM, 'np_trim')
    MR = ppaint(MAR, 'np_maroon')
    ST = ppaint('#a9a49a', 'np_paving')
    P, lo = [], []
    Z0 = 0.8
    P.append(blk('forecourt', 0, 0, 110, 50, 0, Z0, ST))
    lo.append(blk('forecourt_lo', 0, 0, 110.2, 50.2, 0, Z0 + 0.05, None))
    # wings: arcaded verandah below, arched windows above, maroon bands and trims
    HW = 20.0

    def wing_face(w, seed, n):
        f = Fac(w, HW - Z0, WALL, seed=seed, noise=0.0)
        f.dirt(2.0, alpha=0.25).band(0.0, 0.8, BAND).band(8.6, 9.6, BAND).band(f.h - 1.4, f.h, BAND)
        f.pilasters(n, 0.7, TRIM)
        f.arches(n, 0.8, w / n * 0.6, 6.8, DARK, kind='round', frame=MAR, fw=0.45)
        f.arches(n, 10.8, w / n * 0.4, 5.2, DARK, kind='round', frame=MAR, fw=0.35, sill=TRIM)
        return f
    for sx in (-1, 1):
        cx = sx * 34.5
        P.append(fbox('wing', cx, -15.5, 41, 13, Z0, HW, W, faces={'f': wing_face(41, 2, 9), 'l' if sx < 0 else 'r': wing_face(13, 3, 3)}))
        P += rect_teeth('wt', cx, -15.5, 41, 13, HW, 1.2, 1.6, T, 'block', sides='f' + ('l' if sx < 0 else 'r'), two=False)
        lo.append(blk('wing_lo', cx, -15.5, 41.2, 13.2, Z0, HW + 0.6, None))
        # end pavilion, a little taller
        ex = sx * 50.0
        P.append(fbox('endp', ex, -16.0, 10, 14.4, Z0, HW + 4, W, faces={'f': wing_face(10, 4, 2), 'l' if sx < 0 else 'r': wing_face(14.4, 5, 3)}))
        P += rect_teeth('et', ex, -16.0, 10, 14.4, HW + 4, 1.4, 1.6, T, 'block', two=False)
        lo.append(blk('endp_lo', ex, -16.0, 10.2, 14.6, Z0, HW + 4.8, None))
    # central block: the great arched entrance, the name board, the clock gable
    HC = 29.0
    f = Fac(28, HC - Z0, WALL, seed=7, noise=0.0)
    f.dirt(2.0, alpha=0.25)
    f.rect(0, 0, 1.6, f.h, TRIM).rect(26.4, 0, 28, f.h, TRIM)
    f.arch(14, 0, 10.0, 13.5, DARK, 'round', frame=MAR, fw=1.0)
    f.arch(5.0, 0, 3.6, 7.0, DARK, 'round', frame=MAR, fw=0.5).arch(23.0, 0, 3.6, 7.0, DARK, 'round', frame=MAR, fw=0.5)
    f.band(14.8, 15.6, BAND).band(f.h - 1.4, f.h, BAND)
    f.arches(5, 21.6, 1.8, 4.0, DARK, 4.0, 24.0, kind='round', frame=MAR, fw=0.3)
    P.append(fbox('centre', 0, -16.5, 28, 17, Z0, HC, W, faces={'f': f, 'l': wing_face(17, 8, 3), 'r': wing_face(17, 9, 3)}))
    P += rect_teeth('ct', 0, -16.5, 28, 17, HC, 1.4, 1.6, T, 'block', sides='flr', two=False)
    lo.append(blk('centre_lo', 0, -16.5, 28.2, 17.2, Z0, HC + 0.6, None))
    P.append(sign('np_sign', 'HYDERABAD', 18.0, 3.4, (0, -25.15, 17.6), '#111111', '#f2c230', px=512, depth=0.3))
    P.append(box('porch_chajja', (16.0, 2.4, 0.5), (0, -26.0, 14.4), MR, base=True))
    lo.append(blk('porch_lo', 0, -25.6, 18.4, 1.8, 14.3, 21.4, None))
    # raised centre gable with a clock face
    P.append(fbox('gable', 0, -24.0, 10, 2.0, HC, HC + 5.0, W))
    clk = cylinder('clockf', 1.9, 0.3, (0, 0, 0), seg=16, mat=T, base=False)
    clk.rotation_euler = (PI / 2, 0, 0)
    clk.location = (0, -25.1, HC + 2.4)
    kit.apply_transform(clk)
    P.append(clk)
    P.append(box('clock_h', (0.2, 0.1, 1.4), (0, -25.3, HC + 2.3), ppaint('#202020', 'np_hand'), base=True))
    lo.append(blk('gable_lo', 0, -24.0, 10.2, 2.4, HC, HC + 5.1, None))
    # domed corner turrets of the central block
    for sx in (-1, 1):
        hi_, lo_ = _minaret('tur', sx * 14.0, -25.0, Z0, HC + 2.0, 1.4, W, MR)
        P += hi_
        lo.append(lo_)
    P.append(drum_dome('dome', 0, -14.0, HC, 5.0, 2.0, 6.0, W, dmat=MR, seg=16, n=6))
    lo.append(_dome_lo('dome_lo', 0, -14.0, HC, 5.0, 2.0, 6.0, seg=8))
    # platform shed behind
    _shed('shed', 0, 9.0, 104, 30, 9.0, P, lo, None)
    tri_report(A.id, P)
    for o in L.finish_proxy(A, P, lo=lo, size=384, ao_samples=48, ao_strength=0.65):
        kit.smooth(o, 80)
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 5. Kacheguda station
@kit.asset('kachiguda_station', 'landmark', landmark='kachiguda_station', face='w', footprint=[96, 76], height=51.0, fit='footprint', floodlit=True)
def build_kachiguda_station(A):
    """Kacheguda station (1916), Gothic revival: a long sandy-cream two-storey block with pointed
    arcades and battlements, a central porch with a pointed gable, tall end blocks with slender
    corner towers and pointed turrets, the KACHEGUDA name board; the platform shed behind."""
    _ASSET[0] = A.id
    WALL, TRIM, DARK, BAND, RED = '#e8cf9c', '#f8ecd2', '#2b2421', '#c9ad78', '#8a3a33'
    W = ppaint(WALL, 'kg_wall')
    T = ppaint(TRIM, 'kg_trim')
    ST = ppaint('#a9a49a', 'kg_paving')
    P, lo = [], []
    Z0, H = 0.8, 30.0
    P.append(blk('forecourt', 0, 0, 96, 76, 0, Z0, ST))
    lo.append(blk('forecourt_lo', 0, 0, 96.2, 76.2, 0, Z0 + 0.05, None))

    def gface(w, seed, n, h=H):
        f = Fac(w, h - Z0, WALL, seed=seed, noise=0.0)
        f.dirt(2.0, alpha=0.25).band(0.0, 0.8, BAND).band(13.4, 14.4, BAND).band(f.h - 1.2, f.h, BAND)
        f.pilasters(n, 0.8, TRIM)
        f.arches(n, 0.8, w / n * 0.62, 10.6, DARK, kind='pointed', frame=TRIM, fw=0.45)
        f.arches(n, 15.6, w / n * 0.38, 8.4, DARK, kind='pointed', frame=TRIM, fw=0.35, sill=TRIM)
        if h > H:
            f.arches(max(1, n // 2), H + 1.0, w / n * 0.5, 9.0, DARK, kind='pointed', frame=TRIM, fw=0.35, sill=TRIM)
        return f
    # main block
    P.append(fbox('main', 0, -24.0, 68, 18, Z0, H, W, faces={'f': gface(68, 2, 12)}))
    P += rect_teeth('mt', 0, -24.0, 68, 18, H, 1.6, 2.0, T, 'block', sides='fb', two=False)
    lo.append(blk('main_lo', 0, -24.0, 68.2, 18.2, Z0, H + 1.0, None))
    # end blocks: taller, with four slender corner towers and pointed turrets
    HE = 40.0
    for sx in (-1, 1):
        ex = sx * 39.0
        P.append(fbox('endb', ex, -22.0, 16, 22, Z0, HE, W, faces={'f': gface(16, 3, 3, HE), 'l' if sx < 0 else 'r': gface(22, 4, 4, HE), 'b': gface(16, 5, 3, HE)}))
        P += rect_teeth('et', ex, -22.0, 16, 22, HE, 1.6, 2.0, T, 'block', two=False)
        lo.append(blk('endb_lo', ex, -22.0, 16.2, 22.2, Z0, HE + 1.0, None))
        for (tx, ty) in ((ex - 8, -33.0), (ex + 8, -33.0), (ex - 8, -11.0), (ex + 8, -11.0)):
            P.append(cylinder('tw', 1.3, HE + 3.0 - Z0, (tx, ty, Z0), seg=8, mat=T))
            P.append(cylinder('tw_ring', 1.7, 0.6, (tx, ty, HE - 2.0), seg=8, mat=T))
            P += rect_teeth('twc', tx, ty, 2.8, 2.8, HE + 3.0, 0.9, 0.9, T, 'block', two=False)
            P.append(cylinder('tw_spire', 1.5, 7.5, (tx, ty, HE + 3.0), seg=8, mat=W, r2=0.05))
            lo.append(lathe('tw_lo', [(1.45, Z0), (1.45, HE + 3.9), (1.65, HE + 3.9), (0.0, HE + 10.6)], seg=4, loc=(tx, ty, 0), close_bottom=False))
        # central spire turret on each end block
        P.append(cylinder('eb_drum', 3.0, 4.0, (ex, -22.0, HE), seg=8, mat=W))
        P += rect_teeth('ebd', ex, -22.0, 6.0, 6.0, HE + 4.0, 1.0, 1.2, T, 'block', two=False)
        P.append(cylinder('eb_spire', 3.4, 10.0, (ex, -22.0, HE + 4.0), seg=8, mat=W, r2=0.1))
        lo.append(lathe('eb_lo', [(3.2, HE), (3.2, HE + 4.9), (3.5, HE + 4.9), (0.0, HE + 14.2)], seg=6, loc=(ex, -22.0, 0), close_bottom=False))
    # central porch: pointed gable, flanking pinnacle columns, the name board
    PG = 40.0
    gb = prism_from_outline('porch', [(-12, 0), (12, 0), (12, H + 2.0), (0, PG + 2.0), (-12, H + 2.0)], 4.0, center=(0, -34.6, Z0), mat=W)
    P.append(gb)
    fp = Fac(24, PG + 2.0, WALL, seed=9, noise=0.0)
    fp.arch(12, 0, 10.0, 15.0, DARK, 'pointed', frame=TRIM, fw=0.9)
    fp.arches(3, 22.0, 2.0, 7.0, DARK, 6.0, 18.0, kind='pointed', frame=TRIM, fw=0.3)
    fp.arch(12, 31.0, 3.0, 6.0, '#f2ead8', 'pointed', frame=TRIM, fw=0.3, shade=False)
    P.append(img_quad('porch_face', fp.image(A.id + '_porch'), 24, PG + 2.0, (0, -36.62, Z0 + (PG + 2.0) / 2)))
    lo.append(L.place(prism_from_outline('porch_lo', [(-12.1, 0), (12.1, 0), (12.1, H + 2.1), (0, PG + 2.4), (-12.1, H + 2.1)], 4.2, center=(0, 0, 0)), (0, -34.6, Z0)))
    for sx in (-1, 1):
        P.append(cylinder('pp', 1.3, PG + 4.0, (sx * 12.6, -36.4, Z0), seg=8, mat=T))
        P.append(cylinder('pp_sp', 1.5, 6.0, (sx * 12.6, -36.4, PG + 4.0 + Z0), seg=8, mat=W, r2=0.05))
        lo.append(lathe('pp_lo', [(1.45, Z0), (1.45, PG + 4.0 + Z0), (1.6, PG + 4.0 + Z0), (0.0, PG + 10.2 + Z0)], seg=4, loc=(sx * 12.6, -36.4, 0), close_bottom=False))
    P.append(sign('kg_sign', 'KACHEGUDA', 16.0, 3.0, (0, -36.95, 18.2), '#111111', '#f2c230', px=512, depth=0.3))
    lo.append(blk('sign_lo', 0, -36.95, 16.4, 1.0, 18.1, 21.3, None))
    # platform shed behind
    _shed('shed', 0, 14.0, 90, 40, 10.0, P, lo, None)
    tri_report(A.id, P)
    for o in L.finish_proxy(A, P, lo=lo, size=384, ao_samples=48, ao_strength=0.65):
        kit.smooth(o, 80)
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])
