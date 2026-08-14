/*
 * ScriptForge — Agent Select & Lock-In
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Pre-match character-select flow with per-team duplicate-pick prevention and a lock-in confirmation step.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections.Generic;
using UnityEngine;

namespace ScriptForge.Valorant.Systems
{
    [System.Serializable]
    public class CharacterDefinition
    {
        public string CharacterId;
        public string DisplayName;
        public Sprite Portrait;
    }

    /// <summary>
    /// Tracks per-team character picks for a pre-match select screen, preventing
    /// two players on the same team from selecting the same character and
    /// requiring an explicit lock-in step before a pick becomes final.
    /// </summary>
    public class AgentSelectLockIn : MonoBehaviour
    {
        [SerializeField] private List<CharacterDefinition> availableCharacters = new List<CharacterDefinition>();

        /// <summary>Fired when any player's tentative selection changes (playerId, characterId or null).</summary>
        public event System.Action<int, string> OnSelectionChanged;
        /// <summary>Fired when a player locks in their pick.</summary>
        public event System.Action<int, string> OnPlayerLockedIn;
        /// <summary>Fired once every player on every active team has locked in.</summary>
        public event System.Action OnAllPlayersLocked;

        // playerId -> teamId
        private readonly Dictionary<int, int> _playerTeams = new Dictionary<int, int>();
        // playerId -> tentative (not yet locked) characterId
        private readonly Dictionary<int, string> _tentativeSelections = new Dictionary<int, string>();
        // playerId -> locked characterId
        private readonly Dictionary<int, string> _lockedSelections = new Dictionary<int, string>();

        public void RegisterPlayer(int playerId, int teamId)
        {
            _playerTeams[playerId] = teamId;
        }

        /// <summary>
        /// Attempts to set a player's tentative (pre-lock) character choice.
        /// Returns false if that character is already taken on the player's team
        /// or the player has already locked in.
        /// </summary>
        public bool TrySelect(int playerId, string characterId)
        {
            if (_lockedSelections.ContainsKey(playerId))
                return false;

            if (!_playerTeams.TryGetValue(playerId, out int teamId))
                return false;

            if (IsCharacterTakenOnTeam(teamId, characterId, excludingPlayer: playerId))
                return false;

            _tentativeSelections[playerId] = characterId;
            OnSelectionChanged?.Invoke(playerId, characterId);
            return true;
        }

        public void ClearSelection(int playerId)
        {
            if (_lockedSelections.ContainsKey(playerId))
                return;

            _tentativeSelections.Remove(playerId);
            OnSelectionChanged?.Invoke(playerId, null);
        }

        /// <summary>
        /// Finalizes a player's pick. Fails if they have no tentative selection,
        /// or if the character has since been taken by a teammate who locked first.
        /// </summary>
        public bool TryLockIn(int playerId)
        {
            if (_lockedSelections.ContainsKey(playerId))
                return false;

            if (!_tentativeSelections.TryGetValue(playerId, out string characterId))
                return false;

            if (!_playerTeams.TryGetValue(playerId, out int teamId))
                return false;

            if (IsCharacterTakenOnTeam(teamId, characterId, excludingPlayer: playerId, lockedOnly: true))
                return false;

            _lockedSelections[playerId] = characterId;
            OnPlayerLockedIn?.Invoke(playerId, characterId);

            if (AllPlayersLocked())
            {
                OnAllPlayersLocked?.Invoke();
            }

            return true;
        }

        public bool IsCharacterTakenOnTeam(int teamId, string characterId, int excludingPlayer, bool lockedOnly = false)
        {
            foreach (var kvp in _playerTeams)
            {
                int otherPlayer = kvp.Key;
                int otherTeam = kvp.Value;

                if (otherPlayer == excludingPlayer || otherTeam != teamId)
                    continue;

                if (_lockedSelections.TryGetValue(otherPlayer, out string lockedChar) && lockedChar == characterId)
                    return true;

                if (!lockedOnly && _tentativeSelections.TryGetValue(otherPlayer, out string tentativeChar) && tentativeChar == characterId)
                    return true;
            }

            return false;
        }

        private bool AllPlayersLocked()
        {
            foreach (int playerId in _playerTeams.Keys)
            {
                if (!_lockedSelections.ContainsKey(playerId))
                    return false;
            }
            return _playerTeams.Count > 0;
        }

        public CharacterDefinition GetCharacterDefinition(string characterId)
        {
            return availableCharacters.Find(c => c.CharacterId == characterId);
        }
    }
}
