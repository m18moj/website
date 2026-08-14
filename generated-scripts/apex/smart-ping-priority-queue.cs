/*
 * ScriptForge — Smart Ping Priority Queue
 * Pack: Apex Legends Pack | Category: Squad
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Context-ping system that scores, ranks and expires squad callouts so the most relevant ones surface first.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

public enum PingType { Enemy, Loot, Danger, Location, NeedAmmo, Rotate }

[Serializable]
public struct PingRequest
{
    public PingType type;
    public Vector3 worldPosition;
    public string requesterName;
    public float timestamp;
    public float priorityScore;
}

/// Collects incoming pings, scores them by type/urgency/recency, and exposes a ranked, de-duplicated queue for the HUD.
public class SmartPingPriorityQueue : MonoBehaviour
{
    [Header("Queue Limits")]
    [SerializeField] private int maxActivePings = 6;
    [SerializeField] private float pingLifetimeSeconds = 12f;
    [SerializeField] private float duplicateSuppressionRadius = 4f;

    [Header("Base Priority Weights (higher = more urgent)")]
    [SerializeField] private float enemyWeight = 100f;
    [SerializeField] private float dangerWeight = 90f;
    [SerializeField] private float needAmmoWeight = 40f;
    [SerializeField] private float lootWeight = 30f;
    [SerializeField] private float rotateWeight = 25f;
    [SerializeField] private float locationWeight = 15f;

    private readonly List<PingRequest> activeQueue = new List<PingRequest>();

    public event Action<PingRequest> OnPingEnqueued;
    public event Action<PingRequest> OnPingExpired;

    /// Call this whenever a player issues a context ping. Returns false if suppressed as a near-duplicate.
    public bool EnqueuePing(PingType type, Vector3 worldPosition, string requesterName)
    {
        if (IsNearDuplicate(type, worldPosition))
        {
            return false;
        }

        var ping = new PingRequest
        {
            type = type,
            worldPosition = worldPosition,
            requesterName = requesterName,
            timestamp = Time.time,
            priorityScore = GetBaseWeight(type)
        };

        activeQueue.Add(ping);
        EnforceCapacity();
        OnPingEnqueued?.Invoke(ping);
        return true;
    }

    private bool IsNearDuplicate(PingType type, Vector3 position)
    {
        foreach (var existing in activeQueue)
        {
            if (existing.type == type && Vector3.Distance(existing.worldPosition, position) <= duplicateSuppressionRadius)
            {
                return true;
            }
        }
        return false;
    }

    private float GetBaseWeight(PingType type)
    {
        switch (type)
        {
            case PingType.Enemy: return enemyWeight;
            case PingType.Danger: return dangerWeight;
            case PingType.NeedAmmo: return needAmmoWeight;
            case PingType.Loot: return lootWeight;
            case PingType.Rotate: return rotateWeight;
            default: return locationWeight;
        }
    }

    /// Drops the lowest-priority ping when the queue is over capacity, so the HUD never gets flooded.
    private void EnforceCapacity()
    {
        while (activeQueue.Count > maxActivePings)
        {
            var weakest = activeQueue.OrderBy(p => p.priorityScore).ThenBy(p => p.timestamp).First();
            activeQueue.Remove(weakest);
        }
    }

    private void Update()
    {
        float cutoff = Time.time - pingLifetimeSeconds;
        for (int i = activeQueue.Count - 1; i >= 0; i--)
        {
            if (activeQueue[i].timestamp < cutoff)
            {
                var expired = activeQueue[i];
                activeQueue.RemoveAt(i);
                OnPingExpired?.Invoke(expired);
            }
        }
    }

    /// Returns pings ranked highest priority first, freshest as a tiebreaker — feed this straight to your ping HUD.
    public IReadOnlyList<PingRequest> GetRankedPings()
    {
        return activeQueue
            .OrderByDescending(p => p.priorityScore)
            .ThenByDescending(p => p.timestamp)
            .ToList();
    }
}
