/*
 * ScripForge — Evac Tower & Extraction Flow
 * Pack: Apex Legends Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Late-match evac ship tower activation, a timed extraction window, and survivor scoring on a successful dust-off.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum EvacTowerState { Dormant, Activating, Boarding, Departing, Departed }

[Serializable]
public struct EvacSurvivorEntry
{
    public string squadId;
    public string playerId;
    public bool boardedBeforeDeparture;
}

/// Drives a single late-match evac ship tower: activation charge-up, a boarding window, departure,
/// and a scoring callback for everyone who made it aboard before the doors closed.
public class EvacTowerExtractionFlow : MonoBehaviour
{
    [Header("Activation")]
    [Tooltip("Time required standing at the tower console before the ship begins boarding.")]
    [SerializeField] private float activationChargeSeconds = 6f;
    [SerializeField] private bool activationCancelsOnAllPlayersLeaving = true;

    [Header("Boarding Window")]
    [Tooltip("How long the ship stays docked and boardable once activation completes.")]
    [SerializeField] private float boardingWindowSeconds = 20f;
    [SerializeField] private int maxBoardingCapacity = 20;

    [Header("Departure")]
    [SerializeField] private float departureFlightSeconds = 8f;
    [SerializeField] private int survivorScoreBonus = 5;

    public EvacTowerState State { get; private set; } = EvacTowerState.Dormant;
    public float ActivationProgressSeconds { get; private set; }
    public float BoardingTimeRemainingSeconds { get; private set; }

    private readonly List<EvacSurvivorEntry> boardedSurvivors = new List<EvacSurvivorEntry>();
    private readonly HashSet<string> playersAtConsole = new HashSet<string>();
    private float departureElapsedSeconds;

    public event Action OnActivationStarted;
    public event Action OnActivationCancelled;
    public event Action OnBoardingOpened;
    public event Action<string> OnPlayerBoarded; // playerId
    public event Action OnDeparted;
    public event Action<List<EvacSurvivorEntry>, int> OnExtractionScored; // survivors, bonusPerPlayer

    private void Update()
    {
        switch (State)
        {
            case EvacTowerState.Activating:
                TickActivation();
                break;
            case EvacTowerState.Boarding:
                TickBoarding();
                break;
            case EvacTowerState.Departing:
                TickDeparture();
                break;
        }
    }

    /// Called while a player stands in the console trigger volume.
    public void EnterConsoleRange(string playerId)
    {
        playersAtConsole.Add(playerId);

        if (State == EvacTowerState.Dormant)
        {
            State = EvacTowerState.Activating;
            ActivationProgressSeconds = 0f;
            OnActivationStarted?.Invoke();
        }
    }

    /// Called when a player leaves the console trigger volume.
    public void ExitConsoleRange(string playerId)
    {
        playersAtConsole.Remove(playerId);

        if (State == EvacTowerState.Activating && activationCancelsOnAllPlayersLeaving && playersAtConsole.Count == 0)
        {
            State = EvacTowerState.Dormant;
            ActivationProgressSeconds = 0f;
            OnActivationCancelled?.Invoke();
        }
    }

    private void TickActivation()
    {
        if (playersAtConsole.Count == 0) return;

        ActivationProgressSeconds += Time.deltaTime;
        if (ActivationProgressSeconds >= activationChargeSeconds)
        {
            OpenBoarding();
        }
    }

    private void OpenBoarding()
    {
        State = EvacTowerState.Boarding;
        BoardingTimeRemainingSeconds = boardingWindowSeconds;
        boardedSurvivors.Clear();
        OnBoardingOpened?.Invoke();
    }

    private void TickBoarding()
    {
        BoardingTimeRemainingSeconds -= Time.deltaTime;
        if (BoardingTimeRemainingSeconds <= 0f)
        {
            BeginDeparture();
        }
    }

    /// Called when a player interacts with the boarding volume during the boarding window.
    public bool TryBoardPlayer(string squadId, string playerId)
    {
        if (State != EvacTowerState.Boarding) return false;
        if (boardedSurvivors.Count >= maxBoardingCapacity) return false;

        foreach (var entry in boardedSurvivors)
        {
            if (entry.playerId == playerId) return false; // already aboard
        }

        boardedSurvivors.Add(new EvacSurvivorEntry
        {
            squadId = squadId,
            playerId = playerId,
            boardedBeforeDeparture = true
        });
        OnPlayerBoarded?.Invoke(playerId);
        return true;
    }

    private void BeginDeparture()
    {
        State = EvacTowerState.Departing;
        departureElapsedSeconds = 0f;
    }

    private void TickDeparture()
    {
        departureElapsedSeconds += Time.deltaTime;
        if (departureElapsedSeconds >= departureFlightSeconds)
        {
            FinishDeparture();
        }
    }

    private void FinishDeparture()
    {
        State = EvacTowerState.Departed;
        OnDeparted?.Invoke();
        OnExtractionScored?.Invoke(new List<EvacSurvivorEntry>(boardedSurvivors), survivorScoreBonus);
    }

    public int BoardedSurvivorCount => boardedSurvivors.Count;

    public bool IsPlayerBoarded(string playerId)
    {
        foreach (var entry in boardedSurvivors)
        {
            if (entry.playerId == playerId) return true;
        }
        return false;
    }

    /// Resets the tower for a fresh match/prototype run.
    public void ResetTower()
    {
        State = EvacTowerState.Dormant;
        ActivationProgressSeconds = 0f;
        BoardingTimeRemainingSeconds = 0f;
        departureElapsedSeconds = 0f;
        boardedSurvivors.Clear();
        playersAtConsole.Clear();
    }
}
