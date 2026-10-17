"""part of landmarks_centre.py: LB Stadium + Prasads IMAX

Both are built for the proxy-bake budget path (L.finish_proxy): the detail (seat tiers, crowds,
lattice towers, lettering, glazing) is modelled freely as `hi` and baked into one atlas on a
simple low shell, which is all that ships.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
import kit
import _lmkit as L
from kit import box, cylinder, lathe, prism_from_outline

PI = math.pi


# =========================================================================== helpers
def quad(name, pts, mat=None):
    """one face through 3-4 points (CCW seen from the side it faces)"""
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in pts])
    return kit.obj_from_bm(bm, name, mat)


def wall_quad(name, x0, x1, z0, z1, y, mat=None, face=-1):
    """vertical rectangle in the plane y, facing -Y (face=-1) or +Y (face=1)"""
    if face < 0:
        return quad(name, [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], mat)
    return quad(name, [(x1, y, z0), (x0, y, z0), (x0, y, z1), (x1, y, z1)], mat)


def xf(ob, rz, tx=0.0, ty=0.0, tz=0.0):
    """rotate about Z by rz, then move (in place, applied)"""
    return L.place(ob, (tx, ty, tz), rz)


def side_prism(name, outline, x0, x1, mat=None, bottom=True):
    """prism of a (y, z) cross-section outline extruded along X from x0 to x1 (bottom=False:
    no face on the closing edge last -> first point, i.e. the ground)"""
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


def cubes(name, items, mats):
    """many small boxes in one mesh: items = [(x, y, z0, sx, sy, sz, mat_index)]"""
    bm = bmesh.new()
    for (x, y, z, sx, sy, sz, mi) in items:
        r = bmesh.ops.create_cube(bm, size=1.0)
        vs = r['verts']
        bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=vs)
        bmesh.ops.translate(bm, vec=Vector((x, y, z + sz / 2)), verts=vs)
        for f in {f for v in vs for f in v.link_faces}:
            f.material_index = mi
    ob = kit.obj_from_bm(bm, name)
    for m in mats:
        ob.data.materials.append(m)
    return ob


def apart(objs, dx):
    """shift objects along X (bake variants far apart so their AO never sees each other)"""
    for o in objs:
        if o is not None:
            o.location.x += dx
            kit.apply_transform(o)
    return objs


def unapart(los, name, dx):
    for o in los:
        if o.name == name:
            o.location.x -= dx
            kit.apply_transform(o)
            return o


def rod(name, p0, p1, r, mat, seg=4):
    return kit.tube(name, [p0, p1], r, seg=seg, mat=mat)


# =========================================================================== LB Stadium
# Blender frame: front (-Y) = world west (the main gate on Basheerbagh side); +X = world south.
# Field (lb_stadium_field park): |X| <= 78, |Y| <= 67 -> nothing but the ground there.
SD, Z0S, ZTS, ROWS = 30.0, 2.4, 27.0, 9       # stand depth, field-wall top, top tread, seat rows
FX, FY = 80.0, 69.0                           # where the stands start (field edge + 2 u)


def stand_section(rows=ROWS, D=SD, z0=Z0S, zt=ZTS, walk=1.5):
    """stepped (y, z) section, field edge at y = 0, the stand rising towards -y"""
    dy = (D - walk - 1.2) / rows
    pts = [(0.0, 0.0), (0.0, z0), (-walk, z0)]
    y = -walk
    for k in range(1, rows + 1):
        z = z0 + (zt - z0) * k / rows
        pts += [(y, z), (y - dy, z)]
        y -= dy
    pts += [(-D + 1.2, zt), (-D + 1.2, zt + 2.4), (-D, zt + 2.4), (-D, 0.0)]
    return pts, dy


def build_stand(M, seg, u0, u1, rz, t, rnd, pav=False):
    """one straight stand between u0..u1 (local x), outward = local -y, placed by (rz, t).
    Returns (hi_body, hi_crowd, lo_body, lo_crowd)."""
    pts, dy = stand_section()
    z1 = Z0S + (ZTS - Z0S) / ROWS
    hb, hc, lb, lc = [], [], [], []
    seats = [L.paint('#3d6db0', 'lb_seat_b', rough=0.85), L.paint('#b9483a', 'lb_seat_r', rough=0.85), L.paint('#d6b142', 'lb_seat_y', rough=0.85)]
    conc = L.paint('#c9c3b8', 'lb_conc', rough=0.9, grime=0.3, streaks=0.15)
    back = L.paint('#e2dccf', 'lb_back', rough=0.9, grime=0.3, streaks=0.15)
    dark = L.paint('#3a3733', 'lb_dark', rough=0.9)
    win = L.paint('#3a4a5a', 'lb_win', rough=0.6)
    blue = L.paint('#2a5cb8', 'lb_blue', rough=0.8)
    # the stepped concrete stand
    hb.append(side_prism('st', pts, u0, u1, conc))
    # coloured seat strips on each tread (blue lower tier, red middle, yellow top)
    y = -1.5
    for k in range(1, ROWS + 1):
        z = Z0S + (ZTS - Z0S) * k / ROWS
        tier = min(2, (k - 1) * 3 // ROWS)
        hb.append(box('seat', (u1 - u0 - 1.0, dy * 0.55, 0.35), ((u0 + u1) / 2, y - dy * 0.55, z), seats[tier], base=True))
        # aisles
        y -= dy
    for ua in [u0 + 20 + 40 * i for i in range(int((u1 - u0 - 10) // 40) + 1)]:
        if ua < u1 - 6:
            hb.append(side_prism('aisle', [(yy, zz + 0.4 if zz > 0 else 0.0) for (yy, zz) in pts], ua - 0.8, ua + 0.8, conc))
    # sponsor boards on the field wall (plain painted panels) and the back wall's vents + tunnels
    cols = ['#f2c230', '#2a8a3a', '#d8402a', '#ffffff', '#2a5cb8', '#f08a24']
    x = u0 + 2
    i = 0
    while x < u1 - 8:
        w = 18 + (i % 3) * 4
        hb.append(wall_quad('ad', x, min(x + w, u1 - 1), 0.3, Z0S - 0.2, 0.05, L.paint(cols[i % len(cols)], 'lb_ad%d' % (i % len(cols))), face=1))
        x += w + 0.8
        i += 1
    # street side: a row of small shops under the stands (rolling shutters + painted shop boards)
    shut = L.paint('#8a8f94', 'lb_shutter', rough=0.6, grime=0.2, streaks=0.1)
    bcols = ['#f2c230', '#2a5cb8', '#d8402a', '#2a8a3a']
    j = 0
    u = u0 + 2.0
    while u + 6.0 <= u1 - 1.0:
        hb.append(wall_quad('shut', u, u + 6.0, 0.0, 9.0, -SD - 0.36, shut))
        hb.append(wall_quad('board', u - 0.6, u + 6.6, 9.6, 11.8, -SD - 0.36, L.paint(bcols[j % 4], 'lb_board%d' % (j % 4), rough=0.7)))
        u += 8.0
        j += 1
    hb.append(box('bwall', (u1 - u0, 0.3, ZTS + 2.4), ((u0 + u1) / 2, -SD - 0.15, 0), back, base=True))
    hb.append(box('bband', (u1 - u0, 0.5, 1.6), ((u0 + u1) / 2, -SD - 0.35, ZTS - 1.2), blue, base=True))
    # crowd (match day): seated people on every tread, kids' school colours mixed in
    cmats = [L.paint(c, 'lb_crowd%d' % j, rough=0.9) for j, c in enumerate(
        ('#f4f0e8', '#2a5cb8', '#d8402a', '#f2c230', '#3a3a40', '#2f8a4a', '#e88aa8', '#7a4a2a', '#ffffff', '#1a1a1a'))]
    items = []
    y = -1.5
    for k in range(1, ROWS + 1):
        z = Z0S + (ZTS - Z0S) * k / ROWS
        xx = u0 + 0.8
        while xx < u1 - 0.8:
            # supporters sit in groups (school colours, families): one colour per block of seats
            n = 14 + rnd.randrange(20)
            ci = rnd.randrange(len(cmats) - 1)
            if rnd.random() < 0.15:
                xx += n * 1.25
                continue
            for _ in range(n):
                if xx >= u1 - 0.8:
                    break
                items.append((xx, y - dy * 0.45, z, 1.25, 0.8, 1.9, ci))
                xx += 1.25
        y -= dy
    hc.append(cubes('crowd', items, cmats))
    hc.append(side_prism('st_c', pts, u0, u1, conc))
    # shells
    lo_pts = [(0.0, 0.0), (0.0, z1 + 0.15), (-SD + 1.2, ZTS + 0.15), (-SD, ZTS + 2.5), (-SD - 0.4, ZTS + 2.5), (-SD - 0.4, 0.0)]
    if pav:
        lo_pts = [(0.0, 0.0), (0.0, z1 + 0.15), (-SD + 1.2, ZTS + 0.15), (-SD + 1.2, 41.6), (-SD - 0.4, 42.6), (-SD - 0.4, 0.0)]
    lb.append(side_prism(seg, lo_pts, u0 - 0.25, u1 + 0.25, bottom=False))
    yA, zA = 0.0, z1 + 0.15 + 0.9
    yB, zB = -SD + 1.2, ZTS + 0.15 + 0.9
    lc.append(quad(seg + '_c', [(u0, yB, zB), (u1, yB, zB), (u1, yA, zA), (u0, yA, zA)]))
    for o in hb + hc + lb + lc:
        xf(o, rz, t[0], t[1])
    return hb, hc, lb, lc


def flood_tower(M, x, y, H=92.0):
    """lattice floodlight tower (hi), its shell, and the lamp-bank quad (for the match glow)"""
    steel = L.paint('#8a8e94', 'lb_steel', rough=0.6, grime=0.3)
    core = L.paint('#6a6e74', 'lb_core', rough=0.8)
    head = L.paint('#5a5e64', 'lb_head', rough=0.7)
    lens = L.paint('#eef2f6', 'lb_lens', rough=0.3)
    s0, s1 = 2.6, 1.3
    hi = []
    P = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for (a, b) in P:
        hi.append(rod('leg', (x + a * s0, y + b * s0, 0), (x + a * s1, y + b * s1, H), 0.32, steel))
    zz = 0.0
    k = 0
    while zz < H - 4:
        t0, t1 = zz / H, min(1.0, (zz + 10) / H)
        r0, r1 = s0 + (s1 - s0) * t0, s0 + (s1 - s0) * t1
        for i in range(4):
            (a, b), (c, d) = P[i], P[(i + 1) % 4]
            if k % 2:
                hi.append(rod('br', (x + a * r0, y + b * r0, zz), (x + c * r1, y + d * r1, zz + 10), 0.22, steel, seg=3))
            else:
                hi.append(rod('br', (x + c * r0, y + d * r0, zz), (x + a * r1, y + b * r1, zz + 10), 0.22, steel, seg=3))
            hi.append(rod('rg', (x + a * r1, y + b * r1, zz + 10), (x + c * r1, y + d * r1, zz + 10), 0.2, steel, seg=3))
        zz += 10
        k += 1
    hi.append(cylinder('core', 1.25, H, (x, y, 0), seg=4, mat=core, r2=0.5))
    # lamp bank facing the field centre
    ang = math.atan2(-y, -x)
    rz = ang - PI / 2 + PI          # local -Y of the bank -> towards the field
    bank = [box('bank', (17.0, 1.6, 7.6), (0, 0, H - 1.0), head, base=True)]
    for i in range(-3, 4):
        for j in range(3):
            bank.append(cylinder('lens', 0.95, 0.4, (i * 2.3, -0.8, H + 0.6 + j * 2.3), seg=8, mat=lens, axis='Y', base=False))
    bank.append(box('walk', (17.0, 2.8, 0.3), (0, 1.0, H - 1.6), steel, base=True))
    hi += [xf(o, rz, x, y) for o in bank]
    sh = cylinder('s_tw', s0 * 1.42 + 0.3, H - 1.0, (0, 0, 0), seg=4, r2=s1 * 1.42 + 0.3, cap=False)
    sh = xf(sh, PI / 4, x, y)
    sb = [xf(wall_quad('s_bank', -8.7, 8.7, H - 1.1, H + 6.8, -1.0), rz, x, y), xf(wall_quad('s_bankb', -8.7, 8.7, H - 1.1, H + 6.8, 1.0, face=1), rz, x, y)]
    lampq = xf(wall_quad('lamps', -7.6, 7.6, H + 0.0, H + 6.2, -1.15), rz, x, y)
    return hi, [sh] + sb, lampq


@kit.asset('lb_stadium', 'landmark', draw='lb_stadium', face='w', footprint=[220, 198], height=100.0, fit='footprint',
           floodlit=True, variants={'rule': 'lb_match', 'names': ['quiet', 'match']})
def build_lb_stadium(A):
    """Lal Bahadur Stadium, Fateh Maidan: concrete stands round the open field, the covered
    pavilion stand (east) with its cantilever roof, four lattice floodlight towers, the electronic
    scoreboard over the north stand, the main west gate with the name, a south gate. Variant
    'match': crowds on every tier, the U-12 FINAL banners, and the floodlight banks glow at night."""
    M = L.mats()
    rnd = random.Random(1955)
    HB, HC, LB, LC = [], [], [], []

    def add(r):
        HB.extend(r[0]); HC.extend(r[1]); LB.extend(r[2]); LC.extend(r[3])
    # front (west, -Y) with the main gate gap, back (east, +Y: pavilion), north (-X), south (+X, gate gap)
    add(build_stand(M, 's_w1', -FX, -22, 0.0, (0, -FY), rnd))
    add(build_stand(M, 's_w2', 22, FX, 0.0, (0, -FY), rnd))
    add(build_stand(M, 's_e', -FX, FX, PI, (0, FY), rnd, pav=True))
    add(build_stand(M, 's_n', -99, 99, -PI / 2, (-FX, 0), rnd))
    add(build_stand(M, 's_s1', -99, -21, PI / 2, (FX, 0), rnd))
    add(build_stand(M, 's_s2', 21, 99, PI / 2, (FX, 0), rnd))
    white = L.paint('#efece4', 'lb_white', rough=0.85, grime=0.35, streaks=0.3)
    roofm = L.paint('#b8bec4', 'lb_roof', rough=0.6, grime=0.3)
    steel = L.paint('#6a6e74', 'lb_steel_dk', rough=0.6)
    glass = L.paint('#33505e', 'lb_glass', rough=0.4)
    dark = L.paint('#2a2a2e', 'lb_sb', rough=0.8)
    # ---- pavilion (east): cantilever roof, back cladding with windows, players' balcony block
    YB = FY + SD                                         # 99: the street-side back of the east stand
    roof_o = [(YB + 0.6, 43.4), (FY + 4.0, 39.6), (FY + 4.0, 38.9), (YB + 0.6, 42.6)]
    HB.append(side_prism('roof', [(y, z) for (y, z) in roof_o], -FX, FX, roofm))
    for u in range(-76, 80, 12):
        HB.append(box('rib', (0.8, SD - 4, 1.4), (u, (YB + FY + 4) / 2, 39.4), steel, base=True))
        HB.append(box('post', (1.0, 1.0, 43 - ZTS), (u, YB - 0.4, ZTS), steel, base=True))
    HB.append(box('clad', (2 * FX, 0.4, 43 - ZTS - 2.4), (0, YB - 0.2, ZTS + 2.4), white, base=True))
    for u in range(-74, 76, 6):
        HB.append(wall_quad('cwin', u, u + 4, ZTS + 4, ZTS + 9, YB + 0.06, glass, face=1))
    HB.append(box('pav', (36, 11, 15), (0, FY + 5.5 + 0.2, 0), white, base=True))
    for u in range(-15, 16, 6):
        HB.append(wall_quad('pwin', u - 2, u + 2, 2.0, 6.5, FY + 0.14, glass, face=-1))
        HB.append(wall_quad('pwin', u - 2, u + 2, 8.5, 13.0, FY + 0.14, glass, face=-1))
    HB.append(box('pbal', (36, 2.0, 0.5), (0, FY - 0.8, 7.0), white, base=True))
    HB.append(box('prail', (36, 0.2, 1.4), (0, FY - 1.7, 7.5), steel, base=True))
    LB.append(side_prism('s_roof', [(YB + 0.9, 43.8), (FY + 3.6, 40.0), (FY + 3.6, 38.6), (YB + 0.9, 42.2)], -FX - 0.2, FX + 0.2))
    LB.append(L.shell_box('s_pav', (36.4, 13.5, 15.2), (0, 73.75, 0)))
    # ---- electronic scoreboard over the north stand, facing the field (+X)
    sbx = -FX - SD + 2.0
    sb = [box('sb', (4, 48, 17), (0, 0, 29), dark, base=True)]
    sb.append(xf(L.sign_panel('sbt', 'LB STADIUM', 40, 5.0, (0, 0, 40.0), fg='#1a1a1a', bg='#f2c230', px=512), PI / 2, 2.2, 0))
    sb.append(xf(L.sign_panel('sbs', 'FATEH MAIDAN', 40, 3.4, (0, 0, 35.2), fg='#ffb020', bg='#141414', px=512), PI / 2, 2.2, 0))
    for r_ in range(2):
        for c_ in range(10):
            sb.append(box('dot', (0.3, 2.6, 1.5), (2.15, -16 + c_ * 3.5, 30.4 + r_ * 2.0), L.paint('#5a4a20', 'lb_dot'), base=True))
    HB += [xf(o, 0, sbx, 0) for o in sb]
    LB.append(L.shell_box('s_sb', (4.6, 48.6, 17.4), (sbx, 0, 28.8)))
    # ---- the main (west) gate: two pylons, the lintel with the name; south gate: plain pylons
    def gate(name, w, h, sign=None):
        g = [box(name + 'p', (5, 6, h), (-w / 2 - 2.5, 0, 0), white, base=True), box(name + 'p', (5, 6, h), (w / 2 + 2.5, 0, 0), white, base=True),
             box(name + 'l', (w + 10, 6, 7.5), (0, 0, h - 7.5), white, base=True)]
        for sx in (-1, 1):
            g.append(box(name + 'b', (5.4, 6.4, 1.0), (sx * (w / 2 + 2.5), 0, h - 9.5), L.paint('#2a5cb8', 'lb_blue2'), base=True))
        if sign:
            g.append(box(name + 's', (w + 6, 0.3, 5.6), (0, -3.15, h - 9.6), L.paint('#1d4e8a', 'lb_signbg', rough=0.6), base=True))
        ol = [(-w / 2 - 5.2, 0), (-w / 2 + 0.2, 0), (-w / 2 + 0.2, h - 7.7), (w / 2 - 0.2, h - 7.7), (w / 2 - 0.2, 0), (w / 2 + 5.2, 0), (w / 2 + 5.2, h + 0.2), (-w / 2 - 5.2, h + 0.2)]
        s = prism_from_outline(name + '_s', ol, 7.0)
        return g, s
    g, s = gate('wg', 40, 31, 'LAL BAHADUR STADIUM')
    HB += [xf(o, 0, 0, -YB + 3.5) for o in g]
    LB.append(xf(s, 0, 0, -YB + 3.5))
    # ---- floodlight towers at the four corners
    lamps = []
    for (x, y) in ((-102, -91), (102, -91), (-102, 91), (102, 91)):
        hi, lo, lq = flood_tower(M, x, y)
        HB.extend(hi)
        LB.extend(lo)
        lamps.append(lq)
    # ---- match-day banners: across the main gate and on the pavilion balcony; scoreboard caption
    ban = L.sign_panel('ban', 'U-12 FINAL', 34, 6.0, (0, -YB - 0.4, 14.0), fg='#b22b2b', bg='#f2c230', px=512)
    HC.append(ban)
    LC.append(wall_quad('s_ban', -17.2, 17.2, 13.9, 20.1, -YB - 0.6))
    HC.append(xf(L.sign_panel('ban2', 'INTER-SCHOOL U-12 FINAL', 34, 4.4, (0, 0, 5.0), fg='#ffffff', bg='#b22b2b', px=512), 0, 0, 67.0))
    LC.append(wall_quad('s_ban2', -17.2, 17.2, 2.7, 7.3, 66.75))
    HC.append(xf(L.sign_panel('sbm', 'U-12 FINAL  HYD 112/3', 40, 4.2, (0, 0, 31.2), fg='#ffb020', bg='#141414', px=512), PI / 2, sbx + 2.4, 0))
    LC.append(xf(wall_quad('s_sbm', -20.2, 20.2, 29.0, 33.4, -0.2), PI / 2, sbx + 2.4, 0))
    # the stadium name: its own small text texture (the 512 atlas is too coarse for lettering)
    img = kit.text_image('LAL BAHADUR STADIUM', 256, 40, fg='#ffffff', bg='#1d4e8a', name='lb_signtex')
    sgn = wall_quad('lb_signq', -22.6, 22.6, 31 - 9.4, 31 - 4.2, -YB + 3.5 - 3.45, kit.baked_material('M_lb_sign', img.filepath_raw, rough=0.6))
    uvl = sgn.data.uv_layers.new(name='UVMap')
    for li, lp in enumerate(sgn.data.loops):
        co = sgn.data.vertices[lp.vertex_index].co
        uvl.data[li].uv = ((co.x + 22.6) / 45.2, (co.z - (31 - 9.4)) / 5.2)
    # the lamp-bank glow quads belong to the match variant (one small @night material)
    lit = kit.join(lamps, 'lb_lamps')
    lit.data.materials.append(L.lamp('#fff6e0', 'lb_flood'))
    apart(HC + LC, 2000.0)
    los = L.finish_proxy(A, HB, lo=LB, keep=[lit, sgn], size=512, ao_dist=5.0, variants={'match': (HC, LC)})
    vm = unapart(los, 'var_match', 2000.0)
    lit.parent = vm
    A.notes.append('proxy shell; var_match = crowd quads + banners + @night floodlight banks (parented); var_quiet is empty (bare stands are the body)')
    L.shots(A, az=-35, el=22, extra=[{'name': 'field', 'view': {'az': 180, 'el': 8, 'fov': 60, 'target': (0, -85, 18), 'dist': 85}}, {'name': 'pav', 'view': {'az': 0, 'el': 8, 'fov': 60, 'target': (0, 85, 22), 'dist': 85}}])


# =========================================================================== Prasads IMAX
def ring_walls(name, W, D, h, t, mat=None, out=True, inn=True, gap=None):
    """thin rectangular fence ring (outer + inner faces), centred, base z 0; gap=(x0, x1) on the front"""
    hx, hy = W / 2, D / 2
    q = []
    segs = [((-hx, -hy), (hx, -hy)), ((hx, -hy), (hx, hy)), ((hx, hy), (-hx, hy)), ((-hx, hy), (-hx, -hy))]
    if gap:
        segs = [((-hx, -hy), (gap[0], -hy)), ((gap[1], -hy), (hx, -hy))] + segs[1:]
    for (a, b) in segs:
        if out:
            q.append(quad(name, [(a[0], a[1], 0), (b[0], b[1], 0), (b[0], b[1], h), (a[0], a[1], h)], mat))
        if inn:
            dx, dy = b[0] - a[0], b[1] - a[1]
            L_ = math.hypot(dx, dy)
            nx, ny = -dy / L_ * t, dx / L_ * t           # inward normal (CCW ring)
            q.append(quad(name, [(b[0] + nx, b[1] + ny, 0), (a[0] + nx, a[1] + ny, 0), (a[0] + nx, a[1] + ny, h), (b[0] + nx, b[1] + ny, h)], mat))
    return q


def lattice_mast(name, x, y, z0, z1, s, mat, step=4.0):
    """square lattice mast (crane tower) from z0 to z1, half width s"""
    out = []
    P = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for (a, b) in P:
        out.append(rod(name, (x + a * s, y + b * s, z0), (x + a * s, y + b * s, z1), 0.22, mat))
    z = z0
    k = 0
    while z < z1 - 0.5:
        for i in range(4):
            (a, b), (c, d) = P[i], P[(i + 1) % 4]
            if k % 2:
                out.append(rod(name, (x + a * s, y + b * s, z), (x + c * s, y + d * s, z + step), 0.12, mat, seg=3))
            else:
                out.append(rod(name, (x + c * s, y + d * s, z), (x + a * s, y + b * s, z + step), 0.12, mat, seg=3))
        z += step
        k += 1
    return out


@kit.asset('prasads_imax', 'landmark', draw='prasads_imax', face='s', footprint=[78, 68], height=72.0, fit='footprint',
           floodlit=False, variants={'rule': 'prasads', 'names': ['site', 'open']})
def build_prasads(A):
    """Prasads IMAX, Necklace Road. 'site' (until it opens in 2003): tin-sheet fence, the plain
    PRASADS - COMING SOON hoarding, a bare concrete frame and a tower crane. 'open': the big modern
    box with the huge glass entrance front and canopy, the tall windowless IMAX hall block behind
    with the PRASADS lettering, lit glass at night."""
    M = L.mats()
    W, D = 78.0, 68.0
    hx, hy = W / 2, D / 2
    kerb = L.paint('#a9a59c', 'pr_kerb', rough=0.9, grime=0.4)
    # ---- body: the plot's kerb (both variants)
    HB = [box('kerb', (W, 1.0, 0.6), (0, -hy + 0.5, 0), kerb, base=True)]
    LB = [L.shell_box('s_kerb', (W + 0.2, 1.2, 0.7), (0, -hy + 0.5, 0))]
    # ---- SITE ----------------------------------------------------------------------------
    HS, LS = [], []
    tinA = L.paint('#2f6f8f', 'pr_tin_b', rough=0.7, grime=0.3, streaks=0.2)
    fence_top = L.paint('#f2f2ee', 'pr_fence_top', rough=0.7)
    # fence: alternating corrugated panels (both faces), posts
    n = 0
    for (a, b, nrm) in (((-hx + 1.5, -hy + 1.5), (hx - 1.5, -hy + 1.5), (0, -1)), ((hx - 1.5, -hy + 1.5), (hx - 1.5, hy - 1.5), (1, 0)),
                        ((hx - 1.5, hy - 1.5), (-hx + 1.5, hy - 1.5), (0, 1)), ((-hx + 1.5, hy - 1.5), (-hx + 1.5, -hy + 1.5), (-1, 0))):
        Ln = math.hypot(b[0] - a[0], b[1] - a[1])
        k = int(Ln / 4)
        for i in range(k):
            t0, t1 = i / k, (i + 1) / k
            cx = a[0] + (b[0] - a[0]) * (t0 + t1) / 2
            cy = a[1] + (b[1] - a[1]) * (t0 + t1) / 2
            pw = Ln / k
            p = box('tin', (pw if nrm[1] else 0.3, 0.3 if nrm[1] else pw, 9.0), (cx, cy, 0), tinA, base=True)
            HS.append(box('tintop', (pw + 0.05 if nrm[1] else 0.4, 0.4 if nrm[1] else pw + 0.05, 1.0), (cx, cy, 8.0), fence_top, base=True))
            HS.append(p)
            for j in range(4):
                o = (j + 0.5) / 4 - 0.5
                HS.append(box('rib', (0.25 if nrm[1] else 0.5, 0.5 if nrm[1] else 0.25, 9.0), (cx + (o * pw if nrm[1] else 0), cy + (0 if nrm[1] else o * pw), 0), tinA, base=True))
            n += 1
    LS += ring_walls('s_fence', W - 2.4, D - 2.4, 9.3, 1.0)
    # hoarding on the front, on two legs, above the fence
    HS.append(L.sign_panel('hoard', 'PRASADS — COMING SOON', 56, 9.0, (0, -hy + 1.0, 14.0), fg='#1a1a2a', bg='#f2c230', px=1024))
    HS.append(L.sign_panel('hoard2', "INDIA'S BIGGEST SCREEN", 40, 3.6, (0, -hy + 0.9, 20.6), fg='#ffffff', bg='#c81a1a', px=1024))
    for sx in (-1, 1):
        HS.append(box('hleg', (0.8, 0.8, 9.5), (sx * 20, -hy + 1.8, 0), M['iron'], base=True))
    LS.append(L.shell_box('s_hoard', (56.4, 1.2, 13.4), (0, -hy + 1.0, 9.4)))
    # bare concrete frame (columns, three slabs, a dark interior), set back inside the fence
    conc = L.paint('#b8b4ac', 'pr_conc', rough=0.95, grime=0.5, streaks=0.4, dirt='#6a6258')
    shade = L.paint('#3c3a37', 'pr_void', rough=0.95)
    FW, FD, FH = 56.0, 40.0, 34.0
    fy0 = 4.0
    for u in [-FW / 2 + 1 + i * (FW - 2) / 4 for i in range(5)]:
        for v in [fy0 - FD / 2 + 1 + j * (FD - 2) / 3 for j in range(4)]:
            HS.append(box('col', (2.0, 2.0, FH), (u, v, 0), conc, base=True))
    for zz in (11.0, 22.0, 33.0):
        HS.append(box('slab', (FW, FD, 1.2), (0, fy0, zz - 1.0), conc, base=True))
    HS.append(box('void', (FW - 8, FD - 8, FH - 1), (0, fy0, 0), shade, base=True))
    for zz in (11.0, 22.0):      # rebar stubs + a few brick infill bays
        HS.append(box('brick', (8, 0.6, 9.5), (-FW / 2 + 8, fy0 - FD / 2 + 1, zz - 11.0 + 0.2), M['brick'], base=True))
    LS.append(L.shell_box('s_frame', (FW + 0.4, FD + 0.4, FH + 0.4), (0, fy0, 0)))
    # tower crane: lattice mast, jib + counter-jib, cab, counterweight
    yel = L.paint('#e0a820', 'pr_crane', rough=0.6)
    cx_, cy_ = hx - 9, -hy + 12
    HS += lattice_mast('mast', cx_, cy_, 0, 66, 1.3, yel)
    HS.append(box('mcore', (1.6, 1.6, 66), (cx_, cy_, 0), L.paint('#5a4a20', 'pr_cdark'), base=True))
    HS.append(box('cab', (3.6, 3.6, 3.6), (cx_, cy_ - 2.6, 63), L.paint('#d8d4cc', 'pr_cab'), base=True))
    HS.append(box('jib', (52, 2.0, 2.0), (cx_ - 24, cy_, 67), yel, base=True))
    HS.append(box('cjib', (14, 2.0, 1.6), (cx_ + 8, cy_, 67), yel, base=True))
    HS.append(box('cw', (4, 2.6, 3.4), (cx_ + 12, cy_, 64.2), M['concrete'], base=True))
    HS.append(cylinder('apex', 1.4, 7, (cx_, cy_, 67), seg=4, mat=yel, r2=0.2))
    LS.append(L.shell_box('s_mast', (3.2, 3.2, 63.0), (cx_, cy_, 0)))
    LS.append(L.shell_box('s_cab', (3.8, 6.4, 3.8), (cx_, cy_ - 1.2, 62.9)))
    LS.append(L.shell_box('s_jib', (66.4, 2.6, 2.4), (cx_ - 17, cy_, 66.8)))
    LS.append(L.shell_box('s_cw', (4.2, 2.8, 3.0), (cx_ + 12, cy_, 63.9)))
    LS.append(cylinder('s_apex', 1.5, 7.2, (cx_, cy_, 69.0), seg=3, r2=0.2, cap=False))
    # ---- OPEN ----------------------------------------------------------------------------
    HO, LO = [], []
    clad = L.paint('#e6e8ea', 'pr_clad', rough=0.7, grime=0.25, streaks=0.2)
    imax = L.paint('#3e4f63', 'pr_imax', rough=0.7, grime=0.2, streaks=0.2)
    glass = L.paint('#3f7f99', 'pr_glass', rough=0.3)
    glass_hi = L.paint('#8cc4d6', 'pr_glass_hi', rough=0.3)
    mull = L.paint('#c9ced2', 'pr_mull', rough=0.6)
    pave = L.paint('#b9b2a4', 'pr_pave', rough=0.9, grime=0.3)
    red = L.paint('#c81a1a', 'pr_red', rough=0.6)
    # the mall block (front, full width) with the huge glass front
    MB_D, MB_H = 40.0, 28.0
    my = -hy + 6 + MB_D / 2
    HO.append(box('mall', (W - 2, MB_D, MB_H), (0, my, 0), clad, base=True))
    HO.append(box('mband', (W - 1.6, MB_D + 0.4, 2.0), (0, my, MB_H - 2.0), mull, base=True))
    gy = my - MB_D / 2 - 0.05
    gx0, gx1 = -W / 2 + 7, W / 2 - 7
    HO.append(wall_quad('gl', gx0, gx1, 0.6, MB_H - 2.6, gy - 0.02, glass))
    for zz in range(0, int(MB_H - 3), 4):
        HO.append(wall_quad('glh', gx0, gx1, zz + 2.9, zz + 4.0, gy - 0.04, glass_hi))
    xx = gx0
    while xx <= gx1 + 0.01:
        HO.append(box('mul', (0.35, 0.4, MB_H - 3.2), (xx, gy - 0.2, 0.6), mull, base=True))
        xx += 4.0
    for zz in (9.0, 18.0):
        HO.append(box('tran', (gx1 - gx0, 0.5, 0.45), ((gx0 + gx1) / 2, gy - 0.25, zz), mull, base=True))
    # side windows (ribbon) and the entrance canopy on slim columns
    for sx in (-1, 1):
        for zz in (6.0, 16.0):
            HO.append(quad('sw', [(sx * (W / 2 - 1) + sx * 0.05, my - MB_D / 2 + 3 if sx > 0 else my + MB_D / 2 - 3, zz),
                                  (sx * (W / 2 - 1) + sx * 0.05, my + MB_D / 2 - 3 if sx > 0 else my - MB_D / 2 + 3, zz),
                                  (sx * (W / 2 - 1) + sx * 0.05, my + MB_D / 2 - 3 if sx > 0 else my - MB_D / 2 + 3, zz + 3.6),
                                  (sx * (W / 2 - 1) + sx * 0.05, my - MB_D / 2 + 3 if sx > 0 else my + MB_D / 2 - 3, zz + 3.6)], glass))
    HO.append(box('canopy', (34, 8, 1.0), (0, gy - 4.0, 9.6), mull, base=True))
    HO.append(box('canopy_e', (34.4, 8.4, 0.5), (0, gy - 4.0, 10.5), red, base=True))
    for sx in (-1, 1):
        HO.append(cylinder('ccol', 0.4, 9.6, (sx * 15, gy - 7.2, 0), seg=6, mat=mull))
    HO.append(box('fc', (W - 2, 6.0, 0.25), (0, gy - 3.0, 0), pave, base=True))
    # the IMAX hall block behind (tall, windowless, blue-grey) with the lettering
    IB_W, IB_D, IB_H = 50.0, 30.0, 64.0
    iy = hy - 1 - IB_D / 2
    HO.append(box('imax', (IB_W, IB_D, IB_H), (0, iy, 0), imax, base=True))
    HO.append(box('icap', (IB_W + 0.6, IB_D + 0.6, 2.0), (0, iy, IB_H - 2.0), mull, base=True))
    for zz in (20.0, 34.0, 48.0):
        HO.append(box('iband', (IB_W + 0.3, IB_D + 0.3, 0.6), (0, iy, zz), L.paint('#33424f', 'pr_iband'), base=True))
    HO.append(L.sign_panel('pr_sign', 'PRASADS', 40, 9.0, (0, iy - IB_D / 2 - 0.2, 50.0), fg='#c81a1a', bg='#f4f4f6', px=1024))
    HO.append(L.sign_panel('pr_imax', 'IMAX', 16, 5.0, (0, iy - IB_D / 2 - 0.2, 38.0), fg='#ffffff', bg='#1d4e8a', px=512))
    HO.append(L.sign_panel('pr_sign2', 'PRASADS', 24, 4.4, (0, gy - 8.3, 12.6), fg='#ffffff', bg='#c81a1a', px=512))
    LO.append(L.shell_box('s_mall', (W - 1.2, MB_D + 0.8, MB_H + 0.1), (0, my, 0)))
    LO.append(L.shell_box('s_imax', (IB_W + 0.8, IB_D + 0.8, IB_H + 0.1), (0, iy, 0)))
    LO.append(L.shell_box('s_can', (34.6, 8.6, 1.8), (0, gy - 4.0, 9.5)))
    LO.append(wall_quad('s_sg2', -12.2, 12.2, 10.3, 14.9, gy - 8.5))
    LO.append(quad('s_fc', [(-hx + 1, gy - 6.5, 0.3), (hx - 1, gy - 6.5, 0.3), (hx - 1, gy + 0.2, 0.3), (-hx + 1, gy + 0.2, 0.3)]))
    for sx in (-1, 1):
        LO.append(cylinder('s_ccol', 0.5, 9.6, (sx * 15, gy - 7.2, 0), seg=3, cap=False))
    # lit glass front at night (open only): one @night material parented to var_open
    pw = (gx1 - gx0 - 1.0 - 3 * 1.5) / 4
    lit = kit.join([wall_quad('lit', gx0 + 0.5 + k * (pw + 1.5), gx0 + 0.5 + k * (pw + 1.5) + pw, zz + 3.0, zz + 6.0, gy - 0.7)
                    for zz in (0.0, 9.6, 18.6) for k in range(4)] +
                   [wall_quad('lit', -15, 15, 11.2, 12.0, gy - 8.6)], 'pr_lit')
    lit.data.materials.append(lit_mat())
    apart(HS + LS, 2000.0)
    apart(HO + LO, 4000.0)
    los = L.finish_proxy(A, HB, lo=LB, keep=[lit], size=512, ao_dist=8.0, variants={'site': (HS, LS), 'open': (HO, LO)})
    unapart(los, 'var_site', 2000.0)
    lit.parent = unapart(los, 'var_open', 4000.0)
    L.shots(A, az=-30, el=12)


def lit_mat():
    return kit.material('lamp_lens', 'pr_glass@night', base='#3f7f99', emit='#ffcf8a', emit_strength=0.45, bake=False, alpha=1.0)
