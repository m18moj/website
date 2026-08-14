/*
 * ScriptForge — Legend Perk & Passive Tree
 * Pack: Apex Legends Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Class-based passive perks with unlockable perk tiers.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum CharacterClass { Assault, Skirmisher, Recon, Support, Controller }

[Serializable]
public class PerkDefinition
{
    public string perkId;
    public string displayName;
    public int tier = 1; // 1 = earliest unlock, higher = later tiers.
    public CharacterClass requiredClass;
    public int requiredLevel = 1;
    [TextArea] public string description;
}

[Serializable]
public class PerkTreeState
{
    public CharacterClass characterClass;
    public List<string> unlockedPerkIds = new List<string>();
}

public class LegendPerkPassiveTree : MonoBehaviour
{
    [SerializeField] private CharacterClass activeClass;
    [SerializeField] private List<PerkDefinition> perkPool = new List<PerkDefinition>();
    [SerializeField] private int currentLevel = 1;

    private readonly HashSet<string> unlockedPerks = new HashSet<string>();

    public event Action<PerkDefinition> OnPerkUnlocked;
    public event Action<int> OnLevelChanged;

    public CharacterClass ActiveClass => activeClass;
    public int CurrentLevel => currentLevel;

    /// Returns all perks valid for the active class, grouped implicitly by tier via the caller's sort.
    public List<PerkDefinition> GetAvailablePerksForClass()
    {
        return perkPool.FindAll(p => p.requiredClass == activeClass);
    }

    /// Returns perks the player can unlock right now: correct class, level met, not already owned,
    /// and every perk in the previous tier for this class already unlocked (linear tier gating).
    public List<PerkDefinition> GetUnlockablePerks()
    {
        var unlockable = new List<PerkDefinition>();
        var classPerks = GetAvailablePerksForClass();

        foreach (var perk in classPerks)
        {
            if (unlockedPerks.Contains(perk.perkId)) continue;
            if (currentLevel < perk.requiredLevel) continue;
            if (!PreviousTierComplete(classPerks, perk.tier)) continue;

            unlockable.Add(perk);
        }
        return unlockable;
    }

    private bool PreviousTierComplete(List<PerkDefinition> classPerks, int tier)
    {
        if (tier <= 1) return true;

        foreach (var perk in classPerks)
        {
            if (perk.tier == tier - 1 && !unlockedPerks.Contains(perk.perkId))
            {
                return false;
            }
        }
        return true;
    }

    /// Attempts to unlock a specific perk by id, validating all gating rules first.
    public bool TryUnlockPerk(string perkId)
    {
        var perk = perkPool.Find(p => p.perkId == perkId);
        if (perk == null || perk.requiredClass != activeClass) return false;
        if (unlockedPerks.Contains(perkId)) return false;
        if (currentLevel < perk.requiredLevel) return false;
        if (!PreviousTierComplete(GetAvailablePerksForClass(), perk.tier)) return false;

        unlockedPerks.Add(perkId);
        OnPerkUnlocked?.Invoke(perk);
        return true;
    }

    public bool IsPerkUnlocked(string perkId) => unlockedPerks.Contains(perkId);

    /// Raises the player's level, which may open up new tiers via GetUnlockablePerks.
    public void GrantLevel(int levels = 1)
    {
        currentLevel += levels;
        OnLevelChanged?.Invoke(currentLevel);
    }

    /// Switches active class; perks unlocked for other classes remain saved but inactive.
    public void SwitchClass(CharacterClass newClass)
    {
        activeClass = newClass;
    }

    public PerkTreeState ExportState()
    {
        return new PerkTreeState
        {
            characterClass = activeClass,
            unlockedPerkIds = new List<string>(unlockedPerks)
        };
    }

    public void ImportState(PerkTreeState state)
    {
        activeClass = state.characterClass;
        unlockedPerks.Clear();
        foreach (var id in state.unlockedPerkIds)
        {
            unlockedPerks.Add(id);
        }
    }
}
