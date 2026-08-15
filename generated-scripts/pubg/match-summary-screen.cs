/*
 * ScripForge — Chicken Dinner Summary Screen
 * Pack: PUBG Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Builds and broadcasts an end-of-match summary: placement rank, damage dealt, and survival time.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using UnrealEngine;

[Serializable]
public class MatchSummaryData
{
    public string playerName;
    public int placementRank;
    public int totalTeams;
    public float damageDealt;
    public int knockdowns;
    public int eliminations;
    public float survivalTimeSeconds;
    public bool isWinner;
}

public class MatchSummaryScreen : MonoBehaviour
{
    [Header("Match State Tracking")]
    [SerializeField] private string playerName = "Player";
    [SerializeField] private int totalTeams = 16;

    private float matchStartTime;
    private float damageDealtAccumulator;
    private int knockdownCount;
    private int eliminationCount;
    private bool matchEnded;

    public event Action<MatchSummaryData> OnSummaryReady;

    private void Awake()
    {
        matchStartTime = Time.time;
    }

    /// Call from the damage system whenever the local player deals damage to another player.
    public void RecordDamageDealt(float amount)
    {
        if (matchEnded) return;
        damageDealtAccumulator += Mathf.Max(0f, amount);
    }

    /// Call from the combat system when the local player knocks down or eliminates an opponent.
    public void RecordKnockdown()
    {
        if (matchEnded) return;
        knockdownCount++;
    }

    public void RecordElimination()
    {
        if (matchEnded) return;
        eliminationCount++;
    }

    /// Finalizes the match summary. Call this once, either on player death or when the match is won.
    public MatchSummaryData FinalizeMatch(int placementRank, bool isWinner)
    {
        if (matchEnded)
        {
            Debug.LogWarning("MatchSummaryScreen: FinalizeMatch called more than once; ignoring extra call.");
            return null;
        }

        matchEnded = true;

        var summary = new MatchSummaryData
        {
            playerName = playerName,
            placementRank = placementRank,
            totalTeams = totalTeams,
            damageDealt = damageDealtAccumulator,
            knockdowns = knockdownCount,
            eliminations = eliminationCount,
            survivalTimeSeconds = Time.time - matchStartTime,
            isWinner = isWinner
        };

        OnSummaryReady?.Invoke(summary);
        return summary;
    }

    /// Formats survival time as a human-readable "MMm SSs" string for display on the summary panel.
    public static string FormatSurvivalTime(float seconds)
    {
        int totalSeconds = Mathf.FloorToInt(seconds);
        int minutes = totalSeconds / 60;
        int secs = totalSeconds % 60;
        return $"{minutes:00}m {secs:00}s";
    }

    /// Produces the headline placement string, e.g. "#1 — WINNER WINNER" or "#7 / 16".
    public static string FormatPlacement(MatchSummaryData data)
    {
        return data.isWinner
            ? $"#1 of {data.totalTeams} — WINNER WINNER"
            : $"#{data.placementRank} of {data.totalTeams}";
    }

    public bool HasEnded => matchEnded;
}
