; ScripForge — Werewolf & Vampire Lord Transformation
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Timed beast-form transformations with a separate power bar, a feed/hunt mechanic, and form-specific perks.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName WerewolfVampireLordTransformation extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Spell Property WerewolfTransformSpell Auto
Spell Property VampireLordTransformSpell Auto

Perk Property WerewolfPerkTree Auto
Perk Property VampireLordPerkTree Auto

Faction Property WerewolfFaction Auto
Faction Property VampireLordFaction Auto

GlobalVariable Property BeastFormMeter Auto
; 0-100 power bar; depletes while transformed, regenerates over real time

Float Property TransformDurationSeconds = 120.0 Auto
Float Property FeedRestoreAmount = 40.0 Auto
Float Property DrainPerTick = 4.0 Auto
Float Property RegenPerTick = 1.0 Auto

Int Property CurrentForm = 0 Auto
; 0 = human, 1 = werewolf, 2 = vampire lord

Bool Property IsTransformed = false Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    BeastFormMeter.SetValue(100.0)
EndEvent

; --- Transformation --------------------------------------------------------

Function TransformToWerewolf()
    If IsTransformed || BeastFormMeter.GetValue() <= 0.0
        Debug.Notification("The beast blood is too weak to answer the call.")
        Return
    EndIf

    PlayerRef.AddSpell(WerewolfTransformSpell, false)
    PlayerRef.AddToFaction(WerewolfFaction)
    If WerewolfPerkTree != None
        PlayerRef.AddPerk(WerewolfPerkTree)
    EndIf

    CurrentForm = 1
    IsTransformed = true
    RegisterForSingleUpdate(2.0)
    Debug.Notification("You have taken the form of a werewolf.")
EndFunction

Function TransformToVampireLord()
    If IsTransformed || BeastFormMeter.GetValue() <= 0.0
        Debug.Notification("Your vampiric power is too weak to transform.")
        Return
    EndIf

    PlayerRef.AddSpell(VampireLordTransformSpell, false)
    PlayerRef.AddToFaction(VampireLordFaction)
    If VampireLordPerkTree != None
        PlayerRef.AddPerk(VampireLordPerkTree)
    EndIf

    CurrentForm = 2
    IsTransformed = true
    RegisterForSingleUpdate(2.0)
    Debug.Notification("You have taken the form of a Vampire Lord.")
EndFunction

Function RevertForm()
    If !IsTransformed
        Return
    EndIf

    If CurrentForm == 1
        PlayerRef.RemoveSpell(WerewolfTransformSpell)
        PlayerRef.RemoveFromFaction(WerewolfFaction)
    ElseIf CurrentForm == 2
        PlayerRef.RemoveSpell(VampireLordTransformSpell)
        PlayerRef.RemoveFromFaction(VampireLordFaction)
    EndIf

    CurrentForm = 0
    IsTransformed = false
    Debug.Notification("You return to your mortal shape.")
EndFunction

; --- Power Bar & Update Loop ------------------------------------------------

Event OnUpdate()
    If IsTransformed
        Float newValue = BeastFormMeter.GetValue() - DrainPerTick
        If newValue <= 0.0
            BeastFormMeter.SetValue(0.0)
            RevertForm()
            Return
        EndIf
        BeastFormMeter.SetValue(newValue)
        RegisterForSingleUpdate(2.0)
    Else
        Float regenValue = BeastFormMeter.GetValue() + RegenPerTick
        If regenValue > 100.0
            regenValue = 100.0
        EndIf
        BeastFormMeter.SetValue(regenValue)
        If regenValue < 100.0
            RegisterForSingleUpdate(10.0)
        EndIf
    EndIf
EndEvent

; --- Feed / Hunt Mechanic ---------------------------------------------------

; Called from a feed dialogue result fragment or a kill-move hook
Function Feed(Actor akTarget)
    If akTarget == None || akTarget.IsDead() == false
        Return
    EndIf

    Float newValue = BeastFormMeter.GetValue() + FeedRestoreAmount
    If newValue > 100.0
        newValue = 100.0
    EndIf
    BeastFormMeter.SetValue(newValue)
    Debug.Notification("You feel your power restored.")
EndFunction

Float Function GetPowerPercent()
    Return BeastFormMeter.GetValue()
EndFunction
