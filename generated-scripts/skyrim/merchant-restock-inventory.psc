; ScripForge — Merchant Restock & Inventory
; Pack: Skyrim Pack | Category: Economy
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Timed merchant gold and inventory restocking with specialty item pools.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName MerchantRestockInventory extends ReferenceAlias

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Int Property BaseGoldAmount = 500 Auto
Float Property RestockIntervalHours = 48.0 Auto
; Matches vanilla's default 2-day merchant respawn cadence

LeveledItem Property SpecialtyStockPool Auto
; A leveled list representing the merchant's specialty wares (e.g. enchanted gear)

Int Property SpecialtyItemCount = 3 Auto

Formlist Property RestockContainerLinks Auto
; Optional: containers this merchant's shop uses, if stock is drawn from an external chest

Float Property LastRestockGameHour = 0.0 Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    Actor thisMerchant = GetActorReference()
    If thisMerchant != None
        thisMerchant.SetActorValue("Gold", BaseGoldAmount as Float)
        LastRestockGameHour = Utility.GetCurrentGameTime() * 24.0
        RegisterForSingleUpdateGameTime(RestockIntervalHours)
    EndIf
EndEvent

; --- Restock Cycle -----------------------------------------------------

Event OnUpdateGameTime()
    Actor thisMerchant = GetActorReference()
    If thisMerchant != None
        PerformRestock(thisMerchant)
    EndIf
    RegisterForSingleUpdateGameTime(RestockIntervalHours)
EndEvent

Function PerformRestock(Actor thisMerchant)
    RestockGold(thisMerchant)
    RestockSpecialtyItems(thisMerchant)
    LastRestockGameHour = Utility.GetCurrentGameTime() * 24.0
EndFunction

Function RestockGold(Actor thisMerchant)
    Float currentGold = thisMerchant.GetActorValue("Gold")
    If currentGold < (BaseGoldAmount as Float)
        thisMerchant.ModActorValue("Gold", (BaseGoldAmount as Float) - currentGold)
    EndIf
EndFunction

Function RestockSpecialtyItems(Actor thisMerchant)
    If SpecialtyStockPool == None
        Return
    EndIf

    Int i = 0
    While i < SpecialtyItemCount
        thisMerchant.AddItem(SpecialtyStockPool, 1, true)
        i += 1
    EndWhile
EndFunction

; --- Manual / Quest-Driven Hooks --------------------------------------------

; Allows a quest script to force an immediate restock, e.g. after a favor is completed
Function ForceImmediateRestock()
    Actor thisMerchant = GetActorReference()
    If thisMerchant != None
        PerformRestock(thisMerchant)
        Debug.Notification(thisMerchant.GetLeveledActorBase().GetName() + " has restocked their wares.")
    EndIf
EndFunction

Bool Function IsDueForRestock()
    Float currentHour = Utility.GetCurrentGameTime() * 24.0
    Return (currentHour - LastRestockGameHour) >= RestockIntervalHours
EndFunction
