/*
 * ScriptForge — Loot Pool & Rarity Weighting
 * Pack: Fortnite Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Weighted-random loot table for chest and floor-loot spawns, with per-rarity roll curves.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Fortnite.Loot
{
    public enum Rarity { Common, Uncommon, Rare, Epic, Legendary }

    [Serializable]
    public class LootEntry
    {
        public string ItemId;
        public Rarity Rarity;
        public GameObject Prefab;
        [Tooltip("Base weight before rarity multiplier is applied.")]
        public float BaseWeight = 1f;
    }

    [Serializable]
    public class RarityWeight
    {
        public Rarity Rarity;
        [Range(0f, 100f)] public float Multiplier = 1f;
    }

    public class LootRarityEngine : MonoBehaviour
    {
        [Header("Loot Table")]
        [SerializeField] private List<LootEntry> _lootTable = new List<LootEntry>();
        [SerializeField] private List<RarityWeight> _rarityWeights = new List<RarityWeight>();

        [Header("Spawn Behaviour")]
        [SerializeField] private int _chestItemCount = 3;
        [SerializeField] private bool _allowDuplicates = false;

        private readonly Dictionary<Rarity, float> _rarityLookup = new Dictionary<Rarity, float>();

        private void Awake()
        {
            BuildRarityLookup();
        }

        private void BuildRarityLookup()
        {
            _rarityLookup.Clear();
            foreach (RarityWeight rw in _rarityWeights)
            {
                _rarityLookup[rw.Rarity] = rw.Multiplier;
            }
        }

        // Rolls loot for a chest, spawning _chestItemCount items at the given points.
        public List<GameObject> RollChestLoot(Transform[] spawnPoints)
        {
            var spawned = new List<GameObject>();
            var pool = new List<LootEntry>(_lootTable);

            int rolls = Mathf.Min(_chestItemCount, spawnPoints.Length);
            for (int i = 0; i < rolls; i++)
            {
                LootEntry entry = RollWeightedEntry(pool);
                if (entry == null) break;

                GameObject spawned_go = Instantiate(entry.Prefab, spawnPoints[i].position, spawnPoints[i].rotation);
                spawned.Add(spawned_go);

                if (!_allowDuplicates)
                {
                    pool.Remove(entry);
                }
            }

            return spawned;
        }

        // Rolls a single floor-loot item at a world position (used for open-world pickups).
        public GameObject RollFloorLoot(Vector3 position)
        {
            LootEntry entry = RollWeightedEntry(_lootTable);
            return entry == null ? null : Instantiate(entry.Prefab, position, Quaternion.identity);
        }

        // Weighted random selection: effective weight = baseWeight * rarityMultiplier.
        private LootEntry RollWeightedEntry(List<LootEntry> pool)
        {
            if (pool.Count == 0) return null;

            float totalWeight = 0f;
            foreach (LootEntry entry in pool)
            {
                totalWeight += GetEffectiveWeight(entry);
            }

            if (totalWeight <= 0f) return null;

            float roll = UnityEngine.Random.Range(0f, totalWeight);
            float cumulative = 0f;

            foreach (LootEntry entry in pool)
            {
                cumulative += GetEffectiveWeight(entry);
                if (roll <= cumulative)
                {
                    return entry;
                }
            }

            return pool[pool.Count - 1];
        }

        private float GetEffectiveWeight(LootEntry entry)
        {
            float multiplier = _rarityLookup.TryGetValue(entry.Rarity, out float m) ? m : 1f;
            return entry.BaseWeight * multiplier;
        }

        // Utility for late-game "bloom" tuning: shifts the whole table toward higher rarities.
        public void ApplyLateGameRarityBoost(float boostFactor)
        {
            foreach (RarityWeight rw in _rarityWeights)
            {
                if (rw.Rarity == Rarity.Epic || rw.Rarity == Rarity.Legendary)
                {
                    rw.Multiplier *= boostFactor;
                }
            }
            BuildRarityLookup();
        }
    }
}
