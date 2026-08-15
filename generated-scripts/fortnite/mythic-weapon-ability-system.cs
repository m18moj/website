/*
 * ScripForge — Mythic Weapon Ability System
 * Pack: Fortnite Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Framework for special top-tier weapons that carry a unique, cooldown-gated triggered ability.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using UnityEngine;

namespace ScripForge.Fortnite.Weapons
{
    /// <summary>
    /// Base class for a mythic-tier weapon's special ability. Derive from this to implement
    /// concrete effects (e.g. a grapple pull, a damage nova, a summon). The base class handles
    /// shared cooldown bookkeeping so subclasses only implement the effect itself.
    /// </summary>
    public abstract class MythicWeaponAbility : MonoBehaviour
    {
        [Header("Ability Settings")]
        [SerializeField] protected string abilityName = "Unnamed Ability";
        [SerializeField] protected float cooldownSeconds = 20f;
        [SerializeField] protected float resourceCost = 0f; // e.g. charge/energy, optional

        protected float lastActivationTime = -999f;

        public string AbilityName => abilityName;
        public float CooldownSeconds => cooldownSeconds;

        public bool IsReady => Time.time - lastActivationTime >= cooldownSeconds;
        public float CooldownRemaining => Mathf.Max(0f, cooldownSeconds - (Time.time - lastActivationTime));

        /// <summary>
        /// Attempts to activate the ability. Returns false if still on cooldown.
        /// Subclasses implement ExecuteEffect for the actual gameplay behavior.
        /// </summary>
        public bool TryActivate(GameObject user)
        {
            if (!IsReady)
                return false;

            lastActivationTime = Time.time;
            ExecuteEffect(user);
            return true;
        }

        /// <summary>Implement the ability's unique gameplay effect here.</summary>
        protected abstract void ExecuteEffect(GameObject user);
    }

    /// <summary>
    /// Attach alongside a weapon's normal fire logic. Holds the mythic ability component and
    /// exposes a single entry point for input systems to trigger it (typically bound to an
    /// alt-fire or ability key while this weapon is equipped).
    /// </summary>
    public class MythicWeaponAbilitySystem : MonoBehaviour
    {
        [SerializeField] private MythicWeaponAbility ability;
        [SerializeField] private AudioClip readySound;
        [SerializeField] private AudioClip onCooldownSound;

        private AudioSource audioSource;

        public delegate void AbilityActivatedHandler(string abilityName);
        public event AbilityActivatedHandler OnAbilityActivated;
        public delegate void AbilityDeniedHandler(string reason);
        public event AbilityDeniedHandler OnAbilityDenied;

        private void Awake()
        {
            audioSource = GetComponent<AudioSource>();
        }

        /// <summary>Call from the equipped-weapon input handler when the ability button is pressed.</summary>
        public void TriggerAbility(GameObject user)
        {
            if (ability == null)
            {
                OnAbilityDenied?.Invoke("No ability configured for this weapon.");
                return;
            }

            if (ability.TryActivate(user))
            {
                PlaySound(readySound);
                OnAbilityActivated?.Invoke(ability.AbilityName);
            }
            else
            {
                PlaySound(onCooldownSound);
                OnAbilityDenied?.Invoke($"On cooldown ({ability.CooldownRemaining:F1}s remaining).");
            }
        }

        private void PlaySound(AudioClip clip)
        {
            if (audioSource != null && clip != null)
                audioSource.PlayOneShot(clip);
        }

        public float GetCooldownProgress01()
        {
            if (ability == null || ability.CooldownSeconds <= 0f)
                return 1f;

            return 1f - Mathf.Clamp01(ability.CooldownRemaining / ability.CooldownSeconds);
        }
    }

    /// <summary>
    /// Example concrete ability: a short-range knockback nova that pushes nearby targets away.
    /// Demonstrates how to extend MythicWeaponAbility with a real effect.
    /// </summary>
    public class KnockbackNovaAbility : MythicWeaponAbility
    {
        [SerializeField] private float novaRadius = 6f;
        [SerializeField] private float knockbackForce = 15f;
        [SerializeField] private LayerMask affectedLayers;

        protected override void ExecuteEffect(GameObject user)
        {
            Collider[] hits = Physics.OverlapSphere(user.transform.position, novaRadius, affectedLayers);
            foreach (var hit in hits)
            {
                if (hit.attachedRigidbody == null || hit.gameObject == user)
                    continue;

                Vector3 direction = (hit.transform.position - user.transform.position).normalized;
                hit.attachedRigidbody.AddForce(direction * knockbackForce, ForceMode.VelocityChange);
            }
        }
    }
}
