/*
 * ScriptForge — Custom Crafting Recipe System
 * Pack: Minecraft Pack | Category: Crafting
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Registers new shaped and shapeless crafting recipes at runtime, including named/custom-lore result items.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.crafting;

import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.ShapedRecipe;
import org.bukkit.inventory.ShapelessRecipe;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * CustomCraftingRecipeSystem registers a handful of new crafting recipes on
 * plugin startup: shaped recipes (fixed pattern) and a shapeless recipe
 * (ingredients in any arrangement). Recipes are added to the server's
 * global recipe book so they work in any crafting table.
 */
public class CustomCraftingRecipeSystem extends JavaPlugin {

    @Override
    public void onEnable() {
        registerRulerBlade();
        registerReinforcedPickaxe();
        registerHealingBundle();
        getLogger().info("CustomCraftingRecipeSystem enabled with 3 custom recipe(s) registered.");
    }

    /** Shaped recipe: a named sword requiring diamonds, a stick, and a nether star at the tip. */
    private void registerRulerBlade() {
        ItemStack result = new ItemStack(Material.DIAMOND_SWORD);
        ItemMeta meta = result.getItemMeta();
        meta.setDisplayName(ChatColor.LIGHT_PURPLE + "Ruler's Blade");
        meta.setLore(List.of(ChatColor.GRAY + "Forged for those who lead."));
        result.setItemMeta(meta);

        NamespacedKey key = new NamespacedKey(this, "rulers_blade");
        ShapedRecipe recipe = new ShapedRecipe(key, result);
        recipe.shape(" D ", " D ", " S ");
        recipe.setIngredient('D', Material.DIAMOND);
        recipe.setIngredient('S', Material.NETHER_STAR);

        getServer().addRecipe(recipe);
    }

    /** Shaped recipe: an iron pickaxe upgraded with an extra iron layer for durability flavor. */
    private void registerReinforcedPickaxe() {
        ItemStack result = new ItemStack(Material.IRON_PICKAXE);
        ItemMeta meta = result.getItemMeta();
        meta.setDisplayName(ChatColor.AQUA + "Reinforced Pickaxe");
        meta.setLore(List.of(ChatColor.GRAY + "Double-plated for tougher stone."));
        result.setItemMeta(meta);

        NamespacedKey key = new NamespacedKey(this, "reinforced_pickaxe");
        ShapedRecipe recipe = new ShapedRecipe(key, result);
        recipe.shape("III", " S ", " S ");
        recipe.setIngredient('I', Material.IRON_INGOT);
        recipe.setIngredient('S', Material.STICK);

        getServer().addRecipe(recipe);
    }

    /** Shapeless recipe: a bundle of healing items that can be arranged in any order. */
    private void registerHealingBundle() {
        ItemStack result = new ItemStack(Material.GOLDEN_APPLE, 1);
        ItemMeta meta = result.getItemMeta();
        meta.setDisplayName(ChatColor.GREEN + "Field Medic Bundle");
        result.setItemMeta(meta);

        NamespacedKey key = new NamespacedKey(this, "healing_bundle");
        ShapelessRecipe recipe = new ShapelessRecipe(key, result);
        recipe.addIngredient(Material.GOLD_INGOT);
        recipe.addIngredient(Material.APPLE);
        recipe.addIngredient(Material.GLISTERING_MELON_SLICE);

        getServer().addRecipe(recipe);
    }

    /** Removes all recipes registered by this plugin (useful for reload commands). */
    public void unregisterAll() {
        getServer().removeRecipe(new NamespacedKey(this, "rulers_blade"));
        getServer().removeRecipe(new NamespacedKey(this, "reinforced_pickaxe"));
        getServer().removeRecipe(new NamespacedKey(this, "healing_bundle"));
    }

    @Override
    public void onDisable() {
        unregisterAll();
    }
}
