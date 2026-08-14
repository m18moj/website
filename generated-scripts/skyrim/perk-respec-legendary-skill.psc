; ScriptForge — Perk Respec & Legendary Skill
; Pack: Skyrim Pack | Category: Progression
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Perk-point refund on respec and legendary-skill reset handling.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName PerkRespecLegendarySkill extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

GlobalVariable Property TotalPerksSpent Auto
GlobalVariable Property TotalPerksRefunded Auto

Float Property LegendarySkillThreshold = 100.0 Auto
; Vanilla legendary requirement; a skill must be at or above this to reset

Int Property RespecTokenItemFormID = 0 Auto
; Optional: could be swapped for a Property MiscObject if a physical item is preferred

Message Property RespecConfirmMessage Auto
Message Property LegendaryConfirmMessage Auto

; --- Full Respec -----------------------------------------------------------

; Called from a shrine/NPC dialogue fragment offering a full perk reset
Function PerformFullRespec()
    Int refunded = 0
    String[] skillNames = new String[18]
    skillNames[0] = "OneHanded"
    skillNames[1] = "TwoHanded"
    skillNames[2] = "Marksman"
    skillNames[3] = "Block"
    skillNames[4] = "Smithing"
    skillNames[5] = "HeavyArmor"
    skillNames[6] = "LightArmor"
    skillNames[7] = "Pickpocket"
    skillNames[8] = "Lockpicking"
    skillNames[9] = "Sneak"
    skillNames[10] = "Alchemy"
    skillNames[11] = "Speechcraft"
    skillNames[12] = "Alteration"
    skillNames[13] = "Conjuration"
    skillNames[14] = "Destruction"
    skillNames[15] = "Illusion"
    skillNames[16] = "Restoration"
    skillNames[17] = "Enchanting"

    Int i = 0
    While i < skillNames.Length
        Int skillLevel = PlayerRef.GetBaseActorValue(skillNames[i]) as Int
        ; Rough estimate: one perk point per 5 levels above the base of 15,
        ; intended as a starting formula for a mod author to refine.
        Int estimatedPerks = (skillLevel - 15) / 5
        If estimatedPerks > 0
            refunded += estimatedPerks
        EndIf
        i += 1
    EndWhile

    PlayerRef.ModActorValue("PerkPoints", refunded as Float)

    If TotalPerksRefunded != None
        TotalPerksRefunded.SetValue(TotalPerksRefunded.GetValue() + refunded)
    EndIf

    If RespecConfirmMessage != None
        RespecConfirmMessage.Show()
    Else
        Debug.Notification("Your perks have been refunded: " + refunded)
    EndIf
EndFunction

; --- Legendary Skill Reset -----------------------------------------------

; Called when the player selects a maxed skill to make legendary
Function MakeSkillLegendary(String skillName)
    If PlayerRef.GetBaseActorValue(skillName) < LegendarySkillThreshold
        Debug.Notification("This skill is not yet ready to become legendary.")
        Return
    EndIf

    PlayerRef.SetActorValue(skillName, 15.0)

    If LegendaryConfirmMessage != None
        LegendaryConfirmMessage.Show()
    Else
        Debug.Notification(skillName + " has been reset to legendary status.")
    EndIf
EndFunction

Bool Function CanGoLegendary(String skillName)
    Return PlayerRef.GetBaseActorValue(skillName) >= LegendarySkillThreshold
EndFunction

; --- Tracking -----------------------------------------------------------

Function TrackPerkSpent()
    If TotalPerksSpent != None
        TotalPerksSpent.SetValue(TotalPerksSpent.GetValue() + 1.0)
    EndIf
EndFunction
