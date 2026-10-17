"""NOSTALGIA — tools/blender/build_all.py — build the Blender assets (ARCHITECTURE §21).

    /home/user/.venvs/blender/bin/python tools/blender/build_all.py              # every asset
    /home/user/.venvs/blender/bin/python tools/blender/build_all.py kid_chinnu   # some ids
    ... --list            list registered assets (id, family, script)
    ... --no-preview      skip the Cycles preview renders (fast iteration on geometry)
    ... --quick           export only (no previews), for smoke checks
    ... --pack            run `node tools/pack_assets3d.cjs` afterwards (src/assets3d_pack.js)
    ... -j 2              build up to 2 assets in parallel (each in its own Blender process)

Every *.py next to this file except kit.py / build_all.py is an asset-family script that
registers builders with @kit.asset(id, family, ...). Each asset is built in a fresh Blender
process (`--one <id>`), so scenes never leak into each other. Outputs: assets3d/<id>.glb,
assets3d/<id>.json (manifest), assets3d/previews/<id>*.png and assets3d/previews/_sheet.png.
Exit status is non-zero when an asset fails or is over its triangle budget.
"""
import os
import sys
import glob
import json
import time
import importlib
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PY = sys.executable


def family_modules():
    mods = []
    for p in sorted(glob.glob(os.path.join(HERE, '*.py'))):
        n = os.path.splitext(os.path.basename(p))[0]
        if n in ('kit', 'build_all') or n.startswith('_'):
            continue
        mods.append(n)
    return mods


def load_registry():
    import kit
    for m in family_modules():
        importlib.import_module(m)
    return kit


def run_one(aid, previews, quick):
    kit = load_registry()
    if aid not in kit.REGISTRY:
        print('unknown asset id', aid, file=sys.stderr)
        return 2
    man = kit.run_asset(aid, previews=previews, quick=quick)
    budget = man.get('budget')
    return 3 if (budget and man['tris'] > budget) else 0


NOISE = ('Draco is not available', 'MeshOptimizer is not available', 'Starting glTF', 'Extracting primitive', 'Primitives created', 'Finished glTF', 'Fra:', 'Sample ', 'Saved:', 'Time:')


def spawn(aid, args):
    cmd = [PY, os.path.abspath(__file__), '--one', aid] + [a for a in args if a in ('--no-preview', '--quick')]
    log_path = os.path.join(ROOT, 'assets3d', 'logs', aid + '.log')
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    f = open(log_path, 'w')
    p = subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT, cwd=HERE)
    return p, f, log_path


def main(argv):
    if '--one' in argv:
        aid = argv[argv.index('--one') + 1]
        return run_one(aid, previews='--no-preview' not in argv, quick='--quick' in argv)
    kit = load_registry()
    if '--list' in argv:
        for aid, e in sorted(kit.REGISTRY.items()):
            print('%-22s %-14s %s' % (aid, e['family'], e['module'] + '.py'))
        return 0
    jobs = 1
    if '-j' in argv:
        jobs = max(1, int(argv[argv.index('-j') + 1]))
    ids = [a for a in argv if not a.startswith('-') and not a.isdigit()]
    ids = ids or sorted(kit.REGISTRY.keys())
    bad = [a for a in ids if a not in kit.REGISTRY]
    if bad:
        print('unknown asset ids:', bad, file=sys.stderr)
        return 2
    t0 = time.time()
    pending = list(ids)
    running = []
    results = {}
    while pending or running:
        while pending and len(running) < jobs:
            aid = pending.pop(0)
            p, f, lp = spawn(aid, argv)
            running.append((aid, p, f, lp, time.time()))
            print('[build] %s ...' % aid, flush=True)
        time.sleep(0.5)
        for r in list(running):
            aid, p, f, lp, ts = r
            if p.poll() is None:
                continue
            f.close()
            running.remove(r)
            results[aid] = p.returncode
            tail = [l.rstrip() for l in open(lp, errors='replace') if l.startswith('[kit]') or 'Error' in l or 'Traceback' in l or 'error' in l.lower()]
            for l in tail[-14:]:
                if not any(n in l for n in NOISE):
                    print('   ' + l)
            print('[build] %s %s in %.0fs (log %s)' % (aid, 'ok' if p.returncode == 0 else 'FAILED (%d)' % p.returncode, time.time() - ts, os.path.relpath(lp, ROOT)), flush=True)
    # summary table from the manifests
    print('\n%-20s %-13s %8s %8s %8s  %s' % ('asset', 'family', 'tris', 'budget', 'KB', 'clips / anchors'))
    for aid in ids:
        mp = os.path.join(ROOT, 'assets3d', aid + '.json')
        if not os.path.exists(mp):
            print('%-20s (no manifest)' % aid)
            continue
        m = json.load(open(mp))
        print('%-20s %-13s %8d %8s %8.1f  %s / %s' % (aid, m['family'], m['tris'], m.get('budget'), m['kb'], ','.join(m.get('clips', {}).keys()) or '-', ','.join(sorted(m.get('anchors', {}).keys()))[:60] or '-'))
    # overview contact sheet of the main previews
    if '--no-preview' not in argv and '--quick' not in argv:
        try:
            import bpy  # noqa: F401
            prev = [os.path.join(ROOT, 'assets3d', 'previews', a + '.png') for a in sorted(kit.REGISTRY.keys())]
            kit.contact_sheet([p for p in prev if os.path.exists(p)], os.path.join(ROOT, 'assets3d', 'previews', '_sheet.png'), cols=4, cell=256)
            print('contact sheet: assets3d/previews/_sheet.png')
        except Exception as e:
            print('contact sheet failed:', e)
    if '--pack' in argv:
        r = subprocess.call(['node', os.path.join(ROOT, 'tools', 'pack_assets3d.cjs')], cwd=ROOT)
        if r:
            return r
    print('built %d asset(s) in %.0fs' % (len(ids), time.time() - t0))
    return 0 if all(v == 0 for v in results.values()) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
