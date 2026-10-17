"""NOSTALGIA — tools/blender/props_fauna.py — birds, bats and street animals (props artist).
design/atmosphere.md "Birds", design/feedback_3d.md round 3 item 7, ARCHITECTURE §21.

Birds (meta kind='bird'): bird_pigeon, bird_crow, bird_kite, bird_parakeet, bird_egret, bird_myna, bat.
  Rigid tiny rigs: root, body, (neck), head, wing_L/R, wingtip_L/R, tail, leg_L/R (bat: no legs/tail).
  Clips: flap (one wingbeat, loop), glide (loop), perch (standing on a wire / ledge, idle loop; feet on
  z = 0 = the origin), peck (pigeon, myna, egret, crow), bat: flap (3 erratic beats), glide, hang ==
  perch (upside down: feet at the origin, body hanging below).
Animals (meta kind='animal', species matches traffic.js): animal_cow, animal_dog, animal_goat.
  Rig: root, body (hips / loins), chest, neck, head, jaw, ear_L/R, tail1, tail2,
  leg_{FL,FR,HL,HR}_{upper,lower}. Legs are posed by 2-bone IK in the sagittal plane, so stance feet
  are planted: in walk / run the stance foot moves backwards at exactly stride per cycle.
All clips are authored at 60 fps (fast wingbeats and strides need the frames; manifest clip fps = 60).
"""
import math
import os

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler, Quaternion

import kit
import props_kit as P

V = Vector
TAU = math.tau
FPS_F = 60


# =========================================================================== small helpers
def sstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def win(t, a, b, c, d):
    """0 before a, ramps to 1 over a..b, holds, ramps back to 0 over c..d (t in 0..1)."""
    return sstep((t - a) / max(1e-6, b - a)) * (1.0 - sstep((t - c) / max(1e-6, d - c)))


def qe(x=0.0, y=0.0, z=0.0):
    return Euler((x, y, z), 'XYZ').to_quaternion()


def mir(q):
    """Mirror a rotation across the YZ plane (left -> right)."""
    return Quaternion((q.w, q.x, -q.y, -q.z))


def LR(Pd, name, q, loc=None):
    Pd[name + '_L'] = (q, loc)
    Pd[name + '_R'] = (mir(q), (-loc[0], loc[1], loc[2]) if loc is not None else None)


def mat(key, name, **over):
    return P.M(key, 'f_' + name, **over)


def octa(name, c, r, m, sq=(1.0, 1.0, 1.0)):
    bm = bmesh.new()
    c = V(c)
    vs = [bm.verts.new(c + V((p[0] * r * sq[0], p[1] * r * sq[1], p[2] * r * sq[2])))
          for p in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    for a in (0, 1):
        for b in (2, 3):
            for cc in (4, 5):
                bm.faces.new((vs[a], vs[b], vs[cc]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj_from_bm(bm, name, m)


def sheet(name, rows, m):
    """Quads between consecutive rows of points. m: a material or fn(i, k) -> material."""
    bm = bmesh.new()
    vr = [[bm.verts.new(V(p)) for p in row] for row in rows]
    mats = []

    def mi(mm):
        if mm not in mats:
            mats.append(mm)
        return mats.index(mm)
    for i in range(len(vr) - 1):
        for k in range(len(vr[i]) - 1):
            f = bm.faces.new((vr[i][k], vr[i][k + 1], vr[i + 1][k + 1], vr[i + 1][k]))
            f.material_index = mi(m(i, k) if callable(m) else m)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    kit.link(ob)
    for mm in mats:
        me.materials.append(mm)
    return ob


def wloft(name, rings, seg, m_default, side=(1, 0, 0), cap_start=True, cap_end=True):
    """kit.loft with rings given as (y, z, rx, rz, mat, w) or dicts; w: bone name or {bone: w}."""
    rr = []
    for r in rings:
        if isinstance(r, dict):
            rr.append(r)
            continue
        y, z, rx, rz, m, w = r[:6]
        d = {'c': (0.0, y, z), 'r': (rx, rz)}
        if m is not None:
            d['mat'] = m
        if w is not None:
            d['w'] = {w: 1.0} if isinstance(w, str) else w
        if len(r) > 6:
            d['p'] = r[6]
        rr.append(d)
    return kit.loft(name, rr, seg=seg, side=side, mat=m_default, cap_start=cap_start, cap_end=cap_end)


def seg_weights(segs, bw=0.1):
    """fn(co) -> {bone: w}: nearest of several bone segments [(bone, a, b)], blended over bw."""
    segs = [(n, V(a), V(b)) for n, a, b in segs]

    def dist(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
        return (a + ab * t - p).length

    def fn(co):
        ds = sorted((dist(co, a, b), n) for n, a, b in segs)
        if len(ds) == 1 or ds[1][0] - ds[0][0] > bw:
            return {ds[0][1]: 1.0}
        w = 0.5 + 0.5 * (ds[1][0] - ds[0][0]) / bw
        return {ds[0][1]: w, ds[1][1]: 1.0 - w}
    return fn


# =========================================================================== GLB slimming (post-export)
def slim_glb(path, eps=2e-4, key_tol=0.0018):
    """Rewrite the exported GLB in place: drop animation channels that never leave the node's rest
    value (the exporter writes T/R/S for every bone in every clip; three.js keeps / restores the
    rest value of unanimated properties), share identical keyframe-time inputs, and compact the
    binary chunk. Pure GLB rewrite: geometry, skin and textures are byte-identical."""
    import json as _json
    import struct as _st
    b = open(path, 'rb').read()
    jl = _st.unpack('<I', b[12:16])[0]
    J = _json.loads(b[20:20 + jl])
    bin_off = 20 + jl + 8
    bl = _st.unpack('<I', b[20 + jl:24 + jl])[0]
    BIN = b[bin_off:bin_off + bl]
    acc, bvs = J['accessors'], J['bufferViews']
    NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

    def raw(ai):
        a = acc[ai]
        v = bvs[a['bufferView']]
        o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        sz = {5126: 4, 5123: 2, 5125: 4, 5121: 1, 5120: 1, 5122: 2}[a['componentType']]
        n = a['count'] * NC[a['type']]
        return BIN[o:o + n * sz]

    def floats(ai):
        a = acc[ai]
        r = raw(ai)
        return _st.unpack('<%df' % (len(r) // 4), r), NC[a['type']]
    rest = {'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}
    dropped = 0
    for an in J.get('animations', []):
        keep = []
        for ch in an['channels']:
            pth = ch['target']['path']
            node = J['nodes'][ch['target']['node']]
            rv = node.get(pth, rest[pth])
            vals, n = floats(an['samplers'][ch['sampler']]['output'])
            same = True
            for i in range(0, len(vals), n):
                k = vals[i:i + n]
                d = max(abs(x - y) for x, y in zip(k, rv))
                if pth == 'rotation':
                    d = min(d, max(abs(x + y) for x, y in zip(k, rv)))
                if d > eps:
                    same = False
                    break
            if same:
                dropped += 1
                continue
            keep.append(ch)
        if not keep:
            keep = an['channels'][:1]
        used = sorted(set(c['sampler'] for c in keep))
        remap = {o: i for i, o in enumerate(used)}
        an['samplers'] = [an['samplers'][o] for o in used]
        for c in keep:
            c['sampler'] = remap[c['sampler']]
        an['channels'] = keep
    # drop keys that linear interpolation reproduces (rotations within ~0.2 deg, translations 1e-3 u)
    newdata = {}
    for an in J.get('animations', []):
        for sm in an['samplers']:
            tv, _ = floats(sm['input'])
            vals, n = floats(sm['output'])
            K = [vals[i * n:(i + 1) * n] for i in range(len(tv))]
            if len(K) <= 2:
                continue
            tol = key_tol if n == 4 else key_tol * 0.5
            keep = [0]
            i = 0
            while i < len(K) - 1:
                j = i + 2
                while j < len(K):
                    ok = True
                    for m in range(i + 1, j):
                        f = (tv[m] - tv[i]) / (tv[j] - tv[i])
                        if max(abs(K[i][c] + (K[j][c] - K[i][c]) * f - K[m][c]) for c in range(n)) > tol:
                            ok = False
                            break
                    if not ok:
                        break
                    j += 1
                i = j - 1
                keep.append(i)
            if len(K) - len(keep) < 6:
                continue
            ti = _st.pack('<%df' % len(keep), *[tv[k] for k in keep])
            to = _st.pack('<%df' % (len(keep) * n), *[c for k in keep for c in K[k]])
            newdata[id(sm)] = (ti, to, len(keep), [tv[keep[0]]], [tv[keep[-1]]])
    # rebuilt samplers get fresh accessors appended (data kept in EXTRA)
    EXTRA = {}
    for an in J.get('animations', []):
        for sm in an['samplers']:
            if id(sm) in newdata:
                ti, to, cnt, mn, mx = newdata[id(sm)]
                ai = dict(acc[sm['input']], count=cnt, min=mn, max=mx)
                ao = dict(acc[sm['output']], count=cnt)
                ao.pop('min', None)
                ao.pop('max', None)
                acc.append(ai)
                EXTRA[len(acc) - 1] = ti
                acc.append(ao)
                EXTRA[len(acc) - 1] = to
                sm['input'], sm['output'] = len(acc) - 2, len(acc) - 1
    _raw0 = raw

    def raw(ai):
        return EXTRA[ai] if ai in EXTRA else _raw0(ai)
    # share identical time inputs
    seen = {}
    for an in J.get('animations', []):
        for sm in an['samplers']:
            key = raw(sm['input'])
            if key in seen:
                sm['input'] = seen[key]
            else:
                seen[key] = sm['input']
    # collect used accessors
    used_acc = []

    def use(ai):
        if ai is not None and ai not in used_acc:
            used_acc.append(ai)
    for m in J.get('meshes', []):
        for pr in m['primitives']:
            for ai in pr['attributes'].values():
                use(ai)
            use(pr.get('indices'))
            for t in pr.get('targets', []):
                for ai in t.values():
                    use(ai)
    for sk in J.get('skins', []):
        use(sk.get('inverseBindMatrices'))
    for an in J.get('animations', []):
        for sm in an['samplers']:
            use(sm['input'])
            use(sm['output'])
    amap = {o: i for i, o in enumerate(used_acc)}
    parts = []
    off = 0
    nbv = []

    def push(data, tmpl):
        nonlocal off
        pad = (4 - off % 4) % 4
        parts.append(bytes(pad))
        off += pad
        v = {k: x for k, x in tmpl.items() if k in ('target', 'byteStride')}
        v.update(buffer=0, byteOffset=off, byteLength=len(data))
        parts.append(data)
        off += len(data)
        nbv.append(v)
        return len(nbv) - 1
    anim_acc = set()
    out_acc = set()
    rot_acc = set()
    for an in J.get('animations', []):
        for ch in an['channels']:
            if ch['target']['path'] == 'rotation':
                rot_acc.add(an['samplers'][ch['sampler']]['output'])
        for sm in an['samplers']:
            anim_acc.add(sm['input'])
            anim_acc.add(sm['output'])
            out_acc.add(sm['output'])
    for sk in J.get('skins', []):
        if 'inverseBindMatrices' in sk:
            anim_acc.add(sk['inverseBindMatrices'])
    nacc = []
    blob = []
    boff = 0
    for ai in used_acc:
        a = dict(acc[ai])
        if ai in anim_acc:
            data = raw(ai)
            if ai in rot_acc and a['componentType'] == 5126:
                fv = _st.unpack('<%df' % (len(data) // 4), data)
                data = _st.pack('<%dh' % len(fv), *[int(round(max(-1.0, min(1.0, x)) * 32767)) for x in fv])
                a['componentType'] = 5122
                a['normalized'] = True
            pad = (4 - boff % 4) % 4
            blob.append(bytes(pad))
            boff += pad
            a['bufferView'] = -1
            a['byteOffset'] = boff
            blob.append(data)
            boff += len(data)
            if ai in out_acc:
                a.pop('min', None)
                a.pop('max', None)
            nacc.append(a)
            continue
        v = bvs[a['bufferView']] if ai not in EXTRA else {}
        if v.get('byteStride'):
            o = v.get('byteOffset', 0)
            data = BIN[o:o + v['byteLength']]
            a['bufferView'] = push(data, v)
        else:
            data = raw(ai)
            a['bufferView'] = push(data, v)
        a.pop('byteOffset', None)
        nacc.append(a)
    if blob:
        shared = push(b''.join(blob), {})
        for a in nacc:
            if a['bufferView'] == -1:
                a['bufferView'] = shared
                if not a['byteOffset']:
                    a.pop('byteOffset')
    for im in J.get('images', []):
        if 'bufferView' in im:
            v = bvs[im['bufferView']]
            o = v.get('byteOffset', 0)
            im['bufferView'] = push(BIN[o:o + v['byteLength']], {})
    J['accessors'] = nacc
    J['bufferViews'] = nbv
    for m in J.get('meshes', []):
        for pr in m['primitives']:
            pr['attributes'] = {k: amap[x] for k, x in pr['attributes'].items()}
            if 'indices' in pr:
                pr['indices'] = amap[pr['indices']]
            if 'targets' in pr:
                pr['targets'] = [{k: amap[x] for k, x in t.items()} for t in pr['targets']]
    for sk in J.get('skins', []):
        if 'inverseBindMatrices' in sk:
            sk['inverseBindMatrices'] = amap[sk['inverseBindMatrices']]
    for an in J.get('animations', []):
        for sm in an['samplers']:
            sm['input'] = amap[sm['input']]
            sm['output'] = amap[sm['output']]
    nb = b''.join(parts)
    nb += bytes((4 - len(nb) % 4) % 4)
    J['buffers'] = [{'byteLength': len(nb)}]
    def rnd(o):
        if isinstance(o, float):
            return float('%.5g' % o)
        if isinstance(o, list):
            return [rnd(x) for x in o]
        if isinstance(o, dict):
            return {k: rnd(x) for k, x in o.items()}
        return o
    J['nodes'] = rnd(J['nodes'])
    for nd in J['nodes']:
        for k in ('rotation', 'translation', 'scale'):
            if k in nd:
                nd[k] = [0 if abs(x) < 1e-5 else x for x in nd[k]]
        if 'scale' in nd and max(abs(x - 1) for x in nd['scale']) < 1e-4:
            del nd['scale']
    for a in J['accessors']:
        if 'min' in a:
            a['min'] = [math.floor(x * 1e4) / 1e4 if a['componentType'] == 5126 else x for x in a['min']]
        if 'max' in a:
            a['max'] = [math.ceil(x * 1e4) / 1e4 if a['componentType'] == 5126 else x for x in a['max']]
    J['asset'] = {'version': '2.0'}
    for an in J.get('animations', []):
        for sm in an['samplers']:
            if sm.get('interpolation') == 'LINEAR':
                del sm['interpolation']
    js = _json.dumps(J, separators=(',', ':')).encode('utf8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = (_st.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(nb)) + _st.pack('<II', len(js), 0x4E4F534A) + js
           + _st.pack('<II', len(nb), 0x004E4942) + nb)
    with open(path, 'wb') as f:
        f.write(out)
    kit.log('slim_glb %s: %d -> %d bytes, %d constant channels dropped' % (os.path.basename(path), len(b), len(out), dropped))
    return path


def use_slim_export():
    """Wrap kit.export_glb for this build process (each asset builds in its own process)."""
    if getattr(kit.export_glb, '_slim', False):
        return
    orig = kit.export_glb

    def export_glb(A, path=None):
        return slim_glb(orig(A, path))
    export_glb._slim = True
    kit.export_glb = export_glb
    uv0 = kit.uv_atlas

    def uv_atlas(objs, margin=0.004, angle=60.0):
        # low-poly fauna: a wider angle limit keeps loft columns in one island (far fewer seam verts)
        return uv0(objs, margin=margin, angle=UV_ANGLE)
    kit.uv_atlas = uv_atlas


UV_ANGLE = 80.0


# =========================================================================== clips (armature-space poses)
def mkclip(A, arm, name, frames, fn, loop=True, fps=None, **meta):
    """fn(t) -> {bone: (rotation, loc)} with rotation (euler XYZ tuple or Quaternion) and loc in
    ARMATURE axes, applied in the parent's rest frame (pivot = bone head). Converted to pose-bone
    local space for props_kit.clip."""
    R = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
    Ri = {k: v.inverted() for k, v in R.items()}
    poses = [fn(fr / frames) for fr in range(frames + 1)]
    locb = set()
    for Pd in poses:
        for b, (q, loc) in Pd.items():
            if loc is not None:
                locb.add(b)

    def pose(t, fr):
        out = {}
        for b, (q, loc) in poses[fr].items():
            if b not in R:
                continue
            if q is None:
                q = Quaternion()
            elif not isinstance(q, Quaternion):
                q = qe(*q)
            ql = (Ri[b] @ q.to_matrix() @ R[b]).to_quaternion()
            if loc is None and b in locb:
                loc = (0, 0, 0)
            out[b] = (ql, (Ri[b] @ V(loc)) if loc is not None else None)
        for b in locb:
            if b not in out:
                out[b] = (Quaternion(), V((0, 0, 0)))
        return out
    return P.clip(A, arm, name, frames, pose, loop=loop, fps=fps or FPS_F, **meta)


class Skel:
    """Forward kinematics on armature-space poses + sagittal 2-bone leg IK."""

    def __init__(self, arm):
        self.order = [b.name for b in arm.data.bones]
        self.head = {b.name: b.head_local.copy() for b in arm.data.bones}
        self.tail = {b.name: b.tail_local.copy() for b in arm.data.bones}
        self.par = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}

    def fk(self, Pd):
        D = {}
        for n in self.order:
            q, loc = Pd.get(n, (None, None))
            q = Quaternion() if q is None else (q if isinstance(q, Quaternion) else qe(*q))
            h = self.head[n]
            M = Matrix.Translation(h + (V(loc) if loc is not None else V())) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h)
            p = self.par[n]
            D[n] = (D[p] @ M) if p else M
        return D

    def leg(self, Pd, leg, ty, tz, knee):
        """Solve leg_<leg>_upper/lower so the lower bone's tail reaches (y=ty, z=tz) (world).
        knee = -1: the joint bends forward (front carpus), +1: backward (hind hock)."""
        up, lo = 'leg_%s_upper' % leg, 'leg_%s_lower' % leg
        D = self.fk(Pd)
        par = self.par[up]
        Dp = D[par] if par else Matrix.Identity(4)
        H = Dp @ self.head[up]
        H0, K0, F0 = self.head[up], self.head[lo], self.tail[lo]
        a = (K0 - H0).length
        b = (F0 - K0).length
        hy, hz = H.y, H.z
        dy, dz = ty - hy, tz - hz
        d = math.hypot(dy, dz)
        d = max(abs(a - b) + 1e-3, min(d, (a + b) * 0.9995))
        ang = math.atan2(dz, dy)
        cA = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
        A_ = math.acos(cA)
        ka = ang + knee * A_
        ky, kz = hy + a * math.cos(ka), hz + a * math.sin(ka)
        fy, fz = hy + d * math.cos(ang), hz + d * math.sin(ang)

        def sang(u0, u):
            return math.atan2(u0[0] * u[1] - u0[1] * u[0], u0[0] * u[0] + u0[1] * u[1])
        th_u = sang((K0.y - H0.y, K0.z - H0.z), (ky - hy, kz - hz))
        th_l = sang((F0.y - K0.y, F0.z - K0.z), (fy - ky, fz - kz))
        Ru = Quaternion((1, 0, 0), th_u)
        Rl = Quaternion((1, 0, 0), th_l)
        Qp = Dp.to_quaternion()
        Pd[up] = (Qp.inverted() @ Ru, None)
        Pd[lo] = (Ru.inverted() @ Rl, None)
        return Pd


def check(A, arm, ob, clips, feet=()):
    """Log the posed mesh bottom and the foot-bone tails for a few frames of each clip."""
    dg = bpy.context.evaluated_depsgraph_get()
    arm.animation_data_create()
    sc = bpy.context.scene
    for c in clips:
        act = bpy.data.actions.get(c)
        if not act:
            continue
        arm.animation_data.action = act
        try:
            if act.slots:
                arm.animation_data.action_slot = act.slots[0]
        except Exception:
            pass
        n = A.clips[c]['frames']
        rep = []
        for fr in sorted(set([0, n // 4, n // 2, 3 * n // 4])):
            sc.frame_set(fr)
            bpy.context.view_layer.update()
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            zs = [(ob.matrix_world @ v.co).z for v in me.vertices]
            ev.to_mesh_clear()
            fz = [round((arm.matrix_world @ arm.pose.bones[f].tail).z, 2) for f in feet if f in arm.pose.bones]
            rep.append('f%d lo=%.2f hi=%.2f feet=%s' % (fr, min(zs), max(zs), fz))
        kit.log('check %s %s: %s' % (A.id, c, ' | '.join(rep)))
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    sc.frame_set(0)


# =========================================================================== birds
BIRD_FPS = 30


def apply_rest(arm, ob, rest):
    """Pose bones (armature-space rotations about their heads) and make that the rest / bind pose
    (mesh deformed + armature applied), so the static first mesh shows it (egret: neck retracted and
    legs trailing in flight)."""
    R = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
    for n, q in rest.items():
        arm.pose.bones[n].rotation_quaternion = (R[n].inverted() @ q.to_matrix() @ R[n]).to_quaternion()
    bpy.context.view_layer.update()
    kit.select_only([ob], ob)
    bpy.ops.object.modifier_apply(modifier=ob.modifiers[0].name)
    kit.select_only([arm], arm)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


def build_bird(A, S):
    """S: species spec. Lean rig (7 bones): root (= body, at the origin), head, tail, wing_L/R,
    wingtip_L/R. Bind pose = clean flight pose: body level at the origin, wings spread along +-X,
    legs tucked (weighted to root). Authored standing (feet at z=0) then shifted down by bodyZ."""
    bpy.context.scene.render.fps = BIRD_FPS
    use_slim_export()
    sc = S.get('scale', 1.0)
    Mt = S['mats']
    bz = S['bodyZ']
    objs = []

    def bw(w):
        if isinstance(w, str):
            return {('root' if w == 'body' else w): 1.0}
        return {('root' if k == 'body' else k): x for k, x in w.items()}
    rings = [(y, z, rx, rz, Mt[m], bw(w)) for (y, z, rx, rz, m, w) in S['rings']]
    objs.append(wloft('body', rings, S.get('seg', 6), None))
    bk = S['beak']
    beak = P.taper('beak', bk['pts'], bk['r'], seg=bk.get('seg', 4), mat=Mt[bk['mat']], cap_end=False, squash=bk.get('squash', 1.0))
    kit.weights(beak, 'head')
    objs.append(beak)
    for s in (1, -1):
        if S.get('eye'):
            e = S['eye']
            ob = octa('eye', (s * e['p'][0], e['p'][1], e['p'][2]), e['r'], Mt[e['mat']], sq=e.get('sq', (1, 1, 1)))
            kit.weights(ob, 'head')
            objs.append(ob)
        for x in S.get('extras_lr', []):
            objs.append(x(s))
    for x in S.get('extras', []):
        objs.append(x())
    # wings
    Wd = S['wing']
    st = Wd['stations']
    wi = Wd['wrist']
    cam = Wd.get('camber', 0.05)
    tips = Wd.get('tips', True)
    for s, sfx in ((1, 'L'), (-1, 'R')):
        rows = []
        for (x, ly, ty, z) in st:
            ch = ty - ly
            rows.append([(s * x, ly, z), (s * x, ly + ch * 0.32, z + cam * ch), (s * x, ty, z - 0.01)])
        mf = Wd['mat']
        w = sheet('wing_' + sfx, rows, (lambda i, k, mf=mf: Mt[mf(i, k)]) if callable(mf) else Mt[mf])
        wx = st[wi][0]
        if not tips:
            kit.weights(w, 'wing_' + sfx)
        else:
            kit.weights(w, lambda co, wx=wx, sfx=sfx: (
                {'wing_' + sfx: 1.0} if abs(co.x) < wx - 0.06 * sc else
                {'wingtip_' + sfx: 1.0} if abs(co.x) > wx + 0.06 * sc else
                {'wing_' + sfx: 0.5, 'wingtip_' + sfx: 0.5}))
        objs.append(w)
        for (b0, b1, wd, lift) in Wd.get('fingers', []):
            p0 = V((s * b0[0], b0[1], b0[2]))
            p1 = V((s * b1[0], b1[1], b1[2] + lift))
            side = V((0, 1, 0))
            f = sheet('finger', [[p0 - side * wd * 0.5, p0 + side * wd * 0.5],
                                 [p1 - side * wd * 0.15, p1 + side * wd * 0.15]], Mt[Wd['finger_mat']])
            kit.weights(f, ('wingtip_' if tips else 'wing_') + sfx)
            objs.append(f)
    if S.get('tail'):
        T = S['tail']
        rows = []
        for (y, hw, z, notch) in T['rows']:
            rows.append([(-hw, y, z), (0, y + notch, z + 0.015), (hw, y, z)])
        tm = T['mat']
        tl = sheet('tail', rows, (lambda i, k, tm=tm: Mt[tm(i, k)]) if callable(tm) else Mt[tm])
        kit.weights(tl, 'tail')
        objs.append(tl)
    # legs: one thin 3-sided spindle each, tucked back under the belly (feet clutch the wire when perched)
    lift = bz
    if S.get('legs'):
        L = S['legs']
        tuck = L.get('tuck', 0.9)
        hx, hy, hz = L['hip']
        hip = V((0, hy, hz))
        lb = L.get('bones', False)
        Mk = Matrix.Translation(hip) @ Matrix.Rotation(tuck, 4, 'X') @ Matrix.Translation(-hip)
        for s, sfx in ((1, 'L'), (-1, 'R')):
            pts = [(s * hx, hy, hz)] + [(s * hx, y, z) for (y, z) in L.get('mid', [])] + [(s * hx, L['foot_y'], 0.0)]
            lg = P.taper('leg', pts, L['r'], seg=3, mat=Mt[L['mat']], cap_end=True)
            if lb:
                kit.weights(lg, 'leg_' + sfx)
                for (toe_d, ln) in ((-1, L.get('toe', 0.0)), (1, L.get('toe', 0.0) * 0.5)):
                    if ln:
                        t = sheet('toe', [[(s * hx - 0.02, L['foot_y'], 0.01), (s * hx + 0.02, L['foot_y'], 0.01)],
                                          [(s * hx - 0.01, L['foot_y'] + toe_d * ln, 0.01), (s * hx + 0.01, L['foot_y'] + toe_d * ln, 0.01)]], Mt[L['mat']])
                        kit.weights(t, 'leg_' + sfx)
                        objs.append(t)
            else:
                lg.data.transform(Mk)
                kit.weights(lg, 'root')
            objs.append(lg)
        lift = bz if lb else bz - (Mk @ V((0, L['foot_y'], 0.0))).z
    for o in objs:
        o.data.transform(Matrix.Translation((0, 0, -bz)))
    lift = S.get('perch_lift', lift)
    S['lift'] = lift
    B = S['bones']
    bones = [('root', (0, 0, bz), (0, -0.4 * sc, bz), None)]
    hp = 'root'
    if 'neck' in B:
        bones.append(('neck', B['neck'][0], B['neck'][1], 'root'))
        hp = 'neck'
    bones.append(('head', B['head'][0], B['head'][1], hp))
    sh, wr, tp = V(B['shoulder']), V(B['wrist']), V(B['tip'])
    for s, sfx in ((1, 'L'), (-1, 'R')):
        m = V((s, 1, 1))
        if tips:
            bones.append(('wing_' + sfx, sh * m, wr * m, 'root'))
            bones.append(('wingtip_' + sfx, wr * m, tp * m, 'wing_' + sfx))
        else:
            bones.append(('wing_' + sfx, sh * m, tp * m, 'root'))
    if 'tail' in B:
        bones.append(('tail', B['tail'][0], B['tail'][1], 'root'))
    rest = dict(S.get('rest_pose', {}))
    if S.get('legs') and S['legs'].get('bones'):
        L = S['legs']
        for s, sfx in ((1, 'L'), (-1, 'R')):
            bones.append(('leg_' + sfx, (s * L['hip'][0], L['hip'][1], L['hip'][2]), (s * L['hip'][0], L['foot_y'], 0.0), 'root'))
        rest['leg_L'] = rest['leg_R'] = qe(L.get('tuck', 0.9), 0, 0)
    S['rest'] = rest
    off = V((0, 0, bz))
    arm = P.rig(A, A.id + '_rig', [(n, tuple(V(h) - off), tuple(V(t) - off), p) for n, h, t, p in bones])
    for o in objs:
        kit.smooth(o, 85.0)
    ob = P.finish_prop(A, objs, size=S.get('tex', 64), double=True, ao_strength=0.45, orm=False)
    P.skin(A, ob, arm)
    if rest:
        apply_rest(arm, ob, rest)
    A.meta['origin'] = 'body centre; bind pose = flight pose (wings along +-X, legs tucked). perch lifts the root by perchLift so the feet are on z = 0'
    A.meta['perchLift'] = round(lift, 3)
    A.meta['bodyZ'] = round(lift, 3)
    return arm, ob


# ---------------------------------------------------------------- bird clips
def bird_clips(A, arm, S, ob):
    C = S['clip']
    beat = C['beat']                   # seconds per wingbeat
    amp, off = C.get('amp', 0.75), C.get('off', 0.1)
    tamp = C.get('tamp', 0.55)
    bob = C.get('bob', 0.06)
    fold = C['fold']                   # (rx, rz, loc, tip_rz)
    neck_fly = C.get('neck_fly')       # egret: (neck rx, head rx) in flight; rest pose = standing neck
    lift = S['lift']
    names = [b.name for b in arm.data.bones]

    def flight_common(Pd):
        if neck_fly:
            Pd['neck'] = (qe(neck_fly[0], 0, 0), None)
            Pd['head'] = (qe(neck_fly[1], 0, 0), None)

    def flap(t):
        # t = 0: wings fully up; downstroke takes ~45 % of the beat
        ph = t / 0.45 * 0.5 if t < 0.45 else 0.5 + (t - 0.45) / 0.55 * 0.5
        c = math.cos(TAU * ph)
        sdn = max(0.0, math.sin(TAU * ph))
        sup = max(0.0, -math.sin(TAU * ph))
        th = amp * c + off
        tht = tamp * math.cos(TAU * ph - 0.5) + 0.05
        Pd = {}
        LR(Pd, 'wing', qe(0.12 * sdn - 0.05 * sup, -th, -0.12 * sdn + 0.18 * sup))
        LR(Pd, 'wingtip', qe(0.10 * sdn, -tht, 0.55 * sup * C.get('tipsweep', 1.0)))
        Pd['root'] = (None, (0, 0, -bob * c))
        flight_common(Pd)
        return Pd

    def glide(t):
        g = C.get('glide', {})
        s1 = math.sin(TAU * t)
        Pd = {}
        LR(Pd, 'wing', qe(0.0, -(g.get('dih', 0.1) + 0.04 * s1), -g.get('fwd', 0.05)))
        Pd['root'] = (qe(0, g.get('bank', 0.04) * s1, 0), None)
        Pd['tail'] = (qe(0.0, g.get('twist', 0.1) * s1, 0), None)
        flight_common(Pd)
        return Pd

    pp = C.get('perch_pitch', 0.0)

    def perch(t):
        Pd = {}
        # inner wing (shoulder -> wrist) points forward-down along the shoulder, the hand lies back along
        # the flank (chord vertical, leading edge up): fold = (rx tilt, rz inner, rz hand (world), loc)
        rx, rzi, rzt, loc = fold
        qw = qe(0, 0, rzi) @ qe(rx, 0, 0)
        LR(Pd, 'wing', qw, loc)
        LR(Pd, 'wingtip', qw.inverted() @ (qe(0, 0, rzt) @ qe(rx, 0, 0)))
        yaw = 0.7 * win(t, 0.10, 0.14, 0.32, 0.36) - 0.6 * win(t, 0.55, 0.59, 0.80, 0.84)
        nod = 0.15 * win(t, 0.42, 0.45, 0.48, 0.51)
        Pd['root'] = (qe(pp, 0, 0), (0, 0, lift))
        rest = S.get('rest', {})
        for lg in ('leg_L', 'leg_R'):
            if lg in rest:
                Pd[lg] = (rest[lg].inverted(), None)
        if 'neck' in names:
            rn = rest.get('neck', Quaternion())
            rh = rest.get('head', Quaternion())
            Pd['neck'] = (qe(0, 0, 0.4 * yaw) @ rn.inverted(), None)
            Pd['head'] = (rh.inverted() @ qe(-pp + nod, 0, 0.6 * yaw), None)
        else:
            Pd['head'] = (qe(-pp + nod, 0, yaw), None)
        if 'tail' in names:
            Pd['tail'] = (qe(-pp * 0.5 + 0.35 * win(t, 0.66, 0.68, 0.70, 0.74), 0, 0), None)
        return Pd

    nb = max(6, int(round(beat * BIRD_FPS)))
    mkclip(A, arm, 'flap', nb, flap, fps=BIRD_FPS, beat=round(nb / BIRD_FPS, 4))
    mkclip(A, arm, 'glide', int(C.get('glide_s', 2.0) * BIRD_FPS), glide, fps=BIRD_FPS)
    mkclip(A, arm, 'perch', int(C.get('perch_s', 2.0) * BIRD_FPS), perch, fps=BIRD_FPS)
    check(A, arm, ob, ['perch', 'flap', 'glide'])


def bird_previews(A, S, main='perch', main_frame=10):
    span = A.meta['wingspan']
    fr = A.clips['flap']['frames']
    A.preview = {
        'shots': [{'clip': main, 'frame': main_frame, 'size': 384, 'samples': 20, 'view': {'az': -40, 'el': 16, 'fov': 30}},
                  {'name': 'rest', 'size': 320, 'samples': 16, 'view': {'az': -30, 'el': 40, 'fov': 30}}],
        'sheet': {'name': 'sheet', 'size': 160, 'samples': 10, 'cols': 8,
                  'view': {'az': -20, 'el': 10, 'fov': 30, 'target': (0, 0, 0.0), 'dist': span * 1.0 / math.tan(math.radians(15)) * 0.62},
                  'frames': [('flap', int(round(fr * k / 6))) for k in range(6)] + [('glide', 0), (main if main != 'glide' else 'perch', 12)]},
    }


def flock_meta(**k):
    return k

@kit.asset('bird_pigeon', 'prop', kind='bird', species='pigeon',
           flock=flock_meta(size=[6, 30], perch=['ground', 'roof', 'wire', 'ledge'], alt=[8, 60], speed=[45, 70], startle=True,
                            habitat=['charminar', 'market', 'station', 'old_city'], sound='coo'))
def bird_pigeon(A):
    Mt = {
        'body': mat('feather_grey', 'pg_body', base='#a3aab8'),
        'neckp': mat('feather_grey', 'pg_neckp', base='#6a5a86', rough=0.4),
        'neckg': mat('feather_grey', 'pg_neckg', base='#4f8a72', rough=0.4),
        'head': mat('feather_grey', 'pg_head', base='#858ca0'),
        'beak': mat('feather_black', 'pg_beak', base='#3a3436'),
        'leg': mat('beak_red', 'pg_leg', base='#c45a5e'),
        'wing': mat('feather_grey', 'pg_wing', base='#bcc2ce'),
        'bar': mat('feather_black', 'pg_bar', base='#2e3036'),
        'tip': mat('feather_grey', 'pg_tip', base='#5a6070'),
        'tail': mat('feather_grey', 'pg_tail', base='#7f8696'),
    }
    S = dict(mats=Mt, bodyZ=0.62, tex=64, rings=[
        (0.48, 0.67, 0.07, 0.05, 'body', 'body'),
        (0.20, 0.62, 0.23, 0.21, 'body', 'body'),
        (-0.08, 0.64, 0.29, 0.28, 'neckp', 'body'),
        (-0.30, 0.80, 0.21, 0.20, 'neckg', {'body': 0.5, 'head': 0.5}),
        (-0.42, 1.01, 0.14, 0.14, 'head', 'head'),
        (-0.50, 1.11, 0.15, 0.14, 'head', 'head'),
        (-0.63, 1.10, 0.06, 0.06, 'head', 'head'),
    ],
        beak=dict(pts=[(0, -0.61, 1.10), (0, -0.80, 1.06)], r=[0.045, 0.012], mat='beak'),
        wing=dict(stations=[(0.14, -0.20, 0.34, 0.84), (0.60, -0.24, 0.36, 0.87), (1.15, -0.22, 0.30, 0.90),
                            (1.72, 0.02, 0.18, 0.89)], wrist=1,
                  mat=lambda i, k: 'tip' if i >= 2 else ('bar' if (k == 1 and i == 0) else 'wing')),
        tail=dict(rows=[(0.42, 0.10, 0.67, 0.0), (0.80, 0.17, 0.63, 0.0), (0.97, 0.21, 0.60, 0.02)],
                  mat=lambda i, k: 'bar' if i == 1 else 'tail'),
        legs=dict(hip=(0.09, 0.02, 0.42), foot_y=-0.02, r=[0.035, 0.03], mat='leg', tuck=1.3),
        bones=dict(head=((0, -0.30, 0.82), (0, -0.55, 1.12)), tail=((0, 0.42, 0.67), (0, 0.97, 0.6)),
                   shoulder=(0.14, -0.1, 0.84), wrist=(0.60, -0.1, 0.87), tip=(1.72, 0.1, 0.89)),
        clip=dict(beat=0.28, amp=0.8, off=0.15, fold=(0.0, 1.69, 1.69, (0.0, 0.0, -0.08)), perch_pitch=-0.08, tamp=0.35),
    )
    arm, ob = build_bird(A, S)
    A.meta.update(wingspan=3.44, length=1.8, perchClip='perch', flightClips=['flap', 'glide'])
    bird_clips(A, arm, S, ob)
    bird_previews(A, S)


@kit.asset('bird_crow', 'prop', kind='bird', species='crow',
           flock=flock_meta(size=[1, 8], perch=['wire', 'roof', 'tree', 'wall'], alt=[10, 50], speed=[40, 60], startle=True,
                            habitat=['everywhere'], sound='caw'))
def bird_crow(A):
    Mt = {
        'black': mat('feather_black', 'cr_black', base='#1e1f24', rough=0.55),
        'grey': mat('feather_grey', 'cr_grey', base='#6e6c6c'),
        'beak': mat('feather_black', 'cr_beak', base='#141416', rough=0.4),
        'leg': mat('feather_black', 'cr_leg', base='#222224'),
        'wing': mat('feather_black', 'cr_wing', base='#26282e', rough=0.5),
        'tip': mat('feather_black', 'cr_tip', base='#18191d', rough=0.5),
    }
    S = dict(mats=Mt, bodyZ=0.79, tex=64, rings=[
        (0.55, 0.88, 0.08, 0.06, 'black', 'body'),
        (0.25, 0.80, 0.25, 0.24, 'black', 'body'),
        (-0.05, 0.81, 0.30, 0.30, 'black', 'body'),
        (-0.30, 0.96, 0.23, 0.23, 'grey', {'body': 0.5, 'head': 0.5}),
        (-0.43, 1.17, 0.16, 0.17, 'grey', 'head'),
        (-0.53, 1.28, 0.17, 0.17, 'black', 'head'),
        (-0.70, 1.25, 0.07, 0.07, 'black', 'head'),
    ],
        beak=dict(pts=[(0, -0.66, 1.25), (0, -0.85, 1.21), (0, -0.99, 1.14)], r=[0.075, 0.045, 0.008], mat='beak', squash=0.8),
        wing=dict(stations=[(0.16, -0.22, 0.48, 0.98), (0.72, -0.30, 0.55, 1.02), (1.30, -0.28, 0.46, 1.05),
                            (1.70, -0.15, 0.34, 1.05)], wrist=1, mat=lambda i, k: 'tip' if i >= 2 else 'wing',
                  fingers=[((1.70, -0.08 + 0.13 * j, 1.05), (2.02 - 0.07 * j, -0.06 + 0.14 * j, 1.05), 0.12, 0.04) for j in range(3)],
                  finger_mat='tip'),
        tail=dict(rows=[(0.50, 0.11, 0.86, 0.0), (1.12, 0.21, 0.76, 0.04)], mat='black'),
        legs=dict(hip=(0.11, 0.03, 0.55), foot_y=0.0, r=[0.04, 0.03], mat='leg', tuck=1.3),
        bones=dict(head=((0, -0.30, 0.96), (0, -0.62, 1.28)), tail=((0, 0.5, 0.86), (0, 1.12, 0.76)),
                   shoulder=(0.16, -0.12, 0.98), wrist=(0.72, -0.12, 1.02), tip=(2.02, 0.12, 1.05)),
        clip=dict(beat=0.32, amp=0.75, off=0.12, fold=(0.0, 1.69, 1.69, (0.0, 0.0, -0.1)), perch_pitch=-0.08, tamp=0.35),
    )
    arm, ob = build_bird(A, S)
    A.meta.update(wingspan=4.04, length=2.1, perchClip='perch', flightClips=['flap', 'glide'])
    bird_clips(A, arm, S, ob)
    bird_previews(A, S)


@kit.asset('bird_kite', 'prop', kind='bird', species='kite',
           flock=flock_meta(size=[1, 4], perch=['tree', 'tower', 'roof'], alt=[90, 220], speed=[25, 40], soar=True, circleR=[40, 90],
                            habitat=['sky'], sound='whistle'))
def bird_kite(A):
    Mt = {
        'brown': mat('feather_brown', 'kt_brown', base='#4e3826'),
        'pale': mat('feather_brown', 'kt_pale', base='#8a6e54'),
        'cere': mat('beak_yellow', 'kt_cere', base='#d8b440'),
        'beak': mat('feather_black', 'kt_beak', base='#2a2624'),
        'wing': mat('feather_brown', 'kt_wing', base='#4a3424'),
        'cov': mat('feather_brown', 'kt_cov', base='#6a5038'),
        'tip': mat('feather_black', 'kt_tip', base='#221a14'),
        'tail': mat('feather_brown', 'kt_tail', base='#5c4634'),
    }
    S = dict(mats=Mt, bodyZ=1.1, tex=64, rings=[
        (0.80, 1.22, 0.12, 0.10, 'brown', 'body'),
        (0.40, 1.12, 0.34, 0.32, 'brown', 'body'),
        (0.00, 1.10, 0.42, 0.42, 'brown', 'body'),
        (-0.38, 1.22, 0.36, 0.36, 'pale', {'body': 0.5, 'head': 0.5}),
        (-0.60, 1.52, 0.23, 0.23, 'pale', 'head'),
        (-0.72, 1.69, 0.24, 0.23, 'pale', 'head'),
        (-0.93, 1.67, 0.09, 0.09, 'cere', 'head'),
    ],
        beak=dict(pts=[(0, -0.92, 1.68), (0, -1.07, 1.65), (0, -1.13, 1.55)], r=[0.075, 0.05, 0.01], mat='beak', squash=0.8),
        wing=dict(stations=[(0.30, -0.36, 0.95, 1.32), (1.30, -0.44, 1.00, 1.38), (2.30, -0.42, 0.88, 1.42),
                            (3.00, -0.28, 0.62, 1.48)], wrist=1, camber=0.05,
                  mat=lambda i, k: 'tip' if i >= 2 else ('cov' if k == 0 else 'wing'),
                  fingers=[((3.0, -0.22 + 0.19 * j, 1.48), (3.98 - 0.1 * j, -0.30 + 0.27 * j, 1.48), 0.22, 0.16 + 0.03 * j) for j in range(5)],
                  finger_mat='tip'),
        tail=dict(rows=[(0.75, 0.16, 1.18, 0.0), (1.45, 0.30, 1.12, 0.0), (2.15, 0.40, 1.06, -0.28)], mat='tail'),
        bones=dict(head=((0, -0.38, 1.22), (0, -0.86, 1.70)), tail=((0, 0.75, 1.18), (0, 2.15, 1.06)),
                   shoulder=(0.3, -0.2, 1.32), wrist=(1.3, -0.2, 1.38), tip=(4.0, 0.2, 1.48)),
        perch_lift=0.62,
        clip=dict(beat=0.6, amp=0.55, off=0.12, tamp=0.4, bob=0.12, fold=(0.0, 1.66, 1.66, (0.0, 0.0, -0.14)), perch_pitch=-0.12,
                  glide=dict(dih=0.07, fwd=0.07, bank=0.07, twist=0.22), glide_s=3.0, perch_s=3.0),
    )
    arm, ob = build_bird(A, S)
    A.meta.update(wingspan=8.0, length=3.3, perchClip='perch', flightClips=['glide', 'flap'], mainClip='glide')
    bird_clips(A, arm, S, ob)
    bird_previews(A, S, main='glide', main_frame=0)


@kit.asset('bird_parakeet', 'prop', kind='bird', species='parakeet',
           flock=flock_meta(size=[4, 20], perch=['tree', 'wire'], alt=[10, 40], speed=[60, 90], startle=True,
                            habitat=['neem', 'park', 'colony'], sound='screech'))
def bird_parakeet(A):
    Mt = {
        'green': mat('feather_green', 'pk_green', base='#5cb83c'),
        'light': mat('feather_green', 'pk_light', base='#86cc4e'),
        'ring': mat('feather_black', 'pk_ring', base='#1c1c1e'),
        'pink': mat('beak_red', 'pk_pink', base='#d86a8a'),
        'beak': mat('beak_red', 'pk_beak', base='#cc2a26'),
        'eye': mat('feather_black', 'pk_eye', base='#e8d8a0'),
        'leg': mat('feather_grey', 'pk_leg', base='#8a8a8c'),
        'wing': mat('feather_green', 'pk_wing', base='#4aa636'),
        'tip': mat('feather_green', 'pk_tip', base='#2e6a4a'),
        'tail': mat('feather_green', 'pk_tail', base='#4a9a7a'),
    }
    S = dict(mats=Mt, bodyZ=0.45, height=1.0, tex=64, rings=[
        (0.32, 0.50, 0.06, 0.05, 'green', 'body'),
        (0.18, 0.47, 0.15, 0.15, 'green', 'body'),
        (0.00, 0.48, 0.19, 0.19, 'light', 'body'),
        (-0.16, 0.56, 0.18, 0.18, 'light', 'body'),
        (-0.24, 0.67, 0.14, 0.14, 'ring', {'body': 0.5, 'head': 0.5}),
        (-0.26, 0.72, 0.14, 0.14, 'pink', 'head'),
        (-0.28, 0.76, 0.14, 0.14, 'green', 'head'),
        (-0.32, 0.84, 0.15, 0.15, 'green', 'head'),
        (-0.42, 0.87, 0.11, 0.11, 'green', 'head'),
        (-0.47, 0.85, 0.06, 0.06, 'green', 'head'),
    ],
        beak=dict(pts=[(0, -0.44, 0.86), (0, -0.54, 0.83), (0, -0.56, 0.73)], r=[0.075, 0.05, 0.012], mat='beak', squash=0.8),
        eye=dict(p=(0.10, -0.37, 0.89), r=0.03, mat='eye'),
        wing=dict(stations=[(0.10, -0.10, 0.22, 0.62), (0.45, -0.14, 0.26, 0.64), (0.75, -0.12, 0.22, 0.66),
                            (1.05, -0.02, 0.14, 0.66), (1.18, 0.08, 0.12, 0.66)], wrist=2, camber=0.04,
                  mat=lambda i, k: 'tip' if i >= 2 else 'wing'),
        tail=dict(rows=[(0.28, 0.07, 0.50, 0.0), (0.75, 0.09, 0.47, 0.0), (1.20, 0.05, 0.44, 0.08), (1.55, 0.012, 0.42, 0.0)],
                  mat='tail'),
        legs=dict(hip=(0.07, 0.0, 0.32), foot_y=-0.02, r=[0.03, 0.025], mat='leg', toe=0.09),
        bones=dict(body=((0, 0.0, 0.42), (0, -0.25, 0.42)), head=((0, -0.24, 0.67), (0, -0.42, 0.86)),
                   tail=((0, 0.28, 0.5), (0, 1.55, 0.42)), shoulder=(0.10, -0.06, 0.62), wrist=(0.75, -0.04, 0.66), tip=(1.18, 0.1, 0.66)),
        clip=dict(beat=0.2, amp=0.85, off=0.12, fold=(-1.25, 1.66, (0.08, 0.0, 0.0), 0.12), perch_pitch=-0.55),
    )
    arm, ob = build_bird(A, S)
    A.meta.update(wingspan=2.36, length=2.0, perchClip='perch', flightClips=['flap', 'glide'])
    bird_clips(A, arm, S, ob)
    bird_previews(A, S)


@kit.asset('bird_egret', 'prop', kind='bird', species='egret',
           flock=flock_meta(size=[1, 12], perch=['shore', 'field', 'tree'], alt=[6, 40], speed=[35, 50],
                            habitat=['hussain_sagar', 'musi', 'lawn'], sound=None))
def bird_egret(A):
    Mt = {
        'white': mat('feather_white', 'eg_white', base='#f2f0e8'),
        'bill': mat('beak_yellow', 'eg_bill', base='#e8b828'),
        'eye': mat('beak_yellow', 'eg_eye', base='#e8d040'),
        'leg': mat('feather_black', 'eg_leg', base='#2a2a26'),
        'wing': mat('feather_white', 'eg_wing', base='#f4f2ec'),
    }
    S = dict(mats=Mt, bodyZ=2.45, height=4.5, tex=64, seg=8, rings=[
        (0.85, 2.55, 0.08, 0.06, 'white', 'body'),
        (0.55, 2.48, 0.25, 0.24, 'white', 'body'),
        (0.15, 2.45, 0.33, 0.32, 'white', 'body'),
        (-0.30, 2.55, 0.28, 0.28, 'white', 'body'),
        (-0.50, 2.75, 0.15, 0.15, 'white', {'body': 0.6, 'neck': 0.4}),
        (-0.46, 3.10, 0.10, 0.10, 'white', 'neck'),
        (-0.36, 3.45, 0.09, 0.09, 'white', 'neck'),
        (-0.40, 3.80, 0.085, 0.085, 'white', {'neck': 0.5, 'head': 0.5}),
        (-0.52, 4.05, 0.09, 0.09, 'white', 'head'),
        (-0.60, 4.18, 0.12, 0.12, 'white', 'head'),
        (-0.75, 4.20, 0.10, 0.09, 'white', 'head'),
        (-0.84, 4.18, 0.05, 0.05, 'bill', 'head'),
    ],
        beak=dict(pts=[(0, -0.82, 4.18), (0, -1.40, 4.11)], r=[0.05, 0.008], mat='bill'),
        eye=dict(p=(0.08, -0.72, 4.24), r=0.03, mat='eye'),
        wing=dict(stations=[(0.25, -0.32, 0.62, 2.68), (1.00, -0.40, 0.72, 2.72), (1.60, -0.38, 0.62, 2.76),
                            (2.10, -0.20, 0.42, 2.76), (2.35, 0.00, 0.22, 2.76)], wrist=2, mat='wing'),
        tail=dict(rows=[(0.80, 0.12, 2.56, 0.0), (1.15, 0.18, 2.50, 0.03)], mat='white'),
        legs=dict(hip=(0.12, 0.15, 2.30), foot_y=0.05, r=[0.06, 0.045, 0.03], mid=[(0.22, 1.25)], mat='leg', toe=0.34),
        bones=dict(body=((0, 0.15, 2.45), (0, -0.3, 2.45)), neck=((0, -0.5, 2.75), (0, -0.40, 3.80)), head=((0, -0.40, 3.80), (0, -0.75, 4.20)),
                   tail=((0, 0.8, 2.56), (0, 1.15, 2.5)), shoulder=(0.25, -0.2, 2.68), wrist=(1.6, -0.15, 2.76), tip=(2.35, 0.1, 2.76)),
        clip=dict(beat=0.42, amp=0.6, off=0.1, tamp=0.4, bob=0.08, tuck=1.5, neck_fly=(1.1, -1.1),
                  fold=(-1.25, 1.62, (0.12, 0.0, 0.0), 0.12), peck=(0.35, 0.3, 0.9), perch_s=3.0),
    )
    arm, ob = build_bird(A, S)
    A.meta.update(wingspan=4.7, length=2.5, standHeight=4.45, perchClip='perch', flightClips=['flap', 'glide'])
    bird_clips(A, arm, S, ob)
    bird_previews(A, S)


@kit.asset('bird_myna', 'prop', kind='bird', species='myna',
           flock=flock_meta(size=[2, 6], perch=['ground', 'wire', 'wall', 'tree'], alt=[4, 25], speed=[40, 60], startle=True,
                            habitat=['lawn', 'colony', 'market'], sound='chatter'))
def bird_myna(A):
    Mt = {
        'brown': mat('feather_brown', 'my_brown', base='#6a4630'),
        'black': mat('feather_black', 'my_black', base='#1e1c1c'),
        'white': mat('feather_white', 'my_white', base='#efece4'),
        'yellow': mat('beak_yellow', 'my_yellow', base='#f0c020'),
        'eye': mat('feather_black', 'my_eye', base='#5a3a20'),
        'wing': mat('feather_brown', 'my_wing', base='#5e3e2a'),
        'tip': mat('feather_black', 'my_tip', base='#24201e'),
    }

    def eyepatch(s):
        o = octa('patch', (s * 0.105, -0.47, 1.02), 0.06, Mt['yellow'], sq=(0.45, 1.0, 0.8))
        kit.weights(o, 'head')
        return o
    S = dict(mats=Mt, bodyZ=0.6, height=1.1, tex=64, rings=[
        (0.45, 0.66, 0.07, 0.06, 'white', 'body'),
        (0.36, 0.64, 0.13, 0.12, 'brown', 'body'),
        (0.28, 0.62, 0.18, 0.17, 'brown', 'body'),
        (0.04, 0.60, 0.25, 0.24, 'brown', 'body'),
        (-0.18, 0.66, 0.23, 0.23, 'black', 'body'),
        (-0.30, 0.80, 0.17, 0.17, 'black', {'body': 0.5, 'head': 0.5}),
        (-0.36, 0.92, 0.15, 0.15, 'black', 'head'),
        (-0.42, 1.00, 0.15, 0.15, 'black', 'head'),
        (-0.54, 1.00, 0.10, 0.10, 'black', 'head'),
        (-0.60, 0.98, 0.05, 0.05, 'yellow', 'head'),
    ],
        beak=dict(pts=[(0, -0.58, 0.98), (0, -0.74, 0.95)], r=[0.045, 0.01], mat='yellow'),
        eye=dict(p=(0.115, -0.47, 1.03), r=0.022, mat='eye'),
        extras_lr=[eyepatch],
        wing=dict(stations=[(0.14, -0.14, 0.30, 0.74), (0.50, -0.18, 0.32, 0.76), (0.82, -0.16, 0.28, 0.78),
                            (1.02, -0.08, 0.22, 0.78), (1.25, 0.08, 0.14, 0.78)], wrist=2,
                  mat=lambda i, k: 'white' if i == 2 else ('tip' if i >= 3 else 'wing')),
        tail=dict(rows=[(0.40, 0.09, 0.66, 0.0), (0.80, 0.15, 0.62, 0.0), (0.92, 0.16, 0.61, 0.0)],
                  mat=lambda i, k: 'white' if i == 1 else 'tip'),
        legs=dict(hip=(0.09, 0.02, 0.40), foot_y=-0.02, r=[0.032, 0.026], mat='yellow', toe=0.13),
        bones=dict(body=((0, 0.02, 0.60), (0, -0.25, 0.60)), head=((0, -0.30, 0.80), (0, -0.54, 1.0)),
                   tail=((0, 0.40, 0.66), (0, 0.92, 0.61)), shoulder=(0.14, -0.08, 0.74), wrist=(0.82, -0.06, 0.78), tip=(1.25, 0.1, 0.78)),
        clip=dict(beat=0.26, amp=0.8, off=0.15, fold=(-1.25, 1.66, (0.1, 0.0, 0.0), 0.12), peck=(0.7, 0.55, 0.0)),
    )
    arm, ob = build_bird(A, S)
    A.meta.update(wingspan=2.5, length=1.66, perchClip='perch', flightClips=['flap', 'glide'])
    bird_clips(A, arm, S, ob)
    bird_previews(A, S)


@kit.asset('bat', 'prop', kind='bird', species='bat',
           flock=flock_meta(size=[3, 15], perch=['tree', 'ruin'], alt=[10, 45], speed=[35, 55], erratic=True, dusk=True,
                            habitat=['golconda', 'old_trees'], sound='squeak'))
def bat(A):
    bpy.context.scene.render.fps = FPS_F
    Mt = {
        'fur': mat('fur_dark', 'bt_fur', base='#4a382c'),
        'furl': mat('fur_dark', 'bt_furl', base='#6a5038'),
        'mem': mat('membrane', 'bt_mem', base='#3a2c28'),
        'eye': mat('feather_black', 'bt_eye', base='#0e0c0c'),
    }
    objs = []
    body = wloft('body', [
        (0.24, 0.50, 0.05, 0.04, Mt['fur'], 'body'),
        (0.12, 0.50, 0.11, 0.10, Mt['fur'], 'body'),
        (-0.02, 0.50, 0.13, 0.12, Mt['furl'], 'body'),
        (-0.14, 0.51, 0.11, 0.11, Mt['fur'], {'body': 0.5, 'head': 0.5}),
        (-0.20, 0.52, 0.09, 0.09, Mt['fur'], 'head'),
        (-0.27, 0.52, 0.075, 0.07, Mt['fur'], 'head'),
        (-0.32, 0.51, 0.035, 0.035, Mt['fur'], 'head'),
    ], 6, Mt['fur'])
    objs.append(body)
    for s in (1, -1):
        e = sheet('ear', [[(s * 0.03, -0.21, 0.56), (s * 0.08, -0.19, 0.56)], [(s * 0.075, -0.20, 0.68), (s * 0.08, -0.195, 0.68)]], Mt['mem'])
        kit.weights(e, 'head')
        o = octa('eye', (s * 0.05, -0.27, 0.545), 0.014, Mt['eye'])
        kit.weights(o, 'head')
        objs += [e, o]
    # membrane wings: arm along the leading edge, fingers, scalloped trailing edge
    st = [(0.08, -0.06, 0.24, 0.52), (0.25, -0.10, 0.32, 0.53), (0.45, -0.12, 0.22, 0.54),
          (0.66, -0.08, 0.34, 0.54), (0.82, -0.01, 0.16, 0.54), (1.00, 0.07, 0.11, 0.54)]
    for s, sfx in ((1, 'L'), (-1, 'R')):
        rows = [[(s * x, ly, z), (s * x, ly + (ty - ly) * 0.4, z + 0.015), (s * x, ty, z - 0.01)] for x, ly, ty, z in st]
        w = sheet('wing', rows, Mt['mem'])
        kit.weights(w, lambda co, sfx=sfx: {'wing_' + sfx: 1.0} if abs(co.x) < 0.40 else ({'wingtip_' + sfx: 1.0} if abs(co.x) > 0.5 else {'wing_' + sfx: 0.5, 'wingtip_' + sfx: 0.5}))
        objs.append(w)
        lg = P.taper('leg', [(s * 0.05, 0.16, 0.48), (s * 0.06, 0.30, 0.47)], [0.02, 0.012], seg=3, mat=Mt['fur'], cap_end=False)
        kit.weights(lg, 'body')
        objs.append(lg)
    tm = sheet('uro', [[(-0.06, 0.20, 0.49), (0.06, 0.20, 0.49)], [(-0.02, 0.36, 0.49), (0.02, 0.36, 0.49)]], Mt['mem'])
    kit.weights(tm, 'body')
    objs.append(tm)
    arm = P.rig(A, 'bat_rig', [
        ('root', (0, 0, 0), (0, -0.2, 0), None),
        ('body', (0, 0.05, 0.5), (0, -0.12, 0.5), 'root'),
        ('head', (0, -0.14, 0.51), (0, -0.30, 0.52), 'body'),
        ('wing_L', (0.08, -0.08, 0.52), (0.45, -0.10, 0.54), 'body'),
        ('wingtip_L', (0.45, -0.10, 0.54), (1.0, 0.07, 0.54), 'wing_L'),
        ('wing_R', (-0.08, -0.08, 0.52), (-0.45, -0.10, 0.54), 'body'),
        ('wingtip_R', (-0.45, -0.10, 0.54), (-1.0, 0.07, 0.54), 'wing_R'),
    ])
    ob = P.finish_prop(A, objs, size=64, double=True, ao_strength=0.4)
    P.skin(A, ob, arm)

    beats = 3
    amps = (0.95, 0.75, 1.05)

    def flap(t):
        k = min(beats - 1, int(t * beats))
        ph = t * beats - k
        c = math.cos(TAU * ph)
        a = amps[k]
        up = max(0.0, -math.sin(TAU * ph))
        Pd = {}
        LR(Pd, 'wing', qe(0.1 * math.sin(TAU * ph), -(a * 0.85 * c + 0.1), 0.25 * up))
        LR(Pd, 'wingtip', qe(0, -(0.6 * math.cos(TAU * ph - 0.8)), 0.7 * up))
        jit = math.sin(TAU * t) * 0.18 + math.sin(TAU * t * 2 + 1.3) * 0.08
        Pd['root'] = (qe(0.05 * math.sin(TAU * t * 2), jit * 0.6, jit * 0.5), (0.06 * math.sin(TAU * t + 0.4), 0, -0.05 * c))
        return Pd

    def glide(t):
        s1 = math.sin(TAU * t)
        Pd = {}
        LR(Pd, 'wing', qe(0, -(0.12 + 0.05 * s1), -0.05))
        LR(Pd, 'wingtip', qe(0, 0.05, 0.15))
        Pd['root'] = (qe(0, 0.12 * s1, 0.05 * math.sin(TAU * t * 2)), (0, 0, 0.03 * s1))
        return Pd

    def hang(t):
        Pd = {}
        # upside down: feet (0, 0.30, 0.47) -> origin, body hanging below, wings wrapped round the body
        Pd['root'] = (qe(math.pi / 2, 0, 0), (0, 0.47, -0.30))
        LR(Pd, 'wing', qe(0, 1.05, 1.45), (0.0, 0.0, -0.02))
        LR(Pd, 'wingtip', qe(0, 0.9, 2.2))
        sw = 0.05 * math.sin(TAU * t)
        Pd['body'] = (qe(0, 0, sw), None)
        Pd['head'] = (qe(-0.25 * win(t, 0.3, 0.38, 0.6, 0.7), 0, 0.5 * win(t, 0.15, 0.2, 0.42, 0.48) - 0.4 * win(t, 0.65, 0.7, 0.85, 0.9)), None)
        return Pd

    nf = int(round(0.18 * beats * FPS_F))
    mkclip(A, arm, 'flap', nf, flap, beats=beats, beat=round(nf / beats / FPS_F, 4))
    mkclip(A, arm, 'glide', int(1.5 * FPS_F), glide)
    mkclip(A, arm, 'hang', int(3.0 * FPS_F), hang, upsideDown=True)
    mkclip(A, arm, 'perch', int(3.0 * FPS_F), hang, upsideDown=True, alias='hang')
    check(A, arm, ob, ['flap', 'hang'])
    A.meta.update(wingspan=2.0, length=0.56, perchClip='hang', flightClips=['flap', 'glide'],
                  hangNote='hang/perch: feet at the origin (the branch), body hangs below (z < 0)')
    fr = A.clips['flap']['frames']
    A.preview = {
        'shots': [{'clip': 'flap', 'frame': fr // 6, 'size': 320, 'samples': 20, 'view': {'az': -25, 'el': 30, 'fov': 30}},
                  {'name': 'hang', 'clip': 'hang', 'frame': 0, 'size': 256, 'samples': 16, 'ground': False, 'view': {'az': -40, 'el': 10, 'fov': 30}}],
        'sheet': {'name': 'sheet', 'size': 160, 'samples': 10, 'cols': 8,
                  'view': {'az': -20, 'el': 14, 'fov': 30, 'target': (0, 0, 0.5), 'dist': 4.2},
                  'frames': [('flap', int(round(fr * k / 8))) for k in range(8)]},
    }


# =========================================================================== quadrupeds
def build_quad(A, Q):
    """Q: species spec. Returns (arm, ob, skel)."""
    bpy.context.scene.render.fps = FPS_F
    use_slim_export()
    Mt = Q['mats']
    objs = []
    J = Q['joints']
    yb0, yb1 = Q['split']          # torso: body (hips) behind yb0, chest in front of yb1

    legs = Q['legs']               # {leg: dict(P=, K=, F=, pts=[(y,z,r)], hoof=(r0, r1, h))}

    def torso_w(co):
        k = sstep((yb0 - co.y) / max(1e-6, yb0 - yb1))
        w = {'body': 1.0 - k, 'chest': k} if 0 < k < 1 else ({'body': 1.0} if k <= 0 else {'chest': 1.0})
        # flesh over the shoulder / thigh follows the upper leg a little
        for lg, L in legs.items():
            Pp = V(L['P'])
            if co.x * Pp.x <= 0:
                continue
            dy = abs(co.y - Pp.y)
            if dy < L.get('flesh', 1.0) and co.z < Pp.z + 0.1:
                f = L.get('flesh_w', 0.45) * (1 - dy / L.get('flesh', 1.0)) * sstep((Pp.z + 0.1 - co.z) / 0.8)
                if f > 0.02:
                    w = {b: x * (1 - f) for b, x in w.items()}
                    w['leg_%s_upper' % lg] = f
        return w
    tor = wloft('torso', Q['torso'], Q.get('seg', 10), Mt[Q['torso_mat']])
    kit.weights(tor, torso_w)
    objs.append(tor)
    nk = wloft('neck', Q['neck'], Q.get('seg_neck', 8), Mt[Q['neck_mat']])
    n0, n1 = V(J['neck'][0]), V(J['neck'][1])
    kit.weights(nk, lambda co: (lambda k: {'chest': 1 - k, 'neck': k} if k < 1 else {'neck': 1.0})(
        sstep(((co - n0).dot((n1 - n0).normalized())) / ((n1 - n0).length * 0.45))))
    objs.append(nk)
    hd = wloft('head', Q['head'], Q.get('seg_head', 8), Mt[Q['head_mat']])
    jz = Q['jaw_line']             # (y_from, z_below_centre_line_fn)
    kit.weights(hd, lambda co: {'jaw': 1.0} if jz(co) else {'head': 1.0})
    objs.append(hd)
    for fn in Q.get('extras', []):
        r = fn(Mt)
        objs += r if isinstance(r, list) else [r]
    # legs
    for lg, L in legs.items():
        x = L['P'][0]
        pts = [(x, y, z) for (y, z, r) in L['pts']]
        rad = [r for (y, z, r) in L['pts']]
        o = P.taper('leg_' + lg, pts, rad, seg=Q.get('seg_leg', 6), mat=Mt[L.get('mat', Q['leg_mat'])], cap_end=False)
        kit.weights(o, seg_weights([('leg_%s_upper' % lg, L['P'], L['K']), ('leg_%s_lower' % lg, L['K'], L['F'])], bw=0.15))
        objs.append(o)
        hy, hz = L['pts'][-1][0], L['pts'][-1][1]
        r0, r1 = L['hoof'][:2]
        hf = P.taper('hoof_' + lg, [(x, hy, hz), (x, hy - 0.04, 0.0)], [r0, r1], seg=Q.get('seg_leg', 6), mat=Mt[L.get('hoof_mat', 'hoof')], cap_end=True)
        kit.weights(hf, 'leg_%s_lower' % lg)
        objs.append(hf)
    bones = [('root', (0, 0, 0), (0, -1.0, 0), None),
             ('body', J['body'][0], J['body'][1], 'root'),
             ('chest', J['chest'][0], J['chest'][1], 'body'),
             ('neck', J['neck'][0], J['neck'][1], 'chest'),
             ('head', J['head'][0], J['head'][1], 'neck'),
             ('jaw', J['jaw'][0], J['jaw'][1], 'head')]
    for s, sfx in ((1, 'L'), (-1, 'R')):
        h, t = J['ear']
        bones.append(('ear_' + sfx, (s * h[0], h[1], h[2]), (s * t[0], t[1], t[2]), 'head'))
    bones += [('tail1', J['tail1'][0], J['tail1'][1], 'body'), ('tail2', J['tail2'][0], J['tail2'][1], 'tail1')]
    for lg, L in legs.items():
        par = 'chest' if lg[0] == 'F' else 'body'
        bones.append(('leg_%s_upper' % lg, L['P'], L['K'], par))
        bones.append(('leg_%s_lower' % lg, L['K'], L['F'], 'leg_%s_upper' % lg))
    arm = P.rig(A, A.id + '_rig', [(n, tuple(h), tuple(t), p) for n, h, t, p in bones])
    for o in objs:
        kit.smooth(o, 70.0)
    ob = P.finish_prop(A, objs, size=Q.get('tex', 128), double=False, ao_strength=0.55, orm=False)
    P.skin(A, ob, arm)
    return arm, ob, Skel(arm)


LEGS = ('FL', 'FR', 'HL', 'HR')


def gait_pose(Sk, Q, t, g, extra=None):
    """Locomotion pose at phase t: g = dict(stride, duty, offs{leg: phase}, lift{F,H}, bob, ...)."""
    Pd = {}
    bob = g.get('bob', 0.0)
    Pd['root'] = (None, (0, 0, bob * math.cos(TAU * 2 * t + g.get('bobph', 0.0))))
    if g.get('pitch'):
        Pd['body'] = (qe(g['pitch'] * math.sin(TAU * t + g.get('pitchph', 0.0)), 0, 0), None)
        Pd['chest'] = (qe(-g['pitch'] * 1.2 * math.sin(TAU * t + g.get('pitchph', 0.0)), 0, 0), None)
    if g.get('roll'):
        Pd['body'] = (qe(Pd.get('body', (qe(), None))[0].to_euler().x, g['roll'] * math.sin(TAU * t), 0), None)
    if extra:
        extra(Pd, t)
    D = g['stride'] * g['duty']
    for lg in LEGS:
        L = Q['legs'][lg]
        ph = (t - g['offs'][lg]) % 1.0
        y0 = L['F'][1] + g.get('reach', {}).get(lg[0], 0.0)
        z0 = L['F'][2]
        if ph < g['duty']:
            s = ph / g['duty']
            fy = y0 - D / 2 + D * s
            fz = z0
        else:
            s = (ph - g['duty']) / (1 - g['duty'])
            e = 0.5 - 0.5 * math.cos(math.pi * s)
            fy = y0 + D / 2 - D * e
            fz = z0 + g['lift'][lg[0]] * math.sin(math.pi * s) ** 0.8
        Sk.leg(Pd, lg, fy, fz, -1 if lg[0] == 'F' else 1)
    return Pd


def stand_legs(Sk, Q, Pd, spread=None):
    for lg in LEGS:
        L = Q['legs'][lg]
        dy = (spread or {}).get(lg, 0.0)
        Sk.leg(Pd, lg, L['F'][1] + dy, L['F'][2], -1 if lg[0] == 'F' else 1)
    return Pd


def loco_clip(A, arm, Sk, Q, name, nominal, frames, g, extra=None, gait='walk'):
    dur = frames / FPS_F
    g = dict(g, stride=nominal * dur)
    mkclip(A, arm, name, frames, lambda t: gait_pose(Sk, Q, t, g, extra), loco=True, stride=round(g['stride'], 3),
           nominal=nominal, duty=g['duty'], gait=gait, phase0='LH strike' if g['offs']['HL'] == 0 else 'see offs',
           footfall={k: round(v, 3) for k, v in g['offs'].items()})


def quad_previews(A, Q, main, frame, side_dist, tz, sheet_frames):
    A.preview = {
        'shots': [{'clip': main, 'frame': frame, 'size': 384, 'samples': 20, 'view': {'az': -40, 'el': 14, 'fov': 30}}],
        'sheet': {'name': 'sheet', 'size': 160, 'samples': 10, 'cols': 8,
                  'view': {'az': -90, 'el': 6, 'fov': 30, 'target': (0, -0.3 * side_dist / 4, tz), 'dist': side_dist},
                  'frames': sheet_frames},
    }


# ---------------------------------------------------------------- cow
@kit.asset('animal_cow', 'prop', kind='animal', species='cow', breed='zebu')
def animal_cow(A):
    Mt = {
        'hide': mat('fur_white', 'cw_hide', base='#e6dfd0', grime=0.45),
        'hide2': mat('fur_white', 'cw_hide2', base='#d6ccba', grime=0.5),
        'hump': mat('fur_white', 'cw_hump', base='#c8bcaa', grime=0.5),
        'face': mat('fur_white', 'cw_face', base='#ddd5c6'),
        'muzzle': mat('fur_dark', 'cw_muzzle', base='#3a3230'),
        'horn': mat('horn', 'cw_horn', base='#5a4c40'),
        'hoof': mat('hoof', 'cw_hoof'),
        'eye': mat('feather_black', 'cw_eye', base='#141010'),
        'tuft': mat('fur_dark', 'cw_tuft', base='#2a2420'),
        'ear': mat('fur_white', 'cw_ear', base='#d8ccb8'),
    }
    xL = 0.95

    def fleg(x):
        return dict(P=(x, -2.2, 4.3), K=(x, -2.2, 1.6), F=(x, -2.38, 0.0), flesh=0.9,
                    pts=[(-2.2, 4.4, 0.5), (-2.25, 3.0, 0.38), (-2.2, 1.6, 0.25), (-2.25, 0.75, 0.19), (-2.3, 0.38, 0.21)], hoof=(0.21, 0.25))

    def hleg(x):
        return dict(P=(x, 2.8, 4.6), K=(x, 3.35, 2.05), F=(x, 3.12, 0.0), flesh=1.0, flesh_w=0.55,
                    pts=[(2.8, 4.7, 0.62), (3.0, 3.3, 0.45), (3.35, 2.05, 0.22), (3.2, 0.9, 0.17), (3.15, 0.38, 0.2)], hoof=(0.2, 0.24))
    legs = {'FL': fleg(xL), 'FR': fleg(-xL), 'HL': hleg(xL), 'HR': hleg(-xL)}
    for k, L in legs.items():
        x = L['P'][0]
        L['P'], L['K'], L['F'] = (x,) + L['P'][1:], (x,) + L['K'][1:], (x,) + L['F'][1:]

    def ears_horns(M_):
        out = []
        for s, sfx in ((1, 'L'), (-1, 'R')):
            e = P.taper('ear', [(s * 0.42, -4.62, 5.95), (s * 0.85, -4.70, 5.80), (s * 1.30, -4.78, 5.50)], [0.16, 0.26, 0.08], seg=6, mat=M_['ear'], squash=0.3)
            kit.weights(e, 'ear_' + sfx)
            h = P.taper('horn', [(s * 0.30, -4.42, 6.20), (s * 0.55, -4.40, 6.60), (s * 0.50, -4.55, 6.95)], [0.14, 0.09, 0.025], seg=5, mat=M_['horn'])
            kit.weights(h, 'head')
            ey = octa('eye', (s * 0.50, -5.02, 5.72), 0.12, M_['eye'], sq=(0.6, 1.0, 0.8))
            kit.weights(ey, 'head')
            out += [e, h, ey]
        hump = P.blob('hump', 0.85, (0, -1.75, 6.15), subdiv=1, noise=0.04, scale=(0.85, 1.05, 0.95), mat=M_['hump'])
        kit.weights(hump, 'chest')
        dew = wloft('dewlap', [{'c': (0, -2.75, 3.75), 'r': (0.16, 0.35)}, {'c': (0, -3.5, 4.15), 'r': (0.15, 0.55)},
                               {'c': (0, -4.25, 4.85), 'r': (0.12, 0.35)}], 6, M_['hide2'])
        kit.weights(dew, lambda co: {'chest': 1.0} if co.y > -3.0 else {'neck': 1.0} if co.y < -3.6 else {'chest': 0.5, 'neck': 0.5})
        tail = P.taper('tail', [(0, 3.95, 6.0), (0, 4.22, 5.0), (0, 4.30, 3.8), (0, 4.26, 2.6)], [0.16, 0.1, 0.07, 0.05], seg=5, mat=M_['hide'])
        kit.weights(tail, seg_weights([('tail1', (0, 3.95, 6.05), (0, 4.28, 4.3)), ('tail2', (0, 4.28, 4.3), (0, 4.25, 2.4))], bw=0.3))
        tuft = P.blob('tuft', 0.26, (0, 4.25, 2.35), subdiv=1, noise=0.1, scale=(0.6, 0.6, 1.4), mat=M_['tuft'])
        kit.weights(tuft, 'tail2')
        return out + [hump, dew, tail, tuft]
    Q = dict(mats=Mt, tex=256, seg=12, seg_neck=10, seg_head=10, torso_mat='hide', neck_mat='hide', head_mat='face', leg_mat='hide',
             split=(0.2, -1.0),
             torso=[(3.95, 5.55, 0.65, 0.8, Mt['hide'], None, 2.4), (3.45, 5.3, 1.22, 1.35, Mt['hide'], None, 2.4),
                    (2.4, 5.05, 1.48, 1.55, Mt['hide'], None, 2.4), (0.8, 4.9, 1.62, 1.72, Mt['hide'], None, 2.3),
                    (-0.8, 4.95, 1.58, 1.68, Mt['hide2'], None, 2.3), (-2.0, 5.1, 1.38, 1.62, Mt['hide2'], None, 2.3),
                    (-2.9, 5.0, 1.08, 1.35, Mt['hide2'], None, 2.2), (-3.3, 4.95, 0.7, 0.9, Mt['hide2'], None, 2.2)],
             neck=[(-2.6, 5.5, 0.95, 1.15, Mt['hide2'], None), (-3.6, 5.65, 0.75, 0.95, Mt['hide2'], None), (-4.45, 5.85, 0.58, 0.72, Mt['face'], None)],
             head=[{'c': (0, -4.35, 6.1), 'r': (0.5, 0.45), 'mat': Mt['face']}, {'c': (0, -4.75, 5.85), 'r': (0.58, 0.55), 'mat': Mt['face']},
                   {'c': (0, -5.35, 5.25), 'r': (0.45, 0.42), 'mat': Mt['face']}, {'c': (0, -5.95, 4.72), 'r': (0.38, 0.38), 'mat': Mt['muzzle']},
                   {'c': (0, -6.3, 4.5), 'r': (0.36, 0.28), 'mat': Mt['muzzle']}],
             jaw_line=lambda co: co.y < -5.15 and co.z < 5.62 + (co.y + 5.15) * 0.85 - 0.12,
             legs=legs, extras=[ears_horns],
             joints=dict(body=((0, 1.0, 5.0), (0, -0.5, 5.0)), chest=((0, -0.5, 5.0), (0, -2.5, 5.2)),
                         neck=((0, -2.7, 5.6), (0, -4.4, 5.95)), head=((0, -4.4, 5.95), (0, -5.6, 5.0)),
                         jaw=((0, -5.0, 5.2), (0, -6.2, 4.35)), ear=((0.42, -4.62, 5.95), (1.3, -4.78, 5.5)),
                         tail1=((0, 3.95, 6.05), (0, 4.28, 4.3)), tail2=((0, 4.28, 4.3), (0, 4.25, 2.4))))
    arm, ob, Sk = build_quad(A, Q)

    def idle_head(Pd, t, chew=True, look=0.3):
        yaw = look * win(t, 0.30, 0.40, 0.62, 0.72)
        Pd['neck'] = (qe(0.04 * win(t, 0.05, 0.12, 0.2, 0.28), 0, yaw), None)
        Pd['head'] = (qe(0, 0, 0.5 * yaw), None)
        if chew:
            Pd['jaw'] = (qe(0.04 + 0.03 * math.sin(TAU * 7 * t), 0, 0.05 * math.sin(TAU * 7 * t)), None)
        LR(Pd, 'ear', qe(0.6 * win(t, 0.18, 0.2, 0.22, 0.25), 0, 0))
        Pd['ear_R'] = (mir(qe(0.6 * win(t, 0.80, 0.82, 0.84, 0.87), 0, 0)), None)

    def tail_swish(Pd, t, a=0.35):
        sw = a * (win(t, 0.45, 0.52, 0.56, 0.63) - win(t, 0.58, 0.64, 0.7, 0.78))
        Pd['tail1'] = (qe(0, sw, 0), None)
        Pd['tail2'] = (qe(0, sw * 1.4, 0), None)

    def stand(t):
        Pd = {}
        Pd['root'] = (None, (0, 0, 0.02 * math.sin(TAU * 2 * t)))
        idle_head(Pd, t)
        tail_swish(Pd, t)
        return stand_legs(Sk, Q, Pd)

    def walk_extra(Pd, t):
        Pd['neck'] = (qe(0.05 * math.sin(TAU * 2 * t + 0.6), 0, 0.03 * math.sin(TAU * t)), None)
        Pd['head'] = (qe(-0.03 * math.sin(TAU * 2 * t + 0.6), 0, 0), None)
        Pd['tail1'] = (qe(0, 0.08 * math.sin(TAU * t), 0), None)
        Pd['tail2'] = (qe(0, 0.12 * math.sin(TAU * t - 0.8), 0), None)
    mkclip(A, arm, 'stand', 4 * FPS_F, stand)
    loco_clip(A, arm, Sk, Q, 'walk', 25.0, 14,
              dict(duty=0.64, offs={'HL': 0.0, 'FL': 0.25, 'HR': 0.5, 'FR': 0.75}, lift={'F': 0.7, 'H': 0.55}, bob=0.07, bobph=0.0),
              extra=walk_extra, gait='lateral walk')

    LIE_DROP = Q.get('lie_drop', 2.95)

    def lie(t):
        Pd = {}
        Pd['root'] = (qe(0, 0.07, 0), (0, 0, -LIE_DROP))
        # forelegs folded under the chest (carpus forward), hind legs tucked to the left
        for lg, s in (('FL', 1), ('FR', -1)):
            Pd['leg_%s_upper' % lg] = (qe(-1.2, 0, 0), None)
            Pd['leg_%s_lower' % lg] = (qe(2.75, 0, 0), None)
        Pd['leg_HL_upper'] = (qe(-1.2, 0.5, 0), None)
        Pd['leg_HL_lower'] = (qe(2.2, 0, 0), None)
        Pd['leg_HR_upper'] = (qe(-1.3, 0.9, 0.3), None)
        Pd['leg_HR_lower'] = (qe(2.3, 0, 0), None)
        idle_head(Pd, t, look=0.45)
        Pd['neck'] = (qe(0.12, 0, Pd['neck'][0].to_euler().z), None)
        Pd['tail1'] = (qe(-0.6, 0.9, 0), None)
        Pd['tail2'] = (qe(-0.4, 0.3 + 0.15 * win(t, 0.5, 0.55, 0.6, 0.66), 0), None)
        return Pd
    mkclip(A, arm, 'lie', 4 * FPS_F, lie)
    check(A, arm, ob, ['stand', 'walk', 'lie'], feet=['leg_%s_lower' % l for l in LEGS])
    A.meta.update(height=7.0, length=11.0, idleClip='stand', restClip='lie', walkClip='walk', loco={'walk': 25.0})
    nw = A.clips['walk']['frames']
    quad_previews(A, Q, 'stand', 0, 44, 3.6,
                  [('walk', int(round(nw * k / 6))) for k in range(6)] + [('lie', 0), ('stand', 90)])


# ---------------------------------------------------------------- dog
@kit.asset('animal_dog', 'prop', kind='animal', species='dog', breed='indian_pariah')
def animal_dog(A):
    Mt = {
        'coat': mat('fur_tan', 'dg_coat', base='#c08a50'),
        'back': mat('fur_tan', 'dg_back', base='#a87440'),
        'pale': mat('fur_tan', 'dg_pale', base='#e2c79a'),
        'muzzle': mat('fur_dark', 'dg_muzzle', base='#4a3424'),
        'nose': mat('feather_black', 'dg_nose', base='#141212', rough=0.4),
        'eye': mat('feather_black', 'dg_eye', base='#1a120c'),
        'hoof': mat('fur_tan', 'dg_paw', base='#d8bc90'),
        'ear': mat('fur_tan', 'dg_ear', base='#b07a42'),
    }

    def fleg(x):
        return dict(P=(x, -1.3, 2.15), K=(x, -1.3, 0.55), F=(x, -1.42, 0.0), flesh=0.6, flesh_w=0.4, mat='pale',
                    pts=[(-1.3, 2.2, 0.2), (-1.3, 1.25, 0.14), (-1.3, 0.55, 0.095), (-1.36, 0.14, 0.085)], hoof=(0.1, 0.12))

    def hleg(x):
        return dict(P=(x, 1.45, 2.2), K=(x, 1.9, 0.7), F=(x, 1.74, 0.0), flesh=0.7, flesh_w=0.5,
                    pts=[(1.45, 2.25, 0.3), (1.4, 1.5, 0.21), (1.9, 0.7, 0.1), (1.76, 0.14, 0.085)], hoof=(0.1, 0.12))
    legs = {'FL': fleg(0.28), 'FR': fleg(-0.28), 'HL': hleg(0.3), 'HR': hleg(-0.3)}

    def extras(M_):
        out = []
        for s, sfx in ((1, 'L'), (-1, 'R')):
            e = P.taper('ear', [(s * 0.15, -2.12, 3.75), (s * 0.21, -2.10, 4.05), (s * 0.25, -2.08, 4.3)], [0.13, 0.08, 0.0], seg=4, mat=M_['ear'], squash=0.35)
            kit.weights(e, 'ear_' + sfx)
            ey = octa('eye', (s * 0.17, -2.53, 3.62), 0.05, M_['eye'], sq=(0.6, 1.0, 0.8))
            kit.weights(ey, 'head')
            out += [e, ey]
        nose = octa('nose', (0, -3.17, 3.29), 0.07, M_['nose'], sq=(1.0, 0.8, 0.8))
        kit.weights(nose, 'head')
        tail = P.taper('tail', [(0, 1.85, 2.55), (0, 2.12, 2.95), (0, 2.18, 3.4), (0, 1.95, 3.68), (0, 1.62, 3.62)],
                       [0.12, 0.11, 0.1, 0.08, 0.03], seg=5, mat=M_['back'])
        kit.weights(tail, seg_weights([('tail1', (0, 1.85, 2.6), (0, 2.15, 3.2)), ('tail2', (0, 2.15, 3.2), (0, 1.6, 3.6))], bw=0.2))
        return out + [nose, tail]
    Q = dict(mats=Mt, tex=128, seg=10, seg_neck=8, seg_head=8, seg_leg=5, torso_mat='coat', neck_mat='coat', head_mat='coat', leg_mat='coat',
             split=(0.3, -0.6),
             torso=[(1.85, 2.38, 0.3, 0.32, Mt['back'], None), (1.6, 2.32, 0.5, 0.52, Mt['coat'], None),
                    (0.7, 2.35, 0.46, 0.46, Mt['coat'], None), (-0.4, 2.3, 0.55, 0.68, Mt['coat'], None),
                    (-1.3, 2.42, 0.5, 0.62, Mt['pale'], None), (-1.72, 2.48, 0.32, 0.42, Mt['pale'], None)],
             neck=[(-1.45, 2.7, 0.38, 0.42, Mt['coat'], None), (-1.8, 3.1, 0.3, 0.32, Mt['coat'], None), (-2.05, 3.4, 0.27, 0.28, Mt['coat'], None)],
             head=[{'c': (0, -1.95, 3.58), 'r': (0.28, 0.3), 'mat': Mt['coat']}, {'c': (0, -2.3, 3.56), 'r': (0.32, 0.3), 'mat': Mt['coat']},
                   {'c': (0, -2.62, 3.45), 'r': (0.2, 0.19), 'mat': Mt['coat']}, {'c': (0, -2.95, 3.32), 'r': (0.14, 0.13), 'mat': Mt['muzzle']},
                   {'c': (0, -3.15, 3.28), 'r': (0.09, 0.08), 'mat': Mt['muzzle']}],
             jaw_line=lambda co: co.y < -2.6 and co.z < 3.30,
             legs=legs, extras=[extras],
             joints=dict(body=((0, 0.9, 2.3), (0, -0.2, 2.3)), chest=((0, -0.2, 2.3), (0, -1.4, 2.45)),
                         neck=((0, -1.4, 2.65), (0, -2.0, 3.4)), head=((0, -2.0, 3.45), (0, -2.9, 3.35)),
                         jaw=((0, -2.5, 3.3), (0, -3.1, 3.2)), ear=((0.15, -2.12, 3.75), (0.25, -2.08, 4.3)),
                         tail1=((0, 1.85, 2.6), (0, 2.15, 3.2)), tail2=((0, 2.15, 3.2), (0, 1.6, 3.6))))
    arm, ob, Sk = build_quad(A, Q)

    def wag(Pd, t, n=2, a=0.35):
        Pd['tail1'] = (qe(0, 0, a * math.sin(TAU * n * t)), None)
        Pd['tail2'] = (qe(0, 0, a * 0.8 * math.sin(TAU * n * t - 0.7)), None)

    def walk_extra(Pd, t):
        Pd['neck'] = (qe(0.05 * math.sin(TAU * 2 * t), 0, 0), None)
        wag(Pd, t, 1, 0.15)
    loco_clip(A, arm, Sk, Q, 'walk', 22.0, 10,
              dict(duty=0.56, offs={'HL': 0.0, 'FR': 0.06, 'HR': 0.5, 'FL': 0.56}, lift={'F': 0.38, 'H': 0.32}, bob=0.04),
              extra=walk_extra, gait='trot-walk')

    def run_extra(Pd, t):
        Pd['neck'] = (qe(0.25 + 0.1 * math.sin(TAU * t + 2.2), 0, 0), None)
        Pd['head'] = (qe(-0.2, 0, 0), None)
        Pd['tail1'] = (qe(-0.9, 0, 0), None)
        Pd['tail2'] = (qe(-0.5 + 0.2 * math.sin(TAU * t), 0, 0), None)
        LR(Pd, 'ear', qe(0.5, 0, 0))
    loco_clip(A, arm, Sk, Q, 'run', 65.0, 8,
              dict(duty=0.3, offs={'HL': 0.0, 'HR': 0.1, 'FR': 0.42, 'FL': 0.52}, lift={'F': 0.6, 'H': 0.5}, bob=0.12, bobph=1.0,
                   pitch=0.12, pitchph=0.5, reach={'F': -0.15, 'H': 0.05}),
              extra=run_extra, gait='rotary gallop')

    SIT_P = -0.75

    def sit(t):
        Pd = {}
        Pd['root'] = (None, (0, 0.25, -0.62))
        Pd['body'] = (qe(SIT_P, 0, 0), None)
        Pd['chest'] = (qe(0.1, 0, 0), None)
        look = 0.45 * win(t, 0.25, 0.32, 0.5, 0.58) - 0.35 * win(t, 0.7, 0.76, 0.86, 0.92)
        Pd['neck'] = (qe(0.5, 0, look), None)
        Pd['head'] = (qe(0.05 + 0.08 * win(t, 0.6, 0.63, 0.66, 0.7), 0, 0.5 * look), None)
        LR(Pd, 'ear', qe(0.4 * win(t, 0.1, 0.12, 0.14, 0.17), 0, 0))
        Pd['jaw'] = (qe(0.12 + 0.06 * math.sin(TAU * 8 * t), 0, 0), None)   # panting
        Pd['tail1'] = (qe(1.4, 0, 0.3), None)
        Pd['tail2'] = (qe(0.3, 0, 0.6 + 0.2 * math.sin(TAU * 3 * t)), None)
        for lg in ('FL', 'FR'):
            L = Q['legs'][lg]
            Sk.leg(Pd, lg, L['F'][1] + 0.15, 0.0, -1)
        for lg in ('HL', 'HR'):
            L = Q['legs'][lg]
            Sk.leg(Pd, lg, L['F'][1] - 1.0, 0.0, 1)
        return Pd

    def lie(t):
        Pd = {}
        br = 0.03 * math.sin(TAU * 3 * t)
        Pd['root'] = (qe(0, 0.45, 0), (0.25, 0, -1.48))
        Pd['body'] = (qe(0, 0, -0.35), None)
        Pd['chest'] = (qe(0, br, 0.55), None)
        Pd['neck'] = (qe(0.55, 0, 0.75), None)
        Pd['head'] = (qe(0.2 - 0.05 * win(t, 0.55, 0.6, 0.7, 0.75), -0.3, 0.3), None)
        LR(Pd, 'ear', qe(0.9, 0, 0.3))
        Pd['ear_R'] = (mir(qe(0.9 + 0.5 * win(t, 0.4, 0.42, 0.44, 0.47), 0, 0.3)), None)
        for lg in ('FL', 'FR'):
            Pd['leg_%s_upper' % lg] = (qe(-1.35, 0, 0.0), None)
            Pd['leg_%s_lower' % lg] = (qe(0.6, 0, 0), None)
        for lg in ('HL', 'HR'):
            Pd['leg_%s_upper' % lg] = (qe(-1.4, 0, 0), None)
            Pd['leg_%s_lower' % lg] = (qe(1.4, 0, 0), None)
        Pd['tail1'] = (qe(1.5, 0, -0.9), None)
        Pd['tail2'] = (qe(0.3, 0, -1.2), None)
        return Pd
    mkclip(A, arm, 'sit', 3 * FPS_F, sit)
    mkclip(A, arm, 'lie', 4 * FPS_F, lie)
    check(A, arm, ob, ['walk', 'run', 'sit', 'lie'], feet=['leg_%s_lower' % l for l in LEGS])
    A.meta.update(height=3.0, length=4.6, idleClip='sit', restClip='lie', walkClip='walk', runClip='run', loco={'walk': 22.0, 'run': 65.0})
    nw, nr = A.clips['walk']['frames'], A.clips['run']['frames']
    quad_previews(A, Q, 'walk', 0, 15, 1.8,
                  [('walk', int(round(nw * k / 4))) for k in range(4)] + [('run', int(round(nr * k / 4))) for k in range(4)])
    A.preview['shots'].append({'name': 'rest', 'clip': 'sit', 'frame': 30, 'size': 320, 'samples': 16, 'view': {'az': -60, 'el': 16, 'fov': 30}})
    A.preview['shots'].append({'name': 'lie', 'clip': 'lie', 'frame': 0, 'size': 320, 'samples': 16, 'view': {'az': -30, 'el': 35, 'fov': 30}})


# ---------------------------------------------------------------- goat
@kit.asset('animal_goat', 'prop', kind='animal', species='goat')
def animal_goat(A):
    Mt = {
        'brown': mat('fur_tan', 'gt_brown', base='#6a4428'),
        'dark': mat('fur_dark', 'gt_dark', base='#2e2420'),
        'white': mat('fur_white', 'gt_white', base='#e8e2d4'),
        'face': mat('fur_tan', 'gt_face', base='#5a3a24'),
        'horn': mat('horn', 'gt_horn', base='#6a5e50'),
        'hoof': mat('hoof', 'gt_hoof'),
        'eye': mat('feather_black', 'gt_eye', base='#c8a040'),
    }

    def fleg(x):
        return dict(P=(x, -1.05, 2.0), K=(x, -1.05, 0.62), F=(x, -1.12, 0.0), flesh=0.5, flesh_w=0.35, mat='white',
                    pts=[(-1.05, 2.05, 0.2), (-1.05, 1.2, 0.12), (-1.05, 0.62, 0.075), (-1.08, 0.18, 0.07)], hoof=(0.075, 0.09))

    def hleg(x):
        return dict(P=(x, 1.2, 2.1), K=(x, 1.5, 0.8), F=(x, 1.38, 0.0), flesh=0.6, flesh_w=0.45, mat='white',
                    pts=[(1.2, 2.15, 0.26), (1.28, 1.45, 0.17), (1.5, 0.8, 0.08), (1.4, 0.18, 0.07)], hoof=(0.075, 0.09))
    legs = {'FL': fleg(0.24), 'FR': fleg(-0.24), 'HL': hleg(0.26), 'HR': hleg(-0.26)}

    def extras(M_):
        out = []
        for s, sfx in ((1, 'L'), (-1, 'R')):
            e = P.taper('ear', [(s * 0.18, -1.78, 3.52), (s * 0.42, -1.86, 3.32), (s * 0.5, -1.95, 3.05)], [0.08, 0.12, 0.04], seg=5, mat=M_['brown'], squash=0.3)
            kit.weights(e, 'ear_' + sfx)
            h = P.taper('horn', [(s * 0.1, -1.76, 3.68), (s * 0.13, -1.62, 3.92), (s * 0.16, -1.42, 3.98)], [0.06, 0.04, 0.008], seg=4, mat=M_['horn'])
            kit.weights(h, 'head')
            ey = octa('eye', (s * 0.2, -1.98, 3.45), 0.045, M_['eye'], sq=(0.6, 1.0, 0.8))
            kit.weights(ey, 'head')
            out += [e, h, ey]
        beard = P.taper('beard', [(0, -2.2, 3.0), (0, -2.15, 2.72)], [0.05, 0.01], seg=4, mat=M_['dark'])
        kit.weights(beard, 'jaw')
        tail = P.taper('tail', [(0, 1.62, 2.55), (0, 1.75, 2.82), (0, 1.8, 2.98)], [0.08, 0.06, 0.02], seg=4, mat=M_['brown'])
        kit.weights(tail, seg_weights([('tail1', (0, 1.6, 2.55), (0, 1.74, 2.8)), ('tail2', (0, 1.74, 2.8), (0, 1.8, 2.98))], bw=0.1))
        return out + [beard, tail]
    Q = dict(mats=Mt, tex=128, seg=10, seg_neck=8, seg_head=8, seg_leg=5, torso_mat='brown', neck_mat='white', head_mat='face', leg_mat='white',
             split=(0.3, -0.5),
             torso=[(1.62, 2.38, 0.3, 0.34, Mt['brown'], None), (1.35, 2.32, 0.5, 0.56, Mt['brown'], None),
                    (0.4, 2.22, 0.62, 0.68, Mt['brown'], None), (-0.55, 2.3, 0.55, 0.62, Mt['white'], None),
                    (-1.15, 2.4, 0.45, 0.55, Mt['white'], None), (-1.45, 2.42, 0.3, 0.38, Mt['white'], None)],
             neck=[(-1.25, 2.7, 0.33, 0.38, Mt['white'], None), (-1.55, 3.0, 0.27, 0.3, Mt['white'], None), (-1.75, 3.3, 0.24, 0.26, Mt['white'], None)],
             head=[{'c': (0, -1.7, 3.55), 'r': (0.24, 0.25), 'mat': Mt['face']}, {'c': (0, -1.95, 3.42), 'r': (0.24, 0.22), 'mat': Mt['face']},
                   {'c': (0, -2.22, 3.16), 'r': (0.15, 0.15), 'mat': Mt['face']}, {'c': (0, -2.38, 3.02), 'r': (0.11, 0.1), 'mat': Mt['dark']}],
             jaw_line=lambda co: co.y < -2.1 and co.z < 3.08,
             legs=legs, extras=[extras],
             joints=dict(body=((0, 0.8, 2.3), (0, -0.2, 2.3)), chest=((0, -0.2, 2.3), (0, -1.2, 2.4)),
                         neck=((0, -1.2, 2.6), (0, -1.72, 3.4)), head=((0, -1.72, 3.45), (0, -2.35, 3.05)),
                         jaw=((0, -2.0, 3.1), (0, -2.4, 2.95)), ear=((0.18, -1.78, 3.52), (0.5, -1.95, 3.05)),
                         tail1=((0, 1.6, 2.55), (0, 1.74, 2.8)), tail2=((0, 1.74, 2.8), (0, 1.8, 2.98))))
    arm, ob, Sk = build_quad(A, Q)

    def stand(t):
        Pd = {}
        yaw = 0.4 * win(t, 0.2, 0.28, 0.45, 0.53) - 0.3 * win(t, 0.7, 0.76, 0.86, 0.92)
        Pd['neck'] = (qe(0, 0, yaw), None)
        Pd['head'] = (qe(0.1 * win(t, 0.55, 0.6, 0.64, 0.68), 0, 0.4 * yaw), None)
        Pd['jaw'] = (qe(0.03, 0, 0.06 * math.sin(TAU * 8 * t)), None)
        LR(Pd, 'ear', qe(0, 0.25 * win(t, 0.1, 0.12, 0.15, 0.2), 0))
        Pd['tail1'] = (qe(-0.5 * (win(t, 0.4, 0.42, 0.44, 0.46) + win(t, 0.47, 0.49, 0.51, 0.53)), 0, 0), None)
        return stand_legs(Sk, Q, Pd)

    def walk_extra(Pd, t):
        Pd['neck'] = (qe(0.06 * math.sin(TAU * 2 * t + 0.5), 0, 0), None)
        LR(Pd, 'ear', qe(0, 0.12 * math.sin(TAU * 2 * t), 0))
    mkclip(A, arm, 'stand', 3 * FPS_F, stand)
    loco_clip(A, arm, Sk, Q, 'walk', 12.0, 14,
              dict(duty=0.62, offs={'HL': 0.0, 'FL': 0.25, 'HR': 0.5, 'FR': 0.75}, lift={'F': 0.32, 'H': 0.26}, bob=0.04),
              extra=walk_extra, gait='lateral walk')

    def graze(t):
        Pd = {}
        Pd['chest'] = (qe(0.12, 0, 0), None)
        Pd['neck'] = (qe(1.25 + 0.05 * win(t, 0.3, 0.34, 0.4, 0.44), 0, 0.15 * win(t, 0.5, 0.6, 0.85, 0.95)), None)
        Pd['head'] = (qe(0.35 - 0.12 * (win(t, 0.3, 0.33, 0.36, 0.4) + win(t, 0.7, 0.73, 0.76, 0.8)), 0, 0), None)
        Pd['jaw'] = (qe(0.05 + 0.05 * math.sin(TAU * 9 * t), 0, 0.05 * math.sin(TAU * 9 * t)), None)
        LR(Pd, 'ear', qe(0, 0.3, 0))
        Pd['tail1'] = (qe(-0.4 * win(t, 0.62, 0.64, 0.66, 0.69), 0, 0), None)
        return stand_legs(Sk, Q, Pd, spread={'FL': -0.2, 'FR': -0.1})
    mkclip(A, arm, 'graze', 3 * FPS_F, graze)
    check(A, arm, ob, ['stand', 'walk', 'graze'], feet=['leg_%s_lower' % l for l in LEGS])
    A.meta.update(height=3.5, shoulder=3.0, length=4.4, idleClip='stand', walkClip='walk', loco={'walk': 12.0})
    nw = A.clips['walk']['frames']
    quad_previews(A, Q, 'stand', 0, 15, 1.8,
                  [('walk', int(round(nw * k / 6))) for k in range(6)] + [('graze', 40), ('stand', 30)])
