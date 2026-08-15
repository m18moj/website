--[[
    ScripForge — Script Hitbox & Lag Compensation
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Server-side rewind hit detection that compensates for client latency on fast-moving hitboxes.
]]

-- ============================================================
-- ScriptHitboxLagCompensation.lua  (Script, place in ServerScriptService)
-- Companion: HitboxSwingClient.lua (LocalScript, StarterPlayerScripts) fires
-- RequestSwing with the client's local timestamp of the swing.
-- ============================================================
-- Keeps a short rolling history of every player's HumanoidRootPart CFrame.
-- When a swing/attack comes in, it rewinds every OTHER player back to where
-- they were at the attacker's reported timestamp (clamped to a max
-- compensation window) before running the actual hit check, so a fast target
-- strafing under real latency doesn't unfairly dodge a swing that visually
-- connected on the attacker's screen.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local remotesFolder = ReplicatedStorage:FindFirstChild("HitboxRemotes") or Instance.new("Folder")
remotesFolder.Name = "HitboxRemotes"
remotesFolder.Parent = ReplicatedStorage

local requestSwingEvent = remotesFolder:FindFirstChild("RequestSwing") or Instance.new("RemoteEvent")
requestSwingEvent.Name = "RequestSwing"
requestSwingEvent.Parent = remotesFolder

local hitConfirmedEvent = remotesFolder:FindFirstChild("HitConfirmed") or Instance.new("RemoteEvent")
hitConfirmedEvent.Name = "HitConfirmed"
hitConfirmedEvent.Parent = remotesFolder

local HISTORY_DURATION = 1.0 -- seconds of position history retained per player
local MAX_COMPENSATION = 0.35 -- never rewind further back than this, even if ping claims more
local SWING_RANGE = 8
local SWING_COOLDOWN = 0.6
local HIT_DEBOUNCE = 0.5

-- history[userId] = { { Time = number, CFrame = CFrame }, ... } ordered oldest -> newest
local history = {}
local lastSwingAt = {} -- [userId] = os.clock()
local recentlyHit = {} -- [attackerUserId][targetUserId] = os.clock()

local function getRoot(character)
	return character and character:FindFirstChild("HumanoidRootPart")
end

-- Records one snapshot per heartbeat for every character currently in the world.
RunService.Heartbeat:Connect(function()
	local now = os.clock()
	for _, player in ipairs(Players:GetPlayers()) do
		local root = getRoot(player.Character)
		if root then
			local list = history[player.UserId]
			if not list then
				list = {}
				history[player.UserId] = list
			end

			table.insert(list, { Time = now, CFrame = root.CFrame })

			-- Trim anything older than the retention window from the front
			while #list > 0 and (now - list[1].Time) > HISTORY_DURATION do
				table.remove(list, 1)
			end
		end
	end
end)

-- Returns the interpolated CFrame a player's HumanoidRootPart was at `atTime`,
-- linearly blending between the two nearest recorded samples.
local function rewindPosition(userId, atTime)
	local list = history[userId]
	if not list or #list == 0 then
		return nil
	end

	if atTime <= list[1].Time then
		return list[1].CFrame
	end
	if atTime >= list[#list].Time then
		return list[#list].CFrame
	end

	for i = 1, #list - 1 do
		local a, b = list[i], list[i + 1]
		if atTime >= a.Time and atTime <= b.Time then
			local span = b.Time - a.Time
			local alpha = span > 0 and (atTime - a.Time) / span or 0
			return a.CFrame:Lerp(b.CFrame, alpha)
		end
	end

	return list[#list].CFrame
end

local function withinSwingRange(attackerRoot, rewoundTargetCFrame)
	local distance = (attackerRoot.Position - rewoundTargetCFrame.Position).Magnitude
	return distance <= SWING_RANGE
end

local function applyDamage(targetPlayer, amount)
	local humanoid = targetPlayer.Character and targetPlayer.Character:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.Health > 0 then
		humanoid:TakeDamage(amount)
	end
end

-- attacker fires this the instant their client plays the swing animation,
-- passing the client's own os.clock()-style timestamp (server converts to its
-- own clock offset the first time it sees that player, elsewhere in your net code)
requestSwingEvent.OnServerEvent:Connect(function(attacker, clientSwingTime, damage)
	if typeof(clientSwingTime) ~= "number" or typeof(damage) ~= "number" then
		return
	end

	local now = os.clock()
	local last = lastSwingAt[attacker.UserId] or 0
	if (now - last) < SWING_COOLDOWN then
		return -- reject swings faster than the animation could actually allow
	end
	lastSwingAt[attacker.UserId] = now

	local attackerRoot = getRoot(attacker.Character)
	if not attackerRoot then
		return
	end

	-- Clamp the requested rewind time so a modified client can't ask the server
	-- to rewind further than physically plausible for real network latency.
	local requestedDelta = math.clamp(now - clientSwingTime, 0, MAX_COMPENSATION)
	local rewindTime = now - requestedDelta

	local damageClamped = math.clamp(damage, 1, 50)

	for _, target in ipairs(Players:GetPlayers()) do
		if target ~= attacker and getRoot(target.Character) then
			local rewound = rewindPosition(target.UserId, rewindTime)
			if rewound and withinSwingRange(attackerRoot, rewound) then
				recentlyHit[attacker.UserId] = recentlyHit[attacker.UserId] or {}
				local lastHitAt = recentlyHit[attacker.UserId][target.UserId] or 0
				if (now - lastHitAt) >= HIT_DEBOUNCE then
					recentlyHit[attacker.UserId][target.UserId] = now
					applyDamage(target, damageClamped)
					hitConfirmedEvent:FireAllClients(attacker.UserId, target.UserId, damageClamped)
				end
			end
		end
	end
end)

Players.PlayerRemoving:Connect(function(player)
	history[player.UserId] = nil
	lastSwingAt[player.UserId] = nil
	recentlyHit[player.UserId] = nil
	for _, hits in pairs(recentlyHit) do
		hits[player.UserId] = nil
	end
end)

print("[Hitbox] Server-side hitbox & lag compensation initialized.")
