/*
 * ScripForge — Villager Profession & Workstation System
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Profession assignment via nearby workstation blocks with trade-table regeneration on level-up.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.systems;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityTransformEvent;
import org.bukkit.event.entity.VillagerAcquireTradeEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * VillagerProfessionWorkstationSystem periodically scans unemployed villagers
 * for a nearby claimed workstation block, assigns the matching profession,
 * and regenerates the villager's trade table with fresh randomized offers
 * whenever the villager levels up.
 */
public class VillagerProfessionWorkstationSystem extends JavaPlugin implements Listener {

    /** Maps a workstation block material to the profession it grants. */
    private static final Map<Material, Villager.Profession> WORKSTATION_PROFESSIONS = new HashMap<>();
    static {
        WORKSTATION_PROFESSIONS.put(Material.LECTERN, Villager.Profession.LIBRARIAN);
        WORKSTATION_PROFESSIONS.put(Material.SMITHING_TABLE, Villager.Profession.WEAPONSMITH);
        WORKSTATION_PROFESSIONS.put(Material.FLETCHING_TABLE, Villager.Profession.FLETCHER);
        WORKSTATION_PROFESSIONS.put(Material.CARTOGRAPHY_TABLE, Villager.Profession.CARTOGRAPHER);
        WORKSTATION_PROFESSIONS.put(Material.BREWING_STAND, Villager.Profession.CLERIC);
        WORKSTATION_PROFESSIONS.put(Material.COMPOSTER, Villager.Profession.FARMER);
        WORKSTATION_PROFESSIONS.put(Material.BLAST_FURNACE, Villager.Profession.ARMORER);
        WORKSTATION_PROFESSIONS.put(Material.SMOKER, Villager.Profession.BUTCHER);
        WORKSTATION_PROFESSIONS.put(Material.CAULDRON, Villager.Profession.LEATHERWORKER);
        WORKSTATION_PROFESSIONS.put(Material.STONECUTTER, Villager.Profession.MASON);
        WORKSTATION_PROFESSIONS.put(Material.LOOM, Villager.Profession.SHEPHERD);
        WORKSTATION_PROFESSIONS.put(Material.GRINDSTONE, Villager.Profession.TOOLSMITH);
    }

    private static final double CLAIM_RADIUS = 2.0;
    private static final long SCAN_INTERVAL_TICKS = 20L * 10L; // every 10 seconds

    /** Tracks which workstation location each villager currently has claimed. */
    private final Map<UUID, Location> claimedWorkstations = new HashMap<>();

    /** Tracks the last known trade level per villager to detect level-ups. */
    private final Map<UUID, Integer> lastKnownLevel = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        startProfessionScan();
        getLogger().info("VillagerProfessionWorkstationSystem enabled with " + WORKSTATION_PROFESSIONS.size() + " known workstation type(s).");
    }

    /** Periodically assigns professions to unemployed villagers near a free workstation. */
    private void startProfessionScan() {
        new BukkitRunnable() {
            @Override
            public void run() {
                for (org.bukkit.World world : getServer().getWorlds()) {
                    for (Entity entity : world.getEntities()) {
                        if (entity instanceof Villager) {
                            scanVillager((Villager) entity);
                        }
                    }
                }
            }
        }.runTaskTimer(this, SCAN_INTERVAL_TICKS, SCAN_INTERVAL_TICKS);
    }

    /** Assigns a profession to a single villager if it's unemployed and near a valid workstation. */
    private void scanVillager(Villager villager) {
        checkForLevelUp(villager);

        if (villager.getProfession() != Villager.Profession.NONE
                && villager.getProfession() != Villager.Profession.NITWIT) {
            return;
        }

        Location center = villager.getLocation();

        for (Map.Entry<Material, Villager.Profession> entry : WORKSTATION_PROFESSIONS.entrySet()) {
            Location station = findNearbyWorkstation(center, entry.getKey());
            if (station != null && !isWorkstationClaimed(station)) {
                assignProfession(villager, entry.getValue(), station);
                return;
            }
        }
    }

    /** Scans a small cube around a center point for the first matching workstation block. */
    private Location findNearbyWorkstation(Location center, Material material) {
        int r = (int) Math.ceil(CLAIM_RADIUS);
        for (int dx = -r; dx <= r; dx++) {
            for (int dy = -1; dy <= 1; dy++) {
                for (int dz = -r; dz <= r; dz++) {
                    Location check = center.clone().add(dx, dy, dz);
                    if (check.getBlock().getType() == material) {
                        return check.getBlock().getLocation();
                    }
                }
            }
        }
        return null;
    }

    /** Returns true if some other villager has already claimed the given workstation. */
    private boolean isWorkstationClaimed(Location station) {
        return claimedWorkstations.containsValue(station);
    }

    /** Grants a profession, claims the workstation, and rolls an initial trade table. */
    private void assignProfession(Villager villager, Villager.Profession profession, Location station) {
        villager.setProfession(profession);
        claimedWorkstations.put(villager.getUniqueId(), station);
        lastKnownLevel.put(villager.getUniqueId(), villager.getVillagerLevel());
        regenerateTrades(villager);
    }

    /** Detects a villager trade-level increase and regenerates its trade table when found. */
    private void checkForLevelUp(Villager villager) {
        int currentLevel = villager.getVillagerLevel();
        Integer previous = lastKnownLevel.get(villager.getUniqueId());
        if (previous != null && currentLevel > previous) {
            regenerateTrades(villager);
        }
        lastKnownLevel.put(villager.getUniqueId(), currentLevel);
    }

    /** Clears and rebuilds a villager's recipe list with fresh randomized price variance. */
    private void regenerateTrades(Villager villager) {
        List<org.bukkit.inventory.MerchantRecipe> recipes = villager.getRecipes();
        Random random = new Random();

        for (org.bukkit.inventory.MerchantRecipe recipe : recipes) {
            recipe.setUses(0);
            recipe.setMaxUses(recipe.getMaxUses() + random.nextInt(3));
        }
        villager.setRecipes(recipes);
    }

    /** Releases a villager's claimed workstation, e.g. when the villager dies or is removed. */
    public void releaseWorkstation(UUID villagerId) {
        claimedWorkstations.remove(villagerId);
        lastKnownLevel.remove(villagerId);
    }

    /** Zombie villagers that get cured should keep their claimed workstation under the new entity. */
    @EventHandler
    public void onVillagerCured(EntityTransformEvent event) {
        if (!(event.getTransformedEntity() instanceof Villager)) return;
        if (!(event.getEntity() instanceof Villager)) return;

        UUID oldId = event.getEntity().getUniqueId();
        UUID newId = event.getTransformedEntity().getUniqueId();
        Location station = claimedWorkstations.remove(oldId);
        if (station != null) {
            claimedWorkstations.put(newId, station);
        }
    }

    /** Logs whenever a villager acquires a brand new trade, useful for debugging trade pools. */
    @EventHandler
    public void onTradeAcquired(VillagerAcquireTradeEvent event) {
        getLogger().fine("Villager " + event.getEntity().getUniqueId() + " acquired a new trade offer.");
    }
}
