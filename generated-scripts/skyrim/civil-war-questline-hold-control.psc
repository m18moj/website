; ScripForge — Civil War Questline: Hold Control
; Pack: Skyrim Pack | Category: Quests
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; A Stormcloak/Imperial hold-capture questline branch that tracks a hold-by-hold ownership map state.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName CivilWarQuestlineHoldControl extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

String[] Property HoldNames Auto
; e.g. Whiterun, Windhelm, Riften, Markarth, Solitude, Falkreath, Winterhold, Morthal, Dawnstar

Int[] Property HoldController Auto
; Index-aligned with HoldNames — 0 = neutral, 1 = Stormcloak, 2 = Imperial

Faction Property StormcloakFaction Auto
Faction Property ImperialFaction Auto

GlobalVariable Property PlayerAllegiance Auto
; 0 = undecided, 1 = Stormcloak, 2 = Imperial — set once the player joins a side

GlobalVariable Property HoldsControlledByPlayerSide Auto

Quest Property NextHoldBattleQuest Auto
Quest Property WarResolutionQuest Auto

Bool Property WarHasEnded = false Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    HoldsControlledByPlayerSide.SetValue(0.0)
EndEvent

; --- Allegiance --------------------------------------------------------

Function JoinStormcloaks()
    PlayerRef.AddToFaction(StormcloakFaction)
    PlayerAllegiance.SetValue(1.0)
    Debug.Notification("You have sworn yourself to the Stormcloak cause.")
EndFunction

Function JoinImperials()
    PlayerRef.AddToFaction(ImperialFaction)
    PlayerAllegiance.SetValue(2.0)
    Debug.Notification("You have taken the Imperial oath.")
EndFunction

; --- Hold Capture --------------------------------------------------------

; Called from the resolution stage of a hold-battle quest once the siege concludes
Function CaptureHold(String holdName, Int newController)
    Int idx = FindHoldIndex(holdName)
    If idx < 0
        Return
    EndIf

    If HoldController[idx] == newController
        Return
    EndIf

    HoldController[idx] = newController
    RefreshControlledCount()

    Debug.Notification(holdName + " has fallen under " + ControllerName(newController) + " control.")

    If AllHoldsControlledBySide((PlayerAllegiance.GetValue()) as Int)
        ResolveWar((PlayerAllegiance.GetValue()) as Int)
    ElseIf NextHoldBattleQuest != None
        NextHoldBattleQuest.SetStage(10)
    EndIf
EndFunction

Function RefreshControlledCount()
    Int playerSide = (PlayerAllegiance.GetValue()) as Int
    Int count = 0
    Int i = 0
    While i < HoldController.Length
        If HoldController[i] == playerSide
            count += 1
        EndIf
        i += 1
    EndWhile
    HoldsControlledByPlayerSide.SetValue(count as Float)
EndFunction

; --- Queries -----------------------------------------------------------

Int Function FindHoldIndex(String holdName)
    Int i = 0
    While i < HoldNames.Length
        If HoldNames[i] == holdName
            Return i
        EndIf
        i += 1
    EndWhile
    Return -1
EndFunction

Int Function GetHoldController(String holdName)
    Int idx = FindHoldIndex(holdName)
    If idx < 0
        Return 0
    EndIf
    Return HoldController[idx]
EndFunction

Bool Function AllHoldsControlledBySide(Int sideId)
    If sideId == 0
        Return false
    EndIf

    Int i = 0
    While i < HoldController.Length
        If HoldController[i] != sideId
            Return false
        EndIf
        i += 1
    EndWhile
    Return true
EndFunction

String Function ControllerName(Int controllerId)
    If controllerId == 1
        Return "Stormcloak"
    ElseIf controllerId == 2
        Return "Imperial"
    EndIf
    Return "neutral"
EndFunction

; --- War Resolution ---------------------------------------------------------

Function ResolveWar(Int winningSide)
    If WarHasEnded
        Return
    EndIf

    WarHasEnded = true
    If WarResolutionQuest != None
        WarResolutionQuest.SetStage(200)
    EndIf

    Debug.Notification("The war for Skyrim has been decided: " + ControllerName(winningSide) + " victory.")
EndFunction
