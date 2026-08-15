/*
 * ScripForge — Ability Combo Detector & Highlight
 * Pack: Valorant Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Detects chained multi-agent ability combos (setup plus follow-up kill) and flags them for a highlight reel.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Combat
{
    public enum SetupAbilityCategory { Stun, Blind, Slow, Reveal, Suppress }

    /// <summary>A single ability cast that could serve as the opening beat of a combo.</summary>
    public struct SetupEvent
    {
        public string casterId;
        public string targetId;      // Player affected by the setup (stunned/blinded/etc).
        public SetupAbilityCategory category;
        public float serverTime;
        public string abilityId;
    }

    public struct KillEvent
    {
        public string killerId;
        public string victimId;
        public float serverTime;
    }

    [Serializable]
    public class DetectedCombo
    {
        public string setupCasterId;
        public string killerId;
        public string victimId;
        public SetupAbilityCategory setupCategory;
        public float windowSeconds;
        public bool isSelfCombo; // Same player landed both the setup and the kill.
        public int highlightScore;
    }

    /// <summary>
    /// Watches for a setup ability (stun/blind/slow/reveal/suppress) landing on a player who is
    /// then eliminated shortly afterward, and flags the pair as a "combo" worth surfacing in an
    /// end-of-match highlight reel. Handles both two-agent combos (initiator sets up, teammate
    /// finishes) and solo combos (duelist blinds then kills the same target).
    /// </summary>
    public class AbilityComboDetectorHighlight : MonoBehaviour
    {
        [Header("Detection Window")]
        [Tooltip("Max seconds between a setup landing and the follow-up kill for it to still count as a combo.")]
        public float comboWindowSeconds = 3.5f;

        [Header("Scoring")]
        public int baseComboScore = 100;
        public int teamComboBonus = 40;      // Two different agents involved scores higher than a solo combo.
        [Tooltip("Extra score per stacked, still-active setup effect on the victim at the moment of death.")]
        public int multiSetupBonusPerStack = 25;

        public event Action<DetectedCombo> OnComboDetected;

        private readonly List<SetupEvent> _recentSetups = new List<SetupEvent>();

        /// <summary>Call whenever a stun/blind/slow/reveal/suppress ability successfully lands on a target.</summary>
        public void NotifySetupLanded(SetupEvent setupEvent)
        {
            _recentSetups.Add(setupEvent);
            PruneExpiredSetups(setupEvent.serverTime);
        }

        /// <summary>Call on every kill; checks the victim's recent setup history for a combo match.</summary>
        public void NotifyKill(KillEvent killEvent)
        {
            PruneExpiredSetups(killEvent.serverTime);

            List<SetupEvent> activeOnVictim = _recentSetups.FindAll(s =>
                s.targetId == killEvent.victimId &&
                killEvent.serverTime - s.serverTime <= comboWindowSeconds);

            if (activeOnVictim.Count == 0) return;

            // The most recent qualifying setup is treated as the "primary" combo partner for
            // attribution purposes, but every still-active setup contributes to the score.
            SetupEvent primary = activeOnVictim[0];
            foreach (var setup in activeOnVictim)
            {
                if (setup.serverTime > primary.serverTime) primary = setup;
            }

            var combo = new DetectedCombo
            {
                setupCasterId = primary.casterId,
                killerId = killEvent.killerId,
                victimId = killEvent.victimId,
                setupCategory = primary.category,
                windowSeconds = killEvent.serverTime - primary.serverTime,
                isSelfCombo = primary.casterId == killEvent.killerId,
            };

            combo.highlightScore = ComputeScore(combo, activeOnVictim.Count);
            OnComboDetected?.Invoke(combo);

            // Consumed setups shouldn't be reused to inflate a second, unrelated kill later.
            foreach (var setup in activeOnVictim) _recentSetups.Remove(setup);
        }

        private int ComputeScore(DetectedCombo combo, int stackedSetupCount)
        {
            int score = baseComboScore;
            if (!combo.isSelfCombo) score += teamComboBonus;
            score += Math.Max(0, stackedSetupCount - 1) * multiSetupBonusPerStack;

            // Faster follow-through reads as a cleaner, more deliberate combo.
            float speedFactor = Mathf.Clamp01(1f - (combo.windowSeconds / comboWindowSeconds));
            score += Mathf.RoundToInt(speedFactor * 30f);

            return score;
        }

        private void PruneExpiredSetups(float currentTime)
        {
            _recentSetups.RemoveAll(s => currentTime - s.serverTime > comboWindowSeconds);
        }
    }
}
