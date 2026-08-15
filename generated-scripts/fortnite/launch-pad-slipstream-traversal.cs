/*
 * ScripForge — Launch Pad & Slipstream Traversal
 * Pack: Fortnite Pack | Category: Movement
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Launch pad velocity arcs plus rift-slipstream trail movement, with a brief fall-damage negation window after either.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Movement
{
    /// <summary>
    /// Placed launch pad that grants an arced velocity impulse to anything that steps on it,
    /// and briefly negates fall damage on the resulting landing.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class LaunchPadTraversal : MonoBehaviour
    {
        public event Action<IFallDamageNegatable> OnLaunched;

        [Header("Launch Arc")]
        [SerializeField] private float _launchSpeed = 22f;
        [SerializeField] private float _launchAngleDegrees = 62f;
        [SerializeField] private Vector3 _forwardOverride = Vector3.forward;
        [SerializeField] private float _cooldown = 0.75f;
        [SerializeField] private LayerMask _affectedLayers;

        [Header("Fall Damage Negation")]
        [SerializeField] private float _negationWindowSeconds = 4f;

        private float _lastTriggerTime = -999f;

        private void OnTriggerEnter(Collider other)
        {
            if (Time.time - _lastTriggerTime < _cooldown) return;
            if (((1 << other.gameObject.layer) & _affectedLayers) == 0) return;

            IFallDamageNegatable target = other.GetComponent<IFallDamageNegatable>();
            if (target == null) return;

            Vector3 impulse = BuildLaunchVelocity();
            target.ApplyLaunchVelocity(impulse);
            target.GrantFallDamageNegation(_negationWindowSeconds);

            _lastTriggerTime = Time.time;
            OnLaunched?.Invoke(target);
        }

        private Vector3 BuildLaunchVelocity()
        {
            Vector3 forward = transform.TransformDirection(_forwardOverride.normalized);
            float radians = _launchAngleDegrees * Mathf.Deg2Rad;

            Vector3 horizontal = new Vector3(forward.x, 0f, forward.z).normalized * Mathf.Cos(radians);
            Vector3 vertical = Vector3.up * Mathf.Sin(radians);

            return (horizontal + vertical) * _launchSpeed;
        }
    }

    /// <summary>
    /// Rift-slipstream trail: a chained sequence of trigger volumes that pulls a player
    /// along a fixed path at high speed while inside, then hands off a launch-style exit
    /// impulse and a fall-damage negation window at the trail's end.
    /// </summary>
    public class SlipstreamTrail : MonoBehaviour
    {
        public event Action<IFallDamageNegatable> OnSlipstreamEntered;
        public event Action<IFallDamageNegatable> OnSlipstreamExited;

        [Header("Trail Path")]
        [SerializeField] private List<Vector3> _pathPoints = new List<Vector3>();
        [SerializeField] private float _travelSpeed = 40f;
        [SerializeField] private float _exitLaunchSpeed = 18f;
        [SerializeField] private float _negationWindowSeconds = 3f;

        private readonly Dictionary<IFallDamageNegatable, Coroutine> _activeRiders = new Dictionary<IFallDamageNegatable, Coroutine>();

        public void EnterSlipstream(IFallDamageNegatable rider)
        {
            if (rider == null || _pathPoints.Count < 2) return;
            if (_activeRiders.ContainsKey(rider)) return;

            OnSlipstreamEntered?.Invoke(rider);
            Coroutine routine = StartCoroutine(RideTrail(rider));
            _activeRiders[rider] = routine;
        }

        private IEnumerator RideTrail(IFallDamageNegatable rider)
        {
            for (int i = 0; i < _pathPoints.Count - 1; i++)
            {
                Vector3 start = _pathPoints[i];
                Vector3 end = _pathPoints[i + 1];
                float segmentDistance = Vector3.Distance(start, end);
                float segmentDuration = Mathf.Max(0.01f, segmentDistance / _travelSpeed);

                float elapsed = 0f;
                while (elapsed < segmentDuration)
                {
                    elapsed += Time.deltaTime;
                    float t = Mathf.Clamp01(elapsed / segmentDuration);
                    Vector3 position = Vector3.Lerp(start, end, t);
                    rider.SetPositionAlongTrail(position);
                    yield return null;
                }
            }

            Vector3 exitDirection = (_pathPoints[_pathPoints.Count - 1] - _pathPoints[_pathPoints.Count - 2]).normalized;
            rider.ApplyLaunchVelocity(exitDirection * _exitLaunchSpeed);
            rider.GrantFallDamageNegation(_negationWindowSeconds);

            _activeRiders.Remove(rider);
            OnSlipstreamExited?.Invoke(rider);
        }
    }

    /// <summary>Implemented by any character controller that can receive launch impulses and a fall-damage negation window.</summary>
    public interface IFallDamageNegatable
    {
        void ApplyLaunchVelocity(Vector3 impulseVelocity);
        void GrantFallDamageNegation(float durationSeconds);
        void SetPositionAlongTrail(Vector3 position);
    }
}
