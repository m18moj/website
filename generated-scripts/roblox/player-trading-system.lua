--[[
    ScriptForge — Player Trading System
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Server-validated two-player trade window with item offers, both-side confirmation, and atomic swaps.
]]

-- ============================================================
-- PlayerTradingSystem.lua  (Script, place in ServerScriptService)
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotesFolder = ReplicatedStorage:FindFirstChild("TradeRemotes") or Instance.new("Folder")
remotesFolder.Name = "TradeRemotes"
remotesFolder.Parent = ReplicatedStorage

local requestTradeEvent = remotesFolder:FindFirstChild("RequestTrade") or Instance.new("RemoteEvent")
requestTradeEvent.Name = "RequestTrade"
requestTradeEvent.Parent = remotesFolder

local updateOfferEvent = remotesFolder:FindFirstChild("UpdateOffer") or Instance.new("RemoteEvent")
updateOfferEvent.Name = "UpdateOffer"
updateOfferEvent.Parent = remotesFolder

local confirmTradeEvent = remotesFolder:FindFirstChild("ConfirmTrade") or Instance.new("RemoteEvent")
confirmTradeEvent.Name = "ConfirmTrade"
confirmTradeEvent.Parent = remotesFolder

local tradeStateEvent = remotesFolder:FindFirstChild("TradeStateChanged") or Instance.new("RemoteEvent")
tradeStateEvent.Name = "TradeStateChanged"
tradeStateEvent.Parent = remotesFolder

-- Active trade sessions keyed by a session id. Each session tracks both players' offers
-- and confirmation state. Only server-validated inventory item names/quantities are trusted.
local activeSessions = {}
local playerToSession = {}
local nextSessionId = 1

local function newSession(playerA, playerB)
	local sessionId = nextSessionId
	nextSessionId += 1

	local session = {
		Id = sessionId,
		Players = { playerA, playerB },
		Offers = { [playerA.UserId] = {}, [playerB.UserId] = {} },
		Confirmed = { [playerA.UserId] = false, [playerB.UserId] = false },
	}

	activeSessions[sessionId] = session
	playerToSession[playerA.UserId] = sessionId
	playerToSession[playerB.UserId] = sessionId
	return session
end

local function getOtherPlayer(session, player)
	for _, p in ipairs(session.Players) do
		if p ~= player then
			return p
		end
	end
	return nil
end

local function broadcastState(session)
	for _, p in ipairs(session.Players) do
		tradeStateEvent:FireClient(p, {
			SessionId = session.Id,
			Offers = session.Offers,
			Confirmed = session.Confirmed,
		})
	end
end

-- Verifies the player actually owns at least `amount` of `itemName` in their inventory
local function playerOwnsItem(player, itemName, amount)
	local inventory = player:FindFirstChild("Inventory")
	local itemValue = inventory and inventory:FindFirstChild(itemName)
	return itemValue and itemValue.Value >= amount
end

-- Cancels a session and notifies both parties (e.g. on disconnect or explicit cancel)
local function cancelSession(session, reason)
	for _, p in ipairs(session.Players) do
		playerToSession[p.UserId] = nil
		tradeStateEvent:FireClient(p, { SessionId = session.Id, Cancelled = true, Reason = reason })
	end
	activeSessions[session.Id] = nil
end

-- Player A requests a trade with Player B (simple auto-accept; extend with a
-- confirmation prompt on B's client for production use)
requestTradeEvent.OnServerEvent:Connect(function(player, targetPlayer)
	if not targetPlayer or not targetPlayer:IsA("Player") or targetPlayer == player then
		return
	end
	if playerToSession[player.UserId] or playerToSession[targetPlayer.UserId] then
		return -- one of the two is already trading
	end

	local session = newSession(player, targetPlayer)
	broadcastState(session)
end)

-- A player updates their offered items. Resets both confirmations since the deal changed.
updateOfferEvent.OnServerEvent:Connect(function(player, offerList)
	local sessionId = playerToSession[player.UserId]
	local session = sessionId and activeSessions[sessionId]
	if not session then
		return
	end
	if typeof(offerList) ~= "table" then
		return
	end

	-- Validate every entry: { ItemName = string, Amount = positive integer } and ownership
	local validatedOffer = {}
	for _, entry in ipairs(offerList) do
		if typeof(entry) == "table" and typeof(entry.ItemName) == "string" and typeof(entry.Amount) == "number" then
			local amount = math.floor(entry.Amount)
			if amount > 0 and playerOwnsItem(player, entry.ItemName, amount) then
				table.insert(validatedOffer, { ItemName = entry.ItemName, Amount = amount })
			end
		end
	end

	session.Offers[player.UserId] = validatedOffer
	session.Confirmed[player.UserId] = false
	session.Confirmed[getOtherPlayer(session, player).UserId] = false

	broadcastState(session)
end)

-- A player confirms their side of the trade. When both confirm, the swap executes atomically.
confirmTradeEvent.OnServerEvent:Connect(function(player)
	local sessionId = playerToSession[player.UserId]
	local session = sessionId and activeSessions[sessionId]
	if not session then
		return
	end

	session.Confirmed[player.UserId] = true
	broadcastState(session)

	local bothConfirmed = true
	for _, p in ipairs(session.Players) do
		if not session.Confirmed[p.UserId] then
			bothConfirmed = false
		end
	end

	if not bothConfirmed then
		return
	end

	-- Re-validate ownership one final time immediately before the swap (anti-duplication)
	for _, p in ipairs(session.Players) do
		for _, entry in ipairs(session.Offers[p.UserId]) do
			if not playerOwnsItem(p, entry.ItemName, entry.Amount) then
				cancelSession(session, "Item validation failed for " .. p.Name)
				return
			end
		end
	end

	-- Execute the swap: remove from each giver, add to each receiver
	for _, giver in ipairs(session.Players) do
		local receiver = getOtherPlayer(session, giver)
		local giverInventory = giver:FindFirstChild("Inventory")
		local receiverInventory = receiver:FindFirstChild("Inventory")

		for _, entry in ipairs(session.Offers[giver.UserId]) do
			local giverItem = giverInventory:FindFirstChild(entry.ItemName)
			if giverItem then
				giverItem.Value -= entry.Amount
			end

			local receiverItem = receiverInventory:FindFirstChild(entry.ItemName)
			if not receiverItem then
				receiverItem = Instance.new("IntValue")
				receiverItem.Name = entry.ItemName
				receiverItem.Value = 0
				receiverItem.Parent = receiverInventory
			end
			receiverItem.Value += entry.Amount
		end
	end

	for _, p in ipairs(session.Players) do
		playerToSession[p.UserId] = nil
		tradeStateEvent:FireClient(p, { SessionId = session.Id, Completed = true })
	end
	activeSessions[session.Id] = nil
end)

Players.PlayerRemoving:Connect(function(player)
	local sessionId = playerToSession[player.UserId]
	local session = sessionId and activeSessions[sessionId]
	if session then
		cancelSession(session, player.Name .. " disconnected")
	end
end)

print("[Trade] Player trading system initialized.")
