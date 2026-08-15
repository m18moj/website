/*
 * ScripForge — Competitive Act Rank Rewards
 * Pack: Valorant Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * End-of-act rank-tier reward unlocks with a rank-badge display and act-reset RR carryover curve.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Valorant.Progression
{
    public enum ActRankTier
    {
        Iron,
        Bronze,
        Silver,
        Gold,
        Platinum,
        Diamond,
        Ascendant,
        Immortal,
        Radiant
    }

    [Serializable]
    public class ActRewardDefinition
    {
        public ActRankTier minimumTier;
        public string rewardId;
        public string displayName;
        [Tooltip("If true, only the single highest-tier reward the player qualifies for is granted.")]
        public bool exclusiveWithLowerTiers = true;
    }

    [Serializable]
    public class ActResetResult
    {
        public ActRankTier peakTier;
        public ActRankTier carryOverTier;
        public int carryOverRatingPoints;
        public List<string> unlockedRewardIds = new List<string>();
    }

    /// <summary>
    /// Tracks a player's peak rank across an act and, on act reset, grants tier-based
    /// cosmetic/reward unlocks and computes the soft-reset carryover rank used to seed
    /// the next act (a compressed version of the peak, not a full reset to the bottom).
    /// </summary>
    public class CompetitiveActRankRewards : MonoBehaviour
    {
        [Header("Reward Table")]
        [SerializeField] private List<ActRewardDefinition> rewardTable = new List<ActRewardDefinition>();

        [Header("Rank Badge Display")]
        [SerializeField] private GameObject rankBadgeRoot;
        [SerializeField] private UnityEngine.UI.Text badgeTierLabel;

        [Header("Carryover Tuning")]
        [Tooltip("How many tiers below the act's peak the player is dropped to at act reset.")]
        [SerializeField] private int carryOverTierDrop = 2;
        [SerializeField] private int carryOverRatingBase = 30;

        public ActRankTier CurrentTier { get; private set; } = ActRankTier.Iron;
        public ActRankTier PeakTierThisAct { get; private set; } = ActRankTier.Iron;

        public event Action<ActRankTier> OnTierChanged;
        public event Action<ActResetResult> OnActReset;

        /// <summary>Call whenever the player's rank changes mid-act (win/loss RR updates).</summary>
        public void SetCurrentTier(ActRankTier tier)
        {
            CurrentTier = tier;
            if (tier > PeakTierThisAct)
            {
                PeakTierThisAct = tier;
            }
            OnTierChanged?.Invoke(CurrentTier);
            RefreshBadgeDisplay();
        }

        /// <summary>Call once at act boundary. Grants rewards based on the act's peak tier and
        /// returns the carryover state that should seed the new act.</summary>
        public ActResetResult ResolveActReset()
        {
            var result = new ActResetResult
            {
                peakTier = PeakTierThisAct
            };

            result.unlockedRewardIds.AddRange(GrantRewardsForPeak(PeakTierThisAct));

            int carryTierIndex = Mathf.Max((int)PeakTierThisAct - carryOverTierDrop, (int)ActRankTier.Iron);
            result.carryOverTier = (ActRankTier)carryTierIndex;
            result.carryOverRatingPoints = Mathf.Clamp(carryOverRatingBase + (int)PeakTierThisAct * 2, 0, 99);

            CurrentTier = result.carryOverTier;
            PeakTierThisAct = result.carryOverTier;

            OnActReset?.Invoke(result);
            RefreshBadgeDisplay();
            return result;
        }

        private List<string> GrantRewardsForPeak(ActRankTier peak)
        {
            var granted = new List<string>();
            ActRewardDefinition bestExclusive = null;

            foreach (var reward in rewardTable)
            {
                if (peak < reward.minimumTier) continue;

                if (reward.exclusiveWithLowerTiers)
                {
                    if (bestExclusive == null || reward.minimumTier > bestExclusive.minimumTier)
                        bestExclusive = reward;
                    continue;
                }

                granted.Add(reward.rewardId);
            }

            if (bestExclusive != null)
                granted.Add(bestExclusive.rewardId);

            return granted;
        }

        private void RefreshBadgeDisplay()
        {
            if (rankBadgeRoot != null)
                rankBadgeRoot.SetActive(true);

            if (badgeTierLabel != null)
                badgeTierLabel.text = FormatTierLabel(CurrentTier);
        }

        private string FormatTierLabel(ActRankTier tier)
        {
            return tier.ToString();
        }
    }
}
