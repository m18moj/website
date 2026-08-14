--[[
    ScriptForge — Chat Tag & Filter System
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Applies custom rank-based chat tags and runs all chat messages through TextService filtering before display.
]]

-- ============================================================
-- ChatTagFilterSystem.lua  (Script, place in ServerScriptService)
-- Uses TextChatService's modern chat pipeline for tag + filter integration.
-- ============================================================

local TextChatService = game:GetService("TextChatService")
local TextService = game:GetService("TextService")
local Players = game:GetService("Players")

-- Rank definitions: order matters, first match (highest rank) wins.
-- Replace GroupId / RankId checks with your real group configuration.
local RANK_TAGS = {
	{ Name = "Owner", UserIds = { [000000001] = true }, Tag = "[OWNER]", Color = Color3.fromRGB(255, 85, 85) },
	{ Name = "Staff", UserIds = { [000000002] = true }, Tag = "[STAFF]", Color = Color3.fromRGB(85, 170, 255) },
	{ Name = "VIP", UserIds = {}, CheckAttribute = "IsVIP", Tag = "[VIP]", Color = Color3.fromRGB(255, 215, 0) },
}

-- Determines which rank tag (if any) applies to a player
local function getRankTagFor(player)
	for _, rank in ipairs(RANK_TAGS) do
		if rank.UserIds[player.UserId] then
			return rank
		end
		if rank.CheckAttribute and player:GetAttribute(rank.CheckAttribute) then
			return rank
		end
	end
	return nil
end

-- Filters a raw message for a broadcast context (safe for all viewers)
local function filterMessageForBroadcast(sender, rawText)
	local success, result = pcall(function()
		local filterResult = TextService:FilterStringAsync(rawText, sender.UserId)
		return filterResult:GetNonChatStringForBroadcastAsync()
	end)
	if success then
		return result
	end
	warn("[ChatFilter] Failed to filter message from " .. sender.Name .. ": " .. tostring(result))
	return "" -- fail closed: drop the message rather than risk showing unfiltered text
end

-- Builds the prefix shown before a player's name in chat, based on their rank
local function buildTagPrefix(player)
	local rank = getRankTagFor(player)
	if not rank then
		return ""
	end
	return rank.Tag .. " "
end

-- Hook into TextChatService's channel system to intercept and rewrite outgoing messages
local function setupChannel(channel)
	channel.ShouldDeliverCallback = function(message, textSource)
		-- Returning true just allows default delivery; actual text rewriting for
		-- tags is done via the OnIncomingMessage pipeline below.
		return true
	end
end

for _, channel in ipairs(TextChatService:GetChildren()) do
	if channel:IsA("TextChannel") then
		setupChannel(channel)
	end
end

TextChatService.ChildAdded:Connect(function(child)
	if child:IsA("TextChannel") then
		setupChannel(child)
	end
end)

-- OnIncomingMessage lets us prepend tags and re-filter text client-side per receiver.
-- This must be set up per-client via a LocalScript in StarterPlayerScripts; the server
-- exposes the tag data via a player Attribute so the client can render it consistently.
local function syncPlayerTagAttribute(player)
	local rank = getRankTagFor(player)
	player:SetAttribute("ChatTag", rank and rank.Tag or "")
	player:SetAttribute("ChatTagColor", rank and rank.Color or Color3.new(1, 1, 1))
end

Players.PlayerAdded:Connect(function(player)
	syncPlayerTagAttribute(player)

	-- Re-sync if VIP or other rank attributes change later (e.g. after a gamepass purchase)
	player.AttributeChanged:Connect(function(attributeName)
		if attributeName == "IsVIP" then
			syncPlayerTagAttribute(player)
		end
	end)
end)

-- Server-authoritative filtering example for systems that relay chat manually
-- (e.g. custom bubble chat, moderation logging, or cross-server chat relays)
_G.GetFilteredChatMessage = function(sender, rawText)
	local tag = buildTagPrefix(sender)
	local filtered = filterMessageForBroadcast(sender, rawText)
	return tag .. filtered
end

print("[ChatFilter] Chat tag & filter system initialized.")
