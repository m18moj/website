/*
 * ScripForge — Combat Pacing & Flow State Tracker
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks recent engagement tempo and time-to-kill to classify a match's pacing in real time.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScripForge.Systems
{
    public enum MatchPacing
    {
        Lull,
        Steady,
        Heated,
        Frenzy
    }

    [Serializable]
    public class EngagementRecord
    {
        public string attackerId;
        public string victimId;
        public float timestamp;
        public float timeToKillSeconds;
    }

    /// <summary>
    /// Tracks a rolling window of recent kill engagements (frequency and time-to-kill) and
    /// classifies the match's current pacing so other systems (music stingers, dynamic
    /// announcer lines, HUD pulse effects) can react to how "hot" the match currently is.
    /// </summary>
    public class CombatPacingFlowStateTracker : MonoBehaviour
    {
        [Header("Rolling Window")]
        [Tooltip("Seconds of recent history considered when computing pacing.")]
        [SerializeField] private float windowSeconds = 30f;

        [Header("Pacing Thresholds (kills per window)")]
        [SerializeField] private float steadyKillsPerWindow = 3f;
        [SerializeField] private float heatedKillsPerWindow = 6f;
        [SerializeField] private float frenzyKillsPerWindow = 10f;

        [Header("Time-To-Kill Weighting")]
        [Tooltip("TTK at or below this counts as a fast, pacing-boosting kill.")]
        [SerializeField] private float fastTtkSeconds = 1.5f;

        private readonly List<EngagementRecord> recentEngagements = new List<EngagementRecord>();
        private float matchClock;
        private MatchPacing currentPacing = MatchPacing.Lull;

        public event Action<MatchPacing, MatchPacing> OnPacingChanged; // (previous, current)
        public event Action<EngagementRecord> OnEngagementRecorded;

        private void Update()
        {
            matchClock += Time.deltaTime;
            PruneExpiredRecords();
        }

        /// <summary>Call from the kill-feed/damage pipeline whenever a kill resolves.</summary>
        public void RecordEngagement(string attackerId, string victimId, float timeToKillSeconds)
        {
            EngagementRecord record = new EngagementRecord
            {
                attackerId = attackerId,
                victimId = victimId,
                timestamp = matchClock,
                timeToKillSeconds = timeToKillSeconds
            };

            recentEngagements.Add(record);
            OnEngagementRecorded?.Invoke(record);
            EvaluatePacing();
        }

        private void PruneExpiredRecords()
        {
            if (recentEngagements.Count == 0) return;

            float cutoff = matchClock - windowSeconds;
            int removeCount = 0;
            while (removeCount < recentEngagements.Count && recentEngagements[removeCount].timestamp < cutoff)
            {
                removeCount++;
            }

            if (removeCount > 0)
            {
                recentEngagements.RemoveRange(0, removeCount);
                EvaluatePacing();
            }
        }

        private void EvaluatePacing()
        {
            float weightedScore = GetWeightedEngagementScore();

            MatchPacing newPacing;
            if (weightedScore >= frenzyKillsPerWindow)
            {
                newPacing = MatchPacing.Frenzy;
            }
            else if (weightedScore >= heatedKillsPerWindow)
            {
                newPacing = MatchPacing.Heated;
            }
            else if (weightedScore >= steadyKillsPerWindow)
            {
                newPacing = MatchPacing.Steady;
            }
            else
            {
                newPacing = MatchPacing.Lull;
            }

            if (newPacing != currentPacing)
            {
                MatchPacing previous = currentPacing;
                currentPacing = newPacing;
                OnPacingChanged?.Invoke(previous, currentPacing);
            }
        }

        /// <summary>Kill count weighted up slightly for fast time-to-kill engagements, which read as more "heated".</summary>
        private float GetWeightedEngagementScore()
        {
            float score = 0f;
            foreach (EngagementRecord record in recentEngagements)
            {
                score += record.timeToKillSeconds <= fastTtkSeconds ? 1.5f : 1f;
            }
            return score;
        }

        public MatchPacing GetCurrentPacing() => currentPacing;

        public float GetAverageTimeToKill()
        {
            if (recentEngagements.Count == 0) return 0f;
            return recentEngagements.Average(r => r.timeToKillSeconds);
        }

        public int GetRecentEngagementCount() => recentEngagements.Count;

        public float GetKillsPerMinute()
        {
            if (windowSeconds <= 0f) return 0f;
            return (recentEngagements.Count / windowSeconds) * 60f;
        }
    }
}
