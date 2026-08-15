/*
 * ScripForge — Squad Marker & Loot Ping
 * Pack: Fortnite Pack | Category: Squad
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Context-sensitive ping system for marking enemies, loot and rally points, visible to squadmates through geometry.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScripForge.Fortnite.Squad
{
    public enum PingType { Generic, Enemy, Loot, RallyPoint, Danger }

    [Serializable]
    public class PingData
    {
        public PingType Type;
        public Vector3 WorldPosition;
        public string SquadMemberName;
        public float ExpireTime;
        public GameObject MarkerInstance;
    }

    public class SquadPingSystem : MonoBehaviour
    {
        public event Action<PingData> OnPingCreated;
        public event Action<PingData> OnPingExpired;

        [Header("Ping Setup")]
        [SerializeField] private Camera _playerCamera;
        [SerializeField] private LayerMask _pingSurfaceMask;
        [SerializeField] private LayerMask _enemyMask;
        [SerializeField] private LayerMask _lootMask;
        [SerializeField] private float _pingMaxDistance = 150f;

        [Header("Markers")]
        [SerializeField] private GameObject _markerPrefabGeneric;
        [SerializeField] private GameObject _markerPrefabEnemy;
        [SerializeField] private GameObject _markerPrefabLoot;
        [SerializeField] private GameObject _markerPrefabRally;

        [Header("Lifetime")]
        [SerializeField] private float _defaultPingLifetime = 5f;
        [SerializeField] private float _rallyPingLifetime = 30f;

        private readonly List<PingData> _activePings = new List<PingData>();
        private string _localPlayerName = "Player";

        private void Update()
        {
            TickExpirations();
        }

        // Fires a context-sensitive ping from the crosshair: enemies/loot are auto-detected, otherwise falls back to a generic marker.
        public void FireContextPing()
        {
            Ray ray = _playerCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));

            if (Physics.Raycast(ray, out RaycastHit enemyHit, _pingMaxDistance, _enemyMask))
            {
                CreatePing(PingType.Enemy, enemyHit.point, _defaultPingLifetime);
                return;
            }

            if (Physics.Raycast(ray, out RaycastHit lootHit, _pingMaxDistance, _lootMask))
            {
                CreatePing(PingType.Loot, lootHit.point, _defaultPingLifetime);
                return;
            }

            if (Physics.Raycast(ray, out RaycastHit surfaceHit, _pingMaxDistance, _pingSurfaceMask))
            {
                CreatePing(PingType.Generic, surfaceHit.point, _defaultPingLifetime);
            }
        }

        public void FireRallyPing(Vector3 position)
        {
            CreatePing(PingType.RallyPoint, position, _rallyPingLifetime);
        }

        private void CreatePing(PingType type, Vector3 position, float lifetime)
        {
            GameObject prefab = GetPrefabFor(type);
            // Markers render through walls via a dedicated "see-through" shader/layer on the prefab itself.
            GameObject instance = prefab != null ? Instantiate(prefab, position, Quaternion.identity) : null;

            var ping = new PingData
            {
                Type = type,
                WorldPosition = position,
                SquadMemberName = _localPlayerName,
                ExpireTime = Time.time + lifetime,
                MarkerInstance = instance
            };

            _activePings.Add(ping);
            OnPingCreated?.Invoke(ping);
        }

        private GameObject GetPrefabFor(PingType type)
        {
            switch (type)
            {
                case PingType.Enemy: return _markerPrefabEnemy;
                case PingType.Loot: return _markerPrefabLoot;
                case PingType.RallyPoint: return _markerPrefabRally;
                default: return _markerPrefabGeneric;
            }
        }

        private void TickExpirations()
        {
            for (int i = _activePings.Count - 1; i >= 0; i--)
            {
                PingData ping = _activePings[i];
                if (Time.time >= ping.ExpireTime)
                {
                    if (ping.MarkerInstance != null) Destroy(ping.MarkerInstance);
                    OnPingExpired?.Invoke(ping);
                    _activePings.RemoveAt(i);
                }
            }
        }

        public IReadOnlyList<PingData> GetActivePings() => _activePings;
    }
}
