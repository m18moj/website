--[[
    ScripForge — Team Select & Spawn System
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Team-select lobby UI that lets players pick a team and spawns them at team-specific spawn points thereafter.
]]

-- ============================================================
-- TeamSelectSpawnSystem.lua  (Script, place in ServerScriptService)
-- Companion LocalScript expected in StarterGui (TeamSelectClient)
-- ============================================================

local Players = game:GetService("Players")
local Teams = game:GetService("Teams")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

-- Remote used by the lobby UI to request a team change
local remotesFolder = ReplicatedStorage:FindFirstChild("TeamRemotes") or Instance.new("Folder")
remotesFolder.Name = "TeamRemotes"
remotesFolder.Parent = ReplicatedStorage

local selectTeamEvent = remotesFolder:FindFirstChild("SelectTeam") or Instance.new("RemoteEvent")
selectTeamEvent.Name = "SelectTeam"
selectTeamEvent.Parent = remotesFolder

local teamAssignedEvent = remotesFolder:FindFirstChild("TeamAssigned") or Instance.new("RemoteEvent")
teamAssignedEvent.Name = "TeamAssigned"
teamAssignedEvent.Parent = remotesFolder

-- Map team names to a SpawnLocation-holding Folder in Workspace.
-- Each folder should contain one or more Parts/SpawnLocations tagged as spawn points.
local SPAWN_FOLDERS = {
	["Red Team"] = workspace:FindFirstChild("RedSpawns"),
	["Blue Team"] = workspace:FindFirstChild("BlueSpawns"),
}

-- Cooldown to prevent players spamming team switches
local switchCooldowns = {}
local SWITCH_COOLDOWN_SECONDS = 3

-- Picks a random spawn point instance from the given team's folder
local function getRandomSpawnPoint(teamName)
	local folder = SPAWN_FOLDERS[teamName]
	if not folder then
		return nil
	end
	local candidates = folder:GetChildren()
	if #candidates == 0 then
		return nil
	end
	return candidates[math.random(1, #candidates)]
end

-- Teleports the player's character to a team-appropriate spawn point
local function teleportToTeamSpawn(player)
	local character = player.Character
	if not character then
		return
	end
	local humanoidRootPart = character:FindFirstChild("HumanoidRootPart")
	if not humanoidRootPart then
		return
	end

	local teamName = player.Team and player.Team.Name
	local spawnPoint = teamName and getRandomSpawnPoint(teamName)
	if spawnPoint then
		local cframe = spawnPoint:IsA("BasePart") and spawnPoint.CFrame or spawnPoint:GetPivot()
		humanoidRootPart.CFrame = cframe + Vector3.new(0, 3, 0)
	end
end

-- Handles a client's team selection request
selectTeamEvent.OnServerEvent:Connect(function(player, teamName)
	if typeof(teamName) ~= "string" then
		return
	end

	local now = os.clock()
	local lastSwitch = switchCooldowns[player.UserId]
	if lastSwitch and (now - lastSwitch) < SWITCH_COOLDOWN_SECONDS then
		return -- ignore rapid re-requests
	end

	local targetTeam = Teams:FindFirstChild(teamName)
	if not targetTeam or not targetTeam:IsA("Team") then
		warn("[TeamSelect] Invalid team requested by " .. player.Name .. ": " .. tostring(teamName))
		return
	end

	switchCooldowns[player.UserId] = now
	player.Team = targetTeam
	player.Neutral = false

	teamAssignedEvent:FireClient(player, targetTeam.Name, targetTeam.TeamColor)

	-- Respawn the player immediately into their new team's spawn area
	player:LoadCharacter()
end)

-- Route spawns through the team-specific spawn folder whenever a character loads
Players.PlayerAdded:Connect(function(player)
	switchCooldowns[player.UserId] = nil

	player.CharacterAdded:Connect(function()
		task.wait(0.25) -- allow HumanoidRootPart to fully exist
		teleportToTeamSpawn(player)
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	switchCooldowns[player.UserId] = nil
end)

print("[TeamSelect] Team select & spawn system initialized.")
