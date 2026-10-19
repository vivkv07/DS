"""NOSTALGIA — tools/blender/props_street.py — street props #1 (ARCHITECTURE §21, props brief).

Hyderabad 2003 pushcarts (bandi) and street furniture. Build:
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py cart_chai booth_std -j 1

Conventions: 1 u = 1 world unit, Z up, front = -Y (customer / street side), model left = +X,
origin on the ground at the footprint centre. Every asset = one baked mesh (props_kit.finish_prop);
glass (kit 'glass', unbaked) stays a second material where used.

Carts (meta kind='cart'): ~5 u wide (X) x ~10 u long (Y), deck top at z = 4.5, push handles at the
back (+Y), customer side -Y. Anchors: `vendor` (behind, between the handles), `customer` (front).
"""
import math
import random

import bpy
import bmesh
from mathutils import Vector

import kit
import props_kit as P

V = Vector
D = 4.5          # cart deck top (u)
CL = 10.0        # cart length (Y)
CW = 5.0         # cart width (X)

# --------------------------------------------------------------------------- materials (sRGB)
SLIB = {
    'wheel':        dict(base='#4a3424', rough=0.85, var=0.1, grain=0.2, chips=0.3, under='#7a6a5a', grime=0.5, dirt='#1e1610', ground=2.0, scale=2.0),
    'cart_red':     dict(base='#a8342a', rough=0.7, var=0.08, grain=0.12, chips=0.55, under='#6e4e30', grime=0.4, dirt='#2a2018', ground=2.0, scale=1.4),
    'cart_yellow':  dict(base='#d8a428', rough=0.7, var=0.08, grain=0.12, chips=0.55, under='#6e4e30', grime=0.45, dirt='#3a2a14', ground=2.0, scale=1.4),
    'cart_sky':     dict(base='#3b8cc4', rough=0.7, var=0.08, grain=0.12, chips=0.55, under='#6e4e30', grime=0.4, dirt='#2a2620', ground=2.0, scale=1.4),
    'cart_pink':    dict(base='#d0507a', rough=0.7, var=0.08, grain=0.12, chips=0.55, under='#6e4e30', grime=0.4, dirt='#3a2026', ground=2.0, scale=1.4),
    'banana_y':     dict(base='#e6c234', rough=0.5, var=0.14, grain=0.12, grime=0.45, dirt='#5a4012', scale=3.0),
    'banana_g':     dict(base='#9cb23c', rough=0.5, var=0.14, grain=0.1, grime=0.4, dirt='#3a4214', scale=3.0),
    'marigold':     dict(base='#f07c10', rough=0.8, var=0.16, grain=0.5, grime=0.45, dirt='#7a2a04', scale=9.0),
    'marigold_y':   dict(base='#f6b818', rough=0.8, var=0.16, grain=0.5, grime=0.45, dirt='#8a4a04', scale=9.0),
    'jasmine':      dict(base='#f6f4ea', rough=0.8, var=0.06, grain=0.4, grime=0.35, dirt='#7a9a5a', scale=10.0),
    'rose':         dict(base='#b01828', rough=0.75, var=0.16, grain=0.45, grime=0.45, dirt='#4a0610', scale=8.0),
    'banana_leaf':  dict(base='#3e7a2a', rough=0.5, var=0.12, grain=0.1, grime=0.3, dirt='#1e3a10', scale=2.0),
    'puri':         dict(base='#dca456', rough=0.7, var=0.16, grain=0.25, grime=0.4, dirt='#7a4818', scale=6.0),
    'pani':         dict(base='#5e7e26', rough=0.1, var=0.08, grain=0.05, scale=3.0),
    'potato':       dict(base='#d8b040', rough=0.8, var=0.12, grain=0.4, grime=0.3, dirt='#7a5a1a', scale=8.0),
    'tamarind':     dict(base='#4a2412', rough=0.3, var=0.08, grain=0.05, scale=4.0),
    'onion':        dict(base='#d8a0b0', rough=0.6, var=0.12, grain=0.4, scale=9.0),
    'samosa':       dict(base='#c8883a', rough=0.7, var=0.18, grain=0.25, grime=0.45, dirt='#6a3608', scale=5.0),
    'bajji':        dict(base='#b8862c', rough=0.65, var=0.18, grain=0.3, grime=0.4, dirt='#5a3a08', scale=6.0),
    'oil':          dict(base='#8a5a10', rough=0.12, var=0.1, grain=0.05, scale=3.0),
    'batter':       dict(base='#efe6cc', rough=0.4, var=0.05, grain=0.06, scale=4.0),
    'dosa':         dict(base='#d49440', rough=0.6, var=0.25, grain=0.25, grime=0.3, dirt='#7a4410', scale=4.0),
    'chutney_w':    dict(base='#ece6cc', rough=0.6, var=0.08, grain=0.3, scale=8.0),
    'chutney_g':    dict(base='#5e9432', rough=0.6, var=0.1, grain=0.3, scale=8.0),
    'chutney_r':    dict(base='#c4441c', rough=0.6, var=0.1, grain=0.3, scale=8.0),
    'coconut_g':    dict(base='#5c8a26', rough=0.55, var=0.18, grain=0.12, grime=0.45, dirt='#2e3e10', scale=3.0),
    'coconut_y':    dict(base='#8ea232', rough=0.55, var=0.18, grain=0.12, grime=0.45, dirt='#3e4210', scale=3.0),
    'stump':        dict(base='#7a5a3a', rough=0.9, var=0.15, grain=0.3, grime=0.5, dirt='#2a1c10', scale=3.0),
    'blade':        dict(base='#6a6a6a', rough=0.45, metal=0.6, var=0.08, grain=0.06, rust=0.4, rust_col='#5a3218', scale=3.0),
    'corn':         dict(base='#e8b628', rough=0.6, var=0.12, grain=0.55, grime=0.35, dirt='#6a3a08', scale=12.0),
    'corn_roast':   dict(base='#c48a26', rough=0.7, var=0.3, grain=0.6, grime=0.6, dirt='#241408', scale=12.0),
    'corn_husk':    dict(base='#8ca448', rough=0.7, var=0.15, grain=0.25, grime=0.35, dirt='#4a5020', scale=5.0),
    'coal':         dict(base='#2a201c', rough=0.9, var=0.3, grain=0.5, scale=7.0),
    'ember':        dict(base='#e0561c', rough=0.9, var=0.35, grain=0.6, grime=0.0, scale=7.0, emit='#ff6a20', emit_strength=0.6),
    'lemon':        dict(base='#e8d43a', rough=0.5, var=0.1, grain=0.15, scale=6.0),
    'palm_fan':     dict(base='#c4a468', rough=0.9, var=0.1, grain=0.2, weave=0.25, scale=5.0),
    'chai':         dict(base='#a8703e', rough=0.25, var=0.06, grain=0.05, grime=0.2, dirt='#5a3418', scale=4.0),
    'biscuit':      dict(base='#d8a462', rough=0.75, var=0.12, grain=0.3, grime=0.3, dirt='#8a5420', scale=6.0),
    'ice':          dict(base='#e2f0f4', rough=0.12, var=0.06, grain=0.1, grime=0.2, dirt='#8aa4ac', scale=3.0),
    'snow':         dict(base='#f4f6f6', rough=0.6, var=0.05, grain=0.4, scale=10.0),
    'syrup_r':      dict(base='#c0101c', rough=0.15, var=0.06, grain=0.03, scale=3.0),
    'syrup_g':      dict(base='#1e9a2a', rough=0.15, var=0.06, grain=0.03, scale=3.0),
    'syrup_o':      dict(base='#f07a10', rough=0.15, var=0.06, grain=0.03, scale=3.0),
    'syrup_k':      dict(base='#4a1438', rough=0.15, var=0.06, grain=0.03, scale=3.0),
    'syrup_p':      dict(base='#e85a8a', rough=0.15, var=0.06, grain=0.03, scale=3.0),
    'lpg':          dict(base='#c4261c', rough=0.5, var=0.06, grain=0.05, chips=0.35, under='#6a6a68', grime=0.45, dirt='#3a2018', ground=1.5, scale=2.0),
    'thermocol':    dict(base='#f0eee6', rough=0.9, var=0.05, grain=0.2, grime=0.5, dirt='#8a8270', scale=5.0),
    'bentwood':     dict(base='#3a2214', rough=0.4, var=0.1, grain=0.2, grime=0.3, dirt='#140a04', chips=0.15, under='#7a5634', scale=2.5),
    'cane':         dict(base='#c8a464', rough=0.8, var=0.08, grain=0.15, weave=0.35, grime=0.35, dirt='#6a5024', scale=8.0),
    'cast_iron':    dict(base='#1e1e20', rough=0.55, metal=0.3, var=0.06, grain=0.08, rust=0.12, rust_col='#4a2c1a', grime=0.3, dirt='#3a342c', ground=1.0, scale=2.0),
    'marble':       dict(base='#efebe2', rough=0.25, var=0.07, grain=0.05, specks=0.12, grime=0.25, dirt='#8a8478', scale=1.5),
    'sweet_r':      dict(base='#e0283a', rough=0.35, var=0.3, grain=0.55, scale=14.0),
    'sweet_o':      dict(base='#f09a18', rough=0.35, var=0.3, grain=0.55, scale=14.0),
    'sweet_g':      dict(base='#3aae3a', rough=0.35, var=0.3, grain=0.55, scale=14.0),
    'sweet_b':      dict(base='#6a3a1c', rough=0.35, var=0.3, grain=0.55, scale=14.0),
    'sweet_y':      dict(base='#f2d630', rough=0.35, var=0.3, grain=0.55, scale=14.0),
    'sweet_m':      dict(base='#e85aa0', rough=0.35, var=0.3, grain=0.55, scale=14.0),
    'lid_red':      dict(base='#c4221c', rough=0.4, var=0.05, grain=0.04, grime=0.35, dirt='#4a1a14', scale=3.0),
    'lid_blue':     dict(base='#2450a8', rough=0.4, var=0.05, grain=0.04, grime=0.35, dirt='#1a2040', scale=3.0),
    'lid_yellow':   dict(base='#e8b818', rough=0.4, var=0.05, grain=0.04, grime=0.35, dirt='#4a3a14', scale=3.0),
    'rice':         dict(base='#f0ebdc', rough=0.8, var=0.06, grain=0.45, grime=0.3, dirt='#8a806a', scale=14.0),
    'dal':          dict(base='#e8a828', rough=0.8, var=0.1, grain=0.5, grime=0.3, dirt='#8a5a10', scale=14.0),
    'sugar':        dict(base='#f8f6f0', rough=0.5, var=0.04, grain=0.5, grime=0.25, dirt='#9a948a', scale=16.0),
    'counter_wood': dict(base='#6a4428', rough=0.6, var=0.12, grain=0.25, chips=0.25, under='#a07a50', grime=0.5, dirt='#2a1a0c', ground=2.0, scale=1.5),
    'counter_paint': dict(base='#2e6a74', rough=0.7, var=0.08, grain=0.12, chips=0.5, under='#6a4428', grime=0.45, dirt='#1e2a28', ground=2.0, scale=1.4),
    'booth_yellow': dict(base='#eab51c', rough=0.6, var=0.07, grain=0.06, chips=0.4, under='#7a7470', grime=0.45, dirt='#4a3a20', ground=3.0, streaks=0.2, scale=1.4),
    'booth_red':    dict(base='#b8261e', rough=0.6, var=0.07, grain=0.06, chips=0.35, under='#7a7470', grime=0.4, dirt='#3a1a14', scale=1.4),
    'phone_cream':  dict(base='#e4dcc4', rough=0.4, var=0.04, grain=0.04, grime=0.45, dirt='#7a6e58', scale=4.0),
    'meter':        dict(base='#141414', rough=0.3, var=0.02, grain=0.02, scale=4.0),
    'steel_green':  dict(base='#3a5a48', rough=0.6, metal=0.3, var=0.08, grain=0.06, chips=0.3, under='#7a4a2a', rust=0.3, rust_col='#6a3a1c', grime=0.45, dirt='#2a2a22', ground=3.0, scale=1.2),
    'asbestos':     dict(base='#a4a29a', rough=0.95, var=0.14, grain=0.14, grime=0.55, dirt='#4a4a40', streaks=0.55, scale=0.9),
    'pole_black':   dict(base='#1c1c1e', rough=0.5, var=0.05, grain=0.05, chips=0.3, under='#8a8a86', grime=0.3, dirt='#4a443c', scale=2.0),
    'pole_white':   dict(base='#ecebe4', rough=0.6, var=0.05, grain=0.05, chips=0.3, under='#5a5a56', grime=0.45, dirt='#5a564a', ground=2.5, scale=2.0),
    'traffic_red':  dict(base='#c4231e', rough=0.75, var=0.08, grain=0.08, weave=0.05, grime=0.35, dirt='#4a1a14', scale=3.0),
    'traffic_white': dict(base='#f0eee6', rough=0.75, var=0.06, grain=0.08, weave=0.05, grime=0.4, dirt='#7a7466', scale=3.0),
    'plinth_yellow': dict(base='#f0c020', rough=0.85, var=0.1, grain=0.1, chips=0.4, under='#9a968c', grime=0.5, dirt='#4a4030', ground=2.0, scale=1.0),
    'plinth_black': dict(base='#222222', rough=0.85, var=0.1, grain=0.1, chips=0.4, under='#9a968c', grime=0.4, dirt='#4a4030', ground=2.0, scale=1.0),
    'steel_plate':  dict(base='#c8cacc', rough=0.25, metal=0.85, var=0.05, grain=0.03, grime=0.35, dirt='#4a4640', scale=3.0),
}


def mm(key, **over):
    """Material: street SLIB, then props PLIB, then kit.LIB."""
    if key in SLIB:
        spec = dict(SLIB[key])
        spec.update(over)
        nm = key if not over else key + '_' + '_'.join('%s%s' % (k, v) for k, v in sorted(over.items()))
        return kit.material(key, nm, **spec)
    return P.M(key, **over)


def glass(alpha=0.28, base='#c4dce2'):
    return kit.material('glass', 'glass', base=base, alpha=alpha, rough=0.05, bake=False)


# --------------------------------------------------------------------------- geometry helpers
def bx(name, size, loc, m, base=True):
    return kit.box(name, size, loc, mat=m, base=base)


def cyl(name, r, h, loc, m, seg=8, r2=None, axis='Z', base=True, cap=True, sm=True):
    ob = kit.cylinder(name, r, h, loc, seg=seg, mat=m, r2=r2, axis=axis, cap=cap, base=base)
    if sm:
        kit.smooth(ob, 360.0 / seg + 12)
    return ob


def lat(name, prof, m, seg=8, loc=(0, 0, 0), top=False, bottom=False, sm=True):
    ob = kit.lathe(name, prof, seg=seg, mat=m, loc=loc, close_top=top, close_bottom=bottom)
    if sm:
        kit.smooth(ob, 360.0 / seg + 14)
    return ob


def tb(name, pts, r, m, seg=6, cap=True):
    ob = kit.tube(name, pts, r, seg=seg, mat=m, cap=cap)
    kit.smooth(ob, 75)
    return ob


def drop(ob, fn):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    kill = [f for f in bm.faces if fn(f)]
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def no_down(ob):
    """Delete downward-facing faces (ground contacts, hidden undersides)."""
    return drop(ob, lambda f: f.normal.z < -0.99)


def sweep(name, pts, sec, scale=None, m=None, cap=True):
    """Sweep a custom 2D section [(side, up)] along a polyline (section 'up' stays near world Z)."""
    pts = [V(p) for p in pts]
    n = len(pts)
    scale = scale or [1.0] * n
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        a = d.cross(V((0, 0, 1)))
        a = a.normalized() if a.length > 1e-6 else V((1, 0, 0))
        b = a.cross(d).normalized()
        rings.append([bm.verts.new(p + (a * x + b * y) * scale[i]) for x, y in sec])
    k = len(sec)
    for i in range(n - 1):
        for j in range(k):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % k], rings[i + 1][(j + 1) % k], rings[i + 1][j]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, m)


def stripes(ob, mats, cap_mat=None, n=None, phase=0.0):
    """Alternate `mats` around Z on the side faces (by face-centre angle); |normal.z| > 0.99 -> cap_mat."""
    me = ob.data
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    if cap_mat is not None:
        me.materials.append(cap_mat)
    n = n or len([p for p in me.polygons if abs(p.normal.z) < 0.99]) or 8
    for p in me.polygons:
        if cap_mat is not None and abs(p.normal.z) > 0.99:
            p.material_index = len(mats)
        else:
            a = (math.atan2(p.center.y, p.center.x) + phase) % (2 * math.pi)
            p.material_index = int(a / (2 * math.pi) * n) % len(mats)
    return ob


def sign(name, text, w, h, loc, fg='#1a1a1a', bg='#f2c230', frame=None, rotz=0.0, px=512, depth=0.1):
    ob = kit.signboard(name, text, w, h, loc=(0, 0, 0), depth=depth, fg=fg, bg=bg, frame_mat=frame, px=px)
    return P.xform(ob, loc, (0, 0, rotz))


def finish(A, objs, size, shots, double=False):
    import os
    if os.environ.get('STREET_DEBUG'):
        agg = {}
        for o_ in kit.mesh_objects(objs):
            k = o_.name.split('.')[0]
            t = kit.tri_count([o_])
            a = agg.setdefault(k, [0, 0, 0])
            a[0] += 1
            a[1] += t
            a[2] += len(o_.data.vertices)
        for k, (n, t, v) in sorted(agg.items(), key=lambda kv: -kv[1][1]):
            kit.log('  part %-12s x%-2d tris %4d verts %4d' % (k, n, t, v))
    ob = P.finish_prop(A, objs, size=size, double=double, orm=False)
    A.preview = {'shots': shots}
    return ob


def view(az=-35, el=28, fov=32, target=None, dist=None, name=None, size=None):
    v = {'az': az, 'el': el, 'fov': fov}
    if target is not None:
        v['target'] = target
    if dist is not None:
        v['dist'] = dist
    s = {'view': v}
    if name:
        s['name'] = name
    if size:
        s['size'] = size
    return s


# --------------------------------------------------------------------------- the pushcart (bandi)
def cart_base(paint, rails=(True, True, True), sign_text=None, sign_fg='#ffffff', sign_bg=None):
    """Wooden 4-wheel pushcart: painted body (3.3..4.3), plank deck (top z=4.5), a low rim on the
    front + sides, solid wooden wheels with iron hubs, push handles + grip bar at the back (+Y)."""
    pm = mm(paint)
    wood = mm('cart_wood')
    iron = mm('iron_black')
    o = []
    body = no_down(bx('body', (CW, CL, 1.0), (0, 0, 3.3), pm))
    deck = no_down(bx('deck', (CW + 0.3, CL + 0.3, 0.2), (0, 0, 4.3), wood))
    o += [body, deck]
    rh = 0.4
    if rails[0]:
        o.append(no_down(bx('rail_f', (CW + 0.3, 0.16, rh), (0, -(CL + 0.3) / 2 + 0.08, D), pm)))
    for i, sx in enumerate((-1, 1)):
        if rails[1 + i]:
            o.append(no_down(bx('rail_s', (0.16, CL + 0.3, rh), (sx * ((CW + 0.3) / 2 - 0.08), 0, D), pm)))
    R = 1.6
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = sx * (CW / 2 - 0.12)
            y = sy * (CL / 2 - 1.7)
            w = cyl('wheel', R, 0.34, (x, y, R), mm('wheel'), seg=10, axis='X', base=False, sm=False)
            kit.smooth(w, 50)
            drop(w, lambda f, sx=sx: f.normal.x * sx < -0.99)          # inner face is hidden
            hub = cyl('hub', 0.4, 0.5, (x + sx * 0.08, y, R), iron, seg=6, axis='X', base=False)
            drop(hub, lambda f, sx=sx: f.normal.x * sx < -0.99)
            brk = no_down(bx('brk', (0.18, 0.4, 3.3 - R), (x - sx * 0.4, y, R), iron))
            o += [w, hub, brk]
        pass
    for sy in (-1, 1):
        o.append(bx('axle', (CW - 0.6, 0.14, 0.14), (0, sy * (CL / 2 - 1.7), R), iron, base=False))
    for sx in (-1, 1):
        o.append(tb('handle', [(sx * 1.9, CL / 2 - 0.8, 3.55), (sx * 1.9, CL / 2 + 2.4, 4.7)], 0.13, wood, seg=6))
    o.append(tb('grip', [(-2.05, CL / 2 + 2.4, 4.7), (2.05, CL / 2 + 2.4, 4.7)], 0.15, wood, seg=6))
    if sign_text:
        o.append(sign('cart_sign', sign_text, CW - 0.6, 0.8, (0, -CL / 2 - 0.06, 3.8), fg=sign_fg,
                      bg=sign_bg or (SLIB[paint]['base'] if paint in SLIB else '#2f6aa8'), frame=pm, px=256, depth=0.06))
    return o


def cart_anchors(A):
    A.anchor('vendor', (0, CL / 2 + 1.5, 0))
    A.anchor('customer', (0, -CL / 2 - 2.5, 0))
    A.anchor('deck', (0, 0, D))


def cart_shots(close_target=(0, -1.0, 5.6), close_dist=17.0):
    return [view(-35, 30), view(-20, 48, target=close_target, dist=close_dist, name='close')]


def pot(name, r, h, m, seg=10, loc=(0, 0, 0), fill=None, fill_z=0.85, lip=1.0):
    """Steel / aluminium round-bellied vessel (open top) + optional contents disc."""
    prof = [(r * 0.7, 0), (r * 0.98, h * 0.25), (r, h * 0.6), (r * 0.82 * lip, h * 0.92), (r * 0.86 * lip, h)]
    o = [lat(name, prof, m, seg=seg, loc=loc, bottom=False)]
    if fill is not None:
        o.append(no_down(cyl(name + '_fill', r * 0.9, 0.04, (loc[0], loc[1], loc[2] + h * fill_z), fill, seg=seg)))
    return o


def lpg(loc):
    o = [lat('lpg', [(0.62, 0), (0.75, 0.2), (0.75, 1.95), (0.42, 2.35), (0.16, 2.45), (0, 2.5)], mm('lpg'), seg=8, loc=loc)]
    o.append(tb('hose', [(loc[0], loc[1], loc[2] + 2.5), (loc[0] + 0.3, loc[1] - 0.6, 3.0), (loc[0] + 0.3, loc[1] - 1.2, 3.2)], 0.06, mm('rubber'), seg=4, cap=False))
    return o


def glass_box(name, size, loc, frame_m):
    """Display case: glass box with an aluminium-strip frame (top + bottom bands, corner posts)."""
    w, d, h = size
    x, y, z = loc
    o = [bx(name + '_g', (w - 0.1, d - 0.1, h - 0.1), (x, y, z + 0.05), glass())]
    o.append(no_down(bx(name + '_base', (w, d, 0.16), (x, y, z), frame_m)))
    o.append(bx(name + '_top', (w + 0.06, d + 0.06, 0.1), (x, y, z + h - 0.1), frame_m))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(no_down(bx(name + '_post', (0.1, 0.1, h), (x + sx * (w / 2 - 0.02), y + sy * (d / 2 - 0.02), z), frame_m)))
    return o


# =========================================================================== carts
@kit.asset('cart_banana', 'prop', kind='cart', draw='banana_cart')
def build_cart_banana(A):
    rnd = random.Random(7)
    o = cart_base('cart_green')
    yel, grn = mm('banana_y'), mm('banana_g')
    sec = [(-0.95, 0.0), (-0.95, 0.3), (-0.62, 0.58), (-0.32, 0.36), (0.0, 0.62), (0.32, 0.36), (0.62, 0.58), (0.95, 0.3), (0.95, 0.0)]
    path = [(0, 0, 0), (0, 0.85, 0.02), (0, 1.65, 0.32), (0, 2.25, 0.85)]

    def hand(loc, yaw, tilt=0.0, m=yel, s=1.0):
        h = sweep('hand', path, sec, [0.62, 1.0, 1.0, 0.72], m)
        kit.smooth(h, 55)
        P.xform(h, loc, (tilt, 0, yaw), (s, s, s))
        o.append(h)
    # bottom layer: two rows, crowns at the centre line, fingers curling outward
    for i, y in enumerate((-3.9, -1.9, 0.1, 2.1)):
        for sx in (-1, 1):
            m = grn if (i + (sx > 0)) % 3 == 0 else yel
            hand((sx * 0.15, y + rnd.uniform(-0.2, 0.2), D + 0.05), -sx * math.pi / 2 + rnd.uniform(-0.25, 0.25), 0.0, m, 1.0)
    # second layer
    for i, y in enumerate((-2.9, -0.9, 1.1)):
        sx = -1 if i % 2 else 1
        hand((sx * 0.25, y, D + 0.6), -sx * math.pi / 2 + rnd.uniform(-0.3, 0.3), 0.18, grn if i == 1 else yel, 0.95)
    # top: one hand pointing at the customer
    hand((0, -0.2, D + 1.15), math.pi + 0.15, 0.25, yel, 0.95)
    hand((0.1, 3.4, D + 0.05), math.pi, 0.0, grn, 0.9)
    cart_anchors(A)
    finish(A, o, 256, cart_shots())


@kit.asset('cart_flower', 'prop', kind='cart', draw='flower_cart')
def build_cart_flower(A):
    rnd = random.Random(11)
    o = cart_base('cart_blue')
    leaf = mm('banana_leaf')
    # banana leaves under the heaps
    for x, y, a in ((-1.1, -2.6, 0.2), (1.1, -2.4, -0.15), (0, 1.8, 0.05)):
        o.append(P.xform(no_down(bx('leaf', (2.3, 4.2, 0.05), (0, 0, 0), leaf)), (x, y, D), (0, 0, a)))
    heaps = [('marigold', (-1.15, -3.0), (1.05, 1.5, 0.75)), ('marigold_y', (1.15, -3.2), (1.0, 1.35, 0.7)),
             ('rose', (0.0, -0.6), (0.95, 0.85, 0.5)), ('marigold', (-0.9, 1.6), (0.9, 1.1, 0.55)),
             ('marigold_y', (1.0, 2.0), (0.85, 1.0, 0.5))]
    for i, (k, (x, y), sc) in enumerate(heaps):
        b = P.blob('heap', 1.0, (x, y, D), subdiv=1, noise=0.16, seed=i + 3, mat=mm(k), scale=sc, flat_bottom=0.9)
        kit.smooth(b, 80)
        o.append(b)
    # coils of jasmine strings on the deck (back half)
    jas = mm('jasmine')
    for j, (x, y) in enumerate(((-1.3, 3.4), (1.2, 3.9))):
        pts = [(x + 0.55 * math.cos(t * math.tau / 7), y + 0.55 * math.sin(t * math.tau / 7), D + 0.15 + 0.05 * t) for t in range(15)]
        o.append(tb('coil', pts, 0.13, jas, seg=4, cap=False))
    # small canopy over the back half: 4 poles + slanted tarpaulin
    pole = mm('iron_black')
    for x, y, h in ((-2.45, 0.4, 10.0), (2.45, 0.4, 10.0), (-2.45, 5.0, 9.2), (2.45, 5.0, 9.2)):
        o.append(bx('pole', (0.12, 0.12, h - D), (x, y, D), pole))
    tarp = bx('tarp', (5.6, 5.4, 0.08), (0, 0, 0), mm('tarpaulin_blue'), base=False)
    o.append(P.xform(tarp, (0, 2.7, 9.65), (math.atan2(0.8, 4.6), 0, 0)))
    o.append(bx('beam', (5.2, 0.14, 0.14), (0, 0.4, 9.8), pole))
    # hanging garlands from the front beam: jasmine strings and marigold malas
    for i, x in enumerate((-2.1, -1.4, -0.7, 0.0, 0.7, 1.4, 2.1)):
        mg = (i % 2 == 0)
        L = 2.6 + rnd.uniform(-0.4, 0.4) if not mg else 3.0
        pts = [(x - 0.25, 0.4, 9.8), (x - 0.18, 0.35, 9.8 - L * 0.6), (x, 0.32, 9.8 - L), (x + 0.18, 0.35, 9.8 - L * 0.6), (x + 0.25, 0.4, 9.8)]
        o.append(tb('mala', pts, 0.2 if mg else 0.11, mm('marigold') if mg else jas, seg=4, cap=False))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -0.5, 6.0), close_dist=19.0))


@kit.asset('cart_pani_puri', 'prop', kind='cart')
def build_cart_pani_puri(A):
    rnd = random.Random(5)
    o = cart_base('cart_red', sign_text='PANI PURI', sign_fg='#f6e04a', sign_bg='#a8342a')
    alu = mm('aluminium')
    stl = mm('steel_vessel')
    # glass display box at the front, heaped with puris
    o += glass_box('case', (4.2, 3.0, 2.3), (0, -3.2, D), alu)
    pm = mm('puri')
    hb = P.blob('puris', 1.0, (0, -3.2, D + 0.16), subdiv=1, noise=0.2, seed=2, mat=pm, scale=(1.8, 1.25, 1.2), flat_bottom=0.95)
    kit.smooth(hb, 80)
    o.append(hb)
    for i in range(10):
        a = i * 2.4
        r = 0.6 + 0.9 * rnd.random()
        x, y = math.cos(a) * r * 1.5, -3.2 + math.sin(a) * r * 0.9
        z = D + 0.16 + 1.15 * max(0.15, 1 - (x / 1.9) ** 2 - ((y + 3.2) / 1.3) ** 2) ** 0.5
        p = P.blob('puri', 0.36, (x, y, z), subdiv=1, noise=0.05, seed=i, mat=pm, scale=(1, 1, 0.8))
        o.append(P.xform(p, (0, 0, 0), (0, 0, 0)))
    # big steel pot of pani at the back + ladle
    o += pot('pani_pot', 1.25, 2.3, stl, seg=12, loc=(0.6, 1.6, D), fill=mm('pani'), fill_z=0.86, lip=1.05)
    o.append(tb('ladle', [(0.9, 1.4, D + 2.0), (1.6, 0.9, D + 3.0)], 0.06, alu, seg=4))
    # small bowls: potato masala, tamarind chutney, onion, extra puris
    for (x, y), f in (((-1.5, 0.4), 'potato'), ((-1.6, 1.9), 'tamarind'), ((-1.5, 3.3), 'onion'), ((1.4, 3.6), 'potato')):
        o.append(lat('bowl', [(0.35, 0), (0.62, 0.22), (0.68, 0.42)], stl, seg=8, loc=(x, y, D)))
        o.append(no_down(cyl('bowl_f', 0.6, 0.04, (x, y, D + 0.34), mm(f), seg=8)))
    # stack of leaf bowls (donas)
    o.append(cyl('donas', 0.5, 0.5, (0.2, -0.4, D), mm('frond_dry'), seg=8, r2=0.62))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -1.5, 5.8), close_dist=17.0))


@kit.asset('cart_samosa', 'prop', kind='cart', draw='samosa_bandi')
def build_cart_samosa(A):
    rnd = random.Random(3)
    o = cart_base('cart_sky')
    iron = mm('iron_black')
    stl = mm('steel_vessel')
    sam = mm('samosa')

    def samosa(loc, yaw, s=1.0):
        c = kit.cylinder('samosa', 0.55 * s, 0.75 * s, (0, 0, 0), seg=3, mat=sam, r2=0.0)
        no_down(c)
        o.append(P.xform(c, loc, (0, 0, yaw)))
    # stove ring + kadai of oil at the back
    kx, ky = 0.2, 2.2
    o.append(cyl('stove', 1.05, 0.8, (kx, ky, D), iron, seg=8, cap=False))
    o.append(lat('kadai', [(0.0, 0.0), (0.9, 0.18), (1.45, 0.55), (1.7, 0.85)], iron, seg=12, loc=(kx, ky, D + 0.65)))
    o.append(no_down(cyl('oil', 1.5, 0.03, (kx, ky, D + 1.2), mm('oil'), seg=12)))
    for sx in (-1, 1):
        o.append(tb('kh', [(kx + sx * 1.6, ky, D + 1.45), (kx + sx * 2.0, ky, D + 1.55)], 0.08, iron, seg=4))
    for i in range(4):
        samosa((kx + math.cos(i * 1.7) * 0.8, ky + math.sin(i * 1.7) * 0.7, D + 1.1), i * 0.9, 0.9)
    # slotted ladle (jhara)
    o.append(tb('jhara', [(kx + 0.9, ky - 0.4, D + 1.3), (kx + 2.1, ky - 1.6, D + 2.0)], 0.05, stl, seg=4))
    # glass box with a tray of samosas + mirchi bajji at the front
    o += glass_box('case', (3.6, 2.4, 1.7), (0, -3.4, D), mm('aluminium'))
    o.append(no_down(bx('tray_in', (3.2, 2.0, 0.08), (0, -3.4, D + 0.16), stl)))
    for i in range(3):
        for j in range(2):
            samosa((-1.0 + i * 1.0, -3.9 + j * 1.0, D + 0.24), rnd.uniform(0, 3), 1.0)
    # open steel tray of samosas (front of the box) for the customer
    o.append(no_down(bx('tray', (3.4, 2.0, 0.12), (0, -0.6, D), stl)))
    for i in range(4):
        for j in range(2):
            samosa((-1.2 + i * 0.8, -1.05 + j * 0.9, D + 0.12), rnd.uniform(0, 3), 1.0)
    for j in range(2):
        samosa((-0.8 + j * 1.2, -0.6, D + 0.55), rnd.uniform(0, 3), 0.95)
    # mirchi bajji pile
    baj = mm('bajji')
    for i in range(5):
        x = -1.6 + i * 0.25
        o.append(P.taper('bajji', [(x, 1.4 + i * 0.1, D + 0.25), (x + 0.15, 0.7 + i * 0.1, D + 0.3), (x + 0.1, 0.0 + i * 0.1, D + 0.2)], (0.24, 0.08), seg=5, mat=baj))
    # chutney bowl
    o.append(lat('bowl', [(0.3, 0), (0.55, 0.2), (0.6, 0.36)], stl, seg=8, loc=(1.6, 0.9, D)))
    o.append(no_down(cyl('bowl_f', 0.52, 0.04, (1.6, 0.9, D + 0.28), mm('chutney_g'), seg=8)))
    # LPG cylinder under the cart
    o += lpg((0.0, 0.3, 0.0))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -0.5, 5.4), close_dist=16.0))


@kit.asset('cart_dosa', 'prop', kind='cart', draw='dosa_bandi')
def build_cart_dosa(A):
    o = cart_base('cart_yellow', sign_text='DOSA', sign_fg='#a8241a', sign_bg='#e8c040')
    iron = mm('iron_black')
    stl = mm('steel_vessel')
    # stove frame + big flat tawa (back half), a dosa spreading on it
    tx, ty = 0.0, 1.6
    o.append(no_down(bx('stove', (2.8, 2.8, 0.75), (tx, ty, D), iron)))
    o.append(no_down(cyl('tawa', 2.2, 0.14, (tx, ty, D + 0.75), mm('cast_iron'), seg=16)))
    o.append(no_down(cyl('dosa', 1.65, 0.03, (tx - 0.15, ty - 0.1, D + 0.89), mm('dosa'), seg=14)))
    o.append(tb('spatula', [(tx + 1.3, ty + 1.1, D + 1.0), (tx + 2.3, ty + 2.2, D + 1.6)], 0.05, stl, seg=4))
    o.append(no_down(bx('spat_blade', (0.5, 0.6, 0.03), (tx + 1.15, ty + 0.95, D + 0.9), stl)))
    # batter vessels (front-left), ladle
    o += pot('batter1', 0.85, 1.4, stl, seg=10, loc=(-1.3, -1.6, D), fill=mm('batter'), fill_z=0.82)
    o += pot('batter2', 0.7, 1.1, stl, seg=10, loc=(-1.4, -3.6, D), fill=mm('batter'), fill_z=0.82)
    o.append(tb('ladle', [(-1.1, -1.7, D + 1.0), (-0.6, -2.1, D + 2.1)], 0.05, stl, seg=4))
    # chutney buckets (front-right): coconut, tomato, coriander + a sambar pot
    for (x, y), f in (((1.4, -1.0), 'chutney_w'), ((1.4, -2.4), 'chutney_r'), ((1.4, -3.8), 'chutney_g')):
        o.append(cyl('bucket', 0.55, 0.85, (x, y, D), stl, seg=8, r2=0.62, cap=False))
        o.append(no_down(cyl('bucket_f', 0.56, 0.04, (x, y, D + 0.66), mm(f), seg=8)))
    o += pot('sambar', 0.75, 1.0, mm('aluminium'), seg=10, loc=(0.1, -3.9, D), fill=mm('chutney_r', base='#b0581c'), fill_z=0.8)
    # stack of steel plates, a folded dosa on the top plate
    o.append(cyl('plates', 0.85, 0.3, (0.0, -1.5, D), mm('steel_plate'), seg=10))
    roll = P.taper('dosa_roll', [(-0.7, -1.5, D + 0.5), (0.7, -1.5, D + 0.5)], (0.26, 0.26), seg=6, mat=mm('dosa'), cap_start=True)
    o.append(roll)
    o += lpg((0.0, 0.6, 0.0))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -0.5, 5.4), close_dist=17.0))


@kit.asset('cart_coconut', 'prop', kind='cart', draw='coconut_cart')
def build_cart_coconut(A):
    rnd = random.Random(9)
    o = cart_base('cart_wood')
    prof = [(0, 0), (0.42, 0.1), (0.72, 0.55), (0.6, 1.1), (0.28, 1.42), (0, 1.5)]
    mats = [mm('coconut_g'), mm('coconut_g'), mm('coconut_y')]

    def nut(loc, s=1.0):
        c = lat('nut', prof, mats[rnd.randrange(3)], seg=6, sm=False)
        kit.smooth(c, 80)
        P.xform(c, (0, 0, -0.75), (0, 0, 0))
        P.xform(c, loc, (math.pi / 2 + rnd.uniform(-0.5, 0.5), rnd.uniform(-0.3, 0.3), rnd.uniform(0, math.tau)), (s, s, s))
        o.append(c)
    for layer, (n_x, n_y, z, dx, dy, y0) in enumerate(((3, 4, D + 0.68, 1.5, 1.55, -3.9), (2, 3, D + 1.75, 1.5, 1.55, -3.1), (1, 2, D + 2.8, 0, 1.55, -2.3))):
        for i in range(n_x):
            for j in range(n_y):
                x = (i - (n_x - 1) / 2) * dx + rnd.uniform(-0.12, 0.12)
                y = y0 + j * dy + rnd.uniform(-0.12, 0.12)
                nut((x, y, z), 1.0)
    # chopping stump + machete at the back right, a few nuts waiting
    st = cyl('stump', 0.8, 1.3, (1.1, 3.2, D), mm('stump'), seg=8)
    o.append(no_down(st))
    blade = P.xform(bx('blade', (0.08, 1.4, 0.45), (0, 0, 0), mm('blade'), base=False), (1.1, 3.0, D + 1.55), (0.5, 0, 0.3))
    o.append(blade)
    o.append(P.xform(bx('m_handle', (0.16, 0.8, 0.18), (0, 0, 0), mm('wood_raw'), base=False), (0.88, 3.8, D + 1.95), (0.5, 0, 0.3)))
    nut((-1.2, 3.0, D + 0.68), 1.0)
    nut((-1.0, 4.2, D + 0.68), 1.0)
    # gunny sack of husks hanging under? -> a heap of husks on the ground beside the wheel
    hk = P.blob('husks', 1.0, (-2.8, 3.2, 0), subdiv=1, noise=0.25, seed=4, mat=mm('frond_dry', base='#9a7a48'), scale=(0.9, 1.3, 0.6), flat_bottom=1.0)
    o.append(no_down(hk))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -0.5, 6.2), close_dist=18.0))


@kit.asset('cart_bhutta', 'prop', kind='cart')
def build_cart_bhutta(A):
    rnd = random.Random(13)
    o = cart_base('cart_wood', rails=(True, True, True))
    iron = mm('cast_iron')
    # sigdi brazier (front half): iron bowl on a slab, glowing coals, grill bars, roasting cobs
    sx, sy = 0.0, -2.4
    o.append(no_down(bx('slab', (3.2, 3.2, 0.2), (sx, sy, D), mm('concrete_old'))))
    o.append(lat('sigdi', [(0.7, 0), (0.85, 0.25), (1.35, 0.85), (1.5, 1.25), (1.45, 1.3)], iron, seg=10, loc=(sx, sy, D + 0.2), bottom=False))
    o.append(no_down(cyl('coals', 1.35, 0.06, (sx, sy, D + 1.25), mm('ember'), seg=10)))
    for i in range(4):
        a = i * 1.6
        c = P.blob('coal', 0.3, (sx + math.cos(a) * 0.8, sy + math.sin(a) * 0.7, D + 1.32), subdiv=0, noise=0.2, seed=i, mat=mm('coal'))
        o.append(c)
    for k in (-0.6, 0.0, 0.6):
        o.append(bx('grill', (3.2, 0.08, 0.08), (sx, sy + k, D + 1.45), mm('iron_black'), base=False))
    for i in range(5):
        x = sx - 1.0 + i * 0.5
        y0 = sy + rnd.uniform(-0.15, 0.15)
        o.append(P.taper('cob_r', [(x, y0 - 0.95, D + 1.62), (x + 0.03, y0, D + 1.68), (x, y0 + 0.95, D + 1.62)], [0.22, 0.29, 0.2], seg=6, mat=mm('corn_roast'), cap_start=True))
    # pile of fresh cobs in green husks (back half)
    for i in range(11):
        row = i // 4
        x = -1.6 + (i % 4) * 1.05 + rnd.uniform(-0.1, 0.1) + (0.5 if row == 1 else 0)
        y = 1.0 + row * 0.45 + rnd.uniform(-0.2, 0.2)
        z = D + 0.35 + row * 0.42
        ang = rnd.uniform(-0.25, 0.25)
        d = V((math.sin(ang), math.cos(ang), 0)) * 1.15
        p0 = V((x, y, z)) - d
        o.append(P.taper('cob', [p0, V((x, y, z)), V((x, y, z)) + d * 1.25], [0.28, 0.36, 0.06], seg=5, mat=mm('corn_husk'), cap_start=True))
    # two peeled cobs ready to roast + lemon & salt bowl, palm-leaf hand fan
    for k in range(2):
        o.append(P.taper('cob_y', [(1.2 + k * 0.6, 3.2, D + 0.3), (1.2 + k * 0.6, 4.4, D + 0.3)], [0.27, 0.24], seg=6, mat=mm('corn'), cap_start=True))
    o.append(lat('bowl', [(0.3, 0), (0.5, 0.18), (0.55, 0.32)], mm('steel_vessel'), seg=8, loc=(-1.6, 3.6, D)))
    o.append(no_down(cyl('salt', 0.48, 0.04, (-1.6, 3.6, D + 0.26), mm('chutney_r', base='#c86a3a'), seg=8)))
    for k in range(2):
        o.append(no_down(cyl('lemon', 0.22, 0.14, (-0.8 + k * 0.45, 3.3, D), mm('lemon'), seg=6)))
    fan = P.xform(bx('fan', (1.1, 1.1, 0.04), (0, 0, 0), mm('palm_fan'), base=False), (1.8, -0.4, D + 0.1), (0, 0, 0.5))
    o.append(fan)
    o.append(tb('fan_h', [(1.4, 0.05, D + 0.1), (1.0, 0.6, D + 0.1)], 0.06, mm('wood_raw'), seg=4))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -1.0, 5.6), close_dist=16.0))


@kit.asset('cart_chai', 'prop', kind='cart', draw='chai_bandi')
def build_cart_chai(A):
    o = cart_base('cart_green', sign_text='CHAI', sign_fg='#ffffff', sign_bg='#2f7a4a')
    alu = mm('aluminium')
    stl = mm('steel_vessel')
    brass = mm('brass')
    # kerosene pressure stove (brass) + big aluminium kettle (back centre)
    kx, ky = 0.3, 1.9
    o.append(cyl('tank', 0.75, 0.6, (kx, ky, D), brass, seg=8))
    for a in (0.3, 2.4, 4.5):
        o.append(bx('leg', (0.1, 0.1, 0.8), (kx + math.cos(a) * 0.7, ky + math.sin(a) * 0.7, D + 0.4), mm('iron_black')))
    o.append(no_down(cyl('burner', 0.35, 0.25, (kx, ky, D + 0.6), mm('iron_black'), seg=6)))
    kz = D + 1.15
    o.append(lat('kettle', [(0.85, 0), (1.05, 0.3), (1.05, 0.9), (0.75, 1.35), (0.35, 1.5), (0.0, 1.55)], alu, seg=10, loc=(kx, ky, kz), bottom=True))
    o.append(P.taper('spout', [(kx - 0.9, ky, kz + 0.45), (kx - 1.4, ky - 0.05, kz + 0.9), (kx - 1.75, ky - 0.1, kz + 1.4)], (0.17, 0.08), seg=5, mat=alu))
    o.append(tb('k_handle', [(kx + 0.5, ky - 0.3, kz + 1.3), (kx + 0.55, ky, kz + 2.05), (kx + 0.5, ky + 0.3, kz + 1.3)], 0.07, mm('plastic_black'), seg=4))
    # milk / tea saucepan (patila) with a long handle, and a steel milk pot
    o += pot('patila', 0.85, 0.9, alu, seg=10, loc=(-1.4, 3.6, D), fill=mm('chai'), fill_z=0.8)
    o.append(tb('pat_h', [(-0.6, 3.6, D + 0.8), (0.6, 3.9, D + 1.0)], 0.06, alu, seg=4))
    o += pot('milk', 0.75, 1.5, stl, seg=10, loc=(1.5, 3.8, D), fill=mm('batter', base='#f4f0e4'), fill_z=0.86)
    # tray of cutting-chai glasses (front centre)
    o.append(no_down(bx('tray', (2.4, 1.4, 0.1), (0.0, -1.2, D), stl)))
    gm = mm('chai')
    for i in range(4):
        for j in range(2):
            o.append(no_down(cyl('glass', 0.22, 0.55, (-0.85 + i * 0.57, -1.5 + j * 0.6, D + 0.1), gm, seg=6, r2=0.27)))
    # glass jars of biscuits (front corners)
    for x, b in ((-1.4, 'biscuit'), (1.4, 'biscuit')):
        o.append(lat('jar', [(0.62, 0), (0.68, 0.15), (0.68, 1.35), (0.5, 1.55)], glass(), seg=8, loc=(x, -3.6, D), sm=True))
        for k in range(5):
            o.append(no_down(cyl('bisc', 0.5, 0.13, (x + (0.05 if k % 2 else -0.05), -3.6, D + 0.05 + k * 0.2), mm(b), seg=8)))
        o.append(cyl('jar_lid', 0.56, 0.2, (x, -3.6, D + 1.52), mm('lid_red'), seg=8))
    # stack of rusks / bun on a plate
    o.append(cyl('plate', 0.8, 0.06, (0.0, -3.9, D), mm('steel_plate'), seg=10))
    o.append(P.blob('buns', 0.5, (0.0, -3.9, D + 0.3), subdiv=1, noise=0.1, seed=1, mat=mm('biscuit', base='#c8843a'), scale=(1.1, 1.0, 0.55)))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -0.5, 5.6), close_dist=16.0))


@kit.asset('cart_ice_gola', 'prop', kind='cart')
def build_cart_ice_gola(A):
    o = cart_base('cart_pink', sign_text='ICE GOLA', sign_fg='#ffffff', sign_bg='#3b8cc4')
    # ice slab on a gunny cloth, wooden hand shaver on top (back centre)
    o.append(no_down(bx('gunny', (2.8, 2.4, 0.08), (0, 2.4, D), mm('jute'))))
    ice = bx('ice', (2.2, 1.8, 1.4), (0, 2.4, D + 0.08), mm('ice'))
    kit.bevel_mod(ice, 0.12, 1)
    o.append(no_down(ice))
    o.append(bx('shaver', (1.0, 0.6, 0.35), (0.1, 2.3, D + 1.48), mm('wood_raw')))
    o.append(bx('shaver_b', (0.9, 0.5, 0.06), (0.1, 2.3, D + 1.83), mm('blade')))
    o.append(tb('shaver_h', [(0.1, 2.3, D + 1.85), (0.1, 2.3, D + 2.4)], 0.09, mm('wood_raw'), seg=5))
    # bowl of shaved ice
    o.append(lat('bowl', [(0.35, 0), (0.6, 0.25), (0.65, 0.42)], mm('steel_vessel'), seg=8, loc=(-1.6, 3.9, D)))
    o.append(P.blob('snow', 0.55, (-1.6, 3.9, D + 0.4), subdiv=1, noise=0.15, seed=2, mat=mm('snow'), scale=(1, 1, 0.6)))
    # stepped rack of syrup bottles facing the customer
    o.append(no_down(bx('rack', (4.4, 1.0, 0.35), (0, -2.9, D), mm('cart_wood'))))
    o.append(no_down(bx('rack2', (4.4, 1.0, 0.7), (0, -2.0, D), mm('cart_wood'))))
    prof = [(0.3, 0), (0.3, 0.95), (0.13, 1.3), (0.11, 1.55), (0.0, 1.58)]
    for i, k in enumerate(('syrup_r', 'syrup_g', 'syrup_o', 'syrup_k', 'syrup_p')):
        o.append(lat('bottle', prof, mm(k), seg=6, loc=(-1.7 + i * 0.85, -2.9, D + 0.35), top=True))
    for i, k in enumerate(('syrup_o', 'syrup_r', 'syrup_g', 'syrup_r')):
        o.append(lat('bottle', prof, mm(k), seg=6, loc=(-1.3 + i * 0.85, -2.0, D + 0.7), top=True))
    # finished golas on sticks in a holder (front left) + spare ice cones
    o.append(cyl('holder', 0.45, 0.6, (1.6, -4.2, D), mm('thermocol'), seg=6))
    for i, (k, dx, dy) in enumerate((('syrup_r', -0.2, 0.0), ('syrup_o', 0.2, 0.1), ('syrup_g', 0.0, -0.2))):
        x, y = 1.6 + dx, -4.2 + dy
        o.append(bx('stick', (0.06, 0.06, 0.9), (x, y, D + 0.6), mm('wood_raw')))
        g = P.blob('gola', 0.42, (x, y, D + 1.65), subdiv=1, noise=0.1, seed=i, mat=mm(k), scale=(1, 1, 1.25))
        o.append(g)
    # bell on the handle grip
    o.append(lat('bell', [(0.32, 0), (0.22, 0.25), (0.12, 0.45), (0.0, 0.5)], mm('brass'), seg=8, loc=(1.2, CL / 2 + 2.4, 4.0), top=True))
    o.append(tb('bell_s', [(1.2, CL / 2 + 2.4, 4.5), (1.2, CL / 2 + 2.4, 4.7)], 0.03, mm('iron_black'), seg=4, cap=False))
    cart_anchors(A)
    finish(A, o, 256, cart_shots(close_target=(0, -1.0, 5.8), close_dist=16.0))


# =========================================================================== street furniture
@kit.asset('booth_std', 'prop', kind='booth', draw='std_booth')
def build_booth_std(A):
    W, Dp = 6.0, 5.0
    yel, red = mm('booth_yellow'), mm('booth_red')
    o = []
    o.append(no_down(bx('plinth', (W + 0.4, Dp + 0.4, 0.5), (0, 0, 0), mm('concrete'))))
    z0, zg, zt = 0.5, 3.4, 10.6
    # lower panels (hollow) and corner posts
    for sy in (-1, 1):
        o.append(bx('panel', (W, 0.15, zg - z0), (0, sy * (Dp / 2 - 0.075), z0), yel))
    for sx in (-1, 1):
        o.append(bx('panel', (0.15, Dp, zg - z0), (sx * (W / 2 - 0.075), 0, z0), yel))
        for sy in (-1, 1):
            o.append(bx('post', (0.3, 0.3, zt - z0), (sx * (W / 2 - 0.15), sy * (Dp / 2 - 0.15), z0), yel))
    # glass upper with rails; the front is a glass door with a handle
    o.append(bx('glass', (W - 0.3, Dp - 0.3, zt - zg), (0, 0, zg), glass(0.3, '#b8d4dc')))
    for sy in (-1, 1):
        o.append(bx('rail', (W, 0.2, 0.2), (0, sy * (Dp / 2 - 0.1), zg - 0.1), yel))
    for sx in (-1, 1):
        o.append(bx('rail', (0.2, Dp, 0.2), (sx * (W / 2 - 0.1), 0, zg - 0.1), yel))
        o.append(bx('mull', (0.14, 0.14, zt - zg), (sx * (W / 2 - 0.08), 0, zg), yel))
    o.append(bx('mull_f', (0.14, 0.14, zt - zg), (-0.4, -(Dp / 2 - 0.1), zg), yel))
    o.append(tb('door_h', [(-0.15, -Dp / 2 - 0.1, 6.0), (-0.15, -Dp / 2 - 0.1, 7.6)], 0.06, mm('chrome'), seg=4))
    # roof slab + sign box on top (STD ISD PCO, red on yellow, front and back)
    o.append(bx('roof', (W + 0.5, Dp + 0.5, 0.45), (0, 0, zt), red))
    for rz, sy in ((0.0, -1), (math.pi, 1)):
        o.append(sign('sign', 'STD ISD PCO', W + 0.2, 2.0, (0, sy * (Dp / 2 - 0.4), zt + 0.45 + 1.0), fg='#c41e1a', bg='#f4c42a', frame=yel, rotz=rz, px=512, depth=0.15))
    o.append(bx('sign_core', (W + 0.2, Dp - 1.0, 2.0), (0, 0, zt + 0.45), yel))
    for sx in (-1, 1):
        o.append(P.xform(sign('sign_s', 'STD', Dp - 0.6, 2.0, (0, 0, 0), fg='#c41e1a', bg='#f4c42a', frame=yel, px=256, depth=0.1),
                         (sx * (W / 2 + 0.12), 0, zt + 0.45 + 1.0), (0, 0, -sx * math.pi / 2)))
    # inside: shelf, push-button phone, pulse meter, stool
    o.append(bx('shelf', (W - 0.4, 1.4, 0.15), (0, Dp / 2 - 0.85, 5.6), mm('wood_raw')))
    o.append(bx('phone', (1.2, 0.9, 0.45), (-0.6, Dp / 2 - 0.9, 5.75), mm('phone_cream')))
    o.append(tb('receiver', [(-1.05, Dp / 2 - 0.95, 6.3), (-0.15, Dp / 2 - 0.95, 6.3)], 0.14, mm('phone_cream'), seg=5))
    o.append(bx('meter', (0.9, 0.5, 0.6), (0.9, Dp / 2 - 0.9, 5.75), mm('meter')))
    o.append(P.xform(sign('meter_d', '0042', 0.7, 0.3, (0, 0, 0), fg='#ff3a1a', bg='#140808', frame=mm('meter'), px=128, depth=0.04), (0.9, Dp / 2 - 1.17, 6.1)))
    o.append(tb('cord', [(-0.6, Dp / 2 - 0.9, 5.9), (-1.0, Dp / 2 - 1.3, 6.0), (-1.05, Dp / 2 - 0.95, 6.2)], 0.04, mm('plastic_black'), seg=4, cap=False))
    o.append(cyl('stool', 0.6, 2.4, (0.3, 0.2, z0), mm('cart_blue'), seg=8, r2=0.5))
    A.anchor('phone', (-0.6, Dp / 2 - 0.9, 6.3))
    A.anchor('caller', (0, 0.4, z0))
    A.anchor('door', (0, -Dp / 2 - 1.0, 0))
    finish(A, o, 256, [view(-35, 22), view(-15, 30, target=(0, 0.5, 6.2), dist=16.0, name='inside')])


@kit.asset('bus_shelter', 'prop', kind='shelter', draw='bus_stop')
def build_bus_shelter(A):
    L, Dp = 24.0, 8.0
    stl = mm('steel_green')
    o = []
    pl = no_down(bx('platform', (L, Dp, 0.6), (0, 0, 0), mm('concrete_old')))
    o.append(pl)
    xs = (-10.5, -3.5, 3.5, 10.5)
    # columns: back (taller) + front
    for x in xs:
        o.append(cyl('col_b', 0.22, 11.2, (x, 3.2, 0.6), stl, seg=6, cap=False))
        o.append(cyl('col_f', 0.2, 10.7, (x, -3.0, 0.6), stl, seg=6, cap=False))

    def roof_z(y):
        return 11.3 + 1.1 * (1 - (y / 4.6) ** 2)
    # roof: lapped asbestos sheets on a barrel curve (6 sheets, each a thin curved slab)
    nseg = 6
    for i in range(6):
        x0 = -L / 2 - 0.5 + i * (L + 1.0) / 6
        x1 = x0 + (L + 1.0) / 6 + 0.15
        dz = 0.05 * (i % 2)
        bm = bmesh.new()
        top = []
        bot = []
        for j in range(nseg + 1):
            y = -4.6 + 9.2 * j / nseg
            z = roof_z(y) + dz
            top.append((bm.verts.new((x0, y, z + 0.08)), bm.verts.new((x1, y, z + 0.08))))
            bot.append((bm.verts.new((x0, y, z - 0.08)), bm.verts.new((x1, y, z - 0.08))))
        for j in range(nseg):
            bm.faces.new((top[j][0], top[j][1], top[j + 1][1], top[j + 1][0]))
            bm.faces.new((bot[j][0], bot[j + 1][0], bot[j + 1][1], bot[j][1]))
            bm.faces.new((top[j][0], top[j + 1][0], bot[j + 1][0], bot[j][0]))
            bm.faces.new((top[j][1], bot[j][1], bot[j + 1][1], top[j + 1][1]))
        for j in (0, nseg):
            bm.faces.new((top[j][0], bot[j][0], bot[j][1], top[j][1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        sh = kit.obj_from_bm(bm, 'sheet', mm('asbestos'))
        o.append(sh)
    # curved beams under the roof at the columns
    for x in xs:
        pts = [(x, -4.4 + 8.8 * j / 5, roof_z(-4.4 + 8.8 * j / 5) - 0.3) for j in range(6)]
        o.append(tb('beam', pts, 0.16, stl, seg=4, cap=True))
    o.append(bx('purlin_f', (L, 0.2, 0.25), (0, -3.0, 11.0), stl))
    o.append(bx('purlin_b', (L, 0.2, 0.25), (0, 3.2, 11.0), stl))
    # back wall: low painted sheet panel + a cement bench on pedestals
    o.append(bx('wall', (L - 1.0, 0.15, 4.4), (0, 3.45, 0.6), mm('paint_white')))
    o.append(bx('wall_top', (L - 1.0, 0.25, 0.2), (0, 3.45, 5.0), stl))
    o.append(bx('bench', (19.0, 1.8, 0.3), (0, 2.2, 2.6), mm('concrete')))
    for x in (-8.5, -3.0, 3.0, 8.5):
        o.append(bx('ped', (0.5, 1.3, 2.0), (x, 2.3, 0.6), mm('concrete')))
    # fascia sign (BUS STOP) along the front + route board on the left column
    o.append(sign('fascia', 'BUS STOP', 9.0, 1.4, (0, -3.25, 10.2), fg='#ffffff', bg='#1f4f8f', frame=stl, px=512, depth=0.12))
    o.append(sign('routes', '5K  8A  49M  127K', 3.6, 1.6, (-10.5, -3.35, 7.4), fg='#1a1a1a', bg='#f2ede0', frame=stl, px=256, depth=0.08))
    A.anchor('bench', (0, 2.2, 2.9))
    A.anchor('wait', (0, -1.5, 0.6))
    A.anchor('kerb', (0, -Dp / 2 - 1.0, 0))
    finish(A, o, 256, [view(-30, 20), view(-10, 12, target=(0, -2.0, 6.5), dist=26.0, name='front')])


@kit.asset('sign_auto_stand', 'prop', kind='sign')
def build_sign_auto_stand(A):
    o = []
    o.append(no_down(cyl('foot', 0.5, 0.6, (0, 0, 0), mm('concrete'), seg=6)))
    # pole: black / white bands at the bottom, plain galvanised above
    for i in range(4):
        o.append(cyl('band', 0.13, 0.75, (0, 0, 0.6 + i * 0.75), mm('pole_black' if i % 2 else 'pole_white'), seg=6, cap=False))
    o.append(cyl('pole', 0.13, 12.0 - 3.6, (0, 0, 3.6), mm('galvanised'), seg=6))
    o.append(sign('board', 'AUTO STAND', 5.2, 2.2, (0, -0.2, 10.4), fg='#141414', bg='#f2c020', frame=mm('paint_yellow'), px=512, depth=0.1))
    for z in (9.7, 11.1):
        o.append(bx('clamp', (0.4, 0.25, 0.14), (0, -0.12, z), mm('iron_black'), base=False))
    A.anchor('sign', (0, -0.3, 10.4))
    finish(A, o, 128, [view(-30, 14), view(0, 8, target=(0, 0, 10.4), dist=11.0, name='board')])


@kit.asset('podium_umbrella', 'prop', kind='podium', replaces='podium')
def build_podium_umbrella(A):
    o = []
    yel, blk = mm('plinth_yellow'), mm('plinth_black')
    conc = mm('concrete')
    s1 = no_down(kit.cylinder('step1', 3.0, 0.9, (0, 0, 0), seg=16, mat=yel))
    stripes(s1, [yel, blk], conc, n=16)
    s2 = no_down(kit.cylinder('step2', 2.2, 1.1, (0, 0, 0.9), seg=16, mat=yel))
    stripes(s2, [blk, yel], conc, n=16)
    o += [s1, s2]
    o.append(cyl('pole', 0.14, 10.6, (0, 0, 2.0), mm('pole_white'), seg=6))
    # canopy: 12 alternating red / white gores, a flipped underside, a scalloped valance
    red, wht = mm('traffic_red'), mm('traffic_white')
    can = kit.cylinder('canopy', 4.3, 2.2, (0, 0, 10.6), seg=12, mat=red, r2=0.15, cap=False)
    stripes(can, [red, wht], n=12)
    under = kit.cylinder('canopy_u', 4.25, 2.1, (0, 0, 10.55), seg=12, mat=wht, r2=0.15, cap=False)
    stripes(under, [red, wht], n=12)
    drop(under, lambda f: False)
    for p in under.data.polygons:
        p.flip()
    o += [can, under]
    val = kit.cylinder('valance', 4.3, 0.55, (0, 0, 10.05), seg=12, mat=red, cap=False)
    stripes(val, [red, wht], n=12)
    val_in = kit.cylinder('valance_i', 4.27, 0.55, (0, 0, 10.05), seg=12, mat=red, cap=False)
    stripes(val_in, [red, wht], n=12)
    for p in val_in.data.polygons:
        p.flip()
    o += [val, val_in]
    o.append(cyl('finial', 0.18, 0.5, (0, 0, 12.75), mm('pole_white'), seg=6, r2=0.05))
    # TRAFFIC POLICE board on the pole (both sides)
    for rz, sy in ((0.0, -1), (math.pi, 1)):
        o.append(sign('tp', 'TRAFFIC POLICE', 3.4, 0.8, (0, sy * 0.2, 7.6), fg='#1a3a8a', bg='#f4f4ee', frame=mm('pole_white'), rotz=rz, px=512, depth=0.06))
    A.anchor('officer', (0, 0, 2.0))
    finish(A, o, 256, [view(-30, 22), view(-20, 55, name='top')])


@kit.asset('irani_chair', 'prop', kind='furniture')
def build_irani_chair(A):
    wd = mm('bentwood')
    o = []
    zs = 2.3
    # seat rim ring + cane seat
    ring = [(math.cos(t * math.tau / 10) * 0.98, math.sin(t * math.tau / 10) * 0.98, zs) for t in range(11)]
    o.append(tb('rim', ring, 0.09, wd, seg=4, cap=False))
    o.append(no_down(cyl('seat', 0.95, 0.07, (0, 0, zs - 0.02), mm('cane'), seg=10)))
    # front legs (splayed, tapered)
    for sx in (-1, 1):
        o.append(P.taper('fleg', [(sx * 0.95, -0.95, 0), (sx * 0.72, -0.7, zs)], (0.07, 0.1), seg=5, mat=wd, cap_end=False))
    # rear legs that continue up into the back bow (one bent piece), and the inner bow
    pts = [(-0.9, 1.15, 0), (-0.68, 0.72, zs - 0.1), (-0.62, 0.86, 3.3), (-0.55, 1.05, 4.1), (-0.3, 1.12, 4.45),
           (0.3, 1.12, 4.45), (0.55, 1.05, 4.1), (0.62, 0.86, 3.3), (0.68, 0.72, zs - 0.1), (0.9, 1.15, 0)]
    o.append(P.taper('bow', pts, [0.08, 0.1, 0.09, 0.085, 0.08, 0.08, 0.085, 0.09, 0.1, 0.08], seg=5, mat=wd, cap_end=False))
    inner = [(-0.45, 0.82, zs + 0.05), (-0.42, 0.96, 3.3), (-0.2, 1.02, 3.75), (0.2, 1.02, 3.75), (0.42, 0.96, 3.3), (0.45, 0.82, zs + 0.05)]
    o.append(P.taper('bow_in', inner, (0.06, 0.06), seg=4, mat=wd, cap_end=False))
    # leg ring brace
    br = [(math.cos(t * math.tau / 8) * 0.8, math.sin(t * math.tau / 8) * 0.82, 0.85) for t in range(9)]
    o.append(tb('brace', br, 0.05, wd, seg=4, cap=False))
    A.anchor('seat', (0, 0, zs + 0.05))
    finish(A, o, 128, [view(-35, 18)])


@kit.asset('irani_table', 'prop', kind='furniture')
def build_irani_table(A):
    o = []
    top = cyl('top', 2.0, 0.16, (0, 0, 3.62), mm('marble'), seg=16)
    o.append(top)
    o.append(no_down(cyl('apron', 1.5, 0.1, (0, 0, 3.52), mm('cast_iron'), seg=12)))
    o.append(lat('column', [(0.42, 0.25), (0.2, 0.55), (0.13, 1.0), (0.12, 2.8), (0.22, 3.15), (0.55, 3.52), (0.0, 3.53)], mm('cast_iron'), seg=8, top=True))
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        d = V((math.cos(a), math.sin(a), 0))
        o.append(P.taper('foot', [d * 0.2 + V((0, 0, 0.45)), d * 0.8 + V((0, 0, 0.18)), d * 1.25 + V((0, 0, 0.05))], (0.14, 0.07), seg=4, mat=mm('cast_iron'), squash=0.7))
    A.anchor('top', (0, 0, 3.78))
    finish(A, o, 128, [view(-35, 25)])


@kit.asset('irani_biscuit_jar', 'prop', kind='furniture')
def build_irani_biscuit_jar(A):
    o = []
    o.append(lat('jar', [(0.58, 0.0), (0.64, 0.08), (0.64, 1.08), (0.5, 1.22), (0.46, 1.28)], glass(0.22, '#d0e2e4'), seg=10))
    bm = mm('biscuit')
    for k in range(4):
        o.append(cyl('bisc', 0.27, 0.1, (-0.24 + (0.03 if k % 2 else 0), 0.05, 0.03 + k * 0.105), bm, seg=8))
        o.append(cyl('bisc', 0.27, 0.1, (0.24, -0.05 + (0.03 if k % 2 else 0), 0.03 + k * 0.105), bm, seg=8))
    o.append(P.xform(cyl('bisc_e', 0.27, 0.1, (0, 0, 0), bm, seg=8, axis='Y', base=False), (0.0, 0.25, 0.75), (0, 0, 0.4)))
    o.append(P.xform(cyl('bisc_e', 0.27, 0.1, (0, 0, 0), bm, seg=8, axis='X', base=False), (-0.05, -0.2, 0.72), (0, 0.3, 0)))
    o.append(lat('lid', [(0.5, 1.24), (0.53, 1.32), (0.36, 1.42), (0.14, 1.47), (0.12, 1.56), (0.0, 1.6)], mm('aluminium'), seg=10, top=True, bottom=True))
    A.anchor('top', (0, 0, 1.6))
    finish(A, o, 128, [view(-30, 25)])


@kit.asset('kirana_counter', 'prop', kind='shop')
def build_kirana_counter(A):
    rnd = random.Random(21)
    W = 12.0
    o = []
    cw = mm('counter_wood')
    cp = mm('counter_paint')
    o.append(no_down(bx('counter', (W, 3.0, 3.6), (0, 0.5, 0), cp)))
    o.append(bx('ctop', (W + 0.3, 3.4, 0.22), (0, 0.5, 3.6), cw))
    o.append(no_down(bx('plinth', (W + 0.1, 3.1, 0.35), (0, 0.5, 0), cw)))
    for i in range(4):
        o.append(bx('panel', (2.4, 0.08, 2.2), (-4.35 + i * 2.9, -1.02, 0.75), cw))
    # tilted sweet jars on a two-step rack along the front edge (lids toward the customer)
    o.append(bx('rack', (8.2, 1.0, 0.45), (-1.3, -0.3, 3.82), cw))
    sweets = ['sweet_r', 'sweet_o', 'sweet_g', 'sweet_b', 'sweet_y', 'sweet_m']
    lids = ['lid_red', 'lid_yellow', 'lid_blue']
    jprof = [(0.5, 0.0), (0.56, 0.12), (0.56, 1.35), (0.42, 1.5)]
    for i in range(6):
        x = -4.6 + i * 1.32
        y, z = -0.55, 3.82 + 0.45
        tilt = 0.45
        parts = [lat('jar', jprof, glass(0.25, '#d0e4e6'), seg=7, bottom=False),
                 no_down(cyl('candy', 0.5, 1.0, (0, 0, 0.05), mm(sweets[i]), seg=7)),
                 cyl('jlid', 0.47, 0.24, (0, 0, 1.45), mm(lids[i % 3]), seg=7)]
        for p in parts:
            o.append(P.xform(p, (x, y, z + 0.1), (tilt, 0, rnd.uniform(-0.05, 0.05))))
    # balance scale on the right end of the counter
    sx, sy, sz = 4.4, 0.0, 3.82
    o.append(no_down(bx('sc_base', (0.7, 0.7, 0.2), (sx, sy, sz), mm('brass'))))
    o.append(bx('sc_post', (0.12, 0.12, 2.1), (sx, sy, sz + 0.2), mm('brass')))
    o.append(bx('sc_beam', (2.6, 0.1, 0.12), (sx, sy, sz + 2.3), mm('brass')))
    for k in (-1, 1):
        px = sx + k * 1.2
        o.append(lat('pan', [(0.0, 0.0), (0.5, 0.06), (0.65, 0.2)], mm('brass'), seg=8, loc=(px, sy, sz + 0.55)))
        for a in (0.0, 2.1, 4.2):
            o.append(tb('str', [(px + math.cos(a) * 0.55, sy + math.sin(a) * 0.55, sz + 0.75), (px, sy, sz + 2.3)], 0.025, mm('iron_black'), seg=3, cap=False))
    o.append(no_down(cyl('wt', 0.2, 0.3, (sx - 1.0, sy - 0.9, sz), mm('cast_iron'), seg=6)))
    o.append(no_down(cyl('wt', 0.15, 0.22, (sx - 0.5, sy - 0.95, sz), mm('cast_iron'), seg=6)))
    # jute sacks with rolled-down tops in front of the counter: rice, toor dal, sugar, rice
    sprof = [(0.85, 0.0), (1.05, 0.35), (1.08, 1.2), (1.0, 1.75), (1.16, 1.9), (1.08, 2.1), (0.9, 2.02)]
    for i, (f, x) in enumerate((('rice', -4.2), ('dal', -1.6), ('sugar', 1.0), ('rice', 3.6))):
        y = -2.4 + rnd.uniform(-0.15, 0.15)
        o.append(lat('sack', sprof, mm('jute'), seg=8, loc=(x, y, 0)))
        o.append(cyl('fill', 0.95, 0.4, (x, y, 1.85), mm(f), seg=8, r2=0.35))
        if i == 1:
            o.append(tb('scoop', [(x + 0.2, y, 2.2), (x + 0.6, y - 0.3, 2.9)], 0.07, mm('steel_vessel'), seg=4))
    A.anchor('vendor', (0, 3.2, 0))
    A.anchor('customer', (0, -4.4, 0))
    A.anchor('counter', (0, 0.5, 3.82))
    finish(A, o, 256, [view(-30, 26), view(-15, 30, target=(-1.0, -1.0, 3.5), dist=16.0, name='close')])
