; ScripForge — Follower Combat AI
; Pack: Skyrim Pack | Category: AI
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Combat-style AI behavior driver for followers — flanking, healing, and retreat logic.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName FollowerCombatAI extends ReferenceAlias

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Spell Property HealingSpell Auto
Potion Property HealingPotion Auto

Float Property LowHealthThreshold = 0.3 Auto
; Fraction of max health that triggers self-heal or retreat behavior

Float Property CriticalHealthThreshold = 0.15 Auto
; Fraction of max health that triggers a full retreat

Package Property FlankingPackage Auto
Package Property RetreatPackage Auto
Package Property DefaultCombatPackage Auto

Bool Property IsRetreating = false Auto
Bool Property PreferFlanking = true Auto

Faction Property FlankingFaction Auto
; Optional faction toggled to cue a flanking AI package via package conditions

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    Actor thisFollower = GetActorReference()
    If thisFollower != None
        RegisterForRemoteEvent(thisFollower, "OnCombatStateChanged")
        RegisterForSingleUpdate(1.0)
    EndIf
EndEvent

; --- Combat State Handling -------------------------------------------------

Event OnCombatStateChanged(Actor akTarget, Int aeCombatState)
    Actor thisFollower = GetActorReference()
    If thisFollower == None
        Return
    EndIf

    If aeCombatState == 1 || aeCombatState == 2
        ; In combat or searching — engage the periodic health-check loop
        RegisterForSingleUpdate(1.0)
        If PreferFlanking && FlankingPackage != None && FlankingFaction != None
            thisFollower.AddToFaction(FlankingFaction)
        EndIf
    Else
        ; Combat has ended — return to normal behavior
        IsRetreating = false
    EndIf
EndEvent

; --- Periodic Health Monitoring ---------------------------------------------

Event OnUpdate()
    Actor thisFollower = GetActorReference()
    If thisFollower == None || thisFollower.IsDead()
        Return
    EndIf

    If thisFollower.IsInCombat()
        EvaluateHealthState(thisFollower)
        RegisterForSingleUpdate(1.0)
    EndIf
EndEvent

Function EvaluateHealthState(Actor thisFollower)
    Float healthFraction = thisFollower.GetActorValuePercentage("Health")

    If healthFraction <= CriticalHealthThreshold
        BeginRetreat(thisFollower)
    ElseIf healthFraction <= LowHealthThreshold
        AttemptSelfHeal(thisFollower)
    EndIf
EndFunction

Function AttemptSelfHeal(Actor thisFollower)
    If HealingSpell != None && thisFollower.HasSpell(HealingSpell)
        thisFollower.Cast(HealingSpell, thisFollower)
    ElseIf HealingPotion != None && thisFollower.GetItemCount(HealingPotion) > 0
        thisFollower.EquipItem(HealingPotion, false, true)
    EndIf
EndFunction

Function BeginRetreat(Actor thisFollower)
    If IsRetreating
        Return
    EndIf
    IsRetreating = true

    If RetreatPackage != None
        thisFollower.AddSpell(HealingSpell, false)
    EndIf

    thisFollower.SetActorValue("Confidence", 0.0)
    Debug.Notification(thisFollower.GetLeveledActorBase().GetName() + " is falling back!")
EndFunction

Function ResumeAggressiveStance(Actor thisFollower)
    IsRetreating = false
    thisFollower.SetActorValue("Confidence", 3.0)
    If FlankingFaction != None
        thisFollower.RemoveFromFaction(FlankingFaction)
    EndIf
EndFunction
