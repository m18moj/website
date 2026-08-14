/*
 * ScriptForge — NPC Dialogue & Relationship
 * Pack: GTA V Pack | Category: Dialogue
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Branching conversation trees with nearby NPCs, gated by a persistent per-NPC relationship score.
 *
 * Written for single-player use via ScriptHookVDotNet — not for GTA Online.
 */

using System;
using System.Collections.Generic;
using GTA;
using GTA.Math;
using GTA.UI;

namespace ScriptForge.Dialogue
{
    internal class DialogueNode
    {
        public string Text;
        public int MinRelationship;         // relationship required to see this node
        public int RelationshipDelta;       // change applied when this node is chosen
        public string NextNodeId;

        public DialogueNode(string text, int minRelationship, int relationshipDelta, string nextNodeId)
        {
            Text = text;
            MinRelationship = minRelationship;
            RelationshipDelta = relationshipDelta;
            NextNodeId = nextNodeId;
        }
    }

    /// <summary>
    /// Lets the player approach a nearby ped and step through a small branching dialogue
    /// tree. Each choice can raise or lower a persistent relationship score for that ped,
    /// and higher-tier dialogue branches only unlock once relationship crosses a threshold.
    /// </summary>
    public class CharacterInteractionSystem : Script
    {
        private readonly Dictionary<int, int> _relationships = new Dictionary<int, int>(); // ped handle -> score
        private readonly Dictionary<string, DialogueNode> _tree = new Dictionary<string, DialogueNode>
        {
            { "greet",     new DialogueNode("Hey, do I know you?", 0, 1, "smalltalk") },
            { "smalltalk", new DialogueNode("Just passing through, huh.", 0, 2, "favor_locked") },
            { "favor_locked", new DialogueNode("I don't do favors for strangers.", 0, 0, null) },
            { "favor_open",   new DialogueNode("Alright, since I trust you — I need a favor.", 5, 5, null) },
        };

        private const float InteractionRadius = 2.5f;
        private Ped _activeTarget;

        public CharacterInteractionSystem()
        {
            KeyDown += OnKeyDown;
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != System.Windows.Forms.Keys.F8)
                return;

            Ped target = FindNearbyPed();
            if (target == null)
            {
                Notification.PostTicker("No one nearby to talk to.", false);
                return;
            }

            _activeTarget = target;
            RunDialogue(target, "greet");
        }

        private Ped FindNearbyPed()
        {
            Ped player = Game.Player.Character;
            Ped[] nearby = World.GetNearbyPeds(player, InteractionRadius);

            foreach (Ped ped in nearby)
            {
                if (ped != null && ped.Exists() && !ped.IsPlayer && ped.IsHuman && !ped.IsDead)
                    return ped;
            }
            return null;
        }

        private void RunDialogue(Ped npc, string nodeId)
        {
            if (string.IsNullOrEmpty(nodeId) || !_tree.ContainsKey(nodeId))
                return;

            DialogueNode node = _tree[nodeId];
            int relationship = GetRelationship(npc);

            if (relationship < node.MinRelationship)
            {
                // Redirect to the locked-branch variant if requirement isn't met.
                if (nodeId == "favor_open")
                {
                    RunDialogue(npc, "favor_locked");
                    return;
                }
            }

            Notification.PostTicker(npc.ToString() + ": \"" + node.Text + "\"", false);
            AdjustRelationship(npc, node.RelationshipDelta);

            // Once smalltalk is done, offer the gated favor branch if relationship allows it.
            if (nodeId == "smalltalk")
            {
                string next = GetRelationship(npc) >= 5 ? "favor_open" : "favor_locked";
                RunDialogue(npc, next);
            }
        }

        private int GetRelationship(Ped npc)
        {
            return _relationships.ContainsKey(npc.Handle) ? _relationships[npc.Handle] : 0;
        }

        private void AdjustRelationship(Ped npc, int delta)
        {
            if (delta == 0)
                return;

            int current = GetRelationship(npc);
            _relationships[npc.Handle] = current + delta;
        }
    }
}
