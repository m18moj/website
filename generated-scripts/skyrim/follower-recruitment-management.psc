; ScripForge — Follower Recruitment & Management
; Pack: Skyrim Pack | Category: Systems
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Recruitable follower dialogue hook, shared inventory access, and roster management.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName FollowerRecruitmentManagement extends ReferenceAlias

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto

Faction Property CurrentFollowerFaction Auto
; Vanilla-style faction that flags an actor as an active, essential follower

Faction Property PotentialFollowerFaction Auto
; Marks NPCs who are eligible for recruitment dialogue

GlobalVariable Property FollowerRosterCount Auto
; Tracks how many followers have been recruited this playthrough

Int Property MaxActiveFollowers = 1 Auto

Bool Property IsRecruited = false Auto
Bool Property IsWaiting = false Auto

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    Actor thisFollower = GetActorReference()
    If thisFollower != None && thisFollower.IsInFaction(PotentialFollowerFaction)
        RegisterForRemoteEvent(thisFollower, "OnDeath")
    EndIf
EndEvent

; --- Recruitment ----------------------------------------------------------

; Called from the "Would you like to travel with me?" dialogue fragment
Function RecruitFollower()
    Actor thisFollower = GetActorReference()
    If thisFollower == None
        Return
    EndIf

    If GetActiveFollowerCount() >= MaxActiveFollowers
        Debug.Notification("You already have enough companions with you.")
        Return
    EndIf

    thisFollower.AddToFaction(CurrentFollowerFaction)
    thisFollower.SetPlayerTeammate(true)
    IsRecruited = true
    IsWaiting = false

    If FollowerRosterCount != None
        FollowerRosterCount.SetValue(FollowerRosterCount.GetValue() + 1.0)
    EndIf

    Debug.Notification(thisFollower.GetLeveledActorBase().GetName() + " has joined you.")
EndFunction

; Called from the "Wait here." dialogue topic
Function TellFollowerToWait()
    Actor thisFollower = GetActorReference()
    If thisFollower != None && IsRecruited
        thisFollower.SetPlayerTeammate(true)
        IsWaiting = true
        Debug.Notification(thisFollower.GetLeveledActorBase().GetName() + " will wait here.")
    EndIf
EndFunction

; Called from the "Let's go." dialogue topic
Function TellFollowerToFollow()
    Actor thisFollower = GetActorReference()
    If thisFollower != None && IsRecruited
        IsWaiting = false
        thisFollower.PathToReference(PlayerRef, 600.0)
    EndIf
EndFunction

; Called from the dismissal dialogue topic
Function DismissFollower()
    Actor thisFollower = GetActorReference()
    If thisFollower == None
        Return
    EndIf

    thisFollower.RemoveFromFaction(CurrentFollowerFaction)
    thisFollower.SetPlayerTeammate(false)
    IsRecruited = false
    IsWaiting = false
    Debug.Notification(thisFollower.GetLeveledActorBase().GetName() + " has left your service.")
EndFunction

; --- Shared Inventory -------------------------------------------------------

; Opens follower inventory for trading; assumes vanilla trade behavior is wired via a quest alias
Function OpenTradeMenu()
    Actor thisFollower = GetActorReference()
    If thisFollower != None && IsRecruited
        thisFollower.OpenInventory(true)
    EndIf
EndFunction

; --- Helpers -----------------------------------------------------------

Int Function GetActiveFollowerCount()
    If CurrentFollowerFaction == None
        Return 0
    EndIf
    Return CurrentFollowerFaction.GetNumWithinRadius(PlayerRef, 4096.0) as Int
EndFunction

Event OnDeath(Actor akVictim, Actor akKiller)
    If akVictim == GetActorReference()
        IsRecruited = false
        Debug.Notification(akVictim.GetLeveledActorBase().GetName() + " has fallen.")
    EndIf
EndEvent
