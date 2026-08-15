/*
 * ScripForge — Loot Spawn & Airdrop Tables
 * Pack: PUBG Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Builds building and airdrop loot tables weighted by rarity tier, with extra hot-drop-zone weighting.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum LootTier { Common, Uncommon, Rare, Epic, Legendary }

[Serializable]
public class LootEntry
{
    public string itemId;
    public LootTier tier;
    public float baseWeight = 1f;
    public int minStack = 1;
    public int maxStack = 1;
}

/// A named group of loot entries, e.g. "Residential", "Military", "Airdrop".
[Serializable]
public class LootTable
{
    public string tableName;
    public List<LootEntry> entries = new List<LootEntry>();
}

public class LootSpawnManager : MonoBehaviour
{
    [Header("Loot Tables")]
    [SerializeField] private LootTable buildingCommonTable;
    [SerializeField] private LootTable buildingMilitaryTable;
    [SerializeField] private LootTable airdropTable;

    [Header("Tier Weight Multipliers")]
    [Tooltip("Global multiplier applied per tier before hot-drop scaling.")]
    [SerializeField]
    private float[] tierWeightMultipliers =
    {
        1.0f,  // Common
        0.6f,  // Uncommon
        0.3f,  // Rare
        0.12f, // Epic
        0.04f  // Legendary
    };

    [Header("Hot Drop Zones")]
    [Tooltip("Multiplies rare-and-above weights when spawning inside a designated hot-drop building.")]
    [SerializeField] private float hotDropRareMultiplier = 3f;

    private readonly System.Random rng = new System.Random();

    /// Rolls a single item from the given table. Set isHotDrop to boost rare+ chances near named hot zones.
    public LootEntry RollItem(LootTable table, bool isHotDrop = false)
    {
        if (table == null || table.entries.Count == 0) return null;

        float totalWeight = 0f;
        var effectiveWeights = new float[table.entries.Count];

        for (int i = 0; i < table.entries.Count; i++)
        {
            LootEntry entry = table.entries[i];
            float weight = entry.baseWeight * tierWeightMultipliers[(int)entry.tier];

            if (isHotDrop && entry.tier >= LootTier.Rare)
            {
                weight *= hotDropRareMultiplier;
            }

            effectiveWeights[i] = weight;
            totalWeight += weight;
        }

        double roll = rng.NextDouble() * totalWeight;
        double cumulative = 0f;

        for (int i = 0; i < table.entries.Count; i++)
        {
            cumulative += effectiveWeights[i];
            if (roll <= cumulative)
            {
                return table.entries[i];
            }
        }

        return table.entries[table.entries.Count - 1];
    }

    /// Spawns a batch of loot into a building, mixing common household loot with a chance of military-grade loot.
    public List<LootEntry> RollBuildingLoot(int itemCount, float militaryChance, bool isHotDrop)
    {
        var results = new List<LootEntry>(itemCount);
        for (int i = 0; i < itemCount; i++)
        {
            bool useMilitary = rng.NextDouble() < militaryChance && buildingMilitaryTable != null;
            LootEntry entry = RollItem(useMilitary ? buildingMilitaryTable : buildingCommonTable, isHotDrop);
            if (entry != null) results.Add(entry);
        }
        return results;
    }

    /// Rolls the fixed high-value loadout for an airdrop crate — always weighted toward top tiers.
    public List<LootEntry> RollAirdropLoot(int itemCount)
    {
        var results = new List<LootEntry>(itemCount);
        for (int i = 0; i < itemCount; i++)
        {
            LootEntry entry = RollItem(airdropTable, isHotDrop: true);
            if (entry != null) results.Add(entry);
        }
        return results;
    }

    /// Rolls a stack size for the given entry, using its configured min/max range.
    public int RollStackSize(LootEntry entry)
    {
        if (entry == null) return 0;
        return UnityEngine.Random.Range(entry.minStack, entry.maxStack + 1);
    }
}
