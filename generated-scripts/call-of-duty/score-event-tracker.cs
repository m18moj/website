/*
 * ScripForge — Combat Score Event Log
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Logs per-action score events (kills, assists, objective plays) into a live combat log and end-match summary.
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
    public enum ScoreEventType
    {
        Elimination,
        Assist,
        ObjectiveCapture,
        ObjectiveDefend,
        ObjectivePlant,
        ObjectiveDefuse,
        Headshot,
        Streak
    }

    [Serializable]
    public struct ScoreEvent
    {
        public ScoreEventType type;
        public int points;
        public string sourcePlayerId;
        public string targetPlayerId; // optional, e.g. victim on an elimination
        public float timestamp;
        public string label;
    }

    /// <summary>
    /// Central log of scoring actions during a match. Feeds a live on-screen combat log UI and
    /// produces aggregated totals for the end-of-match summary screen.
    /// </summary>
    public class ScoreEventTracker : MonoBehaviour
    {
        [Header("Live Log Settings")]
        [SerializeField] private int maxVisibleLogEntries = 6;
        [SerializeField] private float logEntryLifetime = 5f;

        private readonly List<ScoreEvent> allEvents = new List<ScoreEvent>();
        private readonly Queue<ScoreEvent> liveLogQueue = new Queue<ScoreEvent>();

        public event Action<ScoreEvent> OnScoreEventLogged;
        public event Action<ScoreEvent> OnLiveLogEntryExpired;

        /// <summary>Records a new score event and pushes it onto the live combat log.</summary>
        public void LogEvent(ScoreEventType type, int points, string sourcePlayerId, string targetPlayerId = null, string label = null)
        {
            var evt = new ScoreEvent
            {
                type = type,
                points = points,
                sourcePlayerId = sourcePlayerId,
                targetPlayerId = targetPlayerId,
                timestamp = Time.time,
                label = string.IsNullOrEmpty(label) ? type.ToString() : label
            };

            allEvents.Add(evt);
            liveLogQueue.Enqueue(evt);

            if (liveLogQueue.Count > maxVisibleLogEntries)
            {
                ScoreEvent expired = liveLogQueue.Dequeue();
                OnLiveLogEntryExpired?.Invoke(expired);
            }

            OnScoreEventLogged?.Invoke(evt);
            Invoke(nameof(TryExpireOldestLogEntry), logEntryLifetime);
        }

        private void TryExpireOldestLogEntry()
        {
            if (liveLogQueue.Count == 0) return;
            ScoreEvent oldest = liveLogQueue.Peek();
            if (Time.time - oldest.timestamp >= logEntryLifetime)
            {
                liveLogQueue.Dequeue();
                OnLiveLogEntryExpired?.Invoke(oldest);
            }
        }

        public int GetTotalScoreForPlayer(string playerId) =>
            allEvents.Where(e => e.sourcePlayerId == playerId).Sum(e => e.points);

        public int GetEventCountForPlayer(string playerId, ScoreEventType type) =>
            allEvents.Count(e => e.sourcePlayerId == playerId && e.type == type);

        /// <summary>Builds a per-player breakdown suitable for an end-match scorecard.</summary>
        public Dictionary<string, List<ScoreEvent>> BuildPlayerBreakdown()
        {
            var breakdown = new Dictionary<string, List<ScoreEvent>>();
            foreach (ScoreEvent evt in allEvents)
            {
                if (!breakdown.TryGetValue(evt.sourcePlayerId, out List<ScoreEvent> list))
                {
                    list = new List<ScoreEvent>();
                    breakdown[evt.sourcePlayerId] = list;
                }
                list.Add(evt);
            }
            return breakdown;
        }

        public IReadOnlyList<ScoreEvent> GetAllEvents() => allEvents;

        public void ResetLog()
        {
            allEvents.Clear();
            liveLogQueue.Clear();
        }
    }
}
