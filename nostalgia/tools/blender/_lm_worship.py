"""part of the landmark family scripts (see landmarks_centre.py / landmarks_west.py)

Places of worship (group WORSHIP), PARKED: every builder registers only under NOSTALGIA_PARKED=1
(owner must-haves that ship once models load lazily per GLB; never packed into the real pack).
  st_josephs_cathedral      #church_st_josephs   Italianate twin-towered cathedral, Gunfoundry
  st_marys_church           #church_st_marys     Gothic, tall front tower + spire, Secunderabad
  wesley_church             #church_wesley       Gothic, corner tower + spire, Secunderabad
  dilsukhnagar_sai_temple   draw sai_temple      modern white Sai Baba temple, shikhara + mandapam
  ujjaini_mahankali_temple  #ujjaini_mahankali_temple   painted gopuram, striped compound wall
  lal_darwaza_temple        #lal_darwaza_temple  the red arched gateway, shrine + small vimana
  kit_temple                draw temple   variants vimana / gopuram / shrine (hash)
  kit_mosque                draw mosque   variants minars / dome (hash)
  kit_church                draw church   small neighbourhood church
  kit_dargah                draw dargah   white tomb chamber, green dome, kiosks, flags, gateway
Modelled plainly and respectfully: no deity figures or faces (sanctum doorways are closed or dim),
nothing comic, nothing destructible. Technique: L.finish_proxy. The detail (painted facades from
_lm_civic.Fac, cornices, arches, tiers, mouldings) is baked onto simple hand-built shells.
"""
import math
import os
import bmesh
from mathutils import Vector, Matrix
import kit
import _lmkit as L
from kit import box, cylinder, lathe, prism_from_outline, arch_outline
import _lm_civic as C
from _lm_civic import Fac, fbox, blk, sign_keep
from _lm_golconda import poly, apart, unapart

PI = math.pi
PARKED = os.environ.get('NOSTALGIA_PARKED') == '1'
SAFFRON = '#ef8a1f'
GREEN = '#1e7a45'


def parked(aid, family, **meta):
    """@kit.asset only under NOSTALGIA_PARKED=1 (REVISION 4): otherwise the builder stays a plain function"""
    def deco(fn):
        if PARKED:
            return kit.asset(aid, family, **meta)(fn)
        return fn
    return deco


# =========================================================================== small helpers
_N = [0]


def Fw(*a, **k):
    """Fac with no pixel noise (the bake adds grime; flat fields keep the WebP atlas small)"""
    k.setdefault('noise', 0.0)
    return Fac(*a, **k)


def pp(col, name):
    """plain painted surface (uniform roughness: no ORM map)"""
    return L.paint(col, name, key='whitewash', var=0.02, grain=0.0, grime=0.25, streaks=0.12)


def _uid(s):
    _N[0] += 1
    return '%s_%s_%d' % (C._ASSET[0], s, _N[0])


def fpanel(name, outline, fac, loc=(0, 0, 0), rz=0.0):
    """flat n-gon from an (x, z) outline facing -Y, painted with a Fac / image mapped over the
    outline's bounding box (x0 -> u 0, z0 -> v 0), turned by rz and moved to loc"""
    img = fac.image(_uid(name)) if isinstance(fac, Fac) else fac
    mat = kit.sign_material(img, grime=0.12)
    xs = [p[0] for p in outline]
    zs = [p[1] for p in outline]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    bm = bmesh.new()
    suv = bm.loops.layers.uv.new('SignUV')
    bm.loops.layers.uv.new('UVMap')
    f = bm.faces.new([bm.verts.new((x, 0.0, z)) for (x, z) in outline])
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    for lp in f.loops:
        lp[suv].uv = ((lp.vert.co.x - x0) / max(1e-3, x1 - x0), (lp.vert.co.z - z0) / max(1e-3, z1 - z0))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, 'Z'), verts=bm.verts)
    return kit.obj_from_bm(bm, name, mat)


def gable_ol(w, eave, rise, z0=0.0):
    return [(-w / 2, z0), (w / 2, z0), (w / 2, eave), (0.0, eave + rise), (-w / 2, eave)]


def no_bottom(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    return o


def gable_lo(name, cx, cy, w, d, eave, rise, z0=0.0, rz=0.0):
    """open-bottom house prism shell, ridge along Y (rz turns it about its centre)"""
    o = no_bottom(prism_from_outline(name, gable_ol(w, eave, rise, z0), d))
    return L.place(o, (cx, cy, 0), rz)


def roof_hi(name, cx, cy, w, d, eave, rise, mat, over=0.8, t=0.5, rz=0.0):
    """two thin roof slabs over a gable (ridge along Y), overhanging by `over`"""
    hw = w / 2
    a = math.atan2(rise, hw)
    run = hw + over
    Ls = run / math.cos(a)
    out = []
    for s in (-1, 1):
        r = box(name, (Ls, d + 2 * over, t), (0, 0, 0), mat)
        r.rotation_euler = (0, s * a, 0)
        r.location = (s * (run / 2 - math.sin(a) * t / 2), 0, eave + rise - run * math.tan(a) / 2 + math.cos(a) * t / 2)
        kit.apply_transform(r)
        out.append(r)
    return L.place(kit.join(out, name), (cx, cy, 0), rz)


def cross(name, x, y, z, h, w, t, mat):
    """latin cross (two boxes), base at z"""
    return kit.join([box(name, (t, t, h), (x, y, z), mat, base=True),
                     box(name + '_b', (w, t, t), (x, y, z + h * 0.66), mat, base=True)], name)


def cross_lo(name, x, y, z, h, w, t, rz=0.0):
    """shell of cross(): the cross outline as a double-sided card pair (front + back), no sides"""
    a, b = t / 2 + 0.12, h * 0.66
    ol = [(-a, -0.1), (a, -0.1), (a, b - 0.12), (w / 2 + 0.12, b - 0.12), (w / 2 + 0.12, b + t + 0.12), (a, b + t + 0.12),
          (a, h + 0.12), (-a, h + 0.12), (-a, b + t + 0.12), (-w / 2 - 0.12, b + t + 0.12), (-w / 2 - 0.12, b - 0.12), (-a, b - 0.12)]
    f = poly(name, ol, None, (0, -t / 2 - 0.1, 0))
    bk = poly(name + '_bk', [(-px, pz) for (px, pz) in ol], None, (0, t / 2 + 0.1, 0), PI)
    return L.place(kit.join([f, bk], name), (x, y, z), rz)


def card_lo(name, ol, loc, rz=0.0, gap=0.3):
    """double-sided card pair from an (x, z) outline (flags, crests, thin cut-outs)"""
    f = poly(name, ol, None, (0, -gap / 2, 0))
    bk = poly(name + '_bk', [(-px, pz) for (px, pz) in ol], None, (0, gap / 2, 0), PI)
    return L.place(kit.join([f, bk], name), loc, rz)


def spire_lo(name, x, y, z0, h, r, seg=4):
    s = cylinder(name, r, h, (0, 0, 0), seg=seg, r2=0.0, cap=False)
    return L.place(s, (x, y, z0), PI / 4 if seg == 4 else 0.0)


def flag(name, x, y, z, h, col, size=2.6, pole='#9a9a96'):
    """pole + triangular pennant pointing +X (hi)"""
    p = cylinder(name + '_pole', 0.16, h, (x, y, z), seg=5, mat=pp(pole, 'ws_pole'))
    f = prism_from_outline(name, [(0, 0), (size * 1.6, size * 0.45), (0, size)], 0.15, center=(x + 0.12, y, z + h - size - 0.1), mat=pp(col, 'ws_flag_' + col.strip('#')))
    return kit.join([p, f], name)


def flag_lo(name, x, y, z, h, size=2.6, pole=True):
    out = [card_lo(name, [(0, 0), (size * 1.6 + 0.2, size * 0.45), (0, size + 0.1)], (x + 0.1, y, z + h - size - 0.15), gap=0.35)]
    if pole:
        out.append(cylinder(name + '_p', 0.3, h, (x, y, z), seg=3, cap=False))
    return kit.join(out, name)


def kalash(name, x, y, z, s, mat, seg=8):
    return lathe(name, [(0.5 * s, 0), (0.9 * s, 0.5 * s), (0.6 * s, 1.1 * s), (0.25 * s, 1.4 * s), (0.4 * s, 1.7 * s), (0.0, 2.6 * s)],
                 seg=seg, mat=mat, loc=(x, y, z))


def lamp_box(name, size, loc, col='#ffd9a0'):
    return box(name, size, loc, L.lamp(col), base=True)


def tree(name, x, y, r, h, leaf='#4f7f34', seed=1):
    """neem / peepal (hi): trunk + three jittered canopy blobs"""
    parts = [cylinder(name + '_t', r * 0.13, h * 0.6, (x, y, 0), seg=6, mat=pp('#6a5440', 'ws_bark'), r2=r * 0.08)]
    for i, (dx, dy, dz, k) in enumerate(((0, 0, h * 0.74, 1.0), (r * 0.55, -r * 0.25, h * 0.66, 0.68), (-r * 0.5, r * 0.3, h * 0.68, 0.62))):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        for v in bm.verts:
            j = math.sin((v.co.x * 3.1 + v.co.y * 1.7 + v.co.z * 2.3 + seed + i) * 2.0) * 0.14
            v.co.x *= r * k * (1 + j)
            v.co.y *= r * k * (1 - j)
            v.co.z *= r * k * 0.6
        bmesh.ops.translate(bm, vec=(x + dx, y + dy, dz), verts=bm.verts)
        parts.append(kit.obj_from_bm(bm, name + '_c', pp(leaf, 'ws_leaf_' + leaf.strip('#'))))
    return kit.join(parts, name)


def tree_lo(name, x, y, r, h):
    """hand-built shell of tree(): a 6-sided canopy lump on a trunk prism"""
    c = lathe(name, [(r * 0.5, h * 0.42), (r * 1.4, h * 0.6), (r * 1.25, h * 0.8), (r * 0.5, h * 0.96), (0.0, h * 1.0)], seg=6, loc=(x, y, 0))
    t = cylinder(name + '_t', r * 0.2, h * 0.46, (x, y, 0), seg=4, cap=False)
    return kit.join([c, t], name)


def onion(name, r, h, z, mat, seg=16, loc=(0, 0), n=9, neck=0.85, bulge=1.12):
    return lathe(name, kit.onion_profile(r, h, neck=neck, bulge=bulge, tip=0.08, n=n, base_z=z), seg=seg, mat=mat, loc=(loc[0], loc[1], 0), close_bottom=False)


def onion_prof(r, h, z, pad=0.2, top=None):
    """compact shell profile of onion() (5 rings): waist, bulge, shoulder, tip, finial point"""
    return [(r * 0.85 + pad, z), (r * 1.12 + pad, z + 0.3 * h), (r * 0.9 + pad, z + 0.6 * h), (r * 0.32 + pad, z + 0.92 * h), (0.0, top or z + 1.35 * h)]


def hemi(name, r, h, z, mat, seg=16, loc=(0, 0), n=6, point=0.0):
    prof = [(r * math.cos(a), z + h * math.sin(a)) for a in [PI / 2 * i / n for i in range(n)]] + [(0.0, z + h + point)]
    return lathe(name, prof, seg=seg, mat=mat, loc=(loc[0], loc[1], 0), close_bottom=False)


def frustum_lo(name, x, y, w0, d0, w1, d1, z0, z1):
    """open-bottom tapering box (gopuram / vimana / shikhara shell)"""
    bm = bmesh.new()
    b = [bm.verts.new((x + sx * w0 / 2, y + sy * d0 / 2, z0)) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = [bm.verts.new((x + sx * w1 / 2, y + sy * d1 / 2, z1)) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((b[i], b[j], t[j], t[i]))
    bm.faces.new(t)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name)


def bake(A, P, lo, keep=None, size=384, variants=None):
    groups = {}
    for o in (keep or []):
        if o is not None:
            groups.setdefault(o.data.materials[0].name, []).append(o)
    # one object per material (finish_proxy resets the slot indices of multi-material keeps)
    keep = [kit.join(g, A.id + '_' + k.split('@')[0][-12:]) if len(g) > 1 else g[0] for k, g in groups.items()]
    los = L.finish_proxy(A, P, lo=lo, keep=keep, size=size, ao_samples=48, ao_strength=0.65, ao_dist=6.0, variants=variants)
    for o in los:
        kit.smooth(o, 70)
    return los


def wall_fac(w, h, bg, cap, seed=1, stripes=None, pillar=None, pitch=6.0):
    """compound wall face: optional vertical stripes (two colours), pillars every `pitch`, coping band"""
    f = Fw(w, h, bg, seed=seed)
    if stripes:
        n = max(2, int(round(w / stripes[2])))
        for i in range(n):
            if i % 2:
                f.rect(w * i / n, 0, w * (i + 1) / n, h, stripes[1])
            else:
                f.rect(w * i / n, 0, w * (i + 1) / n, h, stripes[0])
    if pillar:
        n = max(1, int(round(w / pitch)))
        f.pilasters(n, 0.9, pillar)
    f.band(h - 0.45, h, cap)
    f.dirt(1.2, alpha=0.3)
    return f


def wall_run(P, lo, name, x0, y0, x1, y1, h, t, fac_args, z0=0.0, lo_pad=0.15):
    """a straight compound wall segment (hi painted both faces) + its open-bottom shell"""
    ln = math.hypot(x1 - x0, y1 - y0)
    rz = math.atan2(y1 - y0, x1 - x0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    f1 = wall_fac(ln, h, *fac_args)
    w = fbox(name, 0, 0, ln, t, z0, z0 + h, pp(fac_args[0], name + '_m'), faces={'f': f1, 'b': f1})
    P.append(L.place(w, (cx, cy, 0), rz))
    lo.append(L.place(blk(name + '_lo', 0, 0, ln, t + 2 * lo_pad, z0, z0 + h + 0.1, None), (cx, cy, 0), rz))


# =========================================================================== 1. St Joseph's Cathedral
@parked('st_josephs_cathedral', 'landmark', landmark='church_st_josephs', face='e', footprint=[70, 50], height=66.0,
        fit='footprint', floodlit=True)
def build_st_josephs(A):
    """St Joseph's Cathedral, Gunfoundry (1875; facade + twin towers 1891): a cream Italianate
    facade with grey trim; twin bell towers (tall round-arched windows, an open belfry stage, a
    drum + cupola + cross); the central bay with the round-arched main door, a plain statue niche
    and the triangular pediment with a cross; a clock on the left tower; the nave with lean-to
    aisles and a round apse behind; a low front compound wall with lamp-topped gate pillars."""
    C._ASSET[0] = A.id
    CREAM, TRIM, DARK, WIN, WOOD, NICHE = '#e8d4a4', '#8e8a82', '#2a2622', '#3a3e44', '#5a3d27', '#a49d90'
    cream, grey = pp(CREAM, 'sj_cream'), pp(TRIM, 'sj_grey')
    tile, cup, stone = pp('#9a5a43', 'sj_tile'), pp('#8a8781', 'sj_cupola'), pp('#ebe5d6', 'sj_stone')
    P, lo, keep = [], [], []
    fy = -12.0                      # facade plane (central bay)
    # ---- low front compound wall with gate pillars (lamps on top)
    for s in (-1, 1):
        wall_run(P, lo, 'sj_cw%d' % (s + 1), s * 7.6, -24.0, s * 33.5, -24.0, 2.8, 0.7, (CREAM, TRIM, 3, None, TRIM, 5.0))
        P.append(box('sj_gp', (2.2, 2.2, 5.0), (s * 7.0, -24.0, 0), grey, base=True))
        P.append(box('sj_gpc', (2.6, 2.6, 0.5), (s * 7.0, -24.0, 5.0), cream, base=True))
        lo.append(blk('sj_gp_lo', s * 7.0, -24.0, 2.7, 2.7, 0, 5.6, None))
        keep.append(lamp_box('sj_gl', (1.0, 1.0, 1.1), (s * 7.0, -24.0, 5.5)))
    # ---- central bay
    f = Fw(20.8, 32, CREAM, seed=2)
    f.dirt(2.0).band(0, 1.4, TRIM)
    f.rect(0, 0, 1.6, 32, TRIM).rect(19.2, 0, 20.8, 32, TRIM)
    f.arch(10.4, 1.4, 6.6, 12.0, WOOD, 'round', frame=TRIM, fw=0.9)
    f.band(14.0, 15.0, TRIM)
    f.arch(10.4, 16.6, 4.4, 9.6, NICHE, 'round', frame=TRIM, fw=0.5, shade=False)
    for x in (4.6, 16.2):
        f.arch(x, 3.0, 2.6, 9.4, WIN, 'round', frame=TRIM, fw=0.4, sill=TRIM)
        f.arch(x, 17.6, 2.4, 8.2, WIN, 'round', frame=TRIM, fw=0.4, sill=TRIM)
    f.band(30.4, 32, TRIM)
    P.append(fbox('sj_bay', 0, fy + 4.0, 20.8, 8.0, 0, 32, cream, faces={'f': f}))
    for z in (14.0, 30.6):
        P.append(box('sj_corn', (21.4, 1.0, 1.0), (0, fy - 0.2, z), grey, base=True))
    P.append(box('sj_ped_base', (6.0, 1.4, 0.8), (0, fy - 0.3, 16.4), stone, base=True))
    P.append(lathe('sj_fig', [(1.0, 0), (0.95, 1.5), (0.8, 3.6), (0.85, 4.6), (0.4, 5.2), (0.55, 5.6), (0.5, 6.2), (0.0, 6.6)], seg=8, mat=stone, loc=(0, fy - 0.35, 17.2)))
    lo.append(blk('sj_bay_lo', 0, fy + 4.0, 21.0, 8.8, 0, 32.2, None))
    # pediment with a grey raking cornice, oculus and cross
    P.append(prism_from_outline('sj_pedc', [(-11.0, 0), (11.0, 0), (0, 7.6)], 1.0, center=(0, fy + 0.4, 31.8), mat=grey))
    P.append(prism_from_outline('sj_ped', [(-9.8, 0), (9.8, 0), (0, 6.6)], 1.2, center=(0, fy + 0.3, 32.2), mat=cream))
    P.append(poly('sj_ocu', [(1.5 * math.cos(2 * PI * i / 12), 34.6 + 1.5 * math.sin(2 * PI * i / 12)) for i in range(12)], pp(WIN, 'sj_win'), (0, fy - 0.32, 0)))
    lo.append(no_bottom(prism_from_outline('sj_ped_lo', [(-11.2, 31.8), (11.2, 31.8), (0, 39.7)], 9.0, center=(0, fy + 4.0, 0))))
    P.append(cross('sj_xp', 0, fy + 0.4, 39.0, 5.0, 2.8, 0.5, stone))
    lo.append(cross_lo('sj_xp_lo', 0, fy + 0.4, 39.0, 5.0, 2.8, 0.5))
    # ---- twin towers
    for s in (-1, 1):
        tx, ty = s * 15.2, fy + 4.0
        side = 'l' if s < 0 else 'r'
        ff = Fw(10, 33, CREAM, seed=3 + s)
        ff.dirt(2.0).band(0, 1.4, TRIM)
        ff.rect(0, 0, 1.1, 33, TRIM).rect(8.9, 0, 10, 33, TRIM)
        ff.arch(5, 3.0, 2.8, 9.8, WIN, 'round', frame=TRIM, fw=0.45, sill=TRIM)
        if s > 0:
            ff.arch(5, 18.0, 2.5, 8.6, WIN, 'round', frame=TRIM, fw=0.45, sill=TRIM)
        else:
            ff.arch(5, 17.0, 2.0, 5.0, WIN, 'round', frame=TRIM, fw=0.4, sill=TRIM)
        ff.band(14.0, 15.0, TRIM).band(31.6, 33, TRIM)
        fs = Fw(10, 33, CREAM, seed=5 + s)
        fs.dirt(2.0).band(0, 1.4, TRIM)
        fs.rect(0, 0, 1.1, 33, TRIM).rect(8.9, 0, 10, 33, TRIM)
        fs.arch(5, 3.0, 2.6, 9.4, WIN, 'round', frame=TRIM, fw=0.4, sill=TRIM)
        fs.arch(5, 18.0, 2.4, 8.4, WIN, 'round', frame=TRIM, fw=0.4, sill=TRIM)
        fs.band(14.0, 15.0, TRIM).band(31.6, 33, TRIM)
        P.append(fbox('sj_tw%d' % (s + 1), tx, ty - 0.6, 10, 10, 0, 33, cream, faces={'f': ff, side: fs, 'b': fs}))
        for (z, w, h) in ((14.0, 10.8, 1.0), (31.8, 11.2, 1.4)):
            P.append(box('sj_tcorn', (w, w, h), (tx, ty - 0.6, z), grey, base=True))
        lo.append(blk('sj_tw_lo', tx, ty - 0.6, 10.5, 10.5, 0, 33.3, None))
        # open belfry stage
        fb = Fw(8.4, 10.8, CREAM, seed=7 + s)
        fb.rect(0, 0, 1.0, 10.8, TRIM).rect(7.4, 0, 8.4, 10.8, TRIM)
        fb.arch(4.2, 1.4, 3.6, 7.6, DARK, 'round', frame=TRIM, fw=0.5, sill=TRIM)
        fb.band(9.8, 10.8, TRIM)
        P.append(fbox('sj_bel%d' % (s + 1), tx, ty - 0.6, 8.4, 8.4, 33.2, 44.0, cream, faces={'f': fb, 'l': fb, 'r': fb, 'b': fb}))
        P.append(box('sj_bcorn', (9.6, 9.6, 1.0), (tx, ty - 0.6, 44.0), grey, base=True))
        lo.append(blk('sj_bel_lo', tx, ty - 0.6, 8.8, 8.8, 33.2, 45.1, None))
        # drum, cupola, lantern, cross
        P.append(cylinder('sj_drum', 3.3, 3.0, (tx, ty - 0.6, 45.0), seg=12, mat=cream))
        P.append(cylinder('sj_drum_c', 3.7, 0.5, (tx, ty - 0.6, 47.8), seg=12, mat=grey))
        P.append(hemi('sj_dome', 3.6, 4.4, 48.3, cup, seg=12, loc=(tx, ty - 0.6), n=5))
        P.append(cylinder('sj_lan', 0.75, 1.8, (tx, ty - 0.6, 52.5), seg=8, mat=grey))
        P.append(cylinder('sj_lanc', 1.0, 0.4, (tx, ty - 0.6, 54.3), seg=8, mat=grey, r2=0.3))
        P.append(cross('sj_x', tx, ty - 0.6, 54.6, 6.0, 3.0, 0.45, stone))
        lo.append(lathe('sj_cup_lo', [(3.5, 45.0), (3.5, 47.8), (3.9, 47.9), (3.9, 48.4), (3.4, 50.3), (2.2, 52.0), (0.95, 52.6), (0.95, 54.5), (0.0, 54.8)],
                        seg=8, loc=(tx, ty - 0.6, 0), close_bottom=False))
        lo.append(cross_lo('sj_x_lo', tx, ty - 0.6, 54.6, 6.0, 3.0, 0.45))
    # clock on the left tower (upper window shortened under it)
    cx, cy = -15.2, fy + 4.0 - 0.6 - 5.0
    P.append(poly('sj_clk', [(2.0 * math.cos(2 * PI * i / 16), 27.6 + 2.0 * math.sin(2 * PI * i / 16)) for i in range(16)], stone, (cx, cy - 0.06, 0)))
    P.append(poly('sj_clkr', [(2.4 * math.cos(2 * PI * i / 16), 27.6 + 2.4 * math.sin(2 * PI * i / 16)) for i in range(16)], grey, (cx, cy - 0.03, 0)))
    P.append(poly('sj_hands', [(-0.12, 27.6), (0.12, 27.6), (0.12, 29.1), (-0.12, 29.1)], pp(DARK, 'sj_dark'), (cx, cy - 0.09, 0)))
    P.append(poly('sj_hands2', [(-0.12, 27.48), (1.2, 27.48), (1.2, 27.72), (-0.12, 27.72)], pp(DARK, 'sj_dark'), (cx, cy - 0.09, 0)))
    # ---- nave, aisles (lean-to), apse
    NY0, NY1, EAVE, RISE = fy + 8.0, 16.0, 24.0, 8.0
    ny = (NY0 + NY1) / 2
    fn = Fw(NY1 - NY0, EAVE, CREAM, seed=11)
    fn.arches(4, 16.2, 2.0, 6.0, WIN, kind='round', frame=TRIM, fw=0.35)
    fn.band(EAVE - 1.0, EAVE, TRIM)
    fnb = Fw(20.0, EAVE, CREAM, seed=12)
    fnb.arch(10, 15.0, 2.6, 7.0, WIN, 'round', frame=TRIM, fw=0.4).band(EAVE - 1.0, EAVE, TRIM)
    P.append(fbox('sj_nave', 0, ny, 20.0, NY1 - NY0, 0, EAVE, cream, faces={'l': fn, 'r': fn, 'b': fnb}, top=False))
    fg = Fw(20.0, RISE, CREAM, seed=13)
    P.append(fpanel('sj_gable', [(-10, 0), (10, 0), (0, RISE)], fg, (0, NY1, EAVE), PI))
    P.append(roof_hi('sj_roof', 0, ny + 0.6, 20.0, NY1 - NY0 + 0.4, EAVE, RISE, tile, over=0.8, t=0.5))
    lo.append(gable_lo('sj_nave_lo', 0, ny + 0.6, 21.6, NY1 - NY0 + 2.2, EAVE + 0.1, RISE + 0.9))
    for s in (-1, 1):
        side = 'l' if s < 0 else 'r'
        fa = Fw(NY1 - NY0 - 1.0, 14.0, CREAM, seed=14 + s)
        fa.dirt(2.0).band(0, 1.2, TRIM)
        fa.pilasters(4, 0.7, TRIM)
        fa.arches(4, 2.6, 2.4, 8.0, WIN, kind='round', frame=TRIM, fw=0.35, sill=TRIM)
        fa.band(13.0, 14.0, TRIM)
        P.append(fbox('sj_aisle%d' % (s + 1), s * 13.6, ny - 0.5, 7.6, NY1 - NY0 - 1.0, 0, 14.0, cream, faces={side: fa, 'b': Fw(7.6, 14.0, CREAM)}, top=False))
        ol = [(s * 17.8, 13.7), (s * 9.9, 13.7), (s * 9.9, 16.6), (s * 17.8, 14.3)]
        P.append(prism_from_outline('sj_aroof', ol if s > 0 else list(reversed(ol)), NY1 - NY0, center=(0, ny - 0.5, 0), mat=tile))
        lo.append(no_bottom(prism_from_outline('sj_aisle_lo', [(s * 17.9, 0), (s * 9.9, 0), (s * 9.9, 16.8), (s * 17.9, 14.5)], NY1 - NY0 + 0.4, center=(0, ny - 0.5, 0))))
    P.append(cylinder('sj_apse', 7.6, 19.0, (0, NY1, 0), seg=12, mat=cream))
    P.append(cylinder('sj_apr', 8.4, 6.0, (0, NY1, 19.0), seg=12, mat=tile, r2=0.6))
    for a in (40, 90, 140):
        r = math.radians(a)
        P.append(poly('sj_apw', arch_outline(2.2, 5.0, 1.1, 'round', n=5), pp(WIN, 'sj_win'), (7.68 * math.cos(r), NY1 + 7.68 * math.sin(r), 5.0), r - PI / 2))
    lo.append(cylinder('sj_apse_lo', 7.9, 19.1, (0, NY1, 0), seg=8, cap=False))
    lo.append(cylinder('sj_apr_lo', 8.8, 6.4, (0, NY1, 19.0), seg=8, r2=0.4, cap=False))
    bake(A, P, lo, keep=keep, size=384)
    L.col_box('sj', (40, 34, 30), (0, 2, 0))
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== Gothic church pieces
def lancet_fac(f, cx, z0, w, h, col, frame=None, fw=0.4, sill=None):
    """a tall lancet (pointed, rise ~ the width) painted on a Fac"""
    f.arch(cx, z0, w, h, col, 'pointed', frame=frame, fw=fw, spring=h - w * 1.05, sill=sill)
    return f


def lancets(f, n, z0, w, h, col, x0=0.0, x1=None, frame=None, fw=0.4, sill=None, skip=()):
    x1 = f.w if x1 is None else x1
    step = (x1 - x0) / n
    for i in range(n):
        if i not in skip:
            lancet_fac(f, x0 + step * (i + 0.5), z0, w, h, col, frame, fw, sill)
    return f


def pinnacles(P, mat, pts, z, h, r=0.5):
    for (x, y) in pts:
        P.append(box('pin_b', (r * 2, r * 2, h * 0.35), (x, y, z), mat, base=True))
        P.append(cylinder('pin', r * 1.1, h * 0.65, (x, y, z + h * 0.35), seg=4, mat=mat, r2=0.0))


def oct_spire(P, lo, name, x, y, z0, h, r, mat, band, cross_mat, lucarnes=True):
    """octagonal broach spire with small gabled lucarnes, grey bands and a cross"""
    s = cylinder(name, r, h, (0, 0, 0), seg=8, mat=mat, r2=0.25)
    P.append(L.place(s, (x, y, z0), PI / 8))
    for k in (0.3, 0.62):
        rr = r * (1 - k) + 0.25 * k
        P.append(L.place(cylinder(name + '_band', rr + 0.12, 0.5, (0, 0, 0), seg=8, mat=band, r2=rr + 0.05), (x, y, z0 + h * k - 0.25), PI / 8))
    if lucarnes:
        for i in range(4):
            a = PI / 2 * i
            lc = prism_from_outline(name + '_luc', gable_ol(1.6, 2.0, 1.2), 1.6, center=(0, -r * 0.82, 0), mat=mat)
            P.append(L.place(lc, (x, y, z0 + 1.5), a))
            P.append(L.place(poly(name + '_lucw', arch_outline(0.8, 1.2, 0.8, 'pointed', n=3), pp('#2b2a2c', 'ws_louvre'), (0, -r * 0.82 - 0.82, 0)), (x, y, z0 + 1.6), a))
    P.append(cross(name + '_x', x, y, z0 + h - 0.2, 4.8, 2.6, 0.4, cross_mat))
    lo.append(L.place(cylinder(name + '_lo', r + 0.3, h + 0.1, (0, 0, 0), seg=8, r2=0.0, cap=False), (x, y, z0), PI / 8))
    lo.append(cross_lo(name + '_xlo', x, y, z0 + h - 0.2, 4.8, 2.6, 0.4))


# =========================================================================== 2. St Mary's Church (Secunderabad)
@parked('st_marys_church', 'landmark', landmark='church_st_marys', face='s', footprint=[56, 56], height=69.0,
        fit='footprint', floodlit=True)
def build_st_marys(A):
    """St Mary's Church, Secunderabad (1850, now the Basilica of Our Lady of the Assumption):
    cream-white Gothic. The tall square bell tower in the middle of the front (lancet door,
    tall lancet window, belfry with paired louvred lancets, corner buttresses and pinnacles)
    carries the grey-banded octagonal spire with lucarnes and a cross. Behind it the steep-roofed
    nave with lancet windows between stepped buttresses, lower lean-to aisles and the chancel."""
    C._ASSET[0] = A.id
    WALL, TRIM, WIN, DARK, DOOR = '#efe6cf', '#b5ac98', '#3a404a', '#26272b', '#5b3b26'
    wall, trim = pp(WALL, 'sm_wall'), pp(TRIM, 'sm_trim')
    roof, spire = pp('#6b6866', 'sm_slate'), pp('#e9e1cc', 'sm_spire')
    P, lo, keep = [], [], []
    # ---- nave (steep roof), aisles, chancel
    NX, NY0, NY1, EAVE, RISE = 11.0, -14.0, 18.0, 21.0, 14.0
    ny, nd = (NY0 + NY1) / 2, NY1 - NY0
    fn = Fw(nd, EAVE, WALL, seed=21)
    lancets(fn, 5, 13.2, 2.0, 6.4, WIN, frame=TRIM, fw=0.3)
    fn.band(EAVE - 0.8, EAVE, TRIM)
    fnf = Fw(2 * NX, EAVE, WALL, seed=22)
    for x in (2.6, 2 * NX - 2.6):
        lancet_fac(fnf, x, 9.0, 2.2, 8.0, WIN, frame=TRIM)
    fnf.band(EAVE - 0.8, EAVE, TRIM)
    fnb = Fw(2 * NX, EAVE, WALL, seed=23)
    P.append(fbox('sm_nave', 0, ny, 2 * NX, nd, 0, EAVE, wall, faces={'l': fn, 'r': fn, 'f': fnf, 'b': fnb}, top=False))
    for (yy, rz) in ((NY0, 0.0), (NY1, PI)):
        fg = Fw(2 * NX, RISE, WALL, seed=24)
        fg.arch(NX, 3.0, 2.6, 5.0, WIN, 'pointed', frame=TRIM, fw=0.3)
        P.append(fpanel('sm_gable', [(-NX, 0), (NX, 0), (0, RISE)], fg, (0, yy, EAVE), rz))
    P.append(roof_hi('sm_roof', 0, ny, 2 * NX, nd, EAVE, RISE, roof, over=0.9, t=0.5))
    lo.append(gable_lo('sm_nave_lo', 0, ny, 2 * NX + 1.4, nd + 2.2, EAVE + 0.1, RISE + 0.8))
    AX = 6.5
    for s in (-1, 1):
        side = 'l' if s < 0 else 'r'
        fa = Fw(nd - 2.0, 11.0, WALL, seed=25 + s)
        fa.dirt(2.0).band(0, 1.0, TRIM)
        lancets(fa, 5, 2.0, 1.9, 6.6, WIN, frame=TRIM, fw=0.3, sill=TRIM)
        fa.band(10.2, 11.0, TRIM)
        cx = s * (NX + AX / 2 - 0.2)
        P.append(fbox('sm_aisle%d' % (s + 1), cx, ny, AX + 0.4, nd - 2.0, 0, 11.0, wall, faces={side: fa, 'f': Fw(AX + 0.4, 11, WALL), 'b': Fw(AX + 0.4, 11, WALL)}, top=False))
        ol = [(s * (NX + AX + 0.6), 10.8), (s * (NX - 0.1), 10.8), (s * (NX - 0.1), 14.6), (s * (NX + AX + 0.6), 11.4)]
        P.append(prism_from_outline('sm_aroof', ol, nd - 1.4, center=(0, ny, 0), mat=roof))
        step = (nd - 2.0) / 5
        ys = [ny - (nd - 2.0) / 2 + step * i for i in range(6)]
        bt = []
        for yb in ys:
            bt.append(box('btr', (1.6, 1.2, 7.0), (s * (NX + AX + 0.95), yb, 0), wall, base=True))
            bt.append(box('btr2', (1.0, 1.0, 3.2), (s * (NX + AX + 0.7), yb, 7.0), wall, base=True))
        P.append(kit.join(bt, 'sm_btr'))
        lo.append(no_bottom(prism_from_outline('sm_aisle_lo', [(s * (NX + AX + 1.2), 0), (s * (NX - 0.1), 0), (s * (NX - 0.1), 14.8), (s * (NX + AX + 1.2), 11.6)], nd - 0.8, center=(0, ny, 0))))
    # chancel
    fc = Fw(14, 15, WALL, seed=28)
    lancets(fc, 3, 3.0, 2.0, 8.0, WIN, frame=TRIM, fw=0.3)
    fcs = Fw(7, 15, WALL, seed=29)
    lancet_fac(fcs, 3.5, 3.0, 2.0, 8.0, WIN, frame=TRIM)
    P.append(fbox('sm_chan', 0, NY1 + 3.4, 14, 7.0, 0, 15, wall, faces={'b': fc, 'l': fcs, 'r': fcs}, top=False))
    P.append(fpanel('sm_cgable', [(-7, 0), (7, 0), (0, 8)], Fw(14, 8, WALL, seed=30), (0, NY1 + 6.9, 15), PI))
    P.append(roof_hi('sm_croof', 0, NY1 + 3.6, 14, 6.8, 15, 8, roof, over=0.7, t=0.5))
    lo.append(gable_lo('sm_chan_lo', 0, NY1 + 3.6, 15.2, 7.8, 15.1, 8.7))
    # ---- the front tower
    TW, TY, TH = 11.0, -21.0, 40.0
    ft = Fw(TW, 27, WALL, seed=31)
    ft.dirt(2.0).band(0, 1.2, TRIM)
    lancet_fac(ft, TW / 2, 1.2, 4.4, 10.5, DOOR, frame=TRIM, fw=0.7)
    lancet_fac(ft, TW / 2, 14.0, 2.6, 9.0, WIN, frame=TRIM, fw=0.4, sill=TRIM)
    ft.band(26.0, 27, TRIM)
    fts = Fw(TW, 27, WALL, seed=32)
    fts.dirt(2.0).band(0, 1.2, TRIM)
    lancet_fac(fts, TW / 2, 12.0, 2.0, 8.0, WIN, frame=TRIM, sill=TRIM)
    fts.band(26.0, 27, TRIM)
    P.append(fbox('sm_tower', 0, TY, TW, TW, 0, 27, wall, faces={'f': ft, 'l': fts, 'r': fts}, top=False))
    fb = Fw(TW - 0.6, TH - 27, WALL, seed=33)
    fb.arch((TW - 0.6) / 2 - 1.5, 2.0, 2.0, 8.0, DARK, 'pointed', frame=TRIM, fw=0.35, spring=6.0, sill=TRIM)
    fb.arch((TW - 0.6) / 2 + 1.5, 2.0, 2.0, 8.0, DARK, 'pointed', frame=TRIM, fw=0.35, spring=6.0, sill=TRIM)
    fb.band(TH - 27 - 1.0, TH - 27, TRIM)
    P.append(fbox('sm_belfry', 0, TY, TW - 0.6, TW - 0.6, 27, TH, wall, faces={'f': fb, 'l': fb, 'r': fb, 'b': fb}))
    P.append(box('sm_tc1', (TW + 0.6, TW + 0.6, 0.8), (0, TY, 26.6), trim, base=True))
    P.append(box('sm_tc2', (TW + 0.8, TW + 0.8, 1.0), (0, TY, TH), trim, base=True))
    # corner buttresses of the tower (angled pairs) + pinnacles
    bt = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            bx, by = sx * (TW / 2 - 0.4), TY + sy * (TW / 2 - 0.4)
            bt.append(box('tbtr', (1.4, 1.4, 22.0), (bx + sx * 0.6, by + sy * 0.6, 0), wall, base=True))
            bt.append(box('tbtr2', (1.0, 1.0, 12.0), (bx + sx * 0.5, by + sy * 0.5, 22.0), wall, base=True))
    P.append(kit.join(bt, 'sm_tbtr'))
    pinnacles(P, trim, [(sx * (TW / 2), TY + sy * (TW / 2)) for sx in (-1, 1) for sy in (-1, 1)], TH + 1.0, 4.0, r=0.55)
    lo.append(blk('sm_tower_lo', 0, TY, TW + 2.2, TW + 2.2, 0, TH + 1.1, None))
    lo += [L.place(cylinder('sm_pin_lo', 0.9, 4.2, (0, 0, 0), seg=4, r2=0.0, cap=False), (sx * (TW / 2), TY + sy * (TW / 2), TH + 1.0), PI / 4)
           for sx in (-1, 1) for sy in (-1, 1)]
    oct_spire(P, lo, 'sm_spire', 0, TY, TH + 1.0, 22.0, 4.6, spire, trim, pp('#d8d2c2', 'sm_cross'))
    # ---- forecourt steps + a lamp at the door
    P.append(L.steps('sm_steps', 8.0, 0.8, 0.4, 2, (0, TY - TW / 2 - 1.6, 0), trim))
    lo.append(blk('sm_steps_lo', 0, TY - TW / 2 - 0.8, 8.2, 1.8, 0, 0.9, None))
    keep.append(lamp_box('sm_lamp', (1.6, 0.25, 1.0), (0, TY - TW / 2 - 0.2, 12.4)))
    bake(A, P, lo, keep=keep, size=512)
    L.col_box('sm', (2 * NX + 2 * AX, nd, EAVE), (0, ny, 0))
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 3. Wesley Church (Secunderabad)
@parked('wesley_church', 'landmark', landmark='church_wesley', face='w', footprint=[60, 48], height=60.0,
        fit='footprint', floodlit=True)
def build_wesley(A):
    """Wesley Church, Secunderabad (Methodist): a grey-stone Gothic church. The gabled nave faces
    the street with a big three-light lancet window over the pointed door porch; a square corner
    tower on the front left rises to an octagonal spire with a cross; lancets between buttresses
    down the sides, a pitched slate roof and a small gabled transept on the right."""
    C._ASSET[0] = A.id
    WALL, TRIM, WIN, DARK, DOOR = '#c3b9a8', '#e6dccb', '#39404a', '#26272b', '#5b3b26'
    wall, trim = pp(WALL, 'we_wall'), pp(TRIM, 'we_trim')
    roof, spire = pp('#5f5d5c', 'we_slate'), pp('#9c968c', 'we_spire')
    P, lo, keep = [], [], []
    NXC, NW, NY0, NY1, EAVE, RISE = 4.0, 22.0, -16.0, 20.0, 17.0, 12.0
    ny, nd = (NY0 + NY1) / 2, NY1 - NY0
    ff = Fw(NW, EAVE, WALL, seed=41)
    ff.dirt(2.0).band(0, 1.2, TRIM)
    for i, x in enumerate((NW / 2 - 2.6, NW / 2, NW / 2 + 2.6)):
        lancet_fac(ff, x, 8.0, 2.0, 8.5 if i != 1 else 10.0, WIN, frame=TRIM, fw=0.35)
    ff.band(EAVE - 0.6, EAVE, TRIM)
    fs = Fw(nd, EAVE, WALL, seed=42)
    fs.dirt(2.0).band(0, 1.2, TRIM)
    lancets(fs, 6, 3.0, 2.0, 8.6, WIN, frame=TRIM, fw=0.35, sill=TRIM)
    fs.band(EAVE - 0.6, EAVE, TRIM)
    fb = Fw(NW, EAVE, WALL, seed=43)
    lancets(fb, 3, 4.0, 2.0, 8.0, WIN, frame=TRIM, fw=0.35)
    P.append(fbox('we_nave', NXC, ny, NW, nd, 0, EAVE, wall, faces={'f': ff, 'l': fs, 'r': fs, 'b': fb}, top=False))
    for (yy, rz) in ((NY0, 0.0), (NY1, PI)):
        fg = Fw(NW, RISE, WALL, seed=44)
        fg.arch(NW / 2, 2.5, 3.0, 3.6, WIN, 'round', frame=TRIM, fw=0.4)
        P.append(fpanel('we_gable', [(-NW / 2, 0), (NW / 2, 0), (0, RISE)], fg, (NXC, yy, EAVE), rz))
    P.append(roof_hi('we_roof', NXC, ny, NW, nd, EAVE, RISE, roof, over=0.9, t=0.5))
    P.append(prism_from_outline('we_gcope', [(-NW / 2 - 0.5, -0.3), (NW / 2 + 0.5, -0.3), (0, RISE + 0.6)], 0.8, center=(NXC, NY0 + 0.45, EAVE), mat=trim))
    P.append(cross('we_xg', NXC, NY0 - 0.2, EAVE + RISE, 3.4, 2.0, 0.4, trim))
    lo.append(gable_lo('we_nave_lo', NXC, ny, NW + 1.6, nd + 2.2, EAVE + 0.1, RISE + 0.8))
    lo.append(cross_lo('we_xg_lo', NXC, NY0 - 0.2, EAVE + RISE, 3.4, 2.0, 0.4))
    # side buttresses
    for s in (-1, 1):
        bt = []
        step = nd / 6
        for i in range(7):
            yb = NY0 + step * i
            bt.append(box('btr', (1.4, 1.2, 9.0), (NXC + s * (NW / 2 + 0.6), yb, 0), wall, base=True))
            bt.append(box('btr2', (1.0, 1.0, 4.0), (NXC + s * (NW / 2 + 0.4), yb, 9.0), wall, base=True))
        P.append(kit.join(bt, 'we_btr'))
    # door porch (gabled)
    fp = Fw(8.0, 9.0, WALL, seed=45)
    lancet_fac(fp, 4.0, 0.6, 3.8, 7.6, DOOR, frame=TRIM, fw=0.5)
    P.append(fbox('we_porch', NXC, NY0 - 2.0, 8.0, 4.0, 0, 7.0, wall, faces={'f': fp}, top=False))
    P.append(fpanel('we_pg', [(-4, 0), (4, 0), (0, 3.6)], Fw(8, 3.6, WALL), (NXC, NY0 - 4.0, 7.0)))
    P.append(roof_hi('we_proof', NXC, NY0 - 2.0, 8.0, 4.0, 7.0, 3.6, roof, over=0.5, t=0.4))
    lo.append(gable_lo('we_porch_lo', NXC, NY0 - 2.1, 9.0, 4.6, 7.1, 4.0))
    # right transept
    ftr = Fw(10, 13, WALL, seed=46)
    lancets(ftr, 2, 3.0, 2.0, 8.0, WIN, frame=TRIM, fw=0.35)
    P.append(fbox('we_tr', NXC + NW / 2 + 3.0, 4.0, 6.0, 10.0, 0, 13.0, wall, faces={'r': ftr, 'f': Fw(6, 13, WALL), 'b': Fw(6, 13, WALL)}, top=False))
    P.append(fpanel('we_trg', [(-5, 0), (5, 0), (0, 6)], Fw(10, 6, WALL), (NXC + NW / 2 + 6.0, 4.0, 13.0), PI / 2))
    P.append(roof_hi('we_trroof', NXC + NW / 2 + 3.0, 4.0, 10.0, 6.0, 13.0, 6.0, roof, over=0.6, t=0.4, rz=PI / 2))
    lo.append(gable_lo('we_tr_lo', NXC + NW / 2 + 3.0, 4.0, 11.0, 7.2, 13.1, 6.6, rz=PI / 2))
    # ---- front-left corner tower + spire
    TX, TY, TW, TH = NXC - NW / 2 - 4.2, NY0 - 1.0, 9.0, 30.0
    ftf = Fw(TW, 20, WALL, seed=47)
    ftf.dirt(2.0).band(0, 1.2, TRIM)
    lancet_fac(ftf, TW / 2, 1.2, 3.2, 8.0, DOOR, frame=TRIM, fw=0.5)
    lancet_fac(ftf, TW / 2, 11.0, 1.6, 6.0, WIN, frame=TRIM, sill=TRIM)
    ftf.band(19.2, 20, TRIM)
    fts = Fw(TW, 20, WALL, seed=48)
    fts.dirt(2.0).band(0, 1.2, TRIM)
    lancet_fac(fts, TW / 2, 9.0, 1.6, 6.0, WIN, frame=TRIM, sill=TRIM)
    fts.band(19.2, 20, TRIM)
    P.append(fbox('we_tower', TX, TY, TW, TW, 0, 20, wall, faces={'f': ftf, 'l': fts, 'b': fts, 'r': fts}, top=False))
    fbl = Fw(TW - 0.6, TH - 20, WALL, seed=49)
    fbl.arch((TW - 0.6) / 2, 1.5, 3.0, 7.0, DARK, 'pointed', frame=TRIM, fw=0.4, spring=4.4, sill=TRIM)
    fbl.band(TH - 21.0, TH - 20, TRIM)
    P.append(fbox('we_belfry', TX, TY, TW - 0.6, TW - 0.6, 20, TH, wall, faces={'f': fbl, 'l': fbl, 'r': fbl, 'b': fbl}))
    P.append(box('we_tc', (TW + 0.6, TW + 0.6, 0.8), (TX, TY, 19.8), trim, base=True))
    P.append(box('we_tc2', (TW + 0.8, TW + 0.8, 0.9), (TX, TY, TH), trim, base=True))
    bt = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            bt.append(box('tbtr', (1.2, 1.2, 16.0), (TX + sx * (TW / 2 + 0.2), TY + sy * (TW / 2 + 0.2), 0), wall, base=True))
    P.append(kit.join(bt, 'we_tbtr'))
    pinnacles(P, trim, [(TX + sx * (TW / 2), TY + sy * (TW / 2)) for sx in (-1, 1) for sy in (-1, 1)], TH + 0.9, 3.4, r=0.5)
    lo.append(blk('we_tower_lo', TX, TY, TW + 1.6, TW + 1.6, 0, TH + 1.0, None))
    lo += [L.place(cylinder('we_pin_lo', 0.8, 3.6, (0, 0, 0), seg=4, r2=0.0, cap=False), (TX + sx * (TW / 2), TY + sy * (TW / 2), TH + 0.9), PI / 4)
           for sx in (-1, 1) for sy in (-1, 1)]
    oct_spire(P, lo, 'we_spire', TX, TY, TH + 0.9, 20.0, 3.9, spire, trim, trim)
    keep.append(lamp_box('we_lamp', (1.4, 0.25, 0.9), (NXC, NY0 - 4.2, 8.2)))
    bake(A, P, lo, keep=keep, size=512)
    L.col_box('we', (NW, nd, EAVE), (NXC, ny, 0))
    L.shots(A, az=-35, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== temple pieces
TW_WHITE = '#f3ecdc'
BRIGHT = ['#f2c64a', '#ee8a9a', '#7fbadf', '#8cc06a', '#f39a3a', '#d8453a']


def tier_fac(w, h, base, niche, trim=TW_WHITE, n=None, seed=1):
    """one painted gopuram / vimana tier: a saturated coloured field with darker pilasters, a row
    of kudu (horseshoe-arched) niches in a contrasting colour with dark centres, white cornice
    lines and a row of small finials along the top (no figures)"""
    f = Fw(w, h, base, seed=seed)
    n = n or max(1, int(round(w / 2.6)))
    f.pilasters(n, 0.3, kit.shade(base, 0.78), z0=h * 0.12, z1=h * 0.8)
    f.arches(n, h * 0.2, w / n * 0.56, h * 0.56, niche, kind='round', frame=trim, fw=0.18)
    for i in range(n):
        cx = w / n * (i + 0.5)
        f.arch(cx, h * 0.24, w / n * 0.22, h * 0.32, '#3a2a22', 'round', shade=False)
    f.band(0, h * 0.12, trim).band(h * 0.8, h * 0.86, trim)
    for i in range(2 * n):
        cx = w / (2 * n) * (i + 0.5)
        f.arch(cx, h * 0.86, 0.35, h * 0.12, kit.shade(niche, 0.9), 'round', shade=False)
    return f


def gopuram(P, lo, name, x, y, w, d, h, cols, base_col=TW_WHITE, door='#2a2018', tiers=4, kalash_n=None, base_frac=0.32, lo_pad=0.25):
    """Dravidian gopuram gateway: a white base with the dark doorway, tapering painted tiers with
    ledges, a barrel-vault (shala) crown with a row of gold kalashas"""
    gold = pp('#d0a23a', 'ws_gold')
    white = pp(TW_WHITE, 'ws_twhite')
    bh = h * base_frac
    fb = Fw(w, bh, base_col, seed=3)
    fb.dirt(1.5).band(0, 0.8, '#c9bfa8')
    fb.pilasters(4, 0.5, '#e4dac4', x0=0.6, x1=w - 0.6)
    dw, dh = min(6.0, w * 0.38), min(bh - 1.6, 10.5)
    fb.rect(w / 2 - dw / 2 - 0.6, 0.8, w / 2 + dw / 2 + 0.6, 0.8 + dh + 0.6, '#c9a64a')
    fb.rect(w / 2 - dw / 2, 0.8, w / 2 + dw / 2, 0.8 + dh, door)
    fs = Fw(d, bh, base_col, seed=4)
    fs.dirt(1.5).band(0, 0.8, '#c9bfa8')
    P.append(fbox(name + '_base', x, y, w, d, 0, bh, white, faces={'f': fb, 'b': fb, 'l': fs, 'r': fs}))
    P.append(box(name + '_c0', (w + 1.0, d + 1.0, 0.7), (x, y, bh), white, base=True))
    th = (h * (0.86 - base_frac)) / tiers
    ww, dd, zz = w * 0.92, d * 0.84, bh + 0.7
    for t in range(tiers):
        c = cols[t % len(cols)]
        nc = cols[(t + 2) % len(cols)]
        tf = tier_fac(ww, th, c, nc, seed=10 + t)
        ts = tier_fac(dd, th, c, nc, n=max(1, int(round(dd / 3.2))), seed=20 + t)
        P.append(fbox(name + '_t%d' % t, x, y, ww, dd, zz, zz + th, pp(c, 'ws_t_' + c.strip('#')), faces={'f': tf, 'b': tf, 'l': ts, 'r': ts}))
        P.append(box(name + '_tl', (ww + 0.7, dd + 0.7, 0.45), (x, y, zz + th - 0.2), white, base=True))
        zz += th
        if t < tiers - 1:
            ww *= 0.85
            dd *= 0.82
    vr = dd * 0.6
    arc = [(vr * math.cos(PI - PI * i / 8), vr * 1.1 * math.sin(PI * i / 8)) for i in range(9)]
    P.append(prism_from_outline(name + '_vault', arc, ww * 0.98, axis='X', center=(x, y, zz + 0.2), mat=pp(cols[0], 'ws_t_' + cols[0].strip('#'))))
    P.append(box(name + '_vb', (ww * 1.02, dd * 0.9, 0.3), (x, y, zz), white, base=True))
    n = kalash_n or (3 if ww < 9 else 5)
    kz = zz + vr * 1.1 + 0.1
    for i in range(n):
        kx = x - ww * 0.36 + ww * 0.72 * i / max(1, n - 1)
        P.append(kalash(name + '_k', kx, y, kz - 0.35, 0.55, gold))
    # shells: base block, tapering tier frustum, vault, the kalasha row as a card
    lo.append(blk(name + '_blo', x, y, w + 1.2, d + 1.2, 0, bh + 0.8, None))
    lo.append(frustum_lo(name + '_tlo', x, y, w * 0.92 + 2 * lo_pad + 0.6, d * 0.84 + 2 * lo_pad + 0.6, ww + 2 * lo_pad + 0.5, dd + 2 * lo_pad + 0.5, bh + 0.7, zz + 0.1))
    arc_lo = [(-(vr + 0.3), 0)] + [((vr + 0.3) * math.cos(PI - PI * i / 4), (vr * 1.1 + 0.3) * math.sin(PI * i / 4)) for i in range(1, 4)] + [((vr + 0.3), 0)]
    lo.append(prism_from_outline(name + '_vlo', arc_lo, ww + 0.4, axis='X', center=(x, y, zz + 0.1)))
    ol = [(-ww * 0.36 - 0.8, -0.2)]
    for i in range(n):
        kx = -ww * 0.36 + ww * 0.72 * i / max(1, n - 1)
        ol += [(kx - 0.6, -0.2), (kx - 0.6, 0.6), (kx, 1.5), (kx + 0.6, 0.6), (kx + 0.6, -0.2)]
    ol += [(ww * 0.36 + 0.8, -0.2)]
    lo.append(card_lo(name + '_klo', ol, (x, y, kz - 0.3), gap=0.6))
    return zz + vr * 1.1 + 1.5


def vimana(P, lo, name, x, y, w, z0, h, cols, cap_col=None, tiers=3, cap='dome'):
    """stepped Dravidian vimana over a sanctum roof: painted tiers with ledges, an octagonal /
    domed shikhara cap and a gold kalash"""
    gold = pp('#d0a23a', 'ws_gold')
    white = pp(TW_WHITE, 'ws_twhite')
    th = h * 0.62 / tiers
    ww, zz = w, z0
    for t in range(tiers):
        c = cols[t % len(cols)]
        tf = tier_fac(ww, th, c, cols[(t + 1) % len(cols)], n=max(1, int(round(ww / 3.0))), seed=30 + t)
        P.append(fbox(name + '_t%d' % t, x, y, ww, ww, zz, zz + th, pp(c, 'ws_t_' + c.strip('#')), faces={'f': tf, 'b': tf, 'l': tf, 'r': tf}))
        P.append(box(name + '_l', (ww + 0.8, ww + 0.8, 0.45), (x, y, zz + th - 0.2), white, base=True))
        zz += th
        if t < tiers - 1:
            ww *= 0.76
    ch = z0 + h - zz - 1.4
    cc = pp(cap_col or cols[0], 'ws_cap_' + (cap_col or cols[0]).strip('#'))
    r = ww * 0.5
    if cap == 'dome':
        prof = [(r * 0.75, zz), (r * 0.9, zz + ch * 0.2), (r * 0.88, zz + ch * 0.5), (r * 0.6, zz + ch * 0.8), (r * 0.25, zz + ch * 0.97), (0.0, zz + ch)]
    else:
        prof = [(r * 0.8, zz), (r * 0.95, zz + ch * 0.35), (r * 0.55, zz + ch * 0.8), (0.0, zz + ch)]
    P.append(lathe(name + '_cap', prof, seg=8, mat=cc, loc=(x, y, 0), close_bottom=False))
    P.append(kalash(name + '_k', x, y, zz + ch - 0.3, max(0.5, w * 0.06), gold))
    lo.append(frustum_lo(name + '_lo', x, y, w + 1.4, w + 1.4, ww + 1.2, ww + 1.2, z0, zz + 0.25))
    lo.append(lathe(name + '_clo', [(p[0] + 0.25, p[1]) for p in prof[:-1]] + [(0.35, zz + ch + 0.1), (0.0, zz + ch + max(0.5, w * 0.06) * 2.6)], seg=6, loc=(x, y, 0), close_bottom=False))
    return zz + ch + 1.5


def pillars(P, mat, x0, x1, n, y, z0, h, r=0.6, cap=None):
    """a row of square temple pillars with capitals (hi)"""
    out = []
    for i in range(n):
        x = x0 + (x1 - x0) * i / max(1, n - 1)
        out.append(box('pil', (r * 2, r * 2, h), (x, y, z0), mat, base=True))
        out.append(box('pil_c', (r * 2.8, r * 2.8, 0.6), (x, y, z0 + h - 0.6), cap or mat, base=True))
        out.append(box('pil_b', (r * 2.6, r * 2.6, 0.6), (x, y, z0), cap or mat, base=True))
    P.append(kit.join(out, 'pillars'))


def loft(name, rings, mat=None, cap=True):
    """loft through stacked outlines [(z, [(x, y)...])] of equal point counts (no bottom face)"""
    bm = bmesh.new()
    R = [[bm.verts.new((x, y, z)) for (x, y) in pts] for (z, pts) in rings]
    n = len(R[0])
    for j in range(len(R) - 1):
        for i in range(n):
            k = (i + 1) % n
            bm.faces.new((R[j][i], R[j][k], R[j + 1][k], R[j + 1][i]))
    if cap:
        bm.faces.new(R[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, mat)


def ratha_plan(a, d, cx, cy):
    """square plan with a projecting central band on each side (5 points a side, CCW)"""
    side = [(-a, -a), (-0.4 * a, -a), (-0.4 * a, -a - d), (0.4 * a, -a - d), (0.4 * a, -a)]
    out = []
    for k in range(4):
        c, s = math.cos(k * PI / 2), math.sin(k * PI / 2)
        out += [(cx + x * c - y * s, cy + x * s + y * c) for (x, y) in side]
    return out


def shikhara(P, lo, name, x, y, z0, a0, h, mat, gold, courses=14):
    """Nagara shikhara (curvilinear tower) with horizontal courses, an amalaka and a kalash"""
    def prof(u):
        return 1.0 - 0.52 * u ** 1.6
    rings = []
    for i in range(courses + 1):
        u = i / courses
        a = a0 * prof(u)
        z = z0 + h * u
        if i > 0:
            rings.append((z - 0.01 - h / courses * 0.3, ratha_plan(a * 1.035, a * 0.12, x, y)))
            rings.append((z - h / courses * 0.3 + 0.01, ratha_plan(a * 0.985, a * 0.12, x, y)))
        rings.append((z, ratha_plan(a, a * 0.12, x, y)))
    P.append(loft(name, rings, mat))
    at = a0 * prof(1.0)
    zt = z0 + h
    P.append(lathe(name + '_neck', [(at * 0.7, zt), (at * 0.55, zt + 0.8)], seg=12, mat=mat, loc=(x, y, 0), close_bottom=False))
    P.append(lathe(name + '_amalaka', [(at * 0.55, zt + 0.8), (at * 1.0, zt + 1.6), (at * 1.0, zt + 2.4), (at * 0.5, zt + 3.2), (0.0, zt + 3.3)], seg=16, mat=mat, loc=(x, y, 0), close_bottom=False))
    P.append(kalash(name + '_k', x, y, zt + 3.1, 0.75, gold))
    lrings = []
    for u in (0.0, 0.35, 0.7, 1.0):
        a = a0 * prof(u) + 0.35
        lrings.append((z0 + h * u, [(x - a, y - a - 0.12 * a0), (x + a, y - a - 0.12 * a0), (x + a + 0.12 * a0, y - a), (x + a + 0.12 * a0, y + a), (x + a, y + a + 0.12 * a0), (x - a, y + a + 0.12 * a0), (x - a - 0.12 * a0, y + a), (x - a - 0.12 * a0, y - a)]))
    lo.append(loft(name + '_lo', lrings, None, cap=False))
    lo.append(lathe(name + '_alo', [(at * 1.15, zt - 0.1), (at * 1.15, zt + 2.5), (at * 0.55, zt + 3.4), (0.25, zt + 3.6), (0.0, zt + 5.3)], seg=8, loc=(x, y, 0), close_bottom=False))
    return zt + 5.0


def flags_hi_lo(P, lo, pts, h, col, size=2.4, z=0.0):
    for i, (x, y) in enumerate(pts):
        P.append(flag('fl', x, y, z, h, col, size=size))
        lo.append(flag_lo('fl_lo', x, y, z, h, size=size))


# =========================================================================== 4. Sai Baba temple, Dilsukhnagar
@parked('dilsukhnagar_sai_temple', 'landmark', draw='sai_temple', face='n', footprint=[70, 48], height=51.0,
        fit='footprint', floodlit=True)
def build_sai_temple(A):
    """Shri Sai Baba temple, Dilsukhnagar (modern, popular since the 1990s; Thursday crowds):
    an all-white temple on a raised plinth. A broad pillared mandapam with steps across the front
    (dim interior, the sanctum not shown), the hall behind, and a ribbed white nagara shikhara over
    the sanctum with a gold kalash and a saffron flag; saffron bands on the parapets, saffron flags
    on the compound wall, and the entrance arch on the street with the SHRI SAI BABA MANDIR board."""
    C._ASSET[0] = A.id
    WH, OFF, SAF, DIM = '#f4f1ea', '#e2ddd2', SAFFRON, '#4a4038'
    white, off, saf = pp(WH, 'sai_white'), pp(OFF, 'sai_off'), pp(SAF, 'sai_saffron')
    gold = pp('#d0a23a', 'ws_gold')
    P, lo, keep = [], [], []
    # ---- compound wall (white, saffron coping) with the entrance arch on the street side
    WX, WY0, WY1 = 34.0, -23.5, 23.0
    for s in (-1, 1):
        wall_run(P, lo, 'sai_wf%d' % (s + 1), s * 6.0, WY0, s * WX, WY0, 3.6, 0.7, (WH, SAF, 2, None, OFF, 6.0))
        wall_run(P, lo, 'sai_ws%d' % (s + 1), s * WX, WY0, s * WX, WY1, 3.6, 0.7, (WH, SAF, 3, None, OFF, 6.0))
    wall_run(P, lo, 'sai_wb', -WX, WY1, WX, WY1, 3.6, 0.7, (WH, SAF, 4, None, OFF, 6.0))
    # entrance arch: two piers, a round arch, a small dome on each pier
    ga = Fw(12.0, 11.0, WH, seed=5)
    ga.rect(0, 0, 2.0, 11, OFF).rect(10.0, 0, 12.0, 11, OFF)
    ga.band(9.6, 11.0, SAF)
    gate = fpanel('sai_gate', [(-6, 0), (-4, 0)] + [(4 * math.cos(PI - PI * i / 8), 6.0 + 2.6 * math.sin(PI * i / 8)) for i in range(9)] + [(4, 0), (6, 0), (6, 11), (-6, 11)], ga, (0, WY0 - 0.6, 0))
    P.append(gate)
    gb = fpanel('sai_gateb', [(-6, 0), (-4, 0)] + [(4 * math.cos(PI - PI * i / 8), 6.0 + 2.6 * math.sin(PI * i / 8)) for i in range(9)] + [(4, 0), (6, 0), (6, 11), (-6, 11)], ga, (0, WY0 + 0.6, 0), PI)
    P.append(gb)
    for s in (-1, 1):
        P.append(box('sai_pier_s', (2.0, 1.2, 11.0), (s * 5.0, WY0, 0), white, base=True))
        P.append(cylinder('sai_pdrum', 1.1, 0.8, (s * 5.0, WY0, 11.0), seg=8, mat=white))
        P.append(onion('sai_pdome', 1.1, 2.0, 11.8, white, seg=8, loc=(s * 5.0, WY0), n=5))
    P.append(box('sai_gtop', (12.4, 1.6, 0.6), (0, WY0, 11.0), saf, base=True))
    lo.append(no_bottom(prism_from_outline('sai_gate_lo', [(-6.3, 0), (-4, 0)] + [(4 * math.cos(PI - PI * i / 4), 6.0 + 2.6 * math.sin(PI * i / 4)) for i in range(5)] + [(4, 0), (6.3, 0), (6.3, 11.7), (-6.3, 11.7)], 1.8, center=(0, WY0, 0))))
    for s in (-1, 1):
        lo.append(lathe('sai_pd_lo', [(1.3, 11.6), (1.4, 12.6), (1.0, 13.6), (0.0, 14.6)], seg=5, loc=(s * 5.0, WY0, 0), close_bottom=False))
    keep.append(sign_keep(A.id, 'sai_board', 'SHRI SAI BABA MANDIR', 9.6, 1.5, (0, WY0 - 1.45, 10.2), fg='#ffffff', bg='#d8661a', pw=512, ph=80))
    flags_hi_lo(P, lo, [(-WX, WY0), (WX - 4.2, WY0)], 9.0, SAF, size=2.4, z=3.6)
    # ---- plinth, steps, mandapam (pillared), hall
    PZ = 1.8
    P.append(fbox('sai_plinth', 0, 3.0, 44, 30, 0, PZ, off, faces={'f': Fw(44, PZ, OFF).band(PZ - 0.3, PZ, SAF)}))
    P.append(L.steps('sai_steps', 16.0, 0.9, PZ / 4, 4, (0, -12.0 - 3.6, 0), white))
    lo.append(blk('sai_plinth_lo', 0, 3.0, 44.3, 30.3, 0, PZ + 0.05, None))
    lo.append(no_bottom(prism_from_outline('sai_steps_lo', [(-16.2, 0), (-12.0, 0), (-12.0, PZ + 0.05), (-16.2, 0.4)], 16.4, axis='X', center=(0, 0, 0))))
    MY0, MY1, MH = -12.0, -1.0, 12.0
    fm = Fw(36, MH, DIM, seed=7)
    fm.rect(0, 0, 36, 1.0, '#8a7f72')
    fm.rect(16.5, 1.0, 19.5, 8.0, '#2a221c')
    for x in (6.0, 30.0):
        fm.rect(x - 1.5, 2.0, x + 1.5, 7.0, '#5e5045')
    P.append(fbox('sai_mback', 0, (MY0 + MY1) / 2, 36, MY1 - MY0 - 4.0, PZ, PZ + MH, pp(DIM, 'sai_dim'), faces={'f': fm}, top=False))
    pillars(P, white, -16.5, 16.5, 8, MY0 + 0.9, PZ, MH - 0.2, r=0.55)
    for s in (-1, 1):
        P.append(fbox('sai_mside%d' % (s + 1), s * 17.4, (MY0 + MY1) / 2, 1.4, MY1 - MY0, PZ, PZ + MH, white,
                      faces={'l' if s < 0 else 'r': Fw(MY1 - MY0, MH, WH).arches(2, 2.0, 3.0, 7.0, '#3a3a3a', kind='round', frame=OFF)}))
    fe = Fw(37, 2.6, WH, seed=8)
    fe.band(0, 0.5, OFF).band(1.6, 2.2, SAF)
    P.append(fbox('sai_mroof', 0, (MY0 + MY1) / 2, 37, MY1 - MY0 + 0.4, PZ + MH, PZ + MH + 2.6, white, faces={'f': fe, 'l': fe, 'r': fe}))
    P.append(box('sai_mchajja', (38.4, MY1 - MY0 + 1.8, 0.5), (0, (MY0 + MY1) / 2 - 0.4, PZ + MH - 0.2), off, base=True))
    lo.append(blk('sai_mand_lo', 0, (MY0 + MY1) / 2 - 0.3, 38.6, MY1 - MY0 + 2.0, PZ, PZ + MH + 2.7, None))
    keep.append(lamp_box('sai_string', (34.0, 0.2, 0.35), (0, MY0 - 0.15, PZ + MH - 1.2), col='#ffcf7a'))
    HY0, HY1, HH = -1.0, 17.0, 16.0
    fh = Fw(HY1 - HY0, HH, WH, seed=9)
    fh.dirt(1.5).arches(4, 3.0, 2.2, 6.0, '#3e4248', kind='round', frame=OFF, fw=0.35).band(HH - 1.4, HH - 0.6, SAF)
    fhb = Fw(32, HH, WH, seed=10)
    fhb.arches(5, 3.0, 2.2, 6.0, '#3e4248', kind='round', frame=OFF, fw=0.35).band(HH - 1.4, HH - 0.6, SAF)
    P.append(fbox('sai_hall', 0, (HY0 + HY1) / 2, 32, HY1 - HY0, PZ, PZ + HH, white, faces={'l': fh, 'r': fh, 'b': fhb, 'f': fhb}))
    lo.append(blk('sai_hall_lo', 0, (HY0 + HY1) / 2, 32.3, HY1 - HY0 + 0.3, PZ, PZ + HH + 0.1, None))
    # small domed kiosks on the hall's front corners
    for s in (-1, 1):
        kx, ky, kz = s * 14.0, HY0 + 2.0, PZ + HH
        for (dx, dy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P.append(box('sai_kp', (0.5, 0.5, 3.0), (kx + dx * 1.2, ky + dy * 1.2, kz), white, base=True))
        P.append(box('sai_kslab', (3.6, 3.6, 0.4), (kx, ky, kz + 3.0), white, base=True))
        P.append(onion('sai_kd', 1.6, 2.6, kz + 3.4, white, seg=8, loc=(kx, ky), n=5))
        lo.append(lathe('sai_k_lo', [(1.9, kz), (1.9, kz + 3.5), (1.8, kz + 3.9), (1.5, kz + 5.0), (0.0, kz + 7.0)], seg=6, loc=(kx, ky, 0), close_bottom=False))
    # ---- the shikhara over the sanctum (rear of the hall)
    top = shikhara(P, lo, 'sai_shik', 0, 9.0, PZ + HH, 5.6, 23.0, white, gold)
    P.append(flag('sai_topflag', 0.6, 9.0, top - 3.0, 4.5, SAF, size=2.2))
    lo.append(flag_lo('sai_topflag_lo', 0.6, 9.0, top - 3.0, 4.5, size=2.2, pole=False))
    bake(A, P, lo, keep=keep, size=384)
    L.col_box('sai', (44, 30, PZ + HH), (0, 3.0, 0))
    L.shots(A, az=-35, el=14, extra=[{'name': 'front', 'view': {'az': 0, 'el': 8, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 5. Ujjaini Mahankali, Secunderabad
@parked('ujjaini_mahankali_temple', 'landmark', landmark='ujjaini_mahankali_temple', face='e', footprint=[40, 40], height=51.0,
        fit='footprint', floodlit=True)
def build_ujjaini(A):
    """Sri Ujjaini Mahankali temple, Secunderabad (Lashkar Bonalu): a compound wall painted in red
    and white vertical stripes; the colourful stepped gopuram over the street entrance (white base,
    closed doorway, painted tiers, gold kalashas); inside, a pillared mandapa and the shrine with a
    yellow and red vimana behind; neem tree and a festival flag in the court."""
    C._ASSET[0] = A.id
    P, lo, keep = [], [], []
    WX, WY0, WY1 = 19.2, -19.0, 19.2
    stripes = ('#c8382c', '#f3ecdc', 1.6)
    for s in (-1, 1):
        wall_run(P, lo, 'uj_wf%d' % (s + 1), s * 7.0, WY0, s * WX, WY0, 5.0, 0.8, ('#f3ecdc', '#f3ecdc', 2, stripes, None, 6.0))
        wall_run(P, lo, 'uj_ws%d' % (s + 1), s * WX, WY0, s * WX, WY1, 5.0, 0.8, ('#f3ecdc', '#f3ecdc', 3, stripes, None, 6.0))
    wall_run(P, lo, 'uj_wb', -WX, WY1, WX, WY1, 5.0, 0.8, ('#f3ecdc', '#f3ecdc', 4, stripes, None, 6.0))
    # gopuram over the entrance
    cols = ['#f0b52e', '#e8707f', '#5ea9d8', '#79b851', '#ef8a2c']
    gopuram(P, lo, 'uj_gop', 0, WY0 + 1.5, 14.0, 7.0, 32.0, cols, tiers=5)
    # court paving, mandapa, shrine + vimana
    P.append(blk('uj_pave', 0, 2.0, 37.0, 34.0, 0, 0.25, pp('#d6cfc0', 'uj_pave')))
    MY0, MY1 = -8.0, 3.0
    pillars(P, pp('#f3ecdc', 'uj_wh'), -7.0, 7.0, 5, MY0 + 0.7, 0.4, 7.4, r=0.5, cap=pp('#c8382c', 'uj_red'))
    fm = Fw(15, 7.6, '#5a4a3e', seed=4)
    fm.rect(5.5, 0, 9.5, 6.0, '#2a1f18')
    P.append(fbox('uj_mback', 0, (MY0 + MY1) / 2 + 1.5, 15, MY1 - MY0 - 3.0, 0.4, 8.0, pp('#5a4a3e', 'uj_dim'), faces={'f': fm}, top=False))
    fr = Fw(16, 2.2, '#f2c64a', seed=5)
    fr.band(0, 0.5, '#c8382c').band(1.7, 2.2, '#c8382c')
    P.append(fbox('uj_mroof', 0, (MY0 + MY1) / 2, 16, MY1 - MY0, 7.8, 10.0, pp('#f2c64a', 'uj_yel'), faces={'f': fr, 'l': fr, 'r': fr, 'b': fr}))
    lo.append(blk('uj_mand_lo', 0, (MY0 + MY1) / 2, 16.4, MY1 - MY0 + 0.6, 0.0, 10.1, None))
    fs = Fw(12, 9, '#f3ecdc', seed=6)
    fs.dirt(1.5).band(0, 0.8, '#c8382c').band(8.2, 9, '#c8382c')
    fs.pilasters(3, 0.6, '#f2c64a')
    P.append(fbox('uj_shrine', 0, 9.5, 12, 12, 0.2, 9.0, pp('#f3ecdc', 'uj_wh'), faces={'l': fs, 'r': fs, 'b': fs}))
    lo.append(blk('uj_shrine_lo', 0, 9.5, 12.3, 12.3, 0.0, 9.1, None))
    vimana(P, lo, 'uj_vim', 0, 9.5, 10.0, 9.0, 18.0, ['#f2c64a', '#d8453a', '#f2c64a'], cap_col='#f2b23a', tiers=3)
    # neem tree + flag pole (dhwaja) in the court
    P.append(tree('uj_neem', 13.0, 12.0, 4.2, 13.0, seed=3))
    lo.append(tree_lo('uj_neem_lo', 13.0, 12.0, 4.2, 13.0))
    flags_hi_lo(P, lo, [(-12.0, -12.0)], 14.0, '#d8453a', size=2.6)
    keep.append(lamp_box('uj_lamp', (6.6, 0.2, 0.4), (0, WY0 + 1.5 - 3.6, 10.4), col='#ffcf7a'))
    bake(A, P, lo, keep=keep, size=352)
    L.col_box('uj', (14, 7, 10), (0, WY0 + 1.5, 0))
    L.shots(A, az=-35, el=16, extra=[{'name': 'front', 'view': {'az': 0, 'el': 8, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 6. Lal Darwaza Simhavahini Mahankali (Old City)
@parked('lal_darwaza_temple', 'landmark', landmark='lal_darwaza_temple', face='n', footprint=[40, 40], height=51.0,
        fit='footprint', floodlit=True)
def build_lal_darwaza(A):
    """Sri Simhavahini Mahankali temple, Lal Darwaza (Old City Bonalu): the RED arched gateway on
    the lane (a broad Deccani arch you walk through, red with white and yellow trim, a parapet of
    small domed kiosks and the temple name board), the decorated compound wall, and behind the
    court the shrine with a small yellow and red vimana and a gold kalash."""
    C._ASSET[0] = A.id
    RED, RED2, WH, YEL = '#b3262a', '#8e1d21', '#f3ecdc', '#f2c64a'
    red, wh, yel = pp(RED, 'ld_red'), pp(WH, 'ld_wh'), pp(YEL, 'ld_yel')
    P, lo, keep = [], [], []
    # ---- the red gateway (a real opening through it)
    GW, GD, GH, OW, SP, RS = 18.0, 4.0, 15.0, 8.0, 7.2, 3.6
    GY = -17.5
    ol = arch_outline(OW, SP, RS, 'pointed', n=8)
    gf = Fw(GW, GH, RED, seed=2, noise=0.0)
    gf.dirt(1.5, col='#4a1a14', alpha=0.25).band(0, 0.9, RED2)
    gf.arch(GW / 2, 0.0, OW + 1.6, SP + RS + 0.8, WH, 'pointed', spring=SP + 0.2, shade=False)
    gf.arch(GW / 2, 0.0, OW + 0.8, SP + RS + 0.4, YEL, 'pointed', spring=SP + 0.1, shade=False)
    gf.rect(1.6, 2.0, 4.6, 9.0, RED2).rect(13.4, 2.0, 16.4, 9.0, RED2)
    gf.arch(3.1, 2.4, 2.2, 6.0, '#5c1416', 'pointed', frame=WH, fw=0.25).arch(14.9, 2.4, 2.2, 6.0, '#5c1416', 'pointed', frame=WH, fw=0.25)
    gf.band(GH - 1.6, GH - 1.0, WH).band(GH - 1.0, GH, RED2)
    outline = [(-GW / 2, 0)] + [(x, z) for (x, z) in ol] + [(GW / 2, 0), (GW / 2, GH), (-GW / 2, GH)]
    for (yy, rz) in ((GY - GD / 2, 0.0), (GY + GD / 2, PI)):
        P.append(fpanel('ld_gate', outline, gf, (0, yy, 0), rz))
    for s in (-1, 1):
        P.append(fpanel('ld_gside', [(-GD / 2, 0), (GD / 2, 0), (GD / 2, GH), (-GD / 2, GH)], Fw(GD, GH, RED).band(GH - 1.6, GH - 1.0, WH), (s * GW / 2, GY, 0), -s * PI / 2))
    # the passage soffit + jambs
    jamb = []
    for s in (-1, 1):
        jamb.append(fpanel('ld_jamb', [(-GD / 2, 0), (GD / 2, 0), (GD / 2, SP), (-GD / 2, SP)], Fw(GD, SP, '#c9b48a'), (s * OW / 2, GY, 0), s * PI / 2))
    P += jamb
    arc = ol[1:-1]
    for i in range(len(arc) - 1):
        (x0, z0), (x1, z1) = arc[i], arc[i + 1]
        bm = bmesh.new()
        q = [bm.verts.new(p) for p in ((x0, GY - GD / 2, z0), (x0, GY + GD / 2, z0), (x1, GY + GD / 2, z1), (x1, GY - GD / 2, z1))]
        bm.faces.new(q)
        P.append(kit.obj_from_bm(bm, 'ld_soffit', pp('#c9b48a', 'ld_soffit')))
    P.append(box('ld_gtop', (GW, GD, 0.2), (0, GY, GH - 0.2), red, base=True))
    P.append(box('ld_gcorn', (GW + 0.8, GD + 0.8, 0.6), (0, GY, GH - 1.7), wh, base=True))
    for x in (-7.2, -2.4, 2.4, 7.2):
        for (dx, dy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P.append(box('ld_kp', (0.35, 0.35, 2.0), (x + dx * 0.8, GY + dy * 0.8, GH), wh, base=True))
        P.append(box('ld_ks', (2.2, 2.2, 0.35), (x, GY, GH + 2.0), wh, base=True))
        P.append(onion('ld_kd', 1.0, 1.8, GH + 2.35, yel if abs(x) < 3 else red, seg=8, loc=(x, GY), n=5))
    # gate shells: arch-holed slab + kiosk lumps
    lo_ol = [(-GW / 2 - 0.4, 0)] + [(x * 0.97, z - 0.1) for (x, z) in arch_outline(OW, SP, RS, 'pointed', n=4)] + [(GW / 2 + 0.4, 0), (GW / 2 + 0.4, GH + 0.1), (-GW / 2 - 0.4, GH + 0.1)]
    lo.append(prism_from_outline('ld_gate_lo', lo_ol, GD + 1.0, center=(0, GY, 0)))
    for x in (-7.2, -2.4, 2.4, 7.2):
        lo.append(lathe('ld_k_lo', [(1.5, GH), (1.5, GH + 2.5), (1.25, GH + 3.6), (0.0, GH + 4.6)], seg=4, loc=(x, GY, 0), close_bottom=False))
    keep.append(sign_keep(A.id, 'ld_board', 'SRI MAHANKALI TEMPLE', 10.0, 1.5, (0, GY - GD / 2 - 0.62, 12.1), fg='#ffffff', bg='#7a1216', pw=320, ph=48))
    keep.append(lamp_box('ld_lamp', (OW - 1.0, 0.2, 0.3), (0, GY - GD / 2 - 0.62, SP + RS + 1.3), col='#ffcf7a'))
    # ---- the decorated compound wall (white, red dado, yellow coping)
    WX, WY0, WY1 = 19.2, GY, 19.2
    for s in (-1, 1):
        wall_run(P, lo, 'ld_ws%d' % (s + 1), s * WX, WY0, s * WX, WY1, 5.0, 0.8, (WH, YEL, 3, None, RED, 4.0))
        wall_run(P, lo, 'ld_wf%d' % (s + 1), s * (GW / 2), GY, s * WX, GY, 5.0, 0.8, (WH, YEL, 2, None, RED, 4.0))
    wall_run(P, lo, 'ld_wb', -WX, WY1, WX, WY1, 5.0, 0.8, (WH, YEL, 4, None, RED, 4.0))
    # ---- court, front mandapa with tin-free flat roof, the shrine and its vimana
    P.append(blk('ld_pave', 0, 1.0, 37.0, 35.0, 0, 0.25, pp('#cfc6b4', 'ld_pave')))
    pillars(P, wh, -6.0, 6.0, 4, -1.0, 0.3, 7.0, r=0.45, cap=red)
    fm = Fw(13, 7.4, '#5a4a3e', seed=6)
    fm.rect(4.5, 0, 8.5, 5.8, '#2a1f18')
    P.append(fbox('ld_mback', 0, 2.6, 13, 6.0, 0.3, 7.6, pp('#5a4a3e', 'ld_dim'), faces={'f': fm}, top=False))
    fr = Fw(14, 2.0, RED, seed=7)
    fr.band(0, 0.4, YEL).band(1.6, 2.0, WH)
    P.append(fbox('ld_mroof', 0, 2.0, 14, 7.6, 7.3, 9.3, red, faces={'f': fr, 'l': fr, 'r': fr, 'b': fr}))
    lo.append(blk('ld_mand_lo', 0, 2.0, 14.4, 8.2, 0, 9.4, None))
    fs = Fw(11, 10, WH, seed=8)
    fs.dirt(1.5).band(0, 1.0, RED).band(9.2, 10, YEL)
    fs.pilasters(3, 0.6, RED)
    P.append(fbox('ld_shrine', 0, 11.5, 11, 11, 0.2, 10.0, wh, faces={'l': fs, 'r': fs, 'b': fs, 'f': fs}))
    lo.append(blk('ld_shrine_lo', 0, 11.5, 11.3, 11.3, 0, 10.1, None))
    vimana(P, lo, 'ld_vim', 0, 11.5, 8.6, 10.0, 15.0, [YEL, RED, YEL], cap_col='#e8b23a', tiers=3)
    flags_hi_lo(P, lo, [(12.0, 8.0)], 13.0, RED, size=2.4)
    bake(A, P, lo, keep=keep, size=320)
    for s in (-1, 1):
        L.col_box('ld_pier%d' % (s + 1), ((GW - OW) / 2, GD, GH), (s * (GW + OW) / 4, GY, 0))
    A.notes.append('gate passage is open (no COL proxy over it): fps can walk through the red arch')
    L.shots(A, az=-30, el=12, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== Deccani / Islamic pieces
def leaf_ol(span, h, n, base=0.5, fill=0.7):
    """outline of n Deccani leaf merlons (pointed-ogee tops) on a base strip, standing on z 0"""
    out = [(-span / 2, 0.0)]
    step = span / n
    for i in range(n):
        x = -span / 2 + step * (i + 0.5)
        w = step * fill / 2
        out += [(x - w, base), (x - w, base + (h - base) * 0.5), (x, h), (x + w, base + (h - base) * 0.5), (x + w, base)]
    out += [(span / 2, 0.0)]
    return out


def leaf_parapet(P, lo, name, cx, cy, W, D, z, h, mat, pitch=2.0, sides='fblr', lo_sides='f'):
    """leaf-merlon parapet cards round a W x D roof (hi prisms; lo double-sided cards on lo_sides)"""
    for s, rz, span, half in (('f', 0.0, W, D / 2), ('r', PI / 2, D, W / 2), ('b', PI, W, D / 2), ('l', -PI / 2, D, W / 2)):
        if s not in sides:
            continue
        n = max(2, int(round(span / pitch)))
        ol = leaf_ol(span, h, n)
        c, sn = math.cos(rz), math.sin(rz)
        ox, oy = cx + half * sn, cy - half * c
        P.append(L.place(prism_from_outline(name, ol, 0.5, center=(0, 0.25, 0), mat=mat), (ox, oy, z), rz))
        if s in lo_sides:
            step = span / n
            tl = [(-span / 2 - 0.1, -0.1)]
            for i in range(n):
                xm = -span / 2 + step * (i + 0.5)
                tl += [(xm - step * 0.42, 0.55), (xm, h + 0.15), (xm + step * 0.42, 0.55)]
            tl += [(span / 2 + 0.1, -0.1)]
            lo.append(L.place(poly(name + '_lo', tl, None, (0, -0.45, 0)), (ox, oy, z), rz))


def minaret(P, lo, name, x, y, h, r, white, green, gold, base_h=None, lo_seg=6):
    """slender neighbourhood-mosque minaret: square base, round shaft with two balconies, a
    kiosk ring, a green onion and a gold finial"""
    bh = base_h or h * 0.36
    P.append(box(name + '_base', (r * 2.4, r * 2.4, bh), (x, y, 0), white, base=True))
    P.append(cylinder(name + '_sh', r, h - bh - 6.0, (x, y, bh), seg=12, mat=white, r2=r * 0.9))
    for (z, rr) in ((bh, r * 1.65), (bh + (h - bh - 6.0) * 0.62, r * 1.5)):
        P.append(cylinder(name + '_bal', rr, 0.7, (x, y, z), seg=12, mat=white))
        P.append(cylinder(name + '_bal_g', rr + 0.05, 0.25, (x, y, z + 0.7), seg=12, mat=green))
        P.append(cylinder(name + '_rail', rr - 0.1, 0.6, (x, y, z + 0.95), seg=12, mat=white, cap=False))
    zk = h - 6.0
    P.append(cylinder(name + '_kiosk', r * 0.95, 1.6, (x, y, zk), seg=8, mat=white))
    P.append(cylinder(name + '_kslab', r * 1.4, 0.4, (x, y, zk + 1.6), seg=12, mat=green))
    P.append(onion(name + '_dome', r * 1.1, 3.2, zk + 2.0, green, seg=12, loc=(x, y), n=6))
    P.append(cylinder(name + '_fin', 0.12, 1.4, (x, y, zk + 2.0 + 3.2 * 1.3), seg=4, mat=gold))
    lo.append(blk(name + '_blo', x, y, r * 2.4 + 0.3, r * 2.4 + 0.3, 0, bh + 0.1, None))
    lo.append(lathe(name + '_lo', [(r * 1.85, bh), (r * 1.85, bh + 1.6), (r * 1.2, bh + 1.7), (r * 1.05, zk), (r * 1.6, zk + 1.9), (r * 1.25, zk + 3.3), (r * 0.45, zk + 4.6), (0.0, zk + 2.0 + 3.2 * 1.3 + 1.4)],
                  seg=lo_seg, loc=(x, y, 0), close_bottom=False))


# =========================================================================== 7. neighbourhood temple kit
@parked('kit_temple', 'landmark', draw='temple', face='s', footprint=[30, 30], height=42.0, fit='footprint',
        variants={'rule': 'hash', 'names': ['vimana', 'gopuram', 'shrine']})
def build_kit_temple(A):
    """Neighbourhood temples (variants by lm.id hash):
      vimana   a small South Indian temple: plinth, pillared mandapa, the sanctum with a stepped
               painted vimana and gold kalash, a dhwaja stambha in front, a low striped wall
      gopuram  a walled temple entered through a small painted gopuram; the shrine behind
      shrine   a whitewashed roadside shrine with a little white shikhara and a saffron flag, beside
               a peepal tree on its round whitewashed platform (katta)
    Sanctum doorways are dark: no deity figures."""
    C._ASSET[0] = A.id
    WH, RED, YEL = TW_WHITE, '#c8382c', '#f2c64a'
    wh, red = pp(WH, 'kt_white'), pp(RED, 'kt_red')
    gold = pp('#d0a23a', 'ws_gold')
    P = [blk('kt_pave', 0, 0, 28.0, 28.0, 0, 0.15, pp('#cdc6b8', 'kt_pave'))]
    lo = [blk('kt_pave_lo', 0, 0, 28.2, 28.2, 0, 0.2, None)]
    # ---- vimana
    vh, vl = [], []
    for s in (-1, 1):
        wall_run(vh, vl, 'ktv_wf%d' % (s + 1), s * 3.5, -13.5, s * 13.5, -13.5, 2.6, 0.6, (WH, WH, 2, (RED, WH, 1.4), None, 6.0))
        wall_run(vh, vl, 'ktv_ws%d' % (s + 1), s * 13.5, -13.5, s * 13.5, 13.5, 2.6, 0.6, (WH, WH, 3, (RED, WH, 1.4), None, 6.0))
    wall_run(vh, vl, 'ktv_wb', -13.5, 13.5, 13.5, 13.5, 2.6, 0.6, (WH, WH, 4, (RED, WH, 1.4), None, 6.0))
    vh.append(fbox('ktv_plinth', 0, 3.5, 13, 17, 0.1, 1.2, wh, faces={'f': Fw(13, 1.1, WH).band(0, 0.3, RED)}))
    vl.append(blk('ktv_plinth_lo', 0, 3.5, 13.3, 17.3, 0, 1.25, None))
    vh.append(L.steps('ktv_steps', 4.0, 0.6, 0.3, 3, (0, -5.0 - 1.8, 0.1), wh))
    pillars(vh, wh, -3.8, 3.8, 4, -4.3, 1.2, 5.0, r=0.38, cap=red)
    fm = Fw(9, 5.4, '#5a4a3e', seed=3)
    fm.rect(3.0, 0, 6.0, 4.4, '#251c16').rect(2.6, 4.4, 6.4, 4.8, YEL)
    vh.append(fbox('ktv_mback', 0, -2.0, 9, 3.0, 1.2, 6.4, pp('#5a4a3e', 'kt_dim'), faces={'f': fm}, top=False))
    fr = Fw(10, 1.6, YEL).band(0, 0.35, RED).band(1.25, 1.6, WH)
    vh.append(fbox('ktv_mroof', 0, -1.6, 10, 6.0, 6.0, 7.6, pp(YEL, 'kt_yel'), faces={'f': fr, 'l': fr, 'r': fr}))
    vl.append(blk('ktv_mand_lo', 0, -1.6, 10.4, 6.6, 1.2, 7.7, None))
    fs = Fw(8, 7.0, WH, seed=4)
    fs.dirt(1.2).band(0, 0.6, RED).band(6.4, 7.0, YEL).pilasters(2, 0.5, RED)
    vh.append(fbox('ktv_sanctum', 0, 6.6, 8, 8, 1.2, 8.2, wh, faces={'l': fs, 'r': fs, 'b': fs}))
    vl.append(blk('ktv_sanc_lo', 0, 6.6, 8.3, 8.3, 1.2, 8.3, None))
    vimana(vh, vl, 'ktv_vim', 0, 6.6, 7.4, 8.2, 14.0, [YEL, '#ee8a9a', YEL], cap_col='#f2b23a', tiers=3)
    vh.append(cylinder('ktv_stambha', 0.35, 10.0, (0, -9.0, 0), seg=8, mat=gold, r2=0.25))
    vh.append(box('ktv_stb', (1.4, 1.4, 1.0), (0, -9.0, 0), wh, base=True))
    vh.append(box('ktv_stt', (1.2, 0.3, 0.6), (0, -9.0, 9.4), gold, base=True))
    vl.append(cylinder('ktv_st_lo', 0.7, 10.2, (0, -9.0, 0), seg=4, r2=0.45, cap=False))
    # ---- gopuram
    gh_, gl_ = [], []
    for s in (-1, 1):
        wall_run(gh_, gl_, 'ktg_wf%d' % (s + 1), s * 4.6, -12.5, s * 13.5, -12.5, 4.0, 0.7, ('#f1e6c8', RED, 2, None, RED, 4.5))
        wall_run(gh_, gl_, 'ktg_ws%d' % (s + 1), s * 13.5, -12.5, s * 13.5, 13.5, 4.0, 0.7, ('#f1e6c8', RED, 3, None, RED, 4.5))
    wall_run(gh_, gl_, 'ktg_wb', -13.5, 13.5, 13.5, 13.5, 4.0, 0.7, ('#f1e6c8', RED, 4, None, RED, 4.5))
    gopuram(gh_, gl_, 'ktg_gop', 0, -12.0, 9.0, 4.6, 22.0, ['#f0b52e', '#e8707f', '#5ea9d8', '#79b851'], tiers=3, kalash_n=3, base_frac=0.36)
    fs2 = Fw(8, 7.0, WH, seed=5)
    fs2.dirt(1.2).band(0, 0.6, RED).band(6.4, 7.0, YEL)
    fs2f = Fw(8, 7.0, WH, seed=6)
    fs2f.dirt(1.2).band(0, 0.6, RED).band(6.4, 7.0, YEL).rect(2.8, 0.6, 5.2, 4.8, '#251c16').rect(2.4, 4.8, 5.6, 5.2, YEL)
    gh_.append(fbox('ktg_shrine', 0, 6.0, 8, 8, 0.1, 7.0, wh, faces={'f': fs2f, 'l': fs2, 'r': fs2, 'b': fs2}))
    gl_.append(blk('ktg_shr_lo', 0, 6.0, 8.3, 8.3, 0, 7.1, None))
    vimana(gh_, gl_, 'ktg_vim', 0, 6.0, 6.6, 7.0, 10.0, [WH, YEL], cap_col=WH, tiers=2)
    # ---- roadside shrine + peepal katta
    sh_, sl_ = [], []
    ff = Fw(6.4, 6.0, '#f4f1ea', seed=7)
    ff.dirt(1.0, alpha=0.4).band(0, 0.5, RED).rect(2.0, 0.5, 4.4, 4.4, SAFFRON).rect(2.5, 0.5, 3.9, 3.9, '#2a1d16')
    fsd = Fw(6.4, 6.0, '#f4f1ea', seed=8)
    fsd.dirt(1.0, alpha=0.4).band(0, 0.5, RED)
    sh_.append(fbox('kts_shrine', -5.0, 1.0, 6.4, 6.4, 0.15, 6.0, pp('#f4f1ea', 'kt_ww'), faces={'f': ff, 'l': fsd, 'r': fsd, 'b': fsd}))
    sh_.append(box('kts_cor', (7.2, 7.2, 0.5), (-5.0, 1.0, 6.0), pp('#f4f1ea', 'kt_ww'), base=True))
    sl_.append(blk('kts_lo', -5.0, 1.0, 6.7, 6.7, 0, 6.6, None))
    sh_.append(L.steps('kts_step', 3.0, 0.6, 0.25, 2, (-5.0, -2.2 - 0.6, 0.1), pp('#f4f1ea', 'kt_ww')))
    top = shikhara(sh_, sl_, 'kts_shik', -5.0, 1.0, 6.5, 2.6, 6.0, pp('#f4f1ea', 'kt_ww'), gold, courses=8)
    sh_.append(flag('kts_flag', -4.4, 1.0, top - 2.0, 5.0, SAFFRON, size=1.9))
    sl_.append(flag_lo('kts_flag_lo', -4.4, 1.0, top - 2.0, 5.0, size=1.9))
    kt = Fw(2 * PI * 4.2, 1.1, '#f4f1ea', seed=9)
    kt.band(0, 0.35, RED)
    sh_.append(cylinder('kts_katta', 4.2, 1.1, (6.0, 4.0, 0.1), seg=16, mat=pp('#efe9dc', 'kt_katta')))
    sh_.append(cylinder('kts_katta_b', 4.25, 0.35, (6.0, 4.0, 0.1), seg=16, mat=red, cap=False))
    sl_.append(cylinder('kts_katta_lo', 4.4, 1.3, (6.0, 4.0, 0.0), seg=8, cap=True))
    sh_.append(tree('kts_peepal', 6.0, 4.0, 6.5, 21.0, leaf='#4a7a32', seed=7))
    sl_.append(tree_lo('kts_peepal_lo', 6.0, 4.0, 6.5, 21.0))
    apart(vh + vl, 1000.0)
    apart(gh_ + gl_, 2000.0)
    apart(sh_ + sl_, 3000.0)
    los = bake(A, P, lo, size=320, variants={'vimana': (vh, vl), 'gopuram': (gh_, gl_), 'shrine': (sh_, sl_)})
    unapart(los, 'var_vimana', 1000.0)
    unapart(los, 'var_gopuram', 2000.0)
    unapart(los, 'var_shrine', 3000.0)
    A.notes.append('variants vimana / gopuram / shrine by lm.id hash')
    L.shots(A, az=-35, el=16)


# =========================================================================== 8. neighbourhood mosque kit
@parked('kit_mosque', 'landmark', draw='mosque', face='s', footprint=[36, 36], height=54.0, fit='footprint',
        variants={'rule': 'hash', 'names': ['minars', 'dome']})
def build_kit_mosque(A):
    """Neighbourhood mosques (variants by lm.id hash), whitewashed with green trim:
      minars  a prayer hall whose front is three broad two-centred Deccani arches under a leaf-merlon
              parapet, a green dome on the roof and two slender minarets with balconies and green
              onion caps; a low forecourt wall with gate pillars
      dome    a square domed mosque (big green dome on a drum, corner turrets) behind a courtyard
              wall entered through an arched gateway"""
    C._ASSET[0] = A.id
    WH, GR, DK = '#efebe0', GREEN, '#34352f'
    wh, gr = pp(WH, 'mq_white'), pp(GR, 'mq_green')
    gold = pp('#c9a24a', 'mq_gold')
    P = [blk('mq_pave', 0, 0, 35.0, 35.0, 0, 0.15, pp('#cbc5b8', 'mq_pave'))]
    lo = [blk('mq_pave_lo', 0, 0, 35.2, 35.2, 0, 0.2, None)]
    # ---- minars
    mh, ml = [], []
    HW, HY0, HY1, HH = 24.0, -4.0, 14.0, 13.0
    ff = Fw(HW, HH, WH, seed=2)
    ff.dirt(1.5).band(0, 0.8, '#c9c2b2')
    ff.arches(3, 0.8, 4.8, 8.8, '#5c5a52', kind='pointed', frame=GR, fw=0.5)
    for i in range(3):
        ff.arch(HW / 6 * (2 * i + 1), 0.8, 1.8, 4.4, DK, 'pointed', shade=False)
    ff.band(10.4, 10.7, GR)
    ff.band(HH - 1.4, HH - 0.9, GR)
    fs = Fw(HY1 - HY0, HH, WH, seed=3)
    fs.dirt(1.5).arches(4, 2.0, 2.0, 5.6, '#4a5048', kind='pointed', frame=GR, fw=0.35).band(HH - 1.4, HH - 0.9, GR)
    mh.append(fbox('mqm_hall', 0, (HY0 + HY1) / 2, HW, HY1 - HY0, 0.15, HH, wh, faces={'f': ff, 'l': fs, 'r': fs, 'b': fs}))
    ml.append(blk('mqm_hall_lo', 0, (HY0 + HY1) / 2, HW + 0.3, HY1 - HY0 + 0.3, 0, HH + 0.1, None))
    leaf_parapet(mh, ml, 'mqm_crest', 0, (HY0 + HY1) / 2, HW, HY1 - HY0, HH, 1.8, wh, pitch=2.2, lo_sides='f')
    mh.append(cylinder('mqm_drum', 4.0, 1.6, (0, 6.0, HH), seg=16, mat=wh))
    mh.append(onion('mqm_dome', 4.1, 6.0, HH + 1.6, gr, seg=16, loc=(0, 6.0), n=8))
    mh.append(cylinder('mqm_fin', 0.15, 2.4, (0, 6.0, HH + 1.6 + 6.0 * 1.25), seg=4, mat=gold))
    ml.append(lathe('mqm_d_lo', [(4.25, HH), (4.25, HH + 1.7)] + onion_prof(4.1, 6.0, HH + 1.6, top=HH + 1.6 + 6.0 * 1.25 + 2.4),
                    seg=8, loc=(0, 6.0, 0), close_bottom=False))
    for s in (-1, 1):
        minaret(mh, ml, 'mqm_min', s * (HW / 2 - 0.6), HY0 - 0.6, 34.0, 1.1, wh, gr, gold, base_h=HH + 0.2)
        wall_run(mh, ml, 'mqm_wf%d' % (s + 1), s * 3.6, -17.0, s * 17.0, -17.0, 2.4, 0.6, (WH, GR, 2, None, WH, 5.0))
        mh.append(box('mqm_gp', (1.6, 1.6, 3.6), (s * 3.2, -17.0, 0), wh, base=True))
        mh.append(box('mqm_gpc', (1.9, 1.9, 0.4), (s * 3.2, -17.0, 3.6), gr, base=True))
        ml.append(blk('mqm_gp_lo', s * 3.2, -17.0, 2.0, 2.0, 0, 4.1, None))
    # ---- dome
    dh, dl = [], []
    CW, CY, CH = 20.0, 6.0, 12.0
    fd = Fw(CW, CH, WH, seed=5)
    fd.dirt(1.5).band(0, 0.8, '#c9c2b2')
    fd.arch(CW / 2, 0.8, 5.6, 9.0, DK, 'pointed', frame=GR, fw=0.6)
    fd.arch(3.6, 2.0, 2.6, 6.0, '#4a5048', 'pointed', frame=GR, fw=0.35).arch(CW - 3.6, 2.0, 2.6, 6.0, '#4a5048', 'pointed', frame=GR, fw=0.35)
    fd.band(CH - 1.2, CH - 0.7, GR)
    dh.append(fbox('mqd_hall', 0, CY, CW, CW, 0.15, CH, wh, faces={'f': fd, 'l': fd, 'r': fd, 'b': fd}))
    dl.append(blk('mqd_hall_lo', 0, CY, CW + 0.3, CW + 0.3, 0, CH + 0.1, None))
    leaf_parapet(dh, dl, 'mqd_crest', 0, CY, CW, CW, CH, 1.6, wh, pitch=2.2, lo_sides='f')
    dh.append(cylinder('mqd_drum', 7.0, 2.4, (0, CY, CH), seg=20, mat=wh))
    dh.append(cylinder('mqd_drum_g', 7.1, 0.4, (0, CY, CH + 2.0), seg=20, mat=gr))
    dh.append(onion('mqd_dome', 7.2, 10.0, CH + 2.4, gr, seg=20, loc=(0, CY), n=9, neck=0.92, bulge=1.08))
    dh.append(cylinder('mqd_fin', 0.2, 3.0, (0, CY, CH + 2.4 + 10.0 * 1.2), seg=4, mat=gold))
    dl.append(lathe('mqd_d_lo', [(7.3, CH), (7.3, CH + 2.5)] + onion_prof(7.2, 10.0, CH + 2.4, pad=0.3, top=CH + 2.4 + 10.0 * 1.2 + 3.0),
                    seg=8, loc=(0, CY, 0), close_bottom=False))
    for sx in (-1, 1):
        for sy in (-1, 1):
            tx, ty = sx * (CW / 2), CY + sy * (CW / 2)
            dh.append(cylinder('mqd_tur', 0.9, 4.0, (tx, ty, CH), seg=8, mat=wh))
            dh.append(cylinder('mqd_turs', 1.2, 0.3, (tx, ty, CH + 4.0), seg=8, mat=gr))
            dh.append(onion('mqd_turd', 0.9, 1.6, CH + 4.3, gr, seg=8, loc=(tx, ty), n=4))
            dl.append(lathe('mqd_tur_lo', [(1.2, CH), (1.3, CH + 4.4), (1.1, CH + 5.0), (0.0, CH + 6.6)], seg=4, loc=(tx, ty, 0), close_bottom=False))
    # courtyard wall + arched gateway
    for s in (-1, 1):
        wall_run(dh, dl, 'mqd_wf%d' % (s + 1), s * 4.0, -17.0, s * 17.0, -17.0, 3.6, 0.6, (WH, GR, 2, None, WH, 5.0))
        wall_run(dh, dl, 'mqd_ws%d' % (s + 1), s * 17.0, -17.0, s * 17.0, -4.0, 3.6, 0.6, (WH, GR, 3, None, WH, 5.0))
    ga = Fw(8.0, 8.0, WH, seed=6)
    ga.band(6.6, 7.0, GR)
    gol = [(-4, 0)] + arch_outline(4.4, 4.0, 2.2, 'pointed', n=6) + [(4, 0), (4, 8), (-4, 8)]
    ga.arch(4.0, 0.0, 5.2, 6.8, GR, 'pointed', spring=4.2, shade=False)
    for (yy, rz) in ((-17.0 - 0.8, 0.0), (-17.0 + 0.8, PI)):
        dh.append(fpanel('mqd_gate', gol, ga, (0, yy, 0), rz))
    for s in (-1, 1):
        dh.append(fpanel('mqd_gside', [(-0.8, 0), (0.8, 0), (0.8, 8), (-0.8, 8)], Fw(1.6, 8, WH).band(6.6, 7.0, GR), (s * 4.0, -17.0, 0), -s * PI / 2))
        dh.append(fpanel('mqd_gjamb', [(-0.8, 0), (0.8, 0), (0.8, 4.0), (-0.8, 4.0)], Fw(1.6, 4.0, '#ddd6c8'), (s * 2.2, -17.0, 0), s * PI / 2))
    dh.append(box('mqd_gtop', (8.0, 1.6, 0.2), (0, -17.0, 7.8), wh, base=True))
    leaf_parapet(dh, dl, 'mqd_gcrest', 0, -17.0, 8.0, 1.6, 8.0, 1.4, wh, pitch=1.6, sides='f', lo_sides='')
    dl.append(prism_from_outline('mqd_gate_lo', [(-4.3, 0)] + [(x * 0.95, z - 0.1) for (x, z) in arch_outline(4.4, 4.0, 2.2, 'pointed', n=3)] + [(4.3, 0), (4.3, 9.5), (-4.3, 9.5)], 2.2, center=(0, -17.0, 0)))
    apart(mh + ml, 1000.0)
    apart(dh + dl, 2000.0)
    los = bake(A, P, lo, size=320, variants={'minars': (mh, ml), 'dome': (dh, dl)})
    unapart(los, 'var_minars', 1000.0)
    unapart(los, 'var_dome', 2000.0)
    A.notes.append('variants minars / dome by lm.id hash')
    L.shots(A, az=-35, el=14)


# =========================================================================== 9. neighbourhood church kit
@parked('kit_church', 'landmark', draw='church', face='s', footprint=[40, 50], height=60.0, fit='footprint')
def build_kit_church(A):
    """A small neighbourhood church: cream-white nave with a red tiled roof; the front gable with a
    pointed door, three lancets and a small open belfry (bellcote) carrying the cross; lancets
    between buttresses down the sides; a low compound wall with gate pillars."""
    C._ASSET[0] = A.id
    WALL, TRIM, WIN, DOOR = '#efe7d4', '#8f9aa3', '#3a4252', '#5b3b26'
    wall, trim = pp(WALL, 'kc_wall'), pp(TRIM, 'kc_trim')
    tile = pp('#9c5a44', 'kc_tile')
    P, lo = [], []
    NW, NY0, NY1, EAVE, RISE = 17.0, -10.0, 17.0, 13.0, 9.0
    ny, nd = (NY0 + NY1) / 2, NY1 - NY0
    ff = Fw(NW, EAVE, WALL, seed=2)
    ff.dirt(1.5).band(0, 0.8, TRIM)
    lancet_fac(ff, NW / 2, 0.8, 3.6, 7.6, DOOR, frame=TRIM, fw=0.5)
    for x in (NW / 2 - 4.6, NW / 2 + 4.6):
        lancet_fac(ff, x, 3.0, 1.8, 6.4, WIN, frame=TRIM, sill=TRIM)
    ff.band(EAVE - 0.6, EAVE, TRIM)
    fs = Fw(nd, EAVE, WALL, seed=3)
    fs.dirt(1.5).band(0, 0.8, TRIM)
    lancets(fs, 5, 3.0, 1.8, 6.8, WIN, frame=TRIM, sill=TRIM)
    fs.band(EAVE - 0.6, EAVE, TRIM)
    P.append(fbox('kc_nave', 0, ny, NW, nd, 0, EAVE, wall, faces={'f': ff, 'l': fs, 'r': fs, 'b': Fw(NW, EAVE, WALL).band(0, 0.8, TRIM)}, top=False))
    fg = Fw(NW, RISE, WALL, seed=4)
    for x in (NW / 2 - 1.6, NW / 2, NW / 2 + 1.6):
        lancet_fac(fg, x, 0.8, 1.1, 4.0 if x == NW / 2 else 3.2, WIN, frame=TRIM, fw=0.25)
    P.append(fpanel('kc_gable', [(-NW / 2, 0), (NW / 2, 0), (0, RISE)], fg, (0, NY0, EAVE)))
    P.append(fpanel('kc_gableb', [(-NW / 2, 0), (NW / 2, 0), (0, RISE)], Fw(NW, RISE, WALL), (0, NY1, EAVE), PI))
    P.append(prism_from_outline('kc_cope', [(-NW / 2 - 0.5, -0.3), (NW / 2 + 0.5, -0.3), (0, RISE + 0.6)], 0.8, center=(0, NY0 + 0.45, EAVE), mat=trim))
    P.append(roof_hi('kc_roof', 0, ny, NW, nd, EAVE, RISE, tile, over=0.8, t=0.45))
    lo.append(gable_lo('kc_nave_lo', 0, ny, NW + 1.6, nd + 2.0, EAVE + 0.1, RISE + 0.7))
    for s in (-1, 1):
        bt = []
        for i in range(6):
            yb = NY0 + nd * i / 5
            bt.append(box('btr', (1.2, 1.0, 7.0), (s * (NW / 2 + 0.5), yb, 0), wall, base=True))
            bt.append(box('btr2', (0.8, 0.8, 3.0), (s * (NW / 2 + 0.35), yb, 7.0), wall, base=True))
        P.append(kit.join(bt, 'kc_btr'))
    # bellcote on the front gable apex
    bz = EAVE + RISE - 1.0
    fb = Fw(3.4, 4.6, WALL, seed=5)
    fb.arch(1.7, 0.6, 1.6, 3.4, '#26272b', 'pointed', frame=TRIM, fw=0.25)
    P.append(fbox('kc_bell', 0, NY0 + 0.6, 3.4, 2.0, bz, bz + 4.6, wall, faces={'f': fb, 'b': fb}))
    P.append(cylinder('kc_bellroof', 2.6, 2.6, (0, 0, 0), seg=4, mat=trim, r2=0.0))
    P[-1] = L.place(P[-1], (0, NY0 + 0.6, bz + 4.6), PI / 4)
    P.append(cross('kc_x', 0, NY0 + 0.6, bz + 7.0, 3.6, 2.2, 0.35, pp('#f2efe6', 'kc_cross')))
    lo.append(blk('kc_bell_lo', 0, NY0 + 0.6, 3.7, 2.3, bz - 1.0, bz + 4.7, None))
    lo.append(spire_lo('kc_bellroof_lo', 0, NY0 + 0.6, bz + 4.6, 2.7, 2.8))
    lo.append(cross_lo('kc_x_lo', 0, NY0 + 0.6, bz + 7.0, 3.6, 2.2, 0.35))
    # porch steps + compound wall
    P.append(L.steps('kc_steps', 6.0, 0.7, 0.3, 2, (0, NY0 - 1.4, 0), trim))
    for s in (-1, 1):
        wall_run(P, lo, 'kc_wf%d' % (s + 1), s * 4.4, -23.5, s * 19.0, -23.5, 2.4, 0.6, (WALL, TRIM, 2 + s, None, TRIM, 4.0))
        wall_run(P, lo, 'kc_ws%d' % (s + 1), s * 19.0, -23.5, s * 19.0, -12.0, 2.4, 0.6, (WALL, TRIM, 4 + s, None, TRIM, 4.0))
        P.append(box('kc_gp', (1.8, 1.8, 4.0), (s * 3.6, -23.5, 0), trim, base=True))
        P.append(box('kc_gpc', (2.2, 2.2, 0.4), (s * 3.6, -23.5, 4.0), wall, base=True))
        lo.append(blk('kc_gp_lo', s * 3.6, -23.5, 2.3, 2.3, 0, 4.5, None))
    P.append(tree('kc_tree', 13.0, 8.0, 4.6, 14.0, seed=4))
    lo.append(tree_lo('kc_tree_lo', 13.0, 8.0, 4.6, 14.0))
    bake(A, P, lo, size=320)
    L.shots(A, az=-35, el=14, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])


# =========================================================================== 10. dargah kit
@parked('kit_dargah', 'landmark', draw='dargah', face='s', footprint=[40, 40], height=45.0, fit='footprint', floodlit=True)
def build_kit_dargah(A):
    """A neighbourhood dargah (Sufi shrine): the whitewashed square tomb chamber on a plinth with
    arched green doors and jaali screens, a leaf-merlon parapet, small domed kiosks on its corners
    and the green onion dome with a gold finial; green and white flags; a white compound wall with
    an arched gateway carrying two small minarets."""
    C._ASSET[0] = A.id
    WH, GR, DK = '#f1eee6', GREEN, '#2f3a32'
    wh, gr = pp(WH, 'dg_white'), pp(GR, 'dg_green')
    gold = pp('#c9a24a', 'dg_gold')
    P, lo = [], []
    PZ = 1.2
    P.append(fbox('dg_plinth', 0, 3.0, 23, 23, 0, PZ, pp('#dcd6ca', 'dg_plinth'), faces={'f': Fw(23, PZ, '#dcd6ca').band(PZ - 0.25, PZ, GR)}))
    lo.append(blk('dg_plinth_lo', 0, 3.0, 23.3, 23.3, 0, PZ + 0.05, None))
    P.append(L.steps('dg_steps', 5.0, 0.6, PZ / 3, 3, (0, 3.0 - 11.5 - 1.8, 0), wh))
    CW, CH = 15.0, 13.0

    def face(seed, door):
        f = Fw(CW, CH, WH, seed=seed)
        f.dirt(1.5).band(0, 0.6, '#cfc8ba')
        if door:
            f.arch(CW / 2, 0.6, 4.2, 8.0, GR, 'pointed', frame='#d9d2c2', fw=0.5)
            f.arch(CW / 2, 0.6, 3.0, 6.6, '#1f3a27', 'pointed', shade=False)
        else:
            f.arch(CW / 2, 1.2, 4.6, 8.0, '#d9d2c2', 'pointed', shade=False)
            for i in range(5):
                for j in range(6):
                    f.rect(CW / 2 - 1.8 + i * 0.8, 2.0 + j * 0.9, CW / 2 - 1.4 + i * 0.8, 2.5 + j * 0.9, DK)
        for x in (2.4, CW - 2.4):
            f.arch(x, 2.0, 1.8, 5.0, '#5a625a', 'pointed', frame=GR, fw=0.25)
        f.band(CH - 1.3, CH - 0.8, GR)
        return f
    P.append(fbox('dg_chamber', 0, 3.0, CW, CW, PZ, PZ + CH, wh, faces={'f': face(2, True), 'l': face(3, False), 'r': face(4, False), 'b': face(5, False)}))
    lo.append(blk('dg_ch_lo', 0, 3.0, CW + 0.3, CW + 0.3, PZ, PZ + CH + 0.1, None))
    leaf_parapet(P, lo, 'dg_crest', 0, 3.0, CW, CW, PZ + CH, 1.6, wh, pitch=1.9, lo_sides='fblr')
    zt = PZ + CH
    P.append(cylinder('dg_drum', 5.2, 2.6, (0, 3.0, zt), seg=20, mat=wh))
    P.append(cylinder('dg_drum_g', 5.3, 0.35, (0, 3.0, zt + 2.2), seg=20, mat=gr))
    P.append(onion('dg_dome', 5.6, 9.0, zt + 2.6, gr, seg=20, loc=(0, 3.0), n=9))
    P.append(lathe('dg_fin', [(0.5, 0), (0.6, 0.6), (0.2, 1.0), (0.35, 1.6), (0.1, 2.0), (0.0, 3.4)], seg=6, mat=gold, loc=(0, 3.0, zt + 2.6 + 9.0 * 1.25)))
    lo.append(lathe('dg_d_lo', [(5.45, zt), (5.45, zt + 2.7)] + onion_prof(5.6, 9.0, zt + 2.6, top=zt + 2.6 + 9.0 * 1.25 + 3.4),
                    seg=10, loc=(0, 3.0, 0), close_bottom=False))
    for sx in (-1, 1):
        for sy in (-1, 1):
            kx, ky = sx * (CW / 2 - 0.4), 3.0 + sy * (CW / 2 - 0.4)
            for (dx, dy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                P.append(box('dg_kp', (0.3, 0.3, 2.4), (kx + dx * 0.7, ky + dy * 0.7, zt), wh, base=True))
            P.append(box('dg_ks', (2.1, 2.1, 0.3), (kx, ky, zt + 2.4), wh, base=True))
            P.append(onion('dg_kd', 0.9, 1.6, zt + 2.7, gr, seg=8, loc=(kx, ky), n=4))
            lo.append(lathe('dg_k_lo', [(1.4, zt), (1.4, zt + 2.8), (1.1, zt + 3.3), (0.0, zt + 5.0)], seg=4, loc=(kx, ky, 0), close_bottom=False))
    # flags (green + white) at the plinth's front corners
    for (x, col) in ((-10.6, GR), (10.6, '#f4f2ea')):
        P.append(flag('dg_flag', x, -7.6, 0.0, 13.0, col, size=2.6))
        lo.append(flag_lo('dg_flag_lo', x, -7.6, 0.0, 13.0, size=2.6))
    # compound wall + arched gateway with two small minarets
    GY = -18.0
    for s in (-1, 1):
        wall_run(P, lo, 'dg_wf%d' % (s + 1), s * 4.5, GY, s * 19.0, GY, 3.2, 0.6, (WH, GR, 2 + s, None, WH, 5.0))
        wall_run(P, lo, 'dg_ws%d' % (s + 1), s * 19.0, GY, s * 19.0, 19.0, 3.2, 0.6, (WH, GR, 4 + s, None, WH, 5.0))
    wall_run(P, lo, 'dg_wb', -19.0, 19.0, 19.0, 19.0, 3.2, 0.6, (WH, GR, 7, None, WH, 5.0))
    ga = Fw(9.0, 9.0, WH, seed=8)
    ga.arch(4.5, 0.0, 5.4, 7.4, GR, 'pointed', spring=4.5, shade=False)
    ga.band(7.8, 8.3, GR)
    gol = [(-4.5, 0)] + arch_outline(4.4, 4.4, 2.4, 'pointed', n=6) + [(4.5, 0), (4.5, 9), (-4.5, 9)]
    for (yy, rz) in ((GY - 0.9, 0.0), (GY + 0.9, PI)):
        P.append(fpanel('dg_gate', gol, ga, (0, yy, 0), rz))
    for s in (-1, 1):
        P.append(fpanel('dg_gside', [(-0.9, 0), (0.9, 0), (0.9, 9), (-0.9, 9)], Fw(1.8, 9, WH).band(7.8, 8.3, GR), (s * 4.5, GY, 0), -s * PI / 2))
        P.append(fpanel('dg_gjamb', [(-0.9, 0), (0.9, 0), (0.9, 4.4), (-0.9, 4.4)], Fw(1.8, 4.4, '#ddd6c8'), (s * 2.2, GY, 0), s * PI / 2))
        P.append(cylinder('dg_gmin', 0.55, 4.0, (s * 4.0, GY - 0.4, 9.0), seg=8, mat=wh))
        P.append(onion('dg_gmd', 0.7, 1.4, 13.0, gr, seg=8, loc=(s * 4.0, GY - 0.4), n=4))
        lo.append(lathe('dg_gmin_lo', [(0.8, 9.0), (0.8, 13.1), (0.9, 13.4), (0.0, 15.0)], seg=4, loc=(s * 4.0, GY - 0.4, 0), close_bottom=False))
    P.append(box('dg_gtop', (9.0, 1.8, 0.2), (0, GY, 8.8), wh, base=True))
    leaf_parapet(P, lo, 'dg_gcrest', 0, GY, 9.0, 1.8, 9.0, 1.3, wh, pitch=1.6, sides='f', lo_sides='')
    lo.append(prism_from_outline('dg_gate_lo', [(-4.8, 0)] + [(x * 0.95, z - 0.1) for (x, z) in arch_outline(4.4, 4.4, 2.4, 'pointed', n=3)] + [(4.8, 0), (4.8, 10.4), (-4.8, 10.4)], 2.4, center=(0, GY, 0)))
    bake(A, P, lo, size=320)
    L.shots(A, az=-35, el=14, extra=[{'name': 'front', 'view': {'az': 0, 'el': 6, 'fov': 32, 'pad': 1.05}}])
