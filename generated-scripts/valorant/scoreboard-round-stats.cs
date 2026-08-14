/*
 * ScriptForge — Scoreboard & Combat Score
 * Pack: Valorant Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Live scoreboard with combat score, first-bloods, clutch tracking per round.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScriptForge.HUD
{
    [Serializable]
    public class PlayerStatLine
    {
        public string playerId;
        public string displayName;
        public int kills;
        public int deaths;
        public int assists;
        public int combatScore;   // Aggregate ACS-style running total.
        public int firstBloods;
        public int clutchesWon;
        public int roundsPlayed;

        public float KDRatio => deaths == 0 ? kills : (float)kills / deaths;
        public float AverageCombatScore => roundsPlayed == 0 ? 0 : (float)combatScore / roundsPlayed;
    }

    /// <summary>
    /// Central match scoreboard: aggregates per-round combat events into running player stat
    /// lines, tracks first blood of each round and clutch situations (last alive vs multiple enemies).
    /// </summary>
    public class ScoreboardManager : MonoBehaviour
    {
        [Header("Combat Score Weights")]
        public int scorePerKill = 200;
        public int scorePerAssist = 50;
        public int scorePerDamage = 1; // multiplied by raw damage dealt in the round.

        public event Action<PlayerStatLine> OnStatsUpdated;
        public event Action<string> OnFirstBloodAwarded;
        public event Action<string> OnClutchAwarded;

        private readonly Dictionary<string, PlayerStatLine> _stats = new Dictionary<string, PlayerStatLine>();

        private bool _firstBloodClaimedThisRound;
        private readonly HashSet<string> _aliveThisRound = new HashSet<string>();
        private readonly Dictionary<string, string> _lastAliveTeamOf = new Dictionary<string, string>();

        public void RegisterPlayer(string playerId, string displayName)
        {
            if (_stats.ContainsKey(playerId)) return;
            _stats[playerId] = new PlayerStatLine { playerId = playerId, displayName = displayName };
        }

        public void OnRoundStart(IEnumerable<string> alivePlayerIds)
        {
            _firstBloodClaimedThisRound = false;
            _aliveThisRound.Clear();
            foreach (var id in alivePlayerIds)
            {
                _aliveThisRound.Add(id);
                if (_stats.TryGetValue(id, out var line)) line.roundsPlayed++;
            }
        }

        /// <summary>Call whenever a kill occurs; handles score, first blood, and clutch bookkeeping.</summary>
        public void RegisterKill(string killerId, string victimId, string killerTeamId, string victimTeamId, bool assisted, List<string> assisterIds = null)
        {
            if (!_stats.ContainsKey(killerId) || !_stats.ContainsKey(victimId)) return;

            var killer = _stats[killerId];
            killer.kills++;
            killer.combatScore += scorePerKill;

            _stats[victimId].deaths++;
            _aliveThisRound.Remove(victimId);

            if (assisterIds != null)
            {
                foreach (var aId in assisterIds)
                {
                    if (_stats.TryGetValue(aId, out var assister))
                    {
                        assister.assists++;
                        assister.combatScore += scorePerAssist;
                    }
                }
            }

            if (!_firstBloodClaimedThisRound)
            {
                _firstBloodClaimedThisRound = true;
                killer.firstBloods++;
                OnFirstBloodAwarded?.Invoke(killerId);
            }

            CheckClutchState(killerId, killerTeamId, victimTeamId);

            OnStatsUpdated?.Invoke(killer);
            OnStatsUpdated?.Invoke(_stats[victimId]);
        }

        /// <summary>Accumulates raw damage into a player's combat score (call from your damage pipeline).</summary>
        public void RegisterDamage(string playerId, float damage)
        {
            if (!_stats.TryGetValue(playerId, out var line)) return;
            line.combatScore += Mathf.RoundToInt(damage * scorePerDamage);
            OnStatsUpdated?.Invoke(line);
        }

        private void CheckClutchState(string killerId, string killerTeamId, string victimTeamId)
        {
            // A clutch is awarded if the killer is the sole surviving member of their team
            // while at least two members of the enemy team were alive at round start.
            int killerTeamAliveCount = _aliveThisRound.Count(id => _lastAliveTeamOf.TryGetValue(id, out var t) && t == killerTeamId);
            if (killerTeamAliveCount == 0 || (killerTeamAliveCount == 1 && _aliveThisRound.Contains(killerId)))
            {
                if (_stats.TryGetValue(killerId, out var line))
                {
                    line.clutchesWon++;
                    OnClutchAwarded?.Invoke(killerId);
                }
            }
        }

        /// <summary>Registers each player's team for clutch-eligibility calculations at round start.</summary>
        public void SetTeamOf(string playerId, string teamId) => _lastAliveTeamOf[playerId] = teamId;

        public List<PlayerStatLine> GetSortedByScore() => _stats.Values.OrderByDescending(s => s.combatScore).ToList();

        public PlayerStatLine GetStats(string playerId) => _stats.TryGetValue(playerId, out var l) ? l : null;
    }
}
