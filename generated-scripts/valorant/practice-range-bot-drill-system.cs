/*
 * ScripForge — Practice Range Bot Drill System
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Configurable bot drill patterns (peek timing, flick targets) with an accuracy/reaction scorecard.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Valorant.Systems
{
    public enum DrillPatternType
    {
        PeekTiming,     // Bot repeatedly peeks a corner on a randomized delay.
        FlickTarget,     // Bot pops up at a random point within a spread for reaction-flick training.
        StrafeTrack       // Bot strafes across a lane for tracking practice.
    }

    [Serializable]
    public class DrillPatternConfig
    {
        public DrillPatternType type;
        public Transform[] peekPoints;
        [Tooltip("Random range (min, max) seconds a peek/pop-up bot waits before its next exposure.")]
        public Vector2 exposureDelayRange = new Vector2(0.8f, 2.2f);
        [Tooltip("Seconds the bot stays exposed before retreating if not eliminated.")]
        public float exposureDurationSeconds = 1.1f;
        public float strafeSpeed = 3.5f;
    }

    [Serializable]
    public class DrillResult
    {
        public int totalExposures;
        public int hits;
        public int misses;
        public float averageReactionTimeSeconds;
        public float accuracyPercent;
    }

    /// <summary>
    /// Drives a single practice-range training bot through a configurable drill pattern
    /// (peek timing, flick targets, or strafe tracking) and scores the attached player's
    /// hits, misses, and reaction time across the drill session.
    /// </summary>
    public class PracticeRangeBotDrillSystem : MonoBehaviour
    {
        [Header("Drill Setup")]
        [SerializeField] private DrillPatternConfig config;
        [SerializeField] private GameObject botVisual;
        [SerializeField] private float sessionDurationSeconds = 60f;

        public event Action<DrillResult> OnDrillSessionEnded;
        public event Action<bool, float> OnExposureResolved; // wasHit, reactionTimeSeconds

        private bool _sessionActive;
        private float _sessionTimer;
        private bool _botExposed;
        private float _exposureStartTime;
        private float _nextExposureTime;
        private int _currentPeekIndex;

        private readonly List<float> _reactionTimes = new List<float>();
        private int _hits;
        private int _misses;

        public void StartSession()
        {
            _sessionActive = true;
            _sessionTimer = 0f;
            _botExposed = false;
            _hits = 0;
            _misses = 0;
            _reactionTimes.Clear();
            ScheduleNextExposure();
        }

        public void StopSession()
        {
            if (!_sessionActive) return;
            _sessionActive = false;
            SetBotVisible(false);
            OnDrillSessionEnded?.Invoke(BuildResult());
        }

        private void Update()
        {
            if (!_sessionActive) return;

            _sessionTimer += Time.deltaTime;
            if (_sessionTimer >= sessionDurationSeconds)
            {
                StopSession();
                return;
            }

            switch (config.type)
            {
                case DrillPatternType.PeekTiming:
                case DrillPatternType.FlickTarget:
                    UpdatePeekOrFlickPattern();
                    break;

                case DrillPatternType.StrafeTrack:
                    UpdateStrafePattern();
                    break;
            }
        }

        private void UpdatePeekOrFlickPattern()
        {
            if (!_botExposed && Time.time >= _nextExposureTime)
            {
                ExposeBot();
            }
            else if (_botExposed && Time.time - _exposureStartTime >= config.exposureDurationSeconds)
            {
                ResolveExposure(wasHit: false); // timed out without being eliminated
            }
        }

        private void UpdateStrafePattern()
        {
            if (botVisual == null) return;
            botVisual.transform.Translate(Vector3.right * config.strafeSpeed * Time.deltaTime);
        }

        private void ExposeBot()
        {
            if (config.peekPoints != null && config.peekPoints.Length > 0)
            {
                _currentPeekIndex = UnityEngine.Random.Range(0, config.peekPoints.Length);
                var point = config.peekPoints[_currentPeekIndex];
                if (botVisual != null && point != null)
                    botVisual.transform.position = point.position;
            }

            _botExposed = true;
            _exposureStartTime = Time.time;
            SetBotVisible(true);
        }

        /// <summary>Call from the bot's damage handler when the player lands a hit on it.</summary>
        public void NotifyBotHit()
        {
            if (!_botExposed) return;
            ResolveExposure(wasHit: true);
        }

        private void ResolveExposure(bool wasHit)
        {
            float reactionTime = Time.time - _exposureStartTime;
            _botExposed = false;
            SetBotVisible(false);

            if (wasHit)
            {
                _hits++;
                _reactionTimes.Add(reactionTime);
            }
            else
            {
                _misses++;
            }

            OnExposureResolved?.Invoke(wasHit, reactionTime);
            ScheduleNextExposure();
        }

        private void ScheduleNextExposure()
        {
            float delay = UnityEngine.Random.Range(config.exposureDelayRange.x, config.exposureDelayRange.y);
            _nextExposureTime = Time.time + delay;
        }

        private void SetBotVisible(bool visible)
        {
            if (botVisual != null)
                botVisual.SetActive(visible);
        }

        private DrillResult BuildResult()
        {
            int totalExposures = _hits + _misses;
            float avgReaction = _reactionTimes.Count > 0 ? Average(_reactionTimes) : 0f;

            return new DrillResult
            {
                totalExposures = totalExposures,
                hits = _hits,
                misses = _misses,
                averageReactionTimeSeconds = avgReaction,
                accuracyPercent = totalExposures > 0 ? (_hits / (float)totalExposures) * 100f : 0f
            };
        }

        private float Average(List<float> values)
        {
            float sum = 0f;
            foreach (var v in values) sum += v;
            return sum / values.Count;
        }
    }
}
