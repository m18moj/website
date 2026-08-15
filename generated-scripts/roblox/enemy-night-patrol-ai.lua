--[[
    ScripForge — NPC Patrol & Humanoid AI
    Pack: Roblox Pack | Category: AI
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Humanoid:MoveTo patrol routes, PathfindingService chase logic, attack-cooldown AI.
]]

-- ============================================================
-- PatrolAI.lua  (Script, place inside an NPC Model in Workspace)
-- ============================================================
-- Expects the NPC model to contain Humanoid + HumanoidRootPart, and a
-- "PatrolPoints" folder in Workspace with Part children marking waypoints
-- (override the folder name via the NPC's "PatrolPointsFolder" attribute).

local PathfindingService = game:GetService("PathfindingService")
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local npc = script.Parent
local humanoid = npc:WaitForChild("Humanoid")
local rootPart = npc:WaitForChild("HumanoidRootPart")

local SIGHT_RANGE = 30
local ATTACK_RANGE = 5
local ATTACK_DAMAGE = 10
local ATTACK_COOLDOWN = 1.5
local PATROL_WAIT_TIME = 2

local patrolFolder = Workspace:FindFirstChild(npc:GetAttribute("PatrolPointsFolder") or "PatrolPoints")
local patrolPoints = {}
if patrolFolder then
	for _, point in ipairs(patrolFolder:GetChildren()) do
		if point:IsA("BasePart") then
			table.insert(patrolPoints, point.Position)
		end
	end
end

local currentTarget = nil -- Player currently being chased
local lastAttackTime = 0
local state = "Patrol" -- "Patrol" | "Chase" | "Attack"

-- Finds the closest living player within SIGHT_RANGE, or nil if none in range
local function findNearbyTarget()
	local closestPlayer, closestDistance = nil, SIGHT_RANGE
	for _, player in ipairs(Players:GetPlayers()) do
		local character = player.Character
		local targetHumanoid = character and character:FindFirstChildOfClass("Humanoid")
		local targetRoot = character and character:FindFirstChild("HumanoidRootPart")
		if targetHumanoid and targetHumanoid.Health > 0 and targetRoot then
			local distance = (targetRoot.Position - rootPart.Position).Magnitude
			if distance < closestDistance then
				closestPlayer, closestDistance = player, distance
			end
		end
	end
	return closestPlayer
end

-- Walks a computed path to the destination using PathfindingService, waypoint by waypoint
local function moveAlongPath(destination)
	local path = PathfindingService:CreatePath({
		AgentRadius = 2, AgentHeight = 5, AgentCanJump = true, WaypointSpacing = 4,
	})

	local success = pcall(function() path:ComputeAsync(rootPart.Position, destination) end)
	if not success or path.Status ~= Enum.PathStatus.Success then
		humanoid:MoveTo(destination) -- fallback: direct move if pathfinding fails
		return
	end

	for _, waypoint in ipairs(path:GetWaypoints()) do
		if state ~= "Chase" then break end -- target lost mid-path, abandon route
		if waypoint.Action == Enum.PathWaypointAction.Jump then
			humanoid.Jump = true
		end
		humanoid:MoveTo(waypoint.Position)
		if not humanoid.MoveToFinished:Wait() then break end
	end
end

-- Deals damage to the current target if in range and off cooldown
local function tryAttack()
	if not currentTarget or not currentTarget.Character then return end
	local targetHumanoid = currentTarget.Character:FindFirstChildOfClass("Humanoid")
	local targetRoot = currentTarget.Character:FindFirstChild("HumanoidRootPart")
	if not targetHumanoid or not targetRoot then return end

	local distance = (targetRoot.Position - rootPart.Position).Magnitude
	if distance > ATTACK_RANGE then return end

	local now = os.clock()
	if now - lastAttackTime < ATTACK_COOLDOWN then return end

	lastAttackTime = now
	targetHumanoid:TakeDamage(ATTACK_DAMAGE)
end

-- Patrols between waypoints in order, looping forever, until interrupted by a chase
local function patrolRoutine()
	if #patrolPoints == 0 then return end
	local index = 1
	while state == "Patrol" do
		humanoid:MoveTo(patrolPoints[index])
		humanoid.MoveToFinished:Wait()
		if state ~= "Patrol" then return end
		task.wait(PATROL_WAIT_TIME)
		index = (index % #patrolPoints) + 1
	end
end

-- Main AI loop: continuously evaluate state (patrol / chase / attack)
task.spawn(function()
	while npc.Parent and humanoid.Health > 0 do
		local target = findNearbyTarget()

		if target then
			currentTarget = target
			state = "Chase"
			local targetRoot = target.Character and target.Character:FindFirstChild("HumanoidRootPart")
			if targetRoot then
				local distance = (targetRoot.Position - rootPart.Position).Magnitude
				if distance <= ATTACK_RANGE then
					state = "Attack"
					tryAttack()
				else
					moveAlongPath(targetRoot.Position)
				end
			end
		else
			currentTarget = nil
			if state ~= "Patrol" then
				state = "Patrol"
				task.spawn(patrolRoutine)
			end
		end

		task.wait(0.5)
	end
end)
