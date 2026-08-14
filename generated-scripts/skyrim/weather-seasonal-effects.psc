; ScriptForge — Weather & Seasonal Effects
; Pack: Skyrim Pack | Category: World
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Weather-triggered gameplay effects such as frost damage in blizzards and stealth bonus in fog.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName WeatherSeasonalEffects extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Weather Property BlizzardWeather Auto
Weather Property FogWeather Auto
Weather Property AshstormWeather Auto

Spell Property FrostDamageOverTime Auto
Spell Property FogStealthBonus Auto
Spell Property AshstormDamageOverTime Auto

Armor Property WarmClothingKeyword Auto
; If the player is wearing sufficiently warm gear, frost damage is reduced

Float Property FrostDamageInterval = 10.0 Auto

Bool Property IsUnderWeatherEffect = false Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForRemoteEvent(Weather.GetCurrentWeather(), "OnWeatherChange")
    RegisterForSingleUpdate(30.0)
EndEvent

; --- Weather Polling -----------------------------------------------------

Event OnUpdate()
    EvaluateCurrentWeather()
    RegisterForSingleUpdate(30.0)
EndEvent

Function EvaluateCurrentWeather()
    Weather currentWeather = Weather.GetCurrentWeather()
    If currentWeather == None
        ClearAllWeatherEffects()
        Return
    EndIf

    If currentWeather == BlizzardWeather
        ApplyBlizzardEffects()
    ElseIf currentWeather == FogWeather
        ApplyFogEffects()
    ElseIf currentWeather == AshstormWeather
        ApplyAshstormEffects()
    Else
        ClearAllWeatherEffects()
    EndIf
EndFunction

; --- Effect Application (shared by all three weather types) ----------------

Function ApplyBlizzardEffects()
    If IsUnderWeatherEffect || IsPlayerWarmlyDressed()
        Return ; already affected, or sufficiently protected against the cold
    EndIf
    ApplyEffect(FrostDamageOverTime, "The biting cold begins to sap your strength.")
EndFunction

Bool Function IsPlayerWarmlyDressed()
    ; A full implementation would check equipped armor keywords; this stub
    ; assumes an external keyword-tagging mod supplies WarmClothingKeyword.
    Return false
EndFunction

Function ApplyFogEffects()
    If !IsUnderWeatherEffect
        ApplyEffect(FogStealthBonus, "The fog conceals your movements.")
    EndIf
EndFunction

Function ApplyAshstormEffects()
    If !IsUnderWeatherEffect
        ApplyEffect(AshstormDamageOverTime, "Ash stings at your exposed skin.")
    EndIf
EndFunction

Function ApplyEffect(Spell akEffect, String notificationText)
    If akEffect != None && !PlayerRef.HasSpell(akEffect)
        PlayerRef.AddSpell(akEffect, false)
        IsUnderWeatherEffect = true
        Debug.Notification(notificationText)
    EndIf
EndFunction

; --- Cleanup -----------------------------------------------------------

Function ClearAllWeatherEffects()
    If !IsUnderWeatherEffect
        Return
    EndIf

    If FrostDamageOverTime != None
        PlayerRef.RemoveSpell(FrostDamageOverTime)
    EndIf
    If FogStealthBonus != None
        PlayerRef.RemoveSpell(FogStealthBonus)
    EndIf
    If AshstormDamageOverTime != None
        PlayerRef.RemoveSpell(AshstormDamageOverTime)
    EndIf

    IsUnderWeatherEffect = false
EndFunction

Event OnWeatherChange(Weather akOldWeather, Weather akNewWeather)
    EvaluateCurrentWeather()
EndEvent
