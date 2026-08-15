; ScripForge — Dungeon Trap & Puzzle Mechanism
; Pack: Skyrim Pack | Category: World
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Pressure-plate traps, rotating pillar puzzles, and lever-gated door mechanisms for dungeon design.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName DungeonTrapPuzzleMechanism extends ObjectReference

; --- Properties -------------------------------------------------------

; -- Pressure plate trap --
ObjectReference Property PressurePlateRef Auto
ObjectReference Property TrapEmitterRef Auto
; The dart wall / swinging blade / floor spikes activator linked to this plate

Sound Property TrapTriggerSound Auto
Bool Property TrapIsDisarmed = false Auto
Bool Property TrapResetsOverTime = true Auto
Float Property TrapResetDelaySeconds = 8.0 Auto

; -- Rotating pillar puzzle --
ObjectReference Property PillarOne Auto
ObjectReference Property PillarTwo Auto
ObjectReference Property PillarThree Auto
; Each pillar reference is rotated in 90-degree steps via Activate

Int Property PillarOneCorrectRotation = 0 Auto
Int Property PillarTwoCorrectRotation = 180 Auto
Int Property PillarThreeCorrectRotation = 270 Auto

; -- Lever-gated door --
ObjectReference Property GatedDoorRef Auto
ObjectReference Property LeverRef Auto
Bool Property DoorIsUnlocked = false Auto

Message Property PuzzleSolvedMessage Auto

; --- Pressure Plate Trap -------------------------------------------------

Event OnTriggerEnter(ObjectReference akActionRef)
    If akActionRef != PressurePlateRef
        Return
    EndIf

    TriggerTrap(akActionRef)
EndEvent

Function TriggerTrap(ObjectReference akTriggeringRef)
    If TrapIsDisarmed || TrapEmitterRef == None
        Return
    EndIf

    If TrapTriggerSound != None
        Sound.Play(TrapTriggerSound)
    EndIf

    TrapEmitterRef.Activate(akTriggeringRef, false)

    If TrapResetsOverTime
        RegisterForSingleUpdate(TrapResetDelaySeconds)
    EndIf
EndFunction

Event OnUpdate()
    ; Fired only for trap reset scheduling
    ResetTrap()
EndEvent

Function ResetTrap()
    If TrapIsDisarmed
        Return
    EndIf
    ; Emitter is left to its own reset animation/state machine
EndFunction

Function DisarmTrap()
    TrapIsDisarmed = true
    Debug.Notification("The trap has been disarmed.")
EndFunction

; --- Rotating Pillar Puzzle -----------------------------------------------

Function RotatePillar(ObjectReference akPillar)
    If akPillar == None
        Return
    EndIf

    Float currentZ = akPillar.GetAngleZ()
    Float newZ = currentZ + 90.0
    If newZ >= 360.0
        newZ -= 360.0
    EndIf

    akPillar.SetAngle(akPillar.GetAngleX(), akPillar.GetAngleY(), newZ)
    CheckPuzzleSolved()
EndFunction

Function CheckPuzzleSolved()
    If PillarOne == None || PillarTwo == None || PillarThree == None
        Return
    EndIf

    Bool oneCorrect = AngleMatches(PillarOne.GetAngleZ(), PillarOneCorrectRotation)
    Bool twoCorrect = AngleMatches(PillarTwo.GetAngleZ(), PillarTwoCorrectRotation)
    Bool threeCorrect = AngleMatches(PillarThree.GetAngleZ(), PillarThreeCorrectRotation)

    If oneCorrect && twoCorrect && threeCorrect
        SolvePuzzle()
    EndIf
EndFunction

Bool Function AngleMatches(Float currentAngle, Int targetAngle)
    Return (currentAngle as Int) == targetAngle
EndFunction

Function SolvePuzzle()
    If DoorIsUnlocked
        Return
    EndIf

    UnlockGatedDoor()

    If PuzzleSolvedMessage != None
        PuzzleSolvedMessage.Show()
    EndIf
EndFunction

; --- Lever-Gated Door -------------------------------------------------------

Function OnLeverActivated()
    UnlockGatedDoor()
EndFunction

Function UnlockGatedDoor()
    If DoorIsUnlocked || GatedDoorRef == None
        Return
    EndIf

    GatedDoorRef.Lock(false)
    GatedDoorRef.SetOpen(true)
    DoorIsUnlocked = true
    Debug.Notification("You hear a mechanism unlock somewhere nearby.")
EndFunction

Bool Function IsDoorUnlocked()
    Return DoorIsUnlocked
EndFunction
