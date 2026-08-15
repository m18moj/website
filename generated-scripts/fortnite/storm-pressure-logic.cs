/*
 * ScripForge — Storm Circle & Damage Ticks
 * Pack: Fortnite Pack | Category: World
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Drives a shrinking-circle storm through timed phases with ramping tick damage outside the safe zone.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

namespace ScripForge.Fortnite.World
{
    [Serializable]
    public class StormPhase
    {
        public float WaitDuration;      // time before shrink begins
        public float ShrinkDuration;    // time spent shrinking
        public float TargetRadius;      // radius at end of this phase
        public float DamagePerTick;     // damage dealt per tick while phase is active
        public float TickInterval = 1f;
    }

    public class StormPressureLogic : MonoBehaviour
    {
        public event Action<int, StormPhase> OnPhaseStarted;
        public event Action<float, float> OnCircleUpdated; // (currentRadius, currentCenterBlendT)
        public event Action OnStormEnded;

        [Header("Circle Setup")]
        [SerializeField] private Vector3 _currentCenter;
        [SerializeField] private Vector3 _nextCenter;
        [SerializeField] private float _currentRadius = 1000f;

        [Header("Phases")]
        [SerializeField] private StormPhase[] _phases;

        [Header("Damage")]
        [SerializeField] private LayerMask _playerLayer;
        [SerializeField] private float _damageCheckRadius = 4000f;

        private int _currentPhaseIndex = -1;
        private Coroutine _stormRoutine;

        public float CurrentRadius => _currentRadius;
        public Vector3 CurrentCenter => _currentCenter;
        public int CurrentPhaseIndex => _currentPhaseIndex;

        public void BeginStorm()
        {
            if (_stormRoutine != null) StopCoroutine(_stormRoutine);
            _stormRoutine = StartCoroutine(RunPhases());
        }

        private IEnumerator RunPhases()
        {
            for (int i = 0; i < _phases.Length; i++)
            {
                _currentPhaseIndex = i;
                StormPhase phase = _phases[i];
                OnPhaseStarted?.Invoke(i, phase);

                // Pick a new inner circle center, biased to stay within the current circle.
                _nextCenter = PickNextCenter(_currentRadius, phase.TargetRadius);
                float startRadius = _currentRadius;
                Vector3 startCenter = _currentCenter;

                yield return new WaitForSeconds(phase.WaitDuration);

                float elapsed = 0f;
                Coroutine damageRoutine = StartCoroutine(TickDamageDuringPhase(phase));

                while (elapsed < phase.ShrinkDuration)
                {
                    elapsed += Time.deltaTime;
                    float t = Mathf.Clamp01(elapsed / phase.ShrinkDuration);

                    _currentRadius = Mathf.Lerp(startRadius, phase.TargetRadius, t);
                    _currentCenter = Vector3.Lerp(startCenter, _nextCenter, t);
                    OnCircleUpdated?.Invoke(_currentRadius, t);

                    yield return null;
                }

                _currentRadius = phase.TargetRadius;
                _currentCenter = _nextCenter;

                yield return damageRoutine; // keep ticking damage for remainder if it outlives the shrink
            }

            OnStormEnded?.Invoke();
        }

        // Applies ramping tick damage to anything outside the current circle for the duration of a phase.
        private IEnumerator TickDamageDuringPhase(StormPhase phase)
        {
            while (_currentPhaseIndex >= 0 && _phases[_currentPhaseIndex] == phase)
            {
                yield return new WaitForSeconds(phase.TickInterval);
                ApplyStormDamageTick(phase.DamagePerTick);
            }
        }

        private void ApplyStormDamageTick(float damage)
        {
            Collider[] hits = Physics.OverlapSphere(_currentCenter, _damageCheckRadius, _playerLayer);
            foreach (Collider hit in hits)
            {
                Vector3 flat = hit.transform.position;
                float dist = Vector3.Distance(new Vector3(flat.x, _currentCenter.y, flat.z), _currentCenter);

                if (dist > _currentRadius)
                {
                    IStormDamageable damageable = hit.GetComponent<IStormDamageable>();
                    damageable?.ApplyStormDamage(damage);
                }
            }
        }

        private Vector3 PickNextCenter(float fromRadius, float toRadius)
        {
            float maxOffset = Mathf.Max(0f, fromRadius - toRadius);
            Vector2 offset = UnityEngine.Random.insideUnitCircle * maxOffset;
            return _currentCenter + new Vector3(offset.x, 0f, offset.y);
        }
    }

    public interface IStormDamageable
    {
        void ApplyStormDamage(float amount);
    }
}
