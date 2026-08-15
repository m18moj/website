/*
 * ScripForge — Custom Potion Brewing Stand
 * Pack: Minecraft Pack | Category: Crafting
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Extended brewing-stand recipes that produce custom potion effects beyond the vanilla ingredient table.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.crafting;

import org.bukkit.Material;
import org.bukkit.block.BlockState;
import org.bukkit.block.BrewingStand;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.BrewEvent;
import org.bukkit.inventory.BrewerInventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.potion.PotionMeta;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CustomPotionBrewingStand watches every brew cycle started in a vanilla
 * brewing stand. When the fuel ingredient slot matches one of this plugin's
 * registered custom ingredients, the resulting potions are patched — after
 * vanilla brewing finishes — to carry a custom {@link PotionEffect} instead
 * of (or in addition to) whatever the base potion already had.
 */
public class CustomPotionBrewingStand extends JavaPlugin implements Listener {

    /** A custom recipe: ingredient material triggers a bonus effect applied on top of the brewed potion. */
    private static class CustomRecipe {
        final Material ingredient;
        final PotionEffectType effectType;
        final int amplifier;
        final int durationTicks;

        CustomRecipe(Material ingredient, PotionEffectType effectType, int amplifier, int durationTicks) {
            this.ingredient = ingredient;
            this.effectType = effectType;
            this.amplifier = amplifier;
            this.durationTicks = durationTicks;
        }
    }

    private final Map<Material, CustomRecipe> recipesByIngredient = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        registerDefaultRecipes();
        getLogger().info("CustomPotionBrewingStand enabled with " + recipesByIngredient.size() + " custom recipe(s).");
    }

    private void registerDefaultRecipes() {
        registerRecipe(new CustomRecipe(Material.GLOW_BERRIES, PotionEffectType.GLOWING, 0, 20 * 60));
        registerRecipe(new CustomRecipe(Material.PHANTOM_MEMBRANE, PotionEffectType.SLOW_FALLING, 0, 20 * 90));
        registerRecipe(new CustomRecipe(Material.RABBIT_FOOT, PotionEffectType.JUMP, 1, 20 * 120));
        registerRecipe(new CustomRecipe(Material.ECHO_SHARD, PotionEffectType.DAMAGE_RESISTANCE, 1, 20 * 45));
    }

    /** Adds or overwrites a custom brewing ingredient recipe. */
    public void registerRecipe(CustomRecipe recipe) {
        recipesByIngredient.put(recipe.ingredient, recipe);
    }

    /**
     * Fires the moment a brew cycle begins. Vanilla brewing runs on its own
     * schedule, so this schedules a one-tick-delayed follow-up after brewing
     * completes to layer the bonus effect onto the finished potions.
     */
    @EventHandler
    public void onBrew(BrewEvent event) {
        ItemStack fuel = event.getContents().getIngredient();
        if (fuel == null) return;

        CustomRecipe recipe = recipesByIngredient.get(fuel.getType());
        if (recipe == null) return;

        BlockState standState = event.getBlock().getState();
        if (!(standState instanceof BrewingStand)) return;

        int brewTicks = ((BrewingStand) standState).getBrewingTime();
        if (brewTicks <= 0) brewTicks = 400; // fall back to the vanilla default brew duration

        new BukkitRunnable() {
            @Override
            public void run() {
                applyBonusEffect((BrewingStand) event.getBlock().getState(), recipe);
            }
        }.runTaskLater(this, Math.max(1L, brewTicks + 2L));
    }

    /** Layers the recipe's bonus PotionEffect onto every finished potion in the brewer's three output slots. */
    private void applyBonusEffect(BrewingStand stand, CustomRecipe recipe) {
        BrewerInventory inventory = stand.getInventory();
        for (int slot = 0; slot < 3; slot++) {
            ItemStack potion = inventory.getItem(slot);
            if (potion == null || !isPotionLike(potion.getType())) continue;

            PotionMeta meta = (PotionMeta) potion.getItemMeta();
            if (meta == null) continue;

            List<PotionEffect> customEffects = meta.hasCustomEffects()
                    ? new ArrayList<>(meta.getCustomEffects())
                    : new ArrayList<>();
            customEffects.removeIf(effect -> effect.getType().equals(recipe.effectType));
            customEffects.add(new PotionEffect(recipe.effectType, recipe.durationTicks, recipe.amplifier));

            meta.clearCustomEffects();
            for (PotionEffect effect : customEffects) {
                meta.addCustomEffect(effect, true);
            }
            potion.setItemMeta(meta);
            inventory.setItem(slot, potion);
        }
    }

    private boolean isPotionLike(Material type) {
        return type == Material.POTION || type == Material.SPLASH_POTION || type == Material.LINGERING_POTION;
    }
}
