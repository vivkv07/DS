"""NOSTALGIA — tools/blender/vehicles.py — vehicles (ARCHITECTURE §21). Build:
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py hero_cycle

Vehicle convention: front = -Y (forward), the rider's left = +X, wheels on z = 0. Length matches
vehicles.js TYPES[t].w (hero_cycle: 16 u, wheels R 3.0 u, like view3d_actors' 'hero' model so
riders fit both). Moving parts are bones of a rigid skin (one draw call): root (frame), steer
(fork + bars + front wheel + lamp, axis = the steering axis), wheel_front, wheel_rear, crank,
pedal_L, pedal_R. The runtime spins wheels / crank about the model's lateral axis and turns the
steer bone about its own axis (N.models3d.vehicleParts). Anchors: seat_driver, seat_pillion,
handlebar, grip_L/R, pedal_L/R, headlight, wheel_front, wheel_rear, bell, reflector.
"""
import math
from mathutils import Vector, Matrix
import kit
from kit import material, tube, lathe, loft


def V(*a):
    return Vector(a)


def wheel(name, c, R, M, spokes=36, seg=28):
    """28-inch roadster wheel at centre c (axle along X): tyre, chrome rim, hub, crossed spokes."""
    parts = []
    rt = 0.2   # tyre tube radius
    # tyre: a torus-like lathe of a circle (in the XZ profile, revolved around X)
    prof = []
    for i in range(9):
        a = 2 * math.pi * i / 8
        prof.append((R - rt + rt * math.cos(a), rt * 1.05 * math.sin(a)))
    ty = lathe_x(name + '_tyre', prof, seg, M['rubber'], c)
    parts.append(ty)
    rim = lathe_x(name + '_rim', [(R - 0.42, -0.1), (R - 0.32, -0.13), (R - 0.22, -0.11), (R - 0.22, 0.11), (R - 0.32, 0.13), (R - 0.42, 0.1)], seg, M['chrome'], c, closed=True)
    parts.append(rim)
    hub = kit.cylinder(name + '_hub', 0.17, 0.62, (0, 0, 0), seg=10, mat=M['chrome'], axis='X', base=False)
    hub.location = c
    kit.apply_transform(hub)
    parts.append(hub)
    for sx in (1, -1):
        fl = kit.cylinder(name + '_flange', 0.3, 0.05, (0, 0, 0), seg=12, mat=M['chrome'], axis='X', base=False)
        fl.location = (c[0] + 0.24 * sx, c[1], c[2])
        kit.apply_transform(fl)
        parts.append(fl)
    axle = kit.cylinder(name + '_axle', 0.06, 0.95, (0, 0, 0), seg=6, mat=M['steel'], axis='X', base=False)
    axle.location = c
    kit.apply_transform(axle)
    parts.append(axle)
    # spokes: tangential, alternating flanges (3-cross look)
    sp = []
    for i in range(spokes):
        a = 2 * math.pi * i / spokes
        side = 1 if i % 2 == 0 else -1
        lead = 0.42 * (1 if (i // 2) % 2 == 0 else -1)
        h = Vector((0.24 * side, 0.28 * math.cos(a + lead), 0.28 * math.sin(a + lead)))
        r = Vector((0.03 * side, (R - 0.4) * math.cos(a), (R - 0.4) * math.sin(a)))
        sp.append(tube(name + '_spoke%d' % i, [Vector(c) + h, Vector(c) + r], 0.022, seg=3, mat=M['chrome'], cap=False))
    parts.append(kit.join(sp, name + '_spokes'))
    return parts


def lathe_x(name, prof, seg, mat, c, closed=False):
    """revolve a profile [(radius, x_offset)] around the X axis, centred at c"""
    o = lathe(name, [(r, z) for (r, z) in prof], seg=seg, mat=mat, close_top=False, close_bottom=False)
    if closed:
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        # bridge last ring to the first (closed cross-section)
        n = len(prof)
        rings = [bm.verts[i * seg:(i + 1) * seg] for i in range(n)]
        for k in range(seg):
            try:
                bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], rings[0][(k + 1) % seg], rings[0][k]))
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
    o.rotation_euler = (0, math.radians(90), 0)
    o.location = c
    kit.apply_transform(o)
    return o


def guard(name, c, R, a0, a1, M, w=0.62, n=16):
    """Mudguard: a U-section ribbon following the tyre from angle a0 to a1 (around X, 0 = front
    (-Y), pi/2 = up)."""
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        d = Vector((0, -math.cos(a), math.sin(a)))
        rings.append(Vector(c) + d * (R + 0.26))
    parts = []
    # U profile: outer skin + two lips, built as a loft of a flattened ellipse-ish section
    pts = []
    for i, p in enumerate(rings):
        pts.append(dict(c=tuple(p), r=(w / 2, 0.09), p=4.0, w={'root': 1}))
    g = loft(name, pts, seg=10, side=(1, 0, 0), mat=M['paint'], cap_start=True, cap_end=True)
    return g


@kit.asset('hero_cycle', 'vehicle', vehicleTypes=['hero_cycle', 'old_cycle', 'chinnu_cycle'], length=16.0, wheelR=3.0, crankR=1.05,
           gear=2.4, parts=['root', 'steer', 'wheel_front', 'wheel_rear', 'crank', 'pedal_L', 'pedal_R'])
def hero_cycle(A):
    R = 3.0
    Ra = V(0, 5.0, R)
    Fa = V(0, -5.0, R)
    BB = V(0, 0.75, 2.35)
    SC = V(0, 1.95, 5.05)
    S0 = V(0, -3.55, 5.5)                     # head tube top
    ax = V(0, -0.381, -0.925).normalized()    # steering axis (down, forwards)
    HB = S0 + ax * 1.0                         # head tube bottom
    crown = S0 + ax * 1.18
    M = {
        'paint': material('paint_black', 'frame_paint'),
        'chrome': material('chrome'),
        'steel': material('steel'),
        'rubber': material('rubber'),
        'leather': material('leather_brown', base='#3a2418'),
        'grip': material('rubber', 'grip', base='#e6dcc4', rough=0.7),
        'red': material('reflector_red'),
        'lens': material('lamp_lens', 'lamp_lens@night', bake=False, alpha=1.0, emit='#fff1c8'),
        'gold': material('gold_leaf', 'pinstripe', base='#c8a040'),
    }
    groups = {}

    def add(bone, *objs):
        for o in objs:
            if o is None:
                continue
            groups.setdefault(bone, []).append(o)
    # ---------------------------------------------------------------- wheels
    add('wheel_rear', *wheel('wr', tuple(Ra), R, M))
    add('wheel_front', *wheel('wf', tuple(Fa), R, M))
    # ---------------------------------------------------------------- frame (diamond, lugged)
    tr = 0.15
    ttF = S0 + ax * 0.16
    dtF = HB - ax * 0.08
    fr = [
        tube('top_tube', [SC + V(0, 0, 0.02), ttF], tr, seg=8, mat=M['paint']),
        tube('down_tube', [BB, dtF], tr * 1.12, seg=8, mat=M['paint']),
        tube('seat_tube', [BB, SC + V(0, 0, 0.22)], tr, seg=8, mat=M['paint']),
        tube('head_tube', [S0 + V(0, 0, 0.06) - ax * 0.05, HB + ax * 0.06], 0.2, seg=10, mat=M['paint']),
    ]
    for sx in (1, -1):
        fr.append(tube('chain_stay', [BB + V(0.1 * sx, 0, 0), Ra + V(0.3 * sx, -0.25, 0.0)], 0.085, seg=6, mat=M['paint']))
        fr.append(tube('seat_stay', [SC + V(0.09 * sx, 0.06, -0.05), Ra + V(0.3 * sx, -0.15, 0.12)], 0.075, seg=6, mat=M['paint']))
        fr.append(tube('seat_stay2', [SC + V(0.12 * sx, 0.1, -0.25), Ra + V(0.33 * sx, -0.1, 0.2)], 0.06, seg=6, mat=M['paint']))  # roadster double stays
        # rear dropout plates
        fr.append(kit.box('dropout', (0.06, 0.55, 0.4), tuple(Ra + V(0.33 * sx, 0, 0)), M['paint']))
    # lugs (slightly fatter rings) with gold lining
    for p, d in ((SC, V(0, -0.4, 0.92)), (S0 - ax * 0.05, -ax), (HB, -ax), (BB, V(0, 0, 1))):
        fr.append(kit.cylinder('lug', 0.19, 0.22, (0, 0, 0), seg=10, mat=M['paint'], base=False))
        o = fr[-1]
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        o.location = p
        kit.apply_transform(o)
    for t0, t1 in ((SC, ttF), (BB, dtF)):
        for f in (0.12, 0.88):
            pnt = t0.lerp(t1, f)
            ring = kit.cylinder('pin', 0.165, 0.035, (0, 0, 0), seg=10, mat=M['gold'], base=False)
            ring.rotation_euler = (t1 - t0).to_track_quat('Z', 'Y').to_euler()
            ring.location = pnt
            kit.apply_transform(ring)
            fr.append(ring)
    # bottom bracket shell, seat post, saddle with springs
    fr.append(kit.cylinder('bb_shell', 0.24, 0.62, (0, 0, 0), seg=10, mat=M['paint'], axis='X', base=False))
    fr[-1].location = BB
    kit.apply_transform(fr[-1])
    sp_top = SC + V(0, 0.14, 0.42)
    fr.append(tube('seat_post', [SC + V(0, 0.0, 0.1), sp_top], 0.1, seg=8, mat=M['chrome']))
    sad = loft('saddle', [
        dict(c=(0, 1.32, 5.5), r=(0.16, 0.07), p=2.5, w={'root': 1}),
        dict(c=(0, 1.65, 5.53), r=(0.24, 0.1), p=2.5, w={'root': 1}),
        dict(c=(0, 2.05, 5.56), r=(0.42, 0.12), p=3.0, w={'root': 1}),
        dict(c=(0, 2.42, 5.58), r=(0.56, 0.13), p=3.5, w={'root': 1}),
        dict(c=(0, 2.62, 5.56), r=(0.55, 0.11), p=3.5, w={'root': 1}),
        dict(c=(0, 2.7, 5.5), r=(0.42, 0.06), p=3.0, w={'root': 1}),
    ], seg=12, side=(1, 0, 0), mat=M['leather'])
    fr.append(sad)
    fr.append(tube('saddle_rail', [V(-0.25, 1.45, 5.42), V(0, 1.9, 5.4), V(0.25, 1.45, 5.42)], 0.035, seg=4, mat=M['chrome']))
    fr.append(kit.box('saddle_clamp', (0.3, 0.3, 0.16), tuple(sp_top + V(0, 0, 0.0)), M['chrome']))
    for sx in (1, -1):
        sprg = []
        base = V(0.38 * sx, 2.45, 5.08)
        pts = [base + V(0.11 * math.cos(t * 1.0), 0.11 * math.sin(t * 1.0), t * 0.024) for t in [i * 0.6 for i in range(26)]]
        fr.append(tube('spring', pts, 0.022, seg=4, mat=M['chrome'], cap=False))
        fr.append(tube('spring_rod', [V(0.38 * sx, 2.45, 5.0), sp_top + V(0.1 * sx, 0.05, -0.05)], 0.035, seg=4, mat=M['chrome']))
    # rear carrier
    cz = 2 * R + 0.38
    cr = []
    for sx in (1, -1):
        cr.append(tube('carrier_rail', [V(0.6 * sx, 2.55, cz), V(0.6 * sx, 7.55, cz), V(0.45 * sx, 7.75, cz - 0.05)], 0.06, seg=5, mat=M['paint']))
        cr.append(tube('carrier_strut', [V(0.6 * sx, 7.3, cz), Ra + V(0.4 * sx, 0.02, 0.1)], 0.055, seg=5, mat=M['paint']))
        cr.append(tube('carrier_strut2', [V(0.6 * sx, 4.6, cz), Ra + V(0.4 * sx, -0.05, 0.15)], 0.05, seg=5, mat=M['paint']))
        cr.append(tube('carrier_stay', [V(0.6 * sx, 2.55, cz), SC + V(0.12 * sx, 0.15, -0.2)], 0.045, seg=4, mat=M['paint']))
    for k in range(6):
        y = 2.75 + k * 0.95
        cr.append(tube('slat', [V(-0.62, y, cz + 0.02), V(0.62, y, cz + 0.02)], 0.04, seg=4, mat=M['paint']))
    cr.append(tube('carrier_spring', [V(-0.5, 2.75, cz + 0.12), V(-0.5, 7.3, cz + 0.12), V(0.5, 7.3, cz + 0.12), V(0.5, 2.75, cz + 0.12)], 0.035, seg=4, mat=M['chrome']))
    fr += cr
    # mudguards (rear on the frame, front steers) and the rear reflector
    fr.append(guard('guard_rear', Ra, R, math.radians(38), math.radians(198), M))
    fr.append(kit.cylinder('reflector', 0.17, 0.05, (0, 0, 0), seg=10, mat=M['red'], axis='Y', base=False))
    fr[-1].location = Ra + V(0, 3.32, 0.75)
    kit.apply_transform(fr[-1])
    # chain guard (right side, -X), chain, chainring
    cg_poly = [(-0.6, 2.05), (-0.2, 1.65), (0.9, 1.75), (5.25, 2.6), (5.45, 3.0), (5.2, 3.35), (0.9, 3.25), (-0.25, 3.15), (-0.62, 2.7)]
    cg = kit.extrude_polygon('chain_guard', [(y, z) for (y, z) in cg_poly], -0.47, -0.42, M['paint'])
    # extrude_polygon builds in XY: rotate the outline into the YZ plane at x = -0.45
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(cg.data)
    for v in bm.verts:
        y, z, x = v.co.x, v.co.y, v.co.z
        v.co = Vector((x, y + 0.0, z))
    bm.to_mesh(cg.data)
    bm.free()
    kit.bevel_mod(cg, 0.03, 1, angle=30)
    fr.append(cg)
    ring = kit.cylinder('chainring', 0.95, 0.06, (0, 0, 0), seg=24, mat=M['chrome'], axis='X', base=False)
    ring.location = BB + V(-0.36, 0, 0)
    kit.apply_transform(ring)
    sprocket = kit.cylinder('sprocket', 0.36, 0.06, (0, 0, 0), seg=12, mat=M['steel'], axis='X', base=False)
    sprocket.location = Ra + V(-0.36, 0, 0)
    kit.apply_transform(sprocket)
    fr.append(sprocket)
    fr.append(tube('chain_low', [BB + V(-0.36, 0.0, -0.95), Ra + V(-0.36, 0, -0.36)], 0.05, seg=4, mat=M['steel']))
    # ---------------------------------------------------------------- crank + pedals
    crank = [ring, kit.cylinder('crank_axle', 0.1, 1.15, (0, 0, 0), seg=8, mat=M['steel'], axis='X', base=False)]
    crank[-1].location = BB
    kit.apply_transform(crank[-1])
    pedals = {}
    for sx, S, dy in ((1, 'L', 1.05), (-1, 'R', -1.05)):
        end = BB + V(0.55 * sx, dy, 0)
        crank.append(tube('crank_arm', [BB + V(0.45 * sx, 0, 0), end], 0.09, seg=6, mat=M['chrome']))
        pc = BB + V(0.95 * sx, dy, 0)
        pd = [kit.box('pedal_block', (0.55, 0.42, 0.2), tuple(pc), M['rubber'], bevel=0.03, segments=1),
              kit.box('pedal_frame', (0.62, 0.48, 0.07), tuple(pc), M['chrome']),
              kit.cylinder('pedal_spindle', 0.05, 0.5, (0, 0, 0), seg=6, mat=M['steel'], axis='X', base=False)]
        pd[-1].location = BB + V(0.7 * sx, dy, 0)
        kit.apply_transform(pd[-1])
        pd.append(kit.box('pedal_refl', (0.5, 0.05, 0.1), tuple(pc + V(0, 0.22, 0)), M['red']))
        pedals[S] = (pc, pd)
    # ---------------------------------------------------------------- steering: fork, stem, bars, lamp, bell, front guard, brakes
    st = []
    for sx in (1, -1):
        mid = crown.lerp(Fa, 0.55) + V(0, -0.28, 0)
        st.append(tube('fork_blade', [crown + V(0.24 * sx, 0, 0), mid + V(0.3 * sx, 0, 0), Fa + V(0.32 * sx, 0, 0.08)], 0.09, seg=6, mat=M['paint']))
    st.append(kit.cylinder('fork_crown', 0.28, 0.24, (0, 0, 0), seg=10, mat=M['chrome'], base=False))
    st[-1].scale = (1.8, 1.0, 1.0)
    st[-1].rotation_euler = ax.to_track_quat('Z', 'Y').to_euler()
    st[-1].location = crown
    kit.apply_transform(st[-1])
    stem_top = S0 - ax * 0.72
    st.append(tube('stem', [S0 - ax * 0.05, stem_top], 0.1, seg=8, mat=M['chrome']))
    bar_c = stem_top + V(0, -0.15, 0.05)
    st.append(tube('stem_ext', [stem_top, bar_c], 0.09, seg=6, mat=M['chrome']))
    bars = []
    for sx in (1, -1):
        bars.append(tube('bar', [bar_c, bar_c + V(0.55 * sx, -0.08, 0.02), bar_c + V(1.0 * sx, -0.05, 0.0), bar_c + V(1.38 * sx, 0.3, -0.04), bar_c + V(1.55 * sx, 0.75, -0.1), bar_c + V(1.62 * sx, 1.15, -0.14)], 0.075, seg=6, mat=M['chrome']))
        g0 = bar_c + V(1.56 * sx, 0.72, -0.1)
        g1 = bar_c + V(1.64 * sx, 1.28, -0.15)
        st.append(tube('grip', [g0, g0.lerp(g1, 0.5) + V(0, 0, 0.0), g1], 0.135, seg=8, mat=M['grip']))
        # rod-brake lever + rod down to the stirrups
        lv = bar_c + V(1.15 * sx, -0.35, -0.08)
        st.append(tube('brake_lever', [bar_c + V(0.95 * sx, -0.05, 0.0), lv, bar_c + V(1.45 * sx, 0.45, -0.18)], 0.04, seg=4, mat=M['chrome']))
    st += bars
    # front brake rod down the steering column to the front stirrup
    st.append(tube('front_rod', [bar_c + V(0.25, -0.2, -0.06), S0 + V(0.25, -0.12, 0), crown + V(0.25, -0.15, -0.1), Fa + V(0, -0.35, R - 0.3) + V(0.25, 0, 0)], 0.03, seg=4, mat=M['chrome']))
    st.append(tube('front_stirrup', [Fa + V(-0.3, -0.5, R - 0.45), Fa + V(-0.3, -0.25, R - 0.2), Fa + V(0.3, -0.25, R - 0.2), Fa + V(0.3, -0.5, R - 0.45)], 0.035, seg=4, mat=M['chrome']))
    st.append(guard('guard_front', Fa, R, math.radians(-20), math.radians(118), M))
    # bell (left of the stem) and the dynamo headlamp on its bracket
    bell = lathe('bell', [(0.0, 0.0), (0.24, 0.0), (0.25, 0.05), (0.2, 0.17), (0.1, 0.24), (0.04, 0.27), (0.0, 0.28)], seg=14, mat=M['chrome'])
    bell.location = bar_c + V(0.45, -0.04, 0.08)
    kit.apply_transform(bell)
    st.append(bell)
    lamp_c = S0 + ax * 0.55 + V(0, -0.52, 0.02)
    lamp = lathe('lamp', [(0.0, -0.22), (0.2, -0.22), (0.28, -0.12), (0.33, 0.05), (0.34, 0.2), (0.3, 0.24)], seg=14, mat=M['chrome'], close_top=False)
    lamp.rotation_euler = (math.radians(90), 0, 0)
    lamp.location = lamp_c
    kit.apply_transform(lamp)
    lens = kit.cylinder('lamp_lens', 0.29, 0.04, (0, 0, 0), seg=14, mat=M['lens'], axis='Y', base=False)
    lens.location = lamp_c + V(0, -0.24, 0)
    kit.apply_transform(lens)
    st += [lamp, lens, tube('lamp_bracket', [lamp_c + V(0, 0.2, 0), S0 + ax * 0.55 + V(0, -0.12, 0)], 0.05, seg=4, mat=M['chrome'])]
    # rear brake rod along the top tube to the rear stirrup (frame side)
    fr.append(tube('rear_rod', [ttF + V(-0.22, 0.05, -0.18), SC + V(-0.2, 0.0, -0.18), Ra + V(-0.32, -0.45, R - 0.35)], 0.03, seg=4, mat=M['chrome']))
    fr.append(tube('rear_stirrup', [Ra + V(-0.32, -0.55, R - 0.45), Ra + V(-0.32, -0.3, R - 0.2), Ra + V(0.32, -0.3, R - 0.2), Ra + V(0.32, -0.55, R - 0.45)], 0.035, seg=4, mat=M['chrome']))
    add('root', *fr)
    add('steer', *st)
    add('crank', *crank)
    for S in ('L', 'R'):
        add('pedal_' + S, *pedals[S][1])
    # ---------------------------------------------------------------- rig (rigid skin) + bake
    arm_d = kit.bpy.data.armatures.new('cycle_rig')
    arm = kit.bpy.data.objects.new('cycle_rig', arm_d)
    kit.link(arm, A.coll)
    kit.select_only([arm], arm)
    kit.bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_d.edit_bones

    def bone(n, h, t, parent=None):
        b = eb.new(n)
        b.head = h
        b.tail = t
        if parent:
            b.parent = eb[parent]
        return b
    X = V(0.8, 0, 0)
    bone('root', V(0, 0, 0), V(0, -0.8, 0))
    bone('steer', HB, HB - ax * 1.6, 'root')
    bone('wheel_front', Fa, Fa + X, 'steer')
    bone('wheel_rear', Ra, Ra + X, 'root')
    bone('crank', BB, BB + X, 'root')
    bone('pedal_L', pedals['L'][0], pedals['L'][0] + X, 'crank')
    bone('pedal_R', pedals['R'][0], pedals['R'][0] + X, 'crank')
    kit.bpy.ops.object.mode_set(mode='OBJECT')
    meshes = []
    for b, objs in groups.items():
        for o in objs:
            kit.apply_modifiers(o)
            kit.weights(o, b)
            kit.smooth(o, 38)
            meshes.append(o)
    cyc = kit.join(meshes, 'hero_cycle')
    kit.finish_atlas(A, [cyc], size=512, ao_samples=32, albedo_samples=8, ao_strength=0.65, ao_dist=1.5, orm=True)
    mod = cyc.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    cyc.parent = arm
    kit.normalize_weights(cyc, 1)
    # anchors
    A.anchor('seat_driver', (0, 2.1, 5.66), arm, 'root')
    A.anchor('seat_pillion', (0, 4.8, cz + 0.12), arm, 'root')
    A.anchor('handlebar', tuple(bar_c), arm, 'steer')
    for sx, S in ((1, 'L'), (-1, 'R')):
        A.anchor('grip_' + S, tuple(bar_c + V(1.6 * sx, 1.0, -0.13)), arm, 'steer')
        A.anchor('pedal_' + S, tuple(pedals[S][0] + V(0, 0, 0.1)), arm, 'pedal_' + S)
    A.anchor('headlight', tuple(lamp_c + V(0, -0.28, 0)), arm, 'steer')
    A.anchor('wheel_front', tuple(Fa), arm, 'wheel_front')
    A.anchor('wheel_rear', tuple(Ra), arm, 'wheel_rear')
    A.anchor('bell', tuple(bar_c + V(0.45, -0.04, 0.2)), arm, 'steer')
    A.anchor('reflector', tuple(Ra + V(0, 3.35, 0.75)), arm, 'root')
    A.meta.update({'steerAxis': [round(c, 4) for c in ax], 'bb': [round(c, 4) for c in BB], 'saddleZ': 5.66})
    A.preview = {'shots': [{'view': {'az': -62, 'el': 14, 'fov': 28}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}]}
