/*
 * ScripForge — Spike Carrier Priority Callout
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Automatic team callout triggered when the spike carrier is low HP or isolated from teammates.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Valorant.Systems
{
    public enum CalloutReason
    {
        LowHealth,
        Isolated,
        LowHealthAndIsolated
    }

    [Serializable]
    public class SpikeCarrierCalloutEvent
    {
        public GameObject carrier;
        public CalloutReason reason;
        public Vector3 position;
        public float healthPercent;
        public float distanceToNearestAlly;
    }

    /// <summary>
    /// Watches the current spike carrier's health and proximity to living teammates and
    /// fires a team-wide callout (audio + minimap ping) when the carrier becomes a
    /// high-priority protect target — low HP, cut off from the team, or both.
    /// </summary>
    public class SpikeCarrierPriorityCallout : MonoBehaviour
    {
        [Header("Thresholds")]
        [SerializeField] private float lowHealthPercentThreshold = 0.3f;
        [Tooltip("Distance in meters beyond which the carrier is considered isolated from the nearest living ally.")]
        [SerializeField] private float isolationDistanceThreshold = 18f;

        [Header("Callout Throttling")]
        [Tooltip("Minimum seconds between repeated callouts for the same carrier/reason.")]
        [SerializeField] private float calloutCooldownSeconds = 8f;

        [Header("Presentation")]
        [SerializeField] private AudioSource teamAudioSource;
        [SerializeField] private AudioClip lowHealthCalloutClip;
        [SerializeField] private AudioClip isolatedCalloutClip;
        [SerializeField] private AudioClip criticalCalloutClip;
        [SerializeField] private GameObject minimapPingPrefab;

        public event Action<SpikeCarrierCalloutEvent> OnPriorityCalloutTriggered;

        private GameObject _spikeCarrier;
        private List<GameObject> _livingTeammates = new List<GameObject>();
        private float _lastCalloutTime = -999f;
        private CalloutReason _lastCalloutReason;

        /// <summary>Call whenever the spike changes hands (pickup, drop, or carrier death).</summary>
        public void SetSpikeCarrier(GameObject carrier)
        {
            _spikeCarrier = carrier;
        }

        /// <summary>Call whenever the set of living teammates changes (spawn/death).</summary>
        public void SetLivingTeammates(List<GameObject> teammates)
        {
            _livingTeammates = teammates ?? new List<GameObject>();
        }

        private void Update()
        {
            if (_spikeCarrier == null) return;

            float healthPercent = GetHealthPercent(_spikeCarrier);
            bool isLowHealth = healthPercent <= lowHealthPercentThreshold;

            float nearestAllyDistance = GetDistanceToNearestAlly(_spikeCarrier);
            bool isIsolated = nearestAllyDistance >= isolationDistanceThreshold;

            if (!isLowHealth && !isIsolated) return;

            CalloutReason reason = isLowHealth && isIsolated
                ? CalloutReason.LowHealthAndIsolated
                : (isLowHealth ? CalloutReason.LowHealth : CalloutReason.Isolated);

            TryTriggerCallout(reason, healthPercent, nearestAllyDistance);
        }

        private void TryTriggerCallout(CalloutReason reason, float healthPercent, float allyDistance)
        {
            bool sameReasonStillCoolingDown = reason == _lastCalloutReason
                && Time.time - _lastCalloutTime < calloutCooldownSeconds;

            if (sameReasonStillCoolingDown) return;

            _lastCalloutTime = Time.time;
            _lastCalloutReason = reason;

            var evt = new SpikeCarrierCalloutEvent
            {
                carrier = _spikeCarrier,
                reason = reason,
                position = _spikeCarrier.transform.position,
                healthPercent = healthPercent,
                distanceToNearestAlly = allyDistance
            };

            PlayCalloutAudio(reason);
            SpawnMinimapPing(evt.position);
            OnPriorityCalloutTriggered?.Invoke(evt);
        }

        private void PlayCalloutAudio(CalloutReason reason)
        {
            if (teamAudioSource == null) return;

            AudioClip clip = reason switch
            {
                CalloutReason.LowHealthAndIsolated => criticalCalloutClip,
                CalloutReason.LowHealth => lowHealthCalloutClip,
                CalloutReason.Isolated => isolatedCalloutClip,
                _ => null
            };

            if (clip != null)
                teamAudioSource.PlayOneShot(clip);
        }

        private void SpawnMinimapPing(Vector3 worldPosition)
        {
            if (minimapPingPrefab == null) return;
            Instantiate(minimapPingPrefab, worldPosition, Quaternion.identity);
        }

        private float GetHealthPercent(GameObject actor)
        {
            var health = actor.GetComponent<IDamageable>();
            return health != null ? health.HealthPercent01() : 1f;
        }

        private float GetDistanceToNearestAlly(GameObject actor)
        {
            float nearest = float.MaxValue;
            foreach (var teammate in _livingTeammates)
            {
                if (teammate == null || teammate == actor) continue;
                float dist = Vector3.Distance(actor.transform.position, teammate.transform.position);
                if (dist < nearest) nearest = dist;
            }
            return nearest == float.MaxValue ? isolationDistanceThreshold : nearest;
        }
    }

    public interface IDamageable
    {
        float HealthPercent01();
    }
}
