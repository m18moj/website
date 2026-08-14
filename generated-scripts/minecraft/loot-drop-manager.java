/*
 * ScriptForge — Block & Mob Drop Tables
 * Pack: Minecraft Pack | Category: Loot
 * Version: 1.0.0
 *
 * Changelog:
 *   1.0.0 - Initial release
 *
 * Provides weighted loot tables for block breaks and mob kills, with fortune-style multipliers applied per drop.
 *
 * Bukkit/Spigot/Paper plugin module — drop into your plugin's source tree.
 */

package com.scriptforge.minecraft.loot;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * LootDropManager replaces vanilla block/mob drops with configurable
 * weighted tables. Each entry has a relative weight, a base quantity range,
 * and whether it scales with the tool's Fortune-style enchantment level.
 */
public class LootDropManager extends JavaPlugin implements Listener {

    private final Random random = new Random();
    private final Map<Material, List<LootEntry>> blockTables = new EnumMap<>(Material.class);
    private final Map<EntityType, List<LootEntry>> mobTables = new EnumMap<>(EntityType.class);

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        registerDefaultTables();
        getLogger().info("LootDropManager enabled with " + blockTables.size() + " block tables and "
                + mobTables.size() + " mob tables.");
    }

    /** Seeds a few example weighted tables; extend or load from config as needed. */
    private void registerDefaultTables() {
        blockTables.put(Material.STONE, List.of(
                new LootEntry(Material.COBBLESTONE, 70, 1, 1, false),
                new LootEntry(Material.FLINT, 5, 1, 1, false)
        ));
        blockTables.put(Material.DIAMOND_ORE, List.of(
                new LootEntry(Material.DIAMOND, 100, 1, 1, true)
        ));

        mobTables.put(EntityType.ZOMBIE, List.of(
                new LootEntry(Material.ROTTEN_FLESH, 80, 0, 2, false),
                new LootEntry(Material.IRON_INGOT, 5, 1, 1, true)
        ));
        mobTables.put(EntityType.SKELETON, List.of(
                new LootEntry(Material.BONE, 75, 0, 2, false),
                new LootEntry(Material.ARROW, 60, 0, 3, true)
        ));
    }

    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        List<LootEntry> table = blockTables.get(event.getBlock().getType());
        if (table == null) return;

        event.setDropItems(false);
        int fortuneLevel = getFortuneLevel(event.getPlayer());
        rollTable(table, fortuneLevel).forEach(drop ->
                event.getBlock().getWorld().dropItemNaturally(event.getBlock().getLocation(), drop));
    }

    @EventHandler
    public void onEntityDeath(EntityDeathEvent event) {
        List<LootEntry> table = mobTables.get(event.getEntityType());
        if (table == null) return;

        LivingEntity entity = event.getEntity();
        Player killer = entity.getKiller();
        int fortuneLevel = killer != null ? getFortuneLevel(killer) : 0;

        Location loc = entity.getLocation();
        event.getDrops().clear();
        event.getDrops().addAll(rollTable(table, fortuneLevel));
    }

    /** Rolls every entry in a table independently against its own weight/100 chance. */
    private List<ItemStack> rollTable(List<LootEntry> table, int fortuneLevel) {
        List<ItemStack> results = new ArrayList<>();
        for (LootEntry entry : table) {
            if (random.nextInt(100) >= entry.weight) continue;

            int quantity = entry.minAmount + random.nextInt(entry.maxAmount - entry.minAmount + 1);
            if (entry.fortuneScales && fortuneLevel > 0) {
                quantity += random.nextInt(fortuneLevel + 1);
            }
            if (quantity > 0) {
                results.add(new ItemStack(entry.material, quantity));
            }
        }
        return results;
    }

    private int getFortuneLevel(Player player) {
        ItemStack tool = player.getInventory().getItemInMainHand();
        return tool.getEnchantmentLevel(Enchantment.FORTUNE);
    }

    /** A single weighted loot table entry. */
    private static class LootEntry {
        final Material material;
        final int weight;
        final int minAmount;
        final int maxAmount;
        final boolean fortuneScales;

        LootEntry(Material material, int weight, int minAmount, int maxAmount, boolean fortuneScales) {
            this.material = material;
            this.weight = weight;
            this.minAmount = minAmount;
            this.maxAmount = maxAmount;
            this.fortuneScales = fortuneScales;
        }
    }
}
