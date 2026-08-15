; ScripForge — Blacksmith Armor Set Bonus Tracker
; Pack: Skyrim Pack | Category: Crafting
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Detects equipped matching armor pieces from the same set and applies a scaling bonus effect.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName BlacksmithArmorSetBonusTracker extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Armor Property SetHelmet Auto
Armor Property SetCuirass Auto
Armor Property SetGauntlets Auto
Armor Property SetBoots Auto
; The four pieces that make up this tracked armor set

Spell Property TwoPieceBonusSpell Auto
Spell Property ThreePieceBonusSpell Auto
Spell Property FourPieceBonusSpell Auto
; Ability spells applied at each matching-piece threshold

Int Property EquippedSetPieceCount = 0 Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForModEvent("OnItemEquipped", "OnItemEquipped")
    RegisterForModEvent("OnItemUnequipped", "OnItemUnequipped")
    RefreshSetBonus()
EndEvent

; --- Equip / Unequip Hooks --------------------------------------------------

Event OnItemEquipped(String eventName, String strArg, Float numArg, Form sender)
    If IsSetPiece(sender as Armor)
        RefreshSetBonus()
    EndIf
EndEvent

Event OnItemUnequipped(String eventName, String strArg, Float numArg, Form sender)
    If IsSetPiece(sender as Armor)
        RefreshSetBonus()
    EndIf
EndEvent

Bool Function IsSetPiece(Armor akArmor)
    If akArmor == None
        Return false
    EndIf

    Return akArmor == SetHelmet || akArmor == SetCuirass || akArmor == SetGauntlets || akArmor == SetBoots
EndFunction

; --- Set Bonus Evaluation ---------------------------------------------------

Function RefreshSetBonus()
    Int count = CountEquippedSetPieces()
    EquippedSetPieceCount = count

    RemoveAllSetBonuses()

    If count >= 4 && FourPieceBonusSpell != None
        PlayerRef.AddSpell(FourPieceBonusSpell, false)
        Debug.Notification("Full set bonus active: your gear resonates with power.")
    ElseIf count >= 3 && ThreePieceBonusSpell != None
        PlayerRef.AddSpell(ThreePieceBonusSpell, false)
        Debug.Notification("Three-piece set bonus active.")
    ElseIf count >= 2 && TwoPieceBonusSpell != None
        PlayerRef.AddSpell(TwoPieceBonusSpell, false)
        Debug.Notification("Two-piece set bonus active.")
    EndIf
EndFunction

Int Function CountEquippedSetPieces()
    Int count = 0

    If SetHelmet != None && PlayerRef.IsEquipped(SetHelmet)
        count += 1
    EndIf
    If SetCuirass != None && PlayerRef.IsEquipped(SetCuirass)
        count += 1
    EndIf
    If SetGauntlets != None && PlayerRef.IsEquipped(SetGauntlets)
        count += 1
    EndIf
    If SetBoots != None && PlayerRef.IsEquipped(SetBoots)
        count += 1
    EndIf

    Return count
EndFunction

Function RemoveAllSetBonuses()
    If TwoPieceBonusSpell != None && PlayerRef.HasSpell(TwoPieceBonusSpell)
        PlayerRef.RemoveSpell(TwoPieceBonusSpell)
    EndIf
    If ThreePieceBonusSpell != None && PlayerRef.HasSpell(ThreePieceBonusSpell)
        PlayerRef.RemoveSpell(ThreePieceBonusSpell)
    EndIf
    If FourPieceBonusSpell != None && PlayerRef.HasSpell(FourPieceBonusSpell)
        PlayerRef.RemoveSpell(FourPieceBonusSpell)
    EndIf
EndFunction

Int Function GetEquippedSetPieceCount()
    Return EquippedSetPieceCount
EndFunction
