--[[
    ScripForge — Building Plot Permission System
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Per-player plot ownership with a collaborator permission list for shared building access.
]]

-- ============================================================
-- BuildingPlotPermissionSystem.lua  (Script, place in ServerScriptService)
-- Expects a "Plots" folder in Workspace containing Plot1, Plot2, ... models,
-- each with a PlotOwner ObjectValue and an invisible "Bounds" Part sized to
-- the buildable region.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local remotesFolder = ReplicatedStorage:FindFirstChild("PlotRemotes") or Instance.new("Folder")
remotesFolder.Name = "PlotRemotes"
remotesFolder.Parent = ReplicatedStorage

local claimPlotEvent = remotesFolder:FindFirstChild("ClaimPlot") or Instance.new("RemoteEvent")
claimPlotEvent.Name = "ClaimPlot"
claimPlotEvent.Parent = remotesFolder

local addCollaboratorEvent = remotesFolder:FindFirstChild("AddCollaborator") or Instance.new("RemoteEvent")
addCollaboratorEvent.Name = "AddCollaborator"
addCollaboratorEvent.Parent = remotesFolder

local removeCollaboratorEvent = remotesFolder:FindFirstChild("RemoveCollaborator") or Instance.new("RemoteEvent")
removeCollaboratorEvent.Name = "RemoveCollaborator"
removeCollaboratorEvent.Parent = remotesFolder

local placeItemEvent = remotesFolder:FindFirstChild("PlaceItem") or Instance.new("RemoteEvent")
placeItemEvent.Name = "PlaceItem"
placeItemEvent.Parent = remotesFolder

local plotsFolder = Workspace:WaitForChild("Plots")

-- ownership[plotName] = { OwnerUserId = number, Collaborators = { [userId] = true } }
local ownership = {}

local function getPlot(plotName)
	return plotsFolder:FindFirstChild(plotName)
end

local function isWithinBounds(plot, position)
	local bounds = plot:FindFirstChild("Bounds")
	if not bounds or not bounds:IsA("BasePart") then
		return false
	end

	local relative = bounds.CFrame:PointToObjectSpace(position)
	local halfSize = bounds.Size / 2
	return math.abs(relative.X) <= halfSize.X
		and math.abs(relative.Y) <= halfSize.Y
		and math.abs(relative.Z) <= halfSize.Z
end

-- True if the player owns the plot or has been granted collaborator access.
local function hasBuildAccess(player, plotName)
	local record = ownership[plotName]
	if not record then
		return false
	end
	if record.OwnerUserId == player.UserId then
		return true
	end
	return record.Collaborators[player.UserId] == true
end

-- Claims an unowned plot for the requesting player. No-ops if already owned.
local function claimPlot(player, plotName)
	local plot = getPlot(plotName)
	if not plot then
		return false, "Unknown plot"
	end

	local record = ownership[plotName]
	if record and record.OwnerUserId ~= nil then
		return false, "Plot already owned"
	end

	ownership[plotName] = { OwnerUserId = player.UserId, Collaborators = {} }

	local ownerValue = plot:FindFirstChild("PlotOwner")
	if not ownerValue then
		ownerValue = Instance.new("ObjectValue")
		ownerValue.Name = "PlotOwner"
		ownerValue.Parent = plot
	end
	-- ObjectValue can't hold a UserId directly; store the player reference while online.
	ownerValue.Value = player

	local nameTag = plot:FindFirstChild("OwnerNameGui", true)
	if nameTag and nameTag:IsA("BillboardGui") then
		local label = nameTag:FindFirstChildOfClass("TextLabel")
		if label then
			label.Text = player.Name .. "'s Plot"
		end
	end

	print(("[Plots] %s claimed %s"):format(player.Name, plotName))
	return true
end

local function addCollaborator(player, plotName, targetUserId)
	local record = ownership[plotName]
	if not record or record.OwnerUserId ~= player.UserId then
		return false, "Not the plot owner"
	end
	if typeof(targetUserId) ~= "number" then
		return false, "Invalid target"
	end

	record.Collaborators[targetUserId] = true
	return true
end

local function removeCollaborator(player, plotName, targetUserId)
	local record = ownership[plotName]
	if not record or record.OwnerUserId ~= player.UserId then
		return false, "Not the plot owner"
	end

	record.Collaborators[targetUserId] = nil
	return true
end

claimPlotEvent.OnServerEvent:Connect(function(player, plotName)
	if typeof(plotName) ~= "string" then
		return
	end
	claimPlot(player, plotName)
end)

addCollaboratorEvent.OnServerEvent:Connect(function(player, plotName, targetUserId)
	if typeof(plotName) ~= "string" then
		return
	end
	addCollaborator(player, plotName, targetUserId)
end)

removeCollaboratorEvent.OnServerEvent:Connect(function(player, plotName, targetUserId)
	if typeof(plotName) ~= "string" then
		return
	end
	removeCollaborator(player, plotName, targetUserId)
end)

-- Validates permission + bounds before letting a client-driven item placement
-- through. `itemTemplate` is expected to be a whitelisted asset name, not raw
-- instance data, so this never trusts geometry sent by the client.
local PLACEABLE_ITEMS = workspace:FindFirstChild("PlaceableItemTemplates")

placeItemEvent.OnServerEvent:Connect(function(player, plotName, itemName, position)
	if typeof(plotName) ~= "string" or typeof(itemName) ~= "string" or typeof(position) ~= "Vector3" then
		return
	end

	local plot = getPlot(plotName)
	if not plot or not hasBuildAccess(player, plotName) then
		return
	end

	if not isWithinBounds(plot, position) then
		return
	end

	local template = PLACEABLE_ITEMS and PLACEABLE_ITEMS:FindFirstChild(itemName)
	if not template then
		warn("[Plots] Unknown placeable item requested: " .. itemName)
		return
	end

	local clone = template:Clone()
	clone:PivotTo(CFrame.new(position))
	clone.Parent = plot
end)

-- Free plots back up when the owner leaves so plots don't sit permanently locked
-- for a whole server's lifetime (adjust/remove for persistent-ownership games).
Players.PlayerRemoving:Connect(function(player)
	for plotName, record in pairs(ownership) do
		if record.OwnerUserId == player.UserId then
			ownership[plotName] = nil
			local plot = getPlot(plotName)
			local ownerValue = plot and plot:FindFirstChild("PlotOwner")
			if ownerValue then
				ownerValue.Value = nil
			end
		end
	end
end)

print("[Plots] Building plot permission system initialized.")
