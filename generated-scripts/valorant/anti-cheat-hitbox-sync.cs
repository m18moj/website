/*
 * ScripForge — Server-Authoritative Hit Validation
 * Pack: Valorant Pack | Category: Security
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Server-side hitbox validation and lag-compensation rewind to prevent hit spoofing.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Security
{
    /// <summary>
    /// A single historical snapshot of a player's hitbox transforms, stored for lag compensation.
    /// </summary>
    public struct HitboxSnapshot
    {
        public float serverTime;
        public Dictionary<string, Vector3> boneWorldPositions; // boneId -> world position at capture time.
    }

    /// <summary>
    /// A raw hit claim submitted by a client. Never trusted directly — always re-validated
    /// against server-side history before damage is applied.
    /// </summary>
    [Serializable]
    public struct ClientHitClaim
    {
        public string shooterId;
        public string targetId;
        public string claimedBoneId;
        public Vector3 rayOrigin;
        public Vector3 rayDirection;
        public float clientTimestamp;   // Time the shooter's client believes the shot fired.
    }

    public struct ValidatedHitResult
    {
        public bool isValid;
        public string rejectionReason;
        public string confirmedBoneId;
        public float damageMultiplier;
    }

    /// <summary>
    /// Runs on the authoritative server only. Maintains a rolling history of hitbox positions
    /// per player and re-validates client-submitted hit claims by rewinding to the moment the
    /// shot was actually fired (rewind lag compensation), preventing spoofed or stale hits.
    /// </summary>
    public class ServerHitValidator : MonoBehaviour
    {
        [Header("Lag Compensation")]
        [Tooltip("Maximum time in the past a hit claim may be rewound to (clamps against speedhacked timestamps).")]
        public float maxRewindSeconds = 0.3f;

        [Tooltip("How much history to retain per player, in seconds.")]
        public float historyBufferSeconds = 1.0f;

        [Header("Validation Tolerances")]
        [Tooltip("Max distance (meters) a claimed hit point may deviate from the rewound bone position.")]
        public float hitboxTolerance = 0.15f;

        [Tooltip("Headshot/limb damage multipliers keyed by bone id.")]
        public Dictionary<string, float> boneDamageMultipliers = new Dictionary<string, float>
        {
            { "head", 2.5f }, { "torso", 1.0f }, { "limb", 0.75f }
        };

        private readonly Dictionary<string, List<HitboxSnapshot>> _history = new Dictionary<string, List<HitboxSnapshot>>();

        /// <summary>Call every network tick (server-side) to record each player's current hitbox pose.</summary>
        public void RecordSnapshot(string playerId, Dictionary<string, Vector3> boneWorldPositions, float serverTime)
        {
            if (!_history.TryGetValue(playerId, out var list))
            {
                list = new List<HitboxSnapshot>();
                _history[playerId] = list;
            }

            list.Add(new HitboxSnapshot { serverTime = serverTime, boneWorldPositions = boneWorldPositions });

            // Trim anything older than the retention window.
            while (list.Count > 0 && serverTime - list[0].serverTime > historyBufferSeconds)
                list.RemoveAt(0);
        }

        /// <summary>
        /// Validates a client-reported hit against server history. This is the sole authority
        /// on whether damage is applied — client hit-confirm feedback is cosmetic only.
        /// </summary>
        public ValidatedHitResult ValidateHit(ClientHitClaim claim, float currentServerTime)
        {
            var result = new ValidatedHitResult { isValid = false, damageMultiplier = 0f };

            if (!_history.TryGetValue(claim.targetId, out var list) || list.Count == 0)
            {
                result.rejectionReason = "No hitbox history for target.";
                return result;
            }

            float rewindTime = Mathf.Clamp(claim.clientTimestamp, currentServerTime - maxRewindSeconds, currentServerTime);
            HitboxSnapshot snapshot = FindClosestSnapshot(list, rewindTime);

            if (!snapshot.boneWorldPositions.TryGetValue(claim.claimedBoneId, out var bonePos))
            {
                result.rejectionReason = "Unknown bone id in claim.";
                return result;
            }

            // Re-cast the ray against the rewound bone position rather than trusting the client's hit point.
            Vector3 closestPointOnRay = ClosestPointOnRay(claim.rayOrigin, claim.rayDirection, bonePos);
            float deviation = Vector3.Distance(closestPointOnRay, bonePos);

            if (deviation > hitboxTolerance)
            {
                result.rejectionReason = $"Hit deviation {deviation:F3}m exceeds tolerance.";
                return result;
            }

            result.isValid = true;
            result.confirmedBoneId = claim.claimedBoneId;
            result.damageMultiplier = boneDamageMultipliers.TryGetValue(claim.claimedBoneId, out var mult) ? mult : 1f;
            return result;
        }

        private static HitboxSnapshot FindClosestSnapshot(List<HitboxSnapshot> list, float targetTime)
        {
            HitboxSnapshot best = list[0];
            float bestDiff = Mathf.Abs(best.serverTime - targetTime);
            foreach (var snap in list)
            {
                float diff = Mathf.Abs(snap.serverTime - targetTime);
                if (diff < bestDiff) { best = snap; bestDiff = diff; }
            }
            return best;
        }

        private static Vector3 ClosestPointOnRay(Vector3 origin, Vector3 direction, Vector3 point)
        {
            direction.Normalize();
            float t = Mathf.Max(0f, Vector3.Dot(point - origin, direction));
            return origin + direction * t;
        }
    }
}
