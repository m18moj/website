/*
 * ScriptForge — Objective Capture & Control
 * Pack: Call of Duty Pack | Category: Objective
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A domination-style capture point with contest states and team-count-based capture speed scaling.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Objectives
{
    public enum ObjectiveState
    {
        Neutral,
        CapturingTeamA,
        CapturingTeamB,
        OwnedTeamA,
        OwnedTeamB,
        Contested
    }

    /// <summary>
    /// A capturable control point. Players entering the trigger volume are registered via
    /// RegisterPlayer/UnregisterPlayer (hook these to a trigger collider on a child object).
    /// Capture progress scales with the number of uncontested capturing players.
    /// </summary>
    public class ObjectiveCaptureFlow : MonoBehaviour
    {
        [Header("Identity")]
        [SerializeField] private string objectivePointId = "A";

        [Header("Capture Tuning")]
        [SerializeField] private float baseCaptureRate = 10f; // progress points per second, single capturer
        [SerializeField] private float maxCaptureRateMultiplier = 2.5f;
        [SerializeField] private int playersForMaxMultiplier = 4;
        [SerializeField] private float captureThreshold = 100f;
        [SerializeField] private bool decayWhenEmpty = true;
        [SerializeField] private float decayRate = 5f;

        private float progress; // -threshold..+threshold, negative = team B owned direction
        private readonly HashSet<int> teamAPlayers = new HashSet<int>();
        private readonly HashSet<int> teamBPlayers = new HashSet<int>();

        public ObjectiveState CurrentState { get; private set; } = ObjectiveState.Neutral;

        public event Action<string, ObjectiveState> OnStateChanged;
        public event Action<string, float> OnProgressChanged;

        private void Update()
        {
            UpdateCaptureProgress(Time.deltaTime);
        }

        public void RegisterPlayer(int playerId, bool isTeamA)
        {
            (isTeamA ? teamAPlayers : teamBPlayers).Add(playerId);
        }

        public void UnregisterPlayer(int playerId, bool isTeamA)
        {
            (isTeamA ? teamAPlayers : teamBPlayers).Remove(playerId);
        }

        private void UpdateCaptureProgress(float deltaTime)
        {
            bool aPresent = teamAPlayers.Count > 0;
            bool bPresent = teamBPlayers.Count > 0;

            ObjectiveState previousState = CurrentState;

            if (aPresent && bPresent)
            {
                CurrentState = ObjectiveState.Contested;
                // Progress frozen while contested.
            }
            else if (aPresent)
            {
                CurrentState = ObjectiveState.CapturingTeamA;
                progress += CalculateRate(teamAPlayers.Count) * deltaTime;
            }
            else if (bPresent)
            {
                CurrentState = ObjectiveState.CapturingTeamB;
                progress -= CalculateRate(teamBPlayers.Count) * deltaTime;
            }
            else if (decayWhenEmpty)
            {
                progress = Mathf.MoveTowards(progress, 0f, decayRate * deltaTime);
                CurrentState = ResolveOwnedOrNeutralState();
            }

            progress = Mathf.Clamp(progress, -captureThreshold, captureThreshold);

            if (progress >= captureThreshold) CurrentState = ObjectiveState.OwnedTeamA;
            else if (progress <= -captureThreshold) CurrentState = ObjectiveState.OwnedTeamB;

            if (CurrentState != previousState)
            {
                OnStateChanged?.Invoke(objectivePointId, CurrentState);
            }

            OnProgressChanged?.Invoke(objectivePointId, progress);
        }

        private ObjectiveState ResolveOwnedOrNeutralState()
        {
            if (progress >= captureThreshold) return ObjectiveState.OwnedTeamA;
            if (progress <= -captureThreshold) return ObjectiveState.OwnedTeamB;
            return Mathf.Approximately(progress, 0f) ? ObjectiveState.Neutral : CurrentState;
        }

        private float CalculateRate(int capturingPlayerCount)
        {
            float t = Mathf.Clamp01((float)(capturingPlayerCount - 1) / Mathf.Max(1, playersForMaxMultiplier - 1));
            float multiplier = Mathf.Lerp(1f, maxCaptureRateMultiplier, t);
            return baseCaptureRate * multiplier;
        }

        public float GetNormalizedProgress() => progress / captureThreshold;

        public bool IsOwnedBy(bool teamA) =>
            teamA ? CurrentState == ObjectiveState.OwnedTeamA : CurrentState == ObjectiveState.OwnedTeamB;
    }
}
