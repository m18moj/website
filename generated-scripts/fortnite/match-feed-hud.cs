/*
 * ScriptForge — Eliminations & Storm HUD
 * Pack: Fortnite Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Drives a live elimination feed, players-remaining counter and storm-timer overlay for a match HUD.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System.Collections.Generic;
using UnrealEngine;
using UnityEngine.UI;

namespace ScriptForge.Fortnite.HUD
{
    public class MatchFeedHud : MonoBehaviour
    {
        [Header("Elimination Feed")]
        [SerializeField] private Transform _feedContainer;
        [SerializeField] private GameObject _feedEntryPrefab;
        [SerializeField] private int _maxFeedEntries = 5;
        [SerializeField] private float _feedEntryLifetime = 6f;

        [Header("Players Remaining")]
        [SerializeField] private Text _playersRemainingLabel;
        [SerializeField] private int _startingPlayerCount = 100;
        private int _playersRemaining;

        [Header("Storm Timer")]
        [SerializeField] private Text _stormTimerLabel;
        [SerializeField] private Image _stormTimerFillBar;
        private float _stormPhaseDuration;
        private float _stormPhaseElapsed;
        private bool _stormTimerActive;

        private readonly Queue<GameObject> _activeFeedEntries = new Queue<GameObject>();
        private readonly List<PendingFeedRemoval> _pendingRemovals = new List<PendingFeedRemoval>();

        private struct PendingFeedRemoval
        {
            public GameObject Entry;
            public float RemoveAtTime;
        }

        private void Awake()
        {
            _playersRemaining = _startingPlayerCount;
            RefreshPlayersRemainingLabel();
        }

        private void Update()
        {
            TickFeedRemoval();
            TickStormTimer();
        }

        // Call when a player elimination occurs; pushes an entry into the feed and updates the remaining count.
        public void ReportElimination(string eliminatorName, string eliminatedName, string weaponName)
        {
            PushFeedEntry($"{eliminatorName} eliminated {eliminatedName} ({weaponName})");
            DecrementPlayersRemaining();
        }

        public void ReportKnockdown(string attackerName, string victimName)
        {
            PushFeedEntry($"{attackerName} knocked {victimName}");
        }

        private void PushFeedEntry(string message)
        {
            if (_feedContainer == null || _feedEntryPrefab == null) return;

            GameObject entry = Instantiate(_feedEntryPrefab, _feedContainer);
            Text label = entry.GetComponentInChildren<Text>();
            if (label != null) label.text = message;

            entry.transform.SetAsLastSibling();
            _activeFeedEntries.Enqueue(entry);
            _pendingRemovals.Add(new PendingFeedRemoval { Entry = entry, RemoveAtTime = Time.time + _feedEntryLifetime });

            while (_activeFeedEntries.Count > _maxFeedEntries)
            {
                GameObject oldest = _activeFeedEntries.Dequeue();
                if (oldest != null) Destroy(oldest);
            }
        }

        private void TickFeedRemoval()
        {
            for (int i = _pendingRemovals.Count - 1; i >= 0; i--)
            {
                if (Time.time >= _pendingRemovals[i].RemoveAtTime)
                {
                    if (_pendingRemovals[i].Entry != null) Destroy(_pendingRemovals[i].Entry);
                    _pendingRemovals.RemoveAt(i);
                }
            }
        }

        private void DecrementPlayersRemaining()
        {
            _playersRemaining = Mathf.Max(0, _playersRemaining - 1);
            RefreshPlayersRemainingLabel();
        }

        private void RefreshPlayersRemainingLabel()
        {
            if (_playersRemainingLabel != null)
            {
                _playersRemainingLabel.text = $"{_playersRemaining} Remaining";
            }
        }

        // Begins/refreshes the countdown overlay for the current storm phase.
        public void StartStormTimer(float phaseDuration)
        {
            _stormPhaseDuration = Mathf.Max(0.01f, phaseDuration);
            _stormPhaseElapsed = 0f;
            _stormTimerActive = true;
        }

        public void StopStormTimer()
        {
            _stormTimerActive = false;
        }

        private void TickStormTimer()
        {
            if (!_stormTimerActive) return;

            _stormPhaseElapsed += Time.deltaTime;
            float remaining = Mathf.Max(0f, _stormPhaseDuration - _stormPhaseElapsed);

            if (_stormTimerLabel != null)
            {
                int minutes = Mathf.FloorToInt(remaining / 60f);
                int seconds = Mathf.FloorToInt(remaining % 60f);
                _stormTimerLabel.text = $"{minutes:00}:{seconds:00}";
            }

            if (_stormTimerFillBar != null)
            {
                _stormTimerFillBar.fillAmount = 1f - Mathf.Clamp01(_stormPhaseElapsed / _stormPhaseDuration);
            }

            if (remaining <= 0f)
            {
                _stormTimerActive = false;
            }
        }
    }
}
