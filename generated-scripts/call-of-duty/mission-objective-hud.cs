/*
 * ScripForge — Objective Marker & Compass HUD
 * Pack: Call of Duty Pack | Category: HUD
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Renders world-space objective waypoints on a rotating compass strip with live distance and status ticks.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;
using UnityEngine.UI;

namespace ScripForge.HUD
{
    public enum ObjectiveMarkerStatus
    {
        Active,
        InProgress,
        Completed,
        Locked
    }

    [Serializable]
    public class ObjectiveMarkerData
    {
        public string objectiveId;
        public string label;
        public Transform worldTarget;
        public ObjectiveMarkerStatus status = ObjectiveMarkerStatus.Active;
    }

    /// <summary>
    /// Drives a compass-strip HUD: converts world-space objective positions into bearing angles
    /// relative to the player, positions marker icons along a horizontal compass, and updates
    /// distance labels and completion ticks as objective status changes.
    /// </summary>
    public class MissionObjectiveHud : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform playerTransform;
        [SerializeField] private RectTransform compassStrip;
        [SerializeField] private float compassFieldOfViewDegrees = 180f;
        [SerializeField] private float compassWidth = 600f;

        [Header("Objectives")]
        [SerializeField] private List<ObjectiveMarkerData> activeObjectives = new List<ObjectiveMarkerData>();

        [Header("Marker Prefab")]
        [SerializeField] private GameObject markerUiPrefab;

        private readonly Dictionary<string, GameObject> spawnedMarkers = new Dictionary<string, GameObject>();

        public event Action<string, ObjectiveMarkerStatus> OnObjectiveStatusChanged;

        private void Update()
        {
            if (playerTransform == null || compassStrip == null) return;

            foreach (ObjectiveMarkerData objective in activeObjectives)
            {
                if (objective.worldTarget == null) continue;
                UpdateMarkerPosition(objective);
            }
        }

        private void UpdateMarkerPosition(ObjectiveMarkerData objective)
        {
            if (!spawnedMarkers.TryGetValue(objective.objectiveId, out GameObject markerInstance))
            {
                if (markerUiPrefab == null) return;
                markerInstance = Instantiate(markerUiPrefab, compassStrip);
                spawnedMarkers[objective.objectiveId] = markerInstance;
            }

            float bearing = CalculateBearing(objective.worldTarget.position);
            bool isVisible = Mathf.Abs(NormalizeAngle(bearing)) <= compassFieldOfViewDegrees / 2f;

            markerInstance.SetActive(isVisible && objective.status != ObjectiveMarkerStatus.Locked);
            if (!isVisible) return;

            float normalizedX = NormalizeAngle(bearing) / (compassFieldOfViewDegrees / 2f);
            RectTransform markerRect = markerInstance.GetComponent<RectTransform>();
            if (markerRect != null)
            {
                markerRect.anchoredPosition = new Vector2(normalizedX * (compassWidth / 2f), markerRect.anchoredPosition.y);
            }

            UpdateMarkerLabel(markerInstance, objective);
        }

        private void UpdateMarkerLabel(GameObject markerInstance, ObjectiveMarkerData objective)
        {
            Text label = markerInstance.GetComponentInChildren<Text>();
            if (label == null) return;

            float distance = Vector3.Distance(playerTransform.position, objective.worldTarget.position);
            string statusTick = objective.status switch
            {
                ObjectiveMarkerStatus.Completed => "✓", // check mark
                ObjectiveMarkerStatus.InProgress => "...",
                _ => ""
            };

            label.text = $"{objective.label} {Mathf.RoundToInt(distance)}m {statusTick}";
        }

        /// <summary>Bearing in degrees from player forward to the target, range -180..180.</summary>
        private float CalculateBearing(Vector3 worldTargetPosition)
        {
            Vector3 direction = worldTargetPosition - playerTransform.position;
            direction.y = 0f;
            float angle = Vector3.SignedAngle(playerTransform.forward, direction, Vector3.up);
            return angle;
        }

        private float NormalizeAngle(float angle)
        {
            while (angle > 180f) angle -= 360f;
            while (angle < -180f) angle += 360f;
            return angle;
        }

        public void SetObjectiveStatus(string objectiveId, ObjectiveMarkerStatus status)
        {
            ObjectiveMarkerData objective = activeObjectives.Find(o => o.objectiveId == objectiveId);
            if (objective == null) return;

            objective.status = status;
            OnObjectiveStatusChanged?.Invoke(objectiveId, status);
        }

        public void AddObjective(ObjectiveMarkerData objective)
        {
            activeObjectives.Add(objective);
        }

        public void RemoveObjective(string objectiveId)
        {
            activeObjectives.RemoveAll(o => o.objectiveId == objectiveId);
            if (spawnedMarkers.TryGetValue(objectiveId, out GameObject instance))
            {
                Destroy(instance);
                spawnedMarkers.Remove(objectiveId);
            }
        }
    }
}
