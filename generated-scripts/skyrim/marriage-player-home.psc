; ScriptForge — Marriage & Player Home
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Marriage dialogue flow plus player-home ownership with storage and resting bonus.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName MarriagePlayerHome extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto
Actor Property SpouseRef Auto

Faction Property MarriageFaction Auto
; Vanilla-style faction used to flag valid marriage candidates

Location Property PlayerHomeLocation Auto
Bool Property PlayerHomeOwned = false Auto

ObjectReference Property HomeStorageChest Auto
Spell Property WellRestedBonus Auto
; Applied to the player when they sleep in the owned home while married

Bool Property IsMarried = false Auto
GlobalVariable Property DaysMarried Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForRemoteEvent(PlayerRef, "OnSleepStop")
EndEvent

; --- Marriage Flow -----------------------------------------------------

; Called once the Amulet of Mara has been shown and accepted in dialogue
Function ProposeMarriage()
    If SpouseRef == None || !SpouseRef.IsInFaction(MarriageFaction)
        Debug.Notification("This person is not interested in marriage.")
        Return
    EndIf

    If IsMarried
        Debug.Notification("You are already married.")
        Return
    EndIf
EndFunction

; Called from the wedding ceremony quest stage
Function FinalizeMarriage()
    IsMarried = true
    SpouseRef.SetPlayerTeammate(true)
    If DaysMarried != None
        DaysMarried.SetValue(0.0)
    EndIf
    Debug.Notification("You are now married to " + SpouseRef.GetLeveledActorBase().GetName() + ".")
EndFunction

; --- Player Home Ownership --------------------------------------------------

Function PurchaseHome()
    If PlayerHomeOwned
        Return
    EndIf
    PlayerHomeOwned = true
    Debug.Notification("You now own this home.")
EndFunction

; Grants access to the shared storage chest; called from an activator script on the chest
Function AccessHomeStorage()
    If PlayerHomeOwned && HomeStorageChest != None
        HomeStorageChest.Activate(PlayerRef, false)
    Else
        Debug.Notification("You do not own this property.")
    EndIf
EndFunction

; --- Resting Bonus -----------------------------------------------------

Event OnSleepStop(Bool abInterrupted)
    If abInterrupted
        Return
    EndIf

    If IsMarried && PlayerHomeOwned && PlayerRef.GetParentCell() != None
        If PlayerRef.GetParentCell().IsAttached() && IsInOwnedHome()
            If WellRestedBonus != None
                PlayerRef.AddSpell(WellRestedBonus, false)
                Debug.Notification("You feel especially rested, having a home to call your own.")
            EndIf
        EndIf
    EndIf

    If IsMarried && DaysMarried != None
        DaysMarried.SetValue(DaysMarried.GetValue() + 1.0)
    EndIf
EndEvent

Bool Function IsInOwnedHome()
    If PlayerHomeLocation == None
        Return false
    EndIf
    Return PlayerRef.IsInLocation(PlayerHomeLocation)
EndFunction
