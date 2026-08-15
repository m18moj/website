; ScripForge — Dragon Soul Absorption System
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Dragon-death soul absorption VFX hook feeding directly into the shout-unlock currency pool.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName DragonSoulAbsorptionSystem extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

GlobalVariable Property DragonSoulsBanked Auto
; Currency pool spent to unlock shout words at word walls

VisualEffect Property SoulAbsorptionVfx Auto
Sound Property SoulAbsorptionSound Auto

Float Property AbsorptionRadius = 1500.0 Auto
Float Property AbsorptionDurationSeconds = 3.0 Auto

Int Property SoulsPerDragon = 1 Auto
Int Property SoulsPerLegendaryDragon = 3 Auto

FormList Property LegendaryDragonRaceList Auto
; Race forms treated as legendary/named dragons that grant bonus souls

Bool Property AbsorptionInProgress = false Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForModEvent("OnDragonDeath", "OnDragonDeath")
EndEvent

; --- Dragon Death Hook ------------------------------------------------------

Event OnDragonDeath(String eventName, String strArg, Float numArg, Form sender)
    Actor deadDragon = sender as Actor
    If deadDragon == None
        Return
    EndIf

    BeginSoulAbsorption(deadDragon)
EndEvent

Function BeginSoulAbsorption(Actor akDragon)
    If akDragon == None || AbsorptionInProgress
        Return
    EndIf

    Float distance = akDragon.GetDistance(PlayerRef)
    If distance > AbsorptionRadius
        ; Too far for the player to be credited with the kill's soul
        Return
    EndIf

    AbsorptionInProgress = true

    If SoulAbsorptionVfx != None
        SoulAbsorptionVfx.Play(akDragon, AbsorptionDurationSeconds)
    EndIf

    If SoulAbsorptionSound != None
        Sound.Play(SoulAbsorptionSound)
    EndIf

    Int soulsGranted = SoulsPerDragon
    If IsLegendaryDragon(akDragon)
        soulsGranted = SoulsPerLegendaryDragon
    EndIf

    RegisterForSingleUpdate(AbsorptionDurationSeconds)
    GrantDragonSouls(soulsGranted)
EndFunction

Bool Function IsLegendaryDragon(Actor akDragon)
    If LegendaryDragonRaceList == None || akDragon == None
        Return false
    EndIf

    Race dragonRace = akDragon.GetRace()
    Return LegendaryDragonRaceList.HasForm(dragonRace)
EndFunction

Event OnUpdate()
    AbsorptionInProgress = false
EndEvent

; --- Soul Currency ----------------------------------------------------------

Function GrantDragonSouls(Int amount)
    If DragonSoulsBanked == None
        Return
    EndIf

    Float newValue = DragonSoulsBanked.GetValue() + amount
    DragonSoulsBanked.SetValue(newValue)
    Debug.Notification("Dragon Soul absorbed.")
EndFunction

Int Function GetBankedSouls()
    If DragonSoulsBanked == None
        Return 0
    EndIf
    Return DragonSoulsBanked.GetValue() as Int
EndFunction

Bool Function SpendSoulsOnShoutWord(Int cost)
    If GetBankedSouls() < cost
        Debug.Notification("You do not have enough dragon souls to unlock this word.")
        Return false
    EndIf

    DragonSoulsBanked.SetValue(DragonSoulsBanked.GetValue() - cost)
    Debug.Notification("A word of power is unlocked within you.")
    Return true
EndFunction
