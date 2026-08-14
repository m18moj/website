/*
 * ScriptForge — Team Composition Analyzer
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Analyzes a team's selected character roles during select/setup and flags missing role coverage.
 *
 * Standalone Unity template for building a similar system in your own game —
 * not a modification of any existing commercial title.
 */

using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ScriptForge.Valorant.Systems
{
    public enum CharacterRole
    {
        Duelist,
        Controller,
        Initiator,
        Sentinel
    }

    [System.Serializable]
    public class RosterEntry
    {
        public int PlayerId;
        public string CharacterId;
        public CharacterRole Role;
    }

    public struct CompositionReport
    {
        public Dictionary<CharacterRole, int> RoleCounts;
        public List<CharacterRole> MissingRoles;
        public List<CharacterRole> OverstackedRoles;
        public bool IsBalanced;
    }

    /// <summary>
    /// Evaluates a team's current roster of character picks and reports which
    /// tactical roles are missing entirely or overstacked, so the select-screen
    /// UI can surface a "your team has no Controller" style warning.
    /// </summary>
    public class TeamCompositionAnalyzer : MonoBehaviour
    {
        [Tooltip("How many picks of a single role before it's flagged as overstacked.")]
        [SerializeField] private int overstackThreshold = 3;

        [Tooltip("Roles considered essential for a balanced team; a missing entry here triggers a warning.")]
        [SerializeField] private List<CharacterRole> requiredRoles = new List<CharacterRole>
        {
            CharacterRole.Duelist,
            CharacterRole.Controller,
            CharacterRole.Initiator,
            CharacterRole.Sentinel
        };

        public event System.Action<CompositionReport> OnCompositionAnalyzed;

        private readonly Dictionary<int, RosterEntry> _roster = new Dictionary<int, RosterEntry>();

        public void SetPick(int playerId, string characterId, CharacterRole role)
        {
            _roster[playerId] = new RosterEntry { PlayerId = playerId, CharacterId = characterId, Role = role };
            AnalyzeAndNotify();
        }

        public void RemovePick(int playerId)
        {
            _roster.Remove(playerId);
            AnalyzeAndNotify();
        }

        /// <summary>Runs analysis over the current roster and returns a full report without requiring a change.</summary>
        public CompositionReport Analyze()
        {
            var roleCounts = new Dictionary<CharacterRole, int>();
            foreach (CharacterRole role in System.Enum.GetValues(typeof(CharacterRole)))
            {
                roleCounts[role] = 0;
            }

            foreach (RosterEntry entry in _roster.Values)
            {
                roleCounts[entry.Role]++;
            }

            List<CharacterRole> missing = requiredRoles.Where(role => roleCounts[role] == 0).ToList();
            List<CharacterRole> overstacked = roleCounts
                .Where(kvp => kvp.Value >= overstackThreshold)
                .Select(kvp => kvp.Key)
                .ToList();

            return new CompositionReport
            {
                RoleCounts = roleCounts,
                MissingRoles = missing,
                OverstackedRoles = overstacked,
                IsBalanced = missing.Count == 0 && overstacked.Count == 0
            };
        }

        /// <summary>Suggests which roles a player about to pick should consider to fill team gaps.</summary>
        public List<CharacterRole> SuggestRolesToFillGaps()
        {
            CompositionReport report = Analyze();
            if (report.MissingRoles.Count > 0)
                return report.MissingRoles;

            // No hard gaps — recommend the least-represented role instead.
            var sorted = report.RoleCounts.OrderBy(kvp => kvp.Value).Select(kvp => kvp.Key).ToList();
            return sorted.Take(1).ToList();
        }

        private void AnalyzeAndNotify()
        {
            OnCompositionAnalyzed?.Invoke(Analyze());
        }
    }
}
