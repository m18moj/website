/*
 * ScripForge — Crafting Replicator & Rotation
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Timed crafting bundle rotation at replicators with material cost and queue-based crafting.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum CraftingBundleTier { Common, Rare, Epic, Legendary }

[Serializable]
public struct CraftingBundleDefinition
{
    public string bundleId;
    public string displayName;
    public CraftingBundleTier tier;
    public int materialCost;
    public float craftSeconds;
}

/// A single request sitting in a replicator's crafting queue.
public class CraftingQueueEntry
{
    public string requestId;
    public string bundleId;
    public string requestingPlayerId;
    public float remainingSeconds;
}

/// Drives one crafting replicator: a rotating shop of craftable bundles that refreshes on a timer,
/// a material-cost gate, and a queue so only one item crafts at a time per replicator.
public class CraftingReplicatorRotation : MonoBehaviour
{
    [Header("Bundle Catalog")]
    [SerializeField] private List<CraftingBundleDefinition> allBundles = new List<CraftingBundleDefinition>
    {
        new CraftingBundleDefinition { bundleId = "shield_battery_bundle", displayName = "Shield Battery x2", tier = CraftingBundleTier.Common,    materialCost = 30,  craftSeconds = 4f },
        new CraftingBundleDefinition { bundleId = "syringe_bundle",        displayName = "Syringe x4",        tier = CraftingBundleTier.Common,    materialCost = 20,  craftSeconds = 3f },
        new CraftingBundleDefinition { bundleId = "epic_body_shield",      displayName = "Epic Body Shield",  tier = CraftingBundleTier.Epic,      materialCost = 60,  craftSeconds = 6f },
        new CraftingBundleDefinition { bundleId = "legendary_armor",       displayName = "Legendary Evo Shell",tier = CraftingBundleTier.Legendary, materialCost = 120, craftSeconds = 10f },
        new CraftingBundleDefinition { bundleId = "sniper_ammo_bundle",    displayName = "Sniper Ammo x40",   tier = CraftingBundleTier.Rare,      materialCost = 35,  craftSeconds = 4f },
    };

    [Header("Rotation")]
    [SerializeField] private int rotationSlotCount = 4;
    [SerializeField] private float rotationIntervalSeconds = 300f;

    [Header("Queue")]
    [SerializeField] private int maxQueueLength = 3;

    public List<CraftingBundleDefinition> CurrentRotation { get; private set; } = new List<CraftingBundleDefinition>();
    public float TimeUntilNextRotationSeconds { get; private set; }

    private readonly List<CraftingQueueEntry> queue = new List<CraftingQueueEntry>();
    private readonly Dictionary<string, int> playerMaterials = new Dictionary<string, int>();
    private int nextRequestId = 1;

    public event Action<List<CraftingBundleDefinition>> OnRotationRefreshed;
    public event Action<string, string> OnCraftQueued; // requestId, bundleId
    public event Action<string, string, string> OnCraftCompleted; // requestId, bundleId, playerId
    public event Action<string> OnCraftRejectedInsufficientMaterials; // playerId

    private void Awake()
    {
        RefreshRotation();
    }

    private void Update()
    {
        TickRotationTimer();
        TickQueue();
    }

    private void TickRotationTimer()
    {
        TimeUntilNextRotationSeconds -= Time.deltaTime;
        if (TimeUntilNextRotationSeconds <= 0f)
        {
            RefreshRotation();
        }
    }

    private void RefreshRotation()
    {
        CurrentRotation.Clear();
        var pool = new List<CraftingBundleDefinition>(allBundles);

        for (int i = 0; i < rotationSlotCount && pool.Count > 0; i++)
        {
            int index = UnityEngine.Random.Range(0, pool.Count);
            CurrentRotation.Add(pool[index]);
            pool.RemoveAt(index);
        }

        TimeUntilNextRotationSeconds = rotationIntervalSeconds;
        OnRotationRefreshed?.Invoke(new List<CraftingBundleDefinition>(CurrentRotation));
    }

    public void DepositMaterials(string playerId, int amount)
    {
        if (!playerMaterials.ContainsKey(playerId)) playerMaterials[playerId] = 0;
        playerMaterials[playerId] += amount;
    }

    public int GetMaterialBalance(string playerId)
    {
        return playerMaterials.TryGetValue(playerId, out var amount) ? amount : 0;
    }

    /// Queues a craft request if the bundle is currently in rotation, the queue has room, and the
    /// player can afford the material cost. Materials are deducted immediately on queue entry.
    public bool TryQueueCraft(string playerId, string bundleId)
    {
        if (queue.Count >= maxQueueLength) return false;

        var bundle = FindInRotation(bundleId);
        if (bundle == null) return false;

        int balance = GetMaterialBalance(playerId);
        if (balance < bundle.Value.materialCost)
        {
            OnCraftRejectedInsufficientMaterials?.Invoke(playerId);
            return false;
        }

        playerMaterials[playerId] = balance - bundle.Value.materialCost;

        string requestId = "req_" + nextRequestId++;
        queue.Add(new CraftingQueueEntry
        {
            requestId = requestId,
            bundleId = bundleId,
            requestingPlayerId = playerId,
            remainingSeconds = bundle.Value.craftSeconds
        });

        OnCraftQueued?.Invoke(requestId, bundleId);
        return true;
    }

    private void TickQueue()
    {
        if (queue.Count == 0) return;

        var active = queue[0];
        active.remainingSeconds -= Time.deltaTime;

        if (active.remainingSeconds <= 0f)
        {
            queue.RemoveAt(0);
            OnCraftCompleted?.Invoke(active.requestId, active.bundleId, active.requestingPlayerId);
        }
    }

    public int QueueLength => queue.Count;

    public float GetActiveCraftRemainingSeconds()
    {
        return queue.Count > 0 ? queue[0].remainingSeconds : 0f;
    }

    private CraftingBundleDefinition? FindInRotation(string bundleId)
    {
        foreach (var bundle in CurrentRotation)
        {
            if (bundle.bundleId == bundleId) return bundle;
        }
        return null;
    }
}
