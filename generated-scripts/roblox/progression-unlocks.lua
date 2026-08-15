--[[
    ScripForge — Obby Checkpoint & Stage System
    Pack: Roblox Pack | Category: Progression
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Checkpoint-touch save points, stage progression, leaderboard-tracked completion times.
]]

-- ============================================================
-- CheckpointSystem.lua  (Script, place in ServerScriptService)
-- ============================================================
-- Expects Workspace/Checkpoints/ to contain Parts named "Checkpoint1",
-- "Checkpoint2", etc. in ascending stage order. Touching a checkpoint part
-- saves the player's furthest stage and respawns them there on death.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local progressStore = DataStoreService:GetDataStore("ObbyProgress_v1")
local timeStore = DataStoreService:GetOrderedDataStore("ObbyBestTimes_v1")

local remotesFolder = ReplicatedStorage:FindFirstChild("ObbyRemotes")
	or Instance.new("Folder")
remotesFolder.Name = "ObbyRemotes"
remotesFolder.Parent = ReplicatedStorage

local checkpointReached = remotesFolder:FindFirstChild("CheckpointReached")
	or Instance.new("RemoteEvent")
checkpointReached.Name = "CheckpointReached"
checkpointReached.Parent = remotesFolder

local checkpointsFolder = Workspace:FindFirstChild("Checkpoints")
if not checkpointsFolder then
	warn("[Obby] Workspace.Checkpoints not found — creating empty folder.")
	checkpointsFolder = Instance.new("Folder")
	checkpointsFolder.Name = "Checkpoints"
	checkpointsFolder.Parent = Workspace
end

-- Sort checkpoint parts by the trailing number in their name (Checkpoint1, Checkpoint2, ...)
local sortedCheckpoints = {}
for _, part in ipairs(checkpointsFolder:GetChildren()) do
	if part:IsA("BasePart") then
		local stageNum = tonumber(part.Name:match("%d+$"))
		if stageNum then
			sortedCheckpoints[stageNum] = part
		end
	end
end

local playerProgress = {} -- [userId] = { Stage = n, StartTime = os.clock() }

local function getStat(player, name)
	local leaderstats = player:FindFirstChild("leaderstats")
	return leaderstats and leaderstats:FindFirstChild(name)
end

local function setupLeaderstats(player, savedStage)
	local leaderstats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local stage = leaderstats:FindFirstChild("Stage") or Instance.new("IntValue")
	stage.Name = "Stage"
	stage.Value = savedStage
	stage.Parent = leaderstats
end

Players.PlayerAdded:Connect(function(player)
	local savedStage = 0
	local success, result = pcall(function()
		return progressStore:GetAsync("Progress_" .. player.UserId)
	end)
	if success and result then
		savedStage = result
	end

	setupLeaderstats(player, savedStage)
	playerProgress[player.UserId] = { Stage = savedStage, StartTime = os.clock() }

	player.CharacterAdded:Connect(function(character)
		local humanoid = character:WaitForChild("Humanoid")
		local rootPart = character:WaitForChild("HumanoidRootPart")

		-- Respawn at the furthest reached checkpoint instead of the default spawn
		local progress = playerProgress[player.UserId]
		local checkpointPart = progress and sortedCheckpoints[progress.Stage]
		if checkpointPart then
			rootPart.CFrame = checkpointPart.CFrame + Vector3.new(0, 3, 0)
		end

		humanoid.Died:Connect(function()
			-- Track death count via attribute for optional UI/leaderboard use
			player:SetAttribute("Deaths", (player:GetAttribute("Deaths") or 0) + 1)
		end)
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	local progress = playerProgress[player.UserId]
	if progress then
		pcall(function()
			progressStore:SetAsync("Progress_" .. player.UserId, progress.Stage)
		end)
	end
	playerProgress[player.UserId] = nil
end)

-- Wires a checkpoint part's Touched event to advance the player's saved stage
local function setupCheckpoint(stageNum, part)
	part.Touched:Connect(function(hit)
		local character = hit.Parent
		local player = Players:GetPlayerFromCharacter(character)
		if not player then
			return
		end

		local progress = playerProgress[player.UserId]
		if not progress or stageNum <= progress.Stage then
			return -- already passed this checkpoint or lower than current progress
		end

		progress.Stage = stageNum
		local stat = getStat(player, "Stage")
		if stat then
			stat.Value = stageNum
		end

		checkpointReached:FireClient(player, stageNum)

		-- If this is the final checkpoint, record a completion time on the ordered leaderboard
		local isFinalStage = (sortedCheckpoints[stageNum + 1] == nil)
		if isFinalStage then
			local elapsed = math.floor(os.clock() - progress.StartTime)
			pcall(function()
				timeStore:SetAsync("Time_" .. player.UserId, elapsed)
			end)
			print(("[Obby] %s finished the course in %d seconds."):format(player.Name, elapsed))
		end
	end)
end

for stageNum, part in pairs(sortedCheckpoints) do
	setupCheckpoint(stageNum, part)
end
