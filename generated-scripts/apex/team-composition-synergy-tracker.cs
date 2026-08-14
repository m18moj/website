/*
 * ScriptForge — Team Composition Synergy Tracker
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks the class makeup of a squad's legend picks and surfaces synergy bonuses when complementary roles are combined.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

public enum LegendClass { Offensive, Defensive, Support, Recon, Skirmisher, Controller }

[Serializable]
public struct SquadPick
{
    public string playerId;
    public string legendId;
    public LegendClass legendClass;
}

[Serializable]
public struct SynergyRule
{
    public string synergyName;
    public LegendClass classA;
    public LegendClass classB;
    [TextArea] public string description;
    public float statMultiplierBonus; // Example payload: e.g. +0.1 = 10% bonus to some shared stat.
}

/// Watches the squad's current legend picks and evaluates which class-pairing synergy bonuses are currently active.
public class TeamCompositionSynergyTracker : MonoBehaviour
{
    [SerializeField] private SynergyRule[] synergyRules = new SynergyRule[]
    {
        new SynergyRule { synergyName = "Vanguard Push", classA = LegendClass.Offensive, classB = LegendClass.Controller,
            description = "Offense + Controller: bonus grenade capacity for both.", statMultiplierBonus = 0.1f },
        new SynergyRule { synergyName = "Field Medic Line", classA = LegendClass.Support, classB = LegendClass.Defensive,
            description = "Support + Defensive: faster shield regen near each other.", statMultiplierBonus = 0.15f },
        new SynergyRule { synergyName = "Scout Formation", classA = LegendClass.Recon, classB = LegendClass.Skirmisher,
            description = "Recon + Skirmisher: shared minimap reveal duration extended.", statMultiplierBonus = 0.2f },
    };

    private readonly List<SquadPick> squadPicks = new List<SquadPick>();

    public event Action<List<SynergyRule>> OnSynergiesChanged;

    public IReadOnlyList<SquadPick> CurrentPicks => squadPicks.AsReadOnly();

    /// Registers or updates a player's legend pick as the squad forms during draft.
    public void SetPick(string playerId, string legendId, LegendClass legendClass)
    {
        int index = squadPicks.FindIndex(p => p.playerId == playerId);
        var pick = new SquadPick { playerId = playerId, legendId = legendId, legendClass = legendClass };

        if (index >= 0) squadPicks[index] = pick;
        else squadPicks.Add(pick);

        BroadcastSynergies();
    }

    public void RemovePick(string playerId)
    {
        squadPicks.RemoveAll(p => p.playerId == playerId);
        BroadcastSynergies();
    }

    /// Cross-references the current class set against every synergy rule and returns the ones fully satisfied.
    public List<SynergyRule> EvaluateSynergies()
    {
        var presentClasses = new HashSet<LegendClass>(squadPicks.Select(p => p.legendClass));
        var active = new List<SynergyRule>();

        foreach (var rule in synergyRules)
        {
            if (presentClasses.Contains(rule.classA) && presentClasses.Contains(rule.classB))
            {
                active.Add(rule);
            }
        }

        return active;
    }

    private void BroadcastSynergies()
    {
        OnSynergiesChanged?.Invoke(EvaluateSynergies());
    }

    /// Returns how many distinct classes are represented — useful for a simple "balanced squad" indicator.
    public int GetClassDiversityCount()
    {
        return squadPicks.Select(p => p.legendClass).Distinct().Count();
    }

    public void ResetSquad()
    {
        squadPicks.Clear();
        BroadcastSynergies();
    }
}
