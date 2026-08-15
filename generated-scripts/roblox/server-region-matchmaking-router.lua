--[[
    ScripForge — Server Region & Matchmaking Router
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Region-based server routing with a ping-weighted matchmaking queue for private and public servers.
]]

-- ============================================================
-- ServerRegionMatchmakingRouter.lua  (Script, place in ServerScriptService)
-- ============================================================
-- Queues players by requested game mode, ranks candidate teleport destinations
-- by a combination of measured latency and current population, and batches
-- players into TeleportService calls once a party is full or a timeout hits.

local Players = game:GetService("Players")
local TeleportService = game:GetService("TeleportService")
local MemoryStoreService = game:GetService("MemoryStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotesFolder = ReplicatedStorage:FindFirstChild("MatchmakingRemotes") or Instance.new("Folder")
remotesFolder.Name = "MatchmakingRemotes"
remotesFolder.Parent = ReplicatedStorage

local reportPingEvent = remotesFolder:FindFirstChild("ReportPing") or Instance.new("RemoteEvent")
reportPingEvent.Name = "ReportPing"
reportPingEvent.Parent = remotesFolder

local joinQueueEvent = remotesFolder:FindFirstChild("JoinQueue") or Instance.new("RemoteEvent")
joinQueueEvent.Name = "JoinQueue"
joinQueueEvent.Parent = remotesFolder

local queueStatusEvent = remotesFolder:FindFirstChild("QueueStatus") or Instance.new("RemoteEvent")
queueStatusEvent.Name = "QueueStatus"
queueStatusEvent.Parent = remotesFolder

-- Region place ids this experience can route players into. Ping is measured
-- per player against a lightweight round-trip probe, not against these servers
-- directly, and used only as a proxy for "closer region = lower ping".
local REGION_PLACE_IDS = {
	NA = 0000000001,
	EU = 0000000002,
	ASIA = 0000000003,
}

local PARTY_SIZE = 4
local QUEUE_TIMEOUT = 45 -- seconds a party will wait before launching understaffed
local PING_WEIGHT = 0.7
local POPULATION_WEIGHT = 0.3

-- queues[mode] = { { Player, JoinedAt, PingMs, PreferredRegion }, ... }
local queues = {}

-- Cross-server population counters, shared via MemoryStore so routing decisions
-- account for servers this instance didn't spawn.
local populationMap
local ok, mapOrErr = pcall(function()
	return MemoryStoreService:GetSortedMap("RegionPopulation")
end)
if ok then
	populationMap = mapOrErr
else
	warn("[Matchmaking] MemoryStore unavailable, falling back to local-only population tracking: " .. tostring(mapOrErr))
end

local function getRegionPopulation(region)
	if not populationMap then
		return 0
	end
	local ok2, value = pcall(function()
		return populationMap:GetAsync(region)
	end)
	return (ok2 and value) or 0
end

-- Scores a region: lower is better. Combines the player's measured ping to that
-- region with how full it currently is, so a party doesn't get routed into a
-- nearly-full, low-latency server when a lightly loaded one is nearly as fast.
local function scoreRegion(region, pingMs, populationCap)
	local population = getRegionPopulation(region)
	local pingScore = pingMs / 1000 -- normalize roughly into 0-1 range
	local loadScore = population / math.max(populationCap, 1)
	return (pingScore * PING_WEIGHT) + (loadScore * POPULATION_WEIGHT)
end

local function pickBestRegion(pingByRegion, populationCap)
	local bestRegion, bestScore = nil, math.huge
	for region, pingMs in pairs(pingByRegion) do
		local score = scoreRegion(region, pingMs, populationCap)
		if score < bestScore then
			bestScore = score
			bestRegion = region
		end
	end
	return bestRegion or "NA"
end

local function ensureQueue(mode)
	if not queues[mode] then
		queues[mode] = {}
	end
	return queues[mode]
end

reportPingEvent.OnServerEvent:Connect(function(player, pingByRegion)
	if typeof(pingByRegion) ~= "table" then
		return
	end
	for _, entry in pairs(queues) do
		for _, queued in ipairs(entry) do
			if queued.Player == player then
				queued.PingByRegion = pingByRegion
			end
		end
	end
end)

joinQueueEvent.OnServerEvent:Connect(function(player, mode)
	if typeof(mode) ~= "string" then
		return
	end
	local queue = ensureQueue(mode)

	for _, queued in ipairs(queue) do
		if queued.Player == player then
			return -- already queued
		end
	end

	table.insert(queue, {
		Player = player,
		JoinedAt = os.clock(),
		PingByRegion = { NA = 80, EU = 120, ASIA = 200 }, -- sane defaults until ReportPing arrives
	})

	queueStatusEvent:FireClient(player, { Mode = mode, Position = #queue, PartySize = PARTY_SIZE })
end)

-- Removes a party's worth of players from the queue and teleports them together
-- to whichever region best serves the party's aggregate ping profile.
local function launchParty(mode, party)
	local aggregatePing = {}
	for region in pairs(REGION_PLACE_IDS) do
		local total, count = 0, 0
		for _, queued in ipairs(party) do
			local p = queued.PingByRegion[region]
			if p then
				total += p
				count += 1
			end
		end
		aggregatePing[region] = count > 0 and (total / count) or 999
	end

	local region = pickBestRegion(aggregatePing, 40)
	local placeId = REGION_PLACE_IDS[region]

	local playerList = {}
	for _, queued in ipairs(party) do
		table.insert(playerList, queued.Player)
	end

	local teleportOk, err = pcall(function()
		TeleportService:TeleportPartyAsync(placeId, playerList, { Mode = mode, Region = region })
	end)

	if not teleportOk then
		warn(("[Matchmaking] Teleport failed for mode %s: %s"):format(mode, tostring(err)))
	else
		print(("[Matchmaking] Routed %d players to region %s for mode %s"):format(#playerList, region, mode))
	end
end

-- Background matcher: pops full parties immediately, or partial parties once
-- they've waited past QUEUE_TIMEOUT so nobody queues forever during low pop.
task.spawn(function()
	while true do
		task.wait(2)
		for mode, queue in pairs(queues) do
			while #queue >= PARTY_SIZE do
				local party = {}
				for _ = 1, PARTY_SIZE do
					table.insert(party, table.remove(queue, 1))
				end
				launchParty(mode, party)
			end

			if #queue > 0 and (os.clock() - queue[1].JoinedAt) >= QUEUE_TIMEOUT then
				local party = {}
				while #queue > 0 do
					table.insert(party, table.remove(queue, 1))
				end
				launchParty(mode, party)
			end
		end
	end
end)

Players.PlayerRemoving:Connect(function(player)
	for _, queue in pairs(queues) do
		for i = #queue, 1, -1 do
			if queue[i].Player == player then
				table.remove(queue, i)
			end
		end
	end
end)

print("[Matchmaking] Server region & matchmaking router initialized.")
