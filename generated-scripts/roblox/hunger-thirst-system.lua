--[[
    ScriptForge — Leaderstats & Currency System
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    IntValue leaderstats for coins/XP with DataStore-backed saving and a stat-change event bus.
]]

-- ============================================================
-- CurrencySystem.lua  (Script, place in ServerScriptService)
-- ============================================================

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local currencyStore = DataStoreService:GetDataStore("PlayerCurrency_v1")

-- BindableEvent used internally by other server scripts to react to stat changes
-- (e.g. quest systems, shop systems) without coupling directly to this module.
local StatChanged = Instance.new("BindableEvent")
StatChanged.Name = "StatChanged"
StatChanged.Parent = script

-- RemoteEvent purely for lightweight client notifications (e.g. "+10 Coins" popups)
local remotesFolder = ReplicatedStorage:FindFirstChild("CurrencyRemotes")
	or Instance.new("Folder")
remotesFolder.Name = "CurrencyRemotes"
remotesFolder.Parent = ReplicatedStorage

local statPopupEvent = remotesFolder:FindFirstChild("StatPopup")
	or Instance.new("RemoteEvent")
statPopupEvent.Name = "StatPopup"
statPopupEvent.Parent = remotesFolder

local DEFAULT_DATA = {
	Coins = 0,
	XP = 0,
}

local sessionCache = {} -- [userId] = { Coins = n, XP = n }

-- Builds the leaderstats folder Roblox uses to render the built-in leaderboard
local function createLeaderstats(player, data)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = data.Coins
	coins.Parent = leaderstats

	local xp = Instance.new("IntValue")
	xp.Name = "XP"
	xp.Value = data.XP
	xp.Parent = leaderstats

	leaderstats.Parent = player

	-- Fire the internal event bus whenever a stat changes, and notify the client
	coins:GetPropertyChangedSignal("Value"):Connect(function()
		StatChanged:Fire(player, "Coins", coins.Value)
	end)
	xp:GetPropertyChangedSignal("Value"):Connect(function()
		StatChanged:Fire(player, "XP", xp.Value)
	end)

	return leaderstats
end

-- Loads saved data with basic retry logic to survive transient DataStore hiccups
local function loadPlayerData(player)
	local success, result
	for attempt = 1, 3 do
		success, result = pcall(function()
			return currencyStore:GetAsync("Player_" .. player.UserId)
		end)
		if success then
			break
		end
		warn(("[Currency] Load attempt %d failed for %s: %s"):format(attempt, player.Name, tostring(result)))
		task.wait(1.5)
	end

	if success and result then
		return result
	end

	return table.clone(DEFAULT_DATA)
end

-- Public API: award or deduct currency, clamped so it never goes negative
local function addStat(player, statName, amount)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		return false
	end
	local stat = leaderstats:FindFirstChild(statName)
	if not stat then
		return false
	end

	stat.Value = math.max(0, stat.Value + amount)
	statPopupEvent:FireClient(player, statName, amount)
	return true
end

Players.PlayerAdded:Connect(function(player)
	local data = loadPlayerData(player)
	sessionCache[player.UserId] = data
	createLeaderstats(player, data)
	print("[Currency] Loaded data for " .. player.Name .. " -> Coins: " .. data.Coins .. ", XP: " .. data.XP)
end)

-- Persist to DataStore on leave; keep sessionCache in sync in case of a rejoin race
Players.PlayerRemoving:Connect(function(player)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		return
	end

	local dataToSave = {
		Coins = leaderstats.Coins.Value,
		XP = leaderstats.XP.Value,
	}

	local success, err = pcall(function()
		currencyStore:SetAsync("Player_" .. player.UserId, dataToSave)
	end)

	if not success then
		warn("[Currency] Failed to save data for " .. player.Name .. ": " .. tostring(err))
	else
		print("[Currency] Saved data for " .. player.Name)
	end

	sessionCache[player.UserId] = nil
end)

-- Expose addStat for other server scripts via a ModuleScript-style _G bridge
_G.CurrencyAPI = {
	AddStat = addStat,
	StatChanged = StatChanged,
}
