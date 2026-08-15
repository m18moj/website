/*
 * ScripForge — Death Box & Loot Roll System
 * Pack: Apex Legends Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Death-box spawning with weighted loot table rolls by rarity and auto-stack pickup.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum LootRarity { Common, Rare, Epic, Legendary }

[Serializable]
public class LootEntry
{
    public string itemId;
    public LootRarity rarity;
    public int minStack = 1;
    public int maxStack = 1;
    [Tooltip("Relative weight within its rarity bucket — higher rolls more often.")]
    public float weight = 1f;
}

[Serializable]
public class RarityWeight
{
    public LootRarity rarity;
    [Tooltip("Chance this rarity bucket is chosen for a single loot roll.")]
    public float rollWeight = 1f;
}

public class DeathBoxLootSystem : MonoBehaviour
{
    [Header("Loot Table")]
    [SerializeField] private List<LootEntry> lootTable = new List<LootEntry>();
    [SerializeField] private List<RarityWeight> rarityWeights = new List<RarityWeight>();

    [Header("Death Box")]
    [SerializeField] private GameObject deathBoxPrefab;
    [SerializeField] private int rollsPerBox = 6;
    [SerializeField] private float pickupRadius = 1.5f;

    private readonly Dictionary<string, int> autoStackInventory = new Dictionary<string, int>();
    public event Action<string, int> OnItemAutoStacked;

    /// Spawns a death box at the given position and fills it with rolled loot.
    public GameObject SpawnDeathBox(Vector3 position, Quaternion rotation)
    {
        GameObject box = Instantiate(deathBoxPrefab, position, rotation);
        List<LootEntry> rolledLoot = RollLoot(rollsPerBox);

        var container = box.GetComponent<LootContainer>();
        if (container != null)
        {
            container.Populate(rolledLoot);
        }
        return box;
    }

    /// Rolls a batch of loot entries weighted first by rarity bucket, then by item weight inside it.
    public List<LootEntry> RollLoot(int rollCount)
    {
        var results = new List<LootEntry>();
        for (int i = 0; i < rollCount; i++)
        {
            LootRarity rarity = RollRarity();
            LootEntry entry = RollEntryFromRarity(rarity);
            if (entry != null)
            {
                results.Add(entry);
            }
        }
        return results;
    }

    private LootRarity RollRarity()
    {
        float total = 0f;
        foreach (var rw in rarityWeights) total += rw.rollWeight;

        float roll = UnityEngine.Random.value * total;
        float cumulative = 0f;
        foreach (var rw in rarityWeights)
        {
            cumulative += rw.rollWeight;
            if (roll <= cumulative) return rw.rarity;
        }
        return LootRarity.Common;
    }

    private LootEntry RollEntryFromRarity(LootRarity rarity)
    {
        List<LootEntry> candidates = lootTable.FindAll(e => e.rarity == rarity);
        if (candidates.Count == 0) return null;

        float total = 0f;
        foreach (var c in candidates) total += c.weight;

        float roll = UnityEngine.Random.value * total;
        float cumulative = 0f;
        foreach (var c in candidates)
        {
            cumulative += c.weight;
            if (roll <= cumulative) return c;
        }
        return candidates[candidates.Count - 1];
    }

    /// Picks up an item, stacking it automatically into existing inventory slots of the same type.
    public void PickupItem(string itemId, int quantity)
    {
        if (!autoStackInventory.ContainsKey(itemId))
        {
            autoStackInventory[itemId] = 0;
        }
        autoStackInventory[itemId] += quantity;
        OnItemAutoStacked?.Invoke(itemId, autoStackInventory[itemId]);
    }

    public int GetStackCount(string itemId)
    {
        return autoStackInventory.TryGetValue(itemId, out int count) ? count : 0;
    }
}

/// Minimal loot container component expected on the death box prefab.
public class LootContainer : MonoBehaviour
{
    private readonly List<LootEntry> storedLoot = new List<LootEntry>();

    public void Populate(List<LootEntry> loot)
    {
        storedLoot.Clear();
        storedLoot.AddRange(loot);
    }

    public IReadOnlyList<LootEntry> GetContents() => storedLoot;
}
