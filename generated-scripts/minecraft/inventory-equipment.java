/*
 * ScripForge — Inventory, Hotbar & Crafting Grid
 * Pack: Minecraft Pack | Category: Inventory
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Adds a custom 3x3 crafting grid GUI with shaped-recipe matching layered on top of standard stackable inventory handling.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.inventory;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * CraftingGridController implements a custom 3x3 crafting bench GUI. Item
 * placement is matched against registered shaped recipes (a 3x3 pattern of
 * Materials, nulls allowed for empty cells) and produces the matching output
 * into a result slot when the grid arrangement matches exactly.
 */
public class CraftingGridController extends JavaPlugin implements Listener {

    private static final int GRID_SIZE = 9;
    private static final int RESULT_SLOT = 9;
    private static final int INVENTORY_SIZE = 10;

    private final List<ShapedRecipe> recipes = new ArrayList<>();
    private final Map<UUID, Inventory> openGrids = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        registerDefaultRecipes();
        getLogger().info("CraftingGridController enabled with " + recipes.size() + " recipes.");
    }

    private void registerDefaultRecipes() {
        // Simple pickaxe shape: three planks across the top, sticks down the middle column.
        Material[] pickaxe = new Material[]{
                Material.OAK_PLANKS, Material.OAK_PLANKS, Material.OAK_PLANKS,
                null, Material.STICK, null,
                null, Material.STICK, null
        };
        recipes.add(new ShapedRecipe(pickaxe, new ItemStack(Material.WOODEN_PICKAXE, 1)));
        // Simple 2x2 square shape (crafting table).
        Material[] table = new Material[]{
                Material.OAK_PLANKS, Material.OAK_PLANKS, null,
                Material.OAK_PLANKS, Material.OAK_PLANKS, null,
                null, null, null
        };
        recipes.add(new ShapedRecipe(table, new ItemStack(Material.CRAFTING_TABLE, 1)));
    }

    /** Opens a fresh 3x3 crafting grid GUI for the given player. */
    public void openCraftingGrid(Player player) {
        Inventory gui = Bukkit.createInventory(player, INVENTORY_SIZE, "Crafting Grid");
        openGrids.put(player.getUniqueId(), gui);
        player.openInventory(gui);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player)) return;
        Player player = (Player) event.getWhoClicked();
        Inventory openGrid = openGrids.get(player.getUniqueId());
        if (openGrid == null || !event.getInventory().equals(openGrid)) return;

        if (event.getRawSlot() == RESULT_SLOT) {
            event.setCancelled(true); // Result slot consumes ingredients instead of a normal click.
            collectResult(player, openGrid);
            return;
        }
        // Defer to next tick so the click has resolved before re-evaluating the grid.
        Bukkit.getScheduler().runTask(this, () -> updateResultSlot(openGrid));
    }

    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        openGrids.remove(event.getPlayer().getUniqueId());
    }

    /** Recomputes the result preview slot based on current grid contents. */
    private void updateResultSlot(Inventory grid) {
        Material[] pattern = new Material[GRID_SIZE];
        for (int i = 0; i < GRID_SIZE; i++) {
            ItemStack item = grid.getItem(i);
            pattern[i] = (item == null) ? null : item.getType();
        }
        ShapedRecipe match = findMatchingRecipe(pattern);
        grid.setItem(RESULT_SLOT, match != null ? match.output.clone() : null);
    }

    /** Gives the player the crafted result and consumes one item from each occupied grid slot. */
    private void collectResult(Player player, Inventory grid) {
        ItemStack result = grid.getItem(RESULT_SLOT);
        if (result == null) return;
        for (int i = 0; i < GRID_SIZE; i++) {
            ItemStack item = grid.getItem(i);
            if (item == null) continue;
            item.setAmount(item.getAmount() - 1);
            grid.setItem(i, item.getAmount() <= 0 ? null : item);
        }
        player.getInventory().addItem(result.clone());
        updateResultSlot(grid);
    }

    /** Finds a registered recipe whose pattern exactly matches the given grid materials. */
    private ShapedRecipe findMatchingRecipe(Material[] pattern) {
        for (ShapedRecipe recipe : recipes) {
            boolean matches = true;
            for (int i = 0; i < GRID_SIZE; i++) {
                if (recipe.pattern[i] != pattern[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return recipe;
        }
        return null;
    }

    /** A shaped recipe: 9-slot material pattern mapped to a single output stack. */
    private static class ShapedRecipe {
        final Material[] pattern;
        final ItemStack output;

        ShapedRecipe(Material[] pattern, ItemStack output) {
            this.pattern = pattern;
            this.output = output;
        }
    }
}
