/*
 * ScripForge — Loadout Drop Marker System
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Player-called loadout drop crates with a marker beacon and a pickup radius for teammates.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Systems
{
    public enum LoadoutDropState
    {
        Requested,
        Falling,
        Landed,
        Claimed,
        Expired
    }

    [Serializable]
    public class LoadoutDropRequest
    {
        public string dropId;
        public string ownerId;
        public string loadoutPresetId;
        public Vector3 targetPosition;
        public LoadoutDropState state = LoadoutDropState.Requested;
    }

    /// <summary>
    /// Handles a player-called loadout drop: spawns a falling crate toward the requested position,
    /// activates a visible/audible marker beacon once it lands, and grants the player's saved
    /// loadout to whoever enters the pickup radius while the crate remains unclaimed.
    /// </summary>
    public class LoadoutDropMarkerSystem : MonoBehaviour
    {
        [Header("Crate")]
        [SerializeField] private GameObject dropCratePrefab;
        [SerializeField] private float fallHeight = 40f;
        [SerializeField] private float fallSpeed = 12f;

        [Header("Marker Beacon")]
        [SerializeField] private GameObject beaconEffectPrefab;
        [Tooltip("Radius in meters within which teammates can see/hear the beacon.")]
        [SerializeField] private float beaconVisibilityRadius = 30f;

        [Header("Pickup")]
        [SerializeField] private float pickupRadius = 3f;
        [SerializeField] private float unclaimedExpirySeconds = 90f;
        [Tooltip("Cooldown in seconds before the same player can call another loadout drop.")]
        [SerializeField] private float callCooldownSeconds = 60f;

        private readonly Dictionary<string, LoadoutDropRequest> activeDrops = new Dictionary<string, LoadoutDropRequest>();
        private readonly Dictionary<string, GameObject> spawnedCrates = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, GameObject> spawnedBeacons = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, float> callCooldowns = new Dictionary<string, float>();
        private readonly Dictionary<string, float> expiryTimers = new Dictionary<string, float>();

        public event Action<LoadoutDropRequest> OnDropCalled;
        public event Action<LoadoutDropRequest> OnDropLanded;
        public event Action<LoadoutDropRequest, string> OnDropClaimed; // (request, claimerId)
        public event Action<LoadoutDropRequest> OnDropExpired;

        private void Update()
        {
            if (callCooldowns.Count > 0)
            {
                TickCooldowns();
            }

            if (expiryTimers.Count > 0)
            {
                TickExpiries();
            }
        }

        private void TickCooldowns()
        {
            List<string> keys = new List<string>(callCooldowns.Keys);
            foreach (string playerId in keys)
            {
                float remaining = Mathf.Max(0f, callCooldowns[playerId] - Time.deltaTime);
                if (remaining <= 0f)
                {
                    callCooldowns.Remove(playerId);
                }
                else
                {
                    callCooldowns[playerId] = remaining;
                }
            }
        }

        private void TickExpiries()
        {
            List<string> dropIds = new List<string>(expiryTimers.Keys);
            foreach (string dropId in dropIds)
            {
                float remaining = expiryTimers[dropId] - Time.deltaTime;
                if (remaining <= 0f)
                {
                    ExpireDrop(dropId);
                }
                else
                {
                    expiryTimers[dropId] = remaining;
                }
            }
        }

        /// <summary>Call when the player uses their loadout drop killstreak/field ability.</summary>
        public bool TryCallLoadoutDrop(string ownerId, string loadoutPresetId, Vector3 targetPosition)
        {
            if (callCooldowns.ContainsKey(ownerId)) return false;

            LoadoutDropRequest request = new LoadoutDropRequest
            {
                dropId = Guid.NewGuid().ToString("N"),
                ownerId = ownerId,
                loadoutPresetId = loadoutPresetId,
                targetPosition = targetPosition,
                state = LoadoutDropState.Requested
            };

            activeDrops[request.dropId] = request;
            callCooldowns[ownerId] = callCooldownSeconds;

            SpawnFallingCrate(request);
            OnDropCalled?.Invoke(request);
            return true;
        }

        private void SpawnFallingCrate(LoadoutDropRequest request)
        {
            if (dropCratePrefab == null) return;

            Vector3 spawnPos = request.targetPosition + Vector3.up * fallHeight;
            GameObject crate = Instantiate(dropCratePrefab, spawnPos, Quaternion.identity);
            spawnedCrates[request.dropId] = crate;
            request.state = LoadoutDropState.Falling;
        }

        /// <summary>Call from the crate's landing trigger (e.g. ground contact) once it settles at its target.</summary>
        public void ReportCrateLanded(string dropId)
        {
            if (!activeDrops.TryGetValue(dropId, out LoadoutDropRequest request)) return;
            if (request.state != LoadoutDropState.Falling) return;

            request.state = LoadoutDropState.Landed;
            expiryTimers[dropId] = unclaimedExpirySeconds;
            SpawnBeacon(request);
            OnDropLanded?.Invoke(request);
        }

        private void SpawnBeacon(LoadoutDropRequest request)
        {
            if (beaconEffectPrefab == null) return;
            GameObject beacon = Instantiate(beaconEffectPrefab, request.targetPosition, Quaternion.identity);
            spawnedBeacons[request.dropId] = beacon;
        }

        /// <summary>Call when a player's collider enters the crate's pickup trigger.</summary>
        public bool TryClaimDrop(string dropId, string claimerId, Vector3 claimerPosition)
        {
            if (!activeDrops.TryGetValue(dropId, out LoadoutDropRequest request)) return false;
            if (request.state != LoadoutDropState.Landed) return false;

            float distance = Vector3.Distance(claimerPosition, request.targetPosition);
            if (distance > pickupRadius) return false;

            request.state = LoadoutDropState.Claimed;
            CleanupDropVisuals(dropId);
            expiryTimers.Remove(dropId);
            OnDropClaimed?.Invoke(request, claimerId);
            return true;
        }

        private void ExpireDrop(string dropId)
        {
            if (!activeDrops.TryGetValue(dropId, out LoadoutDropRequest request)) return;

            request.state = LoadoutDropState.Expired;
            CleanupDropVisuals(dropId);
            expiryTimers.Remove(dropId);
            OnDropExpired?.Invoke(request);
        }

        private void CleanupDropVisuals(string dropId)
        {
            if (spawnedCrates.TryGetValue(dropId, out GameObject crate) && crate != null)
            {
                Destroy(crate);
            }
            spawnedCrates.Remove(dropId);

            if (spawnedBeacons.TryGetValue(dropId, out GameObject beacon) && beacon != null)
            {
                Destroy(beacon);
            }
            spawnedBeacons.Remove(dropId);
        }

        public bool IsWithinBeaconRange(Vector3 position, string dropId)
        {
            if (!activeDrops.TryGetValue(dropId, out LoadoutDropRequest request)) return false;
            if (request.state != LoadoutDropState.Landed) return false;
            return Vector3.Distance(position, request.targetPosition) <= beaconVisibilityRadius;
        }

        public IEnumerable<LoadoutDropRequest> GetActiveDrops()
        {
            foreach (LoadoutDropRequest request in activeDrops.Values)
            {
                if (request.state == LoadoutDropState.Landed || request.state == LoadoutDropState.Falling)
                {
                    yield return request;
                }
            }
        }

        public bool IsOnCooldown(string playerId) => callCooldowns.ContainsKey(playerId);
    }
}
