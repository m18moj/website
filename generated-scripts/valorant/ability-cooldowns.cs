/*
 * ScriptForge — Agent Ability Charge System
 * Pack: Valorant Pack | Category: Abilities
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Charge-based ability economy (signature free, others bought) with ultimate-point accrual.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Abilities
{
    public enum AbilityAcquisitionType
    {
        Signature,  // Regenerates for free over time / per round, no purchase needed.
        Purchased,  // Must be bought with in-match currency before it can be charged.
        Ultimate    // Charged via ultimate points, not credits.
    }

    [Serializable]
    public class AbilityDefinition
    {
        public string abilityId;
        public string displayName;
        public AbilityAcquisitionType type = AbilityAcquisitionType.Purchased;
        public int maxCharges = 1;
        public int purchaseCost = 200;
        [Tooltip("Signature-only: seconds between free charge regeneration.")]
        public float signatureRegenSeconds = 40f;
        [Tooltip("Ultimate-only: points required to unlock a single use.")]
        public int ultimateCost = 7;
    }

    /// <summary>
    /// Tracks per-agent ability charges, purchases, signature regeneration and ultimate point
    /// accrual. Attach one instance per player/agent controller.
    /// </summary>
    public class AbilityChargeSystem : MonoBehaviour
    {
        [Header("Kit")]
        public List<AbilityDefinition> kit = new List<AbilityDefinition>();

        [Header("Ultimate Points")]
        public int ultimatePoints;
        public int maxUltimatePoints = 12;

        public event Action<string, int> OnChargesChanged;   // abilityId, newChargeCount
        public event Action<int> OnUltimatePointsChanged;

        private readonly Dictionary<string, int> _charges = new Dictionary<string, int>();
        private readonly Dictionary<string, float> _signatureTimers = new Dictionary<string, float>();

        private void Awake()
        {
            foreach (var ability in kit)
            {
                _charges[ability.abilityId] = 0;
                if (ability.type == AbilityAcquisitionType.Signature)
                    _signatureTimers[ability.abilityId] = 0f;
            }
        }

        private void Update()
        {
            foreach (var ability in kit)
            {
                if (ability.type != AbilityAcquisitionType.Signature) continue;
                if (_charges[ability.abilityId] >= ability.maxCharges) continue;

                _signatureTimers[ability.abilityId] += Time.deltaTime;
                if (_signatureTimers[ability.abilityId] >= ability.signatureRegenSeconds)
                {
                    _signatureTimers[ability.abilityId] = 0f;
                    GrantCharge(ability.abilityId, 1);
                }
            }
        }

        /// <summary>Attempts to buy one charge of a purchasable ability using the supplied credit pool.</summary>
        public bool TryPurchase(string abilityId, ref int playerCredits)
        {
            var ability = kit.Find(a => a.abilityId == abilityId);
            if (ability == null || ability.type != AbilityAcquisitionType.Purchased) return false;
            if (_charges[abilityId] >= ability.maxCharges) return false;
            if (playerCredits < ability.purchaseCost) return false;

            playerCredits -= ability.purchaseCost;
            GrantCharge(abilityId, 1);
            return true;
        }

        /// <summary>Adds ultimate points (from kills, orbs, damage) and auto-consumes into a charge when threshold is met.</summary>
        public void AddUltimatePoints(int amount)
        {
            ultimatePoints = Mathf.Clamp(ultimatePoints + amount, 0, maxUltimatePoints);
            OnUltimatePointsChanged?.Invoke(ultimatePoints);

            var ultimate = kit.Find(a => a.type == AbilityAcquisitionType.Ultimate);
            if (ultimate != null && ultimatePoints >= ultimate.ultimateCost && _charges[ultimate.abilityId] < 1)
            {
                ultimatePoints -= ultimate.ultimateCost;
                GrantCharge(ultimate.abilityId, 1);
                OnUltimatePointsChanged?.Invoke(ultimatePoints);
            }
        }

        /// <summary>Consumes a charge if available; returns true on success (i.e. ability may now be cast).</summary>
        public bool TryConsumeCharge(string abilityId)
        {
            if (!_charges.ContainsKey(abilityId) || _charges[abilityId] <= 0) return false;
            _charges[abilityId]--;
            OnChargesChanged?.Invoke(abilityId, _charges[abilityId]);
            return true;
        }

        public int GetCharges(string abilityId) => _charges.TryGetValue(abilityId, out var c) ? c : 0;

        /// <summary>Called at round start to reset purchased/signature charges per economy rules.</summary>
        public void OnRoundStart(bool resetPurchasedCharges)
        {
            foreach (var ability in kit)
            {
                if (ability.type == AbilityAcquisitionType.Purchased && resetPurchasedCharges)
                {
                    _charges[ability.abilityId] = 0;
                }
            }
        }

        private void GrantCharge(string abilityId, int amount)
        {
            var ability = kit.Find(a => a.abilityId == abilityId);
            int max = ability != null ? ability.maxCharges : int.MaxValue;
            _charges[abilityId] = Mathf.Min(_charges[abilityId] + amount, max);
            OnChargesChanged?.Invoke(abilityId, _charges[abilityId]);
        }
    }
}
