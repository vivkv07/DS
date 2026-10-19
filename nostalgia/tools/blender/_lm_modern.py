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


def sheet_tet(sh, uv, c, r):
    """a tiny tetrahedron showing the sheet patch uv (navigation / obstruction lights, 4 tris)"""
    u0, v0, u1, v1 = uv
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new('UVMap')
    x, y, z = c
    vs = [bm.verts.new(p) for p in ((x, y, z + r), (x + r * 0.94, y, z - r / 3), (x - r * 0.47, y + r * 0.82, z - r / 3), (x - r * 0.47, y - r * 0.82, z - r / 3))]
    for f in ((0, 1, 2), (0, 2, 3), (0, 3, 1), (1, 3, 2)):
        fc = bm.faces.new([vs[i] for i in f])
        for lp, uvv in zip(fc.loops, ((u0, v0), (u1, v0), (u1, v1))):
            lp[lay].uv = uvv
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = kit.obj_from_bm(bm, 'sheett')
    sh.objs.append(ob)
    return ob


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
    prof = [(r * 1.05, z0), (r, z0 + h * 0.06), (r * 0.55, z0 + h * 0.45), (r * 0.2, z0 + h * 0.8), (r * 0.05, z0 + h * 0.97), (0.0, z0 + h)]
    parts = [lathe(name, prof, seg=seg, mat=mat, loc=(loc[0], loc[1], 0), close_bottom=False)]
    for (zf, bm_) in bands or []:
        zz = z0 + h * zf
        rr = r * (1.05 - (1.05 - 0.55) * min(1.0, max(0.0, (zf - 0.06) / 0.39))) if zf < 0.45 else r * 0.55
        parts.append(cylinder(name + '_band', rr * 1.06 + 0.05, h * 0.025, (loc[0], loc[1], zz), seg=seg, mat=bm_))
    parts.append(lathe(name + '_fin', [(0.12, z0 + h - 0.3), (0.12, z0 + h + 1.0), (0.35, z0 + h + 1.3), (0.0, z0 + h + 1.8)], seg=6, mat=mat, loc=(loc[0], loc[1], 0)))
    return kit.join(parts, name)


def oct_spire_lo(name, r, z0, h, loc=(0, 0), seg=8, foot=None):
    """shell of oct_spire (foot: [(r, z)] extra rings below, e.g. the turret shaft)"""
    prof = list(foot or []) + [(r * 1.08 + 0.05, z0), (r * 0.59 + 0.05, z0 + h * 0.45), (r * 0.22 + 0.04, z0 + h * 0.8), (0.0, z0 + h + 1.6)]
    return lathe(name, prof, seg=seg, loc=(loc[0], loc[1], 0), close_bottom=False)


def finish_m(A, P, lo, keep=(), size=384, ao=6.0):
    for o in lo:
        o.data.materials.clear()
    for o in L.finish_proxy(A, P, lo=lo, keep=[k for k in keep if k is not None], size=size, ao_dist=ao, ao_samples=48, ao_strength=0.7):
        kit.smooth(o, 80)


def tally(tag, objs):
    if os.environ.get('MODERN_TALLY'):
        kit.log('TALLY %s %d tris' % (tag, kit.tri_count([o for o in objs if o is not None])))


# =========================================================================== Spanish Mosque (Begumpet)
def build_spanish_mosque(A):
    """The Spanish Mosque (Masjid Iqbal-ud-Daula, 1906, Begumpet), Moorish / Hispanic: a cream
    prayer hall with Moorish stepped merlons, a front pishtaq with the great horseshoe arch in a
    dark alfiz frame and Cordoba-striped voussoirs, horseshoe windows, and its signature: tall
    slender steep octagonal pointed spires in dark slate (four corner turrets, two at the porch)
    and the big central octagonal spire on a crenellated drum (no onion domes). Respectful, plain."""
    C_ = _civic()
    C_._ASSET[0] = A.id
    F = mfac()
    WALL, TRIM, ACC, DARK, SPC = '#ebe2cc', '#f7f0df', '#5b5d63', '#2b2826', '#4a4c53'
    W = mp(WALL, 'sm_wall', grime=0.35, streaks=0.3)
    T = mp(TRIM, 'sm_trim', grime=0.25)
    SP = mp(SPC, 'sm_spire', grime=0.2)
    AC = mp(ACC, 'sm_acc', grime=0.2)
    DK = mp('#3a3330', 'sm_recess', grime=0.0)
    ST = kit.material('granite_grey', 'sm_plinth', base='#b0a898', rough=0.8)
    P, lo = [], []
    Z0, HZ, PZ = 1.2, 21.0, 27.0           # plinth top, hall parapet base, porch parapet base

    def wall_face(w, h, n, seed, big=False):
        f = F(w, h, WALL, seed=seed)
        f.dirt(2.2, alpha=0.22).band(0.0, 0.6, ACC).band(h - 1.2, h - 0.7, ACC).band(h - 0.7, h, TRIM)
        f.openings('horseshoe', n, 2.6, 2.6, 8.6, DARK, frame=TRIM, fw=0.35, alfiz=ACC, aw=0.3, sill=TRIM)
        f.openings('horseshoe', n * 2, 13.6, 1.0, 3.0, DARK, frame=TRIM, fw=0.2)
        return f
    # plinth + steps
    P.append(BX('plinth', -19.0, 19.0, -19.8, 15.0, 0, Z0, ST))
    lo.append(SH('s_plinth', -19.1, 19.1, -19.9, 15.1, 0, Z0 + 0.05))
    # the prayer hall
    hw, y0, y1 = 15.0, -13.0, 13.0
    P.append(C_.fbox('hall', 0, (y0 + y1) / 2, 2 * hw, y1 - y0, Z0, HZ, W,
                     faces={'l': wall_face(y1 - y0, HZ - Z0, 4, 2), 'r': wall_face(y1 - y0, HZ - Z0, 4, 3), 'b': wall_face(2 * hw, HZ - Z0, 4, 4),
                            'f': wall_face(2 * hw, HZ - Z0, 4, 5)}))
    P += rect_ring(lambda ln: stepped_teeth('hall_merl', ln, HZ, 2.2, 1.9, W), 0, (y0 + y1) / 2, 2 * hw, y1 - y0)
    lo.append(SH('s_hall', -hw - 0.1, hw + 0.1, y0 - 0.1, y1 + 0.1, Z0, HZ + 2.3))
    # the front pishtaq: the great horseshoe arch (real recess), alfiz, striped voussoirs
    pw, py0, py1 = 10.5, -19.4, -13.0
    fp = F(2 * pw, PZ - Z0, WALL, seed=7)
    fp.dirt(2.2, alpha=0.22).band(0.0, 0.6, ACC).band(fp.h - 1.2, fp.h - 0.7, ACC).band(fp.h - 0.7, fp.h, TRIM)
    fp.rect(pw - 6.6, 0, pw + 6.6, 18.4, ACC).rect(pw - 6.0, 0, pw + 6.0, 17.8, WALL)          # alfiz
    fp.voussoirs('horseshoe', pw, 0.0, 8.6, 15.4, 1.3, TRIM, '#8a5a3e', n=17)
    fp.opening('horseshoe', pw, 0.0, 8.6, 15.4, DARK, shade=False)
    for s in (-1, 1):
        fp.opening('horseshoe', pw + s * 7.9, 2.0, 2.2, 7.4, DARK, frame=TRIM, fw=0.3, alfiz=ACC, aw=0.25)
    fp.jaali(pw - 5.2, 20.0, pw + 5.2, 23.4, DARK, cell=0.9)
    fp.band(19.4, 19.8, ACC).band(23.8, 24.2, ACC)
    side = wall_face(py1 - py0, PZ - Z0, 1, 8)
    porch = C_.fbox('porch', 0, (py0 + py1) / 2, 2 * pw, py1 - py0, Z0, PZ, W, faces={'f': fp, 'l': side, 'r': side})
    kit.boolean(porch, recess('arch_cut', 'horseshoe', 8.6, 15.4, 0, py0, Z0, 2.2, DK, n=16))
    P.append(porch)
    P.append(BX('arch_back', -4.6, 4.6, py0 + 2.0, py0 + 2.3, Z0, Z0 + 15.6, DK))
    P.append(BX('arch_door', -1.8, 1.8, py0 + 1.95, py0 + 2.1, Z0, Z0 + 7.0, mp('#5a3a24', 'sm_door', grime=0.2)))
    P += rect_ring(lambda ln: stepped_teeth('porch_merl', ln, PZ, 2.4, 1.9, W), 0, (py0 + py1) / 2, 2 * pw, py1 - py0, sides='flr')
    lo.append(SH('s_porch', -pw - 0.1, pw + 0.1, py0 - 0.1, py1, Z0, PZ + 2.5))
    # turrets: four at the hall corners, two at the pishtaq front corners; slender octagonal
    # shafts with balcony rings, then the steep dark octagonal spires
    def turret(name, x, y, r, z_top, sp_h):
        P.append(cylinder(name + '_shaft', r, z_top - Z0, (x, y, Z0), seg=8, mat=W))
        for zr in (HZ - 0.4, z_top):
            P.append(cylinder(name + '_ring', r * 1.3, 0.7, (x, y, zr), seg=8, mat=T))
            P.append(cylinder(name + '_ringb', r * 1.18, 0.3, (x, y, zr - 0.3), seg=8, mat=AC))
        P.append(oct_spire(name + '_sp', r * 0.85, z_top + 0.7, sp_h, SP, loc=(x, y), bands=[(0.04, T)]))
        lo.append(oct_spire_lo(name + '_lo', r * 0.85, z_top + 0.7, sp_h, loc=(x, y), seg=6,
                               foot=[(r + 0.12, Z0), (r + 0.12, z_top - 0.1), (r * 1.3 + 0.1, z_top + 0.35)]))
    for (x, y) in ((-hw, y0), (hw, y0), (-hw, y1), (hw, y1)):
        turret('ct', x, y, 1.8, 30.0, 17.0)
    for x in (-pw, pw):
        turret('pt', x, py0, 1.5, PZ + 3.0, 12.0)
    # the central drum (octagonal, horseshoe windows, merlon ring) and the great spire
    RD, ZD0, ZD1 = 6.4, HZ, 32.5
    dm = facade('sm_drum', base=WALL, glass=DARK, period=ZD1 - ZD0, z0=ZD0, z1=ZD1, arch=(RD * 2 * PI / 8, 2.0, 3.0, 7.6, 'horseshoe', 1.2),
                frame=(0.35, TRIM), horiz='radial', R=RD, hoff=RD * 2 * PI / 16, grime=0.3, streaks=0.3)
    P.append(cylinder('drum', RD, ZD1 - ZD0, (0, 0, ZD0), seg=8, mat=dm))
    P.append(cylinder('drum_band', RD * 1.06, 0.6, (0, 0, ZD1 - 1.2), seg=8, mat=AC))
    for k in range(8):
        a = 2 * PI * (k + 0.5) / 8
        mt = stepped_teeth('drum_merl', 2 * RD * math.sin(PI / 8) * 0.98, ZD1, 2.0, 1.8, W)
        C_._xform(mt, 0, (0, -RD * math.cos(PI / 8), 0))
        P.append(C_._xform(mt, a + PI / 2, (0, 0, 0)))
    P.append(oct_spire('main_sp', 4.6, ZD1 + 0.4, 31.0, SP, loc=(0, 0), bands=[(0.04, T), (0.42, T)]))
    lo.append(oct_spire_lo('main_lo', 4.6, ZD1 + 0.4, 31.0, loc=(0, 0), foot=[(RD + 0.12, ZD0 + 0.2), (RD + 0.12, ZD1 + 2.1), (RD * 0.8, ZD1 + 2.1)]))
    tally(A.id + ' lo', lo)
    finish_m(A, P, lo, size=384)
    L.shots(A, az=-32, el=10, extra=[{'name': 'front', 'view': {'az': 0, 'el': 5, 'fov': 32, 'pad': 1.05}}])




# =========================================================================== Begumpet ATC tower
def build_atc_tower(A):
    """The Begumpet control tower: a low equipment block, the tall concrete shaft with the stair
    window slit, the flared service floor, the outward-leaning glazed octagonal cab (lit at night,
    on the picture sheet), the roof slab with aerials and the red obstruction light."""
    C_ = _civic()
    C_._ASSET[0] = A.id
    CT = _city()
    F = mfac()
    CON, WH, DARK = '#c9c4b8', '#e8e5dc', '#2e3236'
    CO = kit.material('whitewash', 'atc_concrete', base=CON, rough=0.9, var=0.08, grain=0.07, grime=0.55, streaks=0.55, dirt='#6a6458')
    W = mp(WH, 'atc_white', grime=0.3, streaks=0.3)
    DK = mp(DARK, 'atc_dark')
    STL = mp('#8a8d90', 'atc_steel', rough=0.6)
    P, lo = [], []
    sh = sheet(A.id, 256, 64)
    # equipment block
    fb = F(18, 10, WH, seed=3)
    fb.dirt(1.6, alpha=0.3).band(9.2, 10, '#c9c6be')
    fb.rect(7.0, 0, 11.0, 7.0, '#4a5560').rect(8.95, 0, 9.05, 7.0, DARK)
    for x in (2.5, 14.0):
        fb.rect(x, 3.2, x + 2.6, 6.4, '#35444f')
    fs = F(18, 10, WH, seed=4)
    fs.dirt(1.6, alpha=0.3).band(9.2, 10, '#c9c6be')
    for x in (2.0, 7.7, 13.4):
        fs.rect(x, 3.2, x + 2.6, 6.4, '#35444f')
    P.append(C_.fbox('base', 0, 0, 18, 18, 0, 10, W, faces={'f': fb, 'l': fs, 'r': fs, 'b': fs}))
    P.append(BX('canopy', -3.5, 3.5, -10.8, -9.0, 7.6, 8.1, W))
    lo.append(SH('s_base', -9.1, 9.1, -9.1, 9.1, 0, 10.1))
    # the shaft and the stair window slit
    Z1 = 56.0
    P.append(cylinder('shaft', 4.4, Z1 - 10, (0, 0, 10), seg=16, mat=CO))
    for k in range(9):
        z = 13 + k * 4.6
        P.append(BX('slit', -0.55, 0.55, -4.6, -3.9, z, z + 2.6, DK))
    lo.append(lathe('s_shaft', [(4.5, 10.0), (4.5, Z1)], seg=8, close_bottom=False, close_top=False))
    # flared neck + service floor
    P.append(lathe('neck', [(4.4, Z1), (6.0, Z1 + 3.2), (7.6, Z1 + 4.4)], seg=16, mat=CO))
    sf = facade('atc_svc', base=WH, glass='#3a4a55', period=3.4, z0=Z1 + 4.4, z1=Z1 + 7.8, band=(0.0, 1.0), rows=(3.0, 1.6), horiz='radial', R=7.6)
    P.append(cylinder('svc', 7.6, 3.4, (0, 0, Z1 + 4.4), seg=8, mat=sf))
    P.append(cylinder('catwalk', 8.6, 0.4, (0, 0, Z1 + 7.8), seg=8, mat=W))
    for k in range(8):
        a = 2 * PI * k / 8 + PI / 8
        P.append(cylinder('rail_p', 0.08, 1.1, (8.4 * math.cos(a), 8.4 * math.sin(a), Z1 + 8.2), seg=4, mat=STL))
    P.append(lathe('rail', [(8.45, Z1 + 9.2), (8.45, Z1 + 9.35), (8.3, Z1 + 9.35), (8.3, Z1 + 9.2)], seg=8, mat=STL))
    ZC0, ZC1 = Z1 + 8.2, Z1 + 14.6
    lo.append(lathe('s_neck', [(4.5, Z1), (6.1, Z1 + 3.2), (7.7, Z1 + 4.4), (7.7, Z1 + 7.8), (8.7, Z1 + 7.8), (8.7, Z1 + 8.2), (7.75, ZC0)], seg=8, close_bottom=False, close_top=False))
    # the cab: dark glass frustum (hi, for the bake under the sheet) + roof slab, cap, aerials
    P.append(lathe('cab_core', [(7.7, ZC0), (9.1, ZC1)], seg=8, mat=DK))
    P.append(cylinder('roof', 10.2, 1.3, (0, 0, ZC1), seg=8, mat=W))
    P.append(cylinder('roof_cap', 6.4, 1.6, (0, 0, ZC1 + 1.3), seg=8, mat=W, r2=4.2))
    P.append(cylinder('mast', 0.3, 9.0, (0, 0, ZC1 + 2.9), seg=6, mat=STL, r2=0.12))
    P.append(lathe('dome', [(1.6, ZC1 + 2.9), (1.5, ZC1 + 3.8), (0.9, ZC1 + 4.6), (0.0, ZC1 + 4.9)], seg=10, mat=W, loc=(-3.6, 1.2, 0)))
    for (x, y, hh) in ((6.0, 4.0, 5.0), (-6.4, -3.0, 4.0)):
        P.append(cylinder('whip', 0.1, hh, (x, y, ZC1 + 1.3), seg=4, mat=STL))
        lo.append(tri_post('s_whip', x, y, 0.25, ZC1 + 1.3, ZC1 + 1.3 + hh))
    P.append(BX('radar', 3.0, 5.0, -1.0, 1.0, ZC1 + 2.9, ZC1 + 3.9, W))
    lo.append(lathe('s_roof', [(7.8, ZC1 - 0.1), (10.3, ZC1 - 0.1), (10.3, ZC1 + 1.35), (6.5, ZC1 + 1.35), (4.3, ZC1 + 2.95), (0.0, ZC1 + 2.95)], seg=8, close_bottom=False))
    lo.append(L.shell_box('s_radar', (2.2, 2.2, 1.2), (4.0, 0, ZC1 + 2.85)))
    lo.append(tri_post('s_mast', 0, 0, 0.5, ZC1 + 2.9, ZC1 + 11.9))
    lo.append(lathe('s_dome', [(1.7, ZC1 + 2.9), (1.6, ZC1 + 3.9), (0.0, ZC1 + 5.0)], seg=6, loc=(-3.6, 1.2, 0), close_bottom=False))
    # picture sheet: the cab glazing (dark glass by day, lit after dusk) and the red light
    cv = CT.Canvas(224, 40, '#2c3b44')
    cv.grad(0.0, 1.0, '#26343c', '#5d7f8e')
    for i in range(8):
        cv.rect(i / 8.0, 0, i / 8.0 + 0.012, 1, '#b8bcbc')
        cv.rect(i / 8.0 + 0.0625, 0, i / 8.0 + 0.0665, 1, '#9aa0a2')
        cv.rect(i / 8.0 + 0.02, 0.05, i / 8.0 + 0.11, 0.42, '#e9d7a8', 0.3)
    cv.rect(0, 0.0, 1, 0.06, '#b8bcbc').rect(0, 0.94, 1, 1, '#b8bcbc')
    uv_cab = sh.put(cv)
    uv_red = sh.put(CT.Canvas(16, 16, '#ff2a1a'))
    frustum_strip(sh, uv_cab, 8, 7.8, 9.2, ZC0, ZC1)
    sheet_box(sh, uv_red, -0.45, 0.45, -0.45, 0.45, ZC1 + 11.9, ZC1 + 12.7)
    sheet_box(sh, uv_red, 9.8, 10.4, -0.3, 0.3, ZC1 + 1.3, ZC1 + 1.9)
    tally(A.id + ' lo', lo)
    finish_m(A, P, lo, keep=[sh.obj()], size=256)
    L.shots(A, az=-30, el=8, extra=[{'name': 'cab', 'view': {'az': -20, 'el': 4, 'fov': 26, 'target': (0, 0, 66), 'dist': 60}}])


# =========================================================================== parked turboprop (Begumpet apron)
def build_parked_plane(A):
    """A generic twin-turboprop airliner (ATR / HS-748-like) parked on the Begumpet apron: high
    wing, two four-blade propellers, T-tail, plain white livery with a navy cheatline and grey
    belly (no airline names or logos), boarding stairs at the front door, yellow wheel chocks.
    Built nose towards -Y (face e: it points east in the world)."""
    CT = _city()
    WHT = '#f1f1ee'
    body = mp(WHT, 'pl_body', rough=0.5, grime=0.15)
    add_band(body, -1, 3.0, '#b9bec4')                                  # grey belly
    add_band(body, 4.7, 5.15, '#1f3a78', y0=-22.0, y1=17.0)             # cheatline
    add_band(body, 5.15, 5.35, '#5f8fd0', y0=-21.0, y1=17.0)
    add_band(body, 6.1, 6.9, '#2a3440', y0=-14.6, y1=12.6, rows=(1.35, 0.62), hoff=-14.6)   # cabin windows
    add_band(body, 6.7, 7.5, '#1f2830', y0=-21.4, y1=-19.6)            # cockpit windscreen
    wing = mp('#dfe1e3', 'pl_wing', rough=0.5, grime=0.2)
    fin = mp(WHT, 'pl_fin', rough=0.5, grime=0.1)
    add_band(fin, 11.0, 12.4, '#1f3a78')
    add_band(fin, 12.4, 12.8, '#5f8fd0')
    nac = mp('#e4e5e6', 'pl_nac', rough=0.5, grime=0.25)
    add_band(nac, -1, 6.9, '#9aa0a6', y0=-1.0, y1=2.0)
    DK = mp('#26292c', 'pl_dark', rough=0.6)
    TYRE = mp('#1e1e1e', 'pl_tyre', rough=0.9)
    STL = mp('#8d9195', 'pl_steel', rough=0.6)
    YEL = mp('#e8b51c', 'pl_chock', rough=0.8)
    PROP = mp('#2a2a2c', 'pl_prop', rough=0.6)
    STAIR = mp('#e6e6e2', 'pl_stairs', rough=0.7, grime=0.4)
    P, lo = [], []
    ZC, RF = 5.6, 3.0                                                     # fuselage axis height, radius
    rings = [(-23.0, 0.25, 0.25, 4.9), (-22.3, 1.3, 1.25, 5.0), (-21.0, 2.3, 2.3, 5.3), (-19.0, 2.9, 2.95, 5.55), (-16.5, RF, RF, ZC),
             (10.0, RF, RF, ZC), (13.5, 2.6, 2.55, 6.1), (17.0, 1.75, 1.6, 6.9), (20.0, 0.9, 0.8, 7.6), (21.8, 0.25, 0.25, 8.0)]
    P.append(loft_y('fus', rings, 16, body))
    lo.append(loft_y('s_fus', [(y, rx + 0.08, rz + 0.08, zc) for (y, rx, rz, zc) in rings[:5] + rings[6:]], 8, phase=PI / 8))
    # passenger door (left = +X side) and a service door
    P.append(BX('door', RF - 0.2, RF + 0.08, -13.6, -11.6, 3.7, 7.9, mp('#d6d8da', 'pl_door', rough=0.5)))
    P.append(BX('door_l', RF - 0.2, RF + 0.1, -13.7, -11.5, 3.6, 3.75, DK))
    # high wing with the root fairing
    WZ = ZC + RF - 0.2
    wpl = [(-20.0, -1.6), (-20.0, 0.4), (-3.0, 1.0), (3.0, 1.0), (20.0, 0.4), (20.0, -1.6), (3.0, -2.6), (-3.0, -2.6)]
    P.append(plan_prism('wing', wpl, WZ, WZ + 0.6, wing))
    P.append(loft_y('fairing', [(-5.0, 0.4, 0.2, WZ + 0.2), (-3.5, 1.8, 0.8, WZ + 0.3), (2.0, 1.8, 0.8, WZ + 0.3), (4.0, 0.4, 0.2, WZ + 0.2)], 10, wing))
    lo.append(plan_prism('s_wing', [(x * 1.004, y + (0.1 if y > 0 else -0.1)) for (x, y) in wpl], WZ - 0.1, WZ + 0.75))
    lo.append(loft_y('s_fairing', [(-5.1, 0.4, 0.3, WZ + 0.3), (-3.5, 1.9, 0.9, WZ + 0.4), (2.0, 1.9, 0.9, WZ + 0.4), (4.1, 0.4, 0.3, WZ + 0.3)], 6))
    # engine nacelles under the wing, four-blade propellers, spinners
    for sx in (-1, 1):
        x = sx * 6.6
        nr = [(-7.4, 0.3, 0.3, WZ - 1.1), (-6.8, 0.9, 1.0, WZ - 1.1), (-5.8, 1.15, 1.35, WZ - 1.0), (-1.0, 1.1, 1.4, WZ - 0.8), (3.0, 0.7, 0.8, WZ - 0.4), (4.4, 0.3, 0.3, WZ - 0.2)]
        n_ = loft_y('nac', nr, 12, nac)
        L.place(n_, (x, 0, 0))
        P.append(n_)
        s_ = loft_y('s_nac', [(y, rx + 0.08, rz + 0.08, zc) for (y, rx, rz, zc) in nr], 6)
        lo.append(L.place(s_, (x, 0, 0)))
        cz = WZ - 1.1
        for k in range(4):
            a = PI / 4 + k * PI / 2
            bl = box('blade', (0.42, 0.1, 3.1), (0, 0, 1.55), PROP, base=False)
            bl.rotation_euler = (0, a, 0)
            bl.location = (x, -7.25, cz)
            kit.apply_transform(bl)
            P.append(bl)
        for a in (PI / 4, -PI / 4):
            sb = box('s_blade', (0.6, 0.24, 6.3), (0, 0, 0), None)
            sb.rotation_euler = (0, a, 0)
            sb.location = (x, -7.25, cz)
            kit.apply_transform(sb)
            lo.append(sb)
    # T-tail: swept fin, tailplane on top
    fol = [(13.0, WZ - 0.4), (21.6, 8.2), (22.4, 17.6), (19.6, 17.6)]
    P.append(side_prism('fin', fol, -0.22, 0.22, fin))
    lo.append(side_prism('s_fin', [(13.0 - 0.1, WZ - 0.5), (21.7, 8.1), (22.5, 17.7), (19.5, 17.7)], -0.32, 0.32))
    tp = [(-6.4, 21.4), (-6.4, 20.2), (-1.0, 18.8), (1.0, 18.8), (6.4, 20.2), (6.4, 21.4)]
    P.append(plan_prism('tailplane', tp, 17.5, 17.85, wing))
    lo.append(plan_prism('s_tailplane', [(x * 1.01, y + (0.08 if y > 20.5 else -0.08)) for (x, y) in tp], 17.4, 17.95))
    # landing gear: sponsons + twin main wheels, nose wheel, chocks
    for sx in (-1, 1):
        P.append(BX('sponson', sx * 2.0 if sx > 0 else -3.9, 3.9 if sx > 0 else -2.0, -1.5, 4.0, 2.0, 4.2, body))
        for y in (0.4, 2.2):
            wl = cylinder('wheel', 0.8, 0.55, (0, 0, 0), seg=10, mat=TYRE, axis='X', base=False)
            wl.location = (sx * 3.1, y, 0.8)
            kit.apply_transform(wl)
            P.append(wl)
        P.append(BX('strut', sx * 3.0 - 0.15, sx * 3.0 + 0.15, 1.2, 1.5, 0.8, 2.2, STL))
        for y in (-0.6, 3.2):
            P.append(side_prism('chock', [(y - 0.35, 0.0), (y + 0.35, 0.0), (y, 0.55)], sx * 3.1 - 0.5, sx * 3.1 + 0.5, YEL))
        lo.append(SH('s_gear', sx * 3.1 - 0.6 if sx > 0 else -4.0, 4.0 if sx > 0 else -2.5, -1.1, 3.7, 0.0, 4.3))
    nw = cylinder('nwheel', 0.6, 0.5, (0, 0, 0), seg=10, mat=TYRE, axis='X', base=False)
    nw.location = (0, -17.0, 0.6)
    kit.apply_transform(nw)
    P += [nw, BX('nstrut', -0.12, 0.12, -17.1, -16.9, 0.6, 3.0, STL)]
    P.append(side_prism('nchock', [(-18.0, 0.0), (-17.4, 0.0), (-17.7, 0.45)], -0.45, 0.45, YEL))
    lo.append(SH('s_nose_gear', -0.55, 0.55, -18.1, -16.3, 0.0, 2.9))
    # mobile boarding stairs at the front door (left = +X side)
    sx0, sx1, sz = 3.3, 11.5, 3.6
    for i in range(7):
        x = sx1 - (i + 1) * (sx1 - sx0 - 1.6) / 7
        P.append(BX('stair_t', x, sx1 if i == 0 else x + (sx1 - sx0 - 1.6) / 7 + 0.1, -13.3, -11.9, 0.0, sz * (i + 1) / 7.0, STAIR))
    P.append(BX('stair_pf', sx0, sx0 + 1.7, -13.4, -11.8, sz - 0.3, sz, STAIR))
    for y in (-13.45, -11.75):
        P.append(kit.tube('stair_rail', [(sx1, y, 2.0), (sx0 + 1.6, y, sz + 2.2), (sx0 + 0.1, y, sz + 2.2)], 0.09, seg=5, mat=STL))
    lo.append(side_prism('s_stair', [(-13.5, 0.0), (-11.7, 0.0), (-11.7, sz + 2.3), (-13.5, sz + 2.3)], sx0, sx0 + 1.8))
    ramp = prism_from_outline('s_stair_r', [(sx1 + 0.15, 0.0), (sx0 + 1.7, sz + 2.35), (sx0 + 1.7, 0.0)], 1.8, center=(0, -12.6, 0))
    lo.append(ramp)
    # picture sheet: navigation lights (port red at +X, starboard green at -X, white tail) and lit
    # cabin windows at night
    sh = sheet(A.id, 128, 32)
    uv_r = sh.put(CT.Canvas(8, 8, '#ff2a1a'))
    uv_g = sh.put(CT.Canvas(8, 8, '#2aff5a'))
    uv_w = sh.put(CT.Canvas(8, 8, '#ffffff'))
    cw = CT.Canvas(96, 8, '#202a34')
    for i in range(20):
        cw.rect(i / 20 + 0.01, 0.15, i / 20 + 0.035, 0.85, '#f2dca0')
    uv_c = sh.put(cw)
    sheet_tet(sh, uv_r, (20.15, -0.5, WZ + 0.3), 0.45)
    sheet_tet(sh, uv_g, (-20.15, -0.5, WZ + 0.3), 0.45)
    sheet_tet(sh, uv_w, (0.0, 22.6, 17.3), 0.4)
    for sx in (-1, 1):
        q = sh.quad(uv_c, 27.2, 0.75, (0, 0, 0))
        L.place(q, (sx * (RF + 0.1), -1.0, 6.5), rz=PI / 2 if sx > 0 else -PI / 2)
    tally(A.id + ' lo', lo)
    finish_m(A, P, lo, keep=[sh.obj()], size=224, ao=5.0)
    L.shots(A, az=-125, el=14, extra=[{'name': 'side', 'view': {'az': 90, 'el': 8, 'fov': 32, 'pad': 1.05}}])



# =========================================================================== Begumpet airport terminal
def build_begumpet_airport(A):
    """The old Begumpet terminal (Hyderabad's airport in 2003): a long low cream-white modernist
    block with ribbon windows, the taller glazed central hall with vertical fins and the plain
    HYDERABAD AIRPORT sign, the deep flat canopy on slim columns over the kerb (DEPARTURE /
    ARRIVAL boards, lamps under it), the glass front, flagpoles, black water tanks on the roof."""
    C_ = _civic()
    C_._ASSET[0] = A.id
    CT = _city()
    F = mfac()
    WH, CREAM, GLS, DARK, GREY = '#ecebe4', '#e3dccb', '#33505e', '#2a2f33', '#b9b9b4'
    W = mp(WH, 'ap_white', grime=0.35, streaks=0.35)
    CR = mp(CREAM, 'ap_cream', grime=0.3, streaks=0.3)
    GR = mp(GREY, 'ap_grey', grime=0.3)
    STL = mp('#9a9ea2', 'ap_steel', rough=0.6)
    PAV = kit.material('granite_grey', 'ap_pave', base='#a8a49a', rough=0.8)
    TANK = mp('#202020', 'ap_tank', rough=0.7)
    P, lo = [], []
    sh = sheet(A.id, 512, 160)
    YF, YC, YB = -9.0, -11.0, 16.0          # wing front, central block front, back
    HW, HC = 14.0, 23.0
    # kerb / forecourt pavement
    P.append(BX('pave', -60, 60, -18, YF, 0, 0.4, PAV))
    lo.append(SH('s_pave', -60.05, 60.05, -18.05, YF, 0, 0.45))

    def wing_face(w, seed, doors=True):
        f = F(w, HW, CREAM, seed=seed)
        f.dirt(1.5, alpha=0.25).band(HW - 1.2, HW, WH).band(7.6, 9.0, WH)
        f.rect(0, 9.6, w, 12.4, GLS)
        for k in range(int(w / 2.4) + 1):
            f.rect(k * 2.4, 9.6, k * 2.4 + 0.25, 12.4, '#d8d8d2')
        f.rect(0, 0.4, w, 7.6, '#3c5866')
        for k in range(int(w / 3.0) + 1):
            f.rect(k * 3.0, 0.4, k * 3.0 + 0.25, 7.6, '#c8ccce')
        return f

    def plain_face(w, h, seed):
        f = F(w, h, CREAM, seed=seed)
        f.dirt(1.5, alpha=0.25).band(h - 1.2, h, WH)
        f.rect(0, 9.6, w, 12.4, GLS)
        for k in range(int(w / 2.4) + 1):
            f.rect(k * 2.4, 9.6, k * 2.4 + 0.25, 12.4, '#d8d8d2')
        for k in range(int(w / 6.0)):
            f.rect(k * 6.0 + 2.0, 0.6, k * 6.0 + 4.2, 6.8, '#4a5660')
        return f
    for sx in (-1, 1):
        x0, x1 = (-58.0, -21.0) if sx < 0 else (21.0, 58.0)
        P.append(C_.fbox('wing', (x0 + x1) / 2, (YF + YB) / 2, x1 - x0, YB - YF, 0.4, HW, W,
                         faces={'f': wing_face(x1 - x0, 2 + sx), 'b': plain_face(x1 - x0, HW - 0.4, 4 + sx),
                                ('l' if sx < 0 else 'r'): plain_face(YB - YF, HW - 0.4, 6 + sx)}, top_mat=GR))
        P.append(BX('wing_par', x0, x1, YF - 0.3, YB, HW, HW + 1.0, W))
        lo.append(SH('s_wing', x0 - (0.1 if sx < 0 else 0), x1 + (0.1 if sx > 0 else 0), YF - 0.4, YB + 0.1, 0.4, HW + 1.1))
    # central hall: tall glass between vertical fins, the sign fascia
    fc = F(42, HC - 0.4, WH, seed=9)
    fc.dirt(1.5, alpha=0.25).band(8.6, 10.2, WH)
    fc.rect(0.8, 10.4, 41.2, 19.8, GLS)
    fc.rect(0, 0.4, 42, 8.6, '#3c5866')
    P.append(C_.fbox('central', 0, (YC + YB) / 2, 42, YB - YC, 0.4, HC, W, faces={'f': fc, 'b': plain_face(42, HC - 0.4, 11)}, top_mat=GR))
    P.append(BX('central_par', -21.2, 21.2, YC - 0.4, YB + 0.2, HC, HC + 1.0, W))
    for k in range(15):
        x = -19.6 + k * 2.8
        P.append(BX('fin', x - 0.25, x + 0.25, YC - 1.4, YC, 10.4, 20.2, W))
    lo.append(SH('s_central', -21.3, 21.3, YC - 1.5, YB + 0.3, 0.4, HC + 1.1))
    # the canopy over the kerb + its columns
    CZ0, CZ1 = 9.0, 10.4
    P.append(BX('canopy', -50, 50, -17.6, YF, CZ0, CZ1, W))
    P.append(BX('canopy_fascia', -50.2, 50.2, -17.8, -17.4, CZ0 - 0.3, CZ1 + 0.3, GR))
    lo.append(SH('s_canopy', -50.3, 50.3, -17.9, YF, CZ0 - 0.35, CZ1 + 0.35))
    for k in range(9):
        x = -48 + k * 12
        P.append(cylinder('col', 0.45, CZ0 - 0.4, (x, -16.6, 0.4), seg=8, mat=STL))
        lo.append(tri_post('s_col', x, -16.6, 0.9, 0.4, CZ0 - 0.3))
    # flagpoles (the national flag in the middle, plain light-blue flags either side)
    tri = CT.Canvas(96, 64, '#ffffff')
    tri.rect(0, 0.667, 1, 1, '#ff9933').rect(0, 0, 1, 0.333, '#138808')
    tri.ellipse(0.5, 0.5, 0.09, 0.135, '#000080').ellipse(0.5, 0.5, 0.07, 0.105, '#ffffff').ellipse(0.5, 0.5, 0.02, 0.03, '#000080')
    tri_m = tri.mat(A.id + '_flag_in', grime=0.05)
    blu = CT.Canvas(32, 24, '#6aa6d8').mat(A.id + '_flag_bl', grime=0.05)
    for (x, m_) in ((52.0, blu), (55.0, tri_m), (58.0, blu)):
        P.append(cylinder('pole', 0.18, 21.0, (x, -15.0, 0.4), seg=6, mat=STL, r2=0.12))
        P.append(cylinder('pole_cap', 0.3, 0.3, (x, -15.0, 21.4), seg=6, mat=STL))
        for rz in (0.0, PI):
            P.append(CT.decal('flag', m_, 3.6, 2.4, (x + 1.9, -15.0 + (0.06 if rz else -0.06), 19.6), rz=rz))
        lo.append(tri_post('s_pole', x, -15.0, 0.4, 0.4, 21.7))
        lo.append(L.shell_box('s_flag', (3.7, 0.3, 2.5), (x + 1.9, -15.0, 18.35)))
    # roof: black water tanks, AC boxes, a stair house
    for (x, y) in ((-44, 8), (-40, 8), (36, 6), (40, 6)):
        P.append(cylinder('tank', 1.4, 2.6, (x, y, HW), seg=10, mat=TANK))
        lo.append(lathe('s_tank', [(1.5, HW), (1.5, HW + 2.7), (0.0, HW + 2.8)], seg=5, loc=(x, y, 0), close_bottom=False))
    for (x0_, x1_, y0_, y1_) in ((-30, -24, 2, 8), (26, 33, -2, 4)):
        P.append(BX('ac', x0_, x1_, y0_, y1_, HW, HW + 2.2, GR))
        lo.append(SH('s_ac', x0_ - 0.1, x1_ + 0.1, y0_ - 0.1, y1_ + 0.1, HW, HW + 2.3))
    P.append(BX('stairhouse', -8, 8, 4, 12, HC, HC + 4.0, W))
    lo.append(SH('s_stairh', -8.1, 8.1, 3.9, 12.1, HC, HC + 4.1))
    # picture sheet: the name sign, DEPARTURE / ARRIVAL boards, the lit glass front, canopy lamps
    uv_sign = sh.put(CT.text_cv('HYDERABAD AIRPORT', 480, 40, '#1d3f8a', '#f6f6f2', size=0.8))
    uv_dep = sh.put(CT.text_cv('DEPARTURE', 160, 24, '#ffffff', '#1d3f8a', size=0.78))
    uv_arr = sh.put(CT.text_cv('ARRIVAL', 160, 24, '#ffffff', '#1d3f8a', size=0.78))
    g = CT.Canvas(512, 36, '#3a5868')
    g.grad(0.0, 1.0, '#5d6a66', '#2c4654')
    for k in range(33):
        g.rect(k / 32.0, 0, k / 32.0 + 0.005, 1, '#c8ccce')
    g.rect(0, 0.0, 1, 0.05, '#9a9a96').rect(0, 0.62, 1, 0.66, '#c8ccce')
    for k in range(6):
        g.rect(0.04 + k * 0.17, 0.0, 0.08 + k * 0.17, 0.6, '#e8d8a8')
    uv_g = sh.put(g)
    lamp = CT.Canvas(128, 8, '#c8c8c0')
    for k in range(8):
        lamp.rect(k / 8 + 0.02, 0.2, k / 8 + 0.1, 0.8, '#fff2c8')
    uv_l = sh.put(lamp)
    sh.quad(uv_sign, 34.0, 2.8, (0, YC - 1.6, HC - 1.4))
    sh.quad(uv_dep, 9.0, 1.1, (-30.0, -17.95, CZ0 + 0.7))
    sh.quad(uv_arr, 9.0, 1.1, (30.0, -17.95, CZ0 + 0.7))
    for (x0, x1, y) in ((-58.0, -21.0, YF - 0.47), (21.0, 58.0, YF - 0.47), (-20.6, 20.6, YC - 1.57)):
        sh.quad(uv_g, x1 - x0 - 0.6, 7.6 if y > -10 else 8.0, ((x0 + x1) / 2, y, 0.45 + (3.8 if y > -10 else 4.0)))
    for x in (-36.0, 0.0, 36.0):
        sh.quad(uv_l, 24.0, 0.6, (x, -13.5, CZ0 - 0.38), tilt=PI / 2)
    tally(A.id + ' lo', lo)
    finish_m(A, P, lo, keep=[sh.obj()], size=384, ao=6.0)
    L.shots(A, az=-28, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 5, 'fov': 30, 'pad': 1.05}}])



# =========================================================================== Osmania University Arts College
def _ajanta_pillar(name, x, y, z0, z1, mat, cap):
    """Ajanta-style pillar: square base, octagonal shaft, cushion capital and a bracket"""
    h = z1 - z0
    ps = [box(name + '_b', (2.0, 2.0, 1.0), (x, y, z0), mat, base=True),
          cylinder(name + '_s', 0.75, h - 3.2, (x, y, z0 + 1.0), seg=8, mat=mat),
          box(name + '_n', (1.5, 1.5, 0.3), (x, y, z1 - 2.6), cap, base=True),
          lathe(name + '_c', [(0.8, z1 - 2.3), (1.15, z1 - 1.9), (1.1, z1 - 1.5), (0.8, z1 - 1.25)], seg=8, mat=cap, loc=(x, y, 0)),
          box(name + '_br', (3.0, 1.7, 1.25), (x, y, z1 - 1.25), mat, base=True)]
    return kit.join(ps, name)


def build_ou_arts_college(A):
    """Osmania University Arts College (Ernest Jasper, 1934-39): a long symmetrical two-storey
    grey-pink Deccan-granite front. Centre: the tall frontispiece with the great chaitya (Ajanta
    horseshoe, pointed kudu tip) arch portal, a multifoil window and door deep inside it, flanking
    pylons and a crowning kiosk; a three-storey central block behind it. Wings: a verandah of
    Ajanta pillars (octagonal shafts, cushion capitals, brackets) under an upper storey of
    Deccani arched windows between pilasters, jaali parapets; taller end pavilions; small
    chhatris on the flat roof; broad front steps."""
    C_ = _civic()
    C_._ASSET[0] = A.id
    F = mfac()
    WALL, TRIM, DARK, SHADE, WIN = '#a8978c', '#c2b3a7', '#2c2522', '#857469', '#33302e'
    G = gran('ou_granite', WALL, dirt='#5a4c44')
    GT = gran('ou_trim', TRIM, grime=0.35, dirt='#6a5c54')
    GD = gran('ou_shade', SHADE, grime=0.3)
    DK = mp('#4a3e38', 'ou_recess', grime=0.0)
    ST = kit.material('granite_grey', 'ou_steps', base='#a19a92', rough=0.8, grime=0.4)
    RF = mp('#86786f', 'ou_roof', grime=0.5)
    P, lo = [], []
    Z0 = 3.0
    ZW, ZP = 36.0, 38.4            # wing roof, wing parapet top
    # plinth, landing and the broad front steps
    P.append(BX('plinth', -99.5, 99.5, -27.0, 23.0, 0, Z0, ST))
    lo.append(SH('s_plinth', -99.6, 99.6, -27.1, 23.1, 0, Z0 + 0.05))
    P.append(BX('landing', -30.0, 30.0, -32.2, -27.0, 0, Z0, ST))
    P.append(L.steps('ou_steps', 60.0, 0.7, 0.75, 4, (0, -33.6, 0), ST))
    lo.append(SH('s_landing', -30.1, 30.1, -32.3, -27.0, 0, Z0 + 0.05))
    lo.append(_city().ramp_lo('s_steps', -30.0, 30.0, -35.0, -32.2, Z0))

    def courses(f):
        return f.courses(1.5, '#000000', 0.08)

    def upper_face(w, n):
        f = F(w, ZP - 18.0, WALL, seed=int(w))
        courses(f)
        f.band(0.0, 1.2, TRIM).band(ZW - 18.0 - 1.4, ZW - 18.0, TRIM)
        f.pilasters(n, 0.9, TRIM, z0=1.2, z1=ZW - 18.0 - 1.4)
        f.openings('deccani', n, 3.2, 2.6, 8.4, WIN, frame=TRIM, fw=0.45, sill=TRIM)
        f.openings('deccani', n, 13.0, 1.2, 2.4, DARK, frame=TRIM, fw=0.2)
        f.jaali(0.2, ZW - 18.0 + 0.3, w - 0.2, ZP - 18.0 - 0.3, DARK, cell=0.8)
        return f

    def gf_face(w, n):
        f = F(w, 18.0 - Z0, SHADE, seed=int(w) + 1)
        f.dirt(2.0, alpha=0.2)
        f.openings('deccani', n, 0.0, 2.6, 9.6, DARK, frame=WALL, fw=0.4)
        return f

    def side_face(w, h, n, seed):
        f = F(w, h, WALL, seed=seed)
        courses(f)
        f.band(15.0 - Z0, 16.2 - Z0, TRIM).band(h - 3.8, h - 2.4, TRIM)
        f.openings('deccani', n, 3.0, 2.4, 7.8, WIN, frame=TRIM, fw=0.4)
        f.openings('deccani', n, 19.0, 2.4, 7.8, WIN, frame=TRIM, fw=0.4, sill=TRIM)
        f.jaali(0.2, h - 2.1, w - 0.2, h - 0.3, DARK, cell=0.8)
        return f
    # ---- the wings: Ajanta-pillar verandah, upper storey, jaali parapet
    for sx in (-1, 1):
        xa, xb = (-86.0, -26.0) if sx < 0 else (26.0, 86.0)
        cx, wl = (xa + xb) / 2, xb - xa
        P.append(C_.fbox('wing', cx, 0.0, wl, 40.0, Z0, ZP, G, faces={'f': gf_face(wl, 12), 'b': side_face(wl, ZP - Z0, 12, 3)}, top_mat=RF))
        P.append(C_.fbox('wing_up', cx, -22.0, wl, 4.0, 18.0, ZP, G, faces={'f': upper_face(wl, 12)}, top_mat=RF))
        P.append(BX('soffit', xa, xb, -24.0, -20.0, 17.4, 18.0, GD))
        P.append(BX('beam', xa, xb, -24.4, -22.6, 16.2, 18.0, GT))
        P.append(BX('cornice', xa, xb, -25.0, -23.6, ZW - 0.2, ZW + 0.4, GT))
        P.append(BX('vfloor', xa, xb, -24.0, -20.0, Z0, Z0 + 0.3, ST))
        for k in range(13):
            P.append(_ajanta_pillar('pil', xa + 0.8 + k * (wl - 1.6) / 12, -23.3, Z0 + 0.3, 16.2, G, GT))
        lo.append(SH('s_wing', xa, xb, -24.5, 20.1, Z0, ZP + 0.1))
    # ---- end pavilions
    ZE = 44.0
    for sx in (-1, 1):
        xa, xb = (-99.0, -86.0) if sx < 0 else (86.0, 99.0)
        cx = (xa + xb) / 2
        fe = F(13.0, ZE - Z0, WALL, seed=11 + sx)
        courses(fe)
        fe.rect(0, 0, 1.0, fe.h, TRIM).rect(12.0, 0, 13.0, fe.h, TRIM)
        fe.band(15.0 - Z0, 16.2 - Z0, TRIM).band(fe.h - 4.2, fe.h - 2.8, TRIM)
        fe.opening('multifoil', 6.5, 0.0, 5.6, 11.0, DARK, frame=TRIM, fw=0.6)
        for x in (4.0, 6.5, 9.0):
            fe.opening('deccani', x, 17.5, 1.7, 9.0, WIN, frame=TRIM, fw=0.3, sill=TRIM if x == 6.5 else None)
        fe.rect(2.8, 16.6, 10.2, 17.3, TRIM)
        fe.opening('chaitya', 6.5, 29.5, 4.0, 6.4, DARK, frame=TRIM, fw=0.5)
        fe.jaali(1.2, fe.h - 2.6, 11.8, fe.h - 0.3, DARK, cell=0.8)
        P.append(C_.fbox('endp', cx, -3.0, 13.0, 48.0, Z0, ZE, G, faces={'f': fe, ('l' if sx < 0 else 'r'): side_face(48.0, ZE - Z0, 8, 13 + sx), 'b': side_face(13.0, ZE - Z0, 2, 15)}, top_mat=RF))
        P.append(BX('endp_cor', xa - 0.6, xb + 0.6, -27.6, 21.6, ZE - 3.5, ZE - 2.9, GT))
        lo.append(SH('s_endp', xa - 0.1 if sx < 0 else xa, xb + 0.1 if sx > 0 else xb, -27.7, 21.7, Z0, ZE + 0.1))
    # ---- the central block (three storeys) behind the frontispiece
    ZCB = 50.0
    fcb = F(52.0, ZCB - Z0, WALL, seed=21)
    courses(fcb)
    fcb.band(15.0 - Z0, 16.2 - Z0, TRIM).band(30.0 - Z0, 31.0 - Z0, TRIM).band(fcb.h - 3.8, fcb.h - 2.4, TRIM)
    for x in (4.0, 48.0):
        for z in (2.0, 17.0, 32.0):
            fcb.opening('deccani', x, z, 2.6, 8.6, WIN, frame=TRIM, fw=0.4, sill=TRIM)
    fcb.jaali(0.2, fcb.h - 2.1, 51.8, fcb.h - 0.3, DARK, cell=0.8)
    fcbs = side_face(50.0, ZCB - Z0, 8, 23)
    fcbs.band(30.0 - Z0, 31.0 - Z0, TRIM)
    fcbs.openings('deccani', 8, 33.0, 2.4, 7.8, WIN, frame=TRIM, fw=0.4, sill=TRIM)
    P.append(C_.fbox('central', 0, -2.0, 52.0, 50.0, Z0, ZCB, G, faces={'f': fcb, 'l': fcbs, 'r': fcbs, 'b': side_face(52.0, ZCB - Z0, 9, 24)}, top_mat=RF))
    lo.append(SH('s_central', -26.1, 26.1, -27.1, 23.1, Z0, ZCB + 0.1))
    # ---- the frontispiece: the great chaitya arch portal (a real recess), flanking pylons
    AW, AH, AD = 20.0, 40.0, 4.4
    YF0, YF1, ZF = -32.0, -27.0, 60.0
    ff = F(32.0, ZF - Z0, WALL, seed=31)
    courses(ff)
    ff._put(ff.shape('chaitya', 16.0, -1.0, AW + 5.6, AH + 4.6), TRIM)
    ff._put(ff.shape('chaitya', 16.0, -0.5, AW + 3.2, AH + 2.6), SHADE)
    ff._put(ff.shape('chaitya', 16.0, -0.2, AW + 1.4, AH + 1.0), TRIM)
    ff.band(AH + 6.0, AH + 6.8, TRIM).band(ff.h - 4.6, ff.h - 3.6, TRIM)
    for k in range(7):
        ff.opening('chaitya', 4.0 + k * 4.0, ff.h - 3.0, 1.8, 2.6, DARK, frame=TRIM, fw=0.2)
    ff.rect(0, 0, 1.2, ff.h, TRIM).rect(30.8, 0, 32.0, ff.h, TRIM)
    front = C_.fbox('frontis', 0, (YF0 + YF1) / 2, 32.0, YF1 - YF0, Z0, ZF, G, faces={'f': ff})
    kit.boolean(front, recess('portal_cut', 'chaitya', AW, AH, 0, YF0, Z0, AD, DK, n=18))
    P.append(front)
    fb = F(AW, AH, SHADE, seed=33)
    courses(fb)
    fb.opening('deccani', AW / 2, 0.0, 6.0, 11.5, '#4a3222', frame=TRIM, fw=0.5)
    fb.rect(AW / 2 - 0.1, 0.0, AW / 2 + 0.1, 9.0, '#2a1c12')
    fb.opening('multifoil', AW / 2, 14.0, 11.0, 17.0, '#2b3034', frame=TRIM, fw=0.7)
    for k in range(1, 5):
        fb.rect(AW / 2 - 5.5 + k * 2.2 - 0.12, 14.0, AW / 2 - 5.5 + k * 2.2 + 0.12, 28.0, '#6a6058')
    fb.rect(AW / 2 - 5.5, 21.0, AW / 2 + 5.5, 21.3, '#6a6058')
    for x in (2.8, AW - 2.8):
        fb.opening('deccani', x, 2.0, 2.0, 7.0, '#2b3034', frame=TRIM, fw=0.3)
    P.append(C_.img_quad('portal_back', fb.image(A.id + '_portal'), AW, AH, (0, YF0 + AD - 0.05, Z0 + AH / 2)))
    P.append(BX('portal_cor', -16.6, 16.6, YF0 - 0.6, YF0 + 0.2, AH + Z0 + 6.0, AH + Z0 + 6.8, GT))
    P.append(BX('frontis_cor', -16.6, 16.6, YF0 - 0.8, YF1, ZF - 0.6, ZF, GT))
    # flanking pylons with chhatris
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 16.0, sx * 20.5))
        fpy = F(4.5, 58.0 - Z0, WALL, seed=41)
        courses(fpy)
        fpy.rect(0, 0, 0.6, fpy.h, TRIM).rect(3.9, 0, 4.5, fpy.h, TRIM)
        for z in (4.0, 20.0, 36.0):
            fpy.opening('deccani', 2.25, z, 1.4, 6.0, WIN, frame=TRIM, fw=0.25)
        P.append(C_.fbox('pylon', (x0 + x1) / 2, -29.5, 4.5, 7.0, Z0, 58.0, G, faces={'f': fpy, ('l' if sx < 0 else 'r'): fpy}))
        lo.append(SH('s_pylon', x0 - 0.1, x1 + 0.1, -33.1, -25.9, Z0, 58.1))
    # the frontispiece shell with a real (rectangular) notch for the portal depth
    sp = AH - 11.8 * 1.28 - math.sqrt(11.8 ** 2 - 10.0 ** 2)
    XS = 11.9                          # the horseshoe swells past the jambs (R = 1.18 x half)
    lo.append(SH('s_fr_l', -16.1, -XS, YF0 - 0.9, YF1, Z0, ZF + 0.1))
    lo.append(SH('s_fr_r', XS, 16.1, YF0 - 0.9, YF1, Z0, ZF + 0.1))
    lo.append(SH('s_fr_top', -XS, XS, YF0 - 0.9, YF1, Z0 + AH, ZF + 0.1))
    lo.append(SH('s_fr_back', -XS, XS, YF0 + AD - 0.2, YF1, Z0, Z0 + AH))
    apts = arch_pts('chaitya', AW, AH, 18)
    k = apts.index((0.0, AH))
    for sx in (-1, 1):
        half = apts[0:k + 1] if sx < 0 else [(-x, z) for (x, z) in apts[0:k + 1]]
        ol = [(sx * XS, 0.0)] + half + [(sx * XS, AH)]
        if sx > 0:
            ol = list(reversed(ol))
        lo.append(prism_from_outline('s_spandrel', ol, AD + 0.7, center=(0, YF0 + (AD + 0.7) / 2 - 0.9, Z0)))
    # ---- chhatris on the flat roof
    _civic()._CORE[0] = GT
    ch = [(0.0, -29.5, ZF, 3.4), (-18.25, -29.5, 58.0, 2.4), (18.25, -29.5, 58.0, 2.4),
          (-23.0, -24.0, ZCB, 2.6), (23.0, -24.0, ZCB, 2.6), (-92.5, -24.0, ZE, 2.6), (92.5, -24.0, ZE, 2.6)]
    for (x, y, z, r) in ch:
        P.append(_civic().chhatri('chh', x, y, z, r, GT, dmat=G, seg=8))
        h = r * 1.5
        zd = z + 0.45 + h
        lo.append(lathe('s_chh', [(0.98 * r, z), (1.42 * r, z + h + 0.15), (1.17 * r, zd + 0.1), (r * 1.08, zd + r * 0.45), (0.0, zd + r * 1.8)], seg=6, loc=(x, y, 0), close_bottom=False))
    _civic()._CORE[0] = None
    keep = [_civic().sign_keep(A.id, 'ou_name', 'OSMANIA UNIVERSITY', 22.0, 2.6, (0, YF0 - 0.95, Z0 + AH + 3.4), fg='#3a2a22', bg='#cbbcaf', pw=384, ph=48)]
    tally(A.id + ' lo', lo)
    finish_m(A, P, lo, keep=keep, size=int(os.environ.get('OU_SIZE', '448')), ao=8.0)
    L.shots(A, az=-25, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 5, 'fov': 30, 'pad': 1.05}},
                                     {'name': 'portal', 'view': {'az': -15, 'el': 4, 'fov': 30, 'target': (0, -30, 32), 'dist': 120}}])



# =========================================================================== HITEC City office block + tower crane
def _lattice(name, x0, x1, y0, y1, z0, z1, mat, step=3.0, bar=0.22):
    """a square lattice mast (four chords, horizontals, zig-zag diagonals on each face) from z0 to z1"""
    ps = []
    for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        ps.append(BX(name + '_ch', x - bar, x + bar, y - bar, y + bar, z0, z1, mat))
    n = max(1, int((z1 - z0) / step))
    st = (z1 - z0) / n
    for i in range(n + 1):
        z = z0 + i * st
        ps.append(BX(name + '_hx', x0, x1, y0 - bar * 0.7, y0 + bar * 0.7, z - bar * 0.7, z + bar * 0.7, mat))
        ps.append(BX(name + '_hx', x0, x1, y1 - bar * 0.7, y1 + bar * 0.7, z - bar * 0.7, z + bar * 0.7, mat))
        ps.append(BX(name + '_hy', x0 - bar * 0.7, x0 + bar * 0.7, y0, y1, z - bar * 0.7, z + bar * 0.7, mat))
        ps.append(BX(name + '_hy', x1 - bar * 0.7, x1 + bar * 0.7, y0, y1, z - bar * 0.7, z + bar * 0.7, mat))
    for i in range(n):
        za, zb = z0 + i * st, z0 + (i + 1) * st
        if i % 2:
            za, zb = zb, za
        for (pa, pb) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            ps.append(kit.tube(name + '_d', [(pa[0], pa[1], za), (pb[0], pb[1], zb)], bar * 0.7, seg=4, mat=mat, cap=False))
    return kit.join(ps, name)


def _jib(name, xa, xb, y, z, w, h, mat, step=3.0, bar=0.2):
    """a triangular lattice jib along X: two bottom chords (z, y +- w/2), one top chord (z + h)"""
    ps = [BX(name + '_c', xa, xb, y - w / 2 - bar, y - w / 2 + bar, z - bar, z + bar, mat),
          BX(name + '_c', xa, xb, y + w / 2 - bar, y + w / 2 + bar, z - bar, z + bar, mat),
          BX(name + '_t', xa, xb, y - bar, y + bar, z + h - bar, z + h + bar, mat)]
    n = max(1, int(abs(xb - xa) / step))
    for i in range(n):
        x0 = xa + (xb - xa) * i / n
        x1 = xa + (xb - xa) * (i + 1) / n
        for s in (-1, 1):
            ps.append(kit.tube(name + '_d', [(x0, y + s * w / 2, z), (x1, y, z + h)], bar * 0.7, seg=4, mat=mat, cap=False))
        ps.append(BX(name + '_r', x0 - bar * 0.6, x0 + bar * 0.6, y - w / 2, y + w / 2, z - bar * 0.6, z + bar * 0.6, mat))
    return kit.join(ps, name)


def build_hitec_office(A):
    """An early-2000s HITEC City IT block: pink-grey granite cladding with blue glass ribbon
    windows, a full-height blue-glass entrance bay, the porch canopy, the plain (fictional) name
    DECCAN INFOTECH on the crown (lit at night); next to it an unfinished concrete frame (three
    slabs, column stubs with rebar, brick infill, the blue tin site hoarding) under a yellow tower
    crane (lattice mast, cab, jib with trolley and hook, counter-jib with concrete weights)."""
    C_ = _civic()
    C_._ASSET[0] = A.id
    CT = _city()
    F = mfac()
    GRN, GLS, GL2, MUL = '#b09a92', '#2c5f93', '#7fa9d4', '#1b3550'
    P, lo = [], []
    FL, NF = 12.0, 5
    ZT = FL * NF                       # 60: roof
    X0, X1, Y0, Y1 = -35.0, 3.0, -17.0, 22.0
    fr = facade('hx_front', base=GRN, glass=GLS, glass2=GL2, period=FL, z0=FL, z1=ZT - 0.1, band=(0.0, 3.6),
                mull=(3.0, 0.3, MUL), key='granite_pink', grime=0.25, streaks=0.2)
    gf = facade('hx_gf', base=GRN, glass='#36586e', glass2='#6f8a9a', period=FL, z0=0.6, z1=FL - 0.1, band=(0.0, 0.4),
                mull=(4.0, 0.35, '#c8ccce'), key='granite_pink', grime=0.25, streaks=0.2)
    CLAD = kit.material('granite_pink', 'hx_clad', base=GRN, rough=0.8, grime=0.25, streaks=0.2)
    ROOF = mp('#8e8a84', 'hx_roof', grime=0.4)
    CW = facade('hx_cw', base='#c9cdd0', glass=GLS, glass2=GL2, period=4.0, z0=0.6, z1=ZT + 5.0, band=(0.0, 0.35),
                mull=(2.0, 0.22, '#c9cdd0'), streaks=0.0, grime=0.1)
    P.append(BX('office_up', X0, X1, Y0, Y1, FL, ZT, fr))
    P.append(BX('office_gf', X0 + 1.5, X1 - 1.5, Y0 + 1.5, Y1 - 1.5, 0, FL, gf))
    for (x, y) in ((X0 + 1.0, Y0 + 1.0), (X1 - 1.0, Y0 + 1.0), (X0 + 1.0, Y1 - 1.0), (X1 - 1.0, Y1 - 1.0), (-16.0, Y0 + 1.0)):
        P.append(BX('gf_pier', x - 1.0, x + 1.0, y - 1.0, y + 1.0, 0, FL, CLAD))
    P.append(BX('crown', X0 - 0.3, X1 + 0.3, Y0 - 0.3, Y1 + 0.3, ZT, ZT + 3.4, CLAD))
    P.append(BX('roofslab', X0 + 0.5, X1 - 0.5, Y0 + 0.5, Y1 - 0.5, ZT, ZT + 2.8, ROOF))
    lo.append(SH('s_office', X0 - 0.4, X1 + 0.4, Y0 - 0.4, Y1 + 0.4, 0, ZT + 3.5))
    # full-height glass entrance bay + canopy on two round columns
    P.append(BX('bay', -9.0, -1.0, Y0 - 3.0, Y0, 0.0, ZT + 5.0, CW))
    P.append(BX('bay_cap', -9.4, -0.6, Y0 - 3.4, Y0, ZT + 5.0, ZT + 6.0, CLAD))
    lo.append(SH('s_bay', -9.5, -0.5, Y0 - 3.5, Y0 - 0.3, 0, ZT + 6.1))
    P.append(BX('canopy', -13.0, 3.0, Y0 - 9.0, Y0 - 3.0, 8.0, 9.0, mp('#d8dadc', 'hx_canopy')))
    for x in (-11.5, 1.5):
        P.append(cylinder('can_col', 0.4, 8.0, (x, Y0 - 8.2, 0), seg=8, mat=mp('#b8bcc0', 'hx_steel', rough=0.6)))
        lo.append(tri_post('s_cancol', x, Y0 - 8.2, 0.8, 0, 8.0))
    lo.append(SH('s_canopy', -13.1, 3.1, Y0 - 9.1, Y0 - 3.0, 7.9, 9.1))
    P.append(BX('drive', -17.0, 5.0, -25.0, Y0 - 3.0, 0, 0.3, kit.material('granite_grey', 'hx_drive', base='#8a8784', rough=0.8)))
    lo.append(SH('s_drive', -17.1, 5.1, -25.1, Y0 - 3.0, 0, 0.35))
    # roof plant: water tanks + lift room
    P.append(BX('liftroom', -30.0, -22.0, 6.0, 14.0, ZT, ZT + 6.0, CLAD))
    lo.append(SH('s_lift', -30.1, -21.9, 5.9, 14.1, ZT, ZT + 6.1))
    for x in (-8.0, -4.0):
        P.append(cylinder('tank', 1.4, 2.6, (x, 12.0, ZT + 2.8), seg=10, mat=mp('#1e1e1e', 'hx_tank', rough=0.7)))
        lo.append(lathe('s_tank', [(1.5, ZT + 2.8), (1.5, ZT + 5.5), (0.0, ZT + 5.6)], seg=5, loc=(x, 12.0, 0), close_bottom=False))
    # ---- the construction site next door
    CON = kit.material('whitewash', 'hx_concrete', base='#b4afa5', rough=0.9, var=0.12, grain=0.1, grime=0.6, streaks=0.5, dirt='#5f594f')
    BRK = kit.material('red_oxide', 'hx_brick', base='#a0523a', rough=0.85, var=0.14, grain=0.14, scale=1.2)
    REB = mp('#6a4a36', 'hx_rebar', rough=0.8)
    TIN = mp('#2f6db0', 'hx_tin', grime=0.35)
    add_band(TIN, 2.6, 3.3, '#f2f2ee')
    SX0, SX1, SY0, SY1 = 7.0, 33.0, -15.0, 19.0
    cols = [(x, y) for x in (8.0, 20.0, 32.0) for y in (-14.0, 2.0, 18.0)]
    for i, zs in enumerate((FL, 2 * FL, 3 * FL)):
        P.append(BX('slab', SX0, SX1, SY0, SY1, zs - 0.8, zs, CON))
        lo.append(L.shell_box('s_slab', (SX1 - SX0 + 0.2, SY1 - SY0 + 0.2, 1.0), ((SX0 + SX1) / 2, (SY0 + SY1) / 2, zs - 0.9)))
    for (x, y) in cols:
        P.append(BX('col', x - 0.6, x + 0.6, y - 0.6, y + 0.6, 0, 3 * FL + 3.0, CON))
        for dx in (-0.35, 0.35):
            for dy in (-0.35, 0.35):
                P.append(BX('rebar', x + dx - 0.07, x + dx + 0.07, y + dy - 0.07, y + dy + 0.07, 3 * FL + 3.0, 3 * FL + 6.0, REB))
        lo.append(tri_post('s_col', x, y, 1.3, 0, 3 * FL + 6.1))
    P.append(BX('brick_w', SX0, 20.0, SY1 - 0.6, SY1, 0.0, FL - 0.8, BRK))
    P.append(BX('brick_w2', SX0, SX0 + 0.6, SY0, SY1, 0.0, 6.0, BRK))
    lo.append(SH('s_brick', SX0 - 0.1, 20.1, SY1 - 0.7, SY1 + 0.1, 0, FL - 0.75))
    lo.append(SH('s_brick2', SX0 - 0.1, SX0 + 0.7, SY0, SY1, 0, 6.1))
    P.append(cylinder('sand', 4.0, 2.4, (26.0, -20.5, 0), seg=10, mat=kit.material('sandstone', 'hx_sand', base='#c8a878', rough=0.9), r2=0.6))
    lo.append(lathe('s_sand', [(4.1, 0), (0.6, 2.5), (0.0, 2.5)], seg=6, loc=(26.0, -20.5, 0), close_bottom=False))
    for k in range(6):                 # the blue tin hoarding along the front
        x = 6.0 + k * 4.6
        P.append(BX('tin', x, x + 4.5, -24.6, -24.4, 0, 4.2, TIN))
    lo.append(L.shell_box('s_tin', (28.0, 0.5, 4.3), (19.8, -24.5, 0)))
    # ---- the yellow tower crane
    YEL = mp('#e8b81c', 'hx_crane', rough=0.6, grime=0.3)
    CWT = mp('#9c968c', 'hx_cweight', grime=0.5)
    MX, MY, MZ = 27.0, 21.5, 72.0
    P.append(BX('crane_base', MX - 2.4, MX + 2.4, MY - 2.4, MY + 2.4, 0, 1.2, CON))
    P.append(_lattice('mast', MX - 1.2, MX + 1.2, MY - 1.2, MY + 1.2, 1.2, MZ, YEL))
    lo.append(SH('s_mast', MX - 2.5, MX + 2.5, MY - 2.5, MY + 2.5, 0, 1.3))
    lo.append(SH('s_mast2', MX - 1.45, MX + 1.45, MY - 1.45, MY + 1.45, 1.2, MZ))
    P.append(BX('slew', MX - 1.8, MX + 1.8, MY - 1.8, MY + 1.8, MZ, MZ + 1.6, YEL))
    P.append(BX('cab', MX - 1.6, MX + 0.6, MY - 3.8, MY - 1.8, MZ - 0.6, MZ + 2.2, mp('#e9e9e4', 'hx_cab')))
    P.append(BX('cab_win', MX - 1.65, MX + 0.65, MY - 3.85, MY - 3.0, MZ + 0.4, MZ + 2.0, mp('#2f4656', 'hx_cabwin')))
    lo.append(SH('s_slew', MX - 1.9, MX + 1.9, MY - 3.9, MY + 1.9, MZ - 0.7, MZ + 2.3))
    JZ = MZ + 1.6
    P.append(_jib('jib', MX - 1.2, -22.0, MY, JZ, 1.8, 2.0, YEL))
    lo.append(side_prism('s_jib', [(MY - 1.15, JZ - 0.35), (MY + 1.15, JZ - 0.35), (MY, JZ + 2.35)], -22.2, MX - 1.2))
    P.append(_jib('cjib', MX + 1.2, MX + 9.5, MY, JZ, 2.0, 0.6, YEL))
    P.append(BX('cweight', MX + 6.0, MX + 9.0, MY - 1.4, MY + 1.4, JZ - 3.2, JZ + 0.4, CWT))
    lo.append(SH('s_cjib', MX + 1.2, MX + 9.6, MY - 1.45, MY + 1.45, JZ - 3.3, JZ + 0.9))
    P.append(_lattice('apex', MX - 0.8, MX + 0.8, MY - 0.8, MY + 0.8, JZ, JZ + 7.0, YEL, step=2.3, bar=0.18))
    lo.append(lathe('s_apex', [(1.3, JZ), (0.5, JZ + 7.2), (0.0, JZ + 7.3)], seg=4, loc=(MX, MY, 0), close_bottom=False))
    for (xe, ze) in ((-6.0, JZ + 2.0), (MX + 9.0, JZ + 0.6)):
        P.append(kit.tube('pendant', [(MX, MY, JZ + 7.0), (xe, MY, ze)], 0.09, seg=4, mat=STL_(), cap=False))
        lo.append(prism_from_outline('s_pend', [(MX, JZ + 7.15), (xe, ze + 0.15), (xe, ze - 0.15), (MX, JZ + 6.85)], 0.3, center=(0, MY, 0)))
    TX = -4.0
    P.append(BX('trolley', TX - 1.0, TX + 1.0, MY - 1.0, MY + 1.0, JZ - 0.8, JZ, mp('#4a4a4a', 'hx_trolley')))
    P.append(BX('hook_line', TX - 0.08, TX + 0.08, MY - 0.08, MY + 0.08, 44.0, JZ - 0.8, STL_()))
    P.append(BX('hook', TX - 0.6, TX + 0.6, MY - 0.4, MY + 0.4, 42.6, 44.0, YEL))
    P.append(BX('load', TX - 2.5, TX + 2.5, MY - 0.7, MY + 0.7, 40.6, 42.0, REB))
    lo.append(SH('s_trolley', TX - 1.1, TX + 1.1, MY - 1.1, MY + 1.1, JZ - 0.9, JZ))
    lo.append(tri_post('s_line', TX, MY, 0.3, 44.0, JZ - 0.8))
    lo.append(L.shell_box('s_load', (5.2, 1.6, 3.6), (TX, MY, 40.5)))
    # picture sheet: the name on the crown (lit at night), a few lit office strips, crane lights
    sh = sheet(A.id, 512, 128)
    uv_n = sh.put(CT.text_cv('DECCAN INFOTECH', 448, 40, '#1d3f8a', '#eef2f4', size=0.8))
    lw = CT.Canvas(256, 16, GLS)
    lw.grad(0.0, 1.0, '#2a5a8c', '#5a88b8')
    for k in range(12):
        lw.rect(k / 12 + 0.006, 0, k / 12 + 0.012, 1, MUL)
    for k in range(5):
        lw.rect(0.05 + k * 0.19, 0.15, 0.13 + k * 0.19, 0.85, '#e9f0f6', 0.35)
    uv_w = sh.put(lw)
    uv_r = sh.put(CT.Canvas(8, 8, '#ff2a1a'))
    sh.quad(uv_n, 24.0, 2.6, (-22.0, Y0 - 0.45, ZT + 1.7))
    for (f, xa, xb) in ((1, -33.0, -22.0), (2, -21.0, -11.0), (3, -33.0, -22.0), (4, -21.0, -11.0)):
        sh.quad(uv_w, xb - xa, 7.6, ((xa + xb) / 2, Y0 - 0.45, f * FL + 3.6 + 3.8))
    sheet_box(sh, uv_r, -22.6, -21.8, MY - 0.4, MY + 0.4, JZ + 2.0, JZ + 2.7)
    sheet_box(sh, uv_r, MX - 0.4, MX + 0.4, MY - 0.4, MY + 0.4, JZ + 7.0, JZ + 7.7)
    tally(A.id + ' lo', lo)
    finish_m(A, P, lo, keep=[sh.obj()], size=320, ao=6.0)
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 5, 'fov': 32, 'pad': 1.05}}])


def STL_():
    return mp('#7a7e82', 'hx_cable', rough=0.6)


# =========================================================================== registration (parked)
# Parked owner must-haves (they return with lazy per-GLB loading): buildable only with
# NOSTALGIA_PARKED=1, never packed into the real pack. cyber_towers (above) is shipped.
if os.environ.get('NOSTALGIA_PARKED') == '1':
    kit.asset('spanish_mosque', 'landmark', draw='spanish_mosque', face='s', footprint=[40, 40], height=66.0, fit='footprint', floodlit=True)(build_spanish_mosque)
    kit.asset('atc_tower', 'landmark', draw='control_tower', footprint=[18, 18], height=78.0, fit='footprint', floodlit=True)(build_atc_tower)
    kit.asset('parked_plane', 'landmark', draw='aeroplane', face='e', footprint=[40, 46], height=21.0, fit='footprint')(build_parked_plane)
    kit.asset('begumpet_airport', 'landmark', draw='airport_terminal', face='s', footprint=[120, 36], height=33.0, fit='footprint')(build_begumpet_airport)
    kit.asset('osmania_arts_college', 'landmark', draw='ou_arts_college', face='s', footprint=[200, 70], height=66.0, fit='footprint', floodlit=True)(build_ou_arts_college)
    kit.asset('hitec_office', 'landmark', landmark='hitec_office_1', face='s', footprint=[70, 50], height=75.0, fit='footprint')(build_hitec_office)
