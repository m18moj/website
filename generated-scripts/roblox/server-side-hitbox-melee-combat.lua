--[[
    ScripForge — Server-Side Hitbox Melee Combat
    Pack: Roblox Pack | Category: Combat
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Server-authoritative melee hitbox detection with hit debounce and a lag-compensated raycast swing.
]]

-- ============================================================
-- ServerSideHitboxMeleeCombat.lua  (Script, place in ServerScriptService)
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local combatRemote = Instance.new("RemoteEvent")
combatRemote.Name = "MeleeSwingRequest"
combatRemote.Parent = ReplicatedStorage

local WEAPON_STATS = {
	Fists = { Damage = 6, Range = 5, SwingCooldown = 0.5, HitboxWidth = 4 },
	Sword = { Damage = 18, Range = 7, SwingCooldown = 0.8, HitboxWidth = 5 },
	Dagger = { Damage = 10, Range = 4.5, SwingCooldown = 0.35, HitboxWidth = 3 },
}

-- Per-attacker cooldown so a single player can't spam swings faster than their weapon allows.
local lastSwingTime = {}

-- Per-attacker set of victims already hit during the current swing, cleared each swing,
-- so one raycast pass can't register multiple hits against the same target.
local hitThisSwing = {}

local raycastParams = RaycastParams.new()
raycastParams.FilterType = Enum.RaycastFilterType.Exclude

local function getWeaponStats(weaponName)
	return WEAPON_STATS[weaponName] or WEAPON_STATS.Fists
end

-- Builds an exclude list of the attacker's own character parts so swings never self-hit.
local function buildFilterList(attackerCharacter)
	local list = { attackerCharacter }
	return list
end

-- Sweeps a short capsule of rays from the attacker's weapon origin outward along
-- their look vector to approximate a melee hitbox without a physical touch part.
-- Using several parallel rays (a "fan") compensates for the fact a single ray can
-- miss a moving target between server heartbeats.
local function sweepMeleeHitbox(attacker, weaponStats)
	local character = attacker.Character
	if not character then
		return {}
	end

	local root = character:FindFirstChild("HumanoidRootPart")
	if not root then
		return {}
	end

	raycastParams.FilterDescendantsInstances = buildFilterList(character)

	local origin = root.Position
	local lookVector = root.CFrame.LookVector
	local rightVector = root.CFrame.RightVector

	local hitCharacters = {}
	local rayCount = 5

	for i = 0, rayCount - 1 do
		local t = (i / (rayCount - 1)) - 0.5 -- -0.5 .. 0.5 spread across the fan
		local lateralOffset = rightVector * (t * weaponStats.HitboxWidth)
		local rayOrigin = origin + lateralOffset
		local rayDirection = lookVector * weaponStats.Range

		local result = workspace:Raycast(rayOrigin, rayDirection, raycastParams)
		if result and result.Instance then
			local hitCharacter = result.Instance:FindFirstAncestorOfClass("Model")
			local humanoid = hitCharacter and hitCharacter:FindFirstChildOfClass("Humanoid")
			if humanoid and humanoid.Health > 0 and not hitCharacters[hitCharacter] then
				hitCharacters[hitCharacter] = humanoid
			end
		end
	end

	return hitCharacters
end

-- Applies damage to every humanoid caught in the swing, skipping anyone already
-- hit this swing and skipping the attacker's own character defensively.
local function applyHitboxDamage(attacker, weaponStats, hitCharacters)
	local attackerId = attacker.UserId
	hitThisSwing[attackerId] = hitThisSwing[attackerId] or {}
	local seen = hitThisSwing[attackerId]

	for model, humanoid in pairs(hitCharacters) do
		if model ~= attacker.Character and not seen[model] then
			seen[model] = true
			humanoid:TakeDamage(weaponStats.Damage)

			local victimPlayer = Players:GetPlayerFromCharacter(model)
			print(("[Melee] %s hit %s for %d with %s"):format(
				attacker.Name,
				victimPlayer and victimPlayer.Name or model.Name,
				weaponStats.Damage,
				attacker:GetAttribute("EquippedWeapon") or "Fists"
			))
		end
	end
end

local function handleSwingRequest(player, weaponName)
	if typeof(weaponName) ~= "string" then
		return
	end

	local now = os.clock()
	local weaponStats = getWeaponStats(weaponName)
	local last = lastSwingTime[player.UserId] or 0

	if (now - last) < weaponStats.SwingCooldown then
		return -- ignore swings faster than the weapon's cooldown allows (anti-exploit)
	end
	lastSwingTime[player.UserId] = now
	hitThisSwing[player.UserId] = {}

	local hits = sweepMeleeHitbox(player, weaponStats)
	applyHitboxDamage(player, weaponStats, hits)
end

combatRemote.OnServerEvent:Connect(function(player, weaponName)
	local ok, err = pcall(handleSwingRequest, player, weaponName)
	if not ok then
		warn("[Melee] Swing handler error for " .. player.Name .. ": " .. tostring(err))
	end
end)

Players.PlayerRemoving:Connect(function(player)
	lastSwingTime[player.UserId] = nil
	hitThisSwing[player.UserId] = nil
end)

print("[Melee] Server-side hitbox melee combat initialized.")
