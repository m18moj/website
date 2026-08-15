; ScripForge — Perk Tree & Skill Leveling
; Pack: Skyrim Pack | Category: Progression
; Version: 1.0.0
;
; Changelog:
;   1.0.0 - Initial release
;
; Skill-use-based leveling feeding into a branching perk tree with prerequisite gating.
;
; Creation Kit Papyrus script — compile with the Skyrim Creation Kit.

ScriptName SkillTreeSystem extends Quest

; --- Properties -------------------------------------------------------

Actor Property PlayerRef Auto
; The player actor whose skill progress is being tracked

Perk Property PerkTier1 Auto
Perk Property PerkTier2 Auto
Perk Property PerkTier3 Auto
; Three sequential perks forming a linear branch; Tier2 requires Tier1, Tier3 requires Tier2

Perk Property PerkTier2Alt Auto
; Alternate branch perk that also requires Tier1, but is mutually exclusive with Tier2

Int Property SkillPoints = 0 Auto
; Currency spent to unlock perks in the tree

Int Property PointsPerLevel = 1 Auto
; How many skill points are granted each time the tracked skill increases

; --- Lifecycle ----------------------------------------------------------

Event OnInit()
    RegisterForModEvent("OnPlayerLevelIncrease", "OnLevelUp")
    Debug.Trace("SkillTreeSystem: initialized, listening for level increases")
EndEvent

Event OnLevelUp(String eventName, String strArg, Float numArg, Form sender)
    ; Fired via mod event whenever the player's overall level increases
    GrantSkillPoints(PointsPerLevel)
EndEvent

; --- Point Economy -------------------------------------------------------

Function GrantSkillPoints(Int amount)
    SkillPoints += amount
    Debug.Notification("You gained " + amount + " skill point(s).")
EndFunction

Bool Function CanAfford(Int cost)
    Return SkillPoints >= cost
EndFunction

; --- Perk Unlocking with Prerequisite Gating -----------------------------

Bool Function UnlockTier1(Int cost)
    If CanAfford(cost) && !PlayerRef.HasPerk(PerkTier1)
        PlayerRef.AddPerk(PerkTier1)
        SkillPoints -= cost
        Debug.Notification("Unlocked: " + PerkTier1.GetName())
        Return true
    EndIf
    Return false
EndFunction

Bool Function UnlockTier2(Int cost)
    ; Requires Tier1 already owned, and refuses if the alt branch was already taken
    If !PlayerRef.HasPerk(PerkTier1)
        Debug.Notification("Requires the previous perk in this branch.")
        Return false
    EndIf
    If PlayerRef.HasPerk(PerkTier2Alt)
        Debug.Notification("Already committed to the alternate branch.")
        Return false
    EndIf
    If CanAfford(cost) && !PlayerRef.HasPerk(PerkTier2)
        PlayerRef.AddPerk(PerkTier2)
        SkillPoints -= cost
        Debug.Notification("Unlocked: " + PerkTier2.GetName())
        Return true
    EndIf
    Return false
EndFunction

Bool Function UnlockTier2Alt(Int cost)
    If !PlayerRef.HasPerk(PerkTier1) || PlayerRef.HasPerk(PerkTier2)
        Return false
    EndIf
    If CanAfford(cost) && !PlayerRef.HasPerk(PerkTier2Alt)
        PlayerRef.AddPerk(PerkTier2Alt)
        SkillPoints -= cost
        Debug.Notification("Unlocked: " + PerkTier2Alt.GetName())
        Return true
    EndIf
    Return false
EndFunction

Bool Function UnlockTier3(Int cost)
    ; Capstone perk, only reachable through the main Tier2 branch
    If !PlayerRef.HasPerk(PerkTier2)
        Debug.Notification("Requires Tier 2 of the main branch.")
        Return false
    EndIf
    If CanAfford(cost) && !PlayerRef.HasPerk(PerkTier3)
        PlayerRef.AddPerk(PerkTier3)
        SkillPoints -= cost
        Debug.Notification("Unlocked capstone: " + PerkTier3.GetName())
        Return true
    EndIf
    Return false
EndFunction
