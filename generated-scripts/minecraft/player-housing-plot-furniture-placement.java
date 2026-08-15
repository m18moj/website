/*
 * ScripForge — Player Housing Plot & Furniture Placement
 * Pack: Minecraft Pack | Category: Gameplay
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Claimed housing plots with rotate-and-place furniture blocks and a plot-visit permission toggle.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.gameplay;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.block.data.BlockData;
import org.bukkit.block.data.Directional;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.inventory.ItemStack;

import org.bukkit.Action;
import org.bukkit.block.BlockFace;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * PlayerHousingPlotFurniturePlacement manages fixed-size square housing
 * plots keyed by an integer plot ID. Owners can place directional
 * "furniture" blocks (stairs, trapdoors, etc.) rotated to face wherever
 * they're looking, and can flip their plot between public and
 * invite-only visiting.
 */
public class PlayerHousingPlotFurniturePlacement extends JavaPlugin implements Listener {

    private static final int PLOT_RADIUS = 16;

    /** One housing plot: its center, owner, and whether outsiders may enter it. */
    private static class Plot {
        final int id;
        final Location center;
        UUID owner;
        boolean visitorsAllowed = false;

        Plot(int id, Location center, UUID owner) {
            this.id = id;
            this.center = center;
            this.owner = owner;
        }

        boolean contains(Location loc) {
            return loc.getWorld().equals(center.getWorld())
                    && Math.abs(loc.getBlockX() - center.getBlockX()) <= PLOT_RADIUS
                    && Math.abs(loc.getBlockZ() - center.getBlockZ()) <= PLOT_RADIUS;
        }
    }

    private final Map<Integer, Plot> plotsById = new HashMap<>();
    private int nextPlotId = 1;

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("PlayerHousingPlotFurniturePlacement enabled with " + plotsById.size() + " plot(s).");
    }

    /** Claims a fresh plot centered on the player's current location and assigns them as owner. */
    public int claimPlot(Player player) {
        int id = nextPlotId++;
        Plot plot = new Plot(id, player.getLocation(), player.getUniqueId());
        plotsById.put(id, plot);
        player.sendMessage("§aClaimed housing plot #" + id + ".");
        return id;
    }

    /** Toggles whether non-owners may walk into the given plot. */
    public void toggleVisitors(Player owner, int plotId) {
        Plot plot = plotsById.get(plotId);
        if (plot == null || !plot.owner.equals(owner.getUniqueId())) {
            owner.sendMessage("§cYou don't own that plot.");
            return;
        }
        plot.visitorsAllowed = !plot.visitorsAllowed;
        owner.sendMessage("§7Plot #" + plotId + " visiting is now " + (plot.visitorsAllowed ? "§aopen" : "§cinvite-only") + "§7.");
    }

    private Plot plotAt(Location loc) {
        for (Plot plot : plotsById.values()) {
            if (plot.contains(loc)) return plot;
        }
        return null;
    }

    /** Places a furniture block at the clicked face, rotated to match the player's facing direction. */
    private void placeFurniture(Player player, Block against, BlockFace face, Material furnitureMaterial) {
        Block target = against.getRelative(face);
        target.setType(furnitureMaterial);

        BlockData data = target.getBlockData();
        if (data instanceof Directional) {
            BlockFace facing = yawToFace(player.getLocation().getYaw());
            ((Directional) data).setFacing(facing);
            target.setBlockData(data);
        }
    }

    private BlockFace yawToFace(float yaw) {
        float normalized = (yaw % 360 + 360) % 360;
        if (normalized >= 315 || normalized < 45) return BlockFace.SOUTH;
        if (normalized < 135) return BlockFace.WEST;
        if (normalized < 225) return BlockFace.NORTH;
        return BlockFace.EAST;
    }

    @EventHandler
    public void onFurnitureInteract(PlayerInteractEvent event) {
        if (event.getAction() != Action.RIGHT_CLICK_BLOCK) return;
        Block clicked = event.getClickedBlock();
        if (clicked == null) return;

        Plot plot = plotAt(clicked.getLocation());
        if (plot == null || !plot.owner.equals(event.getPlayer().getUniqueId())) return;

        ItemStack hand = event.getPlayer().getInventory().getItemInMainHand();
        if (hand == null || !isFurnitureItem(hand.getType())) return;

        placeFurniture(event.getPlayer(), clicked, event.getBlockFace(), hand.getType());
        event.setCancelled(true);
    }

    private boolean isFurnitureItem(Material material) {
        return material == Material.OAK_STAIRS
                || material == Material.OAK_TRAPDOOR
                || material == Material.LANTERN
                || material == Material.CAMPFIRE;
    }

    @EventHandler
    public void onEnterPlot(PlayerTeleportEvent event) {
        if (event.getTo() == null) return;
        Plot plot = plotAt(event.getTo());
        if (plot == null || plot.visitorsAllowed) return;
        if (plot.owner.equals(event.getPlayer().getUniqueId())) return;

        event.setCancelled(true);
        event.getPlayer().sendMessage("§cThis plot is invite-only.");
    }
}
