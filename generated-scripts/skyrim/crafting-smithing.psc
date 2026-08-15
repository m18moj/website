; ScripForge — Smithing & Alchemy Crafting
; Pack: Skyrim Pack | Category: Crafting
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Material-based smithing upgrades and potion-brewing alchemy with ingredient discovery.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName CraftingSmithing extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

MiscObject Property IronIngot Auto
MiscObject Property SteelIngot Auto
MiscObject Property LeatherStrips Auto
; Common smithing materials required for upgrades

Potion Property HealthPotionMinor Auto
Potion Property HealthPotionMajor Auto
; Brewed outputs at different alchemy skill tiers

Ingredient Property DiscoverableIngredient Auto
; Ingredient whose effects are revealed the first time it's examined

FormList Property KnownIngredientEffects Auto Hidden
; Not natively supported without a custom array; tracked instead via bool below

Bool Property bIngredientDiscovered = false Auto Hidden

Int Property UpgradeIronCost = 2 Auto
Int Property UpgradeSteelCost = 3 Auto

; --- Smithing ---------------------------------------------------------

Bool Function UpgradeWeaponWithIron(Weapon targetWeapon)
    If PlayerRef.GetItemCount(IronIngot) >= UpgradeIronCost
        PlayerRef.RemoveItem(IronIngot, UpgradeIronCost)
        Debug.Notification(targetWeapon.GetName() + " improved with iron ingots.")
        Return true
    EndIf
    Debug.Notification("Not enough iron ingots.")
    Return false
EndFunction

Bool Function UpgradeArmorWithSteel(Armor targetArmor)
    If PlayerRef.GetItemCount(SteelIngot) >= UpgradeSteelCost && PlayerRef.GetItemCount(LeatherStrips) >= 1
        PlayerRef.RemoveItem(SteelIngot, UpgradeSteelCost)
        PlayerRef.RemoveItem(LeatherStrips, 1)
        Debug.Notification(targetArmor.GetName() + " reinforced with steel and leather.")
        Return true
    EndIf
    Debug.Notification("Missing materials: steel ingots or leather strips.")
    Return false
EndFunction

; --- Alchemy ------------------------------------------------------------

Function BrewHealthPotion()
    ; Brew quality scales with the player's Alchemy skill
    Float alchemySkill = PlayerRef.GetActorValue("Alchemy")

    If alchemySkill >= 50.0
        PlayerRef.AddItem(HealthPotionMajor, 1, true)
        Debug.Notification("Brewed a potent healing potion.")
    Else
        PlayerRef.AddItem(HealthPotionMinor, 1, true)
        Debug.Notification("Brewed a minor healing potion.")
    EndIf

    PlayerRef.ModActorValue("Alchemy", 0.5)
EndFunction

; --- Ingredient Discovery -------------------------------------------------

Function ExamineIngredient(Ingredient examinedItem)
    ; Reveals all effects of an ingredient the first time it's picked apart
    If examinedItem == DiscoverableIngredient && bIngredientDiscovered == false
        bIngredientDiscovered = true
        RevealIngredientEffects(examinedItem)
    EndIf
EndFunction

Function RevealIngredientEffects(Ingredient targetIngredient)
    Int effectCount = targetIngredient.GetNumEffects()
    Int i = 0
    While i < effectCount
        MagicEffect thisEffect = targetIngredient.GetNthEffectMagicEffect(i)
        If thisEffect != None
            Debug.Notification("Discovered effect: " + thisEffect.GetName())
        EndIf
        i += 1
    EndWhile
    PlayerRef.ModActorValue("Alchemy", 1.0)
EndFunction

Bool Function IsIngredientDiscovered()
    Return bIngredientDiscovered
EndFunction
