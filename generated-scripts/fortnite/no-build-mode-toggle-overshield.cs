/*
 * ScripForge — No-Build Mode Toggle & Overshield
 * Pack: Fortnite Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A build-disable mode toggle paired with an overshield-only health model for arena-style playlists.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using UnrealEngine;

namespace ScripForge.Fortnite.Systems
{
    // Playlist-level toggle. When active, all build placement is blocked and health is replaced by a
    // shield-first overshield model instead of the standard health/shield split.
    public class NoBuildModeToggleOvershield : MonoBehaviour
    {
        public event Action<bool> OnNoBuildModeChanged;
        public event Action<float, float> OnOvershieldChanged; // current, max
        public event Action OnPlayerDowned;

        [Header("No-Build Mode")]
        [SerializeField] private bool _noBuildModeEnabled = true;
        [SerializeField] private IBuildBlocker[] _buildBlockers;

        [Header("Overshield Model")]
        [SerializeField] private float _maxOvershield = 150f;
        [SerializeField] private float _overshieldRegenPerSecond = 2f;
        [SerializeField] private float _regenDelayAfterDamage = 5f;

        private float _currentOvershield;
        private float _timeSinceLastDamage = 999f;

        public bool NoBuildModeEnabled => _noBuildModeEnabled;
        public float CurrentOvershield => _currentOvershield;
        public float MaxOvershield => _maxOvershield;

        private void Awake()
        {
            _currentOvershield = _maxOvershield;
            ApplyBuildBlockState();
        }

        private void Update()
        {
            _timeSinceLastDamage += Time.deltaTime;

            if (_timeSinceLastDamage >= _regenDelayAfterDamage && _currentOvershield < _maxOvershield)
            {
                RegenOvershield();
            }
        }

        public void SetNoBuildMode(bool enabled)
        {
            if (_noBuildModeEnabled == enabled) return;

            _noBuildModeEnabled = enabled;
            ApplyBuildBlockState();
            OnNoBuildModeChanged?.Invoke(_noBuildModeEnabled);
        }

        private void ApplyBuildBlockState()
        {
            if (_buildBlockers == null) return;

            foreach (IBuildBlocker blocker in _buildBlockers)
            {
                blocker?.SetBuildBlocked(_noBuildModeEnabled);
            }
        }

        // Overshield absorbs all incoming damage; there is no separate health pool while it remains above zero.
        public void ApplyDamage(float amount)
        {
            if (amount <= 0f) return;

            _timeSinceLastDamage = 0f;
            _currentOvershield = Mathf.Max(0f, _currentOvershield - amount);
            OnOvershieldChanged?.Invoke(_currentOvershield, _maxOvershield);

            if (_currentOvershield <= 0f)
            {
                OnPlayerDowned?.Invoke();
            }
        }

        private void RegenOvershield()
        {
            _currentOvershield = Mathf.Min(_maxOvershield, _currentOvershield + _overshieldRegenPerSecond * Time.deltaTime);
            OnOvershieldChanged?.Invoke(_currentOvershield, _maxOvershield);
        }

        public void RestoreOvershield(float amount)
        {
            _currentOvershield = Mathf.Min(_maxOvershield, _currentOvershield + amount);
            OnOvershieldChanged?.Invoke(_currentOvershield, _maxOvershield);
        }
    }

    // Implemented by build-placement controllers so this system can gate them centrally.
    public interface IBuildBlocker
    {
        void SetBuildBlocked(bool blocked);
    }
}
