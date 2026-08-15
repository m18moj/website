/*
 * ScripForge — Round Timer & Spike Phases
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Round clock, plant/defuse phase timers, overtime sudden-death handling.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

namespace ScripForge.Systems
{
    public enum RoundPhase
    {
        PreRound,
        Combat,
        DevicePlanted,
        DeviceDefused,
        RoundOver
    }

    /// <summary>
    /// Drives the master round clock: pre-round buy time, main combat timer, the
    /// plant->detonate window, defuse interaction handling, and overtime sudden-death rules.
    /// </summary>
    public class RoundTimerController : MonoBehaviour
    {
        [Header("Durations (seconds)")]
        public float preRoundDuration = 30f;
        public float combatPhaseDuration = 100f;
        public float deviceFuseDuration = 45f;
        public float defuseHoldDuration = 7f;
        public float defuseHalfDuration = 3.5f; // Time at which defuse becomes "half-defused" and can be resumed by anyone.

        [Header("Overtime")]
        public bool overtimeSuddenDeath = true;
        public float overtimeCombatDuration = 40f;

        public RoundPhase CurrentPhase { get; private set; } = RoundPhase.PreRound;
        public float PhaseTimeRemaining { get; private set; }
        public bool IsOvertime { get; private set; }
        public float DefuseProgress01 { get; private set; }

        public event Action<RoundPhase> OnPhaseChanged;
        public event Action OnDeviceDetonated;   // Attackers win if this fires uncontested.
        public event Action OnDeviceDefused;     // Defenders win.
        public event Action OnCombatTimeExpired;  // Defenders win by timeout (no plant).

        private Coroutine _activeRoutine;
        private bool _defusing;

        public void BeginRound(bool isOvertimeRound)
        {
            IsOvertime = isOvertimeRound;
            ChangeState(RoundPhase.PreRound, preRoundDuration, PreRoundRoutine());
        }

        private IEnumerator PreRoundRoutine()
        {
            yield return CountDown(preRoundDuration);
            float combatLength = IsOvertime && overtimeSuddenDeath ? overtimeCombatDuration : combatPhaseDuration;
            ChangeState(RoundPhase.Combat, combatLength, CombatRoutine(combatLength));
        }

        private IEnumerator CombatRoutine(float duration)
        {
            yield return CountDown(duration);
            // If nobody planted in time, defenders win by timeout.
            CurrentPhase = RoundPhase.RoundOver;
            OnCombatTimeExpired?.Invoke();
        }

        /// <summary>Call when the attacking side successfully plants the device mid-combat.</summary>
        public void NotifyDevicePlanted()
        {
            if (CurrentPhase != RoundPhase.Combat) return;
            if (_activeRoutine != null) StopCoroutine(_activeRoutine);
            ChangeState(RoundPhase.DevicePlanted, deviceFuseDuration, PlantedRoutine());
        }

        private IEnumerator PlantedRoutine()
        {
            yield return CountDown(deviceFuseDuration, ignoreDefuseInterrupt: true);
            if (CurrentPhase == RoundPhase.DevicePlanted)
            {
                CurrentPhase = RoundPhase.RoundOver;
                OnDeviceDetonated?.Invoke();
            }
        }

        /// <summary>Call every frame while a defender holds the defuse interaction; call with held=false on release.</summary>
        public void UpdateDefuseInteraction(bool held)
        {
            if (CurrentPhase != RoundPhase.DevicePlanted) return;
            _defusing = held;
        }

        private void Update()
        {
            if (CurrentPhase != RoundPhase.DevicePlanted) return;

            if (_defusing)
            {
                DefuseProgress01 = Mathf.Clamp01(DefuseProgress01 + Time.deltaTime / defuseHoldDuration);
                if (DefuseProgress01 >= 1f)
                {
                    CurrentPhase = RoundPhase.RoundOver;
                    OnDeviceDefused?.Invoke();
                }
            }
            // Progress persists (isn't reset) once past the half-defuse point, matching
            // typical tactical-shooter defuse-resume rules.
            else if (DefuseProgress01 < defuseHalfDuration / defuseHoldDuration)
            {
                DefuseProgress01 = Mathf.Max(0f, DefuseProgress01 - Time.deltaTime * 0.5f);
            }
        }

        private IEnumerator CountDown(float duration, bool ignoreDefuseInterrupt = false)
        {
            PhaseTimeRemaining = duration;
            while (PhaseTimeRemaining > 0f)
            {
                if (!ignoreDefuseInterrupt && CurrentPhase == RoundPhase.RoundOver)
                    yield break;
                PhaseTimeRemaining -= Time.deltaTime;
                yield return null;
            }
            PhaseTimeRemaining = 0f;
        }

        private void ChangeState(RoundPhase phase, float duration, IEnumerator routine)
        {
            CurrentPhase = phase;
            PhaseTimeRemaining = duration;
            OnPhaseChanged?.Invoke(phase);
            _activeRoutine = StartCoroutine(routine);
        }
    }
}
