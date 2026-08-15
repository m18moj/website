/*
 * ScripForge — Leaver Penalty & Queue Restriction
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Detects match-abandonment and applies escalating matchmaking-queue time penalties for repeat offenders.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Valorant.Systems
{
    [Serializable]
    public class PlayerPenaltyRecord
    {
        public string PlayerId;
        public int RecentAbandonCount;
        public DateTime QueueRestrictedUntilUtc = DateTime.MinValue;
        public DateTime LastAbandonUtc = DateTime.MinValue;
    }

    /// <summary>
    /// Tracks players who disconnect from or abandon a match before it concludes,
    /// and escalates a temporary matchmaking queue ban the more often it happens
    /// within a rolling decay window. Designed to be driven by your match-lifecycle
    /// events (player joined, match started, match ended, player disconnected).
    /// </summary>
    public class LeaverPenaltyQueueRestriction : MonoBehaviour
    {
        [Header("Escalation")]
        [Tooltip("Queue restriction duration (minutes) applied per abandon count, indexed 1st, 2nd, 3rd... offense.")]
        [SerializeField]
        private int[] restrictionMinutesByOffense = { 5, 15, 30, 60, 240 };

        [Header("Decay")]
        [Tooltip("Hours of good behavior after which the abandon count resets to zero.")]
        [SerializeField] private float abandonCountDecayHours = 24f;

        [Tooltip("Minimum elapsed match time (seconds) before a disconnect counts as a genuine abandon rather than a late-load hiccup.")]
        [SerializeField] private float minimumMatchTimeToCountSeconds = 60f;

        public event Action<string, TimeSpan> OnPlayerRestricted;   // playerId, restriction duration
        public event Action<string> OnPlayerRestrictionCleared;

        private readonly Dictionary<string, PlayerPenaltyRecord> _records = new Dictionary<string, PlayerPenaltyRecord>();
        private readonly Dictionary<string, float> _matchJoinTimeSeconds = new Dictionary<string, float>();

        public void NotifyPlayerJoinedMatch(string playerId)
        {
            _matchJoinTimeSeconds[playerId] = Time.time;
        }

        public void NotifyPlayerLeftMatchCleanly(string playerId)
        {
            // Match ended normally for this player — no penalty, but still let the decay clock run.
            _matchJoinTimeSeconds.Remove(playerId);
        }

        /// <summary>
        /// Call when a player disconnects or leaves before the match concludes.
        /// Applies an escalating queue restriction if the elapsed match time
        /// indicates a genuine abandon rather than a brief connection issue.
        /// </summary>
        public void NotifyPlayerAbandoned(string playerId)
        {
            if (!_matchJoinTimeSeconds.TryGetValue(playerId, out float joinTime))
                return;

            float elapsed = Time.time - joinTime;
            _matchJoinTimeSeconds.Remove(playerId);

            if (elapsed < minimumMatchTimeToCountSeconds)
                return; // too early to count as abandonment (e.g. failed to load in)

            PlayerPenaltyRecord record = GetOrCreateRecord(playerId);
            DecayIfEligible(record);

            record.RecentAbandonCount++;
            record.LastAbandonUtc = DateTime.UtcNow;

            int offenseIndex = Mathf.Clamp(record.RecentAbandonCount - 1, 0, restrictionMinutesByOffense.Length - 1);
            TimeSpan restriction = TimeSpan.FromMinutes(restrictionMinutesByOffense[offenseIndex]);

            record.QueueRestrictedUntilUtc = DateTime.UtcNow + restriction;
            OnPlayerRestricted?.Invoke(playerId, restriction);
        }

        /// <summary>Whether the player is currently blocked from entering matchmaking.</summary>
        public bool IsQueueRestricted(string playerId, out TimeSpan remaining)
        {
            remaining = TimeSpan.Zero;

            if (!_records.TryGetValue(playerId, out PlayerPenaltyRecord record))
                return false;

            DateTime now = DateTime.UtcNow;
            if (record.QueueRestrictedUntilUtc <= now)
            {
                if (record.QueueRestrictedUntilUtc != DateTime.MinValue)
                {
                    OnPlayerRestrictionCleared?.Invoke(playerId);
                }
                return false;
            }

            remaining = record.QueueRestrictedUntilUtc - now;
            return true;
        }

        private void DecayIfEligible(PlayerPenaltyRecord record)
        {
            if (record.LastAbandonUtc == DateTime.MinValue)
                return;

            double hoursSinceLast = (DateTime.UtcNow - record.LastAbandonUtc).TotalHours;
            if (hoursSinceLast >= abandonCountDecayHours)
            {
                record.RecentAbandonCount = 0;
            }
        }

        private PlayerPenaltyRecord GetOrCreateRecord(string playerId)
        {
            if (!_records.TryGetValue(playerId, out PlayerPenaltyRecord record))
            {
                record = new PlayerPenaltyRecord { PlayerId = playerId };
                _records[playerId] = record;
            }
            return record;
        }
    }
}
