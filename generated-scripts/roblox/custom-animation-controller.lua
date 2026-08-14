--[[
    ScriptForge — Custom Animation Controller
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Animator-based controller that loads, blends, and prioritizes multiple animation tracks per character.
]]

-- ============================================================
-- CustomAnimationController.lua  (LocalScript, place in StarterCharacterScripts)
-- ============================================================

local Players = game:GetService("Players")

local player = Players.LocalPlayer
local character = script.Parent
local humanoid = character:WaitForChild("Humanoid")
local animator = humanoid:FindFirstChildWhichIsA("Animator") or Instance.new("Animator", humanoid)

-- Animation definitions: Id placeholders should be replaced with real uploaded animation asset ids.
local ANIMATIONS = {
	Idle = { Id = "rbxassetid://000000001", Priority = Enum.AnimationPriority.Idle, Looped = true },
	Walk = { Id = "rbxassetid://000000002", Priority = Enum.AnimationPriority.Movement, Looped = true },
	Sprint = { Id = "rbxassetid://000000003", Priority = Enum.AnimationPriority.Movement, Looped = true },
	Jump = { Id = "rbxassetid://000000004", Priority = Enum.AnimationPriority.Action, Looped = false },
	Attack = { Id = "rbxassetid://000000005", Priority = Enum.AnimationPriority.Action2, Looped = false },
}

local loadedTracks = {}

-- Loads and caches every AnimationTrack up front so playback has no first-play hitch
local function preloadTracks()
	for name, data in pairs(ANIMATIONS) do
		local animInstance = Instance.new("Animation")
		animInstance.AnimationId = data.Id

		local success, track = pcall(function()
			return animator:LoadAnimation(animInstance)
		end)

		if success then
			track.Priority = data.Priority
			track.Looped = data.Looped
			loadedTracks[name] = track
		else
			warn("[AnimController] Failed to load animation '" .. name .. "': " .. tostring(track))
		end
	end
end

preloadTracks()

local currentMovementTrack = nil

-- Plays a track by name with an optional fade time and speed, stopping conflicting movement tracks
local function playTrack(name, fadeTime, speed)
	local track = loadedTracks[name]
	if not track then
		return
	end
	track:Play(fadeTime or 0.2, 1, speed or 1)
	return track
end

local function stopTrack(name, fadeTime)
	local track = loadedTracks[name]
	if track and track.IsPlaying then
		track:Stop(fadeTime or 0.2)
	end
end

-- Switches the currently active movement-priority animation (Idle/Walk/Sprint), ensuring
-- only one plays at a time since they share the Movement priority band.
local function setMovementState(stateName)
	if currentMovementTrack == stateName then
		return
	end

	for name, data in pairs(ANIMATIONS) do
		if data.Priority == Enum.AnimationPriority.Movement and name ~= stateName then
			stopTrack(name, 0.15)
		end
	end

	playTrack(stateName, 0.15)
	currentMovementTrack = stateName
end

-- Drive movement animation state from Humanoid state + speed
humanoid.Running:Connect(function(speed)
	if speed < 0.5 then
		setMovementState("Idle")
	elseif speed > 20 then
		setMovementState("Sprint")
	else
		setMovementState("Walk")
	end
end)

humanoid.Jumping:Connect(function(isJumping)
	if isJumping then
		playTrack("Jump", 0.1)
	end
end)

-- Public API: fire a one-off action animation (e.g. from a tool script) without disturbing movement
local AnimationController = {}

function AnimationController.PlayAction(actionName, speed)
	return playTrack(actionName, 0.1, speed)
end

function AnimationController.StopAction(actionName)
	stopTrack(actionName, 0.1)
end

function AnimationController.GetTrack(name)
	return loadedTracks[name]
end

_G.AnimationController = AnimationController

print("[AnimController] Custom animation controller initialized for " .. player.Name)
