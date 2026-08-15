/*
 * ScripForge — Arena Round Draft & Bans
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Best-of-X arena round structure with a pre-round weapon and ability ban/pick draft phase.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

public enum ArenaMatchPhase { Idle, Draft, RoundActive, RoundEnd, MatchComplete }
public enum DraftActionType { Ban, Pick }

[Serializable]
public struct DraftAction
{
    public string teamId;
    public DraftActionType actionType;
    public string entryId; // Weapon id or ability id, depending on actionType's pool.
}

public class ArenaRoundDraftBans : MonoBehaviour
{
    [Header("Match Structure")]
    [Tooltip("Rounds needed to win the match; e.g. 3 for best-of-5.")]
    [SerializeField] private int roundsToWin = 3;

    [Header("Draft Order")]
    [Tooltip("Sequence of ban/pick steps every team works through before each round, alternating by team turn.")]
    [SerializeField] private List<DraftActionType> draftSequence = new List<DraftActionType>
    {
        DraftActionType.Ban, DraftActionType.Ban, DraftActionType.Pick, DraftActionType.Pick
    };
    [SerializeField] private float draftStepTimeLimit = 15f;

    private readonly List<string> teamIds = new List<string>();
    private readonly Dictionary<string, int> roundsWon = new Dictionary<string, int>();
    private readonly List<DraftAction> currentDraftActions = new List<DraftAction>();
    private readonly HashSet<string> globallyBannedEntries = new HashSet<string>();

    private int draftStepIndex;
    private int draftTeamTurn;
    private int currentRoundNumber;

    public ArenaMatchPhase Phase { get; private set; } = ArenaMatchPhase.Idle;
    public float DraftStepTimeRemaining { get; private set; }

    public event Action<int> OnDraftStepStarted; // step index
    public event Action<DraftAction> OnDraftActionResolved;
    public event Action OnDraftComplete;
    public event Action<int> OnRoundStarted;
    public event Action<string, int> OnRoundWon; // teamId, roundsWonSoFar
    public event Action<string> OnMatchWon;

    /// Begins a new best-of-X match between the given teams, resetting all round and ban state.
    public void BeginMatch(IEnumerable<string> participantTeamIds)
    {
        teamIds.Clear();
        roundsWon.Clear();
        globallyBannedEntries.Clear();
        currentRoundNumber = 0;

        foreach (var teamId in participantTeamIds)
        {
            teamIds.Add(teamId);
            roundsWon[teamId] = 0;
        }

        StartNextRound();
    }

    private void StartNextRound()
    {
        currentRoundNumber++;
        currentDraftActions.Clear();
        draftStepIndex = 0;
        draftTeamTurn = (currentRoundNumber - 1) % Mathf.Max(1, teamIds.Count);

        Phase = ArenaMatchPhase.Draft;
        BeginDraftStep();
    }

    private void BeginDraftStep()
    {
        DraftStepTimeRemaining = draftStepTimeLimit;
        OnDraftStepStarted?.Invoke(draftStepIndex);
        StartCoroutine(DraftStepTimeoutRoutine(draftStepIndex));
    }

    private IEnumerator DraftStepTimeoutRoutine(int stepIndexAtStart)
    {
        while (DraftStepTimeRemaining > 0f && draftStepIndex == stepIndexAtStart && Phase == ArenaMatchPhase.Draft)
        {
            DraftStepTimeRemaining -= Time.deltaTime;
            yield return null;
        }

        // Auto-skip a team that fails to act in time so the draft never stalls the match.
        if (Phase == ArenaMatchPhase.Draft && draftStepIndex == stepIndexAtStart)
        {
            AdvanceDraftStep();
        }
    }

    /// Submits a ban or pick for the active team's current draft step. Ignored if it's out of turn or wrong action type.
    public bool SubmitDraftAction(string teamId, string entryId)
    {
        if (Phase != ArenaMatchPhase.Draft) return false;
        if (teamIds[draftTeamTurn] != teamId) return false;

        var expectedType = draftSequence[draftStepIndex % draftSequence.Count];
        var action = new DraftAction { teamId = teamId, actionType = expectedType, entryId = entryId };

        if (expectedType == DraftActionType.Ban)
        {
            globallyBannedEntries.Add(entryId);
        }

        currentDraftActions.Add(action);
        OnDraftActionResolved?.Invoke(action);
        AdvanceDraftStep();
        return true;
    }

    private void AdvanceDraftStep()
    {
        draftStepIndex++;
        draftTeamTurn = (draftTeamTurn + 1) % Mathf.Max(1, teamIds.Count);

        if (draftStepIndex >= draftSequence.Count * teamIds.Count)
        {
            Phase = ArenaMatchPhase.RoundActive;
            OnDraftComplete?.Invoke();
            OnRoundStarted?.Invoke(currentRoundNumber);
        }
        else
        {
            BeginDraftStep();
        }
    }

    /// Call when the arena round's win condition (last team/player standing) resolves.
    public void ReportRoundWinner(string teamId)
    {
        if (Phase != ArenaMatchPhase.RoundActive) return;

        roundsWon[teamId] = roundsWon.TryGetValue(teamId, out int current) ? current + 1 : 1;
        Phase = ArenaMatchPhase.RoundEnd;
        OnRoundWon?.Invoke(teamId, roundsWon[teamId]);

        if (roundsWon[teamId] >= roundsToWin)
        {
            Phase = ArenaMatchPhase.MatchComplete;
            OnMatchWon?.Invoke(teamId);
        }
        else
        {
            StartNextRound();
        }
    }

    public bool IsEntryBanned(string entryId) => globallyBannedEntries.Contains(entryId);

    public int GetRoundsWon(string teamId) => roundsWon.TryGetValue(teamId, out int count) ? count : 0;
}
