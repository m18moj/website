/*
 * ScripForge — Stamina & Hunger Bar System
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Implements an action-based stamina pool that drains from sprinting, mining, and jumping, and regenerates using hunger.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.systems;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.player.PlayerJumpEvent;
import org.bukkit.event.player.PlayerToggleSprintEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitTask;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * StaminaHungerSystem maintains a per-player stamina value (0-100) that is
 * consumed by strenuous actions and regenerates over time as long as the
 * player's hunger bar is above a configured threshold.
 */
public class StaminaHungerSystem extends JavaPlugin implements Listener {

    private static final double MAX_STAMINA = 100.0;
    private static final double SPRINT_DRAIN_PER_TICK = 0.6;
    private static final double MINE_DRAIN = 4.0;
    private static final double JUMP_DRAIN = 2.5;
    private static final double REGEN_PER_TICK = 0.8;
    /** Player food level (0-20) must be at least this to regenerate stamina. */
    private static final int MIN_HUNGER_TO_REGEN = 6;
    private static final double EXHAUSTED_THRESHOLD = 10.0;

    private final Map<UUID, Double> stamina = new HashMap<>();
    private BukkitTask tickTask;

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        // Run the regen/drain heartbeat every second (20 ticks).
        tickTask = Bukkit.getScheduler().runTaskTimer(this, this::tickAllPlayers, 20L, 20L);
        getLogger().info("StaminaHungerSystem enabled.");
    }

    @Override
    public void onDisable() {
        if (tickTask != null) tickTask.cancel();
        stamina.clear();
    }

    /** Per-second heartbeat: drains sprinting players, regenerates the rest. */
    private void tickAllPlayers() {
        for (Player player : Bukkit.getOnlinePlayers()) {
            UUID id = player.getUniqueId();
            double current = stamina.getOrDefault(id, MAX_STAMINA);

            if (player.isSprinting()) {
                current = drain(current, SPRINT_DRAIN_PER_TICK);
            } else if (player.getFoodLevel() >= MIN_HUNGER_TO_REGEN) {
                current = Math.min(MAX_STAMINA, current + REGEN_PER_TICK);
            }

            applyExhaustionPenalty(player, current);
            stamina.put(id, current);
        }
    }

    /** Slows the player down and disables sprint when stamina bottoms out. */
    private void applyExhaustionPenalty(Player player, double current) {
        if (current <= EXHAUSTED_THRESHOLD) {
            player.setSprinting(false);
            player.addPotionEffect(new PotionEffect(PotionEffectType.SLOWNESS, 40, 0, true, false));
        }
    }

    @EventHandler
    public void onSprintToggle(PlayerToggleSprintEvent event) {
        if (!event.isSprinting()) return;
        UUID id = event.getPlayer().getUniqueId();
        if (getStamina(id) <= EXHAUSTED_THRESHOLD) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onJump(PlayerJumpEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        stamina.put(id, drain(getStamina(id), JUMP_DRAIN));
    }

    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        stamina.put(id, drain(getStamina(id), MINE_DRAIN));
    }

    private double drain(double current, double amount) {
        return Math.max(0.0, current - amount);
    }

    /** Returns the player's current stamina, defaulting to full if untracked. */
    public double getStamina(UUID playerId) {
        return stamina.getOrDefault(playerId, MAX_STAMINA);
    }
}
