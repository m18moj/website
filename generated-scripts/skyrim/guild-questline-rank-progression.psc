; ScripForge — Guild Questline & Rank Progression
; Pack: Skyrim Pack | Category: Quests
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Faction guild rank-up requirements gated behind quest completion and reputation thresholds.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName GuildQuestlineRankProgression extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Faction Property GuildFaction Auto
; The guild faction whose rank value drives dialogue and perks

GlobalVariable Property GuildReputationValue Auto
; Accrued reputation earned from completed guild jobs / quests

Quest Property InitiationQuest Auto
Quest Property JourneymanQuest Auto
Quest Property VeteranQuest Auto
Quest Property LeadershipQuest Auto

Int Property RankInitiate = 0 Auto
Int Property RankJourneyman = 1 Auto
Int Property RankVeteran = 2 Auto
Int Property RankLeader = 3 Auto

Int Property JourneymanReputationRequired = 25 Auto
Int Property VeteranReputationRequired = 60 Auto
Int Property LeaderReputationRequired = 100 Auto

Message Property RankUpMessage Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    If GuildFaction.GetRank(PlayerRef) < 0
        GuildFaction.SetRank(PlayerRef, RankInitiate)
    EndIf
EndEvent

; --- Reputation ---------------------------------------------------------

Function AddGuildReputation(Int amount)
    If GuildReputationValue == None
        Return
    EndIf

    Float newValue = GuildReputationValue.GetValue() + amount
    GuildReputationValue.SetValue(newValue)
    EvaluateRankUp()
EndFunction

Int Function GetGuildReputation()
    If GuildReputationValue == None
        Return 0
    EndIf
    Return GuildReputationValue.GetValue() as Int
EndFunction

; --- Rank Evaluation ------------------------------------------------------

Function EvaluateRankUp()
    Int currentRank = GuildFaction.GetRank(PlayerRef)
    Int reputation = GetGuildReputation()

    If currentRank == RankInitiate && QuestCompleted(InitiationQuest) && reputation >= JourneymanReputationRequired
        PromoteTo(RankJourneyman, "Journeyman")
    ElseIf currentRank == RankJourneyman && QuestCompleted(JourneymanQuest) && reputation >= VeteranReputationRequired
        PromoteTo(RankVeteran, "Veteran")
    ElseIf currentRank == RankVeteran && QuestCompleted(VeteranQuest) && reputation >= LeaderReputationRequired
        PromoteTo(RankLeader, "Guild Leader")
    EndIf
EndFunction

Bool Function QuestCompleted(Quest akQuest)
    If akQuest == None
        Return true
    EndIf
    Return akQuest.IsCompleted()
EndFunction

Function PromoteTo(Int newRank, String rankLabel)
    GuildFaction.SetRank(PlayerRef, newRank)

    If newRank == RankLeader && LeadershipQuest != None
        LeadershipQuest.Start()
    ElseIf newRank == RankVeteran && VeteranQuest != None
        VeteranQuest.Start()
    ElseIf newRank == RankJourneyman && JourneymanQuest != None
        JourneymanQuest.Start()
    EndIf

    If RankUpMessage != None
        RankUpMessage.Show()
    EndIf

    Debug.Notification("You have been promoted to " + rankLabel + ".")
EndFunction

; --- Manual / Debug Hooks --------------------------------------------------

Function ForceRank(Int newRank)
    If newRank < RankInitiate || newRank > RankLeader
        Return
    EndIf
    GuildFaction.SetRank(PlayerRef, newRank)
EndFunction

Int Function GetCurrentRank()
    Return GuildFaction.GetRank(PlayerRef)
EndFunction

Bool Function CanRankUp()
    Int currentRank = GetCurrentRank()
    Int reputation = GetGuildReputation()

    If currentRank == RankInitiate
        Return QuestCompleted(InitiationQuest) && reputation >= JourneymanReputationRequired
    ElseIf currentRank == RankJourneyman
        Return QuestCompleted(JourneymanQuest) && reputation >= VeteranReputationRequired
    ElseIf currentRank == RankVeteran
        Return QuestCompleted(VeteranQuest) && reputation >= LeaderReputationRequired
    EndIf

    Return false
EndFunction
