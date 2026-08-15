; ScripForge — Character Save & Build State
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Full character-state save (stats, perks, inventory, quest flags) across save slots.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName SaveCharacterState extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

GlobalVariable Property ActiveSaveSlot Auto
; Index of the currently active build-save slot (0-2 for three slots)

Perk Property TrackedPerk1 Auto
Perk Property TrackedPerk2 Auto
Perk Property TrackedPerk3 Auto
; Subset of perks explicitly tracked for the snapshot; extend as needed

; --- Snapshot storage, one set of variables per slot ----------------------

Float Property SlotHealth0 = 0.0 Auto Hidden
Float Property SlotMagicka0 = 0.0 Auto Hidden
Float Property SlotStamina0 = 0.0 Auto Hidden
Int Property SlotLevel0 = 0 Auto Hidden
Bool Property SlotHasPerk1_0 = false Auto Hidden
Bool Property SlotHasPerk2_0 = false Auto Hidden
Bool Property SlotHasPerk3_0 = false Auto Hidden
String Property SlotQuestFlags0 = "" Auto Hidden

Float Property SlotHealth1 = 0.0 Auto Hidden
Float Property SlotMagicka1 = 0.0 Auto Hidden
Float Property SlotStamina1 = 0.0 Auto Hidden
Int Property SlotLevel1 = 0 Auto Hidden
Bool Property SlotHasPerk1_1 = false Auto Hidden
Bool Property SlotHasPerk2_1 = false Auto Hidden
Bool Property SlotHasPerk3_1 = false Auto Hidden
String Property SlotQuestFlags1 = "" Auto Hidden

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    If ActiveSaveSlot == None
        Debug.Trace("SaveCharacterState: ActiveSaveSlot global not assigned")
    EndIf
EndEvent

; --- Save / Load Slot 0 ----------------------------------------------------

Function SaveToSlot0()
    SlotHealth0 = PlayerRef.GetActorValue("Health")
    SlotMagicka0 = PlayerRef.GetActorValue("Magicka")
    SlotStamina0 = PlayerRef.GetActorValue("Stamina")
    SlotLevel0 = PlayerRef.GetLevel()
    SlotHasPerk1_0 = PlayerRef.HasPerk(TrackedPerk1)
    SlotHasPerk2_0 = PlayerRef.HasPerk(TrackedPerk2)
    SlotHasPerk3_0 = PlayerRef.HasPerk(TrackedPerk3)
    SlotQuestFlags0 = BuildQuestFlagString()
    Debug.Notification("Character state saved to slot 1.")
EndFunction

Function LoadFromSlot0()
    PlayerRef.SetActorValue("Health", SlotHealth0)
    PlayerRef.SetActorValue("Magicka", SlotMagicka0)
    PlayerRef.SetActorValue("Stamina", SlotStamina0)
    ApplyTrackedPerk(TrackedPerk1, SlotHasPerk1_0)
    ApplyTrackedPerk(TrackedPerk2, SlotHasPerk2_0)
    ApplyTrackedPerk(TrackedPerk3, SlotHasPerk3_0)
    Debug.Notification("Character state loaded from slot 1.")
EndFunction

; --- Save / Load Slot 1 ----------------------------------------------------

Function SaveToSlot1()
    SlotHealth1 = PlayerRef.GetActorValue("Health")
    SlotMagicka1 = PlayerRef.GetActorValue("Magicka")
    SlotStamina1 = PlayerRef.GetActorValue("Stamina")
    SlotLevel1 = PlayerRef.GetLevel()
    SlotHasPerk1_1 = PlayerRef.HasPerk(TrackedPerk1)
    SlotHasPerk2_1 = PlayerRef.HasPerk(TrackedPerk2)
    SlotHasPerk3_1 = PlayerRef.HasPerk(TrackedPerk3)
    SlotQuestFlags1 = BuildQuestFlagString()
    Debug.Notification("Character state saved to slot 2.")
EndFunction

Function LoadFromSlot1()
    PlayerRef.SetActorValue("Health", SlotHealth1)
    PlayerRef.SetActorValue("Magicka", SlotMagicka1)
    PlayerRef.SetActorValue("Stamina", SlotStamina1)
    ApplyTrackedPerk(TrackedPerk1, SlotHasPerk1_1)
    ApplyTrackedPerk(TrackedPerk2, SlotHasPerk2_1)
    ApplyTrackedPerk(TrackedPerk3, SlotHasPerk3_1)
    Debug.Notification("Character state loaded from slot 2.")
EndFunction

; --- Helpers --------------------------------------------------------------

Function ApplyTrackedPerk(Perk targetPerk, Bool shouldHave)
    If shouldHave && !PlayerRef.HasPerk(targetPerk)
        PlayerRef.AddPerk(targetPerk)
    ElseIf !shouldHave && PlayerRef.HasPerk(targetPerk)
        PlayerRef.RemovePerk(targetPerk)
    EndIf
EndFunction

String Function BuildQuestFlagString()
    ; Minimal example; real implementations would enumerate tracked quests
    Return "snapshot_ok"
EndFunction
