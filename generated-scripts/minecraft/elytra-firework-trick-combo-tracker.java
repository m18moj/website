/*
 * ScripForge — Elytra Firework Trick Combo Tracker
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tracks Elytra flight tricks — barrel rolls, firework-boost chains — for a style-score leaderboard.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.systems;

import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityToggleGlideEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * ElytraFireworkTrickComboTracker watches gliding players for two trick
 * types: rapid full-rotation "barrel rolls" (detected from yaw delta while
 * airborne) and chained firework boosts (consecutive firework uses while
 * still gliding, within a short window of each other). Each trick adds to a
 * combo multiplier that decays if the player stops chaining tricks, and the
 * combo's peak score is banked into a persistent style-score leaderboard.
 */
public class ElytraFireworkTrickComboTracker extends JavaPlugin implements Listener {

    private static final long COMBO_WINDOW_TICKS = 60L; // 3 seconds between tricks to keep the combo alive
    private static final float BARREL_ROLL_YAW_THRESHOLD = 300f; // cumulative yaw change to count as a roll

    /** Live combo state for one currently-gliding player. */
    private static class ComboState {
        int comboCount = 0;
        int score = 0;
        long lastTrickTick = 0L;
        float accumulatedYaw = 0f;
        float lastYaw;

        ComboState(float startingYaw) {
            this.lastYaw = startingYaw;
        }
    }

    private final Map<UUID, ComboState> activeCombos = new HashMap<>();
    private final Map<UUID, Integer> leaderboard = new HashMap<>();
    private long serverTick = 0L;

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        new BukkitRunnable() {
            @Override
            public void run() {
                serverTick++;
                decayStaleCombos();
            }
        }.runTaskTimer(this, 0L, 1L);
        getLogger().info("ElytraFireworkTrickComboTracker enabled.");
    }

    @EventHandler
    public void onGlideToggle(EntityToggleGlideEvent event) {
        if (!(event.getEntity() instanceof Player)) return;
        Player player = (Player) event.getEntity();

        if (event.isGliding()) {
            activeCombos.put(player.getUniqueId(), new ComboState(player.getLocation().getYaw()));
        } else {
            bankCombo(player);
        }
    }

    @EventHandler
    public void onMove(PlayerMoveEvent event) {
        Player player = event.getPlayer();
        ComboState state = activeCombos.get(player.getUniqueId());
        if (state == null || !player.isGliding() || event.getTo() == null) return;

        float currentYaw = event.getTo().getYaw();
        float delta = Math.abs(normalizeYawDelta(currentYaw - state.lastYaw));
        state.accumulatedYaw += delta;
        state.lastYaw = currentYaw;

        if (state.accumulatedYaw >= BARREL_ROLL_YAW_THRESHOLD) {
            state.accumulatedYaw = 0f;
            registerTrick(player, state, "Barrel Roll", 15);
        }
    }

    @EventHandler
    public void onFireworkUse(PlayerInteractEvent event) {
        Player player = event.getPlayer();
        if (!player.isGliding()) return;

        ItemStack item = event.getItem();
        if (item == null || item.getType() != Material.FIREWORK_ROCKET) return;

        ComboState state = activeCombos.get(player.getUniqueId());
        if (state == null) return;

        int bonus = state.lastTrickTick != 0 && (serverTick - state.lastTrickTick) <= COMBO_WINDOW_TICKS ? 20 : 10;
        registerTrick(player, state, "Firework Boost", bonus);
    }

    private void registerTrick(Player player, ComboState state, String trickName, int basePoints) {
        state.comboCount++;
        int gained = basePoints * state.comboCount;
        state.score += gained;
        state.lastTrickTick = serverTick;
        player.sendMessage(ChatColor.AQUA + trickName + " x" + state.comboCount
                + ChatColor.GRAY + " (+" + gained + " style, combo total " + state.score + ")");
    }

    /** Ends the airborne window that no longer counts toward a live combo, causing an implicit reset. */
    private void decayStaleCombos() {
        for (Map.Entry<UUID, ComboState> entry : activeCombos.entrySet()) {
            ComboState state = entry.getValue();
            if (state.lastTrickTick != 0 && (serverTick - state.lastTrickTick) > COMBO_WINDOW_TICKS * 3) {
                state.comboCount = 0;
            }
        }
    }

    /** Banks the player's combo score into the leaderboard once they stop gliding, keeping their best run. */
    private void bankCombo(Player player) {
        ComboState state = activeCombos.remove(player.getUniqueId());
        if (state == null || state.score == 0) return;

        leaderboard.merge(player.getUniqueId(), state.score, Math::max);
        player.sendMessage(ChatColor.GOLD + "Flight ended — banked " + state.score + " style points.");
    }

    /** Returns the top style-score entries, highest first, as an insertion-ordered map. */
    public Map<UUID, Integer> getTopScores(int limit) {
        return leaderboard.entrySet().stream()
                .sorted((a, b) -> b.getValue() - a.getValue())
                .limit(limit)
                .collect(Collectors.toMap(Entry::getKey, Entry::getValue, (x, y) -> x, java.util.LinkedHashMap::new));
    }

    private float normalizeYawDelta(float delta) {
        while (delta > 180f) delta -= 360f;
        while (delta < -180f) delta += 360f;
        return delta;
    }
}
