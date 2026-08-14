; ScriptForge — Spell Learning & Tome System
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Spell tome reading that teaches spells to the player and tracks a known-spell list.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName SpellLearningTomeSystem extends Book

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Spell Property TaughtSpell Auto
; The spell granted when this tome is read

GlobalVariable Property TotalSpellsLearned Auto
; Running count of unique spells learned across all tomes, for perk/dialogue gating

Bool Property ConsumeOnRead = true Auto
; Whether the tome is removed from inventory after teaching, matching vanilla behavior

Bool Property RequiresSkillLevel = false Auto
Int Property MinimumSkillLevel = 0 Auto
String Property RequiredSkillName = "" Auto
; e.g. "Destruction" — checked via PlayerRef.GetActorValue when RequiresSkillLevel is true

Message Property SkillTooLowMessage Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    ; Nothing to register by default; hook left for future analytics events
EndEvent

; --- Reading / Teaching -----------------------------------------------------

; Wired to this Book's "Read" event via a quest fragment or OnRead alias script,
; call this from the appropriate place since Book has no native OnRead event.
Function AttemptTeachSpell()
    If TaughtSpell == None || PlayerRef == None
        Return
    EndIf

    If PlayerRef.HasSpell(TaughtSpell)
        Debug.Notification("You already know this spell.")
        Return
    EndIf

    If RequiresSkillLevel && !MeetsSkillRequirement()
        If SkillTooLowMessage != None
            SkillTooLowMessage.Show()
        Else
            Debug.Notification("Your skill is not yet high enough to understand this tome.")
        EndIf
        Return
    EndIf

    PlayerRef.AddSpell(TaughtSpell, false)
    RecordSpellLearned()

    Debug.Notification("You have learned " + TaughtSpell.GetName() + ".")

    If ConsumeOnRead
        Self.EnableNoWait()
        (Self as ObjectReference).RemoveItem(Self as Form, 1, true, PlayerRef)
    EndIf
EndFunction

Bool Function MeetsSkillRequirement()
    If RequiredSkillName == ""
        Return true
    EndIf
    Return PlayerRef.GetActorValue(RequiredSkillName) >= (MinimumSkillLevel as Float)
EndFunction

; --- Tracking -----------------------------------------------------------

Function RecordSpellLearned()
    If TotalSpellsLearned != None
        TotalSpellsLearned.SetValue(TotalSpellsLearned.GetValue() + 1.0)
    EndIf
EndFunction

Bool Function HasLearnedSpell()
    If TaughtSpell == None || PlayerRef == None
        Return false
    EndIf
    Return PlayerRef.HasSpell(TaughtSpell)
EndFunction

; --- Utility -----------------------------------------------------------

; Convenience for a merchant/quest script to grant this spell directly, bypassing the tome item
Function GrantSpellDirectly()
    If TaughtSpell != None && PlayerRef != None && !PlayerRef.HasSpell(TaughtSpell)
        PlayerRef.AddSpell(TaughtSpell, false)
        RecordSpellLearned()
    EndIf
EndFunction
