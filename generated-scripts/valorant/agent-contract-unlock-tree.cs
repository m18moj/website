/*
 * ScripForge — Agent Contract Unlock Tree
 * Pack: Valorant Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * XP-gated agent contract tiers with cosmetic and agent-unlock rewards on tier completion.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Valorant.Progression
{
    public enum ContractRewardType
    {
        Cosmetic,
        AgentUnlock,
        Title,
        PlayerCard
    }

    [Serializable]
    public class ContractTierReward
    {
        public int tierIndex;
        [Tooltip("Total accumulated contract XP required to complete this tier.")]
        public int xpRequired;
        public ContractRewardType rewardType;
        public string rewardId;
        public string displayName;
    }

    [Serializable]
    public class AgentContract
    {
        public string contractId;
        public string agentId;
        public List<ContractTierReward> tiers = new List<ContractTierReward>();
        public int currentTierIndex;
        public int accumulatedXp;
        public bool isActive;
    }

    /// <summary>
    /// Manages a per-agent contract track: XP earned in-match accumulates toward the
    /// current tier's threshold, and completing a tier grants its reward and advances
    /// to the next tier automatically. Only one contract may be "active" (earning XP)
    /// at a time, matching the single active-contract convention.
    /// </summary>
    public class AgentContractUnlockTree : MonoBehaviour
    {
        [SerializeField] private List<AgentContract> contracts = new List<AgentContract>();
        [SerializeField] private int matchCompletionBonusXp = 500;

        public string ActiveContractId { get; private set; }

        public event Action<string, int> OnContractXpGained;              // contractId, xpDelta
        public event Action<string, ContractTierReward> OnTierCompleted;  // contractId, reward
        public event Action<string> OnContractFullyCompleted;

        /// <summary>Marks a contract as the active XP-earning track. Deactivates any other.</summary>
        public bool SetActiveContract(string contractId)
        {
            var contract = FindContract(contractId);
            if (contract == null) return false;

            foreach (var c in contracts)
                c.isActive = false;

            contract.isActive = true;
            ActiveContractId = contractId;
            return true;
        }

        /// <summary>Call after a match to grant contract XP to the currently active contract.</summary>
        public void GrantMatchXp(int baseXp, bool matchCompleted)
        {
            var contract = FindContract(ActiveContractId);
            if (contract == null) return;

            int totalXp = baseXp + (matchCompleted ? matchCompletionBonusXp : 0);
            ApplyXp(contract, totalXp);
        }

        /// <summary>Directly grants XP to a specific contract regardless of active state (e.g. weekly missions).</summary>
        public void GrantXpToContract(string contractId, int xpAmount)
        {
            var contract = FindContract(contractId);
            if (contract == null) return;
            ApplyXp(contract, xpAmount);
        }

        private void ApplyXp(AgentContract contract, int xpAmount)
        {
            if (contract.currentTierIndex >= contract.tiers.Count)
                return; // contract already fully completed

            contract.accumulatedXp += xpAmount;
            OnContractXpGained?.Invoke(contract.contractId, xpAmount);

            while (contract.currentTierIndex < contract.tiers.Count)
            {
                var tier = contract.tiers[contract.currentTierIndex];
                if (contract.accumulatedXp < tier.xpRequired)
                    break;

                CompleteTier(contract, tier);
            }
        }

        private void CompleteTier(AgentContract contract, ContractTierReward tier)
        {
            contract.currentTierIndex++;
            OnTierCompleted?.Invoke(contract.contractId, tier);

            if (contract.currentTierIndex >= contract.tiers.Count)
            {
                OnContractFullyCompleted?.Invoke(contract.contractId);
            }
        }

        /// <summary>Returns XP progress toward the next incomplete tier, or 1.0 if fully completed.</summary>
        public float GetTierProgressNormalized(string contractId)
        {
            var contract = FindContract(contractId);
            if (contract == null) return 0f;
            if (contract.currentTierIndex >= contract.tiers.Count) return 1f;

            var tier = contract.tiers[contract.currentTierIndex];
            int previousThreshold = contract.currentTierIndex > 0
                ? contract.tiers[contract.currentTierIndex - 1].xpRequired
                : 0;

            float span = tier.xpRequired - previousThreshold;
            float progress = contract.accumulatedXp - previousThreshold;
            return span <= 0f ? 1f : Mathf.Clamp01(progress / span);
        }

        private AgentContract FindContract(string contractId)
        {
            return contracts.Find(c => c.contractId == contractId);
        }
    }
}
