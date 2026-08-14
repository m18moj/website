; ScriptForge — Equipment Slots & Weight System
; Pack: Skyrim Pack | Category: Inventory
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Armor/weapon equip slots with carry-weight limits and encumbrance penalties.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName InventoryEquipment extends Actor

; --- Properties -------------------------------------------------------

Float Property BaseCarryWeight = 300.0 Auto
; Default carry capacity before any bonuses/penalties

Float Property EncumberedThresholdPercent = 100.0 Auto
; Percent of max weight at which the encumbrance penalty kicks in

Perk Property EncumberedPenaltyPerk Auto
; Perk applied while over capacity, e.g. slows movement speed

Armor Property HeadSlot Auto
Armor Property BodySlot Auto
Armor Property HandsSlot Auto
Armor Property FeetSlot Auto
; Tracked equip slots for quick-swap helper functions

Weapon Property MainHandWeapon Auto
Weapon Property OffHandWeapon Auto

Bool Property bIsEncumbered = false Auto Hidden

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    SetActorValue("CarryWeight", BaseCarryWeight)
    RegisterForSingleUpdate(3.0)
EndEvent

Event OnUpdate()
    CheckEncumbrance()
    RegisterForSingleUpdate(3.0)
EndEvent

; --- Equip Helpers --------------------------------------------------------

Function EquipFullSet()
    ; Equips all four tracked armor slots in one call
    If HeadSlot != None
        EquipItem(HeadSlot, false, true)
    EndIf
    If BodySlot != None
        EquipItem(BodySlot, false, true)
    EndIf
    If HandsSlot != None
        EquipItem(HandsSlot, false, true)
    EndIf
    If FeetSlot != None
        EquipItem(FeetSlot, false, true)
    EndIf
    Debug.Trace("InventoryEquipment: full armor set equipped")
EndFunction

Function UnequipFullSet()
    If HeadSlot != None
        UnequipItem(HeadSlot, false, true)
    EndIf
    If BodySlot != None
        UnequipItem(BodySlot, false, true)
    EndIf
    If HandsSlot != None
        UnequipItem(HandsSlot, false, true)
    EndIf
    If FeetSlot != None
        UnequipItem(FeetSlot, false, true)
    EndIf
EndFunction

Function SwapWeapons(Weapon newMainHand, Weapon newOffHand)
    ; Swaps whatever is currently wielded for the given pair
    If MainHandWeapon != None
        UnequipItem(MainHandWeapon, false, true)
    EndIf
    If OffHandWeapon != None
        UnequipItem(OffHandWeapon, false, true)
    EndIf

    MainHandWeapon = newMainHand
    OffHandWeapon = newOffHand

    EquipItem(MainHandWeapon, false, true)
    If OffHandWeapon != None
        EquipItem(OffHandWeapon, false, true)
    EndIf
EndFunction

; --- Encumbrance -----------------------------------------------------------

Function CheckEncumbrance()
    Float currentWeight = GetActorValue("InventoryWeight")
    Float maxWeight = GetActorValue("CarryWeight")
    Float percentFull = (currentWeight / maxWeight) * 100.0

    If percentFull >= EncumberedThresholdPercent && bIsEncumbered == false
        bIsEncumbered = true
        If EncumberedPenaltyPerk != None
            AddPerk(EncumberedPenaltyPerk)
        EndIf
        Debug.Notification("You are overencumbered.")
    ElseIf percentFull < EncumberedThresholdPercent && bIsEncumbered == true
        bIsEncumbered = false
        If EncumberedPenaltyPerk != None
            RemovePerk(EncumberedPenaltyPerk)
        EndIf
        Debug.Notification("You can move freely again.")
    EndIf
EndFunction

Float Function GetRemainingCapacity()
    Return GetActorValue("CarryWeight") - GetActorValue("InventoryWeight")
EndFunction
