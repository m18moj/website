/*
 * ScriptForge — Smoke & Wall Ability Collision
 * Pack: Valorant Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Volumetric occlusion check for smoke/wall-style abilities that block line-of-sight between actors.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections.Generic;
using UnityEngine;

namespace ScriptForge.Valorant.Combat
{
    /// <summary>
    /// Represents a single deployed line-of-sight-blocking volume (a smoke cloud
    /// or a temporary wall). Registers itself with the static LineOfSightBlockerRegistry
    /// while active so any system can query whether two points are occluded.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class SmokeWallAbilityCollision : MonoBehaviour
    {
        public enum BlockerShape { Sphere, Box }

        [Header("Blocker Shape")]
        [SerializeField] private BlockerShape shape = BlockerShape.Sphere;
        [SerializeField] private float sphereRadius = 4f;
        [SerializeField] private Vector3 boxHalfExtents = new Vector3(3f, 3f, 0.5f);

        [Header("Lifetime")]
        [Tooltip("Seconds the volume blocks sightlines for before dissipating.")]
        [SerializeField] private float durationSeconds = 15f;
        [Tooltip("How long the volume takes to fully form/dissipate at the start/end of its life.")]
        [SerializeField] private float fadeSeconds = 1f;

        private float _spawnTime;
        private bool _isRegistered;

        private void OnEnable()
        {
            _spawnTime = Time.time;
            LineOfSightBlockerRegistry.Register(this);
            _isRegistered = true;
        }

        private void OnDisable()
        {
            if (_isRegistered)
            {
                LineOfSightBlockerRegistry.Unregister(this);
                _isRegistered = false;
            }
        }

        private void Update()
        {
            if (Time.time - _spawnTime >= durationSeconds)
            {
                gameObject.SetActive(false);
            }
        }

        /// <summary>Whether the blocker is currently at full strength (past its form-in fade window and not yet dissipating).</summary>
        public bool IsFullyFormed
        {
            get
            {
                float age = Time.time - _spawnTime;
                return age >= fadeSeconds && age <= durationSeconds - fadeSeconds;
            }
        }

        /// <summary>Tests whether a world-space segment intersects this blocker's volume.</summary>
        public bool BlocksSegment(Vector3 pointA, Vector3 pointB)
        {
            if (!IsFullyFormed)
                return false;

            switch (shape)
            {
                case BlockerShape.Sphere:
                    return SegmentIntersectsSphere(pointA, pointB, transform.position, sphereRadius);
                case BlockerShape.Box:
                    return SegmentIntersectsBox(pointA, pointB, transform, boxHalfExtents);
                default:
                    return false;
            }
        }

        private static bool SegmentIntersectsSphere(Vector3 a, Vector3 b, Vector3 center, float radius)
        {
            Vector3 segment = b - a;
            float segLenSq = segment.sqrMagnitude;
            if (segLenSq < 0.0001f)
                return (a - center).sqrMagnitude <= radius * radius;

            float t = Mathf.Clamp01(Vector3.Dot(center - a, segment) / segLenSq);
            Vector3 closestPoint = a + segment * t;
            return (closestPoint - center).sqrMagnitude <= radius * radius;
        }

        private static bool SegmentIntersectsBox(Vector3 a, Vector3 b, Transform boxTransform, Vector3 halfExtents)
        {
            // Transform the segment into the box's local space so we can treat it as axis-aligned.
            Vector3 localA = boxTransform.InverseTransformPoint(a);
            Vector3 localB = boxTransform.InverseTransformPoint(b);

            Bounds localBounds = new Bounds(Vector3.zero, halfExtents * 2f);
            Ray ray = new Ray(localA, (localB - localA).normalized);
            float maxDistance = Vector3.Distance(localA, localB);

            return localBounds.IntersectRay(ray, out float hitDistance) && hitDistance <= maxDistance;
        }
    }

    /// <summary>
    /// Static registry of all active line-of-sight blockers in the scene, allowing
    /// combat/AI/vision systems to check occlusion without holding direct references.
    /// </summary>
    public static class LineOfSightBlockerRegistry
    {
        private static readonly List<SmokeWallAbilityCollision> _activeBlockers = new List<SmokeWallAbilityCollision>();

        public static void Register(SmokeWallAbilityCollision blocker)
        {
            if (!_activeBlockers.Contains(blocker))
                _activeBlockers.Add(blocker);
        }

        public static void Unregister(SmokeWallAbilityCollision blocker)
        {
            _activeBlockers.Remove(blocker);
        }

        /// <summary>Returns true if any registered blocker occludes the line between the two points.</summary>
        public static bool IsSightlineBlocked(Vector3 from, Vector3 to)
        {
            foreach (SmokeWallAbilityCollision blocker in _activeBlockers)
            {
                if (blocker != null && blocker.BlocksSegment(from, to))
                    return true;
            }
            return false;
        }
    }
}
