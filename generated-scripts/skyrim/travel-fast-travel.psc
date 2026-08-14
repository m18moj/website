; ScriptForge — Fast Travel & Map Discovery
; Pack: Skyrim Pack | Category: World
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Discoverable map markers unlocking fast-travel points with random-encounter chance.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName TravelFastTravel extends ObjectReference

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Message Property DiscoveryMessage Auto
; Shown once when the player first enters this marker's discovery radius

Float Property DiscoveryRadius = 2000.0 Auto
; Distance in game units at which the marker auto-discovers

Int Property EncounterChancePercent = 15 Auto
; Chance an ambient encounter interrupts a fast-travel trip that uses this marker

Actor Property AmbushActorTemplate Auto
; Actor spawned if a random encounter triggers en route

Bool Property bIsDiscovered = false Auto Hidden

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    ; Enable the marker's map visibility only once discovered
    SetMapMarkerVisible(false)
    RegisterForSingleUpdate(1.0)
EndEvent

Event OnUpdate()
    If bIsDiscovered == false
        CheckProximity()
        RegisterForSingleUpdate(1.0)
    EndIf
EndEvent

; --- Discovery Logic ------------------------------------------------------

Function CheckProximity()
    Float dist = GetDistance(PlayerRef)
    If dist <= DiscoveryRadius
        DiscoverMarker()
    EndIf
EndFunction

Function DiscoverMarker()
    If bIsDiscovered
        Return
    EndIf

    bIsDiscovered = true
    SetMapMarkerVisible(true)

    If DiscoveryMessage != None
        DiscoveryMessage.Show()
    EndIf
    Debug.Notification("Location discovered: " + GetMapMarkerName())
EndFunction

; --- Fast Travel Encounter Roll --------------------------------------------

Function OnPlayerFastTraveledHere()
    ; Call this from a quest alias or global mod-event hook when the player
    ; fast-travels using this marker, to potentially trigger an ambush.
    If bIsDiscovered == false
        DiscoverMarker()
    EndIf

    Int roll = Utility.RandomInt(1, 100)
    If roll <= EncounterChancePercent
        TriggerAmbushEncounter()
    EndIf
EndFunction

Function TriggerAmbushEncounter()
    If AmbushActorTemplate != None
        ObjectReference ambusher = PlayerRef.PlaceAtMe(AmbushActorTemplate as Form, 1, true, false)
        If ambusher != None
            Debug.Notification("You are ambushed on the road!")
        EndIf
    EndIf
EndFunction

String Function GetMapMarkerName()
    ; Placeholder accessor; in practice this would read the marker's editor name
    ; via a LocationRefType or a dedicated Location property.
    Return GetBaseObject().GetName()
EndFunction

Bool Function IsDiscovered()
    Return bIsDiscovered
EndFunction
