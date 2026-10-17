"""NOSTALGIA — tools/blender/vehicles.py (vehicles artist) — every vehicle of the game (ARCHITECTURE §21).
Build one / some / all:
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py auto_rickshaw ambassador
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py --list

Vehicle convention (binding): front = -Y (forward), the rider's left = +X, wheels on z = 0, origin at
the centre of the 2D collision footprint; the length along -Y equals vehicles.js TYPES[t].w and the
width ~ TYPES[t].d (src/vehicles.js, traffic.js 'rickshaw'). Moving parts are bones of a rigid skin
(one mesh, one baked material M_<id>@night = one draw call): root, steer (+ steer_L / steer_R for
cars), wheel_* (any number; spin radius per bone in meta.wheels), crank, pedal_L / pedal_R, saddle,
prop / paddle (boats), opt_* (variant parts the runtime scales to zero: taxi carrier, beacon,
slogans...). Paint faces carry the _REGION tint (1 = paint <- v.color, 2 = paint2 <- v.color2 or a
livery colour, see meta.tint), so one model serves every colour of a type. Lamps are baked into an
emissive mask (head / tail / meter lamps glow at night while the vehicle is in use).
Anchors: seat_driver, seat_pillion, seat_passenger_*, handlebar, grip_L/R (handlebar grips or the
steering-wheel rim), foot_L/R (footrests / floor where the rider's feet go), pedal_L/R,
foot_pillion_L/R, headlight*, taillight*, indicator_*, exhaust, wheel_*, bell, reflector.
Rider geometry for pedal cycles is shared with characters.py through HERO / hero_geom() (the riders'
ride_cycle clips are authored against it): change both together.
Helpers: tools/blender/_vehicles_kit.py (rig, bakes, tint regions, emissive lamps, previews).
"""
import math
from mathutils import Vector, Matrix
import kit
from kit import material, tube, lathe, loft
import _vehicles_kit as vk


def V(*a):
    return Vector(a)


# ---------------------------------------------------------------- Hero roadster geometry (Blender
# coords, front -Y). Shared with characters.py: the riders' ride_cycle clips are authored against it.
R = 3.0                                    # wheel radius incl. tyre (u)
RA = V(0, 5.0, R)                          # rear axle
FA = V(0, -5.0, R)                         # front axle
BB = V(0, 0.75, 2.35)                      # bottom bracket
SC = V(0, 1.72, 4.78)                      # seat cluster (top of the seat tube)
S0 = V(0, -3.55, 5.5)                      # head tube top
AX = V(0, -0.381, -0.925).normalized()     # steering axis (down, forwards)
SEAT_TUBE = (SC - BB).normalized()
SEAT = V(0, 1.62, 5.3)                     # saddle top centre: where the rider sits
STEM_TOP = S0 - AX * 0.72
BAR_C = STEM_TOP + V(0, -0.15, 0.05)       # handlebar centre (on the steer bone)
GRIP = V(1.61, 1.68, -0.185)               # grip centre relative to BAR_C (x mirrored for the right)
CRANK_R = 1.05
PEDAL_X = 0.95
SADDLE_DROP = {'chinnu_cycle': 0.6}        # Chinnu's cycle: the saddle let right down (u along the seat tube)
HERO = {'vehicle': 'hero_cycle', 'seat': tuple(SEAT), 'grip_L': tuple(BAR_C + GRIP), 'grip_R': tuple(BAR_C + V(-GRIP.x, GRIP.y, GRIP.z)),
        'bb': tuple(BB), 'crank': CRANK_R, 'pedal_x': PEDAL_X, 'pedal_up': 0.14, 'seat_tube': tuple(SEAT_TUBE)}


def hero_geom(saddle_drop=0.0):
    """rider targets for a saddle lowered by `saddle_drop` u along the seat tube"""
    g = dict(HERO)
    g['seat'] = tuple(SEAT - SEAT_TUBE * saddle_drop)
    g['saddleDrop'] = saddle_drop
    return g


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
           gear=2.4, parts=['root', 'steer', 'wheel_front', 'wheel_rear', 'crank', 'pedal_L', 'pedal_R', 'saddle'], saddleDrop=SADDLE_DROP)
def hero_cycle(A):
    Ra, Fa, ax = RA, FA, AX
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
    # saddle group (its own bone: variants let it down along the seat tube)
    sd = []
    clamp = SEAT + V(0, 0.12, -0.3)
    sd.append(tube('seat_post', [SC - SEAT_TUBE * 0.3, clamp], 0.1, seg=8, mat=M['chrome']))
    sd.append(loft('saddle', [
        dict(c=tuple(SEAT + V(0, -0.72, -0.08)), r=(0.16, 0.07), p=2.5, w={'root': 1}),
        dict(c=tuple(SEAT + V(0, -0.42, -0.04)), r=(0.25, 0.1), p=2.5, w={'root': 1}),
        dict(c=tuple(SEAT + V(0, -0.05, -0.01)), r=(0.43, 0.12), p=3.0, w={'root': 1}),
        dict(c=tuple(SEAT + V(0, 0.32, 0.0)), r=(0.56, 0.13), p=3.5, w={'root': 1}),
        dict(c=tuple(SEAT + V(0, 0.52, -0.02)), r=(0.55, 0.11), p=3.5, w={'root': 1}),
        dict(c=tuple(SEAT + V(0, 0.6, -0.08)), r=(0.42, 0.06), p=3.0, w={'root': 1}),
    ], seg=12, side=(1, 0, 0), mat=M['leather']))
    sd.append(tube('saddle_rail', [SEAT + V(-0.25, -0.62, -0.16), SEAT + V(0, -0.2, -0.2), SEAT + V(0.25, -0.62, -0.16)], 0.035, seg=4, mat=M['chrome']))
    sd.append(kit.box('saddle_clamp', (0.3, 0.3, 0.16), tuple(clamp), M['chrome']))
    for sx in (1, -1):
        base = SEAT + V(0.38 * sx, 0.42, -0.5)
        pts = [base + V(0.11 * math.cos(t), 0.11 * math.sin(t), t * 0.022) for t in [i * 0.6 for i in range(26)]]
        sd.append(tube('spring', pts, 0.022, seg=4, mat=M['chrome'], cap=False))
        sd.append(tube('spring_rod', [SEAT + V(0.38 * sx, 0.42, -0.56), clamp + V(0.1 * sx, 0.05, -0.05)], 0.035, seg=4, mat=M['chrome']))
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
    # the maker's name hand-painted on the chain guard (plain lettering, no logo)
    dec = kit.signboard('chain_guard_name', 'HERO', 1.9, 0.42, depth=0.02, fg='#d6b04a', bg='#141418', frame_mat=M['paint'], px=256)
    dec.rotation_euler = (0, 0, math.radians(-90))   # board front -Y -> faces -X (the chain side)
    dec.location = (-0.49, 3.05, 2.78)
    kit.apply_transform(dec)
    fr.append(dec)
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
    stem_top = STEM_TOP
    st.append(tube('stem', [S0 - ax * 0.05, stem_top], 0.1, seg=8, mat=M['chrome']))
    bar_c = BAR_C
    st.append(tube('stem_ext', [stem_top, bar_c], 0.09, seg=6, mat=M['chrome']))
    bars = []
    for sx in (1, -1):
        bars.append(tube('bar', [bar_c, bar_c + V(0.55 * sx, -0.08, 0.02), bar_c + V(1.0 * sx, -0.02, 0.0), bar_c + V(1.36 * sx, 0.42, -0.05),
                                 bar_c + V(1.53 * sx, 0.95, -0.12), bar_c + V(1.6 * sx, 1.45, -0.17), bar_c + V(1.63 * sx, 2.02, -0.2)], 0.075, seg=6, mat=M['chrome']))
        g0 = bar_c + V(1.58 * sx, 1.3, -0.16)
        g1 = bar_c + V(1.64 * sx, 2.06, -0.21)
        st.append(tube('grip', [g0, g0.lerp(g1, 0.5), g1], 0.135, seg=8, mat=M['grip']))
        # rod-brake lever under the bar, pulling the rods
        st.append(tube('brake_lever', [bar_c + V(1.2 * sx, 0.3, -0.06), bar_c + V(1.42 * sx, 0.95, -0.3), bar_c + V(1.5 * sx, 1.55, -0.36)], 0.04, seg=4, mat=M['chrome']))
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
    add('saddle', *sd)
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
    bone('saddle', SC, SC + SEAT_TUBE * 0.8, 'root')
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
    A.anchor('seat_driver', tuple(SEAT), arm, 'saddle')
    A.anchor('seat_pillion', (0, 4.8, cz + 0.12), arm, 'root')
    A.anchor('handlebar', tuple(bar_c), arm, 'steer')
    for sx, S in ((1, 'L'), (-1, 'R')):
        A.anchor('grip_' + S, tuple(bar_c + V(GRIP.x * sx, GRIP.y, GRIP.z)), arm, 'steer')
        A.anchor('pedal_' + S, tuple(pedals[S][0] + V(0, 0, 0.1)), arm, 'pedal_' + S)
    A.anchor('headlight', tuple(lamp_c + V(0, -0.28, 0)), arm, 'steer')
    A.anchor('wheel_front', tuple(Fa), arm, 'wheel_front')
    A.anchor('wheel_rear', tuple(Ra), arm, 'wheel_rear')
    A.anchor('bell', tuple(bar_c + V(0.45, -0.04, 0.2)), arm, 'steer')
    A.anchor('reflector', tuple(Ra + V(0, 3.35, 0.75)), arm, 'root')
    A.meta.update({'steerAxis': [round(c, 4) for c in ax], 'bb': [round(c, 4) for c in BB], 'seat': [round(c, 4) for c in SEAT], 'saddleTube': [round(c, 4) for c in SEAT_TUBE]})
    A.preview = {'shots': [{'view': {'az': -62, 'el': 14, 'fov': 28}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}]}


# =========================================================================== shared vehicle helpers
def opt_rule(**kw):
    """an option-bone rule for meta.options (runtime: show the bone's parts when the rule matches)"""
    return {k: v for k, v in kw.items() if v is not None}


def ride_geom(asset_id):
    """rider targets of a vehicle model (Blender coords) for clip authoring in characters.py:
    {seat, grip_L, grip_R, foot_L, foot_R, pose}. Pedal cycles: hero_geom()."""
    return dict(RIDE_GEOM.get(asset_id, {}))


RIDE_GEOM = {}


def anchors_from(A, arm, spec):
    """spec: {name: (loc, bone)}"""
    for n, (loc, bone) in spec.items():
        A.anchor(n, tuple(loc), arm, bone)


# =========================================================================== auto-rickshaw
AUTO_AX = V(0, -0.44, -0.9).normalized()       # steering column axis (down, forwards)
AUTO_COL = V(0, -6.05, 6.85)                   # column top (handlebar centre below the dash)


@kit.asset('auto_rickshaw', 'vehicle', vehicleTypes=['auto', 'yadagiri_auto'], length=22.0, width=13.0, wheelR=1.62,
           wheels={'wheel_front': 1.6, 'wheel_RL': 1.65, 'wheel_RR': 1.65}, steerBones={'steer': {'axis': list(AUTO_AX), 'k': 1.0}},
           tintSrc={'paint': 'color', 'paint2': 'color2'},
           options=[{'bone': 'opt_name', 'types': ['yadagiri_auto'], 'label': 'YADAGIRI'},
                    {'bone': 'opt_slogan0', 'seed': [4, 0], 'notTypes': ['yadagiri_auto']}, {'bone': 'opt_slogan1', 'seed': [4, 1], 'notTypes': ['yadagiri_auto']},
                    {'bone': 'opt_slogan2', 'seed': [4, 2], 'notTypes': ['yadagiri_auto']}, {'bone': 'opt_slogan3', 'seed': [4, 3], 'notTypes': ['yadagiri_auto']}],
           riders={'driver': {'pose': 'auto', 'seat': 'seat_driver', 'grips': ['grip_L', 'grip_R'], 'feet': ['foot_L', 'foot_R'], 'lean': 0.12},
                   'passengers': [{'seat': 'seat_passenger_L', 'feet': ['foot_passenger_L'], 'hands': 'knees'}, {'seat': 'seat_passenger_R', 'feet': ['foot_passenger_R'], 'hands': 'knees'},
                                  {'seat': 'seat_passenger_C', 'feet': ['foot_passenger_C'], 'hands': 'knees'}]},
           lamps={'head': ['headlight'], 'tail': ['taillight_L', 'taillight_R']}, open=True)
def auto_rickshaw(A):
    """The Bajaj-RE-style three-wheeler of 2003 Hyderabad: yellow body, black lower body and
    mudguards, a yellow canvas canopy on steel bows with a black centre strip, a single round
    headlamp on the nose, handlebar steering, the fare meter with its red flag on the driver's left,
    a red rexine passenger bench, painted slogans on the back (one of four per auto, or the owner's
    name), nimbu-mirchi charm on the nose. 22 x 13 u (TYPES.auto), canopy top ~12 u."""
    P = vk.palette()
    Y = vk.paint('auto_yellow', '#f2c230', region=1, rough=0.42, chips=0.3, under='#7a7a72', grime=0.45, dirt='#5a4a2a')
    K = vk.paint('auto_black', '#1c1a1c', region=2, rough=0.55, chips=0.12, grime=0.4)
    CAN = vk.mat('cloth', 'canopy_canvas', region=1, base='#f2c230', rough=0.95, var=0.08, grain=0.1, weave=0.14, grime=0.55, dirt='#6a5a32', scale=2.4, streaks=0.25)
    CANK = vk.mat('cloth', 'canopy_strip', region=2, base='#1c1a1c', rough=0.9, var=0.05, grain=0.08, weave=0.1, grime=0.4, dirt='#4a4436', scale=2.4)
    FLOOR = vk.mat('rubber', 'floor_mat', base='#2a2624', rough=0.95, grain=0.15, grime=0.6, dirt='#5a5040')
    R = vk.VRig(A)
    R.bone('steer', AUTO_COL, AUTO_COL + AUTO_AX * 1.5)
    R.bone('wheel_front', (0, -8.6, 1.6), parent='steer')
    R.bone('wheel_RL', (5.85, 6.4, 1.65))
    R.bone('wheel_RR', (-5.85, 6.4, 1.65))
    for n in ('opt_name', 'opt_slogan0', 'opt_slogan1', 'opt_slogan2', 'opt_slogan3'):
        R.bone(n, (0, 11.3, 6.0))
    # ---------------------------------------------------------------- wheels
    R.add('wheel_front', vk.disc_wheel('wf', (0, -8.6, 1.6), 1.6, 1.0, P, side=1, seg=16, rim_m=K, cap_frac=0.34, hub_bolts=4))
    R.add('wheel_RL', vk.disc_wheel('wrl', (5.85, 6.4, 1.65), 1.65, 1.1, P, side=1, seg=16, rim_m=K, cap_frac=0.34, hub_bolts=4))
    R.add('wheel_RR', vk.disc_wheel('wrr', (-5.85, 6.4, 1.65), 1.65, 1.1, P, side=-1, seg=16, rim_m=K, cap_frac=0.34, hub_bolts=4))
    body = []
    # ---------------------------------------------------------------- floor pan + rear lower body
    body.append(vk.plan_prism('floor_pan', [(5.0, -6.9), (5.1, 4.2), (4.85, 11.0), (-4.85, 11.0), (-5.1, 4.2), (-5.0, -6.9)], 1.35, 2.5, K, bevel=0.12))
    body.append(vk.plan_prism('floor_mat', [(4.7, -6.6), (4.8, 3.0), (-4.8, 3.0), (-4.7, -6.6)], 2.5, 2.56, FLOOR))
    # rear side panels with the wheel arches (yellow), wheel-well liners (black)
    arch = []
    cx, cz, ar = 6.4, 1.65, 2.05
    for i in range(13):
        a = math.radians(178 - 176 * i / 12)
        arch.append((cx + ar * math.cos(a), cz + ar * math.sin(a)))
    prof = [(0.5, 1.9), (cx - ar, 1.9)] + arch + [(cx + ar, 1.9), (11.05, 1.9), (11.05, 4.75), (0.5, 4.75)]
    for sx in (1, -1):
        x0, x1 = (6.1, 6.32) if sx > 0 else (-6.32, -6.1)
        body.append(vk.side_prism('side_panel', prof, x0, x1, Y))
        # yellow lip on top + black rubbing strip
        body.append(vk.rbox('side_lip', (0.42, 10.6, 0.22), (sx * 6.18, 5.78, 4.86), Y, bevel=0.08))
        body.append(vk.rbox('rub_strip', (0.12, 10.3, 0.26), (sx * 6.35, 5.9, 3.95), K, bevel=0.0))
        # inner wheel well (dark) so the arch never shows the void
        well = vk.side_prism('well', [(cx - ar - 0.1, 1.9), (cx - ar - 0.1, 3.85), (cx + ar + 0.1, 3.85), (cx + ar + 0.1, 1.9)], *((5.15, 5.25) if sx > 0 else (-5.25, -5.15)), P['dark'])
        body.append(well)
        body.append(vk.rbox('well_top', (1.05, 4.4, 0.1), (sx * 5.7, cx, 3.82), P['dark'], bevel=0.0))
    # rear body: engine compartment box across the back + engine lid
    body.append(vk.rbox('rear_body', (12.4, 2.3, 2.85), (0, 9.95, 3.32), Y, bevel=0.25, seg=3))
    body.append(vk.rbox('engine_lid', (6.2, 0.12, 1.5), (0, 11.12, 3.55), Y, bevel=0.0))
    body.append(vk.rbox('rear_bumper', (11.2, 0.5, 0.45), (0, 11.25, 2.05), K, bevel=0.12))
    # ---------------------------------------------------------------- nose cowl (yellow, rounded)
    nose = vk.section_loft('nose', [
        (-11.55, 1.0, 2.75, 3.85, 2.2), (-11.38, 1.9, 2.5, 4.55, 2.6), (-10.9, 2.75, 2.4, 5.0, 2.9), (-10.0, 3.6, 2.35, 5.45, 3.1),
        (-8.8, 4.35, 2.35, 5.85, 3.3), (-7.6, 4.9, 2.35, 6.12, 3.5), (-6.6, 5.25, 2.35, 6.3, 3.7), (-6.15, 5.35, 2.35, 6.32, 3.7)], Y, seg=22)
    body.append(nose)
    # dashboard lip and the cowl's inner back wall (the driver sees it)
    body.append(vk.rbox('dash', (9.6, 0.6, 0.35), (0, -6.05, 6.3), K, bevel=0.1))
    body.append(vk.rbox('cowl_back', (9.8, 0.14, 3.8), (0, -5.95, 4.35), K, bevel=0.0))
    # front bumper bar + guard (black tube) under the nose
    body.append(tube('front_bar', [V(2.2, -10.2, 2.45), V(1.6, -11.65, 2.55), V(-1.6, -11.65, 2.55), V(-2.2, -10.2, 2.45)], 0.12, seg=6, mat=K))
    # headlamp on the nose, horn grille, indicators, plate
    body += vk.lamp_round('headlamp', (0, -11.3, 4.3), 0.6, 0.45, P, facing=(0, -1, 0.25))
    body.append(vk.disc_y('horn', (0, -11.35, 3.25), 0.38, 0.12, P['dark'], seg=10))
    for sx in (1, -1):
        body.append(vk.rbox('indicator', (0.55, 0.3, 0.32), (sx * 1.75, -11.05, 3.85), P['amber'], bevel=0.0))
    body.append(vk.plate('plate_front', 'AP 09 V 2716', 2.4, 0.62, (0, -11.42, 2.95), '-Y', bg='#f2c230', fg='#141414'))
    # ---------------------------------------------------------------- windscreen frame, posts, canopy
    for sx in (1, -1):
        body.append(tube('ws_post', [V(sx * 4.95, -6.3, 6.2), V(sx * 4.85, -6.55, 9.0), V(sx * 4.75, -6.75, 10.45)], 0.15, seg=6, mat=K))
        body.append(tube('b_post', [V(sx * 6.12, 0.55, 4.75), V(sx * 6.2, 0.55, 9.75)], 0.13, seg=6, mat=K))
        body.append(tube('rear_post', [V(sx * 5.95, 10.85, 4.75), V(sx * 6.1, 10.85, 9.75)], 0.13, seg=6, mat=K))
        body.append(tube('grab_rail', [V(sx * 5.95, 1.2, 8.6), V(sx * 6.0, 9.8, 8.6)], 0.07, seg=5, mat=P['chrome']))
    body.append(tube('ws_top', [V(4.75, -6.75, 10.45), V(-4.75, -6.75, 10.45)], 0.15, seg=6, mat=K))
    body.append(tube('ws_bottom', [V(4.95, -6.32, 6.25), V(-4.95, -6.32, 6.25)], 0.13, seg=6, mat=K))
    body.append(tube('ws_mid', [V(0, -6.32, 6.25), V(0, -6.75, 10.45)], 0.08, seg=5, mat=K))
    # canopy: canvas on bows, sagging between them, a black strip along the crown
    stations = [(-7.75, 5.7, 10.35, 10.55, 0.7, 0.05), (-7.25, 6.3, 9.85, 10.7, 0.9, 0.18), (-5.0, 6.5, 9.55, 10.85, 0.95, 0.28),
                (-2.5, 6.52, 9.5, 10.72, 0.95, 0.16), (0.0, 6.55, 9.5, 10.88, 0.95, 0.3), (2.6, 6.55, 9.5, 10.74, 0.95, 0.16),
                (5.2, 6.55, 9.5, 10.88, 0.95, 0.3), (7.9, 6.52, 9.5, 10.74, 0.95, 0.16), (10.4, 6.45, 9.5, 10.82, 0.95, 0.26),
                (11.15, 6.25, 9.6, 10.45, 1.1, 0.12)]
    rows = [vk.arc_row(y, hw, zs, zsh, r, zc, n_side=1, n_corner=3, n_top=3) for (y, hw, zs, zsh, r, zc) in stations]
    body.append(vk.shell('canopy', rows, CAN, thick=0.1, inside=(0, 1.5, 5.0)))
    strip = []
    for (y, hw, zs, zsh, r, zc) in stations[1:-1]:
        row = []
        for x in (0.95, 0.0, -0.95):
            u = x / (hw - r)
            row.append((x, y, zsh + r + zc * (1 - u * u) + 0.035))
        strip.append(row)
    body.append(vk.shell('canopy_strip', strip, CANK, thick=0.04, inside=(0, 1.5, 5.0)))
    for sx in (1, -1):
        body.append(tube('canopy_pipe', [V(sx * (hw + 0.05), y, zs) for (y, hw, zs, zsh, r, zc) in stations[1:]], 0.07, seg=5, mat=K))
    # back: canvas panel down to the rear body with a small window; slogans painted on it
    body.append(vk.rbox('back_canvas', (12.1, 0.14, 4.95), (0, 11.18, 7.2), CAN, bevel=0.05))
    body.append(vk.rbox('back_window', (5.2, 0.06, 1.5), (0, 11.28, 8.55), P['glass'], bevel=0.0))
    body.append(vk.rbox('back_window_rim', (5.5, 0.04, 1.8), (0, 11.255, 8.55), K, bevel=0.0))
    # ---------------------------------------------------------------- seats
    body.append(vk.rbox('driver_pedestal', (3.0, 1.6, 1.55), (0, -2.0, 3.28), K, bevel=0.1))
    body.append(vk.seat_pad('driver_seat', -2.4, 2.4, -3.2, -0.85, 4.05, 4.72, P['seat_black'], crown=0.1))
    body.append(vk.seat_pad('driver_back', -2.5, 2.5, -0.85, -0.35, 4.75, 6.65, P['seat_black'], crown=0.0, bevel=0.12))
    body.append(vk.rbox('bench_base', (11.0, 6.2, 1.9), (0, 6.5, 3.45), K, bevel=0.12))
    body.append(vk.seat_pad('bench', -5.6, 5.6, 3.35, 9.45, 4.4, 5.35, P['seat_red'], crown=0.14))
    bb = vk.seat_pad('bench_back', -5.6, 5.6, 9.45, 10.35, 5.35, 9.05, P['seat_red'], crown=0.0, bevel=0.15)
    body.append(vk.rotate_about(bb, (0, 9.9, 5.35), (math.radians(-8), 0, 0)))
    # passenger entry steps (black)
    for sx in (1, -1):
        body.append(vk.rbox('step', (0.8, 2.0, 0.18), (sx * 5.55, 2.0, 2.05), K, bevel=0.0))
    # ---------------------------------------------------------------- fare meter (driver's left, outside the windscreen post) + mirror
    body.append(vk.rbox('meter', (0.85, 0.75, 1.45), (5.55, -6.05, 7.75), P['plastic'], bevel=0.12))
    body.append(vk.rbox('meter_face', (0.55, 0.06, 0.38), (5.55, -6.45, 8.05), vk.mat('lamp_lens', 'meter_lamp', base='#e8d090', emit='#ffb050'), bevel=0.0))
    body.append(tube('meter_arm', [V(5.55, -6.05, 7.0), V(4.95, -6.25, 7.2)], 0.07, seg=5, mat=K))
    flag = vk.rbox('meter_flag', (0.08, 1.1, 0.75), (5.55, -6.0, 8.95), vk.paint('flag_red', '#c42a24', region=0, chips=0.1), bevel=0.0)
    body.append(flag)
    body.append(tube('flag_rod', [V(5.55, -6.05, 8.45), V(5.55, -6.05, 9.4)], 0.04, seg=4, mat=P['chrome']))
    body += vk.mirror('mirror', (-4.9, -6.6, 8.9), (-5.7, -7.1, 9.35), 0.38, P, facing=(-0.2, -1, 0.1))
    # ---------------------------------------------------------------- rear: tail lamps, plate, exhaust, reflectors
    for sx, S in ((1, 'L'), (-1, 'R')):
        body.append(vk.rbox('tail_lamp', (1.0, 0.25, 0.6), (sx * 4.95, 11.12, 3.95), P['tail_lens'], bevel=0.0))
        body.append(vk.rbox('rear_ind', (0.45, 0.22, 0.35), (sx * 5.75, 11.08, 3.95), P['amber'], bevel=0.0))
    body.append(vk.plate('plate_rear', 'AP 09 V 2716', 2.6, 0.7, (0, 11.2, 2.75), '+Y', bg='#f2c230', fg='#141414'))
    body.append(tube('exhaust', [V(-3.0, 8.5, 1.55), V(-3.3, 10.6, 1.45), V(-3.4, 11.55, 1.5)], 0.17, seg=8, mat=P['steel']))
    # nimbu-mirchi: a lemon and green chillies on a thread under the nose (against the evil eye)
    charm = [tube('charm_thread', [V(0, -11.6, 2.5), V(0, -11.62, 1.55)], 0.015, seg=3, mat=P['black'])]
    lem = kit.lathe('charm_lemon', [(0.0, -0.22), (0.13, -0.15), (0.17, 0.0), (0.13, 0.15), (0.0, 0.22)], seg=8, mat=vk.mat('walkman', 'lemon', base='#d8c020', grime=0.2))
    charm.append(vk.xform(lem, loc=(0, -11.62, 1.4)))
    for i, (dx, dz) in enumerate(((0.12, 1.05), (-0.12, 1.08), (0.0, 0.98))):
        ch = kit.cylinder('chilli', 0.055, 0.5, (0, 0, 0), seg=5, mat=vk.mat('cloth', 'chilli', base='#2e7a2a', rough=0.5, weave=0.0, grime=0.2), r2=0.012, base=True)
        charm.append(vk.xform(ch, loc=(dx, -11.62, dz + 0.0), rot=(math.pi, 0.25 * (i - 1), 0)))
    body += charm
    R.add('root', body)
    # ---------------------------------------------------------------- slogans / owner's name on the back canvas (option bones)
    texts = [("MOTHER'S GIFT", 'opt_slogan0'), ('HUM DO HAMARE DO', 'opt_slogan1'), ('SOUND HORN', 'opt_slogan2'), ('JAI BOLO', 'opt_slogan3'), ('YADAGIRI', 'opt_name')]
    for t, bone in texts:
        R.add(bone, vk.decal('sign_' + bone, t, 7.4, 1.25, (0, 11.27, 6.35), '+Y', fg='#16141a', bg='#f2c230', px=512))
    # ---------------------------------------------------------------- steering: column, handlebar, fork, front mudguard
    st = []
    st.append(tube('column', [AUTO_COL, AUTO_COL + AUTO_AX * 3.7], 0.16, seg=8, mat=K))
    st.append(vk.rbox('bar_housing', (1.3, 0.6, 0.45), tuple(AUTO_COL + V(0, 0.18, 0.12)), K, bevel=0.12))
    st.append(vk.rbox('speedo', (0.55, 0.08, 0.32), tuple(AUTO_COL + V(0, -0.1, 0.42)), vk.mat('lamp_lens', 'speedo_glass', base='#b8b4a0', rough=0.1), bevel=0.0))
    bc = AUTO_COL + V(0, 0.15, 0.1)
    grips = {}
    for sx, S in ((1, 'L'), (-1, 'R')):
        pts = [bc, bc + V(sx * 0.9, 0.05, 0.02), bc + V(sx * 1.7, 0.35, 0.0), bc + V(sx * 2.35, 0.85, -0.06)]
        st.append(tube('bar', pts, 0.09, seg=6, mat=P['chrome']))
        g0, g1 = bc + V(sx * 2.15, 0.7, -0.05), bc + V(sx * 2.75, 1.15, -0.1)
        st.append(tube('grip', [g0, g1], 0.17, seg=8, mat=P['plastic']))
        grips[S] = g0.lerp(g1, 0.55)
        st.append(tube('lever', [bc + V(sx * 1.85, 0.25, 0.05), bc + V(sx * 2.45, 0.35, 0.02)], 0.04, seg=4, mat=P['chrome']))
    fork_top = AUTO_COL + AUTO_AX * 3.7
    st.append(tube('fork_arm', [fork_top + V(0.45, 0, 0), V(0.62, -8.15, 2.15), V(0.62, -8.6, 1.6)], 0.15, seg=6, mat=K))
    st.append(vk.cyl_between('shock', fork_top + V(0.62, 0.1, -0.2), V(0.62, -8.2, 2.0), 0.13, seg=8, m=P['chrome']))
    st.append(vk.mudguard('guard_front', (0, -8.6, 1.6), 1.6, math.radians(-15), math.radians(150), K, w=1.25, gap=0.22, thick=0.08, n=12))
    R.add('steer', st)
    # ---------------------------------------------------------------- rig, bake
    arm, ob = R.build(tex=512, orm=256, emit=256, ao_samples=24, albedo_samples=6, ao_strength=0.75, ao_dist=2.6,
                      boost={'sign_': 2.8, 'head_lens': 1.6, 'tail_lens': 1.4, 'meter_lamp': 1.5})
    # ---------------------------------------------------------------- anchors
    vk_anchor = {
        'seat_driver': ((0, -2.05, 4.78), 'root'), 'handlebar': (tuple(bc), 'steer'),
        'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'foot_L': ((0.95, -5.0, 2.58), 'root'), 'foot_R': ((-0.95, -5.0, 2.58), 'root'),
        'seat_passenger_L': ((2.7, 6.6, 5.4), 'root'), 'seat_passenger_R': ((-2.7, 6.6, 5.4), 'root'), 'seat_passenger_C': ((0.0, 6.6, 5.4), 'root'),
        'foot_passenger_L': ((2.6, 1.8, 2.58), 'root'), 'foot_passenger_R': ((-2.6, 1.8, 2.58), 'root'), 'foot_passenger_C': ((0.0, 1.8, 2.58), 'root'),
        'headlight': ((0, -11.75, 4.4), 'root'), 'taillight_L': ((4.95, 11.3, 3.95), 'root'), 'taillight_R': ((-4.95, 11.3, 3.95), 'root'),
        'indicator_L': ((1.75, -11.2, 3.85), 'root'), 'indicator_R': ((-1.75, -11.2, 3.85), 'root'),
        'exhaust': ((-3.4, 11.6, 1.5), 'root'), 'meter': ((5.55, -6.5, 8.05), 'root'),
        'wheel_front': ((0, -8.6, 1.6), 'wheel_front'), 'wheel_RL': ((5.85, 6.4, 1.65), 'wheel_RL'), 'wheel_RR': ((-5.85, 6.4, 1.65), 'wheel_RR'),
    }
    anchors_from(A, arm, vk_anchor)
    RIDE_GEOM['auto_rickshaw'] = {'pose': 'auto', 'seat': (0, -2.05, 4.78), 'grip_L': tuple(grips['L']), 'grip_R': tuple(grips['R']), 'foot_L': (0.95, -5.0, 2.58), 'foot_R': (-0.95, -5.0, 2.58)}
    A.meta.update({'steerAxis': [round(c, 4) for c in AUTO_AX], 'height': 12.0})
    A.preview = {'shots': [{'view': {'az': -38, 'el': 16, 'fov': 30}}, {'name': 'rear', 'size': 320, 'samples': 16, 'view': {'az': 152, 'el': 14, 'fov': 30}}],
                 'variants': {'sets': [{'paint': '#f2c230', 'paint2': '#1c1a1c'}, {'paint': '#f2c230', 'paint2': '#2a4a2a'}], 'view': {'az': -120, 'el': 22, 'fov': 30}}}
