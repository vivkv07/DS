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
from kit import material
from _vehicles_kit import tube, lathe, loft
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


# =========================================================================== pedal cycles (generic builder)
def cycle_geom(R=3.0, wb=10.0, cs=4.25, bb_drop=0.65, st_len=2.616, st_dir=None, ax=None, head=(1.45, 2.5), seat_off=(0, -0.1, 0.52),
               stem=0.72, bar_c=(0, -0.15, 0.05)):
    """key points of a pedal cycle (Blender coords, front -Y). With the defaults this is exactly the
    Hero roadster above (HERO / hero_geom: the riders' ride_cycle clips are authored against it)."""
    st_dir = Vector(st_dir) if st_dir is not None else SEAT_TUBE
    ax = Vector(ax).normalized() if ax is not None else AX
    k = R / 3.0
    G = {}
    G['R'] = R
    G['RA'] = V(0, wb / 2, R)
    G['FA'] = V(0, -wb / 2, R)
    G['BB'] = V(0, wb / 2 - cs, R - bb_drop * k)
    G['SC'] = G['BB'] + st_dir * st_len
    G['ST'] = st_dir
    G['AX'] = ax
    G['S0'] = G['FA'] + V(0, head[0] * k, head[1] * k)
    G['HB'] = G['S0'] + ax * 1.0 * k
    G['SEAT'] = G['SC'] + V(*seat_off)
    G['STEM_TOP'] = G['S0'] - ax * stem
    G['BAR_C'] = G['STEM_TOP'] + V(*bar_c)
    return G


def cycle_bars(kind, bc, k=1.0):
    """handlebar polyline (left half, +X) + grip segment, relative to the bar centre bc"""
    if kind == 'swept':      # roadster: swept right back to the rider
        pts = [bc, bc + V(0.55, -0.08, 0.02), bc + V(1.0, -0.02, 0.0), bc + V(1.36, 0.42, -0.05), bc + V(1.53, 0.95, -0.12), bc + V(1.6, 1.45, -0.17), bc + V(1.63, 2.02, -0.2)]
        g0, g1 = bc + V(1.58, 1.3, -0.16), bc + V(1.64, 2.06, -0.21)
    elif kind == 'flat':     # MTB: straight, wide, slight back-sweep
        pts = [bc, bc + V(0.6, 0.02, 0.0), bc + V(1.3, 0.08, 0.0), bc + V(2.05, 0.2, 0.0)]
        g0, g1 = bc + V(1.45, 0.11, 0.0), bc + V(2.1, 0.21, 0.0)
    elif kind == 'riser':    # kid: a riser bar
        pts = [bc, bc + V(0.35, 0.0, 0.0), bc + V(0.6, 0.05, 0.3), bc + V(0.95, 0.2, 0.42), bc + V(1.6, 0.42, 0.45)]
        g0, g1 = bc + V(1.08, 0.24, 0.43), bc + V(1.62, 0.43, 0.45)
    else:                    # 'ladies': upright, swept, a touch higher
        pts = [bc, bc + V(0.5, -0.05, 0.05), bc + V(0.95, 0.05, 0.12), bc + V(1.3, 0.5, 0.12), bc + V(1.45, 1.05, 0.06), bc + V(1.5, 1.6, 0.02)]
        g0, g1 = bc + V(1.46, 1.0, 0.06), bc + V(1.51, 1.7, 0.02)
    sc = lambda p: bc + (p - bc) * k
    return [sc(p) for p in pts], sc(g0), sc(g1)


def pedal_cycle(A, C):
    """Generic pedal cycle from a spec C (see the CYCLES table): frame style, bars, guards, carrier,
    chain guard / case, basket, stand, saddle, brakes, gears (option bone), lettering. Bones: root
    steer wheel_front wheel_rear crank pedal_L pedal_R saddle (+ opt_*). Tint: paint = frame (v.color),
    paint2 = accent (v.color2: fork / rims / guards on the sporty ones)."""
    G = cycle_geom(**C['geom'])
    R, RA, FA, BB, SC, S0, HB, AXc, SEATp = G['R'], G['RA'], G['FA'], G['BB'], G['SC'], G['S0'], G['HB'], G['AX'], G['SEAT']
    k = R / 3.0
    P = vk.palette()
    FR = vk.paint(A.id + '_frame', C.get('color', '#24479a'), region=vk.R_PAINT, rough=0.3, chips=0.3, under='#8a8d90', grime=0.35, dirt='#3a342c')
    AC = vk.paint(A.id + '_accent', C.get('color2', '#f4f2ea'), region=vk.R_PAINT2, rough=0.35, chips=0.2, grime=0.3) if C.get('accent') else FR
    BLK = P['black']
    M = {'tyre': P['tyre'], 'chrome': P['chrome'], 'steel': P['steel'], 'rubber': P['rubber'], 'dark': P['dark']}
    Rg = vk.VRig(A)
    crown = S0 + AXc * 1.18 * k
    Rg.bone('steer', HB, HB - AXc * 1.6)
    Rg.bone('wheel_front', FA, parent='steer')
    Rg.bone('wheel_rear', RA)
    Rg.bone('crank', BB)
    Rg.bone('saddle', SC, SC + G['ST'] * 0.8)
    for o in C.get('options', []):
        Rg.bone(o, BB + V(0, 0, 1.0))
    cr = C.get('crank', CRANK_R) * (1 if k > 0.9 else 0.85)
    px = C.get('pedal_x', PEDAL_X) * (1 if k > 0.9 else 0.88)
    ped = {'L': BB + V(px, cr, 0), 'R': BB + V(-px, -cr, 0)}
    Rg.bone('pedal_L', ped['L'], parent='crank')
    Rg.bone('pedal_R', ped['R'], parent='crank')
    tw = C.get('tyre_w', 0.42)
    rim_m = AC if C.get('accent_rims') else P['chrome']
    for nm, c in (('wheel_rear', RA), ('wheel_front', FA)):
        Rg.add(nm, vk.spoke_wheel(nm[6:], tuple(c), R, M, spokes=C.get('spokes', 32), seg=C.get('wseg', 20), tyre_w=tw, rim_d=0.36 * k + 0.04,
                                  rim_m=rim_m, knobs=C.get('knobs', 0.0), hub_w=0.6 * max(k, 0.85)))
    fr = []
    tr = C.get('tube_r', 0.15) * (k ** 0.5)
    ttF = S0 + AXc * 0.16 * k
    dtF = HB - AXc * 0.08 * k
    style = C.get('frame', 'diamond')
    fr.append(tube('seat_tube', [BB, SC + G['ST'] * 0.2], tr, seg=8, mat=FR))
    fr.append(tube('head_tube', [S0 + V(0, 0, 0.06) - AXc * 0.05, HB + AXc * 0.06], tr * 1.3, seg=8, mat=FR))
    if style in ('diamond', 'kid'):
        if style == 'kid':
            mid = SC.lerp(ttF, 0.5) + V(0, 0, 0.18 * k)
            fr.append(tube('top_tube', [SC + V(0, 0, 0.02), mid, ttF], tr, seg=8, mat=FR))
        else:
            fr.append(tube('top_tube', [SC + V(0, 0, 0.02), ttF], tr, seg=8, mat=FR))
        fr.append(tube('down_tube', [BB, dtF], tr * 1.12, seg=8, mat=FR))
    elif style == 'mtb':
        tt0 = BB.lerp(SC, 0.78)
        fr.append(tube('top_tube', [tt0, ttF], tr * 1.05, seg=8, mat=FR))
        fr.append(tube('down_tube', [BB, dtF], tr * 1.35, seg=8, mat=FR))
    elif style == 'ladies':
        # twin step-through loops from the head tube sweeping down to the bottom bracket
        a = dtF
        fr.append(tube('loop_upper', [S0 - AXc * 0.25 * k, S0 + V(0, 1.2 * k, -0.9 * k), BB + V(0, -0.9 * k, 0.75 * k), BB + V(0, -0.15, 0.22)], tr, seg=8, mat=FR))
        fr.append(tube('loop_lower', [a, a + V(0, 1.0 * k, -0.95 * k), BB + V(0, -0.55 * k, 0.15), BB], tr, seg=8, mat=FR))
    for sx in (1, -1):
        fr.append(tube('chain_stay', [BB + V(0.1 * sx, 0, 0), RA + V(0.3 * sx, -0.25, 0.0)], 0.085 * max(k, 0.8), seg=6, mat=FR))
        stay_top = SC + V(0.09 * sx, 0.06, -0.05) if style != 'mtb' else BB.lerp(SC, 0.8) + V(0.1 * sx, 0.05, 0)
        fr.append(tube('seat_stay', [stay_top, RA + V(0.3 * sx, -0.15, 0.12)], 0.075 * max(k, 0.8), seg=6, mat=FR))
        fr.append(vk.rbox('dropout', (0.06, 0.5 * k, 0.36 * k), tuple(RA + V(0.33 * sx, 0, 0)), FR, bevel=0.0))
        if C.get('double_stays'):     # the roadster's second pair of seat stays
            fr.append(tube('seat_stay2', [SC + V(0.12 * sx, 0.1, -0.25), RA + V(0.33 * sx, -0.1, 0.2)], 0.06, seg=6, mat=FR))
    if C.get('pinstripe'):
        gold = vk.mat('gold_leaf', 'pinstripe', base='#c8a040')
        for t0, t1 in ((SC, ttF), (BB, dtF)):
            for f in (0.12, 0.88):
                pnt = t0.lerp(t1, f)
                dd = (t1 - t0).normalized()
                fr.append(vk.cyl_between('pin', pnt - dd * 0.018, pnt + dd * 0.018, tr * 1.1, seg=8, m=gold, cap=False))
    for p, d in ((SC, G['ST']), (BB, V(0, 0, 1))):
        fr.append(vk.cyl_between('lug', p - d * 0.11, p + d * 0.11, tr * 1.25, seg=8, m=FR))
    fr.append(vk.disc_x('bb_shell', tuple(BB), 0.22 * max(k, 0.85), 0.6, FR, seg=8))
    # ---------------------------------------------------------------- saddle (own bone)
    sd = []
    SEATv = SEATp
    clamp = SEATv + V(0, 0.12, -0.3)
    sd.append(tube('seat_post', [SC - G['ST'] * 0.3, clamp], 0.09, seg=6, mat=P['chrome']))
    sk = C.get('saddle', 'sprung')
    saddle_m = P['leather'] if sk == 'sprung' else vk.mat('leather_brown', 'saddle_vinyl', base='#1c1a1a', rough=0.68, grime=0.35)
    sw = 1.0 if sk != 'kid' else 0.8
    sd.append(loft('saddle', [
        dict(c=tuple(SEATv + V(0, -0.72 * sw, -0.08)), r=(0.16 * sw, 0.07), p=2.5),
        dict(c=tuple(SEATv + V(0, -0.42 * sw, -0.04)), r=(0.24 * sw, 0.1), p=2.5),
        dict(c=tuple(SEATv + V(0, -0.05, -0.01)), r=(0.42 * sw, 0.12), p=3.0),
        dict(c=tuple(SEATv + V(0, 0.32 * sw, 0.0)), r=(0.55 * sw, 0.14), p=3.5),
        dict(c=tuple(SEATv + V(0, 0.52 * sw, -0.02)), r=(0.54 * sw, 0.11), p=3.5),
        dict(c=tuple(SEATv + V(0, 0.6 * sw, -0.09)), r=(0.4 * sw, 0.06), p=3.0),
    ], seg=10, side=(1, 0, 0), mat=saddle_m))
    sd.append(vk.rbox('saddle_clamp', (0.28, 0.28, 0.14), tuple(clamp), P['chrome'], bevel=0.0))
    if sk == 'sprung':
        for sx in (1, -1):
            base = SEATv + V(0.36 * sx, 0.42, -0.5)
            pts = [base + V(0.1 * math.cos(t), 0.1 * math.sin(t), t * 0.022) for t in [i * 1.05 for i in range(15)]]
            sd.append(tube('spring', pts, 0.024, seg=3, mat=P['chrome'], cap=False))
            sd.append(tube('spring_rod', [SEATv + V(0.36 * sx, 0.42, -0.56), clamp + V(0.1 * sx, 0.05, -0.05)], 0.035, seg=4, mat=P['chrome']))
    # ---------------------------------------------------------------- carrier
    cz = 2 * R + 0.38 * k
    if C.get('carrier'):
        for sx in (1, -1):
            fr.append(tube('carrier_rail', [V(0.58 * sx, RA.y - 2.45 * k, cz), V(0.58 * sx, RA.y + 2.5 * k, cz), V(0.42 * sx, RA.y + 2.7 * k, cz - 0.05)], 0.055, seg=5, mat=FR))
            fr.append(tube('carrier_strut', [V(0.58 * sx, RA.y + 2.3 * k, cz), RA + V(0.4 * sx, 0.02, 0.1)], 0.05, seg=5, mat=FR))
            fr.append(tube('carrier_stay', [V(0.58 * sx, RA.y - 2.45 * k, cz), SC + V(0.12 * sx, 0.15, -0.2)], 0.045, seg=4, mat=FR))
        for kk in range(5):
            y = RA.y - 2.25 * k + kk * 1.15 * k
            fr.append(tube('slat', [V(-0.6, y, cz + 0.02), V(0.6, y, cz + 0.02)], 0.04, seg=4, mat=FR))
    # ---------------------------------------------------------------- mudguards (rear on the frame, front on the steer)
    gk = C.get('guards', 'full')
    gm = AC if C.get('accent_guards') else FR
    st = []
    if gk == 'full':
        fr.append(vk.mudguard('guard_rear', tuple(RA), R, math.radians(38), math.radians(198), gm, w=0.58 * max(k, 0.85) + tw * 0.25, gap=0.24, thick=0.08, n=12))
        st.append(vk.mudguard('guard_front', tuple(FA), R, math.radians(-20), math.radians(118), gm, w=0.58 * max(k, 0.85) + tw * 0.25, gap=0.24, thick=0.08, n=10))
    elif gk == 'short':
        fr.append(vk.mudguard('guard_rear', tuple(RA), R, math.radians(85), math.radians(140), gm, w=0.5 + tw * 0.3, gap=0.22, thick=0.07, n=5))
        st.append(vk.mudguard('guard_front', tuple(FA), R, math.radians(35), math.radians(95), gm, w=0.5 + tw * 0.3, gap=0.22, thick=0.07, n=5))
    fr.append(vk.disc_y('reflector', tuple(RA + V(0, R * 0.95 + 0.4, R * 0.25 + 0.35)), 0.16, 0.05, P['reflector'], seg=10))
    # ---------------------------------------------------------------- chain guard / case, chain, chainring, sprocket
    cg = C.get('chainguard', 'plate')
    ring_r = 0.95 * max(k, 0.8)
    if cg in ('plate', 'case'):
        top = 3.35 if cg == 'plate' else 3.6
        poly = [(-0.6, 2.05), (-0.2, 1.65), (0.9, 1.75), (5.25, 2.6), (5.45, 3.0), (5.2, top), (0.9, top - 0.1), (-0.25, top - 0.2), (-0.62, 2.7)]
        poly = [((y + 0.75) * (RA.y - BB.y) / 4.25 + BB.y - 0.75 * (RA.y - BB.y) / 4.25 - (BB.y - 0.75), (z - 2.35) * k + BB.z) for (y, z) in poly]
        cgo = vk.side_prism('chain_guard', poly, -0.5, -0.44 if cg == 'plate' else -0.2, BLK if C.get('guard_black') else FR, bevel=0.03, seg=1)
        fr.append(cgo)
    if C.get('lettering'):
        txt, (fg, bg), where = C['lettering']
        if where == 'chainguard':
            d = kit.signboard('chain_guard_name', txt, 1.9 * k, 0.42 * k, depth=0.02, fg=fg, bg=bg, frame_mat=BLK, px=256)
            d.rotation_euler = (0, 0, math.radians(-90))
            mid = BB.lerp(RA, 0.5)
            d.location = (-0.52, mid.y, BB.z + 0.43 * k)
            kit.apply_transform(d)
            fr.append(d)
        else:   # a sticker band on the down tube (both sides)
            dt = (dtF - BB)
            ctr = BB.lerp(dtF, 0.55)
            ang = math.atan2(dt.z, -dt.y)
            for sx in (1, -1):
                d = kit.signboard('down_tube_name', txt, 2.2 * k, 0.3, depth=0.02, fg=fg, bg=bg, frame_mat=BLK, px=256)
                d.rotation_euler = (0, -ang if sx > 0 else ang, math.radians(90 if sx > 0 else -90))
                d.location = ctr + V(sx * (tr * 1.15 + 0.01), 0, 0)
                kit.apply_transform(d)
                fr.append(d)
    ring = vk.disc_x('chainring', tuple(BB + V(-0.36, 0, 0)), ring_r, 0.06, P['chrome'], seg=20)
    fr.append(vk.disc_x('sprocket', tuple(RA + V(-0.36, 0, 0)), 0.34, 0.06, P['steel'], seg=10))
    fr.append(tube('chain_low', [BB + V(-0.36, 0.0, -ring_r), RA + V(-0.36, 0, -0.34)], 0.045, seg=4, mat=P['steel']))
    fr.append(tube('chain_high', [BB + V(-0.36, 0.0, ring_r), RA + V(-0.36, 0, 0.34)], 0.045, seg=4, mat=P['steel']))
    # stand
    if C.get('stand') == 'double':
        for sx in (1, -1):
            fr.append(tube('stand', [RA + V(0.42 * sx, 0.05, -0.1), RA + V(0.55 * sx, R * 0.75, 0.1 - R * 0.05)], 0.05, seg=4, mat=BLK))
        fr.append(tube('stand_foot', [RA + V(0.55, R * 0.75, 0.1 - R * 0.05), RA + V(-0.55, R * 0.75, 0.1 - R * 0.05)], 0.05, seg=4, mat=BLK))
    else:
        fr.append(tube('kickstand', [BB.lerp(RA, 0.62) + V(0.2, 0, 0.0), BB.lerp(RA, 0.62) + V(0.55, 1.7 * k, -0.85 * k)], 0.05, seg=4, mat=BLK))
    # ---------------------------------------------------------------- crank + pedals
    crank = [ring, vk.disc_x('crank_axle', tuple(BB), 0.09, 1.1, P['steel'], seg=6)]
    pedals = {}
    for sx, S, dy in ((1, 'L', cr), (-1, 'R', -cr)):
        crank.append(tube('crank_arm', [BB + V(0.45 * sx, 0, 0), BB + V(0.55 * sx, dy, 0)], 0.085, seg=6, mat=P['chrome']))
        pc = ped[S]
        pd = [vk.rbox('pedal_block', (0.52, 0.4, 0.18), tuple(pc), P['rubber'], bevel=0.0),
              vk.rbox('pedal_frame', (0.6, 0.46, 0.07), tuple(pc), P['chrome'], bevel=0.0),
              vk.rbox('pedal_refl', (0.46, 0.05, 0.1), tuple(pc + V(0, 0.21, 0)), P['reflector'], bevel=0.0)]
        pedals[S] = pd
    # ---------------------------------------------------------------- steering: fork, stem, bars, grips, brakes, bell, basket, lamp
    fm = AC if C.get('accent_fork') else FR
    for sx in (1, -1):
        mid = crown.lerp(FA, 0.55) + V(0, -0.22 * k, 0)
        st.append(tube('fork_blade', [crown + V(0.24 * sx, 0, 0), mid + V(0.3 * sx, 0, 0), FA + V(0.32 * sx, 0, 0.08)], 0.08 * max(k, 0.85) * (1.25 if style == 'mtb' else 1), seg=6, mat=fm))
    st.append(vk.cyl_between('fork_crown', crown - AXc * 0.12 + V(0, 0, 0), crown + AXc * 0.12, 0.3, seg=8, m=fm))
    st.append(tube('stem', [S0 - AXc * 0.05, G['STEM_TOP']], 0.09, seg=6, mat=P['chrome']))
    bc = G['BAR_C']
    st.append(tube('stem_ext', [G['STEM_TOP'], bc], 0.085, seg=6, mat=P['chrome']))
    bars = C.get('bars', 'swept')
    grips = {}
    for sx, S in ((1, 'L'), (-1, 'R')):
        pts, g0, g1 = cycle_bars(bars, bc, C.get('bar_k', 1.0))
        mir = lambda p: V(bc.x + (p.x - bc.x) * sx, p.y, p.z)
        st.append(tube('bar', [mir(p) for p in pts], 0.07, seg=6, mat=P['chrome'] if bars != 'flat' else P['black']))
        gm2 = vk.mat('rubber', 'grip_' + A.id, base=C.get('grip', '#e6dcc4'), rough=0.7)
        st.append(tube('grip', [mir(g0), mir(g0.lerp(g1, 0.5)), mir(g1)], 0.13, seg=6, mat=gm2))
        grips[S] = mir(g0.lerp(g1, 0.55))
        if C.get('brakes', 'rod') == 'rod':
            st.append(tube('brake_lever', [mir(bc + V(1.2, 0.3, -0.06)), mir(bc + V(1.42, 0.95, -0.3)), mir(bc + V(1.5, 1.55, -0.36))], 0.04, seg=4, mat=P['chrome']))
        else:
            gl = mir(g0) + V(0, -0.25, -0.05)
            st.append(tube('brake_lever', [mir(g0 + V(-0.15, -0.1, 0.02)), gl + V(0.35 * sx, -0.05, -0.05), gl + V(0.75 * sx, 0.05, -0.08)], 0.04, seg=4, mat=P['steel']))
            st.append(tube('cable', [mir(g0 + V(-0.2, -0.05, 0.0)), mir(bc + V(0.6, -0.6, 0.4)), S0 + V(0.2 * sx, -0.4, 0.2)], 0.03, seg=3, mat=P['black']))
    if C.get('brakes', 'rod') == 'rod':
        st.append(tube('front_rod', [bc + V(0.25, -0.2, -0.06), S0 + V(0.25, -0.12, 0), crown + V(0.25, -0.15, -0.1), FA + V(0.25, -0.35, R - 0.3)], 0.03, seg=4, mat=P['chrome']))
        st.append(tube('front_stirrup', [FA + V(-0.3, -0.5, R - 0.45), FA + V(-0.3, -0.25, R - 0.2), FA + V(0.3, -0.25, R - 0.2), FA + V(0.3, -0.5, R - 0.45)], 0.035, seg=4, mat=P['chrome']))
        fr.append(tube('rear_rod', [ttF + V(-0.22, 0.05, -0.18), SC + V(-0.2, 0.0, -0.18), RA + V(-0.32, -0.45, R - 0.35)], 0.03, seg=4, mat=P['chrome']))
    else:
        st.append(vk.rbox('caliper_f', (0.85, 0.2, 0.3), tuple(crown + AXc * 0.3 + V(0, -0.1, 0)), P['steel'], bevel=0.0))
        fr.append(vk.rbox('caliper_r', (0.85, 0.2, 0.3), tuple(SC.lerp(RA, 0.62) + V(0, 0.0, 0.25)), P['steel'], bevel=0.0))
    bell = kit.lathe('bell', [(0.0, 0.0), (0.22, 0.0), (0.23, 0.05), (0.18, 0.16), (0.09, 0.22), (0.0, 0.25)], seg=10, mat=P['chrome'])
    st.append(vk.xform(bell, loc=bc + V(0.45, -0.04, 0.08)))
    lamp_c = None
    if C.get('lamp'):
        lamp_c = S0 + AXc * 0.55 + V(0, -0.52, 0.02)
        st += vk.lamp_round('lamp', tuple(lamp_c), 0.3, 0.32, P, facing=(0, -1, 0), seg=12)
        st.append(tube('lamp_bracket', [lamp_c + V(0, 0.2, 0), S0 + AXc * 0.55 + V(0, -0.12, 0)], 0.05, seg=4, mat=P['chrome']))
    if C.get('dynamo'):
        dyn = FA + V(0.42, 0.55 * R * 0.5, R * 0.62)
        st.append(vk.cyl_between('dynamo', dyn + V(0, 0, -0.35), dyn + V(0, 0, 0.35), 0.13, seg=8, m=P['chrome']))
        st.append(tube('dynamo_wire', [dyn + V(0, 0, 0.35), crown + V(0.3, -0.1, 0.0), lamp_c + V(0.2, 0.1, 0) if lamp_c is not None else crown], 0.02, seg=3, mat=P['black']))
    if C.get('basket'):
        bk = vk.mat('wood_raw', 'wicker', base='#b08a52', rough=0.85, grain=0.3, var=0.12, grime=0.4, scale=6.0)
        b0 = bc + V(0, -1.0, -0.55)
        bas = kit.cylinder('basket', 0.95, 1.05, (0, 0, 0), seg=10, mat=bk, r2=1.15, cap=False, base=True)
        bas.scale = (1.15, 0.85, 1.0)
        bas = vk.xform(bas, loc=b0 + V(0, 0, -0.55))
        bm2 = __import__('bmesh').new()
        bm2.from_mesh(bas.data)
        __import__('bmesh').ops.solidify(bm2, geom=bm2.faces[:], thickness=0.05)
        bm2.to_mesh(bas.data)
        bm2.free()
        st.append(bas)
        bot = kit.cylinder('basket_floor', 0.95, 0.05, (0, 0, 0), seg=10, mat=bk, base=True)
        bot.scale = (1.15, 0.85, 1.0)
        st.append(vk.xform(bot, loc=b0 + V(0, 0, -0.55)))
        st.append(tube('basket_rim', [b0 + V(1.15 * 1.15 * math.cos(t), 1.15 * 0.85 * math.sin(t), 0.5) for t in [i * 2 * math.pi / 12 for i in range(13)]], 0.05, seg=4, mat=P['chrome'], cap=False))
        st.append(tube('basket_stay', [b0 + V(0, 0.9, -0.5), FA + V(0, -0.2, 0.35)], 0.04, seg=4, mat=P['chrome']))
    # ---------------------------------------------------------------- gears (option bone): derailleur, triple ring, shifters
    opt_parts = {}
    if 'opt_gears' in C.get('options', []):
        g = []
        g.append(vk.disc_x('ring2', tuple(BB + V(-0.44, 0, 0)), ring_r * 0.78, 0.05, P['steel'], seg=16))
        g.append(vk.disc_x('cassette', tuple(RA + V(-0.3, 0, 0)), 0.48, 0.3, P['steel'], seg=10))
        der = RA + V(-0.48, 0.15, -0.7)
        g.append(vk.rbox('derailleur', (0.14, 0.5, 0.8), tuple(der), P['steel'], bevel=0.04))
        g.append(vk.disc_x('jockey', tuple(der + V(0, 0, -0.35)), 0.15, 0.08, P['black'], seg=8))
        g.append(vk.rbox('front_mech', (0.15, 0.4, 0.3), tuple(BB.lerp(SC, 0.28) + V(-0.32, 0.05, 0)), P['steel'], bevel=0.0))
        g.append(tube('gear_cable', [BB.lerp(dtF, 0.7) + V(-0.12, 0, 0.1), BB + V(-0.15, 0, -0.2), RA + V(-0.4, -0.5, -0.3), der + V(0, -0.2, 0.3)], 0.025, seg=3, mat=P['black']))
        opt_parts['opt_gears'] = g
        sh = []
        for sx in (1, -1):
            sh.append(vk.rbox('shifter', (0.32, 0.3, 0.2), tuple(bc + V(sx * 1.25, 0.05, -0.1)), P['black'], bevel=0.04))
        Rg.add('opt_gears_bar', sh) if False else None
        opt_parts['opt_gears'] += []
        st_shift = sh
    else:
        st_shift = []
    Rg.add('root', fr)
    Rg.add('saddle', sd)
    Rg.add('steer', st)
    Rg.add('crank', crank)
    for S in ('L', 'R'):
        Rg.add('pedal_' + S, pedals[S])
    for b, parts in opt_parts.items():
        Rg.add(b, parts)
    if st_shift:
        # shifters ride on the bars: their own option bone parented to the steer bone
        Rg.bone('opt_gears_bar', bc, bc + V(0.8, 0, 0), parent='steer')
        Rg.add('opt_gears_bar', st_shift)
    arm, ob = Rg.build(tex=C.get('tex', 512), orm=128, emit=0, ao_samples=24, albedo_samples=6, ao_strength=0.62, ao_dist=1.5,
                       boost={'sign_': 2.4, 'chain_guard_name': 2.4, 'down_tube_name': 2.4})
    anchors_from(A, arm, {
        'seat_driver': (tuple(SEATv), 'saddle'),
        'seat_pillion': ((0, RA.y - 0.2 * k, cz + 0.12) if C.get('carrier') else tuple(SEATv + V(0, 1.2, 0.1)), 'root'),
        'handlebar': (tuple(bc), 'steer'), 'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'pedal_L': (tuple(ped['L'] + V(0, 0, 0.1)), 'pedal_L'), 'pedal_R': (tuple(ped['R'] + V(0, 0, 0.1)), 'pedal_R'),
        'wheel_front': (tuple(FA), 'wheel_front'), 'wheel_rear': (tuple(RA), 'wheel_rear'),
        'bell': (tuple(bc + V(0.45, -0.04, 0.2)), 'steer'), 'reflector': (tuple(RA + V(0, R * 0.95 + 0.45, R * 0.25 + 0.35)), 'root'),
    })
    if lamp_c is not None:
        anchors_from(A, arm, {'headlight': (tuple(lamp_c + V(0, -0.3, 0)), 'steer')})
    A.meta.update({'steerAxis': [round(c, 4) for c in AXc], 'bb': [round(c, 4) for c in BB], 'seat': [round(c, 4) for c in SEATv],
                   'saddleTube': [round(c, 4) for c in G['ST']], 'crankR': round(cr, 3), 'wheelR': R, 'wheels': {'wheel_front': R, 'wheel_rear': R},
                   'pedalX': round(px, 3)})
    RIDE_GEOM[A.id] = {'pose': 'cycle', 'vehicle': A.id, 'seat': tuple(SEATv), 'grip_L': tuple(grips['L']), 'grip_R': tuple(grips['R']),
                       'bb': tuple(BB), 'crank': cr, 'pedal_x': px, 'pedal_up': 0.14, 'seat_tube': tuple(G['ST'])}
    return arm, ob


CYCLE_RIDER = {'driver': {'pose': 'cycle', 'seat': 'seat_driver', 'grips': ['grip_L', 'grip_R'], 'feet': 'pedals', 'clips': ['ride_cycle']}}


@kit.asset('hero_cycle', 'vehicle', vehicleTypes=['hero_cycle', 'old_cycle', 'chinnu_cycle'], length=16.0, wheelR=3.0, crankR=1.05,
           gear=2.4, parts=['root', 'steer', 'wheel_front', 'wheel_rear', 'crank', 'pedal_L', 'pedal_R', 'saddle'], saddleDrop=SADDLE_DROP,
           tintSrc={'paint': 'color'}, riders=CYCLE_RIDER, pedal=True, kainchi=['hero_cycle', 'old_cycle'])
def hero_cycle(A):
    """The classic black Hero roadster: tall lugged diamond frame with double seat stays and gold
    pinstripes, 28-inch wheels, rod brakes with stirrups, a sprung leather saddle, the rear carrier,
    full mudguards, the plate chain guard with 'HERO' hand-painted in plain letters, a bottle dynamo
    on the front fork wired to the round lamp, the bell, a rear double stand. Geometry = HERO /
    hero_geom() exactly (the riders' ride_cycle clips are authored against it). Tint: paint =
    v.color (black, or the odd dark blue / maroon)."""
    pedal_cycle(A, {
        'geom': dict(),
        'color': '#141418', 'frame': 'diamond', 'bars': 'swept', 'guards': 'full', 'carrier': True, 'chainguard': 'plate', 'guard_black': True,
        'brakes': 'rod', 'stand': 'double', 'saddle': 'sprung', 'tyre_w': 0.42, 'spokes': 36, 'tube_r': 0.15, 'grip': '#e6dcc4',
        'lamp': True, 'dynamo': True, 'double_stays': True, 'pinstripe': True,
        'lettering': ('HERO', ('#d6b04a', '#141418'), 'chainguard'),
    })
    A.preview = {'shots': [{'view': {'az': -62, 'el': 14, 'fov': 28}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#141418'}}, {'colours': {'paint': '#16213e'}}, {'colours': {'paint': '#3a1618'}}],
                              'view': {'az': -70, 'el': 12, 'fov': 28}}}


@kit.asset('hercules_cycle', 'vehicle', vehicleTypes=['hercules_cycle', 'hercules_gears'], length=14.5, wheelR=2.75, crankR=1.0, gear=2.6,
           tintSrc={'paint': 'color', 'paint2': 'color2'}, options=[{'bone': 'opt_gears', 'types': ['hercules_gears']}, {'bone': 'opt_gears_bar', 'types': ['hercules_gears']}],
           riders=CYCLE_RIDER, pedal=True)
def hercules_cycle(A):
    """The sporty Hercules of 2003: a bright sloping MTB-style frame with oversized tubes, a flat black
    bar, fat knobbly tyres, coloured rims and fork (paint2), caliper brakes, short guards, no
    carrier; the lettering as a plain sticker band on the down tube. hercules_gears adds the
    derailleur, a second chainring and the shifters (option bones). 14.5 u long (TYPES)."""
    pedal_cycle(A, {
        'geom': dict(R=2.75, wb=9.0, cs=3.9, bb_drop=0.55, st_len=2.2, st_dir=(0, 0.33, 0.944), head=(1.35, 2.62), seat_off=(0, -0.1, 0.62), stem=0.62, bar_c=(0, -0.3, 0.12)),
        'color': '#d8262a', 'color2': '#f4f2ea', 'accent': True, 'accent_rims': True, 'accent_fork': True,
        'frame': 'mtb', 'bars': 'flat', 'guards': None, 'carrier': False, 'chainguard': 'ring', 'brakes': 'caliper', 'stand': 'side',
        'saddle': 'sport', 'tyre_w': 0.62, 'knobs': 0.07, 'spokes': 28, 'tube_r': 0.17, 'grip': '#1c1c1e',
        'lettering': ('HERCULES', ('#f4f2ea', '#141418'), 'downtube'), 'options': ['opt_gears'],
    })
    A.preview = {'shots': [{'view': {'az': -62, 'el': 14, 'fov': 28}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': 90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#d8262a', 'paint2': '#f4f2ea'}, 'hide': ['opt_gears', 'opt_gears_bar']},
                                       {'colours': {'paint': '#1f6fd0', 'paint2': '#ffe14a'}},
                                       {'colours': {'paint': '#26a050', 'paint2': '#1a1a1e'}, 'hide': ['opt_gears', 'opt_gears_bar']},
                                       {'colours': {'paint': '#f0b818', 'paint2': '#1a1a1e'}, 'hide': ['opt_gears', 'opt_gears_bar']}],
                              'view': {'az': -70, 'el': 12, 'fov': 28}}}


@kit.asset('bsa_cycle', 'vehicle', vehicleTypes=['cycle', 'bsa_cycle'], length=15.0, wheelR=2.9, crankR=1.05, gear=2.4,
           tintSrc={'paint': 'color'}, riders=CYCLE_RIDER, pedal=True)
def bsa_cycle(A):
    """The BSA SLR: a light sports roadster in a painted colour (blue / red / green / black), chrome
    rims, rod brakes, full guards, carrier, the plate chain guard with 'BSA SLR' painted in plain
    letters, a rear double stand. 15 u long (TYPES.cycle / bsa_cycle)."""
    pedal_cycle(A, {
        'geom': dict(R=2.9, wb=9.2, cs=4.05, bb_drop=0.62, st_len=2.5, head=(1.42, 2.55), seat_off=(0, -0.1, 0.55), stem=0.66),
        'color': '#24479a', 'frame': 'diamond', 'bars': 'swept', 'bar_k': 0.92, 'guards': 'full', 'carrier': True, 'chainguard': 'plate', 'guard_black': False,
        'brakes': 'rod', 'stand': 'double', 'saddle': 'sprung', 'tyre_w': 0.42, 'spokes': 32, 'tube_r': 0.145, 'grip': '#d8ccb0',
        'lettering': ('BSA SLR', ('#f2efe6', '#141418'), 'chainguard'),
    })
    A.preview = {'shots': [{'view': {'az': -62, 'el': 14, 'fov': 28}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#24479a'}}, {'colours': {'paint': '#9a2424'}}, {'colours': {'paint': '#2f6a3a'}}, {'colours': {'paint': '#1d1d22'}}],
                              'view': {'az': -70, 'el': 12, 'fov': 28}}}


@kit.asset('ladies_cycle', 'vehicle', vehicleTypes=['ladiescycle'], length=15.0, wheelR=2.9, crankR=1.0, gear=2.4,
           tintSrc={'paint': 'color'}, riders=CYCLE_RIDER, pedal=True)
def ladies_cycle(A):
    """The ladies' step-through cycle: twin curved loops instead of a top tube, upright swept bars,
    a wicker basket on the front, full guards, carrier, a full chain case with 'LADYBIRD' painted on
    it, rear double stand. Colours from TYPES.ladiescycle (maroon, pink, blue, purple, teal)."""
    pedal_cycle(A, {
        'geom': dict(R=2.9, wb=9.2, cs=4.05, bb_drop=0.62, st_len=2.45, head=(1.42, 2.6), seat_off=(0, -0.1, 0.5), stem=0.78),
        'color': '#8a2a4a', 'frame': 'ladies', 'bars': 'ladies', 'guards': 'full', 'carrier': True, 'chainguard': 'case',
        'brakes': 'rod', 'stand': 'double', 'saddle': 'sprung', 'tyre_w': 0.42, 'spokes': 32, 'tube_r': 0.14, 'basket': True, 'grip': '#e8e0cc',
        'lettering': ('LADYBIRD', ('#f2efe6', '#8a2a4a'), 'chainguard'), 'crank': 1.0,
    })
    A.preview = {'shots': [{'view': {'az': -62, 'el': 14, 'fov': 28}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#8a2a4a'}}, {'colours': {'paint': '#c05a8a'}}, {'colours': {'paint': '#3a7ab0'}}, {'colours': {'paint': '#2a8a7a'}}],
                              'view': {'az': -70, 'el': 12, 'fov': 28}}}


@kit.asset('kid_cycle', 'vehicle', vehicleTypes=['kid_cycle'], length=13.5, wheelR=2.5, crankR=0.95, gear=2.2,
           tintSrc={'paint': 'color'}, riders=CYCLE_RIDER, pedal=True)
def kid_cycle(A):
    """The kid's hire cycle (an hour for a rupee at the cycle shop): 20-inch wheels, a curved top
    tube, a riser bar with chunky grips, short guards, a small padded saddle, a side stand; a
    painted stripe instead of a brand. 13.5 u long (TYPES.kid_cycle)."""
    pedal_cycle(A, {
        'geom': dict(R=2.5, wb=8.5, cs=3.35, bb_drop=0.5, st_len=2.05, st_dir=(0, 0.34, 0.94), head=(1.45, 2.85), seat_off=(0, -0.1, 0.55), stem=0.5, bar_c=(0, -0.2, 0.08)),
        'color': '#9a2424', 'frame': 'kid', 'bars': 'riser', 'guards': 'short', 'carrier': False, 'chainguard': 'plate', 'guard_black': True,
        'brakes': 'caliper', 'stand': 'side', 'saddle': 'kid', 'tyre_w': 0.5, 'spokes': 24, 'tube_r': 0.14, 'grip': '#1c1c1e', 'crank': 0.95,
        'lettering': ('RENT 1 Rs / HR', ('#f2c230', '#141418'), 'chainguard'), 'wseg': 20,
    })
    A.preview = {'shots': [{'view': {'az': -62, 'el': 14, 'fov': 28}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#9a2424'}}, {'colours': {'paint': '#2f6a3a'}}, {'colours': {'paint': '#24479a'}}],
                              'view': {'az': -70, 'el': 12, 'fov': 28}}}


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
AUTO_AX = V(0, -0.36, -0.93).normalized()      # steering column axis (down, forwards)
AUTO_COL = V(0, -5.75, 7.0)                    # column top (handlebar centre behind the windscreen)
AUTO_SEAT = V(0, -2.0, 4.85)                   # driver's seat (hips)
AUTO_SLOGANS = [("MAA KA AASHIRWAD", 'opt_slogan0'), ('SOUND HORN', 'opt_slogan1'), ('USE DIPPER AT NIGHT', 'opt_slogan2'),
                ('BURI NAZAR WALE TERA MUNH KAALA', 'opt_slogan3'), ('YADAGIRI', 'opt_name')]


def canopy_row(y, hw, z_bot, z_sh, r, crown, xs=(2.7, 0.9, 0.0, -0.9, -2.7), nc=3):
    """one canopy cross-section at y (left side bottom -> shoulder arc -> crowned top -> right side);
    the top carries points at xs (the black centre stripe runs between +-0.9)"""
    pts = [(hw, y, z_bot)]
    for i in range(nc + 1):
        a = (math.pi / 2) * i / nc
        pts.append((hw - r + r * math.cos(a), y, z_sh + r * math.sin(a)))
    w = hw - r
    for x in xs:
        u = x / w
        pts.append((x, y, z_sh + r + crown * (1 - u * u)))
    for i in range(nc, -1, -1):
        a = (math.pi / 2) * i / nc
        pts.append((-(hw - r + r * math.cos(a)), y, z_sh + r * math.sin(a)))
    pts.append((-hw, y, z_bot))
    return pts


@kit.asset('auto_rickshaw', 'vehicle', vehicleTypes=['auto', 'yadagiri_auto'], length=22.0, width=13.0, wheelR=1.62, height=12.0,
           wheels={'wheel_front': 1.6, 'wheel_RL': 1.65, 'wheel_RR': 1.65}, steerBones={'steer': {'axis': list(AUTO_AX), 'k': 1.0}},
           tintSrc={'paint': 'color', 'paint2': 'color2'},
           options=[{'bone': 'opt_name', 'types': ['yadagiri_auto']},
                    {'bone': 'opt_slogan0', 'seed': [4, 0], 'notTypes': ['yadagiri_auto']}, {'bone': 'opt_slogan1', 'seed': [4, 1], 'notTypes': ['yadagiri_auto']},
                    {'bone': 'opt_slogan2', 'seed': [4, 2], 'notTypes': ['yadagiri_auto']}, {'bone': 'opt_slogan3', 'seed': [4, 3], 'notTypes': ['yadagiri_auto']}],
           riders={'driver': {'pose': 'auto', 'seat': 'seat_driver', 'grips': ['grip_L', 'grip_R'], 'feet': ['foot_L', 'foot_R'], 'lean': 0.12, 'clips': ['ride_auto', 'ride_scooty']},
                   'passengers': [{'seat': 'seat_passenger_L', 'feet': ['foot_passenger_L'], 'hands': 'knees', 'clips': ['sit']},
                                  {'seat': 'seat_passenger_R', 'feet': ['foot_passenger_R'], 'hands': 'knees', 'clips': ['sit']},
                                  {'seat': 'seat_passenger_C', 'feet': ['foot_passenger_C'], 'hands': 'knees', 'clips': ['sit']}]},
           lamps={'head': ['headlight'], 'tail': ['taillight_L', 'taillight_R']}, open=True, fps='open')
def auto_rickshaw(A):
    """The Bajaj-RE-style three-wheeler of 2003 Hyderabad (2-stroke): black body and front cowl,
    a yellow rexine canopy on steel bows with a black centre stripe and piping, the single round
    headlamp on the cowl, handlebar steering behind the windscreen, the mechanical fare meter with
    its red flag on the driver's left, a red rexine passenger bench, one of four painted slogans
    on the back (or the owner's name), nimbu-mirchi under the nose. 22 x 13 u (TYPES.auto),
    canopy top ~12 u. Tint: paint = v.color (canopy, lip), paint2 = v.color2 (body)."""
    P = vk.palette()
    Y = vk.paint('auto_yellow', '#f2c230', region=vk.R_PAINT, rough=0.45, chips=0.25, under='#7a7a72', grime=0.45, dirt='#5a4a2a')
    K = vk.paint('auto_black', '#1c1a1c', region=vk.R_PAINT2, rough=0.5, chips=0.18, under='#6a6a66', grime=0.4, dirt='#4a4032')
    CAN = vk.mat('cloth', 'canopy_canvas', region=vk.R_PAINT, base='#f2c230', rough=0.9, var=0.08, grain=0.1, weave=0.12, grime=0.55, dirt='#6a5a32', scale=2.4, streaks=0.25)
    CANK = vk.mat('cloth', 'canopy_stripe', region=vk.R_PAINT2, base='#1c1a1c', rough=0.85, var=0.05, grain=0.08, weave=0.1, grime=0.4, dirt='#4a4436', scale=2.4)
    FLOOR = vk.mat('rubber', 'floor_mat', base='#2a2624', rough=0.95, grain=0.15, grime=0.6, dirt='#5a5040')
    R = vk.VRig(A)
    FW, RW = V(0, -8.3, 1.6), {'L': V(5.3, 6.4, 1.65), 'R': V(-5.3, 6.4, 1.65)}
    R.bone('steer', AUTO_COL, AUTO_COL + AUTO_AX * 1.5)
    R.bone('wheel_front', FW, parent='steer')
    R.bone('wheel_RL', RW['L'])
    R.bone('wheel_RR', RW['R'])
    for _, n in AUTO_SLOGANS:
        R.bone(n, (0, 11.3, 6.0))
    # ---------------------------------------------------------------- wheels (pressed steel, black)
    R.add('wheel_front', vk.disc_wheel('wf', FW, 1.6, 1.0, P, side=1, seg=14, rim_m=K, cap_frac=0.3, hub_bolts=0))
    R.add('wheel_RL', vk.disc_wheel('wrl', RW['L'], 1.65, 1.1, P, side=1, seg=14, rim_m=K, cap_frac=0.3, hub_bolts=0))
    R.add('wheel_RR', vk.disc_wheel('wrr', RW['R'], 1.65, 1.1, P, side=-1, seg=14, rim_m=K, cap_frac=0.3, hub_bolts=0))
    body = []
    # ---------------------------------------------------------------- floor pan, sills, rear tub
    body.append(vk.plan_prism('floor_pan', [(4.7, -6.6), (5.4, 0.4), (4.55, 3.9), (4.55, 11.0), (-4.55, 11.0), (-4.55, 3.9), (-5.4, 0.4), (-4.7, -6.6)], 1.75, 2.4, K, bevel=0.1, seg=1))
    body.append(vk.plan_prism('floor_mat', [(4.5, -6.3), (5.1, 0.4), (-5.1, 0.4), (-4.5, -6.3)], 2.4, 2.46, FLOOR))
    for sx in (1, -1):
        # driver's-compartment sill (low side panel), tapering towards the cowl
        sill = vk.side_prism('sill', [(-6.4, 1.75), (0.6, 1.75), (0.6, 3.3), (-6.4, 3.3)], *((4.62, 4.82) if sx > 0 else (-4.82, -4.62)), K, bevel=0.06, seg=1)
        for v in sill.data.vertices:
            v.co.x += sx * max(0.0, (v.co.y + 6.4) / 7.0) * 0.95
        body.append(sill)
        # rear side panel with the wheel arch, a yellow lip on top and a rubbing strip
        cx, cz, ar = 6.4, 1.65, 2.05
        arch = [(cx + ar * math.cos(math.radians(178 - 176 * i / 10)), cz + ar * math.sin(math.radians(178 - 176 * i / 10))) for i in range(11)]
        prof = [(0.5, 1.75), (cx - ar, 1.75)] + arch + [(cx + ar, 1.75), (11.05, 1.75), (11.05, 4.75), (0.5, 4.75)]
        body.append(vk.side_prism('side_panel', prof, *((5.78, 6.0) if sx > 0 else (-6.0, -5.78)), K))
        body.append(vk.rbox('side_lip', (0.36, 10.7, 0.3), (sx * 5.9, 5.78, 4.88), Y, bevel=0.08))
        body.append(vk.rbox('rub_strip', (0.1, 10.2, 0.22), (sx * 6.02, 5.9, 3.7), P['chrome'], bevel=0.0))
        # wheel-well liner so the arch never shows the void
        body.append(vk.side_prism('well', [(cx - ar - 0.1, 1.75), (cx - ar - 0.1, 3.85), (cx + ar + 0.1, 3.85), (cx + ar + 0.1, 1.75)], *((4.55, 4.65) if sx > 0 else (-4.65, -4.55)), P['dark']))
        body.append(vk.rbox('well_top', (1.3, 4.4, 0.1), (sx * 5.2, cx, 3.82), P['dark'], bevel=0.0))
    # rear deck over the engine + the engine lid and bumper
    body.append(vk.rbox('rear_deck', (11.8, 1.9, 2.85), (0, 10.1, 3.32), K, bevel=0.2, seg=2))
    body.append(vk.rbox('engine_lid', (6.0, 0.1, 1.6), (0, 11.1, 3.4), K, bevel=0.0))
    body.append(vk.rbox('lid_handle', (1.2, 0.18, 0.14), (0, 11.18, 3.95), P['chrome'], bevel=0.0))
    body.append(tube('rear_bumper', [V(5.3, 10.9, 2.05), V(5.4, 11.45, 2.05), V(-5.4, 11.45, 2.05), V(-5.3, 10.9, 2.05)], 0.13, seg=6, mat=P['black']))
    # ---------------------------------------------------------------- the front cowl (narrow at the chin, widening to the dash)
    cowl = vk.loft_z('cowl', [
        (2.25, -9.75, 0.9, 0.75, 2.4), (2.9, -9.2, 1.35, 1.45, 2.6), (3.6, -8.75, 1.85, 1.95, 2.8), (4.4, -8.4, 2.6, 2.2, 3.0),
        (5.2, -8.15, 3.55, 2.15, 3.2), (5.9, -7.95, 4.35, 1.95, 3.4), (6.3, -7.75, 4.7, 1.75, 3.6), (6.42, -7.7, 4.62, 1.6, 3.6)], K, seg=20)
    body.append(cowl)
    body.append(vk.rbox('dash', (9.3, 0.9, 0.3), (0, -6.25, 6.32), P['black'], bevel=0.12))
    body.append(vk.rbox('cowl_back', (9.2, 0.12, 3.95), (0, -6.0, 4.4), P['black'], bevel=0.0))
    body.append(vk.rbox('cowl_lip', (9.5, 0.3, 0.16), (0, -6.15, 6.48), Y, bevel=0.06))
    # headlamp, horn grille, indicators, plate, guard bar
    body += vk.lamp_round('headlamp', (0, -10.45, 4.55), 0.58, 0.4, P, facing=(0, -1, 0.12))
    body.append(vk.rbox('horn_grille', (0.9, 0.12, 0.5), (0, -10.42, 3.5), P['chrome'], bevel=0.0))
    for sx in (1, -1):
        body.append(vk.rbox('indicator', (0.5, 0.35, 0.3), (sx * 3.4, -9.95, 5.9), P['amber'], bevel=0.0))
    body.append(vk.plate('plate_front', 'AP 09 V 2716', 2.2, 0.55, (0, -10.25, 2.7), '-Y', bg='#f4f2ea', fg='#141414'))
    body.append(tube('nose_guard', [V(1.4, -9.1, 2.0), V(1.0, -10.75, 2.15), V(-1.0, -10.75, 2.15), V(-1.4, -9.1, 2.0)], 0.1, seg=5, mat=P['chrome']))
    # ---------------------------------------------------------------- windscreen + posts
    WS0, WS1 = -6.55, -7.05      # windscreen bottom / top y
    for sx in (1, -1):
        body.append(tube('ws_post', [V(sx * 4.7, WS0, 6.4), V(sx * 4.6, WS1, 10.6)], 0.13, seg=6, mat=P['black']))
        body.append(tube('b_post', [V(sx * 5.9, 0.6, 4.85), V(sx * 5.95, 0.6, 9.45)], 0.12, seg=6, mat=P['black']))
        body.append(tube('rear_post', [V(sx * 5.85, 8.6, 4.85), V(sx * 5.95, 8.6, 9.45)], 0.11, seg=6, mat=P['black']))
        body.append(tube('grab_rail', [V(sx * 5.75, 1.0, 8.75), V(sx * 5.8, 8.3, 8.75)], 0.07, seg=5, mat=P['chrome']))
    body.append(tube('ws_top', [V(4.6, WS1, 10.6), V(-4.6, WS1, 10.6)], 0.13, seg=6, mat=P['black']))
    ws = kit.box('windscreen', (9.0, 0.06, 4.05), (0, (WS0 + WS1) / 2, 8.5), P['glass'])
    ws.rotation_euler = (math.atan2(WS0 - WS1, 4.2), 0, 0)
    body.append(vk.xform(ws))
    body.append(tube('wiper', [V(0.3, -6.72, 6.75), V(-1.2, -6.95, 9.4)], 0.04, seg=4, mat=P['black']))
    # ---------------------------------------------------------------- the canopy: yellow rexine on bows, black stripe, black piping
    st = [  # (y, hw, z_bot, z_shoulder, r, crown)
        (-7.75, 4.85, 10.35, 10.6, 0.7, 0.15), (-7.15, 5.6, 9.45, 10.55, 0.9, 0.3), (-4.6, 6.0, 9.4, 10.75, 0.95, 0.42),
        (-1.8, 6.05, 9.4, 10.7, 0.95, 0.3), (0.9, 6.08, 9.4, 10.82, 0.95, 0.45), (3.6, 6.08, 9.4, 10.72, 0.95, 0.3),
        (6.3, 6.08, 9.4, 10.8, 0.95, 0.44), (8.55, 6.05, 9.4, 10.72, 0.95, 0.32), (8.65, 6.05, 4.85, 10.72, 0.95, 0.32),
        (10.6, 6.0, 4.85, 10.7, 0.95, 0.36), (11.2, 5.9, 4.85, 10.45, 1.05, 0.2)]
    rows = [canopy_row(y, hw, zb, zs, r, c) for (y, hw, zb, zs, r, c) in st]
    can = vk.shell('canopy', rows, CAN, thick=0.09, inside=(0, 2.0, 6.0))
    vk.assign_faces(can, [(lambda c, n: abs(c.x) < 0.9 and c.z > 10.0, CANK)])
    body.append(can)
    for sx in (1, -1):
        body.append(tube('canopy_pipe', [V(sx * (hw + 0.03), y, zb) for (y, hw, zb, zs, r, c) in st[1:8]], 0.08, seg=5, mat=CANK))
        body.append(tube('quarter_pipe', [V(sx * 6.07, 8.62, 4.9), V(sx * 6.07, 8.62, 9.4)], 0.08, seg=5, mat=CANK))
    # the back: canvas panel down to the deck, a small rear window; slogans painted on it
    back = rows[-1]
    poly = [(p[0], p[2]) for p in back] + [(-5.9, 4.8), (5.9, 4.8)]
    poly = [(x, z) for (x, z) in poly if z >= 4.8]
    bp = vk.front_prism('back_canvas', poly, 11.12, 11.26, CAN)
    body.append(bp)
    body.append(vk.rbox('back_window', (4.6, 0.06, 1.2), (0, 11.29, 9.0), P['glass_dark'], bevel=0.0))
    body.append(vk.rbox('back_window_rim', (4.9, 0.04, 1.5), (0, 11.27, 9.0), CANK, bevel=0.0))
    # ---------------------------------------------------------------- seats
    body.append(vk.rbox('driver_pedestal', (2.6, 1.8, 1.7), (0, -2.0, 3.25), P['black'], bevel=0.1))
    body.append(vk.seat_pad('driver_seat', -2.2, 2.2, -3.1, -0.85, 4.1, 4.75, P['seat_black'], crown=0.1, seg=1))
    body.append(vk.seat_pad('driver_back', -2.3, 2.3, -0.85, -0.4, 4.8, 6.7, P['seat_black'], crown=0.0, bevel=0.12, seg=1))
    body.append(vk.rbox('bench_base', (9.0, 5.4, 1.9), (0, 6.3, 3.4), P['black'], bevel=0.1))
    body.append(vk.seat_pad('bench', -5.5, 5.5, 3.5, 9.0, 4.35, 5.2, P['seat_red'], crown=0.14, seg=1))
    bb = vk.seat_pad('bench_back', -5.5, 5.5, 9.0, 9.8, 5.2, 8.6, P['seat_red'], crown=0.0, bevel=0.15, seg=1)
    body.append(vk.rotate_about(bb, (0, 9.4, 5.2), (math.radians(-8), 0, 0)))
    for sx in (1, -1):
        body.append(vk.rbox('step', (0.7, 1.8, 0.16), (sx * 5.6, 2.2, 1.95), P['black'], bevel=0.0))
    # ---------------------------------------------------------------- fare meter (driver's left, outside) + mirror
    body.append(vk.rbox('meter', (0.8, 0.7, 1.35), (5.4, -6.3, 7.75), P['plastic'], bevel=0.12))
    body.append(vk.rbox('meter_face', (0.5, 0.06, 0.36), (5.4, -6.68, 8.05), vk.mat('lamp_lens', 'meter_lamp', region=vk.R_HEAD, base='#e8d090', emit='#ffb050'), bevel=0.0))
    body.append(tube('meter_arm', [V(5.35, -6.3, 7.05), V(4.75, -6.45, 7.2)], 0.07, seg=5, mat=P['black']))
    body.append(vk.rbox('meter_flag', (0.07, 1.0, 0.7), (5.45, -6.25, 8.95), vk.paint('flag_red', '#c42a24', region=0, chips=0.1), bevel=0.0))
    body.append(tube('flag_rod', [V(5.45, -6.3, 8.4), V(5.45, -6.3, 9.35)], 0.04, seg=4, mat=P['chrome']))
    body += vk.mirror('mirror', (-4.65, -6.75, 9.0), (-5.5, -7.2, 9.4), 0.36, P, facing=(-0.2, -1, 0.1))
    # ---------------------------------------------------------------- rear: tail lamps, indicators, plate, exhaust, spare-wheel bracket
    for sx in (1, -1):
        body.append(vk.rbox('tail_lamp', (1.0, 0.22, 0.55), (sx * 4.7, 11.15, 4.05), P['tail_lens'], bevel=0.0))
        body.append(vk.rbox('rear_ind', (0.42, 0.2, 0.32), (sx * 5.55, 11.12, 4.05), P['amber'], bevel=0.0))
    body.append(vk.plate('plate_rear', 'AP 09 V 2716', 2.5, 0.65, (0, 11.2, 2.75), '+Y', bg='#f4f2ea', fg='#141414'))
    body.append(tube('exhaust', [V(-2.8, 8.0, 1.5), V(-3.2, 10.4, 1.4), V(-3.35, 11.5, 1.45)], 0.16, seg=6, mat=P['steel']))
    # nimbu-mirchi: a lemon and green chillies on a thread under the nose (against the evil eye)
    charm = [tube('charm_thread', [V(0, -10.35, 3.15), V(0, -10.4, 2.4)], 0.015, seg=3, mat=P['black'])]
    lem = kit.lathe('charm_lemon', [(0.0, -0.2), (0.12, -0.13), (0.16, 0.0), (0.12, 0.13), (0.0, 0.2)], seg=7, mat=vk.mat('walkman', 'lemon', base='#d8c020', grime=0.2))
    charm.append(vk.xform(lem, loc=(0, -10.42, 2.25)))
    for i, (dx, dz) in enumerate(((0.11, 1.85), (-0.11, 1.88), (0.0, 1.8))):
        ch = kit.cylinder('chilli', 0.05, 0.45, (0, 0, 0), seg=4, mat=vk.mat('cloth', 'chilli', base='#2e7a2a', rough=0.5, weave=0.0, grime=0.2), r2=0.012, base=True)
        charm.append(vk.xform(ch, loc=(dx, -10.42, dz + 0.42), rot=(math.pi, 0.25 * (i - 1), 0)))
    body += charm
    R.add('root', body)
    # ---------------------------------------------------------------- slogans / owner's name on the back canvas (option bones)
    for t, bone in AUTO_SLOGANS:
        w = 7.6 if len(t) > 14 else 6.4
        R.add(bone, vk.decal('sign_' + bone, t, w, 1.0 if len(t) > 20 else 1.2, (0, 11.3, 6.3), '+Y', fg='#16141a', bg='#f2c230', px=512))
    # ---------------------------------------------------------------- steering: column, handlebar, fork, front mudguard
    stp = []
    stp.append(tube('column', [AUTO_COL, AUTO_COL + AUTO_AX * 2.9], 0.15, seg=6, mat=P['black']))
    stp.append(vk.rbox('bar_housing', (1.2, 0.55, 0.42), tuple(AUTO_COL + V(0, 0.15, 0.12)), P['black'], bevel=0.12))
    stp.append(vk.rbox('speedo', (0.5, 0.08, 0.3), tuple(AUTO_COL + V(0, -0.14, 0.4)), vk.mat('lamp_lens', 'speedo_glass', base='#b8b4a0', rough=0.1), bevel=0.0))
    bc = AUTO_COL + V(0, 0.15, 0.1)
    grips = {}
    for sx, S in ((1, 'L'), (-1, 'R')):
        pts = [bc, bc + V(sx * 0.9, 0.05, 0.02), bc + V(sx * 1.6, 0.35, 0.0), bc + V(sx * 2.15, 0.85, -0.06)]
        stp.append(tube('bar', pts, 0.085, seg=6, mat=P['chrome']))
        g0, g1 = bc + V(sx * 2.0, 0.7, -0.05), bc + V(sx * 2.5, 1.15, -0.1)
        stp.append(tube('grip', [g0, g1], 0.16, seg=6, mat=P['plastic']))
        grips[S] = g0.lerp(g1, 0.55)
        stp.append(tube('lever', [bc + V(sx * 1.7, 0.25, 0.05), bc + V(sx * 2.3, 0.4, 0.02)], 0.04, seg=4, mat=P['chrome']))
    fork_top = V(0, -8.0, 2.9)
    stp.append(tube('fork_arm', [fork_top + V(0.62, 0, 0), V(0.62, -8.0, 2.1), V(0.62, -8.3, 1.6)], 0.14, seg=6, mat=P['black']))
    stp.append(vk.cyl_between('shock', fork_top + V(0.62, 0.15, 0.1), V(0.62, -7.9, 1.9), 0.12, seg=6, m=P['chrome']))
    stp.append(vk.mudguard('guard_front', tuple(FW), 1.6, math.radians(-10), math.radians(165), P['black'], w=1.2, gap=0.2, thick=0.08, n=10))
    R.add('steer', stp)
    # ---------------------------------------------------------------- rig, bake
    arm, ob = R.build(tex=512, orm=256, emit=128, ao_samples=24, albedo_samples=6, ao_strength=0.75, ao_dist=2.6,
                      boost={'sign_': 2.6, 'head_lens': 1.6, 'tail_lens': 1.4, 'meter_lamp': 1.5, 'plate': 1.6})
    # ---------------------------------------------------------------- anchors
    anchors_from(A, arm, {
        'seat_driver': (tuple(AUTO_SEAT), 'root'), 'handlebar': (tuple(bc), 'steer'),
        'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'foot_L': ((0.95, -5.2, 2.46), 'root'), 'foot_R': ((-0.95, -5.2, 2.46), 'root'),
        'seat_passenger_L': ((3.0, 6.4, 5.25), 'root'), 'seat_passenger_R': ((-3.0, 6.4, 5.25), 'root'), 'seat_passenger_C': ((0.0, 6.4, 5.25), 'root'),
        'foot_passenger_L': ((2.8, 1.9, 2.46), 'root'), 'foot_passenger_R': ((-2.8, 1.9, 2.46), 'root'), 'foot_passenger_C': ((0.0, 1.9, 2.46), 'root'),
        'headlight': ((0, -10.95, 4.6), 'root'), 'taillight_L': ((4.7, 11.3, 4.05), 'root'), 'taillight_R': ((-4.7, 11.3, 4.05), 'root'),
        'indicator_L': ((3.4, -10.15, 5.9), 'root'), 'indicator_R': ((-3.4, -10.15, 5.9), 'root'),
        'exhaust': ((-3.35, 11.6, 1.45), 'root'), 'meter': ((5.4, -6.7, 8.05), 'root'),
        'wheel_front': (tuple(FW), 'wheel_front'), 'wheel_RL': (tuple(RW['L']), 'wheel_RL'), 'wheel_RR': (tuple(RW['R']), 'wheel_RR'),
    })
    RIDE_GEOM['auto_rickshaw'] = {'pose': 'auto', 'seat': tuple(AUTO_SEAT), 'grip_L': tuple(grips['L']), 'grip_R': tuple(grips['R']), 'foot_L': (0.95, -5.2, 2.46), 'foot_R': (-0.95, -5.2, 2.46)}
    A.meta.update({'steerAxis': [round(c, 4) for c in AUTO_AX], 'ride': RIDE_GEOM['auto_rickshaw']})
    A.preview = {'shots': [{'view': {'az': -38, 'el': 16, 'fov': 30}}, {'name': 'rear', 'size': 320, 'samples': 16, 'view': {'az': 152, 'el': 14, 'fov': 30}}],
                 'variants': {'sets': [{'colours': {'paint': '#f2c230', 'paint2': '#1c1a1c'}, 'hide': ['opt_name', 'opt_slogan1', 'opt_slogan2', 'opt_slogan3']},
                                       {'colours': {'paint': '#f2c230', 'paint2': '#2a4a2a'}, 'hide': ['opt_name', 'opt_slogan0', 'opt_slogan2', 'opt_slogan3']},
                                       {'colours': {'paint': '#f2c230', 'paint2': '#1c1a1c'}, 'hide': ['opt_slogan0', 'opt_slogan1', 'opt_slogan2', 'opt_slogan3'], 'view': {'az': 160, 'el': 16, 'fov': 30}}],
                              'view': {'az': -120, 'el': 20, 'fov': 30}, 'night': {'az': -30, 'el': 12, 'fov': 30}}}
