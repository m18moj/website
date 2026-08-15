; ScripForge — Branching Dialogue & Persuasion
; Pack: Skyrim Pack | Category: Dialogue
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Tree-based NPC dialogue with persuasion/intimidate skill checks gating branches.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName DialogueBranchSystem extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto
Actor Property SpeakerNPC Auto
; The NPC this dialogue tree belongs to

GlobalVariable Property PersuasionDifficulty Auto
; Target value the player's Speech skill must beat to succeed

GlobalVariable Property DialogueBranchResult Auto
; 0 = unresolved, 1 = persuaded, 2 = intimidated, 3 = failed, 4 = paid off
; Read by dialogue conditions in the Creation Kit to route to the right response

Faction Property SpeakerFaction Auto
; Faction whose disposition toward the player influences intimidate odds

Int Property BribeAmountGold = 100 Auto
; Gold cost of the "pay off" dialogue option

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    DialogueBranchResult.SetValue(0.0)
    Debug.Trace("DialogueBranchSystem: tree reset for " + SpeakerNPC.GetDisplayName())
EndEvent

; --- Branch Resolution ---------------------------------------------------

Function AttemptPersuade()
    ; Called from a dialogue result script fragment on the "Persuade" topic
    Float playerSpeech = PlayerRef.GetActorValue("Speechcraft")
    Float difficulty = PersuasionDifficulty.GetValue()

    If playerSpeech >= difficulty
        DialogueBranchResult.SetValue(1.0)
        OnPersuadeSuccess()
    Else
        DialogueBranchResult.SetValue(3.0)
        OnBranchFailure()
    EndIf
EndFunction

Function AttemptIntimidate()
    ; Called from the "Intimidate" topic; factors in NPC disposition toward the player
    Int disposition = SpeakerNPC.GetRandomPercent()
    Float playerLevel = PlayerRef.GetLevel() as Float
    Float threshold = 50.0 - (playerLevel * 0.5)

    If disposition >= threshold
        DialogueBranchResult.SetValue(2.0)
        OnIntimidateSuccess()
    Else
        DialogueBranchResult.SetValue(3.0)
        OnBranchFailure()
    EndIf
EndFunction

Function AttemptBribe()
    ; Called from the "Pay him off" topic
    If PlayerRef.GetItemCount(Game.GetForm(0x0000000F)) >= BribeAmountGold
        PlayerRef.RemoveItem(Game.GetForm(0x0000000F), BribeAmountGold)
        DialogueBranchResult.SetValue(4.0)
        OnBribeSuccess()
    Else
        Debug.Notification("You don't have enough gold.")
    EndIf
EndFunction

; --- Outcome Hooks --------------------------------------------------------

Function OnPersuadeSuccess()
    SpeakerNPC.ModFactionRank(SpeakerFaction, 1)
    Debug.Notification("Your words win them over.")
EndFunction

Function OnIntimidateSuccess()
    SpeakerNPC.SetActorValue("Confidence", 0)
    Debug.Notification("Fear does the talking for you.")
EndFunction

Function OnBribeSuccess()
    Debug.Notification("Gold changes hands quietly.")
EndFunction

Function OnBranchFailure()
    SpeakerNPC.SetActorValue("Aggression", SpeakerNPC.GetActorValue("Aggression") + 1)
    Debug.Notification("That didn't land well.")
EndFunction

Bool Function IsBranchResolved()
    Return DialogueBranchResult.GetValue() != 0.0
EndFunction
