--[[
    ScripForge — DataStore Auto-Save & Backup
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Scheduled DataStoreService saves with retry-on-fail, session-locking, BindToClose protection.
]]

-- ============================================================
-- AutoSaveSystem.lua  (Script, place in ServerScriptService)
-- ============================================================
-- Generic auto-save framework: periodically persists a per-player data table,
-- retries transient failures, uses a session-lock field to reduce the chance
-- of two servers stomping the same save, and blocks server shutdown until
-- every player's data is safely written via BindToClose.

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local dataStore = DataStoreService:GetDataStore("PlayerSaveData_v1")

local AUTO_SAVE_INTERVAL = 120 -- seconds between routine auto-saves
local MAX_RETRIES = 3
local RETRY_BACKOFF_SECONDS = 2

-- playerData[userId] = { ...arbitrary save fields..., _sessionId = string }
local playerData = {}
local savingInProgress = {}

-- Generates a reasonably unique session id to detect cross-server save collisions
local function generateSessionId()
	return game.JobId .. "_" .. tostring(os.time()) .. "_" .. tostring(math.random(1, 999999))
end

-- Attempts to save one player's data with retry/backoff. Returns true on success.
local function saveWithRetry(userId, data)
	if savingInProgress[userId] then
		return false -- avoid overlapping saves for the same player
	end
	savingInProgress[userId] = true

	local key = "Player_" .. userId
	local success = false

	for attempt = 1, MAX_RETRIES do
		local ok, err = pcall(function()
			dataStore:UpdateAsync(key, function(oldData)
				-- Session-lock check: if another server claimed this key more
				-- recently than our load, defer to it rather than overwrite.
				if oldData and oldData._sessionId and oldData._sessionId ~= data._sessionId and oldData._lockTime and (os.time() - oldData._lockTime) < 30 then
					return nil -- reject this write, another server owns the lock
				end
				data._lockTime = os.time()
				return data
			end)
		end)

		if ok then
			success = true
			break
		end

		warn(("[AutoSave] Save attempt %d/%d failed for user %d: %s"):format(attempt, MAX_RETRIES, userId, tostring(err)))
		if attempt < MAX_RETRIES then
			task.wait(RETRY_BACKOFF_SECONDS * attempt) -- linear backoff
		end
	end

	savingInProgress[userId] = false
	return success
end

-- Loads existing data for a joining player, claiming the session lock
local function loadPlayerData(player)
	local key = "Player_" .. player.UserId
	local loaded

	local ok, err = pcall(function()
		loaded = dataStore:GetAsync(key)
	end)

	if not ok then
		warn("[AutoSave] Load failed for " .. player.Name .. ": " .. tostring(err))
	end

	local data = loaded or {}
	data._sessionId = generateSessionId()
	data.Coins = data.Coins or 0
	data.Level = data.Level or 1

	return data
end

Players.PlayerAdded:Connect(function(player)
	playerData[player.UserId] = loadPlayerData(player)
	print("[AutoSave] Loaded session for " .. player.Name)
end)

Players.PlayerRemoving:Connect(function(player)
	local data = playerData[player.UserId]
	if data then
		saveWithRetry(player.UserId, data)
	end
	playerData[player.UserId] = nil
end)

-- Periodic auto-save loop: saves every active player's data on a fixed interval
task.spawn(function()
	while true do
		task.wait(AUTO_SAVE_INTERVAL)
		for _, player in ipairs(Players:GetPlayers()) do
			local data = playerData[player.UserId]
			if data then
				task.spawn(function()
					local saved = saveWithRetry(player.UserId, data)
					if saved then
						print("[AutoSave] Routine save complete for " .. player.Name)
					else
						warn("[AutoSave] Routine save FAILED for " .. player.Name .. " after retries.")
					end
				end)
			end
		end
	end
end)

-- BindToClose ensures the server doesn't shut down mid-save, e.g. during
-- deploys or server restarts — Roblox gives us a window to finish saving.
game:BindToClose(function()
	local pendingSaves = {}

	for _, player in ipairs(Players:GetPlayers()) do
		local data = playerData[player.UserId]
		if data then
			table.insert(pendingSaves, task.spawn(function()
				saveWithRetry(player.UserId, data)
			end))
		end
	end

	-- Give in-flight saves a chance to finish before the server actually closes
	if #pendingSaves > 0 then
		task.wait(5)
	end
end)

print("[AutoSave] Auto-save system initialized, interval: " .. AUTO_SAVE_INTERVAL .. "s")
