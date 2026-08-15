; ScripForge — Companion Housecarl Assignment
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Assigns a housecarl to each owned hold, with home-guard behavior and a steward-report dialogue hook.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName CompanionHousecarlAssignment extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

String[] Property HoldNames Auto
; e.g. Whiterun, Falkreath, Riften — index-aligned with HousecarlActors

Actor[] Property HousecarlActors Auto

Bool[] Property HoldOwned Auto
; Index-aligned with HoldNames — true once the player owns the associated homestead

Faction Property PlayerAllyFaction Auto

Package Property HomeGuardPackage Auto
; Sandbox/guard package applied once a housecarl is bound to a purchased home

GlobalVariable Property HoldsOwnedCount Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    Debug.Trace("CompanionHousecarlAssignment: tracking " + HoldNames.Length + " holds")
EndEvent

; --- Home Ownership --------------------------------------------------------

; Called once the player completes a homestead's purchase quest
Function GrantHold(Int holdIndex)
    If holdIndex < 0 || holdIndex >= HoldNames.Length
        Return
    EndIf

    If !HoldOwned[holdIndex]
        HoldOwned[holdIndex] = true
        If HoldsOwnedCount != None
            HoldsOwnedCount.SetValue(HoldsOwnedCount.GetValue() + 1.0)
        EndIf
    EndIf

    BindHousecarl(holdIndex)
EndFunction

; --- Housecarl Binding -------------------------------------------------------

Function BindHousecarl(Int holdIndex)
    Actor housecarl = HousecarlActors[holdIndex]
    If housecarl == None
        Return
    EndIf

    housecarl.AddToFaction(PlayerAllyFaction)
    ActivateHomeGuard(holdIndex)

    Debug.Notification(housecarl.GetDisplayName() + " has sworn to protect " + HoldNames[holdIndex] + ".")
EndFunction

Function ActivateHomeGuard(Int holdIndex)
    Actor housecarl = HousecarlActors[holdIndex]
    If housecarl == None || HomeGuardPackage == None
        Return
    EndIf

    housecarl.AddToFaction(PlayerAllyFaction)
    housecarl.EvaluatePackage()
EndFunction

; --- Lookups -----------------------------------------------------------

Actor Function GetHousecarlForHold(String holdName)
    Int i = 0
    While i < HoldNames.Length
        If HoldNames[i] == holdName
            Return HousecarlActors[i]
        EndIf
        i += 1
    EndWhile
    Return None
EndFunction

Bool Function IsHoldOwned(String holdName)
    Int i = 0
    While i < HoldNames.Length
        If HoldNames[i] == holdName
            Return HoldOwned[i]
        EndIf
        i += 1
    EndWhile
    Return false
EndFunction

; --- Steward Dialogue Hook ---------------------------------------------------

; Called from a steward NPC's "Report on the hold" dialogue result fragment
Function ReportHoldStatus(Actor akSteward)
    Int owned = 0
    Int i = 0
    While i < HoldOwned.Length
        If HoldOwned[i]
            owned += 1
        EndIf
        i += 1
    EndWhile

    If owned == 0
        Debug.Notification(akSteward.GetDisplayName() + ": You hold no lands yet, my Thane.")
    Else
        Debug.Notification(akSteward.GetDisplayName() + ": You watch over " + owned + " hold(s), well-guarded by loyal housecarls.")
    EndIf
EndFunction
