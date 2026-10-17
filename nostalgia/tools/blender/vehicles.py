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


# =========================================================================== motor two-wheelers
# Proportions: heights are human-scale for the 9 u adults (a seat ~4.4-5.4 u up, bars ~5.5-6.9 u), lengths
# are stretched to the 2D collision length TYPES[t].w (the game's vehicles are long for readability), so
# wheelbases are long and wheels a little large. Rider anchors: seat_driver (where the hips sit, on the
# seat top), grip_L/R (steer bone), foot_L/R (floorboard / footpegs), seat_pillion + foot_pillion_L/R.
MOTO_RIDER = {'driver': {'pose': 'scooter', 'seat': 'seat_driver', 'grips': ['grip_L', 'grip_R'], 'feet': ['foot_L', 'foot_R'], 'clips': ['ride_scooty']},
              'pillion': {'pose': 'pillion', 'seat': 'seat_pillion', 'feet': ['foot_pillion_L', 'foot_pillion_R'], 'clips': ['sit']}}


def moto_rider(pose):
    r = json_clone(MOTO_RIDER)
    r['driver']['pose'] = pose
    return r


def json_clone(o):
    import json as _j
    return _j.loads(_j.dumps(o))


def steer_axis(top, axle):
    """unit steering axis (down, forwards) through the head-stock top and the front axle"""
    return (Vector(axle) - Vector(top)).normalized()


@kit.asset('scooty', 'vehicle', vehicleTypes=['scooty', 'akka_scooty'], length=14.5, width=5.6, wheelR=1.62, height=7.2,
           wheels={'wheel_front': 1.62, 'wheel_rear': 1.62}, tintSrc={'paint': 'color'}, riders=moto_rider('scooter'),
           lamps={'head': ['headlight'], 'tail': ['taillight']}, open=True, fps='bars')
def scooty(A):
    """TVS Scooty (2003): a light, narrow step-through scooterette in a bright colour (paint = v.color):
    the tall curved leg shield, the handlebar cowl with the headlamp and the little speedometer, a
    flat ribbed floorboard, the rounded rear body over the small rear wheel, a slim black seat, the
    chrome grab rail, the silver CVT case and the black silencer, 10-inch pressed-steel wheels, side
    and centre stands; 'TVS SCOOTY' painted in plain letters on a black side strip. 14.5 u long."""
    P = vk.palette()
    BODY = vk.paint('scooty_body', '#e8323c', region=vk.R_PAINT, rough=0.28, chips=0.12, under='#9a9a96', grime=0.3, dirt='#4a4034')
    TRIM = vk.mat('plastic_black', 'trim_black', base='#18181a', rough=0.55, grime=0.35)
    FLOOR = vk.mat('rubber', 'floor_rubber', base='#232325', rough=0.92, grain=0.12, grime=0.55, dirt='#5a5040')
    CASE = vk.mat('steel', 'cvt_case', base='#a9acaf', rough=0.5, metal=0.6, grime=0.55, dirt='#3a342c')
    SEAT = P['seat_black']
    R = 1.62
    FA, RA = V(0, -4.75, R), V(0, 4.35, R)
    S0 = V(0, -3.05, 5.45)                       # head-stock top (under the bar cowl)
    AXs = steer_axis(S0, FA)
    Rg = vk.VRig(A)
    Rg.bone('steer', S0, S0 + AXs * 1.5)
    Rg.bone('wheel_front', FA, parent='steer')
    Rg.bone('wheel_rear', RA)
    Rg.add('wheel_front', vk.disc_wheel('wf', tuple(FA), R, 0.85, P, side=1, seg=16, rim_m=P['alu'], cap_frac=0.3))
    Rg.add('wheel_rear', vk.disc_wheel('wr', tuple(RA), R, 0.9, P, side=-1, seg=16, rim_m=P['alu'], cap_frac=0.0))
    body = []
    # ---------------------------------------------------------------- leg shield (curved apron) + its black back
    lv = [(1.25, -3.45, 1.32, 0.42), (2.2, -3.4, 1.42, 0.46), (3.3, -3.28, 1.36, 0.44), (4.3, -3.15, 1.2, 0.38), (5.0, -3.05, 0.98, 0.3), (5.35, -2.98, 0.72, 0.22)]
    ap = vk.shell('apron', vk.apron_rows(lv, n=8), BODY, thick=0.1, inside=(0, 0.0, 3.0))
    vk.assign_faces(ap, [(lambda c, n: n.y > 0.55, TRIM)])
    body.append(ap)
    body.append(tube('apron_edge', [V(1.32, -3.45, 1.25), V(1.42, -3.4, 2.2), V(1.36, -3.28, 3.3), V(1.2, -3.15, 4.3), V(0.98, -3.05, 5.0), V(0.72, -2.98, 5.35),
                                    V(-0.72, -2.98, 5.35), V(-0.98, -3.05, 5.0), V(-1.2, -3.15, 4.3), V(-1.36, -3.28, 3.3), V(-1.42, -3.4, 2.2), V(-1.32, -3.45, 1.25)],
                     0.06, seg=4, mat=TRIM))
    # front 'beak' under the apron (body colour) down to the floor pan
    body.append(vk.loft_y('beak', [(-3.95, 0.55, 1.0, 1.6, 2.4), (-3.55, 1.0, 0.95, 2.4, 2.6), (-3.1, 1.2, 0.95, 2.6, 2.8)], BODY, seg=10))
    # indicators on the apron (amber, front)
    for sx in (1, -1):
        body += vk.lens_box('ind_f', (0.42, 0.18, 0.26), (sx * 1.0, -3.62, 4.35), P['amber'])
    # ---------------------------------------------------------------- floor pan + ribbed board
    body.append(vk.plan_prism('floor_pan', [(1.28, -3.2), (1.3, 0.75), (-1.3, 0.75), (-1.28, -3.2)], 0.85, 1.2, BODY, bevel=0.08, seg=1))
    body.append(vk.plan_prism('floor_board', [(1.18, -3.0), (1.2, 0.6), (-1.2, 0.6), (-1.18, -3.0)], 1.2, 1.28, FLOOR))
    for k in range(3):
        x = -0.7 + k * 0.7
        body.append(vk.rbox('floor_rib', (0.16, 3.2, 0.07), (x, -1.2, 1.31), FLOOR, bevel=0.0))
    # ---------------------------------------------------------------- rear body: an open U shell over the rear wheel, closed tail
    st = [(0.55, 1.12, 1.0, 1.7, 0.45), (1.2, 1.26, 1.0, 2.55, 1.0), (2.1, 1.34, 1.15, 3.05, 0.95), (3.2, 1.36, 1.6, 3.3, 0.82),
          (4.35, 1.3, 2.1, 3.45, 0.7), (5.35, 1.12, 2.55, 3.5, 0.6), (6.0, 0.86, 2.85, 3.48, 0.5), (6.4, 0.5, 3.05, 3.42, 0.38)]
    rows = [vk.u_row(y, hw, zs, zc, hh, p=2.8, n=8) for (y, hw, zs, zc, hh) in st]
    rb = vk.shell('rear_body', rows, BODY, thick=0.1, inside=(0, 3.5, 1.0))
    body.append(rb)
    # the tail cap + a black under-tray closing the shell bottom behind the wheel
    body.append(vk.loft_y('tail_cap', [(6.38, 0.52, 3.0, 3.85, 2.4), (6.62, 0.3, 3.15, 3.7, 2.2)], BODY, seg=10))
    body.append(vk.plan_prism('under_tray', [(0.9, 5.2), (0.75, 6.4), (-0.75, 6.4), (-0.9, 5.2)], 2.55, 2.65, TRIM))
    # black side strip with the name in plain letters (does not take the body tint)
    for sx in (1, -1):
        body.append(vk.decal('sign_side', 'TVS SCOOTY', 2.6, 0.42, (sx * 1.37, 3.3, 2.75), '+X' if sx > 0 else '-X', fg='#e8e6e0', bg='#1a1a1c', px=256, font=vk.FONT_COND))
    # tail lamp + rear indicators + plate
    body += vk.lens_box('tail', (0.9, 0.2, 0.36), (0, 6.66, 3.62), P['tail_lens'])
    for sx in (1, -1):
        body += vk.lens_box('ind_r', (0.34, 0.16, 0.22), (sx * 0.72, 6.55, 3.58), P['amber'])
    body.append(vk.plate('plate_rear', 'AP 09 Q 3187', 1.55, 0.5, (0, 6.6, 2.75), '+Y', bg='#f4f2ea', fg='#141414', px=128))
    # ---------------------------------------------------------------- seat + grab rail
    body.append(vk.loft_y('seat', [(-0.25, 0.48, 3.98, 4.2, 2.6), (0.15, 0.68, 3.95, 4.38, 3.0), (1.5, 0.78, 3.98, 4.45, 3.2), (3.2, 0.8, 4.0, 4.5, 3.2),
                                   (4.6, 0.74, 4.0, 4.48, 3.0), (5.3, 0.58, 3.98, 4.36, 2.6), (5.55, 0.36, 4.0, 4.22, 2.2)], SEAT, seg=12))
    body.append(tube('seat_piping', [V(0.79, 0.3, 4.1), V(0.8, 3.2, 4.12), V(0.74, 4.6, 4.1), V(0.58, 5.3, 4.08), V(0, 5.6, 4.06), V(-0.58, 5.3, 4.08),
                                     V(-0.74, 4.6, 4.1), V(-0.8, 3.2, 4.12), V(-0.79, 0.3, 4.1)], 0.04, seg=4, mat=P['chrome']))
    body.append(tube('grab_rail', [V(0.95, 4.2, 3.6), V(0.98, 5.4, 3.95), V(0.6, 6.1, 4.05), V(-0.6, 6.1, 4.05), V(-0.98, 5.4, 3.95), V(-0.95, 4.2, 3.6)], 0.075, seg=6, mat=P['chrome']))
    # ---------------------------------------------------------------- CVT case (left) + swing arm, silencer (right), stands, kick lever
    body.append(vk.loft_y('cvt_case', [(1.3, 0.22, 1.15, 1.9, 2.4, 0.78), (2.0, 0.3, 0.9, 2.25, 2.6, 0.8), (3.6, 0.3, 1.05, 2.15, 2.6, 0.82), (4.45, 0.26, 1.25, 1.98, 2.4, 0.82),
                                      (4.75, 0.14, 1.4, 1.84, 2.2, 0.8)], CASE, seg=10))
    body.append(vk.disc_x('cvt_cover', (0.98, 2.4, 1.6), 0.55, 0.08, CASE, seg=12))
    body.append(vk.loft_y('engine', [(0.7, 0.55, 0.8, 1.9, 2.6), (1.4, 0.62, 0.75, 2.2, 2.8), (2.1, 0.5, 0.95, 2.05, 2.6)], P['engine'], seg=10))
    body.append(tube('swing_arm_r', [V(-0.5, 2.0, 1.4), V(-0.55, 4.35, R)], 0.12, seg=5, mat=P['black']))
    body.append(tube('shock', [V(-0.6, 4.1, 1.95), V(-0.75, 4.9, 3.0)], 0.1, seg=5, mat=P['black']))
    body.append(vk.spring('shock_spring', (-0.6, 4.18, 2.05), (-0.73, 4.82, 2.85), 0.17, 2.5, P['chrome'], wire=0.035))
    body.append(tube('exhaust_pipe', [V(-0.25, 0.9, 0.85), V(-0.6, 1.8, 0.8), V(-0.85, 2.9, 1.05)], 0.12, seg=5, mat=P['dark']))
    body.append(vk.loft_y('silencer', [(2.8, 0.18, 0.88, 1.24, 2.0, -0.92), (3.3, 0.3, 0.75, 1.42, 2.2, -0.95), (5.0, 0.3, 0.95, 1.6, 2.2, -0.95), (5.5, 0.2, 1.1, 1.5, 2.0, -0.95)], P['black'], seg=8))
    body.append(vk.disc_y('silencer_tip', (-0.95, 5.56, 1.3), 0.11, 0.18, P['chrome'], seg=8))
    body.append(tube('centre_stand', [V(0.75, 2.4, 1.0), V(0.8, 2.6, 0.05), V(-0.8, 2.6, 0.05), V(-0.75, 2.4, 1.0)], 0.07, seg=4, mat=P['black']))
    body.append(tube('side_stand', [V(1.05, 0.6, 0.95), V(1.6, 1.3, 0.06)], 0.07, seg=4, mat=P['black']))
    body.append(tube('kick', [V(0.95, 1.9, 1.75), V(1.15, 1.2, 1.55)], 0.06, seg=4, mat=P['chrome']))
    body.append(vk.mudguard('hugger', tuple(RA), R, math.radians(60), math.radians(150), TRIM, w=0.8, gap=0.12, thick=0.06, n=5))
    Rg.add('root', body)
    # ---------------------------------------------------------------- steering: fork, front guard, bar cowl + headlamp, bars, mirrors
    stp = []
    crown = S0 + AXs * 1.55
    stp.append(tube('stem', [S0 + V(0, 0, 0.25), crown], 0.15, seg=6, mat=P['black']))
    stp += vk.tele_fork('fork', crown, FA, AXs, 0.48, 0.11, P['black'], lower_m=P['alu'], lower_r=0.14, split=0.5)
    stp.append(vk.rbox('fork_bridge', (1.15, 0.3, 0.22), tuple(crown), P['black'], bevel=0.0))
    stp.append(vk.mudguard('guard_front', tuple(FA), R, math.radians(-25), math.radians(122), BODY, w=0.98, gap=0.18, thick=0.07, n=9))
    cow = vk.loft_y('bar_cowl', [(-3.62, 0.55, 5.18, 5.62, 2.4), (-3.45, 0.95, 5.05, 5.95, 2.8), (-3.0, 1.08, 5.05, 6.02, 3.0), (-2.55, 0.95, 5.12, 5.96, 2.8), (-2.32, 0.62, 5.25, 5.82, 2.4)], BODY, seg=12)
    stp.append(cow)
    stp += vk.lens_box('head', (0.95, 0.12, 0.42), (0, -3.63, 5.45), P['head_lens'], bezel_m=P['chrome'])
    stp.append(vk.rbox('speedo', (0.7, 0.42, 0.12), (0, -2.85, 6.03), P['black'], bevel=0.0))
    stp.append(vk.rbox('speedo_face', (0.5, 0.3, 0.02), (0, -2.83, 6.1), vk.mat('lamp_lens', 'speedo_dial', base='#e8e4d6', rough=0.2), bevel=0.0))
    bars, grips = vk.moto_bars('bar', (0, -2.95, 5.62), [(0.9, 0.05, 0.0), (1.45, 0.25, -0.05), (1.85, 0.42, -0.12)], 0.6, P, bar_m=P['black'], grip_m=TRIM, r=0.08, grip_r=0.15)
    stp += bars
    stp += vk.mirrors('mirror', [(1.0, -3.0, 5.95), (-1.0, -3.0, 5.95)], 1.0, 0.35, 0.3, P, stalk_m=P['black'])
    Rg.add('steer', stp)
    arm, ob = Rg.build(tex=512, orm=128, emit=128, ao_samples=20, albedo_samples=6, ao_strength=0.7, ao_dist=1.6,
                       boost={'sign_': 2.4, 'plate': 1.8, 'head_lens': 1.4, 'tail_lens': 1.4})
    hl = grips['L']
    anchors_from(A, arm, {
        'seat_driver': ((0, 1.15, 4.45), 'root'), 'seat_pillion': ((0, 3.6, 4.5), 'root'),
        'foot_L': ((0.7, -1.55, 1.3), 'root'), 'foot_R': ((-0.7, -1.55, 1.3), 'root'),
        'foot_pillion_L': ((1.15, 1.6, 1.3), 'root'), 'foot_pillion_R': ((-1.15, 1.6, 1.3), 'root'),
        'handlebar': ((0, -2.95, 5.62), 'steer'), 'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'headlight': ((0, -3.72, 5.45), 'steer'), 'taillight': ((0, 6.78, 3.62), 'root'),
        'indicator_FL': ((1.0, -3.72, 4.35), 'root'), 'indicator_FR': ((-1.0, -3.72, 4.35), 'root'),
        'indicator_RL': ((0.72, 6.65, 3.58), 'root'), 'indicator_RR': ((-0.72, 6.65, 3.58), 'root'),
        'exhaust': ((-0.95, 5.66, 1.3), 'root'), 'wheel_front': (tuple(FA), 'wheel_front'), 'wheel_rear': (tuple(RA), 'wheel_rear'),
    })
    A.meta.update({'steerAxis': [round(c, 4) for c in AXs]})
    A.preview = {'shots': [{'view': {'az': -55, 'el': 14, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': 90, 'el': 3, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#e8323c'}}, {'colours': {'paint': '#f07aa0'}}, {'colours': {'paint': '#2e9ad8'}}, {'colours': {'paint': '#c6ccd2'}}],
                              'view': {'az': -130, 'el': 16, 'fov': 30}, 'night': {'az': -30, 'el': 10, 'fov': 30}}}


@kit.asset('luna', 'vehicle', vehicleTypes=['luna', 'pochaiah_luna'], length=15.0, width=5.5, wheelR=2.25, height=7.0,
           wheels={'wheel_front': 2.25, 'wheel_rear': 2.25}, tintSrc={'paint': 'color'}, riders=moto_rider('moped'),
           options=[{'bone': 'opt_beacon', 'types': ['pochaiah_luna']}],
           lamps={'head': ['headlight'], 'tail': ['taillight'], 'beacon': ['beacon']}, open=True, fps='bars')
def luna(A):
    """TVS Luna moped: one big pressed-steel spine tube from the head down under the engine and up to
    the seat, the cylindrical tank under the sprung saddle, a little finned two-stroke with the
    bicycle-style pedals it is started with, the chrome carrier with shocks over the rear wheel,
    spoked 16-inch wheels, a big round chrome headlamp on a plain raised bar. Paint = v.color (red,
    blue, black, green); Pochaiah the havaldar's Luna adds a red / blue light bar (opt_beacon)."""
    P = vk.palette()
    BODY = vk.paint('luna_body', '#b82a2a', region=vk.R_PAINT, rough=0.32, chips=0.22, under='#8a8a86', grime=0.4, dirt='#4a4034')
    R = 2.25
    FA, RA = V(0, -4.9, R), V(0, 4.75, R)
    S0 = V(0, -3.62, 5.6)
    AXs = steer_axis(S0, FA)
    Rg = vk.VRig(A)
    Rg.bone('steer', S0, S0 + AXs * 1.5)
    Rg.bone('wheel_front', FA, parent='steer')
    Rg.bone('wheel_rear', RA)
    Rg.bone('opt_beacon', (0, 5.4, 5.6))
    M = {'tyre': P['tyre'], 'chrome': P['chrome'], 'steel': P['steel'], 'rubber': P['rubber'], 'dark': P['dark']}
    Rg.add('wheel_front', vk.spoke_wheel('wf', tuple(FA), R, M, spokes=24, seg=18, tyre_w=0.46, rim_d=0.34, hub_w=0.55))
    Rg.add('wheel_rear', vk.spoke_wheel('wr', tuple(RA), R, M, spokes=24, seg=18, tyre_w=0.5, rim_d=0.34, hub_w=0.6))
    b = []
    # ---------------------------------------------------------------- spine frame, head tube, tank, engine
    b.append(tube('spine', [S0 + AXs * 0.75, V(0, -2.95, 3.6), V(0, -1.9, 2.3), V(0, -0.4, 1.78), V(0, 1.0, 2.0), V(0, 1.85, 2.9), V(0, 2.3, 4.0)], 0.34, seg=8, mat=BODY, cap=True))
    b.append(tube('head_tube', [S0 + V(0, 0, 0.12), S0 + AXs * 1.0], 0.21, seg=8, mat=BODY))
    b.append(vk.loft_y('tank', [(-0.95, 0.25, 3.05, 3.55, 2.2), (-0.7, 0.55, 2.85, 3.95, 2.4), (1.2, 0.6, 2.85, 4.0, 2.4), (1.55, 0.3, 3.0, 3.75, 2.2)], BODY, seg=12))
    b.append(vk.cyl_between('tank_cap', (0, 0.1, 3.9), (0, 0.1, 4.1), 0.17, seg=8, m=P['chrome']))
    for sx in (1, -1):
        b.append(vk.decal('sign_luna', 'LUNA', 1.0, 0.32, (sx * 0.61, 0.25, 3.45), '+X' if sx > 0 else '-X', fg='#f0ece2', bg='#141416', px=128, font=vk.FONT_BOLD))
    b.append(vk.loft_y('crankcase', [(-0.75, 0.38, 1.05, 1.75, 2.4), (-0.4, 0.5, 0.85, 2.0, 2.6), (0.9, 0.5, 0.9, 2.05, 2.6), (1.3, 0.35, 1.1, 1.85, 2.4)], P['engine'], seg=10))
    for k in range(4):
        fz = 1.55 + k * 0.2
        f = vk.rbox('fin', (0.9, 0.7, 0.07), (0, -1.05 - k * 0.06, fz), P['engine'], bevel=0.0)
        b.append(vk.rotate_about(f, (0, -1.05, fz), (math.radians(-35), 0, 0)))
    b.append(vk.disc_x('magneto', (0.5, 0.15, 1.45), 0.58, 0.1, P['alu'], seg=12))
    b.append(tube('exhaust', [V(-0.25, -1.45, 1.5), V(-0.5, -1.0, 0.8), V(-0.65, 1.0, 0.9)], 0.11, seg=5, mat=P['dark']))
    b.append(vk.loft_y('silencer', [(0.9, 0.12, 0.75, 1.05, 2.0, -0.68), (1.3, 0.22, 0.7, 1.15, 2.2, -0.7), (3.0, 0.22, 0.85, 1.3, 2.2, -0.7), (3.3, 0.12, 0.95, 1.2, 2.0, -0.7)], P['black'], seg=8))
    # pedals (the Luna is started by pedalling): crank level, left forward
    bb = V(0, 0.3, 1.55)
    for sx, dy in ((1, -0.95), (-1, 0.95)):
        b.append(tube('crank_arm', [bb + V(sx * 0.55, 0, 0), bb + V(sx * 0.66, dy, 0)], 0.08, seg=5, mat=P['chrome']))
        b.append(vk.rbox('pedal', (0.55, 0.36, 0.16), tuple(bb + V(sx * 0.95, dy, 0)), P['rubber'], bevel=0.0))
    b.append(vk.disc_x('chainring', tuple(bb + V(0.6, 0, 0)), 0.55, 0.05, P['steel'], seg=12))
    # ---------------------------------------------------------------- swing arm, chain, shocks, carrier, mudguard, seat
    for sx in (1, -1):
        b.append(tube('swing_arm', [V(sx * 0.32, 1.25, 1.45), V(sx * 0.4, RA.y, R)], 0.1, seg=5, mat=P['black']))
        b.append(tube('shock', [V(sx * 0.62, 3.75, 4.6), V(sx * 0.44, RA.y - 0.15, R + 0.4)], 0.08, seg=5, mat=P['chrome']))
        b.append(vk.spring('shock_spring', (sx * 0.6, 3.85, 4.4), (sx * 0.47, RA.y - 0.25, R + 0.75), 0.15, 2.5, P['chrome'], wire=0.035))
        b.append(tube('carrier_rail', [V(sx * 0.62, 2.7, 4.55), V(sx * 0.62, 6.1, 4.72), V(sx * 0.4, 6.4, 4.7)], 0.06, seg=5, mat=P['chrome']))
        b.append(tube('carrier_stay', [V(sx * 0.62, 5.6, 4.7), V(sx * 0.45, RA.y + 0.1, R + 0.15)], 0.05, seg=4, mat=P['chrome']))
    for k in range(4):
        y = 3.55 + k * 0.75
        b.append(tube('slat', [V(0.62, y, 4.66), V(-0.62, y, 4.66)], 0.045, seg=4, mat=P['chrome']))
    b.append(tube('chain_top', [V(-0.42, 0.9, 1.75), V(-0.42, RA.y, R + 0.32)], 0.04, seg=3, mat=P['steel']))
    b.append(tube('chain_bot', [V(-0.42, 0.9, 1.15), V(-0.42, RA.y, R - 0.32)], 0.04, seg=3, mat=P['steel']))
    b.append(vk.mudguard('guard_rear', tuple(RA), R, math.radians(28), math.radians(175), P['black'], w=0.62, gap=0.2, thick=0.06, n=9))
    b += vk.lens_box('tail', (0.55, 0.18, 0.32), (0, 6.5, 4.5), P['tail_lens'], bezel_m=P['chrome'], facing='+Y')
    b.append(vk.plate('plate_rear', 'AP 09 L 762', 1.4, 0.48, (0, 6.62, 3.85), '+Y', bg='#f4f2ea', fg='#141414', px=128))
    b.append(tube('seat_post', [V(0, 2.25, 3.8), V(0, 2.0, 4.35)], 0.12, seg=6, mat=P['chrome']))
    b.append(vk.loft_y('seat', [(0.5, 0.42, 4.42, 4.7, 2.6), (0.9, 0.62, 4.4, 4.85, 3.0), (2.2, 0.88, 4.4, 4.92, 3.2), (2.85, 0.8, 4.42, 4.88, 3.0), (3.05, 0.55, 4.48, 4.78, 2.4)], P['seat_black'], seg=12))
    for sx in (1, -1):
        b.append(vk.spring('seat_spring', (sx * 0.48, 2.55, 4.42), (sx * 0.5, 2.65, 3.9), 0.12, 2.5, P['chrome'], wire=0.035))
    b.append(tube('centre_stand', [V(0.6, 3.2, 1.2), V(0.7, 3.5, 0.05), V(-0.7, 3.5, 0.05), V(-0.6, 3.2, 1.2)], 0.07, seg=4, mat=P['black']))
    Rg.add('root', b)
    # the havaldar's light bar (option)
    lb = [vk.rbox('beacon_bar', (1.3, 0.3, 0.2), (0, 5.4, 4.95), P['black'], bevel=0.0)]
    lb += vk.lens_box('beacon_r', (0.55, 0.3, 0.35), (0.32, 5.4, 5.22), P['beacon'])
    lb += vk.lens_box('beacon_b', (0.55, 0.3, 0.35), (-0.32, 5.4, 5.22), vk.mat('reflector_red', 'beacon_blue', region=vk.R_BEACON, base='#1a3ad0', rough=0.15, emit='#2a50ff'))
    Rg.add('opt_beacon', lb)
    # ---------------------------------------------------------------- steering
    st = []
    crown = S0 + AXs * 1.15
    st += vk.tele_fork('fork', crown, FA, AXs, 0.38, 0.11, P['chrome'], lower_m=P['black'], lower_r=0.13, split=0.45)
    st.append(vk.rbox('fork_crown', (0.95, 0.35, 0.2), tuple(crown), P['chrome'], bevel=0.0))
    st.append(vk.mudguard('guard_front', tuple(FA), R, math.radians(-15), math.radians(118), P['black'], w=0.62, gap=0.2, thick=0.06, n=8))
    top = S0 - AXs * 0.7
    st.append(tube('stem', [S0 + AXs * 0.2, top], 0.11, seg=6, mat=P['chrome']))
    bars, grips = vk.moto_bars('bar', tuple(top), [(0.55, 0.1, 0.12), (1.15, 0.45, 0.2), (1.65, 0.95, 0.15)], 0.62, P, r=0.08, grip_r=0.15)
    st += bars
    lc = top + V(0, -0.72, -0.35)
    st += vk.lamp_round('head', tuple(lc), 0.5, 0.55, P, facing=(0, -1, 0.05), seg=12)
    st.append(tube('lamp_bracket', [lc + V(0, 0.3, 0), top + V(0, 0, -0.1)], 0.06, seg=4, mat=P['chrome']))
    st.append(vk.cyl_between('horn', tuple(lc + V(0.3, 0.4, -0.75)), tuple(lc + V(0.3, 0.1, -0.75)), 0.2, seg=8, m=P['black']))
    st += vk.mirrors('mirror', [tuple(top + V(1.1, 0.4, 0.2))], 0.95, 0.25, 0.28, P)
    Rg.add('steer', st)
    arm, ob = Rg.build(tex=512, orm=128, emit=128, ao_samples=20, albedo_samples=6, ao_strength=0.68, ao_dist=1.5,
                       boost={'sign_': 2.4, 'plate': 1.8, 'head_lens': 1.4, 'tail_lens': 1.4})
    anchors_from(A, arm, {
        'seat_driver': ((0, 1.6, 4.9), 'root'), 'seat_pillion': ((0, 4.3, 4.85), 'root'),
        'foot_L': (tuple(bb + V(0.95, -0.95, 0.1)), 'root'), 'foot_R': (tuple(bb + V(-0.95, 0.95, 0.1)), 'root'),
        'foot_pillion_L': ((0.95, 3.0, 1.7), 'root'), 'foot_pillion_R': ((-0.95, 3.0, 1.7), 'root'),
        'handlebar': (tuple(top), 'steer'), 'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'headlight': (tuple(lc + V(0, -0.4, 0)), 'steer'), 'taillight': ((0, 6.62, 4.5), 'root'), 'beacon': ((0, 5.4, 5.45), 'opt_beacon'),
        'exhaust': ((-0.7, 3.35, 1.05), 'root'), 'wheel_front': (tuple(FA), 'wheel_front'), 'wheel_rear': (tuple(RA), 'wheel_rear'),
    })
    A.meta.update({'steerAxis': [round(c, 4) for c in AXs]})
    A.preview = {'shots': [{'view': {'az': -55, 'el': 14, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': 90, 'el': 3, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#b82a2a'}, 'hide': ['opt_beacon']}, {'colours': {'paint': '#2a4a9a'}, 'hide': ['opt_beacon']},
                                       {'colours': {'paint': '#3a7a4a'}, 'hide': ['opt_beacon']}, {'colours': {'paint': '#b82a2a'}}],
                              'view': {'az': -130, 'el': 16, 'fov': 30}, 'night': {'az': -30, 'el': 10, 'fov': 30}}}


@kit.asset('chetak', 'vehicle', vehicleTypes=['chetak', 'family_chetak'], length=17.0, width=7.0, wheelR=1.85, height=8.0,
           wheels={'wheel_front': 1.85, 'wheel_rear': 1.85}, tintSrc={'paint': 'color'}, riders=moto_rider('scooter'),
           lamps={'head': ['headlight'], 'tail': ['taillight']}, open=True, fps='bars')
def chetak(A):
    """Bajaj Chetak (the family scooter, 2-stroke, kick-started tilted on its side): the broad curved
    leg shield with the chrome horn cover and a 'CHETAK' badge, the bulbous side cowls (engine on the
    right with its vents), a flat floorboard with rubber strips, the long dual seat, the round
    headlamp in the handlebar casting, the bulbous front fender on the single-sided link, 10-inch
    split rims and the spare wheel upright at the back with the number painted on its cover.
    Paint = v.color (powder blue, beige, maroon, sage, white, blue). 17 u long."""
    P = vk.palette()
    BODY = vk.paint('chetak_body', '#86b9c9', region=vk.R_PAINT, rough=0.3, chips=0.2, under='#8a8d90', grime=0.38, dirt='#4a4236')
    FLOOR = vk.mat('rubber', 'floor_rubber', base='#232325', rough=0.92, grain=0.12, grime=0.55, dirt='#5a5040')
    R = 1.85
    FA, RA = V(0, -5.35, R), V(0, 5.2, R)
    S0 = V(0, -3.05, 6.05)
    AXs = steer_axis(S0, FA)
    Rg = vk.VRig(A)
    Rg.bone('steer', S0, S0 + AXs * 1.5)
    Rg.bone('wheel_front', FA, parent='steer')
    Rg.bone('wheel_rear', RA)
    Rg.add('wheel_front', vk.disc_wheel('wf', tuple(FA), R, 1.0, P, side=1, seg=16, rim_m=P['steel'], cap_frac=0.32, hub_bolts=0))
    Rg.add('wheel_rear', vk.disc_wheel('wr', tuple(RA), R, 1.0, P, side=-1, seg=16, rim_m=P['steel'], cap_frac=0.0))
    b = []
    # ---------------------------------------------------------------- leg shield + horn cover + badge
    lv = [(1.35, -3.6, 1.72, 0.55), (2.5, -3.52, 1.86, 0.6), (3.6, -3.4, 1.8, 0.58), (4.6, -3.22, 1.58, 0.5), (5.4, -3.08, 1.18, 0.38), (5.9, -2.98, 0.72, 0.24)]
    ap = vk.shell('apron', vk.apron_rows(lv, n=10), BODY, thick=0.1, inside=(0, 0.0, 3.0))
    b.append(ap)
    b.append(tube('apron_edge', [V(x, y, z) for (x, y, z) in [(1.72, -3.6, 1.3), (1.86, -3.52, 2.5), (1.8, -3.4, 3.6), (1.58, -3.22, 4.6), (1.18, -3.08, 5.4), (0.72, -2.98, 5.9)]] +
                     [V(-x, y, z) for (x, y, z) in reversed([(1.72, -3.6, 1.3), (1.86, -3.52, 2.5), (1.8, -3.4, 3.6), (1.58, -3.22, 4.6), (1.18, -3.08, 5.4), (0.72, -2.98, 5.9)])],
                     0.065, seg=4, mat=P['chrome']))
    hc = vk.loft_y('horn_cover', [(-3.9, 0.3, 4.3, 4.6, 2.2), (-3.72, 0.42, 4.2, 5.15, 2.4), (-3.5, 0.3, 4.3, 5.25, 2.2)], P['chrome'], seg=10)
    b.append(hc)
    for k in range(4):
        b.append(vk.rbox('horn_slot', (0.4, 0.06, 0.05), (0, -3.95 + k * 0.03, 4.45 + k * 0.17), P['dark'], bevel=0.0))
    b.append(vk.decal('sign_badge', 'CHETAK', 1.5, 0.36, (0, -4.16, 2.75), '-Y', fg='#1c1c20', bg='#c9ccd0', px=256, font=vk.FONT_SERIF))
    for sx in (1, -1):
        b += vk.lens_box('ind_f', (0.36, 0.16, 0.24), (sx * 1.25, -3.62, 5.0), P['amber'])
    # ---------------------------------------------------------------- floor + strips
    b.append(vk.plan_prism('floor', [(1.62, -3.45), (1.62, 0.9), (-1.62, 0.9), (-1.62, -3.45)], 0.85, 1.32, BODY, bevel=0.1, seg=1))
    for k in range(4):
        x = -1.05 + k * 0.7
        b.append(vk.rbox('floor_strip', (0.22, 4.1, 0.08), (x, -1.3, 1.36), FLOOR, bevel=0.0))
    b.append(tube('floor_trim', [V(1.64, -3.4, 1.3), V(1.64, 0.88, 1.3)], 0.05, seg=4, mat=P['chrome']))
    b.append(tube('floor_trim', [V(-1.64, -3.4, 1.3), V(-1.64, 0.88, 1.3)], 0.05, seg=4, mat=P['chrome']))
    # ---------------------------------------------------------------- rear body (open U over the wheel) + bulbous side cowls
    st = [(0.7, 1.15, 1.0, 1.9, 0.5), (1.4, 1.22, 1.0, 3.2, 1.1), (2.4, 1.1, 2.0, 3.9, 0.95), (3.8, 0.98, 3.0, 4.15, 0.62),
          (5.3, 0.92, 3.35, 4.2, 0.55), (6.6, 0.78, 3.4, 4.12, 0.5), (7.25, 0.45, 3.5, 4.0, 0.35)]
    rows = [vk.u_row(y, hw, zs, zc, hh, p=2.6, n=8) for (y, hw, zs, zc, hh) in st]
    b.append(vk.shell('rear_body', rows, BODY, thick=0.1, inside=(0, 4.0, 1.0)))
    for sx in (1, -1):
        cs = [(1.55, 0.22, 2.3, 3.1, 2.2, sx * 1.12), (2.2, 0.58, 1.5, 3.95, 2.4, sx * 1.3), (3.4, 0.76, 1.22, 4.25, 2.4, sx * 1.42),
              (4.9, 0.76, 1.3, 4.25, 2.4, sx * 1.44), (6.1, 0.6, 1.75, 4.05, 2.3, sx * 1.34), (6.9, 0.24, 2.5, 3.6, 2.2, sx * 1.14)]
        b.append(vk.loft_y('cowl', cs, BODY, seg=12))
        b.append(tube('cowl_trim', [V(sx * 1.3, 2.15, 3.05), V(sx * 2.0, 3.4, 3.2), V(sx * 2.08, 4.9, 3.25), V(sx * 1.85, 6.1, 3.15), V(sx * 1.4, 6.8, 3.0)], 0.05, seg=4, mat=P['chrome']))
        b.append(tube('cowl_seam', [V(sx * 0.75, 2.25, 4.0), V(sx * 0.95, 3.4, 4.32), V(sx * 0.98, 4.9, 4.32), V(sx * 0.9, 6.1, 4.12)], 0.035, seg=3, mat=P['dark']))
    for k in range(5):     # engine cowl vents (right)
        b.append(vk.rbox('vent', (0.08, 0.95, 0.09), (-2.12, 3.6 + k * 0.06, 2.35 + k * 0.22), P['dark'], bevel=0.0))
    # engine / gearbox under the right cowl, silencer, stands, kick lever
    b.append(vk.loft_y('engine', [(2.2, 0.35, 0.75, 1.6, 2.4, -0.7), (2.9, 0.48, 0.65, 1.95, 2.6, -0.72), (4.8, 0.42, 0.75, 1.9, 2.6, -0.72), (5.3, 0.25, 1.0, 1.75, 2.4, -0.7)], P['engine'], seg=10))
    b.append(vk.loft_y('silencer', [(3.0, 0.2, 0.55, 0.95, 2.0, 1.0), (3.4, 0.36, 0.45, 1.1, 2.2, 1.05), (5.8, 0.36, 0.55, 1.25, 2.2, 1.05), (6.3, 0.2, 0.65, 1.15, 2.0, 1.05)], P['black'], seg=8))
    b.append(tube('exhaust', [V(0.2, 2.3, 0.9), V(0.8, 2.8, 0.75), V(1.0, 3.1, 0.75)], 0.1, seg=5, mat=P['dark']))
    b.append(tube('centre_stand', [V(0.85, 1.6, 0.95), V(0.95, 2.0, 0.05), V(-0.95, 2.0, 0.05), V(-0.85, 1.6, 0.95)], 0.08, seg=4, mat=P['black']))
    b.append(tube('kick', [V(-1.25, 3.4, 1.9), V(-1.45, 2.6, 1.3)], 0.07, seg=4, mat=P['chrome']))
    # ---------------------------------------------------------------- seat, grab rail, tail lamp, spare wheel with the number on its cover
    b.append(vk.loft_y('seat', [(0.45, 0.6, 4.55, 4.85, 2.6), (0.9, 0.86, 4.5, 5.05, 3.0), (3.0, 0.95, 4.5, 5.15, 3.2), (5.6, 0.95, 4.5, 5.15, 3.2),
                                (6.5, 0.85, 4.5, 5.05, 3.0), (6.85, 0.55, 4.55, 4.88, 2.4)], P['seat_black'], seg=12))
    b.append(tube('seat_trim', [V(0.97, 0.9, 4.58), V(0.98, 6.3, 4.58), V(0, 6.9, 4.6), V(-0.98, 6.3, 4.58), V(-0.97, 0.9, 4.58)], 0.04, seg=4, mat=P['chrome']))
    b.append(tube('grab_rail', [V(1.0, 5.3, 4.5), V(1.05, 6.6, 4.62), V(0.6, 7.2, 4.66), V(-0.6, 7.2, 4.66), V(-1.05, 6.6, 4.62), V(-1.0, 5.3, 4.5)], 0.075, seg=6, mat=P['chrome']))
    b += vk.lens_box('tail', (0.85, 0.22, 0.42), (0, 7.42, 4.18), P['tail_lens'], bezel_m=P['chrome'], facing='+Y')
    sp = V(0, 7.62, 2.55)
    spr = vk.disc_wheel('spare', (0, 0, 0), 1.55, 0.9, P, side=1, seg=14, rim_m=P['steel'], cap_frac=0.0)
    cov = kit.cylinder('spare_cover', 1.32, 0.12, (0, 0, 0), seg=14, mat=vk.paint('spare_cover', '#1c1c20', region=0, rough=0.4, chips=0.15), axis='X', base=False)
    for o in spr + [cov]:
        o.location = (0.45, 0, 0) if o is cov else (0, 0, 0)
        kit.apply_transform(o)
        vk.rotate_about(o, (0, 0, 0), (0, 0, math.radians(90)))
        o.data.transform(Matrix.Translation(sp))
    b += spr + [cov]
    b.append(vk.plate('plate_rear', 'AP 09 C 1156', 1.7, 0.55, tuple(sp + V(0, 0.55, 0.0)), '+Y', bg='#f4f2ea', fg='#141414', px=128))
    b.append(tube('spare_bracket', [V(0.4, 6.9, 3.6), V(0.3, 7.5, 3.4)], 0.07, seg=4, mat=P['black']))
    b.append(tube('spare_bracket', [V(-0.4, 6.9, 3.6), V(-0.3, 7.5, 3.4)], 0.07, seg=4, mat=P['black']))
    Rg.add('root', b)
    # ---------------------------------------------------------------- steering: link arm, fender, handlebar casting + lamp nacelle
    s = []
    col_bot = S0 + AXs * 3.0
    s.append(tube('column', [S0 + AXs * 0.6, col_bot], 0.14, seg=6, mat=P['black']))
    s.append(tube('link_arm', [col_bot + V(0.55, 0, 0), FA + V(0.62, -0.25, 0.55), FA + V(0.62, 0.0, 0.0)], 0.16, seg=6, mat=P['black']))
    s.append(vk.disc_x('brake_drum', tuple(FA + V(0.55, 0, 0)), 0.75, 0.18, P['alu'], seg=12))
    fe = vk.mudguard('fender', tuple(FA), R, math.radians(-30), math.radians(125), BODY, w=1.45, gap=0.25, thick=0.09, n=9, p=3.0)
    s.append(fe)
    s.append(vk.loft_y('fender_crest', [(-6.7, 0.12, 2.2, 2.6, 2.0), (-5.6, 0.18, 3.65, 4.25, 2.2), (-4.4, 0.12, 3.75, 4.15, 2.0)], P['chrome'], seg=8))
    hb = S0 + V(0, -0.15, 0.45)
    cast = loft('bar_casting', [dict(c=tuple(hb + V(1.75, 0.55, -0.05)), r=(0.14, 0.13), p=2.2), dict(c=tuple(hb + V(1.0, 0.25, 0.0)), r=(0.2, 0.18), p=2.4),
                                dict(c=tuple(hb + V(0.4, 0.05, 0.05)), r=(0.38, 0.28), p=2.6), dict(c=tuple(hb + V(-0.4, 0.05, 0.05)), r=(0.38, 0.28), p=2.6),
                                dict(c=tuple(hb + V(-1.0, 0.25, 0.0)), r=(0.2, 0.18), p=2.4), dict(c=tuple(hb + V(-1.75, 0.55, -0.05)), r=(0.14, 0.13), p=2.2)],
                seg=10, side=(0, 0, 1), mat=BODY)
    s.append(cast)
    s.append(vk.loft_y('nacelle', [(hb.y - 0.95, 0.58, hb.z - 0.55, hb.z + 0.5, 2.4), (hb.y - 0.6, 0.66, hb.z - 0.6, hb.z + 0.55, 2.4), (hb.y + 0.2, 0.5, hb.z - 0.35, hb.z + 0.4, 2.4)], BODY, seg=12))
    s += vk.lamp_round('head', tuple(hb + V(0, -0.98, 0.0)), 0.48, 0.2, P, facing=(0, -1, 0.03), seg=12)
    s.append(vk.cyl_between('speedo', tuple(hb + V(0, 0.05, 0.3)), tuple(hb + V(0, 0.12, 0.42)), 0.28, seg=10, m=P['chrome']))
    s.append(vk.cyl_between('speedo_face', tuple(hb + V(0, 0.12, 0.42)), tuple(hb + V(0, 0.13, 0.44)), 0.24, seg=10, m=vk.mat('lamp_lens', 'speedo_dial', base='#e8e4d6', rough=0.2), cap=True))
    grips = {}
    for sx, S in ((1, 'L'), (-1, 'R')):
        g0, g1 = hb + V(sx * 1.75, 0.55, -0.05), hb + V(sx * 2.45, 0.85, -0.1)
        s.append(tube('grip', [g0, g1], 0.15, seg=7, mat=P['plastic'], cap=True))
        grips[S] = g0.lerp(g1, 0.5)
        s.append(tube('lever', [hb + V(sx * 1.45, 0.25, 0.05), hb + V(sx * 2.25, 0.5, 0.0)], 0.045, seg=4, mat=P['chrome']))
    s += vk.mirrors('mirror', [tuple(hb + V(1.2, 0.35, 0.15))], 1.05, 0.3, 0.32, P)
    Rg.add('steer', s)
    arm, ob = Rg.build(tex=512, orm=128, emit=128, ao_samples=20, albedo_samples=6, ao_strength=0.7, ao_dist=1.7,
                       boost={'sign_': 2.4, 'plate': 1.8, 'head_lens': 1.4, 'tail_lens': 1.4})
    anchors_from(A, arm, {
        'seat_driver': ((0, 1.7, 5.15), 'root'), 'seat_pillion': ((0, 4.6, 5.2), 'root'),
        'foot_L': ((0.75, -1.7, 1.42), 'root'), 'foot_R': ((-0.75, -1.7, 1.42), 'root'),
        'foot_pillion_L': ((1.35, 0.4, 1.42), 'root'), 'foot_pillion_R': ((-1.35, 0.4, 1.42), 'root'),
        'handlebar': (tuple(hb), 'steer'), 'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'headlight': (tuple(hb + V(0, -1.2, 0)), 'steer'), 'taillight': ((0, 7.55, 4.18), 'root'),
        'indicator_FL': ((1.25, -3.72, 5.0), 'root'), 'indicator_FR': ((-1.25, -3.72, 5.0), 'root'),
        'exhaust': ((1.05, 6.35, 0.9), 'root'), 'wheel_front': (tuple(FA), 'wheel_front'), 'wheel_rear': (tuple(RA), 'wheel_rear'), 'spare': (tuple(sp), 'root'),
    })
    A.meta.update({'steerAxis': [round(c, 4) for c in AXs]})
    A.preview = {'shots': [{'view': {'az': -55, 'el': 14, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': 90, 'el': 3, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#86b9c9'}}, {'colours': {'paint': '#ddd2b2'}}, {'colours': {'paint': '#b9483b'}}, {'colours': {'paint': '#6f8d68'}}],
                              'view': {'az': -135, 'el': 16, 'fov': 30}, 'night': {'az': -30, 'el': 10, 'fov': 30}}}


@kit.asset('rx100', 'vehicle', vehicleTypes=['rx100', 'bunty_rx100'], length=18.0, width=6.0, wheelR=2.55, height=8.0,
           wheels={'wheel_front': 2.5, 'wheel_rear': 2.55}, tintSrc={'paint': 'color'}, riders=moto_rider('moto'),
           lamps={'head': ['headlight'], 'tail': ['taillight']}, open=True, fps='bars')
def rx100(A):
    """Yamaha RX100 (the college legend, two-stroke): the teardrop tank in paint (v.color: black,
    cherry red, blue, maroon) with a chrome cap and a pinstripe, black side panels with 'RX 100' in
    plain letters, the finned air-cooled cylinder over the alloy crankcase, the chrome expansion pipe
    and silencer on the right, chrome mudguards, the round chrome headlamp and twin clocks, a flat
    black seat with the chrome grab rail, spring-over shocks, spoked 18-inch wheels. 18 u long."""
    P = vk.palette()
    TANK = vk.paint('rx_tank', '#1c1c22', region=vk.R_PAINT, rough=0.22, chips=0.12, under='#7a7d80', grime=0.25, dirt='#3a342c')
    FRAME = vk.paint('rx_frame', '#151517', region=0, rough=0.45, chips=0.15, under='#6a6d72', grime=0.35)
    R = 2.5
    FA, RA = V(0, -5.95, R), V(0, 5.85, 2.55)
    S0 = V(0, -4.1, 6.3)
    AXs = steer_axis(S0, FA)
    Rg = vk.VRig(A)
    Rg.bone('steer', S0, S0 + AXs * 1.5)
    Rg.bone('wheel_front', FA, parent='steer')
    Rg.bone('wheel_rear', RA)
    M = {'tyre': P['tyre'], 'chrome': P['chrome'], 'steel': P['steel'], 'rubber': P['rubber'], 'dark': P['dark']}
    Rg.add('wheel_front', vk.spoke_wheel('wf', tuple(FA), R, M, spokes=28, seg=20, tyre_w=0.55, rim_d=0.32, hub_w=0.7))
    Rg.add('wheel_rear', vk.spoke_wheel('wr', tuple(RA), 2.55, M, spokes=28, seg=20, tyre_w=0.66, rim_d=0.32, hub_w=0.8))
    b = []
    # ---------------------------------------------------------------- frame: backbone, cradle, seat rails, swing arm
    b.append(tube('head_tube', [S0 + V(0, 0, 0.1), S0 + AXs * 1.2], 0.2, seg=8, mat=FRAME))
    b.append(tube('backbone', [S0 + AXs * 0.25, V(0, -1.5, 5.3), V(0, 1.2, 4.65)], 0.17, seg=6, mat=FRAME))
    b.append(tube('down_tube', [S0 + AXs * 0.9, V(0, -3.2, 3.0), V(0, -2.5, 1.35), V(0, 0.9, 1.25), V(0, 1.6, 2.6), V(0, 1.2, 4.65)], 0.15, seg=6, mat=FRAME))
    for sx in (1, -1):
        b.append(tube('seat_rail', [V(sx * 0.42, 1.2, 4.6), V(sx * 0.48, 5.2, 4.75), V(sx * 0.32, 6.9, 4.8)], 0.09, seg=5, mat=FRAME))
        b.append(tube('swing_arm', [V(sx * 0.42, 1.7, 2.55), V(sx * 0.48, RA.y, RA.z)], 0.13, seg=6, mat=FRAME))
        b.append(tube('shock', [V(sx * 0.6, 4.35, 4.75), V(sx * 0.52, RA.y - 0.35, RA.z + 0.45)], 0.1, seg=5, mat=P['chrome']))
        b.append(vk.spring('shock_spring', (sx * 0.6, 4.45, 4.5), (sx * 0.54, RA.y - 0.45, RA.z + 0.75), 0.2, 3, P['chrome'], wire=0.045))
        b.append(vk.rbox('footpeg', (0.62, 0.22, 0.2), (sx * 1.05, 0.15, 2.0), P['rubber'], bevel=0.0))
        b.append(vk.rbox('pillion_peg', (0.5, 0.2, 0.16), (sx * 0.95, 3.0, 2.55), P['rubber'], bevel=0.0))
    # ---------------------------------------------------------------- tank, side panels, seat, tail, rear mudguard
    b.append(vk.loft_y('tank', [(-4.0, 0.42, 5.45, 6.25, 2.2), (-3.5, 0.82, 5.0, 6.6, 2.5), (-2.0, 0.98, 4.95, 6.62, 2.6), (-0.6, 0.86, 5.0, 6.32, 2.5), (0.4, 0.5, 5.15, 5.85, 2.2)], TANK, seg=14))
    b.append(vk.cyl_between('tank_cap', (0, -2.6, 6.55), (0, -2.6, 6.72), 0.3, seg=10, m=P['chrome']))
    for sx in (1, -1):
        b.append(tube('tank_stripe', [V(sx * 0.83, -3.5, 5.85), V(sx * 0.99, -2.0, 5.8), V(sx * 0.86, -0.6, 5.62)], 0.03, seg=3, mat=vk.mat('gold_leaf', 'pinstripe', base='#c8a040')))
        b.append(vk.loft_y('side_panel', [(0.8, 0.12, 3.3, 4.6, 2.2, sx * 0.62), (1.4, 0.2, 3.1, 4.75, 2.4, sx * 0.68), (2.9, 0.2, 3.4, 4.75, 2.4, sx * 0.68), (3.3, 0.1, 3.7, 4.6, 2.2, sx * 0.62)], FRAME, seg=8))
        b.append(vk.decal('sign_rx', 'RX 100', 1.6, 0.42, (sx * 0.9, 2.15, 4.05), '+X' if sx > 0 else '-X', fg='#ece8de', bg='#151517', px=256, font=vk.FONT_BOLD))
    b.append(vk.loft_y('seat', [(0.1, 0.45, 5.0, 5.4, 2.4), (0.6, 0.78, 4.85, 5.55, 3.0), (3.5, 0.8, 4.85, 5.6, 3.2), (5.6, 0.72, 4.85, 5.55, 3.0), (6.2, 0.45, 4.9, 5.35, 2.4)], P['seat_black'], seg=12))
    b.append(tube('grab_rail', [V(0.7, 4.3, 5.0), V(0.75, 6.2, 5.05), V(0.4, 6.75, 5.08), V(-0.4, 6.75, 5.08), V(-0.75, 6.2, 5.05), V(-0.7, 4.3, 5.0)], 0.07, seg=6, mat=P['chrome']))
    b.append(vk.loft_y('tail_cowl', [(5.6, 0.62, 4.45, 4.9, 2.4), (6.6, 0.55, 4.4, 4.92, 2.4), (7.2, 0.35, 4.45, 4.85, 2.2)], FRAME, seg=10))
    b += vk.lens_box('tail', (0.8, 0.22, 0.42), (0, 7.32, 4.6), P['tail_lens'], bezel_m=P['chrome'], facing='+Y')
    for sx in (1, -1):
        b.append(tube('ind_stalk', [V(sx * 0.35, 7.0, 4.3), V(sx * 0.9, 7.1, 4.3)], 0.04, seg=4, mat=P['black']))
        b += vk.lens_box('ind_r', (0.3, 0.3, 0.22), (sx * 1.0, 7.12, 4.3), P['amber'])
    b.append(vk.mudguard('guard_rear', tuple(RA), 2.55, math.radians(55), math.radians(165), P['chrome'], w=0.75, gap=0.22, thick=0.05, n=8))
    b.append(vk.plate('plate_rear', 'AP 10 B 4321', 1.6, 0.55, (0, 7.75, 3.65), '+Y', bg='#f4f2ea', fg='#141414', px=128))
    # ---------------------------------------------------------------- engine: alloy crankcase, finned cylinder, covers, kick, chain
    b.append(vk.loft_y('crankcase', [(-1.6, 0.45, 1.35, 2.5, 2.4), (-1.2, 0.58, 1.15, 2.85, 2.6), (1.0, 0.58, 1.2, 2.9, 2.6), (1.6, 0.42, 1.5, 2.65, 2.4)], P['engine'], seg=10))
    b.append(vk.disc_x('clutch_cover', (-0.62, -0.4, 2.0), 0.72, 0.12, P['alu'], seg=12))
    b.append(vk.disc_x('magneto', (0.62, -0.5, 2.05), 0.62, 0.12, P['alu'], seg=12))
    for k in range(6):
        fz = 2.85 + k * 0.24
        fy = -1.2 - 0.8 * (fz - 2.6) / 1.75          # on the cylinder axis (forward-slanted)
        f = vk.rbox('fin', (1.05 - k * 0.03, 0.95 - k * 0.04, 0.08), (0, fy, fz), P['engine'], bevel=0.0)
        b.append(vk.rotate_about(f, (0, fy, fz), (math.radians(-24.5), 0, 0)))
    b.append(vk.cyl_between('cylinder', (0, -1.2, 2.6), (0, -2.0, 4.35), 0.36, seg=8, m=P['engine']))
    b.append(tube('kick', [V(-0.75, 0.9, 2.5), V(-0.95, 0.0, 1.85)], 0.07, seg=4, mat=P['chrome']))
    b.append(tube('chain_top', [V(0.62, 0.9, 2.4), V(0.62, RA.y, RA.z + 0.42)], 0.045, seg=3, mat=P['steel']))
    b.append(tube('chain_bot', [V(0.62, 0.9, 1.85), V(0.62, RA.y, RA.z - 0.42)], 0.045, seg=3, mat=P['steel']))
    b.append(tube('side_stand', [V(0.75, 0.9, 1.4), V(1.6, 1.8, 0.06)], 0.07, seg=4, mat=P['black']))
    # chrome exhaust: header down from the cylinder, under the engine, expansion chamber + silencer on the right
    b.append(tube('header', [V(-0.1, -2.1, 3.35), V(-0.35, -2.75, 2.6), V(-0.55, -2.6, 1.3), V(-0.75, -1.0, 1.05), V(-0.88, 0.8, 1.2)], 0.17, seg=7, mat=P['chrome']))
    b.append(vk.loft_y('silencer', [(0.6, 0.18, 1.0, 1.36, 2.0, -0.9), (1.3, 0.34, 0.95, 1.62, 2.2, -0.92), (5.6, 0.34, 1.75, 2.42, 2.2, -0.96), (6.7, 0.24, 2.05, 2.5, 2.0, -0.96)], P['chrome'], seg=10))
    b.append(vk.loft_y('heat_shield', [(1.6, 0.12, 1.65, 1.85, 2.0, -1.24), (3.8, 0.12, 1.95, 2.15, 2.0, -1.28)], P['black'], seg=6))
    Rg.add('root', b)
    # ---------------------------------------------------------------- steering: forks + gaiters, chrome fender, headlamp, clocks, bars
    s = []
    crown = S0 + AXs * 1.3
    top_crown = S0 - AXs * 0.25
    s.append(vk.rbox('crown_low', (1.1, 0.5, 0.2), tuple(crown), P['chrome'], bevel=0.0))
    s.append(vk.rbox('crown_top', (1.1, 0.5, 0.18), tuple(top_crown), P['steel'], bevel=0.0))
    s += vk.tele_fork('fork', top_crown, FA, AXs, 0.45, 0.13, P['chrome'], lower_m=P['alu'], lower_r=0.17, split=0.6)
    for sx in (1, -1):
        s.append(vk.cyl_between('gaiter', tuple(crown + V(sx * 0.45, 0, 0) + AXs * 0.1), tuple(crown + V(sx * 0.45, 0, 0) + AXs * 1.1), 0.19, seg=8, m=P['rubber']))
    s.append(vk.mudguard('guard_front', tuple(FA), R, math.radians(-12), math.radians(115), P['chrome'], w=0.72, gap=0.22, thick=0.05, n=8))
    s.append(vk.disc_x('brake_drum', tuple(FA + V(0.4, 0, 0)), 0.75, 0.2, P['alu'], seg=12))
    lc = S0 + V(0, -1.05, -0.35)
    s += vk.lamp_round('head', tuple(lc), 0.62, 0.7, P, facing=(0, -1, 0.04), seg=14)
    for sx in (1, -1):
        s.append(tube('lamp_ear', [lc + V(sx * 0.62, 0.35, 0), top_crown + V(sx * 0.45, -0.1, -0.25)], 0.06, seg=4, mat=P['chrome']))
        s.append(tube('ind_f_stalk', [lc + V(sx * 0.55, 0.2, -0.3), lc + V(sx * 1.1, 0.25, -0.3)], 0.04, seg=4, mat=P['black']))
        s += vk.lens_box('ind_f', (0.3, 0.3, 0.22), tuple(lc + V(sx * 1.2, 0.22, -0.3)), P['amber'])
        s.append(vk.cyl_between('clock', tuple(top_crown + V(sx * 0.42, 0.05, 0.12)), tuple(top_crown + V(sx * 0.42, 0.2, 0.55)), 0.3, seg=10, m=P['black']))
        s.append(vk.cyl_between('clock_face', tuple(top_crown + V(sx * 0.42, 0.2, 0.55)), tuple(top_crown + V(sx * 0.42, 0.21, 0.57)), 0.25, seg=10, m=vk.mat('lamp_lens', 'clock_dial', base='#e8e4d6', rough=0.2)))
    bars, grips = vk.moto_bars('bar', tuple(top_crown + V(0, 0.2, 0.15)), [(0.5, 0.0, 0.18), (1.2, 0.25, 0.3), (1.85, 0.62, 0.25)], 0.7, P, r=0.09, grip_r=0.16)
    s += bars
    s += vk.mirrors('mirror', [tuple(top_crown + V(1.0, 0.35, 0.35)), tuple(top_crown + V(-1.0, 0.35, 0.35))], 1.0, 0.3, 0.3, P)
    Rg.add('steer', s)
    arm, ob = Rg.build(tex=512, orm=128, emit=128, ao_samples=20, albedo_samples=6, ao_strength=0.7, ao_dist=1.6,
                       boost={'sign_': 2.4, 'plate': 1.8, 'head_lens': 1.4, 'tail_lens': 1.4})
    anchors_from(A, arm, {
        'seat_driver': ((0, 1.35, 5.55), 'root'), 'seat_pillion': ((0, 4.3, 5.6), 'root'),
        'foot_L': ((1.05, 0.15, 2.12), 'root'), 'foot_R': ((-1.05, 0.15, 2.12), 'root'),
        'foot_pillion_L': ((0.95, 3.0, 2.65), 'root'), 'foot_pillion_R': ((-0.95, 3.0, 2.65), 'root'),
        'handlebar': (tuple(top_crown + V(0, 0.2, 0.15)), 'steer'), 'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'headlight': (tuple(lc + V(0, -0.75, 0)), 'steer'), 'taillight': ((0, 7.45, 4.6), 'root'),
        'indicator_FL': (tuple(lc + V(1.2, 0.0, -0.3)), 'steer'), 'indicator_FR': (tuple(lc + V(-1.2, 0.0, -0.3)), 'steer'),
        'indicator_RL': ((1.0, 7.3, 4.3), 'root'), 'indicator_RR': ((-1.0, 7.3, 4.3), 'root'),
        'exhaust': ((-0.96, 6.8, 2.28), 'root'), 'wheel_front': (tuple(FA), 'wheel_front'), 'wheel_rear': (tuple(RA), 'wheel_rear'),
    })
    A.meta.update({'steerAxis': [round(c, 4) for c in AXs]})
    A.preview = {'shots': [{'view': {'az': -55, 'el': 14, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#1c1c22'}}, {'colours': {'paint': '#a01e2a'}}, {'colours': {'paint': '#1e3c8a'}}, {'colours': {'paint': '#5a1a3a'}}],
                              'view': {'az': -130, 'el': 16, 'fov': 30}, 'night': {'az': -30, 'el': 10, 'fov': 30}}}


# =========================================================================== cars (shared builder)
CAR_RIDERS = {'driver': {'pose': 'car', 'seat': 'seat_driver', 'grips': ['grip_L', 'grip_R'], 'feet': ['foot_L', 'foot_R'], 'clips': ['drive', 'sit']},
              'passengers': [{'seat': 'seat_passenger_F', 'feet': ['foot_passenger_F'], 'hands': 'knees', 'clips': ['sit']},
                             {'seat': 'seat_passenger_RL', 'feet': ['foot_passenger_RL'], 'hands': 'knees', 'clips': ['sit']},
                             {'seat': 'seat_passenger_RR', 'feet': ['foot_passenger_RR'], 'hands': 'knees', 'clips': ['sit']}]}


def _interp_station(st, y):
    """the section parameters (hw, z0, z1, rs, rb, crown, bulge) of a station list [(y, ...)] at y"""
    if y <= st[0][0]:
        return st[0][1:]
    for a, b in zip(st, st[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / max(1e-6, b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(1, len(a)))
    return st[-1][1:]


def body_x(st, y, z):
    """half width of the car body (car_section stations) at (y, z)"""
    return vk.section_halfwidth(vk.car_section(*_interp_station(st, y)), z)


def side_line(st, pts, sx, out=0.025):
    """points [(y, z)] on the body side (x from the stations), pushed `out` off the surface"""
    return [V(sx * (body_x(st, y, z) + out), y, z) for (y, z) in pts]


def greenhouse_row(y, wb, zb, wr, zr, crown, flat=False, sill=0.32, top=0.3, edge=0.12):
    """one cabin cross-section (left belt -> sill -> window top -> roof edge -> crown -> right);
    flat=True collapses it onto the belt (windscreen / rear-window base rows)"""
    if flat:
        k = (wb - 0.5) / max(1e-3, wr)
        L = [(wb, zb), (wb - 0.06, zb + 0.02), (wb - 0.25, zb + 0.03), (wb - 0.45, zb + 0.04)]
        C = [(wr * 0.55 * k, zb + 0.05), (0.0, zb + 0.06), (-wr * 0.55 * k, zb + 0.05)]
    else:
        L = [(wb, zb), (wb - (wb - wr) * 0.1, zb + sill), (wr + edge, zr - top), (wr, zr)]
        C = [(wr * 0.55, zr + crown * (1 - 0.55 ** 2)), (0.0, zr + crown), (-wr * 0.55, zr + crown * (1 - 0.55 ** 2))]
    R = [(-x, z) for (x, z) in reversed(L)]
    return [(x, y, z) for (x, z) in L + C + R]


def motor_car(A, C):
    """A classic car from a spec C (see AMBASSADOR / PADMINI / MARUTI): the lower body is a closed
    superellipse loft with wheel arches cut by booleans; the cabin is a solidified shell over rows
    [(y, kind)] where kind tells which faces are glass (windscreen 'ws', side windows 'win', pillars
    'pillar', rear window 'rw'); an interior (dash, benches, the steering wheel on its own bone, right-
    hand drive) for the glass and the first-person view; chrome or black bumpers, grille, round or
    square lamps, plates, door seams and handles, gutters, mirrors, wipers. Bones: root steer_L steer_R
    wheel_FL wheel_FR wheel_RL wheel_RR steer_wheel (+ opt_*). Tint: paint = body (v.color), paint2 =
    the cabin (v.color, or the taxi's yellow roof)."""
    P = vk.palette()
    BODY = vk.paint(A.id + '_body', C['color'], region=vk.R_PAINT, rough=0.28, chips=0.16, under='#8a8d90', grime=0.38, dirt='#4a4034', ground=2.2)
    TOP = vk.paint(A.id + '_top', C['color'], region=vk.R_PAINT2, rough=0.28, chips=0.12, under='#8a8d90', grime=0.3, dirt='#4a4034')
    GLASS = vk.mat('glass', 'glass', base='#3c4a52', rough=0.05, alpha=0.42, bake=False)
    TRIMK = vk.mat('plastic_black', 'trim_black', base='#18181a', rough=0.5, grime=0.3)
    HEAD = P['headliner']
    INT = vk.mat('cloth', 'upholstery', base=C.get('upholstery', '#6a5444'), rough=0.85, var=0.06, grain=0.06, weave=0.08, grime=0.35, dirt='#2a2018', scale=3.0)
    DASH = vk.mat('plastic_black', 'dash', base=C.get('dash', '#2a2522'), rough=0.6, grime=0.3)
    BUMP = P['chrome'] if C.get('chrome', True) else TRIMK
    st = C['stations']
    R = C['R']
    tw = C['tyre_w']
    track = C['track']
    Rg = vk.VRig(A)
    FAy, RAy = C['axles']
    W = {'FL': V(track, FAy, R), 'FR': V(-track, FAy, R), 'RL': V(track, RAy, R), 'RR': V(-track, RAy, R)}
    for S, sx in (('L', 1), ('R', -1)):
        Rg.bone('steer_' + S, W['F' + S] + V(-sx * 0.5, 0, -0.6), W['F' + S] + V(-sx * 0.5, 0, 1.4))
    for k, c in W.items():
        Rg.bone('wheel_' + k, c, parent=('steer_' + k[1]) if k[0] == 'F' else 'root')
    sw_c = V(*C['steer_wheel'])               # steering wheel centre (right-hand drive: x < 0)
    col_dir = V(0, -0.62, -0.78).normalized()
    Rg.bone('steer_wheel', sw_c, sw_c + col_dir * 1.0)
    for o in C.get('options', {}):
        Rg.bone(o, (0, 0, C['cabin']['zr'] + 0.5))
    for k, c in W.items():
        side = 1 if k[1] == 'L' else -1
        Rg.add('wheel_' + k, vk.disc_wheel('w' + k, tuple(c), R, tw, P, side=side, seg=C.get('wseg', 16), rim_m=C.get('rim_m') or P['steel'],
                                           cap_frac=C.get('cap', 0.5), cap_m=P['chrome'], hub_bolts=0))
    b = []
    # ---------------------------------------------------------------- lower body with wheel arches
    body = vk.profile_loft('body', [(row[0], vk.car_section(*row[1:])) for row in st], BODY)
    inner_x = track - tw / 2 - 0.3
    for ay in (FAy, RAy):
        # one short cutter per wheel (the floor pan between the wheels stays)
        for sx in (1, -1):
            c2 = kit.cylinder('arch_cut', R + C.get('arch_gap', 0.42), 5.0, (sx * (inner_x + 2.5), ay, R + C.get('arch_lift', 0.15)), seg=16, axis='X', base=False)
            kit.boolean(body, c2)
    # the arch walls and the underside read dark (wheel wells)
    vk.assign_faces(body, [(lambda c, n, FAy=FAy, RAy=RAy: min(abs(c.y - FAy), abs(c.y - RAy)) < R + C.get('arch_gap', 0.42) + 0.2 and inner_x - 0.05 < abs(c.x) < body_x(st, c.y, c.z) - 0.04 and c.z < R * 2 + 0.6, P['dark']),
                           (lambda c, n: n.z < -0.8, P['dark'])])
    b.append(body)
    # ---------------------------------------------------------------- cabin shell: rows + glass by (row pair, column)
    gh = C['cabin']
    rows = []
    kinds = []
    for (y, kind) in gh['rows']:
        flat = kind in ('ws0', 'rw0')
        rows.append(greenhouse_row(y, gh['wb'], gh['zb'], gh['wr'], gh['zr'], gh['crown'], flat=flat, sill=gh.get('sill', 0.32), top=gh.get('top', 0.3)))
        kinds.append(kind)
    cab = vk.shell('cabin', rows, TOP, thick=0.1, inside=(0, sum(y for (y, k) in gh['rows']) / len(gh['rows']), gh['zb'] + 1.0))
    # classify every face by the span it lies in (between which rows) and its column (by height / x)
    ys = [r[0][1] for r in rows]
    zb, zr, wr = gh['zb'], gh['zr'], gh['wr']
    sill_z = zb + gh.get('sill', 0.32)
    top_z = zr - gh.get('top', 0.3)
    span_kind = []
    for i in range(len(rows) - 1):
        span_kind.append(gh['spans'][i])

    def span_of(y):
        for i in range(len(ys) - 1):
            if ys[i] - 1e-3 <= y <= ys[i + 1] + 1e-3:
                return span_kind[i]
        return 'pillar'
    ccy = (ys[0] + ys[-1]) / 2
    cc = V(0, ccy, zb + 1.2)

    def is_glass(c, n):
        k = span_of(c.y)
        side = abs(n.x) > 0.55
        if k == 'ws' or k == 'rw':
            # the windscreen / rear window: faces facing forwards / backwards, inside the pillars
            return abs(c.x) < wr * 0.86 and c.z > zb + 0.15
        if k == 'win':
            return side and sill_z - 0.02 < c.z < top_z + 0.05
        return False

    def inner(c, n):
        return (cc - c).dot(n) > 0
    vk.assign_faces(cab, [(lambda c, n: is_glass(c, n), GLASS), (lambda c, n: inner(c, n), HEAD)])
    b.append(cab)
    # chrome window frames + rain gutters along the roof edge
    for sx in (1, -1):
        b.append(tube('gutter', [V(sx * (wr + 0.02), y, zr + 0.02) for y in ys[1:-1]], 0.05, seg=4, mat=P['chrome'] if C.get('chrome', True) else TRIMK))
        b.append(tube('belt_trim', side_line(st, [(ys[0] - 0.2, zb - 0.05), (ys[-1] + 0.2, zb - 0.05)], sx, 0.02), 0.05, seg=4, mat=P['chrome'] if C.get('chrome', True) else TRIMK))
    if C.get('side_strip'):
        y0, y1, zs = C['side_strip']
        for sx in (1, -1):
            b.append(tube('side_strip', side_line(st, [(y0 + (y1 - y0) * k / 6, zs) for k in range(7)], sx, 0.02), 0.06, seg=4, mat=P['chrome']))
    # ---------------------------------------------------------------- doors: seams (on the body side) + handles
    for sx in (1, -1):
        for (y, z0, z1) in C.get('seams', []):
            b.append(tube('seam', side_line(st, [(y, z0), (y, (z0 + z1) / 2), (y, z1)], sx, 0.015), 0.035, seg=3, mat=P['dark']))
        for (y, z) in C.get('handles', []):
            b.append(vk.rbox('handle', (0.14, 0.75, 0.16), (sx * (body_x(st, y, z) + 0.06), y, z), P['chrome'], bevel=0.0))
    # ---------------------------------------------------------------- front: grille, lamps, bumper, plate
    fy = st[0][0]
    for part in C['front'](P, BUMP, TRIMK):
        b.append(part)
    for part in C['rear'](P, BUMP, TRIMK):
        b.append(part)
    # mirrors, wipers
    for sx in (1, -1):
        mb = V(sx * (gh['wb'] + 0.05), ys[0] + 0.6, zb + 0.35)
        b += vk.mirrors('mirror', [tuple(mb)], 0.45, 0.35, 0.36, P, stalk_m=P['chrome'] if C.get('chrome', True) else TRIMK)
    for k in range(2):
        x0 = 1.8 - k * 3.4
        b.append(tube('wiper', [V(x0, ys[0] + 0.15, zb + 0.12), V(x0 - 1.8, ys[0] + 0.9, zb + 1.1)], 0.045, seg=3, mat=TRIMK))
    # ---------------------------------------------------------------- interior: floor, dash, benches, column
    fl = C['floor_z']
    b.append(vk.plan_prism('cabin_floor', [(gh['wb'] - 0.4, ys[0] + 0.5), (gh['wb'] - 0.4, ys[-1] - 0.6), (-gh['wb'] + 0.4, ys[-1] - 0.6), (-gh['wb'] + 0.4, ys[0] + 0.5)], fl - 0.1, fl, vk.mat('rubber', 'floor_mat', base='#2a2624', rough=0.95, grime=0.5)))
    dy = C['dash_y']
    b.append(vk.rbox('dash', (2 * gh['wb'] - 0.6, 1.3, 1.0), (0, dy, zb + 0.15), DASH, bevel=0.15))
    b.append(vk.rbox('dash_panel', (2.0, 0.08, 0.6), (sw_c.x, dy + 0.66, zb + 0.15), vk.mat('lamp_lens', 'gauges', base='#d8d4c4', rough=0.3), bevel=0.0))
    for (y0, y1, z, back) in C['benches']:
        b.append(vk.seat_pad('bench', -gh['wb'] + 0.6, gh['wb'] - 0.6, y0, y1, fl, z, INT, crown=0.12, seg=1))
        bk = vk.seat_pad('bench_back', -gh['wb'] + 0.6, gh['wb'] - 0.6, y1 - 0.15, y1 + 0.55, z - 0.1, back, INT, crown=0.0, bevel=0.15, seg=1)
        b.append(vk.rotate_about(bk, (0, y1, z), (math.radians(-10), 0, 0)))
    b.append(tube('column', [sw_c + col_dir * 0.2, sw_c + col_dir * 2.3], 0.13, seg=6, mat=DASH))
    # ---------------------------------------------------------------- the steering wheel (own bone, turns with the steering)
    swp = []
    rim = []
    u = V(1, 0, 0)
    v = col_dir.cross(u).normalized()
    for i in range(13):
        a = 2 * math.pi * i / 12
        rim.append(sw_c + (u * math.cos(a) + v * math.sin(a)) * C.get('wheel_r', 1.1))
    swp.append(tube('steer_rim', rim, 0.1, seg=5, mat=TRIMK, cap=False))
    for a in (math.pi * 0.5, math.pi * 1.17, math.pi * 1.83):
        swp.append(tube('steer_spoke', [sw_c, sw_c + (u * math.cos(a) + v * math.sin(a)) * C.get('wheel_r', 1.1)], 0.07, seg=4, mat=TRIMK))
    swp.append(vk.cyl_between('steer_hub', tuple(sw_c - col_dir * 0.05), tuple(sw_c + col_dir * 0.2), 0.3, seg=8, m=P['chrome']))
    Rg.add('steer_wheel', swp)
    Rg.add('root', b)
    # options (taxi carrier, beacon...)
    for o, fn in C.get('options', {}).items():
        Rg.add(o, fn(P))
    arm, ob = Rg.build(tex=C.get('tex', 512), orm=128, emit=128, ao_samples=22, albedo_samples=6, ao_strength=0.72, ao_dist=2.6,
                       boost={'sign_': 2.4, 'plate': 2.0, 'head_lens': 1.3, 'tail_lens': 1.3})
    # ---------------------------------------------------------------- anchors (rider seating for the runtime's IK)
    gl = sw_c + (u * math.cos(math.pi * 0.82) + v * math.sin(math.pi * 0.82)) * C.get('wheel_r', 1.1)
    gr = sw_c + (u * math.cos(math.pi * 0.18) + v * math.sin(math.pi * 0.18)) * C.get('wheel_r', 1.1)
    by, bz = C['benches'][0][0], C['benches'][0][2]
    ry, rz = C['benches'][-1][0], C['benches'][-1][2]
    sy = (C['benches'][0][0] + C['benches'][0][1]) / 2 + 0.2
    ry2 = (C['benches'][-1][0] + C['benches'][-1][1]) / 2 + 0.2
    an = {
        'seat_driver': ((sw_c.x, sy, bz + 0.1), 'root'), 'grip_L': (tuple(gl), 'steer_wheel'), 'grip_R': (tuple(gr), 'steer_wheel'),
        'handlebar': (tuple(sw_c), 'steer_wheel'),
        'foot_L': ((sw_c.x + 0.55, dy + 1.3, fl + 0.05), 'root'), 'foot_R': ((sw_c.x - 0.55, dy + 1.3, fl + 0.05), 'root'),
        'seat_passenger_F': ((-sw_c.x, sy, bz + 0.1), 'root'), 'foot_passenger_F': ((-sw_c.x, dy + 1.4, fl + 0.05), 'root'),
        'seat_passenger_RL': ((2.6, ry2, rz + 0.1), 'root'), 'foot_passenger_RL': ((2.6, by - 0.3, fl + 0.05), 'root'),
        'seat_passenger_RR': ((-2.6, ry2, rz + 0.1), 'root'), 'foot_passenger_RR': ((-2.6, by - 0.3, fl + 0.05), 'root'),
        'eye_driver': ((sw_c.x, sy + 0.4, zb + 2.55), 'root'),
    }
    for k, c in W.items():
        an['wheel_' + k] = (tuple(c), 'wheel_' + k)
    for k, (loc, bone) in C['lamps_at'].items():
        an[k] = (loc, bone)
    anchors_from(A, arm, an)
    A.meta.update({'steerBones': {'steer_L': {'axis': [0, 0, 1], 'k': 1.0}, 'steer_R': {'axis': [0, 0, 1], 'k': 1.0}, 'steer_wheel': {'axis': [round(c, 4) for c in col_dir], 'k': -C.get('wheel_ratio', 2.6)}},
                   'wheels': {'wheel_' + k: R for k in W}, 'wheelR': R, 'cockpit': {'eye': [round(sw_c.x, 3), round(sy + 0.4, 3), round(zb + 2.55, 3)]}})
    return arm, ob


def bumper_bar(name, y, z, hw, h, d, wrap, m, sgn=-1, n=7):
    """a bumper across X at y (front: sgn -1), section h tall x d deep, its ends wrapping back by `wrap`"""
    rings = []
    for i in range(n + 1):
        x = -hw + 2 * hw * i / n
        u = abs(x) / hw
        rings.append(dict(c=(x, y - sgn * wrap * u ** 4, z), r=(h / 2, d / 2), p=2.6))
    return loft(name, rings, seg=8, side=(0, 0, 1), mat=m, cap_start=True, cap_end=True)


def plate_txt(seed):
    return seed


def option_beacon(P, roof_z, y=0.6):
    """a government red dome beacon on a chrome base"""
    return [vk.cyl_between('beacon_base', (0, y, roof_z - 0.05), (0, y, roof_z + 0.18), 0.62, seg=10, m=P['chrome']),
            vk.xform(kit.lathe('beacon_dome', [(0.5, 0.0), (0.5, 0.35), (0.38, 0.62), (0.0, 0.72)], seg=10, mat=P['beacon']), loc=(0, y, roof_z + 0.18))]


def option_carrier(P, roof_z, y0, y1, hw, cloth='#5a6a5a'):
    """a taxi's chrome roof carrier with a tarp-covered luggage bundle"""
    parts = []
    z = roof_z + 0.55
    for sx in (1, -1):
        parts.append(tube('rack_rail', [V(sx * hw, y0, z), V(sx * hw, y1, z)], 0.07, seg=5, mat=P['chrome']))
        for y in (y0 + 0.3, y1 - 0.3):
            parts.append(tube('rack_foot', [V(sx * hw, y, z), V(sx * (hw + 0.15), y, roof_z - 0.05)], 0.06, seg=4, mat=P['chrome']))
    for k in range(4):
        y = y0 + (y1 - y0) * (k + 0.5) / 4
        parts.append(tube('rack_slat', [V(hw, y, z - 0.02), V(-hw, y, z - 0.02)], 0.05, seg=4, mat=P['chrome']))
    tarp = vk.mat('cloth', 'tarp', base=cloth, rough=0.95, var=0.1, grain=0.1, weave=0.1, grime=0.5, dirt='#3a3428', scale=2.0)
    parts.append(vk.seat_pad('bundle', -hw + 0.4, hw * 0.4, y0 + 0.5, y1 - 1.2, z, z + 1.25, tarp, crown=0.35, seg=1, bevel=0.3))
    rope = vk.mat('cloth', 'rope', base='#c8b890', rough=0.9, weave=0.1, scale=6.0)
    for y in (y0 + 1.5, y1 - 2.4):
        parts.append(tube('rope', [V(-hw + 0.35, y, z + 0.05), V(-hw + 0.4, y, z + 1.3), V(hw * 0.4, y, z + 1.3), V(hw * 0.42, y, z + 0.05)], 0.05, seg=3, mat=rope))
    suit = vk.rbox('suitcase', (1.6, 2.4, 0.9), (hw * 0.62, y1 - 2.0, z + 0.48), vk.paint('suitcase', '#3a2a22', region=0, rough=0.5, chips=0.2), bevel=0.0)
    parts.append(suit)
    return parts


AMB_ST = [  # (y, hw, z0, z1, rs, rb, crown, bulge)
    (-15.0, 5.2, 2.15, 4.75, 1.0, 0.5, 0.1, 0.0),
    (-14.65, 6.0, 1.8, 5.1, 1.0, 0.5, 0.2, 0.08),
    (-13.4, 6.4, 1.6, 5.38, 0.9, 0.5, 0.3, 0.14),
    (-10.5, 6.55, 1.5, 5.58, 0.75, 0.5, 0.3, 0.18),
    (-6.6, 6.62, 1.5, 5.76, 0.55, 0.5, 0.22, 0.2),
    (0.0, 6.66, 1.5, 5.8, 0.5, 0.5, 0.18, 0.2),
    (6.5, 6.66, 1.5, 5.8, 0.55, 0.5, 0.18, 0.2),
    (9.8, 6.6, 1.55, 5.7, 0.75, 0.5, 0.25, 0.18),
    (12.8, 6.4, 1.7, 5.5, 0.9, 0.5, 0.3, 0.14),
    (14.5, 5.95, 2.0, 5.1, 1.0, 0.5, 0.2, 0.08),
    (15.05, 5.1, 2.4, 4.6, 1.0, 0.5, 0.1, 0.0),
]


def amb_front(P, BUMP, TRIMK):
    out = []
    g = []
    out.append(vk.rbox('grille_frame', (4.7, 0.3, 2.05), (0, -14.98, 3.62), P['chrome'], bevel=0.12))
    out.append(vk.rbox('grille_back', (4.25, 0.12, 1.65), (0, -15.12, 3.62), P['dark'], bevel=0.0))
    for k in range(7):
        out.append(vk.rbox('grille_bar', (0.12, 0.1, 1.62), (-1.8 + k * 0.6, -15.16, 3.62), P['chrome'], bevel=0.0))
    out.append(vk.rbox('grille_mid', (4.3, 0.1, 0.12), (0, -15.2, 3.62), P['chrome'], bevel=0.0))
    for sx in (1, -1):
        out += vk.lamp_round('head', (sx * 4.5, -15.08, 3.95), 0.8, 0.32, P, facing=(0, -1, 0), seg=14)
        out.append(vk.cyl_between('ind_f_lens', (sx * 3.05, -14.95, 4.45), (sx * 3.05, -15.1, 4.45), 0.26, seg=8, m=P['amber']))
    out.append(bumper_bar('bumper_f', -15.32, 2.72, 6.35, 0.8, 0.45, 0.65, BUMP, sgn=-1))
    for sx in (1, -1):
        out.append(vk.cyl_between('overrider', (sx * 1.9, -15.55, 2.3), (sx * 1.9, -15.55, 3.45), 0.22, seg=6, m=BUMP))
    out.append(vk.plate('plate_front', 'AP 09 B 7744', 2.5, 0.62, (0, -15.6, 2.68), '-Y', bg='#f4f2ea', fg='#141414', px=128))
    out.append(vk.xform(kit.lathe('mascot', [(0.0, 0.0), (0.18, 0.02), (0.12, 0.2), (0.0, 0.32)], seg=6, mat=P['chrome']), loc=(0, -13.9, 5.62)))
    return out


def amb_rear(P, BUMP, TRIMK):
    out = []
    for sx in (1, -1):
        out += vk.lens_box('tail', (0.85, 0.22, 0.75), (sx * 5.05, 14.95, 4.2), P['tail_lens'], bezel_m=P['chrome'], facing='+Y')
        out += vk.lens_box('ind_r', (0.85, 0.2, 0.32), (sx * 5.05, 14.97, 3.6), P['amber'], facing='+Y')
    out.append(bumper_bar('bumper_r', 15.35, 2.78, 6.35, 0.75, 0.45, 0.6, BUMP, sgn=1))
    for sx in (1, -1):
        out.append(vk.cyl_between('overrider', (sx * 1.9, 15.55, 2.35), (sx * 1.9, 15.55, 3.4), 0.21, seg=6, m=BUMP))
    out.append(vk.plate('plate_rear', 'AP 09 B 7744', 2.5, 0.62, (0, 15.12, 3.72), '+Y', bg='#f4f2ea', fg='#141414', px=128))
    out.append(vk.rbox('boot_handle', (0.9, 0.12, 0.2), (0, 15.08, 4.45), P['chrome'], bevel=0.0))
    out.append(tube('tailpipe', [V(-3.0, 13.2, 1.55), V(-3.1, 15.45, 1.6)], 0.16, seg=6, mat=P['dark']))
    return out


AMBASSADOR = {
    'color': '#efeae0', 'R': 2.45, 'tyre_w': 1.45, 'track': 5.55, 'axles': (-9.35, 9.55), 'stations': AMB_ST, 'cap': 0.55,
    'arch_gap': 0.45, 'arch_lift': 0.2,
    'cabin': {'wb': 6.05, 'zb': 5.8, 'wr': 4.95, 'zr': 9.35, 'crown': 0.55, 'sill': 0.32, 'top': 0.42,
              'rows': [(-6.3, 'ws0'), (-3.85, 'ws1'), (0.45, 'B0'), (1.05, 'B1'), (5.35, 'C0'), (5.95, 'rw1'), (8.55, 'rw0')],
              'spans': ['ws', 'win', 'pillar', 'win', 'pillar', 'rw']},
    'seams': [(-6.3, 2.0, 5.65), (0.75, 1.75, 5.7), (6.4, 2.0, 5.65)], 'handles': [(-0.55, 5.1), (5.35, 5.1)], 'side_strip': (-13.0, 13.4, 3.85),
    'front': amb_front, 'wseg': 14, 'rear': amb_rear, 'floor_z': 2.05, 'dash_y': -5.35,
    'benches': [(-1.9, 0.25, 4.2, 7.9), (2.85, 4.95, 4.2, 7.7)], 'steer_wheel': (-2.75, -3.65, 6.8), 'wheel_r': 1.15,
    'upholstery': '#6a5444', 'dash': '#3a2a22',
    'lamps_at': {'headlight_L': ((4.5, -15.25, 3.95), 'root'), 'headlight_R': ((-4.5, -15.25, 3.95), 'root'),
                 'taillight_L': ((5.05, 15.15, 4.2), 'root'), 'taillight_R': ((-5.05, 15.15, 4.2), 'root'),
                 'indicator_FL': ((3.05, -15.15, 4.45), 'root'), 'indicator_FR': ((-3.05, -15.15, 4.45), 'root'),
                 'indicator_RL': ((5.05, 15.15, 3.6), 'root'), 'indicator_RR': ((-5.05, 15.15, 3.6), 'root'),
                 'exhaust': ((-3.1, 15.6, 1.6), 'root'), 'beacon': ((0, 0.6, 10.5), 'opt_beacon')},
    'options': {'opt_beacon': lambda P: option_beacon(P, 9.35 + 0.55),
                'opt_carrier': lambda P: option_carrier(P, 9.35 + 0.5, -3.0, 5.0, 4.1)},
}


@kit.asset('ambassador', 'vehicle', vehicleTypes=['ambassador', 'govt_ambassador', 'taxi_ambassador'], length=30.0, width=14.0, height=12.5,
           tintSrc={'paint': 'color', 'paint2': 'color'}, taxi={'paint': '#1c1c22', 'paint2': '#f2c230'}, riders=CAR_RIDERS, closed=True,
           options=[{'bone': 'opt_beacon', 'flag': 'beacon'}, {'bone': 'opt_carrier', 'flag': 'taxi'}],
           lamps={'head': ['headlight_L', 'headlight_R'], 'tail': ['taillight_L', 'taillight_R'], 'beacon': ['beacon']}, fps='cockpit')
def ambassador(A):
    """Hindustan Ambassador (the 'Amby', 2003): the rounded Morris-Oxford body, tall domed roof and
    upright windscreen, thick pillars, four doors with chrome handles, the chrome vertical-bar grille
    between round headlamps, big chrome bumpers with overriders, dome hubcaps, a front bench and the
    right-hand-drive dash with its thin steering wheel. White (paint = v.color); the government car
    adds the red beacon (opt_beacon), the taxi the black body with the yellow top (taxi livery) and
    the roof carrier with the luggage (opt_carrier). 30 x 14 u like TYPES.ambassador."""
    motor_car(A, AMBASSADOR)
    A.preview = {'shots': [{'view': {'az': -40, 'el': 16, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#efeae0', 'paint2': '#efeae0'}, 'hide': ['opt_beacon', 'opt_carrier']},
                                       {'colours': {'paint': '#f4f2ec', 'paint2': '#f4f2ec'}, 'hide': ['opt_carrier']},
                                       {'colours': {'paint': '#1c1c22', 'paint2': '#f2c230'}, 'hide': ['opt_beacon']},
                                       {'colours': {'paint': '#6a1e26', 'paint2': '#6a1e26'}, 'hide': ['opt_beacon', 'opt_carrier']}],
                              'view': {'az': -140, 'el': 18, 'fov': 30}, 'night': {'az': -25, 'el': 10, 'fov': 30}}}


# --------------------------------------------------------------------------- Premier Padmini
PAD_ST = [
    (-13.0, 4.9, 2.0, 4.55, 0.85, 0.45, 0.05, 0.0),
    (-12.7, 5.5, 1.7, 4.98, 0.75, 0.45, 0.12, 0.05),
    (-11.0, 5.75, 1.6, 5.2, 0.55, 0.45, 0.15, 0.1),
    (-5.6, 5.8, 1.55, 5.5, 0.42, 0.45, 0.12, 0.12),
    (0.0, 5.8, 1.55, 5.5, 0.4, 0.45, 0.1, 0.12),
    (5.4, 5.8, 1.55, 5.5, 0.42, 0.45, 0.1, 0.12),
    (10.6, 5.76, 1.65, 5.32, 0.5, 0.45, 0.14, 0.1),
    (12.7, 5.5, 1.8, 5.08, 0.65, 0.45, 0.1, 0.05),
    (13.05, 4.95, 2.1, 4.72, 0.75, 0.45, 0.05, 0.0),
]


def pad_front(P, BUMP, TRIMK):
    out = [vk.rbox('grille_frame', (5.2, 0.24, 1.0), (0, -13.02, 3.8), P['chrome'], bevel=0.1),
           vk.rbox('grille_back', (4.9, 0.1, 0.75), (0, -13.12, 3.8), P['dark'], bevel=0.0)]
    for k in range(3):
        out.append(vk.rbox('grille_bar', (4.9, 0.08, 0.08), (0, -13.17, 3.55 + k * 0.25), P['chrome'], bevel=0.0))
    for sx in (1, -1):
        out += vk.lamp_round('head', (sx * 4.15, -13.1, 3.85), 0.66, 0.3, P, facing=(0, -1, 0), seg=12)
        out += vk.lens_box('ind_f', (0.55, 0.15, 0.28), (sx * 4.15, -13.1, 2.95), P['amber'])
    out.append(bumper_bar('bumper_f', -13.32, 2.55, 5.6, 0.48, 0.32, 0.5, BUMP, sgn=-1))
    out.append(vk.plate('plate_front', 'AP 28 T 5390', 2.3, 0.58, (0, -13.52, 2.5), '-Y', bg='#f4f2ea', fg='#141414', px=128))
    return out


def pad_rear(P, BUMP, TRIMK):
    out = []
    for sx in (1, -1):
        out += vk.lens_box('tail', (0.7, 0.2, 0.62), (sx * 4.55, 13.1, 4.1), P['tail_lens'], bezel_m=P['chrome'], facing='+Y')
        out += vk.lens_box('ind_r', (0.7, 0.18, 0.26), (sx * 4.55, 13.12, 3.58), P['amber'], facing='+Y')
    out.append(bumper_bar('bumper_r', 13.35, 2.6, 5.6, 0.46, 0.32, 0.45, BUMP, sgn=1))
    out.append(vk.plate('plate_rear', 'AP 28 T 5390', 2.3, 0.58, (0, 13.12, 3.45), '+Y', bg='#f4f2ea', fg='#141414', px=128))
    out.append(vk.rbox('boot_handle', (0.8, 0.12, 0.18), (0, 13.1, 4.3), P['chrome'], bevel=0.0))
    out.append(tube('tailpipe', [V(-2.6, 11.2, 1.5), V(-2.7, 13.45, 1.55)], 0.14, seg=6, mat=P['dark']))
    return out


PADMINI = {
    'color': '#8fb0c8', 'R': 2.12, 'tyre_w': 1.3, 'track': 4.85, 'axles': (-8.2, 8.4), 'stations': PAD_ST, 'cap': 0.45, 'wseg': 14,
    'arch_gap': 0.4, 'arch_lift': 0.18,
    'cabin': {'wb': 5.32, 'zb': 5.5, 'wr': 4.55, 'zr': 9.05, 'crown': 0.3, 'sill': 0.3, 'top': 0.32,
              'rows': [(-5.6, 'ws0'), (-3.25, 'ws1'), (0.62, 'B0'), (1.12, 'B1'), (4.45, 'C0'), (4.95, 'rw1'), (7.55, 'rw0')],
              'spans': ['ws', 'win', 'pillar', 'win', 'pillar', 'rw']},
    'seams': [(-5.6, 1.9, 5.4), (0.87, 1.75, 5.45), (5.4, 1.9, 5.4)], 'handles': [(-0.3, 4.9), (4.95, 4.9)], 'side_strip': (-11.5, 11.8, 4.15),
    'front': pad_front, 'rear': pad_rear, 'floor_z': 2.0, 'dash_y': -4.75,
    'benches': [(-1.6, 0.4, 4.05, 7.6), (2.7, 4.45, 4.05, 7.4)], 'steer_wheel': (-2.4, -3.05, 6.55), 'wheel_r': 1.08,
    'upholstery': '#5a4a3e', 'dash': '#2a2826',
    'lamps_at': {'headlight_L': ((4.15, -13.3, 3.85), 'root'), 'headlight_R': ((-4.15, -13.3, 3.85), 'root'),
                 'taillight_L': ((4.55, 13.25, 4.1), 'root'), 'taillight_R': ((-4.55, 13.25, 4.1), 'root'),
                 'indicator_FL': ((4.15, -13.25, 2.95), 'root'), 'indicator_FR': ((-4.15, -13.25, 2.95), 'root'),
                 'indicator_RL': ((4.55, 13.25, 3.58), 'root'), 'indicator_RR': ((-4.55, 13.25, 3.58), 'root'),
                 'exhaust': ((-2.7, 13.55, 1.55), 'root')},
    'options': {'opt_carrier': lambda P: option_carrier(P, 9.05 + 0.3, -2.6, 4.2, 3.7)},
}


@kit.asset('padmini', 'vehicle', vehicleTypes=['padmini', 'taxi_padmini'], length=26.0, width=12.0, height=11.0,
           tintSrc={'paint': 'color', 'paint2': 'color'}, taxi={'paint': '#1c1c22', 'paint2': '#f2c230'}, riders=CAR_RIDERS, closed=True,
           options=[{'bone': 'opt_carrier', 'flag': 'taxi'}],
           lamps={'head': ['headlight_L', 'headlight_R'], 'tail': ['taillight_L', 'taillight_R']}, fps='cockpit')
def padmini(A):
    """Premier Padmini (the Fiat 1100 'Delight'): a compact, upright four-door with a flatter roof,
    round headlamps set wide with a horizontal chrome grille band between them, thin chrome blade
    bumpers, a chrome side strip, small rear lamps and the hint of tail fins. Pale blue / green /
    cream / beige / black / maroon (paint = v.color); a taxi (v.taxi) wears black with the yellow
    top (taxi livery) and a roof carrier. 26 x 12 u like TYPES.padmini."""
    motor_car(A, PADMINI)
    A.preview = {'shots': [{'view': {'az': -40, 'el': 16, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#8fb0c8', 'paint2': '#8fb0c8'}, 'hide': ['opt_carrier']},
                                       {'colours': {'paint': '#1c1c22', 'paint2': '#f2c230'}, 'hide': ['opt_carrier']},
                                       {'colours': {'paint': '#c8b48a', 'paint2': '#c8b48a'}, 'hide': ['opt_carrier']},
                                       {'colours': {'paint': '#1c1c22', 'paint2': '#f2c230'}}],
                              'view': {'az': -140, 'el': 18, 'fov': 30}, 'night': {'az': -25, 'el': 10, 'fov': 30}}}


# --------------------------------------------------------------------------- Maruti 800
MAR_ST = [
    (-12.0, 5.0, 1.95, 4.6, 0.5, 0.4, 0.04, 0.0),
    (-11.75, 5.55, 1.6, 4.95, 0.45, 0.4, 0.08, 0.04),
    (-9.5, 5.75, 1.5, 5.15, 0.38, 0.4, 0.1, 0.07),
    (-6.4, 5.8, 1.45, 5.32, 0.32, 0.4, 0.06, 0.08),
    (0.0, 5.82, 1.45, 5.36, 0.3, 0.4, 0.04, 0.08),
    (8.6, 5.82, 1.5, 5.4, 0.3, 0.4, 0.04, 0.08),
    (11.7, 5.6, 1.7, 5.4, 0.4, 0.4, 0.04, 0.04),
    (12.0, 5.1, 1.95, 5.25, 0.45, 0.4, 0.02, 0.0),
]


def mar_front(P, BUMP, TRIMK):
    out = [vk.rbox('grille', (4.6, 0.16, 0.7), (0, -12.02, 4.05), TRIMK, bevel=0.06)]
    for k in range(3):
        out.append(vk.rbox('grille_slot', (4.2, 0.06, 0.08), (0, -12.1, 3.85 + k * 0.2), P['dark'], bevel=0.0))
    for sx in (1, -1):
        out += vk.lens_box('head', (1.3, 0.14, 0.72), (sx * 3.55, -12.02, 4.05), P['head_lens'], bezel_m=TRIMK)
        out += vk.lens_box('ind_f', (0.42, 0.14, 0.5), (sx * 4.7, -11.95, 4.05), P['amber'])
    out.append(bumper_bar('bumper_f', -12.25, 2.45, 5.75, 0.7, 0.5, 0.6, TRIMK, sgn=-1))
    out.append(vk.plate('plate_front', 'AP 09 AB 2003', 2.4, 0.56, (0, -12.52, 2.45), '-Y', bg='#f4f2ea', fg='#141414', px=128))
    return out


def mar_rear(P, BUMP, TRIMK):
    out = []
    for sx in (1, -1):
        out += vk.lens_box('tail', (0.8, 0.18, 1.0), (sx * 4.8, 12.03, 4.35), P['tail_lens'], bezel_m=TRIMK, facing='+Y')
        out += vk.lens_box('ind_r', (0.8, 0.16, 0.3), (sx * 4.8, 12.05, 3.65), P['amber'], facing='+Y')
    out.append(bumper_bar('bumper_r', 12.25, 2.5, 5.75, 0.7, 0.5, 0.5, TRIMK, sgn=1))
    out.append(vk.plate('plate_rear', 'AP 09 AB 2003', 2.3, 0.56, (0, 12.08, 3.85), '+Y', bg='#f4f2ea', fg='#141414', px=128))
    out.append(tube('tailpipe', [V(-2.4, 10.2, 1.45), V(-2.5, 12.4, 1.5)], 0.13, seg=6, mat=P['dark']))
    return out


MARUTI = {
    'color': '#f2f0ea', 'R': 1.95, 'tyre_w': 1.15, 'track': 4.9, 'axles': (-7.7, 7.7), 'stations': MAR_ST, 'cap': 0.0, 'wseg': 14, 'chrome': False,
    'rim_m': None, 'arch_gap': 0.38, 'arch_lift': 0.15,
    'cabin': {'wb': 5.45, 'zb': 5.36, 'wr': 4.8, 'zr': 9.0, 'crown': 0.14, 'sill': 0.28, 'top': 0.28,
              'rows': [(-6.3, 'ws0'), (-2.8, 'ws1'), (1.25, 'B0'), (1.75, 'B1'), (8.3, 'C0'), (9.7, 'rw1'), (11.55, 'rw0')],
              'spans': ['ws', 'win', 'pillar', 'win', 'pillar', 'rw']},
    'seams': [(-6.2, 1.9, 5.25), (1.5, 1.7, 5.3), (8.6, 1.9, 5.3)], 'handles': [(0.25, 4.9), (8.1, 4.9)],
    'front': mar_front, 'rear': mar_rear, 'floor_z': 1.95, 'dash_y': -4.6,
    'benches': [(-1.5, 0.35, 4.0, 7.4), (3.4, 5.1, 4.0, 7.25)], 'steer_wheel': (-2.4, -3.3, 6.5), 'wheel_r': 1.0,
    'upholstery': '#4a4a52', 'dash': '#2a2a2e',
    'lamps_at': {'headlight_L': ((3.55, -12.15, 4.05), 'root'), 'headlight_R': ((-3.55, -12.15, 4.05), 'root'),
                 'taillight_L': ((4.8, 12.15, 4.35), 'root'), 'taillight_R': ((-4.8, 12.15, 4.35), 'root'),
                 'indicator_FL': ((4.7, -12.05, 4.05), 'root'), 'indicator_FR': ((-4.7, -12.05, 4.05), 'root'),
                 'indicator_RL': ((4.8, 12.15, 3.65), 'root'), 'indicator_RR': ((-4.8, 12.15, 3.65), 'root'),
                 'exhaust': ((-2.5, 12.5, 1.5), 'root')},
}


@kit.asset('maruti800', 'vehicle', vehicleTypes=['maruti800'], length=24.0, width=12.0, height=11.5,
           tintSrc={'paint': 'color', 'paint2': 'color'}, riders=CAR_RIDERS, closed=True,
           lamps={'head': ['headlight_L', 'headlight_R'], 'tail': ['taillight_L', 'taillight_R']}, fps='cockpit')
def maruti800(A):
    """Maruti 800 (the people's car of the 80s-2000s): a small, tall four-door hatchback with a short
    sloping bonnet, rectangular headlamps either side of a black slotted grille, black plastic
    bumpers, plain pressed-steel wheels with small centre caps, a big glasshouse and a near-vertical
    hatch with tall tail lamps. White / red / blue / silver / sky blue (paint = v.color). 24 x 12 u."""
    MARUTI['rim_m'] = None
    motor_car(A, MARUTI)
    A.preview = {'shots': [{'view': {'az': -40, 'el': 16, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 26}}],
                 'variants': {'sets': [{'colours': {'paint': '#f2f0ea', 'paint2': '#f2f0ea'}}, {'colours': {'paint': '#c8322a', 'paint2': '#c8322a'}},
                                       {'colours': {'paint': '#2a4c8a', 'paint2': '#2a4c8a'}}, {'colours': {'paint': '#b8bcc0', 'paint2': '#b8bcc0'}}],
                              'view': {'az': -140, 'el': 18, 'fov': 30}, 'night': {'az': -25, 'el': 10, 'fov': 30}}}


# =========================================================================== heavy vehicles
HEAVY_RIDERS = {'driver': {'pose': 'car', 'seat': 'seat_driver', 'grips': ['grip_L', 'grip_R'], 'feet': ['foot_L', 'foot_R'], 'clips': ['drive', 'sit']}}


def steering_wheel(name, c, axis, r, M, m):
    """a big steering wheel at c whose column runs along `axis` (rim, three spokes, hub); returns (parts, grip_L, grip_R)"""
    axis = Vector(axis).normalized()
    u = V(1, 0, 0)
    v = axis.cross(u).normalized()
    rim = [c + (u * math.cos(2 * math.pi * i / 14) + v * math.sin(2 * math.pi * i / 14)) * r for i in range(15)]
    parts = [tube(name + '_rim', rim, 0.11, seg=5, mat=m, cap=False)]
    for a in (math.pi * 0.5, math.pi * 1.17, math.pi * 1.83):
        parts.append(tube(name + '_spoke', [c, c + (u * math.cos(a) + v * math.sin(a)) * r], 0.08, seg=4, mat=m))
    parts.append(vk.cyl_between(name + '_hub', tuple(c - axis * 0.05), tuple(c + axis * 0.25), 0.32, seg=8, m=M['chrome']))
    gl = c + (u * math.cos(math.pi * 0.82) + v * math.sin(math.pi * 0.82)) * r
    gr = c + (u * math.cos(math.pi * 0.18) + v * math.sin(math.pi * 0.18)) * r
    return parts, gl, gr


def dual_wheel(name, c, R, w, P, side, rim_m):
    """twin rear tyres (the outer one at c, the inner one w + 0.15 further in)"""
    c = Vector(c)
    inner = c - V(side * (w + 0.15), 0, 0)
    return vk.disc_wheel(name + 'o', tuple(c), R, w, P, side=side, seg=16, rim_m=rim_m, cap_frac=0.0, hub_bolts=6) + \
        vk.disc_wheel(name + 'i', tuple(inner), R, w, P, side=side, seg=14, rim_m=rim_m, cap_frac=0.0)


BUS_ROUTES = [('127K', 'KOTI'), ('8A', 'SECUNDERABAD'), ('49M', 'MEHDIPATNAM'), ('5K', 'AFZALGUNJ')]


@kit.asset('city_bus', 'vehicle', vehicleTypes=['bus', 'safari_bus'], length=62.0, width=18.0, height=19.5,
           tintSrc={'paint': 'color'}, riders=HEAVY_RIDERS, closed=True,
           options=[{'bone': 'opt_city', 'notTypes': ['safari_bus']}, {'bone': 'opt_safari', 'types': ['safari_bus']}] +
                   [{'bone': 'opt_route%d' % i, 'route': r, 'notTypes': ['safari_bus'], 'seed': [len(BUS_ROUTES), i]} for i, (r, _) in enumerate(BUS_ROUTES)],
           lamps={'head': ['headlight_L', 'headlight_R'], 'tail': ['taillight_L', 'taillight_R']}, fps='cockpit')
def city_bus(A):
    """The city bus of 2003 Hyderabad (state-transport style, no logos): a long boxy red body with the
    white band under the windows, a cream roof, rows of sliding windows between dark pillars, two
    open doorways on the left with steps and grab poles, the split windscreen with big wipers and
    stalk mirrors, round headlamps low on the nose, yellow commercial plates, 'CITY BUS' painted on
    the sides and a route board (127K KOTI, 8A SECUNDERABAD, 49M MEHDIPATNAM, 5K AFZALGUNJ; option
    bones picked by v.route). The zoo safari bus (green) swaps the lettering for 'ZOO SAFARI' and
    puts wire mesh over the windows. Paint = v.color. 62 x 18 u like TYPES.bus."""
    P = vk.palette()
    BODY = vk.paint('bus_red', '#b22b2b', region=vk.R_PAINT, rough=0.4, chips=0.25, under='#8a8d90', grime=0.5, dirt='#4a4034', ground=3.0, streaks=0.2)
    WHITE = vk.paint('bus_band', '#ece6d6', region=0, rough=0.45, chips=0.2, under='#8a8d90', grime=0.45, dirt='#6a6050', streaks=0.2)
    ROOF = vk.paint('bus_roof', '#d6d0c2', region=0, rough=0.55, chips=0.1, grime=0.6, dirt='#5a5248', streaks=0.3)
    PIL = vk.paint('bus_pillar', '#2a2a2e', region=0, rough=0.5, chips=0.15, grime=0.4)
    GLASS = vk.mat('glass', 'glass', base='#34424a', rough=0.05, alpha=0.45, bake=False)
    SEAT = vk.mat('leather_brown', 'bus_seat', base='#2e4a6a', rough=0.5, grime=0.45)
    TRIMK = vk.mat('plastic_black', 'trim_black', base='#1c1c1e', rough=0.5, grime=0.4)
    R = 3.0
    FAy, RAy = -21.5, 17.5
    W = {'FL': V(7.5, FAy, R), 'FR': V(-7.5, FAy, R), 'RL': V(7.75, RAy, R), 'RR': V(-7.75, RAy, R)}
    Rg = vk.VRig(A)
    for S, sx in (('L', 1), ('R', -1)):
        Rg.bone('steer_' + S, W['F' + S] + V(-sx * 0.6, 0, -0.8), W['F' + S] + V(-sx * 0.6, 0, 1.6))
    for k, c in W.items():
        Rg.bone('wheel_' + k, c, parent=('steer_' + k[1]) if k[0] == 'F' else 'root')
    swc = V(-5.4, -28.6, 10.6)
    col = V(0, -0.35, -0.94)
    Rg.bone('steer_wheel', swc, swc + col.normalized())
    for o in ['opt_city', 'opt_safari'] + ['opt_route%d' % i for i in range(len(BUS_ROUTES))]:
        Rg.bone(o, (0, 0, 17.0))
    for k, c in W.items():
        side = 1 if k[1] == 'L' else -1
        if k[0] == 'F':
            Rg.add('wheel_' + k, vk.disc_wheel('w' + k, tuple(c), R, 1.8, P, side=side, seg=16, rim_m=P['dark'], cap_frac=0.0, hub_bolts=6))
        else:
            Rg.add('wheel_' + k, dual_wheel('w' + k, tuple(c), R, 1.55, P, side, P['dark']))
    b = []
    # ---------------------------------------------------------------- lower body (solid to the window sill) with arches + doorways
    st = [(-31.1, 8.45, 1.9, 8.8, 0.35, 0.3, 0.0, 0.0), (-30.8, 8.95, 1.8, 8.8, 0.35, 0.35, 0.0, 0.0),
          (30.8, 8.95, 1.8, 8.8, 0.35, 0.35, 0.0, 0.0), (31.1, 8.45, 1.9, 8.8, 0.35, 0.3, 0.0, 0.0)]
    body = vk.profile_loft('body', [(r[0], vk.car_section(*r[1:], nt=4)) for r in st], BODY)
    for (ay, tx, tw) in ((FAy, 7.5, 1.8), (RAy, 7.75, 3.4)):
        for sx in (1, -1):
            c2 = kit.cylinder('arch_cut', R + 0.45, 5.0, (sx * (tx - tw / 2 - 0.3 + 2.5), ay, R + 0.2), seg=16, axis='X', base=False)
            kit.boolean(body, c2)
    doors = [(-18.3, -14.5), (8.6, 12.4)]
    for (y0, y1) in doors:
        cut = kit.box('door_cut', (2.0, y1 - y0, 8.0), (8.95, (y0 + y1) / 2, 6.0), None)
        kit.boolean(body, cut)
    vk.assign_faces(body, [(lambda c, n: (min(abs(c.y - FAy), abs(c.y - RAy)) < R + 0.7 and abs(c.x) < 8.9 and c.z < 2 * R + 0.8) or n.z < -0.8, P['dark']),
                           (lambda c, n: any(y0 - 0.05 < c.y < y1 + 0.05 for (y0, y1) in doors) and c.x > 7.8 and abs(n.x) < 0.9, P['dark'])])
    b.append(body)
    # white band at the sill + cream roof
    for sx in (1, -1):
        b.append(vk.rbox('band', (0.1, 61.6, 1.3), (sx * 9.0, 0, 8.0), WHITE, bevel=0.0))
    b.append(vk.rbox('band_f', (17.0, 0.1, 1.3), (0, -31.15, 8.0), WHITE, bevel=0.0))
    b.append(vk.rbox('band_r', (17.0, 0.1, 1.3), (0, 31.15, 8.0), WHITE, bevel=0.0))
    b.append(vk.rbox('sill', (17.9, 61.6, 0.3), (0, 0, 8.85), WHITE, bevel=0.0))
    rst = [(-31.0, 8.6, 14.9, 16.2, 0.9, 0.2, 0.3, 0.0), (-30.7, 8.95, 14.9, 16.4, 0.9, 0.2, 0.35, 0.0),
           (30.7, 8.95, 14.9, 16.4, 0.9, 0.2, 0.35, 0.0), (31.0, 8.6, 14.9, 16.2, 0.9, 0.2, 0.3, 0.0)]
    roof = vk.profile_loft('roof', [(r[0], vk.car_section(*r[1:], nt=4)) for r in rst], ROOF)
    vk.assign_faces(roof, [(lambda c, n: n.z < -0.7, P['headliner'])])
    b.append(roof)
    b.append(vk.rbox('roof_vent', (4.0, 6.0, 0.35), (0, -6.0, 16.9), ROOF, bevel=0.1))
    b.append(vk.rbox('roof_vent', (4.0, 6.0, 0.35), (0, 12.0, 16.9), ROOF, bevel=0.1))
    # ---------------------------------------------------------------- window band: pillars + glass (no glass in the doorways)
    ys = [-30.6 + k * 5.0 for k in range(13)]
    for sx in (1, -1):
        for y in ys:
            if sx > 0 and any(y0 - 0.4 < y < y1 + 0.4 for (y0, y1) in doors):
                continue
            b.append(vk.rbox('pillar', (0.4, 0.6, 6.1), (sx * 8.85, y, 11.95), PIL, bevel=0.0))
        segs = [(-30.5, 30.5)]
        if sx > 0:
            segs = [(-30.5, doors[0][0]), (doors[0][1], doors[1][0]), (doors[1][1], 30.5)]
        for (y0, y1) in segs:
            b.append(vk.rbox('side_glass', (0.06, y1 - y0, 5.9), (sx * 8.9, (y0 + y1) / 2, 11.95), GLASS, bevel=0.0))
            b.append(vk.rbox('sash', (0.12, y1 - y0, 0.12), (sx * 8.93, (y0 + y1) / 2, 12.6), PIL, bevel=0.0))
    for (y0, y1) in doors:
        b.append(vk.rbox('door_post', (0.5, 0.5, 6.1), (8.85, y0 - 0.25, 11.95), PIL, bevel=0.0))
        b.append(vk.rbox('door_post', (0.5, 0.5, 6.1), (8.85, y1 + 0.25, 11.95), PIL, bevel=0.0))
        for k, z in enumerate((2.7, 4.6)):
            b.append(vk.rbox('step', (1.6, y1 - y0 - 0.2, 0.25), (8.1 - k * 0.9, (y0 + y1) / 2, z), P['alu'], bevel=0.0))
        b.append(tube('grab_pole', [V(8.6, y0 + 0.5, 2.6), V(8.6, y0 + 0.5, 14.6)], 0.08, seg=5, mat=P['chrome']))
        b.append(tube('grab_pole', [V(8.6, y1 - 0.5, 2.6), V(8.6, y1 - 0.5, 14.6)], 0.08, seg=5, mat=P['chrome']))
        b.append(vk.rbox('door_inner', (0.1, y1 - y0, 8.0), (7.0, (y0 + y1) / 2, 6.0), P['dark'], bevel=0.0))
    # front: split windscreen raked a little, corner pillars, mid bar
    for sx in (1, -1):
        b.append(vk.rbox('a_pillar', (0.5, 0.5, 6.1), (sx * 8.7, -30.85, 11.95), PIL, bevel=0.0))
        b.append(vk.rbox('d_pillar', (0.5, 0.5, 6.1), (sx * 8.7, 30.85, 11.95), PIL, bevel=0.0))
    b.append(vk.rbox('ws_mid', (0.35, 0.3, 6.1), (0, -31.0, 11.95), PIL, bevel=0.0))
    ws = kit.box('windscreen', (16.8, 0.06, 6.0), (0, -30.95, 11.95), GLASS)
    b.append(ws)
    b.append(vk.rbox('rear_glass', (14.0, 0.06, 4.6), (0, 30.95, 12.3), GLASS, bevel=0.0))
    for sx in (1, -1):
        b.append(vk.rbox('rear_post', (1.6, 0.3, 6.1), (sx * 7.9, 30.9, 11.95), PIL, bevel=0.0))
    # ---------------------------------------------------------------- interior: seat backs + driver seat, dash, steering wheel
    for k in range(13):
        y = -22.0 + k * 3.6
        for sx in (1, -1):
            if sx > 0 and any(y0 - 1.2 < y < y1 + 1.2 for (y0, y1) in doors):
                continue
            b.append(vk.rbox('seat_back', (5.2, 0.35, 2.2), (sx * 5.5, y, 9.95), SEAT, bevel=0.0))
    b.append(vk.rbox('driver_seat', (2.6, 2.4, 0.5), (-5.4, -26.6, 8.95), SEAT, bevel=0.0))
    b.append(vk.rbox('driver_back', (2.6, 0.4, 3.0), (-5.4, -25.4, 10.6), SEAT, bevel=0.0))
    b.append(vk.rbox('dash', (16.4, 1.6, 1.1), (0, -30.0, 9.3), TRIMK, bevel=0.1))
    b.append(vk.rbox('cab_wall', (0.2, 3.0, 2.4), (-3.4, -26.0, 10.0), PIL, bevel=0.0))
    b.append(tube('column', [swc + col * 0.3, swc + col * 2.0], 0.14, seg=6, mat=TRIMK))
    # ---------------------------------------------------------------- front face: lamps, grille, bumper, plate, wipers, mirrors
    for sx in (1, -1):
        b += vk.lamp_round('head', (sx * 6.6, -31.18, 3.9), 0.75, 0.3, P, facing=(0, -1, 0), seg=12)
        b += vk.lens_box('ind_f', (0.7, 0.15, 0.4), (sx * 6.6, -31.18, 5.1), P['amber'])
        b.append(tube('mirror_arm', [V(sx * 8.9, -30.6, 13.5), V(sx * 10.4, -31.8, 13.4), V(sx * 10.6, -32.2, 11.6)], 0.07, seg=4, mat=TRIMK))
        b.append(vk.rbox('mirror', (0.8, 0.25, 1.6), (sx * 10.6, -32.15, 11.3), TRIMK, bevel=0.06))
        b.append(tube('wiper', [V(sx * 4.2, -31.05, 9.3), V(sx * 2.4, -31.05, 13.6)], 0.06, seg=3, mat=TRIMK))
    b.append(vk.rbox('grille', (7.2, 0.15, 2.8), (0, -31.15, 5.4), P['dark'], bevel=0.0))
    for k in range(5):
        b.append(vk.rbox('grille_bar', (7.0, 0.1, 0.12), (0, -31.22, 4.3 + k * 0.55), P['alu'], bevel=0.0))
    b.append(vk.rbox('bumper_f', (17.6, 0.9, 1.3), (0, -31.45, 2.4), TRIMK, bevel=0.15))
    b.append(vk.plate('plate_front', 'AP 11 Z 1293', 3.4, 0.82, (0, -31.95, 2.4), '-Y', bg='#f2c230', fg='#141414', px=128))
    # ---------------------------------------------------------------- rear: lamps, engine grille, bumper, plate
    for sx in (1, -1):
        b += vk.lens_box('tail', (0.9, 0.2, 1.3), (sx * 7.6, 31.18, 4.2), P['tail_lens'], facing='+Y')
        b += vk.lens_box('ind_r', (0.9, 0.18, 0.45), (sx * 7.6, 31.18, 5.3), P['amber'], facing='+Y')
    b.append(vk.rbox('engine_grille', (8.0, 0.12, 2.4), (0, 31.15, 4.6), P['dark'], bevel=0.0))
    for k in range(5):
        b.append(vk.rbox('grille_slat', (7.8, 0.1, 0.14), (0, 31.22, 3.6 + k * 0.5), PIL, bevel=0.0))
    b.append(vk.rbox('bumper_r', (17.6, 0.8, 1.2), (0, 31.4, 2.4), TRIMK, bevel=0.15))
    b.append(vk.plate('plate_rear', 'AP 11 Z 1293', 3.4, 0.82, (0, 31.85, 2.4), '+Y', bg='#f2c230', fg='#141414', px=128))
    b.append(tube('tailpipe', [V(-5.0, 28.0, 1.6), V(-5.1, 31.8, 1.7)], 0.22, seg=6, mat=P['dark']))
    Rg.add('root', b)
    sw, gl, gr = steering_wheel('sw', swc, col, 1.6, P, TRIMK)
    Rg.add('steer_wheel', sw)
    # ---------------------------------------------------------------- lettering (option bones)
    city = []
    for sx in (1, -1):
        city.append(vk.decal('sign_city', 'CITY BUS', 14.0, 2.4, (sx * 9.06, -4.0, 4.9), '+X' if sx > 0 else '-X', fg='#f4f0e4', bg='#b22b2b', px=512, font=vk.FONT_BOLD))
    city.append(vk.decal('sign_cityr', 'CITY BUS', 6.0, 1.0, (0, 31.22, 6.7), '+Y', fg='#f4f0e4', bg='#b22b2b', px=256, font=vk.FONT_BOLD))
    Rg.add('opt_city', city)
    saf = []
    for sx in (1, -1):
        saf.append(vk.decal('sign_safari', 'ZOO SAFARI', 14.0, 2.4, (sx * 9.06, -4.0, 4.9), '+X' if sx > 0 else '-X', fg='#f2e6a0', bg='#3a6a3a', px=512, font=vk.FONT_BOLD))
        for k in range(26):
            saf.append(vk.rbox('mesh_bar', (0.08, 0.08, 5.8), (sx * 9.0, -29.0 + k * 2.3, 11.95), PIL, bevel=0.0))
        saf.append(vk.rbox('mesh_rail', (0.08, 58.0, 0.08), (sx * 9.0, 0, 11.0), PIL, bevel=0.0))
        saf.append(vk.rbox('mesh_rail', (0.08, 58.0, 0.08), (sx * 9.0, 0, 13.4), PIL, bevel=0.0))
    saf.append(vk.decal('sign_safarif', 'SAFARI', 7.6, 1.0, (0, -31.25, 15.55), '-Y', fg='#f2e6a0', bg='#141414', px=256, font=vk.FONT_BOLD))
    Rg.add('opt_safari', saf)
    for i, (rt, dest) in enumerate(BUS_ROUTES):
        Rg.add('opt_route%d' % i, [vk.decal('sign_route%d' % i, '%s  %s' % (rt, dest), 7.6, 1.0, (0, -31.25, 15.55), '-Y', fg='#ffd24a', bg='#141414', px=512, font=vk.FONT_COND),
                                    vk.decal('sign_routeb%d' % i, rt, 2.6, 1.0, (0, 31.25, 15.3), '+Y', fg='#ffd24a', bg='#141414', px=128, font=vk.FONT_COND)])
    arm, ob = Rg.build(tex=512, orm=128, emit=128, ao_samples=22, albedo_samples=6, ao_strength=0.72, ao_dist=4.0,
                       boost={'sign_': 2.0, 'plate': 1.6, 'head_lens': 1.2})
    an = {'seat_driver': ((-5.4, -26.4, 9.25), 'root'), 'grip_L': (tuple(gl), 'steer_wheel'), 'grip_R': (tuple(gr), 'steer_wheel'),
          'handlebar': (tuple(swc), 'steer_wheel'), 'foot_L': ((-4.9, -29.6, 7.3), 'root'), 'foot_R': ((-5.9, -29.6, 7.3), 'root'),
          'door_front': ((9.5, -16.4, 2.0), 'root'), 'door_rear': ((9.5, 10.5, 2.0), 'root'), 'eye_driver': ((-5.4, -26.2, 14.2), 'root'),
          'headlight_L': ((6.6, -31.5, 3.9), 'root'), 'headlight_R': ((-6.6, -31.5, 3.9), 'root'),
          'taillight_L': ((7.6, 31.35, 4.2), 'root'), 'taillight_R': ((-7.6, 31.35, 4.2), 'root'),
          'indicator_FL': ((6.6, -31.35, 5.1), 'root'), 'indicator_FR': ((-6.6, -31.35, 5.1), 'root'),
          'indicator_RL': ((7.6, 31.35, 5.3), 'root'), 'indicator_RR': ((-7.6, 31.35, 5.3), 'root'), 'exhaust': ((-5.1, 31.9, 1.7), 'root')}
    for k, c in W.items():
        an['wheel_' + k] = (tuple(c), 'wheel_' + k)
    anchors_from(A, arm, an)
    A.meta.update({'steerBones': {'steer_L': {'axis': [0, 0, 1], 'k': 1.0}, 'steer_R': {'axis': [0, 0, 1], 'k': 1.0}, 'steer_wheel': {'axis': [round(c, 4) for c in col.normalized()], 'k': -3.0}},
                   'wheels': {'wheel_' + k: R for k in W}, 'wheelR': R, 'cockpit': {'eye': [-5.4, -26.2, 14.2]}})
    A.preview = {'shots': [{'view': {'az': -35, 'el': 16, 'fov': 30}}, {'name': 'side', 'size': 384, 'samples': 16, 'view': {'az': 90, 'el': 3, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#b22b2b'}, 'hide': ['opt_safari', 'opt_route1', 'opt_route2', 'opt_route3']},
                                       {'colours': {'paint': '#3a6a3a'}, 'hide': ['opt_city', 'opt_route0', 'opt_route1', 'opt_route2', 'opt_route3']},
                                       {'colours': {'paint': '#b22b2b'}, 'hide': ['opt_safari', 'opt_route0', 'opt_route1', 'opt_route3'], 'view': {'az': 160, 'el': 14, 'fov': 30}}],
                              'view': {'az': -140, 'el': 16, 'fov': 30}, 'night': {'az': -30, 'el': 10, 'fov': 30}}}


@kit.asset('lorry', 'vehicle', vehicleTypes=['lorry', 'peacock_lorry'], length=46.0, width=16.0, height=17.4,
           tintSrc={'paint': 'color', 'paint2': 'color2'}, riders=HEAVY_RIDERS, closed=True,
           options=[{'bone': 'opt_tarp', 'notTypes': ['peacock_lorry']}, {'bone': 'opt_marigold', 'types': ['peacock_lorry']}],
           lamps={'head': ['headlight_L', 'headlight_R'], 'tail': ['taillight_L', 'taillight_R']}, fps='cockpit')
def lorry(A):
    """The Indian lorry (a 6-wheeler of the Tata-1210 kind, no logos): a painted cab (v.color) with a
    contrasting band (v.color2), the decorated wooden crown board over the windscreen ('MERA BHARAT
    MAHAN'), round headlamps, the black-and-white striped bumper with tassels, a nazar charm; the
    wooden cargo body painted in v.color2 with dark rails, its headboard, and the tailgate art 'HORN OK
    PLEASE' / 'USE DIPPER AT NIGHT'; under it the frame, fuel tank, spare, mud flaps; single front and
    twin rear tyres. opt_tarp: the olive tarpaulin with ropes (closed); the festival 'peacock lorry'
    is open with marigold strings along the bed (opt_marigold). 46 x 16 u like TYPES.lorry."""
    P = vk.palette()
    CAB = vk.paint('cab', '#e0782a', region=vk.R_PAINT, rough=0.35, chips=0.3, under='#8a8d90', grime=0.5, dirt='#4a4034', ground=3.0, streaks=0.2)
    BAND = vk.paint('band', '#e8c060', region=vk.R_PAINT2, rough=0.4, chips=0.3, under='#7a6a50', grime=0.45, dirt='#4a4034')
    BED = vk.mat('wood_blue', 'bed_wood', region=vk.R_PAINT2, base='#e8c060', rough=0.7, chips=0.4, under='#6a4a2a', grime=0.55, dirt='#3a3020', scale=1.0, grain=0.15)
    RAIL = vk.mat('wood_raw', 'rail_wood', base='#5a3a22', rough=0.8, grime=0.45, grain=0.2)
    GLASS = vk.mat('glass', 'glass', base='#34424a', rough=0.05, alpha=0.45, bake=False)
    TRIMK = vk.mat('plastic_black', 'trim_black', base='#1c1c1e', rough=0.5, grime=0.45)
    FRAME = vk.paint('chassis', '#1e1c1c', region=0, rough=0.6, chips=0.2, grime=0.6, dirt='#3a3228', ground=2.0)
    TARP = vk.mat('cloth', 'tarp', base='#56603f', rough=0.95, var=0.12, grain=0.1, weave=0.1, grime=0.55, dirt='#3a3428', scale=1.2, streaks=0.2)
    R = 2.5
    FAy, RAy = -16.6, 12.6
    W = {'FL': V(6.55, FAy, R), 'FR': V(-6.55, FAy, R), 'RL': V(6.8, RAy, R), 'RR': V(-6.8, RAy, R)}
    Rg = vk.VRig(A)
    for S, sx in (('L', 1), ('R', -1)):
        Rg.bone('steer_' + S, W['F' + S] + V(-sx * 0.6, 0, -0.8), W['F' + S] + V(-sx * 0.6, 0, 1.6))
    for k, c in W.items():
        Rg.bone('wheel_' + k, c, parent=('steer_' + k[1]) if k[0] == 'F' else 'root')
    swc = V(-3.6, -20.4, 12.6)
    col = V(0, -0.45, -0.89).normalized()
    Rg.bone('steer_wheel', swc, swc + col)
    for o in ('opt_tarp', 'opt_marigold'):
        Rg.bone(o, (0, 5.0, 14.0))
    for k, c in W.items():
        side = 1 if k[1] == 'L' else -1
        if k[0] == 'F':
            Rg.add('wheel_' + k, vk.disc_wheel('w' + k, tuple(c), R, 1.7, P, side=side, seg=16, rim_m=P['dark'], cap_frac=0.0, hub_bolts=6))
        else:
            Rg.add('wheel_' + k, dual_wheel('w' + k, tuple(c), R, 1.45, P, side, P['dark']))
    b = []
    # ---------------------------------------------------------------- cab: lower box (with arches) + greenhouse shell
    cst = [(-23.4, 7.1, 2.8, 10.0, 0.5, 0.35, 0.0, 0.0), (-23.1, 7.55, 2.6, 10.1, 0.5, 0.4, 0.0, 0.05),
           (-12.3, 7.6, 2.6, 10.1, 0.5, 0.4, 0.0, 0.05), (-12.0, 7.3, 2.8, 10.0, 0.5, 0.35, 0.0, 0.0)]
    cab = vk.profile_loft('cab', [(r[0], vk.car_section(*r[1:], nt=4)) for r in cst], CAB)
    for sx in (1, -1):
        c2 = kit.cylinder('arch_cut', R + 0.45, 5.0, (sx * (6.55 - 0.85 - 0.3 + 2.5), FAy, R + 0.2), seg=16, axis='X', base=False)
        kit.boolean(cab, c2)
    vk.assign_faces(cab, [(lambda c, n: (abs(c.y - FAy) < R + 0.7 and abs(c.x) < 7.55 and c.z < 2 * R + 0.8) or n.z < -0.8, P['dark']),
                          (lambda c, n: 3.6 < c.z < 5.0 and abs(n.z) < 0.5, BAND)])
    b.append(cab)
    rows = [greenhouse_row(-23.0, 7.4, 10.0, 7.05, 16.3, 0.25, flat=True), greenhouse_row(-22.1, 7.4, 10.0, 7.05, 16.3, 0.25, sill=0.35, top=0.5),
            greenhouse_row(-17.0, 7.45, 10.0, 7.1, 16.4, 0.25, sill=0.35, top=0.5), greenhouse_row(-15.9, 7.45, 10.0, 7.1, 16.4, 0.25, sill=0.35, top=0.5),
            greenhouse_row(-12.4, 7.45, 10.0, 7.1, 16.4, 0.25, sill=0.35, top=0.5), greenhouse_row(-12.05, 7.4, 10.0, 7.05, 16.3, 0.25, flat=True)]
    gh = vk.shell('cab_top', rows, CAB, thick=0.12, inside=(0, -17.5, 11.0))
    spans = ['ws', 'win', 'pillar', 'pillar', 'rw']
    ys = [r[0][1] for r in rows]

    def span(y):
        for i in range(len(ys) - 1):
            if ys[i] - 1e-3 <= y <= ys[i + 1] + 1e-3:
                return spans[i]
        return 'pillar'

    def glass(c, n):
        k = span(c.y)
        if k == 'ws':
            return abs(c.x) < 6.2 and c.z > 10.3
        if k == 'win':
            return abs(n.x) > 0.55 and 10.4 < c.z < 15.9
        if k == 'rw':
            return abs(c.x) < 3.0 and 11.5 < c.z < 14.5
        return False
    vk.assign_faces(gh, [(lambda c, n: glass(c, n), GLASS), (lambda c, n: (V(0, -17.5, 12.5) - c).dot(n) > 0, P['headliner'])])
    b.append(gh)
    b.append(vk.rbox('ws_mid', (0.3, 0.3, 5.6), (0, -22.65, 13.2), TRIMK, bevel=0.0))
    # crown board over the windscreen (painted wood) with a secular slogan, nazar charm + tassels
    b.append(vk.rbox('crown_board', (13.4, 1.2, 1.4), (0, -22.0, 17.2), vk.paint('crown', '#f4e8c8', region=0, rough=0.6, chips=0.3, grime=0.5), bevel=0.1))
    b.append(vk.decal('sign_crown', 'MERA BHARAT MAHAN', 11.0, 1.0, (0, -22.62, 17.2), '-Y', fg='#b82020', bg='#f4e8c8', px=512, font=vk.FONT_BOLD))
    for k in range(9):
        x = -6.0 + k * 1.5
        b.append(vk.xform(kit.lathe('tassel', [(0.0, 0.0), (0.22, 0.25), (0.12, 0.9), (0.0, 1.2)], seg=5,
                                    mat=vk.mat('cloth', 'tassel_%d' % (k % 2), base=('#c82020' if k % 2 else '#1a1a1a'), rough=0.9, weave=0.2, scale=6.0)),
                          loc=(x, -22.7, 15.25), rot=(math.pi, 0, 0)))
    # ---------------------------------------------------------------- cab front: grille, lamps, striped bumper, plate
    b.append(vk.rbox('grille', (7.6, 0.15, 3.6), (0, -23.45, 6.4), P['dark'], bevel=0.0))
    for k in range(6):
        b.append(vk.rbox('grille_bar', (7.4, 0.1, 0.16), (0, -23.52, 4.9 + k * 0.62), P['chrome'], bevel=0.0))
    for sx in (1, -1):
        b += vk.lamp_round('head', (sx * 5.4, -23.48, 6.2), 0.78, 0.3, P, facing=(0, -1, 0), seg=12)
        b += vk.lens_box('ind_f', (0.7, 0.15, 0.4), (sx * 5.4, -23.45, 7.6), P['amber'])
        b.append(tube('mirror_arm', [V(sx * 7.5, -21.6, 13.5), V(sx * 9.0, -22.4, 13.4), V(sx * 9.2, -22.6, 11.8)], 0.07, seg=4, mat=TRIMK))
        b.append(vk.rbox('mirror', (0.7, 0.25, 1.5), (sx * 9.2, -22.6, 11.5), TRIMK, bevel=0.06))
        b.append(tube('wiper', [V(sx * 3.6, -22.95, 10.4), V(sx * 1.6, -22.5, 14.0)], 0.06, seg=3, mat=TRIMK))
    bump = vk.rbox('bumper_f', (15.6, 1.0, 1.5), (0, -23.95, 2.6), P['black'], bevel=0.12)
    b.append(bump)
    for k in range(7):
        b.append(vk.rbox('bumper_stripe', (1.0, 0.05, 1.42), (-6.6 + k * 2.2, -24.47, 2.6), vk.paint('stripe_white', '#ece8dc', region=0, chips=0.3, grime=0.4), bevel=0.0))
    b.append(vk.plate('plate_front', 'AP 16 T 4472', 3.4, 0.82, (0, -24.5, 4.0), '-Y', bg='#f2c230', fg='#141414', px=128))
    charm = [tube('charm_thread', [V(3.0, -23.6, 3.4), V(3.0, -23.65, 2.6)], 0.02, seg=3, mat=P['black'])]
    charm.append(vk.xform(kit.lathe('charm_lemon', [(0.0, -0.22), (0.14, -0.14), (0.18, 0.0), (0.14, 0.14), (0.0, 0.22)], seg=6, mat=vk.mat('walkman', 'lemon', base='#d8c020')), loc=(3.0, -23.65, 2.42)))
    b += charm
    # cab interior: seats, dash, column
    b.append(vk.rbox('cab_seat', (13.0, 2.6, 0.6), (0, -17.8, 10.35), P['seat_black'], bevel=0.0))
    b.append(vk.rbox('cab_back', (13.0, 0.5, 3.4), (0, -16.3, 12.2), P['seat_black'], bevel=0.0))
    b.append(vk.rbox('dash', (14.0, 1.4, 1.2), (0, -22.0, 10.6), TRIMK, bevel=0.1))
    b.append(tube('column', [swc + col * 0.3, swc + col * 2.2], 0.14, seg=6, mat=TRIMK))
    # ---------------------------------------------------------------- chassis: frame rails, tank, battery, spare, under-run, mud flaps
    for sx in (1, -1):
        b.append(vk.rbox('frame_rail', (0.5, 36.0, 1.2), (sx * 3.6, 4.5, 3.5), FRAME, bevel=0.0))
        b.append(vk.rbox('mud_flap', (1.5, 0.12, 2.0), (sx * 6.9, RAy + R + 0.9, 1.6), vk.mat('rubber', 'mud_flap', base='#1a1a1a', rough=0.9, grime=0.5), bevel=0.0))
        b.append(vk.rbox('flap_border', (1.55, 0.14, 0.18), (sx * 6.9, RAy + R + 0.92, 2.5), vk.paint('flap_red', '#b02020', region=0, chips=0.2), bevel=0.0))
    b.append(vk.cyl_between('fuel_tank', (-5.6, -9.0, 3.3), (-5.6, -3.5, 3.3), 1.05, seg=10, m=P['steel']))
    b.append(vk.rbox('battery', (1.6, 2.4, 1.4), (5.6, -8.0, 3.2), P['black'], bevel=0.0))
    b.append(vk.rbox('underrun', (14.0, 0.6, 0.6), (0, 22.9, 2.2), P['black'], bevel=0.0))
    b.append(tube('exhaust', [V(-4.6, -11.0, 2.2), V(-6.2, -6.0, 1.9)], 0.2, seg=6, mat=P['dark']))
    # ---------------------------------------------------------------- cargo body: floor, sides, headboard, tailgate art
    by0, by1, fz, top = -11.4, 23.0, 4.9, 10.4
    b.append(vk.rbox('bed_floor', (16.0, by1 - by0, 0.6), (0, (by0 + by1) / 2, fz - 0.3), RAIL, bevel=0.0))
    for sx in (1, -1):
        b.append(vk.rbox('bed_side', (0.35, by1 - by0, top - fz), (sx * 7.85, (by0 + by1) / 2, (fz + top) / 2), BED, bevel=0.0))
        for z in (fz + 0.35, top - 0.2):
            b.append(vk.rbox('bed_rail', (0.45, by1 - by0 + 0.1, 0.4), (sx * 7.9, (by0 + by1) / 2, z), RAIL, bevel=0.0))
        for k in range(6):
            b.append(vk.rbox('bed_post', (0.45, 0.4, top - fz), (sx * 7.9, by0 + 0.4 + k * (by1 - by0 - 0.8) / 5, (fz + top) / 2), RAIL, bevel=0.0))
    b.append(vk.rbox('headboard', (16.0, 0.4, 13.6 - fz), (0, by0 + 0.2, (fz + 13.6) / 2), BED, bevel=0.0))
    b.append(vk.rbox('headboard_cap', (16.2, 0.5, 0.4), (0, by0 + 0.2, 13.7), RAIL, bevel=0.0))
    b.append(vk.rbox('tailgate', (15.6, 0.35, top - fz), (0, by1 - 0.17, (fz + top) / 2), vk.paint('tailgate', '#f2c230', region=0, rough=0.5, chips=0.35, under='#6a4a2a', grime=0.5), bevel=0.0))
    b.append(vk.decal('sign_hornok', 'HORN OK PLEASE', 13.0, 2.0, (0, by1 + 0.02, 7.2), '+Y', fg='#b81c1c', bg='#f2c230', px=512, font=vk.FONT_BOLD))
    b.append(vk.decal('sign_dipper', 'USE DIPPER AT NIGHT', 10.0, 1.0, (0, by1 + 0.02, 9.3), '+Y', fg='#141414', bg='#f2c230', px=512, font=vk.FONT_COND))
    for sx in (1, -1):
        b += vk.lens_box('tail', (1.2, 0.2, 0.7), (sx * 6.2, by1 + 0.15, 3.55), P['tail_lens'], facing='+Y')
        b.append(vk.disc_y('reflector', (sx * 4.3, by1 + 0.12, 3.55), 0.3, 0.08, P['reflector'], seg=8))
    b.append(vk.plate('plate_rear', 'AP 16 T 4472', 3.2, 0.8, (0, by1 + 0.25, 2.95), '+Y', bg='#f2c230', fg='#141414', px=128))
    Rg.add('root', b)
    sw, gl, gr = steering_wheel('sw', swc, col, 1.4, P, TRIMK)
    Rg.add('steer_wheel', sw)
    # ---------------------------------------------------------------- options: tarpaulin hump with ropes / marigold strings
    tarp_rows = []
    for k in range(7):
        y = by0 + 0.4 + k * (by1 - 0.4 - by0 - 0.4) / 6
        tarp_rows.append(vk.u_row(y, 8.0, top - 0.2, top + 0.9, 2.3, p=2.2, n=8))
    tp = vk.shell('tarp', tarp_rows, TARP, thick=0.08, inside=(0, 5.0, 8.0))
    to = [tp]
    rope = vk.mat('cloth', 'rope', base='#c8b890', rough=0.9, weave=0.1, scale=6.0)
    for k in range(5):
        y = by0 + 3.0 + k * 6.6
        to.append(tube('rope', [V(8.15, y, top - 0.3)] + [V(x * 1.02, y, z + 0.06) for (x, _, z) in vk.u_row(y, 8.0, top - 0.2, top + 0.9, 2.3, p=2.2, n=8)[1:-1]] + [V(-8.15, y, top - 0.3)], 0.06, seg=3, mat=rope))
    to.append(vk.shell('tarp_back', [[(x, by1 - 0.05, z) for (x, _, z) in vk.u_row(by1 - 0.05, 8.0, top - 0.2, top + 0.9, 2.3, p=2.2, n=8)],
                                     [(x * 0.5, by1 - 0.05, top + 0.2 + (z - top) * 0.3) for (x, _, z) in vk.u_row(by1 - 0.05, 8.0, top - 0.2, top + 0.9, 2.3, p=2.2, n=8)]], TARP, thick=0.06, inside=(0, 0, 8.0)))
    Rg.add('opt_tarp', to)
    mg = []
    mari = vk.mat('cloth', 'marigold', base='#f08a10', rough=0.9, var=0.15, grain=0.3, scale=8.0)
    for sx in (1, -1):
        pts = []
        for k in range(23):
            t = k / 22
            y = by0 + 1.0 + t * (by1 - by0 - 2.0)
            z = top + 0.1 - 0.9 * abs(math.sin(t * math.pi * 4))
            pts.append(V(sx * 8.2, y, z))
        mg.append(tube('garland', pts, 0.32, seg=5, mat=mari, cap=False))
    Rg.add('opt_marigold', mg)
    arm, ob = Rg.build(tex=512, orm=128, emit=128, ao_samples=22, albedo_samples=6, ao_strength=0.74, ao_dist=3.5,
                       boost={'sign_': 2.2, 'plate': 1.6, 'head_lens': 1.2})
    an = {'seat_driver': ((-3.6, -18.0, 10.75), 'root'), 'grip_L': (tuple(gl), 'steer_wheel'), 'grip_R': (tuple(gr), 'steer_wheel'),
          'handlebar': (tuple(swc), 'steer_wheel'), 'foot_L': ((-3.1, -21.6, 9.4), 'root'), 'foot_R': ((-4.1, -21.6, 9.4), 'root'),
          'seat_passenger_F': ((3.6, -18.0, 10.75), 'root'), 'foot_passenger_F': ((3.6, -21.4, 9.4), 'root'),
          'eye_driver': ((-3.6, -17.8, 15.6), 'root'), 'bed': ((0, 5.8, fz), 'root'),
          'headlight_L': ((5.4, -23.8, 6.2), 'root'), 'headlight_R': ((-5.4, -23.8, 6.2), 'root'),
          'taillight_L': ((6.2, by1 + 0.3, 3.55), 'root'), 'taillight_R': ((-6.2, by1 + 0.3, 3.55), 'root'),
          'indicator_FL': ((5.4, -23.6, 7.6), 'root'), 'indicator_FR': ((-5.4, -23.6, 7.6), 'root'), 'exhaust': ((-6.2, -6.0, 1.9), 'root')}
    for k, c in W.items():
        an['wheel_' + k] = (tuple(c), 'wheel_' + k)
    anchors_from(A, arm, an)
    A.meta.update({'steerBones': {'steer_L': {'axis': [0, 0, 1], 'k': 1.0}, 'steer_R': {'axis': [0, 0, 1], 'k': 1.0}, 'steer_wheel': {'axis': [round(c, 4) for c in col], 'k': -3.0}},
                   'wheels': {'wheel_' + k: R for k in W}, 'wheelR': R, 'cockpit': {'eye': [-3.6, -17.8, 15.6]}, 'bed': [by0, by1, fz]})
    A.preview = {'shots': [{'view': {'az': -35, 'el': 16, 'fov': 30}}, {'name': 'rear', 'size': 320, 'samples': 16, 'view': {'az': 155, 'el': 12, 'fov': 30}}],
                 'variants': {'sets': [{'colours': {'paint': '#e0782a', 'paint2': '#e8c060'}, 'hide': ['opt_marigold']},
                                       {'colours': {'paint': '#2a6ab8', 'paint2': '#3aa0a0'}, 'hide': ['opt_marigold']},
                                       {'colours': {'paint': '#2a6ab8', 'paint2': '#e8c060'}, 'hide': ['opt_tarp']},
                                       {'colours': {'paint': '#c03030', 'paint2': '#8ac04a'}, 'hide': ['opt_marigold']}],
                              'view': {'az': -140, 'el': 16, 'fov': 30}, 'night': {'az': -30, 'el': 10, 'fov': 30}}}


# =========================================================================== cycle-rickshaw
@kit.asset('cycle_rickshaw', 'vehicle', vehicleTypes=['rickshaw'], length=24.0, width=11.0, height=13.0, wheelR=2.6,
           wheels={'wheel_front': 2.4, 'wheel_RL': 2.6, 'wheel_RR': 2.6}, crankR=1.0, gear=2.0, pedal=True,
           tintSrc={'paint': 'color', 'paint2': 'color2'},
           riders={'driver': {'pose': 'cycle', 'seat': 'seat_driver', 'grips': ['grip_L', 'grip_R'], 'feet': 'pedals', 'clips': ['ride_cycle']},
                   'passengers': [{'seat': 'seat_passenger_L', 'feet': ['foot_passenger_L'], 'hands': 'knees', 'clips': ['sit']},
                                  {'seat': 'seat_passenger_R', 'feet': ['foot_passenger_R'], 'hands': 'knees', 'clips': ['sit']}]},
           open=True, fps='bars')
def cycle_rickshaw(A):
    """The Old City cycle-rickshaw: the rickshaw-wala's roadster front end (spoked wheel, swept bar,
    bell, sprung saddle, pedals driving a long chain to the rear axle) bolted to a painted passenger
    carriage (v.color) on two big spoked wheels: the box with a red rexine seat and backrest, the
    footboard in front, mudguards in v.color2 and the black folding hood on its bows. 24 x 11 u."""
    P = vk.palette()
    BODY = vk.paint('rk_body', '#2a5cb8', region=vk.R_PAINT, rough=0.45, chips=0.35, under='#7a6a50', grime=0.55, dirt='#4a4034', ground=2.0)
    ACC = vk.paint('rk_accent', '#f2c230', region=vk.R_PAINT2, rough=0.45, chips=0.3, under='#7a6a50', grime=0.5, dirt='#4a4034')
    HOOD = vk.mat('leather_brown', 'hood_rexine', base='#1c1b1d', rough=0.6, grime=0.45, dirt='#4a4436', var=0.06, scale=2.0)
    M = {'tyre': P['tyre'], 'chrome': P['chrome'], 'steel': P['steel'], 'rubber': P['rubber'], 'dark': P['dark']}
    R1, R2 = 2.4, 2.6
    FA = V(0, -9.55, R1)
    RW = {'L': V(5.05, 6.6, R2), 'R': V(-5.05, 6.6, R2)}
    S0 = V(0, -7.95, 5.3)
    AXs = steer_axis(S0, FA)
    BB = V(0, -5.5, 2.15)
    SEAT = V(0, -3.75, 6.45)
    Rg = vk.VRig(A)
    Rg.bone('steer', S0, S0 + AXs * 1.5)
    Rg.bone('wheel_front', FA, parent='steer')
    Rg.bone('wheel_RL', RW['L'])
    Rg.bone('wheel_RR', RW['R'])
    Rg.bone('crank', BB)
    cr = 1.0
    ped = {'L': BB + V(0.95, cr, 0), 'R': BB + V(-0.95, -cr, 0)}
    Rg.bone('pedal_L', ped['L'], parent='crank')
    Rg.bone('pedal_R', ped['R'], parent='crank')
    Rg.add('wheel_front', vk.spoke_wheel('wf', tuple(FA), R1, M, spokes=24, seg=18, tyre_w=0.42, rim_d=0.34, hub_w=0.55))
    Rg.add('wheel_RL', vk.spoke_wheel('wrl', tuple(RW['L']), R2, M, spokes=24, seg=18, tyre_w=0.46, rim_d=0.34, hub_w=0.6))
    Rg.add('wheel_RR', vk.spoke_wheel('wrr', tuple(RW['R']), R2, M, spokes=24, seg=18, tyre_w=0.46, rim_d=0.34, hub_w=0.6))
    b = []
    # ---------------------------------------------------------------- the rider's frame
    sc = V(0, -4.0, 5.75)
    b.append(tube('head_tube', [S0 + V(0, 0, 0.1), S0 + AXs * 1.1], 0.16, seg=6, mat=BODY))
    b.append(tube('top_tube', [sc, S0 + AXs * 0.2], 0.14, seg=6, mat=BODY))
    b.append(tube('down_tube', [BB, S0 + AXs * 0.95], 0.16, seg=6, mat=BODY))
    b.append(tube('seat_tube', [BB, sc + V(0, 0, 0.2)], 0.14, seg=6, mat=BODY))
    b.append(tube('beam', [BB + V(0, 0.1, 0.1), V(0, -1.2, 2.9), V(0, 0.6, 3.0)], 0.2, seg=6, mat=BODY))
    b.append(tube('beam_top', [sc + V(0, 0.1, -0.3), V(0, -0.6, 4.6), V(0, 0.6, 4.6)], 0.14, seg=6, mat=BODY))
    b.append(vk.disc_x('bb_shell', tuple(BB), 0.22, 0.55, BODY, seg=8))
    b.append(tube('seat_post', [sc, SEAT + V(0, 0.15, -0.3)], 0.09, seg=6, mat=P['chrome']))
    b.append(loft('saddle', [dict(c=tuple(SEAT + V(0, -0.7, -0.08)), r=(0.16, 0.07), p=2.5), dict(c=tuple(SEAT + V(0, -0.3, -0.03)), r=(0.28, 0.1), p=2.5),
                             dict(c=tuple(SEAT + V(0, 0.25, 0.0)), r=(0.55, 0.13), p=3.2), dict(c=tuple(SEAT + V(0, 0.55, -0.06)), r=(0.5, 0.09), p=3.0)],
                  seg=10, side=(1, 0, 0), mat=P['leather']))
    for sx in (1, -1):
        b.append(vk.spring('saddle_spring', tuple(SEAT + V(sx * 0.35, 0.45, -0.12)), tuple(SEAT + V(sx * 0.3, 0.4, -0.55)), 0.1, 2.5, P['chrome'], wire=0.03))
    b.append(vk.disc_x('chainring', tuple(BB + V(0.42, 0, 0)), 0.9, 0.05, P['chrome'], seg=16))
    b.append(tube('chain_top', [BB + V(0.42, 0, 0.9), V(0.42, RW['L'].y, R2 + 0.32)], 0.04, seg=3, mat=P['steel']))
    b.append(tube('chain_bot', [BB + V(0.42, 0, -0.9), V(0.42, RW['L'].y, R2 - 0.32)], 0.04, seg=3, mat=P['steel']))
    b.append(tube('axle', [RW['R'] + V(0.3, 0, 0), RW['L'] + V(-0.3, 0, 0)], 0.12, seg=6, mat=P['dark']))
    # ---------------------------------------------------------------- the carriage: box, seat, backrest, footboard, mudguards, hood
    b.append(vk.rbox('box', (10.0, 8.6, 2.3), (0, 5.4, 4.25), BODY, bevel=0.12))
    b.append(vk.rbox('box_trim', (10.15, 8.7, 0.25), (0, 5.4, 5.25), ACC, bevel=0.0))
    b.append(vk.plan_prism('footboard', [(4.6, -2.7), (4.6, 1.2), (-4.6, 1.2), (-4.6, -2.7)], 2.75, 3.0, ACC, bevel=0.05, seg=1))
    for sx in (1, -1):
        b.append(tube('foot_stay', [V(sx * 4.2, -2.6, 2.75), V(sx * 4.6, 1.2, 3.2)], 0.07, seg=4, mat=P['dark']))
    b.append(vk.seat_pad('seat', -4.6, 4.6, 2.2, 7.6, 5.35, 6.25, P['seat_red'], crown=0.16, seg=1))
    bk = vk.seat_pad('backrest', -4.6, 4.6, 7.6, 8.5, 6.2, 9.0, P['seat_red'], crown=0.0, bevel=0.15, seg=1)
    b.append(vk.rotate_about(bk, (0, 8.0, 6.2), (math.radians(-10), 0, 0)))
    for sx in (1, -1):
        b.append(vk.rbox('armrest', (0.35, 4.6, 0.35), (sx * 4.85, 5.0, 7.0), BODY, bevel=0.05))
        b.append(tube('arm_post', [V(sx * 4.85, 3.0, 5.3), V(sx * 4.85, 3.0, 7.0)], 0.07, seg=4, mat=P['chrome']))
        b.append(vk.mudguard('guard', tuple(RW['L' if sx > 0 else 'R']), R2, math.radians(15), math.radians(165), ACC, w=0.6, gap=0.22, thick=0.06, n=8))
        b.append(vk.disc_y('reflector', (sx * 4.2, 9.75, 4.0), 0.3, 0.06, P['reflector'], seg=8))
    rows = []
    for (y, top, zs) in [(9.7, 8.9, 6.6), (9.15, 10.5, 6.7), (8.0, 11.5, 6.9), (6.4, 11.95, 7.3), (4.8, 11.85, 7.9), (3.7, 11.55, 8.5)]:
        rows.append(vk.u_row(y, 5.3, zs, top - 1.7, 1.7, p=2.3, n=8))
    hood = vk.shell('hood', rows, HOOD, thick=0.07, inside=(0, 6.5, 6.5))
    vk.assign_faces(hood, [(lambda c, n: (V(0, 6.5, 6.5) - c).dot(n) > 0, vk.mat('cloth', 'hood_lining', base='#3a3a40', rough=0.9, weave=0.1, scale=3.0))])
    b.append(hood)
    for ri in (1, 3, 5):
        b.append(tube('hood_bow', [V(x * 1.01, y, z + 0.04) for (x, y, z) in rows[ri]], 0.06, seg=4, mat=P['chrome'], cap=False))
    b.append(tube('hood_piping', [V(x * 1.01, y, z + 0.03) for (x, y, z) in rows[-1]], 0.08, seg=4, mat=ACC, cap=False))
    for sx in (1, -1):
        b.append(tube('hood_stay', [V(sx * 5.35, 9.0, 6.8), V(sx * 5.4, 5.0, 8.3)], 0.06, seg=4, mat=P['chrome']))
    Rg.add('root', b)
    # ---------------------------------------------------------------- crank + pedals
    crank = [tube('crank_arm', [BB + V(0.45, 0, 0), BB + V(0.55, cr, 0)], 0.08, seg=6, mat=P['chrome']),
             tube('crank_arm', [BB + V(-0.45, 0, 0), BB + V(-0.55, -cr, 0)], 0.08, seg=6, mat=P['chrome']),
             vk.disc_x('crank_axle', tuple(BB), 0.08, 1.0, P['steel'], seg=6)]
    Rg.add('crank', crank)
    for S in ('L', 'R'):
        Rg.add('pedal_' + S, [vk.rbox('pedal', (0.5, 0.38, 0.16), tuple(ped[S]), P['rubber'], bevel=0.0)])
    # ---------------------------------------------------------------- steering: fork, guard, bar, grips, bell
    st = []
    crown = S0 + AXs * 1.15
    for sx in (1, -1):
        st.append(tube('fork', [crown + V(sx * 0.25, 0, 0), crown.lerp(FA, 0.55) + V(sx * 0.3, -0.18, 0), FA + V(sx * 0.32, 0, 0.06)], 0.08, seg=5, mat=BODY))
    st.append(vk.mudguard('guard_front', tuple(FA), R1, math.radians(-15), math.radians(118), ACC, w=0.55, gap=0.22, thick=0.06, n=8))
    top = S0 - AXs * 0.7
    st.append(tube('stem', [S0 + AXs * 0.1, top], 0.09, seg=6, mat=P['chrome']))
    bars, grips = vk.moto_bars('bar', tuple(top), [(0.55, -0.05, 0.02), (1.05, 0.25, 0.0), (1.4, 0.75, -0.08), (1.55, 1.3, -0.12)], 0.62, P, r=0.07, grip_r=0.13, levers=False,
                               grip_m=vk.mat('rubber', 'grip_rk', base='#d8ccb0', rough=0.7))
    st += bars
    bell = kit.lathe('bell', [(0.0, 0.0), (0.22, 0.0), (0.23, 0.05), (0.18, 0.16), (0.09, 0.22), (0.0, 0.25)], seg=10, mat=P['chrome'])
    st.append(vk.xform(bell, loc=top + V(0.5, -0.05, 0.08)))
    Rg.add('steer', st)
    arm, ob = Rg.build(tex=512, orm=128, emit=0, ao_samples=20, albedo_samples=6, ao_strength=0.68, ao_dist=2.0, boost={'sign_': 2.2})
    anchors_from(A, arm, {
        'seat_driver': (tuple(SEAT), 'root'), 'handlebar': (tuple(top), 'steer'), 'grip_L': (tuple(grips['L']), 'steer'), 'grip_R': (tuple(grips['R']), 'steer'),
        'pedal_L': (tuple(ped['L'] + V(0, 0, 0.1)), 'pedal_L'), 'pedal_R': (tuple(ped['R'] + V(0, 0, 0.1)), 'pedal_R'),
        'seat_passenger_L': ((2.2, 5.6, 6.3), 'root'), 'seat_passenger_R': ((-2.2, 5.6, 6.3), 'root'),
        'foot_passenger_L': ((2.2, -0.6, 3.0), 'root'), 'foot_passenger_R': ((-2.2, -0.6, 3.0), 'root'),
        'bell': (tuple(top + V(0.5, -0.05, 0.25)), 'steer'), 'reflector': ((0, 9.8, 4.0), 'root'),
        'wheel_front': (tuple(FA), 'wheel_front'), 'wheel_RL': (tuple(RW['L']), 'wheel_RL'), 'wheel_RR': (tuple(RW['R']), 'wheel_RR'),
    })
    A.meta.update({'steerAxis': [round(c, 4) for c in AXs], 'bb': [round(c, 4) for c in BB], 'seat': [round(c, 4) for c in SEAT], 'pedalX': 0.95})
    RIDE_GEOM['cycle_rickshaw'] = {'pose': 'cycle', 'vehicle': 'cycle_rickshaw', 'seat': tuple(SEAT), 'grip_L': tuple(grips['L']), 'grip_R': tuple(grips['R']),
                                   'bb': tuple(BB), 'crank': cr, 'pedal_x': 0.95, 'pedal_up': 0.14, 'seat_tube': tuple((sc - BB).normalized())}
    A.preview = {'shots': [{'view': {'az': -50, 'el': 16, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': -90, 'el': 3, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#2a5cb8', 'paint2': '#f2c230'}}, {'colours': {'paint': '#b22b2b', 'paint2': '#e8e0d0'}},
                                       {'colours': {'paint': '#2f7a4a', 'paint2': '#d8402a'}}, {'colours': {'paint': '#7a3a8a', 'paint2': '#f2c230'}}],
                              'view': {'az': -140, 'el': 16, 'fov': 30}}}


# =========================================================================== boats (Hussain Sagar)
def hull_rows(stations, gunwale, keel, chine=0.2, n_bow=9.0):
    """open U rows of a boat hull: stations [(y, hw)], the keel rising towards the bow (-Y)"""
    rows = []
    for (y, hw) in stations:
        kz = keel + max(0.0, (-y - n_bow) / 5.2) * (gunwale - keel - 0.6)
        pts = [(hw, gunwale), (hw * 1.0, gunwale - 0.8), (hw * 0.86, chine + 0.3), (hw * 0.5, (chine + kz) / 2 - 0.1), (0.0, kz)]
        L = pts
        Rr = [(-x, z) for (x, z) in reversed(pts[:-1])]
        rows.append([(x, y, z) for (x, z) in L + Rr])
    return rows


@kit.asset('motor_boat', 'vehicle', vehicleTypes=['boat'], length=28.0, width=11.0, height=9.2, boat=True,
           tintSrc={'paint': 'color', 'paint2': 'color2'},
           riders={'driver': {'pose': 'boatman', 'seat': 'seat_driver', 'grips': ['tiller', 'tiller'], 'feet': ['foot_L', 'foot_R'], 'clips': ['sit']},
                   'passengers': [{'seat': 'seat_passenger_%d' % i, 'feet': ['foot_passenger_%d' % i], 'hands': 'knees', 'clips': ['sit']} for i in range(4)]},
           lamps={'head': ['headlight']}, open=True, fps='open')
def motor_boat(A):
    """A Hussain Sagar tourist motor boat: a white planked hull (v.color) with a coloured band at the
    gunwale (v.color2), the wooden deck and three cross benches, a striped canvas canopy on four
    poles (stripes in v.color2), the outboard motor with its tiller on the transom (the propeller is
    the 'prop' bone), a bow lamp, a lifebuoy, and the boat's name painted near the bow. The hull
    reaches 1.2 u below the waterline (z 0). 28 x 11 u like TYPES.boat."""
    P = vk.palette()
    HULL = vk.paint('hull', '#f2efe6', region=vk.R_PAINT, rough=0.5, chips=0.3, under='#8a7a60', grime=0.5, dirt='#5a6048', ground=1.6, streaks=0.3)
    BANDM = vk.paint('hull_band', '#c0392b', region=vk.R_PAINT2, rough=0.45, chips=0.3, under='#8a7a60', grime=0.45)
    WOOD = vk.mat('wood_raw', 'deck_wood', base='#8a6a42', rough=0.8, grain=0.25, grime=0.5, dirt='#3a2a1a', scale=1.2)
    INNER = vk.paint('hull_inner', '#d8d2c2', region=0, rough=0.6, chips=0.2, grime=0.55, dirt='#5a5040')
    STRIPE = vk.mat('cloth', 'canopy_stripe', region=vk.R_PAINT2, base='#c0392b', rough=0.9, weave=0.1, grime=0.35, scale=2.5)
    CANW = vk.mat('cloth', 'canopy_white', base='#f2efe6', rough=0.9, weave=0.1, grime=0.35, scale=2.5)
    Rg = vk.VRig(A)
    Rg.bone('prop', (0, 15.25, -0.9), (0, 16.0, -0.9))
    st = [(-14.1, 0.25), (-13.0, 2.0), (-11.0, 3.7), (-8.0, 4.9), (-4.0, 5.4), (2.0, 5.45), (7.0, 5.35), (10.5, 4.95), (13.0, 4.3), (14.15, 3.9)]
    rows = hull_rows(st, 2.5, -1.2)
    hull = vk.shell('hull', rows, HULL, thick=0.14, inside=(0, 0, 3.0))
    vk.assign_faces(hull, [(lambda c, n: (V(0, c.y, 4.0) - c).dot(n) > 0.0 and c.z > -1.0, INNER), (lambda c, n: c.z > 1.75, BANDM)])
    b = [hull]
    tr = [(x, z) for (x, y, z) in rows[-1]]
    b.append(vk.front_prism('transom', tr, 14.1, 14.3, HULL))
    b.append(tube('gunwale_rub', [V(x * 1.02, y, 2.52) for (y, hw) in st for x in [hw]] , 0.1, seg=4, mat=WOOD))
    b.append(tube('gunwale_rub', [V(-hw * 1.02, y, 2.52) for (y, hw) in st], 0.1, seg=4, mat=WOOD))
    deck = [(hw * 0.82, y) for (y, hw) in st[2:]] + [(-hw * 0.82, y) for (y, hw) in reversed(st[2:])]
    b.append(vk.plan_prism('deck', deck, 1.4, 1.55, WOOD))
    for y in (-6.5, -0.5, 5.5):
        hw = 5.0
        b.append(vk.rbox('bench', (2 * hw * 0.92, 1.4, 0.25), (0, y, 3.2), WOOD, bevel=0.04))
        b.append(vk.rbox('bench_leg', (2 * hw * 0.85, 0.3, 1.6), (0, y, 2.35), WOOD, bevel=0.0))
    b.append(vk.rbox('stern_seat', (6.0, 2.2, 0.3), (0, 11.8, 2.9), WOOD, bevel=0.04))
    # canopy: four poles + a striped canvas top
    for (x, y) in ((4.5, -7.6), (-4.5, -7.6), (4.3, 6.4), (-4.3, 6.4)):
        b.append(tube('pole', [V(x, y, 2.5), V(x, y, 8.35)], 0.11, seg=5, mat=P['chrome']))
    crow = []
    for k in range(12):
        y = -8.6 + k * (16.0 / 11)
        crow.append(vk.u_row(y, 5.25, 8.1, 8.45, 0.55, p=2.2, n=6))
    can = vk.shell('canopy', crow, CANW, thick=0.06, inside=(0, 0, 4.0))
    vk.assign_faces(can, [(lambda c, n: int((c.y + 8.6) / (16.0 / 11)) % 2 == 0, STRIPE)])
    b.append(can)
    b.append(tube('valance', [V(x * 1.0, -8.6, z) for (x, y, z) in crow[0]], 0.06, seg=3, mat=STRIPE, cap=False))
    # outboard motor on the transom + tiller
    b.append(vk.loft_y('motor_cover', [(13.9, 0.45, 2.3, 3.4, 2.4), (14.4, 0.62, 2.1, 3.9, 2.6), (15.4, 0.55, 2.2, 3.85, 2.6), (15.7, 0.3, 2.5, 3.5, 2.2)], vk.paint('motor', '#2a2c30', region=0, rough=0.4, chips=0.2), seg=10))
    b.append(tube('motor_leg', [V(0, 15.0, 2.2), V(0, 15.1, -0.7)], 0.2, seg=6, mat=P['engine']))
    b.append(vk.disc_y('gear_pod', (0, 15.05, -0.85), 0.28, 0.9, P['engine'], seg=8))
    b.append(tube('tiller', [V(0, 14.3, 3.2), V(0.6, 12.2, 3.6)], 0.08, seg=5, mat=P['black']))
    # bow lamp, lifebuoy, name
    b += vk.lamp_round('head', (0, -13.75, 3.0), 0.28, 0.25, P, facing=(0, -1, 0.1), seg=10)
    buoy = vk.lathe_x('lifebuoy', [(0.55, -0.16), (0.75, -0.16), (0.75, 0.16), (0.55, 0.16)], 12, vk.mat('foam_orange', 'buoy', base='#e8601a'), (0, 0, 0), closed=True)
    vk.rotate_about(buoy, (0, 0, 0), (0, 0, math.radians(90)))
    buoy.data.transform(Matrix.Translation(V(4.62, -7.6, 6.2)))
    b.append(buoy)
    for sx in (1, -1):
        b.append(vk.decal('sign_name', 'HUSSAIN SAGAR 7', 4.4, 0.6, (sx * 4.1, -9.6, 1.25), '+X' if sx > 0 else '-X', fg='#24479a', bg='#f2efe6', px=256, font=vk.FONT_BOLD, tilt=0.0))
    Rg.add('root', b)
    prop = []
    for k in range(3):
        bl = vk.rbox('blade', (0.12, 0.08, 0.7), (0, 15.6, -0.9 + 0.35), P['alu'], bevel=0.0)
        vk.rotate_about(bl, (0, 15.6, -0.9), (0, math.radians(120 * k), 0))
        prop.append(bl)
    Rg.add('prop', prop)
    arm, ob = Rg.build(tex=512, orm=128, emit=128, ao_samples=20, albedo_samples=6, ao_strength=0.7, ao_dist=2.5, boost={'sign_': 2.2, 'head_lens': 1.2}, ground=False)
    an = {'seat_driver': ((0.4, 11.6, 3.1), 'root'), 'tiller': ((0.6, 12.2, 3.6), 'root'), 'foot_L': ((0.9, 9.6, 1.6), 'root'), 'foot_R': ((-0.2, 9.6, 1.6), 'root'),
          'headlight': ((0, -14.05, 3.0), 'root'), 'prop': ((0, 15.6, -0.9), 'prop'), 'waterline': ((0, 0, 0), 'root')}
    for i, (x, y) in enumerate(((2.4, -0.6), (-2.4, -0.6), (2.4, 5.4), (-2.4, 5.4))):
        an['seat_passenger_%d' % i] = ((x, y, 3.35), 'root')
        an['foot_passenger_%d' % i] = ((x, y - 2.4, 1.55), 'root')
    anchors_from(A, arm, an)
    A.meta.update({'props': {'prop': {'axis': [0, 1, 0], 'k': 6.0}}})
    A.preview = {'shots': [{'view': {'az': -50, 'el': 18, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': 90, 'el': 4, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#f2efe6', 'paint2': '#c0392b'}}, {'colours': {'paint': '#e8e2d0', 'paint2': '#2a8c82'}},
                                       {'colours': {'paint': '#f2efe6', 'paint2': '#2a5cb8'}}, {'colours': {'paint': '#e8e2d0', 'paint2': '#e0a020'}}],
                              'view': {'az': -140, 'el': 18, 'fov': 30}, 'night': {'az': -30, 'el': 12, 'fov': 30}}}


@kit.asset('pedal_boat', 'vehicle', vehicleTypes=['pedal_boat', 'swan_boat'], length=16.0, width=8.0, height=10.0, boat=True,
           tintSrc={'paint': 'color'},
           riders={'driver': {'pose': 'bench', 'seat': 'seat_driver', 'feet': ['pedal_L', 'pedal_R'], 'clips': ['sit']},
                   'passengers': [{'seat': 'seat_passenger_0', 'feet': ['foot_passenger_0'], 'hands': 'knees', 'clips': ['sit']}]},
           open=True, fps='open')
def pedal_boat(A):
    """A swan pedal boat (Lumbini Park / Hussain Sagar jetty): a white two-seater whose bow rises into a
    swan's neck and head (orange beak, dark mask), folded wings along the sides, a blue bench with a
    backrest, the pedal crank under the dash and the paddle wheel at the stern ('paddle' bone).
    Paint = v.color (white; the odd yellow or pink one). Hull 1 u below the waterline. 16 u long."""
    P = vk.palette()
    BODY = vk.paint('swan', '#f4f2ec', region=vk.R_PAINT, rough=0.35, chips=0.15, under='#b8b4a8', grime=0.45, dirt='#6a7058', ground=1.4, streaks=0.2)
    SEAT = vk.mat('plastic_black', 'seat_blue', base='#2a5cb8', rough=0.4, grime=0.35)
    BEAK = vk.paint('beak', '#e8701a', region=0, rough=0.35, chips=0.1)
    MASK = vk.paint('mask', '#1a1a1c', region=0, rough=0.3, chips=0.0)
    Rg = vk.VRig(A)
    Rg.bone('paddle', (0, 6.9, 0.6), (0.8, 6.9, 0.6))
    Rg.bone('crank', (0, -2.4, 1.9), (0.6, -2.4, 1.9))
    rows = hull_rows([(-6.4, 0.6), (-5.6, 2.2), (-4.0, 3.3), (-1.5, 3.75), (1.5, 3.8), (4.0, 3.6), (5.6, 3.1), (6.4, 2.6)], 2.6, -1.0, n_bow=4.0)
    hull = vk.shell('hull', rows, BODY, thick=0.14, inside=(0, 0, 3.0))
    vk.assign_faces(hull, [(lambda c, n: (V(0, c.y, 4.0) - c).dot(n) > 0.0 and c.z > -0.8, vk.paint('tub', '#d8e2e8', region=0, rough=0.5, grime=0.5))])
    b = [hull]
    b.append(vk.front_prism('transom', [(x, z) for (x, y, z) in rows[-1]], 6.35, 6.5, BODY))
    b.append(vk.plan_prism('floor', [(3.2, -4.0), (3.3, 5.6), (-3.3, 5.6), (-3.2, -4.0)], 0.9, 1.05, vk.mat('rubber', 'floor_mat', base='#3a4a5a', rough=0.9, grime=0.5)))
    # the swan: neck rising from the bow, head with the orange beak + dark mask
    neck = [V(0, -4.9, 2.2), V(0, -5.6, 3.6), V(0, -6.0, 5.2), V(0, -5.7, 6.8), V(0, -5.1, 8.0), V(0, -5.2, 8.9)]
    radii = [1.25, 0.85, 0.6, 0.5, 0.48, 0.5]
    b.append(loft('neck', [dict(c=tuple(p), r=r, p=2.0) for p, r in zip(neck, radii)], seg=10, side=(1, 0, 0), mat=BODY))
    head = kit.lathe('head', [(0.0, -0.55), (0.55, -0.35), (0.62, 0.0), (0.5, 0.35), (0.0, 0.55)], seg=10, mat=BODY)
    head.scale = (0.85, 1.25, 0.85)
    b.append(vk.xform(head, loc=(0, -5.45, 9.2)))
    beak = kit.cylinder('beak', 0.26, 1.0, (0, 0, 0), seg=8, mat=BEAK, r2=0.04, base=True)
    b.append(vk.xform(beak, loc=(0, -6.15, 9.05), rot=(math.radians(100), 0, 0)))
    for sx in (1, -1):
        b.append(vk.xform(kit.lathe('mask', [(0.0, -0.02), (0.2, 0.0), (0.0, 0.03)], seg=8, mat=MASK), loc=(sx * 0.5, -5.8, 9.25), rot=(0, math.radians(90 * sx), 0)))
    # folded wings along the sides
    for sx in (1, -1):
        wing = []
        for k in range(6):
            y = -3.0 + k * 1.75
            h = 1.3 + 1.2 * math.sin(math.pi * k / 5) + (0.8 if k == 5 else 0.0)
            wing.append(dict(c=(sx * 3.55, y, 2.6 + h * 0.5), r=(0.22, h * 0.5 + 0.05), p=2.2))
        b.append(loft('wing', wing, seg=8, side=(1, 0, 0), mat=BODY))
        b.append(tube('wing_edge', [V(sx * 3.6, -3.0 + k * 1.75, 2.6 + 1.35 + 1.2 * math.sin(math.pi * k / 5) + (0.8 if k == 5 else 0.0)) for k in range(6)], 0.08, seg=4, mat=BODY, cap=False))
    # bench + backrest + dash + crank housing
    b.append(vk.seat_pad('bench', -2.9, 2.9, 1.0, 3.2, 2.2, 2.9, SEAT, crown=0.1, seg=1))
    bk = vk.seat_pad('backrest', -2.9, 2.9, 3.2, 3.8, 2.8, 5.2, SEAT, crown=0.0, bevel=0.12, seg=1)
    b.append(vk.rotate_about(bk, (0, 3.5, 2.8), (math.radians(-12), 0, 0)))
    b.append(vk.rbox('dash', (5.6, 1.0, 1.4), (0, -3.6, 2.5), BODY, bevel=0.2))
    b.append(vk.disc_x('crank_housing', (0, -2.4, 1.9), 0.55, 4.8, vk.paint('crank_case', '#c8ccd0', region=0, rough=0.4), seg=10))
    # paddle-wheel housing at the stern
    b.append(vk.loft_y('paddle_box', [(5.9, 1.1, 0.3, 2.9, 2.6), (7.3, 1.2, 0.3, 3.0, 2.6), (7.6, 0.9, 0.6, 2.7, 2.4)], BODY, seg=10))
    Rg.add('root', b)
    pw = []
    for k in range(6):
        bl = vk.rbox('paddle_blade', (1.6, 0.08, 0.9), (0, 6.9, 0.6 + 0.85), vk.paint('paddle', '#2a5cb8', region=0, rough=0.4), bevel=0.0)
        vk.rotate_about(bl, (0, 6.9, 0.6), (math.radians(60 * k), 0, 0))
        pw.append(bl)
    pw.append(vk.disc_x('paddle_hub', (0, 6.9, 0.6), 0.25, 1.8, P['steel'], seg=8))
    Rg.add('paddle', pw)
    pd = []
    for sx, dz in ((1, 0.55), (-1, -0.55)):
        pd.append(vk.rbox('pedal', (0.5, 0.35, 0.15), (sx * 1.2, -2.4, 1.9 + dz), P['rubber'], bevel=0.0))
        pd.append(tube('pedal_arm', [V(sx * 0.6, -2.4, 1.9), V(sx * 1.0, -2.4, 1.9 + dz)], 0.07, seg=4, mat=P['steel']))
    Rg.add('crank', pd)
    arm, ob = Rg.build(tex=512, orm=128, emit=0, ao_samples=20, albedo_samples=6, ao_strength=0.68, ao_dist=2.0, ground=False)
    anchors_from(A, arm, {
        'seat_driver': ((-1.4, 2.0, 2.95), 'root'), 'seat_passenger_0': ((1.4, 2.0, 2.95), 'root'),
        'pedal_L': ((-0.85, -2.4, 2.45), 'crank'), 'pedal_R': ((-1.55, -2.4, 1.35), 'crank'), 'foot_passenger_0': ((1.4, -1.6, 1.1), 'root'),
        'paddle': ((0, 6.9, 0.6), 'paddle'), 'waterline': ((0, 0, 0), 'root'),
    })
    A.meta.update({'props': {'paddle': {'axis': [1, 0, 0], 'k': 1.0}}, 'crankR': 0.55})
    A.preview = {'shots': [{'view': {'az': -50, 'el': 16, 'fov': 30}}, {'name': 'side', 'size': 320, 'samples': 16, 'view': {'az': 90, 'el': 4, 'fov': 28}}],
                 'variants': {'sets': [{'colours': {'paint': '#f4f2ec'}}, {'colours': {'paint': '#f2d040'}}, {'colours': {'paint': '#f0a0c0'}}], 'view': {'az': -140, 'el': 16, 'fov': 30}}}
