"""NOSTALGIA — tools/blender/oldcity/chowk.py — the Gulzar Houz chowk (ARCHITECTURE §21):
the Char Kaman (four arches, 1592) and the Gulzar Houz fountain between them.

    /home/user/.venvs/blender/bin/python tools/blender/build_all.py kaman kaman_kali kaman_sher_e_batil gulzar_houz

kaman / kaman_kali / kaman_sher_e_batil — one shared builder. worlddata has two 'ew' kamans
(72 x 12, the arch spans along X, you pass through along Y) and two 'ns' ones (12 x 72). The
runtime only rotates landmarks by `face` (none here) and fit='footprint' scales x by
lm.w / footprint[0], so one model cannot serve both: 'kaman' (draw key) is the X-spanning arch
and the '#kaman_kali' / '#kaman_sher_e_batil' keys get the same model turned by 90 degrees.
Dimensions follow the procedural kaman (view3d_landmarks.js): 72 x 12, opening 36 wide (x -18..18),
spring 33, apex 54, roof 75 (+ parapet, merlons and corner turrets to ~88); the piers line up
with the worlddata `solids`.

gulzar_houz — the octagonal fountain basin with its raised kerb, the tiered central fountain and
the low painted iron railing round the octagon (22 x 22, origin at the centre).
"""
import math
import bmesh
from mathutils import Vector
import kit
from kit import box, cylinder, lathe, onion_profile, arch_outline, prism_from_outline
from oldcity import common

# ---------------------------------------------------------------- shared lean helpers
def plate(name, outline, origin, normal, mat):
    """a one-sided flat polygon (blind niche, medallion, plaque) on a wall plane: outline [(u, z)],
    normal one of 'y-', 'y+', 'x-', 'x+' (u runs along X for y walls, along Y for x walls)"""
    ox, oy, oz = origin
    bm = bmesh.new()
    if normal[0] == 'y':
        vs = [bm.verts.new((ox + u, oy, oz + z)) for (u, z) in outline]
        want = Vector((0, -1 if normal[1] == '-' else 1, 0))
    else:
        vs = [bm.verts.new((ox, oy + u, oz + z)) for (u, z) in outline]
        want = Vector((-1 if normal[1] == '-' else 1, 0, 0))
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(want) < 0:
        f.normal_flip()
    return kit.obj_from_bm(bm, name, mat)


def front_slab(name, size, loc, mat, base=True, drop_top=False):
    """a proud slab against a -Y wall: a box without its hidden back (+Y) face (and top)"""
    o = box(name, size, loc, mat, base=base)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    back = [f for f in bm.faces if f.normal.y > 0.9 or (drop_top and f.normal.z > 0.9)]
    bmesh.ops.delete(bm, geom=back, context='FACES_ONLY')
    bm.to_mesh(o.data)
    bm.free()
    return o


def crest(name, length, n, h, depth, mat, gap=0.35):
    """a row of n Qutb Shahi leaf merlons (centred on X, base at z = 0): two back-to-back one-sided
    plates `depth` apart (no side faces: the vertex budget goes elsewhere)"""
    step = length / n
    pts = [(-length / 2, 0.0)]
    for i in range(n):
        a = -length / 2 + step * i + step * 0.06
        b = a + step * 0.88
        c = (a + b) / 2
        pts += [(a, gap), (a, h * 0.45), (c, h), (b, h * 0.45), (b, gap)]
    pts.append((length / 2, 0.0))
    return kit.join([plate(name, pts, (0, -depth / 2, 0), 'y-', mat), plate(name, pts, (0, depth / 2, 0), 'y+', mat)], name)


def cull_inside(o, lo, hi):
    """delete the faces whose centre lies inside the box lo..hi (hidden inside other masonry)"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    dead = []
    for f in bm.faces:
        c = f.calc_center_median()
        if all(lo[i] < c[i] < hi[i] for i in range(3)):
            dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    bm.to_mesh(o.data)
    bm.free()
    return o


def arch_band(name, w_in, w_out, spring, rise_in, rise_out, depth, y, z0=0.0, mat=None, n=10):
    """a U-shaped band (arch moulding / frame) between two pointed arch outlines, in the XZ plane"""
    outer = arch_outline(w_out, spring, rise_out, 'pointed', n)
    inner = arch_outline(w_in, spring, rise_in, 'pointed', n)
    o = prism_from_outline(name, outer + list(reversed(inner)), depth, center=(0, y, z0), mat=mat)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.y > 0.9], context='FACES_ONLY')   # against the wall
    bm.to_mesh(o.data)
    bm.free()
    return o


def lean_finish(A, hard, soft, tile=10.0, dice_edge=0, ao_dist=8.0, ground_dirt=5.0, soft_angle=50.0, ao_strength=0.8):
    """common.finish, but with two bodies: hard-edged masonry (sharp > 32 deg) and soft round
    things (turrets, domes, bars: sharp only above soft_angle) so their vertices are shared."""
    bodies = []
    for objs, ang, nm in ((hard, 32.0, '_hard'), (soft, soft_angle, '_soft')):
        objs = [o for o in objs if o is not None]
        if not objs:
            continue
        for o in objs:
            kit.apply_modifiers(o)
        b = kit.join(objs, A.id + nm)
        kit.smooth(b, ang)
        bodies.append(b)
    out = kit.finish_tiled(A, bodies, tile=tile, tex=512, ao_samples=32, ao_strength=ao_strength, ao_dist=ao_dist,
                           dice_edge=dice_edge, ground_dirt=ground_dirt)
    for b in bodies:
        common.uv_by_normal(b, tile)     # UVs per corner normal: no UV seams in the export
    return out


# ---------------------------------------------------------------- Char Kaman dimensions
L = 72.0          # span (X)
T = 12.0          # thickness (Y)
FY = T / 2        # face plane
ARCH_W = 36.0
SPRING = 33.0
APEX = 54.0
CORE_TOP = 73.0   # roof slab top (the parapet rises to ~75.6, merlons above)
PIER_X = 28.3     # centre of the niche column on each pier
TUR_X, TUR_Y, TUR_R = 34.5, 4.5, 2.2
PIER_NICHES = ((5.0, 15.0), (23.6, 15.0), (42.2, 12.8), (59.4, 9.0))   # (z0, h) per row


def niche_outline(w, h, sf=0.64, n=3):
    return arch_outline(w, h * sf, h * (1 - sf), 'pointed', n)


def kaman_build(A, rotate=False):
    M = common.mats(
        kplaster=('lime_plaster', dict(base='#ede2c8', var=0.07, grain=0.045, streaks=0.7, grime=0.45, dirt='#8d887e')),
        kplaster_hi=('lime_plaster', dict(base='#f4ecd8', var=0.05, grain=0.035, streaks=0.5, grime=0.4, dirt='#938e84')),
        niche=('lime_plaster_shadow', dict(base='#a39478', var=0.1, streaks=0.5, grime=0.6, dirt='#5e574c')),
    )
    P, PH, NI, G = M['kplaster'], M['kplaster_hi'], M['niche'], M['granite']
    hard, soft = [], []

    # ---- core wall with the great arch and its stepped reveal
    core = box('core', (L, T, CORE_TOP), (0, 0, 0), P, base=True)
    kit.boolean(core, prism_from_outline('arch', arch_outline(ARCH_W, SPRING + 1, APEX - SPRING, 'pointed', 10), T + 4, center=(0, 0, -1)))
    rv = [prism_from_outline('reveal', arch_outline(39.6, SPRING + 1, 22.4, 'pointed', 10), 2.0, center=(0, -FY, -1))]
    kit.boolean(core, kit.join(common.rot_copies(rv, 2), 'rcut'))
    # drop the bottom faces (on the ground)
    bm = bmesh.new()
    bm.from_mesh(core.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9 and f.calc_center_median().z < 0.01], context='FACES_ONLY')
    bm.to_mesh(core.data)
    bm.free()
    hard.append(core)

    # ---- front-face dressing (mirrored to the back face)
    skin = []
    yf = -FY
    for sx in (-1, 1):
        # pier panel with a column of four blind pointed niches
        skin.append(front_slab('pier_panel', (6.8, 0.7, 65.0), (sx * PIER_X, yf - 0.35 + 0.02, 3.4), PH))
        for (z0, h) in PIER_NICHES:
            skin.append(plate('pn', niche_outline(4.4, h), (sx * PIER_X, yf - 0.7, z0), 'y-', NI))
        # alfiz: the raised rectangular frame round the arch
        skin.append(front_slab('alfiz_v', (1.4, 0.9, 54.6), (sx * 22.9, yf - 0.45 + 0.02, 3.4), PH))
        # spandrel medallions
        ros = [(2.3 * math.cos(k * math.pi / 4 + math.pi / 8), 2.3 * math.sin(k * math.pi / 4 + math.pi / 8)) for k in range(8)]
        skin.append(plate('ros', ros, (sx * 19.4, yf - 0.03, 51.6), 'y-', PH))
        skin.append(plate('ros_b', [(p[0] * 0.45, p[1] * 0.45) for p in ros], (sx * 19.4, yf - 0.06, 51.6), 'y-', NI))
        # granite plinth at the pier foot
    skin.append(front_slab('alfiz_t', (47.2, 0.9, 1.4), (0, yf - 0.45 + 0.02, 57.2), PH))
    # pointed moulding round the reveal
    skin.append(arch_band('arch_mould', 39.6, 42.6, SPRING - 3.4, 22.4, 23.7, 0.6, yf - 0.25, z0=3.4, mat=PH, n=8))
    # gallery: a proud band of small pointed blind arches above the alfiz
    skin.append(front_slab('string1', (L - 6.0, 0.6, 0.8), (0, yf - 0.3 + 0.02, 58.8), PH))
    skin.append(front_slab('gal_band', (43.0, 0.45, 8.4), (0, yf - 0.22 + 0.02, 59.6), P))
    n_g = 9
    for i in range(n_g):
        x = -20.0 + 40.0 * (i + 0.5) / n_g
        skin.append(plate('gal', niche_outline(3.0, 7.2, 0.58, 2), (x, yf - 0.47, 60.3), 'y-', NI))
    # chajja brackets
    nb = 6
    for i in range(nb):
        x = -27.5 + 55.0 * i / (nb - 1)
        skin.append(front_slab('brk', (0.8, 1.4, 1.9), (x, yf - 0.7 + 0.02, 67.9), PH, drop_top=True))
    hard += common.rot_copies(skin, 2)
    # granite plinth (full depth) under each pier
    for sx in (-1, 1):
        hard.append(box('plinth', (18.4, T + 0.8, 3.4), (sx * (18.0 + 18.4 / 2 - 0.4), 0, 0), G, base=True))
    # end faces (+-X): a column of narrow blind niches between the turrets
    for sx in (-1, 1):
        for (z0, h) in PIER_NICHES[:3]:
            hard.append(plate('en', niche_outline(2.4, h - 1.5), (sx * (L / 2 + 0.02), 0, z0 + 1.0), 'x+' if sx > 0 else 'x-', NI))

    # ---- chajja (projecting cornice), frieze, parapet with leaf merlons
    hard.append(box('chajja', (L + 1.6, T + 2.8, 0.75), (0, 0, 69.8), PH, base=True))
    hard.append(box('frieze', (L - 0.4, T + 0.3, 2.45), (0, 0, 70.55), P, base=True))
    for sy in (-1, 1):
        hard.append(box('par', (L - 2.0, 0.9, 2.6), (0, sy * (FY - 0.45), CORE_TOP), P, base=True))
        m = crest('mer', 61.0, 12, 4.0, 0.6, PH)
        m.location = (0, sy * (FY - 0.45), CORE_TOP + 2.6)
        kit.apply_transform(m)
        hard.append(m)
    for sx in (-1, 1):
        hard.append(box('par_e', (0.9, T - 3.0, 2.6), (sx * (L / 2 - 0.45), 0, CORE_TOP), P, base=True))

    # ---- corner turrets: engaged octagonal shafts with ring mouldings, a little balcony, onion domes
    r = TUR_R
    prof = [(r + 0.5, 0.0), (r + 0.5, 3.4), (r, 3.8), 
            (r, 77.6), (r + 0.75, 78.2), (r + 0.75, 78.9), (r - 0.4, 78.9), (r - 0.4, 82.8), (r - 0.75, 83.6)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            loc = (sx * TUR_X, sy * TUR_Y, 0)
            sh = lathe('turret', prof, seg=8, mat=P, loc=loc, close_bottom=False)
            soft.append(cull_inside(sh, (-L / 2 + 0.05, -FY + 0.05, -1), (L / 2 - 0.05, FY - 0.05, CORE_TOP + 2.5)))
            soft.append(lathe('tdome', onion_profile(r - 0.4, 3.7, neck=0.85, bulge=1.12, n=5, base_z=83.6), seg=8, mat=PH, loc=loc, close_bottom=False))
            soft.append(cylinder('tfin', 0.16, 1.5, (loc[0], loc[1], 83.6 + 3.7 * 1.3), seg=4, mat=M['gold'], r2=0.02, cap=False))
            # four little arched openings on the drum (dark plates)
            rr = (r - 0.45) * math.cos(math.pi / 8) + 0.03
            for nrm in (('x-' if sx < 0 else 'x+'), ('y-' if sy < 0 else 'y+')):
                d = -1 if nrm[1] == '-' else 1
                o = (loc[0] + (d * rr if nrm[0] == 'x' else 0), loc[1] + (d * rr if nrm[0] == 'y' else 0), 79.4)
                hard.append(plate('dwin', arch_outline(1.0, 1.5, 0.9, 'pointed', 2), o, nrm, NI))

    # ---- camera-ray proxies (piers + the mass over the arch)
    cols = [common.col_box('pier_w', (18.0, T, CORE_TOP), (-27.0, 0, 0)),
            common.col_box('pier_e', (18.0, T, CORE_TOP), (27.0, 0, 0)),
            common.col_box('top', (ARCH_W, T, CORE_TOP - APEX + 2), (0, 0, APEX - 2))]
    cols = [common.col_join(cols, 'kaman')]

    if rotate:
        common.rot_z(hard + soft + cols, math.pi / 2)
    lean_finish(A, hard, soft, tile=10.0, dice_edge=0, ao_dist=4.0, ground_dirt=6.0, ao_strength=0.55)
    az0 = 90 if rotate else 0
    A.preview = common.shots(front_az=az0 - 35, el=12, extra=[
        {'name': 'arch', 'size': 320, 'samples': 14, 'view': {'az': az0 - 12, 'el': 3, 'fov': 40, 'pad': 0.5}}])


@kit.asset('kaman', 'landmark', draw='kaman', footprint=[72, 12], height=78, fit='footprint', floodlit=True)
def build_kaman(A):
    kaman_build(A, rotate=False)


@kit.asset('kaman_kali', 'landmark', landmark='kaman_kali', footprint=[12, 72], height=78, fit='footprint', floodlit=True)
def build_kaman_kali(A):
    kaman_build(A, rotate=True)


@kit.asset('kaman_sher_e_batil', 'landmark', landmark='kaman_sher_e_batil', footprint=[12, 72], height=78, fit='footprint', floodlit=True)
def build_kaman_sher_e_batil(A):
    kaman_build(A, rotate=True)


# ---------------------------------------------------------------- Gulzar Houz
OCT = [(math.cos(math.pi / 8 + k * math.pi / 4), math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]


def oct_pts(apothem):
    R = apothem / math.cos(math.pi / 8)
    return [(R * c, R * s) for (c, s) in OCT]


def oct_ring(name, a_out, a_in, z0, z1, mat):
    """octagonal ring wall (flats facing the axes), no bottom"""
    bm = bmesh.new()
    po, pi_ = oct_pts(a_out), oct_pts(a_in)
    ob = [bm.verts.new((x, y, z0)) for x, y in po]
    ot = [bm.verts.new((x, y, z1)) for x, y in po]
    ib = [bm.verts.new((x, y, z0)) for x, y in pi_]
    it = [bm.verts.new((x, y, z1)) for x, y in pi_]
    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((it[i], it[j], ib[j], ib[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


@kit.asset('gulzar_houz', 'landmark', landmark='gulzar_houz', footprint=[22, 22], height=15, fit='footprint', floodlit=False)
def build_gulzar_houz(A):
    M = common.mats(
        water=('granite_grey', dict(base='#5b6f68', rough=0.15, var=0.05, grain=0.02, specks=0.0, grime=0.1, dirt='#3e4a45')),
        rail=('iron_black', dict(base='#2c5a3d', rough=0.55, metal=0.25, rust=0.3, chips=0.3, under='#5a3a22')),
        kerb=('lime_plaster', dict(base='#e6dcc6', streaks=0.5, grime=0.45, dirt='#8a847a')),
    )
    hard, soft = [], []
    # stone platform step + kerb wall + coping
    hard.append(kit.extrude_polygon('step', oct_pts(11.0), 0.0, 0.7, M['granite']))
    hard.append(oct_ring('kerb', 10.2, 9.0, 0.7, 3.0, M['kerb']))
    hard.append(oct_ring('coping', 10.45, 8.8, 3.0, 3.5, M['granite']))
    # a cusped blind panel on each flat of the kerb
    for k in range(8):
        a = k * math.pi / 4
        o = plate('plq', arch_outline(4.4, 0.8, 0.8, 'cusped', 4), (0, -10.22, 1.05), 'y-', M['plaster_shadow'])
        common.rot_z([o], a)
        hard.append(o)
    # water (top surface only)
    bm = bmesh.new()
    bm.faces.new([bm.verts.new((x, y, 2.3)) for (x, y) in oct_pts(9.05)])
    hard.append(kit.obj_from_bm(bm, 'water', M['water']))
    # central fountain: lotus base, baluster stem, a wide tazza, a small upper bowl and the spout
    prof = [(3.3, 1.8), (3.3, 2.9), (2.6, 3.4), (1.6, 4.2), (1.25, 5.2), (1.55, 5.9), (1.0, 6.5),
            (0.9, 7.6), (1.3, 8.4), (3.4, 9.5), (3.9, 10.0), (3.9, 10.45), (0.75, 10.45),
            (0.65, 11.6), (1.25, 12.5), (1.6, 13.0), (0.45, 13.1), (0.5, 13.7), (0.0, 14.6)]
    soft.append(lathe('fountain', prof, seg=12, mat=M['plaster_hi'], close_bottom=False))
    bm = bmesh.new()
    bm.faces.new([bm.verts.new((3.45 * math.cos(k * math.pi / 6), 3.45 * math.sin(k * math.pi / 6), 10.33)) for k in range(12)])
    hard.append(kit.obj_from_bm(bm, 'tazza_water', M['water']))
    # railing on the coping: corner posts with finials, three rails, spear-headed bars
    a_r = 9.65
    zr0, zr1 = 3.5, 7.3
    corners = oct_pts(a_r)
    for (x, y) in corners:
        soft.append(cylinder('post', 0.26, zr1 - zr0 + 0.4, (x, y, zr0), seg=6, mat=M['rail'], cap=False))
        soft.append(cylinder('pfin', 0.32, 0.9, (x, y, zr1 + 0.4), seg=6, mat=M['rail'], r2=0.02, cap=False))
    for z in (zr0 + 2.2, zr1 - 0.55):
        pts = [(x, y, z) for (x, y) in corners] + [(corners[0][0], corners[0][1], z)]
        soft.append(kit.tube('rail', pts, 0.11, seg=4, mat=M['rail'], cap=False))
    # each side: a comb of spear-headed bars on a bottom rail, as two back-to-back flat plates
    side = 2 * a_r * math.tan(math.pi / 8)
    nb, bw, rb = 5, 0.18, 0.45
    comb = [(-side / 2, 0.0), (side / 2, 0.0), (side / 2, rb)]
    for bi in reversed(range(nb)):
        x = -side / 2 + side * (bi + 1) / (nb + 1)
        h = zr1 - zr0 - 0.6
        comb += [(x + bw / 2, rb), (x + bw / 2, h), (x + 0.24, h), (x, h + 0.75), (x - 0.24, h), (x - bw / 2, h), (x - bw / 2, rb)]
    comb.append((-side / 2, rb))
    for k in range(8):
        pl = [plate('comb', comb, (0, -a_r - 0.03, zr0), 'y-', M['rail']), plate('comb', comb, (0, -a_r + 0.03, zr0), 'y+', M['rail'])]
        common.rot_z(pl, k * math.pi / 4)
        hard += pl

    cols = [common.col_box('basin', (20.4, 20.4, 3.5), (0, 0, 0)), common.col_box('fountain', (4.0, 4.0, 14.0), (0, 0, 0))]
    common.col_join(cols, 'gulzar_houz')
    lean_finish(A, hard, soft, tile=4.0, dice_edge=0, ao_dist=4.0, ground_dirt=2.0, soft_angle=60.0)
    A.preview = common.shots(front_az=-35, el=24, extra=[
        {'name': 'close', 'size': 320, 'samples': 14, 'view': {'az': 20, 'el': 14, 'fov': 32, 'pad': 0.62}}])
