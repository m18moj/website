/*
 * ScripForge — Lethal & Tactical Equipment
 * Pack: Call of Duty Pack | Category: Equipment
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Cook-timer throwable with bounce physics and a configurable area effect for frag/flash/smoke type equipment.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections;
using UnrealEngine;

namespace ScripForge.Equipment
{
    public enum ThrowableEffectType
    {
        Explosive,
        Flash,
        Smoke,
        Concussion
    }

    /// <summary>
    /// Generic throwable equipment behaviour: supports cook-in-hand timing, bounce physics off
    /// surfaces, and an area-of-effect trigger on detonation. Attach to a throwable prefab with
    /// a Rigidbody and SphereCollider already present.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class GrenadeUtilitySystem : MonoBehaviour
    {
        [Header("Type")]
        [SerializeField] private ThrowableEffectType effectType = ThrowableEffectType.Explosive;

        [Header("Timing")]
        [SerializeField] private float fuseTime = 3.5f;
        [SerializeField] private bool cookable = true;

        [Header("Physics")]
        [SerializeField] private float bounciness = 0.45f;
        [SerializeField] private int maxBounces = 5;
        [SerializeField] private LayerMask bounceSurfaceMask = ~0;

        [Header("Effect")]
        [SerializeField] private float effectRadius = 6f;
        [SerializeField] private float effectDuration = 4f; // for lingering effects like smoke/flash
        [SerializeField] private float maxDamage = 100f;
        [SerializeField] private AnimationCurve damageFalloff = AnimationCurve.Linear(0f, 1f, 1f, 0f);
        [SerializeField] private GameObject detonationVfxPrefab;
        [SerializeField] private LayerMask affectedLayers = ~0;

        private Rigidbody rb;
        private float cookElapsed;
        private bool isCooking;
        private bool hasDetonated;
        private int bounceCount;

        public event Action<GrenadeUtilitySystem> OnDetonated;

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
        }

        /// <summary>Starts the fuse the instant the item leaves the player's hand (thrown or dropped-cooked).</summary>
        public void BeginFuse(float cookedOffset = 0f)
        {
            cookElapsed = cookedOffset;
            isCooking = true;
            StartCoroutine(FuseCoroutine());
        }

        /// <summary>Call every frame while the player holds the cook button before releasing the throw.</summary>
        public float TickCookTimer(float deltaTime)
        {
            if (!cookable) return 0f;
            cookElapsed += deltaTime;
            return Mathf.Clamp(cookElapsed, 0f, fuseTime);
        }

        private IEnumerator FuseCoroutine()
        {
            float remaining = fuseTime - cookElapsed;
            remaining = Mathf.Max(remaining, 0f);
            yield return new WaitForSeconds(remaining);
            Detonate();
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (hasDetonated || bounceCount >= maxBounces) return;
            if ((bounceSurfaceMask.value & (1 << collision.gameObject.layer)) == 0) return;

            bounceCount++;
            Vector3 reflected = Vector3.Reflect(rb.linearVelocity, collision.contacts[0].normal);
            rb.linearVelocity = reflected * bounciness;
        }

        private void Detonate()
        {
            if (hasDetonated) return;
            hasDetonated = true;
            isCooking = false;

            if (detonationVfxPrefab != null)
            {
                Instantiate(detonationVfxPrefab, transform.position, Quaternion.identity);
            }

            ApplyAreaEffect();
            OnDetonated?.Invoke(this);

            float destroyDelay = effectType == ThrowableEffectType.Smoke || effectType == ThrowableEffectType.Flash
                ? effectDuration
                : 0.1f;
            Destroy(gameObject, destroyDelay);
        }

        private void ApplyAreaEffect()
        {
            Collider[] hits = Physics.OverlapSphere(transform.position, effectRadius, affectedLayers);
            foreach (Collider hit in hits)
            {
                float distance = Vector3.Distance(transform.position, hit.transform.position);
                float normalizedDistance = Mathf.Clamp01(distance / effectRadius);
                float falloff = damageFalloff.Evaluate(normalizedDistance);

                if (effectType == ThrowableEffectType.Explosive)
                {
                    float damage = maxDamage * falloff;
                    hit.SendMessage("ApplyExplosiveDamage", damage, SendMessageOptions.DontRequireReceiver);
                }
                else
                {
                    hit.SendMessage("ApplyStatusEffect", effectType, SendMessageOptions.DontRequireReceiver);
                }
            }
        }

        public bool IsCooking() => isCooking;
        public float GetFuseTimeRemaining() => Mathf.Max(0f, fuseTime - cookElapsed);
    }
}
