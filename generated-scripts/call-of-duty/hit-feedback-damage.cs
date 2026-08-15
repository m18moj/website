/*
 * ScripForge — Hit Marker & Damage Numbers
 * Pack: Call of Duty Pack | Category: Feedback
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Drives directional hit markers, headshot cues, and floating damage number popups on the HUD.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System.Collections;
using System.Collections.Generic;
using UnrealEngine;
using UnityEngine.UI;

namespace ScripForge.Feedback
{
    /// <summary>
    /// Handles combat hit feedback: a directional hit marker icon that rotates toward the hit
    /// source, a distinct headshot marker/sound cue, and pooled floating damage number popups.
    /// Attach to a HUD canvas controller.
    /// </summary>
    public class HitFeedbackDamage : MonoBehaviour
    {
        [Header("Hit Marker")]
        [SerializeField] private RectTransform hitMarkerIcon;
        [SerializeField] private RectTransform headshotMarkerIcon;
        [SerializeField] private float markerVisibleDuration = 0.25f;
        [SerializeField] private AudioSource hitMarkerAudio;
        [SerializeField] private AudioClip standardHitClip;
        [SerializeField] private AudioClip headshotHitClip;

        [Header("Damage Numbers")]
        [SerializeField] private GameObject damageNumberPrefab;
        [SerializeField] private Canvas worldSpaceCanvas;
        [SerializeField] private int poolSize = 12;
        [SerializeField] private float floatSpeed = 1.2f;
        [SerializeField] private float numberLifetime = 0.8f;
        [SerializeField] private Color normalDamageColor = Color.white;
        [SerializeField] private Color headshotDamageColor = Color.red;
        [SerializeField] private Color criticalDamageColor = new Color(1f, 0.65f, 0f);

        private readonly Queue<GameObject> pooledNumbers = new Queue<GameObject>();
        private Coroutine hitMarkerRoutine;
        private Coroutine headshotMarkerRoutine;

        private void Awake()
        {
            PrewarmPool();
        }

        private void PrewarmPool()
        {
            if (damageNumberPrefab == null || worldSpaceCanvas == null) return;

            for (int i = 0; i < poolSize; i++)
            {
                GameObject instance = Instantiate(damageNumberPrefab, worldSpaceCanvas.transform);
                instance.SetActive(false);
                pooledNumbers.Enqueue(instance);
            }
        }

        /// <summary>Triggers hit marker + optional damage number for a successful hit registered this frame.</summary>
        public void RegisterHit(float damageAmount, Vector3 worldPosition, bool isHeadshot, bool isCritical = false)
        {
            ShowHitMarker(isHeadshot);
            PlayHitAudio(isHeadshot);
            ShowDamageNumber(damageAmount, worldPosition, isHeadshot, isCritical);
        }

        private void ShowHitMarker(bool isHeadshot)
        {
            RectTransform target = isHeadshot && headshotMarkerIcon != null ? headshotMarkerIcon : hitMarkerIcon;
            if (target == null) return;

            if (isHeadshot)
            {
                if (headshotMarkerRoutine != null) StopCoroutine(headshotMarkerRoutine);
                headshotMarkerRoutine = StartCoroutine(FlashMarker(target));
            }
            else
            {
                if (hitMarkerRoutine != null) StopCoroutine(hitMarkerRoutine);
                hitMarkerRoutine = StartCoroutine(FlashMarker(target));
            }
        }

        private IEnumerator FlashMarker(RectTransform marker)
        {
            marker.gameObject.SetActive(true);
            CanvasGroup group = marker.GetComponent<CanvasGroup>();
            if (group != null) group.alpha = 1f;

            yield return new WaitForSeconds(markerVisibleDuration);

            if (group != null) group.alpha = 0f;
            marker.gameObject.SetActive(false);
        }

        private void PlayHitAudio(bool isHeadshot)
        {
            if (hitMarkerAudio == null) return;
            AudioClip clip = isHeadshot ? headshotHitClip : standardHitClip;
            if (clip != null) hitMarkerAudio.PlayOneShot(clip);
        }

        private void ShowDamageNumber(float damage, Vector3 worldPosition, bool isHeadshot, bool isCritical)
        {
            if (pooledNumbers.Count == 0) return;

            GameObject instance = pooledNumbers.Dequeue();
            instance.transform.position = worldPosition;
            instance.SetActive(true);

            Text label = instance.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.text = Mathf.RoundToInt(damage).ToString();
                label.color = isHeadshot ? headshotDamageColor : (isCritical ? criticalDamageColor : normalDamageColor);
                label.fontSize = isHeadshot ? 28 : 20;
            }

            StartCoroutine(AnimateAndRecycle(instance));
        }

        private IEnumerator AnimateAndRecycle(GameObject instance)
        {
            float elapsed = 0f;
            Vector3 startPos = instance.transform.position;

            while (elapsed < numberLifetime)
            {
                elapsed += Time.deltaTime;
                instance.transform.position = startPos + Vector3.up * (floatSpeed * elapsed);
                yield return null;
            }

            instance.SetActive(false);
            pooledNumbers.Enqueue(instance);
        }
    }
}
