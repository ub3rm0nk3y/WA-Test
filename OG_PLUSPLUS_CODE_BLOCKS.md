# _LEASH TEST (og++) code blocks

These are the updated blocks applied to your original WA logic.

## Trigger (Custom Trigger)

```lua
function(allstates, event, ...)
  if type(allstates) ~= "table" then return false end

  if not allstates["target"] then
    allstates["target"] = { show = false, changed = true }
  end

  if event == "PLAYER_ENTERING_WORLD" or event == "GROUP_ROSTER_UPDATE" or event == "UNIT_PET" then
    aura_env.RebuildGroupGUIDs()
    aura_env.Prune()
    aura_env.UpdateThreatForTarget()
    return aura_env.BuildState(allstates)
  end

  if event == "ZONE_CHANGED_NEW_AREA" or event == "PLAYER_REGEN_ENABLED" then
    for k in pairs(aura_env.timers) do aura_env.timers[k] = nil end
    for k in pairs(aura_env.threatSig) do aura_env.threatSig[k] = nil end
    for k in pairs(aura_env.lastTargetByMob) do aura_env.lastTargetByMob[k] = nil end
    for k in pairs(aura_env.expireTimers) do
      local h = aura_env.expireTimers[k]
      if h and h.Cancel then h:Cancel() end
      aura_env.expireTimers[k] = nil
    end
    aura_env.RebuildGroupGUIDs()
    return aura_env.BuildState(allstates)
  end

  if event == "PLAYER_REGEN_DISABLED" or event == "PLAYER_TARGET_CHANGED" then
    aura_env.RebuildGroupGUIDs()
    aura_env.Prune()
    aura_env.UpdateThreatForTarget()
    return aura_env.BuildState(allstates)
  end

  if event == "UNIT_THREAT_LIST_UPDATE" or event == "UNIT_THREAT_SITUATION_UPDATE" then
    local unit = ...
    if unit == "target" then
      aura_env.Prune()
      aura_env.UpdateThreatForTarget()
      return aura_env.BuildState(allstates)
    end
    return false
  end

  if event == "UNIT_TARGET" then
    local unit = ...
    if unit ~= "target" then return false end
    if not UnitExists("target") or not UnitCanAttack("player", "target") then
      return aura_env.BuildState(allstates)
    end

    local mobGUID = UnitGUID("target")
    if mobGUID and UnitExists("targettarget") then
      local ttGUID = UnitGUID("targettarget")
      if ttGUID and aura_env.IsGroupActorGUID(ttGUID) then
        local prev = aura_env.lastTargetByMob[mobGUID]
        local bonus = 0
        if prev and prev ~= ttGUID then
          bonus = aura_env.cfg.SWAP_GRACE or 2
        end
        aura_env.lastTargetByMob[mobGUID] = ttGUID
        aura_env.Touch(mobGUID, UnitLevel("target") or -1, "MOB_TARGET_CHANGED", bonus)
      end
    end

    aura_env.UpdateThreatForTarget()
    return aura_env.BuildState(allstates)
  end

  if event == "LEASH_EXPIRE" then
    local mobGUID = ...
    if not mobGUID then return false end

    if UnitExists("target") and UnitGUID("target") == mobGUID and UnitCanAttack("player", "target") then
      aura_env.UpdateThreatForTarget()
      if aura_env.timers[mobGUID] then
        aura_env.Touch(mobGUID, UnitLevel("target") or -1, "EXPIRE_REFRESH")
      end
    end

    return aura_env.BuildState(allstates)
  end

  if event == "COMBAT_LOG_EVENT_UNFILTERED" then
    local _, subevent, _, sourceGUID, _, sourceFlags, _, destGUID, _, destFlags = CombatLogGetCurrentEventInfo()

    if subevent == "UNIT_DIED" or subevent == "UNIT_DESTROYED" then
      aura_env.Clear(destGUID)
      return aura_env.BuildState(allstates)
    end

    if destGUID and aura_env.IsNPC(destFlags) and aura_env.IsGroupActorGUID(sourceGUID) then
      local lvl = (UnitExists("target") and UnitGUID("target") == destGUID) and (UnitLevel("target") or -1) or -1
      aura_env.Touch(destGUID, lvl, subevent)
      aura_env.UpdateThreatForTarget()
      return aura_env.BuildState(allstates)
    end

    if sourceGUID and aura_env.IsNPC(sourceFlags) and aura_env.IsGroupActorGUID(destGUID) then
      local lvl = (UnitExists("target") and UnitGUID("target") == sourceGUID) and (UnitLevel("target") or -1) or -1
      aura_env.Touch(sourceGUID, lvl, subevent)
      aura_env.UpdateThreatForTarget()
      return aura_env.BuildState(allstates)
    end

    return false
  end

  return aura_env.BuildState(allstates)
end

```

## Actions > On Init (Custom)

```lua
aura_env.cfg = aura_env.cfg or {
    PRUNE_AFTER = 30,
    SWAP_GRACE = 2,
    MIN_EXTEND = 0.75,

    LEASH_TABLE = {
        { max = 19,  t = 10 },
        { max = 29,  t = 12 },
        { max = 39,  t = 13 },
        { max = 44,  t = 14 },
        { max = 49,  t = 15 },
        { max = 999, t = 16 },
    },
}

aura_env.timers       = aura_env.timers or {}
aura_env.threatSig    = aura_env.threatSig or {}
aura_env.groupGUIDs   = aura_env.groupGUIDs or {}
aura_env.expireTimers = aura_env.expireTimers or {}
aura_env.lastTargetByMob = aura_env.lastTargetByMob or {}

local band = bit.band
local TYPE_NPC = COMBATLOG_OBJECT_TYPE_NPC or 0x00000800

function aura_env.GetLeashTime(level)
    if not level or level <= 0 then return 15 end
    for i = 1, #aura_env.cfg.LEASH_TABLE do
        local row = aura_env.cfg.LEASH_TABLE[i]
        if level <= row.max then return row.t end
    end
    return 15
end

function aura_env.IsNPC(flags)
    return flags and band(flags, TYPE_NPC) ~= 0
end

function aura_env.RebuildGroupGUIDs()
    local g = aura_env.groupGUIDs
    for k in pairs(g) do g[k] = nil end

    local function addUnit(u)
        if UnitExists(u) then
            local guid = UnitGUID(u)
            if guid then g[guid] = true end
        end
    end

    addUnit("player")
    addUnit("pet")

    if IsInRaid() then
        local n = GetNumGroupMembers() or 0
        for i = 1, n do
            addUnit("raid"..i)
            addUnit("raidpet"..i)
        end
    elseif IsInGroup() then
        local n = GetNumSubgroupMembers() or 0
        for i = 1, n do
            addUnit("party"..i)
            addUnit("partypet"..i)
        end
    end
end

function aura_env.IsGroupActorGUID(guid)
    return guid and aura_env.groupGUIDs and aura_env.groupGUIDs[guid] or false
end

function aura_env.Touch(mobGUID, level, reason, bonus)
    if not mobGUID then return end

    local now = GetTime()
    local dur = aura_env.GetLeashTime(level) + (bonus or 0)
    if dur < 4 then dur = 4 end

    local oldState = aura_env.timers[mobGUID]
    local newExp = now + dur

    if oldState and oldState.exp and oldState.exp > newExp then
        local remaining = oldState.exp - now
        if remaining > (aura_env.cfg.MIN_EXTEND or 0.75) then
            dur = remaining
            newExp = oldState.exp
        end
    end

    local old = aura_env.expireTimers[mobGUID]
    if old and old.Cancel then old:Cancel() end

    aura_env.timers[mobGUID] = {
        start = oldState and oldState.start or now,
        dur = dur,
        exp = newExp,
        level = level or -1,
        reason = reason,
        lastTouch = now,
    }

    local delay = newExp - now
    if delay < 0.05 then delay = 0.05 end
    if C_Timer and C_Timer.NewTimer then
        aura_env.expireTimers[mobGUID] = C_Timer.NewTimer(delay, function()
            WeakAuras.ScanEvents("LEASH_EXPIRE", mobGUID)
        end)
    end
end

function aura_env.Clear(mobGUID)
    if not mobGUID then return end

    aura_env.timers[mobGUID] = nil
    aura_env.threatSig[mobGUID] = nil
    aura_env.lastTargetByMob[mobGUID] = nil

    local h = aura_env.expireTimers[mobGUID]
    if h and h.Cancel then h:Cancel() end
    aura_env.expireTimers[mobGUID] = nil
end

function aura_env.Prune()
    local now = GetTime()
    local cutoff = now - (aura_env.cfg.PRUNE_AFTER or 30)
    for guid, t in pairs(aura_env.timers) do
        if (t.lastTouch or t.start or 0) < cutoff then
            aura_env.Clear(guid)
        end
    end
end

local function iterGroupUnits()
    local t = {}
    t[#t+1] = "player"
    if UnitExists("pet") then t[#t+1] = "pet" end

    if IsInRaid() then
        local n = GetNumGroupMembers() or 0
        for i = 1, n do
            if UnitExists("raid"..i) then t[#t+1] = "raid"..i end
            if UnitExists("raidpet"..i) then t[#t+1] = "raidpet"..i end
        end
    elseif IsInGroup() then
        local n = GetNumSubgroupMembers() or 0
        for i = 1, n do
            if UnitExists("party"..i) then t[#t+1] = "party"..i end
            if UnitExists("partypet"..i) then t[#t+1] = "partypet"..i end
        end
    end

    return t
end

function aura_env.UpdateThreatForTarget()
    if not UnitExists("target") or not UnitCanAttack("player", "target") then return false end

    local mobGUID = UnitGUID("target")
    if not mobGUID then return false end

    local sum, max, topGUID = 0, 0, nil
    local units = iterGroupUnits()

    for i = 1, #units do
        local u = units[i]
        local ug = UnitGUID(u)
        if ug then
            local _, _, _, _, threatValue = UnitDetailedThreatSituation(u, "target")
            threatValue = threatValue or 0
            if threatValue > 0 then
                sum = sum + math.floor(threatValue)
                if threatValue > max then
                    max = threatValue
                    topGUID = ug
                end
            end
        end
    end

    local old = aura_env.threatSig[mobGUID]
    local changed = false
    if not old then
        changed = (sum > 0)
    else
        changed = (old.sum ~= sum or old.max ~= max or old.topGUID ~= topGUID)
    end

    aura_env.threatSig[mobGUID] = { sum = sum, max = max, topGUID = topGUID }

    if sum == 0 then
        aura_env.Clear(mobGUID)
        return true
    end

    if changed then
        local bonus = 0
        if old and old.topGUID and topGUID and old.topGUID ~= topGUID and aura_env.IsGroupActorGUID(old.topGUID) and aura_env.IsGroupActorGUID(topGUID) then
            bonus = aura_env.cfg.SWAP_GRACE or 2
        end
        aura_env.Touch(mobGUID, UnitLevel("target") or -1, "THREAT_CHANGE", bonus)
        aura_env.lastTargetByMob[mobGUID] = topGUID
        return true
    end

    return false
end

function aura_env.BuildState(allstates)
    local key = "target"
    local state = allstates[key] or {}

    local function hide()
        if state.show then
            state.show = false
            state.changed = true
            allstates[key] = state
            return true
        end
        return false
    end

    if not UnitExists("target") or not UnitCanAttack("player", "target") then
        return hide()
    end

    local mobGUID = UnitGUID("target")
    if not mobGUID then return hide() end

    local t = aura_env.timers[mobGUID]
    if not t then return hide() end

    local now = GetTime()
    if t.exp <= now then
        aura_env.Clear(mobGUID)
        return hide()
    end

    state.show = true
    state.changed = true
    state.progressType = "timed"
    state.duration = t.dur
    state.expirationTime = t.exp
    state.autoHide = false
    state.name = tostring(t.dur)

    allstates[key] = state
    return true
end

aura_env.RebuildGroupGUIDs()

```
