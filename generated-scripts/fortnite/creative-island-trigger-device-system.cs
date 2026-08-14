/*
 * ScriptForge — Creative Island Trigger & Device System
 * Pack: Fortnite Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Generic trigger-volume and chainable device framework for building custom game modes.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScriptForge.Fortnite.Systems
{
    /// <summary>
    /// Base class for a "device" — a configurable, chainable logic node that custom game
    /// modes can wire together (similar in spirit to island-creation trigger/device tools).
    /// Devices expose named signals that other devices can subscribe to, allowing designers
    /// to build sequences (e.g. Trigger -> Timer -> SpawnDevice -> ScoreDevice) without code.
    /// </summary>
    public abstract class GameDevice : MonoBehaviour
    {
        [SerializeField] protected string deviceId;
        [SerializeField] protected bool startEnabled = true;

        protected bool isEnabled;

        public string DeviceId => deviceId;
        public bool IsEnabled => isEnabled;

        public event Action<GameDevice> OnActivated;

        protected virtual void Awake()
        {
            isEnabled = startEnabled;
            if (string.IsNullOrEmpty(deviceId))
                deviceId = gameObject.name;
        }

        /// <summary>Enables/disables this device; disabled devices ignore Activate calls.</summary>
        public void SetEnabled(bool enabled) => isEnabled = enabled;

        /// <summary>Fires this device's effect and raises OnActivated for any listening devices.</summary>
        public void Activate(GameObject instigator)
        {
            if (!isEnabled)
                return;

            OnDeviceActivated(instigator);
            OnActivated?.Invoke(this);
        }

        protected abstract void OnDeviceActivated(GameObject instigator);
    }

    /// <summary>
    /// A world-space trigger volume that activates itself (and thus any chained devices)
    /// when a tagged object enters. The common entry point for custom game-mode logic
    /// (e.g. "player enters capture zone", "vehicle crosses finish line").
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class TriggerDevice : GameDevice
    {
        [Header("Trigger Filter")]
        [SerializeField] private string requiredTag = "Player";
        [SerializeField] private bool oneShot = false;
        [SerializeField] private float retriggerCooldown = 0f;

        private bool hasFiredOnce;
        private float lastFireTime = -999f;

        protected override void Awake()
        {
            base.Awake();
            GetComponent<Collider>().isTrigger = true;
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!isEnabled)
                return;

            if (!string.IsNullOrEmpty(requiredTag) && !other.CompareTag(requiredTag))
                return;

            if (oneShot && hasFiredOnce)
                return;

            if (Time.time - lastFireTime < retriggerCooldown)
                return;

            hasFiredOnce = true;
            lastFireTime = Time.time;
            Activate(other.gameObject);
        }

        protected override void OnDeviceActivated(GameObject instigator)
        {
            // Base trigger has no direct effect of its own — its purpose is purely to
            // fire OnActivated so chained devices (timers, spawners, score devices) run.
        }
    }

    /// <summary>
    /// Chainable device that waits a configured duration after activation, then activates
    /// itself in turn — useful for delayed sequences (e.g. "wait 5s, then open the gate").
    /// </summary>
    public class TimerDevice : GameDevice
    {
        [SerializeField] private float delaySeconds = 5f;

        public void Wire(GameDevice source)
        {
            source.OnActivated += _ => BeginCountdown();
        }

        private void BeginCountdown()
        {
            if (!isEnabled)
                return;
            Invoke(nameof(FireTimer), delaySeconds);
        }

        private void FireTimer()
        {
            Activate(gameObject);
        }

        protected override void OnDeviceActivated(GameObject instigator)
        {
            // Timer's payload is simply "time elapsed" — downstream devices react to OnActivated.
        }
    }

    /// <summary>
    /// Chainable device that spawns a prefab at its own transform when activated. Wire its
    /// input to a TriggerDevice or TimerDevice's OnActivated to build spawn sequences.
    /// </summary>
    public class SpawnDevice : GameDevice
    {
        [SerializeField] private GameObject prefabToSpawn;
        [SerializeField] private List<Transform> spawnPoints = new List<Transform>();

        public void Wire(GameDevice source)
        {
            source.OnActivated += _ => Activate(gameObject);
        }

        protected override void OnDeviceActivated(GameObject instigator)
        {
            if (prefabToSpawn == null)
                return;

            Transform point = spawnPoints.Count > 0
                ? spawnPoints[UnityEngine.Random.Range(0, spawnPoints.Count)]
                : transform;

            Instantiate(prefabToSpawn, point.position, point.rotation);
        }
    }
}
