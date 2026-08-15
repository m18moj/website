; ScripForge — Necromancy Reanimation & Thrall System
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Corpse reanimation with a thrall duration timer, command AI, and a max-active-minion cap.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName NecromancyReanimationThrallSystem extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Spell Property ReanimateSpell Auto
Faction Property PlayerThrallFaction Auto

Int Property MaxActiveThralls = 3 Auto
Float Property DefaultThrallDurationSeconds = 600.0 Auto
; 0 or less means permanent, matching a "black soul" style permanent reanimation

Actor[] Property ActiveThralls Auto
Float[] Property ThrallExpireTimes Auto
; Parallel arrays; index i in ThrallExpireTimes corresponds to ActiveThralls[i]

Int Property ActiveThrallCount = 0 Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForSingleUpdate(30.0)
EndEvent

; --- Reanimation --------------------------------------------------------

Function ReanimateCorpse(Actor akCorpse)
    If akCorpse == None || !akCorpse.IsDead()
        Debug.Notification("This body cannot be reanimated.")
        Return
    EndIf

    If ActiveThrallCount >= MaxActiveThralls
        Debug.Notification("You cannot command any more thralls. Release one first.")
        Return
    EndIf

    akCorpse.Resurrect(false, false)
    akCorpse.AddToFaction(PlayerThrallFaction)
    akCorpse.SetActorOwner(PlayerRef.GetActorBase())

    RegisterThrall(akCorpse)
    Debug.Notification("The corpse rises to serve you.")
EndFunction

Function RegisterThrall(Actor akThrall)
    Int freeSlot = FindFreeSlot()
    If freeSlot < 0
        Return
    EndIf

    ActiveThralls[freeSlot] = akThrall
    If DefaultThrallDurationSeconds > 0.0
        ThrallExpireTimes[freeSlot] = Utility.GetCurrentRealTime() + DefaultThrallDurationSeconds
    Else
        ThrallExpireTimes[freeSlot] = -1.0
    EndIf

    ActiveThrallCount += 1
EndFunction

Int Function FindFreeSlot()
    Int i = 0
    While i < ActiveThralls.Length
        If ActiveThralls[i] == None
            Return i
        EndIf
        i += 1
    EndWhile
    Return -1
EndFunction

; --- Command AI ---------------------------------------------------------

Function CommandThrallToAttack(Actor akThrall, Actor akTarget)
    If !IsActiveThrall(akThrall) || akTarget == None
        Return
    EndIf

    akThrall.SetActorValue("Aggression", 2)
    akThrall.CombatUtility_StartCombat(akTarget)
EndFunction

Function CommandThrallToFollow(Actor akThrall)
    If !IsActiveThrall(akThrall)
        Return
    EndIf

    akThrall.SetActorValue("Aggression", 0)
    akThrall.EvaluatePackage()
EndFunction

Bool Function IsActiveThrall(Actor akThrall)
    Int i = 0
    While i < ActiveThralls.Length
        If ActiveThralls[i] == akThrall
            Return true
        EndIf
        i += 1
    EndWhile
    Return false
EndFunction

; --- Duration / Expiration ---------------------------------------------------

Event OnUpdate()
    Float now = Utility.GetCurrentRealTime()
    Int i = 0
    While i < ActiveThralls.Length
        If ActiveThralls[i] != None && ThrallExpireTimes[i] > 0.0 && now >= ThrallExpireTimes[i]
            ReleaseThrallAtIndex(i)
        EndIf
        i += 1
    EndWhile

    RegisterForSingleUpdate(30.0)
EndEvent

Function ReleaseThrall(Actor akThrall)
    Int i = 0
    While i < ActiveThralls.Length
        If ActiveThralls[i] == akThrall
            ReleaseThrallAtIndex(i)
            Return
        EndIf
        i += 1
    EndWhile
EndFunction

Function ReleaseThrallAtIndex(Int index)
    Actor thrall = ActiveThralls[index]
    If thrall != None
        thrall.RemoveFromFaction(PlayerThrallFaction)
        thrall.Kill()
    EndIf

    ActiveThralls[index] = None
    ThrallExpireTimes[index] = 0.0
    ActiveThrallCount -= 1
    If ActiveThrallCount < 0
        ActiveThrallCount = 0
    EndIf
EndFunction

Int Function GetActiveThrallCount()
    Return ActiveThrallCount
EndFunction
