/*
 * ScripForge — Weapon Skin & Crate Unlock System
 * Pack: PUBG Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A crate-opening animation flow that yields cosmetic weapon skins from a weighted rarity table.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public enum SkinRarity { Common, Uncommon, Rare, Epic, Legendary }

[Serializable]
public class WeaponSkinDefinition
{
    public string skinId;
    public string displayName;
    public string weaponId;
    public SkinRarity rarity = SkinRarity.Common;
}

[Serializable]
public class RarityWeight
{
    public SkinRarity rarity;
    [Tooltip("Relative weight; does not need to sum to 100, only relative magnitude matters.")]
    public float weight = 1f;
}

/// Drives the crate-opening flow: plays a reveal animation, rolls a weighted rarity, then picks a
/// concrete skin of that rarity from the pool and grants it to the player's collection.
public class WeaponSkinCrateUnlockSystem : MonoBehaviour
{
    [Header("Crate Contents")]
    [SerializeField] private WeaponSkinDefinition[] skinPool;
    [SerializeField] private RarityWeight[] rarityWeights;

    [Header("Presentation Timing")]
    [SerializeField] private float spinDurationSeconds = 3.5f;
    [SerializeField] private float revealHoldSeconds = 1.5f;
    [Tooltip("Higher rarities get a longer spin as tension-building before the reveal.")]
    [SerializeField] private float legendarySpinBonusSeconds = 2f;

    [Header("Pity System")]
    [Tooltip("Crates opened without a Legendary before the odds are boosted on the next roll.")]
    [SerializeField] private int pityThreshold = 40;
    [SerializeField] private float pityWeightMultiplier = 6f;

    public event Action OnCrateSpinStarted;
    public event Action<WeaponSkinDefinition> OnCrateRevealed;
    public event Action<WeaponSkinDefinition> OnSkinGranted;

    private readonly HashSet<string> unlockedSkinIds = new HashSet<string>();
    private int cratesSinceLegendary;
    private bool isOpening;

    /// Kicks off the full open sequence: spin animation, rarity roll, skin selection, and grant.
    public void OpenCrate()
    {
        if (isOpening || skinPool == null || skinPool.Length == 0) return;
        StartCoroutine(RunOpenSequence());
    }

    private IEnumerator RunOpenSequence()
    {
        isOpening = true;
        OnCrateSpinStarted?.Invoke();

        SkinRarity rolledRarity = RollRarity();
        float spinTime = spinDurationSeconds + (rolledRarity == SkinRarity.Legendary ? legendarySpinBonusSeconds : 0f);
        yield return new WaitForSeconds(spinTime);

        WeaponSkinDefinition result = PickSkinOfRarity(rolledRarity);
        OnCrateRevealed?.Invoke(result);

        yield return new WaitForSeconds(revealHoldSeconds);

        GrantSkin(result);
        isOpening = false;
    }

    /// Weighted rarity roll with a pity counter that boosts Legendary odds after a long dry streak.
    private SkinRarity RollRarity()
    {
        List<(SkinRarity rarity, float weight)> effectiveWeights = new List<(SkinRarity, float)>();
        float total = 0f;

        foreach (RarityWeight entry in rarityWeights)
        {
            float weight = entry.weight;
            if (entry.rarity == SkinRarity.Legendary && cratesSinceLegendary >= pityThreshold)
            {
                weight *= pityWeightMultiplier;
            }
            effectiveWeights.Add((entry.rarity, weight));
            total += weight;
        }

        float roll = UnityEngine.Random.value * total;
        float cumulative = 0f;
        SkinRarity chosen = SkinRarity.Common;

        foreach (var entry in effectiveWeights)
        {
            cumulative += entry.weight;
            if (roll <= cumulative)
            {
                chosen = entry.rarity;
                break;
            }
        }

        cratesSinceLegendary = chosen == SkinRarity.Legendary ? 0 : cratesSinceLegendary + 1;
        return chosen;
    }

    /// Picks a random skin matching the rolled rarity, preferring ones the player doesn't already own.
    private WeaponSkinDefinition PickSkinOfRarity(SkinRarity rarity)
    {
        List<WeaponSkinDefinition> matching = new List<WeaponSkinDefinition>();
        List<WeaponSkinDefinition> matchingUnowned = new List<WeaponSkinDefinition>();

        foreach (WeaponSkinDefinition skin in skinPool)
        {
            if (skin.rarity != rarity) continue;
            matching.Add(skin);
            if (!unlockedSkinIds.Contains(skin.skinId)) matchingUnowned.Add(skin);
        }

        List<WeaponSkinDefinition> pool = matchingUnowned.Count > 0 ? matchingUnowned : matching;
        if (pool.Count == 0) return null;

        return pool[UnityEngine.Random.Range(0, pool.Count)];
    }

    private void GrantSkin(WeaponSkinDefinition skin)
    {
        if (skin == null) return;
        unlockedSkinIds.Add(skin.skinId);
        OnSkinGranted?.Invoke(skin);
    }

    public bool IsUnlocked(string skinId) => unlockedSkinIds.Contains(skinId);
    public bool IsOpening01 => isOpening;
}
