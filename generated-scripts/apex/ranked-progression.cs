/*
 * ScripForge — Ranked Ladder & RP Calculator
 * Pack: Apex Legends Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Placement-based RP gain/loss curves with demotion protection.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum RankTier { Bronze, Silver, Gold, Platinum, Diamond, Master, Apex }

[Serializable]
public struct RankThreshold
{
    public RankTier tier;
    public int rpRequired; // Cumulative RP needed to enter this tier.
    public int divisionsInTier; // e.g. IV..I
}

public class RankedLadderCalculator : MonoBehaviour
{
    [Header("Ladder Thresholds (ascending order)")]
    [SerializeField] private List<RankThreshold> thresholds = new List<RankThreshold>
    {
        new RankThreshold { tier = RankTier.Bronze,   rpRequired = 0,    divisionsInTier = 4 },
        new RankThreshold { tier = RankTier.Silver,   rpRequired = 400,  divisionsInTier = 4 },
        new RankThreshold { tier = RankTier.Gold,     rpRequired = 1000, divisionsInTier = 4 },
        new RankThreshold { tier = RankTier.Platinum, rpRequired = 1800, divisionsInTier = 4 },
        new RankThreshold { tier = RankTier.Diamond,  rpRequired = 2800, divisionsInTier = 4 },
        new RankThreshold { tier = RankTier.Master,   rpRequired = 4000, divisionsInTier = 1 },
        new RankThreshold { tier = RankTier.Apex,     rpRequired = 5000, divisionsInTier = 1 },
    };

    [Header("Placement RP Curve (index 0 = 1st place)")]
    [SerializeField] private int[] placementRpByRank = new int[]
    {
        100, 60, 40, 30, 20, 15, 10, 5, 0, 0, -10, -10, -15, -15, -20, -20, -20, -25, -25, -25
    };

    [Header("Kill/Elim RP")]
    [SerializeField] private int rpPerElimination = 2;
    [SerializeField] private int maxElimRpPerMatch = 10;

    [Header("Demotion Protection")]
    [Tooltip("RP buffer below a tier's threshold before the player is actually demoted.")]
    [SerializeField] private int demotionBufferRp = 50;

    public int CurrentRp { get; private set; }
    public event Action<int> OnRpChanged;
    public event Action<RankTier> OnTierChanged;
    public event Action OnDemotionPrevented;

    private RankTier lastKnownTier;

    private void Awake()
    {
        lastKnownTier = GetTierForRp(CurrentRp);
    }

    /// Computes total RP delta for a finished match and applies it, respecting demotion protection.
    public int ApplyMatchResult(int placement, int eliminationCount)
    {
        int placementRp = GetPlacementRp(placement);
        int elimRp = Mathf.Min(eliminationCount * rpPerElimination, maxElimRpPerMatch);
        int totalDelta = placementRp + elimRp;

        int proposedRp = CurrentRp + totalDelta;

        if (totalDelta < 0 && WouldDemote(proposedRp))
        {
            int floorRp = GetTierFloorWithBuffer(lastKnownTier);
            if (CurrentRp <= floorRp)
            {
                // Already sitting at the protected floor — block further loss this match.
                proposedRp = CurrentRp;
                OnDemotionPrevented?.Invoke();
            }
        }

        CurrentRp = Mathf.Max(0, proposedRp);
        OnRpChanged?.Invoke(CurrentRp);

        RankTier newTier = GetTierForRp(CurrentRp);
        if (newTier != lastKnownTier)
        {
            lastKnownTier = newTier;
            OnTierChanged?.Invoke(newTier);
        }

        return totalDelta;
    }

    private int GetPlacementRp(int placement)
    {
        int index = Mathf.Clamp(placement - 1, 0, placementRpByRank.Length - 1);
        return placementRpByRank[index];
    }

    private bool WouldDemote(int proposedRp)
    {
        return GetTierForRp(proposedRp) < lastKnownTier;
    }

    private int GetTierFloorWithBuffer(RankTier tier)
    {
        foreach (var t in thresholds)
        {
            if (t.tier == tier) return t.rpRequired - demotionBufferRp;
        }
        return 0;
    }

    public RankTier GetTierForRp(int rp)
    {
        RankTier resolved = thresholds[0].tier;
        foreach (var t in thresholds)
        {
            if (rp >= t.rpRequired) resolved = t.tier;
        }
        return resolved;
    }
}
