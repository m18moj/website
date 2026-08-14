/*
 * ScriptForge — Weapon Inspect & Skin Display
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Weapon-inspect animation sequence for showcasing equipped cosmetic skins and finisher effects.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections;
using UnityEngine;

namespace ScriptForge.Valorant.Systems
{
    [System.Serializable]
    public class WeaponSkinData
    {
        public string SkinId;
        public string DisplayName;
        public GameObject SkinVisualPrefab;
        [Tooltip("Optional finisher VFX played at the end of the inspect sequence for top-tier skins.")]
        public ParticleSystem FinisherEffectPrefab;
        public AudioClip InspectSound;
    }

    /// <summary>
    /// Plays a cosmetic "inspect weapon" sequence: swaps in the equipped skin's
    /// visual model, triggers an inspect animation on it, and optionally plays
    /// a finisher VFX/audio flourish at the end. Purely presentational — has no
    /// gameplay effect and should be blocked while the player is engaged in combat.
    /// </summary>
    public class WeaponInspectSkinDisplay : MonoBehaviour
    {
        [Header("Mount Point")]
        [Tooltip("Transform the active skin visual is parented to during inspect.")]
        [SerializeField] private Transform skinMountPoint;

        [Header("Timing")]
        [SerializeField] private float inspectAnimationDurationSeconds = 3.5f;
        [SerializeField] private float finisherDelaySeconds = 2.5f;

        [Header("Audio")]
        [SerializeField] private AudioSource audioSource;

        public bool IsInspecting { get; private set; }

        /// <summary>Fired when an inspect sequence begins, passing the skin being shown.</summary>
        public event System.Action<WeaponSkinData> OnInspectStarted;
        /// <summary>Fired when the inspect sequence finishes or is cancelled.</summary>
        public event System.Action OnInspectEnded;

        private GameObject _activeSkinInstance;
        private Coroutine _inspectRoutine;

        /// <summary>
        /// Begins the inspect sequence for the given skin. Returns false if an
        /// inspect is already running or blockedByCombat is true.
        /// </summary>
        public bool TryBeginInspect(WeaponSkinData skin, bool blockedByCombat)
        {
            if (IsInspecting || blockedByCombat || skin == null)
                return false;

            _inspectRoutine = StartCoroutine(RunInspectSequence(skin));
            return true;
        }

        /// <summary>Cancels the current inspect immediately (e.g. player fired or moved to ADS).</summary>
        public void CancelInspect()
        {
            if (!IsInspecting)
                return;

            if (_inspectRoutine != null)
            {
                StopCoroutine(_inspectRoutine);
                _inspectRoutine = null;
            }

            CleanupSkinInstance();
            IsInspecting = false;
            OnInspectEnded?.Invoke();
        }

        private IEnumerator RunInspectSequence(WeaponSkinData skin)
        {
            IsInspecting = true;
            OnInspectStarted?.Invoke(skin);

            SpawnSkinVisual(skin);
            PlayInspectAudio(skin);

            Animator skinAnimator = _activeSkinInstance != null ? _activeSkinInstance.GetComponentInChildren<Animator>() : null;
            skinAnimator?.SetTrigger("Inspect");

            // Wait until the finisher moment, then trigger the flourish VFX if the skin has one.
            yield return new WaitForSeconds(finisherDelaySeconds);

            if (skin.FinisherEffectPrefab != null && _activeSkinInstance != null)
            {
                ParticleSystem finisherInstance = Instantiate(skin.FinisherEffectPrefab, skinMountPoint);
                finisherInstance.Play();
                Destroy(finisherInstance.gameObject, finisherInstance.main.duration + finisherInstance.main.startLifetime.constantMax);
            }

            float remaining = inspectAnimationDurationSeconds - finisherDelaySeconds;
            if (remaining > 0f)
            {
                yield return new WaitForSeconds(remaining);
            }

            CleanupSkinInstance();
            IsInspecting = false;
            _inspectRoutine = null;
            OnInspectEnded?.Invoke();
        }

        private void SpawnSkinVisual(WeaponSkinData skin)
        {
            if (skin.SkinVisualPrefab == null || skinMountPoint == null)
                return;

            _activeSkinInstance = Instantiate(skin.SkinVisualPrefab, skinMountPoint);
            _activeSkinInstance.transform.localPosition = Vector3.zero;
            _activeSkinInstance.transform.localRotation = Quaternion.identity;
        }

        private void PlayInspectAudio(WeaponSkinData skin)
        {
            if (audioSource != null && skin.InspectSound != null)
            {
                audioSource.PlayOneShot(skin.InspectSound);
            }
        }

        private void CleanupSkinInstance()
        {
            if (_activeSkinInstance != null)
            {
                Destroy(_activeSkinInstance);
                _activeSkinInstance = null;
            }
        }
    }
}
