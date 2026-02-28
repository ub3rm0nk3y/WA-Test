const { encodeSync, decodeSync } = require('node-weakauras-parser');

const triggerCode = String.raw`function(event, ...)
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

  -- Distance buckets via interact distance checks (coarse but works in Classic/TBC)
  if CheckInteractDistance(target, 3) then
    est = est + 2
  elseif CheckInteractDistance(target, 2) then
    est = est + 1
  else
    est = est - 1
  end

  if est < 4 then est = 4 end

  if event == "COMBAT_LOG_EVENT_UNFILTERED" then
    local _, subEvent, _, srcGUID, _, _, _, dstGUID = CombatLogGetCurrentEventInfo()
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
  return string.format("Aggro reset in %.1f", remain)
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
        custom: "aura_env.baseReset = 8",
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
      baseResetHint: "Tune aura_env.baseReset in Actions > On Init. 8 is a good default for Classic/TBC open world.",
      notes: "ETA is prediction-based because Blizzard API does not expose leash reset timestamp.",
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

// Print legacy format by default for maximum Classic/TBC compatibility.
console.log(encodedLegacy);
