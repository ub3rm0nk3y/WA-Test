const { encodeSync, decodeSync } = require('node-weakauras-parser');

const triggerCode = String.raw`function(event, ...)
  local now = GetTime()
  aura_env.state = aura_env.state or {}
  aura_env.saved = aura_env.saved or {}
  aura_env.saved.mobStats = aura_env.saved.mobStats or {}
  aura_env.saved.samples = aura_env.saved.samples or {}

  local function clearState()
    aura_env.resetAt = nil
    aura_env.estimate = nil
    aura_env.state.show = false
    aura_env.state.changed = true
  end

  local function npcIdFromGUID(guid)
    if not guid then return nil end
    local unitType, _, _, _, _, npcId = strsplit("-", guid)
    if unitType ~= "Creature" and unitType ~= "Vehicle" then
      return nil
    end
    return tonumber(npcId)
  end

  local function getLeashEstimateByLevel(level)
    local tbl = aura_env.LEASH_TABLE or {
      { max = 19,  t = 10 },
      { max = 29,  t = 12 },
      { max = 39,  t = 13 },
      { max = 44,  t = 14 },
      { max = 49,  t = 15 },
      { max = 999, t = 16 },
    }
    for i = 1, #tbl do
      if level <= tbl[i].max then
        return tbl[i].t
      end
    end
    return 16
  end

  local function saveObservedDuration(encounter, observed)
    if not encounter or not encounter.npcId or observed <= 0 then
      return
    end

    local id = tostring(encounter.npcId)
    local stats = aura_env.saved.mobStats[id] or {
      npcId = encounter.npcId,
      name = encounter.name or "?",
      level = encounter.level or -1,
      count = 0,
      total = 0,
      avg = 0,
      last = 0,
    }

    stats.name = encounter.name or stats.name
    stats.level = encounter.level or stats.level
    stats.count = stats.count + 1
    stats.total = stats.total + observed
    stats.avg = stats.total / stats.count
    stats.last = observed
    aura_env.saved.mobStats[id] = stats

    local samples = aura_env.saved.samples
    samples[#samples + 1] = {
      ts = time(),
      npcId = encounter.npcId,
      name = encounter.name or "?",
      level = encounter.level or -1,
      observed = observed,
      avg = stats.avg,
      count = stats.count,
    }
    if #samples > 200 then
      table.remove(samples, 1)
    end
  end

  local target = "target"
  local targetExists = UnitExists(target) and not UnitIsDead(target) and UnitCanAttack("player", target)

  if not targetExists then
    if aura_env.encounter and aura_env.encounter.runningStart then
      local observed = now - aura_env.encounter.runningStart
      if observed >= 2 and observed <= 60 then
        saveObservedDuration(aura_env.encounter, observed)
      end
    end
    aura_env.encounter = nil
    clearState()
    return false
  end

  local guid = UnitGUID(target)
  if not guid then
    clearState()
    return false
  end

  local mobLevel = UnitLevel(target)
  if not mobLevel or mobLevel <= 0 then
    mobLevel = 60
  end

  local tts = UnitThreatSituation and UnitThreatSituation("player", target) or nil
  local hasHighThreat = (tts and tts >= 2) or UnitIsUnit(target .. "target", "player")

  local speed = GetUnitSpeed("player") or 0
  local running = speed > 0

  if not aura_env.encounter or aura_env.encounter.guid ~= guid then
    aura_env.encounter = {
      guid = guid,
      npcId = npcIdFromGUID(guid),
      name = UnitName(target),
      level = mobLevel,
      aggroStart = now,
      runningStart = nil,
      completed = false,
    }
  end

  local encounter = aura_env.encounter
  encounter.level = mobLevel
  encounter.name = UnitName(target)

  if event == "COMBAT_LOG_EVENT_UNFILTERED" then
    local _, _, _, srcGUID, _, _, _, dstGUID = CombatLogGetCurrentEventInfo()
    if srcGUID == guid and dstGUID == UnitGUID("player") then
      encounter.lastCombatContact = now
      aura_env.resetAt = nil
    end
    if dstGUID == guid and srcGUID == UnitGUID("player") then
      encounter.lastCombatContact = now
      aura_env.resetAt = nil
    end
  end

  local base = getLeashEstimateByLevel(mobLevel)
  local stats = encounter.npcId and aura_env.saved.mobStats[tostring(encounter.npcId)] or nil
  local est = base
  if stats and stats.count and stats.count >= 2 and stats.avg then
    local alpha = math.min(0.8, stats.count / 10)
    est = (1 - alpha) * base + alpha * stats.avg
  end

  local _, cls = UnitClassification(target)
  if cls == "elite" or cls == "rareelite" then
    est = est + 1
  elseif cls == "worldboss" then
    est = est + 2
  end

  if est < 4 then est = 4 end
  if est > 25 then est = 25 end

  local safeSinceHit = (not encounter.lastCombatContact) or ((now - encounter.lastCombatContact) > 1.2)
  local shouldPredict = hasHighThreat and running and safeSinceHit

  if shouldPredict then
    if not encounter.runningStart then
      encounter.runningStart = now
    end

    if not aura_env.resetAt then
      aura_env.estimate = est
      aura_env.resetAt = now + est
    else
      local remain = aura_env.resetAt - now
      if remain > est + 1.2 or remain < 0 then
        aura_env.estimate = est
        aura_env.resetAt = now + est
      end
    end
  end

  -- Observed leash/reset: we had a running encounter, now target is not focused on us anymore.
  if encounter.runningStart and not hasHighThreat and safeSinceHit and not encounter.completed then
    local observed = now - encounter.runningStart
    if observed >= 2 and observed <= 60 then
      saveObservedDuration(encounter, observed)
      encounter.completed = true
    end
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
end`;

const untriggerCode = `function() return true end`;

const durationCode = String.raw`function()
  if aura_env.resetAt and aura_env.estimate then
    return aura_env.estimate, aura_env.resetAt
  end
  return 0, 0
end`;

const customText = String.raw`function()
  if not aura_env.resetAt then
    return ""
  end
  local remain = aura_env.resetAt - GetTime()
  if remain < 0 then remain = 0 end

  local target = "target"
  local guid = UnitGUID(target)
  local npcId
  if guid then
    local unitType, _, _, _, _, n = strsplit("-", guid)
    if unitType == "Creature" or unitType == "Vehicle" then
      npcId = tostring(tonumber(n))
    end
  end

  local avgText = ""
  if aura_env.saved and aura_env.saved.mobStats and npcId and aura_env.saved.mobStats[npcId] then
    local s = aura_env.saved.mobStats[npcId]
    if s.count and s.count >= 2 and s.avg then
      avgText = string.format(" | avg %.1f", s.avg)
    end
  end

  return string.format("Aggro reset in %.1f%s", remain, avgText)
end`;

const initCode = String.raw`aura_env.LEASH_TABLE = {
  { max = 19,  t = 10 },
  { max = 29,  t = 12 },
  { max = 39,  t = 13 },
  { max = 44,  t = 14 },
  { max = 49,  t = 15 },
  { max = 999, t = 16 },
}

aura_env.saved = aura_env.saved or {}
aura_env.saved.mobStats = aura_env.saved.mobStats or {}
aura_env.saved.samples = aura_env.saved.samples or {}

local function line(msg)
  DEFAULT_CHAT_FRAME:AddMessage("|cff33ff99LeashStats|r " .. msg)
end

if not _G.WA_LEASH_STATS_SLASH then
  _G.WA_LEASH_STATS_SLASH = true
  SLASH_WALEASHSTATS1 = "/leashstats"
  SlashCmdList["WALEASHSTATS"] = function(msg)
    msg = (msg or ""):lower()
    if msg == "" or msg == "help" then
      line("/leashstats export  - print csv-like rows: npcId,name,level,count,avg,last")
      line("/leashstats recent  - print last 10 observed samples")
      line("/leashstats reset   - clear all learned mob data")
      return
    end

    if msg == "reset" then
      aura_env.saved.mobStats = {}
      aura_env.saved.samples = {}
      line("All learned leash stats cleared.")
      return
    end

    if msg == "recent" then
      local samples = aura_env.saved.samples or {}
      local start = math.max(1, #samples - 9)
      for i = start, #samples do
        local s = samples[i]
        line(string.format("recent,%d,%s,%d,obs=%.2f,avg=%.2f,n=%d", s.npcId or -1, s.name or "?", s.level or -1, s.observed or 0, s.avg or 0, s.count or 0))
      end
      return
    end

    if msg == "export" then
      line("npcId,name,level,count,avg,last")
      for _, s in pairs(aura_env.saved.mobStats or {}) do
        line(string.format("%d,%s,%d,%d,%.4f,%.4f", s.npcId or -1, s.name or "?", s.level or -1, s.count or 0, s.avg or 0, s.last or 0))
      end
      return
    end

    line("Unknown command. Try /leashstats help")
  end
end`;

const aura = {
  c: "",
  d: {
    id: "Classic/TBC Threat Reset ETA (Masterpiece)",
    uid: "classic-tbc-threat-reset-eta-masterpiece",
    internalVersion: 71,
    regionType: "aurabar",
    authorOptions: [],
    load: {
      use_class_and_spec: false,
      use_never: false,
      use_combat: false,
      use_zone: false,
      use_size: false,
    },
    trigger: {
      type: "custom",
      custom_type: "status",
      events: "PLAYER_TARGET_CHANGED UNIT_THREAT_LIST_UPDATE PLAYER_REGEN_ENABLED PLAYER_REGEN_DISABLED COMBAT_LOG_EVENT_UNFILTERED",
      check: "event",
      custom: triggerCode,
      customDuration: durationCode,
      customName: "function() return 'Threat Reset ETA' end",
      customIcon: "function() return 132177 end",
      customStack: "function() return '' end",
      custom_hide: "custom",
      use_unit: false,
      subeventPrefix: "SPELL",
      subeventSuffix: "_CAST_START",
      unit: "player",
      names: [],
      spellIds: [],
      deBuffType: "HELPFUL",
      unevent: "auto",
      custom_untrigger: untriggerCode,
    },
    untrigger: {},
    actions: {
      start: { do_sound: false, do_custom: false },
      finish: { do_sound: false, do_custom: false },
      init: {
        do_custom: true,
        custom: initCode,
      },
    },
    animation: {
      start: { type: "none", duration_type: "seconds", easeType: "none" },
      main: { type: "none", duration_type: "seconds", easeType: "none" },
      finish: { type: "none", duration_type: "seconds", easeType: "none" },
    },
    displayText: "%c",
    customText,
    texture: "Interface\\TargetingFrame\\UI-StatusBar",
    orientation: "HORIZONTAL",
    spark: true,
    sparkVisible: "always",
    icon: true,
    desaturate: false,
    barColor: [1, 0.2, 0.2, 0.85],
    width: 310,
    height: 20,
    alpha: 1,
    xOffset: 0,
    yOffset: -170,
    frameStrata: 1,
    anchorPoint: "CENTER",
    selfPoint: "CENTER",
    anchorFrameType: "SCREEN",
    inverse: false,
    zoom: 0,
    font: "Friz Quadrata TT",
    fontSize: 14,
    justify: "CENTER",
    config: {
      baseResetHint: "Uses LEASH_TABLE baseline + learned per-NPC averages saved in aura_env.saved.",
      notes: "Use /leashstats export to print learned mob data for analysis.",
    },
    conditions: [
      {
        check: {
          trigger: 1,
          variable: "expirationTime",
          op: "<=",
          value: "3",
        },
        changes: [
          {
            property: "barcolor",
            value: [0.2, 1, 0.2, 0.95],
          },
        ],
      },
    ],
  },
};

const encodedLegacy = encodeSync(aura, 1);
const decodedLegacy = decodeSync(encodedLegacy);
if (!decodedLegacy?.d?.id) {
  throw new Error('Legacy roundtrip validation failed');
}

const encodedV2 = encodeSync(aura, 2);
const decodedV2 = decodeSync(encodedV2);
if (!decodedV2?.d?.id) {
  throw new Error('V2 roundtrip validation failed');
}

console.log(encodedLegacy);
