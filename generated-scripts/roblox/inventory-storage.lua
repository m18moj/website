--[[
    ScriptForge — RemoteEvent Inventory Sync
    Pack: Roblox Pack | Category: Inventory
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Server-authoritative inventory with RemoteEvent-synced UI and exploit-resistant validation.
]]

-- ============================================================
-- InventoryServer.lua  (Script, place in ServerScriptService)
-- ============================================================
-- The server is the sole source of truth for inventory contents. Clients may
-- only *request* actions (use item, drop item); the server validates every
-- request and pushes authoritative state back down via RemoteEvent.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")

local inventoryStore = DataStoreService:GetDataStore("PlayerInventory_v1")

local remotesFolder = ReplicatedStorage:FindFirstChild("InventoryRemotes") or Instance.new("Folder")
remotesFolder.Name = "InventoryRemotes"
remotesFolder.Parent = ReplicatedStorage

local inventoryUpdated = remotesFolder:FindFirstChild("InventoryUpdated") or Instance.new("RemoteEvent")
inventoryUpdated.Name = "InventoryUpdated"
inventoryUpdated.Parent = remotesFolder

local requestUseItem = remotesFolder:FindFirstChild("RequestUseItem") or Instance.new("RemoteEvent")
requestUseItem.Name = "RequestUseItem"
requestUseItem.Parent = remotesFolder

local requestDropItem = remotesFolder:FindFirstChild("RequestDropItem") or Instance.new("RemoteEvent")
requestDropItem.Name = "RequestDropItem"
requestDropItem.Parent = remotesFolder

local MAX_STACK_SIZE = 99
local MAX_SLOTS = 20

-- Definitions of usable items: what happens when "Use" is requested
local ITEM_EFFECTS = {
	HealthPotion = function(player)
		local character = player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if not humanoid then return false end
		humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + 25)
		return true
	end,
}

local inventories = {} -- [userId] = { {Name=string, Count=number}, ... }
local lastActionTime = {} -- per-player debounce to blunt remote-spam exploit attempts
local ACTION_COOLDOWN = 0.25

local function isRateLimited(player)
	local now = os.clock()
	local last = lastActionTime[player.UserId] or 0
	if now - last < ACTION_COOLDOWN then return true end
	lastActionTime[player.UserId] = now
	return false
end

local function pushInventory(player)
	local inv = inventories[player.UserId]
	if inv then inventoryUpdated:FireClient(player, inv) end
end

-- Adds an item to the player's server-side inventory, respecting stack/slot limits
local function addItem(player, itemName, count)
	local inv = inventories[player.UserId]
	if not inv then return false end

	for _, slot in ipairs(inv) do
		if slot.Name == itemName and slot.Count < MAX_STACK_SIZE then
			local toAdd = math.min(MAX_STACK_SIZE - slot.Count, count)
			slot.Count += toAdd
			count -= toAdd
			if count <= 0 then pushInventory(player) return true end
		end
	end

	while count > 0 do
		if #inv >= MAX_SLOTS then return false end -- inventory full, remaining count rejected
		local toAdd = math.min(MAX_STACK_SIZE, count)
		table.insert(inv, { Name = itemName, Count = toAdd })
		count -= toAdd
	end

	pushInventory(player)
	return true
end

Players.PlayerAdded:Connect(function(player)
	local savedInventory
	local success = pcall(function()
		savedInventory = inventoryStore:GetAsync("Inventory_" .. player.UserId)
	end)
	inventories[player.UserId] = (success and savedInventory) or {}
	pushInventory(player)
end)

Players.PlayerRemoving:Connect(function(player)
	local inv = inventories[player.UserId]
	if inv then
		pcall(function() inventoryStore:SetAsync("Inventory_" .. player.UserId, inv) end)
	end
	inventories[player.UserId] = nil
	lastActionTime[player.UserId] = nil
end)

-- Server-authoritative "use item": validate ownership + quantity before applying effect
requestUseItem.OnServerEvent:Connect(function(player, itemName)
	if isRateLimited(player) then return end
	if type(itemName) ~= "string" then return end -- reject malformed exploit payloads
	local inv = inventories[player.UserId]
	if not inv then return end
	for i, slot in ipairs(inv) do
		if slot.Name == itemName then
			local effect = ITEM_EFFECTS[itemName]
			if effect and effect(player) then
				slot.Count -= 1
				if slot.Count <= 0 then table.remove(inv, i) end
				pushInventory(player)
			end
			return
		end
	end
end)

-- Server-authoritative "drop item": removes from inventory only if it truly exists
requestDropItem.OnServerEvent:Connect(function(player, itemName, amount)
	if isRateLimited(player) then return end
	if type(itemName) ~= "string" or type(amount) ~= "number" or amount <= 0 then return end
	local inv = inventories[player.UserId]
	if not inv then return end
	for i, slot in ipairs(inv) do
		if slot.Name == itemName then
			slot.Count = math.max(0, slot.Count - math.floor(amount))
			if slot.Count == 0 then table.remove(inv, i) end
			pushInventory(player)
			return
		end
	end
end)

_G.InventoryAPI = { AddItem = addItem }
