/*
 * ScripForge — Crafting & Upgrade Bench
 * Pack: Fortnite Pack | Category: Crafting
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Interactive bench station that upgrades a held weapon's rarity tier by consuming crafting materials.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Fortnite.Crafting
{
    public enum WeaponRarity
    {
        Common,
        Uncommon,
        Rare,
        Epic,
        Legendary
    }

    /// <summary>Minimal interface a weapon item must implement to be upgradeable at a bench.</summary>
    public interface IUpgradeableWeapon
    {
        WeaponRarity Rarity { get; }
        void SetRarity(WeaponRarity newRarity);
        string WeaponId { get; }
    }

    [System.Serializable]
    public struct MaterialCost
    {
        public string materialId;
        public int amount;
    }

    [System.Serializable]
    public struct UpgradeRecipe
    {
        public WeaponRarity fromRarity;
        public WeaponRarity toRarity;
        public List<MaterialCost> costs;
    }

    /// <summary>
    /// Placed in the world as an interactable station. Given a player's material inventory
    /// and a currently held weapon, attempts to upgrade the weapon one rarity tier using a
    /// configured recipe, deducting materials only on success.
    /// </summary>
    public class CraftingUpgradeBench : MonoBehaviour
    {
        [Header("Recipes")]
        [SerializeField] private List<UpgradeRecipe> recipes = new List<UpgradeRecipe>();

        [Header("Interaction")]
        [SerializeField] private float interactionRange = 3f;

        public delegate void UpgradeSucceededHandler(string weaponId, WeaponRarity newRarity);
        public event UpgradeSucceededHandler OnUpgradeSucceeded;
        public delegate void UpgradeFailedHandler(string reason);
        public event UpgradeFailedHandler OnUpgradeFailed;

        /// <summary>
        /// Attempts to upgrade the given weapon using materials drawn from the supplied inventory
        /// dictionary (materialId -> count). Materials are only deducted if the upgrade succeeds.
        /// </summary>
        public bool TryUpgrade(IUpgradeableWeapon weapon, Dictionary<string, int> playerMaterials, Transform playerTransform)
        {
            if (weapon == null)
            {
                OnUpgradeFailed?.Invoke("No weapon equipped.");
                return false;
            }

            if (playerTransform != null && Vector3.Distance(playerTransform.position, transform.position) > interactionRange)
            {
                OnUpgradeFailed?.Invoke("Too far from bench.");
                return false;
            }

            UpgradeRecipe? recipe = FindRecipe(weapon.Rarity);
            if (recipe == null)
            {
                OnUpgradeFailed?.Invoke("No upgrade available for this rarity.");
                return false;
            }

            if (!HasSufficientMaterials(recipe.Value, playerMaterials))
            {
                OnUpgradeFailed?.Invoke("Insufficient materials.");
                return false;
            }

            DeductMaterials(recipe.Value, playerMaterials);
            weapon.SetRarity(recipe.Value.toRarity);

            OnUpgradeSucceeded?.Invoke(weapon.WeaponId, recipe.Value.toRarity);
            return true;
        }

        private UpgradeRecipe? FindRecipe(WeaponRarity currentRarity)
        {
            foreach (var recipe in recipes)
            {
                if (recipe.fromRarity == currentRarity)
                    return recipe;
            }
            return null;
        }

        private bool HasSufficientMaterials(UpgradeRecipe recipe, Dictionary<string, int> playerMaterials)
        {
            if (recipe.costs == null)
                return true;

            foreach (var cost in recipe.costs)
            {
                if (!playerMaterials.TryGetValue(cost.materialId, out int owned) || owned < cost.amount)
                    return false;
            }
            return true;
        }

        private void DeductMaterials(UpgradeRecipe recipe, Dictionary<string, int> playerMaterials)
        {
            if (recipe.costs == null)
                return;

            foreach (var cost in recipe.costs)
            {
                playerMaterials[cost.materialId] -= cost.amount;
            }
        }

        /// <summary>Returns the material cost preview for a given rarity, or null if no recipe exists.</summary>
        public UpgradeRecipe? PreviewRecipeFor(WeaponRarity rarity)
        {
            return FindRecipe(rarity);
        }
    }
}
