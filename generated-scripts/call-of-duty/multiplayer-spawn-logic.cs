/*
 * ScripForge — Dynamic Spawn Safety System
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Scores candidate spawn points against enemy sightlines and recent death clusters to pick safe spawns.
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
    [Serializable]
    public class SpawnPointDefinition
    {
        public Transform point;
        public bool teamASide;
    }

    /// <summary>
    /// Selects the safest spawn point for a respawning player by scoring every candidate against
    /// enemy proximity, line-of-sight exposure, and recent local death clusters. Register death
    /// locations via RegisterDeath so the system can avoid spawning players into active fights.
    /// </summary>
    public class MultiplayerSpawnLogic : MonoBehaviour
    {
        [Header("Spawn Points")]
        [SerializeField] private List<SpawnPointDefinition> spawnPoints = new List<SpawnPointDefinition>();

        [Header("Scoring Weights")]
        [SerializeField] private float minEnemyDistance = 15f;
        [SerializeField] private float enemyDistanceWeight = 2f;
        [SerializeField] private float sightlineExposurePenalty = 40f;
        [SerializeField] private float deathClusterRadius = 10f;
        [SerializeField] private float deathClusterPenalty = 25f;
        [SerializeField] private float deathMemoryDuration = 8f;

        [Header("Line of Sight")]
        [SerializeField] private LayerMask sightlineBlockingMask = ~0;
        [SerializeField] private float eyeHeight = 1.7f;

        private readonly List<(Vector3 position, float time)> recentDeaths = new List<(Vector3, float)>();

        /// <summary>Call from the death handler so future spawns steer away from this location.</summary>
        public void RegisterDeath(Vector3 worldPosition)
        {
            recentDeaths.Add((worldPosition, Time.time));
        }

        private void PruneStaleDeaths()
        {
            recentDeaths.RemoveAll(d => Time.time - d.time > deathMemoryDuration);
        }

        /// <summary>Returns the best-scoring spawn transform for a player on the given team.</summary>
        public Transform SelectSpawnPoint(bool isTeamA, List<Vector3> enemyPositions)
        {
            PruneStaleDeaths();

            IEnumerable<SpawnPointDefinition> candidates = spawnPoints.Where(s => s.teamASide == isTeamA);
            if (!candidates.Any()) candidates = spawnPoints; // fallback: any point

            Transform best = null;
            float bestScore = float.NegativeInfinity;

            foreach (SpawnPointDefinition candidate in candidates)
            {
                float score = ScoreSpawnPoint(candidate.point.position, enemyPositions);
                if (score > bestScore)
                {
                    bestScore = score;
                    best = candidate.point;
                }
            }

            return best;
        }

        private float ScoreSpawnPoint(Vector3 position, List<Vector3> enemyPositions)
        {
            float score = 100f;

            foreach (Vector3 enemyPos in enemyPositions)
            {
                float distance = Vector3.Distance(position, enemyPos);

                if (distance < minEnemyDistance)
                {
                    score -= (minEnemyDistance - distance) * enemyDistanceWeight;
                }

                if (HasLineOfSight(position, enemyPos))
                {
                    score -= sightlineExposurePenalty;
                }
            }

            foreach ((Vector3 deathPos, float time) in recentDeaths)
            {
                float distance = Vector3.Distance(position, deathPos);
                if (distance < deathClusterRadius)
                {
                    float recencyFactor = 1f - Mathf.Clamp01((Time.time - time) / deathMemoryDuration);
                    score -= deathClusterPenalty * recencyFactor * (1f - distance / deathClusterRadius);
                }
            }

            return score;
        }

        private bool HasLineOfSight(Vector3 from, Vector3 to)
        {
            Vector3 origin = from + Vector3.up * eyeHeight;
            Vector3 target = to + Vector3.up * eyeHeight;
            Vector3 direction = target - origin;

            if (Physics.Raycast(origin, direction.normalized, out RaycastHit hit, direction.magnitude, sightlineBlockingMask))
            {
                // Something blocked the ray before reaching the enemy position -> no sightline.
                return false;
            }
            return true;
        }

        public int GetActiveDeathClusterCount()
        {
            PruneStaleDeaths();
            return recentDeaths.Count;
        }
    }
}
