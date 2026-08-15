/*
 * ScripForge — Vault Keycard & Boss Loot Room
 * Pack: Fortnite Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Keycard-gated vault rooms guarded by a mini-boss, ending in a high-tier loot-room reveal sequence.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Loot
{
    public enum VaultState { Locked, BossEncounter, Unsealing, Revealed }

    // Drives a single vault: door stays locked until the player holds the matching keycard, then a
    // mini-boss must be defeated before the loot room seal opens and high-tier items are revealed.
    public class VaultKeycardBossLootRoom : MonoBehaviour
    {
        public event Action<VaultState> OnVaultStateChanged;
        public event Action<List<GameObject>> OnLootRevealed;

        [Header("Access")]
        [SerializeField] private string _requiredKeycardId = "vault_keycard_01";
        [SerializeField] private Transform _vaultDoor;
        [SerializeField] private float _doorOpenSpeed = 1.5f;

        [Header("Boss Encounter")]
        [SerializeField] private GameObject _bossPrefab;
        [SerializeField] private Transform _bossSpawnPoint;
        private GameObject _activeBoss;
        private IVaultBoss _activeBossHandle;

        [Header("Loot Room")]
        [SerializeField] private List<Transform> _lootSpawnPoints = new List<Transform>();
        [SerializeField] private List<GameObject> _highTierLootPrefabs = new List<GameObject>();
        [SerializeField] private float _sealDissolveDuration = 2.5f;

        private VaultState _state = VaultState.Locked;
        public VaultState State => _state;

        // Called by the door interaction prompt when the player attempts entry with a specific keycard id.
        public bool TryUnlockWithKeycard(string keycardId)
        {
            if (_state != VaultState.Locked) return false;
            if (keycardId != _requiredKeycardId) return false;

            StartCoroutine(OpenDoorAndSpawnBoss());
            return true;
        }

        private IEnumerator OpenDoorAndSpawnBoss()
        {
            SetState(VaultState.BossEncounter);

            float t = 0f;
            Vector3 startPos = _vaultDoor.localPosition;
            Vector3 openPos = startPos + Vector3.up * 3f;

            while (t < 1f)
            {
                t += Time.deltaTime * _doorOpenSpeed;
                _vaultDoor.localPosition = Vector3.Lerp(startPos, openPos, t);
                yield return null;
            }

            SpawnBoss();
        }

        private void SpawnBoss()
        {
            if (_bossPrefab == null || _bossSpawnPoint == null) return;

            _activeBoss = Instantiate(_bossPrefab, _bossSpawnPoint.position, _bossSpawnPoint.rotation);
            _activeBossHandle = _activeBoss.GetComponent<IVaultBoss>();

            if (_activeBossHandle != null)
            {
                _activeBossHandle.OnDefeated += HandleBossDefeated;
            }
        }

        private void HandleBossDefeated()
        {
            if (_activeBossHandle != null)
            {
                _activeBossHandle.OnDefeated -= HandleBossDefeated;
            }

            StartCoroutine(UnsealAndRevealLoot());
        }

        // Dissolves the vault seal over time, then instantiates the high-tier loot drops on their spawn points.
        private IEnumerator UnsealAndRevealLoot()
        {
            SetState(VaultState.Unsealing);

            yield return new WaitForSeconds(_sealDissolveDuration);

            List<GameObject> spawnedLoot = new List<GameObject>();
            int prefabCount = _highTierLootPrefabs.Count;

            for (int i = 0; i < _lootSpawnPoints.Count && prefabCount > 0; i++)
            {
                GameObject prefab = _highTierLootPrefabs[i % prefabCount];
                GameObject spawned = Instantiate(prefab, _lootSpawnPoints[i].position, _lootSpawnPoints[i].rotation);
                spawnedLoot.Add(spawned);
            }

            SetState(VaultState.Revealed);
            OnLootRevealed?.Invoke(spawnedLoot);
        }

        private void SetState(VaultState newState)
        {
            _state = newState;
            OnVaultStateChanged?.Invoke(_state);
        }
    }

    // Implemented by the mini-boss actor spawned inside a vault encounter.
    public interface IVaultBoss
    {
        event Action OnDefeated;
    }
}
