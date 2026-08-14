/*
 * ScriptForge — Legend Select & Draft Lock
 * Pack: Apex Legends Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Pre-match character-select flow with per-player pick timers, lock-in confirmation, and duplicate-pick prevention.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

[Serializable]
public class PlayerSelection
{
    public string playerId;
    public string selectedCharacterId;
    public bool isLocked;
}

/// Drives the pre-match character select screen: selection, duplicate prevention, and a countdown that force-locks stragglers.
public class LegendSelectDraftLock : MonoBehaviour
{
    [Header("Draft Settings")]
    [SerializeField] private float selectionTimeLimit = 45f;
    [SerializeField] private bool allowDuplicatePicksAcrossSquad = false;

    private readonly Dictionary<string, PlayerSelection> selections = new Dictionary<string, PlayerSelection>();
    private readonly List<string> unpickedFallbackPool = new List<string>();

    private float remainingTime;
    private bool draftActive;

    public event Action<string, string> OnSelectionChanged; // playerId, characterId
    public event Action<string> OnPlayerLocked;
    public event Action OnAllPlayersLocked;
    public event Action<float> OnTimerTick;

    /// Call once at screen start with the roster of players and the pool of pickable character ids.
    public void BeginDraft(IEnumerable<string> playerIds, IEnumerable<string> availableCharacterIds)
    {
        selections.Clear();
        unpickedFallbackPool.Clear();
        unpickedFallbackPool.AddRange(availableCharacterIds);

        foreach (var id in playerIds)
        {
            selections[id] = new PlayerSelection { playerId = id, selectedCharacterId = null, isLocked = false };
        }

        remainingTime = selectionTimeLimit;
        draftActive = true;
        StartCoroutine(CountdownRoutine());
    }

    private IEnumerator CountdownRoutine()
    {
        while (draftActive && remainingTime > 0f)
        {
            remainingTime -= Time.deltaTime;
            OnTimerTick?.Invoke(Mathf.Max(0f, remainingTime));
            yield return null;
        }

        if (draftActive)
        {
            ForceLockRemaining();
        }
    }

    /// Attempts to select (not yet lock) a character. Fails silently if taken by a squadmate or the player already locked.
    public bool SelectCharacter(string playerId, string characterId)
    {
        if (!selections.TryGetValue(playerId, out var selection) || selection.isLocked)
        {
            return false;
        }

        if (!allowDuplicatePicksAcrossSquad && IsCharacterTakenByOther(playerId, characterId))
        {
            return false;
        }

        selection.selectedCharacterId = characterId;
        OnSelectionChanged?.Invoke(playerId, characterId);
        return true;
    }

    private bool IsCharacterTakenByOther(string playerId, string characterId)
    {
        return selections.Values.Any(s => s.playerId != playerId && s.selectedCharacterId == characterId && s.isLocked);
    }

    /// Confirms a player's current selection, locking it in permanently for this draft.
    public bool LockIn(string playerId)
    {
        if (!selections.TryGetValue(playerId, out var selection) || selection.isLocked || string.IsNullOrEmpty(selection.selectedCharacterId))
        {
            return false;
        }

        selection.isLocked = true;
        OnPlayerLocked?.Invoke(playerId);
        CheckAllLocked();
        return true;
    }

    /// When the timer runs out, auto-assign an unpicked character to anyone still undecided and lock everyone.
    private void ForceLockRemaining()
    {
        foreach (var selection in selections.Values)
        {
            if (selection.isLocked) continue;

            if (string.IsNullOrEmpty(selection.selectedCharacterId))
            {
                string fallback = unpickedFallbackPool.FirstOrDefault(c => !IsCharacterTakenByOther(selection.playerId, c));
                selection.selectedCharacterId = fallback;
                OnSelectionChanged?.Invoke(selection.playerId, fallback);
            }

            selection.isLocked = true;
            OnPlayerLocked?.Invoke(selection.playerId);
        }

        CheckAllLocked();
    }

    private void CheckAllLocked()
    {
        if (selections.Values.All(s => s.isLocked))
        {
            draftActive = false;
            OnAllPlayersLocked?.Invoke();
        }
    }

    public PlayerSelection GetSelection(string playerId) => selections.TryGetValue(playerId, out var s) ? s : null;
}
