"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

MODERN + NORTH group: Cyber Towers, a HITEC office block with a tower crane, the old Begumpet
airport (terminal, ATC tower, a parked turboprop), Osmania University Arts College and the
Spanish Mosque. Low-poly silhouettes; window bands, mullions and ribbon glazing are painted by
procedural materials (`facade()`) and baked into each asset's single atlas, so they cost no
triangles. Night: a few `@night` lamp strips (lit offices, cab glazing, obstruction lights).
"""
import math
import bmesh
from mathutils import Vector
import kit
import _lmkit as L
from kit import box, cylinder, lathe, prism_from_outline, arch_outline

PI = math.pi


# =========================================================================== private helpers
def facade(name, base='#e6eaea', glass='#3f7f8f', glass2=None, period=15.0, z0=0.0, z1=1e4, band=(0.0, 3.6),
           mull=None, horiz='box', R=1.0, key='whitewash', rows=None, arch=None, frame=None, hoff=0.0, **over):
    """A painted curtain-wall / window material (baked, costs no triangles): `base` everywhere and,
    between z0..z1, in every storey (period):
      ribbon (default): `glass` except the spandrel strip band=(lo, hi) (u above the storey line);
      rows=(spacing, width): only windows of that width along the facade;
      arch=(spacing, width, sill, spring, kind, rise): arched windows (kind 'round' | 'horseshoe' |
      'pointed'), frame=(thickness, colour) paints a surround.
    mull=(spacing, width, colour) paints vertical mullions over the glass. The horizontal
    coordinate is x + y ('box', axis-aligned facades) or the arc length round Z ('radial', radius
    R), shifted by hoff. glass2 brightens the top of each pane (sky reflection)."""
    over.setdefault('rough', 0.8)
    over.setdefault('grain', 0.02)
    m = kit.material(key, name, base=base, **over)
    if m.get('nos_facade'):
        return m
    m['nos_facade'] = True
    nt = m.node_tree
    B = kit.NodeBuilder(m)
    alb = nt.nodes['NOS_ALBEDO']
    src = alb.inputs[0].links[0].from_socket
    coord = nt.nodes['NOS_COORD'].outputs[0]
    sep = B.node('ShaderNodeSeparateXYZ')
    B.link(coord, sep.inputs[0])
    z = sep.outputs[2]
    M_ = B.math
    # storey-local height u in [0, period)
    u = M_('MULTIPLY', M_('FRACT', M_('DIVIDE', M_('SUBTRACT', z, z0), period)), period)
    rng = M_('MULTIPLY', M_('GREATER_THAN', z, z0), M_('LESS_THAN', z, z1))
    if horiz == 'radial':
        h = M_('MULTIPLY', M_('ARCTAN2', sep.outputs[1], sep.outputs[0]), R)
    else:
        h = M_('ADD', sep.outputs[0], sep.outputs[1])
    h = M_('SUBTRACT', h, hoff)

    def arch_mask(sp, hw, sill, spring, kind, rise, grow=0.0):
        d = M_('SUBTRACT', M_('MULTIPLY', M_('FRACT', M_('DIVIDE', h, sp)), sp), sp / 2.0)
        ad = M_('ABSOLUTE', d)
        hw = hw + grow
        rect = M_('MULTIPLY', M_('MULTIPLY', M_('GREATER_THAN', u, sill - grow), M_('LESS_THAN', u, spring)), M_('LESS_THAN', ad, hw))
        du = M_('SUBTRACT', u, spring)
        if kind == 'pointed':
            lim = M_('SUBTRACT', hw, M_('MULTIPLY', du, hw / max(0.1, rise)))
            top = M_('MULTIPLY', M_('GREATER_THAN', du, -0.001), M_('LESS_THAN', ad, lim))
        else:
            Rr = hw * (1.18 if kind == 'horseshoe' else 1.0)
            r2 = M_('ADD', M_('MULTIPLY', d, d), M_('MULTIPLY', du, du))
            top = M_('MULTIPLY', M_('LESS_THAN', r2, Rr * Rr), M_('GREATER_THAN', u, sill - grow))
        return M_('MULTIPLY', M_('MAXIMUM', rect, top), rng)

    col = src
    if arch:
        sp, w, sill, spring = arch[:4]
        kind = arch[4] if len(arch) > 4 else 'round'
        rise = arch[5] if len(arch) > 5 else w
        if frame:
            ff = arch_mask(sp, w / 2.0, sill, spring, kind, rise + frame[0], grow=frame[0])
            col = B.mix(ff, col, B.rgb(kit.lin(frame[1])))
        fac = arch_mask(sp, w / 2.0, sill, spring, kind, rise)
    else:
        inband = M_('MULTIPLY', M_('GREATER_THAN', u, band[1]), M_('LESS_THAN', u, period - band[0] if band[0] > 0 else period + 1))
        fac = M_('MULTIPLY', inband, rng)
        if rows:
            v = M_('MULTIPLY', M_('FRACT', M_('DIVIDE', h, rows[0])), rows[0])
            fac = M_('MULTIPLY', fac, M_('LESS_THAN', v, rows[1]))
    gcol = B.rgb(kit.lin(glass))
    if glass2:
        lo = band[1] if not arch else arch[2]
        gcol = B.mix(M_('MULTIPLY', B.ramp(u, lo, period), 0.4), gcol, B.rgb(kit.lin(glass2)))
    col = B.mix(fac, col, gcol)
    if mull:
        v = M_('MULTIPLY', M_('FRACT', M_('DIVIDE', h, mull[0])), mull[0])
        mf = M_('MULTIPLY', M_('LESS_THAN', v, mull[1]), fac)
        col = B.mix(mf, col, B.rgb(kit.lin(mull[2])))
    nt.links.new(col, alb.inputs[0])
    return m


def sector(name, r_out, r_in, a0, a1, z0, z1, seg, mat, ends=None, top=True, bottom=False, outer=True, inner=True, caps=True):
    """Annular sector prism (angles in radians, CCW from +X); `ends` = material of the two end
    walls (None: same). Correct outward winding, no normal recalculation (it may be open)."""
    bm = bmesh.new()
    n = seg

    def rv(r, z):
        return [bm.verts.new((r * math.cos(a0 + (a1 - a0) * i / n), r * math.sin(a0 + (a1 - a0) * i / n), z)) for i in range(n + 1)]
    O0, O1, I0, I1 = rv(r_out, z0), rv(r_out, z1), rv(r_in, z0), rv(r_in, z1)
    for i in range(n):
        if outer:
            bm.faces.new((O0[i], O0[i + 1], O1[i + 1], O1[i]))
        if inner and r_in > 0.01:
            bm.faces.new((I0[i + 1], I0[i], I1[i], I1[i + 1]))
        if top:
            bm.faces.new((O1[i], O1[i + 1], I1[i + 1], I1[i]))
        if bottom:
            bm.faces.new((O0[i + 1], O0[i], I0[i], I0[i + 1]))
    ef = []
    if caps and abs(a1 - a0) < 2 * PI - 1e-4:
        ef.append(bm.faces.new((O0[0], O1[0], I1[0], I0[0])))
        ef.append(bm.faces.new((O0[n], I0[n], I1[n], O1[n])))
    ob = kit.obj_from_bm(bm, name, mat)
    if ends is not None and ef:
        ob.data.materials.append(ends)
        nf = len(ob.data.polygons)
        for p in ob.data.polygons[nf - 2:]:
            p.material_index = 1
    return ob


def quad(name, pts, mat):
    """one face from 3-4 points (CCW seen from the front side)"""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)
    return kit.obj_from_bm(bm, name, mat)


def arc_strip(name, r, a0, a1, z0, z1, seg, mat):
    """an outward-facing curved strip (lamp bands on round facades)"""
    return sector(name, r, 0, a0, a1, z0, z1, seg, mat, top=False, inner=False, caps=False)


def front_strip(name, x0, x1, y, z0, z1, mat, nrm='-y'):
    """a flat quad facing -Y (or +X / -X / +Y) for lit window strips"""
    if nrm == '-y':
        return quad(name, [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], mat)
    if nrm == '+y':
        return quad(name, [(x1, y, z0), (x0, y, z0), (x0, y, z1), (x1, y, z1)], mat)
    if nrm == '+x':   # x0/x1 are y0/y1, y is x
        return quad(name, [(y, x0, z0), (y, x1, z0), (y, x1, z1), (y, x0, z1)], mat)
    return quad(name, [(y, x1, z0), (y, x0, z0), (y, x0, z1), (y, x1, z1)], mat)


def add_band(m, z0, z1, colour, y0=-1e4, y1=1e4, rows=None, hoff=0.0):
    """paint an extra horizontal band (absolute z0..z1, limited to y0..y1; rows=(spacing, width)
    turns it into a row of windows along y) on top of material m (cheatlines, window rows)"""
    nt = m.node_tree
    B = kit.NodeBuilder(m)
    alb = nt.nodes['NOS_ALBEDO']
    src = alb.inputs[0].links[0].from_socket
    sep = B.node('ShaderNodeSeparateXYZ')
    B.link(nt.nodes['NOS_COORD'].outputs[0], sep.inputs[0])
    z, y = sep.outputs[2], sep.outputs[1]
    M_ = B.math
    f = M_('MULTIPLY', M_('GREATER_THAN', z, z0), M_('LESS_THAN', z, z1))
    f = M_('MULTIPLY', f, M_('MULTIPLY', M_('GREATER_THAN', y, y0), M_('LESS_THAN', y, y1)))
    if rows:
        v = M_('MULTIPLY', M_('FRACT', M_('DIVIDE', M_('SUBTRACT', y, hoff), rows[0])), rows[0])
        f = M_('MULTIPLY', f, M_('LESS_THAN', v, rows[1]))
    nt.links.new(B.mix(f, src, B.rgb(kit.lin(colour))), alb.inputs[0])
    return m


def spire(name, r, z0, h, mat, seg=8, loc=(0, 0), collar=None):
    """steep octagonal pointed spire (optional collar ring at its foot)"""
    prof = [(r, z0), (r * 0.82, z0 + h * 0.18), (r * 0.42, z0 + h * 0.62), (r * 0.12, z0 + h * 0.93), (0.0, z0 + h)]
    o = lathe(name, prof, seg=seg, mat=mat, loc=(loc[0], loc[1], 0), close_bottom=False)
    if collar is not None:
        c = cylinder(name + '_col', r * 1.12, h * 0.05, (loc[0], loc[1], z0 - h * 0.02), seg=seg, mat=collar)
        o = kit.join([o, c], name)
    return o


def chhatri(name, r, z, h, mat, dome_mat=None, loc=(0, 0)):
    """small kiosk: slab, four piers, eave slab and a low dome (Deccani roof pavilion)"""
    x, y = loc
    ps = [box(name + '_b', (2.2 * r, 2.2 * r, 0.5), (x, y, z), mat, base=True)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(box(name + '_p', (0.5, 0.5, h * 0.5), (x + sx * r * 0.85, y + sy * r * 0.85, z + 0.5), mat, base=True))
    ps.append(box(name + '_e', (2.5 * r, 2.5 * r, 0.45), (x, y, z + 0.5 + h * 0.5), mat, base=True))
    prof = [(r * 1.05, 0), (r * 1.0, r * 0.45), (r * 0.72, r * 0.95), (r * 0.25, r * 1.25), (0.0, r * 1.55)]
    ps.append(lathe(name + '_d', [(a, b + z + 0.95 + h * 0.5) for (a, b) in prof], seg=8, mat=dome_mat or mat, loc=(x, y, 0), close_bottom=False))
    return kit.join(ps, name)


def lit(name, day='#2f6f80', night='#ffe6b0'):
    """unbaked @night window material: looks like `day` glass by day, glows `night` after dark"""
    return kit.material('lamp_lens', name + '@night', base=day, emit=night, emit_strength=1.0, bake=False, alpha=1.0)


def frame_mat():
    return L.paint('#5a5e60', 'frame_grey', rough=0.8)


def hrand(i, k=1):
    """deterministic 0..1 hash"""
    x = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return x - math.floor(x)


# =========================================================================== Cyber Towers
@kit.asset('cyber_towers', 'landmark', draw='cyber_towers', face='s', footprint=[96, 96], height=135.0, fit='footprint', floodlit=True)
def build_cyber_towers(A):
    """Cyber Towers (1998): the horseshoe of stacked glass floors open to the front, white spandrel
    bands, the tall glazed central core with a crown and mast, the podium and the plain sign."""
    M = L.mats()
    RO, RI = 44.0, 25.0
    Z0, FL, NF = 7.0, 14.5, 8
    ZT = Z0 + FL * NF               # roof of the ring
    gap = math.radians(34)
    a0, a1 = -PI / 2 + gap, 3 * PI / 2 - gap
    SEG = 30
    white = L.paint('#eceeed', 'ct_white', rough=0.8, streaks=0.15, grime=0.3)
    endm = facade('ct_end', base='#eceeed', glass='#2f6f80', period=FL, z0=Z0, z1=ZT - 1.0, band=(0.0, 2.2), rows=(6.3, 3.4), streaks=0.15)
    ring_out = facade('ct_glass_out', base='#e9ecec', glass='#2f6f80', glass2='#7fb4c0', period=FL, z0=Z0, z1=ZT - 1.0,
                      band=(0.0, 2.2), mull=(6.8, 0.5, '#1d3f4a'), horiz='radial', R=RO, streaks=0.0, grime=0.1)
    ring_in = facade('ct_glass_in', base='#e4e8e8', glass='#2a6474', glass2='#6aa0ae', period=FL, z0=Z0, z1=ZT - 1.0,
                     band=(0.0, 2.2), mull=(6.0, 0.5, '#1d3f4a'), horiz='radial', R=RI, streaks=0.0, grime=0.1)
    core_m = facade('ct_core', base='#dfe4e6', glass='#356f7e', glass2='#8cbcc6', period=FL, z0=Z0, z1=ZT + 12,
                    band=(0.0, 1.4), mull=(5.2, 0.45, '#1d3f4a'), horiz='radial', R=12.0, streaks=0.0, grime=0.1)
    roof = L.paint('#b9bcbc', 'ct_roof', rough=0.8)
    lampw = lit('ct_office', day='#2f6f80', night='#fff0c8')
    parts = []
    # podium (a low drum with a granite skirt) and the forecourt steps
    parts.append(cylinder('ct_podium', 47.5, Z0, (0, 0, 0), seg=32, mat=M['granite']))
    parts.append(L.steps('ct_steps', 26, 1.6, 0.9, 5, (0, -50.5, 0), M['granite']))
    # the horseshoe: outer + inner glass, white end walls, roof
    ring = sector('ct_ring', RO, RI, a0, a1, Z0, ZT, SEG, ring_out, ends=endm, top=False, inner=False)
    ringi = sector('ct_ring_in', RO, RI, a0, a1, Z0, ZT, SEG, ring_in, top=False, outer=False, caps=False)
    parts += [ring, ringi]
    parts.append(sector('ct_roof', RO - 0.6, RI + 0.6, a0, a1, ZT - 0.6, ZT - 0.6 + 0.01, SEG, roof, outer=False, inner=False, top=True, caps=False))
    # white crown parapet (proud ring) and a mid-height white band
    parts.append(sector('ct_crown', RO + 1.0, RO - 0.8, a0 - 0.01, a1 + 0.01, ZT - 0.6, ZT + 2.6, SEG, white, bottom=True))
    parts.append(sector('ct_belt', RO + 0.9, RO - 0.2, a0 - 0.01, a1 + 0.01, Z0 + FL * 4 - 1.0, Z0 + FL * 4 + 1.4, SEG, white, bottom=True, inner=False, caps=False))
    # the central core: a glazed drum rising above the ring, a white crown and the mast
    ZC = ZT + 9.0                   # top of the core drum
    parts.append(cylinder('ct_core', 12.0, ZC - Z0, (0, 0, Z0), seg=18, mat=core_m))
    parts.append(cylinder('ct_core_crown', 13.2, 3.0, (0, 0, ZC - 1.0), seg=18, mat=white))
    parts.append(cylinder('ct_core_cap', 9.0, 2.6, (0, 0, ZC + 2.0), seg=12, mat=roof, r2=6.0))
    parts.append(cylinder('ct_mast', 0.5, 12.0, (0, 0, ZC + 4.6), seg=5, mat=roof, r2=0.15))
    # bridges from the ring's arms to the core (glass link at every other floor reads as one slab)
    for s in (-1, 1):
        a = -PI / 2 + s * (gap + 0.45)
        bx = math.cos(a)
        by = math.sin(a)
        b = box('ct_link', (5.0, RI - 11.0, ZT - Z0 - 2), (0, 0, 0), white, base=True)
        L.place(b, ((12.0 + RI) / 2 * bx * 0.98, (12.0 + RI) / 2 * by * 0.98, Z0), rz=a + PI / 2)
        parts.append(b)
    # entrance porch in the gap: canopy on slim columns, glass doors at the core foot
    parts.append(box('ct_canopy', (20, 16, 1.2), (0, -22, Z0 + 10.5), white, base=True))
    for x in (-8.5, 8.5):
        for y in (-28.5, -16):
            parts.append(cylinder('ct_col', 0.5, 10.5, (x, y, Z0), seg=6, mat=white))
    parts.append(L.sign_panel('ct_sign2', 'CYBER TOWERS', 18, 2.4, (0, -30.3, Z0 + 10.6), fg='#ffffff', bg='#1d4e8a', px=384, frame=frame_mat()))
    # lit offices (night): a few window bands on the outer / inner glass and the core (unbaked
    # @night quads, kept out of the bake; they sit just outside the shell surfaces)
    lits = []
    for f in range(NF):
        zb = Z0 + f * FL + 4.6
        for j in range(1):
            if hrand(f * 7 + j) < 0.2:
                continue
            i0 = int(hrand(f * 7 + j, 3) * (SEG - 4))
            span = 2 + int(hrand(f, j) * 3)
            aa = a0 + (a1 - a0) * i0 / SEG
            bb = a0 + (a1 - a0) * min(SEG, i0 + span) / SEG
            lits.append(arc_strip('ct_lit', RO + 0.25, aa, bb, zb, zb + 6.5, 1 if span < 3 else 2, lampw))
    for f in range(1, NF, 2):
        zb = Z0 + f * FL + 4.6
        i0 = int(hrand(f, 9) * (SEG - 6))
        aa = a0 + (a1 - a0) * (i0 + 3) / SEG
        bb = a0 + (a1 - a0) * i0 / SEG
        o = sector('ct_lit_i', RI - 0.25, 0, bb, aa, zb, zb + 6.5, 1, lampw, top=False, inner=False, caps=False)
        L._flip(o)
        lits.append(o)
    for f in range(0, NF, 2):
        zb = Z0 + f * FL + 4.6
        lits.append(arc_strip('ct_lit_c', 12.25, -PI / 2 - 0.5, -PI / 2 + 0.5, zb, zb + 7.5, 2, lampw))
    lit_ob = kit.join(lits, 'ct_lit')
    # ---- shells (only these ship; facades, crown, belt, roof, porch and signs are baked onto them)
    SS = 13
    lo = [lathe('s_podium', [(47.6, 0), (47.6, Z0 + 0.05)], seg=12, close_bottom=False),
          sector('s_ring', RO + 0.05, RI - 0.05, a0, a1, Z0, ZT + 2.6, SS, None, inner=True, caps=True),
          lathe('s_core', [(12.1, Z0), (12.1, ZC + 2.0)], seg=10, close_bottom=False),
          cylinder('s_cap', 13.3, 2.6, (0, 0, ZC + 2.0), seg=12, r2=6.0, cap=False),
          cylinder('s_mast', 0.6, 12.0, (0, 0, ZC + 4.6), seg=3, r2=0.1, cap=False),
          L.shell_box('s_sign', (29.4, 1.8, 6.7), (-30, -45.0, 0)),
          L.shell_box('s_canopy', (20.4, 16.4, 1.6), (0, -22, Z0 + 10.3)),
          prism_from_outline('s_steps', [(-54.7, 0), (-46.3, 0), (-46.3, 4.7)], 26.4, axis='X')]
    for s_ in (-1, 1):
        a = -PI / 2 + s_ * (gap + 0.45)
        b = L.shell_box('s_link', (5.4, RI - 11.0, ZT - Z0 - 1.6), (0, 0, 0))
        lo.append(L.place(b, ((12.0 + RI) / 2 * math.cos(a) * 0.98, (12.0 + RI) / 2 * math.sin(a) * 0.98, Z0), rz=a + PI / 2))
    for x in (-8.5, 8.5):
        for y in (-28.5, -16):
            lo.append(cylinder('s_col', 0.7, 10.5, (x, y, Z0), seg=3, cap=False))
    # the name board: its own small text texture (the atlas is too coarse for lettering)
    img = kit.text_image('CYBER TOWERS', 256, 48, fg='#1d4e8a', bg='#f4f6f6', name='ct_signtex')
    sgn = quad('ct_signq', [(-44, -46.0, 1.0), (-16, -46.0, 1.0), (-16, -46.0, 6.2), (-44, -46.0, 6.2)], kit.baked_material('M_ct_sign', img.filepath_raw, rough=0.6))
    uvl = sgn.data.uv_layers.new(name='UVMap')
    for poly_ in sgn.data.polygons:
        for li in poly_.loop_indices:
            co = sgn.data.vertices[sgn.data.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.x + 44) / 28.0, (co.z - 1.0) / 5.2)
    parts.append(box('ct_signwall', (29, 1.6, 6.6), (-30, -45.0, 0), M['granite'], base=True))
    L.finish_proxy(A, parts, lo=lo, keep=[lit_ob, sgn], size=int(__import__('os').environ.get('CT_SIZE', '384')), ao_dist=12.0)
    A.notes.append('proxy shell + baked facade atlas; %d lit office strips (@night)' % len(lits))
    L.shots(A, az=-30, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 36, 'pad': 1.0}}])


# =========================================================================== PARKED builders (NOSTALGIA_PARKED=1 only)
# Osmania University Arts College, the Spanish Mosque, the old Begumpet airport (terminal, ATC
# tower, a parked turboprop) and a HITEC City office block with a tower crane. Owner must-haves that
# ship once models load lazily per GLB: registered only under NOSTALGIA_PARKED=1 (see the end of
# this file) and never packed into the real pack. Budget path: L.finish_proxy (detail baked onto
# hand-built low shells); legible signs and night glows live on one unbaked picture sheet per asset
# (the _lm_city technique: '<id>_sheet@night', dark by day, glowing after dusk).
import os
import numpy as np
from mathutils import Matrix


def _civic():
    import _lm_civic as C_
    return C_


def _city():
    import _lm_city as CT_
    return CT_


def mp(base, name, rough=0.8, **kw):
    """plain painted surface (roughness 0.8: no ORM map)"""
    kw.setdefault('streaks', 0.0)
    return L.paint(base, name, rough=rough, **kw)


def gran(name, base, **kw):
    """Deccan granite (grey-pink, weathered), rough 0.8"""
    kw.setdefault('var', 0.10)
    kw.setdefault('grain', 0.10)
    kw.setdefault('grime', 0.45)
    kw.setdefault('specks', 0.4)
    kw.setdefault('streaks', 0.3)
    return kit.material('granite_pink', name, base=base, rough=0.8, **kw)


def BX(name, x0, x1, y0, y1, z0, z1, mat=None):
    """box from extents (hi detail)"""
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat, base=True)


def SH(name, x0, x1, y0, y1, z0, z1):
    """open-bottom shell box from extents (lo)"""
    return _civic().blk(name, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, z0, z1, None)


def arch_pts(kind, w, h, n=8):
    """2D outline [(x, z)] of an opening of width w and total height h (base z = 0), in
    kit.arch_outline order: 'rect' | 'round' | 'deccani' (two-centred, rise = 1.2 x half-width,
    the Qutb Shahi / Deccani arch) | 'multifoil' (cusped deccani) | 'horseshoe' (Moorish) |
    'chaitya' (horseshoe with the pointed kudu tip of the Ajanta chaitya window)."""
    half = w / 2.0
    if kind == 'rect':
        return [(-half, 0.0), (-half, h), (half, h), (half, 0.0)]
    if kind == 'round':
        return arch_outline(w, h - half, half, 'round', n)
    if kind in ('deccani', 'multifoil'):
        rise = 1.2 * half
        return arch_outline(w, max(0.0, h - rise), rise, 'pointed' if kind == 'deccani' else 'cusped', max(n, 10 if kind == 'multifoil' else n))
    R = half * 1.18
    zc = h - R * (1.28 if kind == 'chaitya' else 1.0)
    d = math.asin(math.sqrt(R * R - half * half) / R)
    arc = []
    for i in range(n + 1):
        t = PI + d - (PI + 2 * d) * i / n
        x, z = R * math.cos(t), zc + R * math.sin(t)
        if kind == 'chaitya' and z > zc + R * 0.82 and abs(x) < R * 0.55:
            continue
        arc.append((x, z))
    if kind == 'chaitya':
        k = max(i for i, p in enumerate(arc) if p[0] < 0) + 1
        arc.insert(k, (0.0, h))
    arc[0] = (-half, arc[0][1])
    arc[-1] = (half, arc[-1][1])
    return [(-half, 0.0)] + arc + [(half, 0.0)]


def recess(name, kind, w, h, x, y, z, depth, mat, n=8):
    """a cutter prism (arched opening outline) centred on the wall plane y: boolean it out of a
    wall to get a real recess of `depth` (the cut faces take `mat`)"""
    o = prism_from_outline(name, arch_pts(kind, w, h, n), depth * 2, center=(x, y, z), mat=mat)
    return o


def mfac():
    """Fac (painted facade) with arch_pts openings, voussoirs, ashlar coursing and jaali"""
    C_ = _civic()

    class MFac(C_.Fac):
        def poly_mask(self, pts):
            X, Z = self.X, self.Z
            inside = np.zeros(X.shape, bool)
            n = len(pts)
            for i in range(n):
                (x1, z1), (x2, z2) = pts[i], pts[(i + 1) % n]
                if z1 == z2:
                    continue
                c = ((z1 > Z) != (z2 > Z)) & (X < (x2 - x1) * (Z - z1) / (z2 - z1) + x1)
                inside ^= c
            return inside

        def shape(self, kind, cx, z0, w, h):
            return self.poly_mask([(cx + x, z0 + z) for (x, z) in arch_pts(kind, w, h, 16)])

        def opening(self, kind, cx, z0, w, h, col, frame=None, fw=0.45, sill=None, shade=True, alfiz=None, aw=0.5):
            """an arched opening (+ surround frame, Moorish alfiz rectangle, sill)"""
            if alfiz:
                self.rect(cx - w / 2 - fw - aw * 2.2, z0, cx + w / 2 + fw + aw * 2.2, z0 + h + fw + aw * 2.2, alfiz)
                self.rect(cx - w / 2 - fw - aw * 1.2, z0, cx + w / 2 + fw + aw * 1.2, z0 + h + fw + aw * 1.2, self._bg)
            if frame:
                self._put(self.shape(kind, cx, z0 - fw * 0.3, w + 2 * fw, h + fw * 1.3), frame)
            m = self.shape(kind, cx, z0, w, h)
            self._put(m, col)
            if shade:
                self._put(m & (self.Z > z0 + h * 0.55), '#000000', 0.22)
            if sill:
                self.rect(cx - w / 2 - 0.4, z0 - 0.45, cx + w / 2 + 0.4, z0, sill)
            return self

        def openings(self, kind, n, z0, w, h, col, x0=0.0, x1=None, skip=(), **kw):
            x1 = self.w if x1 is None else x1
            step = (x1 - x0) / n
            for i in range(n):
                if i not in skip:
                    self.opening(kind, x0 + step * (i + 0.5), z0, w, h, col, **kw)
            return self

        def voussoirs(self, kind, cx, z0, w, h, ring, c1, c2, n=15):
            """the Cordoba arch: a ring of alternating light / dark voussoirs round the opening"""
            outer = self.shape(kind, cx, z0, w + 2 * ring, h + ring)
            inner = self.shape(kind, cx, z0, w, h)
            zc = z0 + h - w / 2 * 1.18 - ring * 0.5
            ang = np.arctan2(self.Z - zc, self.X - cx)
            k = np.floor((ang + 0.35) / ((PI + 0.7) / n)).astype(int) % 2
            m = outer & ~inner & (self.Z > zc - w * 0.35)
            self._put(m & (k == 0), c1)
            self._put(m & (k == 1), c2)
            return self

        def courses(self, h=1.4, col='#000000', alpha=0.10, w=0.12, bond=2.6):
            """ashlar granite coursing: thin joints every h (vertical joints staggered)"""
            zz = np.mod(self.Z, h)
            row = np.floor(self.Z / h).astype(int)
            xx = np.mod(self.X + (row % 2) * bond / 2, bond)
            self._put((zz < w) | (xx < w * 0.8), col, alpha)
            return self

        def jaali(self, x0, z0, x1, z1, col, cell=0.7, alpha=1.0):
            """a pierced-screen band: a lattice of small dark lozenges"""
            m = (self.X >= x0) & (self.X <= x1) & (self.Z >= z0) & (self.Z <= z1)
            u = np.mod(self.X - x0, cell) / cell - 0.5
            v = np.mod(self.Z - z0, cell) / cell - 0.5
            self._put(m & (np.abs(u) + np.abs(v) < 0.32), col, alpha)
            return self

    def make(w, h, bg, seed=1, noise=0.0, ppu=5.0):
        f = MFac(w, h, bg, ppu=ppu, noise=noise, seed=seed)
        f._bg = bg
        return f
    return make


def sheet(aid, w=512, h=256, night=True):
    return _city().Sheet(aid, w, h, night=night)


def frustum_strip(sh, uv, n, r0, r1, z0, z1, loc=(0, 0), phase=PI / 8, flip=False):
    """an n-sided (outward-leaning when r1 > r0) band of sheet quads round Z, the sub-image `uv`
    wrapped once round it (glazed control-tower cab)"""
    u0, v0, u1, v1 = uv
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new('UVMap')
    for i in range(n):
        a, b = phase + 2 * PI * i / n, phase + 2 * PI * (i + 1) / n
        p = [(loc[0] + r0 * math.cos(a), loc[1] + r0 * math.sin(a), z0), (loc[0] + r0 * math.cos(b), loc[1] + r0 * math.sin(b), z0),
             (loc[0] + r1 * math.cos(b), loc[1] + r1 * math.sin(b), z1), (loc[0] + r1 * math.cos(a), loc[1] + r1 * math.sin(a), z1)]
        f = bm.faces.new([bm.verts.new(q) for q in p])
        ua, ub = u0 + (u1 - u0) * i / n, u0 + (u1 - u0) * (i + 1) / n
        for lp, uvv in zip(f.loops, ((ua, v0), (ub, v0), (ub, v1), (ua, v1))):
            lp[lay].uv = uvv
    ob = kit.obj_from_bm(bm, 'sheetf')
    sh.objs.append(ob)
    return ob


def sheet_box(sh, uv, x0, x1, y0, y1, z0, z1):
    """a small box whose faces all show the sheet patch uv (obstruction lights, lamp heads)"""
    u0, v0, u1, v1 = uv
    o = box('sheetb', (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), None, base=True)
    me = o.data
    lay = me.uv_layers.new(name='UVMap')
    for poly_ in me.polygons:
        for k, li in enumerate(poly_.loop_indices):
            lay.data[li].uv = ((u0, v0), (u1, v0), (u1, v1), (u0, v1))[k % 4]
    sh.objs.append(o)
    return o


def loft_y(name, rings, seg, mat=None, cap0=True, cap1=True, phase=0.0):
    """a body of revolution-like loft along Y: rings [(y, rx, rz, zc)] (elliptic sections),
    outward normals (aircraft fuselage, nacelles)"""
    bm = bmesh.new()
    R = []
    for (y, rx, rz, zc) in rings:
        if rx < 1e-3:
            R.append([bm.verts.new((0.0, y, zc))])
            continue
        R.append([bm.verts.new((rx * math.cos(phase + 2 * PI * k / seg), y, zc + rz * math.sin(phase + 2 * PI * k / seg))) for k in range(seg)])
    for i in range(len(R) - 1):
        a, b = R[i], R[i + 1]
        for k in range(seg):
            if len(a) == 1:
                bm.faces.new((a[0], b[(k + 1) % seg], b[k]))
            elif len(b) == 1:
                bm.faces.new((a[k], a[(k + 1) % seg], b[0]))
            else:
                bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    if cap0 and len(R[0]) > 1:
        bm.faces.new(R[0])
    if cap1 and len(R[-1]) > 1:
        bm.faces.new(list(reversed(R[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def plan_prism(name, poly, z0, z1, mat=None):
    """vertical prism from a plan polygon (wings, tailplanes, slabs)"""
    return kit.extrude_polygon(name, poly, z0, z1, mat)


def side_prism(name, outline, x0, x1, mat=None):
    """prism of a (y, z) section between x0 and x1 (fins, ramps)"""
    return _city().side_prism(name, outline, x0, x1, mat, bottom=True)


def tri_post(name, x, y, r, z0, z1):
    """3-sided open shell round a thin post (6 tris)"""
    return _city().tri_col(name, x, y, r, z0, z1)


def stepped_teeth(name, length, z, h, pitch, mat, two=True, fill=0.62):
    """Moorish stepped merlons (almenas escalonadas) along X at y = 0, flat faces front [+ back]"""
    C_ = _civic()
    n = max(1, int(round(length / pitch)))
    step = length / n
    tw = step * fill
    out = []
    for i in range(n):
        x = -length / 2 + step * (i + 0.5)
        a, b, c = tw / 2, tw * 0.32, tw * 0.14
        ol = [(x - a, 0), (x + a, 0), (x + a, h * 0.45), (x + b, h * 0.45), (x + b, h * 0.75), (x + c, h * 0.75), (x + c, h), (x - c, h),
              (x - c, h * 0.75), (x - b, h * 0.75), (x - b, h * 0.45), (x - a, h * 0.45)]
        out.append(C_._face(name, [(px, -C_.EPS, z + pz) for (px, pz) in ol], mat))
        if two:
            out.append(C_._face(name, [(px, C_.EPS, z + pz) for (px, pz) in reversed(ol)], mat))
    return kit.join(out, name)


def rect_ring(make, cx, cy, W, D, sides='fblr'):
    """apply make(length) -> object along X at y=0 to the four sides of a W x D rectangle"""
    C_ = _civic()
    out = []
    for s, rz, length, half in (('f', 0.0, W, D / 2), ('r', PI / 2, D, W / 2), ('b', PI, W, D / 2), ('l', -PI / 2, D, W / 2)):
        if s not in sides:
            continue
        o = make(length)
        C_._xform(o, 0, (0, -half, 0))
        out.append(C_._xform(o, rz, (cx, cy, 0)))
    return out


def oct_spire(name, r, z0, h, mat, loc=(0, 0), seg=8, bands=None):
    """steep octagonal pointed spire (Spanish Mosque): straight-sided, a slight swell at the foot,
    optional thin collar bands [(z_frac, mat)]"""
    prof = [(r * 1.05, z0), (r, z0 + h * 0.06), (r * 0.62, z0 + h * 0.45), (r * 0.28, z0 + h * 0.8), (r * 0.06, z0 + h * 0.97), (0.0, z0 + h)]
    parts = [lathe(name, prof, seg=seg, mat=mat, loc=(loc[0], loc[1], 0), close_bottom=False)]
    for (zf, bm_) in bands or []:
        zz = z0 + h * zf
        rr = r * (1.05 - (1.05 - 0.62) * min(1.0, max(0.0, (zf - 0.06) / 0.39))) if zf < 0.45 else r * 0.62
        parts.append(cylinder(name + '_band', rr * 1.06 + 0.05, h * 0.025, (loc[0], loc[1], zz), seg=seg, mat=bm_))
    parts.append(lathe(name + '_fin', [(0.12, z0 + h - 0.3), (0.12, z0 + h + 1.0), (0.35, z0 + h + 1.3), (0.0, z0 + h + 1.8)], seg=6, mat=mat, loc=(loc[0], loc[1], 0)))
    return kit.join(parts, name)


def oct_spire_lo(name, r, z0, h, loc=(0, 0), seg=8, foot=None):
    """shell of oct_spire (foot: [(r, z)] extra rings below, e.g. the turret shaft)"""
    prof = list(foot or []) + [(r * 1.08 + 0.05, z0), (r * 0.66 + 0.05, z0 + h * 0.45), (r * 0.3 + 0.04, z0 + h * 0.8), (0.0, z0 + h + 1.6)]
    return lathe(name, prof, seg=seg, loc=(loc[0], loc[1], 0), close_bottom=False)


def finish_m(A, P, lo, keep=(), size=384, ao=6.0):
    for o in lo:
        o.data.materials.clear()
    for o in L.finish_proxy(A, P, lo=lo, keep=[k for k in keep if k is not None], size=size, ao_dist=ao, ao_samples=48, ao_strength=0.7):
        kit.smooth(o, 80)


def tally(tag, objs):
    if os.environ.get('MODERN_TALLY'):
        kit.log('TALLY %s %d tris' % (tag, kit.tri_count([o for o in objs if o is not None])))
