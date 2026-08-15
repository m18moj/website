--[[
    ScripForge — Admin Command & Moderation
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    Chat-command framework that lets role-gated admins kick, ban, teleport, and moderate players.
]]

-- ============================================================
-- AdminCommandModeration.lua  (Script, place in ServerScriptService)
-- ============================================================

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local banStore = DataStoreService:GetDataStore("AdminBanList_v1")

-- Role table: map UserIds to a permission level. Higher = more powerful.
-- Replace these with your real staff UserIds before shipping.
local ADMIN_ROLES = {
	[000000001] = 3, -- Owner: all commands
	[000000002] = 2, -- Admin: kick/ban/teleport
	[000000003] = 1, -- Moderator: kick only
}

local COMMAND_PREFIX = "/"

-- Required permission level per command
local COMMAND_LEVELS = {
	kick = 1,
	ban = 2,
	unban = 2,
	teleport = 2,
	bring = 2,
	shutdown = 3,
}

local function getPermissionLevel(player)
	return ADMIN_ROLES[player.UserId] or 0
end

-- Checks the persistent ban list before allowing a player to stay in-game
local function isBanned(userId)
	local success, result = pcall(function()
		return banStore:GetAsync(tostring(userId))
	end)
	return success and result == true
end

local function setBanned(userId, banned)
	pcall(function()
		banStore:SetAsync(tostring(userId), banned or nil)
	end)
end

-- Resolves a partial player name (case-insensitive substring) to a Player instance
local function findPlayerByPartialName(query)
	if not query then
		return nil
	end
	query = query:lower()
	for _, plr in ipairs(Players:GetPlayers()) do
		if plr.Name:lower():sub(1, #query) == query then
			return plr
		end
	end
	return nil
end

-- Command implementations. Each receives (admin, targetPlayer, argString)
local COMMANDS = {}

COMMANDS.kick = function(admin, target, reason)
	if not target then return end
	target:Kick("Kicked by admin " .. admin.Name .. (reason and (": " .. reason) or ""))
end

COMMANDS.ban = function(admin, target, reason)
	if not target then return end
	setBanned(target.UserId, true)
	target:Kick("Banned by admin " .. admin.Name .. (reason and (": " .. reason) or ""))
end

COMMANDS.unban = function(admin, target, argString)
	local userId = tonumber(argString)
	if not userId then return end
	setBanned(userId, false)
end

COMMANDS.teleport = function(admin, target)
	if not target or not target.Character or not admin.Character then return end
	local adminRoot = admin.Character:FindFirstChild("HumanoidRootPart")
	local targetRoot = target.Character:FindFirstChild("HumanoidRootPart")
	if adminRoot and targetRoot then
		adminRoot.CFrame = targetRoot.CFrame * CFrame.new(3, 0, 0)
	end
end

COMMANDS.bring = function(admin, target)
	if not target or not target.Character or not admin.Character then return end
	local adminRoot = admin.Character:FindFirstChild("HumanoidRootPart")
	local targetRoot = target.Character:FindFirstChild("HumanoidRootPart")
	if adminRoot and targetRoot then
		targetRoot.CFrame = adminRoot.CFrame * CFrame.new(3, 0, 0)
	end
end

COMMANDS.shutdown = function(admin)
	for _, plr in ipairs(Players:GetPlayers()) do
		plr:Kick("Server shutting down for maintenance (initiated by " .. admin.Name .. ")")
	end
end

-- Parses "/command targetName reason text..." and dispatches to the handler
local function processChatCommand(admin, message)
	if message:sub(1, #COMMAND_PREFIX) ~= COMMAND_PREFIX then
		return -- not a command, ignore as regular chat
	end

	local body = message:sub(#COMMAND_PREFIX + 1)
	local commandName, rest = body:match("^(%S+)%s*(.*)$")
	if not commandName then
		return
	end
	commandName = commandName:lower()

	local requiredLevel = COMMAND_LEVELS[commandName]
	if not requiredLevel then
		return -- not a recognized admin command
	end

	if getPermissionLevel(admin) < requiredLevel then
		warn("[Admin] " .. admin.Name .. " attempted '" .. commandName .. "' without permission.")
		return
	end

	local targetName, argRest = rest:match("^(%S*)%s*(.*)$")
	local target = findPlayerByPartialName(targetName)

	local handler = COMMANDS[commandName]
	if handler then
		handler(admin, target, argRest)
		print(("[Admin] %s executed '%s' on %s"):format(admin.Name, commandName, target and target.Name or "n/a"))
	end
end

-- Enforce bans on join and hook chat for command parsing
Players.PlayerAdded:Connect(function(player)
	if isBanned(player.UserId) then
		player:Kick("You are banned from this server.")
		return
	end

	player.Chatted:Connect(function(message)
		processChatCommand(player, message)
	end)
end)

print("[Admin] Admin command & moderation framework initialized.")
