"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

CITY group (PARKED: owner must-haves that ship once models load lazily per GLB; every builder is
registered only under NOSTALGIA_PARKED=1, see the end of this file, and never goes in the real pack):
the four RTC X Roads cinemas (Sandhya 70MM, Odeon, Sudarshan 35MM, Devi 70MM), Gokul Chat (Koti),
Paradise (Secunderabad), the Secunderabad Clock Tower, Koti bus stand and Imlibun MGBS; the A.P.
Secretariat (Saifabad), Ravindra Bharathi, and the Indira Park / Sanjeevaiah Park entrance gates.

Budget path: L.finish_proxy. The detail (painted facades, fins, frames, steps, canopies, columns,
buses, jars...) is modelled freely as `hi` and baked into one atlas on a hand-built low shell
(`lo`, boxes / extruded plans / thin vault strips: a few hundred triangles). Everything that must be
legible (name signs, the fictional film panels, route boards, clock dials) and everything that
glows at night (marquee bulbs, tube lights, lit signs) lives on ONE extra unbaked picture sheet per
asset (`Sheet`): its own small image, one draw call, an '@night' material whose emission is the
sheet itself (dark by day, lit after dusk).
"""
import math
import os
import numpy as np
import bpy
import bmesh
from mathutils import Matrix, Vector
import kit
import _lmkit as L
from kit import box, cylinder, lathe, prism_from_outline, extrude_polygon
import _lm_civic as C
from _lm_civic import Fac, fbox, blk

PI = math.pi


# =========================================================================== small helpers
def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def B(name, x0, x1, y0, y1, z0, z1, mat):
    """box from extents (hi detail)"""
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat, base=True)


def S(name, x0, x1, y0, y1, z0, z1):
    """open-bottom shell box from extents (lo)"""
    return blk(name, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, z0, z1, None)


def quad(name, pts, mat=None):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in pts])
    return kit.obj_from_bm(bm, name, mat)


def side_prism(name, outline, x0, x1, mat=None, bottom=False):
    """prism of a (y, z) section extruded along X from x0 to x1 (bottom=False: no face on the
    closing edge last -> first, i.e. the ground)"""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for (y, z) in outline]
    b = [bm.verts.new((x1, y, z)) for (y, z) in outline]
    n = len(outline)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n if bottom else n - 1):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def plan_shell(name, poly, z0, z1, mat=None, bottom=False):
    """vertical prism from a plan polygon (x, y) CCW seen from above; no ground face by default"""
    ob = extrude_polygon(name, poly, z0, z1, mat)
    if not bottom:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context='FACES')
        bm.to_mesh(ob.data)
        bm.free()
    return ob


def vault_lo(name, outer, inner, y0, y1):
    """open-ended thin vault shell (outer + inner surfaces, no end caps) along Y"""
    bm = bmesh.new()
    for pts, up in ((outer, True), (inner, False)):
        a = [bm.verts.new((x, y0, z)) for (x, z) in pts]
        b = [bm.verts.new((x, y1, z)) for (x, z) in pts]
        for i in range(len(pts) - 1):
            f = (a[i], a[i + 1], b[i + 1], b[i]) if up else (a[i], b[i], b[i + 1], a[i + 1])
            bm.faces.new(f)
    ob = kit.obj_from_bm(bm, name)
    return ob


def tri_col(name, x, y, r, z0, z1):
    """a triangular open-ended column shell (6 tris) round a square column"""
    pts = [(x + r * math.cos(a), y + r * math.sin(a)) for a in (PI / 2, PI / 2 + 2 * PI / 3, PI / 2 + 4 * PI / 3)]
    bm = bmesh.new()
    for i in range(3):
        (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % 3]
        bm.faces.new((bm.verts.new((xa, ya, z0)), bm.verts.new((xb, yb, z0)), bm.verts.new((xb, yb, z1)), bm.verts.new((xa, ya, z1))))
    ob = kit.obj_from_bm(bm, name)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return ob


def ramp_lo(name, x0, x1, yf, yb, h):
    """shell over a flight of steps: one sloping face + the two side triangles"""
    return side_prism(name, [(yf - 0.2, 0.0), (yf - 0.2, 0.25), (yb, h + 0.15), (yb, 0.0)], x0 - 0.15, x1 + 0.15)


def arc_pts(x0, x1, y_end, sag, n):
    """plan points of a facade bowed towards -Y: ends at y_end, the middle at y_end - sag"""
    c = (x1 - x0) / 2
    R = (c * c + sag * sag) / (2 * sag)
    yc = y_end - sag + R
    a = math.asin(c / R)
    out = []
    for i in range(n + 1):
        t = -a + 2 * a * i / n
        out.append(((x0 + x1) / 2 + R * math.sin(t), yc - R * math.cos(t)))
    return out


def arc_y(x, x0, x1, y_end, sag):
    c = (x1 - x0) / 2
    R = (c * c + sag * sag) / (2 * sag)
    yc = y_end - sag + R
    return yc - math.sqrt(max(0.0, R * R - (x - (x0 + x1) / 2) ** 2))


def strip_face(name, pts, z0, z1, img, grime=0.12, flip=False):
    """painted strip along a plan polyline (left -> right seen from the front): one quad per span,
    SignUV u = arc length (the image `img` spans the whole strip)"""
    sm = kit.sign_material(img, grime=grime)
    bm = bmesh.new()
    suv = bm.loops.layers.uv.new('SignUV')
    bm.loops.layers.uv.new('UVMap')
    lens = [0.0]
    for i in range(1, len(pts)):
        lens.append(lens[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    T = lens[-1]
    for i in range(len(pts) - 1):
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        vs = [bm.verts.new((xa, ya, z0)), bm.verts.new((xb, yb, z0)), bm.verts.new((xb, yb, z1)), bm.verts.new((xa, ya, z1))]
        f = bm.faces.new(vs)
        for lp, (u, v) in zip(f.loops, ((lens[i] / T, 0), (lens[i + 1] / T, 0), (lens[i + 1] / T, 1), (lens[i] / T, 1))):
            lp[suv].uv = (u, v)
    return kit.obj_from_bm(bm, name, sm)


def offset_pts(pts, d):
    """move a plan polyline by d along its outward (-Y side) normal"""
    out = []
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1.0
        out.append((x + ty / ln * d, y - tx / ln * d))
    return out


def lin_mat(name, col, rough=0.8):
    return L.paint(col, name, rough=rough)


# =========================================================================== numpy painting
class Canvas:
    """numpy sRGB painting surface (origin bottom-left, coordinates as fractions 0..1)"""

    def __init__(self, w, h, bg='#ffffff'):
        self.w, self.h = int(w), int(h)
        self.a = np.ones((self.h, self.w, 4), np.float32)
        self.a[..., :3] = rgb(bg)

    def _px(self, x0, y0, x1, y1):
        return (int(round(min(x0, x1) * self.w)), int(round(min(y0, y1) * self.h)),
                int(round(max(x0, x1) * self.w)), int(round(max(y0, y1) * self.h)))

    def rect(self, x0, y0, x1, y1, col, alpha=1.0):
        a, b, c, d = self._px(x0, y0, x1, y1)
        a, b = max(a, 0), max(b, 0)
        if c > a and d > b:
            self.a[b:d, a:c, :3] = self.a[b:d, a:c, :3] * (1 - alpha) + rgb(col) * alpha
        return self

    def frame(self, x0, y0, x1, y1, t, col):
        tx, ty = t, t * self.w / self.h
        return self.rect(x0, y0, x1, y0 + ty, col).rect(x0, y1 - ty, x1, y1, col).rect(x0, y0, x0 + tx, y1, col).rect(x1 - tx, y0, x1, y1, col)

    def grad(self, y0, y1, c0, c1, x0=0.0, x1=1.0):
        a, b, c, d = self._px(x0, y0, x1, y1)
        n = max(1, d - b)
        t = np.linspace(0, 1, n, dtype=np.float32)[:, None, None]
        self.a[b:d, a:c, :3] = rgb(c0) * (1 - t) + rgb(c1) * t
        return self

    def _grid(self):
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        return (xx + 0.5) / self.w, (yy + 0.5) / self.h

    def ellipse(self, cx, cy, rx, ry, col, alpha=1.0):
        X, Y = self._grid()
        m = (X - cx) ** 2 / (rx * rx) + (Y - cy) ** 2 / (ry * ry) <= 1.0
        self.a[m, :3] = self.a[m, :3] * (1 - alpha) + rgb(col) * alpha
        return self

    def glow(self, cx, cy, rx, ry, col, alpha=0.8):
        X, Y = self._grid()
        d = np.sqrt((X - cx) ** 2 / (rx * rx) + (Y - cy) ** 2 / (ry * ry))
        f = np.clip(1 - d, 0, 1)[..., None] * alpha
        self.a[..., :3] = self.a[..., :3] * (1 - f) + rgb(col) * f
        return self

    def poly(self, pts, col, alpha=1.0):
        X, Y = self._grid()
        inside = np.zeros(X.shape, bool)
        n = len(pts)
        for i in range(n):
            (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % n]
            if y1 == y2:
                continue
            c = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / (y2 - y1) + x1)
            inside ^= c
        self.a[inside, :3] = self.a[inside, :3] * (1 - alpha) + rgb(col) * alpha
        return self

    def line(self, x0, y0, x1, y1, w, col):
        dx, dy = x1 - x0, y1 - y0
        ln = math.hypot(dx * self.w, dy * self.h) or 1.0
        nx, ny = -dy * self.h / ln * w, dx * self.w / ln * w * self.w / self.h
        return self.poly([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], col)

    def text(self, txt, x0, y0, x1, y1, col, outline=None, ow=2, size=0.8):
        a, b, c, d = self._px(x0, y0, x1, y1)
        pw, ph = max(16, c - a), max(16, d - b)
        img = kit.text_image(txt, pw, ph, fg='#ffffff', bg='#000000', size=size)
        m = kit.img_array(img)[..., 0]
        bpy.data.images.remove(img)
        m = np.clip(m, 0, 1)
        hh, ww = min(ph, self.h - b), min(pw, self.w - a)
        m = m[:hh, :ww]
        reg = self.a[b:b + hh, a:a + ww, :3]
        if outline:
            o = m.copy()
            for dx in range(-ow, ow + 1):
                for dy in range(-ow, ow + 1):
                    if dx * dx + dy * dy <= ow * ow + 1:
                        o = np.maximum(o, np.roll(np.roll(m, dx, 1), dy, 0))
            reg[:] = reg * (1 - o[..., None]) + rgb(outline) * o[..., None]
        reg[:] = reg * (1 - m[..., None]) + rgb(col) * m[..., None]
        return self

    def bulbs(self, y, n, col='#ffd76a', r=0.32, x0=0.0, x1=1.0, halo='#ff9a3a'):
        """a row of n round bulbs centred on row y (fraction); r = radius as a fraction of the pitch"""
        step = (x1 - x0) / n
        for i in range(n):
            cx = x0 + step * (i + 0.5)
            rx = step * r
            ry = rx * self.w / self.h
            self.ellipse(cx, y, rx * 1.5, ry * 1.5, halo, 0.5)
            self.ellipse(cx, y, rx, ry, col)
            self.ellipse(cx - rx * 0.3, y + ry * 0.3, rx * 0.35, ry * 0.35, '#fffbe8')
        return self

    def noise(self, amt=0.05, seed=1):
        rng = np.random.default_rng(seed)
        self.a[..., :3] = np.clip(self.a[..., :3] * (1 + (rng.random((self.h, self.w, 1)) - 0.5) * amt), 0, 1)
        return self

    def mat(self, name, grime=0.15):
        """a baking picture material (through 'SignUV'): painted detail for the hi model"""
        img = bpy.data.images.new(name, self.w, self.h, alpha=False)
        img.pixels.foreach_set(self.a.astype(np.float32).ravel())
        kit.ensure_dirs()
        p = os.path.join(kit.TMP_DIR, name + '.png')
        img.filepath_raw = p
        img.file_format = 'PNG'
        img.save()
        return kit.sign_material(img, 'pic_' + name, grime=grime)


def decal(name, mat, w, h, loc, rz=0.0, tilt=0.0):
    """a 2-triangle picture quad facing -Y (turned by rz about Z, tilted about X) for the hi model"""
    bm = bmesh.new()
    suv = bm.loops.layers.uv.new('SignUV')
    bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for lp in f.loops:
        co = lp.vert.co
        lp[suv].uv = (co.x / w + 0.5, co.z / h + 0.5)
    M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return kit.obj_from_bm(bm, name, mat)


# =========================================================================== the picture sheet
class Sheet:
    """One unbaked picture sheet per asset: signs, film panels, bulb strips, dials are painted into
    sub-rectangles of one small image and mapped on 2-triangle quads (legible whatever the atlas
    size). Its material is '<id>_sheet@night' with the sheet as emission: unlit by day (the runtime
    sets emissiveIntensity 0), glowing after dusk. One draw call."""

    def __init__(self, aid, w=512, h=256, bg='#141414', night=True):
        self.aid, self.night = aid, night
        self.cv = Canvas(w, h, bg)
        self.shelves = []
        self.objs = []

    def put(self, cv):
        """shelf-pack a Canvas into the sheet; returns its uv rect (half-texel inset)"""
        W, H = self.cv.w, self.cv.h
        spot = None
        for shf in self.shelves:          # [y, h, x]
            if cv.h <= shf[1] and shf[2] + cv.w <= W:
                spot = shf
                break
        if spot is None:
            y = self.shelves[-1][0] + self.shelves[-1][1] + 2 if self.shelves else 0
            if y + cv.h > H or cv.w > W:
                raise RuntimeError('%s: sheet full (%dx%d at y %d)' % (self.aid, cv.w, cv.h, y))
            spot = [y, cv.h, 0]
            self.shelves.append(spot)
        x0, y0 = spot[2], spot[0]
        self.cv.a[y0:y0 + cv.h, x0:x0 + cv.w] = cv.a
        spot[2] += cv.w + 2
        return ((x0 + 0.5) / W, (y0 + 0.5) / H, (x0 + cv.w - 0.5) / W, (y0 + cv.h - 0.5) / H)

    def quad(self, uv, w, h, loc, rz=0.0, tilt=0.0, uvq=None):
        """a w x h quad facing -Y at loc (turned rz about Z, tilted about X) showing `uv`"""
        u0, v0, u1, v1 = uv
        bm = bmesh.new()
        lay = bm.loops.layers.uv.new('UVMap')
        vs = [bm.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
        f = bm.faces.new(vs)
        for lp, (u, v) in zip(f.loops, uvq or ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
            lp[lay].uv = (u, v)
        M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        ob = kit.obj_from_bm(bm, 'sheetq')
        self.objs.append(ob)
        return ob

    def strip(self, uv, pts, z0, z1):
        """the sub-image stretched along a plan polyline (curved marquee bands)"""
        u0, v0, u1, v1 = uv
        lens = [0.0]
        for i in range(1, len(pts)):
            lens.append(lens[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
        T = lens[-1]
        bm = bmesh.new()
        lay = bm.loops.layers.uv.new('UVMap')
        for i in range(len(pts) - 1):
            (xa, ya), (xb, yb) = pts[i], pts[i + 1]
            f = bm.faces.new([bm.verts.new((xa, ya, z0)), bm.verts.new((xb, yb, z0)), bm.verts.new((xb, yb, z1)), bm.verts.new((xa, ya, z1))])
            ua, ub = u0 + (u1 - u0) * lens[i] / T, u0 + (u1 - u0) * lens[i + 1] / T
            for lp, uv_ in zip(f.loops, ((ua, v0), (ub, v0), (ub, v1), (ua, v1))):
                lp[lay].uv = uv_
        ob = kit.obj_from_bm(bm, 'sheets')
        self.objs.append(ob)
        return ob

    def obj(self):
        ob = kit.join(self.objs, self.aid + '_sheet')
        kit.ensure_dirs()
        name = self.aid + '_sheet'
        img = bpy.data.images.new(name, self.cv.w, self.cv.h, alpha=False)
        img.pixels.foreach_set(self.cv.a.astype(np.float32).ravel())
        p = os.path.join(kit.TMP_DIR, name + '.png')
        img.filepath_raw = p
        img.file_format = 'PNG'
        img.save()
        m = kit.baked_material('M_%s_sheet%s' % (self.aid, '@night' if self.night else ''), p, rough=0.65)
        if self.night:
            nt = m.node_tree
            bs = nt.nodes.get('Principled BSDF')
            tx = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
            nt.links.new(tx.outputs['Color'], bs.inputs['Emission Color'])
            bs.inputs['Emission Strength'].default_value = 1.0
        ob.data.materials.clear()
        ob.data.materials.append(m)
        return ob


def text_cv(text, pw, ph, fg, bg, size=0.8, border=None, bw=0.04, outline=None):
    c = Canvas(pw, ph, bg)
    if border:
        c.frame(0, 0, 1, 1, bw * ph / pw, border)
    c.text(text, 0.04, 0.1, 0.96, 0.9, fg, outline=outline, size=size)
    return c


def marquee_cv(n, text=None, pw=512, ph=24, bg='#2a1a12', col='#ffd76a', fg='#ffe9b0', rows=2, col2='#ff8a3a'):
    """the canopy fascia: rows of bulbs (alternate colours) + optional short text between"""
    c = Canvas(pw, ph, bg)
    ys = (0.25, 0.75) if rows == 2 else (0.5,)
    for y in ys:
        c.bulbs(y, n, col)
        c.bulbs(y, n // 2, col2, r=0.16)
    if text:
        c.rect(0.25, 0.32, 0.75, 0.68, bg).text(text, 0.26, 0.3, 0.74, 0.7, fg, size=0.9)
    return c


# =========================================================================== fictional film panels
def _face_portrait(c, cx, cy, s, skin, hair, female=False, shirt=None):
    """a big hand-painted portrait in the hoarding manner (generic, no likeness)"""
    asp = c.w / c.h
    k = s * asp
    if shirt:
        c.poly([(cx - s * 1.15, 0.0), (cx + s * 1.15, 0.0), (cx + s * 0.75, cy - k * 0.95), (cx - s * 0.75, cy - k * 0.95)], shirt)
        c.poly([(cx - s * 0.25, cy - k * 0.95), (cx + s * 0.25, cy - k * 0.95), (cx, cy - k * 1.35)], skin)
    c.rect(cx - s * 0.24, cy - k * 1.0, cx + s * 0.24, cy - k * 0.6, skin)
    if female:
        c.ellipse(cx, cy + k * 0.05, s * 0.92, k * 1.12, hair)
    c.ellipse(cx, cy, s * 0.68, k * 0.9, skin)
    c.ellipse(cx + s * 0.32, cy - k * 0.05, s * 0.36, k * 0.8, '#000000', 0.18)      # painted shadow side
    c.ellipse(cx, cy + k * 0.6, s * 0.72, k * 0.42, hair)
    if not female:
        c.rect(cx - s * 0.7, cy + k * 0.36, cx + s * 0.7, cy + k * 0.62, hair)
        c.ellipse(cx - s * 0.66, cy + k * 0.15, s * 0.1, k * 0.3, hair)
        c.ellipse(cx + s * 0.66, cy + k * 0.15, s * 0.1, k * 0.3, hair)
    for sx in (-1, 1):
        ex = cx + sx * s * 0.27
        c.ellipse(ex, cy + k * 0.12, s * 0.1, k * 0.045, '#efe6da')
        c.ellipse(ex, cy + k * 0.12, s * 0.05, k * 0.045, '#22140c')
        c.poly([(ex - s * 0.15, cy + k * 0.22), (ex + s * 0.15, cy + k * 0.22), (ex + s * 0.13, cy + k * 0.27), (ex - s * 0.13, cy + k * 0.26)], '#24160e')
    c.poly([(cx - s * 0.04, cy + k * 0.05), (cx + s * 0.06, cy - k * 0.2), (cx - s * 0.06, cy - k * 0.2)], '#000000', 0.15)
    c.ellipse(cx, cy - k * 0.42, s * 0.2, k * 0.06, '#b0443a' if female else '#8a4a3a')
    if female:
        c.ellipse(cx, cy + k * 0.3, s * 0.045, k * 0.045, '#c0101a')
        for sx in (-1, 1):
            c.ellipse(cx + sx * s * 0.7, cy - k * 0.15, s * 0.06, k * 0.08, '#f2c230')
        c.poly([(cx - s * 0.5, cy - k * 0.98), (cx + s * 0.5, cy - k * 0.98), (cx, cy - k * 1.18)], '#f2c230', 0.8)
    else:
        c.poly([(cx - s * 0.3, cy - k * 0.3), (cx + s * 0.3, cy - k * 0.3), (cx + s * 0.22, cy - k * 0.22), (cx - s * 0.22, cy - k * 0.22)], '#1d120c')


def film_panel(title, theme, pw=320, ph=176, tag=None):
    """a painted Telugu-film-style hoarding with a FICTIONAL, family-friendly title"""
    c = Canvas(pw, ph)
    if theme == 'kites':        # RANGULA PATANG: kite festival over the old city
        c.grad(0.0, 1.0, '#ffd27a', '#3e8fd8')
        c.glow(0.75, 0.75, 0.3, 0.4, '#fff6c8', 0.7)
        for i, (x, y, col) in enumerate(((0.55, 0.78, '#e8202a'), (0.7, 0.62, '#2ab04a'), (0.86, 0.8, '#f2c230'), (0.63, 0.9, '#8a2ad8'), (0.92, 0.55, '#ff6a1a'))):
            s = 0.05
            c.poly([(x, y + s * 1.6), (x + s, y), (x, y - s * 1.4), (x - s, y)], col)
            c.line(x, y - s * 1.4, 0.45 + i * 0.02, 0.3, 0.004, '#f8f8f0')
        c.poly([(0.5, 0.36), (0.56, 0.5), (0.6, 0.36)], '#e9e0c8')     # a minaret silhouette
        c.rect(0.45, 0.30, 1.0, 0.38, '#c9a874')
        _face_portrait(c, 0.22, 0.6, 0.15, '#c98a5a', '#1d1410', shirt='#e8402a')
        _face_portrait(c, 0.42, 0.62, 0.09, '#d8a070', '#140c08', female=True, shirt='#2a9a5a')
        tc, to = '#ffe23a', '#b0101a'
    elif theme == 'festival':   # PREMA PANDAGA: a family festival picture, lamps and flowers
        c.grad(0.0, 1.0, '#5a1a6a', '#e86a9a')
        for k in range(9):
            x = 0.06 + k * 0.11
            c.glow(x, 0.42, 0.04, 0.08, '#ffd27a', 0.9)
            c.ellipse(x, 0.40, 0.022, 0.03, '#ffe9a0').ellipse(x, 0.37, 0.03, 0.02, '#b0602a')
        for k in range(14):
            c.ellipse(0.04 + k * 0.07, 0.96, 0.03, 0.05, '#ff9a1a' if k % 2 else '#ffe23a')
        _face_portrait(c, 0.3, 0.66, 0.13, '#c98a5a', '#1d1410', shirt='#f2f2ea')
        _face_portrait(c, 0.68, 0.66, 0.12, '#d8a070', '#140c08', female=True, shirt='#e8202a')
        tc, to = '#fff27a', '#7a0a4a'
    elif theme == 'lion':       # GULLY SIMHAM: the gully cricket hero
        c.grad(0.0, 1.0, '#f28a1a', '#ffe08a')
        c.glow(0.72, 0.68, 0.3, 0.5, '#ffd03a', 0.8)
        c.ellipse(0.74, 0.66, 0.16, 0.30, '#b8601a').ellipse(0.74, 0.62, 0.10, 0.19, '#e0a040')
        c.ellipse(0.70, 0.66, 0.015, 0.025, '#2a1a10').ellipse(0.78, 0.66, 0.015, 0.025, '#2a1a10')
        c.ellipse(0.74, 0.56, 0.03, 0.03, '#3a2010')
        c.line(0.5, 0.36, 0.6, 0.9, 0.012, '#d8b878')      # cricket bat
        c.rect(0.585, 0.86, 0.615, 0.98, '#3a2a20')
        _face_portrait(c, 0.27, 0.62, 0.16, '#b97a4a', '#1d1410', shirt='#1d5ac8')
        tc, to = '#ffffff', '#c0101a'
    else:                       # 'train': TOOFAN EXPRESS, a railway adventure
        c.grad(0.0, 1.0, '#7a2a10', '#ffb04a')
        c.ellipse(0.72, 0.72, 0.12, 0.2, '#fff0b0')
        c.poly([(0.42, 0.34), (0.98, 0.34), (0.98, 0.62), (0.62, 0.62), (0.56, 0.52), (0.42, 0.52)], '#2a3a6a')
        c.rect(0.6, 0.62, 0.66, 0.74, '#2a3a6a').ellipse(0.47, 0.46, 0.03, 0.05, '#fff6c8')
        for k in range(5):
            c.rect(0.05, 0.42 + k * 0.035, 0.38, 0.43 + k * 0.035, '#ffe0a0', 0.5)
        _face_portrait(c, 0.22, 0.64, 0.14, '#c98a5a', '#1d1410', shirt='#7a1a1a')
        tc, to = '#ffe23a', '#1a2a8a'
    c.rect(0.0, 0.0, 1.0, 0.3, '#000000', alpha=0.45)
    c.text(title, 0.02, 0.02, 0.98, 0.30, tc, outline=to, ow=3, size=0.82)
    if tag:
        c.rect(0.68, 0.86, 0.99, 0.99, '#c0101a').text(tag, 0.69, 0.865, 0.98, 0.985, '#ffffff', size=0.8)
    c.frame(0, 0, 1, 1, 0.012, '#f2f2ea')
    return c


# =========================================================================== cinema building blocks
def hall_fac(w, h, wall, seed, vents=True, doors=1, band=None):
    """a cinema hall's long blank side: louvres high up, exit doors, rain streaks"""
    f = Fac(w, h, wall, seed=seed, noise=0.0)
    f.dirt(3.0, alpha=0.3)
    if band:
        f.band(h - 1.6, h, band)
    if vents:
        n = max(2, int(w / 9))
        for i in range(n):
            x = (i + 0.5) * w / n
            f.rect(x - 1.4, h * 0.62, x + 1.4, h * 0.62 + 3.0, '#6a6862')
            for k in range(4):
                f.rect(x - 1.4, h * 0.62 + 0.3 + k * 0.7, x + 1.4, h * 0.62 + 0.55 + k * 0.7, '#9a968e')
    for i in range(doors):
        x = (i + 0.5) * w / doors
        f.rect(x - 2.6, 0, x + 2.6, 7.5, '#4a5a4a').rect(x - 2.8, 7.5, x + 2.8, 8.0, '#7a766e')
        f.rect(x - 0.1, 0, x + 0.1, 7.5, '#2a2a2a')
    # rain streaks under the roof
    rng = np.random.default_rng(seed)
    for _ in range(int(w / 3)):
        x = rng.random() * w
        f.rect(x, h * (0.3 + rng.random() * 0.4), x + 0.5, h - 1.6, '#000000', 0.06)
    return f


def roof_bits(P, lo, M, x, y, z):
    """projection room / water tank box on a flat roof"""
    P.append(B('projroom', x - 7, x + 7, y - 4, y + 4, z, z + 6, M))
    P.append(B('projroom_cap', x - 7.5, x + 7.5, y - 4.5, y + 4.5, z + 6, z + 6.6, M))
    lo.append(S('s_proj', x - 7.6, x + 7.6, y - 4.6, y + 4.6, z, z + 6.7))


def finish(A, P, lo, sheet, size, ao=6.0, extra_keep=()):
    keep = [sheet.obj()] if sheet else []
    keep += [k for k in extra_keep if k is not None]
    for o in L.finish_proxy(A, P, lo=lo, keep=keep, size=size, ao_dist=ao, ao_samples=48, ao_strength=0.7):
        kit.smooth(o, 80)


# =========================================================================== 1. Sandhya 70MM
def build_sandhya(A):
    """Sandhya 70MM, RTC X Roads: the big one. A wide cream facade bowed towards the road with
    red vertical fins either side, the huge painted film hoarding in a steel frame in the middle,
    SANDHYA 70MM in big letters on top, the deep canopy with the bulb marquee, ticket windows
    and wide entrance steps; the long blank hall with louvres behind."""
    C._ASSET[0] = A.id
    WALL, RED, GREY = '#e0d2ae', '#a82a26', '#6c6e72'
    wall = lin_mat('sn_wall', WALL)
    red = lin_mat('sn_red', RED)
    steel = lin_mat('sn_steel', GREY, 0.6)
    stone = lin_mat('sn_stone', '#b9b2a4', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 512, 288)
    uv_film = sh.put(film_panel('RANGULA PATANG', 'kites', 352, 200, tag='70MM'))
    uv_tix = sh.put(text_cv('TICKETS', 128, 24, '#1a1a1a', '#f2c230', size=0.8))
    W2, HH, HF = 33.0, 40.0, 50.0
    # hall
    P.append(fbox('hall', 0, 5.5, 66, 83, 0, HH, wall, faces={'l': hall_fac(83, HH, WALL, 3), 'r': hall_fac(83, HH, WALL, 4), 'b': hall_fac(66, HH, WALL, 5, doors=2)}))
    lo.append(S('s_hall', -33.1, 33.1, -36, 47.1, 0, HH + 0.1))
    roof_bits(P, lo, wall, 0, -26, HH)
    P.append(B('tank', 18, 24, 30, 36, HH, HH + 4, lin_mat('sn_tank', '#2a2a2a')))
    lo.append(S('s_tank', 17.9, 24.1, 29.9, 36.1, HH, HH + 4.1))
    # the bowed front block
    arc = arc_pts(-34, 34, -37.0, 5.0, 12)
    poly = [(34, -30.0), (-34, -30.0)]
    ff = Fac(sum(math.hypot(arc[i][0] - arc[i - 1][0], arc[i][1] - arc[i - 1][1]) for i in range(1, len(arc))), HF, WALL, seed=7, noise=0.0)
    fw = ff.w
    ff.dirt(2.5, alpha=0.3)
    ff.band(HF - 2.2, HF, RED).band(12.0, 14.2, RED)
    # ground floor: glazed doors in the middle, ticket windows either side
    ff.rect(fw / 2 - 13, 0, fw / 2 + 13, 10.5, '#3a3226')
    for i in range(6):
        x = fw / 2 - 12 + i * 4.8
        ff.rect(x, 0.4, x + 4.0, 9.8, '#55606a').rect(x + 1.9, 0.4, x + 2.1, 9.8, '#2a2a2a')
    for s in (-1, 1):
        for k in range(3):
            x = fw / 2 + s * (18 + k * 4.2)
            ff.rect(x - 1.3, 3.6, x + 1.3, 7.0, '#1e1a16').rect(x - 1.6, 3.2, x + 1.6, 3.6, '#8a8478')
            for g in range(5):
                ff.rect(x - 1.3 + g * 0.6, 3.6, x - 1.2 + g * 0.6, 7.0, '#9a9a9a')
    # first floor: row of small windows over the canopy
    for i in range(14):
        x = 3 + i * (fw - 6) / 13
        ff.rect(x - 1.2, 15.6, x + 1.2, 19.0, '#3e4a52')
    P.append(plan_shell('front', arc + poly, 0, HF, wall))
    P.append(strip_face('front_face', offset_pts(arc, 0.05), 0, HF, ff.image(A.id + '_front')))
    lo.append(plan_shell('s_front', arc_pts(-34.1, 34.1, -37.05, 5.05, 8) + poly, 0, HF + 0.6))
    # red fins either side of the hoarding (radial to the bow)
    for t in list(range(1, 5)) + list(range(8, 12)):
        (xa, ya), (xb, yb) = arc[t], arc[t + 1]
        x, y = (xa + xb) / 2, (ya + yb) / 2
        ang = math.atan2(yb - ya, xb - xa)
        fin = B('fin', -0.35, 0.35, -1.1, 0.0, 14.2, HF - 2.2, red)
        P.append(L.place(fin, (x, y, 0), ang))
    # the parapet with SANDHYA 70MM
    P.append(B('sign_bd', -24, 24, -41.6, -36.5, HF - 0.5, HF + 6.5, red))
    lo.append(S('s_sign', -24.1, 24.1, -41.7, -36.4, HF - 0.5, HF + 6.6))
    uv = sh.put(text_cv('SANDHYA 70MM', 400, 56, '#ffffff', RED, size=0.84, border='#ffd76a'))
    sh.quad(uv, 46.0, 6.4, (0, -41.75, HF + 3.0))
    # the hoarding frame and the film panel
    HX, HZ0, HZ1 = 22.0, 17.0, 45.0
    yfr = -42.6
    P.append(B('hoard_back', -HX, HX, yfr, yfr + 3.5, HZ0, HZ1, steel))
    for x0, x1, z0, z1 in ((-HX - 0.8, HX + 0.8, HZ0 - 0.8, HZ0), (-HX - 0.8, HX + 0.8, HZ1, HZ1 + 0.8), (-HX - 0.8, -HX, HZ0, HZ1), (HX, HX + 0.8, HZ0, HZ1)):
        P.append(B('hoard_fr', x0, x1, yfr - 0.6, yfr + 0.6, z0, z1, steel))
    for k in range(5):     # light brackets on the top edge
        x = -HX + 4 + k * (2 * HX - 8) / 4
        P.append(B('hl', x - 0.3, x + 0.3, yfr - 2.2, yfr, HZ1 + 0.8, HZ1 + 1.2, steel))
        P.append(B('hlh', x - 0.8, x + 0.8, yfr - 2.8, yfr - 1.8, HZ1 + 0.2, HZ1 + 0.9, steel))
    lo.append(S('s_hoard', -HX - 0.9, HX + 0.9, yfr - 0.7, yfr + 3.5, HZ0 - 0.9, HZ1 + 0.9))
    sh.quad(uv_film, 2 * HX, HZ1 - HZ0, (0, yfr - 0.75, (HZ0 + HZ1) / 2))
    # the canopy with its bulb marquee (follows the bow)
    can = arc_pts(-29, 29, -40.5, 4.0, 8)
    cpoly = can + [(29, -34.0), (-29, -34.0)]
    P.append(plan_shell('canopy', cpoly, 11.6, 13.4, wall, bottom=True))
    lo.append(plan_shell('s_canopy', arc_pts(-29.1, 29.1, -40.6, 4.05, 6) + [(29.1, -34.0), (-29.1, -34.0)], 11.5, 13.5, bottom=True))
    uv = sh.put(marquee_cv(48))
    sh.strip(uv, offset_pts(arc_pts(-29, 29, -40.5, 4.0, 6), 0.15), 11.6, 13.4)
    # TICKETS boards over the booking windows
    uv = uv_tix
    for s in (-1, 1):
        x = s * 22.2
        a = math.atan2(arc_y(x + 0.5, -34, 34, -37.0, 5.0) - arc_y(x - 0.5, -34, 34, -37.0, 5.0), 1.0)
        sh.quad(uv, 9.0, 1.6, (x, arc_y(x, -34, 34, -37.0, 5.0) - 0.25, 8.4), rz=a)
    # entrance steps + a low forecourt kerb
    P.append(L.steps('steps', 40, 1.2, 0.45, 4, (0, -45.6, 0), stone))
    lo.append(ramp_lo('s_steps', -20, 20, -48.0, -41.0, 1.8))
    P.append(B('kerb_l', -34, -21, -48, -41, 0, 0.4, stone))
    P.append(B('kerb_r', 21, 34, -48, -41, 0, 0.4, stone))
    finish(A, P, lo, sh, 448)
    L.shots(A, az=-30, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


def round_front(x0, x1, yf, yb, r, n=4):
    """plan polyline of a block front with rounded front corners (left -> right seen from the
    front: starts at the back-left, ends at the back-right)"""
    pts = [(x0, yb)]
    for i in range(n + 1):
        a = PI - (PI / 2) * i / n
        pts.append((x0 + r + r * math.cos(a), yf + r - r * math.sin(a)))
    for i in range(n + 1):
        a = PI / 2 - (PI / 2) * i / n
        pts.append((x1 - r + r * math.cos(a), yf + r - r * math.sin(a)))
    pts.append((x1, yb))
    return pts


def frame_hi(P, name, x0, x1, z0, z1, y, mat, t=0.8, depth=1.2, back=3.0, lights=4):
    """steel hoarding frame (front plane y) + backing + the light brackets on top"""
    P.append(B(name + '_back', x0, x1, y + depth / 2 - 0.2, y + back, z0, z1, mat))
    for a0, a1, b0, b1 in ((x0 - t, x1 + t, z0 - t, z0), (x0 - t, x1 + t, z1, z1 + t), (x0 - t, x0, z0, z1), (x1, x1 + t, z0, z1)):
        P.append(B(name + '_fr', a0, a1, y - depth / 2, y + depth / 2, b0, b1, mat))
    for k in range(lights):
        x = x0 + (k + 0.5) * (x1 - x0) / lights
        P.append(B(name + '_hl', x - 0.25, x + 0.25, y - 2.0, y, z1 + t, z1 + t + 0.4, mat))
        P.append(B(name + '_hlh', x - 0.7, x + 0.7, y - 2.6, y - 1.6, z1 + 0.1, z1 + t + 0.6, mat))


# =========================================================================== 2. Odeon (art deco)
def build_odeon(A):
    """Odeon, RTC X Roads: art deco. An ivory front with jade-green speed-line bands and rounded
    corners, the stepped central tower with three fins and the vertical ODEON blade sign, the
    hoarding on the left wing, the rounded deco canopy with bulbs, ticket windows and steps."""
    C._ASSET[0] = A.id
    WALL, JADE, DK = '#e4dcc0', '#2f8a72', '#1f5a4a'
    wall = lin_mat('od_wall', WALL)
    jade = lin_mat('od_jade', JADE)
    steel = lin_mat('od_steel', '#5e6266', 0.6)
    stone = lin_mat('od_stone', '#b4ada0', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 512, 256)
    uv_film = sh.put(film_panel('PREMA PANDAGA', 'festival', 304, 176))
    uv_blade = sh.put(text_cv('O\nD\nE\nO\nN', 48, 176, '#ffffff', DK, size=0.95, border='#ffd76a', bw=0.02))
    uv_tix = sh.put(text_cv('TICKETS', 128, 24, '#1a1a1a', '#f2c230', size=0.8))
    HH, HW = 34.0, 30.0
    # hall
    P.append(fbox('hall', 0, 8.5, 70, 46.9, 0, HH, wall, faces={'l': hall_fac(46.9, HH, WALL, 3, band=JADE), 'r': hall_fac(46.9, HH, WALL, 4, band=JADE), 'b': hall_fac(70, HH, WALL, 5, doors=2, band=JADE)}))
    lo.append(S('s_hall', -35.1, 35.1, -15, 32.0, 0, HH + 0.1))
    roof_bits(P, lo, wall, 0, -6, HH)
    # wings with rounded corners
    yf, yb = -26.0, -14.0
    pts = round_front(-44, 44, yf, yb, 7.0, 4)
    front = pts[1:-1]
    flen = sum(math.hypot(front[i][0] - front[i - 1][0], front[i][1] - front[i - 1][1]) for i in range(1, len(front)))
    f = Fac(flen, HW, WALL, seed=9, noise=0.0)
    f.dirt(2.5, alpha=0.3)
    for z in (HW - 2.6, HW - 4.2, HW - 5.8):
        f.band(z, z + 0.8, JADE)
    f.band(0, 1.2, DK)
    m = flen / 2
    for sx in (-1, 1):       # porthole windows and ticket windows on the right wing
        for k in range(3):
            x = m + sx * (22 + k * 6)
            if sx > 0:
                f.rect(x - 1.8, 15, x + 1.8, 19, '#3e4a52').rect(x - 2.0, 14.6, x + 2.0, 15, JADE)
        for k in range(3):
            x = m + sx * (20 + k * 4.2)
            f.rect(x - 1.3, 3.6, x + 1.3, 7.0, '#1e1a16').rect(x - 1.6, 3.2, x + 1.6, 3.6, '#8a8478')
            for g in range(5):
                f.rect(x - 1.3 + g * 0.6, 3.6, x - 1.2 + g * 0.6, 7.0, '#9a9a9a')
    P.append(plan_shell('wings', pts, 0, HW, wall))
    P.append(strip_face('wings_face', offset_pts(front, 0.05), 0, HW, f.image(A.id + '_wings')))
    lo.append(plan_shell('s_wings', round_front(-44.1, 44.1, yf - 0.1, yb, 7.0, 2), 0, HW + 0.1))
    P.append(plan_shell('wing_cap', offset_pts(front, 0.4) + [(44.4, yb), (-44.4, yb)], HW, HW + 0.8, jade, bottom=True))
    # the stepped central tower with fins
    for (hw, z0, z1, d) in ((10.0, 0, 38.0, 0.0), (7.0, 38.0, 43.0, 1.0), (4.0, 43.0, 47.0, 2.0)):
        P.append(B('tower', -hw, hw, -28.0 + d, -12.0, z0, z1, wall))
        P.append(B('tower_cap', -hw - 0.4, hw + 0.4, -28.4 + d, -11.6, z1 - 0.6, z1, jade))
    lo.append(S('s_tower1', -10.5, 10.5, -28.5, -12, 0, 38.1))
    lo.append(S('s_tower2', -7.5, 7.5, -27.5, -12, 38.0, 43.1))
    lo.append(S('s_tower3', -4.5, 4.5, -26.5, -12, 43.0, 47.1))
    for x in (-7.0, 7.0):
        P.append(B('fin', x - 0.5, x + 0.5, -29.0, -28.0, 12.0, 40.0, jade))
    tf = Fac(20, 38, WALL, seed=11, noise=0.0)
    tf.rect(4.5, 12.5, 15.5, 36, '#3e4a52')
    for z in range(14, 36, 3):
        tf.rect(4.5, z, 15.5, z + 0.35, '#c8c0a8')
    tf.rect(0, 0, 20, 10.5, '#3a3226')
    for i in range(4):
        tf.rect(1.4 + i * 4.4, 0.4, 5.0 + i * 4.4, 9.8, '#55606a')
    P.append(C.img_quad('tower_face', tf.image(A.id + '_tower'), 20, 38, (0, -28.06, 19.0)))
    # vertical blade sign on the tower
    P.append(B('blade_bd', -2.6, 2.6, -31.0, -28.0, 13.0, 36.0, lin_mat('od_dark', DK)))
    lo.append(S('s_blade', -2.7, 2.7, -31.1, -28.4, 12.9, 36.1))
    sh.quad(uv_blade, 4.6, 22.4, (0, -31.15, 24.5))
    # hoarding on the left wing
    HX0, HX1, HZ0, HZ1 = -42.0, -13.0, 11.5, 28.5
    frame_hi(P, 'hoard', HX0, HX1, HZ0, HZ1, yf - 1.0, steel, back=1.2)
    lo.append(S('s_hoard', HX0 - 0.9, HX1 + 0.9, yf - 1.7, yf + 0.2, HZ0 - 0.9, HZ1 + 0.9))
    sh.quad(uv_film, HX1 - HX0, HZ1 - HZ0, ((HX0 + HX1) / 2, yf - 1.8, (HZ0 + HZ1) / 2))
    # ODEON on the right wing
    uv_name = sh.put(text_cv('ODEON', 256, 56, '#ffffff', JADE, size=0.86, border='#ffd76a'))
    P.append(B('name_bd', 14.0, 42.0, yf - 0.8, yf + 0.5, 20.0, 26.0, jade))
    lo.append(S('s_name', 13.9, 42.1, yf - 0.9, yf + 0.5, 19.9, 26.1))
    sh.quad(uv_name, 27.0, 5.4, (28.0, yf - 0.95, 23.0))
    # the rounded deco canopy (bulbs on its fascia), ticket boards
    cpts = round_front(-17, 17, -31.0, -26.0, 4.0, 4)
    P.append(plan_shell('canopy', cpts, 9.6, 11.4, wall, bottom=True))
    P.append(plan_shell('canopy_band', offset_pts(cpts[1:-1], 0.1) + [(17.1, -26.0), (-17.1, -26.0)], 11.4, 12.0, jade, bottom=True))
    lo.append(plan_shell('s_canopy', round_front(-17.1, 17.1, -31.1, -26.0, 4.0, 2), 9.5, 12.1, bottom=True))
    uv_mq = sh.put(marquee_cv(40, pw=384, ph=16, rows=1))
    sh.strip(uv_mq, offset_pts(cpts[1:-1], 0.2), 9.7, 11.3)
    sh.quad(uv_tix, 9.0, 1.6, (26.2, yf - 0.1, 8.4))
    # steps
    P.append(L.steps('steps', 30, 1.2, 0.45, 4, (0, -29.6, 0), stone))
    lo.append(ramp_lo('s_steps', -15, 15, -32.0, -26.0, 1.8))
    finish(A, P, lo, sh, 384)
    L.shots(A, az=-30, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 3. Sudarshan 35MM
def build_sudarshan(A):
    """Sudarshan 35MM, RTC X Roads: the older, lower house. A salmon-pink front block with
    brown trims and a raised stepped centre, the long gabled tin-roofed hall behind, and the big
    film hoarding standing on a steel trestle above the roof line (its legs show against the sky),
    SUDARSHAN 35MM on the band, a flat canopy with bulbs, ticket windows, steps."""
    C._ASSET[0] = A.id
    WALL, TRIM, CREAM = '#eaa98c', '#6a3a2a', '#f2e6cc'
    wall = lin_mat('sd_wall', WALL)
    trim = lin_mat('sd_trim', TRIM)
    cream = lin_mat('sd_cream', CREAM)
    tin = lin_mat('sd_tin', '#8e8a84', 0.7)
    steel = lin_mat('sd_steel', '#4a4c50', 0.6)
    stone = lin_mat('sd_stone', '#b4ada0', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 512, 256)
    uv_film = sh.put(film_panel('GULLY SIMHAM', 'lion', 352, 176, tag='35MM'))
    uv_tix = sh.put(text_cv('TICKETS', 128, 24, '#1a1a1a', '#f2c230', size=0.8))
    HH = 26.0
    # gabled hall
    P.append(fbox('hall', 0, 6.0, 62, 71.9, 0, HH, wall, faces={'l': hall_fac(71.9, HH, WALL, 3, band=TRIM), 'r': hall_fac(71.9, HH, WALL, 4, band=TRIM), 'b': hall_fac(62, HH, WALL, 5, doors=2, band=TRIM)}, top=False))
    roof = prism_from_outline('roof', [(-32.5, HH - 0.4), (32.5, HH - 0.4), (0.0, HH + 12.0)], 73.0, center=(0, 6.0, 0), mat=tin)
    P.append(roof)
    for y in range(-28, 42, 4):
        P.append(prism_from_outline('rib', [(-32.6, HH - 0.3), (32.6, HH - 0.3), (0.0, HH + 12.15)], 0.3, center=(0, y, 0), mat=lin_mat('sd_tin2', '#77736d', 0.7)))
    for sx in (-1, 1):
        P.append(prism_from_outline('gable_end', [(-31, HH), (31, HH), (0.0, HH + 11.5)], 0.6, center=(0, 41.6, 0), mat=wall))
    lo.append(S('s_hall', -31.1, 31.1, -30, 42.0, 0, HH))
    lo.append(prism_from_outline('s_roof', [(-32.7, HH - 0.45), (32.7, HH - 0.45), (0.0, HH + 12.3)], 73.4, center=(0, 6.0, 0)))
    # front block: stepped parapet
    yf, yb = -36.0, -29.0
    FH = 24.0
    f = Fac(66, FH + 6.0, WALL, seed=9, noise=0.0)
    f.dirt(2.5, alpha=0.3)
    f.band(0, 1.0, TRIM).band(FH - 1.2, FH, TRIM)
    f.band(11.4, 12.4, CREAM)
    f.rect(0, 0, 2.0, FH, CREAM).rect(64, 0, 66, FH, CREAM)
    f.rect(21, 0, 45, 9.6, '#3a3226')
    for i in range(5):
        f.rect(22 + i * 4.6, 0.4, 25.8 + i * 4.6, 9.2, '#5a6066')
    for sx in (-1, 1):
        for k in range(3):
            x = 33 + sx * (17 + k * 4.2)
            f.rect(x - 1.3, 3.6, x + 1.3, 7.0, '#1e1a16').rect(x - 1.6, 3.2, x + 1.6, 3.6, '#8a8478')
            for g in range(5):
                f.rect(x - 1.3 + g * 0.6, 3.6, x - 1.2 + g * 0.6, 7.0, '#9a9a9a')
    for i in range(8):
        x = 4.5 + i * 8.1
        f.rect(x - 1.4, 13.6, x + 1.4, 17.6, '#3e4a52').rect(x - 1.8, 13.2, x + 1.8, 13.6, CREAM)
    P.append(fbox('front', 0, (yf + yb) / 2, 66, yb - yf, 0, FH, wall, faces={'f': f}))
    P.append(B('front_c', -14, 14, yf, yb, FH, FH + 4.6, wall))
    P.append(B('cap1', -33.4, 33.4, yf - 0.4, yb, FH - 0.6, FH, trim))
    P.append(B('cap2', -14.4, 14.4, yf - 0.4, yb, FH + 4.0, FH + 4.6, trim))
    lo.append(S('s_front', -33.1, 33.1, yf - 0.5, yb, 0, FH + 0.1))
    lo.append(S('s_front_c', -14.5, 14.5, yf - 0.5, yb, FH, FH + 4.7))
    # the name band (on the raised centre)
    uv_name = sh.put(text_cv('SUDARSHAN 35MM', 384, 48, '#fff2c8', TRIM, size=0.84, border='#ffd76a'))
    sh.quad(uv_name, 27.0, 3.4, (0, yf - 0.55, FH + 2.0))
    # the hoarding on its trestle above the roof
    HX, HZ0, HZ1, hy = 25.0, 35.0, 53.0, -27.0
    frame_hi(P, 'hoard', -HX, HX, HZ0, HZ1, hy, steel, back=1.0, lights=5)
    for x in (-20.0, -7.0, 7.0, 20.0):
        P.append(B('leg', x - 0.4, x + 0.4, hy - 0.3, hy + 0.5, FH, HZ0, steel))
        P.append(B('leg_b', x - 0.4, x + 0.4, hy + 5.6, hy + 6.4, HH + 2.0, HZ0 + 6.0, steel))
        P.append(kit.tube('brace', [(x, hy + 0.1, FH + 1.0), (x, hy + 6.0, HZ0 + 2.0)], 0.25, seg=4, mat=steel))
    P.append(B('catwalk', -HX, HX, hy - 2.2, hy - 0.5, HZ0 - 1.4, HZ0 - 1.0, steel))
    lo.append(S('s_hoard', -HX - 0.9, HX + 0.9, hy - 0.8, hy + 1.0, HZ0 - 0.9, HZ1 + 0.9))
    for x in (-20.0, -7.0, 7.0, 20.0):
        lo.append(S('s_leg', x - 0.5, x + 0.5, hy - 0.4, hy + 0.6, FH + 4.6 if abs(x) < 14 else FH, HZ0 - 0.8))
    lo.append(S('s_walk', -HX, HX, hy - 2.3, hy - 0.4, HZ0 - 1.5, HZ0 - 0.9))
    sh.quad(uv_film, 2 * HX, HZ1 - HZ0, (0, hy - 0.95, (HZ0 + HZ1) / 2))
    # flat canopy with bulbs
    P.append(B('canopy', -24, 24, -40.6, yf, 9.6, 11.0, cream))
    P.append(B('canopy_fascia', -24.2, 24.2, -40.9, -40.4, 9.4, 11.4, trim))
    lo.append(S('s_canopy', -24.3, 24.3, -41.0, yf, 9.3, 11.5))
    uv_mq = sh.put(marquee_cv(44, pw=384, ph=16, rows=1))
    sh.quad(uv_mq, 48.4, 1.8, (0, -41.05, 10.4))
    for sx in (-1, 1):
        sh.quad(uv_tix, 9.0, 1.6, (sx * 21.4, yf - 0.1, 8.2))
    P.append(L.steps('steps', 30, 1.2, 0.45, 4, (0, -39.6, 0), stone))
    lo.append(ramp_lo('s_steps', -15, 15, -42.0, yf, 1.8))
    finish(A, P, lo, sh, 416)
    L.shots(A, az=-30, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 4. Devi 70MM
def build_devi(A):
    """Devi 70MM, RTC X Roads: the tall modern facade. White cladding with a blue band, a full
    height blue glass bay, the tall DEVI pylon at the corner, the huge film hoarding filling the
    left of the facade, DEVI 70MM over the canopy, bulbs, ticket windows and wide steps."""
    C._ASSET[0] = A.id
    WALL, BLUE, GL = '#ccd0d4', '#2a5cb8', '#3f6f8a'
    wall = lin_mat('dv_wall', WALL)
    blue = lin_mat('dv_blue', BLUE)
    steel = lin_mat('dv_steel', '#5a5e64', 0.6)
    stone = lin_mat('dv_stone', '#b4ada0', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 512, 256)
    uv_film = sh.put(film_panel('TOOFAN EXPRESS', 'train', 352, 176, tag='70MM'))
    uv_pyl = sh.put(text_cv('D\nE\nV\nI', 48, 176, '#ffffff', BLUE, size=0.95, border='#ffd76a', bw=0.02))
    uv_tix = sh.put(text_cv('TICKETS', 96, 24, '#1a1a1a', '#f2c230', size=0.8))
    HH, FH = 40.0, 47.0
    yf, yb = -28.0, -17.0
    P.append(fbox('hall', 0, 8.0, 84, 49.9, 0, HH, wall, faces={'l': hall_fac(49.9, HH, WALL, 3, band=BLUE), 'r': hall_fac(49.9, HH, WALL, 4, band=BLUE), 'b': hall_fac(84, HH, WALL, 5, doors=2, band=BLUE)}))
    lo.append(S('s_hall', -42.1, 42.1, -17, 33.0, 0, HH + 0.1))
    roof_bits(P, lo, wall, -10, -10, HH)
    f = Fac(100, FH, WALL, seed=9, noise=0.0)
    f.dirt(2.5, alpha=0.25)
    f.band(FH - 3.0, FH - 1.6, BLUE).band(0, 1.0, '#8a8e94')
    # the glass bay (x 62..92 from the left edge)
    f.rect(60.5, 13.5, 93.5, FH - 4.0, '#e8eaec')
    f.rect(62, 14.5, 92, FH - 5.0, GL)
    for x in np.arange(62, 92.1, 3.75):
        f.rect(x - 0.18, 14.5, x + 0.18, FH - 5.0, '#c8ccd0')
    for z in np.arange(14.5, FH - 4.9, 4.0):
        f.rect(62, z - 0.18, 92, z + 0.18, '#c8ccd0')
        f.rect(62, z + 0.3, 92, z + 1.0, '#8ab8d0', 0.35)
    f.rect(40, 0, 92, 8.6, '#3a3226')
    for i in range(9):
        f.rect(41 + i * 5.7, 0.4, 45.6 + i * 5.7, 8.2, '#5a6870')
    for k in range(4):
        x = 8 + k * 4.4
        f.rect(x - 1.3, 3.6, x + 1.3, 7.0, '#1e1a16').rect(x - 1.6, 3.2, x + 1.6, 3.6, '#8a8478')
        for g in range(5):
            f.rect(x - 1.3 + g * 0.6, 3.6, x - 1.2 + g * 0.6, 7.0, '#9a9a9a')
    P.append(fbox('front', 0, (yf + yb) / 2, 100, yb - yf, 0, FH, wall, faces={'f': f, 'l': hall_fac(11, FH, WALL, 6, vents=False, doors=0, band=BLUE), 'r': hall_fac(11, FH, WALL, 7, vents=False, doors=0, band=BLUE)}))
    P.append(B('cap', -50.4, 50.4, yf - 0.4, yb, FH, FH + 1.0, blue))
    for x in (-50 + 60.5, -50 + 93.5):   # the glass bay's cladding fins
        P.append(B('gfin', x - 0.6, x + 0.6, yf - 1.0, yf, 13.0, FH, wall))
    lo.append(S('s_front', -50.1, 50.1, yf - 0.5, yb, 0, FH + 1.1))
    # the tall corner pylon with DEVI
    P.append(B('pylon', 44.0, 50.0, yf - 3.5, yf + 1.0, 0, FH + 12.0, blue))
    P.append(B('pylon_cap', 43.6, 50.4, yf - 3.9, yf + 1.4, FH + 12.0, FH + 12.8, wall))
    lo.append(S('s_pylon', 43.5, 50.5, yf - 4.0, yf + 1.5, 0, FH + 12.9))
    sh.quad(uv_pyl, 5.4, 30.0, (47.0, yf - 4.05, FH - 4.0))
    # the hoarding (fills the left of the facade)
    HX0, HX1, HZ0, HZ1 = -47.0, 8.0, 15.0, 43.0
    frame_hi(P, 'hoard', HX0, HX1, HZ0, HZ1, yf - 1.0, steel, back=1.2, lights=6)
    lo.append(S('s_hoard', HX0 - 0.9, HX1 + 0.9, yf - 1.7, yf + 0.2, HZ0 - 0.9, HZ1 + 0.9))
    sh.quad(uv_film, HX1 - HX0, HZ1 - HZ0, ((HX0 + HX1) / 2, yf - 1.8, (HZ0 + HZ1) / 2))
    # canopy over the entrance with DEVI 70MM above it
    P.append(B('canopy', -12, 43.5, -32.0, yf, 9.0, 10.4, wall))
    P.append(B('canopy_f', -12.2, 43.7, -32.3, -31.8, 8.8, 10.8, blue))
    lo.append(S('s_canopy', -12.3, 43.8, -32.4, yf, 8.7, 10.9))
    uv_mq = sh.put(marquee_cv(56, pw=448, ph=16, rows=1))
    sh.quad(uv_mq, 55.9, 1.9, (15.75, -32.45, 9.8))
    uv_name = sh.put(text_cv('DEVI 70MM', 320, 48, '#ffffff', BLUE, size=0.84, border='#ffd76a'))
    P.append(B('name_bd', 15.0, 40.0, yf - 0.9, yf, 10.6, 13.6, blue))
    lo.append(S('s_name', 14.9, 40.1, yf - 1.0, yf, 10.5, 13.7))
    sh.quad(uv_name, 24.6, 2.9, (27.5, yf - 1.05, 12.1))
    sh.quad(uv_tix, 7.0, 1.4, (-33.4, yf - 0.1, 8.2))
    P.append(L.steps('steps', 50, 1.2, 0.4, 4, (15.0, -30.6, 0), stone))
    lo.append(ramp_lo('s_steps', -10, 40, -33.0, yf, 1.6))
    finish(A, P, lo, sh, 448)
    L.shots(A, az=-30, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 5. Gokul Chat (Koti)
def build_gokul_chat(A):
    """Gokul Chat, Koti: a narrow, weathered three-storey building; the open ground-floor snack
    counter (stainless steel counters, rows of glass jars of namkeen and sweets, shelves behind),
    a sloping green awning, the plain GOKUL CHAT board, tube lights that glow at night, sunshade
    chajjas over the upper windows and the black water tank on the roof."""
    C._ASSET[0] = A.id
    WALL, GREEN = '#e3d39c', '#2f7a4a'
    wall = lin_mat('gk_wall', WALL)
    green = lin_mat('gk_green', GREEN)
    steel = kit.material('steel', 'gk_steel', base='#c9ccd0', rough=0.35, metal=0.0)
    dark = lin_mat('gk_dark', '#2e2822')
    conc = lin_mat('gk_conc', '#b3ad9f', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 256, 96)
    yf = -8.0
    H = 36.0
    # upper floors (the ground floor is the open shop)
    G = 13.2
    f = Fac(32, H - G, WALL, seed=5, noise=0.0)
    for z in (21.5, 31.0):
        f.band(z - G - 3.2, z - G - 2.6, '#cfc08a')
    rng = np.random.default_rng(4)
    for _ in range(40):         # monsoon stains
        x = rng.random() * 32
        f.rect(x, rng.random() * 18, x + 0.4 + rng.random(), H - G - 0.5, '#5a5040', 0.08)
    for fl, z in enumerate((21.5, 31.0)):
        for i in range(3):
            x = 5 + i * 11
            f.rect(x - 3.0, z - G - 2.0, x + 3.0, z - G + 2.4, '#30383c')
            for g in range(4):
                f.rect(x - 3.0 + g * 1.9, z - G - 2.0, x - 2.85 + g * 1.9, z - G + 2.4, '#7a8a6a')
    P.append(fbox('bldg', 0, (yf + 12) / 2, 32, 12 - yf, G, H, wall, faces={'f': f, 'l': Fac(20, H - G, WALL, seed=6, noise=0.0).dirt(2.0, alpha=0.1), 'r': Fac(20, H - G, WALL, seed=7, noise=0.0).dirt(2.0, alpha=0.1)}))
    side = Fac(20, G, WALL, seed=8, noise=0.0).dirt(2.0, alpha=0.3)
    P.append(fbox('gbody', 0, (yf + 4.4 + 12) / 2, 32, 12 - yf - 4.4, 0, G, wall, faces={'l': side, 'r': side}, top=False))
    for sx in (-1, 1):
        P.append(B('pier', 15.0 * sx - 0.5 + 0.5 * sx, 15.0 * sx + 0.5 + 0.5 * sx, yf, yf + 4.4, 0, G, wall))
    P.append(B('ceiling', -16, 16, yf, yf + 4.4, G - 0.6, G, dark))
    P.append(B('beam', -16, 16, yf - 0.3, yf + 0.3, G - 1.6, G, wall))
    P.append(B('parapet', -16.2, 16.2, yf - 0.2, 12, H, H + 1.4, wall))
    lo.append(S('s_bldg', -16.1, 16.1, yf - 0.1, 12, 0, H + 1.5))
    for z in (24.4, 33.9):     # chajjas
        P.append(B('chajja', -15.5, 15.5, yf - 1.6, yf, z - 0.5, z, conc))
    for z in (24.4, 33.9):
        lo.append(S('s_chajja', -15.6, 15.6, yf - 1.7, yf, z - 0.6, z + 0.1))
    P.append(cylinder('tank', 2.4, 4.0, (9, 6, H), seg=10, mat=lin_mat('gk_tank', '#1e1e1e', 0.5)))
    lo.append(cylinder('s_tank', 2.5, 4.1, (9, 6, H), seg=6, cap=True))
    # the open shop: tiled back wall, steel shelves of jars, the steel counter with glass jars, the awning
    tile = Fac(30, G, '#e6e4d8', seed=3, noise=0.0)
    for x in np.arange(0, 30, 1.2):
        tile.rect(x, 0, x + 0.06, G, '#b8b6a8')
    for z in np.arange(0, G, 1.2):
        tile.rect(0, z, 30, z + 0.06, '#b8b6a8')
    tile.rect(0, 0, 30, 2.0, '#6a5a48')
    P.append(C.img_quad('shop_back', tile.image(A.id + '_tile'), 30, G, (0, yf + 4.38, G / 2)))
    jar_cols = ['#e8b84a', '#e86a2a', '#c8402a', '#f2e0a0', '#8ab84a', '#d89a5a']
    jars = [lin_mat('gk_jar%d' % k, c, 0.3) for k, c in enumerate(jar_cols)]
    for r, z in enumerate((5.0, 7.6, 10.2)):
        P.append(B('shelf', -14, 14, yf + 3.3, yf + 4.3, z - 0.3, z, steel))
        for i in range(14):
            P.append(cylinder('sjar', 0.45, 1.6, (-13 + i * 2.0, yf + 3.8, z), seg=6, mat=jars[(i + r) % 6]))
    P.append(B('counter', -14.6, 14.6, yf - 3.2, yf - 0.6, 0, 3.6, steel))
    P.append(B('counter_top', -14.8, 14.8, yf - 3.4, yf - 0.4, 3.6, 3.9, steel))
    P.append(B('counter_kick', -14.6, 14.6, yf - 3.3, yf - 3.1, 0, 0.6, dark))
    for i in range(12):
        x = -13.2 + i * 2.4
        P.append(cylinder('jar', 0.62, 1.7, (x, yf - 1.9, 3.9), seg=8, mat=jars[i % 6]))
        P.append(cylinder('lid', 0.5, 0.3, (x, yf - 1.9, 5.6), seg=8, mat=lin_mat('gk_lid', '#c03a2a')))
    lo.append(S('s_counter', -14.9, 14.9, yf - 3.5, yf - 0.1, 0, 5.9))
    aw = prism_from_outline('awning', [(yf + 0.2, 13.0), (yf - 4.0, 11.2), (yf - 4.0, 10.4), (yf - 3.8, 10.4), (yf + 0.2, 12.4)], 32.4, axis='X', mat=green)
    P.append(aw)
    for x in np.arange(-15.5, 16, 2.0):
        P.append(prism_from_outline('aw_stripe', [(yf + 0.15, 13.05), (yf - 4.05, 11.25), (yf - 4.05, 10.7), (yf + 0.15, 12.5)], 0.9, axis='X', center=(x, 0, 0), mat=lin_mat('gk_white', '#f0eee4')))
    lo.append(side_prism('s_awning', [(yf + 0.1, 13.2), (yf - 4.2, 11.35), (yf - 4.2, 10.3), (yf + 0.1, 12.2)], -16.3, 16.3, bottom=True))
    # the board and the tube lights
    uv_sign = sh.put(text_cv('GOKUL CHAT', 224, 40, '#c8201a', '#fff8e0', size=0.86, border='#2f7a4a', bw=0.08))
    P.append(B('sign_bd', -14.0, 14.0, yf - 0.8, yf, 13.5, 17.7, green))
    lo.append(S('s_sign', -14.1, 14.1, yf - 0.9, yf, 13.4, 17.8))
    sh.quad(uv_sign, 27.4, 3.9, (0, yf - 0.95, 15.6))
    tube = Canvas(32, 8, '#f4fbff')
    tube.rect(0, 0, 1, 0.15, '#a8b8c0').rect(0, 0.85, 1, 1, '#a8b8c0')
    uv_t = sh.put(tube)
    for x in (-9.0, 0.0, 9.0):
        sh.quad(uv_t, 4.0, 0.35, (x, yf - 3.9, 10.2), tilt=-PI / 2 + 0.4)
        sh.quad(uv_t, 4.0, 0.3, (x, yf + 2.0, 12.3), tilt=-PI / 2)
    for x in (-10.0, 10.0):
        sh.quad(uv_t, 4.4, 0.4, (x, yf - 1.0, 18.3))
    for x in (-10.0, 0.0, 10.0):       # tubes on the shop's front beam, under the awning
        sh.quad(uv_t, 4.6, 0.5, (x, yf - 0.25, 9.9))
    P.append(B('step', -16, 16, -12.0, yf - 3.4, 0, 0.35, conc))
    finish(A, P, lo, sh, 288, ao=4.0)
    L.shots(A, az=-25, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 4, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 6. Paradise
def build_paradise(A):
    """Paradise restaurant, Paradise Circle (2003): a modest white three-storey corner building
    with green bands; the glazed ground floor (warm lit inside at night) under a green awning,
    the PARADISE fascia, the BIRYANI board and the big PARADISE name on the steel rooftop frame."""
    C._ASSET[0] = A.id
    WALL, GREEN, RED = '#f1ede2', '#1f7a3a', '#c0201a'
    wall = lin_mat('pd_wall', WALL)
    green = lin_mat('pd_green', GREEN)
    steel = lin_mat('pd_steel', '#55595e', 0.6)
    conc = lin_mat('pd_conc', '#b3ad9f', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 512, 192)
    yf, H = -17.0, 33.0
    def upper(w, seed):
        f = Fac(w, H, WALL, seed=seed, noise=0.0)
        f.dirt(2.0, alpha=0.2)
        f.band(H - 1.5, H, GREEN).band(12.2, 13.4, GREEN)
        n = max(2, int(w / 7))
        for z in (17.5, 26.5):
            for i in range(n):
                x = (i + 0.5) * w / n
                f.rect(x - 2.0, z - 2.2, x + 2.0, z + 2.6, '#33424a').rect(x - 2.3, z - 2.6, x + 2.3, z - 2.2, GREEN)
                f.rect(x - 0.08, z - 2.2, x + 0.08, z + 2.6, '#d8d8d0')
        f.rect(0, 0, w, 12.2, '#2c3438')
        return f
    P.append(fbox('bldg', 0, (yf + 20) / 2, 60, 20 - yf, 0, H, wall, faces={'f': upper(60, 3), 'l': upper(37, 4), 'r': upper(37, 5), 'b': upper(60, 6)}))
    P.append(B('parapet', -30.2, 30.2, yf - 0.2, 20, H, H + 1.6, wall))
    P.append(B('par_band', -30.4, 30.4, yf - 0.4, yf + 0.4, H + 1.0, H + 1.6, green))
    lo.append(S('s_bldg', -30.1, 30.1, yf - 0.1, 20.1, 0, H + 1.7))
    for z in (21.0, 30.0):
        P.append(B('chajja', -29.5, 29.5, yf - 1.2, yf, z - 0.4, z, wall))
    # ground floor: lit glazing (sheet), mullions, the awning, the fascia
    gl = Canvas(256, 48, '#2a3438')
    gl.rect(0, 0, 1, 1, '#c8a46a', 0.55)
    for i in range(14):
        x = (i + 0.5) / 14
        gl.rect(x - 0.022, 0.06, x + 0.022, 0.62, '#8a5a3a', 0.55).ellipse(x, 0.8, 0.02, 0.07, '#fff0c0', 0.9)
    for i in range(9):
        gl.rect(i / 8 - 0.004, 0, i / 8 + 0.004, 1, '#9aa0a4')
    gl.rect(0, 0.0, 1, 0.04, '#9aa0a4').rect(0, 0.96, 1, 1, '#9aa0a4')
    uv_gl = sh.put(gl)
    sh.quad(uv_gl, 56.0, 10.4, (0, yf - 0.16, 5.6))
    for x in np.arange(-28, 28.1, 7.0):
        P.append(B('mull', x - 0.3, x + 0.3, yf - 0.5, yf, 0.4, 11.0, wall))
    aw = prism_from_outline('awning', [(yf + 0.1, 12.6), (yf - 3.0, 11.0), (yf - 3.0, 10.4), (yf + 0.1, 12.0)], 58.0, axis='X', mat=green)
    P.append(aw)
    lo.append(side_prism('s_awning', [(yf + 0.1, 12.8), (yf - 3.2, 11.1), (yf - 3.2, 10.3), (yf + 0.1, 11.8)], -29.2, 29.2, bottom=True))
    uv_fas = sh.put(text_cv('PARADISE', 288, 48, '#ffffff', GREEN, size=0.86, border='#f2c230'))
    P.append(B('fascia', -15.0, 15.0, yf - 0.8, yf, 13.4, 18.4, green))
    lo.append(S('s_fascia', -15.1, 15.1, yf - 0.9, yf, 13.3, 18.5))
    sh.quad(uv_fas, 29.4, 4.6, (0, yf - 0.95, 15.9))
    uv_bir = sh.put(text_cv('BIRYANI', 192, 48, RED, '#fff8e0', size=0.84, border=GREEN, bw=0.07))
    for sx in (-1, 1):
        P.append(B('bir_bd', sx * 22.5 - 6.6, sx * 22.5 + 6.6, yf - 0.8, yf, 13.6, 17.8, green))
        lo.append(S('s_bir', sx * 22.5 - 6.7, sx * 22.5 + 6.7, yf - 0.9, yf, 13.5, 17.9))
        sh.quad(uv_bir, 12.6, 3.6, (sx * 22.5, yf - 0.95, 15.7))
    # rooftop frame with PARADISE
    RZ0, RZ1, ry = H + 3.0, H + 11.0, -10.0
    frame_hi(P, 'roofsign', -22, 22, RZ0, RZ1, ry, steel, back=0.8, lights=4)
    for x in (-18, -6, 6, 18):
        P.append(B('rleg', x - 0.35, x + 0.35, ry - 0.3, ry + 0.4, H, RZ0, steel))
        P.append(kit.tube('rbrace', [(x, ry + 0.1, RZ0 - 0.4), (x, ry + 5.0, H + 0.2)], 0.2, seg=4, mat=steel))
    lo.append(S('s_roofsign', -22.9, 22.9, ry - 0.7, ry + 0.9, RZ0 - 0.9, RZ1 + 0.9))
    for x in (-18, -6, 6, 18):
        lo.append(S('s_rleg', x - 0.45, x + 0.45, ry - 0.4, ry + 0.5, H + 1.6, RZ0 - 0.8))
    uv_roof = sh.put(text_cv('PARADISE', 384, 72, '#ffffff', RED, size=0.88, border='#ffffff', bw=0.05))
    sh.quad(uv_roof, 44.0, 8.0, (0, ry - 0.85, (RZ0 + RZ1) / 2))
    P.append(B('step', -29, 29, -20.0, yf - 3.2, 0, 0.35, conc))
    P.append(B('kerb', -30, 30, -20.0, -19.4, 0, 0.5, conc))
    finish(A, P, lo, sh, 320, ao=5.0)
    L.shots(A, az=-30, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 7. Secunderabad Clock Tower
def build_clock_tower(A):
    """Secunderabad Clock Tower (1897): the tall square stone tower on a stepped base in its
    small garden; cream shaft with reddish-brown corner pilasters, string courses and slit
    windows, the clock stage with four dials (glow at night) under a heavy cornice, and the
    small cupola with its finial."""
    C._ASSET[0] = A.id
    CR, RB, TR = '#e6d5ae', '#8e4630', '#f2e6c8'
    cream = lin_mat('ct_cream', CR)
    rb = lin_mat('ct_rb', RB)
    trim = lin_mat('ct_trim', TR)
    grass = kit.material('wood_green', 'ct_lawn', base='#4f8a3a', chips=0.0, grain=0.15, var=0.15, rough=0.9, grime=0.2, scale=0.6)
    stone = lin_mat('ct_stone', '#b8ad98', 0.9)
    hedge = lin_mat('ct_hedge', '#2f6a2c')
    P, lo = [], []
    sh = Sheet(A.id, 128, 128)
    # garden: lawn, hedge border, paths
    P.append(B('lawn', -9, 9, -9, 9, 0, 0.3, grass))
    for (x0, x1, y0, y1) in ((-9, 9, -9, -8.2), (-9, 9, 8.2, 9), (-9, -8.2, -8.2, 8.2), (8.2, 9, -8.2, 8.2)):
        P.append(B('hedge', x0, x1, y0, y1, 0.3, 1.3, hedge))
    P.append(B('path', -1.4, 1.4, -9.1, -5, 0, 0.36, stone))
    lo.append(S('s_lawn', -9.1, 9.1, -9.1, 9.1, 0, 1.4))
    # stepped base
    for k, (hw, z0, z1) in enumerate(((7.6, 0.3, 1.3), (6.9, 1.3, 2.3), (6.3, 2.3, 6.0))):
        P.append(B('base%d' % k, -hw, hw, -hw, hw, z0, z1, stone if k < 2 else rb))
    lo.append(S('s_base1', -7.7, 7.7, -7.7, 7.7, 1.3, 2.3))
    lo.append(S('s_base2', -6.4, 6.4, -6.4, 6.4, 2.3, 6.1))
    # the shaft
    Z0, Z1 = 6.0, 80.0
    hw = 5.0

    def shaft_face(seed):
        f = Fac(2 * hw, Z1 - Z0, CR, seed=seed, noise=0.0)
        f.dirt(3.0, alpha=0.25)
        f.rect(0, 0, 0.9, f.h, RB).rect(2 * hw - 0.9, 0, 2 * hw, f.h, RB)
        for z in (14.0, 34.0, 54.0):
            f.band(z, z + 0.8, RB)
        f.arch(hw, 0.0, 3.4, 7.5, '#3a2a22', 'round', frame=TR, fw=0.5)
        for z in (19.0, 39.0, 59.0):
            f.arch(hw, z, 1.4, 6.0, '#2a221c', 'round', frame=TR, fw=0.4)
        for z in (4.0, 24.0, 44.0, 64.0):
            f.rect(0.9, z, 2 * hw - 0.9, z + 0.25, '#d4c296')
        f.band(f.h - 1.2, f.h, TR)
        return f
    P.append(fbox('shaft', 0, 0, 2 * hw, 2 * hw, Z0, Z1, cream, faces={k: shaft_face(i + 2) for i, k in enumerate('fblr')}))
    for z in (Z0 + 14.0, Z0 + 34.0, Z0 + 54.0):
        P.append(B('course', -hw - 0.35, hw + 0.35, -hw - 0.35, hw + 0.35, z, z + 0.8, rb))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(B('pil', sx * hw - 0.7, sx * hw + 0.7, sy * hw - 0.7, sy * hw + 0.7, Z0, Z1, rb))
    lo.append(S('s_shaft', -hw - 0.5, hw + 0.5, -hw - 0.5, hw + 0.5, Z0, Z1))
    # clock stage (a little wider), dials, cornice
    cw = 5.8
    C0, C1 = 80.0, 93.0
    P.append(B('stage_band', -cw - 0.3, cw + 0.3, -cw - 0.3, cw + 0.3, C0 - 0.8, C0, rb))
    P.append(fbox('stage', 0, 0, 2 * cw, 2 * cw, C0, C1, cream))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(B('cpil', sx * cw - 0.7, sx * cw + 0.7, sy * cw - 0.7, sy * cw + 0.7, C0, C1, rb))
    P.append(B('cornice1', -cw - 0.9, cw + 0.9, -cw - 0.9, cw + 0.9, C1, C1 + 0.8, trim))
    P.append(B('cornice2', -cw - 1.4, cw + 1.4, -cw - 1.4, cw + 1.4, C1 + 0.8, C1 + 1.6, rb))
    lo.append(S('s_band', -cw - 0.4, cw + 0.4, -cw - 0.4, cw + 0.4, C0 - 0.9, C0))
    lo.append(S('s_stage', -cw - 0.75, cw + 0.75, -cw - 0.75, cw + 0.75, C0, C1))
    lo.append(S('s_cornice', -cw - 1.5, cw + 1.5, -cw - 1.5, cw + 1.5, C1, C1 + 1.7))
    dial = Canvas(128, 128, '#5a3020')
    dial.ellipse(0.5, 0.5, 0.48, 0.48, '#2a2018').ellipse(0.5, 0.5, 0.44, 0.44, '#fbf6e6')
    for h in range(12):
        a = 2 * PI * h / 12
        x, y = 0.5 + 0.37 * math.sin(a), 0.5 + 0.37 * math.cos(a)
        dial.line(0.5 + 0.31 * math.sin(a), 0.5 + 0.31 * math.cos(a), x, y, 0.022 if h % 3 else 0.035, '#1a1410')
    dial.line(0.5, 0.5, 0.5 + 0.2 * math.sin(2 * PI * 10 / 12), 0.5 + 0.2 * math.cos(2 * PI * 10 / 12), 0.03, '#1a1410')
    dial.line(0.5, 0.5, 0.5 + 0.32 * math.sin(2 * PI * 2 / 12), 0.5 + 0.32 * math.cos(2 * PI * 2 / 12), 0.02, '#1a1410')
    dial.ellipse(0.5, 0.5, 0.03, 0.03, '#1a1410')
    uv_d = sh.put(dial)
    for k in range(4):
        rz = k * PI / 2
        d = cw + 0.8
        sh.quad(uv_d, 8.4, 8.4, (d * math.sin(rz), -d * math.cos(rz), (C0 + C1) / 2), rz=rz)
    # cupola: square drum with arches, the dome, the finial
    D0, D1 = C1 + 1.6, C1 + 6.6
    dw = 3.6
    df = Fac(2 * dw, D1 - D0, CR, seed=9, noise=0.0)
    df.arch(dw, 0.6, 2.2, 3.6, '#2a221c', 'round', frame=TR, fw=0.3)
    P.append(fbox('drum', 0, 0, 2 * dw, 2 * dw, D0, D1, cream, faces={k: df for k in 'fblr'}))
    P.append(B('drum_cap', -dw - 0.4, dw + 0.4, -dw - 0.4, dw + 0.4, D1, D1 + 0.6, rb))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(lathe('urn', [(0.4, C1 + 1.6), (0.55, C1 + 2.4), (0.3, C1 + 3.2), (0.0, C1 + 3.8)], seg=6, mat=trim, loc=(sx * (cw + 0.6), sy * (cw + 0.6), 0)))
            lo.append(lathe('s_urn', [(0.6, C1 + 1.6), (0.6, C1 + 2.6), (0.0, C1 + 3.9)], seg=4, loc=(sx * (cw + 0.6), sy * (cw + 0.6), 0), close_bottom=False))
    prof = [(dw * 1.05 * math.cos(a), D1 + 0.6 + 4.2 * math.sin(a)) for a in [PI / 2 * i / 6 for i in range(6)]] + [(0.0, D1 + 4.8)]
    P.append(lathe('dome', prof, seg=16, mat=rb, close_bottom=False))
    P.append(lathe('finial', [(0.5, D1 + 4.6), (0.6, D1 + 5.4), (0.25, D1 + 6.4), (0.4, D1 + 7.0), (0.12, D1 + 8.0), (0.0, D1 + 9.6)], seg=6, mat=lin_mat('ct_gold', '#b8902a', 0.5)))
    lo.append(S('s_drum', -dw - 0.5, dw + 0.5, -dw - 0.5, dw + 0.5, D0, D1 + 0.7))
    lo.append(lathe('s_dome', [(dw * 1.12, D1 + 0.6), (dw * 1.0, D1 + 2.4), (dw * 0.6, D1 + 4.2), (0.0, D1 + 4.95)], seg=8, close_bottom=False))
    lo.append(lathe('s_finial', [(0.65, D1 + 4.6), (0.45, D1 + 6.6), (0.0, D1 + 9.7)], seg=4, close_bottom=False))
    finish(A, P, lo, sh, 256, ao=3.0)
    L.shots(A, az=-35, el=12, extra=[{'name': 'top', 'view': {'az': -20, 'el': 6, 'fov': 18, 'target': (0, 0, 92), 'dist': 70}}])


# =========================================================================== buses (Koti, MGBS)
def bus_mats(tag, livery=('#b22b2b', '#e4dccb')):
    s = Canvas(256, 64, livery[0])
    s.rect(0, 0.0, 1, 0.12, '#2a2a2a')
    s.rect(0, 0.46, 1, 0.56, livery[1])
    s.rect(0, 0.92, 1, 1.0, livery[1])
    for i in range(10):
        x = 0.02 + (i + 0.5) * 0.096
        s.rect(x - 0.04, 0.58, x + 0.04, 0.9, '#26323a')
    s.rect(0.06, 0.12, 0.14, 0.86, '#3a2a22')
    s.ellipse(0.2, 0.08, 0.05, 0.16, '#1a1a1a').ellipse(0.8, 0.08, 0.05, 0.16, '#1a1a1a')
    s.noise(0.06)
    f = Canvas(64, 64, livery[0])
    f.rect(0.05, 0.42, 0.95, 0.80, '#2c3a44').rect(0.10, 0.82, 0.90, 0.97, '#ffd23a')
    f.rect(0.0, 0.32, 1.0, 0.38, livery[1])
    f.ellipse(0.15, 0.2, 0.07, 0.06, '#fff4c0').ellipse(0.85, 0.2, 0.07, 0.06, '#fff4c0')
    f.rect(0.0, 0.0, 1.0, 0.08, '#2a2a2a')
    return s.mat('bus_side_' + tag), f.mat('bus_front_' + tag)


def bus(P, lo, name, x, y, rz, side, front, body):
    """an APSRTC bus (front of the bus at -Y before turning): hi box + painted sides; lo box"""
    L_, W_, H_ = 60.0, 16.6, 17.0
    parts = [box(name, (W_, L_, H_), (0, 0, 1.6), body, base=True)]
    parts.append(decal(name + '_l', side, L_, H_, (-W_ / 2 - 0.05, 0, 1.6 + H_ / 2), rz=-PI / 2))
    parts.append(decal(name + '_r', side, L_, H_, (W_ / 2 + 0.05, 0, 1.6 + H_ / 2), rz=PI / 2))
    parts.append(decal(name + '_f', front, W_, H_, (0, -L_ / 2 - 0.05, 1.6 + H_ / 2)))
    parts.append(decal(name + '_b', front, W_, H_, (0, L_ / 2 + 0.05, 1.6 + H_ / 2), rz=PI))
    P.append(L.place(kit.join(parts, name), (x, y, 0), rz))
    lo.append(L.place(blk('s_' + name, 0, 0, W_ + 0.2, L_ + 0.2, 0.4, 1.7 + H_, None), (x, y, 0), rz))


# =========================================================================== 8. Koti bus stand
def build_koti_bus_stand(A):
    """Koti city bus terminus: the long bay shelter on its raised kerbed platform (back wall with
    timetable boards, cream columns, the sloping asbestos roof, red fascia with the route
    boards), an island shelter, two red APSRTC city buses in the bays, the enquiry kiosk and the
    KOTI board on its posts at the gate. Route boards / KOTI / tube lights on the sheet."""
    C._ASSET[0] = A.id
    cream = lin_mat('koti_cream', '#e6dcc0')
    asb = lin_mat('koti_asb', '#a3a7a8', 0.9)
    red = lin_mat('koti_red', '#b22b2b')
    kerb = lin_mat('koti_kerb', '#d8d2c2', 0.9)
    conc = lin_mat('koti_conc', '#b7b2a8', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 512, 192)
    RZ = 20.0
    # main shelter along -X
    P.append(B('plat', -31, -15, -42, 44, 0, 1.3, conc))
    P.append(B('kerb', -15.4, -14.6, -42, 44, 0, 1.5, kerb))
    lo.append(S('s_plat', -31.0, -14.5, -42.1, 44.1, 0, 1.55))
    bw = Canvas(512, 64, '#e6dcc0')
    for i in range(8):
        x = (i + 0.5) / 8
        bw.rect(x - 0.035, 0.42, x + 0.035, 0.82, '#1d3f8a').rect(x - 0.03, 0.46, x + 0.03, 0.78, '#f4f2ea')
        bw.rect(x - 0.025, 0.66, x + 0.025, 0.72, '#1d3f8a').rect(x - 0.025, 0.54, x + 0.02, 0.58, '#555555')
    bw.rect(0, 0, 1, 0.12, '#8a8478').noise(0.05)
    P.append(B('backwall', -31, -29.8, -42, 44, 1.3, RZ + 2.2, cream))
    P.append(decal('backwall_pic', bw.mat('koti_backwall'), 86, RZ + 0.9, (-29.75, 1, 1.3 + (RZ + 0.9) / 2), rz=PI / 2))
    lo.append(S('s_backwall', -31.1, -29.7, -42.1, 44.1, 1.3, RZ + 2.0))
    for i in range(7):
        y = -38 + i * 13.5
        P.append(B('col', -17.2, -16.0, y - 0.6, y + 0.6, 1.3, RZ, cream))
        lo.append(tri_col('s_col', -16.6, y, 1.0, 1.4, RZ - 0.2))
    rf = [(-32.5, RZ + 2.6), (-13.5, RZ + 0.4), (-13.5, RZ - 0.2), (-32.5, RZ + 2.0)]
    P.append(prism_from_outline('roof', rf, 88, center=(0, 1, 0), mat=asb))
    for y in np.arange(-42, 45, 3.0):
        P.append(prism_from_outline('corr', [(-32.6, RZ + 2.62), (-13.4, RZ + 0.42), (-13.4, RZ + 0.3), (-32.6, RZ + 2.5)], 0.6, center=(0, y, 0), mat=lin_mat('koti_asb2', '#8e9294', 0.9)))
    lo.append(prism_from_outline('s_roof', [(-32.6, RZ + 2.75), (-13.4, RZ + 0.55), (-13.4, RZ - 0.3), (-32.6, RZ + 1.9)], 88.2, center=(0, 1, 0)))
    P.append(B('fascia', -14.2, -13.4, -43, 45, RZ - 1.6, RZ + 0.4, red))
    lo.append(S('s_fascia', -14.3, -13.3, -43.1, 45.1, RZ - 1.7, RZ + 0.5))
    rb = Canvas(512, 24, '#b22b2b')
    for i, t in enumerate(('SECUNDERABAD', 'CHARMINAR', 'MEHDIPATNAM', 'DILSUKHNAGAR')):
        x0 = 0.015 + i * 0.25
        rb.rect(x0, 0.08, x0 + 0.22, 0.92, '#ffffff').text(t, x0 + 0.005, 0.1, x0 + 0.215, 0.9, '#1a3a8a', size=0.8)
    uv_rb = sh.put(rb)
    sh.quad(uv_rb, 88, 1.8, (-13.25, 1, RZ - 0.6), rz=PI / 2)
    P.append(B('bench', -28.6, -26.4, -36, 38, 1.3, 3.4, conc))
    lo.append(S('s_bench', -28.7, -26.3, -36.1, 38.1, 1.3, 3.5))
    tube = Canvas(32, 8, '#f4fbff')
    tube.rect(0, 0, 1, 0.15, '#a8b8c0').rect(0, 0.85, 1, 1, '#a8b8c0')
    uv_t = sh.put(tube)
    for y in np.arange(-34, 40, 13.5):
        sh.quad(uv_t, 0.5, 4.0, (-23.7, y + 6.7, RZ + 0.95), tilt=PI / 2, uvq=((uv_t[0], uv_t[1]), (uv_t[0], uv_t[3]), (uv_t[2], uv_t[3]), (uv_t[2], uv_t[1])))
    # island shelter
    P.append(B('isl', 2.6, 11.4, -30, 40, 0, 1.3, kerb))
    lo.append(S('s_isl', 2.5, 11.5, -30.1, 40.1, 0, 1.4))
    for i in range(4):
        y = -24 + i * 19
        P.append(B('icol', 6.4, 7.6, y - 0.6, y + 0.6, 1.3, RZ - 0.4, cream))
        lo.append(tri_col('s_icol', 7.0, y, 1.0, 1.4, RZ - 0.6))
    irf = [(0.0, RZ + 1.6), (14.0, RZ - 0.2), (14.0, RZ - 0.7), (0.0, RZ + 1.1)]
    P.append(prism_from_outline('iroof', irf, 72, center=(0, 5, 0), mat=asb))
    lo.append(prism_from_outline('s_iroof', [(-0.1, RZ + 1.75), (14.1, RZ - 0.05), (14.1, RZ - 0.8), (-0.1, RZ + 1.0)], 72.2, center=(0, 5, 0)))
    P.append(B('ifascia', 13.4, 14.2, -31, 41, RZ - 2.0, RZ - 0.2, red))
    lo.append(S('s_ifascia', 13.3, 14.3, -31.1, 41.1, RZ - 2.1, RZ - 0.1))
    sh.quad(uv_rb, 72, 1.6, (14.35, 5, RZ - 1.1), rz=PI / 2)
    # buses
    side, front = bus_mats('koti')
    bus(P, lo, 'bus1', -5.6, -10, 0, side, front, red)
    bus(P, lo, 'bus2', 21.8, 8, PI, side, front, red)
    # enquiry kiosk near the gate (front -Y)
    P.append(B('kiosk', -11, -3, -45, -38, 0, 10, cream))
    P.append(B('kiosk_roof', -12, -2, -46.2, -37, 10, 11, red))
    kk = Canvas(64, 64, '#e6dcc0')
    kk.rect(0.1, 0.1, 0.9, 0.62, '#2a3640').rect(0.15, 0.15, 0.85, 0.3, '#5a6a72').noise(0.05)
    P.append(decal('kiosk_f', kk.mat('koti_kiosk'), 8, 10, (-7, -45.05, 5)))
    lo.append(S('s_kiosk', -11.1, -2.9, -45.1, -37.9, 0, 10.0))
    lo.append(S('s_kroof', -12.1, -1.9, -46.3, -36.9, 10, 11.1))
    uv_enq = sh.put(text_cv('ENQUIRY', 128, 24, '#ffffff', '#1d3f8a', size=0.84))
    sh.quad(uv_enq, 7.0, 1.4, (-7, -45.2, 8.6))
    # the KOTI board on two posts at the gate
    for x in (12, 28):
        P.append(B('post', x - 0.6, x + 0.6, -44.6, -43.4, 0, 17, red))
        lo.append(tri_col('s_post', x, -44.0, 1.0, 0, 16.6))
    P.append(B('pylon', 10.5, 29.5, -44.8, -43.2, 16.5, 26, cream))
    lo.append(S('s_pylon', 10.4, 29.6, -44.9, -43.1, 16.4, 26.1))
    ks = Canvas(256, 120, '#ffffff')
    ks.rect(0, 0, 1, 0.06, '#b22b2b').rect(0, 0.94, 1, 1, '#b22b2b')
    ks.text('KOTI', 0.05, 0.36, 0.95, 0.92, '#b22b2b', size=0.9).text('BUS STAND', 0.15, 0.08, 0.85, 0.34, '#1a3a8a', size=0.8)
    uv_k = sh.put(ks)
    sh.quad(uv_k, 19, 9.5, (20, -44.95, 21.25))
    finish(A, P, lo, sh, 352, ao=6.0)
    L.col_box('koti_wall', (2, 86, RZ), (-30.4, 1, 0))
    L.shots(A, az=-40, el=24, extra=[{'name': 'front', 'view': {'az': -10, 'el': 12, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 9. MGBS (Imlibun)
def build_mgbs(A):
    """Mahatma Gandhi Bus Station (1994): the long two-storey entrance block on the road (north)
    with its raised centre, the red-pillared porch and the MAHATMA GANDHI BUS STATION board, and
    behind it the platform halls under the row of repeated white concrete canopies on columns
    (peaked gable section with folded plates: NOT barrel vaults, which read as the Gowliguda hangar), whose
    gabled ends rise over the block; platforms with kerbs and long-distance buses. The red is kept
    to thin lines (cornice line, pillar strips) so the block reads as a bus station, not a mall."""
    C._ASSET[0] = A.id
    CREAM = '#d8cdb4'
    cream = lin_mat('mgbs_cream', CREAM)
    red = lin_mat('mgbs_red', '#b22b2b')
    conc = lin_mat('mgbs_conc', '#a8a398', 0.9)
    shell = L.paint('#e8e4da', 'mgbs_shell', rough=0.9, grime=0.25, streaks=0.3, dirt='#8f897c')
    under = lin_mat('mgbs_under', '#c8c3b6', 0.9)
    fold = lin_mat('mgbs_fold', '#d2cdc1', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 512, 96)
    FY = -54.0
    # entrance block
    def side_fac(w, seed):
        f = Fac(w, 22, CREAM, seed=seed, noise=0.0)
        f.dirt(2.5, alpha=0.3).band(10.65, 10.95, '#b22b2b')
        n = max(1, int(w / 6))
        for i in range(n):
            x = (i + 0.5) * w / n
            f.rect(x - 1.6, 2.0, x + 1.6, 8.6, '#3a3f44').rect(x - 1.8, 13.0, x + 1.8, 18.6, '#56666e')
        rng = np.random.default_rng(seed)
        for _ in range(int(w / 2)):
            x = rng.random() * w
            f.rect(x, 6 + rng.random() * 10, x + 0.5, 21.5, '#000000', 0.06)
        return f
    P.append(fbox('block', 0, (FY - 28) / 2, 200, -28 - FY, 0, 22, cream, faces={'l': side_fac(26, 3), 'r': side_fac(26, 4), 'b': side_fac(200, 5)}))
    P.append(B('roof', -100, 100, FY + 1, -28, 22, 22.6, shell))
    P.append(B('parapet', -101, 101, FY - 0.6, FY + 1.0, 21.6, 24.4, cream))
    P.append(B('parapet_l', -101.1, 101.1, FY - 0.7, FY + 1.1, 22.3, 22.8, red))
    lo.append(S('s_block', -100.1, 100.1, FY - 0.7, -28, 0, 24.5))
    P.append(B('centre', -24, 24, FY - 2, -30, 0, 32, cream))
    P.append(B('centre_cap', -25, 25, FY - 2.6, -29.4, 32, 33.6, cream))
    P.append(B('centre_capl', -25.1, 25.1, FY - 2.7, -29.3, 32.4, 32.9, red))
    lo.append(S('s_centre', -25.1, 25.1, FY - 2.7, -29.3, 0, 33.7))
    fac = Canvas(1024, 112, CREAM)
    fac.rect(0, 0.49, 1, 0.51, '#b22b2b')
    for i in range(24):
        x = (i + 0.5) / 24
        fac.rect(x - 0.014, 0.0, x + 0.014, 0.40, '#3a3f44').ellipse(x, 0.40, 0.014, 0.06, '#3a3f44')
        fac.rect(x - 0.016, 0.60, x + 0.016, 0.86, '#56666e')
    fac.noise(0.05)
    fm = fac.mat('mgbs_fac')
    P.append(decal('fac_l', fm, 76, 22, (-62, FY - 0.05, 11)))
    P.append(decal('fac_r', fm, 76, 22, (62, FY - 0.05, 11)))
    cf = Canvas(256, 160, CREAM)
    for i in range(5):
        x = 0.05 + (i + 0.5) * 0.18
        cf.rect(x - 0.06, 0.05, x + 0.06, 0.45, '#3a3f44')
    for i in range(6):
        x = 0.05 + (i + 0.5) * 0.15
        cf.rect(x - 0.045, 0.75, x + 0.045, 0.95, '#56666e')
    cf.noise(0.05)
    P.append(decal('centre_f', cf.mat('mgbs_cf'), 48, 32, (0, FY - 2.05, 16)))
    # the name board (sheet) on a red board over the porch
    P.append(B('sign_bd', -23, 23, FY - 2.8, FY - 2.0, 21, 26, red))
    uv_n = sh.put(text_cv('MAHATMA GANDHI BUS STATION', 512, 48, '#b22b2b', '#ffffff', size=0.86, border='#b22b2b', bw=0.08))
    sh.quad(uv_n, 45.6, 4.4, (0, FY - 2.95, 23.5))
    # porch: canopy on four red pillars
    P.append(B('porch', -26, 26, -60, FY - 2, 11, 12.6, cream))
    P.append(B('porch_band', -26.4, 26.4, -60.4, -59.4, 12.6, 13.8, cream))
    P.append(B('porch_line', -26.5, 26.5, -60.5, -60.3, 13.0, 13.4, red))
    lo.append(S('s_porch', -26.5, 26.5, -60.5, FY - 2, 10.9, 13.9))
    for x in (-24, -8, 8, 24):
        P.append(B('pillar', x - 0.9, x + 0.9, -59.6, -57.8, 0, 11, cream))
        P.append(B('pillar_s', x - 0.35, x + 0.35, -59.75, -57.65, 0, 11, red))
        lo.append(tri_col('s_pillar', x, -58.7, 1.4, 0, 11))
    tube = Canvas(32, 8, '#f4fbff')
    tube.rect(0, 0, 1, 0.15, '#a8b8c0').rect(0, 0.85, 1, 1, '#a8b8c0')
    uv_t = sh.put(tube)
    for x in (-16, -5, 5, 16):
        sh.quad(uv_t, 5.0, 0.6, (x, -57.0, 10.85), tilt=-PI / 2)
    # platform halls: repeated white concrete canopies (along Y) on valley beams and columns: a
    # peaked, folded-plate section (two plates meeting at a ridge cap, each creased once, with
    # a deep eave fascia). The shipped shell is the plain gable (2 segments a side: no more than the old
    # vault's 3); the folds, ridge cap and soffit ribs are baked.
    NV, X0, X1, Y0, Y1 = 9, -99.0, 99.0, -29.0, 58.0
    vw = (X1 - X0) / NV
    spring, rise, t = 17.0, 9.0, 0.6
    for i in range(NV):
        cx = X0 + vw * (i + 0.5)
        h = vw / 2
        # (dx, dz) of the section (left half; mirrored): eave lip, fold kink, ridge
        half = [(-h, 0.0), (-h * 0.5, rise * 0.46), (0.0, rise)]
        sec = half + [(-dx, dz) for (dx, dz) in reversed(half[:-1])]
        outer = [(cx + dx, spring + t + dz) for (dx, dz) in sec]
        inner = [(cx + dx, spring + dz) for (dx, dz) in sec]
        P.append(prism_from_outline('canopy', outer + list(reversed(inner)), Y1 - Y0, center=(0, (Y0 + Y1) / 2, 0), mat=shell))
        # fold lines (shadowed creases) and the ridge cap
        for dx in (-h * 0.5, h * 0.5):
            P.append(B('fold', cx + dx - 0.3, cx + dx + 0.3, Y0, Y1, spring + t + rise * 0.46 - 0.05, spring + t + rise * 0.46 + 0.1, fold))
        for dx in (-h, h):
            P.append(B('eave', cx + dx - 0.35, cx + dx + 0.35, Y0, Y1, spring - 0.6, spring + t + 0.15, fold))
        P.append(B('ridge', cx - 0.5, cx + 0.5, Y0 - 0.2, Y1 + 0.2, spring + t + rise - 0.2, spring + t + rise + 0.35, shell))
        innr = [(x, z - 0.05) for (x, z) in inner]
        P.append(prism_from_outline('soffit', innr + [(x, z - 0.3) for (x, z) in reversed(innr)], Y1 - Y0 - 0.2, center=(0, (Y0 + Y1) / 2, 0), mat=under))
        for y in np.arange(Y0 + 6, Y1, 12.0):
            P.append(prism_from_outline('rib', [(x, z - 0.3) for (x, z) in inner] + [(x, z - 1.0) for (x, z) in reversed(inner)], 0.8, center=(0, y, 0), mat=conc))
        lo_o = [(cx - h, spring + t + 0.3), (cx, spring + t + rise + 0.4), (cx + h, spring + t + 0.3)]
        lo_i = [(cx - h, spring - 0.7), (cx, spring + rise - 0.4), (cx + h, spring - 0.7)]
        lo.append(vault_lo('s_vault', lo_o, lo_i, Y0 - 0.3, Y1 + 0.3))
    for i in range(NV + 1):
        x = X0 + vw * i
        P.append(B('beam', x - 1.0, x + 1.0, Y0, Y1, 15.0, spring + 0.2, conc))
        lo.append(vault_lo('s_beam', [], [(x - 1.15, spring + 0.3), (x - 1.15, 14.9), (x + 1.15, 14.9), (x + 1.15, spring + 0.3)], Y0 - 0.1, Y1 + 0.1))
        for y in (-6.0, 40.0):
            P.append(B('col', x - 0.8, x + 0.8, y - 0.8, y + 0.8, 0, 15.0, conc))
            lo.append(tri_col('s_col', x, y, 1.25, 0.0, 15.0))
    # platforms between the bays + strip lights
    for x in (-66, 0, 66):
        P.append(B('plat', x - 7, x + 7, -26, 56, 0, 1.3, conc))
        P.append(B('plat_k', x - 7.2, x + 7.2, -26.2, 56.2, 0, 0.5, lin_mat('mgbs_kerb', '#d8d2c2')))
        lo.append(S('s_plat', x - 7.3, x + 7.3, -26.3, 56.3, 0, 1.4))
        for y in np.arange(-20, 52, 14.0):
            sh.quad(uv_t, 0.6, 5.0, (x, y, 14.9), tilt=-PI / 2, uvq=((uv_t[0], uv_t[1]), (uv_t[0], uv_t[3]), (uv_t[2], uv_t[3]), (uv_t[2], uv_t[1])))
    # route boards on the platforms' first column row
    rb = Canvas(256, 24, '#1d3f8a')
    for i, t_ in enumerate(('KURNOOL', 'WARANGAL', 'TIRUPATI', 'VIJAYAWADA')):
        x0 = 0.01 + i * 0.25
        rb.rect(x0, 0.1, x0 + 0.23, 0.9, '#ffffff').text(t_, x0 + 0.005, 0.12, x0 + 0.225, 0.88, '#1d3f8a', size=0.8)
    uv_rb = sh.put(rb)
    for x in (-66, 0, 66):
        sh.quad(uv_rb, 13.0, 1.3, (x, -26.4, 11.4))
        P.append(B('rb_post', x - 0.2, x + 0.2, -26.0, -25.6, 1.3, 11.0, conc))
    side, front = bus_mats('mgbs1', ('#b22b2b', '#e8d070'))
    side2, front2 = bus_mats('mgbs2', ('#e8ecf0', '#2a5cb8'))
    bus(P, lo, 'bus1', -33, 22, 0, side, front, red)
    bus(P, lo, 'bus2', 33, 26, 0, side2, front2, lin_mat('mgbs_lux', '#e8ecf0'))
    finish(A, P, lo, sh, 352, ao=8.0)
    L.col_box('mgbs_block', (200, 26, 22), (0, -41, 0))
    L.shots(A, az=-30, el=22, extra=[{'name': 'halls', 'view': {'az': 150, 'el': 18, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 10. A.P. Secretariat (Saifabad)
def _lawn(name, base='#5a8f3e'):
    return kit.material('wood_green', name, base=base, chips=0.0, grain=0.15, var=0.15, rough=0.9, grime=0.2, scale=0.6)


def flag_cv(pw=64, ph=40):
    """the national tricolour (plain stripes, the chakra as a navy ring)"""
    c = Canvas(pw, ph, '#ffffff')
    c.rect(0, 0.667, 1, 1, '#ff9933').rect(0, 0, 1, 0.333, '#138808')
    c.ellipse(0.5, 0.5, 0.1, 0.15, '#1a2a7a').ellipse(0.5, 0.5, 0.075, 0.11, '#ffffff').ellipse(0.5, 0.5, 0.02, 0.03, '#1a2a7a')
    return c


def flag_on(sh, P, lo, x, y, z0, h, mat, fw=6.0, fh=4.0):
    """a flagpole (hi + lo) with the tricolour flying towards +x (two sheet quads, front and back)"""
    P.append(cylinder('flagpole', 0.18, h, (x, y, z0), seg=6, mat=mat))
    P.append(cylinder('flagknob', 0.32, 0.5, (x, y, z0 + h), seg=6, mat=mat))
    lo.append(tri_col('s_flagpole', x, y, 0.45, z0 - 0.8, z0 + h + 0.5))
    uv = sh.put(flag_cv())
    cx, cz = x + 0.2 + fw / 2, z0 + h - fh / 2 - 0.3
    sh.quad(uv, fw, fh, (cx, y - 0.03, cz))
    sh.quad(uv, fw, fh, (cx, y + 0.03, cz), rz=PI, uvq=((uv[2], uv[1]), (uv[0], uv[1]), (uv[0], uv[3]), (uv[2], uv[3])))


def build_secretariat(A):
    """The A.P. Secretariat at Saifabad, as a Hyderabadi saw it from the road in 2003: the long
    four-storey cream government block with ochre floor bands, deep sunshade chajjas and rows of
    paired windows, its two forward wings, the taller central entrance tower with the tall
    recessed window strip, the roof pavilion and the tricolour; the pillared car porch with the
    SECRETARIAT fascia and the entrance steps; the forecourt lawns and driveway; the cream compound
    wall with ochre pilasters, the big gate piers with the A.P. SECRETARIAT board, and the sentry box."""
    C._ASSET[0] = A.id
    CR, OC, TR, GL = '#e6d5a8', '#c08a40', '#f4ecd2', '#3a444b'
    cream = lin_mat('se_cream', CR)
    ochre = lin_mat('se_ochre', OC)
    trim = lin_mat('se_trim', TR)
    stone = lin_mat('se_stone', '#aaa396', 0.9)
    asph = lin_mat('se_asph', '#55524e', 0.95)
    lawn = _lawn('se_lawn')
    hedge = lin_mat('se_hedge', '#2f6a2c')
    steel = lin_mat('se_steel', '#6a6e72', 0.5)
    P, lo = [], []
    sh = Sheet(A.id, 256, 128)
    G, F, H = 1.6, 11.1, 46.0          # plinth, storey, roof of the long block
    floors = [(G + i * F, G + (i + 1) * F) for i in range(4)]
    YF = -2.0                          # front of the long block
    YW = -10.0                         # front of the wings
    YT = -8.0                          # front of the tower

    def bay_fac(w, h, seed, bays, top_band=True):
        f = Fac(w, h, CR, seed=seed, noise=0.0)
        f.dirt(3.0, alpha=0.28)
        f.rect(0, 0, w, G, '#9c9588')
        for k, (z0, z1) in enumerate(floors):
            if k:
                f.rect(0, z0 - 0.4, w, z0 + 0.5, OC)
            wh = (z1 - z0) * 0.56
            zw = z0 + (z1 - z0) * 0.22
            for i in range(bays):
                x = (i + 0.5) * w / bays
                for dx in (-1.25, 1.25):
                    f.rect(x + dx - 1.05, zw - 0.35, x + dx + 1.05, zw + wh + 0.25, TR)
                    f.rect(x + dx - 0.8, zw, x + dx + 0.8, zw + wh, GL)
                    f.rect(x + dx - 0.06, zw, x + dx + 0.06, zw + wh, '#c8c2b0')
                    f.rect(x + dx - 0.8, zw + wh * 0.66, x + dx + 0.8, zw + wh * 0.66 + 0.12, '#c8c2b0')
        if top_band:
            f.rect(0, H - 0.6, w, h, OC)
        rng = np.random.default_rng(seed)
        for _ in range(int(w / 2.5)):     # monsoon streaks
            x = rng.random() * w
            f.rect(x, H * (0.2 + rng.random() * 0.5), x + 0.35, H - 0.6, '#5a5040', 0.07)
        return f

    # ---- the long block either side of the tower, and the two forward wings
    for s in (-1, 1):
        xa, xb = sorted((s * 11.0, s * 40.0))
        P.append(fbox('main', (xa + xb) / 2, (YF + 27) / 2, 29, 27 - YF, 0, H, cream,
                      faces={'f': bay_fac(29, H, 3 + s, 6), 'b': bay_fac(29, H, 5 + s, 6)}, top_mat=stone))
        xa, xb = sorted((s * 40.0, s * 57.0))
        P.append(fbox('wing', (xa + xb) / 2, (YW + 27) / 2, 17, 27 - YW, 0, H, cream,
                      faces={'f': bay_fac(17, H, 7 + s, 3), 'b': bay_fac(17, H, 9 + s, 3),
                             'l' if s < 0 else 'r': bay_fac(37, H, 11 + s, 7),
                             'r' if s < 0 else 'l': bay_fac(37, H, 13 + s, 7)}, top_mat=stone))
        # parapet copings, sunshade chajjas and the vertical fins of the long block
        P.append(B('par', xa - 0.3, xb + 0.3, YW - 0.3, 27.3, H, H + 1.6, cream))
        P.append(B('par_c', xa - 0.5, xb + 0.5, YW - 0.5, YW + 0.3, H + 1.6, H + 2.0, ochre))
        for (z0, z1) in floors[1:]:
            P.append(B('chajja', xa, xb, YW - 1.1, YW, z0 + F * 0.86 - 0.35, z0 + F * 0.86, trim))
        P.append(B('chajja_g', xa, xb, YW - 1.1, YW, floors[0][1] - 1.3, floors[0][1] - 0.95, trim))
        xa, xb = sorted((s * 11.0, s * 39.7))
        P.append(B('par', xa, xb, YF - 0.3, 27.3, H, H + 1.6, cream))
        P.append(B('par_c', xa, xb, YF - 0.5, YF + 0.3, H + 1.6, H + 2.0, ochre))
        for (z0, z1) in floors:
            P.append(B('chajja', xa, xb, YF - 1.1, YF, z1 - F * 0.14 - 0.35, z1 - F * 0.14, trim))
        for i in range(7):
            x = xa + i * (xb - xa) / 6
            P.append(B('fin', x - 0.35, x + 0.35, YF - 0.9, YF, G, H, cream))
    # ---- the central entrance tower
    TW, TH = 11.0, 58.0
    tf = Fac(2 * TW, TH, CR, seed=21, noise=0.0)
    tf.dirt(3.0, alpha=0.28).rect(0, 0, 2 * TW, G, '#9c9588')
    tf.rect(0, G, 2.2, TH, OC).rect(2 * TW - 2.2, G, 2 * TW, TH, OC)
    tf.rect(6.2, 14.2, 2 * TW - 6.2, TH - 5.0, OC)
    tf.rect(6.8, 14.8, 2 * TW - 6.8, TH - 5.6, '#2f383e')
    for k in range(3):
        x = 6.8 + (k + 0.5) * (2 * TW - 13.6) / 3
        tf.rect(x - 0.12, 14.8, x + 0.12, TH - 5.6, TR)
    for z in np.arange(14.8 + F, TH - 6, F):
        tf.rect(6.8, z - 0.5, 2 * TW - 6.8, z + 0.5, TR)
    tf.rect(TW - 3.6, G, TW + 3.6, 10.5, TR).rect(TW - 3.0, G, TW + 3.0, 10.0, '#4a3a2a')
    tf.rect(TW - 0.08, G, TW + 0.08, 10.0, '#2a2018')
    for dx in (-6.8, 6.8):
        tf.rect(TW + dx - 1.0, 4.0, TW + dx + 1.0, 9.5, GL)
    tf.rect(0, TH - 1.6, 2 * TW, TH, OC)
    ts = bay_fac(27 - YT, TH, 23, 4, top_band=False)
    ts.rect(0, H - 0.4, 27 - YT, H + 0.5, OC).rect(0, TH - 1.6, 27 - YT, TH, OC)
    for z in (H + 2.5,):
        for i in range(4):
            x = (i + 0.5) * (27 - YT) / 4
            ts.rect(x - 1.0, z, x + 1.0, z + 6.0, GL)
    P.append(fbox('tower', 0, (YT + 27) / 2, 2 * TW, 27 - YT, 0, TH, cream, faces={'f': tf, 'b': tf, 'l': ts, 'r': ts}, top_mat=stone))
    lo.append(S('s_tower', -TW - 0.3, TW + 0.3, YT - 0.3, 27.1, H + 2.1, TH + 2.4))
    lo.append(plan_shell('s_block', [(-57.3, 27.1), (-57.3, YW - 0.3), (-40.0, YW - 0.3), (-40.0, YF - 0.3), (-TW - 0.3, YF - 0.3), (-TW - 0.3, YT - 0.3), (TW + 0.3, YT - 0.3), (TW + 0.3, YF - 0.3), (40.0, YF - 0.3), (40.0, YW - 0.3), (57.3, YW - 0.3), (57.3, 27.1)], 0, H + 2.1))
    P.append(B('t_par', -TW - 0.4, TW + 0.4, YT - 0.4, 27.4, TH, TH + 1.8, cream))
    P.append(B('t_cap', -TW - 0.7, TW + 0.7, YT - 0.7, 27.7, TH + 1.8, TH + 2.3, ochre))
    for sx in (-1, 1):       # ochre pilaster strips proud of the tower front
        xa, xb = sorted((sx * TW, sx * (TW - 2.2)))
        P.append(B('t_pil', xa, xb, YT - 0.6, YT, G, TH, ochre))
    # the roof pavilion: four piers and a flat slab, with the tricolour
    PZ = TH + 2.3
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(B('pv_pier', sx * 4.5 - 0.7, sx * 4.5 + 0.7, 9 + sy * 4.5 - 0.7, 9 + sy * 4.5 + 0.7, PZ, PZ + 5.5, cream))
    P.append(B('pv_core', -3.0, 3.0, 6.0, 12.0, PZ, PZ + 5.5, lin_mat('se_dark', '#4a4440')))
    P.append(B('pv_slab', -5.8, 5.8, 3.2, 14.8, PZ + 5.5, PZ + 6.4, ochre))
    P.append(B('pv_top', -3.6, 3.6, 5.4, 12.6, PZ + 6.4, PZ + 7.4, cream))
    lo.append(S('s_pv', -5.9, 5.9, 3.1, 14.9, PZ, PZ + 6.6))
    flag_on(sh, P, lo, 0.0, 9.0, PZ + 7.4, 9.0, steel)
    # ---- the car porch with the fascia, the entrance steps, the plinth terrace
    PY0, PY1, PZ0 = -21.0, YT, 10.0
    for sx in (-1, 1):
        for y in (PY0 + 1.6, PY1 - 2.2):
            P.append(cylinder('p_col', 0.75, PZ0, (sx * 8.0, y, 0), seg=10, mat=trim))
            P.append(B('p_colb', sx * 8.0 - 1.0, sx * 8.0 + 1.0, y - 1.0, y + 1.0, 0, 0.8, stone))
            lo.append(tri_col('s_pcol', sx * 8.0, y, 2.2, 0, PZ0))
    P.append(B('p_slab', -10.0, 10.0, PY0, PY1, PZ0, PZ0 + 1.4, cream))
    P.append(B('p_fascia', -10.2, 10.2, PY0 - 0.3, PY0 + 0.4, PZ0 - 0.4, PZ0 + 1.8, ochre))
    P.append(B('p_bal', -10.0, 10.0, PY0, PY1, PZ0 + 1.4, PZ0 + 3.2, trim))
    P.append(B('p_bal_in', -9.4, 9.4, PY0 + 0.6, PY1 - 0.1, PZ0 + 1.6, PZ0 + 3.3, lin_mat('se_roof', '#8c8478')))
    lo.append(S('s_porch', -10.3, 10.3, PY0 - 0.4, PY1, PZ0 - 0.5, PZ0 + 3.3))
    uv = sh.put(text_cv('SECRETARIAT', 224, 28, '#7a1a12', TR, size=0.84))
    sh.quad(uv, 16.0, 1.9, (0, PY0 - 0.48, PZ0 + 0.7))
    P.append(L.steps('steps', 16, 1.0, 0.4, 4, (0, YT - 3.5, 0), stone))
    lo.append(ramp_lo('s_steps', -8.0, 8.0, YT - 5.5, YT - 1.5, 1.6))
    P.append(B('terrace', -57, 57, YW - 0.01, YF, 0, G, stone))
    P.append(B('terrace_t', -11, 11, YT - 1.5, YT, 0, G, stone))
    # ---- forecourt: driveway, lawns with hedges, flower beds
    YC = -27.4
    P.append(B('ground', -59, 59, -29, YW, 0, 0.12, stone))
    P.append(B('drive', -7, 7, YC, YT - 5.5, 0.12, 0.2, asph))
    P.append(B('drive_x', -40, 40, -18.5, -13.0, 0.12, 0.2, asph))
    for s in (-1, 1):
        xa, xb = sorted((s * 9.0, s * 56.0))
        P.append(B('lawn', xa, xb, -25.8, -20.0, 0.12, 0.35, lawn))
        P.append(B('hedge', xa, xb, -26.4, -25.6, 0.12, 1.1, hedge))
        P.append(B('lawn2', sorted((s * 42.0, s * 56.0))[0], sorted((s * 42.0, s * 56.0))[1], -12.0, YW - 0.2, 0.12, 0.35, lawn))
        for k in range(4):
            x = s * (16 + k * 10)
            P.append(B('bed', x - 2.5, x + 2.5, -23.6, -22.2, 0.35, 0.7, lin_mat('se_bed%d' % (k % 2), ('#d8402a', '#f0b030')[k % 2])))
    lo.append(S('s_ground', -59, 59, -29, YW, 0, 0.36))
    # ---- compound wall with pilasters, the gate piers + board, the sentry box
    for s in (-1, 1):
        xa, xb = sorted((s * 15.0, s * 59.0))
        P.append(B('cwall', xa, xb, YC - 1.2, YC, 0, 3.2, cream))
        P.append(B('cwall_c', xa, xb, YC - 1.4, YC + 0.2, 3.2, 3.6, ochre))
        for x in np.arange(xa + 2.0, xb, 6.0):
            P.append(B('cpil', x - 0.8, x + 0.8, YC - 1.5, YC + 0.3, 0, 4.2, ochre))
        lo.append(S('s_cwall', xa, xb, YC - 1.6, YC + 0.4, 0, 4.3))
        xs = s * 58.4
        P.append(B('swall', xs - 0.6, xs + 0.6, YC, YW, 0, 3.2, cream))
        # gate pier
        xa, xb = sorted((s * 10.5, s * 15.0))
        P.append(B('gpier', xa, xb, YC - 2.3, YC + 0.9, 0, 11.0, cream))
        P.append(B('gpier_b', xa - 0.3, xb + 0.3, YC - 2.6, YC + 1.2, 0, 1.4, stone))
        P.append(B('gpier_band', xa - 0.2, xb + 0.2, YC - 2.5, YC + 1.1, 7.0, 7.8, ochre))
        P.append(B('gpier_cap', xa - 0.4, xb + 0.4, YC - 2.7, YC + 1.3, 11.0, 11.8, ochre))
        lo.append(S('s_gpier', xa - 0.5, xb + 0.5, YC - 2.8, YC + 1.4, 0, 11.9))
    # the beam across the gate carrying the board
    P.append(B('gbeam', -10.5, 10.5, YC - 1.6, YC + 0.2, 9.4, 11.0, ochre))
    P.append(B('gboard', -10.0, 10.0, YC - 1.2, YC, 11.0, 14.2, cream))
    lo.append(S('s_gbeam', -10.5, 10.5, YC - 1.7, YC + 0.3, 9.3, 14.3))
    uv = sh.put(text_cv('A.P. SECRETARIAT', 256, 40, '#7a1a12', TR, size=0.86, border=OC, bw=0.06))
    sh.quad(uv, 19.6, 3.0, (0, YC - 1.82, 12.6))
    # sentry box just inside the gate
    P.append(B('sentry', 17.0, 20.4, YC + 2.0, YC + 5.4, 0, 4.8, lin_mat('se_sentry', '#d8c08a')))
    P.append(B('sentry_r', 16.6, 20.8, YC + 1.6, YC + 5.8, 4.8, 5.3, ochre))
    P.append(B('sentry_w', 17.4, 20.0, YC + 1.95, YC + 2.0, 2.4, 3.9, lin_mat('se_dark2', '#2a2a2a')))
    lo.append(S('s_sentry', 16.5, 20.9, YC + 1.5, YC + 5.9, 0, 5.4))
    finish(A, P, lo, sh, int(os.environ.get('SE_SIZE', '320')), ao=7.0)
    L.col_box('se_block', (114, 30, 46), (0, 12.5, 0))
    L.shots(A, az=-28, el=12, extra=[{'name': 'gate', 'view': {'az': 0, 'el': 5, 'fov': 26, 'pad': 1.05}}])


# =========================================================================== 11. Ravindra Bharathi
def build_ravindra_bharathi(A):
    """Ravindra Bharathi, Saifabad (1961): the state's showpiece auditorium. The broad white
    modernist front: a full-width screen of tall slender vertical fins (louvres) over the foyer,
    the plain RAVINDRA BHARATHI name band above it, the thin flat cantilevered entrance canopy on
    slender columns, the glazed foyer (lit at night) and the wide flight of steps; behind it the
    auditorium hall with ribbed side walls and the taller stage (fly) tower."""
    C._ASSET[0] = A.id
    WH, GR, DK = '#efece4', '#c9c5bb', '#2c3236'
    white = lin_mat('rb_white', WH)
    grey = lin_mat('rb_grey', GR)
    dark = lin_mat('rb_dark', '#3a4044')
    stone = lin_mat('rb_stone', '#b4ada0', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 256, 128)
    YF, YB, HF = -14.0, 4.0, 25.0      # foyer block front / back / height
    G = 1.8
    # ---- the auditorium hall and the fly tower
    def rib_fac(w, h, seed, n, doors=0):
        f = Fac(w, h, WH, seed=seed, noise=0.0)
        f.dirt(3.0, alpha=0.25)
        for i in range(n + 1):
            x = i * w / n
            f.rect(x - 0.5, 0, x + 0.5, h, GR)
        f.band(h - 1.2, h, GR)
        for i in range(doors):
            x = (i + 0.5) * w / doors
            f.rect(x - 2.0, 0, x + 2.0, 7.0, '#5a6258').rect(x - 0.07, 0, x + 0.07, 7.0, '#2a2a2a')
        rng = np.random.default_rng(seed)
        for _ in range(int(w / 3)):
            x = rng.random() * w
            f.rect(x, h * (0.3 + rng.random() * 0.4), x + 0.4, h - 1.2, '#4a4a40', 0.06)
        return f
    HH = 30.0
    P.append(fbox('hall', 0, (YB + 26) / 2, 68, 26 - YB, 0, HH, white,
                  faces={'l': rib_fac(22, HH, 3, 5, 1), 'r': rib_fac(22, HH, 4, 5, 1), 'b': rib_fac(68, HH, 5, 12, 2)}, top_mat=grey))
    lo.append(S('s_hall', -34.1, 34.1, YB, 26.1, 0, HH + 0.1))
    P.append(fbox('fly', 0, 19.0, 34, 14, HH, 43.0, white, faces={k: rib_fac(34 if k in 'fb' else 14, 13, 6 + i, 6 if k in 'fb' else 3) for i, k in enumerate('fblr')}, top_mat=grey))
    lo.append(S('s_fly', -17.1, 17.1, 11.9, 26.1, HH, 43.1))
    # ---- the foyer block: side walls, the fin screen over the foyer, the name band
    side = Fac(YB - YF, HF, WH, seed=8, noise=0.0).dirt(3.0, alpha=0.25)
    side.band(HF - 3.6, HF, GR, 0.4)
    P.append(fbox('foyer', 0, (YF + YB) / 2, 80, YB - YF, 0, HF, white, faces={'f': Fac(80, HF, DK, noise=0.0), 'l': side, 'r': side}, top_mat=grey))
    lo.append(S('s_foyer', -40.1, 40.1, YF - 2.4, YB, 10.0, HF + 0.1))
    lo.append(S('s_foyer_g', -40.1, 40.1, YF - 1.3, YB, 0, 10.0))
    for sx in (-1, 1):
        xa, xb = sorted((sx * 35.9, sx * 40.1))
        lo.append(S('s_endpier', xa, xb, YF - 2.4, YF - 1.3, 0, 10.0))
    # end piers (solid white frame of the front)
    for s in (-1, 1):
        xa, xb = sorted((s * 36.0, s * 40.0))
        P.append(B('endpier', xa, xb, YF - 2.2, YF, 0, HF, white))
    P.append(B('band', -40, 40, YF - 2.2, YF, HF - 4.6, HF, white))
    P.append(B('band_lip', -40.2, 40.2, YF - 2.4, YF - 2.0, HF - 4.8, HF - 4.4, grey))
    # recessed upper wall behind the fins (dark shadowed panel with slit windows)
    up = Fac(72, HF - 4.6 - 10.4, '#7d8285', noise=0.0)
    for i in range(36):
        x = (i + 0.5) * 2.0
        up.rect(x - 0.35, 1.0, x + 0.35, up.h - 1.0, '#4a5258')
    P.append(C.img_quad('upwall', up.image(A.id + '_upwall'), 72, up.h, (0, YF - 0.05, 10.4 + up.h / 2)))
    # the fins: tall slender vertical louvres, 2.0 deep
    n = 30
    for i in range(n):
        x = -35.0 + (i + 0.5) * 70.0 / n
        P.append(B('fin', x - 0.32, x + 0.32, YF - 2.0, YF, 10.4, HF - 4.6, white))
    P.append(B('fin_sill', -36, 36, YF - 2.2, YF, 10.0, 10.4, white))
    uv = sh.put(text_cv('RAVINDRA BHARATHI', 256, 24, '#6a1a14', WH, size=0.88))
    sh.quad(uv, 40.0, 3.6, (0, YF - 2.45, HF - 2.3))
    # ---- ground floor: glazed foyer (lit at night) between square columns
    gl = Canvas(256, 40, '#30383c')
    gl.rect(0, 0, 1, 1, '#d8b070', 0.5)
    for i in range(12):
        x = (i + 0.5) / 12
        gl.glow(x, 0.85, 0.05, 0.25, '#fff2c8', 0.8)
    for i in range(25):
        gl.rect(i / 24 - 0.003, 0, i / 24 + 0.003, 1, '#9aa0a4')
    gl.rect(0, 0.74, 1, 0.78, '#9aa0a4')
    for i in range(9):          # the square columns in front of the glass (painted: the quad is proud of them)
        x = i / 8
        gl.rect(x - 0.012, 0, x + 0.012, 1, '#d6d1c6').rect(x - 0.012, 0, x - 0.004, 1, '#bdb8ad')
    uv_gl = sh.put(gl)
    sh.quad(uv_gl, 71.2, 8.2, (0, YF - 1.36, G + 4.1))
    for i in range(9):
        x = -35.0 + i * 70.0 / 8
        P.append(B('gcol', x - 0.6, x + 0.6, YF - 1.2, YF, G, 10.0, white))
    # ---- the cantilevered canopy and its slender columns
    CY0, CZ = -24.0, 9.6
    P.append(B('canopy', -26, 26, CY0, YF - 1.2, CZ, CZ + 0.9, white))
    P.append(B('canopy_e', -26.2, 26.2, CY0 - 0.2, CY0 + 0.4, CZ - 0.3, CZ + 1.1, grey))
    lo.append(S('s_canopy', -26.3, 26.3, CY0 - 0.3, YF - 1.2, CZ - 0.4, CZ + 1.2))
    for i in range(6):
        x = -22.5 + i * 9.0
        P.append(cylinder('ccol', 0.4, CZ - G, (x, CY0 + 2.0, G), seg=8, mat=white))
        lo.append(tri_col('s_ccol', x, CY0 + 2.0, 1.0, G, CZ))
    # ---- the plinth terrace and the wide steps
    P.append(B('terrace', -40, 40, CY0 + 1.0, YF, 0, G, stone))
    lo.append(S('s_terrace', -40.1, 40.1, CY0 + 0.9, YF, 0, G + 0.1))
    P.append(L.steps('steps', 64, 0.8, 0.36, 5, (0, CY0 + 1.0 - 2.0, 0), stone))
    lo.append(ramp_lo('s_steps', -32, 32, CY0 - 3.0, CY0 + 1.0, G))
    P.append(B('apron', -40, 40, -26, CY0 - 3.0, 0, 0.15, stone))
    for s in (-1, 1):       # planters at the ends of the steps
        xa, xb = sorted((s * 33.0, s * 39.0))
        P.append(B('planter', xa, xb, -25.5, CY0 + 1.0, 0, 1.4, grey))
        P.append(B('shrubs', xa + 0.4, xb - 0.4, -25.1, CY0 + 0.6, 1.4, 2.6, lin_mat('rb_shrub', '#3d7a34')))
        lo.append(S('s_planter', xa - 0.1, xb + 0.1, -25.6, CY0 + 1.0, 0, 2.7))
    lo.append(S('s_apron', -32, 32, -26, CY0 - 3.0, 0, 0.16))
    finish(A, P, lo, sh, int(os.environ.get('RB_SIZE', '512')), ao=6.0)
    L.col_box('rb_block', (80, 40, 30), (0, 6, 0))
    L.shots(A, az=-28, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 5, 'fov': 30, 'pad': 1.05}}])


# =========================================================================== 12. park gates
def _arch_lo_pts(w, spring, top, n=4):
    """(x, z) outline of the solid spandrel above a round arch of width w (springing at `spring`)
    up to `top`, clockwise from the left springing point (for prism_from_outline)"""
    r = w / 2
    pts = [(-r, spring)]
    for i in range(1, n):
        a = PI - PI * i / n
        pts.append((r * math.cos(a), spring + r * math.sin(a)))
    pts += [(r, spring), (r, top), (-r, top)]
    return pts


def _arch_ring_pts(w_in, w_out, spring, n=8):
    """(x, z) outline of a round arch ring (archivolt band) between radii w_in/2 and w_out/2"""
    ri, ro = w_in / 2, w_out / 2
    pts = [(-ro * math.cos(PI * i / n), spring + ro * math.sin(PI * i / n)) for i in range(n + 1)]
    pts += [(ri * math.cos(PI * i / n), spring + ri * math.sin(PI * i / n)) for i in range(n + 1)]
    return pts


def build_indira_park_gate(A):
    """Indira Park, Lower Tank Bund (1978): the municipal park's arched entrance gate. A big round
    carriage arch flanked by two smaller pedestrian arches, cream plaster with terracotta-red
    bands and keystones, the INDIRA PARK name board across the top, green iron grille gates, the
    two ticket kiosks and short stretches of compound wall with railings."""
    C._ASSET[0] = A.id
    CR, RD, GN = '#ecdcb8', '#a84a30', '#2f6a3a'
    cream = lin_mat('ip_cream', CR)
    red = lin_mat('ip_red', RD)
    green = lin_mat('ip_green', GN)
    stone = lin_mat('ip_stone', '#a9a294', 0.9)
    P, lo = [], []
    sh = Sheet(A.id, 256, 64)
    D = 3.0          # gate depth (y from -D/2 to D/2)
    # main arch: opening 9 wide, springing at 8, crown at 12.5; mass up to 15
    MW, MS, MT = 9.0, 8.0, 15.5
    PW = 2.4         # pier widths
    for s in (-1, 1):
        x0 = s * (MW / 2 + PW / 2)
        P.append(B('pier', x0 - PW / 2, x0 + PW / 2, -D / 2, D / 2, 0, MT, cream))
        P.append(B('pier_b', x0 - PW / 2 - 0.3, x0 + PW / 2 + 0.3, -D / 2 - 0.3, D / 2 + 0.3, 0, 1.4, stone))
        P.append(B('pier_imp', x0 - PW / 2 - 0.2, x0 + PW / 2 + 0.2, -D / 2 - 0.25, D / 2 + 0.25, MS - 0.6, MS, red))
        lo.append(S('s_pier', x0 - PW / 2 - 0.35, x0 + PW / 2 + 0.35, -D / 2 - 0.35, D / 2 + 0.35, 0, MT))
    P.append(prism_from_outline('spandrel', _arch_lo_pts(MW, MS, MT, n=10), D, center=(0, 0, 0), mat=cream))
    P.append(prism_from_outline('archband', _arch_ring_pts(MW, MW + 1.6, MS, n=10), D + 0.3, center=(0, 0, 0), mat=red))
    lo.append(prism_from_outline('s_spandrel', _arch_lo_pts(MW, MS, MT, n=5), D + 0.6, center=(0, 0, 0)))
    P.append(B('keystone', -0.8, 0.8, -D / 2 - 0.3, D / 2 + 0.3, MS + MW / 2 - 0.4, MS + MW / 2 + 1.4, red))
    # cornice + the attic with the name board and a small pediment-like crest
    W2 = MW / 2 + PW
    P.append(B('cornice', -W2 - 0.5, W2 + 0.5, -D / 2 - 0.5, D / 2 + 0.5, MT, MT + 0.8, red))
    P.append(B('attic', -W2 + 0.4, W2 - 0.4, -D / 2 + 0.1, D / 2 - 0.1, MT + 0.8, MT + 4.0, cream))
    P.append(B('attic_c', -W2 + 0.1, W2 - 0.1, -D / 2 - 0.2, D / 2 + 0.2, MT + 4.0, MT + 4.6, red))
    # shell: the cornice ledge, then the attic body kept INSIDE the name board (the board sits at
    # D/2 + 0.45, in front of the attic shell's D/2 + 0.3 faces: a shell face in front of it hid it)
    lo.append(S('s_cornice', -W2 - 0.6, W2 + 0.6, -D / 2 - 0.6, D / 2 + 0.6, MT, MT + 0.85))
    lo.append(S('s_attic', -W2 + 0.0, W2 - 0.0, -D / 2 - 0.3, D / 2 + 0.3, MT + 0.85, MT + 4.7))
    for s in (-1, 1):
        P.append(lathe('urn', [(0.6, MT + 0.8), (0.8, MT + 1.6), (0.45, MT + 2.6), (0.6, MT + 3.0), (0.0, MT + 3.6)], seg=8, mat=red, loc=(s * (W2 - 0.2), 0, 0)))
    uv = sh.put(text_cv('INDIRA PARK', 224, 40, '#ffffff', GN, size=0.86, border='#f2d060', bw=0.07))
    for yy, rz in ((-D / 2 - 0.45, 0.0), (D / 2 + 0.45, PI)):     # faces -Y (street) and +Y (park)
        sh.quad(uv, 2 * W2 - 1.6, 2.8, (0, yy, MT + 2.4), rz=rz)
    # side pedestrian arches (opening 3.6, springing 4.5) and their outer piers
    SW, SS, ST = 3.6, 4.5, 9.0
    for s in (-1, 1):
        cx = s * (MW / 2 + PW + SW / 2)
        P.append(prism_from_outline('s_span', _arch_lo_pts(SW, SS, ST, n=8), D - 0.6, center=(cx, 0, 0), mat=cream))
        P.append(prism_from_outline('s_ring', _arch_ring_pts(SW, SW + 1.0, SS, n=8), D - 0.3, center=(cx, 0, 0), mat=red))
        lo.append(prism_from_outline('s_sspan', _arch_lo_pts(SW, SS, ST, n=4), D - 0.2, center=(cx, 0, 0)))
        ox = s * (MW / 2 + PW + SW + 1.0)
        P.append(B('opier', ox - 1.0, ox + 1.0, -D / 2 + 0.3, D / 2 - 0.3, 0, ST + 1.5, cream))
        P.append(B('opier_c', ox - 1.3, ox + 1.3, -D / 2, D / 2, ST + 1.5, ST + 2.1, red))
        P.append(B('sband', sorted((s * (MW / 2 + PW), ox))[0], sorted((s * (MW / 2 + PW), ox))[1], -D / 2 + 0.2, D / 2 - 0.2, ST, ST + 0.6, red))
        lo.append(S('s_opier', ox - 1.4, ox + 1.4, -D / 2 - 0.1, D / 2 + 0.1, 0, ST + 2.2))
        # main gate leaves swung open (towards the street)
        hx = s * (MW / 2)
        P.append(B('mgate', hx - 0.15, hx + 0.15, -D / 2 - 4.6, -D / 2, 0.2, 4.6, green))
        lo.append(S('s_mgate', hx - 0.3, hx + 0.3, -D / 2 - 4.7, -D / 2, 0.1, 4.7))
        # ticket kiosk
        kx = s * 14.5
        P.append(B('kiosk', kx - 2.2, kx + 2.2, -1.5, 2.5, 0, 4.4, cream))
        P.append(B('kiosk_r', kx - 2.6, kx + 2.6, -1.9, 2.9, 4.4, 4.9, red))
        P.append(B('kiosk_w', kx - 1.2, kx + 1.2, -1.55, -1.5, 1.8, 3.4, lin_mat('ip_dark', '#2a2e30')))
        lo.append(S('s_kiosk', kx - 2.7, kx + 2.7, -2.0, 3.0, 0, 5.0))
        # compound wall with railing to the ends
        xa, xb = sorted((s * 17.1, s * 20.0))
        P.append(B('cwall', xa, xb, 1.0, 2.0, 0, 3.0, cream))
        P.append(B('cwall_c', xa, xb, 0.9, 2.1, 3.0, 3.4, red))
        lo.append(S('s_cwall', xa, xb, 0.8, 2.2, 0, 3.5))
    # forecourt paving and the path through
    P.append(B('pave', -20, 20, -7, 7, 0, 0.12, stone))
    lo.append(quad('s_pave', [(-20, -7, 0.13), (20, -7, 0.13), (20, 7, 0.13), (-20, 7, 0.13)]))
    finish(A, P, lo, sh, 208, ao=3.0)
    L.shots(A, az=-28, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 5, 'fov': 30, 'pad': 1.05}},
                                     {'name': 'back', 'view': {'az': 180, 'el': 5, 'fov': 30, 'pad': 1.05}}])


def build_sanjeevaiah_park_gate(A):
    """Sanjeevaiah Park (north shore of Hussain Sagar): a plain municipal entrance. Two tall
    square cream pylons with green bands either side of the carriageway, the flat beam over it
    with the SANJEEVAIAH PARK board, two smaller pedestrian openings with green iron gates,
    low compound walls with railings, a small ticket booth and two garden lamps."""
    C._ASSET[0] = A.id
    CR, GN = '#ede4c8', '#2f7a46'
    cream = lin_mat('sp_cream', CR)
    green = lin_mat('sp_green', GN)
    stone = lin_mat('sp_stone', '#a9a294', 0.9)
    iron = lin_mat('sp_iron', '#26302a', 0.6)
    P, lo = [], []
    sh = Sheet(A.id, 256, 64)
    OW = 9.0          # carriage opening
    PH = 13.5         # pylon height
    for s in (-1, 1):
        x0 = s * (OW / 2 + 1.5)
        P.append(B('pylon', x0 - 1.5, x0 + 1.5, -1.5, 1.5, 0, PH, cream))
        P.append(B('pylon_b', x0 - 1.8, x0 + 1.8, -1.8, 1.8, 0, 1.2, stone))
        for z in (5.0, 9.0):
            P.append(B('pylon_g', x0 - 1.6, x0 + 1.6, -1.6, 1.6, z, z + 0.6, green))
        P.append(B('pylon_c', x0 - 1.9, x0 + 1.9, -1.9, 1.9, PH, PH + 0.7, green))
        P.append(cylinder('pylon_l', 0.7, 1.4, (x0, 0, PH + 0.7), seg=8, mat=lin_mat('sp_globe', '#f6f0d8', 0.3)))
        lo.append(S('s_pylon', x0 - 1.95, x0 + 1.95, -1.95, 1.95, 0, PH + 0.8))
        lo.append(tri_col('s_globe', x0, 0, 1.5, PH + 0.8, PH + 2.1))
        # gate leaves swung open towards the street
        hx = s * (OW / 2)
        P.append(B('gate', hx - 0.12, hx + 0.12, -1.5 - 4.2, -1.5, 0.2, 4.2, iron))
        for k in range(8):
            P.append(B('gate_bar', hx - 0.16, hx + 0.16, -1.5 - 4.2 + k * 0.55, -1.5 - 4.2 + k * 0.55 + 0.12, 0.2, 4.4, green))
        lo.append(S('s_gate', hx - 0.3, hx + 0.3, -5.8, -1.5, 0.1, 4.5))
        # pedestrian opening: small pier + lintel, then the compound wall with railing
        px = s * (OW / 2 + 3.0 + 2.6)
        P.append(B('ppier', px - 0.8, px + 0.8, -1.0, 1.0, 0, 6.0, cream))
        P.append(B('lintel', sorted((s * (OW / 2 + 3.0), px))[0], sorted((s * (OW / 2 + 3.0), px))[1], -0.9, 0.9, 5.0, 6.0, green))
        P.append(B('ppier_c', px - 1.0, px + 1.0, -1.2, 1.2, 6.0, 6.5, green))
        lo.append(S('s_ppier', px - 1.05, px + 1.05, -1.25, 1.25, 0, 6.6))
        lo.append(S('s_lintel', sorted((s * (OW / 2 + 3.0), px))[0], sorted((s * (OW / 2 + 3.0), px))[1], -1.0, 1.0, 4.9, 6.1))
        P.append(B('pgate', s * (OW / 2 + 3.1), s * (OW / 2 + 3.1) + s * 0.2, -3.0, -0.9, 0.2, 3.4, green))
        xa, xb = sorted((s * (OW / 2 + 3.0 + 3.4), s * 18.0))
        P.append(B('cwall', xa, xb, -0.6, 0.6, 0, 2.8, cream))
        P.append(B('cwall_c', xa, xb, -0.7, 0.7, 2.8, 3.2, green))
        for x in np.arange(xa + 2.0, xb - 1.0, 4.0):
            P.append(B('cwall_p', x - 0.5, x + 0.5, -0.75, 0.75, 0, 3.6, green))
        lo.append(S('s_cwall', xa, xb, -0.8, 0.8, 0, 3.7))
    # the beam and the name board
    P.append(B('beam', -OW / 2, OW / 2, -1.2, 1.2, 9.4, 10.4, green))
    P.append(B('board', -9.2, 9.2, -1.95, 1.95, 10.4, 13.0, green))
    lo.append(S('s_beam', -OW / 2, OW / 2, -1.3, 1.3, 9.3, 10.4))
    lo.append(S('s_board', -9.3, 9.3, -2.05, 2.05, 10.3, 13.1))
    uv = sh.put(text_cv('SANJEEVAIAH PARK', 256, 36, '#ffffff', GN, size=0.86, border='#f2d060', bw=0.07))
    for yy, rz in ((-2.1, 0.0), (2.1, PI)):
        sh.quad(uv, 18.0, 2.5, (0, yy, 11.7), rz=rz)
    # ticket booth behind the left pedestrian gate
    P.append(B('booth', -15.5, -12.0, 1.4, 4.6, 0, 4.2, cream))
    P.append(B('booth_r', -15.9, -11.6, 1.0, 5.0, 4.2, 4.7, green))
    lo.append(S('s_booth', -16.0, -11.5, 0.9, 5.1, 0, 4.8))
    P.append(B('pave', -18, 18, -6, 6, 0, 0.12, stone))
    lo.append(quad('s_pave', [(-18, -6, 0.13), (18, -6, 0.13), (18, 6, 0.13), (-18, 6, 0.13)]))
    finish(A, P, lo, sh, 256, ao=3.0)
    L.shots(A, az=-28, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 5, 'fov': 30, 'pad': 1.05}}])


# =========================================================================== registration (parked)
# Parked owner must-haves (they return with lazy per-GLB loading): buildable only with
# NOSTALGIA_PARKED=1, never packed into the real pack.
if os.environ.get('NOSTALGIA_PARKED') == '1':
    kit.asset('sandhya_theatre', 'landmark', landmark='sandhya_theatre', face='w', footprint=[68, 96], height=51.0, fit='footprint')(build_sandhya)
    kit.asset('odeon_theatre', 'landmark', landmark='odeon_theatre', face='e', footprint=[88, 64], height=48.0, fit='footprint')(build_odeon)
    kit.asset('sudarshan_theatre', 'landmark', landmark='sudarshan_theatre', face='e', footprint=[66, 84], height=45.0, fit='footprint')(build_sudarshan)
    kit.asset('devi_theatre', 'landmark', landmark='devi_theatre', face='w', footprint=[100, 66], height=51.0, fit='footprint')(build_devi)
    kit.asset('gokul_chat', 'landmark', landmark='gokul_chat', face='s', footprint=[34, 24], height=39.0, fit='footprint')(build_gokul_chat)
    kit.asset('paradise', 'landmark', landmark='paradise', face='n', footprint=[60, 40], height=39.0, fit='footprint')(build_paradise)
    kit.asset('secunderabad_clock_tower', 'landmark', landmark='secunderabad_clock_tower', footprint=[18, 18], height=108.0, fit='footprint', floodlit=True)(build_clock_tower)
    kit.asset('koti_bus_stand', 'landmark', landmark='koti_bus_stand', face='w', footprint=[62, 92], height=27.0, fit='footprint')(build_koti_bus_stand)
    kit.asset('imlibun_mgbs', 'landmark', draw='mgbs', face='n', footprint=[204, 120], height=33.0, fit='footprint')(build_mgbs)
    kit.asset('secretariat', 'landmark', draw='secretariat', face='n', footprint=[118, 58], height=68.0, fit='footprint', floodlit=True)(build_secretariat)
    kit.asset('ravindra_bharathi', 'landmark', landmark='ravindra_bharathi', face='n', footprint=[80, 52], height=43.0, fit='footprint', floodlit=True)(build_ravindra_bharathi)
    # no worlddata rows yet (proposed in the round report): previews only
    kit.asset('indira_park_gate', 'landmark', landmark='indira_park_gate', face='s', footprint=[40, 14], height=20.0, fit='footprint')(build_indira_park_gate)
    kit.asset('sanjeevaiah_park_gate', 'landmark', landmark='sanjeevaiah_park_gate', face='e', footprint=[36, 12], height=16.0, fit='footprint')(build_sanjeevaiah_park_gate)
