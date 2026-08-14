/*
 * ScriptForge — Villager Trade & Dialogue
 * Pack: Minecraft Pack | Category: Dialogue
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Adds branching villager dialogue trees with rotating trade offers and reputation-based price adjustments.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.dialogue;

import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * DialogueBranchSystem drives branching conversations with villagers.
 * Each dialogue node offers reply options that lead to other nodes or to a
 * trade offer. Prices scale with a per-player reputation score toward that
 * villager: higher reputation yields discounts, low/negative reputation
 * yields markups.
 */
public class DialogueBranchSystem extends JavaPlugin implements Listener {

    private static final double MIN_PRICE_MULTIPLIER = 0.6;
    private static final double MAX_PRICE_MULTIPLIER = 1.5;

    private final Map<String, DialogueNode> dialogueTree = new LinkedHashMap<>();
    /** key = playerUUID + ":" + villagerUUID -> reputation score (-10..10) */
    private final Map<String, Integer> reputation = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        buildDialogueTree();
        getLogger().info("DialogueBranchSystem enabled with " + dialogueTree.size() + " nodes.");
    }

    private void buildDialogueTree() {
        dialogueTree.put("greeting", new DialogueNode(
                "Welcome, traveler. What brings you here?",
                Map.of("Show me your wares", "trade", "Just passing through", "farewell")));
        dialogueTree.put("trade", new DialogueNode(
                "Here is what I have to offer today.",
                Map.of("Back", "greeting")));
        dialogueTree.put("farewell", new DialogueNode(
                "Safe travels, friend.",
                Map.of()));
    }

    @EventHandler
    public void onInteract(PlayerInteractEntityEvent event) {
        if (!(event.getRightClicked() instanceof Villager)) return;
        Player player = event.getPlayer();
        Villager villager = (Villager) event.getRightClicked();

        startDialogue(player, villager, "greeting");
    }

    /** Sends the current dialogue node's text and numbered reply options to the player. */
    public void startDialogue(Player player, Villager villager, String nodeId) {
        DialogueNode node = dialogueTree.get(nodeId);
        if (node == null) return;

        player.sendMessage(ChatColor.YELLOW + "[Villager] " + ChatColor.WHITE + node.text);
        if (node.replies.isEmpty()) return;

        int index = 1;
        for (Map.Entry<String, String> reply : node.replies.entrySet()) {
            player.sendMessage(ChatColor.GRAY + "  " + (index++) + ". " + reply.getKey());
        }

        if (node.replies.containsValue("trade")) {
            showTradeOffers(player, villager);
        }
    }

    /** Displays this villager's trade offers with prices adjusted by reputation. */
    private void showTradeOffers(Player player, Villager villager) {
        int rep = getReputation(player, villager);
        double multiplier = priceMultiplierFromReputation(rep);

        player.sendMessage(ChatColor.AQUA + "Reputation: " + rep + " (price x" + String.format("%.2f", multiplier) + ")");
        villager.getRecipes().forEach(recipe -> {
            int adjustedPrice = (int) Math.round(recipe.getIngredients().get(0).getAmount() * multiplier);
            player.sendMessage(ChatColor.GREEN + " - " + recipe.getResult().getType()
                    + ChatColor.GRAY + " for " + adjustedPrice + "x " + recipe.getIngredients().get(0).getType());
        });
    }

    /** Maps a -10..10 reputation score onto a discount/markup multiplier. */
    private double priceMultiplierFromReputation(int rep) {
        double normalized = Math.max(-10, Math.min(10, rep)) / 10.0; // -1..1
        double range = MAX_PRICE_MULTIPLIER - MIN_PRICE_MULTIPLIER;
        return MAX_PRICE_MULTIPLIER - ((normalized + 1) / 2.0) * range;
    }

    /** Adjusts reputation for a player toward a specific villager (e.g. after a trade or quest). */
    public void adjustReputation(Player player, Villager villager, int delta) {
        String key = repKey(player, villager);
        int updated = Math.max(-10, Math.min(10, reputation.getOrDefault(key, 0) + delta));
        reputation.put(key, updated);
    }

    public int getReputation(Player player, Villager villager) {
        return reputation.getOrDefault(repKey(player, villager), 0);
    }

    private String repKey(Player player, Villager villager) {
        return player.getUniqueId() + ":" + villager.getUniqueId();
    }

    /** A single dialogue node: display text plus a map of reply text -> next node id. */
    private static class DialogueNode {
        final String text;
        final Map<String, String> replies;

        DialogueNode(String text, Map<String, String> replies) {
            this.text = text;
            this.replies = replies;
        }
    }
}
