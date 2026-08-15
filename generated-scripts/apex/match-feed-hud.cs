/*
 * ScripForge — Kill Feed & Squad Elims HUD
 * Pack: Apex Legends Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Live kill feed, squads-remaining counter, and elimination assist tracking.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum FeedEventType { Elimination, Knockdown, SquadWipe, AssistCredit }

[Serializable]
public struct FeedEntry
{
    public FeedEventType type;
    public string attackerName;
    public List<string> assistNames;
    public string victimName;
    public float timestamp;
}

public class MatchFeedHud : MonoBehaviour
{
    [Header("Feed Settings")]
    [SerializeField] private int maxVisibleEntries = 5;
    [SerializeField] private float entryLifetimeSeconds = 6f;

    [Header("Match State")]
    [SerializeField] private int startingSquadCount = 20;

    private readonly List<FeedEntry> feedEntries = new List<FeedEntry>();
    private readonly Dictionary<string, int> recentDamageContributors = new Dictionary<string, int>();
    private readonly Dictionary<string, int> playerElimCounts = new Dictionary<string, int>();

    public int SquadsRemaining { get; private set; }

    public event Action<FeedEntry> OnFeedEntryAdded;
    public event Action<int> OnSquadsRemainingChanged;

    private void Awake()
    {
        SquadsRemaining = startingSquadCount;
    }

    /// Tracks a damage instance so assists can be credited later, keyed by attacker name.
    public void RecordDamageContribution(string playerName, int damageAmount)
    {
        if (!recentDamageContributors.ContainsKey(playerName))
        {
            recentDamageContributors[playerName] = 0;
        }
        recentDamageContributors[playerName] += damageAmount;
    }

    /// Called when a player is knocked down — logs the feed entry and credits assists from recent damage.
    public void ReportKnockdown(string attackerName, string victimName)
    {
        List<string> assists = ResolveAssists(attackerName, victimName);
        AddFeedEntry(FeedEventType.Knockdown, attackerName, assists, victimName);
    }

    /// Called when a player is fully eliminated (not just knocked) — updates kill/assist counters.
    public void ReportElimination(string attackerName, string victimName, bool isFinalSquadMember)
    {
        List<string> assists = ResolveAssists(attackerName, victimName);
        AddFeedEntry(FeedEventType.Elimination, attackerName, assists, victimName);

        IncrementElimCount(attackerName);
        foreach (var assist in assists)
        {
            IncrementElimCount(assist, isElim: false);
        }

        recentDamageContributors.Remove(victimName);

        if (isFinalSquadMember)
        {
            AddFeedEntry(FeedEventType.SquadWipe, attackerName, assists, victimName);
            DecrementSquadsRemaining();
        }
    }

    private List<string> ResolveAssists(string attackerName, string victimName)
    {
        var assists = new List<string>();
        foreach (var kvp in recentDamageContributors)
        {
            if (kvp.Key != attackerName && kvp.Value > 0)
            {
                assists.Add(kvp.Key);
            }
        }
        return assists;
    }

    private void IncrementElimCount(string playerName, bool isElim = true)
    {
        if (!playerElimCounts.ContainsKey(playerName))
        {
            playerElimCounts[playerName] = 0;
        }
        if (isElim)
        {
            playerElimCounts[playerName]++;
        }
    }

    private void AddFeedEntry(FeedEventType type, string attacker, List<string> assists, string victim)
    {
        var entry = new FeedEntry
        {
            type = type,
            attackerName = attacker,
            assistNames = assists,
            victimName = victim,
            timestamp = Time.time
        };

        feedEntries.Add(entry);
        if (feedEntries.Count > maxVisibleEntries)
        {
            feedEntries.RemoveAt(0);
        }

        OnFeedEntryAdded?.Invoke(entry);
    }

    private void DecrementSquadsRemaining()
    {
        SquadsRemaining = Mathf.Max(0, SquadsRemaining - 1);
        OnSquadsRemainingChanged?.Invoke(SquadsRemaining);
    }

    /// Removes feed entries older than the configured lifetime — call periodically from Update.
    public void PruneExpiredEntries()
    {
        feedEntries.RemoveAll(e => Time.time - e.timestamp > entryLifetimeSeconds);
    }

    public int GetElimCount(string playerName)
    {
        return playerElimCounts.TryGetValue(playerName, out int count) ? count : 0;
    }

    public IReadOnlyList<FeedEntry> GetVisibleEntries() => feedEntries;
}
