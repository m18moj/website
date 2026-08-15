/*
 * ScripForge — Minimap & Callout Marker
 * Pack: Valorant Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Top-down minimap overlay with named callout zones and player-pingable markers.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace ScripForge.Valorant.HUD
{
    /// <summary>
    /// Defines a named region of the map (e.g. "A Site", "Mid Courtyard") used
    /// for callouts and for resolving which zone a ping falls within.
    /// </summary>
    [System.Serializable]
    public class CalloutZone
    {
        public string ZoneName;
        [Tooltip("World-space bounds of this callout zone (Y is ignored — top-down).")]
        public Rect WorldBounds;
    }

    [System.Serializable]
    public class MapPing
    {
        public Vector2 WorldPosition;
        public string ZoneName;
        public int OwnerPlayerId;
        public float TimeToLiveSeconds;
    }

    /// <summary>
    /// Renders live player icons and temporary pings on a top-down minimap UI,
    /// converting world-space positions into minimap-local RectTransform space
    /// and resolving positions to human-readable callout zone names.
    /// </summary>
    public class MinimapCalloutMarker : MonoBehaviour
    {
        [Header("World / Map Mapping")]
        [Tooltip("World-space rectangle the minimap texture represents (X/Z plane).")]
        [SerializeField] private Rect worldMapBounds = new Rect(-100f, -100f, 200f, 200f);
        [SerializeField] private RectTransform minimapRect;

        [Header("Callouts")]
        [SerializeField] private List<CalloutZone> calloutZones = new List<CalloutZone>();

        [Header("Markers")]
        [SerializeField] private GameObject pingMarkerPrefab;
        [SerializeField] private float defaultPingLifetimeSeconds = 3f;

        private readonly List<MapPing> _activePings = new List<MapPing>();
        private readonly List<GameObject> _pingMarkerInstances = new List<GameObject>();

        private void Update()
        {
            for (int i = _activePings.Count - 1; i >= 0; i--)
            {
                _activePings[i].TimeToLiveSeconds -= Time.deltaTime;
                if (_activePings[i].TimeToLiveSeconds <= 0f)
                {
                    RemovePingAt(i);
                }
            }
        }

        /// <summary>Converts a world-space position to a local anchored position on the minimap RectTransform.</summary>
        public Vector2 WorldToMinimapLocalPosition(Vector3 worldPosition)
        {
            float normalizedX = Mathf.InverseLerp(worldMapBounds.xMin, worldMapBounds.xMax, worldPosition.x);
            float normalizedZ = Mathf.InverseLerp(worldMapBounds.yMin, worldMapBounds.yMax, worldPosition.z);

            float localX = (normalizedX - 0.5f) * minimapRect.rect.width;
            float localY = (normalizedZ - 0.5f) * minimapRect.rect.height;
            return new Vector2(localX, localY);
        }

        /// <summary>Returns the callout zone name for a world position, or "Unknown" if outside all zones.</summary>
        public string GetCalloutForWorldPosition(Vector3 worldPosition)
        {
            Vector2 flatPos = new Vector2(worldPosition.x, worldPosition.z);

            foreach (CalloutZone zone in calloutZones)
            {
                if (zone.WorldBounds.Contains(flatPos))
                    return zone.ZoneName;
            }

            return "Unknown";
        }

        /// <summary>Places a temporary ping marker at a world position and auto-resolves its callout name.</summary>
        public void PlacePing(Vector3 worldPosition, int ownerPlayerId, float? lifetimeOverride = null)
        {
            var ping = new MapPing
            {
                WorldPosition = new Vector2(worldPosition.x, worldPosition.z),
                ZoneName = GetCalloutForWorldPosition(worldPosition),
                OwnerPlayerId = ownerPlayerId,
                TimeToLiveSeconds = lifetimeOverride ?? defaultPingLifetimeSeconds
            };

            _activePings.Add(ping);
            SpawnPingMarker(ping);
        }

        private void SpawnPingMarker(MapPing ping)
        {
            if (pingMarkerPrefab == null || minimapRect == null)
                return;

            GameObject markerInstance = Instantiate(pingMarkerPrefab, minimapRect);
            RectTransform markerRect = markerInstance.GetComponent<RectTransform>();
            if (markerRect != null)
            {
                markerRect.anchoredPosition = WorldToMinimapLocalPosition(new Vector3(ping.WorldPosition.x, 0f, ping.WorldPosition.y));
            }

            _pingMarkerInstances.Add(markerInstance);
        }

        private void RemovePingAt(int index)
        {
            _activePings.RemoveAt(index);

            if (index < _pingMarkerInstances.Count)
            {
                if (_pingMarkerInstances[index] != null)
                    Destroy(_pingMarkerInstances[index]);
                _pingMarkerInstances.RemoveAt(index);
            }
        }
    }
}
