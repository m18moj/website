/*
 * ScripForge — Ground Loot & Contract System
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Battle-royale-style ground loot spawning paired with optional side-contract objectives that reward
 * players for taking on extra risk.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ScripForge.Systems
{
    public enum LootRarity { Common, Uncommon, Rare, Legendary }

    [Serializable]
    public class LootItem
    {
        public string itemId;
        public string displayName;
        public LootRarity rarity;
        public GameObject worldPrefab;
    }

    [Serializable]
    public class LootSpawnPoint
    {
        public Transform point;
        [Range(0f, 1f)] public float spawnChance = 0.65f;
        [HideInInspector] public bool isOccupied;
    }

    public enum ContractType
    {
        BountyElimination,
        SupplyRun,
        RecoverIntel,
        TimedSurvival
    }

    [Serializable]
    public class SideContract
    {
        public string contractId;
        public ContractType type;
        public string description;
        public Vector3 objectiveLocation;
        public float timeLimitSeconds;
        public int rewardCurrency;
        public string rewardItemId;
        [HideInInspector] public bool isActive;
        [HideInInspector] public bool isComplete;
        [HideInInspector] public float remainingTime;
    }

    /// <summary>
    /// Spawns weighted ground loot across registered points and manages optional side-contracts
    /// that players can accept for bonus rewards on top of standard looting.
    /// </summary>
    public class GroundLootContractSystem : MonoBehaviour
    {
        [Header("Loot Pool")]
        [SerializeField] private List<LootItem> lootPool = new List<LootItem>();
        [SerializeField] private List<LootSpawnPoint> spawnPoints = new List<LootSpawnPoint>();

        [Header("Rarity Weights")]
        [SerializeField] private float commonWeight = 60f;
        [SerializeField] private float uncommonWeight = 25f;
        [SerializeField] private float rareWeight = 12f;
        [SerializeField] private float legendaryWeight = 3f;

        [Header("Contracts")]
        [SerializeField] private List<SideContract> availableContracts = new List<SideContract>();
        [SerializeField] private List<SideContract> activeContracts = new List<SideContract>();

        public event Action<LootItem, Vector3> OnLootSpawned;
        public event Action<SideContract> OnContractAccepted;
        public event Action<SideContract> OnContractCompleted;
        public event Action<SideContract> OnContractExpired;

        private void Update()
        {
            for (int i = activeContracts.Count - 1; i >= 0; i--)
            {
                var contract = activeContracts[i];
                if (contract.timeLimitSeconds <= 0f) continue;

                contract.remainingTime -= Time.deltaTime;
                if (contract.remainingTime <= 0f && !contract.isComplete)
                {
                    contract.isActive = false;
                    activeContracts.RemoveAt(i);
                    OnContractExpired?.Invoke(contract);
                }
            }
        }

        /// <summary>Rolls loot for every unoccupied spawn point based on individual spawn chance and rarity weights.</summary>
        public void PopulateGroundLoot()
        {
            foreach (var spawn in spawnPoints)
            {
                if (spawn.isOccupied || spawn.point == null) continue;
                if (UnityEngine.Random.value > spawn.spawnChance) continue;

                var item = RollWeightedLoot();
                if (item == null) continue;

                spawn.isOccupied = true;
                OnLootSpawned?.Invoke(item, spawn.point.position);
            }
        }

        private LootItem RollWeightedLoot()
        {
            var rarity = RollRarity();
            var candidates = lootPool.Where(i => i.rarity == rarity).ToList();
            if (candidates.Count == 0) candidates = lootPool;
            return candidates.Count == 0 ? null : candidates[UnityEngine.Random.Range(0, candidates.Count)];
        }

        private LootRarity RollRarity()
        {
            float total = commonWeight + uncommonWeight + rareWeight + legendaryWeight;
            float roll = UnityEngine.Random.value * total;

            if (roll < commonWeight) return LootRarity.Common;
            roll -= commonWeight;
            if (roll < uncommonWeight) return LootRarity.Uncommon;
            roll -= uncommonWeight;
            if (roll < rareWeight) return LootRarity.Rare;
            return LootRarity.Legendary;
        }

        /// <summary>Accepts an optional side-contract, moving it from the available pool into active tracking.</summary>
        public bool AcceptContract(string contractId)
        {
            var contract = availableContracts.FirstOrDefault(c => c.contractId == contractId);
            if (contract == null) return false;

            availableContracts.Remove(contract);
            contract.isActive = true;
            contract.remainingTime = contract.timeLimitSeconds;
            activeContracts.Add(contract);
            OnContractAccepted?.Invoke(contract);
            return true;
        }

        public bool CompleteContract(string contractId)
        {
            var contract = activeContracts.FirstOrDefault(c => c.contractId == contractId);
            if (contract == null || contract.isComplete) return false;

            contract.isComplete = true;
            contract.isActive = false;
            activeContracts.Remove(contract);
            OnContractCompleted?.Invoke(contract);
            return true;
        }
    }
}
