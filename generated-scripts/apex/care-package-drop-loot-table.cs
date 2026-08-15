/*
 * ScripForge — Care Package Drop & Loot Table
 * Pack: Apex Legends Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * High-tier care package spawner with its own weighted loot table, separate from regular ground loot pools.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public struct LootTableEntry
{
    public string itemId;
    [Min(0f)] public float weight;
    public int minCount;
    public int maxCount;
}

[Serializable]
public struct RolledLootItem
{
    public string itemId;
    public int count;
}

/// Spawns a care package that free-falls in on a marker, then rolls its contents from a premium weighted loot table.
public class CarePackageDropLootTable : MonoBehaviour
{
    [Header("Drop Sequence")]
    [SerializeField] private float fallDuration = 6f;
    [SerializeField] private float dropHeight = 150f;
    [SerializeField] private AnimationCurve fallEase = AnimationCurve.EaseInOut(0, 0, 1, 1);

    [Header("Loot Table")]
    [SerializeField] private LootTableEntry[] lootTable = new LootTableEntry[]
    {
        new LootTableEntry { itemId = "care_package_weapon_gold", weight = 30f, minCount = 1, maxCount = 1 },
        new LootTableEntry { itemId = "care_package_armor_purple", weight = 25f, minCount = 1, maxCount = 1 },
        new LootTableEntry { itemId = "shield_cell_stack", weight = 20f, minCount = 2, maxCount = 4 },
        new LootTableEntry { itemId = "heat_shield", weight = 10f, minCount = 1, maxCount = 2 },
        new LootTableEntry { itemId = "ordnance_stack", weight = 15f, minCount = 1, maxCount = 3 },
    };
    [SerializeField] private int itemsPerPackage = 3;

    public event Action<Vector3> OnPackageIncoming;
    public event Action<List<RolledLootItem>> OnPackageLanded;

    private float totalWeight;

    private void Awake()
    {
        RecalculateTotalWeight();
    }

    private void RecalculateTotalWeight()
    {
        totalWeight = 0f;
        foreach (var entry in lootTable) totalWeight += entry.weight;
    }

    /// Kicks off a care package drop targeting worldTargetPosition; call from your zone/event director.
    public void BeginDrop(Vector3 worldTargetPosition, MonoBehaviour coroutineHost)
    {
        OnPackageIncoming?.Invoke(worldTargetPosition);
        coroutineHost.StartCoroutine(FallRoutine(worldTargetPosition));
    }

    private IEnumerator FallRoutine(Vector3 targetPosition)
    {
        Vector3 start = targetPosition + Vector3.up * dropHeight;
        float elapsed = 0f;

        while (elapsed < fallDuration)
        {
            elapsed += Time.deltaTime;
            float t = fallEase.Evaluate(Mathf.Clamp01(elapsed / fallDuration));
            transform.position = Vector3.Lerp(start, targetPosition, t);
            yield return null;
        }

        transform.position = targetPosition;
        var contents = RollLoot(itemsPerPackage);
        OnPackageLanded?.Invoke(contents);
    }

    /// Rolls `count` items from the weighted table using cumulative-weight selection, without removing entries between rolls.
    public List<RolledLootItem> RollLoot(int count)
    {
        var results = new List<RolledLootItem>();
        if (totalWeight <= 0f || lootTable.Length == 0) return results;

        for (int i = 0; i < count; i++)
        {
            float roll = UnityEngine.Random.value * totalWeight;
            float cumulative = 0f;

            foreach (var entry in lootTable)
            {
                cumulative += entry.weight;
                if (roll <= cumulative)
                {
                    int amount = UnityEngine.Random.Range(entry.minCount, entry.maxCount + 1);
                    results.Add(new RolledLootItem { itemId = entry.itemId, count = amount });
                    break;
                }
            }
        }

        return results;
    }
}
