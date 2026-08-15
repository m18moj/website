; ScripForge — Crime & Bounty Tracking
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Witnessed-crime detection that accrues bounty and escalates guard hostility.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName CrimeBountyTracking extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Faction Property CrimeFaction Auto
Faction Property GuardFaction Auto

GlobalVariable Property WitnessCount Auto
; How many NPCs currently have line-of-sight on the player's crime

Int Property PickpocketBounty = 5 Auto
Int Property TrespassBounty = 5 Auto
Int Property AssaultBounty = 40 Auto
Int Property MurderBounty = 1000 Auto

Bool Property IsBountyActive = false Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForModEvent("OnCrimeGoldChange", "OnCrimeGoldChange")
EndEvent

; --- Witness Detection ---------------------------------------------------

; Called from a perception/trigger script when an NPC spots the player mid-crime
Function RegisterWitness(Actor akWitness)
    If akWitness == None
        Return
    EndIf

    If WitnessCount != None
        WitnessCount.SetValue(WitnessCount.GetValue() + 1.0)
    EndIf

    If akWitness.IsInFaction(GuardFaction)
        akWitness.EvaluatePackage()
    EndIf
EndFunction

Function ClearWitnesses()
    If WitnessCount != None
        WitnessCount.SetValue(0.0)
    EndIf
EndFunction

; --- Crime Commission ----------------------------------------------------

Function CommitPickpocket(Bool wasWitnessed)
    If wasWitnessed
        ApplyBounty(PickpocketBounty)
    EndIf
EndFunction

Function CommitTrespass(Bool wasWitnessed)
    If wasWitnessed
        ApplyBounty(TrespassBounty)
    EndIf
EndFunction

Function CommitAssault(Bool wasWitnessed)
    If wasWitnessed
        ApplyBounty(AssaultBounty)
        AlertNearbyGuards()
    EndIf
EndFunction

Function CommitMurder(Bool wasWitnessed)
    If wasWitnessed
        ApplyBounty(MurderBounty)
        AlertNearbyGuards()
    EndIf
EndFunction

Function ApplyBounty(Int amount)
    If CrimeFaction == None
        Return
    EndIf
    PlayerRef.SetCrimeGold(PlayerRef.GetCrimeGold(CrimeFaction) + amount, CrimeFaction)
    IsBountyActive = true
EndFunction

; Individual guard AI packages handle the actual pursuit once alerted; this
; hook exists for quest scripts that want to raise a settlement-wide alarm.
Function AlertNearbyGuards()
    If GuardFaction != None
        Debug.Notification("Guards! Guards!")
    EndIf
EndFunction

; --- Bounty Resolution ----------------------------------------------------

Function PayBounty()
    PlayerRef.SetCrimeGold(0, CrimeFaction)
    IsBountyActive = false
    Debug.Notification("Your bounty has been paid.")
EndFunction

Function ServeJailTime()
    PlayerRef.SetCrimeGold(0, CrimeFaction)
    IsBountyActive = false
    Debug.Notification("You have served your sentence.")
EndFunction

Event OnCrimeGoldChange(String eventName, String strArg, Float numArg, Form sender)
    IsBountyActive = PlayerRef.GetCrimeGold(CrimeFaction) > 0
EndEvent

Float Function GetCurrentBounty()
    If CrimeFaction == None
        Return 0.0
    EndIf
    Return PlayerRef.GetCrimeGold(CrimeFaction)
EndFunction
