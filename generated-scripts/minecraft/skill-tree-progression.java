/*
 * ScriptForge — Tool & Enchant Progression
 * Pack: Minecraft Pack | Category: Progression
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Implements tiered tool upgrades and an enchantment-style skill tree unlocked by player XP level.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.progression;

import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerLevelChangeEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SkillTreeProgression maps player XP levels to unlockable skill-tree nodes
 * (e.g. tool tiers, passive perks). Nodes have prerequisites, so the tree
 * must be unlocked in order, similar to an enchantment table gated by level.
 */
public class SkillTreeProgression extends JavaPlugin implements Listener {

    /** Ordered skill nodes: id -> (required level, prerequisite id or null). */
    private final Map<String, SkillNode> skillTree = new LinkedHashMap<>();
    private final Map<UUID, Set<String>> unlockedNodes = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        buildDefaultTree();
        getLogger().info("SkillTreeProgression enabled with " + skillTree.size() + " nodes.");
    }

    /** Defines the default progression tree; replace with config-driven loading if desired. */
    private void buildDefaultTree() {
        addNode("iron_tools", 5, null, "Unlocks crafting of iron-tier tools.");
        addNode("diamond_tools", 15, "iron_tools", "Unlocks crafting of diamond-tier tools.");
        addNode("netherite_tools", 30, "diamond_tools", "Unlocks netherite tool upgrades.");
        addNode("efficiency_boost", 10, "iron_tools", "Passive: +10% mining speed.");
        addNode("combat_reflexes", 20, "efficiency_boost", "Passive: +5% attack speed.");
    }

    private void addNode(String id, int requiredLevel, String prerequisite, String description) {
        skillTree.put(id, new SkillNode(id, requiredLevel, prerequisite, description));
    }

    @EventHandler
    public void onLevelChange(PlayerLevelChangeEvent event) {
        Player player = event.getPlayer();
        int newLevel = event.getNewLevel();

        for (SkillNode node : skillTree.values()) {
            if (newLevel < node.requiredLevel) continue;
            if (isUnlocked(player.getUniqueId(), node.id)) continue;
            if (node.prerequisite != null && !isUnlocked(player.getUniqueId(), node.prerequisite)) continue;

            unlockNode(player, node);
        }
    }

    /** Grants a node to the player and notifies them; hook item/perk logic here. */
    private void unlockNode(Player player, SkillNode node) {
        unlockedNodes.computeIfAbsent(player.getUniqueId(), k -> ConcurrentHashMap.newKeySet()).add(node.id);
        player.sendMessage(ChatColor.GOLD + "[Skill Tree] " + ChatColor.YELLOW
                + "Unlocked: " + ChatColor.WHITE + node.description);
    }

    /** Returns true if the given player has already unlocked the given node id. */
    public boolean isUnlocked(UUID playerId, String nodeId) {
        Set<String> nodes = unlockedNodes.get(playerId);
        return nodes != null && nodes.contains(nodeId);
    }

    /** Attempts a manual/admin unlock, bypassing the level trigger but still checking prerequisites. */
    public boolean tryUnlock(Player player, String nodeId) {
        SkillNode node = skillTree.get(nodeId);
        if (node == null) return false;
        if (player.getLevel() < node.requiredLevel) return false;
        if (node.prerequisite != null && !isUnlocked(player.getUniqueId(), node.prerequisite)) return false;

        unlockNode(player, node);
        return true;
    }

    /** A single node in the progression tree. */
    private static class SkillNode {
        final String id;
        final int requiredLevel;
        final String prerequisite;
        final String description;

        SkillNode(String id, int requiredLevel, String prerequisite, String description) {
            this.id = id;
            this.requiredLevel = requiredLevel;
            this.prerequisite = prerequisite;
            this.description = description;
        }
    }
}
