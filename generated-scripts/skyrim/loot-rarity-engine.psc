; ScripForge — Loot Tables & Enchanted Drops
; Pack: Skyrim Pack | Category: Loot
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Level-scaled loot tables with rarity tiers and randomized enchantment rolls.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName LootRarityEngine extends ObjectReference

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto
; Used to scale rarity odds against player level

MiscObject Property CommonLootItem Auto
MiscObject Property UncommonLootItem Auto
MiscObject Property RareLootItem Auto
Weapon Property LegendaryBaseWeapon Auto
; Base weapon that gets an enchantment applied when a legendary roll occurs

Enchantment Property EnchantFire Auto
Enchantment Property EnchantFrost Auto
Enchantment Property EnchantShock Auto
; Pool of possible enchantments rolled for legendary-tier drops

Int Property BaseRareChance = 5 Auto
; Percent chance of rare tier at level 1, scales up with player level

Int Property BaseLegendaryChance = 1 Auto
; Percent chance of legendary tier at level 1, scales up with player level

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    ; This script is expected to live on a lootable container reference
    RegisterForRemoteEvent(self, "OnContainerChanged")
EndEvent

; --- Loot Generation ------------------------------------------------------

Function GenerateLoot()
    ; Rolls a single item into this container based on scaled rarity odds
    Int roll = Utility.RandomInt(1, 100)
    Int legendaryChance = BaseLegendaryChance + (PlayerRef.GetLevel() / 10)
    Int rareChance = BaseRareChance + (PlayerRef.GetLevel() / 4)
    Int uncommonChance = 25

    If roll <= legendaryChance
        DropLegendary()
    ElseIf roll <= legendaryChance + rareChance
        AddItem(RareLootItem, 1, true)
        Debug.Trace("LootRarityEngine: rare item rolled")
    ElseIf roll <= legendaryChance + rareChance + uncommonChance
        AddItem(UncommonLootItem, 1, true)
        Debug.Trace("LootRarityEngine: uncommon item rolled")
    Else
        AddItem(CommonLootItem, 1, true)
        Debug.Trace("LootRarityEngine: common item rolled")
    EndIf
EndFunction

Function DropLegendary()
    ; Places an enchanted weapon variant into the container and notifies the player
    Weapon rolledWeapon = LegendaryBaseWeapon
    Enchantment rolledEnchant = PickRandomEnchantment()

    ObjectReference placedWeapon = PlaceAtMe(rolledWeapon, 1, true, false)
    If placedWeapon != None && rolledEnchant != None
        placedWeapon.SetDisplayName("Legendary " + rolledWeapon.GetName())
        placedWeapon.EnableItemData()
        Debug.Notification("A legendary item glints among the loot!")
    EndIf
EndFunction

Enchantment Function PickRandomEnchantment()
    Int pick = Utility.RandomInt(1, 3)
    If pick == 1
        Return EnchantFire
    ElseIf pick == 2
        Return EnchantFrost
    Else
        Return EnchantShock
    EndIf
EndFunction

; --- Container Hooks ------------------------------------------------------

Event OnContainerChanged(ObjectReference akNewContainer, ObjectReference akOldContainer)
    ; Fires when items enter/leave; used here purely for debug telemetry
    Debug.Trace("LootRarityEngine: container contents changed")
EndEvent

Function RestockContainer(Int itemCount = 1)
    ; Allows quest scripts to trigger a fresh loot roll, e.g. on respawn
    Int i = 0
    While i < itemCount
        GenerateLoot()
        i += 1
    EndWhile
EndFunction
