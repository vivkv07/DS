"""NOSTALGIA — tools/blender/landmarks_west.py — landmarks of the west + north (ARCHITECTURE §21).
Build: /home/user/.venvs/blender/bin/python tools/blender/build_all.py <ids>   (--list shows them)
The builders live in the part modules imported below (shared helpers in _lmkit.py).
Pack budget: see landmarks_centre.py; _lm_worship.py (churches, temples, neighbourhood kits) is parked
(kept as source, not imported) until the pack has room."""
import _lm_golconda  # noqa: F401  Golconda Fort (Bala Hissar, Fateh/Banjara Darwaza), Qutb Shahi Tombs
import _lm_modern    # noqa: F401  Cyber Towers
import os
if os.environ.get('NOSTALGIA_PARKED') == '1':
    import _lm_worship  # noqa: F401
