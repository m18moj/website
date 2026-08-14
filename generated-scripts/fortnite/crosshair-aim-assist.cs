/*
 * ScriptForge — Controller Aim Assist Curve
 * Pack: Fortnite Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Bloom-aware controller aim assist: friction-based slowdown and gentle magnetism when a target enters the reticle zone.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Fortnite.Combat
{
    public class CrosshairAimAssist : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Camera _playerCamera;
        [SerializeField] private LayerMask _targetLayer;

        [Header("Assist Zone")]
        [Tooltip("Radius in viewport-space (0-1) around the crosshair where assist can trigger.")]
        [SerializeField] private float _assistRadius = 0.08f;
        [SerializeField] private float _assistMaxDistance = 120f;

        [Header("Slowdown-on-Target")]
        [Tooltip("Curve mapping distance-from-center (0=center,1=edge of assist zone) to look-speed multiplier.")]
        [SerializeField] private AnimationCurve _slowdownCurve = AnimationCurve.EaseInOut(0f, 0.35f, 1f, 1f);
        [SerializeField] private float _baseLookSpeed = 1f;

        [Header("Magnetism")]
        [SerializeField] private float _magnetStrength = 0.15f;
        [SerializeField] private AnimationCurve _magnetFalloff = AnimationCurve.EaseInOut(0f, 1f, 1f, 0f);

        [Header("Bloom Awareness")]
        [Tooltip("Assist strength is scaled down as weapon bloom/spread increases, to avoid over-correcting on inaccurate weapons.")]
        [SerializeField] private AnimationCurve _bloomAssistScale = AnimationCurve.Linear(0f, 1f, 1f, 0.3f);

        private Transform _currentTarget;

        // Returns the modified look input for this frame, applying slowdown and magnetism toward the best target.
        public Vector2 ProcessLookInput(Vector2 rawLookInput, float currentWeaponBloom01)
        {
            _currentTarget = FindBestTarget();

            if (_currentTarget == null)
            {
                return rawLookInput * _baseLookSpeed;
            }

            Vector2 viewportPos = _playerCamera.WorldToViewportPoint(_currentTarget.position);
            Vector2 center = new Vector2(0.5f, 0.5f);
            float distFromCenter = Vector2.Distance(viewportPos, center) / _assistRadius;
            distFromCenter = Mathf.Clamp01(distFromCenter);

            float bloomScale = _bloomAssistScale.Evaluate(Mathf.Clamp01(currentWeaponBloom01));

            // 1. Slowdown-on-target: reduce look speed as the reticle nears the target center.
            float speedMultiplier = Mathf.Lerp(1f, _slowdownCurve.Evaluate(distFromCenter), bloomScale);
            Vector2 adjustedInput = rawLookInput * _baseLookSpeed * speedMultiplier;

            // 2. Magnetism: nudge the input direction slightly toward the target.
            Vector2 towardTarget = (center - viewportPos).normalized;
            float magnetAmount = _magnetFalloff.Evaluate(distFromCenter) * _magnetStrength * bloomScale;
            adjustedInput += towardTarget * magnetAmount;

            return adjustedInput;
        }

        // Scans for candidate targets within the assist cone and picks the closest to the crosshair center.
        private Transform FindBestTarget()
        {
            Collider[] candidates = Physics.OverlapSphere(_playerCamera.transform.position, _assistMaxDistance, _targetLayer);
            Transform best = null;
            float bestScore = float.MaxValue;

            foreach (Collider candidate in candidates)
            {
                Vector3 viewportPos = _playerCamera.WorldToViewportPoint(candidate.transform.position);
                if (viewportPos.z <= 0f) continue; // behind camera

                float dist = Vector2.Distance(new Vector2(viewportPos.x, viewportPos.y), new Vector2(0.5f, 0.5f));
                if (dist > _assistRadius) continue;

                if (!HasLineOfSight(candidate.transform.position)) continue;

                if (dist < bestScore)
                {
                    bestScore = dist;
                    best = candidate.transform;
                }
            }

            return best;
        }

        private bool HasLineOfSight(Vector3 targetPosition)
        {
            Vector3 origin = _playerCamera.transform.position;
            Vector3 direction = targetPosition - origin;

            if (Physics.Raycast(origin, direction.normalized, out RaycastHit hit, direction.magnitude))
            {
                return hit.collider.transform.IsChildOf(GetTopmostParent(targetPosition)) || hit.distance >= direction.magnitude - 0.1f;
            }

            return true;
        }

        private Transform GetTopmostParent(Vector3 hintPosition)
        {
            return _currentTarget != null ? _currentTarget.root : transform.root;
        }
    }
}
