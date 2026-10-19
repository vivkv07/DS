"""NOSTALGIA — tools/blender/landmarks_oldcity.py — the Old City landmark set (ARCHITECTURE §21).

    /home/user/.venvs/blender/bin/python tools/blender/build_all.py charminar kaman ...

The builders live in tools/blender/oldcity/ (one module per group, helpers in oldcity/common.py);
importing them here registers every @kit.asset with build_all.py.
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

MODULES = ['charminar', 'chowk', 'mosques_palaces', 'bazaar', 'civic']
for _m in MODULES:
    if os.path.exists(os.path.join(HERE, 'oldcity', _m + '.py')):
        importlib.import_module('oldcity.' + _m)
