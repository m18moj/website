--[[
    ScripForge — Daily Reward Streak Calendar
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    A DataStore-backed daily login streak with escalating rewards and a streak-break grace period.
]]

-- ============================================================
-- DailyRewardStreakCalendar.lua  (Script, place in ServerScriptService)
-- ============================================================

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local streakStore = DataStoreService:GetDataStore("DailyRewardStreak_v1")

local rewardClaimedRemote = Instance.new("RemoteEvent")
rewardClaimedRemote.Name = "DailyRewardClaimed"
rewardClaimedRemote.Parent = ReplicatedStorage

local SECONDS_PER_DAY = 24 * 60 * 60

-- Streaks break if the player waits longer than this since their last claim,
-- but a claim made after 1 day and before this grace window still counts as
-- "continuing" the streak rather than starting a new one.
local GRACE_PERIOD_SECONDS = SECONDS_PER_DAY * 2

-- Reward table indexed by day-in-cycle (1..7), looping after day 7.
local REWARD_CALENDAR = {
	[1] = { Coins = 50 },
	[2] = { Coins = 75 },
	[3] = { Coins = 100 },
	[4] = { Coins = 150, Gems = 5 },
	[5] = { Coins = 200 },
	[6] = { Coins = 250, Gems = 10 },
	[7] = { Coins = 500, Gems = 25 },
}
local CALENDAR_LENGTH = 7

-- sessionStreaks[userId] = { CurrentStreak, LastClaimUnix, LongestStreak }
local sessionStreaks = {}

local function loadStreakData(player)
	local key = "Streak_" .. player.UserId
	local loaded

	local ok, err = pcall(function()
		loaded = streakStore:GetAsync(key)
	end)
	if not ok then
		warn("[DailyReward] Load failed for " .. player.Name .. ": " .. tostring(err))
	end

	return loaded or { CurrentStreak = 0, LastClaimUnix = 0, LongestStreak = 0 }
end

local function saveStreakData(player, data)
	local key = "Streak_" .. player.UserId
	local ok, err = pcall(function()
		streakStore:SetAsync(key, data)
	end)
	if not ok then
		warn("[DailyReward] Save failed for " .. player.Name .. ": " .. tostring(err))
	end
end

-- Determines whether "now" allows a new claim, and whether that claim continues
-- the existing streak, resets it, or is simply too early (already claimed today).
local function evaluateClaimEligibility(data, now)
	local elapsed = now - data.LastClaimUnix

	if data.LastClaimUnix > 0 and elapsed < SECONDS_PER_DAY then
		return "TooEarly", elapsed
	elseif data.LastClaimUnix == 0 or elapsed <= GRACE_PERIOD_SECONDS then
		return "Continue", elapsed
	else
		return "Reset", elapsed
	end
end

-- Grants a reward table's contents to a player. Hook this up to your real
-- currency/inventory system; left as leaderstats increments for a working demo.
local function grantReward(player, reward)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		return
	end

	local coins = leaderstats:FindFirstChild("Coins")
	if coins and reward.Coins then
		coins.Value += reward.Coins
	end

	local gems = leaderstats:FindFirstChild("Gems")
	if gems and reward.Gems then
		gems.Value += reward.Gems
	end
end

-- Attempts to claim today's reward for a player. Returns (success, dayInCycle, reward|reason).
local function tryClaimDailyReward(player)
	local data = sessionStreaks[player.UserId]
	if not data then
		return false, nil, "NotLoaded"
	end

	local now = os.time()
	local status, elapsed = evaluateClaimEligibility(data, now)

	if status == "TooEarly" then
		return false, nil, "AlreadyClaimedToday"
	end

	if status == "Reset" then
		data.CurrentStreak = 1
	else
		data.CurrentStreak += 1
	end

	data.LastClaimUnix = now
	data.LongestStreak = math.max(data.LongestStreak, data.CurrentStreak)

	local dayInCycle = ((data.CurrentStreak - 1) % CALENDAR_LENGTH) + 1
	local reward = REWARD_CALENDAR[dayInCycle]

	grantReward(player, reward)
	saveStreakData(player, data)

	return true, dayInCycle, reward
end

local function setupLeaderstats(player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = 0
	coins.Parent = leaderstats

	local gems = Instance.new("IntValue")
	gems.Name = "Gems"
	gems.Value = 0
	gems.Parent = leaderstats

	leaderstats.Parent = player
end

Players.PlayerAdded:Connect(function(player)
	setupLeaderstats(player)
	sessionStreaks[player.UserId] = loadStreakData(player)

	local success, dayInCycle, result = tryClaimDailyReward(player)
	if success then
		print(("[DailyReward] %s claimed day %d (streak %d)"):format(
			player.Name, dayInCycle, sessionStreaks[player.UserId].CurrentStreak))
		rewardClaimedRemote:FireClient(player, true, dayInCycle, result, sessionStreaks[player.UserId].CurrentStreak)
	else
		rewardClaimedRemote:FireClient(player, false, nil, result, sessionStreaks[player.UserId].CurrentStreak)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	local data = sessionStreaks[player.UserId]
	if data then
		saveStreakData(player, data)
	end
	sessionStreaks[player.UserId] = nil
end)

game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do
		local data = sessionStreaks[player.UserId]
		if data then
			saveStreakData(player, data)
		end
	end
end)

print("[DailyReward] Daily reward streak calendar initialized, cycle length: " .. CALENDAR_LENGTH)
