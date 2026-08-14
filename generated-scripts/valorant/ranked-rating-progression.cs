/*
 * ScriptForge — Ranked Rating Progression
 * Pack: Valorant Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Match-result-driven ranked rating (RR) gain/loss calculator with tier promotion series handling.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using UnityEngine;

namespace ScriptForge.Valorant.Progression
{
    public enum RankTier
    {
        Bronze,
        Silver,
        Gold,
        Platinum,
        Diamond,
        Ascendant
    }

    [Serializable]
    public class RankState
    {
        public RankTier Tier;
        public int Division = 1;      // 1-3 within a tier
        public int RatingPoints;      // 0-100 within the current division
        public bool InPromotionSeries;
        public int PromotionWins;
        public int PromotionLosses;
    }

    /// <summary>
    /// Computes ranked-rating changes after a match and drives tier/division
    /// promotion, including a best-of-3 promotion series required to advance
    /// out of the top division of each tier.
    /// </summary>
    public class RankedRatingProgression : MonoBehaviour
    {
        [Header("RR Tuning")]
        [SerializeField] private int baseWinRR = 22;
        [SerializeField] private int baseLossRR = 18;
        [Tooltip("Extra/less RR per full round-differential point, clamped by maxPerformanceBonus.")]
        [SerializeField] private int performanceRRPerRoundDiff = 1;
        [SerializeField] private int maxPerformanceBonus = 8;
        private const int DivisionsPerTier = 3;
        private const int PromotionSeriesLength = 3;

        public RankState CurrentRank { get; private set; } = new RankState { Tier = RankTier.Bronze, Division = 1, RatingPoints = 0 };

        public event Action<RankState, int> OnRatingChanged;          // state, rrDelta
        public event Action<RankState> OnPromoted;
        public event Action<RankState> OnDemoted;
        public event Action<RankState> OnPromotionSeriesStarted;

        /// <summary>
        /// Applies the result of a completed match to the player's rank state.
        /// roundDifferential is (roundsWon - roundsLost), used as a light performance modifier.
        /// </summary>
        public void ApplyMatchResult(bool won, int roundDifferential)
        {
            int performanceBonus = Mathf.Clamp(roundDifferential * performanceRRPerRoundDiff, -maxPerformanceBonus, maxPerformanceBonus);
            int rrDelta = won ? baseWinRR + Mathf.Max(0, performanceBonus) : -(baseLossRR - Mathf.Min(0, performanceBonus));

            if (CurrentRank.InPromotionSeries)
            {
                ApplyPromotionSeriesResult(won);
                OnRatingChanged?.Invoke(CurrentRank, 0);
                return;
            }

            CurrentRank.RatingPoints += rrDelta;
            OnRatingChanged?.Invoke(CurrentRank, rrDelta);

            while (CurrentRank.RatingPoints >= 100)
            {
                CurrentRank.RatingPoints -= 100;
                TryAdvanceDivision();
            }

            while (CurrentRank.RatingPoints < 0)
            {
                CurrentRank.RatingPoints += 100;
                TryDropDivision();
            }
        }

        private void TryAdvanceDivision()
        {
            bool isTopDivisionOfTier = CurrentRank.Division >= DivisionsPerTier;
            bool isTopTier = CurrentRank.Tier == RankTier.Ascendant;

            if (isTopDivisionOfTier && !isTopTier)
            {
                // Advancing to a new tier requires winning a promotion series.
                CurrentRank.InPromotionSeries = true;
                CurrentRank.PromotionWins = 0;
                CurrentRank.PromotionLosses = 0;
                CurrentRank.RatingPoints = 100; // hold at the door until the series resolves
                OnPromotionSeriesStarted?.Invoke(CurrentRank);
                return;
            }

            if (!isTopDivisionOfTier)
            {
                CurrentRank.Division++;
                OnPromoted?.Invoke(CurrentRank);
            }
        }

        private void TryDropDivision()
        {
            if (CurrentRank.Division > 1)
            {
                CurrentRank.Division--;
                OnDemoted?.Invoke(CurrentRank);
            }
            else if (CurrentRank.Tier > RankTier.Bronze)
            {
                CurrentRank.Tier--;
                CurrentRank.Division = DivisionsPerTier;
                OnDemoted?.Invoke(CurrentRank);
            }
            else
            {
                CurrentRank.RatingPoints = 0; // floor: can't fall below the lowest rank
            }
        }

        private void ApplyPromotionSeriesResult(bool won)
        {
            if (won)
                CurrentRank.PromotionWins++;
            else
                CurrentRank.PromotionLosses++;

            int winsNeeded = (PromotionSeriesLength / 2) + 1;

            if (CurrentRank.PromotionWins >= winsNeeded)
            {
                CurrentRank.InPromotionSeries = false;
                CurrentRank.Tier++;
                CurrentRank.Division = 1;
                CurrentRank.RatingPoints = 0;
                OnPromoted?.Invoke(CurrentRank);
            }
            else if (CurrentRank.PromotionLosses >= winsNeeded)
            {
                CurrentRank.InPromotionSeries = false;
                CurrentRank.RatingPoints = 70; // failed series: stay in tier, drop back a bit
            }
        }
    }
}
