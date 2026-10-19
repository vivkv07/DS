"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

CITY group: Koti bus stand, Imlibun MGBS, the old Secretariat, Ravindra Bharathi, the Secunderabad
Clock Tower, Paradise, Gokul Chat, the four RTC X Roads cinemas (Sandhya, Odeon, Sudarshan, Devi)
and the Indira Park / Sanjeevaiah Park gates.

Budget strategy (bytes, not triangles): low box silhouettes, and the detail (window grids, film
panels, route boards, bus liveries, shop fronts) painted into small numpy canvases that are mapped
on 2-triangle decals and baked into the one 512 atlas. Hidden ground faces are dropped.
"""
import math
import os
import numpy as np
import bpy
import bmesh
from mathutils import Matrix, Vector
import kit
import _lmkit as L
from kit import box, cylinder, lathe, prism_from_outline, arch_outline

PI = math.pi


# =========================================================================== small helpers
def B(name, sx, sy, sz, x, y, z, mat):
    """box with its base at (x, y, z)"""
    return box(name, (sx, sy, sz), (x, y, z), mat, base=True)


SKIP = {'X': (1, 0, 0), 'x': (-1, 0, 0), 'Y': (0, 1, 0), 'y': (0, -1, 0), 'Z': (0, 0, 1), 'z': (0, 0, -1)}


def BX(name, x0, x1, y0, y1, z0, z1, mat, skip=''):
    """box from extents; `skip` drops hidden faces by their outward normal: X x Y y Z z
    (+X, -X, +Y, -Y = front, top, bottom)"""
    ob = box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat, base=True)
    if skip:
        drop_faces(ob, skip)
    return ob


def drop_faces(ob, skip):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dirs = [Vector(SKIP[c]) for c in skip]
    kill = [f for f in bm.faces if any(f.normal.dot(d) > 0.98 for d in dirs)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def COL(name, x, y, z0, z1, s, mat):
    """square column, open top and bottom (8 tris)"""
    return BX(name, x - s / 2, x + s / 2, y - s / 2, y + s / 2, z0, z1, mat, 'Zz')


def flatmat(key, name, base, rough=0.85):
    """unbaked constant material (no atlas space; one draw call): big plain surfaces"""
    return kit.material(key, name, base=base, rough=rough, bake=False, alpha=1.0)


def drop_bottoms(ob, z=0.08):
    """remove downward faces lying on the ground (never seen): fewer tris, more atlas texels"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    kill = [f for f in bm.faces if f.normal.z < -0.98 and f.calc_center_median().z < z]
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def fin(A, parts, size=512, ao_dist=None):
    parts = [p for p in parts if p is not None]
    for p in parts:
        kit.apply_modifiers(p)
        kit.apply_transform(p)
    body = kit.join(parts, A.id + '_body')
    drop_bottoms(body)
    return L.finish(A, [body], size=size, ao_dist=ao_dist)


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


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

    def grad(self, y0, y1, c0, c1, x0=0.0, x1=1.0):
        a, b, c, d = self._px(x0, y0, x1, y1)
        n = max(1, d - b)
        t = np.linspace(0, 1, n, dtype=np.float32)[:, None, None]
        self.a[b:d, a:c, :3] = rgb(c0) * (1 - t) + rgb(c1) * t
        return self

    def ellipse(self, cx, cy, rx, ry, col, alpha=1.0):
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        m = ((xx + 0.5) / self.w - cx) ** 2 / (rx * rx) + ((yy + 0.5) / self.h - cy) ** 2 / (ry * ry) <= 1.0
        self.a[m, :3] = self.a[m, :3] * (1 - alpha) + rgb(col) * alpha
        return self

    def poly(self, pts, col):
        """filled polygon (fractions), even-odd rule"""
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        X = (xx + 0.5) / self.w
        Y = (yy + 0.5) / self.h
        inside = np.zeros(X.shape, bool)
        n = len(pts)
        for i in range(n):
            (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % n]
            if y1 == y2:
                continue
            c = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / (y2 - y1) + x1)
            inside ^= c
        self.a[inside, :3] = rgb(col)
        return self

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

    def grid(self, x0, y0, x1, y1, cols, rows, col, fx=0.6, fy=0.6, lit=None, alpha=1.0):
        """cols x rows window panes inside the box; each pane a fraction fx, fy of its cell"""
        cw, ch = (x1 - x0) / cols, (y1 - y0) / rows
        for r in range(rows):
            for c in range(cols):
                cx, cy = x0 + cw * (c + 0.5), y0 + ch * (r + 0.5)
                cc = lit if (lit and (r * 7 + c * 3) % 5 == 0) else col
                self.rect(cx - cw * fx / 2, cy - ch * fy / 2, cx + cw * fx / 2, cy + ch * fy / 2, cc, alpha)
        return self

    def noise(self, amt=0.05, seed=1):
        rng = np.random.default_rng(seed)
        self.a[..., :3] = np.clip(self.a[..., :3] * (1 + (rng.random((self.h, self.w, 1)) - 0.5) * amt), 0, 1)
        return self

    def mat(self, name):
        img = bpy.data.images.new(name, self.w, self.h, alpha=False)
        img.pixels.foreach_set(self.a.astype(np.float32).ravel())
        kit.ensure_dirs()
        p = os.path.join(kit.TMP_DIR, name + '.png')
        img.filepath_raw = p
        img.file_format = 'PNG'
        img.save()
        return kit.sign_material(img, 'pic_' + name, grime=0.15)


def decal(name, mat, w, h, loc, rz=0.0, tilt=0.0):
    """a 2-triangle picture quad facing -Y (turned by rz about Z, tilted by `tilt` about X)"""
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


def text_mat(name, text, fg, bg, px=256, py=64, size=0.72, outline=None):
    c = Canvas(px, py, bg)
    c.text(text, 0.04, 0.08, 0.96, 0.92, fg, outline=outline, size=size)
    return c.mat(name)


def tdecal(name, text, w, h, loc, fg='#1a1a1a', bg='#ffffff', rz=0.0, px=None, size=0.72, outline=None):
    px = px or 256
    py = max(24, int(px * h / w))
    return decal(name, text_mat(name, text, fg, bg, px, py, size, outline), w, h, loc, rz)


def lamp_bar(name, x0, x1, y0, y1, z0, z1, col='#fff1c8', skip='Z'):
    """glowing strip (tube light / bulb band); by default no top face"""
    return BX(name, x0, x1, y0, y1, z0, z1, L.lamp(col), skip)


def dashes(name, x0, x1, y, z, n, col='#ffe27a', s=0.7, axis='X'):
    """a row of n small glowing bulbs (marquee) along X (or Y)"""
    out = []
    for i in range(n):
        t = x0 + (x1 - x0) * (i + 0.5) / n
        if axis == 'X':
            out.append(B(name, s, s, s, t, y, z, L.lamp(col)))
        else:
            out.append(B(name, s, s, s, y, t, z, L.lamp(col)))
    return kit.join(out, name)


# =========================================================================== painted pictures
def poster(name, title, c0, c1, shirt, saree, px=384, py=208, title_col='#ffe23a', title_out='#a0101a', tag='DAILY 4 SHOWS'):
    """a hand-painted Telugu film panel (fictional title): sky gradient, sun rays, the hero and
    heroine as big painted portraits, the title in yellow block letters with a red outline"""
    c = Canvas(px, py)
    c.grad(0.0, 1.0, c1, c0)
    for i in range(7):
        a0 = -0.2 + i * 0.22
        c.poly([(0.5, 0.5), (0.5 + math.cos(a0) * 0.9, 0.5 + math.sin(a0) * 1.4), (0.5 + math.cos(a0 + 0.1) * 0.9, 0.5 + math.sin(a0 + 0.1) * 1.4)], c0)
    # hero (left, big) and heroine (right)
    c.poly([(0.04, 0.0), (0.42, 0.0), (0.38, 0.40), (0.08, 0.40)], shirt)
    c.ellipse(0.23, 0.58, 0.10, 0.20, '#c08458')
    c.ellipse(0.23, 0.72, 0.11, 0.09, '#1d1410')
    c.rect(0.17, 0.52, 0.29, 0.535, '#3a2016')
    c.poly([(0.62, 0.0), (0.96, 0.0), (0.92, 0.34), (0.66, 0.34)], saree)
    c.ellipse(0.79, 0.50, 0.085, 0.17, '#d39a6e')
    c.ellipse(0.79, 0.62, 0.10, 0.10, '#140c08')
    c.ellipse(0.79, 0.53, 0.012, 0.02, '#b0101a')
    c.rect(0.0, 0.0, 1.0, 0.36, '#000000', alpha=0.35)
    c.text(title, 0.02, 0.02, 0.98, 0.34, title_col, outline=title_out, ow=3, size=0.8)
    if tag:
        c.text(tag, 0.30, 0.86, 0.70, 0.98, '#ffffff', outline='#202020', ow=1, size=0.8)
    return c.mat(name)


def facade(name, wall, win, cols, rows, px=512, py=256, frame=None, lit=None, band=None, fx=0.55, fy=0.55, y0=0.0, y1=1.0, noise=0.05):
    c = Canvas(px, py, wall)
    if band:
        for r in range(rows + 1):
            yy = y0 + (y1 - y0) * r / rows
            c.rect(0, yy - 0.012, 1, yy + 0.012, band)
    if frame:
        c.grid(0, y0, 1, y1, cols, rows, frame, fx + 0.08, fy + 0.08)
    c.grid(0, y0, 1, y1, cols, rows, win, fx, fy, lit=lit)
    c.noise(noise)
    return c.mat(name)


def bus_mats(tag, livery=('#b22b2b', '#e4dccb'), route='8A KOTI'):
    s = Canvas(256, 64, livery[0])
    s.rect(0, 0.0, 1, 0.12, '#2a2a2a')
    s.rect(0, 0.46, 1, 0.56, livery[1])
    s.rect(0, 0.92, 1, 1.0, livery[1])
    s.grid(0.02, 0.56, 0.98, 0.92, 10, 1, '#26323a', 0.82, 0.8)
    s.rect(0.06, 0.12, 0.14, 0.86, '#3a2a22')     # door
    s.ellipse(0.2, 0.08, 0.05, 0.16, '#1a1a1a')
    s.ellipse(0.8, 0.08, 0.05, 0.16, '#1a1a1a')
    s.noise(0.06)
    f = Canvas(96, 96, livery[0])
    f.rect(0.05, 0.42, 0.95, 0.80, '#2c3a44')
    f.rect(0.10, 0.82, 0.90, 0.97, '#ffd23a')
    f.text(route, 0.12, 0.83, 0.88, 0.96, '#1a1a1a', size=0.8)
    f.rect(0.0, 0.32, 1.0, 0.38, livery[1])
    f.ellipse(0.15, 0.2, 0.07, 0.06, '#fff4c0')
    f.ellipse(0.85, 0.2, 0.07, 0.06, '#fff4c0')
    f.rect(0.0, 0.0, 1.0, 0.08, '#2a2a2a')
    return s.mat('bus_side_' + tag), f.mat('bus_front_' + tag)


def bus(name, x, y, rz, side, front, body):
    """an APSRTC city bus: one body box + painted sides / front (front of the bus at -Y)"""
    L_, W_, H_ = 60.0, 16.6, 17.0
    parts = [BX(name, -W_ / 2, W_ / 2, -L_ / 2, L_ / 2, 1.6, 1.6 + H_, body, 'Xxyz')]
    parts.append(decal(name + '_l', side, L_, H_, (-W_ / 2 - 0.05, 0, 1.6 + H_ / 2), rz=-PI / 2))
    parts.append(decal(name + '_r', side, L_, H_, (W_ / 2 + 0.05, 0, 1.6 + H_ / 2), rz=PI / 2))
    parts.append(decal(name + '_f', front, W_, H_, (0, -L_ / 2 - 0.05, 1.6 + H_ / 2)))
    o = kit.join(parts, name)
    return L.place(o, (x, y, 0), rz)


# =========================================================================== 1. Koti bus stand
@kit.asset('koti_bus_stand', 'landmark', landmark='koti_bus_stand', face='w', footprint=[62, 92], height=27.0, fit='footprint')
def build_koti_bus_stand(A):
    """Koti city bus terminus: the long back-walled bay shelter on its raised kerbed platform
    (sloping asbestos roof, cream columns, red fascia with route boards), an island shelter, two
    red APSRTC city buses in the bays, the enquiry kiosk and the KOTI pylon board at the gate."""
    M = L.mats()
    cream = L.paint('#e6dcc0', 'koti_cream', var=0.03, grain=0.02)
    asb = L.paint('#a3a7a8', 'koti_asb', rough=0.9, var=0.03, grain=0.03)
    red = L.paint('#b22b2b', 'koti_red', var=0.03, grain=0.02)
    kerb = L.paint('#d8d2c2', 'koti_kerb', var=0.03, grain=0.02)
    conc = L.paint('#b7b2a8', 'koti_conc', var=0.04, grain=0.03)
    P = []
    RZ = 20.0       # roof eaves height (a bus is 18.6 tall)
    # main shelter along -X: kerbed platform, back wall with timetable boards, columns, sloping roof
    P.append(BX('plat', -31, -15, -42, 44, 0, 1.3, conc, 'xYy'))
    P.append(BX('kerb', -15.4, -14.6, -42, 44, 0, 1.5, kerb, 'Yy'))
    bw = Canvas(512, 64, '#e6dcc0')
    for i in range(8):
        x = (i + 0.5) / 8
        bw.rect(x - 0.035, 0.42, x + 0.035, 0.82, '#1d3f8a').rect(x - 0.03, 0.46, x + 0.03, 0.78, '#f4f2ea')
        bw.rect(x - 0.025, 0.66, x + 0.025, 0.72, '#1d3f8a').rect(x - 0.025, 0.54, x + 0.02, 0.58, '#555555')
    bw.rect(0, 0, 1, 0.12, '#8a8478')
    P.append(BX('backwall', -31, -29.8, -42, 44, 1.3, RZ + 2.2, cream, 'XZz'))
    P.append(decal('backwall_pic', bw.mat('koti_backwall'), 86, RZ + 0.9, (-29.75, 1, 1.3 + (RZ + 0.9) / 2), rz=PI / 2))
    for i in range(7):
        y = -38 + i * 13.5
        P.append(COL('col', -16.6, y, 1.3, RZ, 1.2, cream))
    P.append(prism_from_outline('roof', [(-32.5, RZ + 2.6), (-13.5, RZ + 0.4), (-13.5, RZ - 0.2), (-32.5, RZ + 2.0)], 88, center=(0, 1, 0), mat=asb))
    rb = Canvas(512, 40, '#b22b2b')
    for i, t in enumerate(('SECUNDERABAD', 'CHARMINAR', 'MEHDIPATNAM', 'DILSUKHNAGAR')):
        x0 = 0.02 + i * 0.25
        rb.rect(x0, 0.1, x0 + 0.21, 0.9, '#ffffff').text(t, x0 + 0.005, 0.15, x0 + 0.205, 0.85, '#1a3a8a', size=0.75)
    rbm = rb.mat('koti_routes')
    P.append(BX('fascia', -14.2, -13.4, -43, 45, RZ - 1.6, RZ + 0.4, red, 'X'))
    P.append(decal('route_boards', rbm, 88, 2.0, (-13.35, 1, RZ - 0.6), rz=PI / 2))
    P.append(BX('bench', -28.6, -26.4, -36, 38, 1.3, 3.4, conc, 'z'))
    P.append(lamp_bar('tubes', -24, -23.4, -36, 38, RZ, RZ + 0.5, '#e8f4ff'))
    # island shelter
    P.append(BX('isl', 2.6, 11.4, -30, 40, 0, 1.3, kerb, 'z'))
    for i in range(4):
        y = -24 + i * 19
        P.append(COL('icol', 7, y, 1.3, RZ - 0.4, 1.2, cream))
    P.append(prism_from_outline('iroof', [(0.0, RZ + 1.6), (14.0, RZ - 0.2), (14.0, RZ - 0.7), (0.0, RZ + 1.1)], 72, center=(0, 5, 0), mat=asb))
    P.append(BX('ifascia', 13.4, 14.2, -31, 41, RZ - 2.0, RZ - 0.2, red, 'X'))
    P.append(decal('iroute', rbm, 72, 1.8, (14.25, 5, RZ - 1.1), rz=PI / 2))
    P.append(lamp_bar('itubes', 6.7, 7.3, -26, 36, RZ - 0.4, RZ, '#e8f4ff'))
    # buses
    side, front = bus_mats('koti', route='8A SECBAD')
    side2, front2 = bus_mats('koti2', route='127K')
    P.append(bus('bus1', -5.6, -10, 0, side, front, red))
    P.append(bus('bus2', 21.8, 8, PI, side2, front2, red))
    # enquiry kiosk near the gate (front -Y)
    P.append(BX('kiosk', -11, -3, -45, -38, 0, 10, cream, 'y'))
    P.append(BX('kiosk_roof', -12, -2, -46.2, -37, 10, 11, red))
    kk = Canvas(128, 64, '#e6dcc0')
    kk.rect(0.1, 0.1, 0.9, 0.6, '#2a3640').rect(0.08, 0.68, 0.92, 0.95, '#1d3f8a').text('ENQUIRY', 0.1, 0.7, 0.9, 0.93, '#ffffff', size=0.8)
    P.append(decal('kiosk_f', kk.mat('koti_kiosk'), 8, 10, (-7, -45.0, 5)))
    P.append(lamp_bar('kiosk_tube', -10, -4, -45.6, -45.2, 9.2, 9.6, '#e8f4ff'))
    # KOTI pylon board on two posts at the gate
    for x in (12, 28):
        P.append(COL('post', x, -44, 0, 17, 1.2, red))
    ks = Canvas(256, 112, '#ffffff')
    ks.rect(0, 0, 1, 0.06, '#b22b2b').rect(0, 0.94, 1, 1, '#b22b2b')
    ks.text('KOTI', 0.05, 0.36, 0.95, 0.92, '#b22b2b', size=0.9).text('BUS STAND', 0.15, 0.08, 0.85, 0.34, '#1a3a8a', size=0.8)
    P.append(BX('pylon', 10.5, 29.5, -44.8, -43.2, 16.5, 26, cream, 'y'))
    P.append(decal('pylon_f', ks.mat('koti_sign'), 19, 9.5, (20, -44.85, 21.25)))
    fin(A, P, size=512)
    L.col_box('koti_wall', (2, 86, RZ), (-30.4, 1, 0))
    L.shots(A, az=-40, el=24, extra=[{'name': 'front', 'view': {'az': -10, 'el': 12, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 2. MGBS (Imlibun)
@kit.asset('imlibun_mgbs', 'landmark', draw='mgbs', face='n', footprint=[204, 120], height=36.0, fit='footprint')
def build_mgbs(A):
    """Mahatma Gandhi Bus Station (1994): the long two-storey entrance block on the road (north)
    with its raised centre and the plain red-on-white name board over the pillared porch, and
    behind it the platform halls under the row of repeated concrete vault shells on columns,
    platforms with kerbs and long-distance buses in the bays."""
    M = L.mats()
    cream = L.paint('#e8e0d0', 'mgbs_cream', var=0.03, grain=0.02)
    red = L.paint('#b22b2b', 'mgbs_red', var=0.03, grain=0.02)
    conc = L.paint('#b7b2a8', 'mgbs_conc', var=0.04, grain=0.03)
    shell = flatmat('lime_plaster', 'mgbs_shell', '#c9c5bb')
    P = []
    FY = -54.0
    # entrance block
    P.append(BX('block', -100, 100, FY, -28, 0, 22, cream, 'yZ'))
    P.append(BX('roof', -100, 100, FY + 1, -28, 22, 22.6, shell, 'z'))
    P.append(BX('parapet', -101, 101, FY - 0.6, FY + 1.0, 21.6, 24.4, red, 'z'))
    P.append(BX('centre', -24, 24, FY - 2, -30, 0, 32, cream, 'yZ'))
    P.append(BX('centre_cap', -25, 25, FY - 2.6, -29.4, 32, 33.6, red))
    fac = Canvas(1024, 112, '#e8e0d0')
    fac.rect(0, 0.47, 1, 0.53, '#b22b2b')
    for i in range(24):
        x = (i + 0.5) / 24
        fac.rect(x - 0.014, 0.0, x + 0.014, 0.40, '#3a3f44').ellipse(x, 0.40, 0.014, 0.06, '#3a3f44')
        fac.rect(x - 0.016, 0.60, x + 0.016, 0.86, '#56666e')
    fac.noise(0.05)
    P.append(decal('fac_l', fac.mat('mgbs_fac'), 76, 22, (-62, FY - 0.05, 11)))
    P.append(decal('fac_r', fac.mat('mgbs_fac'), 76, 22, (62, FY - 0.05, 11)))
    cf = Canvas(256, 160, '#e8e0d0')
    cf.grid(0.05, 0.05, 0.95, 0.45, 5, 1, '#3a3f44', 0.7, 0.9).grid(0.05, 0.75, 0.95, 0.98, 6, 1, '#56666e', 0.6, 0.6).noise(0.05)
    P.append(decal('centre_f', cf.mat('mgbs_cf'), 48, 32, (0, FY - 2.05, 16)))
    sg = Canvas(1024, 96, '#ffffff')
    sg.rect(0, 0, 1, 0.08, '#b22b2b').rect(0, 0.92, 1, 1, '#b22b2b')
    sg.text('MAHATMA GANDHI BUS STATION', 0.02, 0.12, 0.98, 0.88, '#b22b2b', size=0.85)
    P.append(BX('sign_bd', -23, 23, FY - 2.8, FY - 2.0, 21, 26, red))
    P.append(decal('sign', sg.mat('mgbs_sign'), 45.6, 4.4, (0, FY - 2.85, 23.5)))
    # porch: canopy on four red pillars (ends at the footprint edge)
    P.append(BX('porch', -26, 26, -60, FY - 2, 11, 12.6, cream))
    P.append(BX('porch_band', -26.4, 26.4, -60.4, -59.4, 12.6, 13.8, red))
    for x in (-24, -8, 8, 24):
        P.append(BX('pillar', x - 0.9, x + 0.9, -59.6, -57.8, 0, 11, red))
    P.append(lamp_bar('porch_tube', -20, 20, -57, -56.4, 10.4, 10.9, '#e8f4ff'))
    # platform halls: repeated concrete vault shells (along Y) on valley beams and columns
    NV, X0, X1, Y0, Y1 = 9, -99.0, 99.0, -28.0, 58.0
    vw = (X1 - X0) / NV
    spring, rise, t = 15.5, 6.5, 0.7
    for i in range(NV):
        cx = X0 + vw * (i + 0.5)
        outer, inner = [], []
        n = 5
        for k in range(n + 1):
            a = PI - PI * k / n
            outer.append((cx + vw / 2 * math.cos(a), spring + t + rise * math.sin(a)))
            inner.append((cx + (vw / 2) * math.cos(a), spring + rise * math.sin(a)))
        P.append(prism_from_outline('vault', outer + list(reversed(inner)), Y1 - Y0, center=(0, (Y0 + Y1) / 2, 0), mat=shell))
    for i in range(NV + 1):
        x = X0 + vw * i
        P.append(BX('beam', x - 1.0, x + 1.0, Y0, Y1, 14.0, spring + 0.2, conc, 'Z'))
        for y in (-6.0, 44.0):
            P.append(COL('col', x, y, 0, 14.0, 1.6, conc))
    # platforms between the bays + strip lights
    for x in (-66, 0, 66):
        P.append(BX('plat', x - 7, x + 7, -26, 56, 0, 1.3, conc))
        P.append(lamp_bar('tl', x - 0.4, x + 0.4, -20, 50, 13.2, 13.7, '#e8f4ff'))
    side, front = bus_mats('mgbs1', ('#b22b2b', '#e8d070'), 'KURNOOL')
    side2, front2 = bus_mats('mgbs2', ('#e8ecf0', '#2a5cb8'), 'TIRUPATI')
    P.append(bus('bus1', -33, 22, 0, side, front, red))
    P.append(bus('bus2', 33, 26, 0, side2, front2, L.paint('#e8ecf0', 'mgbs_lux')))
    fin(A, P, size=512)
    L.col_box('mgbs_block', (200, 26, 22), (0, -41, 0))
    L.shots(A, az=-30, el=22, extra=[{'name': 'halls', 'view': {'az': 150, 'el': 18, 'fov': 32, 'pad': 1.05}}])
