/*
 * ScripForge — Reboot Van & Teammate Revive
 * Pack: Fortnite Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks eliminated-teammate reboot cards and handles the respawn flow when a card is used at a reboot station.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ScripForge.Fortnite.Systems
{
    /// <summary>
    /// Represents a squad's shared pool of reboot cards, one per eliminated teammate,
    /// each with a limited pickup window. Pair with RebootStation to consume a card
    /// and respawn the associated teammate.
    /// </summary>
    public class TeammateRebootCard
    {
        public string TeammateId;
        public float ExpiresAtTime;
        public bool Collected;

        public bool IsExpired => Time.time >= ExpiresAtTime && !Collected;
    }

    /// <summary>
    /// Squad-level manager that tracks reboot cards for eliminated teammates and drives
    /// the actual respawn once a card is redeemed at a RebootStation.
    /// </summary>
    public class RebootVanTeammateRevive : MonoBehaviour
    {
        [Header("Card Settings")]
        [SerializeField] private float cardLifetimeSeconds = 90f;

        private readonly Dictionary<string, TeammateRebootCard> activeCards = new Dictionary<string, TeammateRebootCard>();

        public delegate void CardSpawnedHandler(TeammateRebootCard card);
        public event CardSpawnedHandler OnCardSpawned;
        public delegate void CardExpiredHandler(string teammateId);
        public event CardExpiredHandler OnCardExpired;
        public delegate void TeammateRevivedHandler(string teammateId);
        public event TeammateRevivedHandler OnTeammateRevived;

        private void Update()
        {
            // Sweep for expired cards each frame. For large squads this is cheap since
            // pools are small (max squad size - 1 concurrent cards).
            List<string> expiredIds = null;
            foreach (var kvp in activeCards)
            {
                if (kvp.Value.IsExpired)
                {
                    expiredIds ??= new List<string>();
                    expiredIds.Add(kvp.Key);
                }
            }

            if (expiredIds != null)
            {
                foreach (var id in expiredIds)
                {
                    activeCards.Remove(id);
                    OnCardExpired?.Invoke(id);
                }
            }
        }

        /// <summary>Call when a teammate is eliminated to generate their reboot card.</summary>
        public TeammateRebootCard SpawnCardFor(string teammateId)
        {
            if (activeCards.ContainsKey(teammateId))
                return activeCards[teammateId]; // already down, card already pending

            var card = new TeammateRebootCard
            {
                TeammateId = teammateId,
                ExpiresAtTime = Time.time + cardLifetimeSeconds,
                Collected = false
            };

            activeCards[teammateId] = card;
            OnCardSpawned?.Invoke(card);
            return card;
        }

        /// <summary>Marks a card as picked up by a squadmate (does not yet revive).</summary>
        public bool CollectCard(string teammateId)
        {
            if (!activeCards.TryGetValue(teammateId, out var card) || card.Collected)
                return false;

            card.Collected = true;
            return true;
        }

        /// <summary>Returns true if any collected-but-unredeemed card exists for this teammate.</summary>
        public bool HasCollectedCard(string teammateId)
        {
            return activeCards.TryGetValue(teammateId, out var card) && card.Collected;
        }

        /// <summary>
        /// Redeems a collected card at a reboot station, triggering the teammate's respawn.
        /// Returns false if no valid collected card exists.
        /// </summary>
        public bool RedeemAtStation(string teammateId, RebootStation station)
        {
            if (!activeCards.TryGetValue(teammateId, out var card) || !card.Collected)
                return false;

            activeCards.Remove(teammateId);
            StartCoroutine(RunRebootSequence(teammateId, station));
            return true;
        }

        private IEnumerator RunRebootSequence(string teammateId, RebootStation station)
        {
            station.PlayRebootEffect();
            yield return new WaitForSeconds(station.RebootDuration);
            OnTeammateRevived?.Invoke(teammateId);
        }
    }

    /// <summary>Minimal reboot-station stub exposing what the revive flow needs.</summary>
    public class RebootStation : MonoBehaviour
    {
        [SerializeField] private float rebootDuration = 3.5f;
        [SerializeField] private ParticleSystem rebootVfx;

        public float RebootDuration => rebootDuration;

        public void PlayRebootEffect()
        {
            if (rebootVfx != null)
                rebootVfx.Play();
        }
    }
}
