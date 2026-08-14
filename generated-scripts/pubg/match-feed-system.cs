/*
 * ScriptForge — Kill Feed & Alive-Count HUD
 * Pack: PUBG Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Elimination feed, live players/teams-alive counter, and spectator-camera target cycling on death.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public class FeedEntry
{
    public string killerName;
    public string victimName;
    public string weaponName;
    public bool wasKnockdown;
    public float timestamp;
}

public class MatchFeedSystem : MonoBehaviour
{
    [Header("Feed Settings")]
    [SerializeField] private int maxFeedEntries = 6;
    [SerializeField] private float feedEntryLifetimeSeconds = 8f;

    [Header("Match Roster")]
    [SerializeField] private int totalPlayers = 64;
    [SerializeField] private int totalTeams = 16;

    public event Action<FeedEntry> OnFeedEntryAdded;
    public event Action<int, int> OnAliveCountChanged; // playersAlive, teamsAlive
    public event Action<string> OnSpectateTargetChanged;

    private readonly LinkedList<FeedEntry> feedEntries = new LinkedList<FeedEntry>();
    private int playersAlive;
    private int teamsAlive;

    private readonly List<string> spectatableTeammates = new List<string>();
    private int spectateIndex = -1;

    private void Awake()
    {
        playersAlive = totalPlayers;
        teamsAlive = totalTeams;
    }

    private void Update()
    {
        if (feedEntries.Count == 0) return;

        var node = feedEntries.First;
        while (node != null)
        {
            var next = node.Next;
            if (Time.time - node.Value.timestamp >= feedEntryLifetimeSeconds)
            {
                feedEntries.Remove(node);
            }
            node = next;
        }
    }

    /// Records an elimination or knockdown in the kill feed and updates alive counts on a full kill.
    public void ReportElimination(string killerName, string victimName, string weaponName, bool wasKnockdown, bool teamEliminated)
    {
        var entry = new FeedEntry
        {
            killerName = killerName,
            victimName = victimName,
            weaponName = weaponName,
            wasKnockdown = wasKnockdown,
            timestamp = Time.time
        };

        feedEntries.AddFirst(entry);
        while (feedEntries.Count > maxFeedEntries)
        {
            feedEntries.RemoveLast();
        }

        OnFeedEntryAdded?.Invoke(entry);

        if (!wasKnockdown)
        {
            playersAlive = Mathf.Max(0, playersAlive - 1);
            if (teamEliminated)
            {
                teamsAlive = Mathf.Max(0, teamsAlive - 1);
            }
            OnAliveCountChanged?.Invoke(playersAlive, teamsAlive);
        }
    }

    public IEnumerable<FeedEntry> GetActiveFeed() => feedEntries;
    public int PlayersAlive => playersAlive;
    public int TeamsAlive => teamsAlive;

    /// Sets the pool of teammate names available to cycle through once the local player has died.
    public void SetSpectatablePool(List<string> teammateNames)
    {
        spectatableTeammates.Clear();
        spectatableTeammates.AddRange(teammateNames);
        spectateIndex = spectatableTeammates.Count > 0 ? 0 : -1;

        if (spectateIndex >= 0)
        {
            OnSpectateTargetChanged?.Invoke(spectatableTeammates[spectateIndex]);
        }
    }

    /// Cycles to the next living spectate target, wrapping around the pool.
    public void CycleSpectateNext()
    {
        if (spectatableTeammates.Count == 0) return;
        spectateIndex = (spectateIndex + 1) % spectatableTeammates.Count;
        OnSpectateTargetChanged?.Invoke(spectatableTeammates[spectateIndex]);
    }

    public void CycleSpectatePrevious()
    {
        if (spectatableTeammates.Count == 0) return;
        spectateIndex = (spectateIndex - 1 + spectatableTeammates.Count) % spectatableTeammates.Count;
        OnSpectateTargetChanged?.Invoke(spectatableTeammates[spectateIndex]);
    }

    /// Removes a teammate from the spectate pool once they too have been eliminated.
    public void RemoveFromSpectatePool(string teammateName)
    {
        spectatableTeammates.Remove(teammateName);
        if (spectatableTeammates.Count > 0)
        {
            spectateIndex = Mathf.Clamp(spectateIndex, 0, spectatableTeammates.Count - 1);
            OnSpectateTargetChanged?.Invoke(spectatableTeammates[spectateIndex]);
        }
    }
}
