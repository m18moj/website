; ScriptForge — Daedric Artifact Quest Tracker
; Pack: Skyrim Pack | Category: Quests
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Tracker for progress across the Daedric Prince quest line and collected artifacts.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName DaedricArtifactQuestTracker extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Formlist Property DaedricArtifactList Auto
; A formlist of all trackable Daedric artifact items (Wabbajack, Mace of Molag Bal, etc.)

GlobalVariable Property ArtifactsCollectedCount Auto
GlobalVariable Property DaedricQuestsCompletedCount Auto

Int Property TotalArtifactCount = 15 Auto
; Total number of Daedric artifacts tracked by this system

Message Property ArtifactCollectedMessage Auto
Message Property AllArtifactsCollectedMessage Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    If ArtifactsCollectedCount != None
        ArtifactsCollectedCount.SetValue(0.0)
    EndIf
    If DaedricQuestsCompletedCount != None
        DaedricQuestsCompletedCount.SetValue(0.0)
    EndIf
EndEvent

; --- Artifact Tracking ---------------------------------------------------

; Called from the completion stage of each individual Daedric quest
Function RecordArtifactObtained(Form akArtifact)
    If akArtifact == None || DaedricArtifactList == None
        Return
    EndIf

    If !DaedricArtifactList.HasForm(akArtifact)
        Return
    EndIf

    If ArtifactsCollectedCount != None
        ArtifactsCollectedCount.SetValue(ArtifactsCollectedCount.GetValue() + 1.0)
    EndIf

    If ArtifactCollectedMessage != None
        ArtifactCollectedMessage.Show()
    Else
        Debug.Notification("Daedric artifact obtained.")
    EndIf

    CheckForCompletion()
EndFunction

Function CheckForCompletion()
    If ArtifactsCollectedCount == None
        Return
    EndIf

    If (ArtifactsCollectedCount.GetValue() as Int) >= TotalArtifactCount
        If AllArtifactsCollectedMessage != None
            AllArtifactsCollectedMessage.Show()
        Else
            Debug.Notification("You have collected every Daedric artifact.")
        EndIf
    EndIf
EndFunction

; --- Quest Completion Tracking -------------------------------------------

; Called from each Daedric Prince quest's final stage fragment
Function RecordDaedricQuestCompleted(Quest akCompletedQuest)
    If akCompletedQuest == None
        Return
    EndIf

    If DaedricQuestsCompletedCount != None
        DaedricQuestsCompletedCount.SetValue(DaedricQuestsCompletedCount.GetValue() + 1.0)
    EndIf
EndFunction

; --- Query Helpers -------------------------------------------------------

Bool Function HasArtifact(Form akArtifact)
    If akArtifact == None
        Return false
    EndIf
    Return PlayerRef.GetItemCount(akArtifact) > 0
EndFunction

Int Function GetArtifactsRemaining()
    If ArtifactsCollectedCount == None
        Return TotalArtifactCount
    EndIf
    Return TotalArtifactCount - (ArtifactsCollectedCount.GetValue() as Int)
EndFunction

Bool Function HasCompletedAllDaedricQuests(Int totalKnownDaedricQuests)
    If DaedricQuestsCompletedCount == None
        Return false
    EndIf
    Return (DaedricQuestsCompletedCount.GetValue() as Int) >= totalKnownDaedricQuests
EndFunction
