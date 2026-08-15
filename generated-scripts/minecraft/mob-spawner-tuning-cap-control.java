/*
 * ScripForge — Mob Spawner Tuning & Cap Control
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Per-region mob-spawner rate tuning with a live spawn-cap dashboard to head off lag spikes.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.systems;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.block.CreatureSpawner;
import org.bukkit.command.CommandSender;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.CreatureSpawnEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MobSpawnerTuningCapControl defines rectangular regions, each with its own
 * spawner-delay multiplier and a hard living-mob cap. Natural and spawner
 * spawns inside a tuned region are throttled once the region's cap is hit,
 * and a repeating task prints a live dashboard of current mob counts versus
 * caps so admins can spot lag-causing regions before they spike.
 */
public class MobSpawnerTuningCapControl extends JavaPlugin implements Listener {

    /** A cuboid region with its own spawn cap and spawner-rate multiplier. */
    private static class SpawnRegion {
        final String name;
        final World world;
        final int minX, minZ, maxX, maxZ;
        final int mobCap;
        final double spawnerDelayMultiplier;

        SpawnRegion(String name, World world, int x1, int z1, int x2, int z2, int mobCap, double multiplier) {
            this.name = name;
            this.world = world;
            this.minX = Math.min(x1, x2);
            this.maxX = Math.max(x1, x2);
            this.minZ = Math.min(z1, z2);
            this.maxZ = Math.max(z1, z2);
            this.mobCap = mobCap;
            this.spawnerDelayMultiplier = multiplier;
        }

        boolean contains(Location loc) {
            return loc.getWorld().equals(world)
                    && loc.getBlockX() >= minX && loc.getBlockX() <= maxX
                    && loc.getBlockZ() >= minZ && loc.getBlockZ() <= maxZ;
        }
    }

    private final List<SpawnRegion> regions = new ArrayList<>();
    private final Map<String, Integer> liveCounts = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        Bukkit.getScheduler().runTaskTimer(this, this::refreshDashboard, 100L, 200L);
        getLogger().info("MobSpawnerTuningCapControl enabled.");
    }

    /** Registers a tuned region. Spawns inside overlapping regions use whichever is checked first. */
    public void defineRegion(String name, World world, int x1, int z1, int x2, int z2, int mobCap, double delayMultiplier) {
        regions.add(new SpawnRegion(name, world, x1, z1, x2, z2, mobCap, delayMultiplier));
        applySpawnerTuning(new SpawnRegion(name, world, x1, z1, x2, z2, mobCap, delayMultiplier));
    }

    /** Walks every loaded chunk's tile entities in the region and rewrites CreatureSpawner delay settings. */
    private void applySpawnerTuning(SpawnRegion region) {
        int minChunkX = region.minX >> 4;
        int maxChunkX = region.maxX >> 4;
        int minChunkZ = region.minZ >> 4;
        int maxChunkZ = region.maxZ >> 4;

        for (int cx = minChunkX; cx <= maxChunkX; cx++) {
            for (int cz = minChunkZ; cz <= maxChunkZ; cz++) {
                if (!region.world.isChunkLoaded(cx, cz)) continue;
                for (org.bukkit.block.BlockState state : region.world.getChunkAt(cx, cz).getTileEntities()) {
                    if (state instanceof CreatureSpawner) {
                        CreatureSpawner spawner = (CreatureSpawner) state;
                        int baseDelay = spawner.getDelay() > 0 ? spawner.getDelay() : 200;
                        spawner.setDelay((int) Math.round(baseDelay * region.spawnerDelayMultiplier));
                        spawner.update();
                    }
                }
            }
        }
    }

    private SpawnRegion regionFor(Location loc) {
        for (SpawnRegion region : regions) {
            if (region.contains(loc)) return region;
        }
        return null;
    }

    private long countLivingInRegion(SpawnRegion region) {
        return region.world.getLivingEntities().stream().filter(e -> region.contains(e.getLocation())).count();
    }

    @EventHandler
    public void onCreatureSpawn(CreatureSpawnEvent event) {
        SpawnRegion region = regionFor(event.getLocation());
        if (region == null) return;

        long currentCount = countLivingInRegion(region);
        if (currentCount >= region.mobCap) {
            event.setCancelled(true);
            return;
        }
        liveCounts.put(region.name, (int) currentCount + 1);
    }

    /** Recomputes and logs mob-count-versus-cap for every tuned region; called on a timer and via /spawncaps. */
    private void refreshDashboard() {
        for (SpawnRegion region : regions) {
            long count = countLivingInRegion(region);
            liveCounts.put(region.name, (int) count);
            if (count >= region.mobCap * 0.9) {
                getLogger().warning("Region '" + region.name + "' near cap: " + count + "/" + region.mobCap);
            }
        }
    }

    /** Prints the current mob-count-versus-cap dashboard to the given sender, e.g. from a /spawncaps command. */
    public void printDashboard(CommandSender sender) {
        sender.sendMessage("§6-- Spawn Cap Dashboard --");
        for (SpawnRegion region : regions) {
            int count = liveCounts.getOrDefault(region.name, 0);
            sender.sendMessage("§7" + region.name + ": §f" + count + "/" + region.mobCap);
        }
    }
}
