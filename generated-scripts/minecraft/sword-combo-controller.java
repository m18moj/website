/*
 * ScripForge — Melee Combo & Critical Hits
 * Pack: Minecraft Pack | Category: Combat
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Adds chained melee combos, sprint-based critical hits, and tunable knockback for player-on-entity attacks.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.combat;

import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * SwordComboController tracks per-player attack streaks and rewards fast,
 * consecutive melee hits with rising damage multipliers, while also boosting
 * damage and knockback for sprint-jump ("critical") hits.
 */
public class SwordComboController extends JavaPlugin implements Listener {

    /** Max time (ms) allowed between hits for the combo to keep chaining. */
    private static final long COMBO_WINDOW_MS = 1200L;
    /** Maximum combo stage before it caps out. */
    private static final int MAX_COMBO_STAGE = 5;
    /** Damage multiplier added per combo stage. */
    private static final double STAGE_DAMAGE_BONUS = 0.12;
    /** Extra knockback multiplier applied on a sprint-critical hit. */
    private static final double CRIT_KNOCKBACK_BONUS = 0.35;

    private final Map<UUID, Integer> comboStage = new HashMap<>();
    private final Map<UUID, Long> lastHitTime = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("SwordComboController enabled: combo window=" + COMBO_WINDOW_MS + "ms");
    }

    @Override
    public void onDisable() {
        comboStage.clear();
        lastHitTime.clear();
    }

    @EventHandler
    public void onMeleeHit(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player)) return;
        if (!(event.getEntity() instanceof LivingEntity)) return;

        Player attacker = (Player) event.getDamager();
        LivingEntity target = (LivingEntity) event.getEntity();
        UUID id = attacker.getUniqueId();
        long now = System.currentTimeMillis();

        int stage = updateComboStage(id, now);
        double comboMultiplier = 1.0 + (stage * STAGE_DAMAGE_BONUS);

        boolean isSprintCrit = attacker.isSprinting() && !attacker.isOnGround() && attacker.getFallDistance() > 0f;

        double finalDamage = event.getDamage() * comboMultiplier;
        if (isSprintCrit) {
            finalDamage *= 1.5;
            spawnCritEffects(target.getLocation());
        }
        event.setDamage(finalDamage);

        applyKnockback(attacker, target, isSprintCrit);
        attacker.playSound(attacker.getLocation(), Sound.ENTITY_PLAYER_ATTACK_STRONG, 0.8f, 1.0f + (stage * 0.05f));

        if (stage >= MAX_COMBO_STAGE) {
            attacker.sendActionBar("§c§lMAX COMBO x" + (stage + 1));
        } else {
            attacker.sendActionBar("§eCombo x" + (stage + 1));
        }
    }

    /** Advances or resets the combo counter based on elapsed time since the last hit. */
    private int updateComboStage(UUID id, long now) {
        Long last = lastHitTime.get(id);
        int stage = comboStage.getOrDefault(id, 0);

        if (last != null && (now - last) <= COMBO_WINDOW_MS) {
            stage = Math.min(stage + 1, MAX_COMBO_STAGE);
        } else {
            stage = 0;
        }

        comboStage.put(id, stage);
        lastHitTime.put(id, now);
        return stage;
    }

    /** Pushes the target away from the attacker, boosted on critical hits. */
    private void applyKnockback(Player attacker, LivingEntity target, boolean crit) {
        Vector direction = target.getLocation().toVector()
                .subtract(attacker.getLocation().toVector())
                .normalize();
        double strength = 0.4 + (crit ? CRIT_KNOCKBACK_BONUS : 0.0);
        direction.setY(0.25);
        target.setVelocity(direction.multiply(strength));
    }

    /** Spawns crit particles/effects at the impact point for visual feedback. */
    private void spawnCritEffects(Location location) {
        location.getWorld().spawnParticle(Particle.CRIT, location.add(0, 1, 0), 20, 0.3, 0.3, 0.3, 0.05);
    }

    /** Resets a player's combo state, e.g. on death or logout. */
    public void resetCombo(UUID playerId) {
        comboStage.remove(playerId);
        lastHitTime.remove(playerId);
    }
}
