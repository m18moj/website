/*
 * ScripForge — Legend Synergy Duo Bonuses
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Detects complementary two-legend ability combos and grants a short synergy buff window when both land.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

[Serializable]
public struct SynergyPairDefinition
{
    public string abilityIdA;
    public string abilityIdB;
    public string buffId;
    public float buffDurationSeconds;
    [Range(1f, 3f)] public float buffPotencyMultiplier;
}

/// A pending half of a synergy combo: one ability has landed on a target and is waiting for its partner.
public class PendingSynergyLanding
{
    public string abilityId;
    public string casterId;
    public string targetId;
    public float expiresAt;
}

/// Watches for two complementary legend abilities landing on the same target within a short window and
/// grants both casters a combined synergy buff when the pair completes.
public class LegendSynergyDuoBonuses : MonoBehaviour
{
    [Header("Synergy Table")]
    [SerializeField] private List<SynergyPairDefinition> synergyPairs = new List<SynergyPairDefinition>();

    [Header("Combo Window")]
    [Tooltip("How long a landed ability stays eligible to be paired with its complementary half.")]
    [SerializeField] private float comboWindowSeconds = 4f;

    private readonly List<PendingSynergyLanding> pendingLandings = new List<PendingSynergyLanding>();
    private readonly Dictionary<string, float> activeBuffExpiry = new Dictionary<string, float>();

    public event Action<string, string, SynergyPairDefinition> OnSynergyTriggered; // casterA, casterB, definition
    public event Action<string> OnSynergyBuffExpired; // casterId

    private void Update()
    {
        PruneExpiredLandings();
        PruneExpiredBuffs();
    }

    /// Reports that abilityId from casterId landed a hit on targetId. Checks pending landings for a matching partner.
    public void ReportAbilityLanded(string abilityId, string casterId, string targetId)
    {
        var match = FindComplementaryPending(abilityId, targetId);
        if (match != null)
        {
            var definition = FindPairDefinition(match.abilityId, abilityId);
            pendingLandings.Remove(match);

            if (definition.HasValue && match.casterId != casterId)
            {
                TriggerSynergy(match.casterId, casterId, definition.Value);
                return;
            }
        }

        pendingLandings.Add(new PendingSynergyLanding
        {
            abilityId = abilityId,
            casterId = casterId,
            targetId = targetId,
            expiresAt = Time.time + comboWindowSeconds
        });
    }

    private PendingSynergyLanding FindComplementaryPending(string incomingAbilityId, string targetId)
    {
        foreach (var pending in pendingLandings)
        {
            if (pending.targetId != targetId) continue;
            if (FindPairDefinition(pending.abilityId, incomingAbilityId).HasValue)
            {
                return pending;
            }
        }
        return null;
    }

    private SynergyPairDefinition? FindPairDefinition(string abilityIdA, string abilityIdB)
    {
        foreach (var pair in synergyPairs)
        {
            bool forwardMatch = pair.abilityIdA == abilityIdA && pair.abilityIdB == abilityIdB;
            bool reverseMatch = pair.abilityIdA == abilityIdB && pair.abilityIdB == abilityIdA;
            if (forwardMatch || reverseMatch) return pair;
        }
        return null;
    }

    private void TriggerSynergy(string casterA, string casterB, SynergyPairDefinition definition)
    {
        float expiry = Time.time + definition.buffDurationSeconds;
        activeBuffExpiry[BuffKey(casterA, definition.buffId)] = expiry;
        activeBuffExpiry[BuffKey(casterB, definition.buffId)] = expiry;

        OnSynergyTriggered?.Invoke(casterA, casterB, definition);
    }

    private string BuffKey(string casterId, string buffId) => casterId + ":" + buffId;

    private void PruneExpiredLandings()
    {
        pendingLandings.RemoveAll(p => Time.time >= p.expiresAt);
    }

    private void PruneExpiredBuffs()
    {
        var expiredKeys = new List<string>();
        foreach (var kvp in activeBuffExpiry)
        {
            if (Time.time >= kvp.Value)
            {
                expiredKeys.Add(kvp.Key);
            }
        }

        foreach (var key in expiredKeys)
        {
            activeBuffExpiry.Remove(key);
            int separatorIndex = key.IndexOf(':');
            string casterId = separatorIndex >= 0 ? key.Substring(0, separatorIndex) : key;
            OnSynergyBuffExpired?.Invoke(casterId);
        }
    }

    /// Returns true and the potency multiplier if casterId currently holds an active synergy buff of buffId.
    public bool TryGetActiveBuffPotency(string casterId, string buffId, out float potencyMultiplier)
    {
        potencyMultiplier = 1f;
        if (!activeBuffExpiry.ContainsKey(BuffKey(casterId, buffId))) return false;

        foreach (var pair in synergyPairs)
        {
            if (pair.buffId == buffId)
            {
                potencyMultiplier = pair.buffPotencyMultiplier;
                return true;
            }
        }
        return false;
    }
}
