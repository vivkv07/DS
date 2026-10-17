"""NOSTALGIA — tools/blender/characters.py — people on the shared kid / adult skeleton (kit.KID_J /
kit.ADULT_J, bone names kit.BONES). Run through build_all.py:
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py kid_chinnu

kid_chinnu — Chinnu (11, 2003; story bible §2.1): faded blue cricket T-shirt with white shoulder
stripes and collar, khaki half-pants, blue-and-white hawai chappals, spiky black hair with a
cowlick, the yellow walkman on a shoelace and foam headphones round his neck. ~7 u tall.
Clips: idle, stroll, walk, run (in place, planted feet; stride bookkeeping in the manifest).
Tint regions (vertex attribute _REGION): skin hair shirt stripes pants shoes accent, so the
runtime can dress NPCs from N.people looks.
"""
import math
from mathutils import Vector, Matrix
import kit
from kit import loft, material


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def mir(p, sx):
    return (p[0] * sx, p[1], p[2])


def build_kid_body(J, M, sx_list=(1, -1)):
    """Body parts as lofts with per-ring bone weights. M: dict of materials (skin, shirt,
    stripe, pants). Returns the list of objects."""
    parts = []
    skin, shirt, stripe, pants = M['skin'], M['shirt'], M['stripe'], M['pants']
    # ---- torso: crotch -> waistband -> T-shirt hem -> chest -> collar -> neck
    T = [
        dict(c=(0, 0.02, 2.96), r=(0.46, 0.31), p=2.2, w={'hips': 1}, mat=pants),
        dict(c=(0, 0.02, 3.18), r=(0.57, 0.36), p=2.3, w={'hips': 1}, mat=pants),
        dict(c=(0, 0.02, 3.46), r=(0.565, 0.355), p=2.3, w={'hips': 0.85, 'spine': 0.15}, mat=pants),
        dict(c=(0, 0.02, 3.50), r=(0.60, 0.385), p=2.3, w={'hips': 0.8, 'spine': 0.2}, mat=shirt),   # shirt hem lip
        dict(c=(0, 0.02, 3.60), r=(0.585, 0.375), p=2.3, w={'hips': 0.6, 'spine': 0.4}, mat=shirt),
        dict(c=(0, 0.03, 3.95), r=(0.54, 0.345), p=2.3, w={'spine': 1}, mat=shirt),
        dict(c=(0, 0.01, 4.35), r=(0.575, 0.36), p=2.4, w={'spine': 0.5, 'chest': 0.5}, mat=shirt),
        dict(c=(0, -0.01, 4.80), r=(0.64, 0.375), p=2.5, w={'chest': 1}, mat=shirt),
        dict(c=(0, 0.01, 5.14), r=(0.665, 0.355), p=2.6, w={'chest': 1}, mat=shirt),
        dict(c=(0, 0.04, 5.36), r=(0.50, 0.29), p=2.4, w={'chest': 1}, mat=stripe),               # collar band
        dict(c=(0, 0.05, 5.47), r=(0.255, 0.23), p=2.0, w={'chest': 0.7, 'neck': 0.3}, mat=stripe),
        dict(c=(0, 0.06, 5.50), r=(0.20, 0.185), p=2.0, w={'chest': 0.5, 'neck': 0.5}, mat=skin),
        dict(c=(0, 0.07, 5.70), r=(0.19, 0.18), p=2.0, w={'neck': 1}, mat=skin),
        dict(c=(0, 0.06, 5.92), r=(0.18, 0.17), p=2.0, w={'neck': 0.4, 'head': 0.6}, mat=skin),
    ]
    parts.append(loft('torso', T, seg=16, side=(1, 0, 0)))
    for sx in sx_list:
        S = 'L' if sx > 0 else 'R'
        sh, el, wr, tip = J['shoulder'], J['elbow'], J['wrist'], J['hand_tip']

        def au(t):
            return mir(lerp(sh, el, t), sx)

        def af(t):
            return mir(lerp(el, wr, t), sx)
        A = [
            dict(c=mir((0.36, 0.06, 5.24), sx), r=0.21, w={'chest': 1}, mat=shirt),
            dict(c=mir((0.56, 0.07, 5.29), sx), r=0.25, w={'chest': 0.4, 'upperarm_' + S: 0.6}, mat=shirt),
            dict(c=au(0.12), r=0.245, w={'upperarm_' + S: 1}, mat=shirt),
            dict(c=au(0.30), r=0.235, w={'upperarm_' + S: 1}, mat=stripe),   # shoulder stripe
            dict(c=au(0.36), r=0.236, w={'upperarm_' + S: 1}, mat=shirt),
            dict(c=au(0.47), r=0.245, w={'upperarm_' + S: 1}, mat=stripe),   # sleeve cuff
            dict(c=au(0.54), r=0.25, w={'upperarm_' + S: 1}, mat=stripe),    # sleeve hem (annulus)
            dict(c=au(0.545), r=0.152, w={'upperarm_' + S: 1}, mat=skin),
            dict(c=au(0.80), r=0.145, w={'upperarm_' + S: 0.85, 'forearm_' + S: 0.15}, mat=skin),
            dict(c=au(1.0), r=0.135, w={'upperarm_' + S: 0.5, 'forearm_' + S: 0.5}, mat=skin),
            dict(c=af(0.30), r=0.14, w={'forearm_' + S: 1}, mat=skin),
            dict(c=af(0.75), r=0.115, w={'forearm_' + S: 0.9, 'hand_' + S: 0.1}, mat=skin),
            dict(c=af(1.0), r=0.10, w={'forearm_' + S: 0.4, 'hand_' + S: 0.6}, mat=skin),
        ]
        parts.append(loft('arm_' + S, A, seg=10, side=(0, 1, 0), cap_start=True, cap_end=True))
        # mitten hand with a thumb (palm faces the thigh: flatten across the front axis)
        d = (Vector(tip) - Vector(wr)).normalized()
        Hh = [
            dict(c=mir(lerp(wr, tip, 0.0), sx), r=(0.10, 0.075), w={'hand_' + S: 1}, mat=skin),
            dict(c=mir(lerp(wr, tip, 0.30), sx), r=(0.135, 0.07), w={'hand_' + S: 1}, mat=skin),
            dict(c=mir(lerp(wr, tip, 0.62), sx), r=(0.14, 0.068), w={'hand_' + S: 1}, mat=skin),
            dict(c=mir(lerp(wr, tip, 0.92), sx), r=(0.11, 0.055), w={'hand_' + S: 1}, mat=skin),
            dict(c=mir(lerp(wr, tip, 1.02), sx), r=(0.05, 0.03), w={'hand_' + S: 1}, mat=skin),
        ]
        parts.append(loft('hand_' + S, Hh, seg=8, side=(0, -1, 0)))
        th0 = mir(lerp(wr, tip, 0.22), sx)
        th = [
            dict(c=th0, r=0.06, w={'hand_' + S: 1}, mat=skin),
            dict(c=(th0[0] + 0.06 * sx, th0[1] - 0.14, th0[2] - 0.08), r=0.055, w={'hand_' + S: 1}, mat=skin),
            dict(c=(th0[0] + 0.09 * sx, th0[1] - 0.22, th0[2] - 0.17), r=0.035, w={'hand_' + S: 1}, mat=skin),
        ]
        parts.append(loft('thumb_' + S, th, seg=6, side=(1, 0, 0)))
        # ---- leg: pelvis -> shorts -> knee (scabbed) -> ankle
        hp, kn, an = J['hip'], J['knee'], J['ankle']

        def lt(t):
            return mir(lerp(hp, kn, t), sx)

        def ls(t):
            return mir(lerp(kn, an, t), sx)
        Lg = [
            dict(c=mir((0.27, 0.02, 3.36), sx), r=0.34, w={'hips': 1}, mat=pants),
            dict(c=mir((0.32, 0.0, 3.08), sx), r=(0.375, 0.37), w={'hips': 0.45, 'thigh_' + S: 0.55}, mat=pants),
            dict(c=lt(0.25), r=0.345, w={'thigh_' + S: 1}, mat=pants),
            dict(c=lt(0.45), r=0.345, w={'thigh_' + S: 1}, mat=pants),
            dict(c=lt(0.47), r=0.35, w={'thigh_' + S: 1}, mat=pants),      # hem (annulus)
            dict(c=lt(0.475), r=0.235, w={'thigh_' + S: 1}, mat=skin),
            dict(c=lt(0.75), r=0.215, w={'thigh_' + S: 0.9, 'shin_' + S: 0.1}, mat=skin),
            dict(c=lt(1.0), r=0.195, w={'thigh_' + S: 0.5, 'shin_' + S: 0.5}, mat=skin),
            dict(c=ls(0.28), r=(0.205, 0.215), w={'shin_' + S: 1}, mat=skin),
            dict(c=ls(0.70), r=0.15, w={'shin_' + S: 1}, mat=skin),
            dict(c=ls(0.95), r=0.125, w={'shin_' + S: 0.6, 'foot_' + S: 0.4}, mat=skin),
            dict(c=mir((an[0], an[1] + 0.03, 0.2), sx), r=0.14, w={'foot_' + S: 1}, mat=skin),
        ]
        parts.append(loft('leg_' + S, Lg, seg=10, side=(1, 0, 0)))
        # foot (heel -> toes), flat sole on top of the chappal
        bl, tp = J['ball'], J['toe']
        Ft = [
            dict(c=mir((an[0], 0.24, 0.15), sx), r=(0.12, 0.09), w={'foot_' + S: 1}, mat=skin),
            dict(c=mir((an[0], 0.06, 0.19), sx), r=(0.15, 0.13), w={'foot_' + S: 1}, mat=skin),
            dict(c=mir((an[0], -0.25, 0.15), sx), r=(0.17, 0.09), w={'foot_' + S: 1}, mat=skin),
            dict(c=mir((bl[0], bl[1] + 0.05, 0.12), sx), r=(0.18, 0.065), w={'foot_' + S: 0.5, 'toe_' + S: 0.5}, mat=skin),
            dict(c=mir((tp[0], tp[1] + 0.08, 0.1), sx), r=(0.16, 0.05), w={'toe_' + S: 1}, mat=skin),
            dict(c=mir((tp[0], tp[1] - 0.01, 0.1), sx), r=(0.09, 0.035), w={'toe_' + S: 1}, mat=skin),
        ]
        parts.append(loft('foot_' + S, Ft, seg=8, side=(1, 0, 0)))
    return parts


def build_head(J, M, hairM):
    """Head loft (chin -> crown), face features, ears, hair cap with spikes and a cowlick."""
    skin = M['skin']
    hz = J['head'][2]
    cy = J['head'][1] + 0.02
    H = [
        dict(c=(0, cy - 0.16, hz + 0.02), r=(0.16, 0.12), w={'head': 1}, mat=skin),
        dict(c=(0, cy - 0.10, hz + 0.12), r=(0.33, 0.33), w={'head': 1}, mat=skin),
        dict(c=(0, cy - 0.02, hz + 0.32), r=(0.47, 0.50), w={'head': 1}, mat=skin),
        dict(c=(0, cy + 0.02, hz + 0.55), r=(0.545, 0.575), w={'head': 1}, mat=skin),
        dict(c=(0, cy + 0.04, hz + 0.75), r=(0.56, 0.60), w={'head': 1}, mat=skin),
        dict(c=(0, cy + 0.05, hz + 0.95), r=(0.52, 0.575), w={'head': 1}, mat=skin),
        dict(c=(0, cy + 0.05, hz + 1.10), r=(0.42, 0.47), w={'head': 1}, mat=skin),
        dict(c=(0, cy + 0.05, hz + 1.20), r=(0.22, 0.25), w={'head': 1}, mat=skin),
        dict(c=(0, cy + 0.05, hz + 1.235), r=(0.05, 0.06), w={'head': 1}, mat=skin),
    ]
    parts = [loft('head', H, seg=16, side=(1, 0, 0), cap_start=True, cap_end=True)]
    fy = cy - 0.56  # face front plane (approx.)
    ez = hz + 0.62
    # nose
    parts.append(loft('nose', [dict(c=(0, fy + 0.08, ez - 0.02), r=(0.07, 0.05), w={'head': 1}, mat=skin),
                              dict(c=(0, fy - 0.03, ez - 0.17), r=(0.085, 0.07), w={'head': 1}, mat=skin),
                              dict(c=(0, fy - 0.06, ez - 0.24), r=(0.05, 0.035), w={'head': 1}, mat=skin)], seg=6, side=(1, 0, 0)))
    for sx in (1, -1):
        # ears
        parts.append(loft('ear', [dict(c=(0.5 * sx, cy + 0.06, ez - 0.18), r=(0.05, 0.08), w={'head': 1}, mat=skin),
                                  dict(c=(0.6 * sx, cy + 0.08, ez - 0.1), r=(0.04, 0.12), w={'head': 1}, mat=skin),
                                  dict(c=(0.62 * sx, cy + 0.1, ez + 0.02), r=(0.03, 0.08), w={'head': 1}, mat=skin)], seg=6, side=(0, 1, 0)))
        # eyes: white almond + dark iris, brows
        ew = kit.lathe('eyew', [(0.0, -0.05), (0.09, -0.04), (0.105, 0.0), (0.09, 0.03), (0.0, 0.04)], seg=10, mat=M['eye_white'])
        ew.scale = (1.0, 1.0, 1.25)
        ew.rotation_euler = (math.radians(90), 0, 0)
        ew.location = (0.205 * sx, fy + 0.09, ez)
        kit.apply_transform(ew)
        parts.append(ew)
        ir = kit.lathe('iris', [(0.0, -0.03), (0.062, -0.02), (0.068, 0.0), (0.06, 0.02), (0.0, 0.03)], seg=10, mat=M['eye_dark'])
        ir.scale = (1.0, 1.0, 1.15)
        ir.rotation_euler = (math.radians(90), 0, 0)
        ir.location = (0.2 * sx, fy + 0.055, ez - 0.01)
        kit.apply_transform(ir)
        parts.append(ir)
        parts.append(kit.tube('brow', [(0.09 * sx, fy + 0.07, ez + 0.15), (0.2 * sx, fy + 0.04, ez + 0.19), (0.31 * sx, fy + 0.09, ez + 0.16)], 0.032, seg=5, mat=hairM))
    # mouth: a small smile
    parts.append(kit.tube('mouth', [(-0.13, fy + 0.13, ez - 0.39), (-0.06, fy + 0.09, ez - 0.42), (0.0, fy + 0.085, ez - 0.43), (0.06, fy + 0.09, ez - 0.42), (0.13, fy + 0.13, ez - 0.39)], 0.028, seg=5, mat=M['lips']))
    for p in parts:
        kit.set_region(p, 1)
    # ---- hair: a cap following the skull + spikes + the cowlick
    cap = []
    rings = [(0.48, 0.0, 0.57, 0.60), (0.62, 0.02, 0.585, 0.625), (0.80, 0.05, 0.585, 0.63), (0.98, 0.06, 0.545, 0.60), (1.12, 0.06, 0.45, 0.50), (1.24, 0.06, 0.26, 0.29), (1.29, 0.06, 0.06, 0.07)]
    for (dz, dy, rx, ry) in rings:
        cap.append(dict(c=(0, cy + dy + 0.03, hz + dz), r=(rx + 0.02, ry + 0.02), w={'head': 1}, mat=hairM))
    hc = loft('haircap', cap, seg=16, side=(1, 0, 0), cap_start=False, cap_end=True)
    # cut the cap along a hairline: higher at the face, lower round the back
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(hc.data)
    kill = []
    for v in bm.verts:
        y = v.co.y - cy
        z = v.co.z - hz
        front = max(0.0, -y / 0.6)          # 0 at the back, 1 at the face
        side = abs(v.co.x) / 0.6
        line = 0.62 + 0.36 * front ** 1.6 - 0.1 * side * (1 - front)
        if z < line and front > 0.35:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(hc.data)
    bm.free()
    hair = [hc]
    # spikes: little pyramids pointing out from the skull, combed up and back
    import random
    rnd = random.Random(11)
    k = 0
    for ring_z, n, tilt in ((0.86, 9, 0.5), (1.02, 8, 0.75), (1.16, 6, 0.95)):
        for i in range(n):
            a = 2 * math.pi * (i + rnd.random() * 0.4) / n + 0.25
            nx, ny = math.cos(a), math.sin(a)
            if ny < -0.55 and ring_z < 0.9:
                continue  # keep the forehead clear
            base = Vector((nx * 0.5 * (1.18 - ring_z * 0.32), cy + 0.05 + ny * 0.54 * (1.18 - ring_z * 0.32), hz + ring_z + 0.03))
            dirv = Vector((nx * (1 - tilt), ny * (1 - tilt) + 0.25, tilt + 0.3)).normalized()
            L = 0.26 + rnd.random() * 0.14
            sp = loft('spike%d' % k, [dict(c=tuple(base - dirv * 0.04), r=0.11, w={'head': 1}, mat=hairM),
                                      dict(c=tuple(base + dirv * L * 0.55), r=0.06, w={'head': 1}, mat=hairM),
                                      dict(c=tuple(base + dirv * L), r=0.012, w={'head': 1}, mat=hairM)], seg=4, side=(0, 0, 1))
            hair.append(sp)
            k += 1
    # front fringe: three short spikes falling forward over the forehead
    for i, x in enumerate((-0.22, 0.0, 0.2)):
        base = Vector((x, cy - 0.42, hz + 1.0))
        dirv = Vector((x * 0.4, -0.65, -0.35)).normalized()
        hair.append(loft('fringe%d' % i, [dict(c=tuple(base), r=0.1, w={'head': 1}, mat=hairM),
                                          dict(c=tuple(base + dirv * 0.18), r=0.06, w={'head': 1}, mat=hairM),
                                          dict(c=tuple(base + dirv * 0.3), r=0.01, w={'head': 1}, mat=hairM)], seg=4, side=(1, 0, 0)))
    # the cowlick: a tuft at the crown standing up and back
    base = Vector((0.06, cy + 0.28, hz + 1.2))
    dirv = Vector((0.15, 0.45, 0.9)).normalized()
    hair.append(loft('cowlick', [dict(c=tuple(base), r=0.09, w={'head': 1}, mat=hairM),
                                 dict(c=tuple(base + dirv * 0.22 + Vector((0, -0.05, 0))), r=0.06, w={'head': 1}, mat=hairM),
                                 dict(c=tuple(base + dirv * 0.38 + Vector((0, -0.14, 0.02))), r=0.012, w={'head': 1}, mat=hairM)], seg=4, side=(1, 0, 0)))
    return parts, hair


def build_chappals(J, Mb, Mw):
    """Hawai chappals: blue sole, white footbed, a blue V strap; flex at the ball (foot / toe)."""
    parts = []
    for sx in (1, -1):
        S = 'L' if sx > 0 else 'R'
        x0 = J['ankle'][0] * sx
        outline = [(-0.17, 0.34), (0.0, 0.40), (0.17, 0.34), (0.20, 0.0), (0.22, -0.45), (0.22, -0.72), (0.12, -0.95), (-0.04, -0.98), (-0.18, -0.85), (-0.21, -0.5), (-0.19, 0.0)]
        if sx < 0:
            outline = [(-x, y) for (x, y) in reversed(outline)]
        poly = [(x0 + x, y) for (x, y) in outline]
        sole = kit.extrude_polygon('sole_' + S, poly, 0.0, 0.035, Mb)
        bed = kit.extrude_polygon('bed_' + S, poly, 0.035, 0.065, Mw)
        for o in (sole, bed):
            kit.bevel_mod(o, 0.012, 1, angle=30)
            kit.apply_modifiers(o)

        def w(co, S=S):
            # bend between the foot and the toe bone around the ball
            t = min(1.0, max(0.0, (co.y - (-0.62)) / 0.22))
            return {'foot_' + S: t, 'toe_' + S: 1 - t}
        for o in (sole, bed):
            o['nos_weights'] = 'chappal'
            kit.set_region(o, 6 if o is sole else 0)
            parts.append((o, w))
        # V strap: from between the big toe and the next one, up over the foot to both sides
        t0 = (x0 + 0.02 * sx, -0.62, 0.07)
        for side in (1, -1):
            pts = [t0, (x0 + 0.06 * side * sx, -0.42, 0.2), (x0 + 0.15 * side * sx, -0.2, 0.2), (x0 + 0.2 * side * sx, -0.08, 0.07)]
            st = kit.tube('strap_%s%d' % (S, side), pts, 0.034, seg=6, mat=Mb)
            kit.set_region(st, 6)
            parts.append((st, w))
    return parts


def build_walkman(M):
    """The yellow walkman on a shoelace + 90s foam headphones resting round the neck."""
    parts = []
    wm = kit.box('walkman', (0.40, 0.12, 0.52), (0.08, -0.46, 4.42), M['walkman'], bevel=0.035, segments=2)
    kit.apply_modifiers(wm)
    win = kit.box('wm_window', (0.26, 0.02, 0.16), (0.08, -0.525, 4.5), M['black'])
    btn = kit.box('wm_buttons', (0.3, 0.06, 0.04), (0.08, -0.46, 4.7), M['black'])
    lace = kit.tube('lace', [(0.22, 0.02, 5.48), (0.24, -0.25, 5.2), (0.2, -0.43, 4.86), (0.12, -0.46, 4.69), (0.04, -0.46, 4.69), (-0.06, -0.43, 4.9), (-0.17, -0.28, 5.2), (-0.21, 0.02, 5.48), (0.0, 0.2, 5.52), (0.22, 0.02, 5.48)], 0.022, seg=5, mat=M['lace'], cap=False)
    for o in (wm, win, btn, lace):
        kit.set_region(o, 7 if o is wm else 0)
        parts.append(o)
    # headphones: band behind the neck, two foam pads on the collarbones
    band = kit.tube('hp_band', [(0.33, -0.12, 5.42), (0.32, 0.12, 5.52), (0.0, 0.3, 5.58), (-0.32, 0.12, 5.52), (-0.33, -0.12, 5.42)], 0.03, seg=5, mat=M['steel'])
    parts.append(band)
    for sx in (1, -1):
        pad = kit.cylinder('hp_pad', 0.13, 0.08, (0.0, 0.0, 0.0), seg=12, mat=M['foam'], base=False)
        pad.rotation_euler = (math.radians(70), 0, math.radians(-25 * sx))
        pad.location = (0.33 * sx, -0.16, 5.36)
        kit.apply_transform(pad)
        parts.append(pad)
        cup = kit.cylinder('hp_cup', 0.09, 0.05, (0, 0, 0), seg=10, mat=M['black'], base=False)
        cup.rotation_euler = (math.radians(70), 0, math.radians(-25 * sx))
        cup.location = (0.36 * sx, -0.09, 5.4)
        kit.apply_transform(cup)
        parts.append(cup)
    return parts


@kit.asset('kid_chinnu', 'character', role='player', rig='kid_rig', height=7.0, people=['player', 'kid'], look={'kind': 'kid', 'skin': '#b97a4f', 'hair': '#1a1412', 'shirt': '#3d6fb0', 'stripes': '#f2f0ea', 'pants': '#8a7a55'})
def kid_chinnu(A):
    J = kit.KID_J
    M = {
        'skin': material('skin', 'skin'),
        'shirt': material('cloth', 'shirt', base='#3d6fb0', var=0.09, region=3),
        'stripe': material('cloth_stripe', 'stripe', base='#eeebe2', region=4),
        'pants': material('cloth_pants', 'pants', base='#8a7a55', region=5),
        'eye_white': material('eye_white'), 'eye_dark': material('eye_dark'), 'lips': material('lips', base='#7e4434'),
        'walkman': material('walkman'), 'black': material('plastic_black'), 'lace': material('shoelace'),
        'steel': material('steel', base='#7a7d82'), 'foam': material('foam_orange'),
    }
    hairM = material('hair', 'hair')
    chB = material('chappal', 'chappal_strap', base='#2f62b5')
    chW = material('chappal_sole', 'chappal_bed')
    body = build_kid_body(J, M)
    head, hair = build_head(J, M, hairM)
    chappals = build_chappals(J, chB, chW)
    acc = build_walkman(M)
    arm = kit.build_armature(J, 'kid_rig', A.coll)
    A.armature = arm
    # rigid / blended weights for parts without per-ring weights
    for o in head + hair:
        if not o.vertex_groups:
            kit.weights(o, 'head')
    for o, wf in chappals:
        kit.weights(o, wf)

    def chest_w(co):
        return {'chest': 0.6, 'neck': 0.4} if co.z > 5.3 else {'chest': 1.0}
    for o in acc:
        kit.weights(o, chest_w)
    # per-part smoothing: organic parts smooth, hard accessories with crisp edges
    for o in body + head + hair:
        kit.smooth(o, 70)
    for o in acc + [o for o, _ in chappals]:
        kit.smooth(o, 35)
    kid = kit.join(body + head + hair + [o for o, _ in chappals] + acc, 'kid_chinnu')
    A.tint = {'attribute': '_REGION', 'names': kit.REGIONS, 'regions': kit.region_colours(kid)}
    kit.write_regions(kid)
    # bake: one 512 atlas (procedural cloth, skin, hair detail x AO)
    kit.finish_atlas(A, [kid], size=512, ao_samples=40, albedo_samples=12, ao_strength=0.6, ao_dist=1.2)
    # skinning
    mod = kid.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    kid.parent = arm
    kit.normalize_weights(kid, 4)
    # clips
    R = kit.Rig(arm, J)
    A.clips['idle'] = kit.idle_clip(R, 'idle', frames=120)
    for g in ('stroll', 'walk', 'run'):
        A.clips[g] = kit.gait_clip(R, g, kit.GAITS[g], frames=32)
    # anchors on bones: soles (contact checks), grips, the first-person eye
    for sx, S in ((1, 'L'), (-1, 'R')):
        A.anchor('sole_heel_' + S, (J['heel'][0] * sx, J['heel'][1], 0.0), arm, 'foot_' + S)
        A.anchor('sole_toe_' + S, (J['toe'][0] * sx, J['toe'][1], 0.0), arm, 'toe_' + S)
        A.anchor('grip_' + S, tuple(Vector(mir(J['wrist'], sx)) * 0.4 + Vector(mir(J['hand_tip'], sx)) * 0.6), arm, 'hand_' + S)
    A.anchor('eye', (0.0, J['head'][1] - 0.5, J['head'][2] + 0.62), arm, 'head')
    A.anchor('head_top', (0.0, J['head'][1], J['head'][2] + 1.42), arm, 'head')
    A.meta['bones'] = kit.BONES
    A.preview = {
        'shots': [{}, {'name': 'face', 'size': 256, 'samples': 20, 'view': {'az': -20, 'el': 8, 'fov': 18, 'target': (0, -0.2, 6.3), 'dist': 7.5}}],
        'sheet': {'name': 'gait', 'size': 160, 'samples': 10, 'cols': 8, 'view': {'az': -90, 'el': 4, 'fov': 30, 'target': (0, 0, 3.4), 'dist': 16},
                  'frames': [('walk', f) for f in range(0, 32, 4)] + [('run', f) for f in range(0, 32, 4)]},
    }
