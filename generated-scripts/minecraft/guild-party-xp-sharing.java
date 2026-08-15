/*
 * ScripForge — Guild & Party XP Sharing
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Party formation with shared XP pooling and a guild tag prefix shown in chat and the scoreboard.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.systems;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Scoreboard;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * GuildPartyXpSharing tracks two independent groupings per player: a
 * transient party (formed for shared XP on kills) and a persistent guild
 * (a display tag rendered in chat and on the sidebar scoreboard). XP earned
 * from a kill by any party member is split evenly across the whole party.
 */
public class GuildPartyXpSharing extends JavaPlugin implements Listener {

    private final Map<UUID, Set<UUID>> parties = new HashMap<>();
    private final Map<UUID, String> guildTags = new HashMap<>();
    private final Map<UUID, Integer> pooledXp = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("GuildPartyXpSharing enabled.");
    }

    /** Forms (or joins) a party containing both players, merging existing parties if either already has one. */
    public void formParty(Player initiator, Player invitee) {
        Set<UUID> existing = parties.get(initiator.getUniqueId());
        Set<UUID> group = existing != null ? existing : new HashSet<>();
        group.add(initiator.getUniqueId());
        group.add(invitee.getUniqueId());

        for (UUID member : group) {
            parties.put(member, group);
        }
        broadcastToParty(group, ChatColor.GREEN + invitee.getName() + " has joined the party.");
    }

    /** Removes a player from whatever party they're in. */
    public void leaveParty(Player player) {
        Set<UUID> group = parties.remove(player.getUniqueId());
        if (group == null) return;
        group.remove(player.getUniqueId());
        for (UUID member : group) {
            parties.put(member, group);
        }
    }

    /** Sets the guild tag shown before this player's name in chat and on the scoreboard. */
    public void setGuildTag(Player player, String tag) {
        guildTags.put(player.getUniqueId(), tag);
        refreshScoreboardEntry(player);
    }

    private void refreshScoreboardEntry(Player player) {
        Scoreboard board = player.getScoreboard();
        if (board == Bukkit.getScoreboardManager().getMainScoreboard()) {
            board = Bukkit.getScoreboardManager().getNewScoreboard();
            player.setScoreboard(board);
        }
        Objective objective = board.getObjective("guildTags");
        if (objective == null) {
            objective = board.registerNewObjective("guildTags", "dummy", ChatColor.GOLD + "Guild");
            objective.setDisplaySlot(org.bukkit.scoreboard.DisplaySlot.SIDEBAR);
        }
        String tag = guildTags.getOrDefault(player.getUniqueId(), "");
        objective.getScore(tag + player.getName()).setScore(1);
    }

    /** Splits an XP amount evenly across every online member of the killer's party. */
    private void shareXp(Player killer, int amount) {
        Set<UUID> group = parties.get(killer.getUniqueId());
        if (group == null || group.isEmpty()) {
            killer.giveExp(amount);
            return;
        }
        int share = Math.max(1, amount / group.size());
        for (UUID memberId : group) {
            Player member = Bukkit.getPlayer(memberId);
            if (member != null && member.isOnline()) {
                member.giveExp(share);
                pooledXp.merge(memberId, share, Integer::sum);
            }
        }
    }

    private void broadcastToParty(Set<UUID> group, String message) {
        for (UUID memberId : group) {
            Player member = Bukkit.getPlayer(memberId);
            if (member != null) member.sendMessage(message);
        }
    }

    @EventHandler
    public void onEntityDeath(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();
        if (killer == null) return;
        int droppedXp = event.getDroppedExp();
        if (droppedXp > 0) {
            event.setDroppedExp(0);
            shareXp(killer, droppedXp);
        }
    }

    @EventHandler
    public void onChat(AsyncPlayerChatEvent event) {
        String tag = guildTags.get(event.getPlayer().getUniqueId());
        if (tag != null && !tag.isEmpty()) {
            event.setFormat(ChatColor.GOLD + "[" + tag + "] " + ChatColor.RESET + event.getFormat());
        }
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        if (guildTags.containsKey(event.getPlayer().getUniqueId())) {
            refreshScoreboardEntry(event.getPlayer());
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        leaveParty(event.getPlayer());
    }
}
