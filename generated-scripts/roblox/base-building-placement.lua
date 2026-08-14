--[[
    ScriptForge — Tycoon Building & Purchase System
    Pack: Roblox Pack | Category: Tycoon
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Classic Roblox tycoon droppers, conveyors, button-purchase upgrades gated by cash.
]]

-- ============================================================
-- TycoonSystem.lua  (Script, place in ServerScriptService)
-- ============================================================
-- Expects Workspace/Tycoons/<PlayerBaseModel> layout:
--   Droppers/  -> Parts that periodically spawn cash "coins"
--   Buttons/   -> Parts with a ClickDetector, attributes Cost & UpgradeName
--   CashCollector -> Part that destroys coins and grants cash on touch

local Workspace = game:GetService("Workspace")
local Players = game:GetService("Players")
local Debris = game:GetService("Debris")
local tycoonsFolder = Workspace:FindFirstChild("Tycoons")
if not tycoonsFolder then
	warn("[Tycoon] Workspace.Tycoons not found — creating empty folder.")
	tycoonsFolder = Instance.new("Folder")
	tycoonsFolder.Name = "Tycoons"
	tycoonsFolder.Parent = Workspace
end

local DROPPER_INTERVAL = 3 -- seconds between coin spawns per dropper
local DROPPER_COIN_VALUE = 5
local COIN_LIFETIME = 15 -- auto-cleanup if never collected

-- Gets (or creates) the player's Cash leaderstat
local function getCashStat(player)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		leaderstats = Instance.new("Folder")
		leaderstats.Name = "leaderstats"
		leaderstats.Parent = player
	end
	local cash = leaderstats:FindFirstChild("Cash")
	if not cash then
		cash = Instance.new("IntValue")
		cash.Name = "Cash"
		cash.Parent = leaderstats
	end
	return cash
end

-- Spawns a single collectible coin part above a dropper pad
local function spawnCoin(dropperPart, owner)
	local coin = Instance.new("Part")
	coin.Name = "Coin"
	coin.Shape = Enum.PartType.Cylinder
	coin.Size = Vector3.new(0.5, 1.2, 1.2)
	coin.Color = Color3.fromRGB(255, 215, 0)
	coin.Material = Enum.Material.Neon
	coin.CanCollide = false
	coin.Anchored = false
	coin.CFrame = dropperPart.CFrame * CFrame.new(0, 2, 0) * CFrame.Angles(0, 0, math.rad(90))
	coin:SetAttribute("Value", DROPPER_COIN_VALUE)
	coin:SetAttribute("OwnerId", owner.UserId)
	coin.Parent = Workspace
	Debris:AddItem(coin, COIN_LIFETIME)
end

-- Wires a single dropper part to spawn coins on a loop for the given owner
local function setupDropper(dropperPart, owner)
	task.spawn(function()
		while dropperPart.Parent and owner.Parent do
			task.wait(DROPPER_INTERVAL)
			local success, err = pcall(spawnCoin, dropperPart, owner)
			if not success then
				warn("[Tycoon] Dropper spawn failed: " .. tostring(err))
			end
		end
	end)
end

-- Wires the cash collector to destroy touching coins and grant their value
local function setupCollector(collectorPart, owner)
	collectorPart.Touched:Connect(function(hit)
		if hit.Name ~= "Coin" then return end
		if hit:GetAttribute("OwnerId") ~= owner.UserId then return end -- only owner collects
		local value = hit:GetAttribute("Value") or 0
		getCashStat(owner).Value += value
		hit:Destroy()
	end)
end

-- Wires an upgrade button: clicking it purchases an upgrade if the player can afford it
local function setupButton(buttonPart, owner)
	local clickDetector = buttonPart:FindFirstChildOfClass("ClickDetector")
		or Instance.new("ClickDetector", buttonPart)

	local cost = buttonPart:GetAttribute("Cost") or 100
	local upgradeName = buttonPart:GetAttribute("UpgradeName") or "Upgrade"
	local purchased = false

	clickDetector.MouseClick:Connect(function(player)
		if player ~= owner or purchased then return end -- owner-only, one-time purchase

		local cash = getCashStat(owner)
		if cash.Value < cost then return end -- not enough cash, ignore the click

		cash.Value -= cost
		purchased = true
		buttonPart.BrickColor = BrickColor.new("Bright green")
		buttonPart.Parent:SetAttribute(upgradeName .. "_Purchased", true)
		print(("[Tycoon] %s purchased '%s' for %d cash."):format(owner.Name, upgradeName, cost))
	end)
end

-- Assigns a tycoon base to a player and initializes all its droppers/buttons/collector
local function claimTycoon(base, player)
	base:SetAttribute("OwnerId", player.UserId)

	local droppersFolder = base:FindFirstChild("Droppers")
	if droppersFolder then
		for _, dropper in ipairs(droppersFolder:GetChildren()) do
			setupDropper(dropper, player)
		end
	end

	local buttonsFolder = base:FindFirstChild("Buttons")
	if buttonsFolder then
		for _, button in ipairs(buttonsFolder:GetChildren()) do
			setupButton(button, player)
		end
	end

	local collector = base:FindFirstChild("CashCollector")
	if collector then
		setupCollector(collector, player)
	end

	print("[Tycoon] Assigned base '" .. base.Name .. "' to " .. player.Name)
end

-- Simple claim-on-join: assign the first unclaimed base to each joining player
Players.PlayerAdded:Connect(function(player)
	for _, base in ipairs(tycoonsFolder:GetChildren()) do
		if not base:GetAttribute("OwnerId") then
			claimTycoon(base, player)
			break
		end
	end
end)
