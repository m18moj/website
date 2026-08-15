/*
 * ScripForge — Named Location Loot Tiering
 * Pack: Fortnite Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Assigns loot density/quality tiers to named points of interest and spawns loot accordingly.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Fortnite.Loot
{
    public enum LootTier
    {
        Low,
        Medium,
        High,
        Legendary
    }

    /// <summary>
    /// Defines a spawn-quality tier: how many loot spawn points to activate within a
    /// point-of-interest, and the rarity weighting applied to each spawn.
    /// </summary>
    [System.Serializable]
    public struct LootTierProfile
    {
        public LootTier tier;
        [Range(0f, 1f)] public float spawnPointActivationChance;
        public AnimationCurve raritySkew; // 0 = common-weighted, 1 = rare-weighted
        public int minItemsPerSpawnPoint;
        public int maxItemsPerSpawnPoint;
    }

    /// <summary>
    /// Attach to a root object representing a named location (e.g. a POI). Holds a set of
    /// child loot spawn points and, on match start, activates a subset of them based on the
    /// location's configured tier, so high-tier "hot drop" locations feel denser and richer
    /// than low-tier outskirts locations.
    /// </summary>
    public class NamedLocationLootTiering : MonoBehaviour
    {
        [Header("Location Identity")]
        [SerializeField] private string locationName = "Unnamed Location";
        [SerializeField] private LootTier tier = LootTier.Medium;

        [Header("Tier Profiles")]
        [SerializeField] private List<LootTierProfile> tierProfiles = new List<LootTierProfile>();

        [Header("Spawn Points")]
        [SerializeField] private List<Transform> lootSpawnPoints = new List<Transform>();

        [Header("Loot Table")]
        [Tooltip("Prefabs ordered from most common (index 0) to rarest (last index).")]
        [SerializeField] private List<GameObject> lootPrefabsByRarity = new List<GameObject>();

        public string LocationName => locationName;
        public LootTier Tier => tier;

        /// <summary>Call once at match/round start to populate this location's loot.</summary>
        public void PopulateLoot()
        {
            LootTierProfile profile = GetProfileForTier(tier);

            foreach (Transform spawnPoint in lootSpawnPoints)
            {
                if (Random.value > profile.spawnPointActivationChance)
                    continue; // this spawn point stays empty this round

                int itemCount = Random.Range(profile.minItemsPerSpawnPoint, profile.maxItemsPerSpawnPoint + 1);
                for (int i = 0; i < itemCount; i++)
                {
                    SpawnWeightedLoot(spawnPoint, profile);
                }
            }
        }

        private void SpawnWeightedLoot(Transform spawnPoint, LootTierProfile profile)
        {
            if (lootPrefabsByRarity.Count == 0)
                return;

            // Sample the rarity curve to bias which prefab index gets picked.
            float t = profile.raritySkew != null && profile.raritySkew.length > 0
                ? profile.raritySkew.Evaluate(Random.value)
                : Random.value;

            int index = Mathf.Clamp(Mathf.RoundToInt(t * (lootPrefabsByRarity.Count - 1)), 0, lootPrefabsByRarity.Count - 1);
            GameObject prefab = lootPrefabsByRarity[index];
            if (prefab == null)
                return;

            Vector3 offset = new Vector3(Random.Range(-0.5f, 0.5f), 0f, Random.Range(-0.5f, 0.5f));
            Instantiate(prefab, spawnPoint.position + offset, Quaternion.identity, spawnPoint);
        }

        private LootTierProfile GetProfileForTier(LootTier targetTier)
        {
            foreach (var p in tierProfiles)
            {
                if (p.tier == targetTier)
                    return p;
            }

            // Fallback: a conservative default profile if none configured for this tier.
            return new LootTierProfile
            {
                tier = targetTier,
                spawnPointActivationChance = 0.5f,
                raritySkew = AnimationCurve.Linear(0, 0, 1, 1),
                minItemsPerSpawnPoint = 1,
                maxItemsPerSpawnPoint = 1
            };
        }

        /// <summary>Clears all currently spawned loot instances at this location's spawn points.</summary>
        public void ClearLoot()
        {
            foreach (Transform spawnPoint in lootSpawnPoints)
            {
                for (int i = spawnPoint.childCount - 1; i >= 0; i--)
                {
                    Destroy(spawnPoint.GetChild(i).gameObject);
                }
            }
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = tier == LootTier.Legendary ? Color.red : tier == LootTier.High ? new Color(1f, 0.6f, 0f) : Color.yellow;
            foreach (Transform sp in lootSpawnPoints)
            {
                if (sp != null)
                    Gizmos.DrawWireSphere(sp.position, 0.4f);
            }
        }
    }
}
