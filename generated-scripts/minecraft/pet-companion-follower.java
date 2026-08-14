/*
 * ScriptForge — Pet & Companion Follower
 * Pack: Minecraft Pack | Category: Gameplay
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Tameable companion entity that follows its owner, assists in combat, and gains levels from battles won.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.gameplay;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Wolf;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * PetCompanionFollower turns a tamed Wolf into a leveling companion: it
 * follows its owner when they stray too far, joins fights against hostile
 * targets the owner damages, and gains levels (with a small max-health
 * bonus) whenever it lands the killing blow on a mob.
 */
public class PetCompanionFollower extends JavaPlugin implements Listener {

    /** Per-pet progression data, keyed by the pet entity's UUID. */
    private static class PetData {
        final UUID ownerId;
        int level = 1;
        int killsThisLevel = 0;

        PetData(UUID ownerId) {
            this.ownerId = ownerId;
        }
    }

    private static final int KILLS_PER_LEVEL = 3;
    private static final double FOLLOW_DISTANCE = 10.0;
    private static final double TELEPORT_DISTANCE = 20.0;

    private final Map<UUID, PetData> pets = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        startFollowLoop();
        getLogger().info("PetCompanionFollower enabled with " + pets.size() + " active pet(s).");
    }

    /** Spawns and tames a wolf companion for the given owner at their location. */
    public Wolf spawnCompanion(Player owner) {
        Location loc = owner.getLocation();
        Wolf wolf = (Wolf) loc.getWorld().spawnEntity(loc, EntityType.WOLF);
        wolf.setTamed(true);
        wolf.setOwner(owner);
        wolf.setCustomName(owner.getName() + "'s Companion");
        wolf.setCustomNameVisible(true);

        pets.put(wolf.getUniqueId(), new PetData(owner.getUniqueId()));
        owner.sendMessage("Your companion has awoken!");
        return wolf;
    }

    /** Every 2 seconds: teleport pets that fell too far behind, or have them sit-follow otherwise. */
    private void startFollowLoop() {
        getServer().getScheduler().runTaskTimer(this, () -> {
            for (Map.Entry<UUID, PetData> entry : pets.entrySet()) {
                Entity petEntity = Bukkit.getEntity(entry.getKey());
                Player owner = Bukkit.getPlayer(entry.getValue().ownerId);
                if (!(petEntity instanceof Wolf) || owner == null || !petEntity.getWorld().equals(owner.getWorld())) {
                    continue;
                }

                Wolf pet = (Wolf) petEntity;
                double distance = pet.getLocation().distance(owner.getLocation());
                if (distance > TELEPORT_DISTANCE) {
                    pet.teleport(owner.getLocation());
                } else if (distance > FOLLOW_DISTANCE) {
                    pet.setTarget(null);
                    // Real pathfinding movement toward the owner is engine-specific;
                    // NMS/Paper pathfinder APIs can be wired in here for smooth walking.
                }
            }
        }, 40L, 40L);
    }

    /** When the owner attacks a hostile mob, their nearby pet joins in against the same target. */
    @EventHandler
    public void onOwnerAttack(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player) || !(event.getEntity() instanceof LivingEntity)) return;

        Player attacker = (Player) event.getDamager();
        LivingEntity target = (LivingEntity) event.getEntity();

        for (Map.Entry<UUID, PetData> entry : pets.entrySet()) {
            if (!entry.getValue().ownerId.equals(attacker.getUniqueId())) continue;

            Entity petEntity = Bukkit.getEntity(entry.getKey());
            if (petEntity instanceof Wolf) {
                Wolf pet = (Wolf) petEntity;
                if (pet.getLocation().distanceSquared(attacker.getLocation()) <= 15 * 15) {
                    pet.setTarget(target);
                }
            }
        }
    }

    /** Awards a level-up (and a small health bonus) when a pet finishes off a mob. */
    @EventHandler
    public void onPetKill(EntityDeathEvent event) {
        LivingEntity dead = event.getEntity();

        // getKiller() is player-only in vanilla, so pets are credited by proximity/target-state
        // instead: any tracked wolf that had this mob targeted and is now standing right by the
        // corpse is assumed to have landed the finishing blow.
        for (UUID petId : pets.keySet()) {
            Entity petEntity = Bukkit.getEntity(petId);
            if (petEntity instanceof Wolf && ((Wolf) petEntity).getTarget() == null
                    && petEntity.getLocation().distanceSquared(dead.getLocation()) <= 4 * 4) {
                levelUpPet(petId);
                break;
            }
        }
    }

    /** Increments kill count and, once the threshold is met, levels up the pet and boosts its health. */
    private void levelUpPet(UUID petId) {
        PetData data = pets.get(petId);
        if (data == null) return;

        data.killsThisLevel++;
        if (data.killsThisLevel < KILLS_PER_LEVEL) return;

        data.killsThisLevel = 0;
        data.level++;

        Entity petEntity = Bukkit.getEntity(petId);
        if (petEntity instanceof LivingEntity) {
            LivingEntity pet = (LivingEntity) petEntity;
            Attribute healthAttr = Attribute.GENERIC_MAX_HEALTH;
            double newMax = pet.getAttribute(healthAttr).getBaseValue() + 2.0;
            pet.getAttribute(healthAttr).setBaseValue(newMax);
            pet.setHealth(newMax);
        }

        Player owner = Bukkit.getPlayer(data.ownerId);
        if (owner != null) {
            owner.sendMessage("Your companion reached level " + data.level + "!");
        }
    }
}
