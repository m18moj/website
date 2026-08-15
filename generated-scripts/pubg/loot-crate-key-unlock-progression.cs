/*
 * ScripForge — Loot Crate Key & Unlock Progression
 * Pack: PUBG Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A weighted crate-opening system with key currency, a pity-timer for rare drops, and an unlock history log.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public enum CrateRewardRarity { Common, Uncommon, Rare, Epic, Legendary }

[Serializable]
public class CrateRewardDefinition
{
    public string rewardId;
    public string displayName;
    public CrateRewardRarity rarity = CrateRewardRarity.Common;
}

[Serializable]
public class CrateRarityWeight
{
    public CrateRewardRarity rarity;
    [Tooltip("Relative weight; only magnitude relative to other entries matters.")]
    public float weight = 1f;
}

[Serializable]
public struct UnlockHistoryEntry
{
    public string rewardId;
    public string displayName;
    public CrateRewardRarity rarity;
    public DateTime unlockedAtUtc;
}

/// Drives a key-gated crate economy: spending a key rolls a weighted rarity, grants a concrete reward
/// of that rarity, logs the unlock to a history list, and escalates rare-drop odds via a pity counter
/// whenever a long dry streak occurs without hitting the top rarity tier.
public class LootCrateKeyUnlockProgression : MonoBehaviour
{
    [Header("Crate Contents")]
    [SerializeField] private CrateRewardDefinition[] rewardPool;
    [SerializeField] private CrateRarityWeight[] rarityWeights;

    [Header("Key Currency")]
    [SerializeField] private int startingKeys = 1;
    [SerializeField] private int maxStoredKeys = 20;

    [Header("Pity System")]
    [Tooltip("Crates opened without a Legendary before the odds are boosted on the next roll.")]
    [SerializeField] private int legendaryPityThreshold = 30;
    [SerializeField] private float legendaryPityWeightMultiplier = 8f;

    [Header("History")]
    [SerializeField] private int maxHistoryEntries = 100;

    public int KeysAvailable { get; private set; }
    public bool IsOpening { get; private set; }

    public event Action<int> OnKeysChanged;
    public event Action OnCrateSpinStarted;
    public event Action<CrateRewardDefinition> OnCrateOpened;
    public event Action<UnlockHistoryEntry> OnHistoryEntryAdded;

    private readonly List<UnlockHistoryEntry> unlockHistory = new List<UnlockHistoryEntry>();
    private readonly HashSet<string> ownedRewardIds = new HashSet<string>();
    private int cratesSinceLegendary;

    private void Awake()
    {
        KeysAvailable = startingKeys;
    }

    /// Adds keys to the player's balance, e.g. from a match reward or store purchase.
    public void AddKeys(int amount)
    {
        if (amount <= 0) return;
        KeysAvailable = Mathf.Min(maxStoredKeys, KeysAvailable + amount);
        OnKeysChanged?.Invoke(KeysAvailable);
    }

    /// Spends one key and opens a crate if the player has a key available and isn't mid-open.
    public bool TryOpenCrate()
    {
        if (IsOpening || KeysAvailable <= 0 || rewardPool == null || rewardPool.Length == 0) return false;

        KeysAvailable--;
        OnKeysChanged?.Invoke(KeysAvailable);
        StartCoroutine(RunOpenSequence());
        return true;
    }

    private IEnumerator RunOpenSequence()
    {
        IsOpening = true;
        OnCrateSpinStarted?.Invoke();

        CrateRewardRarity rolledRarity = RollRarity();
        yield return new WaitForSeconds(1.5f);

        CrateRewardDefinition result = PickRewardOfRarity(rolledRarity);
        GrantReward(result);

        IsOpening = false;
    }

    /// Weighted rarity roll. Legendary weight is boosted once the dry streak crosses the pity threshold.
    private CrateRewardRarity RollRarity()
    {
        List<(CrateRewardRarity rarity, float weight)> effective = new List<(CrateRewardRarity, float)>();
        float total = 0f;

        foreach (CrateRarityWeight entry in rarityWeights)
        {
            float weight = entry.weight;
            if (entry.rarity == CrateRewardRarity.Legendary && cratesSinceLegendary >= legendaryPityThreshold)
            {
                weight *= legendaryPityWeightMultiplier;
            }
            effective.Add((entry.rarity, weight));
            total += weight;
        }

        float roll = UnityEngine.Random.value * total;
        float cumulative = 0f;
        CrateRewardRarity chosen = CrateRewardRarity.Common;

        foreach (var entry in effective)
        {
            cumulative += entry.weight;
            if (roll <= cumulative)
            {
                chosen = entry.rarity;
                break;
            }
        }

        cratesSinceLegendary = chosen == CrateRewardRarity.Legendary ? 0 : cratesSinceLegendary + 1;
        return chosen;
    }

    /// Picks a reward matching the rolled rarity, preferring ones the player doesn't already own.
    private CrateRewardDefinition PickRewardOfRarity(CrateRewardRarity rarity)
    {
        List<CrateRewardDefinition> matching = new List<CrateRewardDefinition>();
        List<CrateRewardDefinition> matchingUnowned = new List<CrateRewardDefinition>();

        foreach (CrateRewardDefinition reward in rewardPool)
        {
            if (reward.rarity != rarity) continue;
            matching.Add(reward);
            if (!ownedRewardIds.Contains(reward.rewardId)) matchingUnowned.Add(reward);
        }

        List<CrateRewardDefinition> pool = matchingUnowned.Count > 0 ? matchingUnowned : matching;
        if (pool.Count == 0) return null;

        return pool[UnityEngine.Random.Range(0, pool.Count)];
    }

    private void GrantReward(CrateRewardDefinition reward)
    {
        if (reward == null) return;

        ownedRewardIds.Add(reward.rewardId);
        OnCrateOpened?.Invoke(reward);

        UnlockHistoryEntry entry = new UnlockHistoryEntry
        {
            rewardId = reward.rewardId,
            displayName = reward.displayName,
            rarity = reward.rarity,
            unlockedAtUtc = DateTime.UtcNow
        };

        unlockHistory.Add(entry);
        if (unlockHistory.Count > maxHistoryEntries)
        {
            unlockHistory.RemoveAt(0);
        }

        OnHistoryEntryAdded?.Invoke(entry);
    }

    public bool IsOwned(string rewardId) => ownedRewardIds.Contains(rewardId);
    public IReadOnlyList<UnlockHistoryEntry> GetUnlockHistory() => unlockHistory;
    public int CratesSinceLastLegendary => cratesSinceLegendary;
}
