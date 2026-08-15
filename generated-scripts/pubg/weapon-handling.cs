/*
 * ScripForge — Recoil Pattern & Attachment System
 * Pack: PUBG Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Per-weapon recoil patterns that are modified by equipped attachments and player stance.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

public enum PlayerStance { Standing, Crouching, Prone }

public enum AttachmentSlot { Muzzle, Grip, Stock, Scope, Magazine }

[Serializable]
public class WeaponAttachment
{
    public string attachmentName;
    public AttachmentSlot slot;
    [Range(0f, 1f)] public float verticalRecoilReduction = 0f;
    [Range(0f, 1f)] public float horizontalRecoilReduction = 0f;
    [Range(0f, 1f)] public float recoilRecoverySpeedBonus = 0f;
}

[Serializable]
public class RecoilPatternPoint
{
    public float horizontal;
    public float vertical;
}

public class WeaponHandling : MonoBehaviour
{
    [Header("Base Recoil Pattern")]
    [Tooltip("Ordered offsets applied per shot, in degrees, before modifiers.")]
    [SerializeField] private List<RecoilPatternPoint> recoilPattern = new List<RecoilPatternPoint>();
    [SerializeField] private float recoilRecoverySpeed = 6f; // Degrees per second the view resettles.

    [Header("Stance Modifiers")]
    [Range(0f, 1f)] [SerializeField] private float crouchRecoilMultiplier = 0.85f;
    [Range(0f, 1f)] [SerializeField] private float proneRecoilMultiplier = 0.65f;

    [Header("Equipped Attachments")]
    [SerializeField] private List<WeaponAttachment> equippedAttachments = new List<WeaponAttachment>();

    private int shotIndex;
    private Vector2 currentRecoilOffset;
    public PlayerStance CurrentStance { get; set; } = PlayerStance.Standing;

    private void Update()
    {
        if (currentRecoilOffset.sqrMagnitude > 0.0001f)
        {
            float recovery = GetEffectiveRecoverySpeed() * Time.deltaTime;
            currentRecoilOffset = Vector2.MoveTowards(currentRecoilOffset, Vector2.zero, recovery);
        }
    }

    /// Fires one shot, returning the camera-space recoil delta (horizontal, vertical) to apply this frame.
    public Vector2 FireShot()
    {
        if (recoilPattern.Count == 0) return Vector2.zero;

        RecoilPatternPoint point = recoilPattern[Mathf.Min(shotIndex, recoilPattern.Count - 1)];
        shotIndex++;

        float vReduction = 1f;
        float hReduction = 1f;
        foreach (var attachment in equippedAttachments)
        {
            vReduction *= 1f - attachment.verticalRecoilReduction;
            hReduction *= 1f - attachment.horizontalRecoilReduction;
        }

        float stanceMultiplier = GetStanceMultiplier();

        Vector2 delta = new Vector2(
            point.horizontal * hReduction * stanceMultiplier,
            point.vertical * vReduction * stanceMultiplier);

        currentRecoilOffset += delta;
        return delta;
    }

    /// Resets the recoil pattern index, e.g. when the player releases the trigger or reloads.
    public void ResetPattern()
    {
        shotIndex = 0;
    }

    private float GetStanceMultiplier()
    {
        switch (CurrentStance)
        {
            case PlayerStance.Crouching: return crouchRecoilMultiplier;
            case PlayerStance.Prone: return proneRecoilMultiplier;
            default: return 1f;
        }
    }

    private float GetEffectiveRecoverySpeed()
    {
        float bonus = 0f;
        foreach (var attachment in equippedAttachments)
        {
            bonus += attachment.recoilRecoverySpeedBonus;
        }
        return recoilRecoverySpeed * (1f + bonus);
    }

    /// Attaches a part to the weapon, replacing any existing attachment in the same slot.
    public void AttachPart(WeaponAttachment attachment)
    {
        equippedAttachments.RemoveAll(a => a.slot == attachment.slot);
        equippedAttachments.Add(attachment);
    }

    public void RemovePart(AttachmentSlot slot)
    {
        equippedAttachments.RemoveAll(a => a.slot == slot);
    }

    public Vector2 CurrentRecoilOffset => currentRecoilOffset;
}
