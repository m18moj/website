--[[
    ScripForge — Group Rank Sync & Perms
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Syncs a player's Roblox group rank to in-game permission tiers, with a cached refresh to dodge rate limits.
]]

-- ============================================================
-- GroupRankSyncPerms.lua  (Script, place in ServerScriptService)
-- ============================================================
-- Polls GetRankInGroupAsync on join and on a slow interval, maps the numeric
-- group rank onto named permission tiers, and caches results per player so
-- repeated permission checks never hit the group web API directly.

local Players = game:GetService("Players")

local GROUP_ID = 0000000 -- replace with your real group id

-- Ordered high-to-low: first threshold the player's rank meets or exceeds wins.
local RANK_TIERS = {
	{ MinRank = 250, Tier = "Owner" },
	{ MinRank = 200, Tier = "Admin" },
	{ MinRank = 100, Tier = "Moderator" },
	{ MinRank = 50, Tier = "VIP" },
	{ MinRank = 1, Tier = "Member" },
	{ MinRank = 0, Tier = "Guest" },
}

-- How permission tiers translate into actual gameplay capabilities.
local TIER_PERMISSIONS = {
	Owner = { CanBan = true, CanKick = true, CanBuildAnywhere = true, DoubleCoins = true },
	Admin = { CanBan = true, CanKick = true, CanBuildAnywhere = true, DoubleCoins = false },
	Moderator = { CanBan = false, CanKick = true, CanBuildAnywhere = false, DoubleCoins = false },
	VIP = { CanBan = false, CanKick = false, CanBuildAnywhere = false, DoubleCoins = true },
	Member = { CanBan = false, CanKick = false, CanBuildAnywhere = false, DoubleCoins = false },
	Guest = { CanBan = false, CanKick = false, CanBuildAnywhere = false, DoubleCoins = false },
}

local REFRESH_INTERVAL = 600 -- seconds between background rank re-checks
local RETRY_DELAY = 5
local MAX_RETRIES = 3

-- cache[userId] = { Rank = number, Tier = string, LastFetch = os.clock() }
local rankCache = {}

-- Walks the tier table top-down and returns the first tier the rank qualifies for.
local function resolveTier(rank)
	for _, entry in ipairs(RANK_TIERS) do
		if rank >= entry.MinRank then
			return entry.Tier
		end
	end
	return "Guest"
end

-- Fetches a player's numeric rank in GROUP_ID, retrying transient failures
-- with a fixed backoff since group web calls occasionally throttle or time out.
local function fetchGroupRank(player)
	for attempt = 1, MAX_RETRIES do
		local ok, result = pcall(function()
			return player:GetRankInGroupAsync(GROUP_ID)
		end)

		if ok then
			return result
		end

		warn(("[GroupSync] Rank fetch attempt %d/%d failed for %s: %s"):format(
			attempt, MAX_RETRIES, player.Name, tostring(result)))
		if attempt < MAX_RETRIES then
			task.wait(RETRY_DELAY)
		end
	end
	return nil -- caller falls back to cached/guest tier
end

-- Refreshes and caches a single player's tier. Safe to call repeatedly;
-- callers needing permissions should read from the cache, not call this directly.
local function refreshPlayerRank(player)
	local rank = fetchGroupRank(player)
	if rank == nil then
		if not rankCache[player.UserId] then
			-- No prior cache and the fetch failed: default to the lowest tier.
			rankCache[player.UserId] = { Rank = 0, Tier = "Guest", LastFetch = os.clock() }
		end
		return
	end

	rankCache[player.UserId] = {
		Rank = rank,
		Tier = resolveTier(rank),
		LastFetch = os.clock(),
	}
	print(("[GroupSync] %s synced: rank %d -> tier %s"):format(player.Name, rank, rankCache[player.UserId].Tier))
end

-- Public-style accessor: returns the cached permission tier for a player.
local function getTier(player)
	local entry = rankCache[player.UserId]
	return entry and entry.Tier or "Guest"
end

-- Public-style accessor: returns whether a player's tier grants a named permission.
local function hasPermission(player, permissionName)
	local tier = getTier(player)
	local perms = TIER_PERMISSIONS[tier]
	return perms ~= nil and perms[permissionName] == true
end

Players.PlayerAdded:Connect(function(player)
	refreshPlayerRank(player)
end)

Players.PlayerRemoving:Connect(function(player)
	rankCache[player.UserId] = nil
end)

-- Background loop: periodically re-syncs every online player's rank so that
-- promotions/demotions made in-group propagate without requiring a rejoin.
task.spawn(function()
	while true do
		task.wait(REFRESH_INTERVAL)
		for _, player in ipairs(Players:GetPlayers()) do
			local entry = rankCache[player.UserId]
			if not entry or (os.clock() - entry.LastFetch) >= REFRESH_INTERVAL then
				task.spawn(refreshPlayerRank, player)
			end
		end
	end
end)

-- Example: gate a hypothetical building tool behind the CanBuildAnywhere permission
-- Players.PlayerAdded:Connect(function(player)
--     if hasPermission(player, "CanBuildAnywhere") then
--         print(player.Name .. " may build outside plot bounds.")
--     end
-- end)

print("[GroupSync] Group rank sync & perms initialized for group " .. GROUP_ID)
