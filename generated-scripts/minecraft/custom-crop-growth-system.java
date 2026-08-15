/*
 * ScripForge — Custom Crop Growth System
 * Pack: Minecraft Pack | Category: Gameplay
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Custom crop types with staged growth timers and fertilizer items that accelerate growth when applied.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scripforge.minecraft.gameplay;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.HashMap;
import java.util.Map;

/**
 * CustomCropGrowthSystem tracks custom crops (represented here by a chosen
 * marker material planted on farmland) through a fixed number of growth
 * stages, each represented by swapping in a different vanilla block as a
 * stand-in visual. Right-clicking a growing crop with a "fertilizer" item
 * (BONE_MEAL by default) skips it forward one stage instantly.
 */
public class CustomCropGrowthSystem extends JavaPlugin implements Listener {

    /** Visual stand-ins for each growth stage, from just-planted to fully grown. */
    private static final Material[] STAGE_BLOCKS = {
            Material.SAPLING,
            Material.OAK_SAPLING,
            Material.OAK_LEAVES,
            Material.OAK_LOG
    };

    private static final Material FERTILIZER = Material.BONE_MEAL;
    private static final long TICKS_PER_STAGE = 20L * 60L * 5L; // 5 minutes per stage

    /** Tracks growth progress for each planted crop location. */
    private final Map<Location, Integer> cropStages = new HashMap<>();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        startGrowthLoop();
        getLogger().info("CustomCropGrowthSystem enabled with " + STAGE_BLOCKS.length + " growth stages.");
    }

    /** Plants a new custom crop at the given block location, starting at stage 0. */
    public void plantCrop(Block block) {
        Location loc = block.getLocation();
        cropStages.put(loc, 0);
        block.setType(STAGE_BLOCKS[0]);
    }

    /** Advances every tracked crop by one stage per interval, capped at the final stage. */
    private void startGrowthLoop() {
        new BukkitRunnable() {
            @Override
            public void run() {
                for (Map.Entry<Location, Integer> entry : cropStages.entrySet()) {
                    advanceStage(entry.getKey(), entry.getValue(), 1);
                }
            }
        }.runTaskTimer(this, TICKS_PER_STAGE, TICKS_PER_STAGE);
    }

    /** Moves a crop forward by the given number of stages and updates its block + tracking map. */
    private void advanceStage(Location loc, int currentStage, int amount) {
        int newStage = Math.min(currentStage + amount, STAGE_BLOCKS.length - 1);
        if (newStage == currentStage) return; // already fully grown

        Block block = loc.getBlock();
        if (block.getType() != STAGE_BLOCKS[currentStage]) {
            // Someone broke or replaced it outside our system; stop tracking.
            cropStages.remove(loc);
            return;
        }

        block.setType(STAGE_BLOCKS[newStage]);
        cropStages.put(loc, newStage);
    }

    /** Right-clicking a tracked crop with fertilizer consumes one item and skips a growth stage. */
    @EventHandler
    public void onFertilize(PlayerInteractEvent event) {
        if (event.getAction() != Action.RIGHT_CLICK_BLOCK || event.getClickedBlock() == null) return;

        Location loc = event.getClickedBlock().getLocation();
        Integer stage = cropStages.get(loc);
        if (stage == null) return;

        Player player = event.getPlayer();
        ItemStack hand = player.getInventory().getItemInMainHand();
        if (hand.getType() != FERTILIZER) return;

        advanceStage(loc, stage, 1);
        hand.setAmount(hand.getAmount() - 1);
        player.sendMessage("The crop grows a little faster!");
        event.setCancelled(true);
    }

    /** Returns true once a crop at the given location has reached its final stage. */
    public boolean isFullyGrown(Location loc) {
        Integer stage = cropStages.get(loc);
        return stage != null && stage == STAGE_BLOCKS.length - 1;
    }

    /** Harvests a fully grown crop, clearing it from tracking and resetting the block. */
    public boolean harvestCrop(Location loc) {
        if (!isFullyGrown(loc)) return false;
        cropStages.remove(loc);
        loc.getBlock().setType(Material.AIR);
        return true;
    }
}
