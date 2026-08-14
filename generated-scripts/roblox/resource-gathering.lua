--[[
    ScriptForge — Tool-Based Resource Nodes
    Pack: Roblox Pack | Category: Gameplay
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    ProximityPrompt-triggered resource nodes (trees/rocks/ore) with respawn timers and tool-tier gating.
]]

-- ============================================================
-- ResourceNodeServer.lua  (Script, place in ServerScriptService)
-- ============================================================
-- Expects Workspace/ResourceNodes/ to contain models tagged via
-- attributes: NodeType ("Tree"/"Rock"/"Ore"), RequiredTier (number),
-- YieldItem (string), YieldAmount (number), RespawnTime (number).
-- Each node model must have a PrimaryPart with a ProximityPrompt.

local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

-- RemoteEvent used to tell the client a gather succeeded (for UI/sound feedback)
local remotesFolder = ReplicatedStorage:FindFirstChild("ResourceRemotes")
	or Instance.new("Folder")
remotesFolder.Name = "ResourceRemotes"
remotesFolder.Parent = ReplicatedStorage

local gatherSuccessEvent = remotesFolder:FindFirstChild("GatherSuccess")
	or Instance.new("RemoteEvent")
gatherSuccessEvent.Name = "GatherSuccess"
gatherSuccessEvent.Parent = remotesFolder

-- Tool tier lookup: tool Name -> tier level. Higher tier can harvest higher-tier nodes.
local TOOL_TIERS = {
	["Wooden Axe"] = 1,
	["Stone Axe"] = 2,
	["Iron Axe"] = 3,
	["Wooden Pickaxe"] = 1,
	["Iron Pickaxe"] = 2,
	["Diamond Pickaxe"] = 3,
}

local nodesFolder = Workspace:FindFirstChild("ResourceNodes")
if not nodesFolder then
	warn("[ResourceNodes] Workspace.ResourceNodes not found — creating empty folder.")
	nodesFolder = Instance.new("Folder")
	nodesFolder.Name = "ResourceNodes"
	nodesFolder.Parent = Workspace
end

-- Grants the yield to a player's backpack as a simple currency/item stat
local function grantYield(player, itemName, amount)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		return
	end
	local stat = leaderstats:FindFirstChild(itemName)
	if stat and stat:IsA("NumberValue") or (stat and stat:IsA("IntValue")) then
		stat.Value += amount
	end
end

-- Returns the tool tier the player is currently holding, or 0 if none/unequipped
local function getEquippedToolTier(player)
	local character = player.Character
	if not character then
		return 0
	end
	local tool = character:FindFirstChildOfClass("Tool")
	if not tool then
		return 0
	end
	return TOOL_TIERS[tool.Name] or 0
end

-- Handles the depletion + respawn lifecycle for a single node model
local function setupNode(node)
	local prompt = node:FindFirstChildWhichIsA("ProximityPrompt", true)
	local primaryPart = node.PrimaryPart or node:FindFirstChildWhichIsA("BasePart")
	if not prompt or not primaryPart then
		warn("[ResourceNodes] Node '" .. node.Name .. "' missing ProximityPrompt or PrimaryPart, skipping.")
		return
	end

	local requiredTier = node:GetAttribute("RequiredTier") or 1
	local yieldItem = node:GetAttribute("YieldItem") or "Wood"
	local yieldAmount = node:GetAttribute("YieldAmount") or 1
	local respawnTime = node:GetAttribute("RespawnTime") or 30

	local isDepleted = false
	local originalTransparency = primaryPart.Transparency
	local originalCanCollide = primaryPart.CanCollide

	local function depleteNode()
		isDepleted = true
		prompt.Enabled = false
		primaryPart.Transparency = 1
		primaryPart.CanCollide = false

		task.delay(respawnTime, function()
			if not node.Parent then
				return -- node was removed while waiting to respawn
			end
			isDepleted = false
			primaryPart.Transparency = originalTransparency
			primaryPart.CanCollide = originalCanCollide
			prompt.Enabled = true
		end)
	end

	prompt.Triggered:Connect(function(player)
		if isDepleted then
			return
		end

		local playerTier = getEquippedToolTier(player)
		if playerTier < requiredTier then
			-- Player's tool isn't strong enough for this node tier
			gatherSuccessEvent:FireClient(player, false, "Tool too weak for this node")
			return
		end

		grantYield(player, yieldItem, yieldAmount)
		gatherSuccessEvent:FireClient(player, true, yieldItem, yieldAmount)
		depleteNode()
	end)
end

-- Wire up every existing node and watch for future additions (streamed-in nodes)
for _, node in ipairs(nodesFolder:GetChildren()) do
	if node:IsA("Model") then
		setupNode(node)
	end
end

nodesFolder.ChildAdded:Connect(function(node)
	if node:IsA("Model") then
		task.wait(0.1) -- allow attributes/prompt to finish loading
		setupNode(node)
	end
end)

print("[ResourceNodes] Resource node system initialized with " .. #nodesFolder:GetChildren() .. " node(s).")
