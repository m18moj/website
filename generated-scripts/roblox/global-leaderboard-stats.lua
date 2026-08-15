--[[
    ScripForge — Global Leaderboard & Stats
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    OrderedDataStore-backed global leaderboard system that tracks and displays top player stats across servers.
]]

-- ============================================================
-- GlobalLeaderboardStats.lua  (Script, place in ServerScriptService)
-- ============================================================

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LEADERBOARD_NAME = "GlobalWins_v1"
local orderedStore = DataStoreService:GetOrderedDataStore(LEADERBOARD_NAME)

-- Remote for clients to request the current top-N leaderboard entries
local remotesFolder = ReplicatedStorage:FindFirstChild("LeaderboardRemotes") or Instance.new("Folder")
remotesFolder.Name = "LeaderboardRemotes"
remotesFolder.Parent = ReplicatedStorage

local requestTopEvent = remotesFolder:FindFirstChild("RequestTopStats") or Instance.new("RemoteFunction")
requestTopEvent.Name = "RequestTopStats"
requestTopEvent.Parent = remotesFolder

local TOP_ENTRY_COUNT = 25
local SAVE_RETRY_ATTEMPTS = 3

-- Retries a datastore call a few times with backoff, since OrderedDataStore calls can throttle
local function retryDataStoreCall(callback)
	local lastError
	for attempt = 1, SAVE_RETRY_ATTEMPTS do
		local success, result = pcall(callback)
		if success then
			return true, result
		end
		lastError = result
		task.wait(attempt * 0.5)
	end
	warn("[GlobalLeaderboard] DataStore call failed after retries: " .. tostring(lastError))
	return false, nil
end

-- Fetches this player's current stored score, defaulting to 0 if none exists
local function getStoredScore(userId)
	local success, value = retryDataStoreCall(function()
		return orderedStore:GetAsync(tostring(userId))
	end)
	if success and typeof(value) == "number" then
		return value
	end
	return 0
end

-- Writes a player's score to the global ordered store
local function saveScore(userId, score)
	retryDataStoreCall(function()
		orderedStore:SetAsync(tostring(userId), score)
	end)
end

-- Increments a player's tracked stat (e.g. Wins) and persists it globally
local function incrementPlayerStat(player, amount)
	amount = amount or 1
	local leaderstats = player:FindFirstChild("leaderstats")
	local winsStat = leaderstats and leaderstats:FindFirstChild("Wins")
	if not winsStat then
		return
	end

	winsStat.Value += amount
	saveScore(player.UserId, winsStat.Value)
end

-- Retrieves the top N entries as an array of { Name, UserId, Score }
local function fetchTopEntries(count)
	count = math.clamp(count or TOP_ENTRY_COUNT, 1, 100)

	local success, pages = retryDataStoreCall(function()
		return orderedStore:GetSortedAsync(false, count)
	end)
	if not success or not pages then
		return {}
	end

	local currentPage = pages:GetCurrentPage()
	local results = {}
	for _, entry in ipairs(currentPage) do
		local userId = tonumber(entry.key)
		local success2, name = pcall(function()
			return Players:GetNameFromUserIdAsync(userId)
		end)
		table.insert(results, {
			Name = success2 and name or ("User_" .. tostring(userId)),
			UserId = userId,
			Score = entry.value,
		})
	end
	return results
end

-- Serve leaderboard requests from clients (e.g. opening a global leaderboard GUI)
requestTopEvent.OnServerInvoke = function(player, requestedCount)
	if requestedCount ~= nil and typeof(requestedCount) ~= "number" then
		requestedCount = TOP_ENTRY_COUNT
	end
	return fetchTopEntries(requestedCount)
end

-- On join, hydrate leaderstats from the global store so displayed values match cross-server totals
Players.PlayerAdded:Connect(function(player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local wins = Instance.new("IntValue")
	wins.Name = "Wins"
	wins.Value = getStoredScore(player.UserId)
	wins.Parent = leaderstats
end)

-- Example hook: call this from your game logic whenever a player earns a win
_G.AwardGlobalWin = function(player)
	incrementPlayerStat(player, 1)
end

print("[GlobalLeaderboard] Global leaderboard & stats system initialized.")
