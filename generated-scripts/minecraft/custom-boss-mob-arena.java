/*
 * ScripForge — Custom Boss Mob & Arena
 * Pack: Minecraft Pack | Category: AI
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Scripted boss mob with phase-based attack patterns that activates when players enter a dedicated arena zone.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.ai;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.UUID;

/**
 * CustomBossMobArena spawns a scripted boss (a buffed EntityType.WITHER
 * skeleton chosen for demonstration purposes) that shifts through attack
 * phases as its health drops, applying different effects around itself.
 * Rewards are announced on death.
 */
public class CustomBossMobArena extends JavaPlugin implements Listener {

    private enum Phase { ENRAGE_100, SUMMON_60, FRENZY_25 }

    private UUID activeBossId;
    private Location arenaCenter;
    private Phase currentPhase = Phase.ENRAGE_100;
    private BukkitRunnable phaseTicker;

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("CustomBossMobArena enabled.");
    }

    @Override
    public void onDisable() {
        if (phaseTicker != null) phaseTicker.cancel();
    }

    /** Spawns the boss at the given arena center and begins its phase-tracking loop. */
    public void spawnBoss(Location center) {
        this.arenaCenter = center;
        LivingEntity boss = (LivingEntity) center.getWorld().spawnEntity(center, EntityType.WITHER_SKELETON);
        boss.setCustomName("§4§lArena Overlord");
        boss.setCustomNameVisible(true);
        boss.getAttribute(Attribute.GENERIC_MAX_HEALTH).setBaseValue(200.0);
        boss.setHealth(200.0);
        activeBossId = boss.getUniqueId();
        currentPhase = Phase.ENRAGE_100;

        phaseTicker = new BukkitRunnable() {
            @Override
            public void run() {
                tickPhases();
            }
        };
        phaseTicker.runTaskTimer(this, 0L, 60L); // check phase every 3 seconds
    }

    /** Checks the boss's current health percentage and advances phases, applying phase effects. */
    private void tickPhases() {
        LivingEntity boss = getActiveBoss();
        if (boss == null || boss.isDead()) {
            if (phaseTicker != null) phaseTicker.cancel();
            return;
        }

        double maxHealth = boss.getAttribute(Attribute.GENERIC_MAX_HEALTH).getValue();
        double percent = (boss.getHealth() / maxHealth) * 100.0;

        if (percent <= 25 && currentPhase != Phase.FRENZY_25) {
            currentPhase = Phase.FRENZY_25;
            applyFrenzyPhase(boss);
        } else if (percent <= 60 && currentPhase == Phase.ENRAGE_100) {
            currentPhase = Phase.SUMMON_60;
            applySummonPhase(boss);
        }
    }

    /** Phase 1->2: boss speeds up and calls in reinforcements. */
    private void applySummonPhase(LivingEntity boss) {
        boss.addPotionEffect(new PotionEffect(PotionEffectType.SPEED, 20 * 30, 1));
        for (int i = 0; i < 2; i++) {
            boss.getWorld().spawnEntity(boss.getLocation(), EntityType.SKELETON);
        }
        broadcastToArena("The Arena Overlord summons reinforcements!");
    }

    /** Final phase: boss enrages with strength and resistance buffs. */
    private void applyFrenzyPhase(LivingEntity boss) {
        boss.addPotionEffect(new PotionEffect(PotionEffectType.INCREASE_DAMAGE, 20 * 60, 2));
        boss.addPotionEffect(new PotionEffect(PotionEffectType.DAMAGE_RESISTANCE, 20 * 60, 1));
        broadcastToArena("The Arena Overlord enters a frenzy!");
    }

    private void broadcastToArena(String message) {
        if (arenaCenter == null) return;
        for (Player player : arenaCenter.getWorld().getPlayers()) {
            if (player.getLocation().distanceSquared(arenaCenter) <= 50 * 50) {
                player.sendMessage("§c[Boss] §f" + message);
            }
        }
    }

    private LivingEntity getActiveBoss() {
        if (activeBossId == null) return null;
        org.bukkit.entity.Entity entity = Bukkit.getEntity(activeBossId);
        return entity instanceof LivingEntity ? (LivingEntity) entity : null;
    }

    @EventHandler
    public void onEntityDamage(EntityDamageEvent event) {
        if (event.getEntity().getUniqueId().equals(activeBossId)) {
            tickPhases();
        }
    }

    @EventHandler
    public void onBossDeath(EntityDeathEvent event) {
        if (!event.getEntity().getUniqueId().equals(activeBossId)) return;

        broadcastToArena("The Arena Overlord has been slain! Rewards incoming.");
        activeBossId = null;
        if (phaseTicker != null) phaseTicker.cancel();
    }
}
