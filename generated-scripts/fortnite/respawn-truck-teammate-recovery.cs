/*
 * ScripForge — Respawn Truck & Teammate Recovery
 * Pack: Fortnite Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Timed respawn truck spawn locations with a call-in flare and a teammate pickup confirmation flow.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Systems
{
    public enum RespawnTruckState
    {
        Idle,
        FlareThrown,
        EnRoute,
        Parked,
        Departing
    }

    [Serializable]
    public class RespawnTruckSite
    {
        public string SiteId;
        public Vector3 SpawnPoint;
        public bool Discovered;
    }

    /// <summary>
    /// Manages a pool of respawn-truck sites, a call-in flare that summons the nearest
    /// truck, and a pickup confirmation window for eliminated teammates before the
    /// truck departs and the recovery opportunity closes.
    /// </summary>
    public class RespawnTruckManager : MonoBehaviour
    {
        public event Action<RespawnTruckSite> OnTruckFlareThrown;
        public event Action<RespawnTruckSite> OnTruckArrived;
        public event Action<string> OnTeammateRecovered;
        public event Action<RespawnTruckSite> OnTruckDeparted;

        [Header("Sites")]
        [SerializeField] private List<RespawnTruckSite> _siteRegistry = new List<RespawnTruckSite>();

        [Header("Timing")]
        [SerializeField] private float _travelTimeSeconds = 18f;
        [SerializeField] private float _parkedWindowSeconds = 25f;
        [SerializeField] private float _flareCooldownSeconds = 90f;

        private RespawnTruckState _state = RespawnTruckState.Idle;
        private RespawnTruckSite _activeSite;
        private readonly HashSet<string> _confirmedPickups = new HashSet<string>();
        private readonly HashSet<string> _pendingRecoveries = new HashSet<string>();
        private float _lastFlareTime = -999f;
        private Coroutine _sequenceRoutine;

        public RespawnTruckState CurrentState => _state;
        public bool CanThrowFlare => _state == RespawnTruckState.Idle && Time.time - _lastFlareTime >= _flareCooldownSeconds;

        /// <summary>Marks an eliminated teammate as needing recovery; picked up automatically when a truck parks.</summary>
        public void QueueTeammateForRecovery(string teammateId)
        {
            if (string.IsNullOrEmpty(teammateId)) return;
            _pendingRecoveries.Add(teammateId);
        }

        /// <summary>Throws a call-in flare at the nearest undiscovered or nearest available site.</summary>
        public bool ThrowFlare(Vector3 fromPosition)
        {
            if (!CanThrowFlare) return false;

            RespawnTruckSite nearest = FindNearestSite(fromPosition);
            if (nearest == null) return false;

            _activeSite = nearest;
            _lastFlareTime = Time.time;
            _state = RespawnTruckState.FlareThrown;
            OnTruckFlareThrown?.Invoke(nearest);

            _sequenceRoutine = StartCoroutine(RunTruckSequence());
            return true;
        }

        private RespawnTruckSite FindNearestSite(Vector3 fromPosition)
        {
            RespawnTruckSite best = null;
            float bestDist = float.MaxValue;

            foreach (var site in _siteRegistry)
            {
                float dist = Vector3.Distance(fromPosition, site.SpawnPoint);
                if (dist < bestDist)
                {
                    bestDist = dist;
                    best = site;
                }
            }

            return best;
        }

        private IEnumerator RunTruckSequence()
        {
            _state = RespawnTruckState.EnRoute;
            yield return new WaitForSeconds(_travelTimeSeconds);

            _state = RespawnTruckState.Parked;
            _activeSite.Discovered = true;
            OnTruckArrived?.Invoke(_activeSite);

            // While parked, teammates confirm pickup individually via ConfirmPickupAt
            // (typically wired to a trigger volume around the truck bed).
            yield return new WaitForSeconds(_parkedWindowSeconds);

            _state = RespawnTruckState.Departing;
            OnTruckDeparted?.Invoke(_activeSite);

            yield return new WaitForSeconds(2f);

            _state = RespawnTruckState.Idle;
            _activeSite = null;
            _confirmedPickups.Clear();
        }

        /// <summary>Call from a trigger volume around the parked truck to confirm a specific teammate's pickup.</summary>
        public bool ConfirmPickupAt(string teammateId)
        {
            if (_state != RespawnTruckState.Parked) return false;
            if (!_pendingRecoveries.Contains(teammateId)) return false;
            if (_confirmedPickups.Contains(teammateId)) return false;

            _confirmedPickups.Add(teammateId);
            _pendingRecoveries.Remove(teammateId);
            OnTeammateRecovered?.Invoke(teammateId);
            return true;
        }
    }
}
