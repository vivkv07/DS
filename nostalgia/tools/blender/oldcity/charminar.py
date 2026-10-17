"""NOSTALGIA — tools/blender/oldcity/charminar.py — Charminar (1591), the finale landmark.

Binding art direction (design/feedback_3d.md round 2): a SOLID massive square block (~20 m a side)
of granite and lime plaster with one great pointed arch through each face (~11 m wide, ~20 m to
the crown) meeting in a vaulted crossing; above the arches the facade continues as solid wall: an
ornate projecting balcony band on carved brackets, then two upper storeys with rows of small
pointed arched openings and a parapet of leaf merlons; the small mosque on the roof at the west;
FOUR THICK FLUTED MINARETS built into the corners rising ~56 m with two carved balcony rings and
onion domes on lotus-leaf bases with finials; clocks (1889) above each arch; warm lime-plaster
cream with grey weathering, darker at the base.

Scale: 56 m minaret = 135 u (2.41 u / m). Block 48 u a side (minaret centres on its corners),
footprint 64 x 64 (worlddata 'charminar', face n; the model is four-fold symmetric except the
roof mosque, which sits on the west = model +X once the runtime turns it by PI for face n).
"""
import math
import bmesh
from mathutils import Matrix, Vector
import kit
from kit import box, lathe, onion_profile, arch_outline, prism_from_outline
from oldcity import common

S = 25.0          # half side of the block (wall faces): broad and squat, not a tower
MR = 6.6          # minaret radius at the base (thick, engaged into the corners)
ROOF = 81.5       # roof terrace (~0.6 of the minaret height)
PAR = 85.8        # top of the parapet merlons
ARCH_W = 30.0     # great arch: wide (piers either side are narrow, as on the real faces)
ARCH_SPRING = 36.0
ARCH_RISE = 22.0  # crown at 58 u (~0.43 of the minaret height)
BAND = 65.0       # balcony band (chajja) underside
ST1 = (67.8, 73.6)  # first upper storey openings
ST2 = (75.2, 79.8)  # second upper storey openings
TOP = 135.0       # finial tip
WALL = 2 * (S - MR) + 0.4   # free wall between the minarets on one face


def fluted_lathe(name, profile, seg=32, flutes=16, mat=None):
    """Revolve [(r, z, flute_depth), ...] around Z; each ring's radius is modulated by a rounded
    flute pattern (flute_depth u deep) so the shafts read as fluted / faceted like the real ones."""
    bm = bmesh.new()
    rings = []
    for (r, z, fd) in profile:
        ring = []
        if r < 1e-4:
            ring = [bm.verts.new((0, 0, z))]
        else:
            for k in range(seg):
                t = 2 * math.pi * k / seg
                f = 0.5 + 0.5 * math.cos(t * flutes)   # 1 on the ridges, 0 in the flutes
                rr = r - fd * (1 - f) ** 0.7
                ring.append(bm.verts.new((rr * math.cos(t), rr * math.sin(t), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(seg):
            if len(A) == 1:
                bm.faces.new((A[0], B[k], B[(k + 1) % seg]))
            elif len(B) == 1:
                bm.faces.new((A[k], A[(k + 1) % seg], B[0]))
            else:
                bm.faces.new((A[k], A[(k + 1) % seg], B[(k + 1) % seg], B[k]))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def ring_of(src_fn, n, radius, z, phase=0.0):
    """n objects made by src_fn() placed around Z at radius, facing outwards (joined)."""
    objs = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        o = src_fn()
        o.matrix_world = Matrix.Translation((radius * math.cos(a), radius * math.sin(a), z)) @ Matrix.Rotation(a + math.pi / 2, 4, 'Z')
        kit.apply_transform(o)
        objs.append(o)
    return kit.join(objs, 'ring')


def balcony(M, z, r_in, r_out, n_rail, rail_h=2.4, corbel_h=2.6):
    """A carved minaret balcony: a corbel cone fluted into n_rail brackets (muqarnas-like steps),
    the floor slab, a low parapet ring and its row of small pointed arch openings (flat dark
    decals on the parapet's outer face: cheap and readable from the street)."""
    parts = []
    prof = [(r_in, z - corbel_h - 0.6, 0), (r_in + 0.35, z - corbel_h - 0.3, 0), (r_in + 0.35, z - corbel_h, 0.3),
            (r_in + (r_out - r_in) * 0.45, z - corbel_h * 0.55, 0.55), (r_in + (r_out - r_in) * 0.55, z - corbel_h * 0.4, 0.5),
            (r_out - 0.25, z - 0.55, 0.0), (r_out, z - 0.5, 0), (r_out, z + 0.15, 0), (r_in - 0.2, z + 0.15, 0)]
    parts.append(fluted_lathe('balc_corbel', prof, seg=2 * n_rail, flutes=n_rail, mat=M['plaster']))
    rr = r_out - 0.3
    parts.append(lathe('balc_rail', [(rr, z + 0.15), (rr, z + rail_h), (rr + 0.25, z + rail_h), (rr + 0.25, z + rail_h + 0.3),
                                     (rr - 0.55, z + rail_h + 0.3), (rr - 0.55, z + 0.15)], seg=2 * n_rail, mat=M['plaster'], close_top=False, close_bottom=False))
    w = 2 * math.pi * rr / n_rail

    def opening():
        return common.decal('rail_open', arch_outline(w * 0.5, rail_h * 0.42, rail_h * 0.3, 'pointed', n=3), M['plaster_shadow'])
    o = ring_of(opening, n_rail, rr + 0.09, z + 0.15 + rail_h * 0.14, phase=math.pi / n_rail)
    parts.append(o)
    return parts


def _rot_bracket(o):
    # bracket outline is in XZ, sticking out along +X: turn it so it points outwards (-Y after ring_of)
    o.matrix_world = Matrix.Rotation(-math.pi / 2, 4, 'Z') @ o.matrix_world
    kit.apply_transform(o)
    return o


def minaret(M, cx, cy):
    """One corner minaret: a fluted shaft engaged in the block corner from the ground to the roof
    with ring mouldings at the storey lines, then two free stages above the roof, each with a carved
    balcony, a lotus-petal drum and a bulbous onion dome with a brass finial."""
    parts = []
    r0 = MR
    fd = 0.55
    prof = [(r0 + 0.9, 0.0, 0), (r0 + 0.9, 1.6, 0), (r0 + 0.5, 1.6, 0), (r0 + 0.5, 6.0, 0.0),  # granite-ish base drum
            (r0, 6.3, fd), (r0, ARCH_SPRING - 0.8, fd),
            (r0 + 0.5, ARCH_SPRING - 0.5, 0), (r0 + 0.5, ARCH_SPRING + 0.7, 0), (r0, ARCH_SPRING + 1.0, fd),
            (r0, BAND - 1.2, fd),
            (r0 + 0.6, BAND - 0.9, 0), (r0 + 0.6, BAND + 2.4, 0), (r0, BAND + 2.7, fd),
            (r0, ST2[0] - 1.4, fd),
            (r0 + 0.45, ST2[0] - 1.1, 0), (r0 + 0.45, ST2[0] - 0.1, 0), (r0 - 0.1, ST2[0] + 0.2, fd),
            (r0 - 0.1, ROOF + 0.5, fd),
            # free stage 1 (above the roof): clearly slimmer than the engaged shaft
            (r0 - 1.0, 86.5, fd * 0.9),
            (r0 - 1.1, 87.0, fd * 0.9), (r0 - 1.3, 101.0, fd * 0.8),
            (r0 - 1.55, 101.5, fd * 0.7), (r0 - 1.7, 105.0, fd * 0.7),
            # free stage 2
            (r0 - 2.0, 105.5, fd * 0.6), (r0 - 2.15, 113.0, fd * 0.6),
            (r0 - 1.75, 113.4, 0), (r0 - 1.75, 114.4, 0), (r0 - 2.25, 114.6, 0)]
    parts.append(fluted_lathe('minaret_shaft', prof, seg=24, flutes=12, mat=M['plaster']))
    # the two carved balconies on the free part
    parts += balcony(M, 87.0, r0 - 1.2, r0 + 1.9, 16, rail_h=2.6, corbel_h=3.6)
    parts += balcony(M, 105.5, r0 - 2.1, r0 + 0.2, 12, rail_h=2.2, corbel_h=2.4)
    # small blind arched niches round the free stages (dark recess panels on the shaft)
    for (z0, h, n, rr) in ((91.0, 7.5, 8, r0 - 1.2), (107.5, 4.6, 8, r0 - 2.1)):
        def niche(h=h, rr=rr):
            w = 2 * math.pi * rr / n * 0.38
            return common.decal('niche', arch_outline(w, h * 0.62, h * 0.38, 'pointed', n=4), M['plaster_shadow'])
        parts.append(ring_of(niche, n, rr + 0.1, z0, phase=math.pi / n))
    # lotus-leaf base (two rows of petals) and the onion dome
    dz = 114.6
    rd = r0 - 2.25

    # lotus-leaf base: a flared ring scalloped into 12 petals (fluted lathe), then the onion dome
    parts.append(fluted_lathe('lotus', [(rd - 0.2, dz - 1.2, 0), (rd + 0.5, dz - 0.6, 0.3), (rd + 1.0, dz + 0.3, 0.6), (rd + 1.3, dz + 1.2, 0.9),
                                        (rd + 0.5, dz + 1.2, 0.4), (rd + 0.1, dz + 0.6, 0.0)], seg=32, flutes=16, mat=M['plaster']))
    parts.append(lathe('dome', onion_profile(rd + 0.1, 11.8, neck=0.8, bulge=1.3, tip=0.08, n=11, base_z=dz + 0.6), seg=24, mat=M['plaster']))
    fin = lathe('finial', [(0.55, 128.2), (0.8, 128.6), (0.35, 129.3), (0.7, 130.2), (0.25, 131.2), (0.45, 131.8), (0.12, 133.0), (0.3, 133.6), (0.0, TOP)], seg=8, mat=M['gold'])
    parts.append(fin)
    for o in parts:
        o.location = (cx, cy, 0)
        kit.apply_transform(o)
    return parts


def face_decor(M):
    """Decoration of the south face (-Y); rotated onto the other three faces."""
    P = []
    fy = -S
    # alfiz: the raised rectangular frame round the great arch, with the arch moulding inside it
    fw = ARCH_W + 6.4
    ftop = BAND - 0.3
    for sx in (-1, 1):
        P.append(box('alfiz_post', (1.3, 0.9, ftop - 1.6), (sx * (fw / 2 - 0.65), fy - 0.3, 1.6), M['plaster_hi'], base=True))
    P.append(box('alfiz_top', (fw, 0.9, 1.3), (0, fy - 0.3, ftop - 1.3), M['plaster_hi'], base=True))
    outer = arch_outline(ARCH_W + 1.4, ARCH_SPRING, ARCH_RISE + 0.8, 'pointed', n=12)
    inner = arch_outline(ARCH_W, ARCH_SPRING, ARCH_RISE, 'pointed', n=12)
    fr = prism_from_outline('arch_mould', outer, 0.5, center=(0, fy - 0.15, 0), mat=M['plaster'])
    kit.boolean(fr, prism_from_outline('arch_cut', inner, 4.0, center=(0, fy, -0.01)))
    P.append(fr)
    # spandrel medallions (rosettes) left and right of the arch head
    for sx in (-1, 1):
        ros = kit.cylinder('rosette', 1.7, 0.5, (0, 0, 0), seg=12, mat=M['plaster_hi'], axis='Y', base=False)
        ros.location = (sx * (ARCH_W / 2 + 0.6), fy - 0.55, ARCH_SPRING + ARCH_RISE + 2.6)
        kit.apply_transform(ros)
        boss = kit.cylinder('boss', 0.7, 0.5, (0, 0, 0), seg=8, mat=M['plaster'], axis='Y', base=False)
        boss.location = (sx * (ARCH_W / 2 + 0.6), fy - 0.95, ARCH_SPRING + ARCH_RISE + 2.6)
        kit.apply_transform(boss)
        P += [ros, boss]
    # the clock (1889): a framed dial centred above the arch crown, glowing at night
    cz = ARCH_SPRING + ARCH_RISE + 3.6
    fr = kit.cylinder('clock_frame', 2.75, 0.8, (0, 0, 0), seg=24, mat=M['plaster_hi'], axis='Y', base=False)
    fr.location = (0, fy - 0.7, cz)
    kit.apply_transform(fr)
    dial = kit.cylinder('clock_dial', 2.3, 0.3, (0, 0, 0), seg=24, mat=M['clock'], axis='Y', base=False)
    dial.location = (0, fy - 1.0, cz)
    kit.apply_transform(dial)
    P += [fr, dial]
    for (nm, w, L, ang, dy) in (('hand_h', 0.32, 1.3, 60, 1.35), ('hand_m', 0.22, 1.9, -115, 1.45)):
        h = box(nm, (w, 0.1, L), (0, 0, 0), M['iron'], base=True)
        h.rotation_euler = (0, math.radians(ang), 0)
        h.location = (0, fy - dy, cz)
        kit.apply_transform(h)
        P.append(h)
    ticks = []
    for i in range(12):
        a = 2 * math.pi * i / 12
        hl, hw_ = (0.26 if i % 3 == 0 else 0.18), (0.14 if i % 3 == 0 else 0.09)
        cx_, cz_ = 1.9 * math.cos(a), cz + 1.9 * math.sin(a)
        ux, uz = math.cos(a), math.sin(a)
        ticks.append(common.decal('tick', [(cx_ - ux * hl - uz * hw_, cz_ - uz * hl + ux * hw_), (cx_ - ux * hl + uz * hw_, cz_ - uz * hl - ux * hw_),
                                          (cx_ + ux * hl + uz * hw_, cz_ + uz * hl - ux * hw_), (cx_ + ux * hl - uz * hw_, cz_ + uz * hl + ux * hw_)], M['iron'], y=fy - 1.28))
    P.append(kit.join(ticks, 'ticks'))
    # the projecting balcony band: carved brackets, a deep chajja slab, and a pierced balustrade
    L = WALL
    P.append(box('chajja', (L, 3.4, 0.9), (0, fy - 1.5, BAND), M['plaster_hi'], base=True))
    P.append(box('chajja_lip', (L, 0.5, 0.5), (0, fy - 3.0, BAND - 0.4), M['plaster_hi'], base=True))
    nb = 10
    for i in range(nb):
        x = -L / 2 + 1.0 + i * (L - 2.0) / (nb - 1)
        b = prism_from_outline('bracket', [(0, -2.4), (2.8, -0.1), (2.8, 0.0), (0, 0.0)], 0.55, center=(0, 0, 0), mat=M['plaster'])
        # outline is in XZ: x = outwards, z = down from the slab; turn so x points to -Y
        b.matrix_world = Matrix.Translation((x, fy, BAND)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
        kit.apply_transform(b)
        P.append(b)
    # balustrade on the band: a low solid rail with a row of small pointed openings (dark decals)
    P.append(box('bal', (L, 0.4, 2.0), (0, fy - 2.9, BAND + 0.9), M['plaster'], base=True))
    nbal = 22
    step = (L - 0.4) / nbal
    for i in range(nbal):
        x = -L / 2 + 0.2 + step * (i + 0.5)
        P.append(common.decal('bal_open', [(x + px, BAND + 1.15 + pz) for (px, pz) in arch_outline(step * 0.52, 0.85, 0.6, 'pointed', n=3)], M['plaster_shadow'], y=fy - 3.17))
    P.append(box('bal_cap', (L, 0.6, 0.3), (0, fy - 2.9, BAND + 2.9), M['plaster_hi'], base=True))
    # storey cornices
    P.append(box('cornice1', (L, 1.2, 0.7), (0, fy - 0.5, ST1[1] + 0.8), M['plaster_hi'], base=True))
    P.append(box('cornice2', (L, 1.6, 0.8), (0, fy - 0.7, ROOF - 0.6), M['plaster_hi'], base=True))
    P.append(box('cornice2b', (L, 1.0, 0.6), (0, fy - 0.45, ROOF - 1.4), M['plaster'], base=True))
    # small columns between the first-storey openings (the arcade piers read as colonnettes)
    n1 = 7
    sp = L - 2.0
    for i in range(n1 + 1):
        x = -sp / 2 + sp * i / n1
        P.append(kit.cylinder('colonnette', 0.32, ST1[1] - ST1[0] - 0.2, (x, fy - 0.35, ST1[0]), seg=8, mat=M['plaster_hi'], cap=False))
    # parapet: a band and the pierced leaf merlons (Qutb Shahi cresting)
    P.append(box('parapet', (L, 1.2, 1.4), (0, fy + 0.3, ROOF + 0.2), M['plaster'], base=True))
    cr = kit.merlons('cresting', L - 0.6, ROOF + 1.6, 0.8, PAR - ROOF - 1.6, n=14, w=2.1, mat=M['plaster'], kind='leaf')
    cr.location = (0, fy + 0.3, 0)
    kit.apply_transform(cr)
    P.append(cr)
    # granite dado on the piers either side of the arch
    for sx in (-1, 1):
        w = (L - ARCH_W) / 2 + 0.2
        P.append(box('dado', (w, 0.5, 3.6), (sx * (ARCH_W / 2 + w / 2 - 0.1), fy - 0.15, 1.6), M['granite'], base=True))
    return P


def storey_cutters():
    """one cutter per face for the two rows of arched openings of the upper storeys"""
    cs = []
    L = WALL - 2.0
    c1 = common.arcade_cutter(7, L, ST1[0], ST1[1] - ST1[0], 3.5, -S, 'pointed', wfrac=0.72, spring_frac=0.58)
    c2 = common.arcade_cutter(11, L, ST2[0], ST2[1] - ST2[0], 1.6, -S, 'pointed', wfrac=0.66, spring_frac=0.56)
    # the piers between the arches carry two stacked blind niches (cut 0.5 deep)
    cs = [c1, c2]
    out = []
    for k in range(4):
        for c in cs:
            o = common.copy_obj(c)
            o.matrix_world = Matrix.Rotation(k * math.pi / 2, 4, 'Z') @ o.matrix_world
            kit.apply_transform(o)
            out.append(o)
    for c in cs:
        bd = c.data
        bpy_remove(c)
    return out


def bpy_remove(o):
    import bpy
    d = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if d and d.users == 0:
        bpy.data.meshes.remove(d)


def roof_mosque(M):
    """The small mosque on the roof at the west (model +X): an arcaded prayer hall opening to the
    east (towards the roof terrace), a parapet and two slim pinnacles at its front corners."""
    P = []
    x0, x1 = 9.0, S - 2.0          # depth along X
    y0 = -12.0
    hz = ROOF + 0.2
    hall = box('mosque_hall', (x1 - x0, 24.0, 3.6), ((x0 + x1) / 2, 0, hz), M['plaster'], base=True)
    cut = common.arcade_cutter(5, 22.0, hz, 3.0, 3.0, 0, 'pointed', wfrac=0.62, spring_frac=0.6, axis='X')
    cut.location = (x0, 0, 0)
    kit.apply_transform(cut)
    kit.boolean(hall, cut)
    P.append(hall)
    P.append(box('mosque_cornice', (x1 - x0 + 0.8, 24.8, 0.5), ((x0 + x1) / 2, 0, hz + 3.6), M['plaster'], base=True))
    m = kit.merlons('mosque_crest', 24.0, hz + 4.1, 0.6, 1.1, n=10, w=1.5, mat=M['plaster'], kind='leaf')
    m.rotation_euler = (0, 0, math.pi / 2)
    m.location = (x0 - 0.2, 0, 0)
    kit.apply_transform(m)
    P.append(m)
    for sy in (-1, 1):
        P.append(lathe('mosque_pinnacle', [(0.6, hz), (0.6, hz + 5.0), (0.8, hz + 5.3), (0.45, hz + 5.6), (0.55, hz + 6.4), (0.0, hz + 7.8)], seg=8, mat=M['plaster'], loc=(x0, sy * 12.4, 0)))
    # (no dome: the real rooftop mosque is barely visible from the street)
    # P.append(lathe('mosque_dome', onion_profile(2.4, 3.6, neck=0.9, bulge=1.1, tip=0.08, n=8, base_z=hz + 7.8), seg=16, mat=M['plaster_hi'], loc=((x0 + x1) / 2, 0, 0)))
    return P


@kit.asset('charminar', 'hero_landmark', draw='charminar', landmark='charminar', face='n', footprint=[64, 64], height=TOP,
           floodlit=True, fit='footprint')
def build(A):
    M = common.mats(
        plaster=('lime_plaster', dict(base='#e9dcbc', var=0.07, grain=0.04, streaks=0.4, grime=0.35, dirt='#77706a')),
        plaster_hi=('lime_plaster', dict(base='#efe5cb', var=0.06, grain=0.04, streaks=0.3, grime=0.3, dirt='#7a7268')),
        plaster_shadow=('lime_plaster_shadow', dict(base='#8c7e66', var=0.05, grain=0.04, streaks=0.1)),
    )
    M['clock'] = kit.material('clock_face', 'clock@night', emit='#fff1c8', emit_strength=0.0)
    # ---- the block: a solid cube with the two crossing pointed tunnels (a groin-vaulted crossing)
    core = box('core', (2 * S, 2 * S, ROOF - 1.6), (0, 0, 1.6), M['plaster'], base=True)
    t1 = prism_from_outline('tunnel_ns', arch_outline(ARCH_W, ARCH_SPRING, ARCH_RISE, 'pointed', n=18), 2 * S + 8, center=(0, 0, 1.0))
    t2 = prism_from_outline('tunnel_ew', arch_outline(ARCH_W, ARCH_SPRING, ARCH_RISE, 'pointed', n=18), 2 * S + 8, axis='X', center=(0, 0, 1.0))
    kit.boolean(core, t1)
    kit.boolean(core, t2)
    for c in storey_cutters():
        kit.boolean(core, c)
    for (cx, cy) in ((-S, -S), (S, -S), (S, S), (-S, S)):
        kit.boolean(core, kit.cylinder('mcut', MR - 0.25, ROOF + 4, (cx, cy, -1), seg=8))
    kit.dice(core, 13.0)
    P = [core]
    # ---- granite plinth and step
    P.append(box('plinth', (62, 62, 0.9), (0, 0, 0), M['granite'], base=True, bevel=0.12, segments=1))
    P.append(box('plinth_top', (58.5, 58.5, 0.7), (0, 0, 0.9), M['granite'], base=True, bevel=0.1, segments=1))
    # ---- facade decoration x4
    P += common.rot_copies(face_decor(M))
    # ---- minarets
    for (cx, cy) in ((-S, -S), (S, -S), (S, S), (-S, S)):
        P += minaret(M, cx, cy)
    # ---- roof terrace and the mosque on its west side
    P.append(box('roof', (2 * S - 0.6, 2 * S - 0.6, 0.6), (0, 0, ROOF - 0.4), M['plaster'], base=True))
    P += roof_mosque(M)
    common.finish(A, P, tile=12.0, tex=1024, dice_edge=0, ao_samples=48, ao_dist=7.0, ground_dirt=9.0, ao_strength=0.6, smooth_angle=58.0)
    # ---- camera collision proxies (never drawn): four piers + the upper body + the minarets
    hw = ARCH_W / 2
    cols = []
    pw = S + MR - hw
    for sx in (-1, 1):
        for sy in (-1, 1):
            cols.append(common.col_box('pier', (pw, pw, ARCH_SPRING + ARCH_RISE), (sx * (hw + pw / 2), sy * (hw + pw / 2), 0)))
    cols.append(common.col_box('upper', (2 * (S + MR), 2 * (S + MR), PAR - ARCH_SPRING - ARCH_RISE), (0, 0, ARCH_SPRING + ARCH_RISE)))
    for (cx, cy) in ((-S, -S), (S, -S), (S, S), (-S, S)):
        cols.append(common.col_box('minaret', (2 * (MR - 1.5), 2 * (MR - 1.5), 128 - PAR), (cx, cy, PAR)))
    common.col_join(cols, 'charminar')
    A.notes.append('COL_charminar: camera-ray proxy (piers + upper body + minarets), invisible at runtime')
    A.notes.append('roof mosque on model +X = world west (face n turns the model by PI)')
    A.preview = {'shots': [
        {'view': {'az': -32, 'el': 10, 'fov': 30, 'pad': 0.98}, 'samples': 20, 'size': 448},
        {'name': 'front', 'size': 384, 'samples': 16, 'view': {'az': 0, 'el': 4, 'fov': 30, 'pad': 0.98}},
        {'name': 'arch', 'size': 320, 'samples': 14, 'view': {'az': -8, 'el': 3, 'fov': 42, 'target': (0, -30, 30), 'dist': 66}},
        {'name': 'top', 'size': 320, 'samples': 14, 'view': {'az': 50, 'el': 8, 'fov': 26, 'target': (S, S, 100), 'dist': 85}},
        {'name': 'street', 'size': 384, 'samples': 16, 'view': {'az': -22, 'el': 6, 'fov': 52, 'target': (0, 0, 62), 'dist': 120}},
        {'name': 'west', 'size': 320, 'samples': 14, 'view': {'az': 90, 'el': 28, 'fov': 30, 'pad': 1.0}},
    ]}
