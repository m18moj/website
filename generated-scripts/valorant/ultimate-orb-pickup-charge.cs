/*
 * ScripForge — Ultimate Orb Pickup & Charge
 * Pack: Valorant Pack | Category: Abilities
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Map-placed pickup orb that grants bonus ultimate ability charge and respawns after a cooldown.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections;
using UnityEngine;

namespace ScripForge.Valorant.Abilities
{
    /// <summary>
    /// Interface implemented by any player-side component that tracks ultimate charge.
    /// Keeping this as an interface lets the orb work with whatever ability system you use.
    /// </summary>
    public interface IUltimateChargeReceiver
    {
        void AddUltimateCharge(int amount);
    }

    /// <summary>
    /// A world-placed orb that a player can walk over to gain bonus ultimate charge.
    /// After being collected the orb visually disappears, waits out a respawn timer,
    /// then reactivates. Designed to be dropped on a map at fixed pickup locations.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class UltimateOrbPickup : MonoBehaviour
    {
        [Header("Charge Settings")]
        [Tooltip("How much ultimate charge this orb grants on pickup.")]
        [SerializeField] private int chargeAmount = 25;

        [Header("Respawn Settings")]
        [Tooltip("Seconds before the orb becomes available again after being collected.")]
        [SerializeField] private float respawnDelaySeconds = 45f;

        [Header("Visuals")]
        [SerializeField] private GameObject visualRoot;
        [SerializeField] private ParticleSystem pickupBurstEffect;
        [SerializeField] private float idleSpinSpeedDegPerSec = 90f;
        [SerializeField] private float idleBobAmplitude = 0.25f;
        [SerializeField] private float idleBobFrequency = 1.2f;

        /// <summary>Raised whenever the orb is collected. Passes the collector's GameObject.</summary>
        public event System.Action<GameObject> OnOrbCollected;

        private bool _isAvailable = true;
        private Vector3 _spawnLocalPos;
        private Collider _triggerCollider;

        private void Awake()
        {
            _triggerCollider = GetComponent<Collider>();
            _triggerCollider.isTrigger = true;

            if (visualRoot != null)
            {
                _spawnLocalPos = visualRoot.transform.localPosition;
            }
        }

        private void Update()
        {
            if (!_isAvailable || visualRoot == null)
                return;

            // Simple idle animation so the orb reads clearly as an interactive pickup.
            visualRoot.transform.Rotate(Vector3.up, idleSpinSpeedDegPerSec * Time.deltaTime, Space.World);

            float bobOffset = Mathf.Sin(Time.time * idleBobFrequency * Mathf.PI * 2f) * idleBobAmplitude;
            visualRoot.transform.localPosition = _spawnLocalPos + Vector3.up * bobOffset;
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!_isAvailable)
                return;

            // Only react to objects that can actually receive ultimate charge.
            IUltimateChargeReceiver receiver = other.GetComponentInParent<IUltimateChargeReceiver>();
            if (receiver == null)
                return;

            CollectOrb(other.gameObject, receiver);
        }

        private void CollectOrb(GameObject collector, IUltimateChargeReceiver receiver)
        {
            _isAvailable = false;

            receiver.AddUltimateCharge(chargeAmount);
            OnOrbCollected?.Invoke(collector);

            if (pickupBurstEffect != null)
            {
                pickupBurstEffect.transform.position = transform.position;
                pickupBurstEffect.Play();
            }

            SetVisualState(false);
            StartCoroutine(RespawnAfterDelay());
        }

        private IEnumerator RespawnAfterDelay()
        {
            yield return new WaitForSeconds(respawnDelaySeconds);

            _isAvailable = true;
            SetVisualState(true);
        }

        private void SetVisualState(bool visible)
        {
            if (visualRoot != null)
            {
                visualRoot.SetActive(visible);
            }

            _triggerCollider.enabled = visible;
        }
    }
}
