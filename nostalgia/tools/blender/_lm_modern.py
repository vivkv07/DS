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
@kit.asset('cyber_towers', 'landmark', draw='cyber_towers', face='s', footprint=[96, 96], height=135.0, fit='footprint', floodlit=False)
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
    endm = facade('ct_end', base='#eceeed', glass='#2f6f80', period=FL, z0=Z0, z1=ZT - 1.0, band=(0.0, 3.8), rows=(6.3, 2.2), streaks=0.15)
    ring_out = facade('ct_glass_out', base='#e9ecec', glass='#2f6f80', glass2='#7fb4c0', period=FL, z0=Z0, z1=ZT - 1.0,
                      band=(0.0, 3.8), mull=(6.8, 0.5, '#1d3f4a'), horiz='radial', R=RO, streaks=0.0, grime=0.1)
    ring_in = facade('ct_glass_in', base='#e4e8e8', glass='#2a6474', glass2='#6aa0ae', period=FL, z0=Z0, z1=ZT - 1.0,
                     band=(0.0, 3.8), mull=(6.0, 0.5, '#1d3f4a'), horiz='radial', R=RI, streaks=0.0, grime=0.1)
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
