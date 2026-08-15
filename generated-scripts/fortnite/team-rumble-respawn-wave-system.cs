/*
 * ScripForge — Team Rumble Respawn Wave System
 * Pack: Fortnite Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Wave-based respawns for team-rumble modes with an elimination-count victory threshold and spawn rotation.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Systems
{
    public enum RumbleTeam { Red, Blue }

    [Serializable]
    public struct TeamRumbleConfig
    {
        public float WaveIntervalSeconds;
        public int EliminationVictoryThreshold;
        public int MaxConcurrentRespawnsPerWave;
    }

    public class TeamRumbleRespawnWaveSystem : MonoBehaviour
    {
        public event Action<RumbleTeam> OnTeamWon;
        public event Action<RumbleTeam, int> OnEliminationScored;
        public event Action OnWaveRespawned;

        [Header("Config")]
        [SerializeField] private TeamRumbleConfig _config = new TeamRumbleConfig
        {
            WaveIntervalSeconds = 8f,
            EliminationVictoryThreshold = 100,
            MaxConcurrentRespawnsPerWave = 6
        };

        [Header("Spawn Points")]
        [SerializeField] private List<Transform> _redSpawnPoints = new List<Transform>();
        [SerializeField] private List<Transform> _blueSpawnPoints = new List<Transform>();

        private readonly Dictionary<RumbleTeam, int> _eliminationCounts = new Dictionary<RumbleTeam, int>
        {
            { RumbleTeam.Red, 0 },
            { RumbleTeam.Blue, 0 }
        };

        private readonly Queue<GameObject> _redAwaitingRespawn = new Queue<GameObject>();
        private readonly Queue<GameObject> _blueAwaitingRespawn = new Queue<GameObject>();

        private int _redSpawnRotationIndex;
        private int _blueSpawnRotationIndex;
        private bool _matchOver;
        private Coroutine _waveRoutine;

        private void Start()
        {
            _waveRoutine = StartCoroutine(WaveLoop());
        }

        private void OnDestroy()
        {
            if (_waveRoutine != null) StopCoroutine(_waveRoutine);
        }

        // Called by the elimination/kill-feed pipeline when a player from either team scores a kill.
        public void ReportElimination(RumbleTeam scoringTeam, GameObject eliminatedPlayer)
        {
            if (_matchOver) return;

            _eliminationCounts[scoringTeam]++;
            OnEliminationScored?.Invoke(scoringTeam, _eliminationCounts[scoringTeam]);

            RumbleTeam eliminatedTeam = scoringTeam == RumbleTeam.Red ? RumbleTeam.Blue : RumbleTeam.Red;
            EnqueueForRespawn(eliminatedTeam, eliminatedPlayer);

            if (_eliminationCounts[scoringTeam] >= _config.EliminationVictoryThreshold)
            {
                DeclareWinner(scoringTeam);
            }
        }

        private void EnqueueForRespawn(RumbleTeam team, GameObject player)
        {
            player.SetActive(false);
            if (team == RumbleTeam.Red) _redAwaitingRespawn.Enqueue(player);
            else _blueAwaitingRespawn.Enqueue(player);
        }

        // Runs on a fixed interval, releasing up to MaxConcurrentRespawnsPerWave eliminated players per team per tick.
        private IEnumerator WaveLoop()
        {
            var wait = new WaitForSeconds(_config.WaveIntervalSeconds);

            while (!_matchOver)
            {
                yield return wait;

                ProcessRespawnWave(_redAwaitingRespawn, _redSpawnPoints, ref _redSpawnRotationIndex);
                ProcessRespawnWave(_blueAwaitingRespawn, _blueSpawnPoints, ref _blueSpawnRotationIndex);

                OnWaveRespawned?.Invoke();
            }
        }

        private void ProcessRespawnWave(Queue<GameObject> awaiting, List<Transform> spawnPoints, ref int rotationIndex)
        {
            if (spawnPoints.Count == 0) return;

            int released = 0;
            while (awaiting.Count > 0 && released < _config.MaxConcurrentRespawnsPerWave)
            {
                GameObject player = awaiting.Dequeue();
                Transform point = spawnPoints[rotationIndex % spawnPoints.Count];
                rotationIndex++;

                player.transform.SetPositionAndRotation(point.position, point.rotation);
                player.SetActive(true);
                released++;
            }
        }

        private void DeclareWinner(RumbleTeam team)
        {
            _matchOver = true;
            OnTeamWon?.Invoke(team);
        }

        public int GetEliminationCount(RumbleTeam team) => _eliminationCounts[team];
    }
}
