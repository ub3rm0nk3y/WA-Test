# Threat/Aggro research summary for Classic/TBC WeakAura design

## What is directly knowable from Blizzard API

- Blizzard does **not expose a direct "mob will reset aggro in X seconds" API** in Classic/TBC.
- The UI API exposes threat relationship signals such as `UnitThreatSituation("player", "target")`, target-target relationship checks, combat log hits, and coarse distance checks (`CheckInteractDistance`).
- Therefore a perfect reset timer can only be approximated with heuristics and constant correction from events.

## Aggro/Threat logic that matters for this aura

- A mob can evade/reset due to leash pathing and distance from its home point, not purely threat values.
- Being repeatedly hit by the mob or landing hits/spells on the mob indicates chase is still "live" and should invalidate/reset a predicted leash countdown.
- Elite/worldboss units generally have larger or more forgiving leash behavior and require longer ETA estimates.
- Range-only estimation is coarse in Classic/TBC, so the best practical approach is to:
  1. start prediction only while the mob is actively focused on you,
  2. require player movement away,
  3. cancel prediction on fresh combat interactions,
  4. adapt ETA with classification + coarse range buckets.

## Design decisions applied in the refactor

- Full rewrite as an event-driven `custom status` aura bar with timed state.
- Prediction starts only when all conditions are true:
  - hostile target exists and is alive,
  - you have high threat / are current target,
  - you are moving,
  - no hit exchange with the target in the recent safety window.
- Prediction is canceled immediately if combat log indicates fresh hit exchanges between player and tracked mob.
- ETA baseline is tunable (`aura_env.baseReset`, default 8s) and adjusted by target class (`elite`/`worldboss`) and range bucket.
- The bar color turns green in the final 3 seconds for clearer "reset window" readability.

## Reality check

- This is the strongest possible API-level implementation for Classic/TBC without protected data or private server hooks.
- It is highly accurate when tuned for your server/client conditions, but no addon can guarantee mathematically perfect reset timestamps in every pathing edge case.
