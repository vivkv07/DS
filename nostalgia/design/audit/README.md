# NOSTALGIA — end-to-end audit (Oct 2026)

Four lanes, each played for real (keyboard, touch, gamepad; desktop and phone; 2D and 3D), fixed in place with
regression tests, then a second round for cross-lane and pre-existing items. Detail per lane:
[journey.md](journey.md) · [gameplay.md](gameplay.md) · [performance.md](performance.md) · [online.md](online.md).

## Headline results

| Lane | Findings | Fixed | Biggest wins |
|---|---|---|---|
| Journey (story, saves, first-time play) | 21 (0 P0, 5 P1) | 17 | "What next" line after every track; Track 10 → Diwali softlock; home safe house (eat / sleep / save / REWIND); CONTINUE track count; brand names out |
| Gameplay & UX | 28 + follow-ups (2 P1) | 23 | Bubbles under the HUD; working colour-blind mode; controls card + key remapping + text size; tap-the-map routes; curfew-at-home; family vehicles off the gate path |
| Performance, 3D, build | 34 (6 P1) | 26 | 3D prep only for 3D players; 8.4 → 7.1 MB download; no more lost shop signs; boot freeze 3 s → 0.35 s on phones; camera no longer inside buses/stalls; Old City draw calls under budget; self-hosted fonts |
| Online & party | 22 + 3 cross-lane (1 P0, 4 P1) | 17 (2 need a DB migration) | Realtime quota: ~7 → ~1.5 position messages/s per player; reconnect grace + host hand-over; double-Start fixed; smooth friend movement under jitter; team result lines |

## Owner actions (Supabase SQL editor — the MCP tool can't run these without a confirmation)

1. `supabase/migrations/20261021120000_online_guard.sql` — caps new player codes (60/min, none past 400 MB) and
   tightens race minimum times. Safe to re-run.
2. The last block of `supabase/migrations/20261021000000_telemetry.sql` ("retention: prune") plus
   `drop function if exists nostalgia.zz_probe();`.

## Still open (recommended next)

- Online at scale: a room of 3 roaming ≈ 21 Realtime events/s → the Free plan carries ~4–5 busy rooms. Beyond a
  beta, add a per-room relay for room traffic (keep Supabase for saves) — see online.md.
- Party game message rate (gully cricket ~7.7/s per page, Lingocha snapshots ~9/s); full Lingocha/Maram Pitti
  host hand-over (designed, not built); public-channel sender spoofing (needs private channels + auth).
- Cloud saves are ordered by the device clock; a phone with its date set ahead can block other devices.
- Phones in 3D are CPU-bound (~40–60 ms view3d JS at 4× throttle): quality presets next.
- Bike falls on Normal difficulty (3–4/min in heavy traffic) — design call; Relaxed is now forgiving.
- Test flakiness under heavy machine load (wall-clock waits in a few older suites); one 3D long-trip texture
  budget fails on the pre-audit code too.
