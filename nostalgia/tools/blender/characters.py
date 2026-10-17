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
from _characters_kit import Look, Body, Head, mat, F, ANY, ALL, NOT

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
        'ride_pillion_side': 3, 'idle_cart': 2, 'kite_fly': 2}


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
    A.nos_optimize = {'resample': SLOW}
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


@kit.asset('kid_chinnu', 'character', role='player', rig='kid_rig', clips=LIB_KID, height=7.0, people=['player', 'kid'], kinds=['kid'],
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
    B = Body(J, M, dict(top='tee', bottom='shorts', sleeve='short', sleeve_stripes=True, hem=0.45, foot='chappal'))
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
