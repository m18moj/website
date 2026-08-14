/*
 * ScriptForge — Clan Tag & Squad Identity System
 * Pack: Call of Duty Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Manages clan tag display, squad banner composition, and persistence of a player's chosen identity.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ScriptForge.Systems
{
    [Serializable]
    public class SquadBanner
    {
        public string backgroundId;
        public string emblemId;
        public Color primaryColor = Color.white;
        public Color secondaryColor = Color.gray;
    }

    [Serializable]
    public class PlayerIdentity
    {
        public string playerId;
        public string displayName;
        [Tooltip("Uppercase, 1-5 characters, shown in brackets before the player name.")]
        public string clanTag = "";
        public SquadBanner banner = new SquadBanner();
    }

    [Serializable]
    public class SquadInfo
    {
        public string squadId;
        public string squadName;
        public List<string> memberPlayerIds = new List<string>();
        public SquadBanner sharedBanner = new SquadBanner();
    }

    /// <summary>
    /// Owns the local player's identity (name/clan tag/banner) plus lightweight squad
    /// membership tracking, and persists identity to PlayerPrefs between sessions.
    /// </summary>
    public class ClanTagSquadIdentitySystem : MonoBehaviour
    {
        private const int MaxClanTagLength = 5;
        private const string PrefsKeyPrefix = "SF_Identity_";

        [SerializeField] private PlayerIdentity localIdentity = new PlayerIdentity();
        [SerializeField] private List<SquadInfo> knownSquads = new List<SquadInfo>();

        public event Action<PlayerIdentity> OnIdentityChanged;
        public event Action<SquadInfo> OnSquadJoined;
        public event Action OnSquadLeft;

        private string _currentSquadId;

        private void Awake()
        {
            LoadIdentity();
        }

        /// <summary>Sets and sanitizes the player's clan tag, enforcing length and character rules.</summary>
        public bool SetClanTag(string rawTag)
        {
            if (string.IsNullOrEmpty(rawTag))
            {
                localIdentity.clanTag = "";
                OnIdentityChanged?.Invoke(localIdentity);
                return true;
            }

            string sanitized = new string(rawTag.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
            if (sanitized.Length == 0 || sanitized.Length > MaxClanTagLength) return false;

            localIdentity.clanTag = sanitized;
            OnIdentityChanged?.Invoke(localIdentity);
            SaveIdentity();
            return true;
        }

        public void SetBanner(SquadBanner banner)
        {
            localIdentity.banner = banner;
            OnIdentityChanged?.Invoke(localIdentity);
            SaveIdentity();
        }

        /// <summary>Returns the full display string, e.g. "[WOLF] Nightshade".</summary>
        public string GetFormattedDisplayName()
        {
            return string.IsNullOrEmpty(localIdentity.clanTag)
                ? localIdentity.displayName
                : $"[{localIdentity.clanTag}] {localIdentity.displayName}";
        }

        public void JoinSquad(SquadInfo squad)
        {
            if (squad == null) return;
            if (!squad.memberPlayerIds.Contains(localIdentity.playerId))
            {
                squad.memberPlayerIds.Add(localIdentity.playerId);
            }
            _currentSquadId = squad.squadId;
            OnSquadJoined?.Invoke(squad);
        }

        public void LeaveSquad()
        {
            var squad = knownSquads.FirstOrDefault(s => s.squadId == _currentSquadId);
            squad?.memberPlayerIds.Remove(localIdentity.playerId);
            _currentSquadId = null;
            OnSquadLeft?.Invoke();
        }

        public SquadInfo GetCurrentSquad()
        {
            return knownSquads.FirstOrDefault(s => s.squadId == _currentSquadId);
        }

        private void SaveIdentity()
        {
            PlayerPrefs.SetString(PrefsKeyPrefix + "ClanTag", localIdentity.clanTag);
            PlayerPrefs.SetString(PrefsKeyPrefix + "DisplayName", localIdentity.displayName);
            PlayerPrefs.Save();
        }

        private void LoadIdentity()
        {
            localIdentity.clanTag = PlayerPrefs.GetString(PrefsKeyPrefix + "ClanTag", localIdentity.clanTag);
            localIdentity.displayName = PlayerPrefs.GetString(PrefsKeyPrefix + "DisplayName", localIdentity.displayName);
        }
    }
}
