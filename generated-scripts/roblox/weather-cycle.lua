--[[
    ScriptForge — Day-Night Cycle & Lighting
    Pack: Roblox Pack | Category: World
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    TweenService-driven Lighting property cycling for a smooth day/night loop.
]]

-- ============================================================
-- DayNightCycle.lua  (Script, place in ServerScriptService)
-- ============================================================
-- Cycles Lighting.ClockTime through a full 24-hour period using TweenService
-- so the transition is smooth rather than an instant snap, and swaps
-- ambient/brightness presets for "day" and "night" phases.

local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")

-- How many real-world seconds a full in-game day (24h) should take.
local FULL_DAY_LENGTH_SECONDS = 600 -- 10 real minutes per full day/night cycle
local UPDATE_INTERVAL = 5 -- seconds between ClockTime tween segments

-- Presets applied at sunrise/sunset boundaries for atmosphere
local DAY_PRESET = {
	Brightness = 3,
	Ambient = Color3.fromRGB(150, 150, 150),
	OutdoorAmbient = Color3.fromRGB(140, 140, 140),
	FogEnd = 100000,
}

local NIGHT_PRESET = {
	Brightness = 0.5,
	Ambient = Color3.fromRGB(30, 30, 45),
	OutdoorAmbient = Color3.fromRGB(25, 25, 40),
	FogEnd = 4000,
}

local isNight = false

-- Smoothly tweens the given Lighting properties over `duration` seconds
local function tweenLightingProperties(preset, duration)
	local tweenInfo = TweenInfo.new(duration, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
	local tween = TweenService:Create(Lighting, tweenInfo, preset)
	tween:Play()
	return tween
end

-- Advances ClockTime smoothly and flips the day/night preset at dawn (6:00) and dusk (18:00)
local function advanceClock()
	local secondsPerGameHour = FULL_DAY_LENGTH_SECONDS / 24
	local hoursToAdvance = UPDATE_INTERVAL / secondsPerGameHour

	local currentTime = Lighting.ClockTime
	local targetTime = (currentTime + hoursToAdvance) % 24

	local clockTweenInfo = TweenInfo.new(UPDATE_INTERVAL, Enum.EasingStyle.Linear)
	local clockTween = TweenService:Create(Lighting, clockTweenInfo, { ClockTime = targetTime })
	clockTween:Play()

	-- Detect day/night boundary crossings to trigger the atmosphere tween
	local crossingIntoNight = (currentTime < 18 and targetTime >= 18) or (targetTime < currentTime and targetTime >= 0 and not isNight)
	local crossingIntoDay = (currentTime < 6 and targetTime >= 6) and isNight

	if not isNight and targetTime >= 18 then
		isNight = true
		tweenLightingProperties(NIGHT_PRESET, FULL_DAY_LENGTH_SECONDS / 24 * 2) -- ~2 in-game hours to transition
		print("[DayNightCycle] Transitioning to night.")
	elseif isNight and targetTime >= 6 and targetTime < 18 then
		isNight = false
		tweenLightingProperties(DAY_PRESET, FULL_DAY_LENGTH_SECONDS / 24 * 2)
		print("[DayNightCycle] Transitioning to day.")
	end
end

-- Initialize Lighting to a sensible starting state (mid-morning)
Lighting.ClockTime = 8
Lighting.Brightness = DAY_PRESET.Brightness
Lighting.Ambient = DAY_PRESET.Ambient
Lighting.OutdoorAmbient = DAY_PRESET.OutdoorAmbient

-- Main loop: advance the clock on a fixed interval for the lifetime of the server
task.spawn(function()
	while true do
		task.wait(UPDATE_INTERVAL)
		local success, err = pcall(advanceClock)
		if not success then
			warn("[DayNightCycle] Error advancing clock: " .. tostring(err))
		end
	end
end)

print(("[DayNightCycle] Started — full cycle every %d seconds."):format(FULL_DAY_LENGTH_SECONDS))
