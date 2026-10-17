"""NOSTALGIA — tools/blender/characters.py (characters artist) — the people of Hyderabad, 2003, on the
shared kid / adult skeleton (kit.KID_J / kit.ADULT_J, bone names kit.BONES). ARCHITECTURE §21.

    /home/user/.venvs/blender/bin/python tools/blender/build_all.py kid_chinnu clips_kid
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py --list

Look: "a gentle, handmade toy" (story bible §2 for every named look): rounded, slightly chunky forms,
a slightly large head, mitten hands with a thumb, dark toy eyes with a catch-light, visible hems,
baked weave / grime / AO. Helpers: tools/blender/_characters_kit.py.

Assets
  clips_kid, clips_adult   CLIP LIBRARIES: the armature + every clip of one rig, no mesh. Characters
                           carry no clips of their own (meta.clips names their library): the runtime
                           binds the library clips to every model of that rig by bone name, so ~20
                           clips are stored twice instead of fourteen times.
  kid_chinnu               the player (bible look; school-uniform and camera-strap variants)
  kid_immu                 Immu (side parting, taped round specs, checked half-shirt, his cap;
                           yellow raincoat variant)
  kid_generic              colony kids and school children: boys (T-shirt / school shirt + tie,
                           shorts) and girls (frock, plaits or high ponytails); caps, school bags
  uncle_lungi_banian       banian + checked lungi, belly, moustache (shirt-over for 'lungi' peds)
  man_shirt_pants          half-sleeve shirt + trousers: Nanna (camera strap, pens), Abba (beard,
                           lanyard), Faramarz uncle (Irani cap, white moustache, specs), ...
  aunty_saree              saree with border and pallu, blouse, bun with jasmine: Amma, Ammamma
                           (white bun, specs, cloth bag), Vimala Ma'am, the flower aunty...
  woman_salwar             salwar kameez + dupatta (over the head for Ammi), plait
  woman_burqa              black burqa, the face open (Immu's Nani: thick specs)
  man_kurta_skullcap       long kurta + pyjama + skull cap, beard: Patang Chacha (long henna beard,
                           charkhi), Salim-bhai (apron, tray), Agarwal-ji (Gandhi cap)
  police_khaki             khaki uniform, belt, cap, whistle (lathi optional): Havaldar Pochaiah,
                           Professor Pasha (pith helmet), Bahadur (black topi, stick), the caretaker
  student                  a college youth: T-shirt + jeans, puffed hair, bag: Bunty-anna (denim
                           jacket, aviators), Babloo
  old_man_dhoti            thin, stooped, bald with a white fringe, round specs, dhoti + kurta,
                           towel, walking stick: Ticket Thatha (satchel)
  vendor                   lungi folded up, shirt, a towel tied round the head: cart pushers
                           (push_cart clip), Cable Babji (cable coil)

Tint (runtime src/models3d_people.js): every face carries a region (_REGION): the 8 kit.REGIONS
plus accessory SLOTS (index 8..23) whose visibility follows rules on the N.people / N.npcs look
(meta tint.show), and every region names the look fields that colour it (tint.fields: 'shirt',
'@saree:0.7' = a shade of a field, '#hex' = fixed). Tintable cloth is baked in neutral greys (the
look colour divided by the baked grey reproduces any colour without amplifying weave noise).
Named NPCs are routed by meta.npcs, everybody else by look kind (meta.match).
"""
import math
from mathutils import Vector
import kit
import _characters_kit as ck
from _characters_kit import Look, Body, Head, mat, F, ANY, ALL, NOT, LT

KJ = kit.KID_J
AJ = kit.ADULT_J

# neutral bake bases for tintable regions (sRGB)
G_SHIRT = '#c9c7c1'
G_LIGHT = '#dedcd6'
G_PANTS = '#8f8d87'
G_DARK = '#6e6c68'
G_HAIR = '#3b3735'
SKIN_K = '#b07448'
SKIN_A = '#9e6440'

LIB_KID = 'clips_kid'
LIB_ADULT = 'clips_adult'
SLOW = {'idle': 2, 'idle_look': 2, 'talk': 2, 'sit': 3, 'sit_step': 3, 'sit_ground': 3, 'ride_scooty': 3, 'ride_pillion': 3,
        'ride_pillion_side': 3, 'idle_cart': 2, 'kite_fly': 2, 'wave': 2, 'getup': 2, 'pick': 2, 'direct': 2}


def faces(M, kid=True, lips='#7c4434'):
    """skin (+ lips in the skin region so they follow the skin tone), hair, eyes"""
    M['skin'] = mat('skin', 'skin', 1, base=SKIN_K if kid else SKIN_A, var=0.035, grain=0.02, blush=0.07 if kid else 0.045)
    M['lips'] = mat('lips', 'lips', 1, base=lips)
    M['hair'] = mat('hair', 'hair', 2, base=G_HAIR)
    M['eye_white'] = mat('eye_white', 'eye_white')
    M['eye_dark'] = mat('eye_dark', 'eye_dark')
    return M


def head_standard(L):
    L.base.update({'skin': SKIN_K, 'hair': G_HAIR})


def preview_clips(R, rig):
    """the clips the previews pose (walk / run strip, riding): authored here exactly like the
    library builds them, kept in bpy.data only (character GLBs carry no clips)"""
    import vehicles
    kid = rig == 'kid'
    scale = 1.0 if kid else R.leg / 3.1
    for g in ('walk', 'run'):
        kit.gait_clip(R, g, kit.GAITS[g], frames=32, scale=scale)
    if kid:
        kit.ride_clip(R, vehicles.hero_geom(vehicles.SADDLE_DROP['chinnu_cycle']), 'ride_cycle', frames=32, lean=0.95, hip_back=0.16, hip_up=0.24, rock=0.07)
        ck.clip_ride_kainchi(R, vehicles.hero_geom(0.0))
    else:
        kit.ride_clip(R, vehicles.hero_geom(0.0), 'ride_cycle', frames=32, lean=0.8, hip_back=0.2, hip_up=0.3, rock=0.04)


def finish(A, J, rig_name, B, H, L, tex=512, variants=(), face_target=None, ride=None, kainchi=False, hard=()):
    me, arm, R = ck.finish_character(A, J, rig_name, B, H, L, tex=tex, hard=hard)
    ck.std_anchors(A, J, arm, head_sc=H.sc, eye_dz=0.62 if rig_name == 'kid_rig' else 0.66, top_dz=1.42 if rig_name == 'kid_rig' else 1.36)
    A.meta['bones'] = kit.BONES
    A.meta['variants'] = {n: lk for n, lk, _ in variants}
    preview_clips(R, 'kid' if rig_name == 'kid_rig' else 'adult')
    # kit's own previews are undressed (grey cloth): render one tiny shot, then post_previews
    # replaces it with the dressed variants (atexit, after the export)
    A.preview = {'shots': [{'size': 48, 'samples': 1}]}
    ft = face_target or ((0, -0.2, 6.35) if rig_name == 'kid_rig' else (0, -0.2, 8.15))
    ck.post_previews(A, [(n, lk, cx) for n, lk, cx in variants], face={'az': -22, 'el': 6, 'fov': 16, 'target': ft, 'dist': 9.0 if rig_name == 'kid_rig' else 11.0},
                     ride=ride, kainchi=kainchi)
    return me, arm, R


# =========================================================================== clip libraries
def _library(A, J, rig_name, rig, body_glb):
    arm = kit.build_armature(J, rig_name, A.coll)
    A.armature = arm
    R = kit.Rig(arm, J)
    ck.build_clip_library(A, R, rig)
    A.meta['bones'] = kit.BONES
    A.meta['clipNames'] = sorted(A.clips.keys())
    A.nos_optimize = {'resample': SLOW, 'merge': True}
    A.preview = {'shots': [{'size': 48, 'samples': 1}]}
    import os
    import atexit
    glb = os.path.join(kit.ASSETS_DIR, body_glb + '.glb')

    def sheets():
        if not ck.previews_on():
            return
        if not os.path.exists(glb):
            kit.log('clip library previews need %s.glb' % body_glb)
            return
        try:
            man = __import__('json').load(open(os.path.join(kit.ASSETS_DIR, body_glb + '.json')))
            lk = man['meta'].get('look', {})
            v = [('default', lk, {})]
            fr = [('walk', f) for f in range(0, 32, 4)] + [('run', f) for f in range(0, 32, 4)] + [('sprint', f) for f in range(0, 32, 4)]
            if 'walk_f' in A.clips:
                fr += [('walk_f', f) for f in range(0, 32, 4)]
            ck.render_variants(A, glb, v, os.path.join(kit.PREVIEW_DIR, A.id + '_gait.png'), size=150, samples=8, frames=fr, cols=8,
                               view={'az': -90, 'el': 4, 'fov': 30}, spec=man['tint'], default_look=lk)
            one = [('idle', 30), ('idle_look', 50), ('talk', 22), ('wave', 26), ('clap', 7), ('kite_fly', 3), ('pick', 13), ('pick', 30),
                   ('fall', 6), ('fall', 13), ('fall', 40), ('getup', 14), ('getup', 24), ('sit', 0), ('sit_step', 0), ('sit_ground', 0),
                   ('ride_scooty', 0), ('ride_pillion', 0)]
            for c in ('ride_pillion_side', 'direct', 'push_cart', 'idle_cart'):
                if c in A.clips:
                    one.append((c, 8 if c == 'push_cart' else 0))
            ck.render_variants(A, glb, v, os.path.join(kit.PREVIEW_DIR, A.id + '.png'), size=180, samples=10, frames=one, cols=6,
                               view={'az': -38, 'el': 10, 'fov': 32}, spec=man['tint'], default_look=lk)
            if rig == 'kid':
                ck.ride_sheet(A, glb, 'hero_cycle', 'ride_cycle', 0.6)
                ck.ride_sheet(A, glb, 'hero_cycle', 'ride_kainchi', 0.0, out_name='kainchi')
            else:
                ck.ride_sheet(A, glb, 'hero_cycle', 'ride_cycle', 0.0)
        except Exception as e:
            import traceback
            traceback.print_exc()
            kit.log('library previews failed: %s' % e)
    atexit.register(sheets)


@kit.asset(LIB_KID, 'character', role='clips', clipLib='kid_rig', rig='kid_rig')
def clips_kid(A):
    """every clip of the kid skeleton (previews posed on kid_chinnu)"""
    _library(A, KJ, 'kid_rig', 'kid', 'kid_chinnu')


@kit.asset(LIB_ADULT, 'character', role='clips', clipLib='adult_rig', rig='adult_rig')
def clips_adult(A):
    """every clip of the adult skeleton (previews posed on man_shirt_pants)"""
    _library(A, AJ, 'adult_rig', 'adult', 'man_shirt_pants')


# =========================================================================== kids
CHINNU = {'kind': 'kid', 'skin': '#b97a4f', 'hair': '#1a1412', 'shirt': '#3d6fb0', 'pants': '#8a7a55', 'shoulders': '#f4f0e8', 'walkman': True, 'cowlick': True}


@kit.asset('kid_chinnu', 'character', role='player', rig='kid_rig', clips=LIB_KID, height=7.0, people=['player'], kinds=[],
           npcs={'chinnu': {}}, look=CHINNU)
def kid_chinnu(A):
    """Chinnu, 11 (bible §2.1): faded blue cricket T-shirt with white shoulder stripes and collar,
    khaki half-pants, blue-and-white hawai chappals, spiky hair with a cowlick, the yellow walkman on
    a shoelace + foam headphones. Variants: Nanna's camera on its strap (from M1), school uniform
    (white shirt with collar, navy shorts, striped tie, ID card on a ribbon)."""
    J = KJ
    L = Look()
    s_walk = L.slot('walkman', NOT(F('walkman', False)))
    s_cam = L.slot('camera', F('camera'))
    s_school = L.slot('school', ANY(F('tieDot'), F('tie'), F('school')))
    s_tie = L.slot('tie', ANY(F('tieDot'), F('tie'), F('school')), tint=['tie', 'tieDot', '#1d2a5a'])
    L.field('shirt', ['shirt', '#3d6fb0']).field('stripes', ['shoulders', 'stripes', 'shirt']).field('pants', ['pants', '#8a7a55'])
    L.field('shoes', ['chappal', '#2f62b5'])
    L.base.update({'skin': SKIN_K, 'hair': G_HAIR, 'shirt': G_SHIRT, 'stripes': G_LIGHT, 'pants': G_PANTS, 'shoes': '#8a8a8a', 'tie': G_DARK})
    M = faces({}, kid=True)
    M['top'] = mat('cloth', 'tshirt', 3, base=G_SHIRT, var=0.08, weave=0.07)
    M['stripe'] = mat('cloth_stripe', 'stripe', 4, base=G_LIGHT)
    M['collar'] = M['stripe']
    M['cuff'] = M['stripe']
    M['bottom'] = mat('cloth_pants', 'halfpants', 5, base=G_PANTS, weave=0.09)
    M['strap'] = mat('chappal', 'chappal_strap', 6, base='#8a8a8a')
    M['sole'] = mat('chappal_sole', 'chappal_sole', 0)
    M['bed'] = mat('chappal_sole', 'chappal_bed', 0, base='#f4f1ea')
    B = Body(J, M, dict(top='tee', bottom='shorts', sleeve='short', sleeve_stripes=True, hem=0.45, foot='chappal', arm_fat=1.12, leg_fat=1.1))
    B.build()
    # accessories (slots)
    MW = {'walkman': mat('walkman', 'walkman', s_walk), 'black': mat('plastic_black', 'wm_black', s_walk), 'lace': mat('shoelace', 'lace', s_walk),
          'steel': mat('steel', 'hp_band', s_walk, base='#7a7d82'), 'foam': mat('foam_orange', 'hp_foam', s_walk)}
    ck.walkman(B, MW)
    ck.camera_strap(B, mat('plastic_black', 'cam_body', s_cam, base='#1c1c1e'), mat('chrome', 'cam_lens', s_cam, base='#5a6068'), mat('leather_brown', 'cam_strap', s_cam, base='#2a1c14'), cross=True)
    sch_shirt = mat('cloth', 'school_collar', s_school, base='#f2f0ea', weave=0.06)
    _collar_points(B, sch_shirt)
    ck.tie_card(B, mat('cloth', 'tie', s_tie, base=G_DARK), mat('cloth', 'tie_stripe', s_school, base='#c03030'), mat('cloth_stripe', 'idcard', s_school, base='#f4f2ea'),
                mat('cloth', 'id_ribbon', s_school, base='#c03030'))
    H = Head(J, M, dict(shape='kid', age='kid', mouth='grin'))
    H.skull()
    H.face()
    H.hair('spiky', M['hair'])
    variants = [('bible', dict(CHINNU), {}), ('camera', dict(CHINNU, camera=True), {}),
                ('school', dict(CHINNU, shirt='#f4f2ea', pants='#24305a', shoulders=None, tieDot='#24305a'), {})]
    finish(A, J, 'kid_rig', B, H, L, tex=512, variants=variants, ride={'vehicle': 'hero_cycle', 'drop': 0.6}, kainchi=True,
           hard=('walkman', 'camera', 'tie_card', 'sole', 'bed', 'strap'))


def _collar_points(B, m, z_off=0.0):
    """shirt collar points + a placket line (school shirts) on the kid torso"""
    k = B.k
    T = ck.TORSO[B.rig]
    cz = T[10][0][2] + z_off
    for sx in (1, -1):
        o = kit.prism_from_outline('collar_pt', [(-0.13 * k, 0), (0.16 * k, 0.02 * k), (0.03 * k, -0.30 * k)], 0.045 * k, center=(0, 0, 0), mat=m)
        if sx < 0:
            for v in o.data.vertices:
                v.co.x = -v.co.x
            o.data.flip_normals()
        o.rotation_euler = (math.radians(-25), 0, math.radians(-22 * sx))
        o.location = (0.17 * sx * k, -T[10][1][1] * 0.98 - 0.02, cz - 0.03)
        kit.apply_transform(o)
        B.add(o, 'chest')
    # a collar band round the neck
    band = kit.loft('collar_band', [dict(c=(0, T[10][0][1], cz - 0.06), r=(T[10][1][0] + 0.04, T[10][1][1] + 0.04), mat=m),
                                     dict(c=(0, T[10][0][1], cz + 0.1), r=(T[11][1][0] + 0.06, T[11][1][1] + 0.06), mat=m)], seg=12, side=(1, 0, 0), cap_start=False, cap_end=False)
    B.add(band, {'chest': 0.6, 'neck': 0.4})



# =========================================================================== shared pieces (adults + kids)
def feet(M, kind='chappal', strap=G_DARK, region=6):
    """chappal / sandal straps (tinted by the shoes region), the sole + its bed (fixed)"""
    M['strap'] = mat('chappal', 'strap', region, base=strap)
    M['sole'] = mat('chappal_sole', 'sole', 0, base='#3a3430' if kind == 'sandal' else '#ece8de')
    M['bed'] = mat('chappal_sole', 'bed', 0, base='#c8b49a' if kind == 'sandal' else '#efe9dc')
    return M


def moustache_slot(L, chance=0.65):
    """moustaches on most men (2003): a slot shown unless the look has a beard; `_r` (a per-person
    random number the runtime adds) gives variety when the look does not say"""
    return L.slot('moustache', ALL(NOT(F('beard')), NOT(F('noMoustache')), ANY(F('moustache'), LT('_r', chance))), tint=['moustache', 'hair'])


def adult_head(J, M, shape='man', age='adult', mouth='soft', nose=None, brow=None, scale=None):
    o = dict(shape=shape, age=age, mouth=mouth)
    if nose:
        o['nose'] = nose
    if brow:
        o['brow'] = brow
    if scale:
        o['scale'] = scale
    H = Head(J, M, o)
    H.skull()
    H.face()
    return H


def id_card(B, m_card, m_ribbon, name='lanyard'):
    """an office ID card on a ribbon round the neck (no logo)"""
    rig, k = B.rig, B.k
    T = ck.TORSO[rig]
    nz = T[10][0][2]
    cz = T[6][0][2]
    cp = ck.body_point(rig, -0.05 * k, cz, True, 0.06, B.s.get('belly', 0.0))
    card = kit.box('idcard', (0.26 * k, 0.03, 0.36 * k), cp, m_card, bevel=0.015, segments=1)
    kit.apply_modifiers(card)
    rib = kit.tube('ribbon', [cp + Vector((0.07 * k, 0, 0.18 * k)), ck.body_point(rig, 0.22 * k, (cz + nz) / 2, True, 0.03, B.s.get('belly', 0.0)),
                              Vector((0.3 * k, 0.05, nz)), Vector((0.0, 0.3 * k, nz + 0.04)), Vector((-0.3 * k, 0.05, nz)),
                              ck.body_point(rig, -0.3 * k, (cz + nz) / 2, True, 0.03, B.s.get('belly', 0.0)), cp + Vector((-0.07 * k, 0, 0.18 * k))],
                    0.022 * k, seg=4, mat=m_ribbon, cap=False)
    o = kit.join([card, rib], name)
    return B.add(o, lambda co, rig=rig: ck.torso_w(rig, co))


ADULT_HARD = ('basket', 'basket_handle', 'specs', 'camera', 'sole', 'bed', 'strap', 'heel_strap', 'toe_loop', 'buckle', 'lanyard', 'whistle', 'epaulettes', 'policecap', 'pith',
              'iranicap', 'skullcap', 'gandhicap', 'topi', 'cap_backcap', 'satchel', 'charkhi', 'stick', 'lathi', 'apron', 'tray')
RIDE_ADULT = {'vehicle': 'hero_cycle', 'drop': 0.0}
ADULT_FACE = (0, -0.2, 8.15)
FEMALE_FACE = (0, -0.2, 8.0)


# =========================================================================== man_shirt_pants
MAN = {'kind': 'man', 'skin': '#a0683f', 'hair': '#1a1412', 'shirt': '#dfe8f2', 'pants': '#4a4a52'}
NANNA = {'kind': 'man', 'skin': '#9a6040', 'hair': '#1a1412', 'shirt': '#a9c4e0', 'pants': '#5a5f66', 'camera': True, 'oiled': True, 'moustache': True}
FARAMARZ = {'kind': 'man', 'skin': '#d29a6a', 'hair': '#e8e4dc', 'shirt': '#7a2f35', 'pants': '#4a4648', 'hat': 'irani', 'specs': True, 'shoulders': '#f4f2ea', 'moustache': True}
ABBA = {'kind': 'man', 'skin': '#c68b5e', 'hair': '#1a1412', 'shirt': '#dfe8f2', 'pants': '#4a4a52', 'beard': '#1a1412', 'specs': True, 'lanyardDot': '#2a5cb8'}


@kit.asset('man_shirt_pants', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=9.0, people=['man'], kinds=['man'], priority=0,
           npcs={'nanna': {}, 'faramarz': {}, 'abba': {}, 'srikanth': {}, 'imran': {}, 'photo_uncle': {}, 'net_uncle': {}, 'yadagiri': {}},
           look=MAN)
def man_shirt_pants(A):
    """The everyday Hyderabadi man of 2003: half-sleeve shirt tucked into trousers, belt, sandals,
    side parting, a moustache on most. Variants by slot: Nanna (oiled hair, thick moustache, two pens,
    the black film camera on its strap), Abba (trimmed beard, specs, office ID on a ribbon), Faramarz
    uncle (black Irani cap, white hair and moustache, specs), pot bellies, towels, skull caps."""
    J = AJ
    L = Look()
    s_mou = moustache_slot(L)
    s_beard = L.slot('beard', F('beard'), tint=['beard', 'hair'])
    s_specs = L.slot('specs', F('specs'))
    s_belly = L.slot('belly', F('belly'), tint=['shirt'])
    s_cam = L.slot('camera', F('camera'))
    s_pens = L.slot('pens', ANY(F('camera'), F('pens'), F('lanyardDot'), LT('_r', 0.35)))
    s_lan = L.slot('lanyard', F('lanyardDot'), tint=['lanyardDot', '#2a5cb8'])
    s_top = L.slot('hair_top', NOT(ANY(F('hat'), F('cap'))), tint=['hair'])
    s_irani = L.slot('cap_irani', F('hat', 'irani'), tint=['hatColor', '#26221f'])
    s_skull = L.slot('cap_skull', ANY(F('hat', 'skull', 'topi'), F('cap', 'topi')), tint=['hatColor', 'capColor', '#f4f2ea'])
    s_towel = L.slot('towel', F('towel'), tint=['towel'])
    s_bag = L.slot('clothbag', F('prop', 'clothbag', 'satchel'), tint=['bag', '#c8b48a'])
    L.field('shirt', ['shirt']).field('pants', ['pants']).field('shoes', ['shoes', '#4a3424']).field('stripes', ['shirt'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_SHIRT, 'pants': G_PANTS, 'shoes': '#6a5a4a'})
    M = faces({}, kid=False)
    M['top'] = mat('cloth', 'shirt', 3, base=G_SHIRT, var=0.06, weave=0.06)
    M['collar'] = M['top']
    M['cuff'] = mat('cloth', 'shirt_hem', 3, base=G_SHIRT, var=0.04, weave=0.05, grime=0.7)
    M['pocket'] = M['top']
    M['pen'] = mat('plastic_black', 'pen', s_pens, base='#2a3a6a')
    M['bottom'] = mat('cloth_pants', 'trousers', 5, base=G_PANTS, weave=0.07)
    M['belt'] = mat('leather_brown', 'belt', 0, base='#2a1c14')
    feet(M, 'sandal', strap='#6a5a4a')
    B = Body(J, M, dict(top='tee', bottom='pants', sleeve='short', collar='shirt', pocket=True, pens=2, tucked=True, foot='sandal'))
    B.build()
    ck.belt(B, M['belt'], mat('chrome', 'buckle', 0, base='#a8a49a'))
    ck.belly_shell(B, mat('cloth', 'belly', s_belly, base=G_SHIRT, var=0.06, weave=0.06))
    ck.camera_strap(B, mat('plastic_black', 'cam_body', s_cam, base='#1c1c1e'), mat('chrome', 'cam_lens', s_cam, base='#5a6068'), mat('leather_brown', 'cam_strap', s_cam, base='#2a1c14'))
    id_card(B, mat('cloth_stripe', 'idcard', s_lan, base='#f4f2ea'), mat('cloth', 'id_ribbon', s_lan, base=G_LIGHT))
    ck.towel_shoulder(B, mat('cloth', 'towel', s_towel, base=G_LIGHT, weave=0.12))
    ck.crossbody(B, mat('cloth', 'jhola', s_bag, base='#c8b48a', weave=0.12), mat('cloth', 'jhola_strap', s_bag, base='#a8946a'), kind='jhola', side=-1)
    H = adult_head(J, M, 'man', 'adult', 'soft', brow=0.046)
    H.hair('side', M['hair'], top_m=mat('hair', 'hair_top', s_top, base=G_HAIR))
    H.moustache(mat('hair', 'moustache', s_mou, base=G_HAIR), 'thick')
    H.beard(mat('hair', 'beard', s_beard, base=G_HAIR), 'trim')
    ck.specs(H, mat('plastic_black', 'specs', s_specs, base='#2a2624'), 'thin')
    ck.cap(H, mat('cloth', 'irani', s_irani, base='#26221f', weave=0.03), 'irani')
    ck.cap(H, mat('cloth', 'skullcap', s_skull, base='#f2f0ea', weave=0.1), 'skull')
    variants = [('man', dict(MAN), {'_r': 0.2}), ('nanna', dict(NANNA), {'_r': 0.9}), ('abba', dict(ABBA), {'_r': 0.9}),
                ('faramarz', dict(FARAMARZ), {'_r': 0.9}), ('belly', dict(MAN, shirt='#e8dcc8', pants='#6a5a4a', belly=True, hair='#8a8680', towel='#c03030'), {'_r': 0.1})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, ride=RIDE_ADULT, face_target=ADULT_FACE, hard=ADULT_HARD)


# =========================================================================== uncle_lungi_banian
UNCLE = {'kind': 'uncle', 'skin': '#9a6040', 'hair': '#1a1412', 'lungi': '#2a5cb8', 'shirt': '#e8e0d0'}


@kit.asset('uncle_lungi_banian', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=9.0, kinds=['uncle', 'lungi'], priority=0, lazy=True,
           npcs={'ramulu': {}}, look=UNCLE)
def uncle_lungi_banian(A):
    """The colony uncle at home and at the kirana: white banian over a pot belly, a checked lungi
    tied at the waist, hawai chappals, receding hair and a moustache. 'lungi' looks wear a half-sleeve
    shirt over it; a towel on the shoulder."""
    J = AJ
    L = Look()
    s_mou = moustache_slot(L, 0.8)
    s_shirt = L.slot('shirt_over', F('kind', 'lungi'), tint=['shirt'])
    s_towel = L.slot('towel', F('towel'), tint=['towel'])
    s_specs = L.slot('specs', F('specs'))
    s_basket = L.slot('basket', F('prop', 'basket'))
    s_bag = L.slot('clothbag', F('prop', 'clothbag'), tint=['bag', '#c8b48a'])
    L.field('shirt', ['banian', '#efebe0']).field('pants', ['lungi', 'pants']).field('shoes', ['chappal', '#2a2a2a'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_LIGHT, 'pants': G_PANTS, 'shoes': G_DARK})
    M = faces({}, kid=False)
    M['top'] = mat('cloth', 'banian', 3, base=G_LIGHT, var=0.05, weave=0.1, grime=0.6)
    M['collar'] = M['top']
    M['bottom'] = ck.add_checks(mat('cloth_pants', 'lungi', 5, base=G_PANTS, weave=0.08), '#e6e4dc', scale=2.2, width=0.07, strength=0.75)
    feet(M, 'chappal', strap=G_DARK)
    B = Body(J, M, dict(top='banian', bottom='lungi', sleeve='none', belly=1.0, foot='chappal', arm_fat=1.06))
    B.build()
    ck.shirt_over(B, mat('cloth', 'shirt_over', s_shirt, base=G_SHIRT, var=0.06, weave=0.06))
    ck.towel_shoulder(B, mat('cloth', 'towel', s_towel, base=G_LIGHT, weave=0.12))
    ck.basket(B, mat('cloth', 'basket', s_basket, base='#b48a52', weave=0.3, grime=0.6), mat('wood_raw', 'basket_rim', s_basket, base='#8a6232'), side=-1)
    ck.crossbody(B, mat('cloth', 'jhola', s_bag, base='#c8b48a', weave=0.12), mat('cloth', 'jhola_strap', s_bag, base='#a8946a'), kind='jhola', side=1)
    H = adult_head(J, M, 'man', 'adult', 'soft', nose='big', brow=0.05)
    H.hair('receding', M['hair'])
    H.moustache(mat('hair', 'moustache', s_mou, base=G_HAIR), 'walrus')
    ck.specs(H, mat('plastic_black', 'specs', s_specs, base='#2a2624'), 'thick')
    variants = [('uncle', dict(UNCLE), {'_r': 0.3}), ('lungi', dict(UNCLE, kind='lungi', shirt='#6b8f3a', lungi='#3a4a7a', towel='#efe6d0'), {'_r': 0.3}),
                ('white', dict(UNCLE, hair='#d8d4cc', lungi='#efe9dc', towel='#c03030', specs=True), {'_r': 0.3})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=ADULT_FACE, hard=ADULT_HARD)


# =========================================================================== vendor
VENDOR = {'kind': 'man', 'skin': '#8d5a3b', 'hair': '#1a1412', 'shirt': '#c86a2a', 'lungi': '#3a8a3a', 'towel': '#efe6d0'}


@kit.asset('vendor', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=9.0, kinds=['man', 'uncle', 'lungi'], priority=2, lazy=True,
           match=ANY(ALL(F('kind', 'man'), F('lungi')), F('_cart'), F('prop', 'cable')), npcs={'cable_babji': {}},
           look=VENDOR)
def vendor(A):
    """A street vendor / cart pusher: lungi folded up to the knee, a half-sleeve shirt, a towel tied
    round the head against the sun, chappals (push_cart clip). Cable Babji carries a coil of cable."""
    J = AJ
    L = Look()
    s_mou = moustache_slot(L, 0.75)
    s_cloth = L.slot('headcloth', ANY(F('towel'), F('_cart')), tint=['towel', '#efe6d0'])
    s_top = L.slot('hair_top', NOT(ANY(F('towel'), F('_cart'), F('hat'))), tint=['hair'])
    s_cable = L.slot('cable', F('prop', 'cable'))
    s_basket = L.slot('basket', F('prop', 'basket'))
    L.field('shirt', ['shirt']).field('pants', ['lungi', 'pants']).field('shoes', ['chappal', '#2a2a2a'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_SHIRT, 'pants': G_PANTS, 'shoes': G_DARK})
    M = faces({}, kid=False)
    M['top'] = mat('cloth', 'shirt', 3, base=G_SHIRT, var=0.07, weave=0.07, grime=0.7)
    M['collar'] = M['top']
    M['bottom'] = ck.add_checks(mat('cloth_pants', 'lungi', 5, base=G_PANTS, weave=0.08), '#e6e4dc', scale=2.2, width=0.07, strength=0.7)
    feet(M, 'chappal', strap=G_DARK)
    B = Body(J, M, dict(top='tee', bottom='lungi_up', collar='shirt', sleeve='short', foot='chappal', hem_z=J['knee'][2] - 0.1, arm_fat=1.04))
    B.build()
    ck.cable_coil(B, mat('rubber', 'cable', s_cable, base='#1a1a1c'))
    ck.basket(B, mat('cloth', 'basket', s_basket, base='#b48a52', weave=0.3, grime=0.6), mat('wood_raw', 'basket_rim', s_basket, base='#8a6232'), side=-1)
    H = adult_head(J, M, 'man', 'adult', 'smile', brow=0.048)
    H.hair('crop', M['hair'], top_m=mat('hair', 'hair_top', s_top, base=G_HAIR))
    H.moustache(mat('hair', 'moustache', s_mou, base=G_HAIR), 'thick')
    ck.head_cloth(H, mat('cloth', 'headcloth', s_cloth, base=G_LIGHT, weave=0.12))
    variants = [('vendor', dict(VENDOR), {'_r': 0.3}), ('cart', dict(VENDOR, shirt='#e8e0d0', lungi='#7a3a3a', towel='#c03030'), {'_r': 0.9, '_cart': True}),
                ('babji', {'kind': 'lungi', 'skin': '#9a6040', 'hair': '#1a1412', 'shirt': '#6b8f3a', 'lungi': '#3a4a7a', 'prop': 'cable'}, {'_r': 0.3})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=ADULT_FACE, hard=ADULT_HARD + ('cable', 'coil'))


# =========================================================================== aunty_saree
AUNTY = {'kind': 'aunty', 'skin': '#a0683f', 'hair': '#1a1412', 'saree': '#3b7d4f', 'border': '#7a1f2b', 'blouse': '#7a1f2b'}
AMMAMMA = {'kind': 'saree', 'skin': '#8d5a3b', 'hair': '#e8e4dc', 'saree': '#efe6d2', 'border': '#c9a227', 'prop': 'clothbag', 'specs': True}


@kit.asset('aunty_saree', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=8.8, kinds=['aunty', 'saree'], priority=0, lazy=True, female=True,
           npcs={'amma': {}, 'ammamma': {}, 'vimala_maam': {}, 'flower_aunty': {}, 'aunty': {}, 'aunty_2': {}, 'aunty_3': {}}, look=AUNTY)
def aunty_saree(A):
    """The aunty in a cotton saree: the drape with its woven border, pleats at the front, the pallu
    over the left shoulder, a short-sleeved blouse, a bun with a strand of jasmine, bindi, earrings,
    glass bangles. Ammamma: white bun, round specs, a cloth bag."""
    J = AJ
    L = Look()
    s_specs = L.slot('specs', F('specs'))
    s_jas = L.slot('jasmine', ALL(NOT(F('noJasmine')), NOT(F('hair', '#e8e4dc', '#efe9dc', '#d8d4cc'))))
    s_bag = L.slot('clothbag', F('prop', 'clothbag', 'satchel'), tint=['bag', '#c8b48a'])
    s_basket = L.slot('basket', F('prop', 'basket', 'tray'))
    L.field('shirt', ['blouse', '@saree:0.7', '@shirt:0.7']).field('pants', ['saree', 'shirt']).field('accent', ['border', '#f2c230'])
    L.field('shoes', ['chappal', '#5a3a2a']).field('stripes', ['border', '#f2c230'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_SHIRT, 'pants': G_LIGHT, 'accent': G_LIGHT, 'shoes': G_DARK})
    M = faces({}, kid=False, lips='#8a3a34')
    M['top'] = mat('cloth', 'blouse', 3, base=G_SHIRT, var=0.05, weave=0.05)
    M['collar'] = M['top']
    M['cuff'] = mat('cloth', 'blouse_hem', 3, base=G_SHIRT, var=0.04, weave=0.05)
    saree = mat('cloth_pants', 'saree', 5, base=G_LIGHT, weave=0.05, grime=0.4)
    border = ck.add_bands(mat('cloth', 'border', 7, base=G_LIGHT, weave=0.04), '#f4ead0', 0.0, 0.5, n=2, width=0.06, strength=0.5)
    M['bottom'] = saree
    feet(M, 'chappal', strap='#7a5a3a')
    B = Body(J, M, dict(top='blouse', bottom='saree', sleeve='short', female=True, foot='chappal', border_mat=(border, 0.42), hem=0.42))
    B.build()
    ck.pallu(B, saree, border)
    ck.bangles(B, mat('gold_leaf', 'bangle', 0, base='#c9a23a'), n=3)
    ck.crossbody(B, mat('cloth', 'jhola', s_bag, base='#c8b48a', weave=0.12), mat('cloth', 'jhola_strap', s_bag, base='#a8946a'), kind='jhola', side=-1)
    ck.basket(B, mat('cloth', 'basket', s_basket, base='#b48a52', weave=0.3, grime=0.6), mat('wood_raw', 'basket_rim', s_basket, base='#8a6232'), side=-1)
    H = adult_head(J, M, 'woman', 'adult', 'smile', brow=0.032)
    H.hair('bun', M['hair'])
    H.bun(M['hair'], jasmine=mat('cloth_stripe', 'jasmine', s_jas, base='#f8f6ee', grime=0.1))
    ck.bindi(H, mat('lips', 'bindi', 0, base='#b8202a'))
    ck.earrings(H, mat('gold_leaf', 'earring', 0, base='#d4a640'))
    ck.specs(H, mat('plastic_black', 'specs', s_specs, base='#6a5a4a'), 'round')
    variants = [('amma', dict(AUNTY), {}), ('ammamma', dict(AMMAMMA), {}), ('orange', dict(AUNTY, saree='#e07a2e', border='#c9a227', blouse=None, prop='basket'), {}),
                ('teal', dict(AUNTY, kind='saree', saree='#2a8c82', border='#efe9dc', blouse=None), {})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=FEMALE_FACE, hard=ADULT_HARD + ('bangles', 'earrings', 'bindi', 'jasmine'))


# =========================================================================== woman_salwar
WOMAN = {'kind': 'woman', 'skin': '#c68b5e', 'hair': '#1a1412', 'shirt': '#d8c3e8', 'pants': '#d8c3e8', 'dupatta': '#5a3e8a'}


@kit.asset('woman_salwar', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=8.8, kinds=['woman'], priority=0, lazy=True, female=True,
           npcs={'ammi': {}}, look=WOMAN)
def woman_salwar(A):
    """Salwar kameez: a knee-length kameez with side slits over gathered salwar, a dupatta round the
    neck (over the head for Ammi in the old city), a long plait, bindi for some, sandals."""
    J = AJ
    L = Look()
    s_dup = L.slot('dupatta', ALL(F('dupatta'), NOT(F('headCover'))), tint=['dupatta'])
    s_cover = L.slot('headcover', F('headCover'), tint=['headCover', 'dupatta'])
    s_plait = L.slot('plait', NOT(F('headCover')), tint=['hair'])
    s_bindi = L.slot('bindi', ALL(NOT(F('headCover')), LT('_r', 0.5)))
    s_bag = L.slot('clothbag', F('prop', 'clothbag', 'satchel', 'notebook'), tint=['bag', '#c8b48a'])
    L.field('shirt', ['kameez', 'shirt']).field('pants', ['pants', 'salwar']).field('shoes', ['shoes', '#5a3a2a'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_SHIRT, 'pants': G_LIGHT, 'shoes': G_DARK})
    M = faces({}, kid=False, lips='#8a3a34')
    M['top'] = mat('cloth', 'kameez', 3, base=G_SHIRT, var=0.05, weave=0.05)
    M['collar'] = M['top']
    M['cuff'] = mat('cloth', 'kameez_hem', 3, base=G_SHIRT, var=0.04, weave=0.05, grime=0.6)
    M['bottom'] = mat('cloth_pants', 'salwar', 5, base=G_LIGHT, weave=0.05)
    M['hemband'] = mat('cloth_pants', 'salwar_cuff', 5, base=G_LIGHT, weave=0.05, grime=0.7)
    feet(M, 'sandal', strap='#6a4a3a')
    B = Body(J, M, dict(top='tee', bottom='salwar', sleeve='elbow', female=True, tail='kameez', foot='sandal'))
    B.build()
    ck.dupatta(B, mat('cloth', 'dupatta', s_dup, base=G_LIGHT, weave=0.04))
    ck.bangles(B, mat('cloth_stripe', 'bangle', 0, base='#c03a5a'), n=2)
    ck.crossbody(B, mat('cloth', 'jhola', s_bag, base='#c8b48a', weave=0.12), mat('cloth', 'jhola_strap', s_bag, base='#a8946a'), kind='jhola', side=-1)
    H = adult_head(J, M, 'woman', 'adult', 'smile', brow=0.032)
    H.hair('plait', M['hair'])
    H.plait(mat('hair', 'plait', s_plait, base=G_HAIR))
    ck.head_cover(H, mat('cloth', 'headcover', s_cover, base=G_LIGHT, weave=0.04))
    ck.bindi(H, mat('lips', 'bindi', s_bindi, base='#b8202a'))
    ck.earrings(H, mat('gold_leaf', 'earring', 0, base='#d4a640'))
    variants = [('ammi', dict(WOMAN, headCover='#5a3e8a'), {'_r': 0.8}), ('salwar', dict(WOMAN, shirt='#e85a7a', pants='#efe9dc', dupatta='#f2c230'), {'_r': 0.2}),
                ('college', dict(WOMAN, shirt='#2a8c82', pants='#2a3a5a', dupatta='#efe9dc', prop='notebook'), {'_r': 0.7})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=FEMALE_FACE, hard=ADULT_HARD + ('bangles', 'earrings', 'bindi'))


# =========================================================================== woman_burqa
BURQA = {'kind': 'burqa', 'skin': '#b97a4f'}


@kit.asset('woman_burqa', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=8.8, kinds=['burqa'], priority=0, lazy=True, female=True,
           npcs={'nani': {}}, look=BURQA)
def woman_burqa(A):
    """A black burqa with the face open: the head covering snug round the face and flowing onto the
    shoulders, long sleeves, the hem at the ankles, sandals peeping out. Immu's Nani wears thick specs."""
    J = AJ
    L = Look()
    s_specs = L.slot('specs', F('specs'))
    s_bag = L.slot('clothbag', F('prop', 'clothbag', 'satchel', 'trunk'), tint=['bag', '#3a3430'])
    L.field('shirt', ['burqa', '#18161a']).field('shoes', ['shoes', '#3a2a22'])
    L.base.update({'skin': SKIN_A, 'shirt': '#2a282c', 'shoes': G_DARK})
    M = faces({}, kid=False, lips='#8a3a34')
    M['top'] = mat('cloth', 'burqa', 3, base='#2a282c', var=0.05, weave=0.04, grime=0.35, dirt='#6a6058')
    M['collar'] = M['top']
    M['cuff'] = M['top']
    M['sleeve'] = M['top']
    M['bottom'] = M['top']
    feet(M, 'sandal', strap='#4a3a32')
    B = Body(J, M, dict(top='burqa', bottom='none', sleeve='long', female=True, tail='burqa', foot='sandal', hem_z=0.28))
    B.build()
    ck.crossbody(B, mat('cloth', 'jhola', s_bag, base='#3a3430', weave=0.1), mat('cloth', 'jhola_strap', s_bag, base='#2a2624'), kind='jhola', side=-1)
    H = adult_head(J, M, 'woman', 'adult', 'soft', brow=0.034)
    ck.burqa_hood(H, M['top'])
    ck.specs(H, mat('plastic_black', 'specs', s_specs, base='#1c1a1a'), 'thick')
    variants = [('burqa', dict(BURQA), {}), ('nani', dict(BURQA, skin='#9a6040', specs=True, prop='trunk'), {})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=FEMALE_FACE, hard=ADULT_HARD)


# =========================================================================== man_kurta_skullcap
KURTA = {'kind': 'man', 'skin': '#a0683f', 'hair': '#1a1412', 'shirt': '#f4f2ea', 'pants': '#f4f2ea', 'hat': 'skull', 'beard': '#2a201a'}
CHACHA = {'kind': 'man', 'skin': '#a0683f', 'hair': '#e8e4dc', 'shirt': '#f4f2ea', 'pants': '#f4f2ea', 'hat': 'skull', 'beard': '#c8642a', 'longBeard': True, 'prop': 'charkhi'}
SALIM = {'kind': 'man', 'skin': '#a0683f', 'hair': '#1a1412', 'shirt': '#f4f2ea', 'pants': '#4a4a4a', 'hat': 'skull', 'apron': '#2a8c82', 'prop': 'tray'}
AGARWAL = {'kind': 'man', 'skin': '#c68b5e', 'hair': '#7a7570', 'shirt': '#efe6d0', 'pants': '#efe6d0', 'hat': 'gandhi', 'specs': True, 'belly': True}


@kit.asset('man_kurta_skullcap', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=9.0, kinds=['man'], priority=3, lazy=True,
           match=ANY(F('hat', 'skull', 'gandhi', 'topi'), F('cap', 'topi'), F('longBeard')),
           npcs={'kite_chacha': {}, 'salim': {}, 'agarwal': {}}, look=KURTA)
def man_kurta_skullcap(A):
    """The old city man in a long kurta and pyjama with a crocheted skull cap and a beard (henna-orange
    on elders): Patang Chacha (long henna beard, the charkhi of kite string), Salim-bhai of the Irani
    cafe (apron, a tray of chai), Agarwal-ji (Gandhi cap, specs, a belly under the kurta)."""
    J = AJ
    L = Look()
    s_mou = moustache_slot(L, 0.5)
    s_trim = L.slot('beard', ALL(F('beard'), NOT(F('longBeard'))), tint=['beard', 'hair'])
    s_long = L.slot('beard_long', ALL(F('beard'), F('longBeard')), tint=['beard', 'hair'])
    s_skull = L.slot('cap_skull', ANY(F('hat', 'skull', 'topi'), F('cap', 'topi')), tint=['hatColor', 'capColor', '#f4f2ea'])
    s_gandhi = L.slot('cap_gandhi', F('hat', 'gandhi'), tint=['hatColor', '#f4f2ea'])
    s_specs = L.slot('specs', F('specs'))
    s_belly = L.slot('belly', F('belly'), tint=['shirt'])
    s_apron = L.slot('apron', F('apron'), tint=['apron'])
    s_charkhi = L.slot('charkhi', F('prop', 'charkhi'))
    s_tray = L.slot('tray', F('prop', 'tray'))
    L.field('shirt', ['kurta', 'shirt']).field('pants', ['pants']).field('shoes', ['shoes', '#4a3424'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_LIGHT, 'pants': G_LIGHT, 'shoes': '#6a5a4a'})
    M = faces({}, kid=False)
    M['top'] = mat('cloth', 'kurta', 3, base=G_LIGHT, var=0.04, weave=0.05, grime=0.45)
    M['collar'] = M['top']
    M['cuff'] = mat('cloth', 'kurta_cuff', 3, base=G_LIGHT, var=0.04, weave=0.05, grime=0.7)
    M['sleeve'] = M['top']
    M['bottom'] = mat('cloth_pants', 'pyjama', 5, base=G_LIGHT, weave=0.05, grime=0.6)
    M['hemband'] = M['bottom']
    feet(M, 'sandal', strap='#6a5a4a')
    B = Body(J, M, dict(top='tee', bottom='pyjama', sleeve='long', tail='kurta', foot='sandal'))
    B.build()
    ck.belly_shell(B, mat('cloth', 'belly', s_belly, base=G_LIGHT, var=0.04, weave=0.05), from_level=3)
    ck.apron(B, mat('cloth', 'apron', s_apron, base=G_SHIRT, weave=0.08))
    ck.charkhi(B, mat('wood_raw', 'charkhi_wood', s_charkhi, base='#9a6a3a'), mat('cloth_stripe', 'manja', s_charkhi, base='#d8402a', weave=0.2), side=1)
    ck.tray(B, mat('steel', 'tray', s_tray, base='#a8aaae'), mat('lips', 'chai_glass', s_tray, base='#b07a4a'), side=-1)
    H = adult_head(J, M, 'man', 'adult', 'soft', nose='big', brow=0.05)
    H.hair('crop', M['hair'])
    H.moustache(mat('hair', 'moustache', s_mou, base=G_HAIR), 'thin')
    H.beard(mat('hair', 'beard', s_trim, base=G_HAIR), 'trim')
    H.beard(mat('hair', 'beard_long', s_long, base=G_HAIR), 'long', name='beard_long')
    ck.cap(H, mat('cloth', 'skullcap', s_skull, base='#f2f0ea', weave=0.12), 'skull')
    ck.cap(H, mat('cloth', 'gandhicap', s_gandhi, base='#f4f2ea', weave=0.06), 'gandhi')
    ck.specs(H, mat('plastic_black', 'specs', s_specs, base='#4a3a2a'), 'round')
    variants = [('elder', dict(KURTA), {'_r': 0.3}), ('chacha', dict(CHACHA), {}), ('salim', dict(SALIM), {'_r': 0.2}), ('agarwal', dict(AGARWAL), {'_r': 0.7})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=ADULT_FACE, hard=ADULT_HARD + ('glass', 'reel', 'disc', 'handle'))


# =========================================================================== police_khaki
POLICE = {'kind': 'man', 'skin': '#7a4a30', 'hair': '#1a1412', 'shirt': '#f4f2ea', 'pants': '#a89060', 'cap': 'police'}
PASHA = {'kind': 'man', 'skin': '#b97a4f', 'hair': '#1a1412', 'shirt': '#c9b27a', 'pants': '#c9b27a', 'hat': 'pith', 'hatColor': '#e8dcc0', 'belly': True}
BAHADUR = {'kind': 'man', 'skin': '#d29a6a', 'hair': '#1a1412', 'shirt': '#8a7a4a', 'pants': '#4a4a3a', 'hat': 'dhaka', 'hatColor': '#1d1a1e', 'prop': 'stick'}


@kit.asset('police_khaki', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=9.1, kinds=['man', 'police'], priority=5, lazy=True,
           match=ANY(F('cap', 'police'), F('kind', 'police'), F('hat', 'pith', 'dhaka')),
           npcs={'pochaiah': {}, 'pasha': {}, 'bahadur': {}, 'caretaker': {}}, look=POLICE)
def police_khaki(A):
    """A Hyderabad constable of 2003: shirt with epaulettes tucked into khaki trousers (traffic men in
    white shirts), a brown belt with a brass buckle, the peaked cap with its red band, a whistle on a
    cord, black shoes, a moustache (lathi optional). Professor Pasha (pith helmet, belly), Bahadur the
    watchman (black topi, stick)."""
    J = AJ
    L = Look()
    s_mou = moustache_slot(L, 0.85)
    s_cap = L.slot('cap_police', ANY(F('cap', 'police'), F('kind', 'police')))
    s_pith = L.slot('cap_pith', F('hat', 'pith'), tint=['hatColor', '#e8dcc0'])
    s_topi = L.slot('cap_topi', F('hat', 'dhaka'), tint=['hatColor', '#1d1a1e'])
    s_top = L.slot('hair_top', NOT(ANY(F('hat'), F('cap'), F('kind', 'police'))), tint=['hair'])
    s_belly = L.slot('belly', F('belly'), tint=['shirt'])
    s_lathi = L.slot('lathi', ANY(F('prop', 'stick', 'lathi', 'antenna'), F('lathi')))
    s_uni = L.slot('uniform', ANY(F('cap', 'police'), F('kind', 'police')))
    L.field('shirt', ['shirt', '#b8a070']).field('pants', ['pants', '#9a8656']).field('shoes', ['shoes', '#1c1a1a'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_SHIRT, 'pants': G_PANTS, 'shoes': '#2a2828'})
    M = faces({}, kid=False)
    M['top'] = mat('cloth', 'uniform', 3, base=G_SHIRT, var=0.05, weave=0.05)
    M['collar'] = M['top']
    M['cuff'] = mat('cloth', 'uniform_hem', 3, base=G_SHIRT, var=0.04, weave=0.05, grime=0.6)
    M['pocket'] = M['top']
    M['bottom'] = mat('cloth_pants', 'uniform_pants', 5, base=G_PANTS, weave=0.06)
    M['belt'] = mat('leather_brown', 'belt', 0, base='#4a2c1c')
    M['shoe'] = mat('leather_brown', 'shoe', 6, base='#2a2828', rough=0.35)
    M['sole'] = mat('rubber', 'shoe_sole', 0)
    B = Body(J, M, dict(top='tee', bottom='pants', sleeve='short', collar='shirt', pocket=True, tucked=True, foot='shoes'))
    B.build()
    ck.belt(B, M['belt'], mat('gold_leaf', 'buckle', 0, base='#b8963a'))
    ck.belly_shell(B, mat('cloth', 'belly', s_belly, base=G_SHIRT, var=0.05, weave=0.05))
    ck.epaulettes(B, mat('cloth', 'epaulette', s_uni, base='#6a5a3a'))
    ck.lanyard_whistle(B, mat('cloth', 'whistle_cord', s_uni, base='#c03030'), mat('chrome', 'whistle', s_uni), side=1)
    ck.stick(B, mat('wood_raw', 'lathi', s_lathi, base='#8a5a2a'), side=-1, length=AJ['wrist'][2] * 0.95, name='lathi')
    H = adult_head(J, M, 'man', 'adult', 'straight', brow=0.05)
    H.hair('crop', M['hair'], top_m=mat('hair', 'hair_top', s_top, base=G_HAIR))
    H.moustache(mat('hair', 'moustache', s_mou, base=G_HAIR), 'thick')
    ck.cap(H, mat('cloth', 'policecap', s_cap, base='#8a7448', weave=0.04), 'police', brim=mat('plastic_black', 'visor', s_cap, base='#1a1818'))
    band = mat('cloth', 'capband', s_cap, base='#a8282a')
    hb = kit.lathe('capband', [(0.615, 0.12), (0.625, 0.2)], seg=ck.SEG['cap'], mat=band, close_bottom=False, close_top=False)
    hb.scale = (1.0, 1.08, 1.0)
    hb.location = (0, H.cy + 0.05, H.hz + 0.86)
    kit.apply_transform(hb)
    H.add(hb)
    ck.cap(H, mat('cloth', 'pith', s_pith, base='#e8dcc0', weave=0.03), 'pith')
    ck.cap(H, mat('cloth', 'topi', s_topi, base='#1d1a1e', weave=0.05), 'dhaka')
    variants = [('traffic', dict(POLICE), {'_r': 0.3}), ('khaki', dict(POLICE, shirt='#b8a070', pants='#9a8656', belly=True, prop='lathi'), {'_r': 0.3}),
                ('pasha', dict(PASHA), {'_r': 0.9}), ('bahadur', dict(BAHADUR), {'_r': 0.3})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=ADULT_FACE, hard=ADULT_HARD + ('capband', 'visor'))


# =========================================================================== student (college youth)
YOUTH = {'kind': 'man', 'skin': '#b97a4f', 'hair': '#1a1412', 'shirt': '#d24d57', 'pants': '#3a4a6a', 'puff': True}
BUNTY = {'kind': 'man', 'skin': '#b97a4f', 'hair': '#1a1412', 'shirt': '#f4f2ea', 'jacket': '#4a6fa5', 'pants': '#2a3a5a', 'puff': True, 'specs': '#2a2a36'}


@kit.asset('student', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=8.9, kinds=['man'], priority=1, lazy=True,
           match=ANY(F('puff'), F('hat', 'backcap'), F('jacket')), npcs={'bunty': {'jacket': '#4a6fa5', 'shirt': '#f4f2ea'}, 'babloo': {}}, look=YOUTH)
def student(A):
    """A college youth of 2003: a loud T-shirt or printed shirt, jeans, sneakers, big puffed hair.
    Bunty-anna: denim jacket over a white T-shirt, aviator glasses. Back-to-front caps, a bag."""
    J = AJ
    L = Look()
    s_mou = moustache_slot(L, 0.3)
    s_top = L.slot('hair_top', NOT(ANY(F('hat'), F('cap'))), tint=['hair'])
    s_back = L.slot('cap_back', F('hat', 'backcap'), tint=['hatColor', '#c03030'])
    s_av = L.slot('aviators', F('specs'))
    s_jacket = L.slot('jacket', F('jacket'), tint=['jacket', '#4a6fa5'])
    s_bag = L.slot('bag', ANY(F('bag'), F('prop', 'notebook')), tint=['bag', '#2a2a2e'])
    L.field('shirt', ['shirt']).field('pants', ['pants', '#3a4a6a']).field('shoes', ['shoes', '#e8e6e0'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_SHIRT, 'pants': G_PANTS, 'shoes': G_LIGHT})
    M = faces({}, kid=False)
    M['top'] = mat('cloth', 'tshirt', 3, base=G_SHIRT, var=0.06, weave=0.06)
    M['collar'] = M['top']
    M['cuff'] = mat('cloth', 'tshirt_hem', 3, base=G_SHIRT, var=0.04, weave=0.05, grime=0.6)
    M['bottom'] = mat('cloth_pants', 'jeans', 5, base=G_PANTS, weave=0.12, grime=0.6)
    M['hemband'] = mat('cloth_pants', 'jeans_hem', 5, base=G_PANTS, weave=0.12, grime=0.8)
    M['shoe'] = mat('cloth', 'sneaker', 6, base=G_LIGHT, weave=0.08, grime=0.7)
    M['sole'] = mat('rubber', 'shoe_sole', 0, base='#d8d4ca')
    B = Body(J, M, dict(top='tee', bottom='jeans', sleeve='short', foot='shoes', arm_fat=0.95, leg_fat=0.95))
    B.build()
    ck.jacket(B, mat('cloth', 'jacket', s_jacket, base=G_SHIRT, weave=0.16, grime=0.5))
    ck.backpack(B, mat('cloth', 'bag', s_bag, base=G_DARK, weave=0.1), mat('cloth', 'bag_strap', s_bag, base=G_DARK))
    H = adult_head(J, M, 'man', 'adult', 'grin', brow=0.044, scale=1.1)
    H.hair('puff', M['hair'], top_m=mat('hair', 'hair_top', s_top, base=G_HAIR))
    H.moustache(mat('hair', 'moustache', s_mou, base=G_HAIR), 'thin')
    ck.specs(H, mat('plastic_black', 'aviators', s_av, base='#b8b0a0'), 'aviator', lens=mat('plastic_black', 'aviator_lens', s_av, base='#1c1e24', rough=0.15))
    ck.cap(H, mat('cloth', 'backcap', s_back, base=G_SHIRT, weave=0.06), 'backcap')
    variants = [('youth', dict(YOUTH), {'_r': 0.6}), ('bunty', dict(BUNTY), {'_r': 0.9}), ('cap', dict(YOUTH, shirt='#2a8c82', puff=False, hat='backcap', hatColor='#f2f0ea'), {'_r': 0.1}),
                ('babloo', {'kind': 'man', 'size': 0.92, 'skin': '#b97a4f', 'hair': '#1a1412', 'shirt': '#d24d57', 'pants': '#2a3a5a', 'puff': True, 'bag': '#2a2a2e'}, {'_r': 0.9})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=ADULT_FACE, hard=ADULT_HARD + ('aviators', 'backpack'))


# =========================================================================== old_man_dhoti
OLDMAN = {'kind': 'man', 'skin': '#8d5a3b', 'hair': '#e8e4dc', 'shirt': '#f4f2ea', 'pants': '#efe9dc', 'specs': 'round', 'prop': 'stick'}
THATHA = {'kind': 'man', 'skin': '#8d5a3b', 'hair': '#e8e4dc', 'shirt': '#b8a67a', 'pants': '#efe9dc', 'prop': 'satchel', 'specs': 'round'}


@kit.asset('old_man_dhoti', 'character', role='people', rig='adult_rig', clips=LIB_ADULT, height=8.7, kinds=['man'], priority=4, lazy=True,
           match=ALL(F('hair', '#e8e4dc', '#efe9dc', '#d8d4cc', '#b8b4ae'), NOT(F('hat', 'skull', 'irani', 'pith', 'backcap', 'dhaka')), NOT(F('cap', 'police'))),
           npcs={'ticket_thatha': {}}, posture={'spine': 0.14, 'chest': 0.06, 'neck': -0.12}, look=OLDMAN)
def old_man_dhoti(A):
    """A thin, slightly stooped old man: bald with a white fringe, round specs, a half-sleeve kurta over
    a white dhoti, a towel on the shoulder, chappals and a walking stick. Ticket Thatha: the retired
    conductor's leather satchel."""
    J = AJ
    L = Look()
    s_mou = moustache_slot(L, 0.6)
    s_specs = L.slot('specs', F('specs'))
    s_gandhi = L.slot('cap_gandhi', F('hat', 'gandhi', 'topi'), tint=['hatColor', '#f4f2ea'])
    s_towel = L.slot('towel', ANY(F('towel'), LT('_r', 0.5)), tint=['towel', '#efe6d0'])
    s_stick = L.slot('stick', F('prop', 'stick'))
    s_sat = L.slot('satchel', F('prop', 'satchel'))
    L.field('shirt', ['shirt', '#f4f2ea']).field('pants', ['dhoti', 'pants', '#efe9dc']).field('accent', ['border', '#8a6a3a']).field('shoes', ['chappal', '#5a3a2a'])
    L.base.update({'skin': SKIN_A, 'hair': G_HAIR, 'shirt': G_LIGHT, 'pants': G_LIGHT, 'accent': G_DARK, 'shoes': G_DARK})
    M = faces({}, kid=False)
    M['top'] = mat('cloth', 'kurta', 3, base=G_LIGHT, var=0.05, weave=0.06, grime=0.6)
    M['collar'] = M['top']
    M['cuff'] = mat('cloth', 'kurta_hem', 3, base=G_LIGHT, var=0.04, weave=0.05, grime=0.75)
    dhoti = mat('cloth_pants', 'dhoti', 5, base=G_LIGHT, weave=0.06, grime=0.7)
    M['bottom'] = dhoti
    border = mat('cloth', 'dhoti_border', 7, base=G_DARK, weave=0.05)
    feet(M, 'chappal', strap=G_DARK)
    B = Body(J, M, dict(top='tee', bottom='dhoti', sleeve='short', tail='kurta', foot='chappal', arm_fat=0.86, leg_fat=0.85, border_mat=(border, 0.16)))
    B.build()
    ck.towel_shoulder(B, mat('cloth', 'towel', s_towel, base=G_LIGHT, weave=0.12))
    ck.stick(B, mat('wood_raw', 'stick', s_stick, base='#6a4a2a'), side=-1, top='crook')
    ck.crossbody(B, mat('leather_brown', 'satchel', s_sat, base='#5a3a22'), mat('leather_brown', 'satchel_strap', s_sat, base='#4a2c1c'), kind='satchel', side=1)
    H = adult_head(J, M, 'man', 'old', 'soft', nose='big', brow=0.04, scale=1.1)
    H.hair('bald', M['hair'])
    H.moustache(mat('hair', 'moustache', s_mou, base=G_HAIR), 'thin')
    ck.specs(H, mat('plastic_black', 'specs', s_specs, base='#5a4a3a'), 'round')
    ck.cap(H, mat('cloth', 'gandhicap', s_gandhi, base='#f4f2ea', weave=0.06), 'gandhi')
    variants = [('old', dict(OLDMAN), {'_r': 0.2}), ('thatha', dict(THATHA), {'_r': 0.8}), ('gandhi', dict(OLDMAN, hat='gandhi', prop=None, specs=None, towel='#c03030'), {'_r': 0.8})]
    finish(A, J, 'adult_rig', B, H, L, tex=256, variants=variants, face_target=ADULT_FACE, hard=ADULT_HARD + ('crook',))


# =========================================================================== kid_generic
KID = {'kind': 'kid', 'skin': '#a0683f', 'hair': '#1a1412', 'shirt': '#d8402a', 'pants': '#2a3a6a', 'stripes': '#f2c230'}


@kit.asset('kid_generic', 'character', role='people', rig='kid_rig', clips=LIB_KID, height=6.9, kinds=['kid', 'student'], priority=0, lazy=True,
           npcs={'chitti': {}, 'ayesha': {}, 'tiger': {}}, look=KID)
def kid_generic(A):
    """Colony kids and school children: boys in T-shirts (stripes) and half-pants, girls in frocks with
    plaits or high ponytails with ribbons; school uniforms (white shirt, collar, striped tie, navy
    shorts / skirt, black shoes and white socks, a school bag); cricket caps and back-to-front caps."""
    J = KJ
    L = Look()
    girl = F('girl')
    school = F('kind', 'student')
    s_frock = L.slot('frock', girl, tint=['pants', 'shirt'])
    s_ghair = L.slot('hair_girl', girl, tint=['hair'])
    s_plaits = L.slot('plaits', ALL(girl, NOT(F('ponytails')), NOT(F('hat')), NOT(F('cap'))), tint=['hair'])
    s_ribbon = L.slot('ribbon', ALL(girl, NOT(F('ponytails')), NOT(F('hat')), NOT(F('cap'))), tint=['plaits', '#d8202a'])
    s_pony = L.slot('ponytails', ALL(girl, F('ponytails')), tint=['hair'])
    s_band = L.slot('pony_band', ALL(girl, F('ponytails')), tint=['ponytails', '#d8202a'])
    s_boy = L.slot('hair_top', ALL(NOT(girl), NOT(F('hat')), NOT(F('cap'))), tint=['hair'])
    s_collar = L.slot('collar', school, tint=['shirt'])
    s_tie = L.slot('tie', ALL(school, NOT(girl)), tint=['tie', 'tieDot', '#b22b2b'])
    s_shoes = L.slot('school_shoes', school)
    s_strap = L.slot('chappal', NOT(school), tint=['chappal', '#2f62b5'])
    s_bag = L.slot('bag', ANY(school, F('bag')), tint=['bag', '#2a5cb8'])
    s_cric = L.slot('cap_cricket', ANY(F('cap', 'cricket'), F('hat', 'backcap', 'cricket')), tint=['capColor', 'hatColor', '#2a5cb8'])
    L.field('shirt', ['shirt']).field('stripes', ['stripes', 'shoulders', 'shirt']).field('pants', ['pants'])
    L.base.update({'skin': SKIN_K, 'hair': G_HAIR, 'shirt': G_SHIRT, 'stripes': G_LIGHT, 'pants': G_PANTS})
    M = faces({}, kid=True)
    M['top'] = mat('cloth', 'tshirt', 3, base=G_SHIRT, var=0.08, weave=0.07)
    M['stripe'] = mat('cloth_stripe', 'stripe', 4, base=G_LIGHT)
    M['collar'] = M['top']
    M['cuff'] = M['stripe']
    M['bottom'] = mat('cloth_pants', 'halfpants', 5, base=G_PANTS, weave=0.09)
    feet(M, 'chappal', strap='#8a8a8a', region=s_strap)
    B = Body(J, M, dict(top='tee', bottom='shorts', sleeve='short', sleeve_stripes=True, hem=0.42, foot='chappal', arm_fat=1.12, leg_fat=1.1))
    B.build()
    B.skirt('frock', m=mat('cloth', 'frock', s_frock, base=G_SHIRT, var=0.06, weave=0.06), hem_z=J['knee'][2] + 0.05, flare=1.55, rings_n=4)
    _collar_points(B, mat('cloth', 'school_collar', s_collar, base=G_SHIRT, weave=0.06))
    ck.tie_card(B, mat('cloth', 'tie', s_tie, base=G_DARK), mat('cloth', 'tie_stripe', s_tie, base='#e8e4d8'), mat('cloth_stripe', 'idcard', s_tie, base='#f4f2ea'),
                mat('cloth', 'id_ribbon', s_tie, base=G_DARK))
    ck.school_shoes(B, mat('leather_brown', 'school_shoe', s_shoes, base='#1c1a1a', rough=0.35), mat('cloth_stripe', 'sock', s_shoes, base='#f2f0ea'))
    ck.backpack(B, mat('cloth', 'bag', s_bag, base=G_SHIRT, weave=0.1), mat('cloth', 'bag_strap', s_bag, base=G_DARK))
    H = Head(J, M, dict(shape='kid', age='kid', mouth='smile'))
    H.skull()
    H.face()
    H.hair('crop', M['hair'], top_m=mat('hair', 'hair_top', s_boy, base=G_HAIR))
    gh = mat('hair', 'hair_girl', s_ghair, base=G_HAIR)
    H.hair('plaits', gh, skin_m=mat('skin', 'parting', s_ghair, base=SKIN_K))
    for sx in (1, -1):
        H.plait(mat('hair', 'plait', s_plaits, base=G_HAIR), ribbon=mat('cloth', 'ribbon', s_ribbon, base=G_LIGHT), side=0.36 * sx, length=1.25, name='plait')
    ck.ponytails(H, mat('hair', 'pony', s_pony, base=G_HAIR), band=mat('cloth', 'band', s_band, base=G_LIGHT))
    ck.cap(H, mat('cloth', 'cricketcap', s_cric, base=G_SHIRT, weave=0.05), 'cricket', seg=10)
    variants = [('boy', dict(KID), {}), ('girl', {'kind': 'kid', 'girl': True, 'skin': '#b97a4f', 'hair': '#1a1412', 'shirt': '#e88aa8', 'pants': '#e88aa8', 'ponytails': '#d8202a'}, {}),
                ('school', {'kind': 'student', 'skin': '#8d5a3b', 'hair': '#1a1412', 'shirt': '#f2f0ea', 'pants': '#2a3a6a', 'tie': '#b22b2b', 'bag': '#2a5cb8'}, {}),
                ('schoolgirl', {'kind': 'student', 'girl': True, 'skin': '#c68b5e', 'hair': '#1a1412', 'shirt': '#f2f0ea', 'pants': '#2a3a6a', 'plaits': '#d8202a', 'bag': '#b22b2b'}, {}),
                ('cap', dict(KID, shirt='#3a8a3a', stripes=None, cap='cricket', capColor='#f2c230'), {})]
    finish(A, J, 'kid_rig', B, H, L, tex=256, variants=variants, hard=('sole', 'bed', 'strap', 'tie_card', 'backpack', 'cap_cricket', 'cap_backcap', 'band'))


# =========================================================================== kid_immu
IMMU = {'kind': 'kid', 'skin': '#c68b5e', 'hair': '#1a1412', 'shirt': '#2f8a5a', 'stripes': '#1f6a42', 'pants': '#2c3550', 'specs': True, 'prop': 'notebook'}


@kit.asset('kid_immu', 'character', role='people', rig='kid_rig', clips=LIB_KID, height=7.0, kinds=[], priority=0, lazy=True,
           npcs={'immu': {'cap': 'cricket', 'capColor': '#2a8c82'}}, look=IMMU)
def kid_immu(A):
    """Immu, 11 (bible §2.3): a neat side parting, round specs taped at the bridge, a green checked
    half-shirt, navy shorts, the 'CID' notebook in the shirt pocket, chappals, and his teal cricket cap.
    Chand Raat: the yellow raincoat with its hood ('agents wear disguises')."""
    J = KJ
    L = Look()
    coat = F('hat', 'hood')
    s_cap = L.slot('cap_cricket', ALL(ANY(F('cap', 'cricket'), F('hat', 'cricket')), NOT(coat)), tint=['capColor', 'hatColor', '#2a8c82'])
    s_top = L.slot('hair_top', ALL(NOT(F('cap')), NOT(coat)), tint=['hair'])
    s_coat = L.slot('raincoat', coat, tint=['hatColor', 'shirt', '#f2c230'])
    s_book = L.slot('notebook', ALL(F('prop', 'notebook'), NOT(coat)))
    L.field('shirt', ['shirt']).field('stripes', ['stripes', 'shirt']).field('pants', ['pants']).field('shoes', ['chappal', '#3a3a3a'])
    L.base.update({'skin': SKIN_K, 'hair': G_HAIR, 'shirt': G_SHIRT, 'stripes': G_DARK, 'pants': G_PANTS, 'shoes': G_DARK})
    M = faces({}, kid=True)
    M['top'] = ck.add_checks(mat('cloth', 'checkshirt', 3, base=G_SHIRT, var=0.05, weave=0.06), '#3a3836', scale=3.2, width=0.08, strength=0.55)
    M['stripe'] = mat('cloth', 'shirt_band', 4, base=G_DARK)
    M['collar'] = M['top']
    M['cuff'] = M['stripe']
    M['bottom'] = mat('cloth_pants', 'halfpants', 5, base=G_PANTS, weave=0.09)
    feet(M, 'chappal', strap=G_DARK)
    B = Body(J, M, dict(top='tee', bottom='shorts', sleeve='short', sleeve_stripes=False, hem=0.44, foot='chappal', pocket=True, arm_fat=1.1, leg_fat=1.08))
    B.build()
    _collar_points(B, M['top'])
    ck.notebook_pocket(B, mat('cloth', 'cid_notebook', s_book, base='#c8a050'), side=1)
    ck.raincoat(B, mat('cloth', 'raincoat', s_coat, base='#d8d4c8', rough=0.35, weave=0.02))
    H = Head(J, M, dict(shape='kid', age='kid', mouth='smile'))
    H.skull()
    H.face()
    H.hair('side', M['hair'], top_m=mat('hair', 'hair_top', s_top, base=G_HAIR))
    ck.specs(H, mat('plastic_black', 'specs', 0, base='#3a3430'), 'round', tape=mat('cloth_stripe', 'tape', 0, base='#f2efe6'))
    ck.cap(H, mat('cloth', 'cricketcap', s_cap, base=G_SHIRT, weave=0.05), 'cricket')
    ck.hood(H, mat('cloth', 'hood', s_coat, base='#d8d4c8', rough=0.35, weave=0.02))
    variants = [('immu', dict(IMMU, cap='cricket', capColor='#2a8c82'), {}), ('nocap', dict(IMMU), {}),
                ('raincoat', dict(IMMU, shirt='#f2c230', stripes=None, hat='hood', hatColor='#f2c230', pants='#f4f0e8'), {})]
    finish(A, J, 'kid_rig', B, H, L, tex=256, variants=variants, hard=('sole', 'bed', 'strap', 'specs', 'cap_cricket', 'notebook'))
