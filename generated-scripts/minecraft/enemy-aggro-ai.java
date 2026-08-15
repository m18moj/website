/*
 * ScripForge — Mob Aggro & Pathfinding AI
 * Pack: Minecraft Pack | Category: AI
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Gives hostile mobs line-of-sight aggro detection, pack-hunting alerts, and A*-style pathfinding toward targets.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.ai;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.Monster;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * EnemyAggroAI scans nearby monsters each tick cycle, evaluates line-of-sight
 * to players within an aggro radius, and coordinates "pack hunting" by
 * alerting nearby allies of the same type once one member spots a target.
 * Movement uses Bukkit's built-in navigator, which performs A*-style
 * pathfinding across the world's block graph.
 */
public class EnemyAggroAI extends JavaPlugin {

    private static final double AGGRO_RADIUS = 16.0;
    /** Radius within which a pack member alerts others of the same species. */
    private static final double PACK_ALERT_RADIUS = 10.0;
    private static final long SCAN_PERIOD_TICKS = 15L;

    /** Tracks which player each aggroed mob is currently hunting. */
    private final Map<UUID, UUID> aggroTargets = new HashMap<>();
    private BukkitTask scanTask;

    @Override
    public void onEnable() {
        scanTask = Bukkit.getScheduler().runTaskTimer(this, this::scanForTargets, 20L, SCAN_PERIOD_TICKS);
        getLogger().info("EnemyAggroAI enabled: radius=" + AGGRO_RADIUS);
    }

    @Override
    public void onDisable() {
        if (scanTask != null) scanTask.cancel();
        aggroTargets.clear();
    }

    /** Iterates over loaded monsters and evaluates aggro/pathing each cycle. */
    private void scanForTargets() {
        for (org.bukkit.World world : Bukkit.getWorlds()) {
            for (LivingEntity entity : world.getLivingEntities()) {
                if (!(entity instanceof Monster) || !(entity instanceof Mob)) continue;
                evaluateMonster((Mob) entity);
            }
        }
    }

    /** Finds the nearest visible player and either engages or continues pursuit. */
    private void evaluateMonster(Mob mob) {
        UUID mobId = mob.getUniqueId();
        UUID currentTargetId = aggroTargets.get(mobId);

        if (currentTargetId != null) {
            Player currentTarget = Bukkit.getPlayer(currentTargetId);
            if (currentTarget != null && currentTarget.isValid()
                    && isWithinRange(mob, currentTarget, AGGRO_RADIUS * 1.5)) {
                pathTo(mob, currentTarget);
                return;
            }
            aggroTargets.remove(mobId);
        }

        Player nearest = findNearestVisiblePlayer(mob);
        if (nearest == null) return;

        aggroTargets.put(mobId, nearest.getUniqueId());
        pathTo(mob, nearest);
        alertPack(mob, nearest);
    }

    /** Searches nearby entities for the closest player with clear line-of-sight. */
    private Player findNearestVisiblePlayer(Mob mob) {
        Player closest = null;
        double closestDist = Double.MAX_VALUE;

        for (org.bukkit.entity.Entity nearby : mob.getNearbyEntities(AGGRO_RADIUS, AGGRO_RADIUS, AGGRO_RADIUS)) {
            if (!(nearby instanceof Player)) continue;
            Player player = (Player) nearby;
            if (player.getGameMode().name().equals("SPECTATOR")) continue;

            double dist = mob.getLocation().distanceSquared(player.getLocation());
            if (dist < closestDist && mob.hasLineOfSight(player)) {
                closest = player;
                closestDist = dist;
            }
        }
        return closest;
    }

    /** Directs the mob's built-in pathfinder toward the target's current location. */
    private void pathTo(Mob mob, LivingEntity target) {
        double speed = mob.getAttribute(Attribute.MOVEMENT_SPEED) != null
                ? mob.getAttribute(Attribute.MOVEMENT_SPEED).getValue() * 1.3
                : 1.0;
        mob.getPathfinder().moveTo(target, speed);
        if (mob instanceof Monster) {
            mob.setTarget(target);
        }
    }

    /** Notifies same-species mobs within pack range so the whole pack converges. */
    private void alertPack(Mob source, Player target) {
        for (org.bukkit.entity.Entity nearby : source.getNearbyEntities(PACK_ALERT_RADIUS, PACK_ALERT_RADIUS, PACK_ALERT_RADIUS)) {
            if (!(nearby instanceof Mob)) continue;
            if (nearby.getType() != source.getType()) continue;

            Mob ally = (Mob) nearby;
            aggroTargets.put(ally.getUniqueId(), target.getUniqueId());
        }
    }

    private boolean isWithinRange(LivingEntity a, LivingEntity b, double range) {
        return a.getWorld().equals(b.getWorld()) && a.getLocation().distanceSquared(b.getLocation()) <= range * range;
    }
}
