/*
 * ScripForge — Gulag 1v1 Duel Queue
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Post-death 1v1 duel queue with a pistol-round bracket that grants a second-chance respawn on a win.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Systems
{
    public enum DuelOutcome
    {
        Pending,
        AttackerWon,
        DefenderWon,
        DoubleElimination
    }

    [Serializable]
    public class DuelMatch
    {
        public string matchId;
        public string attackerId;
        public string defenderId;
        public Transform arenaSpawnA;
        public Transform arenaSpawnB;
        public DuelOutcome outcome = DuelOutcome.Pending;
    }

    /// <summary>
    /// Queues eliminated players for a pistol-round 1v1, pairs them into free arena slots as pairs
    /// become available, and grants the round's winner a one-time second-chance respawn back into
    /// the main match. Losers of a duel remain eliminated for the game.
    /// </summary>
    public class Gulag1v1DuelQueue : MonoBehaviour
    {
        [Header("Arenas")]
        [SerializeField] private List<Transform> arenaSpawnPointsA = new List<Transform>();
        [SerializeField] private List<Transform> arenaSpawnPointsB = new List<Transform>();

        [Header("Rules")]
        [SerializeField] private float duelTimeLimitSeconds = 40f;
        [SerializeField] private int maxSecondChancesPerPlayer = 1;

        private readonly Queue<string> waitingPlayers = new Queue<string>();
        private readonly Dictionary<int, DuelMatch> activeArenas = new Dictionary<int, DuelMatch>();
        private readonly Dictionary<string, float> duelTimers = new Dictionary<string, float>();
        private readonly Dictionary<string, int> secondChancesUsed = new Dictionary<string, int>();

        public event Action<DuelMatch> OnMatchStarted;
        public event Action<DuelMatch> OnMatchResolved;
        public event Action<string> OnPlayerRespawnedFromGulag;
        public event Action<string> OnPlayerEliminatedFromGulag;

        /// <summary>Call from the death handler in place of normal spectate/eliminate when the gulag is still open.</summary>
        public void EnqueuePlayer(string playerId)
        {
            if (waitingPlayers.Contains(playerId)) return;
            waitingPlayers.Enqueue(playerId);
            TryStartNextMatch();
        }

        private void Update()
        {
            if (activeArenas.Count == 0) return;

            List<int> arenaIndices = new List<int>(activeArenas.Keys);
            foreach (int arenaIndex in arenaIndices)
            {
                DuelMatch match = activeArenas[arenaIndex];
                if (!duelTimers.TryGetValue(match.matchId, out float elapsed)) continue;

                elapsed += Time.deltaTime;
                duelTimers[match.matchId] = elapsed;

                if (elapsed >= duelTimeLimitSeconds)
                {
                    ResolveMatch(arenaIndex, DuelOutcome.DoubleElimination);
                }
            }
        }

        private void TryStartNextMatch()
        {
            if (waitingPlayers.Count < 2) return;

            int freeArena = FindFreeArenaIndex();
            if (freeArena < 0) return;

            string attacker = waitingPlayers.Dequeue();
            string defender = waitingPlayers.Dequeue();

            DuelMatch match = new DuelMatch
            {
                matchId = Guid.NewGuid().ToString("N"),
                attackerId = attacker,
                defenderId = defender,
                arenaSpawnA = arenaSpawnPointsA.Count > freeArena ? arenaSpawnPointsA[freeArena] : null,
                arenaSpawnB = arenaSpawnPointsB.Count > freeArena ? arenaSpawnPointsB[freeArena] : null
            };

            activeArenas[freeArena] = match;
            duelTimers[match.matchId] = 0f;
            OnMatchStarted?.Invoke(match);
        }

        private int FindFreeArenaIndex()
        {
            int arenaCount = Math.Max(arenaSpawnPointsA.Count, arenaSpawnPointsB.Count);
            for (int i = 0; i < arenaCount; i++)
            {
                if (!activeArenas.ContainsKey(i)) return i;
            }
            return -1;
        }

        /// <summary>Call from the arena's kill trigger with the id of whoever landed the winning shot.</summary>
        public void ReportDuelKill(string arenaMatchId, string winnerId)
        {
            foreach (KeyValuePair<int, DuelMatch> pair in activeArenas)
            {
                if (pair.Value.matchId != arenaMatchId) continue;

                DuelOutcome outcome = winnerId == pair.Value.attackerId
                    ? DuelOutcome.AttackerWon
                    : DuelOutcome.DefenderWon;
                ResolveMatch(pair.Key, outcome);
                return;
            }
        }

        private void ResolveMatch(int arenaIndex, DuelOutcome outcome)
        {
            if (!activeArenas.TryGetValue(arenaIndex, out DuelMatch match)) return;

            match.outcome = outcome;
            string winnerId = outcome == DuelOutcome.AttackerWon ? match.attackerId
                : outcome == DuelOutcome.DefenderWon ? match.defenderId
                : null;
            string loserId = winnerId == match.attackerId ? match.defenderId : match.attackerId;

            if (winnerId != null)
            {
                GrantSecondChance(winnerId);
                OnPlayerEliminatedFromGulag?.Invoke(loserId);
            }
            else
            {
                OnPlayerEliminatedFromGulag?.Invoke(match.attackerId);
                OnPlayerEliminatedFromGulag?.Invoke(match.defenderId);
            }

            duelTimers.Remove(match.matchId);
            activeArenas.Remove(arenaIndex);
            OnMatchResolved?.Invoke(match);
            TryStartNextMatch();
        }

        private void GrantSecondChance(string playerId)
        {
            secondChancesUsed.TryGetValue(playerId, out int used);
            if (used >= maxSecondChancesPerPlayer) return;

            secondChancesUsed[playerId] = used + 1;
            OnPlayerRespawnedFromGulag?.Invoke(playerId);
        }

        public int GetQueueLength() => waitingPlayers.Count;
        public bool IsPlayerInDuel(string playerId)
        {
            foreach (DuelMatch match in activeArenas.Values)
            {
                if (match.attackerId == playerId || match.defenderId == playerId) return true;
            }
            return false;
        }
    }
}
