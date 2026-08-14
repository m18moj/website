/*
 * ScriptForge — Scoreboard & Stats Display
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Live sidebar scoreboard showing per-player custom stats such as kills, level, and currency, refreshed on a timer.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.systems;

import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Score;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.DisplaySlot;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * ScoreboardStatsDisplay maintains a per-player sidebar scoreboard showing
 * a small set of tracked stats (kills, level, coins). Stats are stored
 * in-memory per player and the scoreboard is redrawn on an interval so
 * changes are reflected without needing to hook every stat mutation point.
 */
public class ScoreboardStatsDisplay extends JavaPlugin implements Listener {

    /** Tracked stats for one player. */
    private static class PlayerStats {
        int kills = 0;
        int level = 1;
        int coins = 0;
    }

    private final Map<UUID, PlayerStats> statsByPlayer = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        startRefreshLoop();
        getLogger().info("ScoreboardStatsDisplay enabled.");
    }

    private PlayerStats statsFor(UUID playerId) {
        return statsByPlayer.computeIfAbsent(playerId, id -> new PlayerStats());
    }

    /** Increments a player's kill count by one. */
    public void addKill(Player player) {
        statsFor(player.getUniqueId()).kills++;
    }

    /** Adds coins to a player's tracked balance (can be negative to deduct). */
    public void addCoins(Player player, int amount) {
        statsFor(player.getUniqueId()).coins += amount;
    }

    /** Sets a player's tracked level directly. */
    public void setLevel(Player player, int level) {
        statsFor(player.getUniqueId()).level = level;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        statsByPlayer.putIfAbsent(event.getPlayer().getUniqueId(), new PlayerStats());
        renderScoreboard(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        statsByPlayer.remove(event.getPlayer().getUniqueId());
    }

    /** Redraws every online player's scoreboard every 2 seconds. */
    private void startRefreshLoop() {
        getServer().getScheduler().runTaskTimer(this, () -> {
            for (Player player : getServer().getOnlinePlayers()) {
                renderScoreboard(player);
            }
        }, 20L, 40L);
    }

    /** Builds and assigns a fresh sidebar scoreboard reflecting the player's current stats. */
    private void renderScoreboard(Player player) {
        PlayerStats stats = statsFor(player.getUniqueId());

        Scoreboard board = getServer().getScoreboardManager().getNewScoreboard();
        Objective objective = board.registerNewObjective("sf_stats", "dummy",
                ChatColor.GOLD + "" + ChatColor.BOLD + "Your Stats");
        objective.setDisplaySlot(DisplaySlot.SIDEBAR);

        setLine(objective, ChatColor.YELLOW + "Level: " + ChatColor.WHITE + stats.level, 3);
        setLine(objective, ChatColor.RED + "Kills: " + ChatColor.WHITE + stats.kills, 2);
        setLine(objective, ChatColor.GREEN + "Coins: " + ChatColor.WHITE + stats.coins, 1);

        player.setScoreboard(board);
    }

    /** Sets a single scoreboard line to the given score value; each line's text must be unique. */
    private void setLine(Objective objective, String text, int score) {
        Score entry = objective.getScore(text);
        entry.setScore(score);
    }
}
