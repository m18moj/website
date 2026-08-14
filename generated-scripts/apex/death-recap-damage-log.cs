/*
 * ScriptForge — Death Recap & Damage Log
 * Pack: Apex Legends Pack | Category: Feedback
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Rolling damage log that assembles a post-death recap of who hit you, with what, and in what order.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

public enum HitLocation { Head, Body, Limb }
public enum DamageSource { Weapon, Ability, Environment, Fall, Fire }

[Serializable]
public struct DamageLogEntry
{
    public string attackerName;
    public string sourceName;      // Weapon or ability name.
    public DamageSource sourceType;
    public HitLocation hitLocation;
    public float amount;
    public float timestamp;
}

[Serializable]
public struct RecapSummaryLine
{
    public string attackerName;
    public float totalDamage;
    public int hitCount;
    public string mostUsedSource;
}

/// Tracks incoming damage over a rolling window and can compile it into a death recap on demand.
public class DeathRecapDamageLog : MonoBehaviour
{
    [Tooltip("Entries older than this are dropped so recaps only reflect the most recent fight.")]
    [SerializeField] private float retentionWindowSeconds = 25f;

    private readonly List<DamageLogEntry> log = new List<DamageLogEntry>();

    public event Action<DamageLogEntry> OnDamageRecorded;
    public event Action<List<RecapSummaryLine>> OnRecapReady;

    /// Call this from your damage pipeline every time this entity takes damage.
    public void RecordDamage(string attackerName, string sourceName, DamageSource sourceType, HitLocation hitLocation, float amount)
    {
        var entry = new DamageLogEntry
        {
            attackerName = attackerName,
            sourceName = sourceName,
            sourceType = sourceType,
            hitLocation = hitLocation,
            amount = amount,
            timestamp = Time.time
        };

        log.Add(entry);
        OnDamageRecorded?.Invoke(entry);
        PruneOldEntries();
    }

    /// Discards entries outside the retention window so a stray poke damage from minutes ago doesn't pollute a recap.
    private void PruneOldEntries()
    {
        float cutoff = Time.time - retentionWindowSeconds;
        log.RemoveAll(e => e.timestamp < cutoff);
    }

    /// Call this the moment the entity dies to freeze and broadcast the final recap.
    public List<RecapSummaryLine> GenerateRecap()
    {
        PruneOldEntries();

        var summary = log
            .GroupBy(e => e.attackerName)
            .Select(group => new RecapSummaryLine
            {
                attackerName = group.Key,
                totalDamage = group.Sum(e => e.amount),
                hitCount = group.Count(),
                mostUsedSource = group
                    .GroupBy(e => e.sourceName)
                    .OrderByDescending(g => g.Count())
                    .First().Key
            })
            .OrderByDescending(line => line.totalDamage)
            .ToList();

        OnRecapReady?.Invoke(summary);
        return summary;
    }

    /// Returns the raw ordered event list, useful for a chronological "hit timeline" UI.
    public IReadOnlyList<DamageLogEntry> GetChronologicalLog() => log.AsReadOnly();

    public void ClearLog()
    {
        log.Clear();
    }
}
