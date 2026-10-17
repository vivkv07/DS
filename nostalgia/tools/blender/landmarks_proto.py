"""NOSTALGIA — tools/blender/landmarks_proto.py — landmark blockouts (ARCHITECTURE §21). Build:
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py charminar_proto

charminar_proto — a blockout of Charminar (1591) for the pipeline: the square core with four grand
pointed arches crossing through it (you can walk under them), four engaged minarets with two
balcony tiers and bulbous domes on lotus petals, the cornice (chajja) bands, blind arcades on the
galleries, the leaf cresting of the parapet, the four clock faces (1889; glow at night) and the
granite plinth. Lime plaster + granite as seamless tiles (crisp up close) with ambient occlusion
and ground dirt in vertex colours. Footprint = worlddata landmark 'charminar' (64 x 64 u, h 90 ->
135 u in 3D). It replaces the procedural Charminar only when N.models3d.useProto is set.
Landmark convention: front = -Y in Blender = south in the world before the face rotation
(FR = {s: 0, n: PI, e: PI/2, w: -PI/2}); the building is four-fold symmetric anyway.
"""
import math
from mathutils import Vector, Matrix
import kit
from kit import material, box, lathe, onion_profile, arch_outline, prism_from_outline

W = 64.0          # footprint
CORE = 25.0       # half side of the core square (minaret centres sit on its corners)
TOP = 80.0        # roof terrace
ARCH_W = 22.0
ARCH_SPRING = 33.0
ARCH_RISE = 15.0
MIN_R = 6.6       # minaret radius at the base


def rot_copies(objs, n=4):
    """three more copies of a face's decoration, rotated by 90 degrees about Z"""
    out = list(objs)
    for k in range(1, n):
        for o in objs:
            c = o.copy()
            c.data = o.data.copy()
            kit.link(c, o.users_collection[0])
            c.matrix_world = Matrix.Rotation(k * math.pi / 2, 4, 'Z') @ o.matrix_world
            kit.apply_transform(c)
            out.append(c)
    return out


def minaret(M, cx, cy):
    """Engaged corner minaret: faceted shaft to the roof, two balcony tiers, petals, onion dome."""
    parts = []
    seg = 20
    r0 = MIN_R
    prof = [(r0 + 0.8, 0.0), (r0 + 0.8, 1.6), (r0, 1.6), (r0, 30.0), (r0 + 0.45, 30.3), (r0 + 0.45, 31.4), (r0, 31.7),
            (r0, 55.0), (r0 + 0.5, 55.4), (r0 + 0.5, 56.8), (r0, 57.2), (r0, 69.5), (r0 + 0.5, 69.9), (r0 + 0.5, 71.2), (r0, 71.6),
            (r0, 80.0),
            # balcony 1: corbel, slab
            (r0 + 1.4, 81.6), (r0 + 2.6, 82.4), (r0 + 2.6, 83.4), (r0 - 0.9, 83.4),
            # shaft 2 (tapering) with a ring
            (r0 - 1.0, 92.0), (r0 - 0.55, 92.3), (r0 - 0.55, 93.2), (r0 - 1.0, 93.5), (r0 - 1.35, 100.0),
            # balcony 2
            (r0 - 0.2, 101.4), (r0 + 1.1, 102.0), (r0 + 1.1, 103.0), (r0 - 2.1, 103.0),
            # shaft 3 up to the petal drum
            (r0 - 2.2, 110.0), (r0 - 1.6, 110.4), (r0 - 1.6, 111.2), (r0 - 2.0, 111.4)]
    sh = lathe('minaret_shaft', prof, seg=seg, mat=M['plaster'], close_top=True, close_bottom=False)
    parts.append(sh)
    # balcony parapets: rings of small pointed merlons (arched railing look)
    for (rz, rr, n) in ((83.4, r0 + 2.4, 24), (103.0, r0 + 0.95, 18)):
        ring = []
        for i in range(n):
            a = 2 * math.pi * (i + 0.5) / n
            w = 2 * math.pi * rr / n * 0.62
            o = kit.prism_from_outline('rail', [(-w / 2, 0), (w / 2, 0), (w / 2, 1.5), (w * 0.2, 2.3), (0, 2.6), (-w * 0.2, 2.3), (-w / 2, 1.5)], 0.35, center=(0, 0, rz), mat=M['plaster'])
            o.rotation_euler = (0, 0, a + math.pi / 2)
            o.location = (rr * math.cos(a), rr * math.sin(a), 0)
            kit.apply_transform(o)
            ring.append(o)
        parts.append(kit.join(ring, 'balcony_rail'))
    # lotus petals round the dome base
    petals = []
    n = 14
    for i in range(n):
        a = 2 * math.pi * i / n
        o = kit.prism_from_outline('petal', [(-1.0, 0), (1.0, 0), (0.95, 1.4), (0.4, 2.6), (0, 3.1), (-0.4, 2.6), (-0.95, 1.4)], 0.3, center=(0, 0, 111.0), mat=M['plaster'])
        o.rotation_euler = (math.radians(-28), 0, a + math.pi / 2)
        o.location = ((r0 - 1.55) * math.cos(a), (r0 - 1.55) * math.sin(a), 0)
        kit.apply_transform(o)
        petals.append(o)
    parts.append(kit.join(petals, 'petals'))
    dome = lathe('dome', onion_profile(r0 - 2.1, 15.0, neck=0.92, bulge=1.16, tip=0.1, n=14, base_z=111.4), seg=seg, mat=M['plaster'])
    parts.append(dome)
    fin = lathe('finial', [(0.5, 128.0), (0.75, 128.6), (0.35, 129.4), (0.6, 130.3), (0.2, 131.4), (0.38, 132.0), (0.0, 135.0)], seg=8, mat=M['gold'])
    parts.append(fin)
    # vertical flutes on the lower shaft (shallow ribs)
    ribs = []
    for i in range(10):
        a = 2 * math.pi * (i + 0.5) / 10
        o = box('rib', (0.5, 0.45, 22.0), (0, 0, 0), M['plaster'], base=True)
        o.location = ((r0 + 0.12) * math.cos(a), (r0 + 0.12) * math.sin(a), 32.2)
        o.rotation_euler = (0, 0, a)
        kit.apply_transform(o)
        ribs.append(o)
    parts.append(kit.join(ribs, 'ribs'))
    for o in parts:
        o.location = (cx, cy, 0)
        kit.apply_transform(o)
    return parts


def face_decor(M):
    """Decoration of the south face (front, -Y); copied to the other three faces."""
    parts = []
    fy = -CORE
    # arch frame: a proud moulding following the arch outline
    outer = arch_outline(ARCH_W + 3.2, ARCH_SPRING, ARCH_RISE + 2.0, 'pointed', n=14)
    inner = arch_outline(ARCH_W, ARCH_SPRING, ARCH_RISE, 'pointed', n=14)
    fr = prism_from_outline('arch_frame', outer, 1.6, center=(0, fy - 0.3, 0), mat=M['plaster'])
    cut = prism_from_outline('arch_cut', inner, 4.0, center=(0, fy, -0.01), mat=M['plaster'])
    kit.boolean(fr, cut)
    parts.append(fr)
    # spandrel panels with rosettes either side of the apex
    for sx in (-1, 1):
        pan = box('spandrel', (7.0, 0.5, 6.0), (sx * 12.5, fy - 0.2, 44.0), M['plaster'], base=True)
        parts.append(pan)
        ros = kit.cylinder('rosette', 1.5, 0.6, (0, 0, 0), seg=12, mat=M['plaster'], axis='Y', base=False)
        ros.location = (sx * 12.5, fy - 0.55, 47.0)
        kit.apply_transform(ros)
        parts.append(ros)
    # clock: framed dial above the arch apex (glows at night)
    frame = kit.cylinder('clock_frame', 3.6, 0.9, (0, 0, 0), seg=24, mat=M['plaster'], axis='Y', base=False)
    frame.location = (0, fy - 0.5, 52.4)
    kit.apply_transform(frame)
    dial = kit.cylinder('clock_dial', 3.0, 0.3, (0, 0, 0), seg=24, mat=M['clock'], axis='Y', base=False)
    dial.location = (0, fy - 1.0, 52.4)
    kit.apply_transform(dial)
    parts += [frame, dial]
    hands = []
    for (nm, w, L, ang, dy) in (('hand_h', 0.4, 1.7, 55, 1.2), ('hand_m', 0.28, 2.5, -110, 1.28)):
        h = box(nm, (w, 0.12, L), (0, 0, 0), M['iron'], base=True)
        h.rotation_euler = (0, math.radians(ang), 0)
        h.location = (0, fy - dy, 52.4)
        kit.apply_transform(h)
        hands.append(h)
    for i in range(12):
        a = 2 * math.pi * i / 12
        t = box('tick', (0.22, 0.1, 0.5), (2.55 * math.cos(a), fy - 1.18, 52.4 + 2.55 * math.sin(a)), M['iron'])
        parts.append(t)
    parts += hands
    # cornice (chajja) bands with brackets
    for (z, d, h) in ((56.0, 3.0, 1.2), (70.0, 2.2, 1.0)):
        parts.append(box('cornice', (2 * CORE - 2 * MIN_R + 2.0, d, h), (0, fy - d / 2 + 0.3, z), M['plaster'], base=True))
        for i in range(17):
            x = -CORE + MIN_R + 1.0 + i * (2 * CORE - 2 * MIN_R - 2.0) / 16
            parts.append(box('bracket', (0.6, d * 0.8, 1.4), (x, fy - d * 0.4 + 0.3, z - 1.4), M['plaster'], base=True))
    # parapet cresting along the roof edge
    cr = kit.merlons('cresting', 2 * CORE - 2 * MIN_R + 1.0, TOP, 0.9, 3.6, n=13, w=2.2, mat=M['plaster'], kind='leaf')
    cr.location = (0, fy + 0.2, 0)
    kit.apply_transform(cr)
    parts.append(cr)
    parts.append(box('parapet_base', (2 * CORE - 2 * MIN_R + 1.4, 1.4, 1.2), (0, fy + 0.2, TOP - 1.0), M['plaster'], base=True))
    return parts


def arcade_cutters(z0, z1, n, depth, span, fy, kind='pointed'):
    """blind arcade: n arched recess cutters along a face (joined)"""
    cs = []
    step = span / n
    h = z1 - z0
    w = step * 0.62
    for i in range(n):
        x = -span / 2 + step * (i + 0.5)
        o = prism_from_outline('arc_cut', arch_outline(w, h * 0.62, h * 0.33, kind, n=8), depth * 2, center=(x, fy, z0))
        cs.append(o)
    return kit.join(cs, 'arcade_cut')


@kit.asset('charminar_proto', 'hero_landmark', draw='charminar', landmark='charminar', face='n', footprint=[64, 64], height=135.0,
           proto=True, floodlit=True, fit='footprint')
def charminar_proto(A):
    M = {
        'plaster': material('lime_plaster', 'plaster'),
        'granite': material('granite_grey', 'granite'),
        'clock': material('clock_face', 'clock@night', emit='#fff3d0', emit_strength=0.0),
        'iron': material('iron_black', 'iron'),
        'gold': material('gold_leaf', 'finial_gold', base='#b89a5a', metal=0.3, rough=0.55),
    }
    # ---- core: a cube with the two crossing arch tunnels and the upper floors' blind arcades
    core = box('core', (2 * CORE, 2 * CORE, TOP - 1.6), (0, 0, 1.6), M['plaster'], base=True)
    t1 = prism_from_outline('tunnel_ns', arch_outline(ARCH_W, ARCH_SPRING, ARCH_RISE, 'pointed', n=16), 2 * CORE + 8, center=(0, 0, 1.0))
    t2 = prism_from_outline('tunnel_ew', arch_outline(ARCH_W, ARCH_SPRING, ARCH_RISE, 'pointed', n=16), 2 * CORE + 8, axis='X', center=(0, 0, 1.0))
    tun = kit.join([t1, t2], 'tunnels')
    kit.boolean(core, tun)
    # galleries: blind arcades on all four faces (one cutter per face)
    span = 2 * CORE - 2 * MIN_R - 1.0
    for k in range(4):
        for (z0, z1, n, d) in ((58.2, 69.2, 7, 1.4), (72.0, 78.8, 11, 0.9)):
            c = arcade_cutters(z0, z1, n, d, span, -CORE, 'pointed')
            c.matrix_world = Matrix.Rotation(k * math.pi / 2, 4, 'Z') @ c.matrix_world
            kit.boolean(core, c)
    # inner vault ceiling over the crossing (a shallow dome seen from below)
    parts = [core]
    # ---- plinth and steps (granite)
    pl = box('plinth', (W + 6, W + 6, 1.0), (0, 0, 0), M['granite'], base=True, bevel=0.15, segments=1)
    st = box('plinth_top', (W + 3, W + 3, 0.6), (0, 0, 1.0), M['granite'], base=True, bevel=0.12, segments=1)
    parts += [pl, st]
    # granite dado on the piers
    for k in range(4):
        d = box('dado', (2 * CORE + 0.4, 0.5, 3.2), (0, -CORE - 0.1, 1.6), M['granite'], base=True)
        cut = prism_from_outline('dado_cut', arch_outline(ARCH_W + 0.2, ARCH_SPRING, ARCH_RISE, 'pointed', n=8), 3.0, center=(0, -CORE - 0.1, 0.5))
        kit.boolean(d, cut)
        d.matrix_world = Matrix.Rotation(k * math.pi / 2, 4, 'Z') @ d.matrix_world
        kit.apply_transform(d)
        parts.append(d)
    # ---- facade decoration x4
    parts += rot_copies(face_decor(M))
    # ---- minarets
    for (cx, cy) in ((-CORE, -CORE), (CORE, -CORE), (CORE, CORE), (-CORE, CORE)):
        parts += minaret(M, cx, cy)
    # ---- roof: terrace slab and the small mosque domes on the west side
    parts.append(box('roof', (2 * CORE - 1.0, 2 * CORE - 1.0, 0.8), (0, 0, TOP - 0.8), M['plaster'], base=True))
    for (x, y) in ((-14, -6), (-14, 6)):
        parts.append(lathe('roof_dome', onion_profile(3.2, 5.0, neck=0.95, bulge=1.08, tip=0.1, n=8, base_z=TOP + 0.6), seg=14, mat=M['plaster'], loc=(x, y, 0)))
    # ---- weld everything that shares the plaster into a few meshes
    for o in parts:
        kit.apply_modifiers(o)
    plaster = [o for o in parts if o.data.materials and o.data.materials[0] == M['plaster'] and len(o.data.materials) == 1]
    other = [o for o in parts if o not in plaster]
    body = kit.join(plaster, 'charminar_body')
    rest = kit.join(other, 'charminar_detail')
    kit.smooth(body, 32)
    kit.smooth(rest, 32)
    objs = [o for o in (body, rest) if o]
    kit.finish_tiled(A, objs, tile=12.0, tex=512, ao_samples=48, ao_strength=0.85, ao_dist=10.0, dice_edge=5.0, ground_dirt=7.0)
    # ---- camera collision proxies (never drawn): four piers + the upper body
    span_in = ARCH_W / 2
    cols = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx = sx * (span_in + (CORE + MIN_R - span_in) / 2)
            cy = sy * (span_in + (CORE + MIN_R - span_in) / 2)
            cols.append(box('COL_pier', (CORE + MIN_R - span_in, CORE + MIN_R - span_in, ARCH_SPRING + ARCH_RISE), (cx, cy, 0), None, base=True))
    cols.append(box('COL_upper', (2 * (CORE + MIN_R), 2 * (CORE + MIN_R), TOP - ARCH_SPRING - ARCH_RISE + 4), (0, 0, ARCH_SPRING + ARCH_RISE), None, base=True))
    for (cx, cy) in ((-CORE, -CORE), (CORE, -CORE), (CORE, CORE), (-CORE, CORE)):
        cols.append(box('COL_minaret', (2 * (MIN_R - 1.5), 2 * (MIN_R - 1.5), 135 - TOP), (cx, cy, TOP), None, base=True))
    colm = kit.join(cols, 'COL_charminar')
    A.notes.append('COL_charminar: camera-ray proxy (piers + upper body + minarets), invisible at runtime')
    A.preview = {'shots': [{'view': {'az': -35, 'el': 12, 'fov': 30, 'pad': 1.0}, 'samples': 20},
                           {'name': 'arch', 'size': 320, 'samples': 16, 'view': {'az': -8, 'el': 4, 'fov': 40, 'target': (0, -30, 28), 'dist': 70}}]}
