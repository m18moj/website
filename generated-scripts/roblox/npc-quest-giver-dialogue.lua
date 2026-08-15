--[[
    ScripForge — NPC Quest Giver & Dialogue
    Pack: Roblox Pack | Category: Dialogue
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    ProximityPrompt-driven NPC dialogue tree that offers, tracks, and rewards quests per player.
]]

-- ============================================================
-- NPCQuestGiverDialogue.lua  (Script, place inside the NPC Model)
-- Expects the NPC Model to contain a PrimaryPart with a ProximityPrompt child.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local npcModel = script.Parent
local promptPart = npcModel.PrimaryPart or npcModel:FindFirstChildWhichIsA("BasePart")

local prompt = promptPart and promptPart:FindFirstChildWhichIsA("ProximityPrompt")
if not prompt then
	prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Talk"
	prompt.ObjectText = npcModel.Name
	prompt.HoldDuration = 0.25
	prompt.MaxActivationDistance = 10
	prompt.Parent = promptPart
end

-- Remotes for dialogue UI communication
local remotesFolder = ReplicatedStorage:FindFirstChild("QuestRemotes") or Instance.new("Folder")
remotesFolder.Name = "QuestRemotes"
remotesFolder.Parent = ReplicatedStorage

local openDialogueEvent = remotesFolder:FindFirstChild("OpenDialogue") or Instance.new("RemoteEvent")
openDialogueEvent.Name = "OpenDialogue"
openDialogueEvent.Parent = remotesFolder

local chooseOptionEvent = remotesFolder:FindFirstChild("ChooseDialogueOption") or Instance.new("RemoteEvent")
chooseOptionEvent.Name = "ChooseDialogueOption"
chooseOptionEvent.Parent = remotesFolder

local questProgressEvent = remotesFolder:FindFirstChild("QuestProgress") or Instance.new("RemoteEvent")
questProgressEvent.Name = "QuestProgress"
questProgressEvent.Parent = remotesFolder

-- Quest definition for this NPC
local QUEST_ID = "GatherHerbs"
local QUEST = {
	Name = "Gather Herbs",
	Description = "Bring me 5 Wild Herbs from the forest and I'll reward you.",
	RequiredItem = "WildHerb",
	RequiredAmount = 5,
	RewardStat = "Cash",
	RewardAmount = 100,
}

-- Per-player quest state, tracked server-side to prevent tampering.
-- Keyed by UserId -> { Accepted = bool, Completed = bool }
local playerQuestState = {}

local function getState(player)
	local state = playerQuestState[player.UserId]
	if not state then
		state = { Accepted = false, Completed = false }
		playerQuestState[player.UserId] = state
	end
	return state
end

-- Counts how many of the required item the player currently holds (assumes a
-- backpack/inventory folder pattern with IntValue counters under player.Inventory)
local function countPlayerItem(player, itemName)
	local inventory = player:FindFirstChild("Inventory")
	local itemValue = inventory and inventory:FindFirstChild(itemName)
	return itemValue and itemValue.Value or 0
end

-- Builds the dialogue tree node presented based on current quest state
local function getDialogueNode(player)
	local state = getState(player)

	if state.Completed then
		return {
			Speaker = npcModel.Name,
			Text = "Thanks again for your help, traveler!",
			Options = { { Id = "close", Text = "Goodbye." } },
		}
	end

	if not state.Accepted then
		return {
			Speaker = npcModel.Name,
			Text = QUEST.Description,
			Options = {
				{ Id = "accept", Text = "I'll help you." },
				{ Id = "decline", Text = "Not right now." },
			},
		}
	end

	local haveAmount = countPlayerItem(player, QUEST.RequiredItem)
	if haveAmount >= QUEST.RequiredAmount then
		return {
			Speaker = npcModel.Name,
			Text = "You've brought everything I need. Here's your reward!",
			Options = { { Id = "turnin", Text = "Turn in quest." } },
		}
	end

	return {
		Speaker = npcModel.Name,
		Text = ("You still need %d more %s."):format(QUEST.RequiredAmount - haveAmount, QUEST.RequiredItem),
		Options = { { Id = "close", Text = "I'll be back." } },
	}
end

-- Handles a player selecting a dialogue option
local function handleOption(player, optionId)
	local state = getState(player)

	if optionId == "accept" then
		state.Accepted = true
		questProgressEvent:FireClient(player, QUEST_ID, "Accepted")
	elseif optionId == "turnin" then
		local haveAmount = countPlayerItem(player, QUEST.RequiredItem)
		if haveAmount >= QUEST.RequiredAmount and not state.Completed then
			local inventory = player:FindFirstChild("Inventory")
			local itemValue = inventory and inventory:FindFirstChild(QUEST.RequiredItem)
			if itemValue then
				itemValue.Value -= QUEST.RequiredAmount
			end

			local leaderstats = player:FindFirstChild("leaderstats")
			local rewardStat = leaderstats and leaderstats:FindFirstChild(QUEST.RewardStat)
			if rewardStat then
				rewardStat.Value += QUEST.RewardAmount
			end

			state.Completed = true
			questProgressEvent:FireClient(player, QUEST_ID, "Completed")
		end
	end

	openDialogueEvent:FireClient(player, getDialogueNode(player))
end

prompt.Triggered:Connect(function(player)
	openDialogueEvent:FireClient(player, getDialogueNode(player))
end)

chooseOptionEvent.OnServerEvent:Connect(function(player, questId, optionId)
	if questId ~= QUEST_ID then
		return
	end
	if typeof(optionId) ~= "string" then
		return
	end
	handleOption(player, optionId)
end)

Players.PlayerRemoving:Connect(function(player)
	playerQuestState[player.UserId] = nil
end)

print("[Quest] NPC quest giver initialized for " .. npcModel.Name)
