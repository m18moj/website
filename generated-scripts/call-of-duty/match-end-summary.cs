/*
 * ScriptForge — End-of-Match Scorecard
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Builds the post-match scorecard: XP breakdown, MVP highlight selection, and challenge-progress summary.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScriptForge.Systems
{
    [Serializable]
    public class XpBreakdownEntry
    {
        public string sourceLabel; // e.g. "Eliminations", "Objective Plays", "Match Win Bonus"
        public int amount;
    }

    [Serializable]
    public class ChallengeProgressEntry
    {
        public string challengeId;
        public string displayName;
        public int progressBefore;
        public int progressAfter;
        public int targetValue;
        public bool completedThisMatch;
    }

    [Serializable]
    public class PlayerMatchStats
    {
        public string playerId;
        public string displayName;
        public int eliminations;
        public int deaths;
        public int assists;
        public int score;
        public int objectiveActions;
        public bool won;
    }

    [Serializable]
    public class MatchSummaryResult
    {
        public PlayerMatchStats localPlayerStats;
        public List<XpBreakdownEntry> xpBreakdown = new List<XpBreakdownEntry>();
        public int totalXp;
        public string mvpPlayerId;
        public string mvpReason;
        public List<ChallengeProgressEntry> challengeProgress = new List<ChallengeProgressEntry>();
    }

    /// <summary>
    /// Aggregates end-of-match data into a single summary payload for the scorecard screen:
    /// computes XP awards from raw match stats, selects the match MVP, and reports challenge
    /// progress deltas. Call BuildSummary once when the match ends.
    /// </summary>
    public class MatchEndSummary : MonoBehaviour
    {
        [Header("XP Tuning")]
        [SerializeField] private int xpPerElimination = 100;
        [SerializeField] private int xpPerAssist = 40;
        [SerializeField] private int xpPerObjectiveAction = 150;
        [SerializeField] private int matchWinBonus = 500;
        [SerializeField] private int participationXp = 250;

        public event Action<MatchSummaryResult> OnSummaryBuilt;

        /// <summary>Builds the full summary from the roster and the local player's id.</summary>
        public MatchSummaryResult BuildSummary(
            List<PlayerMatchStats> roster,
            string localPlayerId,
            List<ChallengeProgressEntry> challengeEntries)
        {
            var result = new MatchSummaryResult();

            PlayerMatchStats localStats = roster.FirstOrDefault(p => p.playerId == localPlayerId);
            if (localStats == null)
            {
                Debug.LogWarning("Local player not found in roster for match summary.");
                return result;
            }

            result.localPlayerStats = localStats;
            result.xpBreakdown = BuildXpBreakdown(localStats);
            result.totalXp = result.xpBreakdown.Sum(e => e.amount);

            (string mvpId, string reason) = SelectMvp(roster);
            result.mvpPlayerId = mvpId;
            result.mvpReason = reason;

            result.challengeProgress = challengeEntries ?? new List<ChallengeProgressEntry>();

            OnSummaryBuilt?.Invoke(result);
            return result;
        }

        private List<XpBreakdownEntry> BuildXpBreakdown(PlayerMatchStats stats)
        {
            var entries = new List<XpBreakdownEntry>
            {
                new XpBreakdownEntry { sourceLabel = "Eliminations", amount = stats.eliminations * xpPerElimination },
                new XpBreakdownEntry { sourceLabel = "Assists", amount = stats.assists * xpPerAssist },
                new XpBreakdownEntry { sourceLabel = "Objective Actions", amount = stats.objectiveActions * xpPerObjectiveAction },
                new XpBreakdownEntry { sourceLabel = "Match Participation", amount = participationXp }
            };

            if (stats.won)
            {
                entries.Add(new XpBreakdownEntry { sourceLabel = "Victory Bonus", amount = matchWinBonus });
            }

            return entries;
        }

        /// <summary>Selects an MVP using a weighted combat score (kills, assists, objective plays, deaths).</summary>
        private (string playerId, string reason) SelectMvp(List<PlayerMatchStats> roster)
        {
            if (roster == null || roster.Count == 0) return (null, null);

            PlayerMatchStats best = null;
            float bestScore = float.NegativeInfinity;

            foreach (PlayerMatchStats player in roster)
            {
                float weightedScore = (player.eliminations * 3f) + (player.assists * 1f)
                                       + (player.objectiveActions * 2.5f) - (player.deaths * 0.5f);
                if (weightedScore > bestScore)
                {
                    bestScore = weightedScore;
                    best = player;
                }
            }

            if (best == null) return (null, null);

            string reason = best.objectiveActions >= best.eliminations
                ? "Top Objective Contributor"
                : "Top Combat Performance";

            return (best.playerId, reason);
        }
    }
}
