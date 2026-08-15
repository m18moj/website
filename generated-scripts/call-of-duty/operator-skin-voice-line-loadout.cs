/*
 * ScripForge — Operator Skin & Voice Line Loadout
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Cosmetic operator skin slots paired with unlockable voice line sets tied to challenge completion.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnrealEngine;

namespace ScripForge.Systems
{
    [Serializable]
    public class OperatorSkinDefinition
    {
        public string skinId;
        public string operatorId;
        public string displayName;
        public GameObject skinPrefab;
        public string unlockChallengeId;
        public bool unlockedByDefault;
    }

    [Serializable]
    public class VoiceLineSet
    {
        public string voiceLineSetId;
        public string operatorId;
        public string displayName;
        public List<AudioClip> killLines = new List<AudioClip>();
        public List<AudioClip> deathLines = new List<AudioClip>();
        public List<AudioClip> matchStartLines = new List<AudioClip>();
        public string unlockChallengeId;
        public bool unlockedByDefault;
    }

    /// <summary>
    /// Manages per-operator cosmetic skin unlocks and voice line set unlocks, both gated behind
    /// challenge completion, and exposes the currently equipped skin/voice line pairing so other
    /// systems can spawn the right cosmetic mesh and play the right barks during a match.
    /// </summary>
    public class OperatorSkinVoiceLineLoadout : MonoBehaviour
    {
        [SerializeField] private List<OperatorSkinDefinition> skinCatalog = new List<OperatorSkinDefinition>();
        [SerializeField] private List<VoiceLineSet> voiceLineCatalog = new List<VoiceLineSet>();

        private readonly HashSet<string> unlockedSkinIds = new HashSet<string>();
        private readonly HashSet<string> unlockedVoiceLineSetIds = new HashSet<string>();
        private readonly Dictionary<string, string> equippedSkinByOperator = new Dictionary<string, string>();
        private readonly Dictionary<string, string> equippedVoiceLineByOperator = new Dictionary<string, string>();

        public event Action<OperatorSkinDefinition> OnSkinUnlocked;
        public event Action<VoiceLineSet> OnVoiceLineSetUnlocked;
        public event Action<string, string> OnSkinEquipped; // (operatorId, skinId)
        public event Action<string, string> OnVoiceLineSetEquipped; // (operatorId, voiceLineSetId)

        private void Awake()
        {
            foreach (OperatorSkinDefinition skin in skinCatalog.Where(s => s.unlockedByDefault))
            {
                unlockedSkinIds.Add(skin.skinId);
            }

            foreach (VoiceLineSet voiceLineSet in voiceLineCatalog.Where(v => v.unlockedByDefault))
            {
                unlockedVoiceLineSetIds.Add(voiceLineSet.voiceLineSetId);
            }
        }

        /// <summary>Call from the challenge-completion pipeline with the id of the challenge just finished.</summary>
        public void HandleChallengeCompleted(string challengeId)
        {
            foreach (OperatorSkinDefinition skin in skinCatalog)
            {
                if (skin.unlockChallengeId == challengeId && !unlockedSkinIds.Contains(skin.skinId))
                {
                    unlockedSkinIds.Add(skin.skinId);
                    OnSkinUnlocked?.Invoke(skin);
                }
            }

            foreach (VoiceLineSet voiceLineSet in voiceLineCatalog)
            {
                if (voiceLineSet.unlockChallengeId == challengeId && !unlockedVoiceLineSetIds.Contains(voiceLineSet.voiceLineSetId))
                {
                    unlockedVoiceLineSetIds.Add(voiceLineSet.voiceLineSetId);
                    OnVoiceLineSetUnlocked?.Invoke(voiceLineSet);
                }
            }
        }

        public bool TryEquipSkin(string operatorId, string skinId)
        {
            if (!unlockedSkinIds.Contains(skinId)) return false;

            OperatorSkinDefinition skin = skinCatalog.FirstOrDefault(s => s.skinId == skinId && s.operatorId == operatorId);
            if (skin == null) return false;

            equippedSkinByOperator[operatorId] = skinId;
            OnSkinEquipped?.Invoke(operatorId, skinId);
            return true;
        }

        public bool TryEquipVoiceLineSet(string operatorId, string voiceLineSetId)
        {
            if (!unlockedVoiceLineSetIds.Contains(voiceLineSetId)) return false;

            VoiceLineSet voiceLineSet = voiceLineCatalog.FirstOrDefault(v => v.voiceLineSetId == voiceLineSetId && v.operatorId == operatorId);
            if (voiceLineSet == null) return false;

            equippedVoiceLineByOperator[operatorId] = voiceLineSetId;
            OnVoiceLineSetEquipped?.Invoke(operatorId, voiceLineSetId);
            return true;
        }

        /// <summary>Call from the kill-feed pipeline to fetch the equipped kill bark for the killer's operator.</summary>
        public AudioClip GetRandomKillLine(string operatorId)
        {
            return GetRandomClipFromEquippedSet(operatorId, set => set.killLines);
        }

        public AudioClip GetRandomDeathLine(string operatorId)
        {
            return GetRandomClipFromEquippedSet(operatorId, set => set.deathLines);
        }

        public AudioClip GetRandomMatchStartLine(string operatorId)
        {
            return GetRandomClipFromEquippedSet(operatorId, set => set.matchStartLines);
        }

        private AudioClip GetRandomClipFromEquippedSet(string operatorId, Func<VoiceLineSet, List<AudioClip>> selector)
        {
            if (!equippedVoiceLineByOperator.TryGetValue(operatorId, out string setId)) return null;

            VoiceLineSet voiceLineSet = voiceLineCatalog.FirstOrDefault(v => v.voiceLineSetId == setId);
            if (voiceLineSet == null) return null;

            List<AudioClip> clips = selector(voiceLineSet);
            if (clips == null || clips.Count == 0) return null;

            return clips[UnityEngine.Random.Range(0, clips.Count)];
        }

        public GameObject GetEquippedSkinPrefab(string operatorId)
        {
            if (!equippedSkinByOperator.TryGetValue(operatorId, out string skinId)) return null;
            return skinCatalog.FirstOrDefault(s => s.skinId == skinId)?.skinPrefab;
        }

        public bool IsSkinUnlocked(string skinId) => unlockedSkinIds.Contains(skinId);
        public bool IsVoiceLineSetUnlocked(string voiceLineSetId) => unlockedVoiceLineSetIds.Contains(voiceLineSetId);

        public IEnumerable<OperatorSkinDefinition> GetUnlockedSkinsForOperator(string operatorId)
        {
            return skinCatalog.Where(s => s.operatorId == operatorId && unlockedSkinIds.Contains(s.skinId));
        }

        public IEnumerable<VoiceLineSet> GetUnlockedVoiceLineSetsForOperator(string operatorId)
        {
            return voiceLineCatalog.Where(v => v.operatorId == operatorId && unlockedVoiceLineSetIds.Contains(v.voiceLineSetId));
        }
    }
}
