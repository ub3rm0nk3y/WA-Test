# Classic Era / TBC Anniversary Threat Reset ETA (copy/paste setup)

Use this to build the aura manually in-game (no import string required).

## 1) Create aura

- `/wa` → **New** → **Progress Bar**
- Name: `Classic/TBC Threat Reset ETA (Masterpiece Manual)`

## 2) Display

- **Bar Texture**: `Interface\\TargetingFrame\\UI-StatusBar`
- **Orientation**: Horizontal
- **Icon**: enabled
- **Spark**: enabled (Always)
- **Width**: `310`
- **Height**: `20`
- **Color**: `R 1.0 / G 0.2 / B 0.2 / A 0.85`
- **Text 1**: `%c`
- **Font**: Friz Quadrata TT, size 14, center
- Position (optional): X `0`, Y `-170`, Anchor CENTER

## 3) Trigger

- **Type**: Custom
- **Event Type**: Status
- **Check On...**: Event(s)
- **Event(s)**:

```text
PLAYER_TARGET_CHANGED UNIT_THREAT_LIST_UPDATE PLAYER_REGEN_ENABLED PLAYER_REGEN_DISABLED COMBAT_LOG_EVENT_UNFILTERED
```

- **Custom Trigger**:

```lua
function(event, ...)
  local now = GetTime()
  aura_env.state = aura_env.state or {}

  local function clearState()
    aura_env.mobGUID = nil
    aura_env.resetAt = nil
    aura_env.estimate = nil
    aura_env.lastPlayerHit = nil
    aura_env.lastMobSeen = nil
    aura_env.running = nil
    aura_env.state.show = false
    aura_env.state.changed = true
  end

  local target = "target"
  if not UnitExists(target) or UnitIsDead(target) or not UnitCanAttack("player", target) then
    clearState()
    return false
  end

  local guid = UnitGUID(target)
  if not guid then
    clearState()
    return false
  end

  if aura_env.mobGUID and aura_env.mobGUID ~= guid then
    clearState()
  end
  aura_env.mobGUID = guid
  aura_env.lastMobSeen = now

  local tts = UnitThreatSituation and UnitThreatSituation("player", target) or nil
  local hasHighThreat = (tts and tts >= 2) or UnitIsUnit(target .. "target", "player")

  local speed = GetUnitSpeed("player") or 0
  aura_env.running = speed > 0

  local _, cls = UnitClassification(target)
  local isElite = (cls == "elite" or cls == "rareelite")
  local isBoss = (cls == "worldboss")

  local est = aura_env.baseReset or 8
  if isElite then est = est + 3 end
  if isBoss then est = est + 8 end

  -- Coarse range buckets available in Classic/TBC API
  if CheckInteractDistance(target, 3) then
    est = est + 2
  elseif CheckInteractDistance(target, 2) then
    est = est + 1
  else
    est = est - 1
  end

  if est < 4 then est = 4 end

  if event == "COMBAT_LOG_EVENT_UNFILTERED" then
    local _, _, _, srcGUID, _, _, _, dstGUID = CombatLogGetCurrentEventInfo()
    if srcGUID == guid and dstGUID == UnitGUID("player") then
      aura_env.lastPlayerHit = now
      aura_env.resetAt = nil
    end
    if dstGUID == guid and srcGUID == UnitGUID("player") then
      aura_env.lastPlayerHit = now
      aura_env.resetAt = nil
    end
  end

  local safeSinceHit = (not aura_env.lastPlayerHit) or ((now - aura_env.lastPlayerHit) > 1.2)
  local shouldPredict = hasHighThreat and aura_env.running and safeSinceHit

  if shouldPredict then
    if not aura_env.resetAt then
      aura_env.estimate = est
      aura_env.resetAt = now + est
    else
      local remain = aura_env.resetAt - now
      if remain > est + 1 or remain < 0 then
        aura_env.estimate = est
        aura_env.resetAt = now + est
      end
    end
  else
    aura_env.resetAt = nil
  end

  if aura_env.resetAt and aura_env.resetAt > now then
    aura_env.state.show = true
    aura_env.state.changed = true
    aura_env.state.progressType = "timed"
    aura_env.state.duration = aura_env.estimate
    aura_env.state.expirationTime = aura_env.resetAt
    aura_env.state.autoHide = false
    aura_env.state.name = "Threat drop ETA"
    aura_env.state.icon = 132177
    return true
  end

  aura_env.state.show = false
  aura_env.state.changed = true
  return false
end
```

- **Custom Untrigger**:

```lua
function()
  return true
end
```

## 4) Duration Info (same Trigger tab)

- **Duration Info** (Custom):

```lua
function()
  if aura_env.resetAt and aura_env.estimate then
    return aura_env.estimate, aura_env.resetAt
  end
  return 0, 0
end
```

- **Name** (Custom):

```lua
function()
  return "Threat Reset ETA"
end
```

- **Icon** (Custom):

```lua
function()
  return 132177
end
```

- **Stack** (Custom):

```lua
function()
  return ""
end
```

- **Dynamic Text (`%c`)**:

```lua
function()
  if not aura_env.resetAt then
    return ""
  end
  local remain = aura_env.resetAt - GetTime()
  if remain < 0 then remain = 0 end
  return string.format("Aggro reset in %.1f", remain)
end
```

## 5) Actions

- **On Init**: enable Custom and paste:

```lua
aura_env.baseReset = 8
```

(You can tune to `7` or `9-10` based on your realm behavior.)

## 6) Conditions

Add condition:
- If `Remaining Time` `<=` `3`
- Then change bar color to green (`0.2, 1, 0.2, 0.95`)

## 7) Load

Recommended minimal load:
- In combat: optional (either is fine)
- Zone/class: leave unrestricted unless you want tighter filtering.

## Notes

- No Blizzard API gives an exact leash reset timestamp in Classic/TBC; this is a best-possible event-driven prediction model.
