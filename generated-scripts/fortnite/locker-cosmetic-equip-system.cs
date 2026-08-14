/*
 * ScriptForge — Locker & Cosmetic Equip System
 * Pack: Fortnite Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Manages equipping skins, back bling, and emotes from an owned-cosmetics inventory, and applies them to a character rig.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace ScriptForge.Fortnite.Systems
{
    public enum CosmeticSlot
    {
        Skin,
        BackBling,
        Emote,
        Pickaxe
    }

    [Serializable]
    public class CosmeticItem
    {
        public string itemId;
        public string displayName;
        public CosmeticSlot slot;
        public GameObject visualPrefab; // for Skin/BackBling/Pickaxe
        public RuntimeAnimatorController emoteController; // for Emote
    }

    /// <summary>
    /// Holds the player's owned cosmetics and currently equipped loadout, and applies the
    /// equipped items to a character's attachment points at runtime. Designed to be driven
    /// by a UI "locker" screen that calls Equip/Unequip per slot.
    /// </summary>
    public class LockerCosmeticEquipSystem : MonoBehaviour
    {
        [Header("Character Attachment Points")]
        [SerializeField] private Transform skinRoot;
        [SerializeField] private Transform backBlingSocket;
        [SerializeField] private Transform pickaxeSocket;
        [SerializeField] private Animator characterAnimator;

        [Header("Owned Cosmetics")]
        [SerializeField] private List<CosmeticItem> ownedItems = new List<CosmeticItem>();

        private readonly Dictionary<CosmeticSlot, CosmeticItem> equippedItems = new Dictionary<CosmeticSlot, CosmeticItem>();
        private readonly Dictionary<CosmeticSlot, GameObject> spawnedVisuals = new Dictionary<CosmeticSlot, GameObject>();

        public event Action<CosmeticSlot, CosmeticItem> OnItemEquipped;
        public event Action<CosmeticSlot> OnSlotCleared;

        public bool Owns(string itemId)
        {
            return ownedItems.Exists(i => i.itemId == itemId);
        }

        public CosmeticItem GetEquipped(CosmeticSlot slot)
        {
            return equippedItems.TryGetValue(slot, out var item) ? item : null;
        }

        /// <summary>Equips an owned cosmetic by id into its slot, replacing whatever was there.</summary>
        public bool Equip(string itemId)
        {
            CosmeticItem item = ownedItems.Find(i => i.itemId == itemId);
            if (item == null)
                return false; // not owned, can't equip

            UnequipSlot(item.slot);
            equippedItems[item.slot] = item;
            ApplyVisual(item);

            OnItemEquipped?.Invoke(item.slot, item);
            return true;
        }

        /// <summary>Clears whatever is equipped in the given slot.</summary>
        public void UnequipSlot(CosmeticSlot slot)
        {
            if (spawnedVisuals.TryGetValue(slot, out var visual) && visual != null)
            {
                Destroy(visual);
                spawnedVisuals.Remove(slot);
            }

            if (equippedItems.ContainsKey(slot))
            {
                equippedItems.Remove(slot);
                OnSlotCleared?.Invoke(slot);
            }
        }

        private void ApplyVisual(CosmeticItem item)
        {
            switch (item.slot)
            {
                case CosmeticSlot.Skin:
                    SpawnAttached(item, skinRoot);
                    break;
                case CosmeticSlot.BackBling:
                    SpawnAttached(item, backBlingSocket);
                    break;
                case CosmeticSlot.Pickaxe:
                    SpawnAttached(item, pickaxeSocket);
                    break;
                case CosmeticSlot.Emote:
                    // Emotes don't spawn a visual; they swap an animator controller layer
                    // when actually performed via PlayEquippedEmote().
                    break;
            }
        }

        private void SpawnAttached(CosmeticItem item, Transform socket)
        {
            if (item.visualPrefab == null || socket == null)
                return;

            GameObject instance = Instantiate(item.visualPrefab, socket.position, socket.rotation, socket);
            spawnedVisuals[item.slot] = instance;
        }

        /// <summary>Plays the currently equipped emote's animation, if one is equipped.</summary>
        public bool PlayEquippedEmote()
        {
            if (!equippedItems.TryGetValue(CosmeticSlot.Emote, out var emote) || characterAnimator == null)
                return false;

            if (emote.emoteController == null)
                return false;

            characterAnimator.runtimeAnimatorController = emote.emoteController;
            characterAnimator.Play(0);
            return true;
        }

        /// <summary>Adds a new item to the owned collection, e.g. after an unlock or purchase.</summary>
        public void GrantOwnership(CosmeticItem item)
        {
            if (item != null && !Owns(item.itemId))
                ownedItems.Add(item);
        }
    }
}
