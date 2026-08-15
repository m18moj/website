; ScripForge — Shrine Blessing & Standing Stone Tracker
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Tracks visited shrines and the currently active standing-stone blessing, reapplying it safely on load.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName ShrineBlessingStandingStoneTracker extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Spell[] Property StandingStoneBlessings Auto
; Index-aligned with StandingStoneNames — one power/blessing per standing stone

String[] Property StandingStoneNames Auto

Int Property ActiveStoneIndex = -1 Auto
; -1 means no standing stone blessing is currently active

GlobalVariable Property ShrinesVisitedCount Auto

Faction[] Property DivineShrineFactions Auto
; One faction per Nine Divines shrine, used to flag "blessed by" state for dialogue conditions

Bool[] Property ShrineVisited Auto
; Index-aligned with DivineShrineFactions

Sound Property ShrineBlessingSound Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForRemoteEvent(PlayerRef, "OnPlayerLoadGame")
EndEvent

Event OnPlayerLoadGame()
    ; Standing stone blessings can silently duplicate if the save reloads
    ; while a stone effect is still on the player, so we strip every known
    ; blessing and cleanly reapply just the active one.
    ReapplyActiveBlessing()
EndEvent

; --- Standing Stones ------------------------------------------------------

; Called from the standing stone's OnActivate once the player accepts the blessing
Function ActivateStandingStone(Int stoneIndex)
    If stoneIndex < 0 || stoneIndex >= StandingStoneBlessings.Length
        Return
    EndIf

    StripAllStoneBlessings()

    Spell newBlessing = StandingStoneBlessings[stoneIndex]
    If newBlessing != None
        PlayerRef.AddSpell(newBlessing, false)
    EndIf

    ActiveStoneIndex = stoneIndex
    Debug.Notification("Standing Stone blessing: " + StandingStoneNames[stoneIndex])
EndFunction

Function StripAllStoneBlessings()
    Int i = 0
    While i < StandingStoneBlessings.Length
        Spell blessing = StandingStoneBlessings[i]
        If blessing != None && PlayerRef.HasSpell(blessing)
            PlayerRef.RemoveSpell(blessing)
        EndIf
        i += 1
    EndWhile
EndFunction

Function ReapplyActiveBlessing()
    If ActiveStoneIndex < 0 || ActiveStoneIndex >= StandingStoneBlessings.Length
        Return
    EndIf

    Spell currentBlessing = StandingStoneBlessings[ActiveStoneIndex]
    If currentBlessing != None && !PlayerRef.HasSpell(currentBlessing)
        PlayerRef.AddSpell(currentBlessing, false)
    EndIf
EndFunction

String Function GetActiveStoneName()
    If ActiveStoneIndex < 0
        Return "None"
    EndIf
    Return StandingStoneNames[ActiveStoneIndex]
EndFunction

; --- Shrine Visits --------------------------------------------------------

; Called from a shrine's OnActivate once the blessing effect is applied
Function VisitShrine(Int shrineIndex)
    If shrineIndex < 0 || shrineIndex >= DivineShrineFactions.Length
        Return
    EndIf

    If !ShrineVisited[shrineIndex]
        ShrineVisited[shrineIndex] = true
        If ShrinesVisitedCount != None
            ShrinesVisitedCount.SetValue(ShrinesVisitedCount.GetValue() + 1.0)
        EndIf
    EndIf

    Faction shrineFaction = DivineShrineFactions[shrineIndex]
    If shrineFaction != None
        PlayerRef.SetFactionRank(shrineFaction, 0)
    EndIf

    If ShrineBlessingSound != None
        ShrineBlessingSound.Play(PlayerRef)
    EndIf
EndFunction

Bool Function HasVisitedAllShrines()
    Int i = 0
    While i < ShrineVisited.Length
        If !ShrineVisited[i]
            Return false
        EndIf
        i += 1
    EndWhile
    Return true
EndFunction
