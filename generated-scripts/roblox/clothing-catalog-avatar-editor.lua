--[[
    ScripForge — Clothing Catalog & Avatar Editor
    Pack: Roblox Pack | Category: Systems
    Version: 1.0.0

    Changelog:
      1.0.0 - Initial release

    In-game avatar customization menu that reads the Marketplace catalog API for live equip previews.
]]

-- ============================================================
-- ClothingCatalogAvatarEditor (LocalScript, place in StarterPlayerScripts)
-- Server-side receipt: place CatalogPurchaseGate.server.lua in ServerScriptService
-- ============================================================
-- Fetches shirt/pants/accessory listings for a given creator/category via
-- MarketplaceService, renders a scrollable preview grid, and lets the player
-- try items on their character (client-only preview) before equipping for
-- real through a validated RemoteEvent.

local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local InsertService = game:GetService("InsertService")

local player = Players.LocalPlayer

local remotesFolder = ReplicatedStorage:FindFirstChild("AvatarEditorRemotes") or Instance.new("Folder")
remotesFolder.Name = "AvatarEditorRemotes"
remotesFolder.Parent = ReplicatedStorage

local equipItemEvent = remotesFolder:FindFirstChild("EquipItem") or Instance.new("RemoteEvent")
equipItemEvent.Name = "EquipItem"
equipItemEvent.Parent = remotesFolder

-- Category -> AssetType id used when filtering catalog pages
local CATEGORY_ASSET_TYPES = {
	Shirts = 11,
	Pants = 12,
	Hats = 8,
	Accessories = 8,
	TShirts = 2,
}

local PAGE_SIZE = 30
local previewCache = {} -- assetId -> ProductInfo, avoids re-hitting the API per hover

-- Pulls one page of catalog items for a category. In production you'd typically
-- source ids from your own curated table or the AvatarEditorService APIs;
-- GetProductInfo below is what actually reads the Marketplace catalog data.
local function fetchProductInfo(assetId)
	if previewCache[assetId] then
		return previewCache[assetId]
	end

	local ok, info = pcall(function()
		return MarketplaceService:GetProductInfo(assetId, Enum.InfoType.Asset)
	end)

	if ok and info then
		previewCache[assetId] = info
		return info
	end

	warn(("[AvatarEditor] Failed to fetch product info for asset %d"):format(assetId))
	return nil
end

-- Builds a lightweight preview card describing name/price/creator for the UI grid
local function buildCardData(assetId)
	local info = fetchProductInfo(assetId)
	if not info then
		return nil
	end

	return {
		AssetId = assetId,
		Name = info.Name,
		Price = info.PriceInRobux or 0,
		Creator = info.Creator and info.Creator.Name or "Unknown",
		IsForSale = info.IsForSale == true,
	}
end

-- Client-only "try on" preview: inserts the asset mesh onto the character without
-- persisting anything server-side, so the player can browse freely at no cost.
local function previewOnCharacter(assetId)
	local character = player.Character
	if not character then
		return
	end

	local ok, model = pcall(function()
		return InsertService:LoadAsset(assetId)
	end)
	if not ok or not model then
		warn("[AvatarEditor] Could not load preview asset " .. assetId)
		return
	end

	for _, child in ipairs(model:GetChildren()) do
		if child:IsA("Shirt") or child:IsA("Pants") or child:IsA("Accessory") then
			-- Remove any existing item of the same class before previewing the new one
			local existingClass = child.ClassName
			for _, existing in ipairs(character:GetChildren()) do
				if existing.ClassName == existingClass and existing.Name:match("^Preview_") then
					existing:Destroy()
				end
			end
			child.Name = "Preview_" .. child.Name
			child.Parent = character
		end
	end
	model:Destroy()
end

-- Confirms the currently-previewed item as a real equip. The server independently
-- re-validates ownership/price before applying anything permanent.
local function confirmEquip(assetId, category)
	equipItemEvent:FireServer(assetId, category)
end

-- Public API consumed by the menu's GUI controller script
local AvatarEditor = {}

function AvatarEditor.LoadCategoryPage(category, assetIds)
	local cards = {}
	for _, assetId in ipairs(assetIds) do
		local card = buildCardData(assetId)
		if card and card.IsForSale then
			table.insert(cards, card)
		end
	end
	return cards
end

function AvatarEditor.Preview(assetId)
	previewOnCharacter(assetId)
end

function AvatarEditor.Equip(assetId, category)
	if not CATEGORY_ASSET_TYPES[category] then
		warn("[AvatarEditor] Unknown category: " .. tostring(category))
		return
	end
	confirmEquip(assetId, category)
end

function AvatarEditor.ClearPreview()
	local character = player.Character
	if not character then
		return
	end
	for _, child in ipairs(character:GetChildren()) do
		if child.Name:match("^Preview_") then
			child:Destroy()
		end
	end
end

print("[AvatarEditor] Clothing catalog & avatar editor client module ready.")

return AvatarEditor
