--[[
    ScriptForge — Round-Based Minigame Manager
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Lobby-to-round state machine with intermission timers and team balancing.
]]

-- ============================================================
-- RoundManager.lua  (Script, place in ServerScriptService)
-- ============================================================

local Players = game:GetService("Players")
local Teams = game:GetService("Teams")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local remotesFolder = ReplicatedStorage:FindFirstChild("RoundRemotes") or Instance.new("Folder")
remotesFolder.Name = "RoundRemotes"
remotesFolder.Parent = ReplicatedStorage

local roundStateChanged = remotesFolder:FindFirstChild("RoundStateChanged") or Instance.new("RemoteEvent")
roundStateChanged.Name = "RoundStateChanged"
roundStateChanged.Parent = remotesFolder

-- Config
local INTERMISSION_TIME = 20
local ROUND_TIME = 120
local MIN_PLAYERS_TO_START = 2

local STATE = {
	LOBBY = "Lobby",
	INTERMISSION = "Intermission",
	ROUND = "Round",
	ENDING = "Ending",
}

local currentState = STATE.LOBBY
local currentTimer = 0

-- Ensure two balanced teams exist for the minigame
local teamA = Teams:FindFirstChild("Red") or Instance.new("Team")
teamA.Name = "Red"
teamA.TeamColor = BrickColor.new("Bright red")
teamA.AutoAssignable = false
teamA.Parent = Teams

local teamB = Teams:FindFirstChild("Blue") or Instance.new("Team")
teamB.Name = "Blue"
teamB.TeamColor = BrickColor.new("Bright blue")
teamB.AutoAssignable = false
teamB.Parent = Teams

-- Broadcasts the current state + timer to all clients (for lobby/round UI)
local function broadcastState()
	roundStateChanged:FireAllClients(currentState, currentTimer)
end

-- Assigns all current players evenly between the two teams
local function balanceTeams()
	local players = Players:GetPlayers()
	-- Shuffle for fairness rather than always stacking join order
	for i = #players, 2, -1 do
		local j = math.random(i)
		players[i], players[j] = players[j], players[i]
	end

	for index, player in ipairs(players) do
		player.Team = (index % 2 == 1) and teamA or teamB
		local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.Health = humanoid.MaxHealth
		end
	end
end

-- Teleports all players to their team's spawn locations found under Workspace/RoundSpawns
local function teleportToSpawns()
	local spawnsFolder = Workspace:FindFirstChild("RoundSpawns")
	if not spawnsFolder then return end

	for _, player in ipairs(Players:GetPlayers()) do
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if root then
			local teamSpawns = spawnsFolder:FindFirstChild(player.Team and player.Team.Name or "")
			if teamSpawns then
				local spawnPoints = teamSpawns:GetChildren()
				if #spawnPoints > 0 then
					local chosen = spawnPoints[math.random(1, #spawnPoints)]
					root.CFrame = chosen.CFrame + Vector3.new(0, 3, 0)
				end
			end
		end
	end
end

-- Counts down a timer, broadcasting state each second, and returns when it hits zero
local function runTimer(seconds)
	for remaining = seconds, 0, -1 do
		currentTimer = remaining
		broadcastState()
		task.wait(1)
	end
end

-- The main round state machine loop, run forever for the lifetime of the server
local function roundLoop()
	while true do
		currentState = STATE.LOBBY
		broadcastState()

		-- Wait in lobby until enough players have joined
		while #Players:GetPlayers() < MIN_PLAYERS_TO_START do
			task.wait(2)
		end

		currentState = STATE.INTERMISSION
		balanceTeams()
		print("[RoundManager] Intermission started.")
		runTimer(INTERMISSION_TIME)

		if #Players:GetPlayers() < MIN_PLAYERS_TO_START then
			continue -- players left during intermission, go back to lobby
		end

		currentState = STATE.ROUND
		teleportToSpawns()
		print("[RoundManager] Round started.")
		runTimer(ROUND_TIME)

		currentState = STATE.ENDING
		broadcastState()
		print("[RoundManager] Round ended, returning to lobby shortly.")
		task.wait(5)
	end
end

Players.PlayerAdded:Connect(function(player)
	-- Late joiners get current state immediately rather than waiting for the next broadcast
	roundStateChanged:FireClient(player, currentState, currentTimer)
end)

task.spawn(roundLoop)
