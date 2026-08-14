; ScriptForge — Radiant World Events
; Pack: Skyrim Pack | Category: World
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Randomized ambient world events (bandit attacks, traveling merchants, dragon sightings) on a timer.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName WorldEventManager extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

EncounterZone Property WorldZone Auto
; Zone used to keep spawned actors leveled appropriately

ActorBase Property BanditBase Auto
Actor Property MerchantTemplate Auto
ActorBase Property DragonBase Auto
; Actor bases spawned for each event type

Location Property PlayerCurrentLocation Auto
; Filled at runtime, used to decide whether an event is appropriate to trigger

Float Property MinIntervalHours = 2.0 Auto
Float Property MaxIntervalHours = 6.0 Auto
; Randomized window between world event rolls

Int Property EventsTriggeredCount = 0 Auto Hidden

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    ScheduleNextEvent()
EndEvent

Function ScheduleNextEvent()
    Float delay = Utility.RandomFloat(MinIntervalHours, MaxIntervalHours)
    RegisterForSingleUpdateGameTime(delay)
    Debug.Trace("WorldEventManager: next event in " + delay + " game hours")
EndFunction

Event OnUpdateGameTime()
    If PlayerRef.IsInCombat() == false && PlayerRef.IsOnMount() == false
        TriggerRandomWorldEvent()
    EndIf
    ScheduleNextEvent()
EndEvent

; --- Event Selection --------------------------------------------------------

Function TriggerRandomWorldEvent()
    Int roll = Utility.RandomInt(1, 100)

    If roll <= 40
        SpawnBanditAttack()
    ElseIf roll <= 70
        SpawnTravelingMerchant()
    ElseIf roll <= 85
        SpawnDragonSighting()
    Else
        Debug.Trace("WorldEventManager: quiet roll, no event this cycle")
    EndIf
EndFunction

Function SpawnBanditAttack()
    ; Spawns a small bandit group near the player's exterior position
    Cell playerCell = PlayerRef.GetParentCell()
    If playerCell != None && playerCell.IsInterior() == false
        ObjectReference spawnMarker = PlayerRef.PlaceAtMe(BanditBase as Form, 3, true, false)
        If spawnMarker != None
            EventsTriggeredCount += 1
            Debug.Notification("You hear raised voices nearby...")
        EndIf
    EndIf
EndFunction

Function SpawnTravelingMerchant()
    ; Places a wandering merchant on the road ahead of the player
    ObjectReference merchantRef = PlayerRef.PlaceAtMe(MerchantTemplate as Form, 1, true, false)
    If merchantRef != None
        EventsTriggeredCount += 1
        Debug.Notification("A traveling merchant approaches.")
    EndIf
EndFunction

Function SpawnDragonSighting()
    ; Rare high-tier event; only fires if the player is high enough level
    If PlayerRef.GetLevel() >= 10
        ObjectReference dragonRef = PlayerRef.PlaceAtMe(DragonBase as Form, 1, true, false)
        If dragonRef != None
            EventsTriggeredCount += 1
            Debug.Notification("A shadow passes overhead. A dragon!")
        EndIf
    Else
        SpawnBanditAttack()
    EndIf
EndFunction

Int Function GetEventsTriggeredCount()
    Return EventsTriggeredCount
EndFunction
