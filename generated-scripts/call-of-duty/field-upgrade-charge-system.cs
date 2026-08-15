/*
 * ScripForge — Field Upgrade Charge System
 * Pack: Call of Duty Pack | Category: Equipment
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A charge-based field upgrade system where equipment slowly regenerates a limited charge over time.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Equipment
{
    /// <summary>Config for a single field upgrade type, editable per-item as a ScriptableObject.</summary>
    [CreateAssetMenu(fileName = "FieldUpgradeDefinition", menuName = "ScripForge/Field Upgrade Definition")]
    public class FieldUpgradeDefinition : ScriptableObject
    {
        public string upgradeId;
        public string displayName;
        [TextArea] public string description;

        [Header("Charge Behaviour")]
        [Tooltip("Seconds required to regenerate one full charge from empty.")]
        public float secondsPerCharge = 90f;
        public int maxCharges = 1;
        [Tooltip("Charges consumed per activation.")]
        public int chargeCost = 1;
    }

    /// <summary>
    /// Tracks charge regeneration and activation for a player's equipped field upgrade.
    /// Attach to the player object alongside other equipment controllers.
    /// </summary>
    public class FieldUpgradeChargeSystem : MonoBehaviour
    {
        [SerializeField] private FieldUpgradeDefinition equippedUpgrade;
        [SerializeField] private float currentCharge;

        public event Action<float> OnChargeChanged;
        public event Action OnUpgradeActivated;
        public event Action OnChargeFull;

        private bool _wasFullLastFrame;

        private void Awake()
        {
            if (equippedUpgrade != null)
            {
                currentCharge = equippedUpgrade.maxCharges;
            }
        }

        private void Update()
        {
            if (equippedUpgrade == null) return;
            RegenerateCharge(Time.deltaTime);
        }

        /// <summary>Advances charge regeneration by the given time step; call manually if not using Update().</summary>
        public void RegenerateCharge(float deltaTime)
        {
            if (currentCharge >= equippedUpgrade.maxCharges) return;

            float regenPerSecond = 1f / Mathf.Max(0.01f, equippedUpgrade.secondsPerCharge);
            currentCharge = Mathf.Min(equippedUpgrade.maxCharges, currentCharge + regenPerSecond * deltaTime);
            OnChargeChanged?.Invoke(GetChargeFraction());

            bool isFullNow = currentCharge >= equippedUpgrade.maxCharges;
            if (isFullNow && !_wasFullLastFrame)
            {
                OnChargeFull?.Invoke();
            }
            _wasFullLastFrame = isFullNow;
        }

        public bool HasEnoughCharge()
        {
            return equippedUpgrade != null && currentCharge >= equippedUpgrade.chargeCost;
        }

        /// <summary>Attempts to activate the field upgrade, consuming charge cost on success.</summary>
        public bool TryActivate()
        {
            if (!HasEnoughCharge()) return false;

            currentCharge -= equippedUpgrade.chargeCost;
            _wasFullLastFrame = false;
            OnUpgradeActivated?.Invoke();
            OnChargeChanged?.Invoke(GetChargeFraction());
            return true;
        }

        /// <summary>Swaps the equipped field upgrade, resetting charge to zero for the new item.</summary>
        public void EquipUpgrade(FieldUpgradeDefinition newUpgrade)
        {
            equippedUpgrade = newUpgrade;
            currentCharge = 0f;
            _wasFullLastFrame = false;
            OnChargeChanged?.Invoke(GetChargeFraction());
        }

        public float GetChargeFraction()
        {
            if (equippedUpgrade == null || equippedUpgrade.maxCharges <= 0) return 0f;
            return currentCharge / equippedUpgrade.maxCharges;
        }

        public int GetWholeCharges() => equippedUpgrade == null ? 0 : Mathf.FloorToInt(currentCharge);
    }
}
