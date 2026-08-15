; ScripForge — College of Winterhold Spell Research
; Pack: Skyrim Pack | Category: Progression
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Research-bench spell-tome crafting gated by school skill level and gathered arcane ingredients.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName CollegeWinterholdSpellResearch extends ObjectReference

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

String Property SchoolSkillName = "Destruction" Auto
; Matches an ActorValue name: Destruction, Restoration, Alteration, Conjuration, Illusion

Float Property RequiredSkillLevel = 50.0 Auto

MiscObject Property VoidSalts Auto
MiscObject Property FilledSoulGem Auto
Int Property RequiredVoidSalts = 2 Auto
Int Property RequiredSoulGems = 1 Auto

Book Property ResearchedSpellTome Auto
GlobalVariable Property SpellsResearchedCount Auto

Sound Property ResearchSuccessSound Auto
Sound Property ResearchFailSound Auto

Bool Property HasBeenResearched = false Auto

; --- Lifecycle ----------------------------------------------------------

Event OnActivate(ObjectReference akActionRef)
    If akActionRef != PlayerRef
        Return
    EndIf

    If HasBeenResearched
        Debug.Notification("You have already unlocked this formula.")
        Return
    EndIf

    AttemptResearch()
EndEvent

; --- Research Gate ---------------------------------------------------------

Function AttemptResearch()
    If !MeetsSkillRequirement()
        Debug.Notification("Your " + SchoolSkillName + " skill isn't advanced enough for this research.")
        PlayFailSound()
        Return
    EndIf

    If !HasRequiredIngredients()
        Debug.Notification("You lack the arcane materials this research requires.")
        PlayFailSound()
        Return
    EndIf

    ConsumeIngredients()
    GrantSpellTome()
EndFunction

Bool Function MeetsSkillRequirement()
    Return PlayerRef.GetActorValue(SchoolSkillName) >= RequiredSkillLevel
EndFunction

Bool Function HasRequiredIngredients()
    If VoidSalts != None && PlayerRef.GetItemCount(VoidSalts) < RequiredVoidSalts
        Return false
    EndIf
    If FilledSoulGem != None && PlayerRef.GetItemCount(FilledSoulGem) < RequiredSoulGems
        Return false
    EndIf
    Return true
EndFunction

Function ConsumeIngredients()
    If VoidSalts != None
        PlayerRef.RemoveItem(VoidSalts, RequiredVoidSalts)
    EndIf
    If FilledSoulGem != None
        PlayerRef.RemoveItem(FilledSoulGem, RequiredSoulGems)
    EndIf
EndFunction

; --- Outcome ---------------------------------------------------------------

Function GrantSpellTome()
    If ResearchedSpellTome == None
        Return
    EndIf

    PlayerRef.AddItem(ResearchedSpellTome, 1, true)
    HasBeenResearched = true

    If SpellsResearchedCount != None
        SpellsResearchedCount.SetValue(SpellsResearchedCount.GetValue() + 1.0)
    EndIf

    If ResearchSuccessSound != None
        ResearchSuccessSound.Play(PlayerRef)
    EndIf

    Debug.Notification("Research complete: a new spell tome has been transcribed.")
EndFunction

Function PlayFailSound()
    If ResearchFailSound != None
        ResearchFailSound.Play(PlayerRef)
    EndIf
EndFunction

Float Function GetSkillProgressPercent()
    If RequiredSkillLevel <= 0.0
        Return 100.0
    EndIf
    Float ratio = (PlayerRef.GetActorValue(SchoolSkillName) / RequiredSkillLevel) * 100.0
    If ratio > 100.0
        ratio = 100.0
    EndIf
    Return ratio
EndFunction
