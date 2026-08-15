/*
 * ScripForge — Ranked MMR & Tier System
 * Pack: PUBG Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Placement-based MMR gain/loss calculation with tiered ranks and promotion/demotion protection.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using UnityEngine;

[Serializable]
public class RankTierDefinition
{
    public string tierName;
    public int minMMR;
    [Tooltip("Divisions within a tier, e.g. Gold IV to Gold I. Set to 1 for no sub-divisions.")]
    public int divisions = 5;
}

/// Plain C# progression model for a competitive MMR ladder; not tied to any rendering or UI directly.
[Serializable]
public class RankedMmrTierSystem
{
    [Header("Tiers (ordered lowest to highest by minMMR)")]
    [SerializeField] private RankTierDefinition[] tiers;

    [Header("MMR Curve")]
    [SerializeField] private int baseGainPerMatch = 22;
    [SerializeField] private int baseLossPerMatch = 18;
    [Tooltip("Better placement (lower number = better) scales gain up and loss down.")]
    [SerializeField] private int totalLobbySize = 64;

    [Header("Protection")]
    [Tooltip("Matches after a promotion during which demotion below the new tier's floor is blocked.")]
    [SerializeField] private int demotionProtectionMatches = 3;

    public int CurrentMMR { get; private set; } = 1000;
    private int matchesSincePromotion = int.MaxValue;
    private string lastTierName;

    public event Action<int, int> OnMmrChanged;      // previous, current
    public event Action<string> OnPromoted;
    public event Action<string> OnDemoted;

    public RankedMmrTierSystem(int startingMMR)
    {
        CurrentMMR = startingMMR;
    }

    /// Feeds a completed match's placement (1 = winner) into the MMR calculation and applies rank changes.
    public void ReportMatchResult(int placement, int kills)
    {
        int previousMMR = CurrentMMR;
        string previousTier = GetTierForMMR(CurrentMMR)?.tierName;

        int delta = CalculateDelta(placement, kills);
        int protectedFloor = matchesSincePromotion < demotionProtectionMatches
            ? GetTierForMMR(previousMMR)?.minMMR ?? 0
            : int.MinValue;

        CurrentMMR = Mathf.Max(0, CurrentMMR + delta);
        if (delta < 0 && protectedFloor > int.MinValue)
        {
            CurrentMMR = Mathf.Max(CurrentMMR, protectedFloor);
        }

        matchesSincePromotion++;
        OnMmrChanged?.Invoke(previousMMR, CurrentMMR);

        string currentTier = GetTierForMMR(CurrentMMR)?.tierName;
        HandleTierTransition(previousTier, currentTier);
    }

    /// Weighted placement/kill formula: top placements and higher kill counts push gain up and loss toward zero.
    private int CalculateDelta(int placement, int kills)
    {
        float placementFactor = 1f - Mathf.Clamp01((placement - 1) / (float)Mathf.Max(1, totalLobbySize - 1));
        int killBonus = Mathf.Min(kills, 6) * 2;

        if (placement <= Mathf.Max(1, totalLobbySize / 4))
        {
            // Top-quartile finish: net positive, scaled by how close to #1.
            return Mathf.RoundToInt(baseGainPerMatch * (0.4f + placementFactor)) + killBonus;
        }

        // Bottom three-quarters: net negative, softened by kill participation.
        float lossScale = 0.4f + (1f - placementFactor);
        return -Mathf.RoundToInt(baseLossPerMatch * lossScale) + Mathf.Min(killBonus, baseLossPerMatch / 2);
    }

    private void HandleTierTransition(string previousTier, string currentTier)
    {
        if (currentTier == null || currentTier == previousTier) return;

        int previousIndex = Array.FindIndex(tiers, t => t.tierName == previousTier);
        int currentIndex = Array.FindIndex(tiers, t => t.tierName == currentTier);

        if (currentIndex > previousIndex)
        {
            matchesSincePromotion = 0;
            OnPromoted?.Invoke(currentTier);
        }
        else if (currentIndex < previousIndex)
        {
            OnDemoted?.Invoke(currentTier);
        }
    }

    public RankTierDefinition GetTierForMMR(int mmr)
    {
        RankTierDefinition result = null;
        foreach (RankTierDefinition tier in tiers)
        {
            if (mmr >= tier.minMMR) result = tier;
        }
        return result;
    }

    public RankTierDefinition CurrentTier => GetTierForMMR(CurrentMMR);
}
