# WeakAura review + upgrade deliverable

I rebuilt the aura into a clean, event-driven predictor specialized for Classic/TBC leash-reset timing.

## Import string

- File: `MASTERPIECE_THREAT_RESET_WEAKAURA.txt`
- Type: WeakAuras 2 import string (`!WA:2!...`)

## What was improved

- Refactored into a deterministic state machine (clear tracking + cancellation rules).
- Uses combat-log evidence to invalidate false countdowns.
- Uses threat status + target-of-target gating before showing ETA.
- Uses movement and range bucket modifiers to reduce over-eager triggers.
- Adds visual urgency cue (bar turns green in final 3s).
- Adds tune knob: `aura_env.baseReset` in **Actions → On Init**.

## Tuning guide

- Default baseline is `8` seconds.
- If your environment resets earlier, lower to `7`.
- If mobs hold chase longer, raise to `9-10`.
- Keep elite/boss modifiers as-is unless you have strong test evidence.

## Expected behavior

- You pull threat and run away.
- Aura appears and starts ETA.
- Any fresh hit exchange cancels prediction.
- If no re-contact and leash is reached, timer converges and ends near reset moment.
