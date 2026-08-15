/*
 * ScripForge — Weekly Bounty Board & Elimination Contracts
 * Pack: Fortnite Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Rotating bounty-board contracts for eliminating tagged players, with a bonus-XP payout on completion.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Progression
{
    public enum ContractStatus { Available, Active, Completed, Expired }

    [Serializable]
    public class BountyContract
    {
        public string ContractId;
        public string TargetPlayerId;
        public string TargetDisplayName;
        public int BonusXpReward;
        public ContractStatus Status = ContractStatus.Available;
    }

    // Placed once per game session/level. Rotates a fixed number of active contracts drawn from a
    // weekly pool, tracks completion via elimination reports, and grants a bonus-XP payout on success.
    public class WeeklyBountyBoardEliminationContracts : MonoBehaviour
    {
        public event Action<BountyContract> OnContractPosted;
        public event Action<BountyContract> OnContractCompleted;
        public event Action<BountyContract> OnContractExpired;

        [Header("Rotation")]
        [SerializeField] private int _maxActiveContracts = 3;
        [SerializeField] private float _contractLifetimeSeconds = 900f;
        [SerializeField] private int _defaultBonusXp = 250;

        private readonly List<BountyContract> _weeklyPool = new List<BountyContract>();
        private readonly List<BountyContract> _activeContracts = new List<BountyContract>();
        private readonly Dictionary<string, float> _postedTimestamps = new Dictionary<string, float>();

        public IReadOnlyList<BountyContract> ActiveContracts => _activeContracts;

        // Called once with the full weekly candidate list (e.g. fetched from a rotation config or backend).
        public void LoadWeeklyPool(List<(string playerId, string displayName)> candidates)
        {
            _weeklyPool.Clear();

            foreach (var candidate in candidates)
            {
                _weeklyPool.Add(new BountyContract
                {
                    ContractId = Guid.NewGuid().ToString("N"),
                    TargetPlayerId = candidate.playerId,
                    TargetDisplayName = candidate.displayName,
                    BonusXpReward = _defaultBonusXp,
                    Status = ContractStatus.Available
                });
            }
        }

        private void Update()
        {
            ExpireStaleContracts();

            if (_activeContracts.Count < _maxActiveContracts)
            {
                PostNextContract();
            }
        }

        private void PostNextContract()
        {
            BountyContract next = _weeklyPool.Find(c => c.Status == ContractStatus.Available);
            if (next == null) return;

            next.Status = ContractStatus.Active;
            _activeContracts.Add(next);
            _postedTimestamps[next.ContractId] = Time.time;

            OnContractPosted?.Invoke(next);
        }

        // Called by the elimination pipeline whenever any player is eliminated, regardless of whether
        // they happen to be a bounty target.
        public void ReportElimination(string eliminatedPlayerId)
        {
            BountyContract match = _activeContracts.Find(c => c.TargetPlayerId == eliminatedPlayerId);
            if (match == null) return;

            CompleteContract(match);
        }

        private void CompleteContract(BountyContract contract)
        {
            contract.Status = ContractStatus.Completed;
            _activeContracts.Remove(contract);
            _postedTimestamps.Remove(contract.ContractId);

            GrantBonusXp(contract.BonusXpReward);
            OnContractCompleted?.Invoke(contract);
        }

        private void ExpireStaleContracts()
        {
            for (int i = _activeContracts.Count - 1; i >= 0; i--)
            {
                BountyContract contract = _activeContracts[i];
                if (!_postedTimestamps.TryGetValue(contract.ContractId, out float postedAt)) continue;

                if (Time.time - postedAt >= _contractLifetimeSeconds)
                {
                    contract.Status = ContractStatus.Expired;
                    _activeContracts.RemoveAt(i);
                    _postedTimestamps.Remove(contract.ContractId);

                    OnContractExpired?.Invoke(contract);
                }
            }
        }

        // Hook point for the player progression/XP system; left as a simple log-style stub here.
        private void GrantBonusXp(int amount)
        {
            Debug.Log($"[BountyBoard] Awarding {amount} bonus XP for contract completion.");
        }
    }
}
