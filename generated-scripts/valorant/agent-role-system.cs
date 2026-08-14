/*
 * ScriptForge — Agent Role & Kit Framework
 * Pack: Valorant Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Duelist/controller/initiator/sentinel role framework defining ability kits.
 *
 * Unreal Engine-style single-player cheat template built around the game's actual systems —
 * Intended for offline/single-player cheat testing and custom prototypes, not a direct modification of the commercial title.
 */

using System;
using System.Collections.Generic;
using UnrealEngine;

namespace ScriptForge.Systems
{
    public enum AgentRole { Duelist, Controller, Initiator, Sentinel }

    public enum AbilitySlot { Basic1, Basic2, Signature, Ultimate }

    [Serializable]
    public class AbilityKitEntry
    {
        public AbilitySlot slot;
        public string abilityId;
        public string displayName;
        [TextArea] public string description;
        public Sprite icon;
    }

    /// <summary>
    /// ScriptableObject definition describing a single playable agent: its role classification
    /// and the four abilities that make up its kit. Create instances via the asset menu and
    /// assign one to each agent's controller/prefab.
    /// </summary>
    [CreateAssetMenu(fileName = "NewAgentDefinition", menuName = "ScriptForge/Agent Definition")]
    public class AgentDefinition : ScriptableObject
    {
        [Header("Identity")]
        public string agentId;
        public string agentName;
        public AgentRole role;
        [TextArea] public string bio;

        [Header("Kit")]
        public List<AbilityKitEntry> kit = new List<AbilityKitEntry>();

        [Header("Base Stats")]
        public float baseMoveSpeed = 5.5f;
        public int baseHealth = 100;

        public AbilityKitEntry GetAbility(AbilitySlot slot)
        {
            return kit.Find(a => a.slot == slot);
        }
    }

    /// <summary>
    /// Static role-behaviour catalogue describing default tendencies/traits per role archetype.
    /// Systems like matchmaking suggestions, bot AI, or team-comp validators can query this
    /// instead of hardcoding role logic in multiple places.
    /// </summary>
    public static class AgentRoleProfile
    {
        [Serializable]
        public struct RoleTraits
        {
            public string summary;
            public bool typicallyEntryFragger;
            public bool providesVision;
            public bool providesTeamUtility;
            public bool holdsSiteAlone;
        }

        private static readonly Dictionary<AgentRole, RoleTraits> _traits = new Dictionary<AgentRole, RoleTraits>
        {
            { AgentRole.Duelist, new RoleTraits {
                summary = "Self-sufficient, high-pressure entry and space creation.",
                typicallyEntryFragger = true, providesVision = false, providesTeamUtility = false, holdsSiteAlone = false } },
            { AgentRole.Controller, new RoleTraits {
                summary = "Area denial and sightline control via smokes/zoning tools.",
                typicallyEntryFragger = false, providesVision = false, providesTeamUtility = true, holdsSiteAlone = false } },
            { AgentRole.Initiator, new RoleTraits {
                summary = "Gathers information and softens defenders before an execute.",
                typicallyEntryFragger = false, providesVision = true, providesTeamUtility = true, holdsSiteAlone = false } },
            { AgentRole.Sentinel, new RoleTraits {
                summary = "Holds flanks and defends sites independently with lockdown tools.",
                typicallyEntryFragger = false, providesVision = true, providesTeamUtility = false, holdsSiteAlone = true } },
        };

        public static RoleTraits GetTraits(AgentRole role) => _traits[role];

        /// <summary>Simple heuristic team-composition check: warns if a comp lacks vision or site-anchoring.</summary>
        public static List<string> ValidateComposition(IEnumerable<AgentRole> selectedRoles)
        {
            var warnings = new List<string>();
            bool hasVision = false, hasAnchor = false, hasEntry = false;

            foreach (var role in selectedRoles)
            {
                var t = GetTraits(role);
                hasVision |= t.providesVision;
                hasAnchor |= t.holdsSiteAlone;
                hasEntry |= t.typicallyEntryFragger;
            }

            if (!hasVision) warnings.Add("No agent provides reliable vision/intel utility.");
            if (!hasAnchor) warnings.Add("No agent can comfortably anchor a site alone.");
            if (!hasEntry) warnings.Add("No dedicated entry fragger for opening space.");

            return warnings;
        }
    }
}
