/*
 * ScripForge — Weapon Recoil & Spray Pattern
 * Pack: Valorant Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Per-weapon spray-pattern recoil with reset timers and first-bullet accuracy.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System.Collections;
using UnrealEngine;

namespace ScripForge.Weapons
{
    /// <summary>
    /// Drives camera/aim-punch recoil for a firearm using a per-weapon spray pattern curve.
    /// Attach to the weapon or the player camera rig and feed it fire events.
    /// </summary>
    public class WeaponRecoilSystem : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("Transform that visually receives the recoil kick (usually the camera or weapon socket).")]
        public Transform recoilTarget;

        [Header("Spray Pattern")]
        [Tooltip("Sequence of horizontal/vertical offsets (in degrees) applied per consecutive shot.")]
        public Vector2[] sprayPattern = new Vector2[]
        {
            new Vector2(0f, 1.0f),
            new Vector2(0.2f, 1.4f),
            new Vector2(-0.3f, 1.8f),
            new Vector2(0.5f, 2.1f),
            new Vector2(-0.6f, 2.4f),
        };

        [Tooltip("Multiplier applied to every entry in the spray pattern.")]
        public float recoilStrength = 1f;

        [Header("Timing")]
        [Tooltip("Time (seconds) of no firing before the spray pattern index resets to zero.")]
        public float patternResetDelay = 0.35f;

        [Tooltip("How quickly the camera snaps to the new punch offset.")]
        public float snapSpeed = 25f;

        [Tooltip("How quickly the camera recovers back toward center after a punch.")]
        public float recoverySpeed = 6f;

        [Header("First Bullet Accuracy")]
        [Tooltip("If true, the first shot after a reset always fires perfectly on-target.")]
        public bool firstBulletAccuracy = true;

        private int _sprayIndex;
        private float _lastFireTime = -999f;
        private Vector3 _currentPunch;
        private Vector3 _targetPunch;
        private Coroutine _resetWatcher;

        private void Awake()
        {
            if (recoilTarget == null)
                recoilTarget = transform;
        }

        private void Update()
        {
            // Smoothly move toward the target punch (snap up), then let recovery pull it back to zero.
            _currentPunch = Vector3.Lerp(_currentPunch, _targetPunch, snapSpeed * Time.deltaTime);
            _targetPunch = Vector3.Lerp(_targetPunch, Vector3.zero, recoverySpeed * Time.deltaTime);

            recoilTarget.localRotation = Quaternion.Euler(_currentPunch);
        }

        /// <summary>
        /// Call this once per shot fired. Advances the spray pattern and applies the next kick.
        /// </summary>
        public void RegisterShot()
        {
            float timeSinceLast = Time.time - _lastFireTime;
            if (timeSinceLast >= patternResetDelay)
            {
                _sprayIndex = 0;
            }
            _lastFireTime = Time.time;

            bool isFirstShot = _sprayIndex == 0;

            if (isFirstShot && firstBulletAccuracy)
            {
                // No punch applied on the guaranteed-accurate first bullet.
                _sprayIndex++;
            }
            else
            {
                Vector2 offset = sprayPattern[Mathf.Min(_sprayIndex, sprayPattern.Length - 1)];
                _targetPunch += new Vector3(-offset.y, offset.x, 0f) * recoilStrength;
                _sprayIndex++;
            }

            if (_resetWatcher != null) StopCoroutine(_resetWatcher);
            _resetWatcher = StartCoroutine(WatchForPatternReset());
        }

        /// <summary>
        /// Returns the current normalized progress through the spray pattern (0 = fresh, 1 = pattern exhausted).
        /// Useful for UI crosshair spread indicators.
        /// </summary>
        public float GetPatternProgress01()
        {
            if (sprayPattern.Length == 0) return 0f;
            return Mathf.Clamp01((float)_sprayIndex / sprayPattern.Length);
        }

        /// <summary>
        /// Forces an immediate reset, e.g. on weapon swap or reload completion.
        /// </summary>
        public void ResetPattern()
        {
            _sprayIndex = 0;
            _targetPunch = Vector3.zero;
        }

        private IEnumerator WatchForPatternReset()
        {
            yield return new WaitForSeconds(patternResetDelay);
            if (Time.time - _lastFireTime >= patternResetDelay)
            {
                _sprayIndex = 0;
            }
        }
    }
}
