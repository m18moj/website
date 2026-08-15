/*
 * ScripForge — Wave-Based Horde Round System
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Escalating enemy wave spawner with round-based difficulty scaling for horde/survival modes.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Systems
{
    [Serializable]
    public class EnemyArchetype
    {
        public string archetypeId;
        public GameObject prefab;
        [Tooltip("Minimum round this archetype is allowed to spawn in.")]
        public int minRound = 1;
        public float baseHealth = 100f;
        public float baseDamage = 10f;
    }

    /// <summary>
    /// Drives a round-based horde spawner: each round spawns a growing pool of enemies drawn
    /// from unlocked archetypes, scaling health/damage as rounds progress, and waits for the
    /// round to be cleared before starting a short intermission and the next round.
    /// </summary>
    public class WaveBasedHordeRoundSystem : MonoBehaviour
    {
        [Header("Enemy Pool")]
        [SerializeField] private List<EnemyArchetype> archetypes = new List<EnemyArchetype>();
        [SerializeField] private List<Transform> spawnPoints = new List<Transform>();

        [Header("Round Scaling")]
        [SerializeField] private int baseEnemiesPerRound = 6;
        [SerializeField] private int enemiesAddedPerRound = 2;
        [SerializeField] private float healthScalePerRound = 0.12f;
        [SerializeField] private float damageScalePerRound = 0.08f;
        [SerializeField] private float spawnIntervalSeconds = 0.75f;
        [SerializeField] private float intermissionSeconds = 8f;

        [Header("Runtime State")]
        [SerializeField] private int currentRound;
        [SerializeField] private int enemiesAliveThisRound;

        public event Action<int> OnRoundStarted;
        public event Action<int> OnRoundCleared;
        public event Action<GameObject, int> OnEnemySpawned;
        public event Action OnHordeStopped;

        private Coroutine _roundRoutine;
        private bool _isRunning;

        public void StartHorde()
        {
            if (_isRunning) return;
            _isRunning = true;
            currentRound = 0;
            _roundRoutine = StartCoroutine(RunRounds());
        }

        public void StopHorde()
        {
            _isRunning = false;
            if (_roundRoutine != null) StopCoroutine(_roundRoutine);
            OnHordeStopped?.Invoke();
        }

        private IEnumerator RunRounds()
        {
            while (_isRunning)
            {
                currentRound++;
                OnRoundStarted?.Invoke(currentRound);

                int enemyCount = baseEnemiesPerRound + enemiesAddedPerRound * (currentRound - 1);
                enemiesAliveThisRound = enemyCount;

                for (int i = 0; i < enemyCount; i++)
                {
                    SpawnOneEnemy();
                    yield return new WaitForSeconds(spawnIntervalSeconds);
                }

                // Wait until every enemy from this round has been marked dead via NotifyEnemyKilled.
                while (enemiesAliveThisRound > 0)
                {
                    yield return null;
                }

                OnRoundCleared?.Invoke(currentRound);

                if (!_isRunning) yield break;
                yield return new WaitForSeconds(intermissionSeconds);
            }
        }

        private void SpawnOneEnemy()
        {
            var candidates = archetypes.FindAll(a => a.minRound <= currentRound);
            if (candidates.Count == 0 || spawnPoints.Count == 0) return;

            var archetype = candidates[UnityEngine.Random.Range(0, candidates.Count)];
            var point = spawnPoints[UnityEngine.Random.Range(0, spawnPoints.Count)];

            var instance = Instantiate(archetype.prefab, point.position, point.rotation);

            float healthMultiplier = 1f + healthScalePerRound * (currentRound - 1);
            float damageMultiplier = 1f + damageScalePerRound * (currentRound - 1);

            var scalable = instance.GetComponent<IRoundScalable>();
            scalable?.ApplyRoundScaling(archetype.baseHealth * healthMultiplier, archetype.baseDamage * damageMultiplier);

            OnEnemySpawned?.Invoke(instance, currentRound);
        }

        /// <summary>Call from your enemy's death handler so the spawner knows when the round is cleared.</summary>
        public void NotifyEnemyKilled()
        {
            enemiesAliveThisRound = Mathf.Max(0, enemiesAliveThisRound - 1);
        }

        public int GetCurrentRound() => currentRound;
    }

    /// <summary>Implement on your enemy prefab to receive scaled health/damage values per round.</summary>
    public interface IRoundScalable
    {
        void ApplyRoundScaling(float scaledHealth, float scaledDamage);
    }
}
