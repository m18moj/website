/*
 * ScriptForge — Advancement & Quest Tracker
 * Pack: Minecraft Pack | Category: Quests
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks an achievement-style quest tree per player, supporting hidden quests that reveal on unlock and visible ones with progress.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.quests;

import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * QuestObjectiveTracker manages a set of quest definitions with progress
 * counters and completion state per player. Quests may be marked hidden,
 * meaning they are invisible to the player's quest log until a prerequisite
 * quest is completed (mirroring vanilla's hidden advancement behavior).
 */
public class QuestObjectiveTracker extends JavaPlugin {

    private final Map<String, QuestDefinition> quests = new LinkedHashMap<>();
    /** playerId -> (questId -> current progress count) */
    private final Map<UUID, Map<String, Integer>> playerProgress = new ConcurrentHashMap<>();
    /** playerId -> set of completed quest ids, stored as a progress map value of -1 sentinel free set */
    private final Map<UUID, Map<String, Boolean>> playerCompletion = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        registerDefaultQuests();
        getLogger().info("QuestObjectiveTracker enabled with " + quests.size() + " quests.");
    }

    private void registerDefaultQuests() {
        registerQuest("gather_wood", "Gatherer", "Collect 20 logs.", 20, null, false);
        registerQuest("craft_pickaxe", "Toolsmith", "Craft a wooden pickaxe.", 1, "gather_wood", false);
        registerQuest("find_diamonds", "Deep Delver", "Mine 3 diamonds.", 3, "craft_pickaxe", false);
        registerQuest("secret_dragon", "??? Dragon Slayer", "Defeat the Ender Dragon.", 1, "find_diamonds", true);
    }

    public void registerQuest(String id, String title, String description, int targetProgress,
                               String prerequisite, boolean hidden) {
        quests.put(id, new QuestDefinition(id, title, description, targetProgress, prerequisite, hidden));
    }

    /** Adds progress toward a quest objective for a player and handles completion. */
    public void addProgress(Player player, String questId, int amount) {
        QuestDefinition quest = quests.get(questId);
        if (quest == null || isCompleted(player, questId)) return;
        if (!isVisible(player, questId)) return;

        Map<String, Integer> progressMap = playerProgress.computeIfAbsent(player.getUniqueId(), k -> new ConcurrentHashMap<>());
        int updated = Math.min(quest.targetProgress, progressMap.getOrDefault(questId, 0) + amount);
        progressMap.put(questId, updated);

        player.sendMessage(ChatColor.AQUA + "[Quest] " + quest.title + ": " + updated + "/" + quest.targetProgress);

        if (updated >= quest.targetProgress) {
            completeQuest(player, quest);
        }
    }

    /** Marks a quest complete and announces it, revealing any hidden follow-ups implicitly via isVisible checks. */
    private void completeQuest(Player player, QuestDefinition quest) {
        playerCompletion.computeIfAbsent(player.getUniqueId(), k -> new ConcurrentHashMap<>())
                .put(quest.id, true);
        player.sendMessage(ChatColor.GREEN + "Quest Complete: " + ChatColor.BOLD + quest.title);
    }

    /** A quest is visible if it's not hidden, or its prerequisite has been completed. */
    public boolean isVisible(Player player, String questId) {
        QuestDefinition quest = quests.get(questId);
        if (quest == null) return false;
        if (!quest.hidden) return true;
        return quest.prerequisite != null && isCompleted(player, quest.prerequisite);
    }

    public boolean isCompleted(Player player, String questId) {
        Map<String, Boolean> completions = playerCompletion.get(player.getUniqueId());
        return completions != null && completions.getOrDefault(questId, false);
    }

    public int getProgress(Player player, String questId) {
        Map<String, Integer> progressMap = playerProgress.get(player.getUniqueId());
        return progressMap == null ? 0 : progressMap.getOrDefault(questId, 0);
    }

    /** Immutable definition of a single quest/advancement node. */
    private static class QuestDefinition {
        final String id;
        final String title;
        final String description;
        final int targetProgress;
        final String prerequisite;
        final boolean hidden;

        QuestDefinition(String id, String title, String description, int targetProgress,
                         String prerequisite, boolean hidden) {
            this.id = id;
            this.title = title;
            this.description = description;
            this.targetProgress = targetProgress;
            this.prerequisite = prerequisite;
            this.hidden = hidden;
        }
    }
}
