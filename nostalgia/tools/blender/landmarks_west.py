"""NOSTALGIA — tools/blender/landmarks_west.py — landmarks of the west + north + places of worship (ARCHITECTURE §21).
Build: /home/user/.venvs/blender/bin/python tools/blender/build_all.py <ids>   (--list shows them)
The builders live in the part modules imported below (one per area, shared helpers in _lmkit.py)."""
import _lm_golconda  # noqa: F401  Golconda Fort (Bala Hissar, gates), Qutb Shahi Tombs
import _lm_modern    # noqa: F401  Cyber Towers, HITEC, Begumpet airport, OU Arts College, Spanish Mosque
import _lm_worship   # noqa: F401  churches, temples, kits for neighbourhood temples / mosques / churches / dargahs
