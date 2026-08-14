; ScriptForge — Quest Stage & Journal System
; Pack: Skyrim Pack | Category: Quests
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Multi-stage quest tracking with journal entries and stage-completion triggers.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName QuestStateManager extends Quest

; --- Properties -------------------------------------------------------

Quest Property ThisQuest Auto
; Self-reference used for SetStage / journal calls (assign to the quest this script is attached to)

Faction Property QuestFaction Auto
; Optional faction used to gate stage advancement (e.g. must be enemy of / ally of)

ObjectReference Property QuestObjective Auto
; The object the player must interact with to advance the current stage

Actor Property PlayerRef Auto
; Reference to the player, assigned in the Creation Kit

Int Property CurrentStage = 10 Auto
; Tracks the active stage number, mirrors the quest's internal stage

Bool Property bObjectiveComplete = false Auto Hidden
; Internal flag set once the current objective has been satisfied

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    ; Called once when the quest script first initializes
    RegisterForSingleUpdate(2.0)
    CurrentStage = 10
    bObjectiveComplete = false
    Debug.Trace("QuestStateManager: initialized at stage " + CurrentStage)
EndEvent

Event OnUpdate()
    ; Periodic poll to catch state changes that don't fire discrete events
    If (bObjectiveComplete == false) && (QuestObjective != None)
        If QuestObjective.IsDisabled() || QuestObjective.GetDestroyed()
            CompleteCurrentStage()
        EndIf
    EndIf
    RegisterForSingleUpdate(5.0)
EndEvent

; --- Stage Handling -------------------------------------------------------

Function AdvanceToStage(Int newStage, String journalEntry)
    ; Moves the quest forward and writes a journal entry for the player
    If newStage <= CurrentStage
        Debug.Trace("QuestStateManager: refused to advance backward from " + CurrentStage + " to " + newStage)
        Return
    EndIf

    CurrentStage = newStage
    ThisQuest.SetStage(newStage)
    bObjectiveComplete = false

    If journalEntry != ""
        Debug.Notification(journalEntry)
    EndIf

    If newStage >= 200
        OnQuestComplete()
    EndIf
EndFunction

Function CompleteCurrentStage()
    ; Called when the active objective has been satisfied
    bObjectiveComplete = true
    Debug.Notification("Objective complete.")
    AdvanceToStage(CurrentStage + 10, "")
EndFunction

Function OnQuestComplete()
    ; Final cleanup once the quest reaches its completion stage
    If QuestFaction != None && PlayerRef != None
        PlayerRef.AddToFaction(QuestFaction)
    EndIf
    ThisQuest.Stop()
    Debug.Trace("QuestStateManager: quest completed and stopped")
EndFunction

; --- Event Hooks used by referenced objects ------------------------------

Event OnActivate(ObjectReference akActionRef)
    ; If this script is placed on the objective itself, activation advances the stage
    If akActionRef == PlayerRef && bObjectiveComplete == false
        CompleteCurrentStage()
    EndIf
EndEvent

Function ResetQuestProgress()
    ; Utility to roll the quest back to the beginning, e.g. for a repeatable quest
    CurrentStage = 10
    bObjectiveComplete = false
    ThisQuest.SetStage(10)
    Debug.Trace("QuestStateManager: quest progress reset")
EndFunction
