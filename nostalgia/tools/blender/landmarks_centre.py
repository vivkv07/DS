"""NOSTALGIA — tools/blender/landmarks_centre.py — landmarks of the centre + Hussain Sagar (ARCHITECTURE §21).
Build: /home/user/.venvs/blender/bin/python tools/blender/build_all.py <ids>   (--list shows them)
The builders live in the part modules imported below (shared helpers in _lmkit.py).
Pack budget: all of landmarks_centre + landmarks_west share ~900 KB of the 8 MB pack, so only the
most-seen landmarks are registered; _lm_city.py (bus stands, Secretariat, RTC X Roads cinemas, park
gates...) is parked (kept as source, not imported) until the pack has room."""
import _lm_hussain  # noqa: F401  Birla Mandir, Buddha, Tank Bund statues, Lumbini jetty + musical fountain
import _lm_civic    # noqa: F401  Assembly, Public Gardens (Jubilee Hall, State Museum), Nampally, Kachiguda
import _lm_venues   # noqa: F401  LB Stadium, Prasads IMAX
