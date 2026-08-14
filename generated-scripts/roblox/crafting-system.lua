--[[
    ScriptForge — Gamepass & Dev Product Shop
    Pack: Roblox Pack | Category: Monetization
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    MarketplaceService-integrated gamepass/developer-product purchase flow with receipt handling.
]]

-- ============================================================
-- MonetizationShop.lua  (Script, place in ServerScriptService)
-- ============================================================

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")

local purchaseStore = DataStoreService:GetDataStore("DevProductPurchases_v1")

-- Configure your gamepasses and developer products here.
local GAMEPASSES = {
	VIP = { Id = 000000000, GrantsAttribute = "IsVIP" },
	DoubleCash = { Id = 000000001, GrantsAttribute = "HasDoubleCash" },
}

local DEV_PRODUCTS = {
	[000000010] = { RewardStat = "Cash", Amount = 500 },
	[000000011] = { RewardStat = "Cash", Amount = 1200 },
}

local remotesFolder = ReplicatedStorage:FindFirstChild("ShopRemotes") or Instance.new("Folder")
remotesFolder.Name = "ShopRemotes"
remotesFolder.Parent = ReplicatedStorage

local promptGamepassPurchase = remotesFolder:FindFirstChild("PromptGamepassPurchase") or Instance.new("RemoteEvent")
promptGamepassPurchase.Name = "PromptGamepassPurchase"
promptGamepassPurchase.Parent = remotesFolder

local promptProductPurchase = remotesFolder:FindFirstChild("PromptProductPurchase") or Instance.new("RemoteEvent")
promptProductPurchase.Name = "PromptProductPurchase"
promptProductPurchase.Parent = remotesFolder

local purchaseResultEvent = remotesFolder:FindFirstChild("PurchaseResult") or Instance.new("RemoteEvent")
purchaseResultEvent.Name = "PurchaseResult"
purchaseResultEvent.Parent = remotesFolder

-- Client requests a gamepass purchase prompt (must originate from a real client action)
promptGamepassPurchase.OnServerEvent:Connect(function(player, gamepassKey)
	local passInfo = GAMEPASSES[gamepassKey]
	if not passInfo then
		warn("[Shop] Unknown gamepass key requested: " .. tostring(gamepassKey))
		return
	end
	MarketplaceService:PromptGamePassPurchase(player, passInfo.Id)
end)

-- Client requests a developer product purchase prompt
promptProductPurchase.OnServerEvent:Connect(function(player, productId)
	if not DEV_PRODUCTS[productId] then
		warn("[Shop] Unknown developer product requested: " .. tostring(productId))
		return
	end
	MarketplaceService:PromptProductPurchase(player, productId)
end)

-- Applies gamepass ownership effects immediately (e.g. after purchase or on join)
local function applyGamepassEffect(player, gamepassKey)
	local passInfo = GAMEPASSES[gamepassKey]
	if not passInfo then
		return
	end
	player:SetAttribute(passInfo.GrantsAttribute, true)
end

-- Fired when a gamepass purchase finishes (success or failure)
MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, gamepassId, wasPurchased)
	if not wasPurchased then
		return
	end
	for key, info in pairs(GAMEPASSES) do
		if info.Id == gamepassId then
			applyGamepassEffect(player, key)
			purchaseResultEvent:FireClient(player, "Gamepass", key, true)
		end
	end
end)

-- On join, check ownership of every configured gamepass and apply effects
Players.PlayerAdded:Connect(function(player)
	for key, info in pairs(GAMEPASSES) do
		task.spawn(function()
			local success, owns = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, info.Id)
			end)
			if success and owns then
				applyGamepassEffect(player, key)
			end
		end)
	end
end)

-- Developer product receipt processor. MUST be idempotent and return the correct
-- enum, otherwise Roblox will retry the receipt on next join (by design).
MarketplaceService.ProcessReceipt = function(receiptInfo)
	local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	-- Guard against double-granting the same purchase if the callback fires twice
	local purchaseKey = "Receipt_" .. receiptInfo.PurchaseId
	local alreadyGranted = false
	local success = pcall(function()
		alreadyGranted = purchaseStore:GetAsync(purchaseKey)
	end)

	if success and alreadyGranted then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	local product = DEV_PRODUCTS[receiptInfo.ProductId]
	if not product then
		warn("[Shop] Receipt for unconfigured product: " .. tostring(receiptInfo.ProductId))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local leaderstats = player:FindFirstChild("leaderstats")
	local stat = leaderstats and leaderstats:FindFirstChild(product.RewardStat)
	if not stat then
		return Enum.ProductPurchaseDecision.NotProcessedYet -- leaderstats not ready, retry later
	end

	stat.Value += product.Amount
	purchaseResultEvent:FireClient(player, "DevProduct", receiptInfo.ProductId, true)

	local saveSuccess = pcall(function()
		purchaseStore:SetAsync(purchaseKey, true)
	end)
	if not saveSuccess then
		warn("[Shop] Failed to record receipt " .. purchaseKey .. " — may retry on next attempt.")
	end

	return Enum.ProductPurchaseDecision.PurchaseGranted
end

print("[Shop] Monetization shop initialized.")
