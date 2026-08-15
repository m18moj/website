; ScripForge — Horse & Stable Management
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Mount ownership, stable storage, and a whistle-summon system with pathfinding to the player.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName HorseMountStableManagement extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Actor Property OwnedHorseRef Auto
; The horse reference currently registered to the player

ObjectReference Property HomeStableMarker Auto
; XMarker at the player's home stable where the horse idles by default

Spell Property WhistleSummonSpell Auto
; Lesser power that fires the whistle event

FormList Property StableStorageContainerList Auto
; Optional per-stable storage container list, indexed by stable id

Float Property SummonPathTimeoutSeconds = 30.0 Auto
Float Property MaxSummonDistance = 4096.0 Auto

Bool Property HorseIsSummoning = false Auto
Bool Property HorseIsStabled = true Auto

Int Property OwnedStableCount = 0 Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForModEvent("OnWhistleSummon", "OnWhistleSummon")
EndEvent

; --- Ownership ------------------------------------------------------------

Function RegisterHorseOwnership(Actor akHorse)
    If akHorse == None
        Return
    EndIf

    OwnedHorseRef = akHorse
    OwnedHorseRef.SetActorOwner(PlayerRef.GetActorBase())
    Debug.Notification("This horse now recognizes you as its owner.")
EndFunction

Function ReleaseHorseOwnership()
    If OwnedHorseRef == None
        Return
    EndIf

    OwnedHorseRef.SetActorOwner(None)
    OwnedHorseRef = None
    HorseIsStabled = false
    Debug.Notification("The horse has been released from your ownership.")
EndFunction

Bool Function HasOwnedHorse()
    Return OwnedHorseRef != None && !OwnedHorseRef.IsDead()
EndFunction

; --- Stable Registration ----------------------------------------------------

Function RegisterStable(ObjectReference akStableMarker)
    If akStableMarker == None
        Return
    EndIf

    HomeStableMarker = akStableMarker
    OwnedStableCount += 1
    Debug.Notification("A new stable has been added to your property.")
EndFunction

Function StableHorse()
    If !HasOwnedHorse() || HomeStableMarker == None
        Return
    EndIf

    OwnedHorseRef.MoveTo(HomeStableMarker)
    OwnedHorseRef.EvaluatePackage()
    HorseIsStabled = true
    HorseIsSummoning = false
    Debug.Notification("Your horse has returned to its stable.")
EndFunction

; --- Whistle Summon ---------------------------------------------------------

Event OnWhistleSummon(String eventName, String strArg, Float numArg, Form sender)
    WhistleForHorse()
EndEvent

Function WhistleForHorse()
    If !HasOwnedHorse()
        Debug.Notification("You have no horse to call.")
        Return
    EndIf

    If HorseIsSummoning
        Return
    EndIf

    Float distance = OwnedHorseRef.GetDistance(PlayerRef)
    If distance > MaxSummonDistance
        Debug.Notification("Your horse is too far away to hear the whistle.")
        Return
    EndIf

    HorseIsSummoning = true
    HorseIsStabled = false
    OwnedHorseRef.SetRestrained(false)
    OwnedHorseRef.MoveToNode(PlayerRef, "NPC Root [Root]")
    Debug.Notification("Your horse comes galloping toward you.")
    RegisterForSingleUpdate(SummonPathTimeoutSeconds)
EndFunction

Event OnUpdate()
    If !HorseIsSummoning
        Return
    EndIf

    If HasOwnedHorse() && OwnedHorseRef.GetDistance(PlayerRef) <= 256.0
        FinishSummon()
        Return
    EndIf

    ; Timed out — stop trying to force a path, let normal AI take over
    HorseIsSummoning = false
EndEvent

Function FinishSummon()
    HorseIsSummoning = false
    Debug.Notification("Your horse has arrived.")
EndFunction

; --- Storage ----------------------------------------------------------------

ObjectReference Function GetStableStorageContainer(Int stableIndex)
    If StableStorageContainerList == None
        Return None
    EndIf

    Return StableStorageContainerList.GetAt(stableIndex) as ObjectReference
EndFunction

Bool Function IsHorseStabled()
    Return HorseIsStabled
EndFunction
