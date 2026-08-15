/*
 * ScripForge — Season Battle Pass & Challenges
 * Pack: Apex Legends Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Season-long progression system combining an XP-to-level curve, tiered rewards, and trackable daily/weekly challenges.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public struct TierReward
{
    public int level;
    public string rewardId;
    public bool isPremiumOnly;
}

[Serializable]
public class BattlePassChallenge
{
    public string challengeId;
    public string description;
    public int targetCount;
    public int currentCount;
    public int xpReward;
    public bool completed;
}

/// Drives season progression: XP accrual, level curve resolution, tier reward unlocks, and challenge tracking.
public class SeasonBattlePassChallenges : MonoBehaviour
{
    [Header("Level Curve")]
    [SerializeField] private int maxLevel = 100;
    [SerializeField] private float baseXpPerLevel = 1000f;
    [SerializeField] private float xpCurveGrowth = 1.03f; // Each level requires slightly more XP than the last.

    [Header("Rewards")]
    [SerializeField] private List<TierReward> tierRewards = new List<TierReward>();
    [SerializeField] private bool hasPremiumPass = false;

    [Header("Challenges")]
    [SerializeField] private List<BattlePassChallenge> activeChallenges = new List<BattlePassChallenge>();

    public int CurrentLevel { get; private set; } = 1;
    public float CurrentLevelXp { get; private set; }

    public event Action<int> OnLevelUp;
    public event Action<TierReward> OnRewardUnlocked;
    public event Action<BattlePassChallenge> OnChallengeProgress;
    public event Action<BattlePassChallenge> OnChallengeCompleted;

    /// XP required to go from `level` to `level + 1`, growing geometrically across the season.
    public float GetXpRequiredForLevel(int level)
    {
        return baseXpPerLevel * Mathf.Pow(xpCurveGrowth, level - 1);
    }

    /// Adds XP from any source (match completion, challenge reward, etc.) and resolves any resulting level-ups.
    public void AddXp(float amount)
    {
        if (CurrentLevel >= maxLevel) return;

        CurrentLevelXp += amount;

        while (CurrentLevel < maxLevel && CurrentLevelXp >= GetXpRequiredForLevel(CurrentLevel))
        {
            CurrentLevelXp -= GetXpRequiredForLevel(CurrentLevel);
            CurrentLevel++;
            OnLevelUp?.Invoke(CurrentLevel);
            UnlockRewardsForLevel(CurrentLevel);
        }
    }

    private void UnlockRewardsForLevel(int level)
    {
        foreach (var reward in tierRewards)
        {
            if (reward.level != level) continue;
            if (reward.isPremiumOnly && !hasPremiumPass) continue;

            OnRewardUnlocked?.Invoke(reward);
        }
    }

    /// Advances progress on a named challenge (e.g. "deal 500 damage"), granting XP and firing completion once the target is met.
    public void TrackChallengeProgress(string challengeId, int amount)
    {
        var challenge = activeChallenges.Find(c => c.challengeId == challengeId);
        if (challenge == null || challenge.completed) return;

        challenge.currentCount = Mathf.Min(challenge.targetCount, challenge.currentCount + amount);
        OnChallengeProgress?.Invoke(challenge);

        if (challenge.currentCount >= challenge.targetCount)
        {
            challenge.completed = true;
            OnChallengeCompleted?.Invoke(challenge);
            AddXp(challenge.xpReward);
        }
    }

    /// Replaces the daily/weekly challenge slate, e.g. when a new day rolls over.
    public void RefreshChallenges(List<BattlePassChallenge> newChallenges)
    {
        activeChallenges = newChallenges ?? new List<BattlePassChallenge>();
    }

    public IReadOnlyList<BattlePassChallenge> GetActiveChallenges() => activeChallenges.AsReadOnly();
}
