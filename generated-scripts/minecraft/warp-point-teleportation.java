/*
 * ScripForge — Warp Point & Teleportation
 * Pack: Minecraft Pack | Category: Systems
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Named warp points browsable via an inventory menu, teleporting players with a configurable cooldown and cost.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.systems;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WarpPointTeleportation stores named warp locations and offers a GUI menu
 * for players to browse and teleport to them. Each warp use costs a small
 * fee and is subject to a per-player cooldown to discourage spam.
 */
public class WarpPointTeleportation extends JavaPlugin implements Listener {

    private static final double WARP_COST = 10.0;
    private static final long COOLDOWN_MILLIS = 30_000L; // 30 seconds

    private final Map<String, Location> warps = new HashMap<>();
    private final Map<UUID, Long> lastWarpTime = new HashMap<>();
    private final Map<UUID, Double> balances = new HashMap<>();
    private final String menuTitle = "Warp Points";

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("WarpPointTeleportation enabled with " + warps.size() + " warp(s).");
    }

    /** Registers or overwrites a named warp point at the given location. */
    public void setWarp(String name, Location location) {
        warps.put(name.toLowerCase(), location.clone());
    }

    /** Removes a warp by name. Returns true if one existed. */
    public boolean removeWarp(String name) {
        return warps.remove(name.toLowerCase()) != null;
    }

    /** Opens the warp browsing menu, one item per registered warp. */
    public void openWarpMenu(Player player) {
        int size = Math.max(9, (int) Math.ceil(warps.size() / 9.0) * 9);
        Inventory menu = Bukkit.createInventory(null, size, menuTitle);

        for (String name : warps.keySet()) {
            ItemStack icon = new ItemStack(Material.ENDER_PEARL);
            ItemMeta meta = icon.getItemMeta();
            meta.setDisplayName(capitalize(name));
            meta.setLore(List.of("Cost: " + WARP_COST, "Click to teleport"));
            icon.setItemMeta(meta);
            menu.addItem(icon);
        }
        player.openInventory(menu);
    }

    @EventHandler
    public void onMenuClick(InventoryClickEvent event) {
        if (!event.getView().getTitle().equals(menuTitle)) return;
        event.setCancelled(true);

        ItemStack clicked = event.getCurrentItem();
        if (clicked == null || !clicked.hasItemMeta()) return;

        String warpName = clicked.getItemMeta().getDisplayName().toLowerCase();
        if (event.getWhoClicked() instanceof Player) {
            teleportToWarp((Player) event.getWhoClicked(), warpName);
        }
    }

    /** Attempts to teleport a player to a named warp, enforcing cooldown and cost. */
    public boolean teleportToWarp(Player player, String name) {
        Location destination = warps.get(name.toLowerCase());
        if (destination == null) {
            player.sendMessage("No such warp: " + name);
            return false;
        }

        long now = System.currentTimeMillis();
        long lastUse = lastWarpTime.getOrDefault(player.getUniqueId(), 0L);
        if (now - lastUse < COOLDOWN_MILLIS) {
            long remaining = (COOLDOWN_MILLIS - (now - lastUse)) / 1000;
            player.sendMessage("Warp on cooldown: " + remaining + "s remaining.");
            return false;
        }

        double balance = balances.getOrDefault(player.getUniqueId(), 100.0);
        if (balance < WARP_COST) {
            player.sendMessage("Not enough funds to warp (cost: " + WARP_COST + ").");
            return false;
        }

        balances.put(player.getUniqueId(), balance - WARP_COST);
        lastWarpTime.put(player.getUniqueId(), now);
        player.teleport(destination);
        player.closeInventory();
        player.sendMessage("Warped to " + capitalize(name) + ".");
        return true;
    }

    /** Lists all currently registered warp names. */
    public List<String> listWarpNames() {
        return new ArrayList<>(warps.keySet());
    }

    private String capitalize(String name) {
        if (name.isEmpty()) return name;
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }
}
