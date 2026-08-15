; ScripForge — Faction Standing & Bounty System
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Per-faction reputation tracking with bounty accrual and guard hostility.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName FactionReputationLogic extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Faction Property TownFaction Auto
; Faction representing the local populace/guards for this hold

Faction Property CrimeFaction Auto
; The vanilla-style crime faction used to drive guard hostility and bounty

GlobalVariable Property CurrentBountyAmount Auto
; Mirrors PlayerRef.GetCrimeGold(CrimeFaction) for easy dialogue conditioning

Int Property ReputationValue = 0 Auto
; -100 (hated) to 100 (revered); separate from raw crime gold

Int Property MinorCrimeBounty = 10 Auto
Int Property MajorCrimeBounty = 100 Auto
Int Property MurderBounty = 1000 Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForModEvent("OnCrimeGoldChange", "OnCrimeGoldChange")
    SyncBountyGlobal()
EndEvent

Function SyncBountyGlobal()
    If CrimeFaction != None && CurrentBountyAmount != None
        CurrentBountyAmount.SetValue(PlayerRef.GetCrimeGold(CrimeFaction) as Float)
    EndIf
EndFunction

; --- Reputation Adjustments -----------------------------------------------

Function AdjustReputation(Int amount)
    ReputationValue += amount
    If ReputationValue > 100
        ReputationValue = 100
    ElseIf ReputationValue < -100
        ReputationValue = -100
    EndIf

    If ReputationValue <= -50
        TownFaction.SetPlayerEnemy(true)
        Debug.Notification("The townsfolk now view you with hostility.")
    ElseIf ReputationValue >= -49
        TownFaction.SetPlayerEnemy(false)
    EndIf
EndFunction

; --- Crime / Bounty Handling -----------------------------------------------

Function CommitMinorCrime()
    PlayerRef.SetCrimeGold(PlayerRef.GetCrimeGold(CrimeFaction) + MinorCrimeBounty, CrimeFaction)
    AdjustReputation(-2)
    SyncBountyGlobal()
EndFunction

Function CommitMajorCrime()
    PlayerRef.SetCrimeGold(PlayerRef.GetCrimeGold(CrimeFaction) + MajorCrimeBounty, CrimeFaction)
    AdjustReputation(-10)
    SyncBountyGlobal()
    Debug.Notification("Guards have been alerted to your crime.")
EndFunction

Function CommitMurder()
    PlayerRef.SetCrimeGold(PlayerRef.GetCrimeGold(CrimeFaction) + MurderBounty, CrimeFaction)
    AdjustReputation(-25)
    SyncBountyGlobal()
    Debug.Notification("Murder! The guards will not forget this.")
EndFunction

Function PayOffBounty()
    ; Called from a jail/guard dialogue fragment once payment is confirmed
    PlayerRef.SetCrimeGold(0, CrimeFaction)
    SyncBountyGlobal()
    Debug.Notification("Your bounty has been cleared.")
EndFunction

Function ServeSentence()
    ; Called after jail time completes, clears bounty but leaves reputation damaged
    PlayerRef.SetCrimeGold(0, CrimeFaction)
    SyncBountyGlobal()
    AdjustReputation(-5)
EndFunction

Event OnCrimeGoldChange(String eventName, String strArg, Float numArg, Form sender)
    SyncBountyGlobal()
EndEvent

Bool Function IsWanted()
    Return CurrentBountyAmount.GetValue() > 0.0
EndFunction
