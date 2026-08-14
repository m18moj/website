/*
 * ScriptForge — Gunsmith Attachment Tree
 * Pack: Call of Duty Pack | Category: Weapons
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * A branching per-weapon attachment tree with conflicting-slot rules and live stat previews.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ScriptForge.Weapons
{
    /// <summary>Physical mount points an attachment can occupy on a weapon.</summary>
    public enum MountSlot
    {
        Optic,
        Muzzle,
        Barrel,
        Underbarrel,
        Magazine,
        Stock,
        RearGrip,
        Laser
    }

    /// <summary>A single node in the attachment tree, with stat deltas and conflict rules.</summary>
    [Serializable]
    public class AttachmentNode
    {
        public string nodeId;
        public string displayName;
        public MountSlot slot;

        [Header("Tree Position")]
        public string parentNodeId;
        public int unlockLevel;

        [Header("Stat Deltas")]
        public float damageRangeDelta;
        public float recoilControlDelta;
        public float aimDownSightDelta;
        public float mobilityDelta;

        [Header("Conflicts")]
        [Tooltip("Node IDs that cannot be equipped at the same time as this one.")]
        public List<string> conflictingNodeIds = new List<string>();
    }

    /// <summary>Aggregate stat preview produced by summing all equipped attachment deltas.</summary>
    [Serializable]
    public struct StatPreview
    {
        public float damageRange;
        public float recoilControl;
        public float aimDownSight;
        public float mobility;
    }

    /// <summary>
    /// Manages a per-weapon tree of unlockable attachments, enforcing slot exclusivity and
    /// explicit conflict rules, and exposes a live stat preview for the currently equipped set.
    /// </summary>
    public class GunsmithAttachmentTree : MonoBehaviour
    {
        [Header("Tree Definition")]
        [SerializeField] private List<AttachmentNode> allNodes = new List<AttachmentNode>();

        [Header("Runtime State")]
        [SerializeField] private int playerWeaponLevel = 1;
        [SerializeField] private List<string> equippedNodeIds = new List<string>();

        public event Action<StatPreview> OnPreviewChanged;
        public event Action<string> OnAttachmentRejected;

        private Dictionary<string, AttachmentNode> _nodesById;

        private void Awake()
        {
            _nodesById = allNodes.ToDictionary(n => n.nodeId, n => n);
        }

        /// <summary>Returns true if the node's parent (if any) is already equipped and its level is unlocked.</summary>
        public bool IsNodeAvailable(string nodeId)
        {
            if (!_nodesById.TryGetValue(nodeId, out var node)) return false;
            if (playerWeaponLevel < node.unlockLevel) return false;
            if (string.IsNullOrEmpty(node.parentNodeId)) return true;
            return equippedNodeIds.Contains(node.parentNodeId);
        }

        /// <summary>Attempts to equip a node, rejecting on slot collision, unmet prerequisites, or explicit conflicts.</summary>
        public bool EquipAttachment(string nodeId)
        {
            if (!_nodesById.TryGetValue(nodeId, out var node))
            {
                OnAttachmentRejected?.Invoke("Unknown attachment.");
                return false;
            }

            if (!IsNodeAvailable(nodeId))
            {
                OnAttachmentRejected?.Invoke("Prerequisite not met or level too low.");
                return false;
            }

            foreach (var equippedId in equippedNodeIds)
            {
                var equipped = _nodesById[equippedId];
                if (equipped.conflictingNodeIds.Contains(nodeId) || node.conflictingNodeIds.Contains(equippedId))
                {
                    OnAttachmentRejected?.Invoke($"Conflicts with equipped attachment '{equipped.displayName}'.");
                    return false;
                }
            }

            // Same-slot attachments replace each other.
            equippedNodeIds.RemoveAll(id => _nodesById[id].slot == node.slot);
            equippedNodeIds.Add(nodeId);
            OnPreviewChanged?.Invoke(ComputeStatPreview());
            return true;
        }

        public void UnequipSlot(MountSlot slot)
        {
            equippedNodeIds.RemoveAll(id => _nodesById[id].slot == slot);
            OnPreviewChanged?.Invoke(ComputeStatPreview());
        }

        /// <summary>Sums stat deltas across every currently equipped node.</summary>
        public StatPreview ComputeStatPreview()
        {
            var preview = new StatPreview();
            foreach (var id in equippedNodeIds)
            {
                var node = _nodesById[id];
                preview.damageRange += node.damageRangeDelta;
                preview.recoilControl += node.recoilControlDelta;
                preview.aimDownSight += node.aimDownSightDelta;
                preview.mobility += node.mobilityDelta;
            }
            return preview;
        }

        public IEnumerable<AttachmentNode> GetAvailableNodesForSlot(MountSlot slot)
        {
            return allNodes.Where(n => n.slot == slot && IsNodeAvailable(n.nodeId));
        }
    }
}
